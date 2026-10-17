package api

import (
	"go/ast"
	"go/parser"
	gotoken "go/token"
	"os"
	"path/filepath"
	"reflect"
	"slices"
	"strconv"
	"strings"
	"testing"

	"jitpack/internal/store"
)

// The notification vocabulary is spelled in three places the compiler cannot
// join: the store's kinds, internal/notify's payload keys and push body (notify
// cannot import this package), and wire.go, which cmd/wiregen reads as source
// and so must hold literals. These tests are what makes the three one
// vocabulary (NFR-4.14, ADR-026).

// stringConsts reads every string constant of the Go files in dir (tests
// excluded) whose name passes keep, as name → value. It parses rather than
// reflects because a constant has no runtime identity.
func stringConsts(t *testing.T, dir string, keep func(name string, typ ast.Expr) bool) map[string]string {
	t.Helper()
	out := map[string]string{}
	for _, file := range parseDir(t, dir) {
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != gotoken.CONST {
				continue
			}
			for _, spec := range gen.Specs {
				vs, ok := spec.(*ast.ValueSpec)
				if !ok || len(vs.Names) != 1 || len(vs.Values) != 1 || !keep(vs.Names[0].Name, vs.Type) {
					continue
				}
				lit, ok := vs.Values[0].(*ast.BasicLit)
				if !ok || lit.Kind != gotoken.STRING {
					continue
				}
				value, err := strconv.Unquote(lit.Value)
				if err != nil {
					t.Fatal(err)
				}
				out[vs.Names[0].Name] = value
			}
		}
	}
	if len(out) == 0 {
		t.Fatalf("%s: no constant matched — a mirror that scanned nothing must not report ok", dir)
	}
	return out
}

func parseDir(t *testing.T, dir string) []*ast.File {
	t.Helper()
	entries, err := os.ReadDir(dir)
	if err != nil {
		t.Fatal(err)
	}
	var files []*ast.File
	for _, e := range entries {
		name := e.Name()
		if !strings.HasSuffix(name, ".go") || strings.HasSuffix(name, "_test.go") {
			continue
		}
		f, err := parser.ParseFile(gotoken.NewFileSet(), filepath.Join(dir, name), nil, 0)
		if err != nil {
			t.Fatal(err)
		}
		files = append(files, f)
	}
	return files
}

// ofType keeps the constants declared with the named type.
func ofType(typeName string) func(string, ast.Expr) bool {
	return func(_ string, typ ast.Expr) bool {
		id, ok := typ.(*ast.Ident)
		return ok && id.Name == typeName
	}
}

// untypedNamed keeps the untyped constants whose name starts with prefix
// followed by an upper-case letter.
func untypedNamed(prefix string) func(string, ast.Expr) bool {
	return func(name string, typ ast.Expr) bool {
		rest, ok := strings.CutPrefix(name, prefix)
		return typ == nil && ok && rest != "" && rest[0] >= 'A' && rest[0] <= 'Z'
	}
}

func sortedValues(m map[string]string) []string {
	out := make([]string, 0, len(m))
	for _, v := range m {
		out = append(out, v)
	}
	slices.Sort(out)
	return out
}

func sameSet(t *testing.T, what string, wire, other []string) {
	t.Helper()
	slices.Sort(wire)
	slices.Sort(other)
	if !slices.Equal(wire, other) {
		t.Errorf("%s: wire.go declares %v, the server uses %v", what, wire, other)
	}
}

const notifyDir = "../notify"

func TestWireNotificationKinds_MirrorStore(t *testing.T) {
	sameSet(t, "notification kinds", sortedValues(stringConsts(t, ".", ofType("NotificationKind"))), store.NotificationKinds())
}

func TestWireNotificationPayload_MirrorNotify(t *testing.T) {
	sameSet(t, "payload keys",
		sortedValues(stringConsts(t, ".", ofType("NotificationPayloadKey"))),
		sortedValues(stringConsts(t, notifyDir, untypedNamed("payload"))))
	sameSet(t, "due words",
		sortedValues(stringConsts(t, ".", ofType("NotificationDue"))),
		sortedValues(stringConsts(t, notifyDir, untypedNamed("due"))))
}

// The push body's keys, in order, as notify's pushMessage declares them.
func notifyPushMessageKeys(t *testing.T) []string {
	t.Helper()
	for _, file := range parseDir(t, notifyDir) {
		for _, decl := range file.Decls {
			gen, ok := decl.(*ast.GenDecl)
			if !ok || gen.Tok != gotoken.TYPE {
				continue
			}
			for _, spec := range gen.Specs {
				ts := spec.(*ast.TypeSpec)
				st, ok := ts.Type.(*ast.StructType)
				if !ok || ts.Name.Name != "pushMessage" {
					continue
				}
				var keys []string
				for _, field := range st.Fields.List {
					raw, err := strconv.Unquote(field.Tag.Value)
					if err != nil {
						t.Fatal(err)
					}
					keys = append(keys, reflect.StructTag(raw).Get("json"))
				}
				return keys
			}
		}
	}
	t.Fatal("internal/notify declares no pushMessage")
	return nil
}

func TestWireWebPushMessage_MirrorNotify(t *testing.T) {
	var wire []string
	rt := reflect.TypeFor[WebPushMessage]()
	for i := range rt.NumField() {
		wire = append(wire, rt.Field(i).Tag.Get("json"))
	}
	if got := notifyPushMessageKeys(t); !slices.Equal(wire, got) {
		t.Errorf("push body: wire.go declares %v, internal/notify sends %v", wire, got)
	}
}

// Sync-API §7: every frame the hub builds carries the payload wsEventPayloads
// declares for its type — the table the client's discriminated union is
// generated from, so a frame built otherwise would reach a client typed
// against a shape it does not have.
func TestWSEventPayloads_EveryFrameCarriesItsDeclaredPayload(t *testing.T) {
	frames := []WSEvent{
		tripChangedEvent("t1", 1),
		masterChangedEvent(1),
		itemLockEvent(EventItemLocked, "t1", "i1", "u1", "Zelt"),
		itemLockEvent(EventItemUnlocked, "t1", "i1", "u1", "Zelt"),
		presenceEvent("t1", 0, nil),
		rosterEvent(nil),
		notificationCreatedEvent("n1"),
		locationEvent(LiveLocation{}),
		{Type: EventPong},
	}
	seen := map[WSEventType]bool{}
	for _, f := range frames {
		want, declared := wsEventPayloads[f.Type]
		if !declared {
			t.Errorf("%s: no payload declared in wsEventPayloads", f.Type)
			continue
		}
		if reflect.TypeOf(f.Payload) != reflect.TypeOf(want) {
			t.Errorf("%s carries %T, wsEventPayloads declares %T", f.Type, f.Payload, want)
		}
		seen[f.Type] = true
	}
	for typ := range wsEventPayloads {
		if !seen[typ] {
			t.Errorf("%s: declared but no frame builder is checked here", typ)
		}
	}
}
