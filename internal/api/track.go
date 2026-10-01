package api

import (
	"context"
	"mime"
	"net/http"

	"jitpack/internal/store"
)

const (
	// gpxContentType is how a track's file is answered (FR-29.17).
	gpxContentType = "application/gpx+xml"
	// maxTrackUploadBytes bounds one upload's JSON. The file travels as a
	// JSON string, and escaping can double a file of quotes; the figures and
	// the line add at most a few kilobytes. The file's own 5 MB is checked
	// once it is decoded, so the refusal names the file and not the body.
	maxTrackUploadBytes = 2*store.MaxTrackBytes + maxJSONBodyBytes
)

// trackPut stores a track on its holder — an idea or an excursion, by the
// store call it is given.
type trackPut func(ctx context.Context, tripID, userID, holderID, trackID string, f store.TrackFile) (store.Track, error)

// trackGet reads a holder's track file back.
type trackGet func(ctx context.Context, tripID, holderID, trackID string) (*store.TrackGPX, error)

// handlePutIdeaTrack stores a GPX track on an idea, or replaces the file of
// one, and tells the trip's devices that its feed advanced (FR-29.17,
// ADR-085). The file's size is checked here, in the store and by the CHECK
// constraint — three layers, as for a picture.
func (s *Server) handlePutIdeaTrack(w http.ResponseWriter, r *http.Request) {
	s.putTrack(w, r, r.PathValue(PathIdeaID), s.store.PutIdeaTrack)
}

// handlePutExcursionTrack does for an excursion what handlePutIdeaTrack
// does for an idea (FR-31.15, ADR-089).
func (s *Server) handlePutExcursionTrack(w http.ResponseWriter, r *http.Request) {
	s.putTrack(w, r, r.PathValue(PathExcursionID), s.store.PutExcursionTrack)
}

func (s *Server) putTrack(w http.ResponseWriter, r *http.Request, holderID string, put trackPut) {
	var up TrackUpload
	if err := decodeJSON(w, r, maxTrackUploadBytes, &up); err != nil {
		writeDecodeError(w, err, "malformed track upload")
		return
	}
	if len(up.GPX) > store.MaxTrackBytes {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, store.ErrTrackTooLarge.Error())
		return
	}
	tripID := r.PathValue(PathTripID)
	userID, _ := r.Context().Value(userIDKey).(string)
	if _, err := put(r.Context(), tripID, userID, holderID, r.PathValue(PathTrackID),
		store.TrackFile{
			Name: up.Name, FileName: up.FileName, Kind: string(up.Kind),
			DistanceM: up.DistanceM, AscentM: up.AscentM, DescentM: up.DescentM, MaxEleM: up.MaxEleM,
			PointCount: up.PointCount, Line: up.Line, GPX: []byte(up.GPX),
		}); err != nil {
		writeStoreError(w, err, "could not store the track")
		return
	}
	if seq, err := s.store.HeadSeq(r.Context(), tripID); err == nil && seq > 0 {
		s.hub.NotifyTripChanged(tripID, seq)
	}
	w.WriteHeader(http.StatusOK)
}

// handleGetIdeaTrack answers a track's file as it was uploaded, to be
// downloaded (FR-29.17). Private to the trip's members, like its pictures,
// and always an attachment: a file a member chose is never rendered on this
// origin.
func (s *Server) handleGetIdeaTrack(w http.ResponseWriter, r *http.Request) {
	s.getTrack(w, r, r.PathValue(PathIdeaID), s.store.GetIdeaTrackGPX)
}

// handleGetExcursionTrack answers an excursion track's file, as
// handleGetIdeaTrack does an idea's (FR-31.15).
func (s *Server) handleGetExcursionTrack(w http.ResponseWriter, r *http.Request) {
	s.getTrack(w, r, r.PathValue(PathExcursionID), s.store.GetExcursionTrackGPX)
}

func (s *Server) getTrack(w http.ResponseWriter, r *http.Request, holderID string, get trackGet) {
	file, err := get(r.Context(), r.PathValue(PathTripID), holderID, r.PathValue(PathTrackID))
	if err != nil {
		writeStoreError(w, err, "could not read this track")
		return
	}
	if file == nil {
		writeError(w, http.StatusNotFound, ErrNotFound, "no such track")
		return
	}
	w.Header().Set("ETag", `"`+file.Hash+`"`)
	w.Header().Set("Cache-Control", "private, max-age=86400")
	w.Header().Set("Content-Type", gpxContentType)
	w.Header().Set("Content-Disposition", mime.FormatMediaType("attachment", map[string]string{"filename": file.FileName}))
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Write(file.GPX)
}
