package store

import (
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// The six columns migration 001 adds, as the tables they belong to. Written
// out rather than derived from the file, so a migration that quietly stops
// adding one of them fails here instead of passing against itself.
var columnsSinceBaseline = map[string][]string{
	"items":          {"merged_into_id"},
	"template_tasks": {"phase"},
	"trips":          {"packing_closed_at"},
	"comments":       {"phase", "resolved_at", "resolved_by_user_id"},
}

/*
ADR-067: an existing database is carried forward instead of refused. The
bridge is the one step that makes today's instance eligible at all — it
stands on the v0.16.0 fingerprint, which predates the chain and therefore
has no level of its own.
*/
func TestOpen_BridgesAV0160DatabaseAndAppliesTheChain(t *testing.T) {
	dsn := filepath.Join(t.TempDir(), "jitpack.db")
	seedBaselineDatabase(t, dsn)

	s, err := Open(dsn)
	if err != nil {
		t.Fatalf("Open must carry a v0.16.0 database forward, not refuse it: %v", err)
	}
	defer s.Close()

	for table, cols := range columnsSinceBaseline {
		have := columns(t, s.db, table)
		for _, col := range cols {
			if !have[col] {
				t.Errorf("%s.%s missing after the chain ran", table, col)
			}
		}
	}
	if got := levelOf(t, s.db); got != currentSchemaLevel() {
		t.Errorf("level = %d, want %d", got, currentSchemaLevel())
	}
}

// The rows are what the upgrade is *for*: a chain that empties the database
// satisfies every structural check and loses everything anyway.
func TestOpen_TheBridgeKeepsTheRowsItFound(t *testing.T) {
	dsn := filepath.Join(t.TempDir(), "jitpack.db")
	db := seedBaselineDatabase(t, dsn)
	mustExec(t, &Store{db: db}, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('u1', 'auth|a', 'Andy')`)
	mustExec(t, &Store{db: db}, `INSERT INTO items (id, name) VALUES ('i1', 'Zelt')`)
	if err := db.Close(); err != nil {
		t.Fatalf("close seed: %v", err)
	}

	s, err := Open(dsn)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()

	var name string
	if err := s.db.QueryRow(`SELECT name FROM items WHERE id = 'i1'`).Scan(&name); err != nil {
		t.Fatalf("the row the upgrade exists for is gone: %v", err)
	}
	if name != "Zelt" {
		t.Errorf("name = %q, want Zelt", name)
	}
}

// A database already at the current level is left exactly as it is: no
// migration re-runs, and `ALTER TABLE` would fail if one did.
func TestOpen_ADatabaseAtTheCurrentLevelIsUntouched(t *testing.T) {
	dsn := filepath.Join(t.TempDir(), "jitpack.db")
	first, err := Open(dsn)
	if err != nil {
		t.Fatalf("first Open: %v", err)
	}
	mustExec(t, first, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('u1', 'auth|a', 'Andy')`)
	if err := first.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	second, err := Open(dsn)
	if err != nil {
		t.Fatalf("second Open must be a no-op, not a re-run: %v", err)
	}
	defer second.Close()
	var n int
	if err := second.db.QueryRow(`SELECT count(*) FROM users`).Scan(&n); err != nil || n != 1 {
		t.Errorf("users = %d (err %v), want the row the first open wrote", n, err)
	}
}

/*
The two refusals, which is where the whole design earns its keep: a value
that is not a level and not a known baseline is never guessed at.

	1 and 23 are migration-era levels (001_schema.sql … 023_planning_refresh.sql,
	counted off the deleted files in git). 24 is the first value above them
	that can only be a fingerprint — and an unknown one is still refused.
*/
func TestOpen_RefusesWhatItCannotPlace(t *testing.T) {
	for _, tc := range []struct {
		name    string
		version int64
		says    []string
	}{
		{"the first migration-era level", 1, []string{"migration level 1", "v0.15.0", "export", "rm "}},
		{"the last migration-era level", 23, []string{"migration level 23", "v0.15.0", "export", "rm "}},
		{"the first value above them, an unknown fingerprint", 24, []string{"cannot place", "v0.15.0"}},
		{"a fingerprint from a schema this build never had", 1234567, []string{"cannot place", "v0.15.0"}},
	} {
		t.Run(tc.name, func(t *testing.T) {
			dsn := filepath.Join(t.TempDir(), "jitpack.db")
			db := seedBaselineDatabase(t, dsn)
			mustExecDB(t, db, `PRAGMA user_version = `+itoa(tc.version))
			mustExecDB(t, db, `DROP TABLE IF EXISTS schema_meta`)
			if err := db.Close(); err != nil {
				t.Fatalf("close seed: %v", err)
			}

			_, err := Open(dsn)
			if !errors.Is(err, ErrSchemaStale) {
				t.Fatalf("Open err = %v, want ErrSchemaStale — an unplaceable database is refused, never guessed", err)
			}
			// The message is the only thing an operator gets, so it is part of
			// the contract rather than a courtesy: it has to say which case
			// this is and leave both ways out. Without this assert the whole
			// migration-era branch could be deleted and every test stay green.
			for _, want := range tc.says {
				if !strings.Contains(err.Error(), want) {
					t.Errorf("the refusal does not say %q:\n%s", want, err)
				}
			}
		})
	}
}

// A database written by a *newer* build knows a level this one does not.
// Refused rather than downgraded: migrations only go forward.
func TestOpen_RefusesADatabaseFromTheFuture(t *testing.T) {
	dsn := filepath.Join(t.TempDir(), "jitpack.db")
	s, err := Open(dsn)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	mustExec(t, s, `UPDATE schema_meta SET level = level + 5`)
	if err := s.Close(); err != nil {
		t.Fatalf("close: %v", err)
	}

	if _, err := Open(dsn); !errors.Is(err, ErrSchemaStale) {
		t.Errorf("Open err = %v, want ErrSchemaStale for a level this build does not have", err)
	}
}

/*
A step that fails leaves the database on the level it had. Without the
transaction the file would carry half a migration and claim the whole of it —
and the next start would apply the same step again, on top of itself.
*/
func TestApplyMigrations_AFailingStepLeavesTheLevelAlone(t *testing.T) {
	dsn := filepath.Join(t.TempDir(), "jitpack.db")
	s, err := Open(dsn)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	defer s.Close()
	before := levelOf(t, s.db)

	broken := []migration{{level: before + 1, name: "999_broken.sql", ddl: "ALTER TABLE items ADD COLUMN ok TEXT;\nTHIS IS NOT SQL;"}}
	if err := applyMigrations(s.db, broken); err == nil {
		t.Fatal("applyMigrations reported success for a step that cannot run")
	}

	if got := levelOf(t, s.db); got != before {
		t.Errorf("level = %d after a failed step, want %d", got, before)
	}
	if columns(t, s.db, "items")["ok"] {
		t.Error("the half-applied column survived — the step was not one transaction")
	}
}

// The chain is read in order and numbered from its file names; a gap or a
// duplicate is a build error, not a runtime surprise.
func TestMigrations_AreOrderedAndNumberedFromOne(t *testing.T) {
	list, err := loadMigrations()
	if err != nil {
		t.Fatalf("loadMigrations: %v", err)
	}
	if len(list) == 0 {
		t.Fatal("no migrations embedded — the chain cannot carry anything")
	}
	for i, m := range list {
		if m.level != i+1 {
			t.Fatalf("migration %q has level %d, want %d — the chain must be gapless", m.name, m.level, i+1)
		}
	}
}

// --- helpers ---------------------------------------------------------------

// seedBaselineDatabase builds a database exactly as v0.16.0 would have left
// it: its schema, stamped with its fingerprint, and no schema_meta.
func seedBaselineDatabase(t *testing.T, dsn string) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", withForeignKeys(dsn))
	if err != nil {
		t.Fatalf("open seed: %v", err)
	}
	db.SetMaxOpenConns(1)
	mustExecDB(t, db, baselineSchemaSQL(t))
	mustExecDB(t, db, `PRAGMA user_version = `+itoa(baselineFingerprint))
	return db
}

func levelOf(t *testing.T, db *sql.DB) int {
	t.Helper()
	var level int
	if err := db.QueryRow(`SELECT level FROM schema_meta`).Scan(&level); err != nil {
		t.Fatalf("read schema_meta: %v", err)
	}
	return level
}

// baselineSchemaSQL is v0.16.0's schema as it shipped — the fixture the
// bridge is proven against, so „a v0.16.0 database" is a real one and not a
// description of one.
func baselineSchemaSQL(t *testing.T) string {
	t.Helper()
	ddl, err := os.ReadFile(filepath.Join("testdata", "schema-v0.16.0.sql"))
	if err != nil {
		t.Fatalf("read the v0.16.0 fixture: %v", err)
	}
	return string(ddl)
}

func itoa(v int64) string { return strconv.FormatInt(v, 10) }

func mustExecDB(t *testing.T, db *sql.DB, stmt string) {
	t.Helper()
	if _, err := db.Exec(stmt); err != nil {
		t.Fatalf("exec %.40q: %v", stmt, err)
	}
}

// The guard that keeps the two vocabularies apart has to hold for baselines
// added *later*, not only for the one that exists now: a fingerprint is a
// 31-bit hash and may come out small, and a baseline of 5 would make every
// migration-era database at level 5 eligible for a bridge it must not have.
func TestBaselineLevels_CannotCollideWithTheMigrationEra(t *testing.T) {
	for fingerprint, baseline := range baselineLevels {
		if fingerprint <= lastMigrationEraLevel {
			t.Errorf("baseline %s fingerprints to %d, inside the migration era's 1…%d — "+
				"it would bridge databases that are %d steps behind",
				baseline.tag, fingerprint, lastMigrationEraLevel, lastMigrationEraLevel)
		}
	}
}
