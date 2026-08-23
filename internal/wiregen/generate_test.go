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
