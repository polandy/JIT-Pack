package api

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/golang-jwt/jwt/v5"

	"jitpack/internal/store"
)

// fakeAccounts is the hand-written stand-in for the two store questions a
// session identity asks. It exists so the refusal paths can be driven
// directly: before this seam every one of them needed a wired-up server, a
// real database and an HTTP round trip to be observed at all.
type fakeAccounts struct {
	state     store.AccountState
	stateErr  error
	member    bool
	memberErr error
	asked     []string
}

func (f *fakeAccounts) AccountStatus(_ context.Context, userID string) (store.AccountState, error) {
	f.asked = append(f.asked, userID)
	return f.state, f.stateErr
}

func (f *fakeAccounts) IsTripMember(context.Context, string, string) (bool, error) {
	return f.member, f.memberErr
}

const identityTestSecret = "identity-test-secret"

func identityUnderTest(accounts accountStore) sessionIdentity {
	return sessionIdentity{
		keyFunc:      func(*jwt.Token) (any, error) { return []byte(identityTestSecret), nil },
		validMethods: []string{sessionSigningMethod.Alg()},
		accounts:     accounts,
	}
}

func signedWith(t *testing.T, method jwt.SigningMethod, secret string, claims jwt.MapClaims) string {
	t.Helper()
	tok, err := jwt.NewWithClaims(method, claims).SignedString([]byte(secret))
	if err != nil {
		t.Fatalf("sign test token: %v", err)
	}
	return tok
}

func requestWith(header string) *http.Request {
	r := httptest.NewRequest(http.MethodGet, "/", nil)
	if header != "" {
		r.Header.Set("Authorization", header)
	}
	return r
}

// Each row is one way a credential can be unusable, and each names the
// refusal it must produce — the distinction that matters most is the last
// two: an id no account carries answers exactly as a forged signature
// does, so a caller cannot use the refusal to learn which ids exist.
func TestSessionIdentity_RefusesEveryUnusableCredential(t *testing.T) {
	good := jwt.MapClaims{"sub": "u1"}
	cases := []struct {
		name     string
		header   string
		accounts *fakeAccounts
		want     error
	}{
		{"no Authorization header at all", "", &fakeAccounts{state: store.AccountActive}, errNoBearerToken},
		{"a scheme that is not Bearer", "Basic abc", &fakeAccounts{state: store.AccountActive}, errNoBearerToken},
		{"Bearer with nothing after it", "Bearer ", &fakeAccounts{state: store.AccountActive}, errNoBearerToken},
		{"not a token", "Bearer not.a.jwt", &fakeAccounts{state: store.AccountActive}, errBadToken},
		{"signed with another secret", "Bearer " + signedWith(t, sessionSigningMethod, "someone-elses-secret", good), &fakeAccounts{state: store.AccountActive}, errBadToken},
		{"no sub claim", "Bearer " + signedWith(t, sessionSigningMethod, identityTestSecret, jwt.MapClaims{}), &fakeAccounts{state: store.AccountActive}, errNoTokenSubject},
		{"an empty sub claim", "Bearer " + signedWith(t, sessionSigningMethod, identityTestSecret, jwt.MapClaims{"sub": ""}), &fakeAccounts{state: store.AccountActive}, errNoTokenSubject},
		{"FR-23.3: the account was deactivated", "Bearer " + signedWith(t, sessionSigningMethod, identityTestSecret, good), &fakeAccounts{state: store.AccountDeactivated}, errAccountDeactivated},
		{"no account carries the subject", "Bearer " + signedWith(t, sessionSigningMethod, identityTestSecret, good), &fakeAccounts{state: store.AccountUnknown}, errBadToken},
		{"the account lookup failed", "Bearer " + signedWith(t, sessionSigningMethod, identityTestSecret, good), &fakeAccounts{stateErr: errors.New("database is gone")}, errAccountLookup},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			ctx, err := identityUnderTest(tc.accounts).authenticate(requestWith(tc.header))
			if !errors.Is(err, tc.want) {
				t.Fatalf("want %v, got %v", tc.want, err)
			}
			if ctx != nil {
				t.Fatalf("a refused request must carry no identity context, got %v", ctx)
			}
		})
	}
}

// The signing algorithm is named once (sessionSigningMethod) so the accept
// side cannot drift from the mint. A token signed with a different family
// is refused even when its signature verifies against the same secret —
// which is what "alg: none" and the HS/RS confusion both rely on.
func TestSessionIdentity_RefusesAnotherSigningMethod(t *testing.T) {
	id := identityUnderTest(&fakeAccounts{state: store.AccountActive})
	id.validMethods = []string{jwt.SigningMethodHS512.Alg()}
	_, err := id.authenticate(requestWith("Bearer " + signedWith(t, sessionSigningMethod, identityTestSecret, jwt.MapClaims{"sub": "u1"})))
	if !errors.Is(err, errBadToken) {
		t.Fatalf("want errBadToken for a method outside validMethods, got %v", err)
	}
}

// ADR-007: the subject is users.id, established once at login. FR-23.7's
// kind travels with it, because the mint is the one endpoint that has to
// refuse what it produces.
func TestSessionIdentity_CarriesTheSubjectAndTheCredentialKind(t *testing.T) {
	accounts := &fakeAccounts{state: store.AccountActive}
	claims := jwt.MapClaims{"sub": "user-7", claimKind: APITokenKind}
	ctx, err := identityUnderTest(accounts).authenticate(requestWith("Bearer " + signedWith(t, sessionSigningMethod, identityTestSecret, claims)))
	if err != nil {
		t.Fatalf("authenticate: %v", err)
	}
	if got, _ := ctx.Value(userIDKey).(string); got != "user-7" {
		t.Fatalf("user id in context: want user-7, got %q", got)
	}
	if got, _ := ctx.Value(tokenKindKey).(string); got != APITokenKind {
		t.Fatalf("token kind in context: want %q, got %q", APITokenKind, got)
	}
	if len(accounts.asked) != 1 || accounts.asked[0] != "user-7" {
		t.Fatalf("the account status must be resolved for the token's own subject, asked for %v", accounts.asked)
	}
}

// FR-17.2/17.3: no credential, no membership, nobody else. The last one is
// the reason the interface carries hasSecondParty at all — it is what
// keeps FR-6.2 detection from running for an audience of one.
func TestSingleUserIdentity_NeedsNoCredentialAndHasNoSecondParty(t *testing.T) {
	id := singleUserIdentity{userID: "local"}
	ctx, err := id.authenticate(requestWith(""))
	if err != nil {
		t.Fatalf("Single-User Mode must authenticate without a credential, got %v", err)
	}
	if got, _ := ctx.Value(userIDKey).(string); got != "local" {
		t.Fatalf("every request is attributed to the local user, got %q", got)
	}
	if ok, err := id.isMember(context.Background(), "any-trip", "local"); err != nil || !ok {
		t.Fatalf("the implicit user owns every trip, got %v %v", ok, err)
	}
	if !id.ownsProfile(requestWith(""), "somebody-else") {
		t.Fatalf("whoever the path names, it is the implicit user")
	}
	if id.hasSecondParty() {
		t.Fatalf("Single-User Mode has no second party")
	}
}

// A profile route names its target in the path, so without this rule the
// client would pick whose row it writes (invariant 3).
func TestSessionIdentity_OwnsProfileOnlyMatchesTheCallersOwnRow(t *testing.T) {
	id := identityUnderTest(&fakeAccounts{state: store.AccountActive})
	cases := []struct {
		name   string
		path   string
		caller string
		want   bool
	}{
		{"their own row", "u1", "u1", true},
		{"another account's row", "u2", "u1", false},
		{"an unauthenticated caller", "u1", "", false},
		{"a path that names nobody", "", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPatch, "/", nil)
			r.SetPathValue(PathUserID, tc.path)
			if got := id.ownsProfile(r, tc.caller); got != tc.want {
				t.Fatalf("want %v, got %v", tc.want, got)
			}
		})
	}
}

// identitySentinels is the same claim the broker's table makes: every
// refusal an identity can report has an answer chosen on purpose.
var identitySentinels = map[string]error{
	"errNoBearerToken":      errNoBearerToken,
	"errBadToken":           errBadToken,
	"errNoTokenSubject":     errNoTokenSubject,
	"errAccountDeactivated": errAccountDeactivated,
	"errAccountLookup":      errAccountLookup,
}

// A sentinel missing from identityRefusals would still answer — with the
// 500 the fallback writes — so an end-to-end test would see a refusal and
// call it a refusal. Only reading the declarations catches it.
func TestIdentityRefusals_AnswersEveryRefusal(t *testing.T) {
	declared := sentinelNames(t, "identity.go")
	if len(declared) != len(identitySentinels) {
		t.Fatalf("identity.go declares %d sentinels, %d are listed here: %v", len(declared), len(identitySentinels), declared)
	}
	for _, name := range declared {
		if _, ok := identitySentinels[name]; !ok {
			t.Fatalf("%s is declared in identity.go but not listed in identitySentinels", name)
		}
	}
	for name, err := range identitySentinels {
		t.Run(name, func(t *testing.T) {
			rec := httptest.NewRecorder()
			if !answerFrom(rec, identityRefusals, err) {
				t.Fatalf("%s has no row in identityRefusals", name)
			}
			if rec.Code == http.StatusInternalServerError && !errors.Is(err, errAccountLookup) {
				t.Fatalf("%s answers 500; only a failed lookup is this server's fault", name)
			}
		})
	}
}

// Both modes answer every question, and they answer the two that decide
// invariant 5 differently. A third mode added later cannot compile without
// answering all four, and cannot pass without appearing here.
func TestIdentity_BothModesAnswerEveryQuestion(t *testing.T) {
	modes := map[string]struct {
		id             identity
		hasSecondParty bool
	}{
		"single user": {singleUserIdentity{userID: "local"}, false},
		"session":     {identityUnderTest(&fakeAccounts{state: store.AccountActive, member: true}), true},
	}
	for name, m := range modes {
		t.Run(name, func(t *testing.T) {
			if m.id.hasSecondParty() != m.hasSecondParty {
				t.Fatalf("hasSecondParty: want %v", m.hasSecondParty)
			}
			if _, err := m.id.isMember(context.Background(), "t1", "u1"); err != nil {
				t.Fatalf("isMember: %v", err)
			}
		})
	}
}

// The mode is a construction-time choice (FR-17.11), and this is what
// keeps it one: a per-mode boolean on Server is the exact shape that made
// every handler responsible for remembering invariant 5 at its own site.
// A new one would branch somewhere, and nothing else here would notice.
func TestServer_CarriesNoModeFlag(t *testing.T) {
	for _, f := range reflect.VisibleFields(reflect.TypeOf(Server{})) {
		if f.Type.Kind() == reflect.Bool {
			t.Fatalf("Server.%s is a bool: a mode belongs in the identity, not in a field handlers branch on", f.Name)
		}
	}
}
