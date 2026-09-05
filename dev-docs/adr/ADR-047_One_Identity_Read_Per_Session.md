# ADR-047: The user directory is read once per session and refreshed by its writers — vs. once per screen

**Status:** Accepted (2026-09-05)
**Related:** ADR-033 (a partition that has not arrived is not an empty one), ADR-007 (session auth), FR-4.5 (the
sharing picker), FR-23.3 (deactivation), FR-25.19/25.20 (who a row names), FR-27.9 (the author line), U-10 of the
2026-09-02 design review, E2E-M20-07

**Context.** Nine views issued `fetchUsers()` and/or `fetchMe()` from their own `onMounted`, each into a `ref` of its
own: M1, M2, M4, M3's wizard, the member roster, M10, M17, M20 and the conflict log. The two answers are the same for
all of them, so the same list was fetched up to nine times in a session, and every screen spent its first frames not
knowing who the viewer was — the U-1.3 problem one layer up, and the reason `useIdentity` already owned the *what*
without owning the *when*.

The catch is that "fetch it once" is not free. The per-screen fetch was stale-proof by accident: a screen that
remounted re-read the directory, so a rename or a deactivation reached the next screen the person opened. A single
cached read gives that up unless something puts it back — which makes freshness a thing the code has to own rather
than a property it happens to have.

What can change the answer is a short list. The directory is `{user_id, display_name}` with deactivated accounts
excluded, so exactly four calls change it: `saveDisplayName`, `adminResetDisplayName`, `deactivateUser` and
`reactivateUser`. The avatar writers do not — the bytes are fetched by URL with a cache-busting version and the
directory carries no image. A session ending changes it in a fifth way: the next person at this device is not the
previous one.

**Decision Drivers (in priority order):**
1. **A name on screen is the right name.** The cache must not be able to show a person a name that was changed in
   this same session — the one way this change could make the app worse rather than faster.
2. **Nobody has to remember.** A rule that lives as a call every screen must make is the rule U-10 was about; the
   half-fixed version of it is worse than the original, because the omission is now invisible.
3. **One fetch per session.** The reason to do this at all.
4. **Testable without the sync stack.** The two calls are a two-function interface today (`IdentitySource`), and
   whatever holds the answer must keep that.

---

## Considered Options

### Option A — A pinia store, refreshed by the four writers *(recommended, accepted)*

`stores/identityStore.ts` holds `me`, `directory` and `loaded`, with `load()` deduplicated by an in-flight promise.
The four writers call `refresh()` **from inside the orchestrator**, not from the screen that triggered them, and
`onSessionEnded` calls `forget()`. `useIdentity(source)` stays the screen-side view of it, so `useTripIdentity` and
its three callers are untouched.

**Pros**
- Driver 1 holds by construction for every writer, including the ones whose surface is on another screen: M17's
  rename reaches the name M4 puts on a packed row, which no per-screen ref ever did.
- Driver 2: the refresh sits at the four calls that change the answer, so a new screen inherits freshness by reading
  the store, and a new *writer* is the only thing that can forget — one place, not nine.
- Driver 4: pinia resets per test with `createPinia()`, and `IdentitySource` is unchanged.

**Cons**
- A writer added later without a `refreshIdentity()` is a stale directory nobody sees. Mitigated by the table-driven
  case over all four writers plus the two avatar exceptions, which fails per writer.
- Two extra requests per write, where the write itself is rare.

### Option B — Keep the per-screen fetch; extract only the shared code

`useIdentity` stays a per-caller instance; the duplication goes, the requests stay.

**Pros**
- No staleness surface at all; driver 1 is free.
- Smallest diff.

**Cons**
- Driver 3 is not met, which is the item. Nine screens keep paying, and each still opens not knowing the viewer.
- Does not fix the real asymmetry: an *open* screen never learns about a rename either way.

### Option C — A cache with a time-to-live

Fetch once, re-fetch after N seconds.

**Pros**
- No writer has to remember anything.

**Cons**
- A non-deterministic timing constraint in production, which the working agreement rejects in tests for the same
  reason it is wrong here: the name is right *probably*, and the window where it is not depends on the clock.
- Every value of N is both too long for driver 1 and too short for driver 3.

### Option D — A module-level singleton instead of a store

**Pros**
- No pinia dependency in a leaf.

**Cons**
- Driver 4: the per-test reset would have to be written, and a missed reset carries one spec's identity into the
  next — silently, since an identity is a plausible value in any spec.

---

## Decision Matrix

| Driver | Weight | A — store + writers | B — extract only | C — TTL | D — module singleton |
|---|---|---|---|---|---|
| The name on screen is right | 4 | 4 — at the four writers | 4 — by refetching | 1 — right after N | 4 |
| Nobody has to remember | 3 | 3 — one place, guarded | 4 — nothing to remember | 4 | 3 |
| One fetch per session | 3 | 4 | 0 — nine, unchanged | 4 | 4 |
| Testable without the stack | 2 | 4 | 4 | 2 — needs a clock seam | 1 |
| **Total** | | **45** | 34 | 33 | 40 |

---

## Decision

`identityStore` holds one answer per session. `load()` is deduplicated and idempotent; the four writers that change
who the instance knows about call `refresh()` from the orchestrator; `onSessionEnded` calls `forget()`.

## Consequences

**Positive**
- Nine mounts, one pair of requests. Every screen reads the same `me` and the same directory, and a screen that
  mounts later than the first shows a name immediately rather than after its own round trip.
- A rename or a deactivation now reaches screens that are *not* the one it was made on, which the per-screen refs
  never managed — E2E-M20-07 asserts exactly that, with the same picker option resolving to one before and none
  after.
- The conflict log fetches the directory only when there is a takeover to name, which it always meant to.

**Negative / accepted costs**
- A fifth writer of names or account state must call `refreshIdentity()`. The table-driven case names every writer
  and expects zero for the two avatar calls, so the exception cannot be mistaken for a forgotten call — but a writer
  that does not exist yet cannot be in the table.
- Two extra requests per identity-changing write.
- An account provisioned by *another* person signing in during this session is not seen until something refreshes.
  That was true of every un-remounted screen before this too, and no surface makes it visible.

**Revisit trigger**
- A directory large enough that one fetch per session is itself the cost, or a third party that changes names
  (an IdP re-sync, a SCIM feed). Either turns "refresh at the writers" into "the server tells us", and the WebSocket
  hub is where that would land.
