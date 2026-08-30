# Concept — API tokens

**Status:** **implemented 2026-08-30.** Written and rewritten the same day, after the owner chose
the unmanaged variant. Kept as the reasoning behind FR-23.7 and ADR-039 — where the two differ, the
FR and the ADR are authoritative. The one question it ends on was answered: **90 days**.
**Asked for:** a token a person can create in the UI *and* on the command line, that is never
stored in plaintext and is shown exactly once.

---

## 1. What this is

**An API token is a JWT signed with the session secret, carrying a long expiry.** Nothing about it
is stored. It is created in Settings or by a `jitpackd` subcommand, shown once, and from then on it
exists only in the hands of whoever holds it.

The striking part, and the reason this concept is short: **the server already accepts such a
token.** `authed` (`internal/api/server.go:197`) trusts any HS256 JWT signed with
`JITPACK_SESSION_SECRET` whose `sub` is a `users.id`, and `cmd/jitpackd/main.go:57` even names the
mode on startup — *"multi-user mode (externally minted session tokens)"*. Anyone holding the secret
can mint a ten-year credential today, by hand.

**So this feature is not "long-lived credentials". It is a way to make one without hand-crafting a
JWT** — plus the small amount of hygiene that turns an undifferentiated session token into
something the server can recognise as a machine credential.

## 2. Decided: unmanaged, and what settled it

The alternative was a stored token — a table, three endpoints, a management screen — which buys
**listing** and **individual revocation**. It was rejected (owner, 2026-08-30) on two grounds:

**The kill switch is cheaper than it looks.** Rotating `JITPACK_SESSION_SECRET` invalidates every
API token at once. The assumption that this also throws everyone out of the app is **wrong, and was
measured**: refresh tokens are opaque random values stored hashed in `sessions`, not signed
(`internal/api/auth.go:157`). A secret rotation therefore only voids the 15-minute *access* tokens,
and every browser silently obtains a new one at its next refresh. (One caveat, in §6.)

**No table means no schema change.** A stored token would change `schema.sql`, change the
fingerprint, and force every database — development machines and the family instance — to be
deleted and rebuilt (invariant 2). That cost was accepted in an earlier round of this concept, but
not paying it at all is better.

## 3. What is given up — deliberately, and permanently

Stated plainly, because this is the half a future reader will come looking for:

* **You cannot list tokens.** Nobody can answer "what tokens exist for this instance?" — not an
  admin, not the maintainer, not the server. The set is unknowable by construction.
* **You cannot revoke one token.** Only *all* of them, by rotating the secret.
* **You cannot tell whether a token is still in use**, or when it was last used.
* **A token cannot be traced to its purpose after the fact.** It carries a `name` claim, but you can
  only read that from the token itself, which you no longer have.

Two properties keep the door open without paying for it now: a `jti` on every token, and a `kind`
claim. Adding a denylist — or the full stored-token table — later is additive and does not
invalidate tokens already issued.

## 4. The token

A plain JWT. It cannot carry a distinctive `jitpack_pat_` prefix, because a prefix would stop it
being a JWT; the `kind` claim is the marker instead.

```json
{
  "sub":  "<users.id>",
  "kind": "api",
  "jti":  "<16 random hex>",
  "name": "cleanup script",
  "iat":  1788100000,
  "exp":  1795876000
}
```

**A JWT payload is base64, not encryption — anyone holding the token can read every claim.** So the
`name` is visible to whoever holds it, which is fine, and is the reason nothing else goes in there.

| Claim | Why it is there |
|---|---|
| `sub` | the person; unchanged from a session token, so a token is the person (invariant 3) |
| `kind` | lets `authed` tell a machine credential from a browser session — for logging, and for any future rule that wants to treat them differently. Session tokens keep no `kind`, so the absence is the session case |
| `jti` | costs nothing today and is what a later denylist would key on |
| `name` | what the person called it, readable when they still hold it |
| `exp` | the **only** thing that ever ends this token's life on its own. See §11 |

## 5. Creating one

### The single endpoint

The browser does not hold the session secret, so minting stays server-side:

| Route | Answers |
|---|---|
| `POST /api/v1/me/tokens` | `{token, expires_at}` — **the only response in the system that carries it** |

There is no `GET` and no `DELETE`, and their absence is the design, not an omission. Declared in
`internal/api/wire.go` and generated into the client like every other route (NFR-4.14, ADR-026/027).

### The screen (M17)

A small *API-Token* block in Settings, between **Data** and **Hidden master data**. It is a form,
not a list: a name, an expiry, a button — and then the token, once, in a copyable field.

Three things the surface has to say, because nothing else will:

1. **It will not be shown again.** The dialog's default action is *Copy*, not *Close* (G-16), so it
   cannot be dismissed by reflex.
2. **It cannot be revoked individually.** A person creating a credential deserves to know that
   before they paste it into something, not when they need it gone.
3. **How to kill everything**, in one sentence pointing at the `docs/` page (§6).

### The command line

```
jitpackd token create --user <email|id> --name cleanup --expires 90d
```

Why a `jitpackd` subcommand rather than a Node tool beside `dist-cli/jitpack-import.mjs`: minting
needs the **session secret**, which the server process already has and a client never should. It
also works when the IdP is the thing that is broken.

It reads the database once, to resolve the user and to refuse an id that does not exist (§7). That
keeps `cmd/jitpackd` "wiring only": flag parsing and printing here, the lookup in `internal/store`.

**One safety property to design in:** the secret goes to stdout, which is exactly where a shell
history or a CI log will capture it. The subcommand should refuse to run when stdout is not a
terminal unless `--print-secret` is passed, so piping it somewhere is a decision rather than an
accident.

## 6. The kill switch, and its one caveat

Revoking everything is: change `JITPACK_SESSION_SECRET`, restart. Every API token dies with it.

**Browsers recover by themselves — but only where OIDC is configured.** `handleAuthRefresh` answers
`501 not_configured` when `s.oidc == nil` (`internal/api/auth.go:145`), so on an instance running in
the "externally minted session tokens" mode there is no refresh path at all, and rotating the secret
*does* log everyone out. The family instance runs OIDC against Authelia, so this is the comfortable
case there — but the `docs/` page has to state both, because the operator reading it may not be on
the comfortable one.

This procedure is the whole revocation story. It belongs in `docs/`, written out step by step, next
to *Cleaning Up Master Data*.

## 7. One hole to close before this ships

`UserDeactivated` returns `false` for an id it cannot find (`internal/store/admin.go:121`) — "not
deactivated" is the honest answer to "no such row", and `authed` treats it as a pass. **A token
whose `sub` names a user who does not exist therefore authenticates today.**

With 15-minute session tokens this is nearly unreachable. With a credential that lives for a year it
is not: a token outlives the account it was made for.

The fix is small — `authed` should establish that the account *exists* and is active, not merely
that it is not deactivated — but it is a change to the shared authentication path, so it needs its
own test on the session path as well. It is listed here because this feature is what makes it
matter.

## 8. Invariant 5 — all three modes

| Mode | The surface | Why |
|---|---|---|
| Server | present | the case the feature exists for |
| Single-User | **absent (G-8)** | `authed` is bypassed and no session secret is even configured (`api.NewSingleUser`), so there is nothing to sign and nothing to prove |
| Local | **absent (G-8)** | no server, no API, no token |

## 9. What this deliberately does not do

* **No scopes.** A scope is a rule every handler must check, and is silently wrong wherever it is
  forgotten. Nothing in the stated need requires less than the caller's own rights.
* **No service accounts.** A token is a person, and attribution stays honest (invariant 3).
* **No storage of any kind** — including "just the `jti`, just for revocation". That is the middle
  path, and it was rejected on purpose: it pays the schema cost without answering *what exists*.

## 10. Failure paths a PR must cover

| Case | Expected |
|---|---|
| Expired token | `401` |
| Token signed with the previous secret, after rotation | `401` |
| Token of a deactivated account | `403 account_deactivated`, exactly as a session behaves |
| Token whose `sub` is not a real user | `401` — this is §7, and it fails today |
| A token in any log line, or in `/me/export.json` | must be impossible; asserted, not assumed |
| `kind: "api"` on a token minted by the login broker | must never happen — the two paths mint different claim sets |
| Minting in Single-User Mode | refused; there is no secret |

## 11. Still open — one question

**Default expiry.** Everything else was settled by choosing the unmanaged variant, and this one is
nearly settled by it too: with no revocation, `exp` is the *only* thing that ever ends a token's
life without operator action.

Answered: offer 1 / 7 / 30 / 90 / 365 days and *never*, **default 90**, and require the choice to be
made rather than accepted silently. *Never* stays available, because a token for a script that runs
once a year is a real case — but it should be the answer to a question, not a default nobody read.

## 12. What a PR would carry

`internal/api` — the mint handler, the `kind`/`jti` claims, the §7 fix in `authed` — plus `wire.go`
and `make wire` · the M17 block and its i18n · `cmd/jitpackd/token.go` · e2e in the `server` project,
the only one with real identities · a `docs/` page covering both creating a token and the kill
switch · an FR in the PRD Addendum · **one ADR**: unmanaged JWT over a stored token, listing and
individual revocation given up on purpose, with the measured reason (§2) that makes the trade
defensible.

No schema change. One PR is realistic.
