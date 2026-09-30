package api_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"testing"
)

type activityPage struct {
	Entries []struct {
		ID          int64            `json:"id"`
		EntityTable string           `json:"entity_table"`
		Op          string           `json:"op"`
		Label       string           `json:"label"`
		Changes     map[string][]any `json:"changes"`
		ActorUserID string           `json:"actor_user_id"`
		CreatedAt   string           `json:"created_at"`
	} `json:"entries"`
	Before int64 `json:"before"`
}

func readActivity(t *testing.T, url, bearer string) activityPage {
	t.Helper()
	resp, raw := doJSON(t, http.MethodGet, url, bearer, nil)
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET %s = %d, body %s", url, resp.StatusCode, raw)
	}
	var out activityPage
	if err := json.Unmarshal(raw, &out); err != nil {
		t.Fatalf("decode: %v (%s)", err, raw)
	}
	return out
}

// FR-32.1: a member reads who changed what in the trip. The actor is the
// authenticated pusher — nothing in the envelope names it (invariant 3).
func TestActivity_MemberReadsTheTripsLog_FR32_1(t *testing.T) {
	srv := newTestServer(t)
	body := map[string]any{"mutations": []any{
		mutation("item-a1", "ac-1", "upsert", map[string]any{"trip_id": trip, "name": "Badehose"}, "0000000001000-0000-aaaaaaaa"),
		mutation("item-a1", "ac-2", "upsert", map[string]any{"state": "packed", "packed_count": 1}, "0000000001001-0000-aaaaaaaa"),
	}}
	if resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), body); resp.StatusCode != http.StatusOK {
		t.Fatalf("push = %d, body %s", resp.StatusCode, raw)
	}

	out := readActivity(t, srv.URL+"/api/v1/trips/"+trip+"/activity", token(t, userB, testSecret))
	if len(out.Entries) != 2 {
		t.Fatalf("entries = %d, want 2", len(out.Entries))
	}
	packed := out.Entries[0]
	if packed.Op != "update" || packed.Label != "Badehose" || packed.ActorUserID != userA || packed.CreatedAt == "" {
		t.Errorf("newest entry = %+v", packed)
	}
	if got := packed.Changes["state"]; len(got) != 2 || got[1] != "packed" {
		t.Errorf("state change = %v, want [… packed]", got)
	}
	if out.Before != 0 {
		t.Errorf("before = %d on a page that reached the start, want 0", out.Before)
	}
}

// A full page hands out the cursor that reads the next one.
func TestActivity_FullPage_HandsOutTheCursor_FR32_1(t *testing.T) {
	srv := newTestServer(t)
	muts := []any{}
	for i := range 3 {
		muts = append(muts, mutation(fmt.Sprintf("item-p%d", i), fmt.Sprintf("ap-%d", i), "upsert",
			map[string]any{"trip_id": trip, "name": fmt.Sprintf("Ding %d", i)}, fmt.Sprintf("00000000010%02d-0000-aaaaaaaa", i)))
	}
	if resp, raw := doJSON(t, http.MethodPost, pushURL(srv), token(t, userA, testSecret), map[string]any{"mutations": muts}); resp.StatusCode != http.StatusOK {
		t.Fatalf("push = %d, body %s", resp.StatusCode, raw)
	}

	base := srv.URL + "/api/v1/trips/" + trip + "/activity"
	first := readActivity(t, base+"?limit=2", token(t, userA, testSecret))
	if len(first.Entries) != 2 || first.Before != first.Entries[1].ID {
		t.Fatalf("first page = %d entries, before %d", len(first.Entries), first.Before)
	}
	rest := readActivity(t, fmt.Sprintf("%s?limit=2&before=%d", base, first.Before), token(t, userA, testSecret))
	if len(rest.Entries) != 1 || rest.Entries[0].Label != "Ding 0" || rest.Before != 0 {
		t.Errorf("second page = %+v", rest)
	}
}

func TestActivity_Refusals_FR32_1(t *testing.T) {
	srv := newTestServer(t)
	cases := []struct {
		name   string
		url    string
		bearer string
		want   int
	}{
		{"a non-member", "/api/v1/trips/" + trip + "/activity", token(t, "user-x", testSecret), http.StatusForbidden},
		{"no session on the inventory's", "/api/v1/master/activity", "", http.StatusUnauthorized},
		{"a cursor that is not a number", "/api/v1/trips/" + trip + "/activity?before=x", token(t, userA, testSecret), http.StatusUnprocessableEntity},
		{"a limit of zero", "/api/v1/master/activity?limit=0", token(t, userA, testSecret), http.StatusUnprocessableEntity},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			resp, raw := doJSON(t, http.MethodGet, srv.URL+tc.url, tc.bearer, nil)
			if resp.StatusCode != tc.want {
				t.Errorf("status = %d, want %d (%s)", resp.StatusCode, tc.want, raw)
			}
		})
	}
}

// The inventory's log names master-data changes to every account.
func TestActivity_InventoryLog_IsReadByAnotherAccount_FR32_1(t *testing.T) {
	srv := newTestServer(t)
	m := mutation("tpl-ac", "am-1", "upsert", map[string]any{"owner_id": userA, "name": "Skiferien"}, "0000000001000-0000-aaaaaaaa")
	m["table"] = "templates"
	if resp, raw := doJSON(t, http.MethodPost, masterURL(srv), token(t, userA, testSecret), map[string]any{"mutations": []any{m}}); resp.StatusCode != http.StatusOK {
		t.Fatalf("push = %d, body %s", resp.StatusCode, raw)
	}

	out := readActivity(t, srv.URL+"/api/v1/master/activity", token(t, userB, testSecret))
	if len(out.Entries) != 1 || out.Entries[0].EntityTable != "templates" || out.Entries[0].Label != "Skiferien" {
		t.Errorf("inventory log = %+v", out.Entries)
	}
}
