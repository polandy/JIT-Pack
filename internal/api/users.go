package api

import (
	"net/http"
)

// handleListUsers returns the instance's user directory — the M3 sharing
// step needs accounts to pick from (FR-4.5). Any authenticated user may
// list; a self-hosted instance's roster is not a secret to its users.
func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "user listing failed")
		return
	}
	out := make([]DirectoryUser, 0, len(users))
	for _, u := range users {
		out = append(out, DirectoryUser{UserID: u.UserID, DisplayName: u.DisplayName})
	}
	writeJSON(w, UserListResponse{Users: out})
}
