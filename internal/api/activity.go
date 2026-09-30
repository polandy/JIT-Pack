// Package api — activity.go serves the activity log (FR-32.1, ADR-084):
// a trip's, read by its members, and the inventory's, read per user.
package api

import (
	"encoding/json"
	"net/http"

	"jitpack/internal/store"
)

// The two query parameters that page a log.
const (
	queryActivityBefore = "before"
	queryActivityLimit  = "limit"
)

func (s *Server) handleTripActivity(w http.ResponseWriter, r *http.Request) {
	before, limit, ok := activityPage(w, r)
	if !ok {
		return
	}
	entries, err := s.store.TripActivity(r.Context(), r.PathValue(PathTripID), before, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "activity log failed")
		return
	}
	writeActivity(w, entries, limit)
}

func (s *Server) handleMasterActivity(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	before, limit, ok := activityPage(w, r)
	if !ok {
		return
	}
	entries, err := s.store.InventoryActivity(r.Context(), userID, before, limit)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "activity log failed")
		return
	}
	writeActivity(w, entries, limit)
}

// activityPage reads the paging parameters, answering 422 itself when one
// is not a number.
func activityPage(w http.ResponseWriter, r *http.Request) (before int64, limit int, ok bool) {
	before, err := queryInt(r, queryActivityBefore, 0)
	if err != nil || before < 0 {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "before must be a non-negative integer")
		return 0, 0, false
	}
	raw, err := queryInt(r, queryActivityLimit, store.DefaultActivityPage)
	if err != nil || raw <= 0 {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "limit must be a positive integer")
		return 0, 0, false
	}
	return before, int(min(raw, store.MaxActivityPage)), true
}

// writeActivity answers one page. A page shorter than asked for reached
// the beginning, so it hands out no cursor.
func writeActivity(w http.ResponseWriter, entries []store.ActivityEntry, limit int) {
	out := ActivityListResponse{Entries: make([]ActivityEntry, 0, len(entries))}
	for _, e := range entries {
		changes := map[string][]any{}
		// The column is CHECKed json_valid and written only by
		// recordActivity, so a decode failure cannot happen short of a
		// hand-edited database; the entry then shows without its fields
		// rather than failing the whole page.
		_ = json.Unmarshal(e.Changes, &changes)
		out.Entries = append(out.Entries, ActivityEntry{
			ID: e.ID, EntityTable: e.EntityTable, EntityID: e.EntityID,
			Op: ActivityOp(e.Op), Label: e.Label, Subject: e.Subject,
			Changes: changes, ActorUserID: e.ActorUserID, CreatedAt: e.CreatedAt,
		})
	}
	if len(entries) == limit {
		out.Before = entries[len(entries)-1].ID
	}
	writeJSON(w, out)
}
