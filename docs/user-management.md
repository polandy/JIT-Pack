# User Management

This page covers administering accounts on a **multi-user instance** — the mode where
JIT-Pack brokers logins against your identity provider. In
[Single-User Mode](configuration.md) there is exactly one implicit account and none of
this applies.

## How accounts come into existence

There is no sign-up form, no invite flow, and no endpoint that creates a user. Accounts
are **provisioned just in time**: the first time someone completes an OIDC login, the
broker verifies the ID token, calls the IdP's UserInfo endpoint, and inserts a `users`
row keyed by the OIDC subject. From then on that subject always resolves to the same
account.

Identity is read from UserInfo, never from anything the client sends:

| Stored field | Source |
|---|---|
| Display name | the `name` claim, falling back to `preferred_username`, and to the OIDC subject if neither is present. Truncated to 50 characters. |
| E-mail | the `email` claim. An empty claim leaves the stored address untouched. |
| Instance-admin role | the `email` claim, matched against `JITPACK_ADMIN_EMAILS` — see below. |

Identity is re-read and re-stamped on **every login**, and again on every successful
token refresh, so a name or address changed at the IdP catches up on its own. See
[Authentication](authentication.md) for the login and refresh flow itself.

!!! note
    Users are outside both sync partitions and are deliberately excluded from the JSON
    export — identity belongs to the IdP, not to JIT-Pack. See [Backup & Export](backup.md).

## Instance admins

Who holds the instance-admin role is **declarative**. You set it with a comma-separated
environment variable and restart the server; there is no endpoint that grants or revokes
the role:

```bash
JITPACK_ADMIN_EMAILS="alice@example.com, bob@example.com"
```

Matching is case-insensitive, and the address must be one the IdP asserts it has
**verified** — the `email_verified` claim must be `true` (a JSON boolean or the string
`"true"`). OIDC gives the `email` claim no verification guarantee of its own, so without
that assertion any account on an IdP with self-service profiles could name your admin
address and inherit the role. An address that is present but unverified simply does not
get the role.

On startup the server logs how many addresses it loaded:

```
instance admins: 2 address(es) (FR-23.1)
```

The list is **authoritative in both directions**. The role is re-stamped from it at every
login and at every refresh, so removing an address revokes the role the next time that
account logs in or refreshes — you do not have to touch the database. Adding an address
works the same way.

!!! warning
    The stamp is skipped — the stored role is left exactly as it stands — when the IdP
    returns **no `email` claim at all**. "No information" must not read as "not an
    admin", or a degraded UserInfo response would silently demote every admin. If you
    remove an address to revoke a role, confirm the change took effect by checking
    `is_instance_admin` in the admin overview below.

## The admin endpoints

Every endpoint below sits behind bearer-token authentication **and** an instance-admin
check. A non-admin gets `403` with code `forbidden` and message
`instance admin role required` — the role is enforced at the endpoint, never merely
hidden in the UI.

| Method | Path | Returns |
|---|---|---|
| `GET` | `/api/v1/admin/users` | the account overview (below) |
| `POST` | `/api/v1/admin/users/{userID}/deactivate` | `{"ok":true}` |
| `POST` | `/api/v1/admin/users/{userID}/reactivate` | `{"ok":true}` |
| `DELETE` | `/api/v1/admin/users/{userID}/avatar` | `{"ok":true}` |
| `DELETE` | `/api/v1/admin/users/{userID}/display-name` | `{"ok":true}` |

Common error responses on the four actions:

| Status | Code | When |
|---|---|---|
| `404` | `not_found` | no user with that id |
| `409` | `admin_undeactivatable` | the target holds the instance-admin role |
| `403` | `forbidden` | the caller is not an instance admin |

### The account overview

```bash
curl -s https://jitpack.example.com/api/v1/admin/users \
  -H "Authorization: Bearer $TOKEN"
```

```json
{
  "users": [
    {
      "user_id": "6f1c…",
      "display_name": "Alice",
      "email": "alice@example.com",
      "created_at": "2026-03-02T09:14:11.021Z",
      "is_instance_admin": true,
      "deactivated_at": null,
      "trip_count": 4,
      "template_count": 2
    }
  ]
}
```

Every provisioned account is listed, ordered by display name. `deactivated_at` is `null`
for an active account and carries the UTC timestamp of the deactivation otherwise.
`trip_count` is the number of trips the account is a member of; `template_count` the
number of templates it owns. `email` is omitted when no address is stored.

### Deactivate and reactivate

```bash
curl -s -X POST https://jitpack.example.com/api/v1/admin/users/6f1c…/deactivate \
  -H "Authorization: Bearer $TOKEN"
```

Both calls are idempotent — deactivating an already-deactivated account succeeds.

### Reset a display name or an avatar

If someone sets an unacceptable display name or avatar, you can clear it without touching
their account otherwise:

```bash
curl -s -X DELETE https://jitpack.example.com/api/v1/admin/users/6f1c…/display-name \
  -H "Authorization: Bearer $TOKEN"
curl -s -X DELETE https://jitpack.example.com/api/v1/admin/users/6f1c…/avatar \
  -H "Authorization: Bearer $TOKEN"
```

Clearing the display name empties it; the IdP-provided name is stamped back in at that
account's next login. Clearing the avatar removes the stored image, and the user may
upload a new one.

### Endpoints every authenticated user may call

- `GET /api/v1/me` — your own `user_id`, `display_name`, and `is_instance_admin` flag.
- `GET /api/v1/users` — the instance's user directory (`user_id` and `display_name` only),
  which the sharing step needs so you have accounts to pick from. A self-hosted instance's
  roster is not treated as a secret from its own users.

## Deactivation, and how it differs from disabling at the IdP

Deactivating an account inside JIT-Pack **takes effect immediately**. Every authenticated
request re-checks the account's status, so the very next request made with an
already-issued access token fails:

```json
{"error":{"code":"account_deactivated","message":"account is deactivated"}}
```

with HTTP `403`. No token refresh has to happen first, and there is no window to wait out.
In addition:

- The app on the person's device ends its session at the next request and returns to the login
  screen, so they are told rather than left with an app that quietly stops syncing.
- The account's Web Push subscriptions are deleted, so it stops receiving push notifications.
- A **login** attempt is refused outright with the same `403 account_deactivated`, rather
  than issuing tokens every endpoint would reject anyway.
- A **refresh** attempt deletes the session row and answers `403 account_deactivated`.

**No data is deleted.** Trips, memberships, templates, comments, and packing history all
stay exactly as they are. Reactivating restores access with everything intact; the client
re-registers for Web Push on its next start.

!!! warning "Disabling the account at your IdP is not the same thing"
    Disabling a user at the IdP does **not** end a session that already exists — JIT-Pack
    issues its own session tokens after login, and the IdP is consulted only at login and
    at refresh. The account is cut off at refresh cadence, not instantly.
    [Authentication](authentication.md) explains why, and what the actual bound is. If you
    need someone off the instance **now**, deactivate them here as well.

### Deactivating an instance admin

You cannot. The request fails with `409` and code `admin_undeactivatable`:

```json
{"error":{"code":"admin_undeactivatable","message":"instance admins cannot be deactivated"}}
```

This keeps the environment and the database from disagreeing — an account that
`JITPACK_ADMIN_EMAILS` still names would have its admin role re-stamped at its next login
regardless. Do it in this order:

1. Remove the address from `JITPACK_ADMIN_EMAILS` and restart the server.
2. Let that account log in or refresh once, which clears its role.
3. Confirm `is_instance_admin` is now `false` in `GET /api/v1/admin/users`.
4. Deactivate it.

Since the role can only be dropped by a login or a refresh, an account that never comes
back keeps the flag — and stays undeactivatable. That is the trade-off of a declarative
role: nothing in the API can override the environment.
