package api

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/store"
)

// sessionSigningMethod is the algorithm JIT-Pack signs its own session
// tokens with (ADR-007). Named once because the accept side must not be
// able to drift from the sign side: a validMethods list that no longer
// contains what the mint uses locks every account out, and one that
// contains more than it accepts a token this server would never issue.
var sessionSigningMethod = jwt.SigningMethodHS256

// The refusals an identity can produce. They are values rather than
// written responses so the rule can be read without an HTTP round trip;
// authed is the one place they become a status.
//
// A token no account carries and a token that fails its signature share
// errBadToken on purpose: telling the two apart would let an
// unauthenticated caller probe which ids exist. Sharing one sentinel makes
// that structural instead of a matter of two `writeError` calls staying
// identical.
var (
	errNoBearerToken      = errors.New("missing bearer token")
	errBadToken           = errors.New("invalid token")
	errNoTokenSubject     = errors.New("token has no subject")
	errAccountDeactivated = errors.New("account is deactivated")
	errAccountLookup      = errors.New("account lookup failed")
)

// identity is one mode's whole answer to "who is asking, and can anyone
// else exist?". It is chosen once, at construction (FR-17.11), so that
// invariant 5 is decided in one place rather than remembered by each
// handler: Single-User Mode bypasses authentication and membership
// entirely, and a handler that forgets to ask would either refuse the
// implicit user or expose a multi-user instance.
type identity interface {
	// authenticate resolves the caller into a request context carrying
	// the user id — and, where the credential has a kind, that kind
	// (FR-23.7) — or refuses with one of the sentinels above.
	authenticate(r *http.Request) (context.Context, error)
	// isMember reports whether userID may act inside tripID.
	isMember(ctx context.Context, tripID, userID string) (bool, error)
	// ownsProfile reports whether the caller may write the profile the
	// request path names (invariant 3: the client never picks).
	ownsProfile(r *http.Request, userID string) bool
	// hasSecondParty reports whether another person can exist at all.
	// FR-17.3 answers no, which is why Single-User Mode detects nothing
	// to notify anybody about.
	hasSecondParty() bool
}

// accountStore is the slice of the store a session identity consults.
// Declared here, at the consumer, so the rules above can be driven by a
// hand-written fake instead of a wired-up server.
type accountStore interface {
	AccountStatus(ctx context.Context, userID string) (store.AccountState, error)
	IsTripMember(ctx context.Context, tripID, userID string) (bool, error)
}

// singleUserIdentity is the FR-17.2 mode: one implicit user, attributed
// to userID, with no credential to present and nobody to be a member
// beside.
type singleUserIdentity struct{ userID string }

func (i singleUserIdentity) authenticate(r *http.Request) (context.Context, error) {
	return context.WithValue(r.Context(), userIDKey, i.userID), nil
}

// FR-17.3: the implicit user is automatically the Owner of every trip.
func (singleUserIdentity) isMember(context.Context, string, string) (bool, error) {
	return true, nil
}

// One implicit user: whoever the path names, it is them.
func (singleUserIdentity) ownsProfile(*http.Request, string) bool { return true }

func (singleUserIdentity) hasSecondParty() bool { return false }

// sessionIdentity is the multi-user mode: every request carries one of
// JIT-Pack's own HS256 session tokens (ADR-007), and membership is a row.
type sessionIdentity struct {
	keyFunc      jwt.Keyfunc
	validMethods []string
	accounts     accountStore
}

func (i sessionIdentity) authenticate(r *http.Request) (context.Context, error) {
	raw, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
	if !ok || raw == "" {
		return nil, errNoBearerToken
	}
	claims := jwt.MapClaims{}
	if _, err := jwt.ParseWithClaims(raw, claims, i.keyFunc,
		jwt.WithValidMethods(i.validMethods)); err != nil {
		return nil, errBadToken
	}
	sub, err := claims.GetSubject()
	if err != nil || sub == "" {
		return nil, errNoTokenSubject
	}
	// Session tokens carry users.id directly (ADR-007): identity was
	// established once, at login, by the broker — never per request.
	// One lookup answers both remaining questions (FR-23.7): FR-23.3's
	// deactivation gets its own refusal so the client can tell it from a
	// stale token.
	state, err := i.accounts.AccountStatus(r.Context(), sub)
	if err != nil {
		return nil, errAccountLookup
	}
	switch state {
	case store.AccountDeactivated:
		return nil, errAccountDeactivated
	case store.AccountUnknown:
		return nil, errBadToken
	}
	ctx := context.WithValue(r.Context(), userIDKey, sub)
	return context.WithValue(ctx, tokenKindKey, stringClaim(claims, claimKind)), nil
}

func (i sessionIdentity) isMember(ctx context.Context, tripID, userID string) (bool, error) {
	return i.accounts.IsTripMember(ctx, tripID, userID)
}

func (sessionIdentity) ownsProfile(r *http.Request, userID string) bool {
	return userID != "" && r.PathValue(PathUserID) == userID
}

func (sessionIdentity) hasSecondParty() bool { return true }
