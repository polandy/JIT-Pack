# JIT-Pack

Self-hosted, offline-first packing-list app with dynamic quantity formulas, real-time collaboration, and post-trip optimization. Go + embedded SQLite backend, Vue 3 + Capacitor client.

## For humans

Full specification set lives in `docs/` — start with `docs/PRD_Base.md` and `docs/PRD_Addendum_v2.8.md` for what the product does, `docs/UI_Spec_v1.8.md` for the screens, and the `docs/ADR-*.md` files for why the architecture looks the way it does.

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
| `JITPACK_JWT_SECRET` | multi-user¹ | — | Shared secret for HS256 JWT validation |
| `JITPACK_JWKS_URL` | multi-user¹ | — | JWKS endpoint URL for RS256 JWT validation (e.g. from Authelia) |

¹ In multi-user mode, exactly one of `JITPACK_JWT_SECRET` or `JITPACK_JWKS_URL` must be set. They are mutually exclusive.

### Single-user mode (homelab, no IdP)

```bash
JITPACK_SINGLE_USER=true \
JITPACK_LOCAL_USER_ID=andy \
JITPACK_DB_PATH=/data/jitpack.db \
  jitpackd
```

No authentication is performed — every request is attributed to the configured user.

### Multi-user mode with JWKS (recommended for production)

```bash
JITPACK_JWKS_URL=https://auth.example.com/.well-known/jwks.json \
JITPACK_DB_PATH=/data/jitpack.db \
  jitpackd
```

JWTs must be signed with RS256 and include a `kid` header matching a key in the JWKS endpoint. Keys are fetched on startup and refreshed every 5 minutes. The `sub` claim is used as the user ID.

### Multi-user mode with shared secret (testing only)

```bash
JITPACK_JWT_SECRET=your-secret-here \
JITPACK_DB_PATH=/data/jitpack.db \
  jitpackd
```

JWTs must be signed with HS256 using the provided secret. Suitable for development and testing — use JWKS for production.

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
      # Or multi-user with JWKS:
      # JITPACK_JWKS_URL: "https://auth.example.com/.well-known/jwks.json"

volumes:
  data:
```

## Running the tests

```
go test -race -cover ./...
```

Requires a C toolchain (CGO) for the current SQLite driver — see the deviation note in `CLAUDE.md` if that's a problem in your environment.
