# Troubleshooting

Failure modes you are likely to hit on a real deployment, symptom first. Every API error
comes back in the same envelope, so the `code` is what you match on:

```json
{"error":{"code":"idp_unreachable","message":"IdP token endpoint unreachable"}}
```

## The server will not start

The binary fails fast on a configuration or startup problem rather than serving a
half-working instance. Check the very first lines of the log.

### `config: JITPACK_SESSION_SECRET is required in multi-user mode`

The secret that signs JIT-Pack's own session tokens is missing. It is required in
multi-user mode whether or not you use OIDC. Related startup refusals from the same check:

- `config: JITPACK_LOCAL_USER_ID is required in single-user mode`
- `config: JITPACK_OIDC_ISSUER, JITPACK_OIDC_CLIENT_ID, and JITPACK_OIDC_CLIENT_SECRET must be set together`
  — the three OIDC variables are all-or-nothing. Setting one or two is treated as a
  mistake, not as "OIDC off".

See [Configuration](configuration.md) for the full variable list.

### `oidc discovery: fetch OIDC discovery: …`

At startup the server fetches `{issuer}/.well-known/openid-configuration`; the issuer is
the only IdP endpoint you configure, and everything else is discovered from that document.
If that fetch fails, the server exits. The variants tell you which part broke:

| Log message | Cause |
|---|---|
| `fetch OIDC discovery: Get "…": dial tcp …` | the IdP is unreachable **from the server**. Inside Docker this is usually DNS or a network the container is not on, not a firewall on your laptop. |
| `fetch OIDC discovery: https://auth.example.com returned 404` | the issuer URL is wrong, or a reverse proxy in front of the IdP is not routing `/.well-known/`. |
| `parse OIDC discovery: …` | the URL answered with something that is not the JSON discovery document — typically a login page or a proxy error page. |
| `OIDC discovery issuer mismatch: document says "https://auth.example.com" configured "https://auth.example.com/"` | the string does not match **exactly**. |
| `OIDC discovery document lacks userinfo_endpoint` | the IdP does not advertise an endpoint the broker needs (`authorization_endpoint`, `token_endpoint`, `jwks_uri`, `userinfo_endpoint`). |

The issuer mismatch is the one that catches people out: the OIDC Discovery spec makes the
check mandatory, and it is what stops a misrouted URL from wiring the broker to the wrong
IdP. `JITPACK_OIDC_ISSUER` must be **byte-for-byte** the `issuer` value in the document —
same scheme, same host, no path you invented. A trailing slash is stripped from your
configured value before use, so `https://auth.example.com/` and `https://auth.example.com`
are equivalent, but nothing else is normalised. Fetch the document yourself and compare:

```bash
curl -s https://auth.example.com/.well-known/openid-configuration | jq -r .issuer
```

### `jwks: initial JWKS fetch: …`

The signing keys the broker needs to verify ID tokens could not be fetched from the
`jwks_uri` the discovery document advertised — for instance
`JWKS endpoint returned 503`. The IdP is up enough to serve discovery but not its keys, or
the advertised `jwks_uri` points somewhere the server cannot reach. Same fix as above:
make the URL resolvable from inside the server's network.

## Everything works, but nothing updates in real time

**Symptom:** logging in, loading trips, and saving changes all work, but a change made on
one device never appears on another until you reload the app.

**Cause:** your reverse proxy is not carrying the WebSocket connection. This one has
genuinely bitten a deployment, because of a detail that is easy to miss: the socket is
registered at **`GET /ws`** — at the root, *outside* the `/api/v1` prefix. A proxy rule
that forwards `/api` to the backend and nothing else leaves the app fully functional and
silently non-live.

The second half of the same cause is upgrade headers: even with `/ws` routed, the proxy
must pass `Upgrade` and `Connection` through and must not impose a short idle timeout that
kills an otherwise healthy socket.

**Fix:** route `/ws` to the backend and allow the WebSocket upgrade.
[Installation](installation.md) has working reverse-proxy configuration; the reference
Docker setup proxies `/api`, `/ws`, and `/health`.

To confirm the socket is the problem, watch for a `101 Switching Protocols` in your proxy
access log when the client connects. Browsers cannot set headers on a WebSocket dial, so
the client passes its token as a `?token=` query parameter instead — make sure your proxy
does not strip the query string.

On a **single-user instance** there is no token, and the client dials `/ws` with no query
string at all. An access-log line without `?token=` is correct there, not a stripped
parameter — so on such an instance, look at the routing and the upgrade headers rather
than at the query string.

## `502` with code `idp_unreachable`

**Symptom:** users are suddenly asked to log in again, or a refresh fails with:

```json
{"error":{"code":"idp_unreachable","message":"IdP token endpoint unreachable"}}
```

**Cause:** the identity provider is down or unreachable from the server. This is
**deliberate, and it is not a logout.** The session is left completely untouched: nothing
is rotated, nothing is deleted, and the *same* refresh token still works once the IdP is
back. Being offline is a normal state for a self-hosted stack, and destroying sessions
over it would be unrecoverable.

The classification is intentionally cautious: behind a reverse proxy, an IdP going down
usually does not produce a 5xx at all — the router disappears with the container and the
request lands on a catch-all error page answering `404` with HTML. Anything that is not a
recognisable OAuth error response is therefore read as an outage, not as a rejection.

**Fix:** bring the IdP back. Users retry and continue where they left off. The same code
appears with `IdP UserInfo endpoint unreachable` when the IdP's UserInfo endpoint is the
part that is down.

!!! warning "The same symptom can be a wrong client secret"
    If the IdP is demonstrably up and *every* user gets `idp_unreachable`, check the
    server log for:

    ```
    IdP refused the broker's client credentials — check JITPACK_OIDC_CLIENT_ID and JITPACK_OIDC_CLIENT_SECRET
    ```

    A credentials rejection is identical for every user, so it is treated as a deployment
    fault rather than a per-user logout — otherwise one wrong secret would permanently
    log out the whole instance. Nothing else surfaces it, which is why it is logged.

## `401` with message `IdP rejected the session`

**Symptom:** a refresh fails with `401` and the user has to log in again — and this time
it sticks.

**Cause:** the IdP explicitly disowned the grant with an `invalid_grant` error: the
refresh token was revoked, expired, or the login it belongs to is gone (the user logged
out at the IdP, or an admin revoked their sessions there). This is the *only* condition
that ends a brokered session, and the session row is deleted.

**Fix:** none needed — logging in again is the correct outcome.

## `403` with code `account_deactivated`

**Symptom:** every request from one user fails with:

```json
{"error":{"code":"account_deactivated","message":"account is deactivated"}}
```

**Cause:** the account was deactivated inside JIT-Pack. The check runs on every
authenticated request, so it applies immediately to tokens that were already issued. Login
and refresh are refused with the same code.

**Fix:** reactivate the account — no data was deleted. See
[User Management](user-management.md#deactivation-and-how-it-differs-from-disabling-at-the-idp).

## A user disabled at the IdP still has access

**Symptom:** you disabled or deleted someone at your identity provider, but they keep
using the app.

**Cause:** this is expected. JIT-Pack issues its **own** session tokens after login; the
IdP is consulted at login and at each refresh, not on every request. So an account
disabled at the IdP is cut off at refresh cadence rather than instantly.

**Fix:** deactivate the account in JIT-Pack as well — that takes effect on the very next
request. [Authentication](authentication.md) explains the session model and the exact
bound; [User Management](user-management.md) covers deactivation.

## An admin gets `403 forbidden` on `/api/v1/admin/*`

**Symptom:** an address listed in `JITPACK_ADMIN_EMAILS` is refused:

```json
{"error":{"code":"forbidden","message":"instance admin role required"}}
```

**Causes, in the order worth checking:**

1. **The IdP does not assert `email_verified`.** The role is granted only against an
   address the IdP says it has *verified*. An unverified or absent `email_verified` claim
   means no role, silently. Confirm the claim is in the UserInfo response and is `true`.
2. **The account has not logged in since you changed the variable.** The role is stamped
   at login and at refresh, never retroactively.
3. **The `email` claim is not in UserInfo at all.** Then the stamp is skipped entirely and
   whatever was stored stays — which also means a *revocation* will not land.
4. **A typo, or the wrong address.** Matching is case-insensitive but otherwise exact.

Check what the server actually stored with `GET /api/v1/admin/users` (from an account that
does have the role) or `GET /api/v1/me`, and see
[User Management](user-management.md#instance-admins).

## `409` with code `admin_undeactivatable`

**Symptom:** deactivating a user returns `409`.

**Cause:** the target holds the instance-admin role, which is declarative — deactivating
them would leave the environment and the database disagreeing.

**Fix:** remove the address from `JITPACK_ADMIN_EMAILS`, restart, let that account log in
or refresh once so the role clears, then deactivate. The full procedure is in
[User Management](user-management.md#deactivating-an-instance-admin).

## `501` with code `not_configured`

**Symptom:** `/api/v1/auth/config`, `/api/v1/auth/token`, or `/api/v1/auth/refresh`
answers `501`:

```json
{"error":{"code":"not_configured","message":"OIDC login is not configured"}}
```

**Cause:** the OIDC broker is not enabled on this instance. In **single-user mode** this
is normal and expected — the client probes `/api/v1/auth/config`, sees `501`, and skips
the login screen entirely. In multi-user mode it means the three `JITPACK_OIDC_*`
variables are unset, and the server is only accepting externally minted session tokens.

**Fix:** if you meant to have logins, set the OIDC variables (see
[Configuration](configuration.md)) and restart.

## `502` with code `idp_error` on login

```json
{"error":{"code":"idp_error","message":"IdP returned no id_token — is the openid scope configured for this client?"}}
```

**Cause:** the token exchange succeeded, but the IdP returned no ID token — almost always
because the `openid` scope is not configured for this client at the IdP.

**Fix:** add the `openid` scope (and `profile`/`email`, which the broker needs for identity
and the admin role) to the client registration.

## `401 unauthorized` on login with an identity-shaped message

| Message | Cause |
|---|---|
| `ID token failed verification` | signature, issuer, or audience did not check out. The audience must be the client id you configured; the issuer must be the configured one; the signing key must be in the IdP's advertised JWKS. Rotating IdP keys and a stale JWKS cache can also produce this transiently. |
| `ID token has no subject` | the IdP issued a token without a `sub` claim. |
| `UserInfo subject does not match ID token` | the UserInfo response describes a different subject than the ID token — the check that defends against a swapped-in access token. |
| `IdP rejected the request` | the IdP refused the authorization code exchange, e.g. a reused or expired code, or a `redirect_uri` that does not match the registration. |

## `401 unauthorized` on ordinary API calls

| Message | Cause |
|---|---|
| `missing bearer token` | no `Authorization: Bearer …` header. On the WebSocket route a `?token=` query parameter is accepted instead — check your proxy is not stripping it. |
| `invalid token` | the token is malformed, signed with a different secret, or **expired**. Access tokens are short-lived by design (15 minutes); the client is expected to refresh. If *every* client is stuck here after a restart, check that `JITPACK_SESSION_SECRET` did not change — rotating it invalidates every issued access token. |
| `token has no subject` | an externally minted token without a `sub` claim. |
| `unknown or expired session` | the refresh token is not on file. Either it was already used (they rotate on every refresh — a replay looks exactly like this), or the refresh chain hit its absolute 90-day bound. |

## `403 forbidden` with `not a member of this trip`

**Cause:** the account is not a member of the trip it is trying to sync, read conflicts
for, or export. Membership is enforced server-side on every trip-scoped route.

**Fix:** add them to the trip. Note that the WebSocket subscribe for a trip is checked the
same way — a non-member's subscription is silently ignored rather than erroring, so
"another user sees no live updates for one specific trip" is usually a missing membership,
not a proxy problem.

## `404` with code `trip_not_found` on CSV export

**Cause:** the CSV export reports any failure to build the export as `trip_not_found`.
Usually the trip id really is wrong. If the id is definitely right, look in the server log
for the underlying database error.

## `422` with code `validation`

Input the server refused. The message names the limit:

| Message | Limit |
|---|---|
| `avatar must be image/jpeg` / `avatar exceeds 100 KB limit` | avatars are JPEG only, 100 KB maximum, enforced both in the handler and by a database constraint. |
| `item image must be image/jpeg` / `item image exceeds 150 KB limit` | item photos are JPEG only, 150 KB maximum. |
| `batch exceeds 200 mutations` | a sync push carries at most 200 mutations. |
| `limit must be 1..1000` | the sync pull page size. |
| `limit must be 1..200` | the notifications page size. |
| `cursor must be an integer` | a malformed sync cursor. |
| `expected kind: trip` / `expected kind: template` | the imported YAML document's `kind` does not match the endpoint. See [Backup & Export](backup.md#template-export-and-import). |
| `malformed push envelope` / `malformed request body` / `malformed prefs body` | the request body is not the JSON the endpoint expects. |

## `500` with code `internal`

Something failed server-side — the message is deliberately generic on the wire
(`pull failed`, `export failed`, `user provisioning failed`, and so on). The real error is
in the server log. If it involves the database, check that the disk holding
`JITPACK_DB_PATH` is not full and that the file is writable by the server's user; a
read-only volume mount is a common cause after a deployment change.
