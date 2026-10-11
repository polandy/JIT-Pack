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
