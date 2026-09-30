package api

import (
	"io"
	"net/http"

	"jitpack/internal/store"
)

// imageJPEG is the one picture format the server stores (FR-22.4, FR-29.5).
const imageJPEG = "image/jpeg"

// handleGetIdeaImage streams one idea picture (FR-29.5). Private to the
// trip's members, unlike an item photo: a picture of where a family is going
// is the trip's, not the instance's. The ETag is the synced image_hash.
func (s *Server) handleGetIdeaImage(w http.ResponseWriter, r *http.Request) {
	data, hash, err := s.store.GetIdeaImage(r.Context(),
		r.PathValue(PathTripID), r.PathValue(PathIdeaID), r.PathValue(PathImageID))
	if err != nil {
		writeStoreError(w, err, "could not read this picture")
		return
	}
	if data == nil {
		writeError(w, http.StatusNotFound, ErrNotFound, "no such picture")
		return
	}
	w.Header().Set("ETag", `"`+hash+`"`)
	// Private: the bytes are behind a member's bearer token, and a shared
	// cache must not hand them to anybody else.
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("Content-Type", imageJPEG)
	w.Write(data)
}

// handlePutIdeaImage stores a client-scaled JPEG on an idea (FR-29.5) and
// tells the trip's devices that its feed advanced. The size is checked here,
// in the store and by the CHECK constraint — three layers, as for item photos.
func (s *Server) handlePutIdeaImage(w http.ResponseWriter, r *http.Request) {
	if ct := r.Header.Get("Content-Type"); ct != imageJPEG {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "an idea picture must be image/jpeg")
		return
	}
	data, err := io.ReadAll(io.LimitReader(r.Body, store.MaxIdeaImageBytes+1))
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "could not read upload")
		return
	}
	if len(data) > store.MaxIdeaImageBytes {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, store.ErrIdeaImageTooLarge.Error())
		return
	}
	tripID := r.PathValue(PathTripID)
	userID, _ := r.Context().Value(userIDKey).(string)
	if _, err := s.store.AddIdeaImage(r.Context(), tripID, userID, r.PathValue(PathIdeaID), r.PathValue(PathImageID), data); err != nil {
		writeStoreError(w, err, "could not store the picture")
		return
	}
	if seq, err := s.store.HeadSeq(r.Context(), tripID); err == nil && seq > 0 {
		s.hub.NotifyTripChanged(tripID, seq)
	}
	w.WriteHeader(http.StatusOK)
}
