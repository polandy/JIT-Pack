package store

import (
	"context"
	"database/sql"
	"fmt"

	"jitpack/internal/sync"
)

// PruneMasterItemResult is what one PruneMasterItem call did.
type PruneMasterItemResult struct {
	// Pruned is true when the item was deleted, false when something still
	// uses it or it was already gone. Nothing else can happen: a prune never
	// retires (ADR-065).
	Pruned bool
	// Seq is the change_log position of the delete, zero when nothing was
	// written.
	Seq int64
}

// PruneMasterItem deletes an inventory item on userID's behalf **only if
// nothing uses it** — no Vorlage position, no trip row, and no other item
// that brings it as a companion (FR-5.8, ADR-065). A used item is left
// exactly as it was.
//
// That is the difference from DeleteMasterRow, whose FR-24.3 answer to a use
// is to retire the row: right when a person asked for the item to go, wrong
// when a packing-list removal only suggested that it might be unused. The
// device asking holds just the trips it has opened, so the use it could not
// see is the ordinary case, not an edge.
//
// Like DeleteMasterRow it goes through the ordinary master pipeline, with a
// partition whose write gate adds the "still used" check — inside the
// transaction that deletes, so no write can land between check and delete.
func (s *Store) PruneMasterItem(ctx context.Context, userID, id string) (PruneMasterItemResult, error) {
	// Before the transaction, for DeleteMasterRow's single-connection reason.
	rowHLC, exists, err := s.masterRowClock(ctx, TableItems, id)
	if err != nil {
		return PruneMasterItemResult{}, err
	}
	if !exists {
		return PruneMasterItemResult{}, nil
	}
	if rowHLC != "" {
		if err := s.hlc.Observe(rowHLC); err != nil {
			return PruneMasterItemResult{}, fmt.Errorf("observe item %s clock: %w", id, err)
		}
	}

	res, err := s.applyMutation(ctx, sync.Mutation{
		MutationID: randomID(),
		Op:         sync.OpDelete,
		Table:      TableItems,
		ID:         id,
		HLC:        s.hlc.Next(),
	}, prunePartition(userID))
	if err != nil {
		return PruneMasterItemResult{}, err
	}
	if res.Outcome == sync.OutcomeRejected {
		return PruneMasterItemResult{}, nil
	}
	return PruneMasterItemResult{Pruned: true, Seq: res.Seq}, nil
}

// prunePartition is the master partition with one more refusal: an item in
// use. The refusal is not re-logged — nothing changed, so no device has
// anything to be told — and nothing is retirable, because a used item never
// reaches the delete.
func prunePartition(userID string) partition {
	p := masterPartition(userID)
	authorize := p.scope
	p.scope = func(ctx context.Context, tx *sql.Tx, m *sync.Mutation, row sync.Row) (RejectReason, error) {
		if reason, err := authorize(ctx, tx, m, row); err != nil || reason != ReasonNone {
			return reason, err
		}
		used, err := itemInUse(ctx, tx, m.ID)
		if err != nil || !used {
			return ReasonNone, err
		}
		return ReasonStillReferenced, nil
	}
	p.relogScopeRefusal = false
	p.retirable = nil
	return p
}

// itemInUse answers FR-5.8's "nothing else uses it": FR-24.3's blocking
// references, read from the same declaration stillReferenced reads, plus
// another item bringing it as a companion (`item_id` is the companion,
// `depends_on_item_id` the main item, FR-20.1). That rule is a cascade for
// FR-24.3 — a deliberate delete may take it — but a removal that only noticed
// the item looked unused must not silently strip a companion from the main
// item that brings it. The item's own companion list goes with it.
func itemInUse(ctx context.Context, tx *sql.Tx, id string) (bool, error) {
	queries := make([]string, 0, len(blockingReferences[TableItems])+1)
	for _, ref := range blockingReferences[TableItems] {
		queries = append(queries, fmt.Sprintf(`SELECT count(*) FROM %s WHERE %s = ?1`, ref.table, ref.column))
	}
	queries = append(queries,
		`SELECT count(*) FROM `+TableItemDependencies+` WHERE item_id = ?1 AND depends_on_item_id <> ?1`)
	for _, query := range queries {
		var uses int
		if err := tx.QueryRowContext(ctx, query, id).Scan(&uses); err != nil {
			return false, fmt.Errorf("item %s uses: %w", id, err)
		}
		if uses > 0 {
			return true, nil
		}
	}
	return false, nil
}
