package store

import (
	"database/sql"
	"embed"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strconv"
	"strings"
)

//go:embed migrations/*.sql
var migrationsFS embed.FS

// migration is one step of the additive chain (ADR-067): the level it takes a
// database to, the file it came from, and its DDL.
type migration struct {
	level int
	name  string
	ddl   string
}

var (
	migrationChain    []migration
	migrationChainErr error
)

func init() { migrationChain, migrationChainErr = loadMigrations() }

// loadMigrations reads the chain in file order and checks that it is gapless
// from 1. A gap or a repeat is a packaging mistake, and the honest moment to
// notice is the first Open rather than the step that lands twice.
func loadMigrations() ([]migration, error) {
	entries, err := migrationsFS.ReadDir("migrations")
	if err != nil {
		return nil, fmt.Errorf("read migrations: %w", err)
	}
	names := make([]string, 0, len(entries))
	for _, e := range entries {
		if !e.IsDir() && strings.HasSuffix(e.Name(), ".sql") {
			names = append(names, e.Name())
		}
	}
	sort.Strings(names)

	out := make([]migration, 0, len(names))
	for i, name := range names {
		digits := name
		if cut := strings.IndexByte(name, '_'); cut > 0 {
			digits = name[:cut]
		}
		level, err := strconv.Atoi(digits)
		if err != nil {
			return nil, fmt.Errorf("migration %q does not start with its level", name)
		}
		if level != i+1 {
			return nil, fmt.Errorf("migration %q is level %d where the chain is at %d", name, level, i+1)
		}
		ddl, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			return nil, fmt.Errorf("read migration %q: %w", name, err)
		}
		out = append(out, migration{level: level, name: name, ddl: string(ddl)})
	}
	return out, nil
}

// currentSchemaLevel is the level a database reaches once the whole chain has
// run — and, for a fresh one, the level schema.sql already stands at.
func currentSchemaLevel() int { return len(migrationChain) }

// baselineFingerprint is the `PRAGMA user_version` a v0.16.0 database carries:
// the fingerprint of *that* release's schema.sql, recorded here as a literal.
//
// Deliberately not recomputed at run time. The value has to keep meaning
// „v0.16.0" for as long as any database still stands on it, and a computation
// would follow whatever the hash function does next — the bridge would break
// silently, on the one database nobody can rebuild. `TestBaselineFingerprint`
// proves the literal against `testdata/schema-v0.16.0.sql`.
const baselineFingerprint int64 = 620367602

// baselineLevels maps a *released* schema's fingerprint to the level a
// database built from it stands at. It is a list that grows, not a rule that
// derives: a fingerprint is a hash, and nothing about it says which release
// it belonged to. Everything not in here is refused (ErrSchemaStale).
var baselineLevels = map[int64]struct {
	level int
	tag   string
}{
	baselineFingerprint: {level: 0, tag: "v0.16.0"},
}

// lastMigrationEraLevel is the highest `user_version` the *old* migration era
// left behind: that chain ran 001_schema.sql … 023_planning_refresh.sql before
// ADR-018 deleted it (counted off the deleted files in git, not off the
// backlog, which names only the last two that were open at the time).
//
// It exists so those values are refused rather than read as levels of *this*
// chain. That is also why the level of a current database lives in
// `schema_meta` and not in `user_version` (ADR-067 amendment, 2026-09-21): a
// hash and a counter must not share one field.
const lastMigrationEraLevel = 23

// readSchemaLevel answers what level a database stands at, and whether it
// says so at all. A database from before the chain has no schema_meta — that
// is the whole signal, and it is a table's presence rather than a number,
// which is what makes it unambiguous.
func readSchemaLevel(db *sql.DB) (level int, known bool, err error) {
	var name string
	switch err := db.QueryRow(
		`SELECT name FROM sqlite_master WHERE type='table' AND name='schema_meta'`).Scan(&name); {
	case errors.Is(err, sql.ErrNoRows):
		return 0, false, nil
	case err != nil:
		return 0, false, fmt.Errorf("look for schema_meta: %w", err)
	}
	if err := db.QueryRow(`SELECT level FROM schema_meta WHERE id = 1`).Scan(&level); err != nil {
		return 0, false, fmt.Errorf("read schema level: %w", err)
	}
	return level, true, nil
}

// stampLevel writes the level in both places it is kept: authoritatively in
// `schema_meta`, and mirrored into `PRAGMA user_version` so `sqlite3 … 'PRAGMA
// user_version'` still answers something meaningful. Nothing decides on the
// mirror.
func stampLevel(tx *sql.Tx, level int, baseline string) error {
	if _, err := tx.Exec(
		`INSERT INTO schema_meta (id, level, baseline) VALUES (1, ?, ?)
		 ON CONFLICT(id) DO UPDATE SET level = excluded.level, baseline = excluded.baseline`,
		level, baseline); err != nil {
		return fmt.Errorf("write schema_meta: %w", err)
	}
	// PRAGMA takes no bind parameters; the value is an int this package
	// computed, never anything a caller supplied.
	if _, err := tx.Exec(fmt.Sprintf(`PRAGMA user_version = %d`, level)); err != nil {
		return fmt.Errorf("mirror level into user_version: %w", err)
	}
	return nil
}

// applyMigrations runs the steps it is given, **one transaction each**.
//
// Per step rather than one for the lot: a chain that fails at step three has
// still done one and two, and re-running those on the next start would fail
// on a column that is already there. The level moves with each step, so the
// database always says exactly how far it got.
func applyMigrations(db *sql.DB, steps []migration) error {
	for _, step := range steps {
		if err := applyMigration(db, step); err != nil {
			return fmt.Errorf("migration %s: %w", step.name, err)
		}
		slog.Info("schema migrated", "level", step.level, "migration", step.name)
	}
	return nil
}

func applyMigration(db *sql.DB, step migration) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin: %w", err)
	}
	defer func() {
		if err := tx.Rollback(); err != nil && !errors.Is(err, sql.ErrTxDone) {
			slog.Error("rolling back migration", "migration", step.name, "error", err)
		}
	}()
	if _, err := tx.Exec(step.ddl); err != nil {
		return fmt.Errorf("apply: %w", err)
	}
	if err := stampLevel(tx, step.level, step.name); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit: %w", err)
	}
	return nil
}
