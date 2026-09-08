package store_test

import (
	"context"
	"testing"
)

func TestHeadSeq_EmptyTrip_ReturnsZero(t *testing.T) {
	st := openEmptyStore(t)

	seq, err := st.HeadSeq(context.Background(), "nonexistent")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if seq != 0 {
		t.Errorf("seq = %d, want 0", seq)
	}
}

func TestHeadSeq_AfterPush_ReturnsLatest(t *testing.T) {
	st := openEmptyStore(t)
	ctx := context.Background()

	seedTrip(t, st)
	pushItem(t, st, "trip-1", "item-1", "m-1",
		map[string]any{"trip_id": "trip-1", "name": "Socken"}, "0000000001000-0000-aaaaaaaa")
	pushItem(t, st, "trip-1", "item-2", "m-2",
		map[string]any{"trip_id": "trip-1", "name": "Hosen"}, "0000000002000-0000-aaaaaaaa")

	seq, err := st.HeadSeq(ctx, "trip-1")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if seq < 2 {
		t.Errorf("seq = %d, want >= 2", seq)
	}
}
