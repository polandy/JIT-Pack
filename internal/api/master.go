// Package api — master.go exposes the master-partition sync endpoints
// (Sync-API Spec §4/§5): GET/POST /api/v1/sync/master. There is no
// membership middleware here — visibility and ownership are enforced
// per row by the store (own + published templates, member trips).
package api

import (
	"net/http"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

func (s *Server) handlePullMaster(w http.ResponseWriter, r *http.Request) {
	cursor, limit, ok := parsePullQuery(w, r)
	if !ok {
		return
	}
	userID, _ := r.Context().Value(userIDKey).(string)

	page, err := s.store.PullMaster(r.Context(), userID, cursor, int(limit))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "pull failed")
		return
	}
	writePullPage(w, page)
}

func (s *Server) handlePushMaster(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	out, _, ok := applyPushBatch(w, r, nil, func(m syncpkg.Mutation) (store.MutationResult, error) {
		return s.store.ApplyMasterMutation(r.Context(), userID, m)
	})
	if !ok {
		return
	}
	writeJSON(w, out)

	// master.changed reaches only the pusher's other devices; consumers
	// of published templates discover changes lazily on their next pull
	// (spec §8, no template.changed event).
	if out.PullHint.NextCursor > 0 {
		s.hub.NotifyMasterChanged(userID, out.PullHint.NextCursor)
	}
}
