// Package api — admin.go exposes instance user management (Addendum
// 3.23) under /api/v1/admin/, guarded by adminOnly. Application-data
// administration only: who holds the admin role is declarative
// (JITPACK_ADMIN_EMAILS) and has no endpoint.
package api

import (
	"errors"
	"net/http"

	"jitpack/internal/store"
)

// handleAdminUsers returns the FR-23.2 overview.
func (s *Server) handleAdminUsers(w http.ResponseWriter, r *http.Request) {
	users, err := s.store.AdminUsers(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "user overview failed")
		return
	}
	out := make([]AdminUser, 0, len(users))
	for _, u := range users {
		out = append(out, AdminUser{
			UserID: u.UserID, DisplayName: u.DisplayName, Email: u.Email,
			CreatedAt: u.CreatedAt, IsInstanceAdmin: u.IsInstanceAdmin,
			DeactivatedAt: u.DeactivatedAt, TripCount: u.TripCount, TemplateCount: u.TemplateCount,
		})
	}
	writeJSON(w, AdminUserListResponse{Users: out})
}

// adminUserAction maps the store's admin errors to wire responses.
func adminUserAction(w http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, store.ErrUserNotFound):
		writeError(w, http.StatusNotFound, ErrNotFound, "no such user")
	case errors.Is(err, store.ErrAdminUndeactivatable):
		// FR-23.3: remove the address from JITPACK_ADMIN_EMAILS first.
		writeError(w, http.StatusConflict, ErrAdminUndeactivatable, "instance admins cannot be deactivated")
	case err != nil:
		writeError(w, http.StatusInternalServerError, ErrInternal, "admin action failed")
	default:
		writeJSON(w, OKResponse{OK: true})
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
