package wiregen_test

import (
	"strings"
	"testing"

	"jitpack/internal/wiregen"
)

const frameEnum = `type WSEventType string

const (
	EventTripChanged WSEventType = "trip.changed"
	EventPong        WSEventType = "pong"
)

type TripChangedPayload struct {
	TripID string ` + "`json:\"trip_id\"`" + `
}

type WSEvent struct {
	Type    WSEventType ` + "`json:\"type\"`" + `
	Payload any         ` + "`json:\"payload\"`" + `
}
`

// Sync-API §7: the payload a frame carries is decided by its type, and the
// client is handed exactly that — a union it narrows by switching on the
// type, not a record it casts.
func TestGenerate_PayloadTableMakesTheEnvelopeADiscriminatedUnion(t *testing.T) {
	got := generate(t, frameEnum+`
var wsEventPayloads = map[WSEventType]any{
	EventPong:        nil,
	EventTripChanged: TripChangedPayload{},
}`)
	want := "export type WSEvent =\n" +
		"  | { type: 'trip.changed'; payload: TripChangedPayload }\n" +
		"  | { type: 'pong'; payload: null }\n"
	if !strings.Contains(got, want) {
		t.Errorf("want the union in the enum's order:\n%s", got)
	}
	if strings.Contains(got, "export interface WSEvent") {
		t.Errorf("the envelope must not also be emitted loose:\n%s", got)
	}
}

// Failure path: a frame type the table forgets would reach the client as a
// member its union does not have — the generator refuses instead.
func TestGenerate_PayloadTableMissingAFrameTypeIsRefused(t *testing.T) {
	_, err := wiregen.Generate("wire.go", []byte("package api\n\n"+frameEnum+`
var wsEventPayloads = map[WSEventType]any{
	EventTripChanged: TripChangedPayload{},
}`))
	if err == nil || !strings.Contains(err.Error(), `"pong"`) {
		t.Fatalf("want an error naming the missing frame type, got %v", err)
	}
}

func TestGenerate_PayloadTableWithNoEnvelopeIsRefused(t *testing.T) {
	_, err := wiregen.Generate("wire.go", []byte("package api\n\n"+frameEnum+`
var wsEvtPayloads = map[WSEventType]any{
	EventTripChanged: TripChangedPayload{},
	EventPong:        nil,
}`))
	if err == nil || !strings.Contains(err.Error(), "wsEvtPayloads") {
		t.Fatalf("want an error naming the orphaned table, got %v", err)
	}
}

func TestGenerate_ChannelConstantReachesTheClient(t *testing.T) {
	got := generate(t, "// A trip's channel.\nconst WSChannelTripPrefix = \"trip:\"\n\nconst PathTripID = \"tripID\"")
	if !strings.Contains(got, "/**\n * A trip's channel.\n */\nexport const WS_CHANNEL_TRIP_PREFIX = 'trip:'\n") {
		t.Errorf("want the channel prefix with its doc:\n%s", got)
	}
	if strings.Contains(got, "tripID") {
		t.Errorf("only WSChannel* constants are emitted:\n%s", got)
	}
}

// The contract spans files; a table in one may key an enum declared in the
// other, and the header names every file the client must not edit for.
func TestGenerateFiles_ReadsTheContractAcrossFiles(t *testing.T) {
	got, err := wiregen.GenerateFiles([]wiregen.Source{
		{Name: "wire.go", Src: []byte("package api\n\ntype Pull struct {\n\tSeq int64 `json:\"seq\"`\n}\n")},
		{Name: "wire_ws.go", Src: []byte("package api\n\n" + frameEnum + `
var wsEventPayloads = map[WSEventType]any{EventTripChanged: TripChangedPayload{}, EventPong: nil}`)},
	})
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(got, "internal/api/wire.go, internal/api/wire_ws.go") {
		t.Errorf("the header must name both files:\n%s", got)
	}
	if strings.Index(got, "interface Pull") > strings.Index(got, "type WSEvent =") {
		t.Errorf("declarations must keep file order:\n%s", got)
	}
}

// Failure path: every shape of table or envelope the generator cannot turn
// into a truthful union is refused by name, so a malformed frame table never
// reaches the client as the loose type it exists to replace.
func TestGenerate_MalformedFrameTableIsRefused(t *testing.T) {
	const complete = "\tEventTripChanged: TripChangedPayload{},\n\tEventPong: nil,\n"
	tests := []struct {
		name string
		src  string
		want string
	}{
		{
			"a table built by a call instead of a literal",
			frameEnum + "func buildPayloads() map[WSEventType]any { return nil }\nvar wsEventPayloads = buildPayloads()",
			"want a map literal",
		},
		{
			"a table that is a slice, not a map",
			frameEnum + "var wsEventPayloads = []any{TripChangedPayload{}}",
			"want a map literal",
		},
		{
			"a map keyed by a plain string, not an enum of the contract",
			frameEnum + "var wsEventPayloads = map[string]any{\"pong\": nil}",
			"the key must be a string enum of the contract",
		},
		{
			"a map keyed by a type the contract does not declare",
			frameEnum + "var wsEventPayloads = map[WSKind]any{\n" + complete + "}",
			"the key must be a string enum of the contract",
		},
		{
			"an entry without a key",
			frameEnum + "var wsEventPayloads = map[WSEventType]any{\n" + complete + "\tTripChangedPayload{},\n}",
			"want key: value entries",
		},
		{
			"a key spelt as a literal instead of a constant",
			frameEnum + "var wsEventPayloads = map[WSEventType]any{\n" + complete + "\t\"trip.gone\": nil,\n}",
			"must be one of WSEventType's constants",
		},
		{
			"a key that is no constant at all",
			frameEnum + "var wsEventPayloads = map[WSEventType]any{\n" + complete + "\tEventTripGone: nil,\n}",
			"EventTripGone is not a constant of WSEventType",
		},
		{
			"a payload that is neither a struct's zero value nor nil",
			frameEnum + "var wsEventPayloads = map[WSEventType]any{\n\tEventTripChanged: 7,\n\tEventPong: nil,\n}",
			"wsEventPayloads[EventTripChanged]: want a struct's zero value or nil",
		},
		{
			"a payload spelt as a pointer",
			frameEnum + "var wsEventPayloads = map[WSEventType]any{\n\tEventTripChanged: &TripChangedPayload{},\n\tEventPong: nil,\n}",
			"wsEventPayloads[EventTripChanged]: want a struct's zero value or nil",
		},
		{
			"an envelope that carries a second payload",
			strings.Replace(frameEnum, "Payload any         `json:\"payload\"`",
				"Payload any         `json:\"payload\"`\n\tExtra   string      `json:\"extra\"`", 1) +
				"var wsEventPayloads = map[WSEventType]any{\n" + complete + "}",
			"WSEvent: a frame envelope carries its WSEventType and one payload, nothing else",
		},
		{
			"an envelope without a payload field",
			strings.Replace(frameEnum, "Payload any         `json:\"payload\"`", "", 1) +
				"var wsEventPayloads = map[WSEventType]any{\n" + complete + "}",
			"WSEvent: want a WSEventType field and a payload field",
		},
		{
			"an envelope without a discriminant field",
			strings.Replace(frameEnum, "Type    WSEventType `json:\"type\"`", "", 1) +
				"var wsEventPayloads = map[WSEventType]any{\n" + complete + "}",
			"WSEvent: want a WSEventType field and a payload field",
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			_, err := wiregen.Generate("wire.go", []byte("package api\n\n"+tc.src))
			if err == nil {
				t.Fatal("want a refusal, got none")
			}
			if !strings.Contains(err.Error(), tc.want) {
				t.Errorf("the refusal must say %q, got %v", tc.want, err)
			}
		})
	}
}
