package api

import (
	"errors"
	"io"
	"net/http"

	"jitpack/internal/store"
)

const maxItemImageUploadBytes = 150 * 1024

// handleGetItemImage streams an item's reference photo (Addendum FR-22.1).
// Public like the avatar GET (ADR-002): item photos are shared, low-
// sensitivity presentation data. The ETag is the stored image_hash.
func (s *Server) handleGetItemImage(w http.ResponseWriter, r *http.Request) {
	data, hash, err := s.store.GetItemImage(r.Context(), r.PathValue("itemID"))
	if err != nil || data == nil {
		writeError(w, http.StatusNotFound, "not_found", "no image for this item")
		return
	}
	w.Header().Set("ETag", `"`+hash+`"`)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("Content-Type", "image/jpeg")
	w.Write(data)
}

// handlePutItemImage accepts a client-optimized JPEG (FR-22.2/FR-22.3)
// and stores it, stamping items.image_hash. Validation here is
// defense-in-depth (FR-22.4): the store layer and the CHECK constraint
// enforce the same JPEG-only / 150 KB limits independently. Per FR-22.6
// this needs only authentication — no trip role — since items carry no
// trip association; the route wires it behind s.authed alone.
func (s *Server) handlePutItemImage(w http.ResponseWriter, r *http.Request) {
	if ct := r.Header.Get("Content-Type"); ct != "image/jpeg" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "item image must be image/jpeg")
		return
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, maxItemImageUploadBytes+1))
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "could not read upload")
		return
	}
	if len(data) > maxItemImageUploadBytes {
		writeError(w, http.StatusUnprocessableEntity, "validation", "item image exceeds 150 KB limit")
		return
	}

	if _, err := s.store.SetItemImage(r.Context(), r.PathValue("itemID"), data); err != nil {
		switch {
		case errors.Is(err, store.ErrItemNotFound):
			writeError(w, http.StatusNotFound, "not_found", "no such item")
		case errors.Is(err, store.ErrItemImageTooLarge):
			writeError(w, http.StatusUnprocessableEntity, "validation", err.Error())
		default:
			writeError(w, http.StatusInternalServerError, "internal", "could not store item image")
		}
		return
	}
	s.notifyMasterChangedToActor(r)
	w.WriteHeader(http.StatusOK)
}

// handleDeleteItemImage removes an item's photo (FR-22.5).
func (s *Server) handleDeleteItemImage(w http.ResponseWriter, r *http.Request) {
	if err := s.store.DeleteItemImage(r.Context(), r.PathValue("itemID")); err != nil {
		if errors.Is(err, store.ErrItemNotFound) {
			writeError(w, http.StatusNotFound, "not_found", "no such item")
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not remove item image")
		return
	}
	s.notifyMasterChangedToActor(r)
	w.WriteHeader(http.StatusOK)
}

// notifyMasterChangedToActor pings the uploader's own devices that the
// master feed advanced, mirroring how master pushes notify only the
// pusher (spec §8); every other device discovers the new image_hash on
// its next ordinary master pull.
func (s *Server) notifyMasterChangedToActor(r *http.Request) {
	userID, _ := r.Context().Value(userIDKey).(string)
	if seq, err := s.store.HeadSeqMaster(r.Context()); err == nil && seq > 0 {
		s.hub.NotifyMasterChanged(userID, seq)
	}
}
