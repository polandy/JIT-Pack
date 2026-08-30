# ADR-039: An API token is an unmanaged JWT — listing and single revocation are given up on purpose

**Status:** Accepted
**Related:** FR-23.7, FR-23.3, ADR-007, ADR-018, invariants 2 and 5, `dev-docs/api-tokens-concept.md`, `internal/api/apitoken.go`, `cmd/jitpackd/token.go`

**Decision Drivers (in priority order):**
1. **A credential must be revocable by *some* mechanism**, and whatever that mechanism is has to be affordable enough that an operator will actually use it under pressure.
2. **Invariant 2 has a price that is now paid in real data.** The development phase has no migrations: a schema change means every database is deleted and rebuilt, and the instance holding the maintainer's family's trips is one of them.
3. **Nothing may make deletion or authentication mode-dependent** (invariant 5). Whatever is built must behave correctly in Server, Single-User and Local Mode.
4. **A rule must not exist twice unnoticed** (invariant 4, ADR-025's finding).

---

## The premise that has to be stated first

A long-lived credential is not what this decision is about, because **one was already possible**.
`authed` trusts any HS256 JWT signed with `JITPACK_SESSION_SECRET` whose `sub` is a `users.id`, and
`cmd/jitpackd/main.go` names the mode on startup — *"multi-user mode (externally minted session
tokens)"*. Anyone holding the secret could mint a ten-year token by hand today.

What was missing is a *way to make one* without hand-crafting a JWT, and — the part that actually
costs something to decide — whether such a credential should be **revocable, listable and
attributable**, which a signed token cannot be without storage behind it.

## The measurement that decided it

The obvious objection to storing nothing is "then you cannot revoke". The escape hatch is rotating
`JITPACK_SESSION_SECRET`, and the reason to dismiss that as a blunt instrument is the assumption
that it throws every user out of the app.

**It does not, and this was checked rather than reasoned about.** Refresh tokens are opaque random
values stored *hashed* in `sessions` (`hashRefreshToken`, `internal/api/auth.go`), not signed — so a
rotation voids only the fifteen-minute access tokens, and every browser obtains a new one at its
next refresh. Revoking every API token on the instance therefore costs nobody a login.

One caveat survives and is written into `docs/`: `handleAuthRefresh` answers `501 not_configured`
when no IdP is configured, so on an instance running with externally minted tokens and no OIDC there
is no refresh path, and a rotation *does* log everyone out.

## Considered Options

### Option A — An unmanaged JWT, nothing stored *(recommended, accepted)*

The token is an ordinary session JWT with a longer life and three claims: `kind: "api"`, a `jti`,
and the `name` the person gave it. `MintAPIToken` is a pure function shared by the endpoint and the
CLI. Revocation is secret rotation, and it is all-or-nothing.

**Pros**
- **No schema change, so no database is rebuilt** (driver 2). Under invariant 2 that is not a
  nicety: the alternative destroys real data on a real instance.
- Revocation is one operator action that costs nobody a login (the measurement above).
- Nothing to leak at rest: there is no stored credential material, hashed or otherwise, because
  there is no row.
- The rule has one implementation reachable by a unit test, with the HTTP handler and the CLI as
  thin callers.
- No new dependency, no new package, no new import edge.

**Cons**
- **You cannot list tokens.** Nobody — not an admin, not the maintainer, not the server — can answer
  "what tokens exist for this instance?". The set is unknowable by construction, and that is the
  real cost of this decision.
- **You cannot revoke one token.** A single leaked credential is killed only by killing all of them.
- No "last used", so a token nobody needs any more is invisible rather than obviously stale.
- A token cannot be traced back to its purpose once its holder no longer has it.

### Option B — A stored token: `api_tokens`, hashed, with list and revoke endpoints

The variant the concept originally proposed: a two-part token (`id.secret`), the secret stored as a
SHA-256 digest, an indexed lookup by the public half, three endpoints and a management screen.

**Pros**
- Everything Option A gives up: listing, individual revocation, last-used, attribution.
- Matches what a reader expects from "API tokens", so it needs no explaining.

**Cons**
- **A schema change, and therefore every database deleted and rebuilt** (invariant 2, ADR-018).
  The error message the server prints names the operator's only path: export, wipe, import — which
  on the family instance loses the OIDC identity mapping, the memberships and the conflict log, and
  was avoided once already by moving that data at the database level instead.
- `last_used_at` is one write per authenticated request against a single-writer SQLite, so it needs
  a throttle that is itself a decision.
- More surface for a need that, on a home-lab instance with a handful of scripts, is met by a set
  the owner can hold in their head.

### Option C — A JWT plus a `jti` denylist

The middle path: store nothing except the ids of revoked tokens.

**Cons**
- **Pays Option B's schema cost without buying its main benefit.** It gives individual revocation
  and still cannot answer *what exists* — so the operator must already know the `jti` of the token
  they want gone, which is exactly the thing an unlisted system cannot tell them.

### Option D — Session tokens with a longer expiry, no new concept at all

**Rejected.** It is the status quo, reachable only by editing `sessionAccessTTL`, and it would make
*every* browser session as long-lived as the machine credential — the opposite of the intent.

## Decision

**Option A.** The `jti` ships from day one anyway: adding a denylist, or the full table, later is
additive and does not invalidate tokens already issued. What is being bought here is time, not a
closed door.

**And a token may not mint another token.** Without that rule, a leaked credential renews itself
before its own expiry and `exp` — the only bound an unmanaged token has — stops bounding anything.
It is deliberately not a scope: a scope asks which resources a credential may touch, an open-ended
question asked at every handler and silently wrong wherever it is forgotten; this asks whether a
credential may extend its own life, a closed question with exactly one place to ask it, because
exactly one endpoint in the system answers with a credential.

## Consequences

- Deleting or auditing a credential is an operator action on the *instance*, not on a token. That
  belongs in `docs/`, written out, and it is the only revocation story there is.
- **A pre-existing hole in the shared authentication path had to be closed first**: `authed`
  established that a subject was not *deactivated*, and the store read "no such row" as "not
  deactivated". A ninety-day credential outlives the account it was minted for, which is what made
  an almost-unreachable gap reachable. Existence and deactivation are now one question.
- Single-User Mode is the sharp edge of invariant 5 here: `authed` is bypassed, so the mint endpoint
  is *reachable with no credential at all*. It answers `501` as its first statement rather than
  relying on being inert.
- The client gains a monospace type role and a clipboard helper, neither of which existed — both in
  the places the invariants put them (the type table, `client/src/lib/`), not in the component.

## Revisit trigger

**The first time somebody cannot answer "is that old token still out there?" and it matters.** That
is the question Option A cannot answer, and the day it is asked in earnest is the day the storage
earns its schema change — by then, most likely, alongside the migration path invariant 2 already
plans for.

**Or: the instance stops being a home-lab one.** More people, or credentials handed to someone other
than their creator, make an unlistable set a liability rather than a simplification.
