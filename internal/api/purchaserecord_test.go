package api

import (
	"testing"
	"time"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

// FR-30.4 at the stamping layer: who bought a thing is written from the
// authenticated pusher, never from the client — the FR-25.19 rule for the
// packing record, applied to the purchase. The time may come from the tap,
// because shopping happens offline and the push lands later; an unreadable
// one is replaced by the server's clock. Both are cleared when the purchase
// is taken back, so a stale record never outlives what it describes.
func TestStampActor_PurchaseRecord_FR30_4(t *testing.T) {
	const acting = "user-andy"
	const tapped = "2026-09-19T14:32:00Z"
	fixed := func() time.Time { return time.Date(2026, 9, 20, 8, 0, 0, 0, time.UTC) }
	const serverNow = "2026-09-20T08:00:00Z"

	tests := []struct {
		name   string
		table  string
		fields map[string]any
		wantBy any
		wantAt any
	}{
		{
			name:   "buying an entry stamps the buyer and keeps the tap time",
			table:  store.TableShoppingEntries,
			fields: map[string]any{"bought": 1, "bought_at": tapped},
			wantBy: acting, wantAt: tapped,
		},
		{
			name:   "a forged buyer on an entry is overwritten",
			table:  store.TableShoppingEntries,
			fields: map[string]any{"bought": 1, "bought_by_user_id": "user-sia", "bought_at": tapped},
			wantBy: acting, wantAt: tapped,
		},
		{
			name:   "an unreadable tap time falls back to the server clock",
			table:  store.TableShoppingEntries,
			fields: map[string]any{"bought": 1, "bought_at": "gestern"},
			wantBy: acting, wantAt: serverNow,
		},
		{
			name:   "putting an entry back clears both",
			table:  store.TableShoppingEntries,
			fields: map[string]any{"bought": 0, "bought_by_user_id": "user-sia", "bought_at": tapped},
			wantBy: nil, wantAt: nil,
		},
		{
			name:   "a buyer smuggled in without a purchase is dropped",
			table:  store.TableShoppingEntries,
			fields: map[string]any{"name": "Milch", "bought_by_user_id": "user-sia", "bought_at": tapped},
			wantBy: absent, wantAt: absent,
		},
		{
			name:   "buying a packing row from a list stamps the buyer (FR-25.11j)",
			table:  store.TableTripItems,
			fields: map[string]any{"bought_from": "buy_before", "mode": "pack", "bought_at": tapped},
			wantBy: acting, wantAt: tapped,
		},
		{
			name:   "a forged buyer on a packing row is overwritten",
			table:  store.TableTripItems,
			fields: map[string]any{"bought_from": "buy_local", "bought_by_user_id": "user-sia", "bought_at": tapped},
			wantBy: acting, wantAt: tapped,
		},
		{
			name:   "taking a packing row's purchase back clears both",
			table:  store.TableTripItems,
			fields: map[string]any{"bought_from": nil, "mode": "buy_before", "bought_at": tapped},
			wantBy: nil, wantAt: nil,
		},
		{
			name:   "a packing row edit that is no purchase carries no record",
			table:  store.TableTripItems,
			fields: map[string]any{"quantity": 2, "bought_by_user_id": "user-sia", "bought_at": tapped},
			wantBy: absent, wantAt: absent,
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			m := &syncpkg.Mutation{Table: tc.table, Op: syncpkg.OpUpsert, Fields: tc.fields}

			stampActor(m, acting, fixed)

			assertPresence(t, m, "bought_by_user_id", tc.wantBy)
			assertPresence(t, m, "bought_at", tc.wantAt)
		})
	}
}

// absent marks a field that must not be in the mutation at all: an edit that
// is no purchase must not write the record, not even as null — a null would
// erase a real purchase another device already recorded (NFR-4.2a).
var absent = struct{ absent bool }{true}

func assertPresence(t *testing.T, m *syncpkg.Mutation, field string, want any) {
	t.Helper()
	got, ok := m.Fields[field]
	if want == absent {
		if ok {
			t.Errorf("%s = %v, want the key absent", field, got)
		}
		return
	}
	if !ok {
		t.Fatalf("%s absent, want %v", field, want)
	}
	if got != want {
		t.Errorf("%s = %v, want %v", field, got, want)
	}
}
