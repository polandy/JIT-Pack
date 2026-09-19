# ADR-065: A removal prunes its item — once final, and only where nothing uses it — vs. deleting at once through the push

**Status:** Accepted
**Related:** FR-5.8, FR-24.3, FR-24.11, FR-20.4, ADR-032, ADR-038, ADR-052,
Sync-API §8 (`POST /master/items/{id}/prune`), `client/src/domain/rowRemoval.ts` (`itemInUse`, `itemLeftUnused`),
`internal/store/master_prune_item.go`

**Context.** Since FR-24.11 every name typed into M4's composer becomes an inventory item. An item made for one trip,
added by mistake and taken off the list again stayed in the inventory for good. The owner decided on 2026-09-19 that
FR-5.8's removal should take the item along when nothing else uses it, and that this should happen **automatically,
without a question**. The alternatives were asking in the removal, limiting it to items made "on the side" (which
needs a provenance column and a reseed), or leaving it to M24 as a rule.
Deciding that was the owner's. *How* to carry it out is this ADR, and three facts constrain it:

* **A delete is not reversible by the row undo.** Deleting an item cascades its tag assignments, its companion rules
  and its photo (`item_images`, whose bytes live outside the sync envelope, ADR-002). FR-5.8's snackbar undo
  re-inserts one trip row.
* **A server device cannot see every use.** It holds only the trips it has opened (ADR-032), and in a household the
  use it cannot see is the ordinary case: another member's trip.
* **The push's delete answers a use by retiring** (FR-24.3). Retiring hides the item from every inventory and picker.
  On the word of a device that has not seen the trip still packing it, that is the wrong answer. The master partition
  is also drained *before* any trip partition (`drainTrip` waits on `whenSent('master')`). So an item delete queued
  with the row removal would reach the server while the row still existed. The server would count that row as a use
  and retire the item every time.

**Decision Drivers (in priority order):**
1. Never make a used item disappear — not by deleting it, not by retiring it — on an incomplete view.
2. The undo keeps meaning what it says: the row is back, and so is everything it hangs on.
3. The same rule in all three modes (invariant 5); Local Mode has no server to ask.
4. No new sync vocabulary unless the transport truly needs it.

---

## Considered Options

### Option A — Prune once final, through a conditional server call *(recommended, accepted)*

The removal decides nothing about the item by itself. `useRowUndo` gains an `onLapse`. It runs when the armed record is
cleared or replaced without an undo: the snackbar runs out, the screen is left, or the next action takes the snackbar's
place. A confirmed removal has no undo and prunes at once. The prune asks this device first (`itemInUse` over positions,
known trip rows and the items that bring it as a companion). **Local Mode** holds every trip, so it deletes the item
through FR-24.3's ordinary delete. A **server** device first waits until the trip delete has been answered
(`whenSent('trip')`) and then calls `POST /api/v1/master/items/{id}/prune`. The call runs the ordinary master pipeline
under a partition whose write gate adds "still used". A used item is refused *inside the deleting transaction*, and is
not re-logged and not retired. The answer is `{pruned, pull_hint}`.

**Pros**
- A used item is never touched, whichever device asks and however little it has seen.
- The undo never has to re-create a deleted item, its tags, its companion rules or its photo.
- The check and the delete share one transaction; no write lands between them.
- The rule has one implementation per side, like FR-24.3's: `itemInUse` for the device's view, `itemInUse` in the store
  (reading `blockingReferences`, the declaration FR-24.3 reads) for the whole picture.

**Cons**
- A server device offline when the removal becomes final keeps the item. There is no queue for the call, so the prune
  is simply not done. M24 does not catch it later either: its "long unused" rule deliberately skips items never seen
  on a trip.
- A tab closed while the snackbar is up never lapses, so the item stays.
- A new RPC beside the four ADR-038 deletes. Unlike them it is the app's own call, and the one master write that
  does not go through the push.

### Option B — Delete at once through the push

Queue `deleteMasterItem` with the row removal and let the undo re-insert the item, its tag assignments and its
companion rules under their own ids (ADR-052 lets a newer insert through).

**Pros**
- Offline-safe: the delete is queued like any other write.
- No new endpoint.

**Cons**
- The push's delete retires a used item (FR-24.3). Because the master partition drains first, the delete reaches the
  server before the row removal does, so it would be retired every time, even when nothing else uses it.
- The undo cannot bring back the photo: its bytes are deleted with the row and never travelled through the envelope.
- The undo grows from one insert to four kinds of row, each able to be refused on its own.

### Option C — A new mutation op, `prune`, in the push

Teach the push a fourth op: a conditional delete that is a no-op when referenced.

**Pros**
- Offline-safe, and no RPC.

**Cons**
- The ordering problem stays. The op sits in the master queue, which drains before the trip delete it depends on, so it
  would need a cross-partition ordering the outbox does not have.
- It changes `internal/sync`'s vocabulary, the merge's branches and the wire contract for one caller.

---

## Decision Matrix

| Driver | Weight | A — prune once final (RPC) | B — delete through the push | C — `prune` op |
|---|---|---|---|---|
| Never hide a used item | 4 | 5 — refused in the deleting transaction | 1 — retired on every server removal | 4 — right answer, wrong order |
| Undo stays honest | 3 | 5 — nothing to re-create | 2 — the photo cannot come back | 5 |
| Same rule in all modes | 2 | 4 — Local deletes, server asks | 4 | 4 |
| No new sync vocabulary | 1 | 4 — one RPC, no op | 5 | 1 |
| **Total** | | **47** | **23** | **40** |

---

## Decision

The item goes only when FR-5.8's removal is **final** — the undo has lapsed, or the removal was confirmed. On a
server device it goes through `POST /master/items/{id}/prune`, which deletes only when nothing on the server uses it
and otherwise leaves the item exactly as it was. Local Mode deletes on its own answer. "Used" means a Vorlage or group
position, any trip row, or **another item that brings it as a companion** (FR-20.1). The item's own companion
list goes with it.

## Consequences

**Positive**
- The inventory stops keeping the typo and the one-off that the composer created on the way.
- The snackbar and the confirmation say so: *„„Zelt" entfernt – auch aus dem Inventar"*. The dialog adds *„Der Artikel
  kommt sonst nirgends vor und wird auch aus dem Inventar gelöscht."*

**Negative / accepted costs**
- **Offline, the item stays.** The removal is final but the server cannot be asked, and nothing asks it again.
- **The sentence can over-promise in Server Mode.** The device announces the prune from its own view, and the server
  may keep the item over a trip the device has not seen. That is FR-24.3's accepted cost again: a wrong sentence, never
  a wrong row.
- A carefully kept item that happens to live on one trip only goes with its last row. It has no template, and the
  owner chose that over a question.

**Neutral**
- Removal paths other than FR-5.8's row menu are unaffected: the browse sheet's undo of an add, a group refresh, a
  membership change and deleting a whole trip never prune.

## Revisit Trigger

Somebody finds an item gone that they meant to keep, or a server user reports items that stay after removal offline.
The first calls for Option "ask in the removal". The second calls for a queue for the prune call, or for Option C
with an ordering guarantee.
