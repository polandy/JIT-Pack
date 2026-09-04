package store

import (
	"fmt"
	"sort"
	"testing"
)

// G-3: `blockedBy` and `cascades` restate, as Go and as SQL literals, a
// graph `schema.sql` already declares — 47 REFERENCES, 24 of them ON DELETE
// CASCADE. Nothing compared the two, and the failure that costs is silent:
// a column added with ON DELETE CASCADE and forgotten in `cascades` deletes
// the child row on the server and emits no tombstone, so every other device
// keeps a row that no longer exists. That is the failure CODING_PRINCIPLES
// §4a was written after.
//
// These tests are the comparison. They read the graph from SQLite itself —
// `PRAGMA foreign_key_list` is the schema as the database understands it,
// not as a second reader of the file understands it.

// cascadeChildrenWithoutATombstone are the tables an FK cascade deletes and
// `cascades` deliberately does not name, each with the reason. Every other
// reachable child must be listed, or a device is left holding a ghost.
var cascadeChildrenWithoutATombstone = map[string]string{
	// ADR-002 / invariant 6: the bytes never travel the sync envelope, so
	// there is no row on any device for a tombstone to remove. Only
	// items.image_hash flows, and it goes with the item.
	TableItems + " -> item_images": "item image BLOBs are outside the sync envelope",

	// The trip partition's whole feed dies with the trip: change_log.trip_id
	// cascades too, so a tombstone written here would land in a feed that no
	// longer exists and reach nobody. The client mirrors this cascade
	// optimistically instead (client/src/sync/cascade.ts); the three
	// children that *are* listed travel the master feed, which survives.
	TableTrips + " -> change_log":               "the trip's own feed is deleted with it",
	TableTrips + " -> conflict_log":             "the trip's own feed is deleted with it",
	TableTrips + " -> comments":                 "the trip's own feed is deleted with it",
	TableTrips + " -> containers":               "the trip's own feed is deleted with it",
	TableTrips + " -> lock_events":              "the trip's own feed is deleted with it",
	TableTrips + " -> travelers":                "the trip's own feed is deleted with it",
	TableTrips + " -> trip_items":               "the trip's own feed is deleted with it",
	TableTrips + " -> trip_generated_positions": "the trip's own feed is deleted with it",
}

// foreignKey is one edge of the graph as SQLite reports it.
type foreignKey struct {
	child, childColumn, parent, onDelete string
}

const onDeleteCascade = "CASCADE"

// Each restricting foreign key into a declared table is a `blockedBy` entry
// and each entry is a restricting foreign key — exactly, in both directions.
// An entry too few makes a delete fail as a driver error instead of a
// refusal the user can read; an entry too many refuses a delete the database
// would have allowed.
func TestTableSpecs_BlockedByIsExactlyTheRestrictingForeignKeys(t *testing.T) {
	declared := map[string]bool{}
	for parent, spec := range tableSpecs {
		for _, b := range spec.blockedBy {
			declared[fmt.Sprintf("%s <- %s.%s", parent, b.table, b.column)] = true
		}
	}

	actual := map[string]bool{}
	for _, fk := range foreignKeys(t) {
		if _, isDeclaredTable := tableSpecs[fk.parent]; !isDeclaredTable || fk.onDelete == onDeleteCascade {
			continue
		}
		actual[fmt.Sprintf("%s <- %s.%s", fk.parent, fk.child, fk.childColumn)] = true
	}

	for edge := range actual {
		if !declared[edge] {
			t.Errorf("%s restricts a delete and is in no tableSpec's blockedBy — "+
				"the delete will fail as a driver error rather than as a refusal", edge)
		}
	}
	for edge := range declared {
		if !actual[edge] {
			t.Errorf("%s is listed in blockedBy but the schema declares no restricting reference — "+
				"a delete the database would allow is being refused", edge)
		}
	}
}

// Every table an FK cascade removes is named in `cascades`, or excused by
// name with the reason it needs no tombstone. Reachability is transitive
// because a cascade is: deleting a template takes its positions, and their
// preparation tasks with them, and the client is owed a tombstone for each.
func TestTableSpecs_CascadesAreTheFKGraphMinusTheDocumentedExceptions(t *testing.T) {
	cascadesTo := map[string][]string{}
	for _, fk := range foreignKeys(t) {
		if fk.onDelete == onDeleteCascade {
			cascadesTo[fk.parent] = append(cascadesTo[fk.parent], fk.child)
		}
	}

	for _, parent := range sortedTableSpecNames() {
		reachable := map[string]bool{}
		var walk func(string)
		walk = func(from string) {
			for _, child := range cascadesTo[from] {
				if !reachable[child] {
					reachable[child] = true
					walk(child)
				}
			}
		}
		walk(parent)

		listed := map[string]bool{}
		for _, c := range tableSpecs[parent].cascades {
			listed[c.table] = true
		}

		for child := range reachable {
			edge := parent + " -> " + child
			if _, excused := cascadeChildrenWithoutATombstone[edge]; listed[child] == excused {
				if listed[child] {
					t.Errorf("%s is both listed in cascades and excused from it", edge)
					continue
				}
				t.Errorf("deleting a %s cascades to %s, which cascades does not name and "+
					"cascadeChildrenWithoutATombstone does not excuse — every other device "+
					"keeps a row the server has deleted", parent, child)
			}
		}
		for child := range listed {
			if !reachable[child] {
				t.Errorf("cascades says a deleted %s takes %s with it, but no chain of "+
					"ON DELETE CASCADE reaches it — the tombstone removes a row that is still there",
					parent, child)
			}
		}
	}

	for edge := range cascadeChildrenWithoutATombstone {
		if !edgeExists(t, cascadesTo, edge) {
			t.Errorf("cascadeChildrenWithoutATombstone excuses %q, which the schema no longer cascades", edge)
		}
	}
}

func edgeExists(t *testing.T, cascadesTo map[string][]string, edge string) bool {
	t.Helper()
	var parent, child string
	if _, err := fmt.Sscanf(edge, "%s -> %s", &parent, &child); err != nil {
		t.Fatalf("malformed exemption key %q: %v", edge, err)
	}
	reachable := map[string]bool{}
	var walk func(string)
	walk = func(from string) {
		for _, c := range cascadesTo[from] {
			if !reachable[c] {
				reachable[c] = true
				walk(c)
			}
		}
	}
	walk(parent)
	return reachable[child]
}

// foreignKeys reads the whole graph from the database. PRAGMA
// foreign_key_list is the schema as SQLite understands it — a second reader
// of schema.sql would be a second interpretation, which is the thing these
// tests exist to stop.
func foreignKeys(t *testing.T) []foreignKey {
	t.Helper()
	s := openTestStore(t)
	var tables []string
	rows, err := s.db.Query(
		`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
	if err != nil {
		t.Fatalf("list tables: %v", err)
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatalf("scan table name: %v", err)
		}
		tables = append(tables, name)
	}
	if err := rows.Err(); err != nil {
		t.Fatalf("list tables: %v", err)
	}
	rows.Close()
	if len(tables) == 0 {
		t.Fatal("the database declares no tables — the comparison would be vacuous")
	}

	var out []foreignKey
	for _, child := range tables {
		//nolint:gosec // the table name comes from sqlite_master, not from input
		list, err := s.db.Query(fmt.Sprintf(`PRAGMA foreign_key_list(%q)`, child))
		if err != nil {
			t.Fatalf("foreign_key_list(%s): %v", child, err)
		}
		for list.Next() {
			var id, seq int
			var parent, from, to, onUpdate, onDelete, match any
			if err := list.Scan(&id, &seq, &parent, &from, &to, &onUpdate, &onDelete, &match); err != nil {
				t.Fatalf("scan foreign_key_list(%s): %v", child, err)
			}
			out = append(out, foreignKey{
				child:       child,
				childColumn: fmt.Sprint(from),
				parent:      fmt.Sprint(parent),
				onDelete:    fmt.Sprint(onDelete),
			})
		}
		list.Close()
	}
	if len(out) == 0 {
		t.Fatal("read no foreign keys — the comparison would be vacuous")
	}
	return out
}

func sortedTableSpecNames() []string {
	names := make([]string, 0, len(tableSpecs))
	for name := range tableSpecs {
		names = append(names, name)
	}
	sort.Strings(names)
	return names
}
