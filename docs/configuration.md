# Configuration — Reference

JIT-Pack's server, `jitpackd`, is configured entirely through environment variables — there is no config file and no command-line flag. Every value is read once at startup, so a change needs a restart.

This page is the full reference. For how the modes below differ and how to wire up an identity provider, see [Authentication](authentication.md); for getting the binary or container running in the first place, see [Installation](installation.md).

---

## All variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `JITPACK_LISTEN` | no | `:8080` | Address the HTTP server binds to, in Go's `host:port` form. `:8080` listens on every interface; `127.0.0.1:8080` restricts it to loopback, which is what you want behind a reverse proxy. |
| `JITPACK_DB_PATH` | no | `jitpack.db` | Path to the embedded SQLite database file. Created if it does not exist. The default is **relative to the working directory** — always set an absolute path in a container or systemd unit. |
| `JITPACK_SINGLE_USER` | no | `false` | The literal string `true` selects [Single-User Mode](authentication.md#single-user-mode). Any other value — including `1`, `TRUE` and `yes` — leaves the server in multi-user mode. |
| `JITPACK_LOCAL_USER_ID` | in single-user mode | — | The user id every request is attributed to in Single-User Mode. The row is seeded at startup so trip and membership foreign keys resolve. Ignored in multi-user mode. |
| `JITPACK_SESSION_SECRET` | in multi-user mode | — | HMAC key signing the HS256 session tokens JIT-Pack issues for its own API. See [Generating the session secret](#generating-the-session-secret). Ignored in single-user mode. |
| `JITPACK_OIDC_ISSUER` | with OIDC | — | Your identity provider's issuer URL, e.g. `https://auth.example.com`. Every other endpoint is discovered from it. Must match the IdP's advertised issuer **exactly** — see [The issuer string must match exactly](#the-issuer-string-must-match-exactly). |
| `JITPACK_OIDC_CLIENT_ID` | with OIDC | — | The client id registered for JIT-Pack at the IdP. |
| `JITPACK_OIDC_CLIENT_SECRET` | with OIDC | — | The client secret. JIT-Pack is a confidential client — the secret stays server-side and is never handed to the app. |
| `JITPACK_ADMIN_EMAILS` | no | — | Comma-separated e-mail addresses that hold the instance-admin role, matched case-insensitively against the **verified** address the IdP reports. See [Instance admins](#instance-admins). |
| `JITPACK_PUSH_CONTACT` | no | — | Operator contact for Web Push, used as the VAPID `sub` claim shown to push services, e.g. `mailto:ops@example.com`. The VAPID keypair itself is generated and persisted on first use — there is nothing else to configure. |

Trailing slashes on `JITPACK_OIDC_ISSUER` are stripped before use, so `https://auth.example.com/` and `https://auth.example.com` are equivalent.

---

## Valid combinations

The server runs in one of three shapes, selected purely by which variables you set. `LoadConfig` rejects anything else before the database is even opened.

### Single-user

```bash
JITPACK_SINGLE_USER=true \
JITPACK_LOCAL_USER_ID=andy \
JITPACK_DB_PATH=/data/jitpack.db \
  jitpackd
```

`JITPACK_LOCAL_USER_ID` is the only additional requirement. `JITPACK_SESSION_SECRET` and the OIDC variables are not read at all in this mode — no session is ever issued, because no request is ever authenticated. Everything else about this mode, including what it means for exposure, is in [Authentication → Single-User Mode](authentication.md#single-user-mode).

### Multi-user with OIDC (the production shape)

```bash
JITPACK_SESSION_SECRET=$(openssl rand -hex 32) \
JITPACK_OIDC_ISSUER=https://auth.example.com \
JITPACK_OIDC_CLIENT_ID=jitpack \
JITPACK_OIDC_CLIENT_SECRET=… \
JITPACK_ADMIN_EMAILS=you@example.com \
JITPACK_DB_PATH=/data/jitpack.db \
  jitpackd
```

The three `JITPACK_OIDC_*` variables are **set together or not at all** — setting one or two of them is a startup error. With all three present, the server fetches the discovery document, loads the JWKS, and enables the login broker. The matching IdP client configuration is in [Authentication → Setting up Authelia](authentication.md#setting-up-authelia).

### Multi-user without OIDC

Leaving all three OIDC variables empty while setting `JITPACK_SESSION_SECRET` is valid and starts the server with authentication enabled but **no login flow**: it accepts HS256 tokens minted elsewhere with the same secret, and `GET /api/v1/auth/config` answers `501 not_configured` so the app offers no sign-in button.

!!! warning "Not a production configuration"
    Without the broker there is no login, no account provisioning and no way to earn the instance-admin role from `JITPACK_ADMIN_EMAILS` — anyone holding a token signed with the session secret is whichever user its `sub` names. This shape exists for tests and scripted deployments. Run either Single-User Mode or the OIDC shape instead.

---

## What fails fast at startup

`jitpackd` exits non-zero on any of these rather than starting in a half-configured state. The message is written to the log with the prefix shown.

| Condition | Message |
|---|---|
| Single-user mode without a local user id | `config: JITPACK_LOCAL_USER_ID is required in single-user mode` |
| Multi-user mode without a session secret | `config: JITPACK_SESSION_SECRET is required in multi-user mode (it signs the sessions JIT-Pack issues, see ADR-007)` |
| One or two of the three OIDC variables set | `config: JITPACK_OIDC_ISSUER, JITPACK_OIDC_CLIENT_ID, and JITPACK_OIDC_CLIENT_SECRET must be set together` |
| The database file cannot be opened or migrated | `store: …` |
| Discovery document unreachable, non-200, or unparseable | `oidc discovery: fetch OIDC discovery: …` |
| Discovery document's `issuer` differs from the configured one | `oidc discovery: OIDC discovery issuer mismatch: document says "…", configured "…"` |
| Discovery document missing an endpoint JIT-Pack needs | `oidc discovery: OIDC discovery document lacks authorization_endpoint` (likewise `token_endpoint`, `jwks_uri`, `userinfo_endpoint`) |
| The IdP's JWKS cannot be fetched at startup | `jwks: initial JWKS fetch: …` |

The last four mean the server will not start while your IdP is down or misconfigured. That is deliberate: a broker that came up without a verified issuer would accept logins it cannot validate. Note the asymmetry with runtime — once running, an IdP outage does **not** log anyone out; see [Authentication → An IdP outage is not a logout](authentication.md#an-idp-outage-is-not-a-logout).

A successful start logs which shape it picked, so the first line after a restart tells you what you actually got:

```
starting in single-user mode (user=andy)
starting in multi-user mode (OIDC broker: https://auth.example.com)
starting in multi-user mode (externally minted session tokens)
```

---

## Generating the session secret

`JITPACK_SESSION_SECRET` is used verbatim as the HMAC key for the access tokens JIT-Pack signs. Generate 32 random bytes:

```bash
openssl rand -hex 32
```

- **No minimum length is enforced.** A short or guessable value is accepted at startup and lets anyone forge a token for any user id, so treat it exactly like a password — from your secret store, never in the compose file.
- **Changing it invalidates every issued access token immediately.** Refresh tokens are unaffected (they are random strings stored as SHA-256 hashes, not signatures), so clients recover on their next refresh rather than being logged out.
- It signs *JIT-Pack's own* tokens only. It is unrelated to `JITPACK_OIDC_CLIENT_SECRET`, and there is nothing to share with the IdP.

---

## The issuer string must match exactly

At startup the broker fetches `{JITPACK_OIDC_ISSUER}/.well-known/openid-configuration` and compares the document's own `issuer` field against what you configured. On any difference it refuses to boot:

```
oidc discovery: OIDC discovery issuer mismatch: document says "https://auth.example.com", configured "https://auth.example.com:443"
```

This is a byte-for-byte string comparison, not a URL equivalence check, so all of these are mismatches even though they reach the same server: a different scheme, an explicit default port, a differing host case, or an extra path segment. Only a trailing slash is forgiven, because it is stripped first.

Take the value from the IdP itself rather than typing what you think it should be:

```bash
curl -s https://auth.example.com/.well-known/openid-configuration | jq -r .issuer
```

!!! warning "The mismatch check is what makes login trustworthy"
    The same string is later required as the `iss` claim of every ID token the broker validates. If the check could be relaxed, a misrouted URL would silently wire the broker to a different identity provider and it would still appear to work. When the check fires, fix the configured value — there is no way to skip it.

---

## Instance admins

`JITPACK_ADMIN_EMAILS` is the declarative allowlist of instance admins:

```bash
JITPACK_ADMIN_EMAILS="you@example.com, ops@example.com"
```

Entries are split on commas, trimmed, and matched case-insensitively. The address it is matched against is the one the IdP's UserInfo endpoint reports **and asserts as verified** — an unverified address never earns the role. The list is authoritative in both directions: removing an address revokes the role at that user's next login or token refresh.

Because the match happens inside the OIDC login broker, this variable only does anything in the OIDC shape. In Single-User Mode the implicit user is the only user; in the externally-minted-token shape no address is ever reported, so no role is ever stamped.

The exact timing, and the one case where the role is deliberately left untouched, are covered in [Authentication → Instance admins](authentication.md#instance-admins). What admins can actually do is in [User Management](user-management.md).

---

## How long a row stays reserved

Nothing to configure: a reservation lasts until a person ends it. What that means for a household, and how somebody else takes a row over, is in [Multi-user setup → Two people, one row](multi-user-setup.md#6-two-people-one-row).

---

## Request timeouts

Not configurable, listed here so you can size a reverse proxy against them: the HTTP server uses a 10-second read timeout, a 30-second write timeout and a 60-second idle timeout. Outbound calls to the IdP's token and UserInfo endpoints each have their own 10-second timeout.

Session lifetimes are likewise constants rather than configuration — 15 minutes for an access token, 90 days sliding for a refresh chain. See [Authentication → How a session works](authentication.md#how-a-session-works).
