// Package api — push.go serves Web Push's endpoints (NFR-4.6): the VAPID
// public key and the subscription registration. Delivery is internal/notify's.
package api

import (
	"net/http"

	"jitpack/internal/store"
)

// handleGetVAPIDKey serves GET /api/v1/push/vapid-key — the public key
// the browser needs as applicationServerKey for pushManager.subscribe.
func (s *Server) handleGetVAPIDKey(w http.ResponseWriter, r *http.Request) {
	pub, err := s.notifier.VAPIDPublicKey(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "vapid keys unavailable")
		return
	}
	writeJSON(w, VAPIDKeyResponse{Key: pub})
}

// pushSubscriptionBody mirrors the browser's PushSubscription.toJSON().
type pushSubscriptionBody struct {
	Endpoint string `json:"endpoint"`
	Keys     struct {
		P256dh string `json:"p256dh"`
		Auth   string `json:"auth"`
	} `json:"keys"`
}

// What the two subscription endpoints answer with, each from two places:
// a body that would not decode, and one that decoded without the field.
const (
	msgSubscriptionFieldsRequired = "endpoint and keys required"
	msgEndpointRequired           = "endpoint required"
)

// handleRegisterPushSubscription serves POST /api/v1/push/subscriptions.
func (s *Server) handleRegisterPushSubscription(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	var body pushSubscriptionBody
	if err := decodeJSON(w, r, maxJSONBodyBytes, &body); err != nil {
		writeDecodeError(w, err, msgSubscriptionFieldsRequired)
		return
	}
	if body.Endpoint == "" || body.Keys.P256dh == "" || body.Keys.Auth == "" {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, msgSubscriptionFieldsRequired)
		return
	}
	err := s.store.SavePushSubscription(r.Context(), store.PushSubscription{
		UserID: userID, Endpoint: body.Endpoint, P256dh: body.Keys.P256dh, Auth: body.Keys.Auth,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "save subscription failed")
		return
	}
	writeJSON(w, OKResponse{OK: true})
}

// handleDeletePushSubscription serves DELETE /api/v1/push/subscriptions
// with {"endpoint": "..."} — the M17 opt-out. Owner-scoped.
func (s *Server) handleDeletePushSubscription(w http.ResponseWriter, r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := decodeJSON(w, r, maxJSONBodyBytes, &body); err != nil {
		writeDecodeError(w, err, msgEndpointRequired)
		return
	}
	if body.Endpoint == "" {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, msgEndpointRequired)
		return
	}
	if err := s.store.DeleteUserPushSubscription(r.Context(), userID, body.Endpoint); err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "delete subscription failed")
		return
	}
	writeJSON(w, OKResponse{OK: true})
}
