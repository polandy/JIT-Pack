// Package api — conflicts.go exposes the conflict log for the G-2
// conflict view (NFR-4.2a: every LWW loser is auditable *and manually
// revertable*). There are two, one per sync partition: a trip's, read by
// its members, and the master partition's, read per user and filtered to
// what that user may see. Each has a revert endpoint beside its list.
package api

import (
	"errors"
	"net/http"

	"jitpack/internal/store"
)

type wireConflictEntry struct {
	ID           string `json:"id"`
	EntityTable  string `json:"entity_table"`
	EntityID     string `json:"entity_id"`
	Field        string `json:"field"`
	LosingValue  string `json:"losing_value"`
	WinningValue string `json:"winning_value"`
	MutationID   string `json:"mutation_id"`
	ActorUserID  string `json:"actor_user_id"`
	ResolvedAt   string `json:"resolved_at"`
	Reverted     bool   `json:"reverted"`
}

func (s *Server) handleListConflicts(w http.ResponseWriter, r *http.Request) {
	entries, err := s.store.ListConflicts(r.Context(), r.PathValue("tripID"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "conflict log failed")
		return
	}
	writeConflicts(w, entries)
}

func (s *Server) handleListMasterConflicts(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)

	entries, err := s.store.ListMasterConflicts(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "conflict log failed")
		return
	}
	writeConflicts(w, entries)
}

func writeConflicts(w http.ResponseWriter, entries []store.ConflictEntry) {
	out := struct {
		Conflicts []wireConflictEntry `json:"conflicts"`
	}{Conflicts: make([]wireConflictEntry, 0, len(entries))}
	for _, c := range entries {
		out.Conflicts = append(out.Conflicts, wireConflictEntry{
			ID: c.ID, EntityTable: c.EntityTable, EntityID: c.EntityID,
			Field: c.Field, LosingValue: c.LosingValue, WinningValue: c.WinningValue,
			MutationID: c.MutationID, ActorUserID: c.ActorUserID,
			ResolvedAt: c.ResolvedAt, Reverted: c.Reverted,
		})
	}
	writeJSON(w, out)
}

// revertResponse is the §8 RPC envelope: the outcome materializes as an
// ordinary change_log entry, so the caller learns the new value by pulling
// from the hint rather than from this body (P-1).
type revertResponse struct {
	OK       bool `json:"ok"`
	PullHint struct {
		NextCursor int64 `json:"next_cursor"`
	} `json:"pull_hint"`
}

func (s *Server) handleRevertConflict(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue("tripID")

	seq, err := s.store.RevertTripConflict(r.Context(), tripID, r.PathValue("conflictID"))
	if err != nil {
		writeRevertError(w, err)
		return
	}
	writeRevert(w, seq)
	s.hub.NotifyTripChanged(tripID, seq)
}

func (s *Server) handleRevertMasterConflict(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)

	seq, err := s.store.RevertMasterConflict(r.Context(), userID, r.PathValue("conflictID"))
	if err != nil {
		writeRevertError(w, err)
		return
	}
	writeRevert(w, seq)
	// Like a master push: only the actor's own devices are pinged, and
	// everyone else discovers the change on their next pull (§8).
	s.hub.NotifyMasterChanged(userID, seq)
}

func writeRevert(w http.ResponseWriter, seq int64) {
	out := revertResponse{OK: true}
	out.PullHint.NextCursor = seq
	writeJSON(w, out)
}

// writeRevertError gives every refusal its own code, because each is a
// different sentence for the user: the entry is spent, the row is gone,
// the merge rules outrank the revert, or it was never theirs to make.
func writeRevertError(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrConflictNotFound):
		writeError(w, http.StatusNotFound, "conflict_not_found", "no such conflict entry")
	case errors.Is(err, store.ErrConflictAlreadyReverted):
		writeError(w, http.StatusConflict, "already_reverted", "this conflict was already reverted")
	case errors.Is(err, store.ErrConflictRowGone):
		writeError(w, http.StatusConflict, "row_deleted", "the row this conflict names has been deleted")
	case errors.Is(err, store.ErrRevertRefused):
		writeError(w, http.StatusConflict, "revert_refused", "the merge rules refuse this revert")
	case errors.Is(err, store.ErrRevertForbidden):
		writeError(w, http.StatusForbidden, "forbidden", "not allowed to write this row")
	default:
		writeError(w, http.StatusInternalServerError, "internal", "revert failed")
	}
}
