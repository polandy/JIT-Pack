# ADR-100: The write path is a port chosen once, and a view asks for a capability

**Status:** Accepted
**Related:** ADR-006, ADR-096, ADR-098, FR-19.1/19.2, FR-19.3, G-8, CLAUDE.md invariant 5, ARCH-14/14b

**Decision Drivers (in priority order):**
1. Invariant 5 answered once: every feature owes "what happens in Single-User and in Local?", and the answer
   should not be re-derived at each call site.
   re-derived at each call site.
2. A change in what a mode shows (the next Local-only or server-only surface) touches one table, not a grep.
3. `useSyncOrchestrator` stays the facade the screens already hold (ADR-098); no call site outside it changes shape.

---

## Considered Options

### Option A — `SyncBackend` port plus `capabilitiesOf(mode)` *(recommended, accepted)*

The orchestrator builds `createLocalBackend` (IndexedDB save and load, no outbox, no socket) or `createServerBackend`
(outbox, WebSocket, drains) once and calls the same sixteen verbs on either (`connect`, `applied`, `enqueue`, `push`,
`drainTrip`, `whenSent`, `tripDataLoaded`, …). Views and `App.vue` ask `capabilitiesOf(mode).activityLog` and its seven
siblings instead of comparing the mode.

**Pros**
- About twenty `if (local)` guards in the orchestrator became one selection; Local's side is a file that can be
  read as "does nothing" and is tested as such.
  nothing" and is tested as such.
- A surface's rule is named where it is asked (`conflictInbox`, `presence`), so G-8 is greppable per surface.

**Cons**
- A sixteen-method port, and two files carrying code that used to sit in one. Roughly 300 lines moved out of the facade.
- Eight flags for two modes: today every server flag is `true` together. The names pay off only when a surface splits
  from its siblings (Single-User already does, through `hasCollaborativeSession`, which stays a separate question).
- The REST-only action groups are still chosen by one `local ?` (the null-object bundle) because they need the client,
  which both modes build.

### Option B — keep the guards, add only `isServerMode()` (ARCH-14 part 1)

**Pros**
- Nothing moves.

**Cons**
- Each new write-path feature adds a guard; the orchestrator was already 828 lines with about twenty of them.

### Option C — a thin port (connect, drain, enqueue) and keep the rest guarded

**Pros**
- Smaller interface.

**Cons**
- Presence, cursor and `tripDataLoaded` guards stay, and they are the ones a new feature reaches for.

---

## Decision Matrix

| Driver | Weight | A | B | C |
|---|---|---|---|---|
| Invariant 5 once | 3 | 3 | 1 | 2 |
| One table to change | 2 | 3 | 1 | 2 |
| Facade unchanged | 1 | 3 | 3 | 3 |
| **Total** | | **18** | 8 | 13 |

---

## Decision

The write path is the `SyncBackend` port, selected once by the orchestrator; a screen reads `capabilitiesOf(mode)`.
`isServerMode`/`isLocalMode` remain for composition (which backend, which token refresher) and the route guard.

## Consequences

**Positive**
- Local Mode cannot reach a socket or an outbox by construction, not by guard.

**Negative / accepted costs**
- The two image-store paths (`app/images.ts`, `ideaImages.ts`, `trackFiles.ts`) still branch on `local: ImageStore |
  null`; that is the next port (ARCH-14c).
- `orchestrator.outbox` is `SyncOutbox | null`.

**Neutral**
- Single-User Mode is the server backend with no tokens, as before.

## Revisit Trigger

A fourth backend (a Capacitor native shell with its own store, ADR-006), or a capability that differs between Server and
Single-User Mode beyond what `hasCollaborativeSession` answers.
