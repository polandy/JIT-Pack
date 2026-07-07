// Package store is the only package that touches SQLite. It persists
// merge results from internal/sync and serves the pull protocol from the
// change_log (Sync-API Spec §4/§5).
package store

import (
	"context"
	"database/sql"
	"embed"
	"encoding/json"
	"errors"
	"fmt"
	"sort"
	"strings"

	"jitpack/internal/sync"

	_ "github.com/mattn/go-sqlite3" // deviation D-001, see DEVIATIONS.md
)

//go:embed migrations/*.sql
var migrations embed.FS

var (
	ErrUnknownTable  = errors.New("table not syncable")
	ErrUnknownColumn = errors.New("column not syncable")
)

// syncableColumns whitelists the tables and columns the push endpoint may
// touch; everything else is rejected before any SQL is built.
var syncableColumns = map[string]map[string]bool{
	"trip_items": toSet(
		"trip_id", "source_item_id", "source_template_id", "name",
		"weight_grams", "value_cents", "category_name", "quantity",
		"packed_count", "state", "mode", "late_packer",
		"assigned_traveler_id", "packer_user_id", "container_id",
		"packing_now_by", "packing_now_at", "flag_unused", "flag_missing",
		"outbound_packed",
	),
}

// Store owns the SQLite handle. SQLite has a single writer; capping the
// pool at one connection makes that explicit and keeps :memory: databases
// on a single connection in tests.
type Store struct {
	db *sql.DB
}

// Open connects, enforces foreign keys, and applies embedded migrations
// in lexical order.
func Open(dsn string) (*Store, error) {
	db, err := sql.Open("sqlite3", dsn)
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	if _, err := db.Exec(`PRAGMA foreign_keys = ON`); err != nil {
		return nil, fmt.Errorf("enable foreign keys: %w", err)
	}
	if err := migrate(db); err != nil {
		return nil, err
	}
	return &Store{db: db}, nil
}

func (s *Store) Close() error { return s.db.Close() }

func migrate(db *sql.DB) error {
	entries, err := migrations.ReadDir("migrations")
	if err != nil {
		return fmt.Errorf("read migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		names = append(names, e.Name())
	}
	sort.Strings(names)
	for _, name := range names {
		ddl, err := migrations.ReadFile("migrations/" + name)
		if err != nil {
			return fmt.Errorf("read migration %s: %w", name, err)
		}
		if _, err := db.Exec(string(ddl)); err != nil {
			return fmt.Errorf("apply migration %s: %w", name, err)
		}
	}
	return nil
}

// MutationResult is the per-mutation answer of the push endpoint.
type MutationResult struct {
	MutationID string
	Outcome    string // applied | merged | duplicate
	Conflicts  []sync.Conflict
	Seq        int64
}

// ApplyMutation resolves one mutation transactionally: idempotency memo,
// merge per NFR-4.2a, persistence, conflict_log, change_log.
func (s *Store) ApplyMutation(ctx context.Context, tripID string, m sync.Mutation) (MutationResult, error) {
	if err := validate(m); err != nil {
		return MutationResult{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MutationResult{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback()

	if recorded, found, err := recordedResult(ctx, tx, m.MutationID); err != nil {
		return MutationResult{}, err
	} else if found {
		return recorded, nil
	}

	current, currentHLC, exists, err := loadTripItem(ctx, tx, m.ID)
	if err != nil {
		return MutationResult{}, err
	}
	merged := sync.Merge(current, currentHLC, exists, m)

	res := MutationResult{MutationID: m.MutationID, Outcome: string(merged.Outcome), Conflicts: merged.Conflicts}
	changed, err := persist(ctx, tx, m, merged, exists)
	if err != nil {
		return MutationResult{}, err
	}
	if changed {
		res.Seq, err = appendChangeLog(ctx, tx, tripID, m, merged.Deleted)
		if err != nil {
			return MutationResult{}, err
		}
	}
	if err := logConflicts(ctx, tx, tripID, m, merged.Conflicts); err != nil {
		return MutationResult{}, err
	}
	if err := recordResult(ctx, tx, res); err != nil {
		return MutationResult{}, err
	}
	if err := tx.Commit(); err != nil {
		return MutationResult{}, fmt.Errorf("commit: %w", err)
	}
	return res, nil
}

func validate(m sync.Mutation) error {
	columns, ok := syncableColumns[m.Table]
	if !ok {
		return fmt.Errorf("%w: %s", ErrUnknownTable, m.Table)
	}
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
	res := MutationResult{MutationID: mutationID, Outcome: "duplicate", Seq: seq}
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

func loadTripItem(ctx context.Context, tx *sql.Tx, id string) (fields map[string]any, hlc sync.HLC, exists bool, err error) {
	cols := columnList("trip_items")
	row := tx.QueryRowContext(ctx, fmt.Sprintf(
		`SELECT %s, updated_hlc FROM trip_items WHERE id = ?`, strings.Join(cols, ", ")), id)

	values := make([]any, len(cols)+1)
	ptrs := make([]any, len(values))
	for i := range values {
		ptrs[i] = &values[i]
	}
	if err := row.Scan(ptrs...); errors.Is(err, sql.ErrNoRows) {
		return nil, "", false, nil
	} else if err != nil {
		return nil, "", false, fmt.Errorf("load trip_item %s: %w", id, err)
	}

	fields = make(map[string]any, len(cols))
	for i, c := range cols {
		fields[c] = normalize(values[i])
	}
	hlcStr, _ := values[len(cols)].(string)
	return fields, sync.HLC(hlcStr), true, nil
}

func persist(ctx context.Context, tx *sql.Tx, m sync.Mutation, merged sync.MergeResult, exists bool) (changed bool, err error) {
	switch {
	case merged.Deleted:
		_, err = tx.ExecContext(ctx, `DELETE FROM trip_items WHERE id = ?`, m.ID)
		return err == nil, err
	case !exists:
		return true, insertRow(ctx, tx, m.ID, merged)
	case len(merged.Applied) > 0:
		return true, updateRow(ctx, tx, m.ID, merged)
	default:
		return false, nil
	}
}

func insertRow(ctx context.Context, tx *sql.Tx, id string, merged sync.MergeResult) error {
	cols := []string{"id", "updated_hlc"}
	args := []any{id, string(merged.RowHLC)}
	for f, v := range merged.Applied {
		cols = append(cols, f)
		args = append(args, v)
	}
	placeholders := strings.TrimSuffix(strings.Repeat("?, ", len(cols)), ", ")
	query := fmt.Sprintf(`INSERT INTO trip_items (%s) VALUES (%s)`, strings.Join(cols, ", "), placeholders)
	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("insert trip_item %s: %w", id, err)
	}
	return nil
}

func updateRow(ctx context.Context, tx *sql.Tx, id string, merged sync.MergeResult) error {
	assignments := []string{"updated_hlc = ?"}
	args := []any{string(merged.RowHLC)}
	for f, v := range merged.Applied {
		assignments = append(assignments, f+" = ?")
		args = append(args, v)
	}
	args = append(args, id)
	query := fmt.Sprintf(`UPDATE trip_items SET %s WHERE id = ?`, strings.Join(assignments, ", "))
	if _, err := tx.ExecContext(ctx, query, args...); err != nil {
		return fmt.Errorf("update trip_item %s: %w", id, err)
	}
	return nil
}

func appendChangeLog(ctx context.Context, tx *sql.Tx, tripID string, m sync.Mutation, deleted bool) (int64, error) {
	res, err := tx.ExecContext(ctx,
		`INSERT INTO change_log (trip_id, entity_table, entity_id, deleted, hlc) VALUES (?, ?, ?, ?, ?)`,
		tripID, m.Table, m.ID, boolToInt(deleted), string(m.HLC))
	if err != nil {
		return 0, fmt.Errorf("append change_log: %w", err)
	}
	seq, err := res.LastInsertId()
	if err != nil {
		return 0, fmt.Errorf("change_log seq: %w", err)
	}
	return seq, nil
}

func logConflicts(ctx context.Context, tx *sql.Tx, tripID string, m sync.Mutation, conflicts []sync.Conflict) error {
	for _, c := range conflicts {
		losing, winning := jsonValue(c.LosingValue), jsonValue(c.WinningValue)
		_, err := tx.ExecContext(ctx,
			`INSERT INTO conflict_log (trip_id, entity_table, entity_id, field, losing_value, winning_value)
			 VALUES (?, ?, ?, ?, ?, ?)`,
			tripID, m.Table, m.ID, c.Field, losing, winning)
		if err != nil {
			return fmt.Errorf("log conflict on %s: %w", c.Field, err)
		}
	}
	return nil
}

// Change is one entry of a pull page (Sync-API Spec §4).
type Change struct {
	Seq     int64
	Table   string
	ID      string
	Deleted bool
	Row     map[string]any
}

// PullPage is the pull response envelope.
type PullPage struct {
	Changes    []Change
	NextCursor int64
	HasMore    bool
}

// Pull returns change_log entries after the cursor as full row snapshots,
// compacted to the latest entry per entity within the page.
func (s *Store) Pull(ctx context.Context, tripID string, cursor int64, limit int) (PullPage, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT seq, entity_table, entity_id, deleted FROM change_log
		 WHERE trip_id = ? AND seq > ? ORDER BY seq LIMIT ?`,
		tripID, cursor, limit+1)
	if err != nil {
		return PullPage{}, fmt.Errorf("pull change_log: %w", err)
	}
	defer rows.Close()

	var entries []Change
	for rows.Next() {
		var c Change
		var deleted int
		if err := rows.Scan(&c.Seq, &c.Table, &c.ID, &deleted); err != nil {
			return PullPage{}, fmt.Errorf("scan change: %w", err)
		}
		c.Deleted = deleted == 1
		entries = append(entries, c)
	}
	if err := rows.Err(); err != nil {
		return PullPage{}, fmt.Errorf("iterate changes: %w", err)
	}

	page := PullPage{HasMore: len(entries) > limit}
	if page.HasMore {
		entries = entries[:limit]
	}
	if len(entries) > 0 {
		page.NextCursor = entries[len(entries)-1].Seq
	} else {
		page.NextCursor = cursor
	}

	for _, c := range compact(entries) {
		if !c.Deleted {
			c.Row, _, _, err = s.loadSnapshot(ctx, c.ID)
			if err != nil {
				return PullPage{}, err
			}
		}
		page.Changes = append(page.Changes, c)
	}
	return page, nil
}

// compact keeps only the latest change per entity, preserving seq order —
// the pull row is a full snapshot, so earlier entries carry no information.
func compact(entries []Change) []Change {
	latest := map[string]int64{}
	for _, c := range entries {
		latest[c.Table+"/"+c.ID] = c.Seq
	}
	out := make([]Change, 0, len(latest))
	for _, c := range entries {
		if latest[c.Table+"/"+c.ID] == c.Seq {
			out = append(out, c)
		}
	}
	return out
}

func (s *Store) loadSnapshot(ctx context.Context, id string) (map[string]any, sync.HLC, bool, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, "", false, fmt.Errorf("begin snapshot read: %w", err)
	}
	defer tx.Rollback()
	return loadTripItem(ctx, tx, id)
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
