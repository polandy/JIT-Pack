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
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/store"
	syncpkg "jitpack/internal/sync"
)

const (
	defaultPullLimit = 500
	maxPullLimit     = 1000
	maxPushBatch     = 200
)

// Server wires the sync endpoints. Per-request authentication is
// always against JIT-Pack's own HS256 session tokens (ADR-007); the
// IdP is involved only at login and refresh, inside the OIDC broker.
type Server struct {
	store          *store.Store
	sessionSecret  []byte
	keyFunc        jwt.Keyfunc
	validMethods   []string
	singleUserMode bool
	// currency is the instance-wide ISO-4217 label (FR-21.9); empty ⇒ none.
	currency    string
	localUserID string
	hub         *Hub
	oidc        *oidcBroker
	// Web Push (NFR-4.6): VAPID keypair lazily loaded/generated via the
	// store; contact is the RFC 8292 sub claim.
	pushContact string
	vapidMu     sync.Mutex
	vapidPub    string
	vapidPriv   string
	// adminEmails (FR-23.1): lowercased e-mail addresses holding the
	// instance-admin role, from JITPACK_ADMIN_EMAILS — declarative,
	// matched against the token's email claim and stamped on login.
	adminEmails map[string]bool
}

// SetAdminEmails declares which accounts hold the instance-admin role
// (FR-23.1), matched case-insensitively against the token's email
// claim. The list is authoritative in both directions and is stamped
// into users.is_instance_admin at every login.
func (s *Server) SetAdminEmails(emails []string) {
	s.adminEmails = make(map[string]bool, len(emails))
	for _, e := range emails {
		s.adminEmails[strings.ToLower(e)] = true
	}
}

// isAdminEmail resolves the FR-23.1 allowlist; a token without an
// email claim simply yields no admin role.
//
// The address only counts when the IdP also asserts that it verified it.
// OIDC Core §5.7 gives `email` no verification guarantee of its own —
// `email_verified` carries that — so on any IdP with self-service
// profiles an unverified claim would let an account name the configured
// admin address and inherit the role on its next request.
func (s *Server) isAdminEmail(email string, verified bool) bool {
	return verified && email != "" && s.adminEmails[strings.ToLower(email)]
}

// New creates the multi-user Server. The secret signs and validates
// JIT-Pack's own HS256 session tokens (ADR-007): with the OIDC broker
// enabled (EnableOIDC) the login flow issues them; without it, tokens
// minted externally with the same secret are accepted — which is how
// the tests drive authenticated endpoints directly.
func New(st *store.Store, secret []byte) *Server {
	hub := NewHub(st.HeadSeq)
	return &Server{
		store:         st,
		sessionSecret: secret,
		keyFunc:       func(*jwt.Token) (any, error) { return secret, nil },
		validMethods:  []string{"HS256"},
		hub:           hub,
	}
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

// pattern is the mux's "METHOD /path" spelling. The method stays at the
// registration because it is the server's own; the path comes from wire.go
// because the client needs the same one.
func pattern(method, route string) string { return method + " " + route }

// Handler returns the routed HTTP handler.
func (s *Server) Handler() http.Handler {
	mux := http.NewServeMux()
	// Grouped by scope, because the scope is what the path leads with
	// (NFR-4.14, ADR-027). The paths themselves are declared in wire.go and
	// generated into the client from there; what belongs here is the method
	// and the middleware, which are the server's alone.

	// Trip scope.
	mux.HandleFunc(pattern(http.MethodGet, RouteTripSync), s.authed(s.member(s.handlePull)))
	mux.HandleFunc(pattern(http.MethodPost, RouteTripSync), s.authed(s.member(s.handlePush)))
	mux.HandleFunc(pattern(http.MethodGet, RouteTripConflicts), s.authed(s.member(s.handleListConflicts)))
	// The revert half of NFR-4.2a, one endpoint per partition beside its
	// list — a conflict belongs to the partition it was pushed to.
	mux.HandleFunc(pattern(http.MethodPost, RouteTripConflictRevert), s.authed(s.member(s.handleRevertConflict)))
	// The one server-side part of G-3's lock (FR-5.7): a takeover has to
	// be stamped and has to notify, so it is an RPC rather than a mutation.
	mux.HandleFunc(pattern(http.MethodPost, RouteTripItemTakeover), s.authed(s.member(s.handleTakeover)))
	mux.HandleFunc(pattern(http.MethodGet, RouteTripLockEvents), s.authed(s.member(s.handleListLockEvents)))
	mux.HandleFunc(pattern(http.MethodGet, RouteTripExportCSV), s.authed(s.member(s.handleExportTripCSV)))

	// Master scope.
	mux.HandleFunc(pattern(http.MethodGet, RouteMasterSync), s.authed(s.handlePullMaster))
	mux.HandleFunc(pattern(http.MethodPost, RouteMasterSync), s.authed(s.handlePushMaster))
	mux.HandleFunc(pattern(http.MethodGet, RouteMasterConflicts), s.authed(s.handleListMasterConflicts))
	mux.HandleFunc(pattern(http.MethodPost, RouteMasterConflictRevert), s.authed(s.handleRevertMasterConflict))

	// The caller's own scope.
	mux.HandleFunc(pattern(http.MethodGet, RouteMe), s.authed(s.handleMe))
	mux.HandleFunc(pattern(http.MethodGet, RouteMeNotificationPrefs), s.authed(s.handleGetNotificationPrefs))
	mux.HandleFunc(pattern(http.MethodPut, RouteMeNotificationPrefs), s.authed(s.handlePutNotificationPrefs))
	mux.HandleFunc(pattern(http.MethodGet, RouteMeExport), s.authed(s.handleExportFull))

	// User scope.
	mux.HandleFunc(pattern(http.MethodGet, RouteUsers), s.authed(s.handleListUsers))
	mux.HandleFunc(pattern(http.MethodGet, RouteUserAvatar), s.handleGetAvatar)
	mux.HandleFunc(pattern(http.MethodPut, RouteUserAvatar), s.authed(s.self(s.handlePutAvatar)))
	mux.HandleFunc(pattern(http.MethodPut, RouteUserDisplayName), s.authed(s.self(s.handlePutDisplayName)))

	// Item scope. Item images (FR-22): GET public like avatars; PUT/DELETE
	// need only authentication (FR-22.6) — items carry no trip role to check.
	mux.HandleFunc(pattern(http.MethodGet, RouteItemImage), s.handleGetItemImage)
	mux.HandleFunc(pattern(http.MethodPut, RouteItemImage), s.authed(s.handlePutItemImage))
	mux.HandleFunc(pattern(http.MethodDelete, RouteItemImage), s.authed(s.handleDeleteItemImage))

	// Notification scope.
	mux.HandleFunc(pattern(http.MethodGet, RouteNotifications), s.authed(s.handleListNotifications))
	mux.HandleFunc(pattern(http.MethodPost, RouteNotificationRead), s.authed(s.handleMarkNotificationRead))

	// Web Push scope.
	mux.HandleFunc(pattern(http.MethodGet, RoutePushVAPIDKey), s.authed(s.handleGetVAPIDKey))
	mux.HandleFunc(pattern(http.MethodPost, RoutePushSubscriptions), s.authed(s.handleRegisterPushSubscription))
	mux.HandleFunc(pattern(http.MethodDelete, RoutePushSubscriptions), s.authed(s.handleDeletePushSubscription))

	// Admin scope.
	mux.HandleFunc(pattern(http.MethodGet, RouteAdminUsers), s.authed(s.adminOnly(s.handleAdminUsers)))
	mux.HandleFunc(pattern(http.MethodPost, RouteAdminDeactivateUser), s.authed(s.adminOnly(s.handleDeactivateUser)))
	mux.HandleFunc(pattern(http.MethodPost, RouteAdminReactivateUser), s.authed(s.adminOnly(s.handleReactivateUser)))
	mux.HandleFunc(pattern(http.MethodDelete, RouteAdminResetAvatar), s.authed(s.adminOnly(s.handleAdminResetAvatar)))
	mux.HandleFunc(pattern(http.MethodDelete, RouteAdminResetDisplayName), s.authed(s.adminOnly(s.handleAdminResetDisplayName)))

	// Instance scope: no caller, no partition.
	mux.HandleFunc(pattern(http.MethodPost, RouteAuthToken), s.handleAuthToken)
	mux.HandleFunc(pattern(http.MethodPost, RouteAuthRefresh), s.handleAuthRefresh)
	mux.HandleFunc(pattern(http.MethodGet, RouteAuthConfig), s.handleAuthConfig)
	mux.HandleFunc(pattern(http.MethodGet, RouteInstanceConfig), s.handleInstanceConfig)
	mux.HandleFunc(pattern(http.MethodGet, RouteWS), s.wsAuth(s.handleWS))
	mux.HandleFunc(pattern(http.MethodGet, RouteHealth), func(w http.ResponseWriter, _ *http.Request) {
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
			writeError(w, http.StatusUnauthorized, ErrUnauthorized, "missing bearer token")
			return
		}
		claims := jwt.MapClaims{}
		_, err := jwt.ParseWithClaims(raw, claims, s.keyFunc,
			jwt.WithValidMethods(s.validMethods))
		if err != nil {
			writeError(w, http.StatusUnauthorized, ErrUnauthorized, "invalid token")
			return
		}
		sub, err := claims.GetSubject()
		if err != nil || sub == "" {
			writeError(w, http.StatusUnauthorized, ErrUnauthorized, "token has no subject")
			return
		}
		// Session tokens carry users.id directly (ADR-007): identity was
		// established once, at login, by the broker — never per request.
		userID := sub
		// FR-23.3: a deactivated account loses all access — distinct
		// error code so the client can tell it from a stale token.
		if deactivated, err := s.store.UserDeactivated(r.Context(), userID); err != nil {
			writeError(w, http.StatusInternalServerError, ErrInternal, "account lookup failed")
			return
		} else if deactivated {
			writeError(w, http.StatusForbidden, ErrAccountDeactivated, "account is deactivated")
			return
		}
		next(w, r.WithContext(context.WithValue(r.Context(), userIDKey, userID)))
	}
}

// adminOnly layers on authed: only instance admins pass (FR-23.2) —
// endpoints reject with 403, the screen is never merely hidden.
func (s *Server) adminOnly(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		userID := r.Context().Value(userIDKey).(string)
		admin, err := s.store.IsInstanceAdmin(r.Context(), userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, ErrInternal, "admin lookup failed")
			return
		}
		if !admin {
			writeError(w, http.StatusForbidden, ErrForbidden, "instance admin role required")
			return
		}
		next(w, r)
	}
}

func (s *Server) member(next http.HandlerFunc) http.HandlerFunc {
	if s.singleUserMode {
		// FR-17.3: the implicit user is automatically the Owner of every
		// trip; there is no second party, so membership is meaningless.
		return next
	}
	return func(w http.ResponseWriter, r *http.Request) {
		tripID := r.PathValue(PathTripID)
		userID, _ := r.Context().Value(userIDKey).(string)
		ok, err := s.store.IsTripMember(r.Context(), tripID, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, ErrInternal, "membership check failed")
			return
		}
		if !ok {
			writeError(w, http.StatusForbidden, ErrForbidden, "not a member of this trip")
			return
		}
		next(w, r)
	}
}

// self restricts a route addressed by {userID} to the account that owns
// it. The path names the target row, so without this the client picks
// whose profile it writes to — and the client's identity claims are never
// trusted (invariant 3). Instance admins reach the same rows through the
// /admin/users/{userID} endpoints, which carry their own authorization.
func (s *Server) self(next http.HandlerFunc) http.HandlerFunc {
	if s.singleUserMode {
		// One implicit user: whoever the path names, it is them.
		return next
	}
	return func(w http.ResponseWriter, r *http.Request) {
		userID, _ := r.Context().Value(userIDKey).(string)
		if userID == "" || r.PathValue(PathUserID) != userID {
			writeError(w, http.StatusForbidden, ErrForbidden, "cannot modify another user's profile")
			return
		}
		next(w, r)
	}
}

func (s *Server) handlePull(w http.ResponseWriter, r *http.Request) {
	cursor, limit, ok := parsePullQuery(w, r)
	if !ok {
		return
	}

	page, err := s.store.Pull(r.Context(), r.PathValue(PathTripID), cursor, int(limit))
	if err != nil {
		writeError(w, http.StatusInternalServerError, ErrInternal, "pull failed")
		return
	}
	writePullPage(w, page)
}

func parsePullQuery(w http.ResponseWriter, r *http.Request) (cursor, limit int64, ok bool) {
	cursor, err := queryInt(r, "cursor", 0)
	if err != nil {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "cursor must be an integer")
		return 0, 0, false
	}
	limit, err = queryInt(r, "limit", defaultPullLimit)
	if err != nil || limit < 1 || limit > maxPullLimit {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "limit must be 1..1000")
		return 0, 0, false
	}
	return cursor, limit, true
}

func writePullPage(w http.ResponseWriter, page store.PullPage) {
	out := PullResponse{Changes: []PullChange{}, NextCursor: page.NextCursor, HasMore: page.HasMore}
	for _, c := range page.Changes {
		out.Changes = append(out.Changes, PullChange{
			Seq: c.Seq, Table: c.Table, ID: c.ID, Deleted: c.Deleted, Row: c.Row,
		})
	}
	writeJSON(w, out)
}

func (s *Server) handlePush(w http.ResponseWriter, r *http.Request) {
	tripID := r.PathValue(PathTripID)
	userID, _ := r.Context().Value(userIDKey).(string)
	out, muts, ok := applyPushBatch(w, r,
		func(m *syncpkg.Mutation) { stampActor(m, userID) },
		func(m syncpkg.Mutation) (store.MutationResult, error) {
			return s.store.ApplyMutation(r.Context(), tripID, userID, m)
		})
	if !ok {
		return
	}
	writeJSON(w, out)

	// Ephemeral G-3 lock events first (§7 fast path), then the
	// trip.changed ping so clients pull the persisted state.
	s.notifyLockEvents(tripID, userID, muts, out.Results)
	if out.PullHint.NextCursor > 0 {
		s.hub.NotifyTripChanged(tripID, out.PullHint.NextCursor)
	}
	// FR-6.2 side effects last — FR-17.3: no second party in Single-User
	// Mode, so no detection at all.
	if !s.singleUserMode {
		s.emitNotifications(r.Context(), tripID, userID, muts, out.Results)
	}
}

// stampActor fills server-owned actor columns from the authenticated
// pusher (FR-4.2): comment authors, the packing-now locker (FR-5.7) and
// the packer. Client-sent values are placeholders (the client may not
// know its user id) and are never trusted, so each of those columns is
// removed from the mutation first and written back only where this
// function decides it — invariant 3 holds for every op, not only the one
// the client happens to send.
func stampActor(m *syncpkg.Mutation, userID string) {
	switch m.Table {
	case store.TableComments:
		// Authorship is decided once, when the comment comes into being.
		// Re-stamping the pusher on a later op would be the opposite
		// defect — flagging a foreign comment as a task (FR-7.2) is an
		// upsert, and would transfer its authorship — so the field is
		// taken away from every op and given back only to the insert.
		// An upsert that creates a comment then has no author and is
		// refused by the NOT NULL column, which is what the one shape no
		// client produces should get.
		delete(m.Fields, "author_id")
		if m.Op == syncpkg.OpInsert {
			setMutationField(m, "author_id", userID)
		}
	case store.TableTripItems:
		// FR-25.19: packer_user_id is the *assignment* and belongs to the
		// client, so it is left untouched here. The record of who packed
		// the row is server-owned — a record you can pick is not a record
		// — so whatever the client sent is discarded first, before the
		// state below decides what the record should be.
		delete(m.Fields, "packed_by_user_id")

		// The *when* of the record (FR-25.17) is server-owned in the same
		// way, with one deliberate difference: a client may name the moment
		// it was tapped, because packing happens offline and the push can
		// land days later. A clock is not an identity claim, so invariant 3
		// does not reach it; an unparseable value is replaced rather than
		// trusted. Same shape as packing_now_at beside it.
		tapped, _ := m.Fields["packed_at"].(string)
		delete(m.Fields, "packed_at")

		// G-3's claim holder is server-owned the same way (FR-5.7): the
		// claim *is* the state, so only the switch below may name a
		// holder. Without the strip, a mutation carrying packing_now_by
		// and no state never meets that switch and the row names whoever
		// the pusher chose — which the takeover and M4's row then read as
		// authoritative. Its clock follows the claim, on the same terms
		// as packed_at above.
		delete(m.Fields, "packing_now_by")
		claimed, _ := m.Fields["packing_now_at"].(string)
		delete(m.Fields, "packing_now_at")

		state, hasState := m.Fields["state"].(string)
		switch {
		case state == store.StatePackingNow:
			setMutationField(m, "packing_now_by", userID)
			setMutationField(m, "packing_now_at", tapTime(claimed))
			setMutationField(m, "packed_by_user_id", nil)
			setMutationField(m, "packed_at", nil)
		case state == "packed":
			setMutationField(m, "packing_now_by", nil)
			setMutationField(m, "packing_now_at", nil)
			setMutationField(m, "packed_by_user_id", userID)
			setMutationField(m, "packed_at", tapTime(tapped))
		case hasState:
			// Un-packed in any way (open, partial, skipped): both stamps
			// are cleared with the state they described (FR-25.17/FR-5.3),
			// never left to outlive it. The client used to null the claim
			// itself; a released claim may not depend on it doing so.
			setMutationField(m, "packing_now_by", nil)
			setMutationField(m, "packing_now_at", nil)
			setMutationField(m, "packed_by_user_id", nil)
			setMutationField(m, "packed_at", nil)
		}
	}
}

// tapTime keeps the client's tap time when it is a real instant and
// falls back to now otherwise, so an offline row keeps the moment it was
// actually packed or claimed instead of the moment its push arrived.
func tapTime(tapped string) string {
	if _, err := time.Parse(time.RFC3339, tapped); err == nil {
		return tapped
	}
	return time.Now().UTC().Format(time.RFC3339)
}

func setMutationField(m *syncpkg.Mutation, field string, value any) {
	if m.Fields == nil {
		m.Fields = map[string]any{}
	}
	m.Fields[field] = value
}

// notifyLockEvents emits item.locked/item.unlocked for state changes
// that touched packing_now. Over-notifying on merges is fine — the
// events are ephemeral hints, clients converge via pull (§7).
func (s *Server) notifyLockEvents(tripID, userID string, muts []syncpkg.Mutation, results []MutationResult) {
	for i, m := range muts {
		if i >= len(results) || m.Table != store.TableTripItems {
			continue
		}
		if results[i].Outcome != "applied" && results[i].Outcome != "merged" {
			continue
		}
		state, ok := m.Fields["state"].(string)
		if !ok {
			continue
		}
		name, _ := m.Fields["name"].(string)
		if state == store.StatePackingNow {
			s.hub.NotifyItemLocked(tripID, m.ID, userID, name)
		} else {
			s.hub.NotifyItemUnlocked(tripID, m.ID, userID, name)
		}
	}
}

// applyPushBatch decodes the push envelope and applies each mutation via
// apply, calling prepare (if set) first. It reports ok=false after
// writing an error response itself.
func applyPushBatch(w http.ResponseWriter, r *http.Request, prepare func(*syncpkg.Mutation), apply func(syncpkg.Mutation) (store.MutationResult, error)) (PushResponse, []syncpkg.Mutation, bool) {
	var req PushRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation, "malformed push envelope")
		return PushResponse{}, nil, false
	}
	if len(req.Mutations) > maxPushBatch {
		writeError(w, http.StatusUnprocessableEntity, ErrValidation,
			fmt.Sprintf("batch exceeds %d mutations", maxPushBatch))
		return PushResponse{}, nil, false
	}

	var out PushResponse
	muts := make([]syncpkg.Mutation, 0, len(req.Mutations))
	for _, m := range req.Mutations {
		mut := syncpkg.Mutation{
			MutationID: m.MutationID, Op: syncpkg.Op(m.Op), Table: m.Table,
			ID: m.ID, Fields: m.Fields, HLC: syncpkg.HLC(m.HLC),
		}
		if prepare != nil {
			prepare(&mut)
		}
		// FR-28.9: refused by length before the store sees it, so the client
		// is told which field was wrong rather than meeting a CHECK.
		if err := capMark(&mut); err != nil {
			out.Results = append(out.Results, MutationResult{
				MutationID: m.MutationID, Outcome: OutcomeRejected, Error: err.Error(),
			})
			continue
		}
		muts = append(muts, mut)
		res, err := apply(mut)
		switch {
		case errors.Is(err, store.ErrUnknownTable), errors.Is(err, store.ErrUnknownColumn):
			out.Results = append(out.Results, MutationResult{
				MutationID: m.MutationID, Outcome: OutcomeRejected, Error: err.Error(),
			})
			continue
		case err != nil:
			writeError(w, http.StatusInternalServerError, ErrInternal, "push failed")
			return PushResponse{}, nil, false
		}
		// Sync-API §5: a refusal carries its reason, so the client can say
		// what happened instead of parking the mutation in silence. The
		// vocabulary is the store's; the sentence is the client's, because
		// only it knows the user's language.
		out.Results = append(out.Results, MutationResult{
			MutationID: res.MutationID, Outcome: MutationOutcome(res.Outcome),
			Conflicts: toWireConflicts(res.Conflicts), Error: string(res.Reason),
		})
		if res.Seq > out.PullHint.NextCursor {
			out.PullHint.NextCursor = res.Seq
		}
	}
	return out, muts, true
}

func toWireConflicts(conflicts []syncpkg.Conflict) []MutationConflict {
	if len(conflicts) == 0 {
		return nil
	}
	out := make([]MutationConflict, len(conflicts))
	for i, c := range conflicts {
		out[i] = MutationConflict{Field: c.Field, LosingValue: c.LosingValue, WinningValue: c.WinningValue}
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

// writeError writes the one error shape the whole surface uses (NFR-4.14).
// The code is an ErrorCode rather than a string so a value the client does not
// know cannot be invented at a call site.
func writeError(w http.ResponseWriter, status int, code ErrorCode, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(APIError{Error: APIErrorBody{Code: code, Message: message}})
}
