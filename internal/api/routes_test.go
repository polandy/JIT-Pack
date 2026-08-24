package api_test

import (
	"go/ast"
	"go/parser"
	gotoken "go/token"
	"io/fs"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"
)

// NFR-4.14 closed its last half here: a path used to be written twice — once as
// a literal in the mux and once in the client — and agreed by two test tables.
// wire.go now declares it once, the server registers from that declaration and
// cmd/wiregen writes the client's builders from it (ADR-027's second revisit
// trigger, fired). These tests hold the Go half of that: every declared route
// is registered, no route is registered from anywhere else, and a placeholder
// is a name a handler can actually read back.

const routeConstPrefix = "Route"

const pathParamPrefix = "Path"

// placeholder matches the mux's path-variable spelling, `{name}`.
var placeholder = regexp.MustCompile(`\{([^}]+)\}`)

// notATestFile keeps both source rules judging the production package only: a
// test may well spell a path out, and asserting against the literal is often
// the point.
func notATestFile(fi fs.FileInfo) bool { return !strings.HasSuffix(fi.Name(), "_test.go") }

type routeDecl struct {
	constName string
	pattern   string
}

// declaredRoutes reads the contract's route constants out of wire.go. It parses
// rather than reflects for the same reason the generator does (ADR-026): a
// constant has no runtime identity, so nothing but the source knows its name.
func declaredRoutes(t *testing.T) []routeDecl {
	t.Helper()
	fset := gotoken.NewFileSet()
	file, err := parser.ParseFile(fset, "wire.go", nil, parser.ParseComments)
	if err != nil {
		t.Fatal(err)
	}
	var out []routeDecl
	forEachStringConst(file, func(name, value string) {
		if strings.HasPrefix(name, routeConstPrefix) {
			out = append(out, routeDecl{constName: name, pattern: value})
		}
	})
	if len(out) == 0 {
		t.Fatal("wire.go declares no route constants — a test that scanned nothing must not report ok")
	}
	return out
}

// declaredPathParams reads the placeholder names a handler may read back.
func declaredPathParams(t *testing.T) map[string]bool {
	t.Helper()
	fset := gotoken.NewFileSet()
	file, err := parser.ParseFile(fset, "wire.go", nil, parser.ParseComments)
	if err != nil {
		t.Fatal(err)
	}
	out := map[string]bool{}
	forEachStringConst(file, func(name, value string) {
		if strings.HasPrefix(name, pathParamPrefix) {
			out[value] = true
		}
	})
	return out
}

func forEachStringConst(file *ast.File, fn func(name, value string)) {
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != gotoken.CONST {
			continue
		}
		for _, spec := range gen.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok || len(vs.Names) != 1 || len(vs.Values) != 1 {
				continue
			}
			lit, ok := vs.Values[0].(*ast.BasicLit)
			if !ok || lit.Kind != gotoken.STRING {
				continue
			}
			value, err := strconv.Unquote(lit.Value)
			if err != nil {
				continue
			}
			fn(vs.Names[0].Name, value)
		}
	}
}

// A declared route that nothing registers is the failure this whole change is
// against: the client would be handed a builder for a path the server does not
// serve, and would only learn at runtime. GET is probed for every route because
// the mux answers a registered path with the wrong method 405 — which is still
// an answer that only a *routed* path can give.
func TestEveryDeclaredRouteIsRouted(t *testing.T) {
	srv := newTestServer(t)
	bearer := "Bearer " + token(t, userA, testSecret)
	params := map[string]string{"tripID": trip}

	for _, r := range declaredRoutes(t) {
		t.Run(r.constName, func(t *testing.T) {
			path := placeholder.ReplaceAllStringFunc(r.pattern, func(m string) string {
				name := m[1 : len(m)-1]
				if v, ok := params[name]; ok {
					return v
				}
				return "nope"
			})
			if !routed(t, srv.URL+path, http.MethodGet, bearer) {
				t.Errorf("%s declares %s, which the mux does not serve", r.constName, r.pattern)
			}
		})
	}
}

// The other direction, and the one a test cannot get at by making requests: a
// path registered from a literal is a second declaration, however correct it
// looks today. wire.go is exempt because it *is* the declaration.
func TestNoRouteIsRegisteredFromALiteral(t *testing.T) {
	fset := gotoken.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", notATestFile, 0)
	if err != nil {
		t.Fatal(err)
	}

	var offenders []string
	for _, pkg := range pkgs {
		for name, file := range pkg.Files {
			if name == "wire.go" {
				continue
			}
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok || len(call.Args) == 0 {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || sel.Sel.Name != "HandleFunc" && sel.Sel.Name != "Handle" {
					return true
				}
				if lit, ok := call.Args[0].(*ast.BasicLit); ok && lit.Kind == gotoken.STRING {
					offenders = append(offenders, fset.Position(call.Pos()).String()+": "+lit.Value)
				}
				return true
			})
		}
	}
	sort.Strings(offenders)
	if len(offenders) > 0 {
		t.Errorf("a route is registered from a literal instead of wire.go's declaration:\n  %s",
			strings.Join(offenders, "\n  "))
	}
}

// The read side of the same rule. A placeholder that a handler picks up by
// literal is the second spelling again, one function call further along.
func TestNoPathValueIsReadFromALiteral(t *testing.T) {
	fset := gotoken.NewFileSet()
	pkgs, err := parser.ParseDir(fset, ".", notATestFile, 0)
	if err != nil {
		t.Fatal(err)
	}

	var offenders []string
	for _, pkg := range pkgs {
		for _, file := range pkg.Files {
			ast.Inspect(file, func(n ast.Node) bool {
				call, ok := n.(*ast.CallExpr)
				if !ok || len(call.Args) != 1 {
					return true
				}
				sel, ok := call.Fun.(*ast.SelectorExpr)
				if !ok || sel.Sel.Name != "PathValue" {
					return true
				}
				if lit, ok := call.Args[0].(*ast.BasicLit); ok && lit.Kind == gotoken.STRING {
					offenders = append(offenders, fset.Position(call.Pos()).String()+": "+lit.Value)
				}
				return true
			})
		}
	}
	sort.Strings(offenders)
	if len(offenders) > 0 {
		t.Errorf("a path variable is read from a literal instead of wire.go's declaration:\n  %s",
			strings.Join(offenders, "\n  "))
	}
}

// A placeholder is only useful if a handler reads it back under the same name,
// and `r.PathValue("tripD")` is a typo no compiler sees. Holding both spellings
// to one constant is what makes the rename safe.
func TestEveryPlaceholderIsADeclaredPathParam(t *testing.T) {
	params := declaredPathParams(t)
	for _, r := range declaredRoutes(t) {
		for _, m := range placeholder.FindAllStringSubmatch(r.pattern, -1) {
			if !params[m[1]] {
				t.Errorf("%s has placeholder {%s}, which no %s* constant names — "+
					"a handler reading it back has nothing to read it back by",
					r.constName, m[1], pathParamPrefix)
			}
		}
	}
}
