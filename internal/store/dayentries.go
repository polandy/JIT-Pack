package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
)

// validDayEntryTraveler keeps a day-plan entry's traveller row inside its
// trip (FR-29.15): both the entry and the person it names must be the trip's
// own, or the row would put another trip's person on this plan, or this
// plan's person on another's. A write that names neither is judged by the
// row it changes, which was judged when it was written.
func validDayEntryTraveler(ctx context.Context, tx *sql.Tx, in guardInput) (RejectReason, error) {
	tripID, m := in.tripID, in.m
	for _, ref := range []struct{ column, table string }{
		{"day_entry_id", TableDayEntries},
		{"traveler_id", TableTravelers},
	} {
		id, named := m.Fields[ref.column].(string)
		if !named {
			continue
		}
		var owner string
		err := tx.QueryRowContext(ctx, `SELECT trip_id FROM `+ref.table+` WHERE id = ?`, id).Scan(&owner)
		if errors.Is(err, sql.ErrNoRows) || (err == nil && owner != tripID) {
			return ReasonConstraintViolated, nil
		}
		if err != nil {
			return ReasonNone, fmt.Errorf("day entry traveller %s lookup: %w", ref.column, err)
		}
	}
	return ReasonNone, nil
}
