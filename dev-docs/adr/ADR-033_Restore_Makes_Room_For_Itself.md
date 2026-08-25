# ADR-033: A restore that collides makes room for itself — rename vs. refuse vs. merge vs. let the push decide

**Status:** Accepted
**Related:** FR-24.3, FR-16.3, FR-1.6, FR-9.2, ADR-031 (a refusal repairs the row), ADR-032 (the retire decided twice), UI-Spec M23/M9/M10/M7, invariants 4 and 5, `internal/store/schema.sql` (`idx_items_active_name`, `idx_templates_active_name`), `client/src/domain/masterRestore.ts`

**Decision Drivers (in priority order):**
1. **Two active rows must never share a name.** That is what `UNIQUE (name)` on `items` and `templates` is for (FR-16.3, FR-1.6): a name is an identity here — the import matches on it, the quick-add resolves on it, and two rows no screen can tell apart is the defect the constraint exists to prevent.
2. **The user's decision must not be lost or silently reversed.** A rejected mutation is one the outbox drops (Sync-API §5.1), and ADR-031's repair then puts the server's row back — so a restore the push refuses is a restore the user watched happen and un-happen, with nothing said.
3. **All three modes** (invariant 5). Local Mode has no server, so whatever answers this has to work with no network at all.
4. **A retire must not become a trap.** FR-24.3 promised a free restore; an affordance that dead-ends on the common case ("I deleted it, re-made it, and now want the old one's history back") is not one.
5. **One rule, not two** (invariant 4). The name-matching rule already exists in `client/src/domain/nameCollision.ts` and must not be re-expressed.

---

## The constraint that forces the choice

FR-24.3 made both name indexes **partial**, over `retired_at IS NULL`:

```sql
CREATE UNIQUE INDEX idx_items_active_name ON items (name) WHERE retired_at IS NULL;
```

That was the right call and is not reopened here: a name held by a row no screen shows is a
name taken by nothing, and re-creating the item you just deleted is the *common* case. But it
means retiring **frees the name**, so this sequence is ordinary rather than exotic:

1. "Sonnencreme" is retired — the name is free.
2. A new, different "Sonnencreme" is created. Allowed, and the pre-push collision check agrees,
   because it filters retired rows on purpose.
3. The old "Sonnencreme" is restored → two active rows would share a name.

Whatever answers step 3 has to hold in Local Mode, where there is no server to answer it.

## Considered Options

### Option A — the restore carries a replacement name, in the same mutation *(recommended, accepted)*

The client checks the name **before enqueuing**, over the active rows of the master partition it
holds in full, reusing `findNameCollision`. A free name restores silently. A taken one is refused
with a sentence naming the holder **and** a text field: the confirmed name is written together
with the cleared marker, as one mutation.

**Pros**
- The user gets the row's history back, which is the only thing a restore is for, without the
  row that took the name having to give it up.
- Works identically in all three modes: the check is local, over data every device already has.
  Unlike ADR-032's reference count, this answer is *complete* on the client rather than advisory
  — the master partition is pulled whole, so the device knows every active name.
- One mutation, so there is no window in which the index is violated and no second write for the
  outbox to drop between them.
- No new rule: the fold (`trim` + `toLowerCase`, diacritics kept) is `nameCollision.ts`'s,
  shared with M7's create and rename and with the series name space.

**Cons**
- The restored row can come back under a name that is not the one it was deleted with, so a
  reference to it in someone's memory ("the old Sonnencreme") no longer matches the screen.
  Real, and accepted: the alternative is that it does not come back at all.
- The restore path now has an input in it, which is one more thing than "a button".

### Option B — refuse, with a sentence naming the holder, and stop there

The same check, the same sentence, no way out. The user is told to rename or delete the *other*
row themselves and try again.

**Pros**
- Simplest possible surface: one message, no input.
- Nothing is written under a name the user did not originally choose.

**Cons**
- **Dead-ends the common case.** Deleting something and re-creating it is exactly what the
  partial index was chosen to allow, so the collision is not an edge — it is the path the schema
  encourages. Sending the user to rename a *different*, healthy row to unblock a hidden one
  inverts which row is the problem.
- The repair it asks for is destructive-adjacent: renaming the active row changes what every
  future import and quick-add matches against.

### Option C — merge the retired row into the active one that holds the name

Treat the collision as evidence that the two rows are the same thing, and repoint everything
that names the retired row at the active one.

**Pros**
- Ends with one row of that name, which is arguably what the user meant.
- No rename, no new input.

**Cons**
- **Not implementable where it would run.** The references that keep a retired row alive live in
  `trip_items.source_item_id` / `source_template_id`, in **trip partitions the device may not
  hold** (P-3, ADR-032). A client-side merge would silently repoint only the trips it has opened.
- Destructive and unaskable: it rewrites provenance FR-9.2 guarantees for archived trips, and it
  cannot be undone by the delete that produced the situation.
- It assumes the two rows are the same thing. Nothing checked that; they share five characters.

### Option D — enqueue the restore and let the server's constraint refuse it

No client check at all. The push comes back `rejected` / `constraint_violated`, and ADR-031's
re-log repairs the row.

**Pros**
- No rule on the client, so nothing can drift from the database's own answer.
- Zero new code — the whole path already exists.

**Cons**
- **Local Mode has no server**, so in one of the three modes there is no refusal at all — the
  write lands wherever it lands and the device ends with two rows nothing distinguishes.
- In Server Mode the user *watches* the restore succeed and then reverse itself, up to a drain
  later, with the outbox having dropped the mutation. The answer was available before the tap.
- ADR-031's repair is a correction of last resort. Using it as a product flow makes an
  unexplained flicker the specified behaviour.

---

## Decision Matrix

| Driver | Weight | A — rename in the same mutation | B — refuse and stop | C — merge | D — let the push refuse |
|---|---|---|---|---|---|
| Two active rows never share a name | 5 | 5 — refused before the write | 5 — same | 4 — one row, but by rewriting the other | 2 — nothing refuses it in Local Mode |
| The decision is not lost or reversed | 5 | 5 — never enqueued unless it will hold | 4 — nothing lost, but nothing achieved | 3 — achieved, and something else lost | 1 — the visible reversal this avoids |
| Works in all three modes | 5 | 5 — local check, no network | 5 — same | 2 — needs partitions the device lacks | 1 — Local Mode has no guard |
| The retire is not a trap | 4 | 5 — the refusal carries the way out | 2 — dead-ends the common case | 4 — works, at a price | 2 |
| One rule, not two | 3 | 4 — reuses `findNameCollision` | 4 — same | 3 | 5 — no client rule at all |
| **Total** | | **107** | **86** | **72** | **48** |

---

## Decision

A restore is refused on the client whenever an **active** row holds the name it would write, and
the refusal offers a replacement name that is written **in the same mutation** as the cleared
marker. The matching rule is `findNameCollision`, asked against `activeItemList` /
`activeTemplateList` — the population the partial indexes range over, which is also why two
*retired* rows may share a name and why restoring one of them then blocks the other.

The server keeps its own answer and needs no change: a colliding restore that reaches it anyway
— from a device whose master partition was stale — is rejected as `constraint_violated`, the row
stays retired, and ADR-031 repairs the device. The client's check is not a substitute for that;
it is what keeps the user from ever meeting it.

## Consequences

**Positive**
- The retire stops being one-way, which is what FR-24.3 promised and what M23 now delivers.
- The check is the first FR-24.3 rule the client can be *authoritative* about in Server Mode,
  because the master partition is pulled whole — a smaller and simpler contract than ADR-032's.
- No schema change, no endpoint, no wire change. The restore is an ordinary master mutation.

**Negative / accepted costs**
- A restored row may carry a different name from the one it was deleted with. Nothing records
  that it was renamed on the way back — the conflict log is for merge losers, not for this.
- The rename is offered without checking whether the two rows are actually the same thing. A
  user who *wanted* a merge has to do it by hand, and FR-16.3's merge-duplicates flow on M9 is
  where that lives.
- One more place asks `findNameCollision` a question about the active list. If a fourth name
  space is ever added, this call site has to be found with the others.

**Neutral**
- The same rule governs items and Vorlagen. `templates.name` is unique across both scopes, so a
  group's restore can be blocked by a Ferien-Vorlage; the sentence names which, because that
  reads as a fact rather than as a bug.

## Revisit Trigger

Either of two observable changes. **The indexes stop being partial** — if FR-16.3's uniqueness is
ever moved back over all rows, retiring no longer frees the name and this entire decision is
moot. Or **a real merge arrives**: if M9's merge-duplicates flow (FR-16.3) grows the ability to
repoint `source_item_id` across partitions, Option C stops being unimplementable and becomes the
better answer for the case where the two rows genuinely are one thing.
