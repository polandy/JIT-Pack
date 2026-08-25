// Package store is the only package that touches SQLite. It persists
// merge results from internal/sync and serves the pull protocol from the
// change_log (Sync-API Spec §4/§5).
package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	_ "embed"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"time"

	"jitpack/internal/sync"

	_ "modernc.org/sqlite" // pure-Go driver per ADR-001; D-001 resolved
)

//go:embed schema.sql
var schemaSQL string

var (
	ErrUnknownTable  = errors.New("table not syncable")
	ErrUnknownColumn = errors.New("column not syncable")
)

// columnTripID is the column that ties a row to its trip. It is compared
// against rather than merely written, in the trip partition's confinement
// and in the master partition's parent checks, so it is named once.
const columnTripID = "trip_id"

// The syncable tables, named once. Every partition set, authorization
// switch, visibility rule, cascade and export list below compares against
// these rather than against a literal — a table name is switched on in five
// places across two packages, and a typo in any one of them fails as a
// silently missing case rather than as a compile error.
const (
	TableTags                      = "tags"
	TableItemTags                  = "item_tags"
	TableItems                     = "items"
	TableItemDependencies          = "item_dependencies"
	TableTemplates                 = "templates"
	TableTemplateItems             = "template_items"
	TableTemplateIncludes          = "template_includes"
	TableTemplateItemTasks         = "template_item_tasks"
	TableTrips                     = "trips"
	TableTripMembers               = "trip_members"
	TableTripSeries                = "trip_series"
	TableDestinationProfiles       = "destination_profiles"
	TableDestinationChecklistItems = "destination_checklist_items"
	TableTripItems                 = "trip_items"
	TableTravelers                 = "travelers"
	TableContainers                = "containers"
	TableComments                  = "comments"
	// FR-27.4, the planning-trip refresh (migration 023).
	TableTripTemplateSources    = "trip_template_sources"
	TableTripGeneratedPositions = "trip_generated_positions"
	TableTripAppliedChanges     = "trip_applied_changes"
)

// StatePackingNow is the `trip_items.state` value that carries a G-3
// claim (FR-5.3). Three layers compare against it — the push's actor
// stamping, the lock events it emits, and the FR-5.7 takeover — so it is
// named once (CODING_PRINCIPLES §4a).
const StatePackingNow = "packing_now"

// The item mark (§3.28), named once because three layers compare against
// it: the schema's CHECK, the handler's cap, and the sync whitelist.
const (
	// MarkColumn is the column carrying one optional emoji on items and
	// templates alike (FR-28.1/28.8).
	MarkColumn = "icon"
	// MarkMaxBytes is the whole of the server's validation (FR-28.9). It
	// holds any single emoji including a ZWJ sequence with modifiers; the
	// curated index the client picks from lives client-side, because the
	// mark is a display preference and not a security boundary.
	MarkMaxBytes = 32
)

// The two template scopes (FR-27.1), named once: they are compared
// against in the include rule, in the scope-switch guards and in the
// schema's own CHECK, and a mistyped literal reads as "some other scope"
// rather than as a build failure (CODING_PRINCIPLES §4a).
const (
	// KindTemplate is a Ferien-Vorlage: it may include groups and is what
	// a trip is generated from.
	KindTemplate = "template"
	// KindGroup is a Gruppe: it carries item positions only and is the
	// thing a Ferien-Vorlage includes.
	KindGroup = "group"
)

// The trip roles (FR-4.5/4.7), named once: they are compared against in
// every authorization decision, and a mistyped literal reads as "not that
// role" rather than as a build failure.
const (
	RoleOwner  = "owner"
	RoleAdmin  = "admin"
	RoleEditor = "editor"
)

// syncableColumns whitelists the tables and columns the push endpoints may
// touch; everything else is rejected before any SQL is built.
var syncableColumns = map[string]map[string]bool{
	TableTripItems: toSet(
		"trip_id", "source_item_id", "source_template_id", "name",
		"weight_grams", "value_cents", "category_name", "quantity",
		"packed_count", "state", "mode", "late_packer",
		"assigned_traveler_id", "packer_user_id", "container_id",
		"packing_now_by", "packing_now_at", "flag_unused", "flag_missing",
		"outbound_packed",
		// Listed so the server's own stamp can be persisted through the
		// push path; stampActor discards any client-sent value first
		// (FR-25.19, invariant 3). packed_at is the same record's time
		// (FR-25.17) and goes through the same gate.
		"packed_by_user_id", "packed_at",
	),
	// profile is gone with FR-25.9 (migration 018) — a client still
	// sending it is rejected rather than silently ignored.
	TableTravelers: toSet(
		"trip_id", "name", "linked_user_id",
	),
	TableContainers: toSet(
		"trip_id", "name", "carrier_traveler_id", "max_weight_grams",
		"paired_container_id",
	),
	TableComments: toSet(
		"trip_id", "trip_item_id", "author_id", "body",
		"is_task", "task_state",
	),
	// Renamed from `categories` by migration 022 (ADR-014): an item carries
	// a set of these, not one of them.
	TableTags: toSet(
		"name", "sort_order",
	),
	// One assignment per row so each merges on its own (NFR-4.2a); a JSON
	// set on the item would be a single field and lose one of two
	// concurrent edits. position 0 is the primary tag (FR-24.2).
	TableItemTags: toSet(
		"item_id", "tag_id", "position",
	),
	// category_id is gone with FR-24.1 (migration 022) — a client still
	// sending it is rejected rather than silently ignored.
	TableItems: toSet(
		"name", "weight_grams", "value_cents",
		"created_by",
		"image_hash",
		MarkColumn,
	),
	// is_published stays in the schema but off this list: the publish gate
	// is parked with the FR-1.6 MVP simplification (templates are shared
	// instance-wide), and an unreadable column no client can set is the
	// honest state until the stub's revisit trigger fires.
	TableTemplates: toSet(
		"owner_id", "name", "kind", MarkColumn,
	),
	TableTemplateItems: toSet(
		"template_id", "item_id", "quantity", "assignment",
		"dedup", "conditions", "default_mode", "late_packer",
	),
	TableTemplateIncludes: toSet(
		"template_id", "included_template_id",
	),
	TableTemplateItemTasks: toSet(
		"template_item_id", "task",
	),
	TableTrips: toSet(
		"series_id", "name", "year", "start_date", "end_date", "status",
		"attributes", "imported", "created_by",
	),
	TableTripSeries: toSet(
		"owner_id", "name", "default_attributes",
	),
	TableDestinationProfiles: toSet(
		"series_id", "notes",
	),
	TableDestinationChecklistItems: toSet(
		"profile_id", "label", "mode",
	),
	TableTripMembers: toSet(
		"trip_id", "user_id", "role",
	),
	TableItemDependencies: toSet(
		"item_id", "depends_on_item_id", "mode", "quantity",
	),
	// FR-27.4: which templates a planning trip follows. Registered by
	// generation, read by the refresh diff and by M8's blast-radius note.
	TableTripTemplateSources: toSet(
		"trip_id", "template_id",
	),
	// FR-27.4: what generation last produced per position — the record that
	// lets the refresh tell a manual edit from its own previous work.
	TableTripGeneratedPositions: toSet(
		"trip_id", "trip_item_id", "source_template_id", "source_item_id",
		"traveler_id", "name", "quantity", "mode", "late_packer",
		"weight_grams", "value_cents", "category_name", "tasks",
	),
	// FR-27.4: the log behind M2's applied-changes chip. created_at is
	// client-set: the entry records when the *client* applied the change,
	// which is the only device that knows — the server never runs the diff.
	TableTripAppliedChanges: toSet(
		"trip_id", "source_template_id", "source_template_name",
		"kind", "item_name", "detail", "created_at",
	),
}

// Partition membership per Sync-API Spec P-3: a mutation is only valid
// on the endpoint of its partition, otherwise changes would leak into
// the wrong change feed.
var (
	// trip_generated_positions is trip-partition state: it is only ever read
	// beside the rows it describes, and it should travel with them.
	tripPartitionTables = toSet(TableTripItems, TableTravelers, TableContainers, TableComments,
		TableTripGeneratedPositions)
	// trip_template_sources and trip_applied_changes are trip-scoped but
	// travel the *master* partition, like trip_members: M2 renders the
	// FR-27.4 chip and M8 its blast-radius note without any trip partition
	// being loaded.
	masterPartitionTables = toSet(TableTags, TableItemTags, TableItems, TableTemplates, TableTemplateItems,
		TableTemplateIncludes, TableTemplateItemTasks, TableTrips,
		TableTripSeries, TableDestinationProfiles, TableDestinationChecklistItems, TableTripMembers,
		TableItemDependencies, TableTripTemplateSources, TableTripAppliedChanges)
)

// Store owns the SQLite handle. SQLite has a single writer; capping the
// pool at one connection makes that explicit and keeps :memory: databases
// on a single connection in tests.
type Store struct {
	db *sql.DB
	// hlc stamps change_log entries the server originates itself — facts
	// with no client mutation behind them, currently the item_images
	// upload hint (FR-22). A random per-process device id is fine: the
	// physical-ms component keeps HLCs increasing across restarts, and the
	// device id only breaks ties within the same millisecond and counter.
	hlc *sync.Generator
}

// wallClock is the production Clock: real time in milliseconds.
type wallClock struct{}

func (wallClock) NowMillis() int64 { return time.Now().UnixMilli() }

// ErrSchemaStale reports a database built against a different version of
// schema.sql. The development phase has no DDL migrations, so there is no
// upgrade path — the error names the file and how to start over.
var ErrSchemaStale = errors.New("store: database schema is stale")

// maxUserVersion is the largest value PRAGMA user_version holds: SQLite
// defines it as a signed 32-bit integer.
const maxUserVersion = 0x7fffffff

// schemaFingerprint identifies the version of schema.sql a database was
// built from. It is stored in PRAGMA user_version, so the digest is truncated
// to fit; 0 is skipped because that is what an unstamped database already
// reads as, and a fingerprint landing there would make a stale database look
// fresh.
func schemaFingerprint() int64 {
	sum := sha256.Sum256([]byte(schemaSQL))
	fp := int64(binary.BigEndian.Uint32(sum[:4]) & maxUserVersion)
	if fp == 0 {
		return 1
	}
	return fp
}

// Open connects, enforces foreign keys, and brings the database to the
// current schema: an empty file gets schema.sql applied, an up-to-date one is
// used as it is, and anything else is refused.
func Open(dsn string) (*Store, error) {
	db, err := sql.Open("sqlite", withForeignKeys(dsn))
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)
	// WAL is a property of the file and persists, but it is set here on every
	// open rather than in schema.sql: journal_mode cannot be changed inside a
	// transaction, and applySchema runs in one. An in-memory database answers
	// "memory" and is left alone.
	if _, err := db.Exec(`PRAGMA journal_mode = WAL`); err != nil {
		return nil, fmt.Errorf("enable WAL: %w", err)
	}
	if err := ensureSchema(db, dsn); err != nil {
		return nil, err
	}
	gen, err := sync.NewGenerator(wallClock{}, randomID()[:8])
	if err != nil {
		return nil, fmt.Errorf("server hlc generator: %w", err)
	}
	return &Store{db: db, hlc: gen}, nil
}

func (s *Store) Close() error { return s.db.Close() }

// foreignKeysPragma switches SQLite's foreign key enforcement on. SQLite
// defaults it *off* and the setting is per connection, not per database.
const foreignKeysPragma = "_pragma=foreign_keys(1)"

// withForeignKeys puts the pragma into the DSN rather than running it once
// after connecting. `PRAGMA foreign_keys = ON` applies only to the
// connection that executed it, so database/sql replacing a broken pooled
// connection would silently hand back one where every REFERENCES clause in
// schema.sql is decorative — and the first sign of it would be an orphaned
// row nobody can explain. In the DSN the driver applies it to every
// connection it ever opens.
func withForeignKeys(dsn string) string {
	sep := "?"
	if strings.Contains(dsn, "?") {
		sep = "&"
	}
	return dsn + sep + foreignKeysPragma
}

// ensureSchema applies schema.sql to an empty database and otherwise checks
// that the one it was handed came from the same schema.
//
// The development phase deliberately has no migrations (CLAUDE.md invariant
// 2): a schema change edits schema.sql, and every existing database becomes
// unreadable by design. Nothing is recreated silently — the owner chose an
// error carrying the instruction, so a database that might still be wanted
// survives a start-up that refuses it.
func ensureSchema(db *sql.DB, dsn string) error {
	var version int64
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return fmt.Errorf("read user_version: %w", err)
	}
	want := schemaFingerprint()
	if version == want {
		return nil
	}
	// user_version 0 means "never stamped", which is only *fresh* when the
	// file carries nothing yet — a populated database reading 0 comes from a
	// build that stamped something else, and applying the schema on top of it
	// would fail halfway through with "table already exists".
	if version == 0 {
		var tables int
		if err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).Scan(&tables); err != nil {
			return fmt.Errorf("inspect database: %w", err)
		}
		if tables == 0 {
			return applySchema(db, schemaSQL, want)
		}
	}
	// Two paths, because the reader is either a developer whose scratch
	// database is worth nothing or an operator whose database is worth
	// everything — and the error cannot tell which.
	return fmt.Errorf("%w: %s was built from a different schema\n"+
		"\tJIT-Pack is pre-1.0 and ships no schema upgrade path\n"+
		"\tto discard it:   rm %s   and restart\n"+
		"\tto keep it:      run the JIT-Pack version that wrote it, export under Settings -> Data, then upgrade and import",
		ErrSchemaStale, dsn, dsn)
}

// applySchema installs ddl and stamps its fingerprint in the same
// transaction, so a database can never be left carrying half of one.
//
// The DDL is a parameter rather than the package's embedded schema so the
// failure path — a statement that does not apply — can be driven directly
// instead of only through a deliberately broken build.
func applySchema(db *sql.DB, ddl string, fingerprint int64) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin schema: %w", err)
	}
	defer func() {
		// Rolling back a committed transaction is the no-op sql.ErrTxDone.
		if err := tx.Rollback(); err != nil && !errors.Is(err, sql.ErrTxDone) {
			slog.Error("rolling back schema install", "error", err)
		}
	}()
	if _, err := tx.Exec(ddl); err != nil {
		return fmt.Errorf("apply schema: %w", err)
	}
	// PRAGMA takes no bind parameters; the value is an int64 this package
	// computed, never anything a caller supplied.
	if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, fingerprint)); err != nil {
		return fmt.Errorf("stamp user_version: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit schema: %w", err)
	}
	return nil
}

// MutationResult is the per-mutation answer of the push endpoint.
type MutationResult struct {
	MutationID string
	Outcome    sync.Outcome
	Conflicts  []sync.Conflict
	Seq        int64
}

// ApplyMutation resolves one trip-partition mutation transactionally:
// idempotency memo, merge per NFR-4.2a, persistence, conflict_log,
// change_log.
func (s *Store) ApplyMutation(ctx context.Context, tripID, userID string, m sync.Mutation) (MutationResult, error) {
	if err := validate(m, tripPartitionTables); err != nil {
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

	row, err := loadRow(ctx, tx, m.Table, m.ID)
	if err != nil {
		return MutationResult{}, err
	}

	if !belongsToTrip(tripID, m, row.Fields, row.Exists) {
		res := MutationResult{MutationID: m.MutationID, Outcome: sync.OutcomeRejected}
		return res, finalize(ctx, tx, res)
	}

	merged := sync.Merge(row, m)

	// FK cascades delete child rows inside SQLite, where the change feed
	// cannot see them; collect their ids before the delete so they can be
	// tombstoned like any other change (same reason as the master path).
	cascaded, err := cascadeChildren(ctx, tx, m, merged.Deleted, row.Exists)
	if err != nil {
		return MutationResult{}, err
	}

	res := MutationResult{MutationID: m.MutationID, Outcome: merged.Outcome, Conflicts: merged.Conflicts}
	changed, err := persist(ctx, tx, m.Table, m, merged, row.Exists)
	if err != nil {
		if isConstraintViolation(err) {
			// Ordinary offline traffic reaches this: a container deleted on
			// another device, a quantity cut below what is already packed, a
			// partial upsert whose row is gone. The statement failed and the
			// transaction survives, so it is a refusal the client can park —
			// where an error would become a 500, and a 5xx is the one answer
			// the outbox keeps retrying, wedging the whole partition behind
			// the bad row. Same treatment as the master partition.
			res := MutationResult{MutationID: m.MutationID, Outcome: sync.OutcomeRejected}
			return res, finalize(ctx, tx, res)
		}
		return MutationResult{}, err
	}
	if changed {
		res.Seq, err = appendChangeLog(ctx, tx, tripID, m, merged.Deleted)
		if err != nil {
			return MutationResult{}, err
		}
		for _, c := range cascaded {
			tombstone := sync.Mutation{Table: c.table, ID: c.id, HLC: m.HLC}
			if _, err := appendChangeLog(ctx, tx, tripID, tombstone, true); err != nil {
				return MutationResult{}, err
			}
		}
	}
	if err := logConflicts(ctx, tx, tripID, userID, m, merged.Conflicts); err != nil {
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

// appendChangeLog writes one change feed entry; tripID is a string for
// the trip partition or nil for the master partition (spec §4).
func appendChangeLog(ctx context.Context, tx *sql.Tx, tripID any, m sync.Mutation, deleted bool) (int64, error) {
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

// logConflicts records every field the merge dropped, naming the mutation
// that lost them and the user who pushed it (NFR-4.2a).
func logConflicts(ctx context.Context, tx *sql.Tx, tripID any, userID string, m sync.Mutation, conflicts []sync.Conflict) error {
	for _, c := range conflicts {
		losing, winning := jsonValue(c.LosingValue), jsonValue(c.WinningValue)
		_, err := tx.ExecContext(ctx,
			`INSERT INTO conflict_log (trip_id, entity_table, entity_id, field, losing_value, winning_value, mutation_id, actor_user_id)
			 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
			tripID, m.Table, m.ID, c.Field, losing, winning, m.MutationID, userID)
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

	entries, err := scanChanges(rows)
	if err != nil {
		return PullPage{}, err
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
			if _, ok := syncableColumns[c.Table]; ok {
				c.Row, err = s.loadSnapshot(ctx, c.Table, c.ID)
				if err != nil {
					return PullPage{}, err
				}
			}
		}
		page.Changes = append(page.Changes, c)
	}
	return page, nil
}

func scanChanges(rows *sql.Rows) ([]Change, error) {
	var entries []Change
	for rows.Next() {
		var c Change
		var deleted int
		if err := rows.Scan(&c.Seq, &c.Table, &c.ID, &deleted); err != nil {
			return nil, fmt.Errorf("scan change: %w", err)
		}
		c.Deleted = deleted == 1
		entries = append(entries, c)
	}
	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterate changes: %w", err)
	}
	return entries, nil
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

// loadSnapshot reads the pull representation of one row: its syncable
// columns plus updatedHLCColumn, which is not one of them. The clock is
// added here rather than by each caller because it is part of what a
// snapshot *is* — Sync-API §3 has every pulling client advance its own
// clock past it, and a snapshot without it silently disables that rule.
func (s *Store) loadSnapshot(ctx context.Context, table, id string) (map[string]any, error) {
	tx, err := s.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true})
	if err != nil {
		return nil, fmt.Errorf("begin snapshot read: %w", err)
	}
	defer tx.Rollback()
	row, err := loadRow(ctx, tx, table, id)
	if err != nil {
		return nil, err
	}
	if !row.Exists {
		return nil, nil
	}
	row.Fields[updatedHLCColumn] = string(row.HLC)
	return row.Fields, nil
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
