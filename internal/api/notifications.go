// Package api — notifications.go implements FR-6.2: detecting
// notification triggers in applied push mutations (delegation, @mention,
// task on a delegated item), the REST endpoints to fetch/acknowledge
// them, and the M17 per-kind preference endpoints. Fan-out to connected
// devices rides the WebSocket as notification.created (spec §7).
package api

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"strings"
	"unicode"

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

type wireNotification struct {
	ID        string         `json:"id"`
	Kind      string         `json:"kind"`
	Payload   map[string]any `json:"payload"`
	CreatedAt string         `json:"created_at"`
	ReadAt    *string        `json:"read_at,omitempty"`
}

// handleListNotifications serves GET /api/v1/notifications
// (?unread=1 filters, ?limit= caps; own notifications only).
func (s *Server) handleListNotifications(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	limit, err := queryInt(r, "limit", defaultNotificationLimit)
	if err != nil || limit < 1 || limit > maxNotificationLimit {
		writeError(w, http.StatusUnprocessableEntity, "validation", "limit must be 1..200")
		return
	}
	unread := r.URL.Query().Get("unread") == "1"

	list, err := s.store.ListNotifications(r.Context(), userID, unread, int(limit))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "list failed")
		return
	}
	out := make([]wireNotification, 0, len(list))
	for _, n := range list {
		out = append(out, wireNotification{
			ID: n.ID, Kind: n.Kind, Payload: n.Payload, CreatedAt: n.CreatedAt, ReadAt: n.ReadAt,
		})
	}
	writeJSON(w, map[string]any{"notifications": out})
}

// handleMarkNotificationRead serves POST /api/v1/notifications/{notificationID}/read.
func (s *Server) handleMarkNotificationRead(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	err := s.store.MarkNotificationRead(r.Context(), userID, r.PathValue("notificationID"))
	if errors.Is(err, store.ErrNotificationNotFound) {
		writeError(w, http.StatusNotFound, "notification_not_found", "no such notification")
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "mark read failed")
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// handleGetNotificationPrefs serves GET /api/v1/me/notification-prefs.
func (s *Server) handleGetNotificationPrefs(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	prefs, err := s.store.NotificationPrefs(r.Context(), userID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "prefs failed")
		return
	}
	writeJSON(w, prefs)
}

// handlePutNotificationPrefs serves PUT /api/v1/me/notification-prefs
// with a {"delegation":bool,"mention":bool,"task":bool} body.
func (s *Server) handlePutNotificationPrefs(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	var prefs map[string]bool
	if err := json.NewDecoder(r.Body).Decode(&prefs); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "malformed prefs body")
		return
	}
	if err := s.store.SetNotificationPrefs(r.Context(), userID, prefs); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "save prefs failed")
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// emitNotifications scans applied push mutations for FR-6.2 triggers and
// creates + fans out notifications. Skipped entirely in Single-User Mode
// (FR-17.3: no second party); solo trips short-circuit for the same
// reason. Failures are logged, never surfaced — notifications are a
// side effect, the push already succeeded.
func (s *Server) emitNotifications(ctx context.Context, tripID, actor string, muts []syncpkg.Mutation, results []pushResult) {
	members, err := s.store.TripMemberNames(ctx, tripID)
	if err != nil {
		slog.Error("notification member lookup", "trip", tripID, "error", err)
		return
	}
	if len(members) < 2 {
		return
	}
	actorName := ""
	for _, m := range members {
		if m.UserID == actor {
			actorName = m.DisplayName
		}
	}

	for i, m := range muts {
		if i >= len(results) || (results[i].Outcome != "applied" && results[i].Outcome != "merged") {
			continue
		}
		switch m.Table {
		case "trip_items":
			s.notifyDelegation(ctx, tripID, actor, actorName, m)
		case "comments":
			if m.Op == syncpkg.OpInsert {
				s.notifyComment(ctx, tripID, actor, actorName, m, members)
			}
		}
	}
}

// notifyDelegation fires when a push hands packing responsibility to
// someone else (FR-4.3 → FR-6.2). state=packed self-stamps the actor via
// stampActor, so those never reach the target != actor check.
func (s *Server) notifyDelegation(ctx context.Context, tripID, actor, actorName string, m syncpkg.Mutation) {
	target, _ := m.Fields["packer_user_id"].(string)
	if target == "" || target == actor {
		return
	}
	itemName, _, err := s.store.TripItemInfo(ctx, m.ID)
	if err != nil {
		slog.Error("notification item lookup", "item", m.ID, "error", err)
		return
	}
	s.createAndNotify(ctx, target, store.NotifyDelegation, map[string]any{
		"trip_id": tripID, "item_id": m.ID,
		"actor_id": actor, "actor_name": actorName, "item_name": itemName,
	})
}

// notifyComment fires mention notifications for @display-name matches
// and a task notification to the item's packer when the comment is a
// task (FR-7.2). A packer who is also mentioned gets exactly one
// notification — task wins, it is the more actionable kind.
func (s *Server) notifyComment(ctx context.Context, tripID, actor, actorName string, m syncpkg.Mutation, members []store.MemberName) {
	body, _ := m.Fields["body"].(string)
	payload := map[string]any{
		"trip_id": tripID, "comment_id": m.ID,
		"actor_id": actor, "actor_name": actorName, "preview": truncate(body, previewLen),
	}
	notified := map[string]bool{}

	if itemID, _ := m.Fields["trip_item_id"].(string); itemID != "" {
		itemName, packer, err := s.store.TripItemInfo(ctx, itemID)
		if err != nil {
			slog.Error("notification item lookup", "item", itemID, "error", err)
			return
		}
		payload["item_id"] = itemID
		payload["item_name"] = itemName
		if isTruthy(m.Fields["is_task"]) && packer != "" && packer != actor {
			s.createAndNotify(ctx, packer, store.NotifyTask, payload)
			notified[packer] = true
		}
	}

	for _, target := range mentionTargets(body, members) {
		if target == actor || notified[target] {
			continue
		}
		s.createAndNotify(ctx, target, store.NotifyMention, payload)
		notified[target] = true
	}
}

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

// mentionTargets returns the user ids of members whose display name
// appears as @<name> in body. Matching is case-insensitive and
// tolerates spaces inside names (OIDC display names); the character
// after the name must be a word boundary so @Andyx never hits @Andy.
func mentionTargets(body string, members []store.MemberName) []string {
	lower := strings.ToLower(body)
	var out []string
	for _, m := range members {
		name := strings.ToLower(m.DisplayName)
		if name == "" {
			continue
		}
		for idx := 0; ; {
			i := strings.Index(lower[idx:], "@"+name)
			if i < 0 {
				break
			}
			end := idx + i + 1 + len(name)
			if end >= len(lower) || !isNameRune(rune(lower[end])) {
				out = append(out, m.UserID)
				break
			}
			idx = end
		}
	}
	return out
}

func isNameRune(r rune) bool {
	return unicode.IsLetter(r) || unicode.IsDigit(r)
}

func isTruthy(v any) bool {
	switch t := v.(type) {
	case bool:
		return t
	case float64: // JSON numbers decode as float64
		return t != 0
	case int:
		return t != 0
	default:
		return false
	}
}

func truncate(s string, max int) string {
	runes := []rune(s)
	if len(runes) <= max {
		return s
	}
	return string(runes[:max])
}
