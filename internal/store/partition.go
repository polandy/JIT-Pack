// Package store — partition.go holds the one push pipeline both sync
// partitions run, and the value that says which partition is running it.
//
// The trip and master paths were written out twice (Sync-API §5). They ran
// the same twelve steps — validate, transaction, idempotency memo, load,
// scope, merge, reference check, cascade collection, persist,
// change_log + tombstones, conflict_log, memo + commit — and their four
// real differences were spread through two copies rather than named
// anywhere. The cost was paid twice already: ADR-031's re-log and FR-24.3's
// retire-instead each had to be remembered in the other file, and "where
// does a rejection get re-logged" had two answers.
//
// The partition also used to travel as `tripID any` — a string for the trip
// feed, nil for the master one — through five helpers. That `any` was this
// type, unwritten.
package store

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"jitpack/internal/sync"
)

// feed identifies which change feed an entry belongs to — the trip's, or
// the instance-wide master one (Sync-API §4).
//
// It wraps the nullable `trip_id` those two log tables carry, so the nil is
// the column's rather than a missing argument: this value used to travel as
// a bare `any` through five helpers, where "which partition" and "no value"
// looked the same.
type feed struct{ tripID any }

// tripFeed is one trip's change feed.
func tripFeed(tripID string) feed { return feed{tripID: tripID} }

// masterFeed is the instance-wide change feed.
var masterFeed = feed{}

// scopeRule decides whether a mutation may be applied at all, and may stamp
// server-owned columns while it looks (which is why it takes a pointer).
// ReasonNone means the mutation proceeds.
type scopeRule func(ctx context.Context, tx *sql.Tx, m *sync.Mutation, row sync.Row) (RejectReason, error)

// changeHook runs after a partition's own change_log entry landed, for the
// extra entries only that partition owes. It returns the seq a caller should
// report — the last entry it wrote, or the one it was given.
type changeHook func(ctx context.Context, tx *sql.Tx, p partition, w writeOutcome) (int64, error)

// writeOutcome is what a changeHook needs to know about the write that just
// landed.
type writeOutcome struct {
	m sync.Mutation
	// row is the server's row as it was *before* the write.
	row sync.Row
	// deleted is what the merge decided, which is not the mutation's op: a
	// delete FR-24.3 retired arrives here as an upsert.
	deleted bool
	// retired is FR-24.3's outcome: the delete was turned into a marking.
	retired bool
	// seq is the change_log position of the write itself.
	seq int64
}

// partition is one of the two sync partitions, as a value.
//
// Everything that differs between them is a field here, so the difference
// is readable in one place instead of by diffing two functions.
type partition struct {
	// tables is the entity set the partition accepts; anything else is a
	// validation error rather than a refusal.
	tables map[string]bool
	// feed is where this partition's change_log and conflict_log entries go.
	feed feed
	// actorID is the user the push is attributed to.
	actorID string
	// scope is the partition's write gate.
	scope scopeRule
	// relogScopeRefusal says whether a scope refusal re-delivers the row
	// (ADR-031). The master partition does; the trip partition must not,
	// because `out_of_scope` means the row is not this partition's and an
	// entry for it would hand the pusher a foreign row's snapshot (P-3).
	relogScopeRefusal bool
	// retirable names the tables where a blocked delete becomes FR-24.3's
	// retirement instead of a refusal. Nil on the trip partition: nothing
	// there is kept instead of deleted.
	retirable map[string]bool
	// afterChange writes the extra change_log entries the partition owes;
	// nil where it owes none.
	afterChange changeHook
}

// tripPartition is the partition for one trip's rows, pushed by userID.
func tripPartition(tripID, userID string) partition {
	return partition{
		tables:  tripPartitionTables,
		feed:    tripFeed(tripID),
		actorID: userID,
		scope: func(_ context.Context, _ *sql.Tx, m *sync.Mutation, row sync.Row) (RejectReason, error) {
			if !belongsToTrip(tripID, *m, row.Fields, row.Exists) {
				return ReasonOutOfScope, nil
			}
			return ReasonNone, nil
		},
	}
}

// masterPartition is the instance-wide partition, pushed by userID.
func masterPartition(userID string) partition {
	return partition{
		tables:  masterPartitionTables,
		feed:    masterFeed,
		actorID: userID,
		scope: func(ctx context.Context, tx *sql.Tx, m *sync.Mutation, row sync.Row) (RejectReason, error) {
			return authorizeMaster(ctx, tx, userID, m, row.Fields, row.Exists)
		},
		relogScopeRefusal: true,
		retirable:         lifecycleTables,
		afterChange:       masterAfterChange,
	}
}

// applyMutation resolves one mutation of either partition transactionally:
// idempotency memo, scope, merge per NFR-4.2a, persistence, conflict_log,
// change_log.
func (s *Store) applyMutation(ctx context.Context, m sync.Mutation, p partition) (MutationResult, error) {
	if err := validate(m, p.tables); err != nil {
		return MutationResult{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return MutationResult{}, fmt.Errorf("begin: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck // no-op after a successful Commit

	if recorded, found, err := recordedResult(ctx, tx, m.MutationID); err != nil {
		return MutationResult{}, err
	} else if found {
		return recorded, nil
	}

	row, err := loadRow(ctx, tx, m.Table, m.ID)
	if err != nil {
		return MutationResult{}, err
	}

	refused, err := p.scope(ctx, tx, &m, row)
	if err != nil {
		return MutationResult{}, err
	}
	if refused != ReasonNone {
		return s.reject(ctx, tx, m, row, p, refused, p.relogScopeRefusal)
	}

	merged := sync.Merge(row, m)

	// Asked before the delete rather than read out of the failure it would
	// cause: the driver's constraint error is a message, and a message is
	// not a contract to branch on. FR-9.2 is why the reference blocks at
	// all — an archived trip keeps knowing which Vorlage its rows came from.
	var retired bool
	if blocked, err := stillReferenced(ctx, tx, m, merged.Deleted, row.Exists); err != nil {
		return MutationResult{}, err
	} else if blocked && p.retirable[m.Table] {
		// FR-24.3: for a master item or a Vorlage the reference does not
		// refuse the delete, it decides which delete this is. The row is
		// kept so history keeps resolving against it and marked so no
		// display surface offers it again.
		retired = true
		m = retireInstead(m, time.Now().UTC().Format(time.RFC3339))
		merged = sync.Merge(row, m)
	} else if blocked {
		return s.reject(ctx, tx, m, row, p, ReasonStillReferenced, true)
	}

	// FK cascades delete child rows inside SQLite, where the change feed
	// cannot see them; collect their ids before the delete so they can be
	// tombstoned like any other change.
	cascaded, err := cascadeChildren(ctx, tx, m, merged.Deleted, row.Exists)
	if err != nil {
		return MutationResult{}, err
	}

	res := MutationResult{MutationID: m.MutationID, Outcome: merged.Outcome, Conflicts: merged.Conflicts}
	changed, err := persist(ctx, tx, m.Table, m, merged, row.Exists)
	if err != nil {
		if isConstraintViolation(err) {
			// What is left after the pre-check above: a container deleted on
			// another device, a quantity cut below what is already packed,
			// two admins racing to add the same member (UNIQUE), a mutation
			// naming a parent that is gone (FK), values a CHECK refuses. The
			// statement failed and the transaction survives, so it is a
			// refusal the client can park — where an error would become a
			// 500, and a 5xx is the one answer the outbox keeps retrying,
			// wedging the whole partition behind the bad row.
			return s.reject(ctx, tx, m, row, p, ReasonConstraintViolated, true)
		}
		return MutationResult{}, err
	}

	if changed {
		if res.Seq, err = appendChangeLog(ctx, tx, p.feed, m, merged.Deleted); err != nil {
			return MutationResult{}, err
		}
		for _, c := range cascaded {
			tombstone := sync.Mutation{Table: c.table, ID: c.id, HLC: m.HLC}
			if _, err := appendChangeLog(ctx, tx, p.feed, tombstone, true); err != nil {
				return MutationResult{}, err
			}
		}
		if p.afterChange != nil {
			w := writeOutcome{m: m, row: row, deleted: merged.Deleted, retired: retired, seq: res.Seq}
			if res.Seq, err = p.afterChange(ctx, tx, p, w); err != nil {
				return MutationResult{}, err
			}
		}
	}
	if err := logConflicts(ctx, tx, p.feed, p.actorID, m, merged.Conflicts); err != nil {
		return MutationResult{}, err
	}
	return res, finalize(ctx, tx, res)
}

// reject answers one refusal: it re-delivers the unchanged row where the
// partition asks for it (ADR-031), records the memo and commits, so a
// refused mutation is never retried and never leaves the pusher's
// optimistic copy standing.
func (s *Store) reject(
	ctx context.Context,
	tx *sql.Tx,
	m sync.Mutation,
	row sync.Row,
	p partition,
	reason RejectReason,
	relog bool,
) (MutationResult, error) {
	res := MutationResult{MutationID: m.MutationID, Outcome: sync.OutcomeRejected, Reason: reason}
	if relog {
		var err error
		if res.Seq, err = relogRefused(ctx, tx, p.feed, m, row); err != nil {
			return MutationResult{}, err
		}
	}
	return res, finalize(ctx, tx, res)
}
