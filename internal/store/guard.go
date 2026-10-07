// Package store — guard.go is the per-table half of a partition's write gate
// (G-2). Which rule a table's writes must pass is declared once, as
// tableSpec.guard; the partition's scope applies what is the partition's own
// (membership in the trip whose endpoint was called) and then the table's
// guard. A table that needs no rule of its own says so with `unguarded` and
// the reason beside it, so a missing rule is a failing test
// (TestEverySpecDeclaresAWriteGuard) rather than a silent default.
package store

import (
	"context"
	"database/sql"

	"jitpack/internal/sync"
)

// guardRule is one table's write rule. It runs after the stamp step, so a
// server-owned column it reads is the server's, and it may strip fields it
// owns from the mutation. ReasonNone means the mutation proceeds.
type guardRule func(ctx context.Context, tx *sql.Tx, in guardInput) (RejectReason, error)

// guardInput is what a guardRule may read.
type guardInput struct {
	// tripID is the trip whose endpoint was called; empty on the master
	// partition.
	tripID string
	// actorID is the authenticated user the push is attributed to.
	actorID string
	m       *sync.Mutation
	// row is the server's row before the write.
	row sync.Row
}

// unguarded is the guard of a table whose partition's own gate, the schema's
// constraints and the stamp step are all its writes need. Every use names
// that reason beside it in tableSpecs.
func unguarded(context.Context, *sql.Tx, guardInput) (RejectReason, error) {
	return ReasonNone, nil
}

// refused is the answer for a table the registry does not know: a missing
// rule fails closed.
func refused(context.Context, *sql.Tx, guardInput) (RejectReason, error) {
	return ReasonNotAuthorized, nil
}

// allOf runs rules in order and answers the first refusal or error.
func allOf(rules ...guardRule) guardRule {
	return func(ctx context.Context, tx *sql.Tx, in guardInput) (RejectReason, error) {
		for _, rule := range rules {
			if reason, err := rule(ctx, tx, in); reason != ReasonNone || err != nil {
				return reason, err
			}
		}
		return ReasonNone, nil
	}
}

// guardFor returns table's declared guard, or `refused` when there is none.
func guardFor(table string) guardRule {
	if guard := tableSpecs[table].guard; guard != nil {
		return guard
	}
	return refused
}
