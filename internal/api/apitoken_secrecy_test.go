package api

import (
	"strings"
	"testing"
	"time"
)

// The token is readable exactly once, in one response body. A log line would
// be a second copy — one that outlives the response, gets shipped somewhere,
// and that nobody would ever think to look for. Asserted rather than assumed,
// because "we do not log it" is a property that survives only until someone
// adds a debug line.
func TestMintAPIToken_NeitherTheTokenNorTheSecretReachesTheLog(t *testing.T) {
	logs := captureLogs(t)
	secret := []byte("a-recognisable-signing-secret")

	out, err := MintAPIToken(secret,
		APITokenRequest{Name: "cleanup", Expiry: APITokenExpiry90d},
		"user-a", "0123456789abcdef", time.Now().UTC())
	if err != nil {
		t.Fatalf("MintAPIToken: %v", err)
	}

	written := logs.String()
	if strings.Contains(written, out.Token) {
		t.Error("the minted token was logged")
	}
	// Only the signature carries the secret, so a substring check on the
	// whole token would pass for the wrong reason — check the secret itself.
	if strings.Contains(written, string(secret)) {
		t.Error("the signing secret was logged")
	}
}

// The name travels *inside* the credential, so an unbounded name is an
// unbounded token. The cap is the same shape as the CHECK on display_name.
func TestMintAPIToken_TheNameIsBounded(t *testing.T) {
	if maxTokenNameRunes > 100 {
		t.Errorf("maxTokenNameRunes = %d — a name this long is a token this long", maxTokenNameRunes)
	}
}
