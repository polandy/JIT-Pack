# ADR-007: First-Party Sessions Brokered from the IdP

**Status:** Accepted (2026-08-08, owner decision: "JIT-Pack targets Authelia; where Authelia prescribes something, JIT-Pack conforms")
**Related:** ADR-004 (OIDC+PKCE with Single-User bypass — untouched by this decision), Sync-API §2, FR-23.1/23.3, NFR-4.4, PRD Section 2

**Context.** Until this decision, the server brokered the OIDC code exchange but then *passed the IdP token set through* to the client and validated the IdP **access token** on every request, reading identity claims (`sub`, `email`) out of it. The reference IdP, Authelia, explicitly documents that this is wrong: its access tokens are opaque by default (a JWT requires the client option `access_token_signed_response_alg`), carry no identity claims unless a claims policy copies them in, and their `aud` is the introspection endpoint — not the application — so the client "is not the intended recipient and should not use it to validate the identity of a user". Against the owner's real Authelia deployment (opaque tokens, no claims policy) the flow could never have worked. The audit also found the ID token — the credential actually minted for this application — arrived in every token response and was discarded unread.

**Decision drivers (in priority order):**
1. Conformance with what Authelia prescribes (owner directive): identity from ID token/UserInfo, only `iss`+`sub` stable, access tokens opaque.
2. No per-request IdP round-trip — the sync loop authenticates ~29 endpoints and must work at LAN latency budgets (owner rejected introspection for this reason).
3. Revocation must be meaningful: JIT-Pack-side deactivation (FR-23.3) immediately, IdP-side logout/disable within a bounded window.
4. Zero client-contract churn where possible; Single-User and Local Mode untouched (invariant 5).

---

## Considered Options

### Option A — Keep pass-through, require JWT access tokens (`access_token_signed_response_alg: RS256`)

Smallest diff: keep validating the access token per request, add `iss`/`client_id` checks, require the operator to switch Authelia to JWT access tokens plus a claims policy.

* Pros: least code; stateless; no new table.
* Cons: contradicts driver 1 twice over — it keeps reading identity from the access token *and* forces a non-default, Authelia-discouraged client configuration (JWTs are "very hard to revoke", their words). Requires a claims policy just to see `email`. `aud` still does not distinguish applications, so the check has to lean on the RFC 9068 `client_id` claim.

### Option B — Introspection (RFC 7662) per request

Opaque tokens kept; every request validated against Authelia's introspection endpoint (with caching).

* Pros: strictest conformance; IdP-side revocation is instantaneous.
* Cons: a network dependency in the hot path of an offline-first sync app; the owner explicitly rejected per-request IdP round-trips. Caching to make it bearable reintroduces exactly the revocation window it was chosen to avoid.

### Option C — First-party sessions *(accepted)*

The broker exchanges the code as a **confidential client**, validates the **ID token** (signature via discovered JWKS, `iss`, `aud` = client id — the one token whose audience *is* this application), reads identity from **UserInfo**, JIT-provisions, and issues JIT-Pack's own tokens: a 15-minute HS256 access token (`sub` = `users.id`) plus a rotating single-use refresh token (SHA-256 hash stored in `sessions`, migration 017). Each refresh replays the stored IdP refresh token against Authelia — rejection ends the session, outage does not — and re-reads UserInfo to re-stamp FR-23.1. A rejection is only an RFC 6749 §5.2 `invalid_grant` error response; any other answer — network failure, 5xx, a proxy's error page while the IdP's route is down, or a non-`invalid_grant` OAuth error such as `invalid_client` (a deployment fault common to every user) — is treated as an outage and leaves the session intact.

* Pros: exactly how Authelia expects applications to behave (the owner's other clients — Paperless etc. — run this shape with `access_token_signed_response_alg: "none"`); no per-request network I/O; per-request identity mapping and DB writes disappear from `authed`; cross-app token replay is structurally impossible after login because the per-request credential is issued by JIT-Pack itself; refresh rotation detects token theft.
* Cons: JIT-Pack becomes a session issuer (secret management via `JITPACK_SESSION_SECRET`, a new table, ~200 lines of broker logic); an IdP-side logout propagates at refresh cadence (≤15 min for active clients), not instantly.

## Decision matrix (weights per drivers above)

| Criterion (weight) | A: JWT access tokens | B: Introspection | C: First-party sessions |
|---|---|---|---|
| Authelia conformance (3) | 1 | 3 | 3 |
| Per-request cost (3) | 3 | 1 | 3 |
| Revocation semantics (2) | 1 | 3 | 2 |
| Config simplicity at IdP (1) | 1 | 2 | 3 |
| Code footprint (1) | 3 | 2 | 1 |
| **Weighted total** | **18** | **22** | **28** |

## Decision

**Option C.** HS256 with a single configured secret rather than an RSA keypair: one binary, one verifier, no key distribution problem to solve. Session lifetimes are constants in `internal/api/auth.go` (15 min access / 90 d sliding refresh, NFR-4.4), not configuration — no knob until someone needs one.

## Consequences

1. **Config**: `JITPACK_SESSION_SECRET` is required in multi-user mode; the OIDC group collapses to `JITPACK_OIDC_ISSUER` + `JITPACK_OIDC_CLIENT_ID` + `JITPACK_OIDC_CLIENT_SECRET` (endpoints via discovery, which also removes the never-configured UserInfo URL gap). `JITPACK_JWT_SECRET`, `JITPACK_JWKS_URL`, `JITPACK_OIDC_TOKEN_URL`, `JITPACK_OIDC_AUTHORIZE_URL` are gone — a clean break, decided over compatibility shims.
2. **Authelia client config is the stock confidential-client shape**: `public: false`, `client_secret`, `token_endpoint_auth_method: client_secret_basic`, `access_token_signed_response_alg: "none"`, `userinfo_signed_response_alg: "none"`, scopes `openid profile email offline_access`, grant types `authorization_code` + `refresh_token`, PKCE kept.
3. **The wire contract of `/auth/token`, `/auth/refresh`, `/auth/config` is unchanged in shape** (`access_token`/`refresh_token`/`expires_in`), so the client needed no changes; `expires_in` dropped from the IdP's 3600 to 900, which the existing proactive-refresh logic absorbs.
4. `authed` no longer maps subjects or stamps identity per request — sessions carry `users.id` directly; the per-request work is signature check + FR-23.3 deactivation lookup.
5. Client-side logout still just discards tokens; the orphaned session row dies at its absolute expiry or the next purge. Acceptable at this scale — a logout endpoint is cheap to add if that changes.
6. On refresh, the UserInfo re-stamp is best-effort *after* the IdP has vouched for the account: failing the refresh over a UserInfo blip would discard the just-rotated (single-use) IdP refresh token and force a logout. Because it is best-effort, it may only ever *add* information: a response without an email claim resolves the FR-23.1 role to unknown and leaves the stored flag alone. Authelia serves exactly that shape — 200 with the standard claims stripped — for an account disabled after its token was issued, and reading the gap as "not an admin" silently demoted instance admins with no error raised.

**Revisit trigger:** a requirement for instantaneous IdP-side revocation (reopens Option B as a complement, e.g. introspection at WebSocket dial), or a deployment class where a 15-minute access window is too long.
