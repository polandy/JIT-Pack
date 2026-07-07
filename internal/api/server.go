// Package api exposes the sync protocol over HTTP (Sync-API Spec §4/§5):
// stateless JWT auth (NFR-4.4), trip-membership enforcement (FR-4.5), and
// the push/pull wire format.
package api

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

const (
	defaultPullLimit = 500
	maxPullLimit     = 1000
	maxPushBatch     = 200
)

// Server wires the sync endpoints. The signing secret is HS256 for the
// walking skeleton; RS256 against the IdP's JWKS replaces it before any
// real deployment (tracked as an open task, not a code TODO).
type Server struct {
	store          *store.Store
	secret         []byte
	singleUserMode bool
	localUserID    string
	hub            *Hub
}

func New(st *store.Store, secret []byte) *Server {
	hub := NewHub(st.HeadSeq)
	return &Server{store: st, secret: secret, hub: hub}
}

// NewSingleUser builds a Server for Single-User Mode (Addendum FR-17.2):
// authentication and trip-membership checks are bypassed entirely, and
// every request is attributed to localUserID. This is a startup-time
// choice (FR-17.11), never a per-request toggle — there is exactly one
// constructor path for each mode, not a runtime flag inside Server.
func NewSingleUser(st *store.Store, localUserID string) *Server {
	hub := NewHub(st.HeadSeq)
	return &Server{store: st, singleUserMode: true, localUserID: localUserID, hub: hub}
}

// Handler returns the routed HTTP handler.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/v1/sync/trips/{tripID}", s.authed(s.member(s.handlePull)))
	mux.HandleFunc("POST /api/v1/sync/trips/{tripID}", s.authed(s.member(s.handlePush)))
	mux.HandleFunc("GET /api/v1/users/{userID}/avatar", s.handleGetAvatar)
	mux.HandleFunc("PUT /api/v1/users/{userID}/avatar", s.authed(s.handlePutAvatar))
	mux.HandleFunc("PUT /api/v1/users/{userID}/display-name", s.authed(s.handlePutDisplayName))
	mux.HandleFunc("GET /ws", s.authed(s.handleWS))
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	return mux
}

type ctxKey int

const userIDKey ctxKey = iota

func (s *Server) authed(next http.HandlerFunc) http.HandlerFunc {
	if s.singleUserMode {
		return func(w http.ResponseWriter, r *http.Request) {
			next(w, r.WithContext(context.WithValue(r.Context(), userIDKey, s.localUserID)))
		}
	}
	return func(w http.ResponseWriter, r *http.Request) {
		raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || raw == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized", "missing bearer token")
			return
		}
		claims := jwt.MapClaims{}
		_, err := jwt.ParseWithClaims(raw, claims,
			func(*jwt.Token) (any, error) { return s.secret, nil },
			jwt.WithValidMethods([]string{"HS256"}))
		if err != nil {
			writeError(w, http.StatusUnauthorized, "unauthorized", "invalid token")
			return
		}
		sub, err := claims.GetSubject()
		if err != nil || sub == "" {
			writeError(w, http.StatusUnauthorized, "unauthorized", "token has no subject")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userIDKey, sub)))
	}
}

func (s *Server) member(next http.HandlerFunc) http.HandlerFunc {
	if s.singleUserMode {
		// FR-17.3: the implicit user is automatically the Owner of every
		// trip; there is no second party, so membership is meaningless.
		return next
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tripID := r.PathValue("tripID")
		userID, _ := r.Context().Value(userIDKey).(string)
		ok, err := s.store.IsTripMember(r.Context(), tripID, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "internal", "membership check failed")
			return
		}
		if !ok {
			writeError(w, http.StatusForbidden, "forbidden", "not a member of this trip")
			return
		}
		next(w, r)
	}
}

type wireChange struct {
	Seq     int64          `json:"seq"`
	Table   string         `json:"table"`
	ID      string         `json:"id"`
	Deleted bool           `json:"deleted"`
	Row     map[string]any `json:"row"`
}

type pullResponse struct {
	Changes    []wireChange `json:"changes"`
	NextCursor int64        `json:"next_cursor"`
	HasMore    bool         `json:"has_more"`
}

func (s *Server) handlePull(w http.ResponseWriter, r *http.Request) {
	cursor, err := queryInt(r, "cursor", 0)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "cursor must be an integer")
		return
	}
	limit, err := queryInt(r, "limit", defaultPullLimit)
	if err != nil || limit < 1 || limit > maxPullLimit {
		writeError(w, http.StatusUnprocessableEntity, "validation", "limit must be 1..1000")
		return
	}

	page, err := s.store.Pull(r.Context(), r.PathValue("tripID"), cursor, int(limit))
	if err != nil {
		writeError(w, http.StatusInternalServerError, "internal", "pull failed")
		return
	}

	out := pullResponse{Changes: []wireChange{}, NextCursor: page.NextCursor, HasMore: page.HasMore}
	for _, c := range page.Changes {
		out.Changes = append(out.Changes, wireChange{
			Seq: c.Seq, Table: c.Table, ID: c.ID, Deleted: c.Deleted, Row: c.Row,
		})
	}
	writeJSON(w, out)
}

type wireMutation struct {
	MutationID string         `json:"mutation_id"`
	Op         string         `json:"op"`
	Table      string         `json:"table"`
	ID         string         `json:"id"`
	Fields     map[string]any `json:"fields"`
	HLC        string         `json:"hlc"`
}

type pushRequest struct {
	ClientHLC string         `json:"client_hlc"`
	Mutations []wireMutation `json:"mutations"`
}

type wireConflict struct {
	Field        string `json:"field"`
	LosingValue  any    `json:"losing_value"`
	WinningValue any    `json:"winning_value"`
}

type pushResult struct {
	MutationID string         `json:"mutation_id"`
	Outcome    string         `json:"outcome"`
	Conflicts  []wireConflict `json:"conflicts,omitempty"`
	Error      string         `json:"error,omitempty"`
}

type pushResponse struct {
	Results  []pushResult `json:"results"`
	PullHint struct {
		NextCursor int64 `json:"next_cursor"`
	} `json:"pull_hint"`
}

func (s *Server) handlePush(w http.ResponseWriter, r *http.Request) {
	var req pushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, "validation", "malformed push envelope")
		return
	}
	if len(req.Mutations) > maxPushBatch {
		writeError(w, http.StatusUnprocessableEntity, "validation",
			fmt.Sprintf("batch exceeds %d mutations", maxPushBatch))
		return
	}

	tripID := r.PathValue("tripID")
	var out pushResponse
	for _, m := range req.Mutations {
		res, err := s.store.ApplyMutation(r.Context(), tripID, syncpkg.Mutation{
			MutationID: m.MutationID, Op: syncpkg.Op(m.Op), Table: m.Table,
			ID: m.ID, Fields: m.Fields, HLC: syncpkg.HLC(m.HLC),
		})
		switch {
		case errors.Is(err, store.ErrUnknownTable), errors.Is(err, store.ErrUnknownColumn):
			out.Results = append(out.Results, pushResult{
				MutationID: m.MutationID, Outcome: "rejected", Error: err.Error(),
			})
			continue
		case err != nil:
			writeError(w, http.StatusInternalServerError, "internal", "push failed")
			return
		}
		out.Results = append(out.Results, pushResult{
			MutationID: res.MutationID, Outcome: res.Outcome, Conflicts: toWireConflicts(res.Conflicts),
		})
		if res.Seq > out.PullHint.NextCursor {
			out.PullHint.NextCursor = res.Seq
		}
	}
	writeJSON(w, out)

	// Notify subscribed WebSocket clients so they pull the new state.
	if out.PullHint.NextCursor > 0 {
		s.hub.NotifyTripChanged(tripID, out.PullHint.NextCursor)
	}
}

func toWireConflicts(conflicts []syncpkg.Conflict) []wireConflict {
	if len(conflicts) == 0 {
		return nil
	}
	out := make([]wireConflict, len(conflicts))
	for i, c := range conflicts {
		out[i] = wireConflict{Field: c.Field, LosingValue: c.LosingValue, WinningValue: c.WinningValue}
	}
	return out
}

func queryInt(r *http.Request, key string, fallback int64) (int64, error) {
	raw := r.URL.Query().Get(key)
	if raw == "" {
		return fallback, nil
	}
	return strconv.ParseInt(raw, 10, 64)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(v); err != nil {
		http.Error(w, "encoding failure", http.StatusInternalServerError)
	}
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"error": map[string]string{"code": code, "message": message},
	})
}
