package api_test

import (
	"go/ast"
	"go/parser"
	gotoken "go/token"
	"path/filepath"
	"strings"
	"testing"
)

// NFR-4.14: a response body is a type declared in wire.go, never a map
// literal built at the call site. A map is what let the client's hand-written
// copy of a shape drift — nothing on the server side says which keys there
// are, so nothing can be compared against, and ADR-026's gate has nothing to
// hold. This test is the reason the next response cannot be added untyped.
//
// It reads its own package's source rather than exercising handlers, because
// the rule is about how the response is *declared*: a map literal that
// happens to carry the right keys today passes every handler test there is.
func TestEveryResponseBodyIsADeclaredType(t *testing.T) {
	fset := gotoken.NewFileSet()
	files, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}

	var offenders []string
	for _, name := range files {
		if strings.HasSuffix(name, "_test.go") {
			continue
		}
		f, err := parser.ParseFile(fset, name, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		ast.Inspect(f, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok || !writesAResponseBody(call) || len(call.Args) == 0 {
				return true
			}
			body := call.Args[len(call.Args)-1]
			lit, ok := body.(*ast.CompositeLit)
			if !ok {
				return true
			}
			if _, isMap := lit.Type.(*ast.MapType); isMap {
				offenders = append(offenders, fset.Position(call.Pos()).String())
			}
			return true
		})
	}

	for _, at := range offenders {
		t.Errorf("%s: response body is a map literal — declare it in wire.go instead", at)
	}
}

// writesAResponseBody matches the two ways this package answers with JSON:
// the writeJSON helper, and json.NewEncoder(w).Encode(...) where a handler
// sets the header itself.
func writesAResponseBody(call *ast.CallExpr) bool {
	switch fn := call.Fun.(type) {
	case *ast.Ident:
		return fn.Name == "writeJSON"
	case *ast.SelectorExpr:
		if fn.Sel.Name != "Encode" {
			return false
		}
		inner, ok := fn.X.(*ast.CallExpr)
		if !ok {
			return false
		}
		sel, ok := inner.Fun.(*ast.SelectorExpr)
		return ok && sel.Sel.Name == "NewEncoder"
	}
	return false
}
