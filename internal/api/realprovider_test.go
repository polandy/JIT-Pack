package api_test

import (
	"encoding/json"
	"io"
	"net/http"
	"os"
	"slices"
	"testing"
	"time"

	"jitpack/internal/api"
)

// Conformance against a **real** identity provider (ADR-029's deferred bill).
//
// ADR-029 kept a real Authelia out of the Playwright suite on cost grounds —
// a nested container, a third hand-bumped digest, and a second product's
// configuration surface — and wrote down what that leaves uncovered: an
// Authelia-specific defect ships green, to be caught by "the manual
// pre-release check against the family instance". This is the half of that
// check a machine can do, so the half a person does is only what needs eyes.
//
// It is **read-only and unauthenticated**: four GETs against published
// metadata, no client secret, no account, nothing written. It is therefore
// safe to point at a production instance, which is the only place the real
// answers live.
//
// Opt in with the issuer, exactly as configured for the deployment:
//
//	JITPACK_REAL_IDP_ISSUER=https://auth.example.com go test ./internal/api/ -run RealProvider -v
//
// Skipped otherwise, so `make ci` and the pipeline are untouched — neither
// can reach a homelab, and a check that needs the network must never be the
// reason a build goes red.
const realIssuerEnv = "JITPACK_REAL_IDP_ISSUER"

// scopesTheClientAsksFor mirrors `client/src/auth/pkce.ts`. It is spelled out
// rather than imported because that is the point: if the two ever disagree,
// this test is what says so against a provider that would silently grant the
// smaller set.
var scopesTheClientAsksFor = []string{"openid", "profile", "email", "offline_access"}

// providerMetadata is the discovery document seen as *capabilities*, which is
// what conformance is about. `api.Discovery` deliberately reads only the four
// endpoints it needs to route requests, so it cannot answer "would this
// provider accept the login we actually send".
type providerMetadata struct {
	Issuer                 string   `json:"issuer"`
	ScopesSupported        []string `json:"scopes_supported"`
	ResponseTypes          []string `json:"response_types_supported"`
	GrantTypes             []string `json:"grant_types_supported"`
	CodeChallengeMethods   []string `json:"code_challenge_methods_supported"`
	TokenEndpointAuthMeths []string `json:"token_endpoint_auth_methods_supported"`
	IDTokenSigningAlgs     []string `json:"id_token_signing_alg_values_supported"`
	ClaimsSupported        []string `json:"claims_supported"`
	JWKSURI                string   `json:"jwks_uri"`
}

func realIssuer(t *testing.T) string {
	t.Helper()
	issuer := os.Getenv(realIssuerEnv)
	if issuer == "" {
		t.Skipf("%s is not set — see the file comment for how to run this", realIssuerEnv)
	}
	return issuer
}

func getJSON(t *testing.T, url string, into any) {
	t.Helper()
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		t.Fatalf("GET %s: %v", url, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("GET %s: status %d, want 200", url, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		t.Fatalf("read %s: %v", url, err)
	}
	if err := json.Unmarshal(body, into); err != nil {
		t.Fatalf("parse %s: %v", url, err)
	}
}

// TestRealProvider_DiscoveryIsTheOneTheBrokerResolves runs the shipped
// resolver against the real document, so the assertion is made by the code
// that runs in production rather than by a second reading of it. The issuer
// equality it enforces is the trap `docs/authentication.md` names: a trailing
// slash or a proxy-rewritten host produces a document that parses and points
// somewhere else.
func TestRealProvider_DiscoveryIsTheOneTheBrokerResolves(t *testing.T) {
	issuer := realIssuer(t)

	d, err := api.FetchDiscovery(issuer)
	if err != nil {
		t.Fatalf("FetchDiscovery(%q): %v", issuer, err)
	}
	t.Logf("authorize=%s", d.AuthorizeURL)
	t.Logf("token=%s", d.TokenURL)
	t.Logf("jwks=%s", d.JWKSURI)
	t.Logf("userinfo=%s", d.UserinfoURL)
}

// TestRealProvider_SupportsTheLoginWeActuallySend checks the capabilities the
// broker and the client depend on. Each subtest is named for the thing that
// breaks when it fails, because a provider does not refuse an unsupported
// capability loudly — it grants less and the failure surfaces much later, as
// a session that will not refresh or an exchange that will not authenticate.
func TestRealProvider_SupportsTheLoginWeActuallySend(t *testing.T) {
	issuer := realIssuer(t)

	var meta providerMetadata
	getJSON(t, issuer+"/.well-known/openid-configuration", &meta)

	cases := []struct {
		name string
		// what breaks, said in the failure rather than in a comment
		breaks    string
		supported []string
		required  []string
	}{
		{
			name:      "PKCE S256, or the code exchange is refused",
			breaks:    "client/src/auth/pkce.ts generates an S256 challenge and sends it unconditionally",
			supported: meta.CodeChallengeMethods,
			required:  []string{"S256"},
		},
		{
			name:      "client_secret_basic, or the broker cannot authenticate at the token endpoint",
			breaks:    "ADR-007 makes JIT-Pack a confidential client using HTTP Basic",
			supported: meta.TokenEndpointAuthMeths,
			required:  []string{"client_secret_basic"},
		},
		{
			name:      "RS256, or the ID token signature cannot be verified",
			breaks:    "the broker validates the ID token against the JWKS",
			supported: meta.IDTokenSigningAlgs,
			required:  []string{"RS256"},
		},
		{
			name:      "the authorization code flow",
			breaks:    "ADR-007's broker exchanges a code; no other flow is implemented",
			supported: meta.ResponseTypes,
			required:  []string{"code"},
		},
		{
			name:      "every scope the client asks for, offline_access included",
			breaks:    "a provider that grants a subset issues no refresh token, and the session silently stops renewing",
			supported: meta.ScopesSupported,
			required:  scopesTheClientAsksFor,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			for _, want := range tc.required {
				if !slices.Contains(tc.supported, want) {
					t.Errorf("provider does not advertise %q (has %v) — %s", want, tc.supported, tc.breaks)
				}
			}
		})
	}
}

// TestRealProvider_PublishesTheIdentityClaimsTheBrokerReads guards the claims
// `internal/api/auth.go` extracts. A missing one is not an error at any layer:
// the account is provisioned with an empty display name, or — for
// `email_verified` — is silently denied the instance-admin role it was
// configured to hold (FR-23.1), because an unasserted flag reads as false.
//
// `claims_supported` is advisory in the spec and some providers omit it
// entirely; an absent list is therefore reported and not failed. What is
// asserted is the negative that carries information: a provider that
// publishes the list and leaves one of these out.
func TestRealProvider_PublishesTheIdentityClaimsTheBrokerReads(t *testing.T) {
	issuer := realIssuer(t)

	var meta providerMetadata
	getJSON(t, issuer+"/.well-known/openid-configuration", &meta)

	if len(meta.ClaimsSupported) == 0 {
		t.Skip("provider publishes no claims_supported list — nothing to check against")
	}
	for _, claim := range []string{"sub", "email", "email_verified"} {
		if !slices.Contains(meta.ClaimsSupported, claim) {
			t.Errorf("claims_supported lacks %q (has %v)", claim, meta.ClaimsSupported)
		}
	}
	// The display name is read from either, in this order, so one is enough.
	if !slices.Contains(meta.ClaimsSupported, "name") &&
		!slices.Contains(meta.ClaimsSupported, "preferred_username") {
		t.Errorf("claims_supported has neither \"name\" nor \"preferred_username\" (has %v) — "+
			"accounts would be provisioned with an empty display name", meta.ClaimsSupported)
	}
}

// TestRealProvider_JWKSCarriesAVerifiableSigningKey fetches the key set the
// broker validates ID tokens against. An empty or algorithm-less set is a
// provider that cannot be verified at all, which surfaces at the first login
// rather than at start-up.
func TestRealProvider_JWKSCarriesAVerifiableSigningKey(t *testing.T) {
	issuer := realIssuer(t)

	d, err := api.FetchDiscovery(issuer)
	if err != nil {
		t.Fatalf("FetchDiscovery(%q): %v", issuer, err)
	}

	var jwks struct {
		Keys []struct {
			Kty string `json:"kty"`
			Alg string `json:"alg"`
			Use string `json:"use"`
			Kid string `json:"kid"`
		} `json:"keys"`
	}
	getJSON(t, d.JWKSURI, &jwks)

	if len(jwks.Keys) == 0 {
		t.Fatalf("JWKS at %s carries no keys", d.JWKSURI)
	}
	var usable int
	for _, k := range jwks.Keys {
		// `use` is optional; absent means the key may be used for signing.
		if k.Kty == "RSA" && (k.Use == "" || k.Use == "sig") {
			usable++
			t.Logf("signing key: kid=%s alg=%s", k.Kid, k.Alg)
		}
	}
	if usable == 0 {
		t.Errorf("JWKS at %s carries %d key(s), none of them an RSA signing key", d.JWKSURI, len(jwks.Keys))
	}
}
