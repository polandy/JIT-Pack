// Package store — activity.go records who changed what (FR-32.1, ADR-084)
// and reads it back, per trip and for the inventory.
//
// The record is written inside the transaction of the write it describes,
// so an entry exists exactly when the change does. It stores what a reader
// needs and nothing it has to resolve later: the row's name at the time,
// the name of what the row belongs to, and each changed field's value
// before and after. What the change *means* — packed, bought, renamed — is
// decided by the client (invariant 4), which is also where Local Mode
// would need it.
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

// tableUsers names the accounts table, which no sync partition carries —
// it is read here only to name a trip member.
const tableUsers = "users"

// Activity operations, as the activity_log.op CHECK spells them.
const (
	ActivityInsert = "insert"
	ActivityUpdate = "update"
	ActivityDelete = "delete"
)

// DefaultActivityPage and MaxActivityPage bound one read of a log.
const (
	DefaultActivityPage = 100
	MaxActivityPage     = 500
)

// maxLabelRunes bounds a stored name: a note's body can be long, and the
// log names it, it does not quote it.
const maxLabelRunes = 120

// labelSource is one place a readable name may come from: a column of the
// row itself, or — when via is set — a column of the row that the foreign
// key via points at.
type labelSource struct {
	column string
	via    string
	table  string
}

// activityLabel is a table's pair of names for an entry: what the row is,
// and what it belongs to. Each is a list tried in order; the first
// non-empty value wins.
type activityLabel struct {
	name    []labelSource
	subject []labelSource
}

// own names columns of the row itself.
func own(columns ...string) []labelSource {
	out := make([]labelSource, len(columns))
	for i, c := range columns {
		out[i] = labelSource{column: c}
	}
	return out
}

// via names column of table, reached through the row's foreign key fk.
func via(fk, table, column string) []labelSource {
	return []labelSource{{column: column, via: fk, table: table}}
}

// ActivityEntry is one recorded change.
type ActivityEntry struct {
	ID          int64
	EntityTable string
	EntityID    string
	Op          string
	Label       string
	Subject     string
	// Changes is the stored {"field": [before, after]} object, verbatim.
	Changes     json.RawMessage
	ActorUserID string
	CreatedAt   string
}

// activityWrite is what recordActivity needs to know about one write.
type activityWrite struct {
	feed    feed
	actorID string
	table   string
	id      string
	// before is the row as it was, empty when the write created it.
	before sync.Row
	// applied is what the write set; nil for a delete.
	applied map[string]any
	deleted bool
}

// recordActivity writes the entry for one applied write. Its changes are
// every field the write changed, [before, after]; a delete's are every
// field the row held, [before, null]. A write that
// changed no value — the same field re-sent — records nothing, and neither
// does the delete of a trip: its log goes with it (the FK cascades), and
// the trip is the only place the entry could have been read.
func recordActivity(ctx context.Context, tx *sql.Tx, at string, w activityWrite) error {
	if w.table == TableTrips && w.deleted {
		return nil
	}
	op := ActivityUpdate
	switch {
	case w.deleted:
		op = ActivityDelete
	case !w.before.Exists:
		op = ActivityInsert
	}

	changes := map[string][2]any{}
	fields := make(map[string]any, len(w.before.Fields)+len(w.applied))
	for f, v := range w.before.Fields {
		fields[f] = v
	}
	if w.deleted {
		// What was deleted, as it was: the row is gone, and this is the
		// only place left that says what it was — a task or a note, how
		// many, in which excursion.
		for f, v := range w.before.Fields {
			if v != nil {
				changes[f] = [2]any{normalize(v), nil}
			}
		}
	} else {
		for f, v := range w.applied {
			var old any
			if w.before.Exists {
				old = w.before.Fields[f]
			}
			if sameValue(old, v) {
				continue
			}
			changes[f] = [2]any{old, v}
			fields[f] = v
		}
		if len(changes) == 0 {
			return nil
		}
	}

	spec := tableSpecs[w.table].label
	label, err := resolveLabel(ctx, tx, fields, spec.name)
	if err != nil {
		return err
	}
	subject, err := resolveLabel(ctx, tx, fields, spec.subject)
	if err != nil {
		return err
	}
	encoded, err := json.Marshal(changes)
	if err != nil {
		return fmt.Errorf("encode activity changes: %w", err)
	}
	_, err = tx.ExecContext(ctx,
		`INSERT INTO activity_log (trip_id, entity_table, entity_id, op, label, subject, changes, actor_user_id, created_at)
		 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		activityTrip(w, fields), w.table, w.id, op, label, nullIfEmpty(subject), string(encoded), w.actorID, at)
	if err != nil {
		return fmt.Errorf("record activity on %s: %w", w.table, err)
	}
	return nil
}

// activityTrip is the trip an entry is about, or nil for the inventory. The
// trip partition's feed names it; on the master partition a trip's own row
// and the rows that carry its id belong to it.
func activityTrip(w activityWrite, fields map[string]any) any {
	if w.feed.tripID != nil {
		return w.feed.tripID
	}
	if w.table == TableTrips {
		return w.id
	}
	if tripID, ok := fields[columnTripID].(string); ok && tripID != "" {
		return tripID
	}
	return nil
}

// resolveLabel returns the first non-empty name sources yields.
func resolveLabel(ctx context.Context, tx *sql.Tx, fields map[string]any, sources []labelSource) (string, error) {
	for _, src := range sources {
		var value any
		if src.via == "" {
			value = fields[src.column]
		} else {
			ref, ok := fields[src.via].(string)
			if !ok || ref == "" {
				continue
			}
			err := tx.QueryRowContext(ctx,
				fmt.Sprintf(`SELECT %s FROM %s WHERE id = ?`, src.column, src.table), ref).Scan(&value)
			if errors.Is(err, sql.ErrNoRows) {
				continue
			}
			if err != nil {
				return "", fmt.Errorf("activity label %s.%s: %w", src.table, src.column, err)
			}
		}
		if text := strings.TrimSpace(fmt.Sprint(normalize(value))); value != nil && text != "" {
			return truncateRunes(text, maxLabelRunes), nil
		}
	}
	return "", nil
}

// sameValue compares a stored value with a pushed one. SQLite hands back
// integers where a push may carry a JSON boolean or number, so both sides
// are reduced to their JSON spelling, a boolean to the 0/1 it is stored as.
func sameValue(stored, pushed any) bool {
	return jsonValue(asStored(normalize(stored))) == jsonValue(asStored(pushed))
}

func asStored(v any) any {
	switch b := v.(type) {
	case bool:
		if b {
			return 1
		}
		return 0
	case float64:
		if b == float64(int64(b)) {
			return int64(b)
		}
	}
	return v
}

func truncateRunes(s string, limit int) string {
	r := []rune(s)
	if len(r) <= limit {
		return s
	}
	return strings.TrimSpace(string(r[:limit-1])) + "…"
}

func nullIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

// TripActivity returns one trip's log, newest first: at most limit entries
// older than the entry before (0 reads from the newest). Membership is the
// caller's to check.
func (s *Store) TripActivity(ctx context.Context, tripID string, before int64, limit int) ([]ActivityEntry, error) {
	return s.readActivity(ctx, `trip_id = ?`, []any{tripID}, before, limit)
}

// InventoryActivity returns the inventory's log as userID may read it,
// newest first. Instance-wide master data is everyone's; a row only its
// owner may pull — a series, a destination profile — is only ever written
// by that owner, so its entries are the reader's own.
func (s *Store) InventoryActivity(ctx context.Context, userID string, before int64, limit int) ([]ActivityEntry, error) {
	shared := make([]string, 0, len(tableSpecs))
	args := []any{}
	for table, spec := range tableSpecs {
		if spec.partition == partitionMaster && spec.visible.everyone {
			shared = append(shared, "?")
			args = append(args, table)
		}
	}
	args = append(args, userID)
	where := `trip_id IS NULL AND (entity_table IN (` + strings.Join(shared, ", ") + `) OR actor_user_id = ?)`
	return s.readActivity(ctx, where, args, before, limit)
}

func (s *Store) readActivity(ctx context.Context, where string, args []any, before int64, limit int) ([]ActivityEntry, error) {
	if limit <= 0 {
		limit = DefaultActivityPage
	}
	limit = min(limit, MaxActivityPage)
	if before > 0 {
		where += ` AND id < ?`
		args = append(args, before)
	}
	args = append(args, limit)
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, entity_table, entity_id, op, label, coalesce(subject, ''), changes, actor_user_id, created_at
		 FROM activity_log WHERE `+where+` ORDER BY id DESC LIMIT ?`, args...)
	if err != nil {
		return nil, fmt.Errorf("read activity: %w", err)
	}
	defer rows.Close() //nolint:errcheck // read-only cursor

	out := []ActivityEntry{}
	for rows.Next() {
		var e ActivityEntry
		var changes string
		if err := rows.Scan(&e.ID, &e.EntityTable, &e.EntityID, &e.Op, &e.Label, &e.Subject,
			&changes, &e.ActorUserID, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan activity: %w", err)
		}
		e.Changes = json.RawMessage(changes)
		out = append(out, e)
	}
	return out, rows.Err()
}
