package wiregen

import (
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"regexp"
	"sort"
	"strconv"
	"strings"
)

// The declaration's own spelling, read by name: the registry, the helper
// that lists a table's columns, and the two feeds. A rename on the Go side
// is a refusal here rather than an empty file (ADR-026).
const (
	registryVar     = "tableSpecs"
	columnsHelper   = "toSet"
	partitionField  = "partition"
	columnsField    = "columns"
	partitionTripGo = "partitionTrip"
	partitionMastGo = "partitionMaster"
)

// feeds maps the registry's partition constants to the client's
// `PartitionType` (Sync-API P-3).
var feeds = map[string]string{partitionTripGo: "trip", partitionMastGo: "master"}

// registeredTable is one entry of the registry as the generator needs it.
type registeredTable struct {
	name      string
	partition string
	pushable  map[string]bool
}

// schemaTable is one CREATE TABLE as the generator needs it: its columns in
// declaration order, and the vocabulary of each text column a CHECK closes.
type schemaTable struct {
	columns []string
	enums   map[string][]string
}

// GenerateTables reads the store package's sources and schema.sql and returns
// the TypeScript module of the per-table contract (ARCH-11, ADR-026): the
// table names and feeds from `tableSpecs`, every column and every text
// vocabulary from the schema, and the push whitelist. goFiles maps a file
// name to its source; the registry and the constants it names may sit in
// different files, as they do in the store package.
//
// It refuses rather than guesses: a whitelisted column the schema lacks is
// exactly the drift a generated file is meant to end, so it is reported here
// instead of written down for the client to trust.
func GenerateTables(goFiles map[string][]byte, schema []byte) (string, error) {
	registry, err := readRegistry(goFiles)
	if err != nil {
		return "", err
	}
	tables, err := readSchema(string(schema))
	if err != nil {
		return "", err
	}
	for _, t := range registry {
		st, ok := tables[t.name]
		if !ok {
			return "", fmt.Errorf("%s registers %q, which schema.sql does not create", registryVar, t.name)
		}
		declared := map[string]bool{}
		for _, c := range st.columns {
			declared[c] = true
		}
		for _, c := range sortedKeys(t.pushable) {
			if !declared[c] {
				return "", fmt.Errorf("%s whitelists %s.%s, which schema.sql does not declare", registryVar, t.name, c)
			}
		}
	}

	var b strings.Builder
	writeTablesHeader(&b)
	writeTableNames(&b, registry)
	writeTablePartitions(&b, registry)
	writeColumnLists(&b, registry, tables)
	writeColumnEnums(&b, registry, tables)
	return strings.TrimRight(b.String(), "\n") + "\n", nil
}

// readRegistry parses every file, resolves the package's string constants,
// and reads `tableSpecs` in source order — the order the client's TABLE keeps.
func readRegistry(goFiles map[string][]byte) ([]registeredTable, error) {
	fset := token.NewFileSet()
	consts := map[string]string{}
	var registry *ast.CompositeLit
	for _, name := range sortedKeys(goFiles) {
		file, err := parser.ParseFile(fset, name, goFiles[name], 0)
		if err != nil {
			return nil, fmt.Errorf("parse %s: %w", name, err)
		}
		collectStringConsts(file, consts)
		if lit := findRegistry(file); lit != nil {
			registry = lit
		}
	}
	if registry == nil {
		return nil, fmt.Errorf("no %s map literal in the store package — the generator has nothing to read", registryVar)
	}

	resolve := func(expr ast.Expr) (string, error) {
		switch e := expr.(type) {
		case *ast.BasicLit:
			if e.Kind == token.STRING {
				return strconv.Unquote(e.Value)
			}
		case *ast.Ident:
			if v, ok := consts[e.Name]; ok {
				return v, nil
			}
			return "", fmt.Errorf("%s is no string constant of the store package", e.Name)
		}
		return "", fmt.Errorf("%T is neither a string nor a constant", expr)
	}

	out := make([]registeredTable, 0, len(registry.Elts))
	for _, elt := range registry.Elts {
		kv, ok := elt.(*ast.KeyValueExpr)
		if !ok {
			return nil, fmt.Errorf("%s holds an entry without a key", registryVar)
		}
		name, err := resolve(kv.Key)
		if err != nil {
			return nil, fmt.Errorf("%s key: %w", registryVar, err)
		}
		spec, ok := kv.Value.(*ast.CompositeLit)
		if !ok {
			return nil, fmt.Errorf("%s[%s] is not a literal", registryVar, name)
		}
		table, err := readSpec(name, spec, resolve)
		if err != nil {
			return nil, err
		}
		out = append(out, table)
	}
	return out, nil
}

func readSpec(name string, spec *ast.CompositeLit, resolve func(ast.Expr) (string, error)) (registeredTable, error) {
	table := registeredTable{name: name, pushable: map[string]bool{}}
	for _, elt := range spec.Elts {
		kv, ok := elt.(*ast.KeyValueExpr)
		if !ok {
			continue
		}
		field, ok := kv.Key.(*ast.Ident)
		if !ok {
			continue
		}
		switch field.Name {
		case partitionField:
			id, _ := kv.Value.(*ast.Ident)
			if id == nil || feeds[id.Name] == "" {
				return table, fmt.Errorf("%s[%s].%s is %s, not a feed the client knows",
					registryVar, name, partitionField, exprName(kv.Value))
			}
			table.partition = feeds[id.Name]
		case columnsField:
			call, _ := kv.Value.(*ast.CallExpr)
			if call == nil || exprName(call.Fun) != columnsHelper {
				return table, fmt.Errorf("%s[%s].%s must be a %s(…) call the generator can read",
					registryVar, name, columnsField, columnsHelper)
			}
			for _, arg := range call.Args {
				col, err := resolve(arg)
				if err != nil {
					return table, fmt.Errorf("%s[%s].%s: %w", registryVar, name, columnsField, err)
				}
				table.pushable[col] = true
			}
		}
	}
	if table.partition == "" {
		return table, fmt.Errorf("%s[%s] names no %s", registryVar, name, partitionField)
	}
	return table, nil
}

func exprName(expr ast.Expr) string {
	if id, ok := expr.(*ast.Ident); ok {
		return id.Name
	}
	return fmt.Sprintf("%T", expr)
}

func collectStringConsts(file *ast.File, into map[string]string) {
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.CONST {
			continue
		}
		for _, spec := range gen.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok || len(vs.Values) != len(vs.Names) {
				continue
			}
			for i, n := range vs.Names {
				lit, ok := vs.Values[i].(*ast.BasicLit)
				if !ok || lit.Kind != token.STRING {
					continue
				}
				if v, err := strconv.Unquote(lit.Value); err == nil {
					into[n.Name] = v
				}
			}
		}
	}
}

func findRegistry(file *ast.File) *ast.CompositeLit {
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.VAR {
			continue
		}
		for _, spec := range gen.Specs {
			vs, ok := spec.(*ast.ValueSpec)
			if !ok || len(vs.Names) != 1 || vs.Names[0].Name != registryVar || len(vs.Values) != 1 {
				continue
			}
			if lit, ok := vs.Values[0].(*ast.CompositeLit); ok {
				return lit
			}
		}
	}
	return nil
}

var (
	createTable = regexp.MustCompile(`(?i)CREATE\s+TABLE\s+(\w+)\s*\(`)
	lineComment = regexp.MustCompile(`--[^\n]*`)
	firstWord   = regexp.MustCompile(`^\w+`)
	// textInList finds a CHECK that names a list of quoted values — the shape
	// a vocabulary takes, whatever surrounds it.
	textInList = regexp.MustCompile(`(?i)\bIN\s*\(\s*'`)
	// vocabulary is the one shape of it the generator reads:
	// `CHECK (col IN (…))`, optionally `col IS NULL OR` in front.
	vocabulary = regexp.MustCompile(`(?i)CHECK\s*\(\s*(\w+)\s+(?:IS\s+NULL\s+OR\s+(\w+)\s+)?IN\s*\(([^)]*)\)\s*\)`)
	// vocabularyValue is what one value may be: a word, which the client
	// spells as a code literal. A quote (`''`), a comma or a parenthesis
	// would need an escape on both sides and is refused instead.
	vocabularyValue = regexp.MustCompile(`^\w+$`)
)

// tableConstraints are the words a table-level clause opens with; any other
// first word in a CREATE TABLE body is a column name.
var tableConstraints = map[string]bool{
	"PRIMARY": true, "UNIQUE": true, "FOREIGN": true, "CHECK": true, "CONSTRAINT": true,
}

// readSchema reads every CREATE TABLE. It is not an SQL parser and does not
// try to be: schema.sql is this repository's own file, and a shape the
// generator does not recognise is refused rather than skipped.
func readSchema(schema string) (map[string]schemaTable, error) {
	schema = lineComment.ReplaceAllString(schema, "")
	out := map[string]schemaTable{}
	for _, m := range createTable.FindAllStringSubmatchIndex(schema, -1) {
		name := schema[m[2]:m[3]]
		body, ok := parenBody(schema[m[1]:])
		if !ok {
			return nil, fmt.Errorf("schema.sql: CREATE TABLE %s has no closing parenthesis", name)
		}
		table := schemaTable{enums: map[string][]string{}}
		for _, clause := range splitTopLevel(body) {
			word := firstWord.FindString(clause)
			if word == "" {
				continue
			}
			if !tableConstraints[strings.ToUpper(word)] {
				table.columns = append(table.columns, word)
			}
			if !textInList.MatchString(clause) {
				continue
			}
			col, values, err := readVocabulary(clause)
			if err != nil {
				return nil, fmt.Errorf("schema.sql: %s.%s: %w", name, word, err)
			}
			table.enums[col] = values
		}
		out[name] = table
	}
	return out, nil
}

func readVocabulary(clause string) (string, []string, error) {
	m := vocabulary.FindStringSubmatch(clause)
	if m == nil || (m[2] != "" && m[2] != m[1]) {
		return "", nil, fmt.Errorf("a CHECK lists text values in a shape the generator cannot read: %s",
			strings.Join(strings.Fields(clause), " "))
	}
	var values []string
	for _, raw := range strings.Split(m[3], ",") {
		raw = strings.TrimSpace(raw)
		if len(raw) < 2 || raw[0] != '\'' || raw[len(raw)-1] != '\'' {
			return "", nil, fmt.Errorf("%q in a text vocabulary is not a quoted value", raw)
		}
		value := raw[1 : len(raw)-1]
		if !vocabularyValue.MatchString(value) {
			return "", nil, fmt.Errorf("%q in a text vocabulary is not a plain word", raw)
		}
		values = append(values, value)
	}
	return m[1], values, nil
}

// parenBody returns what stands between an already-opened parenthesis and
// the one that closes it.
func parenBody(s string) (string, bool) {
	depth := 1
	inString := false
	for i, r := range s {
		switch {
		case r == '\'':
			inString = !inString
		case inString:
		case r == '(':
			depth++
		case r == ')':
			depth--
			if depth == 0 {
				return s[:i], true
			}
		}
	}
	return "", false
}

// splitTopLevel splits a CREATE TABLE body at the commas that end a clause,
// not those inside a CHECK, a REFERENCES list or a quoted value.
func splitTopLevel(body string) []string {
	var out []string
	depth, start := 0, 0
	inString := false
	for i, r := range body {
		switch {
		case r == '\'':
			inString = !inString
		case inString:
		case r == '(':
			depth++
		case r == ')':
			depth--
		case r == ',' && depth == 0:
			out = append(out, strings.TrimSpace(body[start:i]))
			start = i + 1
		}
	}
	return append(out, strings.TrimSpace(body[start:]))
}

func writeTablesHeader(b *strings.Builder) {
	b.WriteString(`/**
 * Generated from internal/store/tables.go and internal/store/schema.sql by
 * cmd/wiregen. Do not edit.
 *
 * The per-table half of the contract (ARCH-11, ADR-026): which tables travel
 * the sync protocol and on which feed (` + "`tableSpecs`" + `), every column each
 * table has and the text vocabularies its CHECK lists close (the schema), and
 * the columns a push may set (the whitelist). ` + "`make wire`" + ` regenerates it,
 * and the CI gate refuses a copy that has fallen behind either source.
 */

`)
}

func writeTableNames(b *strings.Builder, registry []registeredTable) {
	b.WriteString("/** The syncable table names, named once (CODING_PRINCIPLES §4a). */\n")
	b.WriteString("export const TABLE = {\n")
	for _, t := range registry {
		fmt.Fprintf(b, "  %s: '%s',\n", camelCase(t.name), t.name)
	}
	b.WriteString("} as const\n\n")
	b.WriteString("/** Any table that travels the sync protocol. */\n")
	b.WriteString("export type SyncTable = (typeof TABLE)[keyof typeof TABLE]\n\n")
}

func writeTablePartitions(b *strings.Builder, registry []registeredTable) {
	b.WriteString("/** The feed each table's changes travel on (Sync-API P-3). */\n")
	b.WriteString("export const TABLE_PARTITION = {\n")
	for _, t := range registry {
		fmt.Fprintf(b, "  %s: '%s',\n", t.name, t.partition)
	}
	b.WriteString("} as const\n\n")
}

func writeColumnLists(b *strings.Builder, registry []registeredTable, tables map[string]schemaTable) {
	b.WriteString("/** Every column of each table, in the schema's order. */\n")
	b.WriteString("export const TABLE_COLUMNS = {\n")
	for _, t := range registry {
		writeArray(b, "  ", t.name, tables[t.name].columns)
	}
	b.WriteString("} as const\n\n")
	b.WriteString("/** A column of `T`. */\n")
	b.WriteString("export type ColumnOf<T extends SyncTable> = (typeof TABLE_COLUMNS)[T][number]\n\n")

	b.WriteString("/**\n * The columns a push may name — everything else is refused before any SQL is\n")
	b.WriteString(" * built. An actor column among them is stripped and stamped by the server\n")
	b.WriteString(" * (invariant 3), so naming it is accepted but decides nothing.\n */\n")
	b.WriteString("export const PUSHABLE_COLUMNS = {\n")
	for _, t := range registry {
		var pushable []string
		for _, c := range tables[t.name].columns {
			if t.pushable[c] {
				pushable = append(pushable, c)
			}
		}
		writeArray(b, "  ", t.name, pushable)
	}
	b.WriteString("} as const\n\n")
	b.WriteString("/** A column of `T` a push may set. */\n")
	b.WriteString("export type PushableColumnOf<T extends SyncTable> = (typeof PUSHABLE_COLUMNS)[T][number]\n\n")
}

func writeColumnEnums(b *strings.Builder, registry []registeredTable, tables map[string]schemaTable) {
	b.WriteString("/** The values each text column's CHECK list allows, in the schema's order. */\n")
	b.WriteString("export const COLUMN_ENUMS = {\n")
	for _, t := range registry {
		st := tables[t.name]
		if len(st.enums) == 0 {
			continue
		}
		fmt.Fprintf(b, "  %s: {\n", t.name)
		for _, c := range st.columns {
			if values, ok := st.enums[c]; ok {
				writeArray(b, "    ", c, values)
			}
		}
		b.WriteString("  },\n")
	}
	b.WriteString("} as const\n\n")
	b.WriteString("/** The vocabulary of column `C` of table `T`. */\n")
	b.WriteString(`export type ColumnEnum<
  T extends keyof typeof COLUMN_ENUMS,
  C extends keyof (typeof COLUMN_ENUMS)[T],
> = (typeof COLUMN_ENUMS)[T][C] extends readonly (infer V)[] ? V : never
`)
}

// writeArray emits one key's string array the way prettier prints it: on
// one line when it fits, one value to a line when it does not.
func writeArray(b *strings.Builder, indent, key string, values []string) {
	quoted := make([]string, len(values))
	for i, v := range values {
		quoted[i] = "'" + v + "'"
	}
	oneLine := fmt.Sprintf("%s%s: [%s],", indent, key, strings.Join(quoted, ", "))
	if len(oneLine) <= printWidth {
		b.WriteString(oneLine + "\n")
		return
	}
	fmt.Fprintf(b, "%s%s: [\n", indent, key)
	for _, q := range quoted {
		fmt.Fprintf(b, "%s  %s,\n", indent, q)
	}
	fmt.Fprintf(b, "%s],\n", indent)
}

// camelCase turns a table name into the client's key: trip_items is tripItems.
func camelCase(name string) string {
	parts := strings.Split(name, "_")
	for i := 1; i < len(parts); i++ {
		if parts[i] != "" {
			parts[i] = strings.ToUpper(parts[i][:1]) + parts[i][1:]
		}
	}
	return strings.Join(parts, "")
}

func sortedKeys[V any](m map[string]V) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return keys
}
