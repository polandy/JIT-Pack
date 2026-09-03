package store

import (
	"context"
	"errors"
	"testing"
)

const takerUser = "user-sia"

// seedClaimedItem puts a row on the trip that testUser is packing, which
// is the only state a takeover has anything to do with.
func seedClaimedItem(t *testing.T, s *Store) {
	t.Helper()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES (?, 'auth|sia', 'Sia')`, takerUser)
	mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name, quantity, state, packing_now_by, packing_now_at)
	                VALUES ('item-1', ?, 'Zelt', 1, 'packing_now', ?, '2026-08-24T09:00:00Z')`, testTrip, testUser)
}

// FR-5.7: the claim moves to the taker in one step. The row must never be
// free in between — a takeover happens in order to pack the thing, and a
// free intermediate state is a window in which a third device claims it.
func TestTakeOverClaim_MovesTheClaimToTheTaker(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	seedClaimedItem(t, s)

	ev, err := s.TakeOverClaim(ctx, testTrip, "item-1", takerUser)
	if err != nil {
		t.Fatalf("TakeOverClaim: %v", err)
	}

	if ev.FromUserID != testUser || ev.ToUserID != takerUser {
		t.Errorf("takeover %s -> %s, want %s -> %s", ev.FromUserID, ev.ToUserID, testUser, takerUser)
	}
	if ev.ItemName != "Zelt" {
		t.Errorf("item name = %q, want Zelt", ev.ItemName)
	}
	if ev.Seq == 0 {
		t.Error("seq = 0: the other devices learn of the takeover by pulling, so it must be in the change feed")
	}
	// …and in *this trip's* feed. A non-zero seq alone does not say that:
	// change_log is one table for both partitions, so an entry written to
	// the master feed by mistake still yields a seq, and the takeover would
	// then reach nobody in the trip. Found 2026-09-03 by mutating the feed
	// argument, which turned nothing red (G-1).
	page, err := s.Pull(ctx, testTrip, 0, 100)
	if err != nil {
		t.Fatalf("Pull: %v", err)
	}
	var offered bool
	for _, c := range page.Changes {
		if c.Table == TableTripItems && c.ID == "item-1" {
			offered = true
		}
	}
	if !offered {
		t.Errorf("the trip's pull offers %v, want the taken-over row", page.Changes)
	}

	var state, by string
	if err := s.db.QueryRow(`SELECT state, packing_now_by FROM trip_items WHERE id = 'item-1'`).Scan(&state, &by); err != nil {
		t.Fatal(err)
	}
	if state != "packing_now" || by != takerUser {
		t.Errorf("row = %s/%s, want packing_now/%s", state, by, takerUser)
	}
}

// The record is the point of the table (ADR-028): a takeover the trip
// cannot name afterwards is a break with no author.
func TestTakeOverClaim_IsRecordedAndReadablePerTrip(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	seedClaimedItem(t, s)
	mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES ('trip-other', 'Other', 2026)`)

	if _, err := s.TakeOverClaim(ctx, testTrip, "item-1", takerUser); err != nil {
		t.Fatal(err)
	}

	events, err := s.ListLockEvents(ctx, testTrip)
	if err != nil {
		t.Fatalf("ListLockEvents: %v", err)
	}
	if len(events) != 1 {
		t.Fatalf("events = %d, want 1", len(events))
	}
	if events[0].TripItemID != "item-1" || events[0].ItemName != "Zelt" {
		t.Errorf("event = %+v, want item-1/Zelt", events[0])
	}
	if events[0].CreatedAt == "" {
		t.Error("created_at must be set: when it happened is half of who took what")
	}

	// The trip partition is a partition here too — another trip's log must
	// not carry it, the way ListConflicts is scoped.
	other, err := s.ListLockEvents(ctx, "trip-other")
	if err != nil {
		t.Fatal(err)
	}
	if len(other) != 0 {
		t.Errorf("other trip sees %d events, want 0", len(other))
	}
}

// The name is stored rather than joined, because the log has to stay
// readable after the row is deleted — a line saying "took over 4f3a…"
// is the exact defect the conflict log was fixed for.
func TestListLockEvents_SurvivesTheItemItNames(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	seedClaimedItem(t, s)
	if _, err := s.TakeOverClaim(ctx, testTrip, "item-1", takerUser); err != nil {
		t.Fatal(err)
	}

	mustExec(t, s, `DELETE FROM trip_items WHERE id = 'item-1'`)

	events, err := s.ListLockEvents(ctx, testTrip)
	if err != nil {
		t.Fatalf("ListLockEvents: %v", err)
	}
	if len(events) != 1 || events[0].ItemName != "Zelt" {
		t.Fatalf("events = %+v, want the deleted row still named", events)
	}
}

func TestTakeOverClaim_RefusesWhatCannotBeTakenOver(t *testing.T) {
	tests := []struct {
		name  string
		setup func(t *testing.T, s *Store)
		item  string
		taker string
		want  error
	}{
		{
			name:  "no such row on this trip",
			setup: seedClaimedItem,
			item:  "item-missing",
			taker: takerUser,
			want:  ErrTripItemNotFound,
		},
		{
			// Scope, not existence: the row exists, but not on this trip.
			name: "a row of another trip",
			setup: func(t *testing.T, s *Store) {
				seedClaimedItem(t, s)
				mustExec(t, s, `INSERT INTO trips (id, name, year) VALUES ('trip-other', 'Other', 2026)`)
				mustExec(t, s, `INSERT INTO trip_items (id, trip_id, name, quantity, state, packing_now_by)
				                VALUES ('item-far', 'trip-other', 'Karte', 1, 'packing_now', ?)`, testUser)
			},
			item:  "item-far",
			taker: takerUser,
			want:  ErrTripItemNotFound,
		},
		{
			name: "a row nobody is packing",
			setup: func(t *testing.T, s *Store) {
				seedClaimedItem(t, s)
				mustExec(t, s, `UPDATE trip_items SET state = 'open', packing_now_by = NULL WHERE id = 'item-1'`)
			},
			item:  "item-1",
			taker: takerUser,
			want:  ErrClaimNotHeld,
		},
		{
			// Taking over my own claim is not a takeover; releasing is the
			// action for that, and a self-notification would be absurd.
			name:  "my own claim",
			setup: seedClaimedItem,
			item:  "item-1",
			taker: testUser,
			want:  ErrClaimIsOwn,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			s := openTestStore(t)
			tt.setup(t, s)

			_, err := s.TakeOverClaim(context.Background(), testTrip, tt.item, tt.taker)

			if !errors.Is(err, tt.want) {
				t.Fatalf("err = %v, want %v", err, tt.want)
			}
			// A refusal writes nothing at all: a log entry for a takeover
			// that did not happen is worse than no log.
			events, err := s.ListLockEvents(context.Background(), testTrip)
			if err != nil {
				t.Fatal(err)
			}
			if len(events) != 0 {
				t.Errorf("events = %d after a refusal, want 0", len(events))
			}
		})
	}
}
