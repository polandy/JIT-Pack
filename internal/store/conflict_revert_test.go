package store

import (
	"context"
	"errors"
	"testing"

	"jitpack/internal/sync"
)

// NFR-4.2a promises audit *and manual revert*. These tests state the rule
// the revert is built to: it is an ordinary new mutation carrying the
// logged losing value and a fresh server HLC (Sync-API §6.1), never a
// rewrite of the past — so it wins LWW, reaches every device through the
// normal change feed, and can itself be beaten by a later edit.

const staleHLC = sync.HLC("0000000001000-0000-aaaaaaaa")
const winningHLC = sync.HLC("0000000002000-0000-bbbbbbbb")

// seedTripConflict produces exactly one trip-partition conflict on
// trip_items.quantity: 5 wins, the stale 9 loses and is logged.
func seedTripConflict(t *testing.T, s *Store) string {
	t.Helper()
	ctx := context.Background()
	win := upsert("item-1", "mut-1", map[string]any{"trip_id": testTrip, "name": "Socken", "quantity": 5}, winningHLC)
	if _, err := s.ApplyMutation(ctx, testTrip, win); err != nil {
		t.Fatalf("seed winner: %v", err)
	}
	lose := upsert("item-1", "mut-2", map[string]any{"quantity": 9}, staleHLC)
	if _, err := s.ApplyMutation(ctx, testTrip, lose); err != nil {
		t.Fatalf("seed loser: %v", err)
	}
	return onlyConflictID(t, s)
}

func onlyConflictID(t *testing.T, s *Store) string {
	t.Helper()
	var id string
	if err := s.db.QueryRow(`SELECT id FROM conflict_log ORDER BY rowid DESC LIMIT 1`).Scan(&id); err != nil {
		t.Fatalf("read conflict id: %v", err)
	}
	return id
}

func itemQuantity(t *testing.T, s *Store) int {
	t.Helper()
	var qty int
	if err := s.db.QueryRow(`SELECT quantity FROM trip_items WHERE id = 'item-1'`).Scan(&qty); err != nil {
		t.Fatalf("read quantity: %v", err)
	}
	return qty
}

func TestRevertTripConflict_RestoresLosingValueAsAFreshMutation_NFR42a(t *testing.T) {
	s := openTestStore(t)
	id := seedTripConflict(t, s)

	seq, err := s.RevertTripConflict(context.Background(), testTrip, id)
	if err != nil {
		t.Fatalf("RevertTripConflict: %v", err)
	}

	if got := itemQuantity(t, s); got != 9 {
		t.Errorf("quantity = %d, want 9 (the logged loser restored)", got)
	}
	if seq == 0 {
		t.Error("revert must append a change_log entry so other devices pull it")
	}
	// A fresh HLC, not the loser's: the revert is a new write in the
	// present, so a device holding the winner cannot undo it by replay.
	var hlc string
	if err := s.db.QueryRow(`SELECT updated_hlc FROM trip_items WHERE id = 'item-1'`).Scan(&hlc); err != nil {
		t.Fatal(err)
	}
	if sync.HLC(hlc) <= winningHLC {
		t.Errorf("updated_hlc = %q, want strictly greater than the winner %q", hlc, winningHLC)
	}
}

func TestRevertTripConflict_MarksTheEntryRevertedAndListSaysSo_NFR42a(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	id := seedTripConflict(t, s)

	if _, err := s.RevertTripConflict(ctx, testTrip, id); err != nil {
		t.Fatalf("RevertTripConflict: %v", err)
	}

	entries, err := s.ListConflicts(ctx, testTrip)
	if err != nil {
		t.Fatalf("ListConflicts: %v", err)
	}
	if len(entries) != 1 {
		t.Fatalf("entries = %d, want 1", len(entries))
	}
	if !entries[0].Reverted {
		t.Error("a reverted entry must report itself reverted, or the UI offers the button twice")
	}
}

func TestRevertTripConflict_SecondRevertIsRefused_NFR42a(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	id := seedTripConflict(t, s)
	if _, err := s.RevertTripConflict(ctx, testTrip, id); err != nil {
		t.Fatalf("first revert: %v", err)
	}

	_, err := s.RevertTripConflict(ctx, testTrip, id)

	if !errors.Is(err, ErrConflictAlreadyReverted) {
		t.Fatalf("err = %v, want ErrConflictAlreadyReverted", err)
	}
	if got := itemQuantity(t, s); got != 9 {
		t.Errorf("quantity = %d, want 9 unchanged by the refused second revert", got)
	}
}

func TestRevertTripConflict_DeletedRowIsRefused_NFR42a(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	id := seedTripConflict(t, s)
	del := sync.Mutation{
		MutationID: "mut-del", Op: sync.OpDelete, Table: TableTripItems, ID: "item-1",
		HLC: sync.HLC("0000000003000-0000-cccccccc"),
	}
	if _, err := s.ApplyMutation(ctx, testTrip, del); err != nil {
		t.Fatalf("delete: %v", err)
	}

	_, err := s.RevertTripConflict(ctx, testTrip, id)

	if !errors.Is(err, ErrConflictRowGone) {
		t.Fatalf("err = %v, want ErrConflictRowGone", err)
	}
	var rows int
	if err := s.db.QueryRow(`SELECT count(*) FROM trip_items WHERE id = 'item-1'`).Scan(&rows); err != nil {
		t.Fatal(err)
	}
	if rows != 0 {
		t.Error("a revert must never resurrect a deleted row from one logged field")
	}
}

// Rule 2 of §6 outranks the revert: restoring "packing_now" onto a row
// that is already "packed" is exactly the write the merge exists to drop.
// It must fail loudly rather than be silently swallowed.
func TestRevertTripConflict_TerminalPrecedenceRefusesTheRevert_NFR42a(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()
	seed := upsert("item-1", "mut-1", map[string]any{"trip_id": testTrip, "name": "Helm", "state": "packed"}, winningHLC)
	if _, err := s.ApplyMutation(ctx, testTrip, seed); err != nil {
		t.Fatalf("seed: %v", err)
	}
	lock := upsert("item-1", "mut-2", map[string]any{"state": "packing_now"}, sync.HLC("0000000009000-0000-dddddddd"))
	if _, err := s.ApplyMutation(ctx, testTrip, lock); err != nil {
		t.Fatalf("lock: %v", err)
	}
	id := onlyConflictID(t, s)

	_, err := s.RevertTripConflict(ctx, testTrip, id)

	if !errors.Is(err, ErrRevertRefused) {
		t.Fatalf("err = %v, want ErrRevertRefused", err)
	}
	var state string
	if err := s.db.QueryRow(`SELECT state FROM trip_items WHERE id = 'item-1'`).Scan(&state); err != nil {
		t.Fatal(err)
	}
	if state != "packed" {
		t.Errorf("state = %q, want packed", state)
	}
	var reverted int
	if err := s.db.QueryRow(`SELECT reverted FROM conflict_log WHERE id = ?`, id).Scan(&reverted); err != nil {
		t.Fatal(err)
	}
	if reverted != 0 {
		t.Error("a refused revert must not mark the entry reverted")
	}
}

func TestRevertTripConflict_UnknownEntryIsNotFound(t *testing.T) {
	s := openTestStore(t)

	_, err := s.RevertTripConflict(context.Background(), testTrip, "no-such-conflict")

	if !errors.Is(err, ErrConflictNotFound) {
		t.Fatalf("err = %v, want ErrConflictNotFound", err)
	}
}

// P-3 again: a trip's endpoint reaches its own partition and nothing else.
// A master-partition entry has no trip id, so it is not this log's.
func TestRevertTripConflict_MasterEntryIsNotInATripsLog_NFR42a(t *testing.T) {
	s := openTestStore(t)
	id := seedMasterTripNameConflict(t, s)

	_, err := s.RevertTripConflict(context.Background(), testTrip, id)

	if !errors.Is(err, ErrConflictNotFound) {
		t.Fatalf("err = %v, want ErrConflictNotFound", err)
	}
}

// seedMasterTripNameConflict makes testUser the trip's owner and loses a
// rename of trips.name on the master partition.
func seedMasterTripNameConflict(t *testing.T, s *Store) string {
	t.Helper()
	ctx := context.Background()
	mustExec(t, s, `INSERT INTO trip_members (id, trip_id, user_id, role, updated_hlc)
	                VALUES ('mem-1', ?, ?, 'owner', '0000000000001-0000-aaaaaaaa')`, testTrip, testUser)
	win := sync.Mutation{
		MutationID: "mst-1", Op: sync.OpUpsert, Table: TableTrips, ID: testTrip,
		Fields: map[string]any{"name": "Wallis A"}, HLC: winningHLC,
	}
	if _, err := s.ApplyMasterMutation(ctx, testUser, win); err != nil {
		t.Fatalf("seed master winner: %v", err)
	}
	lose := sync.Mutation{
		MutationID: "mst-2", Op: sync.OpUpsert, Table: TableTrips, ID: testTrip,
		Fields: map[string]any{"name": "Wallis B"}, HLC: staleHLC,
	}
	if _, err := s.ApplyMasterMutation(ctx, testUser, lose); err != nil {
		t.Fatalf("seed master loser: %v", err)
	}
	return onlyConflictID(t, s)
}

func TestRevertMasterConflict_RestoresATripsOwnField_NFR42a(t *testing.T) {
	s := openTestStore(t)
	id := seedMasterTripNameConflict(t, s)

	seq, err := s.RevertMasterConflict(context.Background(), testUser, id)
	if err != nil {
		t.Fatalf("RevertMasterConflict: %v", err)
	}

	if seq == 0 {
		t.Error("revert must append a master change_log entry")
	}
	var name string
	if err := s.db.QueryRow(`SELECT name FROM trips WHERE id = ?`, testTrip).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Wallis B" {
		t.Errorf("name = %q, want \"Wallis B\"", name)
	}
}

func TestRevertMasterConflict_NonMemberCannotRevertATripsField_NFR42a(t *testing.T) {
	s := openTestStore(t)
	id := seedMasterTripNameConflict(t, s)
	mustExec(t, s, `INSERT INTO users (id, oidc_subject, display_name) VALUES ('user-eve', 'auth|eve', 'Eve')`)

	_, err := s.RevertMasterConflict(context.Background(), "user-eve", id)

	if !errors.Is(err, ErrConflictNotFound) {
		t.Fatalf("err = %v, want ErrConflictNotFound (a stranger learns nothing)", err)
	}
	var name string
	if err := s.db.QueryRow(`SELECT name FROM trips WHERE id = ?`, testTrip).Scan(&name); err != nil {
		t.Fatal(err)
	}
	if name != "Wallis A" {
		t.Errorf("name = %q, want \"Wallis A\" untouched", name)
	}
}

func TestRevertMasterConflict_TripEntryIsNotInTheMasterLog_NFR42a(t *testing.T) {
	s := openTestStore(t)
	id := seedTripConflict(t, s)

	_, err := s.RevertMasterConflict(context.Background(), testUser, id)

	if !errors.Is(err, ErrConflictNotFound) {
		t.Fatalf("err = %v, want ErrConflictNotFound", err)
	}
}

// A member may *see* a conflict on the trip's owner membership row and
// still not be allowed to write it: the creator's row is immutable
// (FR-4.7). Visibility and write permission are two questions, and the
// revert has to ask both. The entry is inserted directly because the push
// path refuses the very write that would produce it.
func TestRevertMasterConflict_VisibleButUnwritableRowIsForbidden_NFR42a(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO trip_members (id, trip_id, user_id, role, updated_hlc)
	                VALUES ('mem-own', ?, ?, 'owner', ?)`, testTrip, testUser, string(winningHLC))
	mustExec(t, s, `INSERT INTO conflict_log (id, trip_id, entity_table, entity_id, field, losing_value, winning_value)
	                VALUES ('cf-owner', NULL, 'trip_members', 'mem-own', 'role', '"editor"', '"owner"')`)

	_, err := s.RevertMasterConflict(context.Background(), testUser, "cf-owner")

	if !errors.Is(err, ErrRevertForbidden) {
		t.Fatalf("err = %v, want ErrRevertForbidden", err)
	}
	var role string
	if err := s.db.QueryRow(`SELECT role FROM trip_members WHERE id = 'mem-own'`).Scan(&role); err != nil {
		t.Fatal(err)
	}
	if role != RoleOwner {
		t.Errorf("role = %q, want owner — the creator's row is immutable", role)
	}
	var reverted int
	if err := s.db.QueryRow(`SELECT reverted FROM conflict_log WHERE id = 'cf-owner'`).Scan(&reverted); err != nil {
		t.Fatal(err)
	}
	if reverted != 0 {
		t.Error("a forbidden revert must leave the entry open")
	}
}
