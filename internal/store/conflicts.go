package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"strings"

	"jitpack/internal/sync"
)

// ConflictEntry is one audited LWW loser (NFR-4.2a). Values are the
// JSON-encoded losing/winning field contents as logged at merge time.
type ConflictEntry struct {
	ID           string
	EntityTable  string
	EntityID     string
	Field        string
	LosingValue  string
	WinningValue string
	// MutationID groups the fields one push lost together; ActorUserID is
	// who pushed it — the person a revert belongs to.
	MutationID  string
	ActorUserID string
	ResolvedAt  string
	Reverted    bool
}

// The two partitions keep two logs in one table, told apart by trip_id
// exactly as change_log is (Sync-API §4): a trip's rows carry its id, the
// master partition's carry NULL. Each list reads its own half — a query
// that mixed them would show a member of one trip the losers of another.
const (
	conflictColumns = `id, entity_table, entity_id, field,
	        coalesce(losing_value, ''), coalesce(winning_value, ''),
	        mutation_id, actor_user_id, resolved_at, reverted`
	conflictOrder = ` ORDER BY resolved_at DESC, id`
)

// ListConflicts returns a trip's conflict log, newest first. Rows live as
// long as the trip does: conflict_log.trip_id cascades on delete, and the
// compaction NFR-4.2a describes for an archived trip is not built.
func (s *Store) ListConflicts(ctx context.Context, tripID string) ([]ConflictEntry, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+conflictColumns+` FROM conflict_log WHERE trip_id = ?`+conflictOrder,
		tripID)
	if err != nil {
		return nil, fmt.Errorf("list conflicts: %w", err)
	}
	return scanConflicts(rows)
}

// ListMasterConflicts returns the master partition's conflict log for one
// user, newest first. It is filtered through masterVisible for the same
// reason PullMaster is: a conflict entry names an entity, and naming one
// the user may not see would leak it — `trips` is the case that matters,
// since a trip's own fields are merged here rather than in its partition.
func (s *Store) ListMasterConflicts(ctx context.Context, userID string) ([]ConflictEntry, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT `+conflictColumns+` FROM conflict_log WHERE trip_id IS NULL`+conflictOrder)
	if err != nil {
		return nil, fmt.Errorf("list master conflicts: %w", err)
	}
	entries, err := scanConflicts(rows)
	if err != nil {
		return nil, err
	}

	visible := entries[:0]
	for _, c := range entries {
		ok, err := s.masterVisible(ctx, userID, c.EntityTable, c.EntityID)
		if err != nil {
			return nil, fmt.Errorf("master conflict visibility: %w", err)
		}
		if ok {
			visible = append(visible, c)
		}
	}
	return visible, nil
}

func scanConflicts(rows *sql.Rows) ([]ConflictEntry, error) {
	defer rows.Close()

	entries := []ConflictEntry{}
	for rows.Next() {
		var c ConflictEntry
		if err := rows.Scan(&c.ID, &c.EntityTable, &c.EntityID, &c.Field,
			&c.LosingValue, &c.WinningValue, &c.MutationID, &c.ActorUserID,
			&c.ResolvedAt, &c.Reverted); err != nil {
			return nil, fmt.Errorf("scan conflict: %w", err)
		}
		entries = append(entries, c)
	}
	return entries, rows.Err()
}

// The revert half of NFR-4.2a. Sentinel errors rather than one opaque
// failure, because each maps to a different sentence the user has to be
// shown: the log entry is stale, the row is gone, or the merge itself
// outranks the revert.
var (
	// ErrConflictNotFound reports an unknown entry — or one that belongs
	// to the other partition, which from a caller's side is the same
	// thing: it is not in the log it asked.
	ErrConflictNotFound = errors.New("store: conflict not found")
	// ErrConflictAlreadyReverted reports a second revert of one entry.
	// A revert is a fact about the entry, not a repeatable command.
	ErrConflictAlreadyReverted = errors.New("store: conflict already reverted")
	// ErrConflictRowGone reports that the entity the entry names has been
	// deleted. One logged field cannot rebuild a row, so this refuses
	// rather than resurrecting a partial one.
	ErrConflictRowGone = errors.New("store: conflicted row no longer exists")
	// ErrRevertRefused reports that the revert was itself resolved away —
	// §6 rule 2 (packed outranks packing_now) or a database constraint.
	// The merge rules apply to a revert exactly as to any other write.
	ErrRevertRefused = errors.New("store: revert refused by the merge rules")
	// ErrRevertForbidden reports that the caller may read the entry but
	// not write the row it names (FR-4.5).
	ErrRevertForbidden = errors.New("store: not allowed to write the conflicted row")
)

// revertEntry is the stored log row a revert acts on.
type revertEntry struct {
	tripID      sql.NullString
	table       string
	entityID    string
	field       string
	losingValue string
	mutationID  string
}

// RevertTripConflict restores the logged losing value of one trip-partition
// conflict (NFR-4.2a). The restore is an ordinary upsert with a fresh
// server HLC — see ADR-023: it wins by being newer, travels the change
// feed like any other write, and stays beatable by a later edit. The
// returned seq is the pull hint.
//
// Membership is the trip partition's only write gate and the caller's
// `member` middleware has already applied it, so the only scope question
// left here is whether the entry is this trip's at all (Sync-API P-3).
func (s *Store) RevertTripConflict(ctx context.Context, tripID, conflictID string) (int64, error) {
	e, err := s.loadConflictEntry(ctx, conflictID)
	if err != nil {
		return 0, err
	}
	if !e.tripID.Valid || e.tripID.String != tripID {
		return 0, ErrConflictNotFound
	}
	// No actor: a revert is attributed to nobody because it logs no
	// conflict of its own, and this endpoint is never told who tapped it.
	return s.applyRevert(ctx, conflictID, e, tripPartition(tripID, ""), nil)
}

// RevertMasterConflict restores the logged losing value of one
// master-partition conflict for userID (NFR-4.2a). Visibility is the rule
// the master log is read by, and the write itself is authorized by
// authorizeMaster — a user may see a conflict on a row they may not write.
func (s *Store) RevertMasterConflict(ctx context.Context, userID, conflictID string) (int64, error) {
	e, err := s.loadConflictEntry(ctx, conflictID)
	if err != nil {
		return 0, err
	}
	if e.tripID.Valid {
		return 0, ErrConflictNotFound
	}
	// Before the transaction on purpose: the pool holds a single
	// connection, so a read that opens its own would wait for a
	// transaction that is waiting for it.
	visible, err := s.masterVisible(ctx, userID, e.table, e.entityID)
	if err != nil {
		return 0, fmt.Errorf("revert visibility: %w", err)
	}
	if !visible {
		// Not "forbidden": naming an entity the caller may not see is the
		// leak ListMasterConflicts exists to avoid.
		return 0, ErrConflictNotFound
	}
	authorize := func(tx *sql.Tx, m *sync.Mutation, current map[string]any) (bool, error) {
		reason, err := authorizeMaster(ctx, tx, userID, m, current, true)
		return reason == ReasonNone, err
	}
	return s.applyRevert(ctx, conflictID, e, masterPartition(userID), authorize)
}

func (s *Store) loadConflictEntry(ctx context.Context, conflictID string) (revertEntry, error) {
	var e revertEntry
	err := s.db.QueryRowContext(ctx,
		`SELECT trip_id, entity_table, entity_id, field, coalesce(losing_value, 'null'), mutation_id
		 FROM conflict_log WHERE id = ?`, conflictID).
		Scan(&e.tripID, &e.table, &e.entityID, &e.field, &e.losingValue, &e.mutationID)
	if errors.Is(err, sql.ErrNoRows) {
		return revertEntry{}, ErrConflictNotFound
	}
	if err != nil {
		return revertEntry{}, fmt.Errorf("load conflict %s: %w", conflictID, err)
	}
	return e, nil
}

// revertGroup is what one revert restores: the tapped field plus every
// field the same push lost that merges with it as one unit (FR-5.4). A
// state restored without the packed_count it was derived from is a row
// the app has no state machine for, so the coupled pair moves together or
// not at all. Independent fields stay independently revertable — the log
// lists them separately because they are separate decisions.
func (s *Store) revertGroup(ctx context.Context, e revertEntry) (map[string]any, []string, error) {
	group := sync.GroupedWith(e.field)
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, field, coalesce(losing_value, 'null') FROM conflict_log
		 WHERE mutation_id = ? AND entity_table = ? AND entity_id = ?
		   AND field IN (`+placeholders(len(group))+`) AND reverted = 0`,
		append([]any{e.mutationID, e.table, e.entityID}, anyArgs(group)...)...)
	if err != nil {
		return nil, nil, fmt.Errorf("load conflict group of %s: %w", e.field, err)
	}
	defer rows.Close()

	fields := map[string]any{}
	ids := []string{}
	for rows.Next() {
		var id, field, losing string
		if err := rows.Scan(&id, &field, &losing); err != nil {
			return nil, nil, fmt.Errorf("scan conflict group: %w", err)
		}
		var value any
		if err := json.Unmarshal([]byte(losing), &value); err != nil {
			return nil, nil, fmt.Errorf("decode losing value of conflict %s: %w", id, err)
		}
		fields[field] = value
		ids = append(ids, id)
	}
	if err := rows.Err(); err != nil {
		return nil, nil, fmt.Errorf("load conflict group of %s: %w", e.field, err)
	}
	if len(ids) == 0 {
		// The tapped entry itself is spent; nothing is left to restore.
		return nil, nil, ErrConflictAlreadyReverted
	}
	return fields, ids, nil
}

func placeholders(n int) string {
	return strings.TrimSuffix(strings.Repeat("?, ", n), ", ")
}

func anyArgs(values []string) []any {
	out := make([]any, len(values))
	for i, v := range values {
		out[i] = v
	}
	return out
}

// revertAuthorizer decides whether the caller may write the row a revert
// names. The trip partition passes none — its middleware already checked
// the only gate it has — while the master partition's row-level ownership
// can be judged only once the row is loaded.
type revertAuthorizer func(*sql.Tx, *sync.Mutation, map[string]any) (bool, error)

// applyRevert writes the restore and the entry's reverted flag in one
// transaction, so a refusal further down rolls the flag back with it and
// the two can never disagree. p says which partition's tables the entry may
// name and which feed the restore is written to (§4).
//
// The authorizer stays a parameter rather than `p.scope`: the push's gate
// and the revert's are not the same question. The trip partition's write
// gate is membership, which the `member` middleware has already applied by
// the time a revert reaches here, so a revert passes none.
func (s *Store) applyRevert(
	ctx context.Context,
	conflictID string,
	e revertEntry,
	p partition,
	authorize revertAuthorizer,
) (int64, error) {
	fields, groupIDs, err := s.revertGroup(ctx, e)
	if err != nil {
		return 0, err
	}
	m := sync.Mutation{
		Op:     sync.OpUpsert,
		Table:  e.table,
		ID:     e.entityID,
		Fields: fields,
	}
	if err := validate(m, p.tables); err != nil {
		return 0, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, fmt.Errorf("begin revert: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op after a successful Commit

	// The guard and the write are the same statement: two devices tapping
	// the same entry cannot both restore it, and the loser is told so. The
	// whole group is claimed, because the whole group is restored.
	claimed, err := tx.ExecContext(ctx,
		`UPDATE conflict_log SET reverted = 1 WHERE id IN (`+placeholders(len(groupIDs))+`) AND reverted = 0`,
		anyArgs(groupIDs)...)
	if err != nil {
		return 0, fmt.Errorf("claim conflict %s: %w", conflictID, err)
	}
	if n, err := claimed.RowsAffected(); err != nil {
		return 0, fmt.Errorf("claim conflict %s: %w", conflictID, err)
	} else if int(n) != len(groupIDs) {
		return 0, ErrConflictAlreadyReverted
	}

	row, err := loadRow(ctx, tx, m.Table, m.ID)
	if err != nil {
		return 0, err
	}
	if !row.Exists {
		return 0, ErrConflictRowGone
	}
	if authorize != nil {
		allowed, err := authorize(tx, &m, row.Fields)
		if err != nil {
			return 0, err
		}
		if !allowed {
			return 0, ErrRevertForbidden
		}
	}

	// Fold the row's own clock in before stamping. A device whose wall
	// clock runs ahead leaves an HLC the server has never seen, and a
	// revert that is not strictly newer would be dropped by its own merge.
	// A row that never went through sync carries the schema default and
	// has no clock to respect.
	if row.HLC != "" {
		if err := s.hlc.Observe(row.HLC); err != nil {
			return 0, fmt.Errorf("observe %s %s clock: %w", m.Table, m.ID, err)
		}
	}
	m.HLC = s.hlc.Next()

	merged := sync.Merge(row, m)
	if len(merged.Applied) == 0 {
		return 0, ErrRevertRefused
	}
	if err := updateRow(ctx, tx, m.Table, m.ID, merged); err != nil {
		if isConstraintViolation(err) {
			return 0, ErrRevertRefused
		}
		return 0, err
	}
	seq, err := appendChangeLog(ctx, tx, p.feed, m, false)
	if err != nil {
		return 0, err
	}
	if err := tx.Commit(); err != nil {
		return 0, fmt.Errorf("commit revert: %w", err)
	}
	return seq, nil
}
