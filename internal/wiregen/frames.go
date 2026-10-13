package wiregen

import (
	"fmt"
	"go/ast"
	"go/token"
	"sort"
	"strconv"
	"strings"
)

// payloadsSuffix marks the table that turns an envelope into a discriminated
// union: `var wsEventPayloads = map[WSEventType]any{...}` beside
// `type WSEvent struct{...}`. Go has no sum type, so the table is the
// declaration of which payload each value of the enum carries.
const payloadsSuffix = "payloads"

// channelConstPrefix marks an untyped constant the client spells a channel
// name with — vocabulary of the WebSocket frame that is not a type.
const channelConstPrefix = "WSChannel"

// frameUnion is one envelope's table: the enum discriminating it, and the
// TypeScript payload type per enum value.
type frameUnion struct {
	varName  string
	enum     string
	payloads map[string]string
	// order is the enum's declaration order, which the union keeps.
	order   []string
	written bool
}

// frameUnions is keyed by the envelope's lower-cased name.
type frameUnions map[string]*frameUnion

func (u frameUnions) of(structName string) (*frameUnion, bool) {
	fu, ok := u[strings.ToLower(structName)]
	return fu, ok
}

// allWritten refuses a table no envelope picked up: its name says it shapes a
// struct, and a misspelt one would otherwise leave the client the loose type
// without a word.
func (u frameUnions) allWritten() error {
	var orphans []string
	for _, fu := range u {
		if !fu.written {
			orphans = append(orphans, fu.varName)
		}
	}
	if len(orphans) > 0 {
		sort.Strings(orphans)
		return fmt.Errorf("%s: no struct of that name without the %q suffix", strings.Join(orphans, ", "), payloadsSuffix)
	}
	return nil
}

// enumConst is one typed string constant: the enum it belongs to and its value.
type enumConst struct{ enum, value string }

// collectFrameUnions reads every `…Payloads` table. A table must name every
// value of its enum, and only those: a frame type without a declared payload
// is exactly the loose end the union exists to close.
func collectFrameUnions(files []*ast.File, enums map[string][]string, consts map[string]enumConst) (frameUnions, error) {
	out := frameUnions{}
	for _, file := range files {
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != token.VAR {
				continue
			}
			for _, spec := range gen.Specs {
				vs, ok := spec.(*ast.ValueSpec)
				if !ok || len(vs.Names) != 1 || len(vs.Values) != 1 {
					continue
				}
				name := vs.Names[0].Name
				if !strings.HasSuffix(strings.ToLower(name), payloadsSuffix) {
					continue
				}
				fu, err := readFrameTable(name, vs.Values[0], enums, consts)
				if err != nil {
					return nil, err
				}
				out[strings.TrimSuffix(strings.ToLower(name), payloadsSuffix)] = fu
			}
		}
	}
	return out, nil
}

func readFrameTable(name string, value ast.Expr, enums map[string][]string, consts map[string]enumConst) (*frameUnion, error) {
	lit, ok := value.(*ast.CompositeLit)
	if !ok {
		return nil, fmt.Errorf("%s: want a map literal", name)
	}
	mt, ok := lit.Type.(*ast.MapType)
	if !ok {
		return nil, fmt.Errorf("%s: want a map literal", name)
	}
	enum, ok := mt.Key.(*ast.Ident)
	if !ok || len(enums[enum.Name]) == 0 {
		return nil, fmt.Errorf("%s: the key must be a string enum of the contract", name)
	}
	fu := &frameUnion{varName: name, enum: enum.Name, payloads: map[string]string{}, order: enums[enum.Name]}
	for _, elt := range lit.Elts {
		kv, ok := elt.(*ast.KeyValueExpr)
		if !ok {
			return nil, fmt.Errorf("%s: want key: value entries", name)
		}
		key, ok := kv.Key.(*ast.Ident)
		if !ok {
			return nil, fmt.Errorf("%s: a key must be one of %s's constants", name, enum.Name)
		}
		c, known := consts[key.Name]
		if !known || c.enum != enum.Name {
			return nil, fmt.Errorf("%s: %s is not a constant of %s", name, key.Name, enum.Name)
		}
		payload, err := payloadType(kv.Value)
		if err != nil {
			return nil, fmt.Errorf("%s[%s]: %w", name, key.Name, err)
		}
		fu.payloads[c.value] = payload
	}
	for _, v := range enums[enum.Name] {
		if _, ok := fu.payloads[v]; !ok {
			return nil, fmt.Errorf("%s declares no payload for %s %q", name, enum.Name, v)
		}
	}
	return fu, nil
}

// payloadType reads one table entry: a zero value of the payload's struct,
// or nil for a frame that carries none.
func payloadType(expr ast.Expr) (string, error) {
	switch v := expr.(type) {
	case *ast.CompositeLit:
		if id, ok := v.Type.(*ast.Ident); ok {
			return id.Name, nil
		}
	case *ast.Ident:
		if v.Name == "nil" {
			return "null", nil
		}
	}
	return "", fmt.Errorf("want a struct's zero value or nil")
}

// writeFrameUnion emits the envelope as the union of its frames, one member
// per enum value in declaration order. The discriminant is the field typed by
// the enum; the payload, the envelope's one other wire field.
func writeFrameUnion(b *strings.Builder, name, doc string, st *ast.StructType, fu *frameUnion) error {
	var disc, payload string
	for _, field := range st.Fields.List {
		key, _, ok := wireName(field)
		if !ok {
			continue
		}
		if id, isIdent := field.Type.(*ast.Ident); isIdent && id.Name == fu.enum {
			disc = key
		} else if payload == "" {
			payload = key
		} else {
			return fmt.Errorf("%s: a frame envelope carries its %s and one payload, nothing else", name, fu.enum)
		}
	}
	if disc == "" || payload == "" {
		return fmt.Errorf("%s: want a %s field and a payload field", name, fu.enum)
	}
	writeDoc(b, doc)
	fmt.Fprintf(b, "export type %s =\n", name)
	for _, v := range fu.order {
		fmt.Fprintf(b, "  | { %s: '%s'; %s: %s }\n", disc, v, payload, fu.payloads[v])
	}
	b.WriteString("\n")
	fu.written = true
	return nil
}

// writeChannelConsts emits each WSChannel* constant of a const block.
func writeChannelConsts(b *strings.Builder, gen *ast.GenDecl) {
	for _, spec := range gen.Specs {
		vs, ok := spec.(*ast.ValueSpec)
		if !ok || vs.Type != nil || len(vs.Names) != 1 || len(vs.Values) != 1 {
			continue
		}
		name := vs.Names[0].Name
		if !strings.HasPrefix(name, channelConstPrefix) {
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
		doc := ""
		if vs.Doc != nil {
			doc = vs.Doc.Text()
		} else if gen.Doc != nil {
			doc = gen.Doc.Text()
		}
		writeDoc(b, doc)
		fmt.Fprintf(b, "export const %s = '%s'\n\n", screamingSnake(name), value)
	}
}
