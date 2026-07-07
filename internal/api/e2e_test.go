package api_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strconv"
	"testing"

	syncpkg "jitpack/internal/sync"
)

// The walking-skeleton scenario from CODING_PRINCIPLES §2: two clients
// edit the same item while offline; after both push and pull, their local
// replicas converge and the NFR-4.2a rules decide the winner.

type e2eClock struct{ millis int64 }

func (c *e2eClock) NowMillis() int64 { return c.millis }

// client simulates a device: its own HLC generator, an outbox of pending
// mutations, a pull cursor, and a local replica of the trip partition.
type client struct {
	t       *testing.T
	baseURL string
	bearer  string
	gen     *syncpkg.Generator
	outbox  []map[string]any
	cursor  int64
	local   map[string]map[string]any // table/id → row
}

func newClient(t *testing.T, srv *httptest.Server, userID, deviceID string, clock syncpkg.Clock) *client {
	t.Helper()
	gen, err := syncpkg.NewGenerator(clock, deviceID)
	if err != nil {
		t.Fatalf("NewGenerator: %v", err)
	}
	return &client{
		t: t, baseURL: srv.URL, bearer: token(t, userID, testSecret),
		gen: gen, local: map[string]map[string]any{},
	}
}

// edit records a mutation locally first (UI-Spec G-5: optimistic) and
// queues it in the outbox — this is the offline write path.
func (c *client) edit(id, mutID, op string, fields map[string]any) {
	hlc := c.gen.Next()
	c.outbox = append(c.outbox, mutation(id, mutID, op, fields, string(hlc)))
	key := "trip_items/" + id
	if c.local[key] == nil {
		c.local[key] = map[string]any{}
	}
	for f, v := range fields {
		c.local[key][f] = v
	}
}

// drainOutbox pushes all queued mutations (Sync-API Spec P-2).
func (c *client) drainOutbox() []pushResultWire {
	c.t.Helper()
	resp, raw := doJSON(c.t, http.MethodPost, c.baseURL+"/api/v1/sync/trips/"+trip, c.bearer,
		map[string]any{"mutations": c.outbox})
	if resp.StatusCode != http.StatusOK {
		c.t.Fatalf("push status = %d, body %s", resp.StatusCode, raw)
	}
	c.outbox = nil
	var out struct {
		Results []pushResultWire `json:"results"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		c.t.Fatalf("decode push: %v", err)
	}
	return out.Results
}

type pushResultWire struct {
	MutationID string `json:"mutation_id"`
	Outcome    string `json:"outcome"`
}

// pull applies server snapshots verbatim (Sync-API Spec P-4: clients
// never merge) until the change feed is drained.
func (c *client) pull() {
	c.t.Helper()
	for {
		url := c.baseURL + "/api/v1/sync/trips/" + trip + "?cursor=" + itoa(c.cursor)
		resp, raw := doJSON(c.t, http.MethodGet, url, c.bearer, nil)
		if resp.StatusCode != http.StatusOK {
			c.t.Fatalf("pull status = %d, body %s", resp.StatusCode, raw)
		}
		var page struct {
			Changes []struct {
				Table   string         `json:"table"`
				ID      string         `json:"id"`
				Deleted bool           `json:"deleted"`
				Row     map[string]any `json:"row"`
				Seq     int64          `json:"seq"`
			} `json:"changes"`
			NextCursor int64 `json:"next_cursor"`
			HasMore    bool  `json:"has_more"`
		}
		if err := json.Unmarshal(raw, &page); err != nil {
			c.t.Fatalf("decode pull: %v", err)
		}
		for _, ch := range page.Changes {
			key := ch.Table + "/" + ch.ID
			if ch.Deleted {
				delete(c.local, key)
				continue
			}
			c.local[key] = ch.Row
		}
		c.cursor = page.NextCursor
		if !page.HasMore {
			return
		}
	}
}

func itoa(n int64) string {
	return strconv.FormatInt(n, 10)
}

func TestE2E_ConcurrentOfflineEdits_ConvergePerNFR42a(t *testing.T) {
	srv := newTestServer(t)
	clockA, clockB := &e2eClock{millis: 1_000}, &e2eClock{millis: 1_000}
	andy := newClient(t, srv, userA, "aaaaaaaa", clockA)
	sarah := newClient(t, srv, userB, "bbbbbbbb", clockB)

	// Andy creates the item online; both devices sync it.
	andy.edit("item-1", "a-1", "insert", map[string]any{
		"trip_id": trip, "name": "Unterhosen", "quantity": 5, "state": "open",
	})
	andy.drainOutbox()
	andy.pull()
	sarah.pull()

	// Both go offline. Andy packs the item in the basement…
	clockA.millis = 2_000
	andy.edit("item-1", "a-2", "upsert", map[string]any{"state": "packed", "packed_count": 5})

	// …while Sarah, with the *later* wall clock, starts searching for it.
	clockB.millis = 3_000
	sarah.edit("item-1", "s-1", "upsert", map[string]any{"state": "packing_now", "packing_now_by": userB})

	// Back online: Andy pushes first, Sarah second.
	andyResults := andy.drainOutbox()
	sarahResults := sarah.drainOutbox()

	if andyResults[0].Outcome != "applied" {
		t.Errorf("andy outcome = %q, want applied", andyResults[0].Outcome)
	}
	if sarahResults[0].Outcome != "merged" {
		t.Errorf("sarah outcome = %q, want merged (packed beats packing_now, NFR-4.2a rule 2)", sarahResults[0].Outcome)
	}

	// Both pull to convergence.
	andy.pull()
	sarah.pull()

	item := andy.local["trip_items/item-1"]
	if item["state"] != "packed" {
		t.Errorf("converged state = %v, want packed despite Sarah's newer HLC", item["state"])
	}
	if item["packed_count"] != float64(5) {
		t.Errorf("converged packed_count = %v, want 5", item["packed_count"])
	}
	if !reflect.DeepEqual(andy.local, sarah.local) {
		t.Errorf("replicas diverged:\nandy:  %v\nsarah: %v", andy.local, sarah.local)
	}
}

// Losing a feedback flag would silently corrupt the post-trip review
// (FR-9.1); the additive rule must survive the full HTTP round trip.
func TestE2E_MissingFlagSurvivesConcurrentWrite(t *testing.T) {
	srv := newTestServer(t)
	clockA, clockB := &e2eClock{millis: 1_000}, &e2eClock{millis: 1_000}
	andy := newClient(t, srv, userA, "aaaaaaaa", clockA)
	sarah := newClient(t, srv, userB, "bbbbbbbb", clockB)

	andy.edit("item-1", "a-1", "insert", map[string]any{
		"trip_id": trip, "name": "Sonnencreme", "quantity": 1, "state": "open",
	})
	andy.drainOutbox()
	andy.pull()
	sarah.pull()

	// Sarah flags Missing offline with an *older* clock than Andy's
	// concurrent quantity edit.
	clockB.millis = 1_500
	sarah.edit("item-1", "s-1", "upsert", map[string]any{"flag_missing": 1})
	clockA.millis = 5_000
	andy.edit("item-1", "a-2", "upsert", map[string]any{"quantity": 2})

	andy.drainOutbox()
	sarah.drainOutbox()
	andy.pull()
	sarah.pull()

	item := sarah.local["trip_items/item-1"]
	if item["flag_missing"] != float64(1) {
		t.Errorf("flag_missing = %v, want 1 (additive rule, NFR-4.2a rule 1)", item["flag_missing"])
	}
	if item["quantity"] != float64(2) {
		t.Errorf("quantity = %v, want 2 (LWW)", item["quantity"])
	}
	if !reflect.DeepEqual(andy.local, sarah.local) {
		t.Errorf("replicas diverged:\nandy:  %v\nsarah: %v", andy.local, sarah.local)
	}
}
