# ADR-032: The retire decision is made in two places on purpose — server-authoritative, client-advisory

**Status:** Accepted
**Related:** FR-24.3, FR-9.2, ADR-031, ADR-025, ADR-008, invariants 4 and 5, Sync-API §5, `internal/store/master.go` (`blockingReferences`, `stillReferenced`), `client/src/domain/masterDeletion.ts`

**Decision Drivers (in priority order):**
1. **A retired row must never be missing where history reads it** (FR-24.3, FR-8/FR-14). Losing a row from resolution, from an export, or from the NFR-4.11 backup is data loss; a retired row appearing in a picker is noise.
2. **The delete has to work offline, in all three modes** (invariant 5). Local Mode has no server at all, and Server Mode has to answer a delete on a device with no connection.
3. **A rule must not exist twice unnoticed** (invariant 4, ADR-025's finding). Where a second implementation is unavoidable, it must be unable to drift *silently*.
4. **FR-24.3 requires the outcome to be stated before the user confirms.** A screen that reports which deletion happened after the fact does not satisfy it.

---

## The constraint that forces the shape

FR-24.3's decision needs one input: how many rows still point at this item or Vorlage.
That count is complete only where all the data is, and the data is not in one place:

* **Server Mode** — the server holds every trip. The client holds the whole master
  partition but only the trip partitions it has *opened* (`loadedTripPartitions`), so its
  count of `trip_items.source_item_id` / `source_template_id` can be short. This is not a
  gap to close: pulling every trip's rows onto every device to answer a delete would
  invert the partitioning the sync protocol is built on (P-3).
* **Local Mode** — there is no server, and the device holds every trip it will ever have.
  The client's count is complete and nothing else can answer.

So the decision cannot live *only* on the server (Local Mode would lose the feature —
invariant 5), and it cannot live *only* on the client (Server Mode would physically
delete rows an unseen trip still names, and the outbox drops the rejection that follows).

## Considered Options

### Option A — Server-authoritative, client-advisory *(recommended, accepted)*

The server decides what actually happens: `ApplyMasterMutation` already asks
`stillReferenced` before a delete, and FR-24.3 changes that branch from *refuse* to
*retire* for `items` and `templates`. No reference-counting logic is added there — the
refusal's own machinery answers the new question.

The client makes the same decision over what it can see, in
`client/src/domain/masterDeletion.ts`, for two jobs: to state the outcome before the
confirm, and to be right on its own in Local Mode. In Server Mode its count may be short,
and **being short is safe**: the server converts the physical delete it will not perform
into a retire, and the ordinary pull carries the row back with its marker, so the device
converges. A wrong client answer costs a wrong sentence, never a wrong row.

The two are held together by shape rather than by discipline: the client's decision is
*advisory by construction* — the only outcome it can produce that the server disagrees
with is "remove", and the server's disagreement is a correction the pull already
delivers.

**Pros**
- Works offline in every mode, with no network call on the delete path.
- Local Mode keeps the feature (invariant 5) and is authoritative where it is complete.
- No new endpoint, and no online dependency inside a confirm dialog on an offline-first app.
- The client's error mode is a sentence, not a row.

**Cons**
- FR-24.3's rule is written twice, in two languages. Real, and accepted.
- In Server Mode, offline, M10 cannot promise a physical delete. It says so in a third
  sentence rather than guessing, which is a longer confirm than the FR imagined.

### Option B — One implementation, on the server, reached over HTTP

The client asks a `GET /master/items/{id}/usage` endpoint at confirm time and sends the
answer back as the mutation.

**Pros**
- One expression of the rule.
- M10's sentence is always exact in Server Mode.

**Cons**
- Local Mode has no server, so the rule has to exist client-side anyway — the duplication
  is not actually removed, only moved and hidden behind a mode check.
- Puts a network round-trip inside a delete confirm on an app whose defining property is
  that it works without one. Offline the dialog is back to Option A's hedge, so the
  endpoint buys the exact case it cannot serve.
- A route, a wire type, a generated builder and a handler for a number the server is about
  to compute again anyway when the mutation arrives.

### Option C — One implementation, on the client, with the server merely refusing

The client counts, decides, and the server keeps today's `still_referenced` refusal as a
backstop.

**Pros**
- Genuinely one rule, in `client/src/domain` where invariant 4 puts the others.

**Cons**
- **Destructive.** In Server Mode the client's count is short exactly for the FR-9.2 case
  the feature exists for — a Vorlage an unopened trip was generated from. The client
  removes the row optimistically, the server refuses, and a rejected mutation is one the
  outbox drops. ADR-031's repair puts the row back, so the user's decision is lost
  silently rather than the data — but the delete then simply does not work, on the exact
  rows FR-24.3 is about.
- It is the shape the UI-Spec already rejected for M7 on 2026-08-25: *"a pre-check would
  call the delete safe in exactly the case that then fails."*

---

## Decision Matrix

| Driver | Weight | A — server authoritative | B — one rule over HTTP | C — one rule on the client |
|---|---|---|---|---|
| A retired row is never missing from history | 5 | 5 — the server keeps the row whatever the client guessed | 5 — same | 1 — the FR-9.2 case is precisely the one it gets wrong |
| Works offline, all three modes | 5 | 5 — no network on the delete path | 2 — the exact sentence needs the network it cannot have | 4 — works, but wrongly |
| No silent second implementation | 4 | 3 — two copies, but the client's is advisory by construction and cannot diverge unnoticed | 3 — Local Mode still needs its own copy | 5 |
| Outcome stated before the confirm | 3 | 4 — exact except Server-Mode-offline, which says so | 5 | 4 |
| Footprint (NFR-4.3) | 2 | 5 — reuses the refusal's own check | 2 — route, wire type, handler, generated builder | 5 |
| **Total** | | **83** | **63** | **63** |

## Decision

FR-24.3's decision is made by the server, in the branch where the `still_referenced`
refusal already ran, and *also* by the client — advisorily — so the confirm can state the
outcome and so Local Mode keeps the feature. The client's copy is allowed to be wrong in
one direction only, and that direction is corrected by the pull it would already do.

The filtering that follows from the marker is decided the same way round. `itemList` and
`templateList` keep meaning **everything**, and the display surfaces opt in to
`activeItemList` / `activeTemplateList`. The asymmetry is the reason: a retired row
showing in a picker is noise, while a retired row missing from `resolve()`,
`compositionSource()` or `portableResolvers()` silently empties a generated trip or a
device's only backup. Filtering at the source would have made the destructive direction
the one every current and future call site inherits by default.

## Consequences

**Positive**
- The delete path stays offline-capable and adds no endpoint.
- The refusal machinery from PR #198 is reused rather than paralleled; `blockingReferences`
  remains the single Go statement of what keeps a row alive.
- Every new call site of `itemList`/`templateList` defaults to *complete*, so the failure a
  future author can introduce by forgetting is the harmless one.

**Negative / accepted costs**
- The rule is expressed in Go and in TypeScript. Two test suites assert it, in the two
  places it runs, and neither is a mock of the other.
- In Server Mode, offline or with unopened trips, M10's promise of a physical delete is
  conditional and worded as such. That sentence is longer than the FR's two.
- Every display surface has to *choose* the active list. The choice is enumerated in the
  PR that introduced it rather than enforced by a type — a lint rule over
  `masterStore.itemList` was considered and rejected as unable to tell a picker from an
  exporter.

**Neutral**
- The marker is an ordinary synced column, so "restore" is one mutation clearing it. The
  data side of the FR's free restore is built and tested; the surface that would list
  retired rows is not, and is named as owed.

## Revisit Trigger

The client gaining a complete view of every trip's rows in Server Mode — a full-partition
pull, or a server-side reference count arriving for another reason (FR-27.8's per-trip
usage history is the likely one). At that point Option A's client copy stops being
advisory, and the two implementations should collapse into whichever one keeps Local Mode
whole.
