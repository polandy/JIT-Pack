// Package wiregen turns the Go declaration of the HTTP/WebSocket contract into
// the TypeScript the client consumes (NFR-4.14, ADR-026).
//
// It is deliberately a source-to-source translation rather than reflection over
// live types: the doc comments and the constants of an enum are part of the
// contract, and neither survives into a runtime type. Parsing also keeps the
// generator a leaf — it imports nothing of the application, so a wire change
// can never drag it along.
package wiregen

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"reflect"
	"strconv"
	"strings"
)

// jsIdent matches a constant value that can be an unquoted object key.
// printWidth is the client's prettier setting (client/.prettierrc.json); the
// generator wraps at it so its output is already formatted.
const printWidth = 100

const jsIdentChars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_$"

// Generate reads the contract source and returns the TypeScript module for it.
// The filename is used for parse errors and for the generated header, so the
// client can see at a glance which file it must not edit instead.
func Generate(filename string, src []byte) (string, error) {
	fset := token.NewFileSet()
	file, err := parser.ParseFile(fset, filename, src, parser.ParseComments)
	if err != nil {
		return "", fmt.Errorf("parse %s: %w", filename, err)
	}

	enums := collectEnums(file)

	var b strings.Builder
	writeHeader(&b, filename)

	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.TYPE {
			continue
		}
		for _, spec := range gen.Specs {
			ts, ok := spec.(*ast.TypeSpec)
			if !ok {
				continue
			}
			if err := writeType(&b, ts, docOf(gen, ts), enums); err != nil {
				return "", err
			}
		}
	}
	// One trailing newline, not the blank line the last block leaves behind:
	// prettier strips it, and the strip would fail the drift gate.
	return strings.TrimRight(b.String(), "\n") + "\n", nil
}

func writeHeader(b *strings.Builder, filename string) {
	fmt.Fprintf(b, `/**
 * Generated from internal/api/%s by cmd/wiregen. Do not edit.
 *
 * This file is the client's half of the one contract (NFR-4.14): the Go
 * declaration is the source, and %s regenerates it. A hand edit here is
 * undone by the next generation and reported by the CI gate before that.
 */

`, filename, "`make wire`")
}

// collectEnums maps a named string type to the constant values declared for it,
// in source order — the order is part of the emitted union and must not depend
// on map iteration.
func collectEnums(file *ast.File) map[string][]string {
	enums := map[string][]string{}
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.CONST {
			continue
		}
		for _, spec := range gen.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok || vs.Type == nil || len(vs.Values) == 0 {
				continue
			}
			typeName, ok := vs.Type.(*ast.Ident)
			if !ok {
				continue
			}
			lit, ok := vs.Values[0].(*ast.BasicLit)
			if !ok || lit.Kind != token.STRING {
				continue
			}
			value, err := strconv.Unquote(lit.Value)
			if err != nil {
				continue
			}
			enums[typeName.Name] = append(enums[typeName.Name], value)
		}
	}
	return enums
}

func docOf(gen *ast.GenDecl, ts *ast.TypeSpec) string {
	if ts.Doc != nil {
		return ts.Doc.Text()
	}
	if gen.Doc != nil {
		return gen.Doc.Text()
	}
	return ""
}

func writeType(b *strings.Builder, ts *ast.TypeSpec, doc string, enums map[string][]string) error {
	switch t := ts.Type.(type) {
	case *ast.StructType:
		return writeInterface(b, ts.Name.Name, doc, t)
	case *ast.Ident:
		if t.Name != "string" {
			return nil // a named non-string type carries no wire vocabulary
		}
		writeEnum(b, ts.Name.Name, doc, enums[ts.Name.Name])
		return nil
	default:
		return nil
	}
}

func writeInterface(b *strings.Builder, name, doc string, st *ast.StructType) error {
	writeDoc(b, doc)
	fmt.Fprintf(b, "export interface %s {\n", name)
	for _, field := range st.Fields.List {
		key, optional, ok := wireName(field)
		if !ok {
			continue
		}
		tsType, err := typeScriptType(field.Type)
		if err != nil {
			return fmt.Errorf("field %q: %w", key, err)
		}
		if optional {
			// An omitted key is absent, never null: `?` already says that, and
			// adding `| null` would invite a check the server cannot trigger.
			tsType = strings.TrimSuffix(tsType, " | null")
			key += "?"
		}
		if field.Doc != nil {
			writeFieldDoc(b, field.Doc.Text())
		}
		fmt.Fprintf(b, "  %s: %s\n", key, tsType)
	}
	b.WriteString("}\n\n")
	return nil
}

// writeEnum emits both halves an enum needs: the union for the type system and
// a frozen object for the code that branches on a value at runtime
// (CODING_PRINCIPLES §4a — the vocabulary is named once, on both sides).
func writeEnum(b *strings.Builder, name, doc string, values []string) {
	writeDoc(b, doc)
	if len(values) == 0 {
		fmt.Fprintf(b, "export type %s = string\n\n", name)
		return
	}
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = "'" + v + "'"
	}
	oneLine := fmt.Sprintf("export type %s = %s", name, strings.Join(quoted, " | "))
	if len(oneLine) <= printWidth {
		fmt.Fprintf(b, "%s\n\n", oneLine)
	} else {
		// Prettier's own break for a union that does not fit: one value per
		// line behind a leading pipe. Emitting it here keeps `make fmt` from
		// rewriting a generated file and failing the drift gate.
		fmt.Fprintf(b, "export type %s =\n", name)
		for _, q := range quoted {
			fmt.Fprintf(b, "  | %s\n", q)
		}
		b.WriteString("\n")
	}

	fmt.Fprintf(b, "export const %s = {\n", screamingSnake(name))
	for _, v := range values {
		fmt.Fprintf(b, "  %s: '%s',\n", objectKey(v), v)
	}
	b.WriteString("} as const\n\n")
}

func writeDoc(b *strings.Builder, doc string) {
	lines := commentLines(doc)
	if len(lines) == 0 {
		return
	}
	b.WriteString("/**\n")
	for _, line := range lines {
		b.WriteString(strings.TrimRight(" * "+line, " "))
		b.WriteString("\n")
	}
	b.WriteString(" */\n")
}

func writeFieldDoc(b *strings.Builder, doc string) {
	for _, line := range commentLines(doc) {
		b.WriteString(strings.TrimRight("  // "+line, " "))
		b.WriteString("\n")
	}
}

func commentLines(doc string) []string {
	doc = strings.TrimSpace(doc)
	if doc == "" {
		return nil
	}
	return strings.Split(doc, "\n")
}

// wireName reports the JSON key of a field, whether it is omitted when empty,
// and whether it reaches the wire at all. An untagged field does not: it is
// server-internal, and emitting it would invent a key for the client to read.
func wireName(field *ast.Field) (name string, optional, onWire bool) {
	if field.Tag == nil {
		return "", false, false
	}
	raw, err := strconv.Unquote(field.Tag.Value)
	if err != nil {
		return "", false, false
	}
	tag, ok := reflect.StructTag(raw).Lookup("json")
	if !ok || tag == "-" {
		return "", false, false
	}
	parts := strings.Split(tag, ",")
	if parts[0] == "" {
		return "", false, false
	}
	for _, opt := range parts[1:] {
		if opt == "omitempty" {
			optional = true
		}
	}
	return parts[0], optional, true
}

func typeScriptType(expr ast.Expr) (string, error) {
	switch t := expr.(type) {
	case *ast.Ident:
		return identType(t.Name), nil
	case *ast.InterfaceType:
		if len(t.Methods.List) == 0 {
			return "unknown", nil
		}
		return "", fmt.Errorf("interface with methods is not a wire type")
	case *ast.StarExpr:
		// A nil pointer marshals to null, so the client must handle it.
		inner, err := typeScriptType(t.X)
		if err != nil {
			return "", err
		}
		return inner + " | null", nil
	case *ast.ArrayType:
		inner, err := typeScriptType(t.Elt)
		if err != nil {
			return "", err
		}
		return inner + "[]", nil
	case *ast.MapType:
		key, err := typeScriptType(t.Key)
		if err != nil {
			return "", err
		}
		if key != "string" {
			return "", fmt.Errorf("a map key must be a string on the wire, got %s", key)
		}
		value, err := typeScriptType(t.Value)
		if err != nil {
			return "", err
		}
		// A nil map marshals to null exactly as a nil pointer does.
		return fmt.Sprintf("Record<string, %s> | null", value), nil
	default:
		return "", fmt.Errorf("%T cannot be expressed as a wire type", expr)
	}
}

func identType(name string) string {
	switch name {
	case "string":
		return "string"
	case "bool":
		return "boolean"
	case "int", "int8", "int16", "int32", "int64",
		"uint", "uint8", "uint16", "uint32", "uint64",
		"float32", "float64":
		return "number"
	case "any":
		return "unknown"
	default:
		return name // a named type declared elsewhere in the contract
	}
}

// screamingSnake turns a Go type name into the client's constant name, leaving
// an initialism intact: WSEventType is WS_EVENT_TYPE, not W_S_EVENT_TYPE.
func screamingSnake(name string) string {
	runes := []rune(name)
	var b strings.Builder
	for i, r := range runes {
		if i > 0 && isUpper(r) && (!isUpper(runes[i-1]) || (i+1 < len(runes) && !isUpper(runes[i+1]))) {
			b.WriteByte('_')
		}
		b.WriteRune(r)
	}
	return strings.ToUpper(b.String())
}

func isUpper(r rune) bool { return r >= 'A' && r <= 'Z' }

// objectKey quotes a wire value that is not a bare JavaScript identifier —
// event names like `trip.changed` are keys as much as `validation` is.
func objectKey(value string) string {
	if value == "" || strings.ContainsAny(value[:1], "0123456789") {
		return "'" + value + "'"
	}
	if strings.IndexFunc(value, func(r rune) bool { return !strings.ContainsRune(jsIdentChars, r) }) >= 0 {
		return "'" + value + "'"
	}
	return value
}
