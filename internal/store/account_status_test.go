package store

import (
	"context"
	"testing"
)

// AccountStatus answers existence and deactivation as one question, because a
// caller that asks only the second one reads "no such row" as a pass. That is
// the hole long-lived API tokens made reachable: a credential outlives the
// account it was minted for, and until this existed the request still
// authenticated (FR-23.7, ADR-039).
func TestAccountStatus_UnknownActiveDeactivated_FR23_7(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	if _, err := s.db.Exec(
		`INSERT INTO users (id, oidc_subject, display_name) VALUES ('u-live', 'auth|live', 'Live')`); err != nil {
		t.Fatalf("seed: %v", err)
	}
	if _, err := s.db.Exec(
		`INSERT INTO users (id, oidc_subject, display_name, deactivated_at)
		 VALUES ('u-off', 'auth|off', 'Off', '2026-08-30T10:00:00Z')`); err != nil {
		t.Fatalf("seed: %v", err)
	}

	for _, tc := range []struct {
		name   string
		userID string
		want   AccountState
	}{
		{"an account that exists and is not deactivated", "u-live", AccountActive},
		{"an account that was deactivated", "u-off", AccountDeactivated},
		{"an id no row carries", "u-never-existed", AccountUnknown},
		{"the empty id", "", AccountUnknown},
	} {
		t.Run(tc.name, func(t *testing.T) {
			got, err := s.AccountStatus(ctx, tc.userID)
			if err != nil {
				t.Fatalf("AccountStatus: %v", err)
			}
			if got != tc.want {
				t.Errorf("AccountStatus(%q) = %v, want %v", tc.userID, got, tc.want)
			}
		})
	}
}

// The zero value has to be the denying one: a caller that forgets a case, or
// reads the value beside a non-nil error, must not thereby grant access.
func TestAccountState_ZeroValueDenies(t *testing.T) {
	var zero AccountState
	if zero != AccountUnknown {
		t.Errorf("zero AccountState = %v, want AccountUnknown — a forgotten case must deny", zero)
	}
}

// The fan-out path's share of the same rule. Before AccountStatus this fell
// through to an INSERT that the foreign key rejected, so a notification for a
// vanished account surfaced as an error in a loop over recipients rather than
// as nothing to do.
func TestCreateNotification_UnknownUser_CreatesNothingAndDoesNotFail(t *testing.T) {
	s := openTestStore(t)
	ctx := context.Background()

	id, err := s.CreateNotification(ctx, "u-never-existed", NotifyDelegation,
		map[string]any{"trip_id": "t-1"})
	if err != nil {
		t.Fatalf("CreateNotification: %v", err)
	}
	if id != "" {
		t.Errorf("id = %q, want empty — nothing should have been written", id)
	}
	var n int
	if err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM notifications`).Scan(&n); err != nil {
		t.Fatalf("count: %v", err)
	}
	if n != 0 {
		t.Errorf("%d notification rows exist for an account that does not", n)
	}
}
