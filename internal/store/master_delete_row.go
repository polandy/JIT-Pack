package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"jitpack/internal/sync"
)

// Errors DeleteMasterRow answers with. Both are refusals the caller can act
// on rather than failures, so each gets its own sentinel and its own status
// at the HTTP edge.
var (
	// ErrMasterRowNotFound means no row of that id exists in that table.
	ErrMasterRowNotFound = errors.New("store: no such master row")
	// ErrMasterTableNotDeletable means the table has no delete endpoint.
	ErrMasterTableNotDeletable = errors.New("store: table has no delete endpoint")
)

// deletableMasterTables is the allowlist behind the REST delete (ADR-038) —
// the four master tables the app's own screens can delete, and nothing else.
// It is an allowlist rather than "the master partition" on purpose: that
// partition also holds trips, their membership and their series, and a path
// parameter must not be able to reach those. Widening it is a decision, and
// TestDeleteMasterRow_TableOutsideTheAllowlist_IsRefused is where it is made.
var deletableMasterTables = toSet(TableTags, TableItems, TableTemplates, TableTemplateItems)

// DeleteMasterRowResult is what one DeleteMasterRow call did.
type DeleteMasterRowResult struct {
	Outcome sync.Outcome
	// Retired distinguishes FR-24.3's two deletions, which the outcome
	// cannot: a retired row is still there. Read back from the row rather
	// than reported by the merge, so it states what is true afterwards.
	Retired bool
	// Seq is the change_log position of the delete — what a caller polls
	// the pull from, and proof other devices will learn of it.
	Seq int64
	// Reason is set exactly when Outcome is rejected.
	Reason RejectReason
}

// DeleteMasterRow deletes one master row on userID's behalf, minting the
// mutation id and the clock the caller would otherwise have to produce.
//
// It is deliberately a caller of ApplyMasterMutation and not a second write
// path: FR-24.3's retire-or-remove decision, the authorization and the
// change_log entry all stay where the sync push already runs them, so the
// REST endpoint and the app cannot drift apart (ADR-038, invariant 4).
func (s *Store) DeleteMasterRow(ctx context.Context, userID, table, id string) (DeleteMasterRowResult, error) {
	if !deletableMasterTables[table] {
		return DeleteMasterRowResult{}, ErrMasterTableNotDeletable
	}

	// Before the transaction ApplyMasterMutation opens, not inside it: the
	// pool holds a single connection, so a read that opened its own would
	// wait for a transaction that is waiting for it (see RevertMasterConflict).
	rowHLC, exists, err := s.masterRowClock(ctx, table, id)
	if err != nil {
		return DeleteMasterRowResult{}, err
	}
	if !exists {
		// Not an applied delete of nothing: a script working through a list
		// of ids has to be able to tell a row it removed from one it never
		// had.
		return DeleteMasterRowResult{}, ErrMasterRowNotFound
	}
	// Fold the row's own clock in before stamping. A device whose wall clock
	// runs ahead leaves an HLC the server has never seen, and a delete that
	// is not strictly newer would be dropped by its own merge.
	if rowHLC != "" {
		if err := s.hlc.Observe(rowHLC); err != nil {
			return DeleteMasterRowResult{}, fmt.Errorf("observe %s %s clock: %w", table, id, err)
		}
	}

	res, err := s.ApplyMasterMutation(ctx, userID, sync.Mutation{
		MutationID: randomID(),
		Op:         sync.OpDelete,
		Table:      table,
		ID:         id,
		HLC:        s.hlc.Next(),
	})
	if err != nil {
		return DeleteMasterRowResult{}, err
	}

	out := DeleteMasterRowResult{Outcome: res.Outcome, Seq: res.Seq, Reason: res.Reason}
	if res.Outcome != sync.OutcomeRejected {
		// Reading the row back is not a second decision — the decision was
		// made once, inside the mutation. This asks what became of it.
		_, stillThere, err := s.masterRowClock(ctx, table, id)
		if err != nil {
			return DeleteMasterRowResult{}, err
		}
		out.Retired = stillThere
	}
	return out, nil
}

// masterRowClock reads a row's own HLC and reports whether it exists at all.
// table is always one of deletableMasterTables, so interpolating it carries
// no untrusted input.
func (s *Store) masterRowClock(ctx context.Context, table, id string) (sync.HLC, bool, error) {
	var hlc sql.NullString
	err := s.db.QueryRowContext(ctx,
		fmt.Sprintf(`SELECT %s FROM %s WHERE id = ?`, updatedHLCColumn, table), id).Scan(&hlc)
	if errors.Is(err, sql.ErrNoRows) {
		return "", false, nil
	}
	if err != nil {
		return "", false, fmt.Errorf("read %s %s clock: %w", table, id, err)
	}
	return sync.HLC(hlc.String), true, nil
}
