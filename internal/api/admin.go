// Package api — admin.go exposes instance user management (Addendum
// 3.23) under /api/v1/admin/, guarded by adminOnly. Application-data
// administration only: who holds the admin role is declarative
// (JITPACK_ADMIN_EMAILS) and has no endpoint.
package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"jitpack/internal/store"
)

// handleAdminUsers returns the FR-23.2 overview.
func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.store.AdminUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "user overview failed")
		return
	}
	type wireAdminUser struct {
		UserID          string  `json:"user_id"`
		DisplayName     string  `json:"display_name"`
		Email           string  `json:"email,omitempty"`
		CreatedAt       string  `json:"created_at"`
		IsInstanceAdmin bool    `json:"is_instance_admin"`
		DeactivatedAt   *string `json:"deactivated_at"`
		TripCount       int     `json:"trip_count"`
		TemplateCount   int     `json:"template_count"`
	}
	out := make([]wireAdminUser, 0, len(users))
	for _, u := range users {
		out = append(out, wireAdminUser{
			UserID: u.UserID, DisplayName: u.DisplayName, Email: u.Email,
			CreatedAt: u.CreatedAt, IsInstanceAdmin: u.IsInstanceAdmin,
			DeactivatedAt: u.DeactivatedAt, TripCount: u.TripCount, TemplateCount: u.TemplateCount,
		})
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{"users": out})
}

// adminUserAction maps the store's admin errors to wire responses.
func adminUserAction(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrUserNotFound):
		writeError(w, http.StatusNotFound, "not_found", "no such user")
	case errors.Is(err, store.ErrAdminUndeactivatable):
		// FR-23.3: remove the address from JITPACK_ADMIN_EMAILS first.
		writeError(w, http.StatusConflict, "admin_undeactivatable", "instance admins cannot be deactivated")
	case err != nil:
		writeError(w, http.StatusInternalServerError, "internal", "admin action failed")
	default:
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]bool{"ok": true})
	}
}

func (s *Server) handleDeactivateUser(w http.ResponseWriter, r *http.Request) {
	adminUserAction(w, s.store.DeactivateUser(r.Context(), r.PathValue("userID")))
}

func (s *Server) handleReactivateUser(w http.ResponseWriter, r *http.Request) {
	adminUserAction(w, s.store.ReactivateUser(r.Context(), r.PathValue("userID")))
}

func (s *Server) handleAdminResetAvatar(w http.ResponseWriter, r *http.Request) {
	adminUserAction(w, s.store.ResetAvatar(r.Context(), r.PathValue("userID")))
}

func (s *Server) handleAdminResetDisplayName(w http.ResponseWriter, r *http.Request) {
	adminUserAction(w, s.store.ResetDisplayName(r.Context(), r.PathValue("userID")))
}
