package api

import (
	"context"
	"encoding/json"
	"go/ast"
	"go/parser"
	"go/token"
	"net/http"
	"net/http/httptest"
	"testing"
)

// brokerAgainst points a broker at a stub IdP whose token and UserInfo
// endpoints answer whatever the test set. No JWKS and no session store:
// this is the layer G-5 exists to make reachable, so the setup is the
// two endpoints the call actually makes.
type stubIDP struct {
	tokenStatus int
	tokenBody   string
	infoStatus  int
	infoBody    string
}

func brokerAgainst(t *testing.T, idp *stubIDP) *oidcBroker {
	t.Helper()
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(idp.tokenStatus)
		_, _ = w.Write([]byte(idp.tokenBody))
	})
	mux.HandleFunc("/userinfo", func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(idp.infoStatus)
		_, _ = w.Write([]byte(idp.infoBody))
	})
	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	return newOIDCBroker(OIDCConfig{
		Discovery: Discovery{
			Issuer:      srv.URL,
			TokenURL:    srv.URL + "/token",
			UserinfoURL: srv.URL + "/userinfo",
		},
		ClientID:     "jitpack",
		ClientSecret: "s3cret",
	})
}

const okTokenSet = `{"access_token":"at-1","refresh_token":"rt-2","id_token":"id-1"}`

// ADR-007: a refresh re-validates the account at the IdP, and what it
// learns is best-effort. The token grant decides whether the session
// lives; UserInfo only decides whether the users row is re-stamped, so
// a UserInfo that says nothing must not fail the refresh — failing it
// would discard the rotated IdP refresh token the caller has to keep.
func TestBrokerRefresh_UsableAnswers(t *testing.T) {
	tests := []struct {
		name         string
		idp          stubIDP
		wantErr      error
		wantRotated  string
		wantSubject  string
		wantsClaimed bool
	}{
		{
			name:         "identity and a rotated token",
			idp:          stubIDP{http.StatusOK, okTokenSet, http.StatusOK, `{"sub":"u-1","email":"a@example.com"}`},
			wantRotated:  "rt-2",
			wantSubject:  "u-1",
			wantsClaimed: true,
		},
		{
			// Authelia's answer for an account disabled after its token
			// was issued: 200, standard claims stripped.
			name:        "stripped UserInfo still refreshes",
			idp:         stubIDP{http.StatusOK, okTokenSet, http.StatusOK, `{}`},
			wantRotated: "rt-2",
		},
		{
			name:        "unreachable UserInfo still refreshes",
			idp:         stubIDP{http.StatusOK, okTokenSet, http.StatusInternalServerError, "boom"},
			wantRotated: "rt-2",
		},
		{
			name:    "the IdP disowns the grant",
			idp:     stubIDP{http.StatusBadRequest, `{"error":"invalid_grant"}`, http.StatusOK, `{}`},
			wantErr: errIDPRejected,
		},
		{
			name:    "the token endpoint is a proxy error page",
			idp:     stubIDP{http.StatusNotFound, "<h1>Not Found</h1>", http.StatusOK, `{}`},
			wantErr: errIDPUnreachable,
		},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			idp := tc.idp
			id, err := brokerAgainst(t, &idp).refresh(context.Background(), "rt-1")
			if tc.wantErr != nil {
				if err != tc.wantErr {
					t.Fatalf("err = %v, want %v", err, tc.wantErr)
				}
				return
			}
			if err != nil {
				t.Fatalf("refresh: %v", err)
			}
			if id.idpRefreshToken != tc.wantRotated {
				t.Errorf("rotated token = %q, want %q", id.idpRefreshToken, tc.wantRotated)
			}
			if id.sub != tc.wantSubject {
				t.Errorf("sub = %q, want %q — an unusable UserInfo must re-stamp nothing", id.sub, tc.wantSubject)
			}
			if got := id.info != nil; got != tc.wantsClaimed {
				t.Errorf("claims present = %v, want %v", got, tc.wantsClaimed)
			}
		})
	}
}

// A token set without an id_token is what a client registered without
// the openid scope gets: the grant succeeded, but the credential the
// login is built on is missing, and the broker must say so rather than
// verify an empty token.
func TestBrokerExchange_NoIDTokenIsItsOwnFailure(t *testing.T) {
	idp := stubIDP{http.StatusOK, `{"access_token":"at-1"}`, http.StatusOK, `{"sub":"u-1"}`}
	if _, err := brokerAgainst(t, &idp).exchange(context.Background(), "code", "verifier", "https://app/cb"); err != errNoIDToken {
		t.Fatalf("err = %v, want %v", err, errNoIDToken)
	}
}

// A 200 that is not a token set never came from a token endpoint — a
// captive portal or a misrouted proxy — and must read as an outage
// rather than as a rejection of this user's grant.
func TestBrokerExchange_A200ThatIsNotATokenSetIsAnOutage(t *testing.T) {
	idp := stubIDP{http.StatusOK, `<html>sign in to the wifi</html>`, http.StatusOK, `{}`}
	if _, err := brokerAgainst(t, &idp).exchange(context.Background(), "code", "verifier", "https://app/cb"); err != errIDPUnreachable {
		t.Fatalf("err = %v, want %v", err, errIDPUnreachable)
	}
}

// The rule the whole session model rests on (ADR-007, spec §2), read
// directly rather than through a login: only an RFC 6749 §5.2
// invalid_grant is a rejection, everything else is an outage.
func TestClassifyTokenResponse(t *testing.T) {
	tests := []struct {
		name   string
		status int
		body   string
		want   error
	}{
		{"200 is a token set", http.StatusOK, okTokenSet, nil},
		{"400 invalid_grant", http.StatusBadRequest, `{"error":"invalid_grant"}`, errIDPRejected},
		{"401 invalid_grant", http.StatusUnauthorized, `{"error":"invalid_grant"}`, errIDPRejected},
		{"401 invalid_client is the broker's fault", http.StatusUnauthorized, `{"error":"invalid_client"}`, errIDPUnreachable},
		{"400 invalid_request is the broker's fault", http.StatusBadRequest, `{"error":"invalid_request"}`, errIDPUnreachable},
		{"a proxy's HTML 404", http.StatusNotFound, "<h1>Not Found</h1>", errIDPUnreachable},
		{"an OAuth error on a status no IdP uses for one", http.StatusServiceUnavailable, `{"error":"invalid_grant"}`, errIDPUnreachable},
		{"4xx with an empty body", http.StatusBadRequest, "", errIDPUnreachable},
		{"4xx with JSON but no error field", http.StatusBadRequest, `{"message":"blocked by policy"}`, errIDPUnreachable},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			if got := classifyTokenResponse(tc.status, []byte(tc.body)); got != tc.want {
				t.Errorf("classifyTokenResponse(%d, %q) = %v, want %v", tc.status, tc.body, got, tc.want)
			}
		})
	}
}

// brokerSentinels is what the table below is checked against, and the
// AST test guards the list itself.
var brokerSentinels = map[string]error{
	"errIDPRejected":         errIDPRejected,
	"errIDPUnreachable":      errIDPUnreachable,
	"errNoIDToken":           errNoIDToken,
	"errIDTokenInvalid":      errIDTokenInvalid,
	"errNoSubject":           errNoSubject,
	"errSubjectMismatch":     errSubjectMismatch,
	"errUserinfoUnreachable": errUserinfoUnreachable,
}

// Every failure the broker can report has an answer, and each answer is
// the one the client's error vocabulary names. A sentinel missing from
// the table would still answer — with a 500 that says "login failed" —
// which is exactly the kind of miss no end-to-end test would flag as
// wrong.
func TestWriteAuthError_AnswersEveryBrokerFailure(t *testing.T) {
	declared := sentinelNames(t, "oidcbroker.go")
	if len(declared) != len(brokerSentinels) {
		t.Fatalf("oidcbroker.go declares %d sentinels, %d are listed here: %v", len(declared), len(brokerSentinels), declared)
	}
	for _, name := range declared {
		if _, ok := brokerSentinels[name]; !ok {
			t.Fatalf("%s is declared in oidcbroker.go but not listed in brokerSentinels", name)
		}
	}

	for name, err := range brokerSentinels {
		t.Run(name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			writeAuthError(rec, err)

			if rec.Code == http.StatusInternalServerError {
				t.Fatalf("%s falls through to the 500 fallback — add it to authErrorResponses", name)
			}
			var body struct {
				Error struct {
					Code    string `json:"code"`
					Message string `json:"message"`
				} `json:"error"`
			}
			if err := json.NewDecoder(rec.Body).Decode(&body); err != nil {
				t.Fatalf("decode: %v", err)
			}
			if body.Error.Code == "" || body.Error.Message == "" {
				t.Errorf("answer for %s = %+v, want a code and a message", name, body.Error)
			}
		})
	}
}

// An error from somewhere else must not borrow an IdP status: it is a
// bug in this package, not something the caller did.
func TestWriteAuthError_UnknownErrorIsThisServersFault(t *testing.T) {
	rec := httptest.NewRecorder()
	writeAuthError(rec, context.Canceled)
	if rec.Code != http.StatusInternalServerError {
		t.Errorf("status = %d, want 500", rec.Code)
	}
}

// brokerSentinelNames reads the sentinels out of the source, because
// Go cannot enumerate a package's variables at runtime and a
// hand-written list would go stale exactly when a new failure is added.
// sentinelNames reads the package-level `errors.New` variables out of one
// source file. Go cannot enumerate a package's variables at runtime, and a
// table that answers a failure is only trustworthy if it is checked against
// every failure that exists rather than against the ones its author recalled.
func sentinelNames(t *testing.T, filename string) []string {
	t.Helper()
	file, err := parser.ParseFile(token.NewFileSet(), filename, nil, 0)
	if err != nil {
		t.Fatalf("parse %s: %v", filename, err)
	}
	var names []string
	for _, decl := range file.Decls {
		gen, ok := decl.(*ast.GenDecl)
		if !ok || gen.Tok != token.VAR {
			continue
		}
		for _, spec := range gen.Specs {
			value, ok := spec.(*ast.ValueSpec)
			if !ok {
				continue
			}
			for i, name := range value.Names {
				if i < len(value.Values) && isErrorsNew(value.Values[i]) {
					names = append(names, name.Name)
				}
			}
		}
	}
	return names
}

func isErrorsNew(expr ast.Expr) bool {
	call, ok := expr.(*ast.CallExpr)
	if !ok {
		return false
	}
	sel, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || sel.Sel.Name != "New" {
		return false
	}
	pkg, ok := sel.X.(*ast.Ident)
	return ok && pkg.Name == "errors"
}
