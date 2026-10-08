package wiregen_test

import (
	"strings"
	"testing"

	"jitpack/internal/wiregen"
)

// storeConsts is the part of a store package the registry's keys and columns
// resolve against — kept in its own file, as `store.go` keeps it.
const storeConsts = `package store

const (
	TableTrips     = "trips"
	TableTripItems = "trip_items"
	MarkColumn     = "icon"
)
`

// storeRegistry is a two-table `tableSpecs`, master first, with one column
// named by a constant from the other file and one by a constant of its own.
const storeRegistry = `package store

const columnNote = "note"

var tableSpecs = map[string]tableSpec{
	TableTrips: {
		partition: partitionMaster,
		columns:   toSet("name", MarkColumn),
	},
	TableTripItems: {
		partition: partitionTrip,
		columns: toSet(
			"trip_id",
			"state",
			columnNote,
		),
	},
}
`

// schemaSQL declares both tables, and a third no push may touch, with the
// shapes schema.sql really uses: comments between columns, a definition over
// two lines, table constraints, and CHECK lists of text and of numbers.
const schemaSQL = `-- header comment
CREATE TABLE users (
    id    TEXT PRIMARY KEY,
    kind  TEXT NOT NULL CHECK (kind IN ('person','robot'))
);

CREATE TABLE trips (                  -- FR-2.1
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    icon       TEXT,                   -- the mark, (FR-28.1)
    status     TEXT NOT NULL DEFAULT 'planning'
               CHECK (status IN ('planning','active')),
    imported   INTEGER NOT NULL DEFAULT 0 CHECK (imported IN (0,1)),
    created_at TEXT NOT NULL
);

CREATE TABLE trip_items (
    id       TEXT PRIMARY KEY,
    -- a comment, (with a comma), between two columns
    trip_id  TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
    state    TEXT NOT NULL DEFAULT 'open'
             CHECK (state IN ('open', 'packed')),
    tag      TEXT CHECK (tag IS NULL OR tag IN ('a','b')),
    note     TEXT,
    UNIQUE (trip_id, note),
    FOREIGN KEY (trip_id) REFERENCES trips(id),
    CHECK (state <> 'packed' OR note IS NOT NULL)
);
`

func generateTables(t *testing.T, registry, schema string) string {
	t.Helper()
	out, err := wiregen.GenerateTables(
		map[string][]byte{"store.go": []byte(storeConsts), "tables.go": []byte(registry)},
		[]byte(schema))
	if err != nil {
		t.Fatalf("GenerateTables: %v", err)
	}
	return out
}

func wantContains(t *testing.T, out string, wants ...string) {
	t.Helper()
	for _, want := range wants {
		if !strings.Contains(out, want) {
			t.Errorf("want %q in the output, got:\n%s", want, out)
		}
	}
}

// The names are the registry's, in its order, keyed the way the client
// spells a table in code — so `TABLE.tripItems` stays what it was.
func TestGenerateTables_NamesEveryRegisteredTableOnce(t *testing.T) {
	out := generateTables(t, storeRegistry, schemaSQL)

	wantContains(t, out,
		"export const TABLE = {\n  trips: 'trips',\n  tripItems: 'trip_items',\n} as const",
		"export type SyncTable = (typeof TABLE)[keyof typeof TABLE]")
	if strings.Contains(out, "users") {
		t.Errorf("a table the registry does not declare travels no feed, got:\n%s", out)
	}
}

func TestGenerateTables_EachTableNamesItsFeed(t *testing.T) {
	out := generateTables(t, storeRegistry, schemaSQL)

	wantContains(t, out, "export const TABLE_PARTITION = {\n  trips: 'master',\n  trip_items: 'trip',\n} as const")
}

// Every column the table has, as the schema declares it and in its order —
// the comments, the second line of a definition and the table constraints
// are not columns.
func TestGenerateTables_ColumnsAreTheSchemasInItsOrder(t *testing.T) {
	out := generateTables(t, storeRegistry, schemaSQL)

	wantContains(t, out,
		"  trips: ['id', 'name', 'icon', 'status', 'imported', 'created_at'],",
		"  trip_items: ['id', 'trip_id', 'state', 'tag', 'note'],",
		"export type ColumnOf<T extends SyncTable> = (typeof TABLE_COLUMNS)[T][number]")
}

// What a push may set is the registry's whitelist, constants resolved across
// the package's files, in the schema's order rather than the call's.
func TestGenerateTables_PushableColumnsAreTheWhitelist(t *testing.T) {
	out := generateTables(t, storeRegistry, schemaSQL)

	wantContains(t, out,
		"export const PUSHABLE_COLUMNS = {\n  trips: ['name', 'icon'],\n  trip_items: ['trip_id', 'state', 'note'],\n} as const",
		"export type PushableColumnOf<T extends SyncTable> = (typeof PUSHABLE_COLUMNS)[T][number]")
}

// A text column closed by `CHECK … IN` is a vocabulary; a 0/1 flag is a
// boolean, and a table no feed carries is none of the client's business.
func TestGenerateTables_TextCheckListsBecomeEnums(t *testing.T) {
	out := generateTables(t, storeRegistry, schemaSQL)

	wantContains(t, out,
		"export const COLUMN_ENUMS = {\n  trips: {\n    status: ['planning', 'active'],\n  },\n"+
			"  trip_items: {\n    state: ['open', 'packed'],\n    tag: ['a', 'b'],\n  },\n} as const",
		"export type ColumnEnum<")
	if strings.Contains(out, "imported:") || strings.Contains(out, "robot") {
		t.Errorf("a flag or an unsynced table leaked into the enums:\n%s", out)
	}
}

func TestGenerateTables_HeaderNamesBothSourcesAndForbidsEditing(t *testing.T) {
	out := generateTables(t, storeRegistry, schemaSQL)

	wantContains(t, out, "internal/store/tables.go", "internal/store/schema.sql", "Do not edit")
	if !strings.HasSuffix(out, "\n") || strings.HasSuffix(out, "\n\n") {
		t.Errorf("want exactly one trailing newline, got %q", out[len(out)-10:])
	}
}

// An array that does not fit beside its key breaks one value to a line,
// as prettier would — or `make fmt` rewrites the file and the gate fails.
func TestGenerateTables_LongColumnListWrapsTheWayPrettierWould(t *testing.T) {
	schema := strings.Replace(schemaSQL, "    note     TEXT,\n",
		"    note     TEXT,\n    a_rather_long_column_name TEXT,\n    another_rather_long_column_name TEXT,\n", 1)
	out := generateTables(t, storeRegistry, schema)

	wantContains(t, out, "  trip_items: [\n    'id',\n    'trip_id',\n")
	for _, line := range strings.Split(out, "\n") {
		if len(line) > 100 && !strings.HasPrefix(line, " *") {
			t.Errorf("line exceeds the print width: %q", line)
		}
	}
}

// Each refusal is a drift the generator is the first to see; writing a file
// anyway would hand the client a contract the server does not keep.
func TestGenerateTables_RefusesWhatItCannotStateTruthfully(t *testing.T) {
	tests := []struct {
		name     string
		registry string
		schema   string
		want     string
	}{
		{
			"a whitelisted column the schema does not have",
			strings.Replace(storeRegistry, `"name", MarkColumn`, `"name", "series_name"`, 1),
			schemaSQL,
			"series_name",
		},
		{
			"a registered table the schema does not create",
			storeRegistry,
			strings.Replace(schemaSQL, "CREATE TABLE trip_items (", "CREATE TABLE trip_lines (", 1),
			"trip_items",
		},
		{
			"a column named by a constant it cannot resolve",
			strings.Replace(storeRegistry, "columnNote,", "columnElsewhere,", 1),
			schemaSQL,
			"columnElsewhere",
		},
		{
			"a partition it does not know",
			strings.Replace(storeRegistry, "partitionTrip", "partitionDevice", 1),
			schemaSQL,
			"partitionDevice",
		},
		{
			"a column list built some other way",
			strings.Replace(storeRegistry, `toSet("name", MarkColumn)`, `tripColumns()`, 1),
			schemaSQL,
			"toSet",
		},
		{
			"no registry at all",
			"package store\n",
			schemaSQL,
			"tableSpecs",
		},
		{
			"a text vocabulary in a CHECK it cannot read",
			storeRegistry,
			strings.Replace(schemaSQL, "CHECK (state IN ('open', 'packed'))",
				"CHECK (lower(state) IN ('open', 'packed'))", 1),
			"state",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := wiregen.GenerateTables(
				map[string][]byte{"store.go": []byte(storeConsts), "tables.go": []byte(tc.registry)},
				[]byte(tc.schema))
			if err == nil {
				t.Fatal("want a refusal, got none")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("the refusal must name %q, got %v", tc.want, err)
			}
		})
	}
}

func TestGenerateTables_SyntaxErrorIsReported(t *testing.T) {
	_, err := wiregen.GenerateTables(map[string][]byte{"tables.go": []byte("package store\nvar x = {")}, nil)
	if err == nil || !strings.Contains(err.Error(), "tables.go") {
		t.Errorf("want a parse error naming the file, got %v", err)
	}
}
