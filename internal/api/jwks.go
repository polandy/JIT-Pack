package api

import (
	"crypto/rsa"
	"encoding/base64"
	"encoding/json"
	"fmt"
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

// JWKSProvider fetches and caches RSA public keys from a JWKS endpoint,
// suitable for validating RS256 JWTs issued by an IdP (e.g. Authelia).
// Keys are fetched on startup and refreshed every 5 minutes.
type JWKSProvider struct {
	url    string
	client *http.Client
	mu     sync.RWMutex
	keys   map[string]*rsa.PublicKey
	done   chan struct{}
}

// NewJWKSProvider creates a provider that immediately fetches keys from
// the given URL. Returns an error if the initial fetch fails.
func NewJWKSProvider(url string) (*JWKSProvider, error) {
	p := &JWKSProvider{
		url:    url,
		client: &http.Client{Timeout: 10 * time.Second},
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
			_ = p.refresh()
		case <-p.done:
			return
		}
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
