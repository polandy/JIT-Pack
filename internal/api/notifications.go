// Package api — notifications.go serves FR-6.2's REST endpoints: fetching
// and acknowledging notifications, and the M17 per-kind preferences. Who is
// notified of what, and the delivery, are internal/notify's.
package api

import (
	"net/http"

	"jitpack/internal/store"
)

const (
	defaultNotificationLimit = 50
	maxNotificationLimit     = 200
)

// handleListNotifications serves GET /api/v1/notifications
// (?unread=1 filters, ?limit= caps; own notifications only).
func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	limit, err := queryInt(r, "limit", defaultNotificationLimit)
	if err != nil || limit < 1 || limit > maxNotificationLimit {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "limit must be 1..200")
		return
	}
	unread := r.URL.Query().Get("unread") == "1"

	list, err := s.store.ListNotifications(r.Context(), userID, unread, int(limit))
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "list failed")
		return
	}
	out := make([]NotificationEntry, 0, len(list))
	for _, n := range list {
		out = append(out, NotificationEntry{
			ID: n.ID, Kind: n.Kind, Payload: n.Payload, CreatedAt: n.CreatedAt, ReadAt: n.ReadAt,
		})
	}
	writeJSON(w, NotificationListResponse{Notifications: out})
}

// handleMarkNotificationRead serves POST /api/v1/notifications/{notificationID}/read.
func (s *Server) handleMarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	err := s.store.MarkNotificationRead(r.Context(), userID, r.PathValue(PathNotificationID))
	if err != nil {
		writeStoreError(w, err, "mark read failed")
		return
	}
	writeJSON(w, OKResponse{OK: true})
}

// handleGetNotificationPrefs serves GET /api/v1/me/notification-prefs.
func (s *Server) handleGetNotificationPrefs(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	prefs, err := s.store.NotificationPrefs(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "prefs failed")
		return
	}
	writeJSON(w, NotificationPrefs{
		Delegation:   prefs[store.NotifyDelegation],
		Mention:      prefs[store.NotifyMention],
		Task:         prefs[store.NotifyTask],
		LockTaken:    prefs[store.NotifyLockTaken],
		Note:         prefs[store.NotifyNote],
		NoteReply:    prefs[store.NotifyNoteReply],
		TaskDue:      prefs[store.NotifyTaskDue],
		ShoppingDue:  prefs[store.NotifyShoppingDue],
		ExcursionDue: prefs[store.NotifyExcursionDue],
		// FR-29.8.
		Idea:            prefs[store.NotifyIdea],
		IdeaComment:     prefs[store.NotifyIdeaComment],
		IdeaShortlisted: prefs[store.NotifyIdeaShortlisted],
	})
}

// handlePutNotificationPrefs serves PUT /api/v1/me/notification-prefs
// with a {"delegation":bool,"mention":bool,"task":bool} body.
func (s *Server) handlePutNotificationPrefs(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	// The *request* is deliberately a map rather than the wire struct: a
	// missing key means "leave it enabled" (UI-Spec M17), and a struct would
	// decode it as false and silently switch the kind off.
	var prefs map[string]bool
	if err := decodeJSON(w, r, maxJSONBodyBytes, &prefs); err != nil {
		writeDecodeError(w, err, "malformed prefs body")
		return
	}
	if err := s.store.SetNotificationPrefs(r.Context(), userID, prefs); err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "save prefs failed")
		return
	}
	writeJSON(w, OKResponse{OK: true})
}
