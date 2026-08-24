package wiregen

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"regexp"
	"strconv"
	"strings"
)

// routeConstPrefix marks a constant as a path. The prefix is what tells the
// generator a route from the contract's other constants, so it is part of the
// declaration's shape and not a naming preference.
const routeConstPrefix = "Route"

// placeholder matches the mux's path-variable spelling, `{name}`. The name is
// carried straight through as the builder's parameter, so the two spellings of
// a path variable cannot come apart.
var placeholder = regexp.MustCompile(`\{([^}]+)\}`)

// GenerateRoutes reads the contract source and returns the TypeScript module of
// path builders for it (NFR-4.14, ADR-027). A route with no placeholder is a
// string; one with placeholders is a function, because a path that needs an id
// the caller must not be able to forget to pass.
func GenerateRoutes(filename string, src []byte) (string, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, filename, src, parser.ParseComments)
	if err != nil {
		return "", fmt.Errorf("parse %s: %w", filename, err)
	}

	var b strings.Builder
	writeRoutesHeader(&b, filename)
	b.WriteString("export const API = {\n")

	found := 0
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.CONST {
			continue
		}
		for _, spec := range gen.Specs {
			name, value, doc, ok := routeConst(spec)
			if !ok {
				continue
			}
			if found > 0 && doc != "" {
				b.WriteString("\n")
			}
			writeFieldDoc(&b, doc)
			writeRoute(&b, name, value)
			found++
		}
	}
	if found == 0 {
		return "", fmt.Errorf("%s declares no %s* constant — a generator that found nothing must not write an empty contract", filename, routeConstPrefix)
	}
	b.WriteString("} as const\n")
	return b.String(), nil
}

// routeConst reports the name, path and doc comment of a route declaration.
// A typed constant is not one: the contract's enums carry a type, and their
// values are vocabulary rather than paths.
func routeConst(spec ast.Spec) (name, value, doc string, ok bool) {
	vs, isValue := spec.(*ast.ValueSpec)
	if !isValue || vs.Type != nil || len(vs.Names) != 1 || len(vs.Values) != 1 {
		return "", "", "", false
	}
	if !strings.HasPrefix(vs.Names[0].Name, routeConstPrefix) {
		return "", "", "", false
	}
	lit, isLit := vs.Values[0].(*ast.BasicLit)
	if !isLit || lit.Kind != token.STRING {
		return "", "", "", false
	}
	unquoted, err := strconv.Unquote(lit.Value)
	if err != nil {
		return "", "", "", false
	}
	if vs.Doc != nil {
		doc = vs.Doc.Text()
	}
	return vs.Names[0].Name, unquoted, doc, true
}

func writeRoute(b *strings.Builder, constName, path string) {
	key := lowerFirstWord(strings.TrimPrefix(constName, routeConstPrefix))

	names := placeholder.FindAllStringSubmatch(path, -1)
	if len(names) == 0 {
		fmt.Fprintf(b, "  %s: '%s',\n", key, path)
		return
	}

	params := make([]string, len(names))
	for i, m := range names {
		params[i] = m[1] + ": " + tsString
	}
	template := placeholder.ReplaceAllString(path, "${$1}")
	signature := fmt.Sprintf("  %s: (%s) =>", key, strings.Join(params, ", "))
	body := "`" + template + "`,"

	if len(signature)+1+len(body) <= printWidth {
		fmt.Fprintf(b, "%s %s\n", signature, body)
		return
	}
	// Prettier's break for an arrow whose body does not fit beside its
	// signature. Emitting it here keeps `make fmt` from rewriting a generated
	// file and failing the drift gate on a file nobody edited.
	fmt.Fprintf(b, "%s\n    %s\n", signature, body)
}

// lowerFirstWord turns a Go constant name into the client's key, leaving an
// initialism intact: TripExportCSV is tripExportCSV, and WS on its own is ws.
func lowerFirstWord(name string) string {
	runes := []rune(name)
	end := 0
	for end < len(runes) && isUpper(runes[end]) {
		end++
	}
	if end == 0 {
		return name
	}
	// A run that ends in front of a lowercase letter has already started the
	// next word: in TripExportCSV only the T belongs to the first one.
	if end < len(runes) && end > 1 {
		end--
	}
	return strings.ToLower(string(runes[:end])) + string(runes[end:])
}

func writeRoutesHeader(b *strings.Builder, filename string) {
	fmt.Fprintf(b, `/**
 * Generated from internal/api/%s by cmd/wiregen. Do not edit.
 *
 * Every HTTP path the client calls, built from the server's own declaration
 * (NFR-4.14). The shape is a rule rather than a convention (ADR-027):
 *
 * - the path names the **scope** first, then the resource;
 * - the master partition belongs to no trip, so its scope segment is the
 *   literal %s rather than an id;
 * - an export names its **format** as the path's extension.
 */

`, filename, "`master`")
}
