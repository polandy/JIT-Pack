// Package api — conflicts.go exposes the per-trip conflict log for the
// G-2 conflict view (NFR-4.2a: every LWW loser is auditable until the
// trip is archived).
package api

import "net/http"

type wireConflictEntry struct {
	ID           string `json:"id"`
	EntityTable  string `json:"entity_table"`
	EntityID     string `json:"entity_id"`
	Field        string `json:"field"`
	LosingValue  string `json:"losing_value"`
	WinningValue string `json:"winning_value"`
	ResolvedAt   string `json:"resolved_at"`
}

func (s *Server) handleListConflicts(w http.ResponseWriter, r *http.Request) {
	entries, err := s.store.ListConflicts(r.Context(), r.PathValue("tripID"))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "conflict log failed")
		return
	}
	out := struct {
		Conflicts []wireConflictEntry `json:"conflicts"`
	}{Conflicts: make([]wireConflictEntry, 0, len(entries))}
	for _, c := range entries {
		out.Conflicts = append(out.Conflicts, wireConflictEntry{
			ID: c.ID, EntityTable: c.EntityTable, EntityID: c.EntityID,
			Field: c.Field, LosingValue: c.LosingValue, WinningValue: c.WinningValue,
			ResolvedAt: c.ResolvedAt,
		})
	}
	writeJSON(w, out)
}
