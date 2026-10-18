// migrate.go brings a database to the current schema level (ADR-067): the
// additive chain embedded below, and schema.sql's own bootstrap and
// fingerprint for a database the chain has to place before it can be
// carried forward.

package store

import (
	"crypto/sha256"
	"database/sql"
	"embed"
	"encoding/binary"
	"errors"
	"fmt"
	"log/slog"
	"sort"
	"strconv"
	"strings"
)

//go:embed schema.sql
var schemaSQL string

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

// baselineFingerprint is the `PRAGMA user_version` a v0.15.0 **or** v0.16.0
// database carries: the two releases ship a byte-identical schema.sql, so they
// fingerprint the same and the chain starts from either. v0.14.0 hashes
// differently (1094229030) and is outside the chain.
//
// Deliberately not recomputed at run time. The value has to keep meaning „the
// schema those two releases shipped" for as long as any database still stands
// on it, and a computation would follow whatever the hash function does next —
// the bridge would break silently, on the one database nobody can rebuild.
// `TestBaselineFingerprint_MatchesTheSharedV015AndV016Schema` proves the
// literal against the fixture.
const baselineFingerprint int64 = 620367602

// baselineLevels maps a *released* schema's fingerprint to the level a
// database built from it stands at. It is a list that grows, not a rule that
// derives: a fingerprint is a hash, and nothing about it says which release
// it belonged to. Everything not in here is refused (ErrSchemaStale).
var baselineLevels = map[int64]struct {
	level int
	tag   string
}{
	// The *oldest* release carrying this schema, because that is the line an
	// operator needs: everything from here on is carried forward. v0.16.0
	// shares it and is covered by the same entry.
	baselineFingerprint: {level: 0, tag: "v0.15.0"},
}

// lastMigrationEraLevel is the highest `user_version` the *old* migration era
// left behind: that chain ran 001_schema.sql … 023_planning_refresh.sql before
// ADR-018 deleted it (counted off the deleted files in git, not off the
// backlog, which names only the last two that were open at the time).
//
// It exists so those values are refused rather than read as levels of *this*
// chain. That is also why the level of a current database lives in
// `schema_meta` and not in `user_version` (ADR-067): a
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
func schemaFingerprint() int64 { return fingerprintOf(schemaSQL) }

// fingerprintOf is schemaFingerprint over any DDL, so a *released* schema can
// be fingerprinted from its fixture — which is how the bridge's literal is
// proven (ADR-067).
func fingerprintOf(ddl string) int64 {
	sum := sha256.Sum256([]byte(ddl))
	fp := int64(binary.BigEndian.Uint32(sum[:4]) & maxUserVersion)
	if fp == 0 {
		return 1
	}
	return fp
}

// ensureSchema brings the database to the current schema level (ADR-067):
// an empty file gets schema.sql, an existing one gets the migrations it is
// missing, and one this build cannot place is refused rather than guessed at.
//
// Three kinds of database arrive here, and the order below is the order in
// which they can be told apart:
//
//  1. **Chain era** — it has `schema_meta` and says its level. Behind the
//     current level it is carried forward; ahead of it, it was written by a
//     newer build and is refused, because migrations only go forward.
//  2. **Empty** — nothing in it yet, so schema.sql applies whole.
//  3. **Before the chain** — no `schema_meta`, and `user_version` holds
//     either a release fingerprint (bridged, see baselineLevels) or something
//     this build cannot name: a migration-era level, a fingerprint from a
//     schema that was never released, or a hand-stamped value. Refused, with
//     the file left exactly as it was.
func ensureSchema(db *sql.DB, dsn string) error {
	if migrationChainErr != nil {
		return fmt.Errorf("migration chain: %w", migrationChainErr)
	}
	level, known, err := readSchemaLevel(db)
	if err != nil {
		return err
	}
	if !known {
		level, err = placeDatabase(db, dsn)
		if err != nil {
			return err
		}
	}
	switch {
	case level == currentSchemaLevel():
		return nil
	case level > currentSchemaLevel():
		return fmt.Errorf("%w: %s stands at schema level %d and this build knows %d\n"+
			"\tit was written by a newer JIT-Pack; migrations only go forward\n"+
			"\tto use it:       run the newer version\n"+
			"\tto discard it:   rm %s   and restart",
			ErrSchemaStale, dsn, level, currentSchemaLevel(), dsn)
	}
	return applyMigrations(db, migrationChain[level:])
}

// placeDatabase decides what a database without `schema_meta` is, and leaves
// it stamped with the level it turns out to stand at.
func placeDatabase(db *sql.DB, dsn string) (int, error) {
	var tables int
	if err := db.QueryRow(
		`SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).Scan(&tables); err != nil {
		return 0, fmt.Errorf("inspect database: %w", err)
	}
	if tables == 0 {
		return currentSchemaLevel(), applySchema(db, schemaSQL, currentSchemaLevel())
	}

	var version int64
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&version); err != nil {
		return 0, fmt.Errorf("read user_version: %w", err)
	}
	// Before anything is looked up: a value the *old* migration era could have
	// written is refused outright. It has to be a rule and not a consequence —
	// a fingerprint is a 31-bit hash and may legitimately be small, so a future
	// baseline could otherwise land on a number that also means „migration-era
	// level 5" and bridge a database that is twenty-three steps behind.
	if version > 0 && version <= lastMigrationEraLevel {
		return 0, fmt.Errorf("%w: %s stands at migration level %d, from the chain ADR-018 deleted\n"+
			"\tthat era ended before %s, the oldest release this build carries forward\n"+
			"\tto keep it:      run the JIT-Pack version that wrote it, export under Settings -> Data, then upgrade and import\n"+
			"\tto discard it:   rm %s   and restart",
			ErrSchemaStale, dsn, version, oldestBaselineTag(), dsn)
	}
	baseline, ok := baselineLevels[version]
	if !ok {
		// The reader is either a developer whose scratch database is worth
		// nothing or an operator whose database is worth everything, and the
		// error cannot tell which — so it names both ways out and takes
		// neither. A value at or below lastMigrationEraLevel is one of the
		// deleted chain's levels, which is why it is not read as one of this
		// chain's.
		return 0, fmt.Errorf("%w: %s was built from a schema this build cannot place\n"+
			"\tit predates %s, the oldest release this build carries forward\n"+
			"\tto keep it:      run the JIT-Pack version that wrote it, export under Settings -> Data, then upgrade and import\n"+
			"\tto discard it:   rm %s   and restart",
			ErrSchemaStale, dsn, oldestBaselineTag(), dsn)
	}
	if err := stampBaseline(db, baseline.level, baseline.tag); err != nil {
		return 0, err
	}
	return baseline.level, nil
}

// oldestBaselineTag names the earliest release the chain can start from, for
// the one error message that has to tell an operator where the line is.
func oldestBaselineTag() string {
	oldest := ""
	lowest := 0
	for _, b := range baselineLevels {
		if oldest == "" || b.level < lowest {
			oldest, lowest = b.tag, b.level
		}
	}
	return oldest
}

// stampBaseline records that a pre-chain database has been placed, so the
// next start reads a level instead of matching a fingerprint again.
func stampBaseline(db *sql.DB, level int, tag string) error {
	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("begin baseline stamp: %w", err)
	}
	defer func() {
		if err := tx.Rollback(); err != nil && !errors.Is(err, sql.ErrTxDone) {
			slog.Error("rolling back baseline stamp", "error", err)
		}
	}()
	if _, err := tx.Exec(`CREATE TABLE IF NOT EXISTS schema_meta (
		id       INTEGER PRIMARY KEY CHECK (id = 1),
		level    INTEGER NOT NULL,
		baseline TEXT NOT NULL
	)`); err != nil {
		return fmt.Errorf("create schema_meta: %w", err)
	}
	if err := stampLevel(tx, level, tag); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit baseline stamp: %w", err)
	}
	return nil
}

// applySchema installs ddl and stamps the level it represents in the same
// transaction, so a database can never be left carrying half of one.
//
// The DDL is a parameter rather than the package's embedded schema so the
// failure path — a statement that does not apply — can be driven directly
// instead of only through a deliberately broken build.
func applySchema(db *sql.DB, ddl string, level int) error {
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
	// A fresh database is at the end of the chain by construction: schema.sql
	// *is* every migration already applied. `baseline` says so, rather than
	// naming a release it never passed through.
	if err := stampLevel(tx, level, "schema.sql"); err != nil {
		return err
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit schema: %w", err)
	}
	return nil
}
