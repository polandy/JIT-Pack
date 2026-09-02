# ADR-044: A waiting version is applied on a press — not on a clock, and not on its own

**Status:** Accepted (2026-09-02)
**Amends:** ADR-019 (App-shell caching — its decision line "No `skipWaiting()`")
**Related:** NFR-4.13 (update policy), FR-19.7 (the two surfaces), NFR-4.1 (the durable outbox this leans on), UI-Spec G-2, `client/public/sw.js`, `client/src/pwa/register.ts`, E2E-PWA-04/05

**Context.** ADR-019 decided the update policy as *next-launch takeover*: a new worker installs behind the running one, the app flips `swUpdateReady`, and a dot plus one sentence in the G-2 detail sheet announce it. That is a complete story for a browser tab, which gets closed. It is not one for an **installed PWA on a phone**, which is resumed rather than launched for days at a time — the owner's report is exactly that: the notice is there, and there is nothing to do about it. The announcement had a reader and no verb.

**Decision Drivers (in priority order):**
1. **Nothing reloads that the user did not ask for.** ADR-019's real content is that the app never yanks the page out from under someone mid-edit. Whatever is added must leave that true.
2. **Reachable without knowing the iconography.** The complaint is about access, so an offer that costs recognising a 7-pixel dot has not answered it.
3. **The outcome must be assertable, not raced** (the project's no-timing rule). "Press, wait a bit, hope the new worker took over" is not a test.
4. **No new dependency, no second worker** (NFR-4.3; ADR-019's driver 1 — the push handlers stay where they are).

---

## Considered Options

### Option A — Automatic takeover: `skipWaiting()` in `install`, `clients.claim()`, reload the page

The worker activates as soon as it has installed, claims the open pages, and the app reloads itself.

**Pros**
- Nobody is ever on a stale build; there is no surface to design and nothing to press.
- One line of worker code.

**Cons**
- Reloads the page underneath whoever is using it — the exact thing ADR-019 refused, and worse on this app than on most: M5's sheets, M15's wizard and every composer hold input that is not a mutation yet, so a reload can eat typing that no outbox knows about.
- The reload is triggered by a *download completing*, an event the user has no relationship to. It reads as a crash.
- Fails driver 1 outright.

### Option B — Announce only, as today (the status quo)

**Pros**
- Costs nothing and is already built and tested (E2E-PWA-04).

**Cons**
- Does not answer the request. On an installed PWA the "next launch" may be weeks away, and the app cannot tell the user how to bring it about — "close the app completely" is a thing a manual can say and a screen cannot make happen.
- The dot is the app's least legible control, and the sentence behind it is two taps in.

### Option C — The waiting version is applied on an explicit press *(recommended, accepted)*

The worker gains a `message` handler that calls `skipWaiting()` — and only that; `install` stays as it is. The app posts the message from a press, waits for `controllerchange`, and reloads. Two surfaces carry the press: a bar under the app bar (driver 2) and the G-2 sheet's existing sentence.

**Pros**
- Driver 1 holds by construction: the only path to `skipWaiting()` starts at a press, and a mutation that moves it into `install` turns E2E-PWA-04 red.
- Driver 3 holds by construction too: `controllerchange` is the event that says the new worker *controls this page*, so the reload is a consequence and the case asserts a settled state rather than a duration. (The mirror case, E2E-PWA-05, would stay green if the message handler were deleted — hence both cases, not one.)
- The reload is scheduled by the person doing it, so losing unsaved input is a decision rather than an accident, and the durable outbox (NFR-4.1) means nothing *submitted* is at risk. The bar says so.
- Zero dependencies; the push handlers are untouched (driver 4).

**Cons**
- A second surface to keep localized, themed and covered — the bar is the first thing this app renders between the header and the router outlet, and it costs vertical space on a phone while it is up.
- A press can still cost unsaved input in an open sheet. Accepted, and not guarded: a guard would have to enumerate every screen's transient state, and refusing the press on that basis would produce an update button that does nothing with no way to explain itself.
- The dismissal is per-load rather than remembered, so a user who reloads without updating is asked again.

### Option D — Press, but defer the reload to the next navigation

Apply `skipWaiting()` on the press and let the reload happen when the user next changes screens, so nothing is interrupted.

**Pros**
- Never interrupts a screen mid-use.

**Cons**
- The press produces no visible outcome, which reads as a broken button — the failure mode the whole change exists to remove.
- The app is then running old code against a new worker's cache for an unbounded stretch, which is a state nothing tests and no one can reason about.
- "The next navigation" is not a moment the test can name without racing it (driver 3).

---

## Decision Matrix

| Driver | Weight | A — automatic | B — announce only | C — on a press | D — deferred reload |
|---|---|---|---|---|---|
| Nothing reloads unasked (driver 1) | 4 | 1 — reloads on a download | 4 — never reloads | 4 — only on a press | 3 — reloads later, unasked |
| Reachable without the iconography | 4 | 4 — nothing to reach | 1 — a dot and two taps | 4 — a bar on every screen | 4 — same bar |
| Assertable outcome | 3 | 3 — assertable, wrong behaviour | 4 — already asserted | 4 — `controllerchange` | 1 — no nameable moment |
| Footprint / push untouched | 2 | 4 | 4 | 4 | 4 |
| **Total** | | **37** | **36** | **52** | **39** |

---

## Decision

Option C. `public/sw.js` gains one `message` listener that calls `self.skipWaiting()` for the single message `SKIP_WAITING`; `install` is unchanged. `applyUpdate()` in `src/pwa/register.ts` posts it to `registration.waiting`, awaits `controllerchange`, and reloads once — guarded by `swUpdateApplying` so a second press cannot produce a second reload. The surfaces are FR-19.7's bar and the G-2 sheet's action.

The message name is a constant on both sides of a boundary that cannot be crossed by an import (a worker script cannot import the app's modules), so `register.spec.ts` reads `public/sw.js` and holds the two literals equal — the same technique ADR-037 used for the notification templates. The same test asserts `skipWaiting()` is absent from `install`, which is the one line of ADR-019 this ADR must not accidentally repeal.

## Consequences

**Positive**
- The update policy is now two sentences that are each true: it takes over on the next launch, and it takes over now if you say so.
- Both halves have a case that can fail for the right reason. E2E-PWA-04 dies if the takeover becomes automatic; E2E-PWA-05 dies if the press stops working. Neither covers the other.

**Negative / accepted costs**
- Unsaved, unsubmitted input in an open sheet is lost by a press. Not guarded — see Option C's second con.
- The bar occupies a row above the content while a version waits. It is dismissible, and the dismissal is deliberately not persisted (FR-19.7 says why).

**Neutral**
- Nothing about the shell cache, the bypass rule or the push path changes; ADR-019's revisit trigger (adopt Workbox at the second cache *strategy*) is unaffected.

## Revisit Trigger

Revisit if a screen ever holds input worth protecting across a version change — a draft that survives a reload would remove Option C's one accepted cost, and would also make Option D's "defer the reload" cheap enough to reconsider. Revisit sooner if the per-load dismissal turns out to nag: the fix is to store the waiting worker's `__JITPACK_VERSION` (read over a `MessageChannel`) rather than to lengthen the timeout, because there is no timeout.
