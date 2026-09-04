package store

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// storeMethodsWithNoCallerOutside are the exported *Store methods that no
// package outside this one is meant to reach, each with the reason. The
// list is short on purpose: an exported method nobody calls is not merely
// unused code, it is a *rule an agent will read as live* — G-10 found three
// membership helpers whose doc comments described FR-4.5/4.7 while the real
// enforcement had been in authorizeMaster for months, and a second local-user
// constructor beside the one main.go actually calls.
var storeMethodsWithNoCallerOutside = map[string]string{
	"DB": "the test fixtures' hatch, declared beside OpenForTest; a handler reaching past the repository is how a write escapes the change feed",
}

// callersOutsideTheStore are the packages that may reach into this one.
// internal/sync is a leaf and imports nothing; the client is not Go.
var callersOutsideTheStore = []string{
	filepath.Join("..", "api"),
	filepath.Join("..", "webui"),
	filepath.Join("..", "..", "cmd", "jitpackd"),
	filepath.Join("..", "..", "cmd", "wiregen"),
}

// Every exported method on *Store is called from outside this package, or
// is named above with the reason it is not.
//
// Test files are deliberately not counted as callers. A method kept alive
// only by its own test is the exact shape this guard exists to catch: it
// passes, it is documented, and it enforces nothing.
func TestStoreSurface_EveryExportedMethodHasACallerOutsideThePackage(t *testing.T) {
	methods := exportedStoreMethods(t)
	if len(methods) == 0 {
		t.Fatal("found no exported *Store methods — the guard is measuring nothing")
	}
	used := map[string]bool{}
	for _, dir := range callersOutsideTheStore {
		for name := range selectorsUsed(t, dir) {
			used[name] = true
		}
	}

	for _, name := range methods {
		reason, excused := storeMethodsWithNoCallerOutside[name]
		switch {
		case used[name] && excused:
			t.Errorf("(*Store).%s is called outside the package but listed as unreachable: %s", name, reason)
		case !used[name] && !excused:
			t.Errorf("(*Store).%s has no caller outside internal/store — unexport it, delete it, "+
				"or name it in storeMethodsWithNoCallerOutside with the reason it is public", name)
		}
	}
	for name := range storeMethodsWithNoCallerOutside {
		if !contains(methods, name) {
			t.Errorf("storeMethodsWithNoCallerOutside names %s, which is no longer an exported *Store method", name)
		}
	}
}

func exportedStoreMethods(t *testing.T) []string {
	t.Helper()
	var names []string
	for _, file := range goFilesIn(t, ".") {
		parsed, err := parser.ParseFile(token.NewFileSet(), file, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", file, err)
		}
		for _, decl := range parsed.Decls {
			fn, ok := decl.(*ast.FuncDecl)
			if !ok || fn.Recv == nil || len(fn.Recv.List) != 1 || !ast.IsExported(fn.Name.Name) {
				continue
			}
			if star, ok := fn.Recv.List[0].Type.(*ast.StarExpr); ok {
				if ident, ok := star.X.(*ast.Ident); ok && ident.Name == "Store" {
					names = append(names, fn.Name.Name)
				}
			}
		}
	}
	return names
}

// selectorsUsed collects every `x.Name` a package's own source mentions —
// calls and method *values* alike, because `NewHub(st.HeadSeq)` is a use
// that no search for a call would find.
func selectorsUsed(t *testing.T, dir string) map[string]bool {
	t.Helper()
	used := map[string]bool{}
	for _, file := range goFilesIn(t, dir) {
		parsed, err := parser.ParseFile(token.NewFileSet(), file, nil, 0)
		if err != nil {
			t.Fatalf("parse %s: %v", file, err)
		}
		ast.Inspect(parsed, func(n ast.Node) bool {
			if sel, ok := n.(*ast.SelectorExpr); ok {
				used[sel.Sel.Name] = true
			}
			return true
		})
	}
	return used
}

func goFilesIn(t *testing.T, dir string) []string {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatalf("read %s: %v", dir, err)
	}
	var files []string
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".go") || strings.HasSuffix(e.Name(), "_test.go") {
			continue
		}
		files = append(files, filepath.Join(dir, e.Name()))
	}
	if len(files) == 0 {
		t.Fatalf("no source files under %s", dir)
	}
	return files
}

func contains(haystack []string, needle string) bool {
	for _, s := range haystack {
		if s == needle {
			return true
		}
	}
	return false
}
