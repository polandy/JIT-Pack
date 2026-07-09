// Package api — push.go implements Web Push delivery (NFR-4.6):
// self-generated VAPID keys persisted in the store, subscription
// registration, and RFC 8291-encrypted sends when a notification is
// created. In-app delivery over the WebSocket remains the universal
// fallback; push only extends reach to backgrounded/closed clients.
package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	webpush "github.com/SherClockHolmes/webpush-go"

	"jitpack/internal/store"
)

const (
	vapidPublicKey  = "vapid_public"
	vapidPrivateKey = "vapid_private"
	// defaultPushContact satisfies the VAPID sub claim (RFC 8292) when
	// the operator sets no JITPACK_PUSH_CONTACT.
	defaultPushContact = "mailto:admin@localhost"
	pushTTLSeconds     = 3600
)

// SetPushContact sets the VAPID contact (RFC 8292 sub claim) shown to
// push services, e.g. "mailto:ops@example.com".
func (s *Server) SetPushContact(contact string) {
	s.pushContact = contact
}

// vapidKeys returns the server's VAPID keypair, generating and
// persisting it on first use. SetServerKey is first-writer-wins, so
// racing instances converge on one keypair — the values are re-read
// after writing.
func (s *Server) vapidKeys(ctx context.Context) (pub, priv string, err error) {
	s.vapidMu.Lock()
	defer s.vapidMu.Unlock()
	if s.vapidPub != "" {
		return s.vapidPub, s.vapidPriv, nil
	}

	pub, pubOK, err := s.store.ServerKey(ctx, vapidPublicKey)
	if err != nil {
		return "", "", err
	}
	priv, privOK, err := s.store.ServerKey(ctx, vapidPrivateKey)
	if err != nil {
		return "", "", err
	}
	if !pubOK || !privOK {
		genPriv, genPub, err := webpush.GenerateVAPIDKeys()
		if err != nil {
			return "", "", err
		}
		if err := s.store.SetServerKey(ctx, vapidPublicKey, genPub); err != nil {
			return "", "", err
		}
		if err := s.store.SetServerKey(ctx, vapidPrivateKey, genPriv); err != nil {
			return "", "", err
		}
		if pub, _, err = s.store.ServerKey(ctx, vapidPublicKey); err != nil {
			return "", "", err
		}
		if priv, _, err = s.store.ServerKey(ctx, vapidPrivateKey); err != nil {
			return "", "", err
		}
	}
	s.vapidPub, s.vapidPriv = pub, priv
	return pub, priv, nil
}

// handleGetVAPIDKey serves GET /api/v1/push/vapid-key — the public key
// the browser needs as applicationServerKey for pushManager.subscribe.
func (s *Server) handleGetVAPIDKey(w http.ResponseWriter, r *http.Request) {
	pub, _, err := s.vapidKeys(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "vapid keys unavailable")
		return
	}
	writeJSON(w, map[string]string{"key": pub})
}

// pushSubscriptionBody mirrors the browser's PushSubscription.toJSON().
type pushSubscriptionBody struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

// handleRegisterPushSubscription serves POST /api/v1/push/subscriptions.
func (s *Server) handleRegisterPushSubscription(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	var body pushSubscriptionBody
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil ||
		body.Endpoint == "" || body.Keys.P256dh == "" || body.Keys.Auth == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "endpoint and keys required")
		return
	}
	err := s.store.SavePushSubscription(r.Context(), store.PushSubscription{
		UserID: userID, Endpoint: body.Endpoint, P256dh: body.Keys.P256dh, Auth: body.Keys.Auth,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "save subscription failed")
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// handleDeletePushSubscription serves DELETE /api/v1/push/subscriptions
// with {"endpoint": "..."} — the M17 opt-out. Owner-scoped.
func (s *Server) handleDeletePushSubscription(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.Endpoint == "" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "endpoint required")
		return
	}
	if err := s.store.DeleteUserPushSubscription(r.Context(), userID, body.Endpoint); err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "delete subscription failed")
		return
	}
	writeJSON(w, map[string]any{"ok": true})
}

// sendWebPush delivers a created notification to all push endpoints of
// the target user. Runs detached from the request: failures only cost
// this channel, the WebSocket ping already went out. Push services
// answering 404/410 mean the browser dropped the registration — the
// subscription is deleted.
func (s *Server) sendWebPush(userID, notificationID, kind string, payload map[string]any) {
	ctx := context.Background()
	subs, err := s.store.PushSubscriptions(ctx, userID)
	if err != nil {
		slog.Error("push subscriptions", "user", userID, "error", err)
		return
	}
	if len(subs) == 0 {
		return
	}
	pub, priv, err := s.vapidKeys(ctx)
	if err != nil {
		slog.Error("vapid keys", "error", err)
		return
	}
	contact := s.pushContact
	if contact == "" {
		contact = defaultPushContact
	}
	message, err := json.Marshal(map[string]any{
		"notification_id": notificationID, "kind": kind, "payload": payload,
	})
	if err != nil {
		slog.Error("marshal push message", "error", err)
		return
	}

	for _, sub := range subs {
		resp, err := webpush.SendNotification(message, &webpush.Subscription{
			Endpoint: sub.Endpoint,
			Keys:     webpush.Keys{P256dh: sub.P256dh, Auth: sub.Auth},
		}, &webpush.Options{
			Subscriber: contact, VAPIDPublicKey: pub, VAPIDPrivateKey: priv, TTL: pushTTLSeconds,
		})
		if err != nil {
			slog.Debug("web push send", "endpoint", sub.Endpoint, "error", err)
			continue
		}
		if resp.StatusCode == http.StatusNotFound || resp.StatusCode == http.StatusGone {
			if err := s.store.DeletePushSubscription(ctx, sub.Endpoint); err != nil {
				slog.Error("drop expired subscription", "error", err)
			}
		}
		resp.Body.Close()
	}
}
