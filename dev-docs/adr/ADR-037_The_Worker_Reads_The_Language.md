# ADR-037: How the service worker learns the language — an IndexedDB mirror vs. a message vs. a server-rendered payload

**Status:** Accepted (2026-08-29)
**Related:** NFR-4.12 (English-only notifications), NFR-4.6 (Web Push), FR-6.2/6.3, ADR-019 (the worker's update model), `client/public/sw.js`, `client/src/notifications/`

**Decision Drivers (in priority order):**
1. **A notification must be correct when the worker is woken cold.** A push arrives with no page open, often after the browser has been restarted: whatever the mechanism is, it has to work with no client to ask.
2. **The vocabulary exists once (NFR-4.12).** The reason this was owed at all is that `sw.js` carried a second copy of every sentence with a comment asking the next person to keep it in sync, and the i18n migration walked straight past it.
3. **No new server-side knowledge.** The server does not know a device's language today, and teaching it would put a per-device preference into a partition that syncs between devices.
4. **Local Mode is unaffected.** It has no push at all, and nothing here may make it need one.

---

## Considered Options

### Option A — mirror the vocabulary into IndexedDB *(recommended, accepted)*

The app writes one row — `{ locale, bodies }`, the finished templates for the active language — into its own small database (`jitpack-sw` / `meta` / `notifications`) whenever the language changes, boot included. The worker opens that database on push, picks a body and fills its `{slot}`s.

**Pros**
- Readable by a worker with no client, which is the case that matters.
- What crosses is *data*, in the user's language: the worker holds no sentence of its own except one fallback.
- Storage is already a dependency of the client (Local Mode, the outbox), so nothing new is introduced.

**Cons**
- A second store to keep current; a device whose storage is denied gets the fallback sentence.
- The worker still decides *which* body — two rules, written twice. Held together by a test that drives both renderers against the same table (`workerBody.spec.ts`).

### Option B — post the locale to the worker

`navigator.serviceWorker.controller.postMessage({ locale })` on boot and on change; the worker keeps it in a variable.

**Pros**
- Trivial, no storage.

**Cons**
- **Fails the first driver outright.** A worker woken by a push starts fresh: the variable is gone and there is no client to ask. It would be right while the app is open and wrong exactly when a notification matters.

### Option C — the push payload carries rendered text

The server renders the sentence and sends it.

**Pros**
- The worker becomes trivial and holds no vocabulary at all.

**Cons**
- The server does not know the device's language, and giving it one means either a new per-device field in a synced partition or a per-subscription column plus its API.
- It moves *presentation* to the server, which contradicts invariant 4's direction of travel, and the same body is already needed client-side for the in-app toast — so the vocabulary would exist twice again, once per side.

---

## Decision Matrix

| Driver | Weight | A — IndexedDB mirror | B — postMessage | C — server renders |
|---|---|---|---|---|
| Correct when woken cold | 5 | 5 — the store outlives the page | 0 — the state is gone | 5 — text arrives with the push |
| Vocabulary exists once | 4 | 4 — one fallback sentence remains | 4 — same | 1 — server and client each hold a copy |
| No new server knowledge | 3 | 3 — none | 3 — none | 0 — needs a per-device language |
| Local Mode untouched | 2 | 2 — yes | 2 — yes | 2 — yes |
| **Total** | | **44** | 21 | 33 |

---

## Decision

The app writes the notification vocabulary for the active language into IndexedDB (`client/src/notifications/mirror.ts`), and `public/sw.js` reads it there on push. The worker owns no wording beyond a single fallback sentence for a device that has never written the mirror.

## Consequences

**Positive**
- The OS notification and the in-app toast say the same sentence, in the same language, and that is *asserted* rather than requested in a comment: `workerBody.spec.ts` loads the worker source and compares both renderers over every kind in both languages.
- Adding a notification kind is a catalogue entry plus a name in `NOTIFICATION_BODY_NAMES`; the worker does not change.

**Negative / accepted costs**
- The body *selection* is written twice — once in TypeScript, once in the worker. It is four lines with no vocabulary in it, and the parity test is what keeps them equal.
- One English sentence stays in the worker as the last resort. A device with storage denied, or one that receives a push before the app has ever run, sees it.
- The mirror is written on every language change and at boot: one small IndexedDB write per app start.

**Neutral**
- The store is the worker's contract, so its three names live in the module the app writes with and are referenced by the worker.

## Revisit Trigger

The server gains a per-device notion of language for another reason — a channel other than Web Push (email, matrix) that it must render itself. At that point Option C stops carrying its own cost, and the mirror becomes the fallback path rather than the mechanism.
