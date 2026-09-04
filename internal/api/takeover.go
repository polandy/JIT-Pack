// Package api — takeover.go is the one server-side part of G-3's lock
// (FR-5.7, ADR-028). A claim is otherwise a client rendering rule over
// synced fields; taking one over is not, because the taker has to be
// stamped by the server (invariant 3) and the holder has to be notified,
// and a client can do neither for itself.
package api

import (
	"context"
	"log/slog"
	"net/http"

	"jitpack/internal/store"
)

// handleTakeover serves POST /trips/{tripID}/items/{itemID}/takeover.
func (s *Server) handleTakeover(w http.ResponseWriter, r *http.Request) {
	tripID, itemID := r.PathValue(PathTripID), r.PathValue(PathItemID)
	takerID, _ := r.Context().Value(userIDKey).(string)

	ev, err := s.store.TakeOverClaim(r.Context(), tripID, itemID, takerID)
	if err != nil {
		writeTakeoverError(w, err)
		return
	}

	out := TakeoverResponse{OK: true, PreviousHolder: ev.FromUserID}
	out.PullHint.NextCursor = ev.Seq
	writeJSON(w, out)

	s.hub.NotifyTripChanged(tripID, ev.Seq)
	// The ephemeral lock event repaints the other screens before their
	// pull lands, exactly as a pushed claim does (§7).
	s.hub.NotifyItemLocked(tripID, itemID, takerID, ev.ItemName)
	s.notifyTakeover(r.Context(), ev)
}

// notifyTakeover tells the person the row was taken from (FR-6.2). It is
// the whole difference between a lock that can be broken and one that is
// not a lock: breaking it costs saying that you meant to.
func (s *Server) notifyTakeover(ctx context.Context, ev store.LockEvent) {
	// The name, not only the id: "Sarah took Zelt over" is the message,
	// and the notification list resolves nothing for itself.
	members, err := s.store.TripMemberNames(ctx, ev.TripID)
	if err != nil {
		slog.Error("takeover member lookup", "trip", ev.TripID, "error", err)
	}
	actorName := displayNameOf(members, ev.ToUserID)
	s.createAndNotify(ctx, ev.FromUserID, store.NotifyLockTaken, map[string]any{
		payloadTripID:    ev.TripID,
		payloadItemID:    ev.TripItemID,
		payloadItemName:  ev.ItemName,
		payloadActorID:   ev.ToUserID,
		payloadActorName: actorName,
	})
}

// handleListLockEvents serves GET /trips/{tripID}/lock-events: who took
// what from whom on this trip, readable by its members the way the
// conflict log is. It is deliberately not part of that log (ADR-028) —
// one list holding two unrelated kinds of event stops being readable.
func (s *Server) handleListLockEvents(w http.ResponseWriter, r *http.Request) {
	events, err := s.store.ListLockEvents(r.Context(), r.PathValue(PathTripID))
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "lock events failed")
		return
	}
	out := LockEventListResponse{LockEvents: make([]LockEvent, 0, len(events))}
	for _, e := range events {
		out.LockEvents = append(out.LockEvents, LockEvent{
			ID: e.ID, TripItemID: e.TripItemID, ItemName: e.ItemName,
			FromUserID: e.FromUserID, ToUserID: e.ToUserID, CreatedAt: e.CreatedAt,
		})
	}
	writeJSON(w, out)
}

// writeTakeoverError gives each refusal its own code: the row is gone,
// nobody is holding it, or it is already the caller's.
func writeTakeoverError(w http.ResponseWriter, err error) {
	writeStoreError(w, err, "takeover failed")
}
