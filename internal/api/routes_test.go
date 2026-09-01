package api_test

import (
	"go/ast"
	"go/parser"
	gotoken "go/token"
	"net/http"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"testing"

	"jitpack/internal/api"
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

// productionFiles parses the package's own source, test files excluded: a test
// may well spell a path out, and asserting against the literal is often the
// point. It parses file by file rather than with parser.ParseDir, which is
// deprecated and would pull in a dependency this package does not need.
func productionFiles(t *testing.T) (map[string]*ast.File, *gotoken.FileSet) {
	t.Helper()
	names, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	fset := gotoken.NewFileSet()
	out := map[string]*ast.File{}
	for _, name := range names {
		if strings.HasSuffix(name, "_test.go") {
			continue
		}
		file, err := parser.ParseFile(fset, name, nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		out[name] = file
	}
	if len(out) == 0 {
		t.Fatal("no source parsed — a rule that scanned nothing must not report ok")
	}
	return out, fset
}

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
	offenders := literalArgumentsTo(t, func(name string) bool { return name == "HandleFunc" || name == "Handle" },
		func(fileName string) bool { return fileName == "wire.go" })
	if len(offenders) > 0 {
		t.Errorf("a route is registered from a literal instead of wire.go's declaration:\n  %s",
			strings.Join(offenders, "\n  "))
	}
}

// The read side of the same rule. A placeholder that a handler picks up by
// literal is the second spelling again, one function call further along.
func TestNoPathValueIsReadFromALiteral(t *testing.T) {
	offenders := literalArgumentsTo(t, func(name string) bool { return name == "PathValue" },
		func(string) bool { return false })
	if len(offenders) > 0 {
		t.Errorf("a path variable is read from a literal instead of wire.go's declaration:\n  %s",
			strings.Join(offenders, "\n  "))
	}
}

// literalArgumentsTo reports every call to a named method that is handed a
// string literal, as "file:line: literal", sorted so a failure reads the same
// way twice. Both rules above are that one shape.
func literalArgumentsTo(t *testing.T, isCall func(method string) bool, skipFile func(name string) bool) []string {
	t.Helper()
	files, fset := productionFiles(t)

	var offenders []string
	for name, file := range files {
		if skipFile(name) {
			continue
		}
		ast.Inspect(file, func(n ast.Node) bool {
			call, ok := n.(*ast.CallExpr)
			if !ok || len(call.Args) == 0 {
				return true
			}
			sel, ok := call.Fun.(*ast.SelectorExpr)
			if !ok || !isCall(sel.Sel.Name) {
				return true
			}
			if lit, ok := call.Args[0].(*ast.BasicLit); ok && lit.Kind == gotoken.STRING {
				offenders = append(offenders, fset.Position(call.Pos()).String()+": "+lit.Value)
			}
			return true
		})
	}
	sort.Strings(offenders)
	return offenders
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

// APIPrefix is what the single-origin SPA server routes by (ADR-043), so a
// declared path outside it would be answered by the file server instead of by
// its handler — a 404 for the app, and no error anywhere. The two paths that
// live outside the versioned surface are named here for the same reason: the
// list the server is handed has to be the whole list.
func TestAPIPrefixCoversEveryDeclaredRoute(t *testing.T) {
	outside := map[string]bool{api.RouteWS: true, api.RouteHealth: true}
	for _, r := range declaredRoutes(t) {
		if outside[r.pattern] || strings.HasPrefix(r.pattern, api.APIPrefix) {
			continue
		}
		t.Errorf("%s declares %s, which is neither under %s nor one of the two paths "+
			"outside it — the SPA server would answer it (see webui.Handler)",
			r.constName, r.pattern, api.APIPrefix)
	}
}
