package wiregen_test

import (
	"strings"
	"testing"

	"jitpack/internal/wiregen"
)

// generate runs the generator over an in-line contract source and fails the
// test on error — every case here is about the emitted text, not the plumbing.
func generate(t *testing.T, src string) string {
	t.Helper()
	out, err := wiregen.Generate("wire.go", []byte("package api\n\n"+src))
	if err != nil {
		t.Fatalf("Generate: %v", err)
	}
	return out
}

func TestGenerate_StructFieldsMapToTypeScript(t *testing.T) {
	tests := []struct {
		name  string
		field string
		want  string
	}{
		{"string stays string", "Table string `json:\"table\"`", "table: string"},
		{"int64 is a number", "Seq int64 `json:\"seq\"`", "seq: number"},
		{"int is a number", "Count int `json:\"count\"`", "count: number"},
		{"bool is a boolean", "Deleted bool `json:\"deleted\"`", "deleted: boolean"},
		{"any is unknown", "Value any `json:\"value\"`", "value: unknown"},
		{"a slice is an array", "IDs []string `json:\"ids\"`", "ids: string[]"},
		{
			"a map marshals to null when nil",
			"Row map[string]any `json:\"row\"`",
			"row: Record<string, unknown> | null",
		},
		{
			"a pointer marshals to null when nil",
			"ReadAt *string `json:\"read_at\"`",
			"read_at: string | null",
		},
		{
			"omitempty is an optional field, not a nullable one",
			"Error string `json:\"error,omitempty\"`",
			"error?: string",
		},
		{
			"a named type keeps its name",
			"Op MutationOp `json:\"op\"`",
			"op: MutationOp",
		},
		{
			"a slice of named types keeps the name",
			"Results []MutationResult `json:\"results\"`",
			"results: MutationResult[]",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			got := generate(t, "type Wire struct {\n"+tc.field+"\n}")
			if !strings.Contains(got, tc.want) {
				t.Errorf("emitted TypeScript does not contain %q:\n%s", tc.want, got)
			}
		})
	}
}

func TestGenerate_StructBecomesExportedInterface(t *testing.T) {
	got := generate(t, "type PullResponse struct {\n\tHasMore bool `json:\"has_more\"`\n}")
	if !strings.Contains(got, "export interface PullResponse {") {
		t.Errorf("no exported interface in:\n%s", got)
	}
}

// A field the server never serialises must not appear in the client's type —
// the whole defect class NFR-4.14 exists for is a key on one side only.
func TestGenerate_FieldWithoutJSONTagIsNotOnTheWire(t *testing.T) {
	got := generate(t, "type Wire struct {\n\tInternal string\n\tSkipped string `json:\"-\"`\n\tOn string `json:\"on\"`\n}")
	for _, absent := range []string{"Internal", "Skipped"} {
		if strings.Contains(got, absent) {
			t.Errorf("%q is not on the wire but was emitted:\n%s", absent, got)
		}
	}
	if !strings.Contains(got, "on: string") {
		t.Errorf("the tagged field is missing:\n%s", got)
	}
}

func TestGenerate_NamedStringTypeBecomesAUnionOfItsConstants(t *testing.T) {
	got := generate(t, `type MutationOutcome string

const (
	OutcomeApplied  MutationOutcome = "applied"
	OutcomeMerged   MutationOutcome = "merged"
	OutcomeRejected MutationOutcome = "rejected"
)`)
	want := `export type MutationOutcome = 'applied' | 'merged' | 'rejected'`
	if !strings.Contains(got, want) {
		t.Errorf("want union %q in:\n%s", want, got)
	}
}

// The client branches on error codes, so it needs the values at runtime, not
// only in the type system (CODING_PRINCIPLES §4a: named once, on both sides).
func TestGenerate_ErrorCodesAreEmittedAsRuntimeValues(t *testing.T) {
	got := generate(t, `type ErrorCode string

const (
	ErrValidation ErrorCode = "validation"
	ErrForbidden  ErrorCode = "forbidden"
)`)
	for _, want := range []string{
		"export const ERROR_CODE = {",
		"validation: 'validation'",
		"forbidden: 'forbidden'",
		"} as const",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("want %q in:\n%s", want, got)
		}
	}
}

func TestGenerate_DocCommentTravelsToTheClient(t *testing.T) {
	got := generate(t, "// PullResponse is one page of the change feed.\ntype PullResponse struct {\n\tHasMore bool `json:\"has_more\"`\n}")
	if !strings.Contains(got, "one page of the change feed") {
		t.Errorf("the Go doc comment did not reach the TypeScript:\n%s", got)
	}
}

func TestGenerate_HeaderNamesTheSourceAndForbidsEditing(t *testing.T) {
	got := generate(t, "type Wire struct {\n\tA string `json:\"a\"`\n}")
	for _, want := range []string{"wire.go", "Do not edit"} {
		if !strings.Contains(got, want) {
			t.Errorf("want %q in the header:\n%s", want, got)
		}
	}
}

// Failure path: a type the generator cannot express must stop the build rather
// than emit something plausible — a wrong client type is the defect itself.
func TestGenerate_UnsupportedFieldTypeIsRefused(t *testing.T) {
	_, err := wiregen.Generate("wire.go", []byte("package api\n\ntype Wire struct {\n\tWhen chan int `json:\"when\"`\n}"))
	if err == nil {
		t.Fatal("want an error for an unrepresentable field type, got none")
	}
	if !strings.Contains(err.Error(), "when") {
		t.Errorf("the error must name the field, got %v", err)
	}
}

func TestGenerate_SyntaxErrorIsReported(t *testing.T) {
	if _, err := wiregen.Generate("wire.go", []byte("package api\n\ntype Wire struct {")); err == nil {
		t.Fatal("want a parse error, got none")
	}
}

// The generated file lives under client/src, where prettier and eslint run over
// it. If the generator's output is not already formatted, `make fmt` rewrites it
// and the drift gate fails on a file nobody edited.
func TestGenerate_LongUnionWrapsTheWayPrettierWould(t *testing.T) {
	got := generate(t, `type WSEventType string

const (
	EventTripChanged         WSEventType = "trip.changed"
	EventMasterChanged       WSEventType = "master.changed"
	EventItemLocked          WSEventType = "item.locked"
	EventItemUnlocked        WSEventType = "item.unlocked"
	EventPresence            WSEventType = "presence"
	EventNotificationCreated WSEventType = "notification.created"
)`)
	want := "export type WSEventType =\n  | 'trip.changed'\n  | 'master.changed'\n"
	if !strings.Contains(got, want) {
		t.Errorf("a union past the 100-column print width must wrap one value per line:\n%s", got)
	}
	for _, line := range strings.Split(got, "\n") {
		if len(line) > 100 {
			t.Errorf("line exceeds the client's printWidth of 100: %q", line)
		}
	}
}

func TestGenerate_InitialismKeepsItsShapeInTheRuntimeName(t *testing.T) {
	got := generate(t, "type WSEventType string\n\nconst (\n\tEventPresence WSEventType = \"presence\"\n)")
	if !strings.Contains(got, "export const WS_EVENT_TYPE = {") {
		t.Errorf("want WS_EVENT_TYPE, not W_S_EVENT_TYPE:\n%s", got)
	}
}

func TestGenerate_EndsWithExactlyOneNewline(t *testing.T) {
	got := generate(t, "type Wire struct {\n\tA string `json:\"a\"`\n}")
	if !strings.HasSuffix(got, "}\n") || strings.HasSuffix(got, "\n\n") {
		t.Errorf("a trailing blank line is what prettier strips, and the strip is what fails the gate:\n%q", got[len(got)-10:])
	}
}

// generateRoutes runs the route generator over an in-line contract source.
func generateRoutes(t *testing.T, src string) string {
	t.Helper()
	out, err := wiregen.GenerateRoutes("wire.go", []byte("package api\n\n"+src))
	if err != nil {
		t.Fatalf("GenerateRoutes: %v", err)
	}
	return out
}

// NFR-4.14/ADR-027: the path is declared once in Go and the client's builders
// come from that declaration, so a rename cannot land on one side only.
func TestGenerateRoutes_ShapesTheBuilderAfterTheParameters(t *testing.T) {
	tests := []struct {
		name, decl, want string
	}{
		{
			"a fixed path is a constant, not a function",
			`const RouteMasterSync = "/api/v1/master/sync"`,
			"masterSync: '/api/v1/master/sync',",
		},
		{
			"a placeholder becomes a parameter of its own name",
			`const RouteTripSync = "/api/v1/trips/{tripID}/sync"`,
			"tripSync: (tripID: string) => `/api/v1/trips/${tripID}/sync`,",
		},
		{
			"two placeholders keep the order the path has",
			`const RouteMemberRole = "/api/v1/trips/{tripID}/members/{userID}"`,
			"memberRole: (tripID: string, userID: string) => `/api/v1/trips/${tripID}/members/${userID}`,",
		},
		{
			"an initialism keeps its case after the first word",
			`const RouteTripExportCSV = "/api/v1/trips/{tripID}/export.csv"`,
			"tripExportCSV: (tripID: string) =>",
		},
		{
			"a name that is all initialism lowercases whole",
			`const RouteWS = "/ws"`,
			"ws: '/ws',",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := generateRoutes(t, tc.decl); !strings.Contains(got, tc.want) {
				t.Errorf("want %q in:\n%s", tc.want, got)
			}
		})
	}
}

// The generated file is formatted by prettier along with the rest of
// client/src, so a line the generator leaves too long is rewritten and the
// drift gate fails on a file nobody edited.
func TestGenerateRoutes_BreaksALongBuilderWherePrettierWouldWithNoRoomForTheSignature(t *testing.T) {
	out := generateRoutes(t,
		`const RouteTripConflictRevert = "/api/v1/trips/{tripID}/conflicts/{conflictID}/revert"`)
	want := "  tripConflictRevert: (tripID: string, conflictID: string) =>\n" +
		"    `/api/v1/trips/${tripID}/conflicts/${conflictID}/revert`,"
	if !strings.Contains(out, want) {
		t.Errorf("want the prettier break:\n%s\ngot:\n%s", want, out)
	}
	for _, line := range strings.Split(out, "\n") {
		if len(line) > 100 {
			t.Errorf("line exceeds the client's print width: %q", line)
		}
	}
}

// Only the route constants: the contract's other constants — the error
// vocabulary, the path-variable names — are not paths and must not become
// builders that resolve to nothing.
func TestGenerateRoutes_TakesOnlyWhatIsARoute(t *testing.T) {
	out := generateRoutes(t, `
const PathTripID = "tripID"

type ErrorCode string

const ErrNotFound ErrorCode = "not_found"

const RouteConfig = "/api/v1/config"
`)
	if !strings.Contains(out, "config: '/api/v1/config',") {
		t.Errorf("the route is missing:\n%s", out)
	}
	for _, unwanted := range []string{"tripID", "not_found"} {
		if strings.Contains(out, unwanted) {
			t.Errorf("%q is not a route and must not be emitted:\n%s", unwanted, out)
		}
	}
}

// The grouping comments are the scope rule written where the reader is, so
// they cross over rather than being an ADR reference the client cannot follow.
func TestGenerateRoutes_CarriesTheDeclarationsComment(t *testing.T) {
	out := generateRoutes(t, "const (\n\t// Master scope.\n\tRouteMasterSync = \"/api/v1/master/sync\"\n)")
	if !strings.Contains(out, "  // Master scope.\n  masterSync:") {
		t.Errorf("want the comment above the entry:\n%s", out)
	}
}

func TestGenerateRoutes_RefusesADeclarationWithNoRoutes(t *testing.T) {
	if _, err := wiregen.GenerateRoutes("wire.go", []byte("package api\n")); err == nil {
		t.Fatal("a generator that found no route must fail rather than write an empty object")
	}
}
