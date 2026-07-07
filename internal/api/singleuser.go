package api

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"

	"jitpack/internal/store"
)

const maxAvatarUploadBytes = 100 * 1024

// handleGetAvatar streams the stored avatar with a caching header
// (ADR-002 consequence #2). No auth required: avatars are the same kind
// of low-sensitivity, presentation-only data a static file server would
// happily serve to anyone holding the URL.
func (s *Server) handleGetAvatar(w http.ResponseWriter, r *http.Request) {
	data, err := s.store.GetAvatar(r.Context(), r.PathValue("userID"))
	if err != nil {
		writeError(w, http.StatusNotFound, "not_found", "no avatar for this user")
		return
	}
	if data == nil {
		writeError(w, http.StatusNotFound, "not_found", "no avatar for this user")
		return
	}
	sum := sha256.Sum256(data)
	w.Header().Set("ETag", `"`+hex.EncodeToString(sum[:8])+`"`)
	w.Header().Set("Cache-Control", "public, max-age=3600")
	w.Header().Set("Content-Type", "image/jpeg")
	w.Write(data)
}

// handlePutAvatar accepts a pre-cropped, pre-resized JPEG from the client
// (Addendum FR-17.13). Validation here is defense-in-depth: the store
// layer and the Schema v0.4 CHECK constraint enforce the same 100 KB /
// JPEG-only limits independently of this handler.
func (s *Server) handlePutAvatar(w http.ResponseWriter, r *http.Request) {
	if ct := r.Header.Get("Content-Type"); ct != "image/jpeg" {
		writeError(w, http.StatusUnprocessableEntity, "validation", "avatar must be image/jpeg")
		return
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, maxAvatarUploadBytes+1))
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "could not read upload")
		return
	}
	if len(data) > maxAvatarUploadBytes {
		writeError(w, http.StatusUnprocessableEntity, "validation", "avatar exceeds 100 KB limit")
		return
	}

	if err := s.store.SetAvatar(r.Context(), r.PathValue("userID"), data); err != nil {
		if errors.Is(err, store.ErrAvatarTooLarge) {
			writeError(w, http.StatusUnprocessableEntity, "validation", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not store avatar")
		return
	}
	w.WriteHeader(http.StatusOK)
}

type displayNameRequest struct {
	DisplayName string `json:"display_name"`
}

// handlePutDisplayName validates and persists the free-form display name
// (Addendum FR-17.13). Charset/length validation happens in the store
// layer; this handler only maps that error to the wire format.
func (s *Server) handlePutDisplayName(w http.ResponseWriter, r *http.Request) {
	var req displayNameRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "malformed request body")
		return
	}
	if err := s.store.SetDisplayName(r.Context(), r.PathValue("userID"), req.DisplayName); err != nil {
		if errors.Is(err, store.ErrInvalidDisplayName) {
			writeError(w, http.StatusUnprocessableEntity, "validation", err.Error())
			return
		}
		writeError(w, http.StatusInternalServerError, "internal", "could not update display name")
		return
	}
	w.WriteHeader(http.StatusOK)
}
