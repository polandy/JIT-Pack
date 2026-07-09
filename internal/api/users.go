package api

import (
	"encoding/json"
	"net/http"
)

// handleListUsers returns the instance's user directory — the M3 sharing
// step needs accounts to pick from (FR-4.5). Any authenticated user may
// list; a self-hosted instance's roster is not a secret to its users.
func (s *Server) handleListUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.store.ListUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "user listing failed")
		return
	}
	type wireUser struct {
		UserID      string `json:"user_id"`
		DisplayName string `json:"display_name"`
	}
	out := make([]wireUser, 0, len(users))
	for _, u := range users {
		out = append(out, wireUser{UserID: u.UserID, DisplayName: u.DisplayName})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"users": out})
}
