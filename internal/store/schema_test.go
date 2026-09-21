package store

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// openRaw is a connection without any schema work, so these tests can put a
// database into a state Open is supposed to judge.
func openRaw(t *testing.T, path string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", path)
	if err != nil {
		t.Fatalf("open raw: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() {
		if err := db.Close(); err != nil {
			t.Errorf("close raw: %v", err)
		}
	})
	return db
}

func userVersion(t *testing.T, db *sql.DB) int64 {
	t.Helper()
	var v int64
	if err := db.QueryRow(`PRAGMA user_version`).Scan(&v); err != nil {
		t.Fatalf("read user_version: %v", err)
	}
	return v
}

func TestOpen_AppliesTheSchemaToAnEmptyDatabase(t *testing.T) {
	path := filepath.Join(t.TempDir(), "fresh.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("open fresh: %v", err)
	}
	defer func() {
		if err := s.Close(); err != nil {
			t.Errorf("close: %v", err)
		}
	}()

	// One table from each partition, so a schema that applied only its first
	// statement cannot pass.
	for _, table := range []string{TableItems, TableTrips, TableTripItems, TableTravelers} {
		var name string
		err := s.db.QueryRow(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, table).Scan(&name)
		if err != nil {
			t.Fatalf("table %s missing after Open: %v", table, err)
		}
	}
}

// Since ADR-067 a fresh database is stamped with the *level* it stands at —
// the end of the chain, because schema.sql is every migration already applied
// — and `user_version` carries it as the readable mirror.
func TestOpen_StampsTheSchemaLevelAndMirrorsIt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "fresh.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("open fresh: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	db := openRaw(t, path)
	var level int
	var baseline string
	if err := db.QueryRow(`SELECT level, baseline FROM schema_meta WHERE id = 1`).Scan(&level, &baseline); err != nil {
		t.Fatalf("read schema_meta: %v", err)
	}
	if level != currentSchemaLevel() {
		t.Errorf("level = %d, want %d", level, currentSchemaLevel())
	}
	if baseline != "schema.sql" {
		t.Errorf("baseline = %q — a fresh database passed through no release", baseline)
	}
	if got := userVersion(t, db); got != int64(level) {
		t.Errorf("user_version = %d, want the level %d it mirrors", got, level)
	}
}

// The literal the bridge stands on, proven against the release it names.
// Recomputing it in the loader would make it follow the hash function instead
// of the release, and the first sign would be a v0.16.0 database refused.
func TestBaselineFingerprint_MatchesTheV0160Schema(t *testing.T) {
	ddl, err := os.ReadFile(filepath.Join("testdata", "schema-v0.16.0.sql"))
	if err != nil {
		t.Fatalf("read the fixture: %v", err)
	}
	if got := fingerprintOf(string(ddl)); got != baselineFingerprint {
		t.Fatalf("v0.16.0 fingerprints to %d, the bridge expects %d — one of the two is wrong, "+
			"and the database that pays for it cannot be rebuilt", got, baselineFingerprint)
	}
}

func TestSchemaFingerprint_FitsSQLitesUserVersionAndIsNeverFresh(t *testing.T) {
	// PRAGMA user_version is a signed 32-bit integer, and 0 is the value a
	// database that has never been stamped already carries — a fingerprint
	// landing on either would make a stale database read as fresh.
	fp := schemaFingerprint()
	if fp <= 0 || fp > maxUserVersion {
		t.Fatalf("fingerprint %d does not fit PRAGMA user_version as a non-zero value", fp)
	}
}

func TestOpen_ReopeningAnUpToDateDatabaseKeepsItsRows(t *testing.T) {
	path := filepath.Join(t.TempDir(), "reopen.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("open fresh: %v", err)
	}
	if _, err := s.db.Exec(`INSERT INTO items (id, name) VALUES ('i1', 'Zelt')`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	again, err := Open(path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer func() {
		if err := again.Close(); err != nil {
			t.Errorf("close: %v", err)
		}
	}()
	var name string
	if err := again.db.QueryRow(`SELECT name FROM items WHERE id='i1'`).Scan(&name); err != nil {
		t.Fatalf("reopen lost the row: %v", err)
	}
	if name != "Zelt" {
		t.Fatalf("name = %q, want Zelt", name)
	}
}

func TestOpen_RejectsAStaleDatabaseAndSaysHowToFixIt(t *testing.T) {
	path := filepath.Join(t.TempDir(), "stale.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("open fresh: %v", err)
	}
	if err := s.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}
	// A database from before the chain — no schema_meta — carrying a
	// fingerprint this build cannot name. Since ADR-067 that is the only
	// shape that is still refused outright, and `user_version` alone is not
	// enough to condemn one: it is a mirror now, so the table has to go too.
	db := openRaw(t, path)
	if _, err := db.Exec(`DROP TABLE schema_meta`); err != nil {
		t.Fatalf("drop schema_meta: %v", err)
	}
	if _, err := db.Exec(`PRAGMA user_version = 4711`); err != nil {
		t.Fatalf("stamp stale version: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close raw: %v", err)
	}

	_, err = Open(path)
	if err == nil {
		t.Fatal("Open accepted a database stamped with a foreign fingerprint")
	}
	if !errors.Is(err, ErrSchemaStale) {
		t.Fatalf("error is not ErrSchemaStale: %v", err)
	}
	// The instruction is the point of the choice: the user is told what to
	// do, and which file to do it to.
	if !strings.Contains(err.Error(), path) {
		t.Errorf("error does not name the database file %q: %v", path, err)
	}
	if !strings.Contains(err.Error(), "rm ") {
		t.Errorf("error does not say how to recover: %v", err)
	}
}

func TestOpen_RejectsAPreFingerprintDatabaseRatherThanReapplyingTheSchema(t *testing.T) {
	// A database from a build that still had migrations carries a small
	// user_version (or 0) and real tables. Applying the schema on top would
	// fail halfway through with "table already exists"; the user deserves
	// the instruction instead.
	path := filepath.Join(t.TempDir(), "legacy.db")
	db := openRaw(t, path)
	if _, err := db.Exec(`CREATE TABLE items (id TEXT PRIMARY KEY); PRAGMA user_version = 23`); err != nil {
		t.Fatalf("build legacy db: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close raw: %v", err)
	}

	if _, err := Open(path); !errors.Is(err, ErrSchemaStale) {
		t.Fatalf("Open on a migration-era database = %v, want ErrSchemaStale", err)
	}
}

func TestOpen_RejectsAnUnstampedDatabaseThatAlreadyHasTables(t *testing.T) {
	// user_version 0 means "never stamped", which for an *empty* file means
	// fresh — but not for one that already carries tables. Distinguishing
	// the two is what stops Open from destroying a database it does not
	// understand.
	path := filepath.Join(t.TempDir(), "unstamped.db")
	db := openRaw(t, path)
	if _, err := db.Exec(`CREATE TABLE something_else (id TEXT PRIMARY KEY)`); err != nil {
		t.Fatalf("build unstamped db: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close raw: %v", err)
	}

	if _, err := Open(path); !errors.Is(err, ErrSchemaStale) {
		t.Fatalf("Open on an unstamped populated database = %v, want ErrSchemaStale", err)
	}
}

func TestOpen_AStaleDatabaseIsLeftUntouched(t *testing.T) {
	// The owner chose "error with instructions" over "recreate": nothing the
	// user might still want is allowed to disappear on start-up.
	path := filepath.Join(t.TempDir(), "keep.db")
	db := openRaw(t, path)
	if _, err := db.Exec(`CREATE TABLE precious (id TEXT PRIMARY KEY); INSERT INTO precious VALUES ('keep-me')`); err != nil {
		t.Fatalf("build db: %v", err)
	}
	if err := db.Close(); err != nil {
		t.Fatalf("close raw: %v", err)
	}

	if _, err := Open(path); !errors.Is(err, ErrSchemaStale) {
		t.Fatalf("want ErrSchemaStale, got %v", err)
	}

	again := openRaw(t, path)
	var id string
	if err := again.QueryRow(`SELECT id FROM precious`).Scan(&id); err != nil {
		t.Fatalf("Open destroyed the database it refused: %v", err)
	}
	if id != "keep-me" {
		t.Fatalf("id = %q, want keep-me", id)
	}
}

func TestSchema_IsEmbeddedAndNotEmpty(t *testing.T) {
	// The embed directive is easy to break by moving the file; without this
	// the failure surfaces as a confusing "no such table" much later.
	if len(schemaSQL) < 1000 {
		t.Fatalf("embedded schema is %d bytes, which cannot be the whole schema", len(schemaSQL))
	}
}

// Replaces `TestSchema_HasNoMigrationsDirectoryLeftBehind`, which held
// ADR-018's rule that no such directory may exist. ADR-067 reverses it: the
// chain is now how an existing database reaches this schema, and a *missing*
// chain is the defect — the directory would be silently absent from the
// binary if the embed pattern ever stopped matching.
func TestSchema_TheMigrationChainIsEmbedded(t *testing.T) {
	if migrationChainErr != nil {
		t.Fatalf("the embedded chain does not load: %v", migrationChainErr)
	}
	if len(migrationChain) == 0 {
		t.Fatal("no migrations embedded — an existing database has no way to this schema")
	}
	if _, err := os.Stat("migrations"); err != nil {
		t.Fatalf("internal/store/migrations must exist: %v", err)
	}
}

// WAL is what makes a reader concurrent with the writer, and the backup
// procedure in docs/backup.md is written against a database that has the
// -wal and -shm sidecars. It used to be set by the first migration; losing
// it with the migrations would have been silent — a database in `delete`
// mode works, just differently.
func TestOpen_UsesWriteAheadLogging(t *testing.T) {
	path := filepath.Join(t.TempDir(), "wal.db")
	s, err := Open(path)
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	defer func() {
		if err := s.Close(); err != nil {
			t.Errorf("close: %v", err)
		}
	}()

	var mode string
	if err := s.db.QueryRow(`PRAGMA journal_mode`).Scan(&mode); err != nil {
		t.Fatalf("read journal_mode: %v", err)
	}
	if !strings.EqualFold(mode, "wal") {
		t.Fatalf("journal_mode = %q, want wal", mode)
	}
}

// A schema that does not apply must leave nothing behind: half a schema
// stamped with a full fingerprint would read as up to date forever after.
func TestApplySchema_LeavesNothingBehindWhenAStatementFails(t *testing.T) {
	path := filepath.Join(t.TempDir(), "broken.db")
	db := openRaw(t, path)

	const broken = `CREATE TABLE fine (id TEXT PRIMARY KEY);
	                CREATE TABLE oops (id TEXT PRIMARY KEY, REFERENCES nowhere);`
	err := applySchema(db, broken, 999)
	if err == nil {
		t.Fatal("applySchema accepted DDL that does not parse")
	}
	if !strings.Contains(err.Error(), "apply schema") {
		t.Errorf("error does not say which step failed: %v", err)
	}

	var tables int
	if err := db.QueryRow(`SELECT count(*) FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).Scan(&tables); err != nil {
		t.Fatalf("count tables: %v", err)
	}
	if tables != 0 {
		t.Errorf("%d tables survived a failed schema install", tables)
	}
	if got := userVersion(t, db); got != 0 {
		t.Errorf("user_version = %d after a failed install, want 0 — a stamped fingerprint would claim the schema is complete", got)
	}
}
