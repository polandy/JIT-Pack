package api

import (
	"fmt"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

// capMark enforces the length cap on an incoming mark, mirroring the CHECK in
// schema.sql so the client is told which field was refused instead of meeting
// a driver-level constraint error (FR-28.9).
//
// It is a cap and nothing else. The server treats the value as opaque text
// exactly like a name and does not decide whether it "is really an emoji" —
// Unicode adds emoji every year, so such a check is a table that silently
// rejects next year's valid input on a field where a wrong value costs a wrong
// little picture. The curated index lives client-side, and this is a display
// preference rather than a security boundary: invariant 3 does not reach it,
// because nothing is being attributed to an actor.
func capMark(m *syncpkg.Mutation) error {
	// Which tables carry a mark is the column list in store's registry, not
	// a second one here (G-2). `trip_items` has none: a generated row
	// renders the mark of the master item it came from (FR-28.7).
	if !store.TableHasMark(m.Table) {
		return nil
	}
	raw, ok := m.Fields[store.MarkColumn]
	if !ok {
		return nil
	}
	value, ok := raw.(string)
	if !ok {
		// nil clears the mark, which is a first-class state (FR-28.1); any
		// other type is left to the store's column gate to reject.
		return nil
	}
	if len(value) > store.MarkMaxBytes {
		return fmt.Errorf("%s.%s exceeds %d bytes", m.Table, store.MarkColumn, store.MarkMaxBytes)
	}
	return nil
}
