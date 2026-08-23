// Package api — conflicts.go exposes the conflict log for the G-2
// conflict view (NFR-4.2a: every LWW loser is auditable). There are two,
// one per sync partition: a trip's, read by its members, and the master
// partition's, read per user and filtered to what that user may see.
package api

import (
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
