package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
)

// Discovery holds the OIDC endpoints resolved from the issuer's
// well-known configuration document (ADR-007). The issuer is the only
// endpoint an operator configures; everything else comes from here.
type Discovery struct {
	Issuer       string `json:"issuer"`
	AuthorizeURL string `json:"authorization_endpoint"`
	TokenURL     string `json:"token_endpoint"`
	JWKSURI      string `json:"jwks_uri"`
	UserinfoURL  string `json:"userinfo_endpoint"`
}

// FetchDiscovery loads {issuer}/.well-known/openid-configuration and
// verifies the document's own issuer matches the configured one — the
// OIDC Discovery spec makes that check mandatory, and it is what stops
// a misrouted URL from silently wiring the broker to the wrong IdP.
func FetchDiscovery(issuer string) (Discovery, error) {
	client := &http.Client{Timeout: idpTimeout}
	resp, err := client.Get(issuer + "/.well-known/openid-configuration")
	if err != nil {
		return Discovery{}, fmt.Errorf("fetch OIDC discovery: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return Discovery{}, fmt.Errorf("fetch OIDC discovery: %s returned %d", issuer, resp.StatusCode)
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, idpMaxBody))
	if err != nil {
		return Discovery{}, fmt.Errorf("read OIDC discovery: %w", err)
	}
	var d Discovery
	if err := json.Unmarshal(body, &d); err != nil {
		return Discovery{}, fmt.Errorf("parse OIDC discovery: %w", err)
	}
	if d.Issuer != issuer {
		return Discovery{}, fmt.Errorf("OIDC discovery issuer mismatch: document says %q, configured %q", d.Issuer, issuer)
	}
	for name, v := range map[string]string{
		"authorization_endpoint": d.AuthorizeURL,
		"token_endpoint":         d.TokenURL,
		"jwks_uri":               d.JWKSURI,
		"userinfo_endpoint":      d.UserinfoURL,
	} {
		if v == "" {
			return Discovery{}, fmt.Errorf("OIDC discovery document lacks %s", name)
		}
	}
	return d, nil
}
