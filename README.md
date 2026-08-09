<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="docs/assets/logo-light.svg">
    <img alt="JIT-Pack" src="docs/assets/logo-light.svg" width="300">
  </picture>
</p>

Self-hosted, offline-first packing-list app with dynamic quantity formulas, real-time collaboration, and post-trip optimization. Go + embedded SQLite backend, Vue 3 + Capacitor client.

## For humans

Full specification set lives in `docs/` — start with `docs/PRD_Base.md` and `docs/PRD_Addendum_v2.10.md` for what the product does, `docs/UI_Spec_v1.10.md` for the screens, and the `docs/ADR-*.md` files for why the architecture looks the way it does.

## For Claude Code / an AI coding assistant

Read `CLAUDE.md` in this root first — it's written specifically to orient a fresh session without needing prior conversation context: current implementation status, what's built vs. not, in what order to build the rest, and a known environment deviation to check before touching the database layer.

## Configuration

All configuration is via environment variables.

| Variable | Required | Default | Description |
|---|---|---|---|
| `JITPACK_LISTEN` | no | `:8080` | Address to listen on |
| `JITPACK_DB_PATH` | no | `jitpack.db` | Path to the SQLite database file |
| `JITPACK_SINGLE_USER` | no | `false` | Set to `true` for single-user mode (no authentication) |
| `JITPACK_LOCAL_USER_ID` | single-user | — | User ID attributed to all requests in single-user mode |
| `JITPACK_SESSION_SECRET` | multi-user | — | Secret signing JIT-Pack's own HS256 session tokens (ADR-007) |
| `JITPACK_OIDC_ISSUER` | with OIDC¹ | — | IdP issuer URL, e.g. `https://auth.example.com` — all endpoints discovered from it |
| `JITPACK_OIDC_CLIENT_ID` | with OIDC¹ | — | OIDC client id |
| `JITPACK_OIDC_CLIENT_SECRET` | with OIDC¹ | — | OIDC client secret (JIT-Pack is a confidential client) |

¹ The three OIDC variables are set together or not at all. Without them, the server accepts externally minted HS256 tokens signed with the session secret — useful for tests and scripting, not for production.

### Single-user mode (homelab, no IdP)

```bash
JITPACK_SINGLE_USER=true \
JITPACK_LOCAL_USER_ID=andy \
JITPACK_DB_PATH=/data/jitpack.db \
  jitpackd
```

No authentication is performed — every request is attributed to the configured user.

### Multi-user mode with Authelia (recommended for production)

```bash
JITPACK_SESSION_SECRET=$(openssl rand -hex 32) \
JITPACK_OIDC_ISSUER=https://auth.example.com \
JITPACK_OIDC_CLIENT_ID=jitpack \
JITPACK_OIDC_CLIENT_SECRET=... \
JITPACK_DB_PATH=/data/jitpack.db \
  jitpackd
```

The server brokers the OIDC login (code + PKCE) as a confidential client, validates the ID token against the discovered JWKS, reads identity from the UserInfo endpoint, and issues its own short-lived session tokens — the IdP token set never reaches the app (ADR-007). The matching Authelia client is the stock confidential-client shape:

```yaml
- client_id: "jitpack"
  client_secret: "..."
  public: false
  authorization_policy: "two_factor"
  require_pkce: true
  pkce_challenge_method: "S256"
  redirect_uris:
    - https://jitpack.example.com/auth/callback
  scopes: ["openid", "profile", "email", "offline_access"]
  response_types: ["code"]
  grant_types: ["authorization_code", "refresh_token"]
  access_token_signed_response_alg: "none"   # opaque — JIT-Pack never parses it
  userinfo_signed_response_alg: "none"
  token_endpoint_auth_method: "client_secret_basic"
```

`offline_access` and the `refresh_token` grant keep sessions alive across offline periods; each refresh re-validates the account at Authelia, so a user disabled there is cut off within one access-token lifetime (15 minutes).

### Docker Compose

```yaml
services:
  app:
    build: .
    ports:
      - "8080:8080"
    volumes:
      - data:/data
    environment:
      JITPACK_DB_PATH: "/data/jitpack.db"
      # Single-user mode:
      JITPACK_SINGLE_USER: "true"
      JITPACK_LOCAL_USER_ID: "local"
      # Or multi-user with Authelia:
      # JITPACK_SESSION_SECRET: "..."
      # JITPACK_OIDC_ISSUER: "https://auth.example.com"
      # JITPACK_OIDC_CLIENT_ID: "jitpack"
      # JITPACK_OIDC_CLIENT_SECRET: "..."

volumes:
  data:
```

## Running the tests

```
go test -race -cover ./...
```

Requires a C toolchain (CGO) for the current SQLite driver — see the deviation note in `CLAUDE.md` if that's a problem in your environment.
