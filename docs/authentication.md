# Authentication

JIT-Pack ships as one artifact that runs in three modes. Which one you get is decided partly by the server you run and partly by the app you point at it, and mixing those two up is the single most common source of confusion — so start here before setting any variable.

Everything on this page describes server behaviour. The variables themselves are documented in [Configuration](configuration.md).

---

## The three modes

### Local Mode

**No server at all.** The app keeps every trip, list and template in the browser's own storage and never talks to a backend. Template instantiation, quantity formulas, dependencies, analytics and import/export all run inside the client, so nothing is lost by staying local — what you give up is collaboration, sync across devices, and anything else that needs a second party.

You select this in the app when you first open it; there is nothing to configure and nothing to install. Server-only screens are hidden rather than shown broken.

### Single-User Mode

**A server-side configuration, not a client choice.** You run `jitpackd` with:

```bash
JITPACK_SINGLE_USER=true
JITPACK_LOCAL_USER_ID=andy
```

The server is then built along a different path entirely: authentication and trip-membership checks are **bypassed**, and every request is attributed to `JITPACK_LOCAL_USER_ID`. No `Authorization` header is required, none is read, and the implicit user is automatically the owner of every trip. `GET /api/v1/auth/config` answers `501 not_configured`, and the app — running in its ordinary server mode — discovers there is no login by being offered none.

This is the mode for a household instance behind your own network: you get sync across your devices and a real backend, without running an identity provider.

!!! warning "Anyone who can reach the port is that user"
    There is no credential to get wrong in Single-User Mode, which also means there is nothing standing between the network and your data. Bind it to loopback and put a reverse proxy with its own authentication in front, or keep it on a trusted network. Do not expose it to the internet.

This is a startup-time choice, never a per-request toggle — there is exactly one constructor path per mode. Switching modes means restarting with different variables.

### Multi-user with OIDC

The production shape: your identity provider handles the login, `jitpackd` brokers it, and each user gets their own account, their own trips, and membership-checked access to shared ones. Set the session secret and the three OIDC variables, and the rest of this page applies.

There is also a fourth, deliberately unadvertised shape — multi-user with a session secret but **no** OIDC variables — which accepts externally minted tokens and offers no login. It exists for tests and scripted deployments; see [Configuration → Multi-user without OIDC](configuration.md#multi-user-without-oidc).

---

## Setting up Authelia

[Authelia](https://www.authelia.com/) is JIT-Pack's reference identity provider: where Authelia prescribes something, JIT-Pack conforms to it. Any spec-compliant OIDC provider that supports PKCE and refresh tokens should work, but Authelia is what the flow is verified against.

Register JIT-Pack as a confidential client. This block is ready to paste into `identity_providers.oidc.clients`:

```yaml
- client_id: "jitpack"
  client_secret: "..."                       # the hashed form Authelia expects
  public: false
  authorization_policy: "two_factor"
  require_pkce: true
  pkce_challenge_method: "S256"
  redirect_uris:
    - https://jitpack.example.com/auth/callback
  scopes: ["openid", "profile", "email", "offline_access"]
  response_types: ["code"]
  grant_types: ["authorization_code", "refresh_token"]
  access_token_signed_response_alg: "none"
  userinfo_signed_response_alg: "none"
  token_endpoint_auth_method: "client_secret_basic"
```

Then point the server at it:

```bash
JITPACK_OIDC_ISSUER=https://auth.example.com
JITPACK_OIDC_CLIENT_ID=jitpack
JITPACK_OIDC_CLIENT_SECRET=…            # the plaintext secret, matching the hash above
```

Only the issuer is configured. The authorization, token, UserInfo and JWKS endpoints all come from `{issuer}/.well-known/openid-configuration` at startup — and the issuer string in that document must match yours exactly, or the server refuses to boot. See [The issuer string must match exactly](configuration.md#the-issuer-string-must-match-exactly).

### Why each non-default option is there

- **`public: false` and `client_secret`** — the code exchange happens on the server, not in the browser, so JIT-Pack is a confidential client and the secret never leaves the host.
- **`require_pkce: true` with `pkce_challenge_method: "S256"`** — the app generates the PKCE verifier and sends the S256 challenge to the IdP; the verifier reaches the broker only at the exchange. Requiring it at the IdP means a stolen authorization code is worthless on its own.
- **`offline_access` plus the `refresh_token` grant** — JIT-Pack stores the IdP's refresh token server-side and replays it once per session refresh. Without them there is no refresh grant, so the IdP could never be re-consulted after login and revocation would have no path to take effect. This is also what lets a session survive the offline periods an offline-first app is built for.
- **`access_token_signed_response_alg: "none"`** — the IdP's access token stays opaque. **This is correct, not a workaround:** JIT-Pack never parses it and never reads identity out of it. The token is used for exactly one UserInfo call per exchange and never leaves the broker. Authelia is explicit that an application is not the intended recipient of its access tokens; asking for JWT access tokens here would be the misconfiguration.
- **`userinfo_signed_response_alg: "none"`** — the broker reads UserInfo as plain JSON.
- **`token_endpoint_auth_method: "client_secret_basic"`** — the broker authenticates with HTTP Basic on the token endpoint, Authelia's default for confidential clients.
- **`redirect_uris` ending in `/auth/callback`** — that path is the app's own callback route, on the app's origin. Use the address users actually open JIT-Pack at, `https://` included. A mismatch here is rejected by the IdP before JIT-Pack is ever reached.

The `email` scope is not cosmetic: the verified address it yields is what the [instance-admin allowlist](#instance-admins) matches against.

---

## How a session works

JIT-Pack does not pass the IdP's tokens through to the app. It brokers the login and then issues its **own** session, which is what every subsequent request is authenticated with.

1. The app generates PKCE material and redirects to the IdP's authorization endpoint, using the `authorize_url` and `client_id` it read from `GET /api/v1/auth/config`.
2. After you log in, the IdP redirects back to `/auth/callback` with a code. The app posts the code, the PKCE verifier and the redirect URI to `POST /api/v1/auth/token`.
3. The broker exchanges them at the token endpoint as a confidential client.
4. It **validates the ID token** — RS256 signature against the discovered JWKS, `iss` equal to the configured issuer, `aud` equal to the client id. The ID token is the one credential minted for this application.
5. It reads identity from the **UserInfo** endpoint and checks that its `sub` matches the ID token's, then JIT-provisions or updates the user row.
6. It issues a **15-minute HS256 access token** (signed with `JITPACK_SESSION_SECRET`, carrying the JIT-Pack user id) and a **rotating single-use refresh token** — a random 256-bit string of which only a SHA-256 hash is stored. The refresh chain has a 90-day absolute bound that slides at every rotation.

The IdP's token set never reaches the browser. Every ordinary API request is then a signature check plus a deactivation lookup — no network call to the IdP, which is what keeps the sync loop fast enough to be used at LAN latency.

`POST /api/v1/auth/refresh` exchanges the current refresh token for a new pair. Each refresh also replays the stored IdP refresh token, so the IdP gets to re-judge the account roughly every 15 minutes for an active client. A refresh token is single-use: presenting a consumed one answers `401 unauthorized`, which is also how a stolen-and-replayed token is caught.

Session lifetimes are constants, not configuration. Logging out in the app discards the tokens locally; the orphaned server-side session row expires on its own.

The full rationale, the options weighed against it, and the consequences are in [ADR-007 — First-Party Sessions Brokered from the IdP](https://github.com/polandy/JIT-Pack/blob/main/dev-docs/adr/ADR-007_Session_Brokering.md).

---

## What ends a session

Because each refresh replays the stored IdP refresh token, whatever Authelia rejects there ends the session within one access-token lifetime. What that does and does not cover is worth being precise about, because it decides how an account is actually shut out. All three cases below are verified against Authelia 4.39.20 with the file backend.

- **Ends the session at the next refresh:** revoking the token at Authelia (RFC 7009, `POST /api/oidc/revocation`), or an operator revoking the subject's OIDC sessions in Authelia's storage. Both make the refresh grant fail, which deletes the session row. In practice that is within 15 minutes for an active client.
- **Ends the session immediately, without waiting for a refresh:** deactivating the account in JIT-Pack itself. Deactivation is checked on every single request, so it is the only lever that bites on the current access token. See [User Management](user-management.md).
- **Does _not_ end the session:** marking the user `disabled` in Authelia. That blocks new logins, but Authelia keeps honouring refresh tokens it has already issued — per [Authelia ADR1](https://www.authelia.com/reference/architecture-decision-log/1/), authorization policies are evaluated during the Authorization Request and not in any subsequent flow.

- **Not a session at all:** an [API token](api-tokens.md) is a separate credential with its own lifetime, and nothing on this list touches it. Deactivating the account stops it like any other request; ending an IdP session does not.

!!! warning "Disabling an account in Authelia is not enough"
    On its own it stops future logins and nothing else — an already-signed-in client keeps refreshing indefinitely. Pair it with revoking the account's tokens at Authelia, or deactivate the account in JIT-Pack, which cuts access off on the next request.

---

## An IdP outage is not a logout

For an offline-first app, a session that dies whenever the identity provider hiccups would be worse than no session at all. The broker therefore separates two things that both look like "the token endpoint said no":

- **A genuine rejection** — an RFC 6749 error response, meaning HTTP 400 or 401 carrying a JSON body whose `error` is `invalid_grant`. This says something about *this user's* grant: the refresh token was revoked, expired, or never valid. Only this ends the session; the session row is deleted and the client is sent back to the login screen.
- **Everything else is treated as unreachable.** The session survives untouched, the refresh answers `502 idp_unreachable`, and the client retries later with the same refresh token — nothing has been rotated or consumed.

That second bucket deliberately includes the shapes an outage really takes. Behind a reverse proxy — the reference deployment — an IdP going down usually does **not** produce a 5xx: the proxy drops the route along with the container and the request lands on a catch-all error page, which answers **404 with HTML**. A `502` from a proxy with no healthy backend is the same story. Neither is an OAuth rejection, and neither logs anyone out.

Other OAuth error codes land in the same bucket on purpose. `invalid_client` in particular means the *broker's* credentials were refused — identical for every user, a deployment fault rather than a per-user judgement — so it is logged loudly instead of being acted on:

```
IdP refused the broker's client credentials — check JITPACK_OIDC_CLIENT_ID and JITPACK_OIDC_CLIENT_SECRET
```

The asymmetry is intentional. Mistaking a rejection for an outage costs a session row that lingers until it expires while the user is cut off anyway. Mistaking an outage for a rejection destroys every session on the instance, unrecoverably. So anything ambiguous resolves to "outage".

Note that this tolerance applies to a **running** server only. At startup the IdP must be reachable, because a broker that came up without a verified issuer and a loaded JWKS could not validate anything — see [What fails fast at startup](configuration.md#what-fails-fast-at-startup).

---

## Instance admins

Set `JITPACK_ADMIN_EMAILS` to a comma-separated list of addresses:

```bash
JITPACK_ADMIN_EMAILS="you@example.com, ops@example.com"
```

An account holds the instance-admin role when the address the IdP's UserInfo endpoint reports for it appears in that list. Two conditions apply:

- The match is **case-insensitive** on the address.
- The IdP must assert that it **verified** the address (`email_verified`). An absent or false flag counts as unverified and never earns the role. Without that check, any account on an IdP with self-service profiles could claim the configured admin address and inherit the role.

The list is **authoritative in both directions**. The role is stamped onto the user row at every login and re-stamped at every token refresh, so adding an address grants the role and removing one revokes it — at the next login or refresh, meaning within about 15 minutes for an active client. There is no in-app way to promote or demote anyone; the environment variable is the only source.

There is one deliberate exception. If UserInfo answers successfully but reports **no email claim at all**, the role is treated as *unknown* and the stored flag is left exactly as it stands — it is not read as "not an admin". Authelia serves precisely that shape (200 with the standard claims stripped) for an account disabled after its token was issued, and demoting on it would silently strip every instance admin at their next refresh, with no error raised and only a fresh login to recover. Revocation still works whenever the IdP does supply an address, which is the case the allowlist is about.

Admin-only endpoints reject non-admins with `403 forbidden` — the screens are never merely hidden. What the role unlocks is covered in [User Management](user-management.md).
