package api

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/big"
	"net/http"
	"sync"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

type jwksKey struct {
	Kty string `json:"kty"`
	Kid string `json:"kid"`
	Alg string `json:"alg"`
	N   string `json:"n"`
	E   string `json:"e"`
}

type jwksResponse struct {
	Keys []jwksKey `json:"keys"`
}

// The three messages the provider is judged by, named once because the
// tests assert against them (CODING_PRINCIPLES §4a).
const (
	msgJWKSRefreshFailed    = "JWKS refresh failed; serving the cached keys"
	msgJWKSRefreshRecovered = "JWKS refresh recovered"
	msgJWKSKeyUnparsable    = "JWKS key dropped: cannot be parsed"
)

// JWKSProvider fetches and caches RSA public keys from a JWKS endpoint,
// suitable for validating RS256 JWTs issued by an IdP (e.g. Authelia).
// Keys are fetched on startup and refreshed every 5 minutes.
type JWKSProvider struct {
	url    string
	client *http.Client
	mu     sync.RWMutex
	keys   map[string]*rsa.PublicKey
	done   chan struct{}
	// failing carries whether the last scheduled refresh failed, so an
	// outage is reported at its edges rather than on every tick. Only
	// backgroundRefresh's goroutine touches it, so it needs no lock —
	// and must not take mu, which refresh already holds.
	failing bool
}

// NewJWKSProvider creates a provider that immediately fetches keys from
// the given URL. Returns an error if the initial fetch fails.
func NewJWKSProvider(url string) (*JWKSProvider, error) {
	p := &JWKSProvider{
		url:    url,
		client: &http.Client{Timeout: idpTimeout},
		done:   make(chan struct{}),
	}
	if err := p.refresh(); err != nil {
		return nil, fmt.Errorf("initial JWKS fetch: %w", err)
	}
	go p.backgroundRefresh()
	return p, nil
}

// Close stops the background refresh goroutine.
func (p *JWKSProvider) Close() {
	close(p.done)
}

// KeyFunc implements jwt.Keyfunc — looks up the RSA public key by the
// token's kid header.
func (p *JWKSProvider) KeyFunc(token *jwt.Token) (any, error) {
	kid, ok := token.Header["kid"].(string)
	if !ok {
		return nil, fmt.Errorf("token has no kid header")
	}
	p.mu.RLock()
	key, exists := p.keys[kid]
	p.mu.RUnlock()
	if !exists {
		// Try one refresh in case keys were rotated.
		if err := p.refresh(); err != nil {
			return nil, fmt.Errorf("JWKS refresh: %w", err)
		}
		p.mu.RLock()
		key, exists = p.keys[kid]
		p.mu.RUnlock()
		if !exists {
			return nil, fmt.Errorf("unknown kid: %s", kid)
		}
	}
	return key, nil
}

func (p *JWKSProvider) refresh() error {
	resp, err := p.client.Get(p.url)
	if err != nil {
		return fmt.Errorf("fetch JWKS: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("JWKS endpoint returned %d", resp.StatusCode)
	}

	var jwks jwksResponse
	if err := json.NewDecoder(resp.Body).Decode(&jwks); err != nil {
		return fmt.Errorf("decode JWKS: %w", err)
	}

	keys := make(map[string]*rsa.PublicKey)
	for _, k := range jwks.Keys {
		if k.Kty != "RSA" {
			continue
		}
		pub, err := parseRSAPublicKey(k)
		if err != nil {
			// Dropping the key silently makes every token signed with it
			// fail later as "unknown kid", which names neither the cause
			// nor the remedy. One bad key must not discard the rest.
			slog.Warn(msgJWKSKeyUnparsable, "kid", k.Kid, "url", p.url, "error", err)
			continue
		}
		keys[k.Kid] = pub
	}

	p.mu.Lock()
	p.keys = keys
	p.mu.Unlock()
	return nil
}

func (p *JWKSProvider) backgroundRefresh() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			p.refreshTick()
		case <-p.done:
			return
		}
	}
}

// refreshTick performs one scheduled refresh and reports the outcome only
// when it changes. A failing refresh keeps serving the cached keys, so
// without a line here an IdP that has gone away is invisible until logins
// start failing; with a line on every tick it is a five-minute drip that
// buries the moment the keys came back.
func (p *JWKSProvider) refreshTick() {
	err := p.refresh()
	switch {
	case err != nil && !p.failing:
		slog.Warn(msgJWKSRefreshFailed, "url", p.url, "error", err)
		p.failing = true
	case err == nil && p.failing:
		slog.Info(msgJWKSRefreshRecovered, "url", p.url)
		p.failing = false
	}
}

func parseRSAPublicKey(k jwksKey) (*rsa.PublicKey, error) {
	nb, err := base64.RawURLEncoding.DecodeString(k.N)
	if err != nil {
		return nil, fmt.Errorf("decode n: %w", err)
	}
	eb, err := base64.RawURLEncoding.DecodeString(k.E)
	if err != nil {
		return nil, fmt.Errorf("decode e: %w", err)
	}
	return &rsa.PublicKey{
		N: new(big.Int).SetBytes(nb),
		E: int(new(big.Int).SetBytes(eb).Int64()),
	}, nil
}
