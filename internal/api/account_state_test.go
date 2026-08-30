package api_test

import (
	"net/http"
	"testing"

	"jitpack/internal/api"
)

// The hole an API token makes reachable (FR-23.7, ADR-039).
//
// `authed` established that a token's subject was *not deactivated*, and the
// store answered "not deactivated" for an id no row carries. At fifteen
// minutes that gap is almost unreachable; at ninety days it is not, because a
// token outlives the account it was minted for. Every case below is on the
// shared authentication path, so this file is deliberately about sessions as
// much as about tokens.

func TestAuthed_TokenForASubjectNoAccountCarries_Is401(t *testing.T) {
	srv := newTestServer(t)

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me",
		token(t, "user-who-never-existed", testSecret), nil)

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401 — a credential naming nobody authenticated, body %s",
			resp.StatusCode, raw)
	}
	// The same answer a bad signature gets, on purpose: distinguishing them
	// would let an unauthenticated caller probe which ids exist.
	if code := errorCode(t, raw); code != string(api.ErrUnauthorized) {
		t.Errorf("error code = %q, want %q", code, api.ErrUnauthorized)
	}
}

// The regression guard for the same change: it touches every authenticated
// request in the product, so the ordinary path needs a positive assertion
// beside the negative one.
func TestAuthed_AnOrdinarySessionTokenStillPasses(t *testing.T) {
	srv := newTestServer(t)

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", token(t, userA, testSecret), nil)

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("status = %d, want 200, body %s", resp.StatusCode, raw)
	}
}

// Deactivation keeps its own status and code. Pinned because the refactor
// could quietly fold it into the 401 above, and the client narrows on
// `account_deactivated` to say why the app went dark (FR-23.3).
func TestAuthed_DeactivatedAccount_Is403WithItsOwnCode(t *testing.T) {
	srv, st := newTestServerWithStore(t)
	if _, err := st.DB().Exec(
		`UPDATE users SET deactivated_at = '2026-08-30T10:00:00Z' WHERE id = ?`, userA); err != nil {
		t.Fatalf("deactivate: %v", err)
	}

	resp, raw := doJSON(t, http.MethodGet, srv.URL+"/api/v1/me", token(t, userA, testSecret), nil)

	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("status = %d, want 403, body %s", resp.StatusCode, raw)
	}
	if code := errorCode(t, raw); code != string(api.ErrAccountDeactivated) {
		t.Errorf("error code = %q, want %q — the app cannot say why it went dark",
			code, api.ErrAccountDeactivated)
	}
}

// The socket is the other door, and a long-lived credential is exactly what
// would be pointed at it. It wraps `authed`, so this asserts the wrapping
// still holds rather than a second rule.
func TestWSAuth_TokenForASubjectNoAccountCarries_Is401(t *testing.T) {
	srv := newTestServer(t)

	resp, _ := doJSON(t, http.MethodGet,
		srv.URL+"/ws?token="+token(t, "user-who-never-existed", testSecret), "", nil)

	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("status = %d, want 401", resp.StatusCode)
	}
}
