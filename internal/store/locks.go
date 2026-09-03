// Package store — locks.go owns the one half of G-3's lock the server
// holds (FR-5.7, ADR-028). Everything else about a claim is a client
// rendering rule over the synced `packing_now` fields; a *takeover* is
// not, because only the server can say who took over (invariant 3) and
// notify the account it was taken from. The record it leaves lives in
// `lock_events`, deliberately beside the conflict log rather than in it.
package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"jitpack/internal/sync"
)

// Refusals of a takeover. Each is a different sentence for the taker, so
// each is its own error rather than one "cannot take over".
var (
	// ErrTripItemNotFound reports a row that does not exist on this trip.
	// Not existing and belonging to another trip are deliberately the
	// same answer: the second would otherwise confirm a foreign row.
	ErrTripItemNotFound = errors.New("store: no such trip item")
	// ErrClaimNotHeld reports that nobody is packing the row, so there is
	// nothing to take. The likely cause is a stale screen: the holder
	// released it or finished it while the sheet was open.
	ErrClaimNotHeld = errors.New("store: nobody is packing this row")
	// ErrClaimIsOwn reports a takeover of the caller's own claim, which
	// is a release rather than a takeover.
	ErrClaimIsOwn = errors.New("store: this claim is already yours")
)

// LockEvent is one recorded takeover (FR-5.7): who took what from whom,
// and when. Seq is the change-feed sequence the takeover's write landed
// at, and is zero on an event read back from the log — the field answers
// "what should I pull", which only the taker's own response needs.
type LockEvent struct {
	ID         string
	TripID     string
	TripItemID string
	ItemName   string
	FromUserID string
	ToUserID   string
	CreatedAt  string
	Seq        int64
}

// TakeOverClaim moves a `packing_now` claim from its holder to takerUserID
// in one transaction: the row never passes through unclaimed, because a
// takeover happens in order to pack the thing and a free intermediate
// state is a window for a third device.
//
// The write is an ordinary mutation with a fresh server HLC, so the other
// devices learn of it by pulling like any other change and the merge rules
// apply to it unchanged (compare RevertTripConflict, ADR-023).
func (s *Store) TakeOverClaim(ctx context.Context, tripID, itemID, takerUserID string) (LockEvent, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return LockEvent{}, fmt.Errorf("begin takeover: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op after a successful Commit

	var name, state string
	var holder *string
	err = tx.QueryRowContext(ctx,
		`SELECT name, state, packing_now_by FROM trip_items WHERE id = ? AND trip_id = ?`,
		itemID, tripID).Scan(&name, &state, &holder)
	if errors.Is(err, sql.ErrNoRows) {
		return LockEvent{}, ErrTripItemNotFound
	} else if err != nil {
		return LockEvent{}, fmt.Errorf("load claim of %s: %w", itemID, err)
	}
	if state != sync.StatePackingNow || holder == nil || *holder == "" {
		return LockEvent{}, ErrClaimNotHeld
	}
	if *holder == takerUserID {
		return LockEvent{}, ErrClaimIsOwn
	}

	row, err := loadRow(ctx, tx, TableTripItems, itemID)
	if err != nil {
		return LockEvent{}, err
	}
	// Fold the row's own clock in before stamping, for the reason the
	// revert does: a device whose wall clock runs ahead leaves an HLC the
	// server has never seen, and a write that is not strictly newer would
	// be dropped by its own merge.
	if row.HLC != "" {
		if err := s.hlc.Observe(row.HLC); err != nil {
			return LockEvent{}, fmt.Errorf("observe %s clock: %w", itemID, err)
		}
	}
	m := sync.Mutation{
		Op:    sync.OpUpsert,
		Table: TableTripItems,
		ID:    itemID,
		Fields: map[string]any{
			sync.FieldState:  sync.StatePackingNow,
			"packing_now_by": takerUserID,
			"packing_now_at": time.Now().UTC().Format(time.RFC3339),
		},
		HLC: s.hlc.Next(),
	}
	merged := sync.Merge(row, m)
	if err := updateRow(ctx, tx, m.Table, m.ID, merged); err != nil {
		return LockEvent{}, err
	}
	seq, err := appendChangeLog(ctx, tx, tripFeed(tripID), m, false)
	if err != nil {
		return LockEvent{}, err
	}

	ev := LockEvent{
		TripID: tripID, TripItemID: itemID, ItemName: name,
		FromUserID: *holder, ToUserID: takerUserID, Seq: seq,
	}
	err = tx.QueryRowContext(ctx,
		`INSERT INTO lock_events (trip_id, trip_item_id, item_name, from_user_id, to_user_id)
		 VALUES (?, ?, ?, ?, ?) RETURNING id, created_at`,
		ev.TripID, ev.TripItemID, ev.ItemName, ev.FromUserID, ev.ToUserID).Scan(&ev.ID, &ev.CreatedAt)
	if err != nil {
		return LockEvent{}, fmt.Errorf("record takeover of %s: %w", itemID, err)
	}
	if err := tx.Commit(); err != nil {
		return LockEvent{}, fmt.Errorf("commit takeover: %w", err)
	}
	return ev, nil
}

// ListLockEvents returns a trip's takeovers, newest first.
func (s *Store) ListLockEvents(ctx context.Context, tripID string) ([]LockEvent, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, trip_id, trip_item_id, item_name, from_user_id, to_user_id, created_at
		   FROM lock_events WHERE trip_id = ? ORDER BY created_at DESC, id`, tripID)
	if err != nil {
		return nil, fmt.Errorf("list lock events: %w", err)
	}
	defer rows.Close()

	out := []LockEvent{}
	for rows.Next() {
		var e LockEvent
		if err := rows.Scan(&e.ID, &e.TripID, &e.TripItemID, &e.ItemName,
			&e.FromUserID, &e.ToUserID, &e.CreatedAt); err != nil {
			return nil, fmt.Errorf("scan lock event: %w", err)
		}
		out = append(out, e)
	}
	return out, rows.Err()
}
