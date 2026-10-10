// pipeline.go is the one write pipeline both sync partitions push through
// once past validation and the partition's own scope rule: the idempotency
// memo, the row load a merge compares against, persistence, the change log
// and its conflict/refusal re-logging. partition.go names the per-partition
// differences; what is left here is the same for both (Sync-API §4/§5).

package store

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"jitpack/internal/sync"
)

var (
	ErrUnknownTable  = errors.New("table not syncable")
	ErrUnknownColumn = errors.New("column not syncable")
)

// MutationResult is the per-mutation answer of the push endpoint.
type MutationResult struct {
	MutationID string
	Outcome    sync.Outcome
	Conflicts  []sync.Conflict
	Seq        int64
	// Reason is set exactly when Outcome is rejected, and is what lets the
	// client say what happened instead of parking the mutation in silence.
	Reason RejectReason
}

// belongsToTrip reports whether m may be applied on tripID's endpoint.
// Membership is checked for the trip named in the URL and nothing else,
// while every statement below addresses its row by primary key alone — so
// without this the partition would reach into every other trip: a member of
// one trip could read (the change_log entry lands under *their* trip, so
// Pull hands them the foreign snapshot), rewrite, delete and seed rows
// anywhere, and the trip that owns those rows would never be told.
//
// A row is in scope when the row that already exists names this trip, and
// when the mutation itself names no other one (Sync-API P-3).
func belongsToTrip(tripID string, m sync.Mutation, current map[string]any, exists bool) bool {
	if exists {
		if owner, _ := current[columnTripID].(string); owner != tripID {
			return false
		}
	}
	if named, ok := m.Fields[columnTripID].(string); ok && named != tripID {
		return false
	}
	// A row nobody has seen yet has to name its trip, because there is no
	// existing row to inherit it from — today such a mutation reaches the
	// NOT NULL constraint and fails the whole push batch instead. Deletes
	// are exempt: deleting what is already gone is the ordinary idempotent
	// retry, and it writes nothing that could land in the wrong trip.
	if !exists && m.Op != sync.OpDelete {
		if _, ok := m.Fields[columnTripID].(string); !ok {
			return false
		}
	}
	return true
}

func validate(m sync.Mutation, partition map[string]bool) error {
	if !partition[m.Table] {
		return fmt.Errorf("%w: %s", ErrUnknownTable, m.Table)
	}
	columns := syncableColumns[m.Table]
	for field := range m.Fields {
		if !columns[field] {
			return fmt.Errorf("%w: %s.%s", ErrUnknownColumn, m.Table, field)
		}
	}
	return nil
}

func recordedResult(ctx context.Context, tx *sql.Tx, mutationID string) (MutationResult, bool, error) {
	var outcome, conflictsJSON string
	var seq int64
	err := tx.QueryRowContext(ctx,
		`SELECT outcome, coalesce(conflicts, '[]'), seq FROM mutations WHERE mutation_id = ?`,
		mutationID).Scan(&outcome, &conflictsJSON, &seq)
	if errors.Is(err, sql.ErrNoRows) {
		return MutationResult{}, false, nil
	}
	if err != nil {
		return MutationResult{}, false, fmt.Errorf("idempotency lookup: %w", err)
	}
	// Sync-API §5/P-5: the replay's own outcome is `duplicate`, and the
	// "recorded result" it returns is the seq and the conflicts of the
	// original push — which is why both are read back here. The stored
	// `outcome` is the memo's audit half: what the first attempt did,
	// answerable after the fact without replaying it.
	res := MutationResult{MutationID: mutationID, Outcome: sync.OutcomeDuplicate, Seq: seq}
	if err := json.Unmarshal([]byte(conflictsJSON), &res.Conflicts); err != nil {
		return MutationResult{}, false, fmt.Errorf("decode recorded conflicts: %w", err)
	}
	return res, true, nil
}

func recordResult(ctx context.Context, tx *sql.Tx, res MutationResult) error {
	conflicts, err := json.Marshal(res.Conflicts)
	if err != nil {
		return fmt.Errorf("encode conflicts: %w", err)
	}
	_, err = tx.ExecContext(ctx,
		`INSERT INTO mutations (mutation_id, outcome, conflicts, seq) VALUES (?, ?, ?, ?)`,
		res.MutationID, res.Outcome, string(conflicts), res.Seq)
	if err != nil {
		return fmt.Errorf("record mutation: %w", err)
	}
	return nil
}

// fieldClocksColumn holds the row's per-field HLC record as a JSON object
// (sync.FieldClocks). It is a merge input, never a synced column: clients
// never merge (P-4), so it stays out of pull snapshots and push whitelists.
const fieldClocksColumn = "field_hlcs"

// updatedHLCColumn holds the row's own HLC. Unlike fieldClocksColumn it
// *does* travel in pull snapshots: Sync-API §3 has the client advance its
// clock to the highest HLC it has observed, and a snapshot is the only
// place a pulling device meets one. It stays off the push whitelist, so a
// client can read the clock but never set it (P-4: clients never merge).
const updatedHLCColumn = "updated_hlc"

func loadRow(ctx context.Context, tx *sql.Tx, table, id string) (sync.Row, error) {
	cols := columnList(table)
	row := tx.QueryRowContext(ctx, fmt.Sprintf(
		`SELECT %s, %s, %s FROM %s WHERE id = ?`,
		strings.Join(cols, ", "), updatedHLCColumn, fieldClocksColumn, table), id)

	values := make([]any, len(cols)+2)
	ptrs := make([]any, len(values))
	for i := range values {
		ptrs[i] = &values[i]
	}
	if err := row.Scan(ptrs...); errors.Is(err, sql.ErrNoRows) {
		return sync.Row{}, nil
	} else if err != nil {
		return sync.Row{}, fmt.Errorf("load %s %s: %w", table, id, err)
	}

	fields := make(map[string]any, len(cols))
	for i, c := range cols {
		fields[c] = normalize(values[i])
	}
	hlcStr, _ := values[len(cols)].(string)
	clocks, err := decodeClocks(values[len(cols)+1])
	if err != nil {
		return sync.Row{}, fmt.Errorf("load %s %s: %w", table, id, err)
	}
	return sync.Row{Exists: true, Fields: fields, HLC: sync.HLC(hlcStr), Clocks: clocks}, nil
}

// decodeClocks reads the field_hlcs column. An empty record is a row that
// predates per-field clocks or was written by a non-merging path; Merge
// treats its fields as exactly as old as the row.
func decodeClocks(v any) (sync.FieldClocks, error) {
	raw, _ := v.(string)
	if b, ok := v.([]byte); ok {
		raw = string(b)
	}
	clocks := sync.FieldClocks{}
	if raw == "" {
		return clocks, nil
	}
	if err := json.Unmarshal([]byte(raw), &clocks); err != nil {
		return nil, fmt.Errorf("decode %s: %w", fieldClocksColumn, err)
	}
	return clocks, nil
}

func encodeClocks(clocks sync.FieldClocks) (string, error) {
	b, err := json.Marshal(clocks)
	if err != nil {
		return "", fmt.Errorf("encode %s: %w", fieldClocksColumn, err)
	}
	return string(b), nil
}

func persist(ctx context.Context, tx *sql.Tx, table string, m sync.Mutation, merged sync.MergeResult, exists bool) (changed bool, err error) {
	switch {
	case merged.Deleted && !exists:
		// Sync-API §5.1: a delete of a row that is already gone stays
		// accepted and writes nothing. Reporting it as a change would
		// append a tombstone per retry for a row no device ever had —
		// work every client redoes, for a row none of them can hold.
		return false, nil
	case merged.Deleted:
		_, err = tx.ExecContext(ctx, fmt.Sprintf(`DELETE FROM %s WHERE id = ?`, table), m.ID)
		return err == nil, err
	case !exists:
		return true, insertRow(ctx, tx, table, m.ID, merged)
	case len(merged.Applied) > 0:
		return true, updateRow(ctx, tx, table, m.ID, merged)
	default:
		return false, nil
	}
}

func insertRow(ctx context.Context, tx *sql.Tx, table, id string, merged sync.MergeResult) error {
	// A column the insert did not name took its default *now*: it is as
	// old as this write, not as old as whatever the row's HLC later
	// becomes. Without the stamp, a pack on a row whose state was never
	// written explicitly would fall back to the row clock and lose to an
	// unrelated later edit — the very thing per-field clocks exist to stop.
	stamped := make(sync.FieldClocks, len(merged.Clocks))
	for f, c := range merged.Clocks {
		stamped[f] = c
	}
	for _, c := range columnList(table) {
		if _, ok := stamped[c]; !ok {
			stamped[c] = merged.RowHLC
		}
	}
	clocks, err := encodeClocks(stamped)
	if err != nil {
		return err
	}
	cols := []string{"id", "updated_hlc", fieldClocksColumn}
	args := []any{id, string(merged.RowHLC), clocks}
	for f, v := range merged.Applied {
		cols = append(cols, f)
		args = append(args, v)
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?, ", len(cols)), ", ")
	query := fmt.Sprintf(`INSERT INTO %s (%s) VALUES (%s)`, table, strings.Join(cols, ", "), placeholders)
	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("insert %s %s: %w", table, id, err)
	}
	return nil
}

func updateRow(ctx context.Context, tx *sql.Tx, table, id string, merged sync.MergeResult) error {
	clocks, err := encodeClocks(merged.Clocks)
	if err != nil {
		return err
	}
	assignments := []string{"updated_hlc = ?", fieldClocksColumn + " = ?"}
	args := []any{string(merged.RowHLC), clocks}
	for f, v := range merged.Applied {
		assignments = append(assignments, f+" = ?")
		args = append(args, v)
	}
	args = append(args, id)
	query := fmt.Sprintf(`UPDATE %s SET %s WHERE id = ?`, table, strings.Join(assignments, ", "))
	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("update %s %s: %w", table, id, err)
	}
	return nil
}

// tombstoneHLC is the clock of the newest delete this feed recorded for one
// entity, or the empty clock when it never deleted it.
//
// A delete removes the row itself (persist), so once it has happened the
// entity's only trace is here — and a write that arrives afterwards has
// nothing left to be compared against. Reading the tombstone gives the
// comparison back: the change log is the delete's memory, and this is the
// one caller that needs to remember.
//
// The feed is part of the question rather than a filter over the answer: an
// entity belongs to exactly one partition, and a lookup that read both would
// let one trip's log speak about another's row.
//
// It scans: no index serves this predicate, and adding one is a schema
// change. Why that is affordable anyway, what it was measured at and when to
// revisit it — ADR-052. `BenchmarkTombstoneLookup_*` re-measures it.
func tombstoneHLC(ctx context.Context, tx *sql.Tx, f feed, table, id string) (sync.HLC, error) {
	where, args := f.where()
	args = append(args, table, id)
	var hlc string
	err := tx.QueryRowContext(ctx, `SELECT hlc FROM change_log
	         WHERE `+where+` AND entity_table = ? AND entity_id = ? AND deleted = 1
	         ORDER BY hlc DESC LIMIT 1`, args...).Scan(&hlc)
	if errors.Is(err, sql.ErrNoRows) {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("tombstone %s %s: %w", table, id, err)
	}
	return sync.HLC(hlc), nil
}

// appendChangeLog writes one change feed entry, under the feed of the
// partition it belongs to (spec §4).
func appendChangeLog(ctx context.Context, tx *sql.Tx, f feed, m sync.Mutation, deleted bool) (int64, error) {
	res, err := tx.ExecContext(ctx,
		`INSERT INTO change_log (trip_id, entity_table, entity_id, deleted, hlc) VALUES (?, ?, ?, ?, ?)`,
		f.tripID, m.Table, m.ID, boolToInt(deleted), string(m.HLC))
	if err != nil {
		return 0, fmt.Errorf("append change_log: %w", err)
	}
	seq, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("change_log seq: %w", err)
	}
	return seq, nil
}

// relogRefused re-delivers the row a refusal did *not* change, so the device
// that pushed the refused mutation converges through its ordinary next pull
// instead of keeping its optimistic copy forever (ADR-031, Sync-API §5).
//
// The entry's `deleted` flag is read from the server's own row rather than
// from the mutation's op: a refused delete or update re-delivers the
// snapshot, and a refused insert — for which there is no server row to
// deliver — delivers a tombstone that drops the phantom. That is the whole
// of the insert/update asymmetry, decided by what the server holds.
//
// It is deliberately not called for `out_of_scope`: the row is not this
// partition's, and an entry for it here would hand the pusher a foreign
// row's snapshot on the next pull (P-3). That one is repaired client-side.
func relogRefused(ctx context.Context, tx *sql.Tx, f feed, m sync.Mutation, row sync.Row) (int64, error) {
	entry := sync.Mutation{Table: m.Table, ID: m.ID, HLC: m.HLC}
	if row.Exists {
		// The row's own clock, not the refused mutation's: the entry
		// describes what the server holds, and nothing about it changed.
		entry.HLC = row.HLC
	}
	seq, err := appendChangeLog(ctx, tx, f, entry, !row.Exists)
	if err != nil {
		return 0, err
	}
	if m.Op != sync.OpDelete || !row.Exists {
		return seq, nil
	}
	return relogCascadeChildren(ctx, tx, f, m, seq)
}

// relogCascadeChildren names every child a delete of m would have taken,
// alive, in the change log. A delete takes its children with it and the
// client mirrors that cascade optimistically — so a row that survives the
// delete, whether because it was refused (ADR-031) or because FR-24.3
// retired it instead, comes back on that device with none of its children
// unless they are re-logged too.
func relogCascadeChildren(ctx context.Context, tx *sql.Tx, f feed, m sync.Mutation, seq int64) (int64, error) {
	children, err := cascadeChildren(ctx, tx, sync.Mutation{Table: m.Table, ID: m.ID, HLC: m.HLC}, true, true)
	if err != nil {
		return 0, err
	}
	for _, c := range children {
		child := sync.Mutation{Table: c.table, ID: c.id, HLC: m.HLC}
		if seq, err = appendChangeLog(ctx, tx, f, child, false); err != nil {
			return 0, err
		}
	}
	return seq, nil
}

// logConflicts records every field the merge dropped, naming the mutation
// that lost them and the user who pushed it (NFR-4.2a).
func logConflicts(ctx context.Context, tx *sql.Tx, f feed, actorID string, m sync.Mutation, conflicts []sync.Conflict) error {
	for _, c := range conflicts {
		losing, winning := jsonValue(c.LosingValue), jsonValue(c.WinningValue)
		_, err := tx.ExecContext(ctx,
			`INSERT INTO conflict_log (trip_id, entity_table, entity_id, field, losing_value, winning_value, mutation_id, actor_user_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			f.tripID, m.Table, m.ID, c.Field, losing, winning, m.MutationID, actorID)
		if err != nil {
			return fmt.Errorf("log conflict on %s: %w", c.Field, err)
		}
	}
	return nil
}

func columnList(table string) []string {
	cols := make([]string, 0, len(syncableColumns[table]))
	for c := range syncableColumns[table] {
		cols = append(cols, c)
	}
	sort.Strings(cols)
	return cols
}

func normalize(v any) any {
	if b, ok := v.([]byte); ok {
		return string(b)
	}
	return v
}

func jsonValue(v any) string {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Sprintf("%q", fmt.Sprint(v))
	}
	return string(b)
}

func boolToInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

func toSet(items ...string) map[string]bool {
	set := make(map[string]bool, len(items))
	for _, s := range items {
		set[s] = true
	}
	return set
}
