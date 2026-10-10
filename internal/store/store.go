// Package store is the only package that touches SQLite. It persists
// merge results from internal/sync and serves the pull protocol from the
// change_log (Sync-API Spec §4/§5).
package store

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"time"

	"jitpack/internal/sync"

	_ "modernc.org/sqlite" // pure-Go driver per ADR-001; D-001 resolved
)

// Store owns the SQLite handle. SQLite has a single writer; capping the
// pool at one connection makes that explicit and keeps :memory: databases
// on a single connection in tests.
type Store struct {
	db *sql.DB
	// now is the store's one clock. Every timestamp column and the HLC's
	// wall component read it, so a test can make the whole store's notion
	// of time a value it chose rather than whatever the run happened to
	// take. Never nil: Open substitutes real UTC time.
	now Now
	// hlc stamps change_log entries the server originates itself — facts
	// with no client mutation behind them, currently the item_images
	// upload hint (FR-22). A random per-process device id is fine: the
	// physical-ms component keeps HLCs increasing across restarts, and the
	// device id only breaks ties within the same millisecond and counter.
	hlc *sync.Generator
}

// Now reports the current instant. It is the seam every timestamp in this
// package goes through.
type Now func() time.Time

// Options configures a store beyond its DSN.
type Options struct {
	// Now overrides the clock. Nil means real UTC time, which is what
	// production passes — the field exists so a test can assert an exact
	// timestamp instead of asserting that one is non-empty.
	Now Now
}

// storeClock adapts the store's clock to the HLC generator's, so the
// hybrid clock and the RFC3339 columns cannot disagree about when now is.
type storeClock struct{ now Now }

func (c storeClock) NowMillis() int64 { return c.now().UnixMilli() }

// How this package writes an instant. Two formats, because two already
// exist in every database: the Go-side columns were written with RFC3339
// at second precision, and three columns were written by SQLite's
// strftime('%Y-%m-%dT%H:%M:%fZ') at millisecond precision. Folding the
// second group to whole seconds would make ties out of instants that are
// not tied — read_at, refreshed_at and deactivated_at order rows.
const (
	timestampSeconds = time.RFC3339
	timestampMillis  = "2006-01-02T15:04:05.000Z"
)

// nowRFC3339 is the instant most columns record.
func (s *Store) nowRFC3339() string { return s.now().UTC().Format(timestampSeconds) }

// nowMillis is the instant the three strftime-written columns record.
func (s *Store) nowMillis() string { return s.now().UTC().Format(timestampMillis) }

// Open connects, enforces foreign keys, and brings the database to the
// current schema: an empty file gets schema.sql applied, an up-to-date one is
// used as it is, and anything else is refused.
func Open(dsn string) (*Store, error) { return OpenWith(dsn, Options{}) }

// OpenWith is Open with the options spelled out.
func OpenWith(dsn string, opts Options) (*Store, error) {
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
	now := opts.Now
	if now == nil {
		now = time.Now
	}
	gen, err := sync.NewGenerator(storeClock{now}, randomID()[:8])
	if err != nil {
		return nil, fmt.Errorf("server hlc generator: %w", err)
	}
	return &Store{db: db, hlc: gen, now: now}, nil
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

// ApplyMutation resolves one trip-partition mutation transactionally:
// idempotency memo, merge per NFR-4.2a, persistence, conflict_log,
// change_log.
func (s *Store) ApplyMutation(ctx context.Context, tripID, userID string, m sync.Mutation) (MutationResult, error) {
	return s.applyMutation(ctx, m, tripPartition(tripID, userID))
}
