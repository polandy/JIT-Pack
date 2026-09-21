package store

import (
	"database/sql"
	"fmt"
	"path/filepath"
	"reflect"
	"regexp"
	"sort"
	"strings"
	"testing"
)

/*
ADR-067's gate: the two ways to reach this schema must end at the same
database. `schema.sql` builds a fresh one; the baseline plus the chain builds
an existing one. If they ever drift, one half of the userbase gets a database
the code was not written against — and nothing else in the build would notice,
because each half is internally consistent.

This is a test rather than a shell script on purpose: it needs the same SQLite
the product uses (`modernc.org/sqlite`, CGO-free), it runs inside `make test`
and the CI `go` job without new wiring, and the comparison is the assertion
rather than a diff of two dumps.
*/
func TestSchemaChain_EndsWhereSchemaSQLDoes(t *testing.T) {
	fresh := shapeOf(t, buildFresh(t))
	chained := shapeOf(t, buildFromChain(t))

	if diff := compareShapes(fresh, chained); diff != "" {
		t.Fatalf("schema.sql and the migration chain disagree:\n%s", diff)
	}
}

/*
The gate's own mutation proof. A comparison that cannot fail is not a gate,
and this one has three ways to be vacuous — it could ignore a missing column,
a changed type, or a foreign key that only one side has. So a chain is built
that is deliberately wrong in each of those ways, and the comparison has to
report each one.
*/
func TestSchemaChain_TheComparisonCatchesDrift(t *testing.T) {
	for _, tc := range []struct {
		name  string
		extra string
		want  string
	}{
		{
			name:  "a column the chain forgot",
			extra: `ALTER TABLE trips DROP COLUMN packing_closed_at;`,
			want:  "packing_closed_at",
		},
		{
			name:  "a column the chain gave the wrong type",
			extra: `ALTER TABLE items DROP COLUMN merged_into_id; ALTER TABLE items ADD COLUMN merged_into_id INTEGER;`,
			want:  "merged_into_id",
		},
		{
			name:  "a table only one side has",
			extra: `CREATE TABLE stowaway (id TEXT PRIMARY KEY);`,
			want:  "stowaway",
		},
	} {
		t.Run(tc.name, func(t *testing.T) {
			db := replayChain(t)
			mustExecDB(t, db, tc.extra)

			diff := compareShapes(shapeOf(t, buildFresh(t)), shapeOf(t, db))
			if diff == "" {
				t.Fatal("the comparison reported agreement over a database that differs")
			}
			if !strings.Contains(diff, tc.want) {
				t.Errorf("diff does not name %q:\n%s", tc.want, diff)
			}
		})
	}
}

// Column *order* is deliberately not compared: `ALTER TABLE ADD COLUMN`
// appends, while schema.sql declares in place, so the two orders differ by
// construction — and in the live database the hand-added columns sit behind
// `updated_hlc` for the same reason (ADR-067 driver 4).
func TestSchemaChain_ColumnOrderIsNotAComparisonCriterion(t *testing.T) {
	fresh := shapeOf(t, buildFresh(t))
	chained := shapeOf(t, buildFromChain(t))

	order := func(cols map[string]column) []string {
		out := make([]string, 0, len(cols))
		for name := range cols {
			out = append(out, name)
		}
		sort.Strings(out)
		return out
	}
	// The shapes agree (the test above), and the *raw* orders differ — which
	// is what makes the agreement a decision rather than a coincidence.
	if !reflect.DeepEqual(order(fresh["items"].columns), order(chained["items"].columns)) {
		t.Fatal("the fixture no longer exercises the case: the two orders match")
	}
	if positionOf(t, buildFresh(t), "items", "merged_into_id") == positionOf(t, buildFromChain(t), "items", "merged_into_id") {
		t.Skip("v0.16.0 already declared the column last; the case cannot be exercised here")
	}
}

// --- the shape a database has ----------------------------------------------

type column struct {
	dataType string
	notNull  bool
	dflt     string
	pk       int
}

type table struct {
	columns map[string]column
	fks     []string
	checks  []string
	indexes []string
}

func shapeOf(t *testing.T, db *sql.DB) map[string]table {
	t.Helper()
	out := map[string]table{}
	names := queryStrings(t, db,
		`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	for _, name := range names {
		out[name] = table{
			columns: columnsOf(t, db, name),
			fks:     foreignKeysOf(t, db, name),
			checks:  checksOf(t, db, name),
			indexes: indexesOf(t, db, name),
		}
	}
	return out
}

func columnsOf(t *testing.T, db *sql.DB, name string) map[string]column {
	t.Helper()
	rows, err := db.Query(`SELECT name, type, "notnull", ifnull(dflt_value, ''), pk FROM pragma_table_info(?)`, name)
	if err != nil {
		t.Fatalf("table_info(%s): %v", name, err)
	}
	defer rows.Close()
	cols := map[string]column{}
	for rows.Next() {
		var col string
		var c column
		if err := rows.Scan(&col, &c.dataType, &c.notNull, &c.dflt, &c.pk); err != nil {
			t.Fatalf("scan table_info(%s): %v", name, err)
		}
		cols[col] = c
	}
	return cols
}

func foreignKeysOf(t *testing.T, db *sql.DB, name string) []string {
	t.Helper()
	rows, err := db.Query(
		`SELECT "table", "from", "to", on_update, on_delete FROM pragma_foreign_key_list(?)`, name)
	if err != nil {
		t.Fatalf("foreign_key_list(%s): %v", name, err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var target, from, to, onUpdate, onDelete string
		if err := rows.Scan(&target, &from, &to, &onUpdate, &onDelete); err != nil {
			t.Fatalf("scan foreign_key_list(%s): %v", name, err)
		}
		out = append(out, fmt.Sprintf("%s -> %s.%s on_update=%s on_delete=%s", from, target, to, onUpdate, onDelete))
	}
	sort.Strings(out)
	return out
}

var checkClause = regexp.MustCompile(`(?is)\bCHECK\s*\(`)

// checksOf pulls the CHECK constraints out of the table's own DDL, because
// that is the only place SQLite keeps them — no pragma reports them. They are
// compared as a *set* of normalised texts: the chain's DDL arrives through
// `ALTER TABLE`, so the whitespace and the order differ from schema.sql's even
// when the constraints are identical.
func checksOf(t *testing.T, db *sql.DB, name string) []string {
	t.Helper()
	var ddl string
	if err := db.QueryRow(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, name).Scan(&ddl); err != nil {
		t.Fatalf("read ddl(%s): %v", name, err)
	}
	var out []string
	for _, loc := range checkClause.FindAllStringIndex(ddl, -1) {
		depth, end := 0, -1
		for i := loc[1] - 1; i < len(ddl); i++ {
			switch ddl[i] {
			case '(':
				depth++
			case ')':
				depth--
				if depth == 0 {
					end = i
				}
			}
			if end >= 0 {
				break
			}
		}
		if end < 0 {
			continue
		}
		out = append(out, normaliseSQL(ddl[loc[0]:end+1]))
	}
	sort.Strings(out)
	return out
}

func indexesOf(t *testing.T, db *sql.DB, name string) []string {
	t.Helper()
	rows, err := db.Query(
		`SELECT name, ifnull(sql, '') FROM sqlite_master WHERE type='index' AND tbl_name=? ORDER BY name`, name)
	if err != nil {
		t.Fatalf("indexes(%s): %v", name, err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var idx, ddl string
		if err := rows.Scan(&idx, &ddl); err != nil {
			t.Fatalf("scan indexes(%s): %v", name, err)
		}
		out = append(out, idx+": "+normaliseSQL(ddl))
	}
	sort.Strings(out)
	return out
}

var whitespace = regexp.MustCompile(`\s+`)

func normaliseSQL(s string) string {
	return strings.ToLower(whitespace.ReplaceAllString(strings.TrimSpace(s), " "))
}

// compareShapes reports every difference it finds rather than the first, so a
// drifted chain is fixed in one pass instead of one run per column.
func compareShapes(want, got map[string]table) string {
	var diff []string
	for _, name := range union(want, got) {
		w, inWant := want[name]
		g, inGot := got[name]
		switch {
		case !inWant:
			diff = append(diff, "+ table "+name+" (only after the chain)")
			continue
		case !inGot:
			diff = append(diff, "- table "+name+" (only in schema.sql)")
			continue
		}
		for _, col := range unionCols(w.columns, g.columns) {
			wc, okW := w.columns[col]
			gc, okG := g.columns[col]
			switch {
			case !okW:
				diff = append(diff, fmt.Sprintf("+ %s.%s (only after the chain)", name, col))
			case !okG:
				diff = append(diff, fmt.Sprintf("- %s.%s (only in schema.sql)", name, col))
			case wc != gc:
				diff = append(diff, fmt.Sprintf("~ %s.%s: schema.sql %+v, chain %+v", name, col, wc, gc))
			}
		}
		for _, pair := range []struct {
			what string
			w, g []string
		}{{"foreign key", w.fks, g.fks}, {"check", w.checks, g.checks}, {"index", w.indexes, g.indexes}} {
			if !reflect.DeepEqual(pair.w, pair.g) {
				diff = append(diff, fmt.Sprintf("~ %s %ss: schema.sql %v, chain %v", name, pair.what, pair.w, pair.g))
			}
		}
	}
	sort.Strings(diff)
	return strings.Join(diff, "\n")
}

func union(a, b map[string]table) []string {
	seen := map[string]bool{}
	for k := range a {
		seen[k] = true
	}
	for k := range b {
		seen[k] = true
	}
	return sortedKeys(seen)
}

func unionCols(a, b map[string]column) []string {
	seen := map[string]bool{}
	for k := range a {
		seen[k] = true
	}
	for k := range b {
		seen[k] = true
	}
	return sortedKeys(seen)
}

func sortedKeys(m map[string]bool) []string {
	out := make([]string, 0, len(m))
	for k := range m {
		out = append(out, k)
	}
	sort.Strings(out)
	return out
}

// --- the two ways to build one ---------------------------------------------

func buildFresh(t *testing.T) *sql.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "fresh.db")
	s, err := Open(dsn)
	if err != nil {
		t.Fatalf("open a fresh database: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s.db
}

// buildFromChain is the *upgrade path as it runs*: a v0.16.0 file, opened by
// this build. That is deliberately the loader and not a replay of the SQL
// files — the loader is what an operator's database meets, and it does two
// things the files do not (placing the baseline, creating schema_meta). A
// replay would have proven the files agree while the path still diverged.
func buildFromChain(t *testing.T) *sql.DB {
	t.Helper()
	dsn := filepath.Join(t.TempDir(), "upgraded.db")
	seed := seedBaselineDatabase(t, dsn)
	if err := seed.Close(); err != nil {
		t.Fatalf("close seed: %v", err)
	}
	s, err := Open(dsn)
	if err != nil {
		t.Fatalf("open a v0.16.0 database: %v", err)
	}
	t.Cleanup(func() { s.Close() })
	return s.db
}

// replayChain is the files alone, for the one test that has to *break* them.
func replayChain(t *testing.T) *sql.DB {
	t.Helper()
	db := openMemory(t)
	mustExecDB(t, db, baselineSchemaSQL(t))
	mustExecDB(t, db, `CREATE TABLE schema_meta (
		id INTEGER PRIMARY KEY CHECK (id = 1), level INTEGER NOT NULL, baseline TEXT NOT NULL)`)
	for _, step := range migrationChain {
		mustExecDB(t, db, step.ddl)
	}
	return db
}

func openMemory(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("sqlite", withForeignKeys(":memory:"))
	if err != nil {
		t.Fatalf("open memory: %v", err)
	}
	db.SetMaxOpenConns(1)
	t.Cleanup(func() { _ = db.Close() })
	return db
}

func queryStrings(t *testing.T, db *sql.DB, q string) []string {
	t.Helper()
	rows, err := db.Query(q)
	if err != nil {
		t.Fatalf("query: %v", err)
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			t.Fatalf("scan: %v", err)
		}
		out = append(out, s)
	}
	return out
}

func positionOf(t *testing.T, db *sql.DB, table, col string) int {
	t.Helper()
	var cid int
	if err := db.QueryRow(`SELECT cid FROM pragma_table_info(?) WHERE name = ?`, table, col).Scan(&cid); err != nil {
		t.Fatalf("position of %s.%s: %v", table, col, err)
	}
	return cid
}
