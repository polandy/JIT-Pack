// Package api — notifications.go implements FR-6.2: detecting
// notification triggers in applied push mutations (delegation, @mention,
// task on a delegated item), the REST endpoints to fetch/acknowledge
// them, and the M17 per-kind preference endpoints. Fan-out to connected
// devices rides the WebSocket as notification.created (spec §7).
package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

const (
	defaultNotificationLimit = 50
	maxNotificationLimit     = 200
	// previewLen truncates comment bodies in payloads — the payload is a
	// teaser for the toast/OS notification, the deep link has the rest.
	previewLen = 120
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
		Delegation: prefs[store.NotifyDelegation],
		Mention:    prefs[store.NotifyMention],
		Task:       prefs[store.NotifyTask],
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
	if err := json.NewDecoder(r.Body).Decode(&prefs); err != nil {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "malformed prefs body")
		return
	}
	if err := s.store.SetNotificationPrefs(r.Context(), userID, prefs); err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "save prefs failed")
		return
	}
	writeJSON(w, OKResponse{OK: true})
}

// emitNotifications creates and fans out the notifications one push
// earns. The decision of who gets what is planNotifications' (FR-6.2,
// notificationrules.go); everything here is the I/O that carries it out.
// Failures are logged, never surfaced — notifications are a side effect,
// the push already succeeded.
func (s *Server) emitNotifications(ctx context.Context, tripID, actor string, muts []syncpkg.Mutation, results []MutationResult) {
	members, err := s.store.TripMemberNames(ctx, tripID)
	if err != nil {
		slog.Error("notification member lookup", "trip", tripID, "error", err)
		return
	}
	resolve := func(itemID string) (itemFacts, bool) {
		name, packer, err := s.store.TripItemInfo(ctx, itemID)
		if err != nil {
			slog.Error("notification item lookup", "item", itemID, "error", err)
			return itemFacts{}, false
		}
		return itemFacts{Name: name, PackerUserID: packer}, true
	}
	for _, n := range planNotifications(tripID, actor, muts, results, members, resolve) {
		s.createAndNotify(ctx, n.UserID, n.Kind, n.Payload)
	}
}

// Payload keys shared by every notification kind (FR-6.3 deep link).
const (
	payloadTripID    = "trip_id"
	payloadItemID    = "item_id"
	payloadItemName  = "item_name"
	payloadActorID   = "actor_id"
	payloadActorName = "actor_name"
	payloadCommentID = "comment_id"
	payloadPreview   = "preview"
)

// createAndNotify persists the notification (unless the target's prefs
// suppress it) and pings the target's connected devices.
func (s *Server) createAndNotify(ctx context.Context, userID, kind string, payload map[string]any) {
	id, err := s.store.CreateNotification(ctx, userID, kind, payload)
	if err != nil {
		slog.Error("create notification", "user", userID, "kind", kind, "error", err)
		return
	}
	if id == "" {
		return // preference-suppressed (M17)
	}
	s.hub.NotifyNotificationCreated(userID, id)
	// Web Push rides along detached (NFR-4.6): the response and the WS
	// ping must never wait on a third-party push service.
	go s.sendWebPush(userID, id, kind, payload)
}
