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
