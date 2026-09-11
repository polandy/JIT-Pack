// Package store — travelers.go holds the one rule the trip partition's
// push path enforces about travelers.linked_user_id (FR-2.5, ADR-058):
// a link may only ever name a current trip_members row of the same trip.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"jitpack/internal/sync"
)

// validTravelerLink enforces that linked_user_id names a current member
// of the traveler's own trip. It is the one thing internal/api's
// notification pipeline (notificationrules.go) trusts about every
// recipient it is handed: a link outside trip_members would point a
// notification's deep link at a trip the recipient's device cannot pull.
//
// A missing or empty value is always valid — it clears the link, and
// unlinking needs no membership at all.
func validTravelerLink(ctx context.Context, tx *sql.Tx, tripID string, current map[string]any, m *sync.Mutation) (RejectReason, error) {
	var linkedUserID string
	if v, present := m.Fields["linked_user_id"]; present {
		// The mutation names the field explicitly — a nil/empty value here
		// is a deliberate clear, not "unchanged", so it must not fall back
		// to the row's current link.
		linkedUserID, _ = v.(string)
	} else {
		linkedUserID, _ = current["linked_user_id"].(string)
	}
	if linkedUserID == "" {
		return ReasonNone, nil
	}
	var exists int
	err := tx.QueryRowContext(ctx,
		`SELECT 1 FROM trip_members WHERE trip_id = ? AND user_id = ?`, tripID, linkedUserID).Scan(&exists)
	if errors.Is(err, sql.ErrNoRows) {
		return ReasonNotATripMember, nil
	}
	if err != nil {
		return ReasonNone, fmt.Errorf("traveler link membership lookup: %w", err)
	}
	return ReasonNone, nil
}
