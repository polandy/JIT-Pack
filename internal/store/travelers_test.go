package store

import (
	"context"
	"testing"

	"jitpack/internal/sync"
)

// TestApplyMutation_LinkingTravelerToTripMember_IsAccepted and its
// siblings pin FR-2.5 → ADR-058: linked_user_id may only ever name a
// current trip_members row of the same trip.

func TestApplyMutation_LinkingTravelerToTripMember_IsAccepted(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-member', 'auth|member', 'Sarah')`)
	mustExec(t, s, `INSERT INTO trip_members (id, trip_id, user_id, role) VALUES ('tm-1', ?, 'user-member', 'editor')`, testTrip)

	m := sync.Mutation{
		MutationID: "m1", Op: sync.OpInsert, Table: TableTravelers, ID: "trav-1",
		Fields: map[string]any{"trip_id": testTrip, "name": "Sarah", "linked_user_id": "user-member"},
		HLC:    sync.HLC("0000000001000-0000-aaaaaaaa"),
	}
	res, err := s.ApplyMutation(ctx, testTrip, testUser, m)
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}
	if res.Outcome != "applied" {
		t.Fatalf("outcome = %q (reason %q), want applied", res.Outcome, res.Reason)
	}

	var linked string
	if err := s.db.QueryRow(`SELECT linked_user_id FROM travelers WHERE id = 'trav-1'`).Scan(&linked); err != nil {
		t.Fatalf("row not persisted: %v", err)
	}
	if linked != "user-member" {
		t.Errorf("linked_user_id = %q, want user-member", linked)
	}
}

func TestApplyMutation_LinkingTravelerToNonMember_IsRejected_ReasonNotATripMember(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-outsider', 'auth|outsider', 'Max')`)

	m := sync.Mutation{
		MutationID: "m1", Op: sync.OpInsert, Table: TableTravelers, ID: "trav-1",
		Fields: map[string]any{"trip_id": testTrip, "name": "Max", "linked_user_id": "user-outsider"},
		HLC:    sync.HLC("0000000001000-0000-aaaaaaaa"),
	}
	res, err := s.ApplyMutation(ctx, testTrip, testUser, m)
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}
	if res.Outcome != "rejected" {
		t.Fatalf("outcome = %q, want rejected", res.Outcome)
	}
	if res.Reason != ReasonNotATripMember {
		t.Errorf("reason = %q, want %q", res.Reason, ReasonNotATripMember)
	}

	var count int
	if err := s.db.QueryRow(`SELECT count(*) FROM travelers WHERE id = 'trav-1'`).Scan(&count); err != nil {
		t.Fatalf("count query: %v", err)
	}
	if count != 0 {
		t.Errorf("a rejected link must not persist the row, found %d", count)
	}
}

func TestApplyMutation_UnlinkingTraveler_AlwaysAccepted(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-member', 'auth|member', 'Sarah')`)
	mustExec(t, s, `INSERT INTO trip_members (id, trip_id, user_id, role) VALUES ('tm-1', ?, 'user-member', 'editor')`, testTrip)
	mustExec(t, s, `INSERT INTO travelers (id, trip_id, name, linked_user_id) VALUES ('trav-1', ?, 'Sarah', 'user-member')`, testTrip)
	mustExec(t, s, `DELETE FROM trip_members WHERE id = 'tm-1'`)

	m := sync.Mutation{
		MutationID: "m1", Op: sync.OpUpsert, Table: TableTravelers, ID: "trav-1",
		Fields: map[string]any{"linked_user_id": nil},
		HLC:    sync.HLC("0000000002000-0000-aaaaaaaa"),
	}
	res, err := s.ApplyMutation(ctx, testTrip, testUser, m)
	if err != nil {
		t.Fatalf("ApplyMutation: %v", err)
	}
	if res.Outcome != "applied" {
		t.Fatalf("outcome = %q (reason %q), want applied — unlinking needs no membership", res.Outcome, res.Reason)
	}
}
