package store

import (
	"context"
	"testing"
)

// FR-4.5: every sync request is scoped to a trip; only members may read
// or write it. The API layer enforces this via IsTripMember.
func TestIsTripMember(t *testing.T) {
	s := openTestStore(t)
	mustExec(t, s, `INSERT INTO trip_members (trip_id, user_id, role) VALUES (?, ?, 'owner')`, testTrip, testUser)

	cases := []struct {
		name   string
		tripID string
		userID string
		want   bool
	}{
		{"member", testTrip, testUser, true},
		{"unknown user", testTrip, "user-stranger", false},
		{"unknown trip", "trip-nowhere", testUser, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := s.IsTripMember(context.Background(), tc.tripID, tc.userID)
			if err != nil {
				t.Fatalf("IsTripMember: %v", err)
			}
			if got != tc.want {
				t.Errorf("IsTripMember(%s, %s) = %v, want %v", tc.tripID, tc.userID, got, tc.want)
			}
		})
	}
}
