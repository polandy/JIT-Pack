// Package api — masterdelete.go serves the direct delete of a single master
// row (ADR-038): the door for everything that is not the app itself.
//
// The app writes through the sync push instead, because its writes have to
// survive being offline and Local Mode has no server at all (invariant 5).
// Both doors reach the same rule: this handler mints the mutation the caller
// would otherwise compose and hands it to the same store pipeline, so
// FR-24.3's retire-or-remove decision has exactly one implementation.
package api

import (
	"net/http"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

// deleteMasterRow builds the handler for one deletable master table, binding
// the table and the path variable that carries its id. Four routes, one
// behaviour: a per-table copy would be four places for the same refusal
// mapping to drift.
func (s *Server) deleteMasterRow(table, pathParam string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := r.Context().Value(userIDKey).(string)

		res, err := s.store.DeleteMasterRow(r.Context(), userID, table, r.PathValue(pathParam))
		if err != nil {
			writeMasterDeleteError(w, err)
			return
		}
		if res.Outcome == syncpkg.OutcomeRejected {
			writeMasterDeleteRefusal(w, res.Reason)
			return
		}

		out := MasterDeleteResponse{Outcome: MutationOutcome(res.Outcome), Retired: res.Retired}
		out.PullHint.NextCursor = res.Seq
		writeJSON(w, out)

		// Like a master push: only the actor's own devices are pinged, and
		// everyone else discovers the change on their next pull (§8).
		if res.Seq > 0 {
			s.hub.NotifyMasterChanged(userID, res.Seq)
		}
	}
}

func writeMasterDeleteError(w http.ResponseWriter, err error) {
	writeStoreError(w, err, "delete failed")
}

// writeMasterDeleteRefusal answers a rejected mutation.
//
// It is deliberately one branch rather than a code per reason: with today's
// allowlist no rejection can happen at all — the four tables are shared, so
// nobody is unauthorized, and a reference retires an item or a Vorlage rather
// than refusing it (FR-24.3). Inventing a code per reason would be a
// vocabulary nothing can emit; the reason travels in the message, and the
// day a widening makes one of them ordinary it earns its own code then.
// TestDeletableTables_CannotBeRefusedAsStillReferenced_FR24_3 is what notices.
//
// What this must never do is fall through to 200: a refusal reported as a
// deletion would tell a cleanup script the row is gone while it is still there.
func writeMasterDeleteRefusal(w http.ResponseWriter, reason store.RejectReason) {
	writeError(w, http.StatusConflict, ErrValidation, "delete refused: "+string(reason))
}
