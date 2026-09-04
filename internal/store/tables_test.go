package store

import (
	"go/ast"
	"go/parser"
	gotoken "go/token"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
)

// G-2 (design review 2026-09-02). Per-table knowledge used to live in five
// registries and two switches across two files, and a table added to four of
// them is not a build error — it is a rule that silently does not apply.
// CLAUDE.md §4a records that a sixth switch was once simply missed.
//
// tableSpecs is now the declaration and the maps are views of it, so most of
// that class of miss is gone by construction. What is left is the first step:
// declaring the constant and never writing the spec. This test reads the
// `Table*` constants out of the package's own source, because the rule is
// about what is *declared* — a Go test cannot enumerate constants any other
// way, and a hand-kept list here would be the tenth registry.
func TestEveryTableConstantHasASpec(t *testing.T) {
	declared := declaredTableConstants(t)
	if len(declared) < 20 {
		t.Fatalf("found %d Table* constants; the AST walk is not seeing the const block", len(declared))
	}

	for name, table := range declared {
		if _, ok := tableSpecs[table]; !ok {
			t.Errorf("%s = %q has no entry in tableSpecs — it is syncable nowhere", name, table)
		}
	}
	byValue := map[string]bool{}
	for _, table := range declared {
		byValue[table] = true
	}
	for table := range tableSpecs {
		if !byValue[table] {
			t.Errorf("tableSpecs has %q, which no Table* constant names", table)
		}
	}
}

// Every field of a spec may legitimately be zero except these two: a table
// on no partition reaches no endpoint, and a table with no columns rejects
// every push. Both fail as a refusal a client cannot read rather than as a
// missing case, which is why they are asserted here and not left to a test
// of whichever feature notices first.
func TestEverySpecNamesAPartitionAndAtLeastOneColumn(t *testing.T) {
	for table, spec := range tableSpecs {
		if spec.partition != partitionTrip && spec.partition != partitionMaster {
			t.Errorf("%q declares no partition; no push endpoint would accept it", table)
		}
		if len(spec.columns) == 0 {
			t.Errorf("%q declares no syncable columns; every push to it would be refused", table)
		}
	}
}

// G-2 half 2. A master-partition table with no visibility rule is invisible
// to every pull — its rows reach nobody and no test of the feature that owns
// it would say so, because `masterVisible` denies silently by design. The
// trip partition's gate is membership in the trip whose endpoint was called,
// applied before the feed is read, so a rule there would be a second gate
// nothing consults.
func TestEveryMasterTableDeclaresExactlyOneVisibilityRule(t *testing.T) {
	for table, spec := range tableSpecs {
		rules := 0
		for _, set := range []bool{spec.visible.everyone, spec.visible.tripQuery != "", spec.visible.ownerQuery != ""} {
			if set {
				rules++
			}
		}
		switch spec.partition {
		case partitionMaster:
			if rules != 1 {
				t.Errorf("%q declares %d visibility rules, want exactly 1 — a master row nobody may see reaches no device", table, rules)
			}
		case partitionTrip:
			if rules != 0 {
				t.Errorf("%q is on the trip partition and declares a master visibility rule", table)
			}
		}
	}
}

// NFR-4.5 promises a backup of everything the caller can see. A syncable
// table missing from the export is data that survives no disaster, and the
// hand-kept query list this replaced had lost two of them: `item_dependencies`
// (the whole FR-20.1 graph) and `trip_members` (every restored trip's roster).
// Neither absence was visible anywhere — the export answered 200 with the
// other eighteen tables in it.
func TestEverySyncableTableIsInTheBackup(t *testing.T) {
	for table, spec := range tableSpecs {
		if spec.export.query == "" {
			t.Errorf("%q has no export query — the NFR-4.5 backup would not carry it", table)
		}
	}
}

// The views must stay views. A derivation that silently drops a table is the
// same failure the registries had, one indirection later.
func TestTheDerivedViewsCoverExactlyTheSpecs(t *testing.T) {
	if len(syncableColumns) != len(tableSpecs) {
		t.Errorf("syncableColumns has %d tables, tableSpecs %d", len(syncableColumns), len(tableSpecs))
	}
	if got := len(tripPartitionTables) + len(masterPartitionTables); got != len(tableSpecs) {
		t.Errorf("the two partition sets hold %d tables together, tableSpecs %d", got, len(tableSpecs))
	}
	for table, spec := range tableSpecs {
		if spec.retirable != lifecycleTables[table] {
			t.Errorf("%q: retirable %v, lifecycleTables %v", table, spec.retirable, lifecycleTables[table])
		}
		if len(spec.blockedBy) != len(blockingReferences[table]) {
			t.Errorf("%q: %d blocking references declared, %d derived",
				table, len(spec.blockedBy), len(blockingReferences[table]))
		}
		if spec.partition == partitionTrip && !tripPartitionTables[table] {
			t.Errorf("%q declares the trip partition and is not in its set", table)
		}
		if spec.partition == partitionMaster && !masterPartitionTables[table] {
			t.Errorf("%q declares the master partition and is not in its set", table)
		}
		if got := TableHasMark(table); got != spec.columns[MarkColumn] {
			t.Errorf("%q: TableHasMark %v, columns say %v", table, got, spec.columns[MarkColumn])
		}
	}
}

// declaredTableConstants returns the package's `Table<Name> = "<table>"`
// constants, keyed by identifier.
func declaredTableConstants(t *testing.T) map[string]string {
	t.Helper()
	fset := gotoken.NewFileSet()
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatalf("glob: %v", err)
	}
	out := map[string]string{}
	for _, file := range files {
		if strings.HasSuffix(file, "_test.go") {
			continue
		}
		f, err := parser.ParseFile(fset, file, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", file, err)
		}
		for _, decl := range f.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != gotoken.CONST {
				continue
			}
			for _, spec := range gen.Specs {
				vs, ok := spec.(*ast.ValueSpec)
				if !ok || len(vs.Names) != 1 || len(vs.Values) != 1 {
					continue
				}
				name := vs.Names[0].Name
				lit, isString := vs.Values[0].(*ast.BasicLit)
				if !strings.HasPrefix(name, "Table") || !isString || lit.Kind != gotoken.STRING {
					continue
				}
				value, err := strconv.Unquote(lit.Value)
				if err != nil {
					t.Fatalf("unquote %s: %v", name, err)
				}
				out[name] = value
			}
		}
	}
	return out
}
