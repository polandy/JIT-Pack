# Concept — excursions: a small packing list inside a trip

**Status:** **built** (2026-09-26) as PRD Addendum **§3.31 (FR-31.1–FR-31.12)**, UI-Spec **M27 *Ausflüge*** and
**ADR-077**; those are authoritative, and this file is the reasoning they were decided from. Written 2026-09-26 on the
owner's request; the owner settled fourteen questions and the three UI points the same day (§7).

**As built — where the build differs from what follows.** The screen is **M27** (M26 went to the notes' threads while
this was being written; read *M26/M26b* below as M27 and its excursion page). `excursions` carries **no `author_id`
and no `created_at`**: nothing reads them, and a stamped column is a `serverOwned` entry with nothing behind it. The
reminder is **a kind of its own, `excursion_due`**, sent the day before and on the day by ADR-076's run, with its own
M17 switch — one notification per excursion rather than a line inside another kind's. *Vor Ort besorgen* writes no
shopping entry: it turns the line into a *vor Ort* line, which M6 shows as a **projection** under the excursion's name
through a new `ShoppingLine.section`. M4's trace is a quiet line under an open row, not a chip. *Als Gruppe speichern*
writes the group directly (`planGroupFromExcursion`) rather than through M21. The schema step is migration 009.

**Asked for:** inside a trip, sub-packing-lists for day trips and multi-day excursions — a hike, an overnight hut stay
during a longer holiday — packed from the trip's things, and **reusable in other trips**.

**Nothing existing covers it.** The specs never name an excursion. The three near neighbours each miss one half:

| Neighbour | Has | Misses |
|---|---|---|
| Gruppe (FR-27) | reuse across trips, add-after-creation (FR-27.10) | merges into the one trip list by master item — no own identity |
| Container (FR-10) | a named bag inside a trip | per trip, not reusable; a row is in exactly one container, so never in suitcase *and* daypack |
| Repack (§3.11, removed 2026-07-17) | a second packing of the same things | removed as "not wanted" — the packing it did was the whole trip again, on the way home |

---

## 1. The shape, in one paragraph

An **excursion** is a trip-partition entity with a name, an optional date range and its participants. It owns **its
own rows** with **their own packed state**, so the daypack is ticked on the morning of the hike regardless of what the
suitcase said three weeks earlier. A row may **point at a trip row** — *this comes out of the suitcase* — or stand
alone (lunch, bought on the spot). An excursion is **started from a Gruppe** and can be **saved as one**: reuse is the
template system that exists, not a third kind. Anything the excursion needs from home **also lands on the trip list**
while the suitcase is still open, so it is not left behind.

## 2. Decisions

| # | Question | Decided | Cost accepted |
|---|---|---|---|
| 1 | Relation to the trip list | Own list, own packed state; a row may link a trip row | A second packed state beside the trip's |
| 2 | Reuse | From a **Gruppe**; *Als Gruppe speichern* the other way | A group is read two ways: merged into the trip, or as an excursion |
| 3 | Same kind of outing twice | **Each outing its own excursion**, with its own date | Three hikes are three lists that may drift apart |
| 4 | Needed but not on the trip list | **Added to the trip list too**, linked; *vor Ort* rows stay excursion-only | The excursion writes into the trip list |
| 5 | Who goes | A **subset of the travellers**, default all | Per-person rows expand per excursion, not per trip |
| 6 | Date | **From–to, optional while planning** | An undated excursion sorts last and never reminds |
| 7 | Coming back | **No return check** for now | A thing left at the hut goes unnoticed |
| 8 | Where | A **fifth pill** in the trip switcher, *Ausflüge* | Six pills on a ⋮ view; E2E-G12-07 must prove 360 px |
| 9 | Created after the suitcase is closed | Missing rows stay **excursion-only, marked *nicht im Gepäck*** | The rule of #4 has an exception |
| 10 | How much of M4 | A **lean checklist** | No packer, container, weight or comments on an excursion row |
| 11 | Portable backup | **Not included**, like tasks, notes and shopping entries | Restoring loses the trip's excursions; the groups survive |
| 12 | Its own template kind | **No** — follows from #2 | — |
| 13 | A thing per participant (a sleeping bag each) | **M4's own shapes over the participants**: the FR-25.28 for-whom strip and the FR-25.1 cluster | The composer's strip and the cluster are shared with M4, so they take the excursion's roster as input |
| 14 | Participants change after creation | **Per-participant rows follow**: a joiner gets a row, a leaver's open rows go | A stored *for everyone* flag on the row, and a packed row outlives its person |

## 3. Data model

Two new tables and one join, all in the **trip partition** (ADR-022: one merge, field-level LWW, cascade with the
trip). Schema change ⇒ `schema.sql` **and** `migrations/006_excursions.sql` (invariant 2).

**`excursions`** — `id`, `trip_id` (cascade), `name`, `starts_on TEXT NULL`, `ends_on TEXT NULL` (ISO dates; `NULL`
both = undated; one-day = equal), `source_template_id` (the group it came from, provenance only), `created_at`,
`author_id` (server-stamped, invariant 3), `field_hlcs`, `updated_hlc`.

* **No cross-field CHECK on `starts_on <= ends_on`**, for the reason `assignee_user_id` has none: field-level LWW
  merges each field alone, and two devices editing either end could produce a pair the CHECK rejects mid-merge. The
  client orders the pair on write; the reader treats a reversed pair as its min–max.

**`excursion_travelers`** — `(excursion_id, traveler_id)`, a row per participant. A row per person rather than a
column, for the reason `note_acks` is (ADR-073): two devices adding different people must both win. **No rows = all
travellers**, so a trip that gains a traveller later includes them in an excursion that never narrowed.

**`excursion_items`** — `id`, `excursion_id` (cascade), `trip_item_id NULL REFERENCES trip_items ON DELETE SET NULL`,
`source_item_id NULL` (master item), `name`, `category_name`, `assigned_traveler_id NULL`, `quantity`, `packed_count`,
`state` (`open`/`partial`/`packed`/`skipped` — no `packing_now`, decision #10), `mode` (`pack`/`buy_local`),
`not_in_luggage INTEGER` (decision #9, see §4.3), `for_all_participants INTEGER` (decision #14, see §4.5),
`field_hlcs`, `updated_hlc`.

* **Its own `packed_count`/`state`, never the trip row's.** The link says *where the thing comes from*; it does not
  share a tick. That is what lets the daypack be packed while the suitcase is long closed, and what makes three hikes
  three packings.
* **`trip_item_id` is nullable and `SET NULL` on delete**: removing the suitcase row turns the excursion row into a
  standalone one rather than deleting it — the hike still needs the thing, and §4.3's marker takes over.
* **`for_all_participants` is stored, not inferred** from *every participant has a row*: two participants with a
  row each read the same whether the line was made *für Andy und Sia* or *für alle*, and only the second one should
  grow a row for Lio. Every row of the set carries it, so a device holding any one of them can act.
* **Name and category are copied**, as `trip_items` copies them from the master: an excursion row reads by itself,
  without a join into a row the device may not hold.

## 4. Behaviour

### 4.1 Creating an excursion

M26's ＋ asks for a name and — optionally — dates and participants, then offers **the group picker of FR-27.13**
(search by group name and by items inside, peek per FR-27.12) or *leer beginnen*. Instantiation is a **new pure
function** in `client/src/domain/excursion.ts` (invariant 4), reusing `resolveTemplate` and the per-position rules of
`generateTripItems`: conditions, `per_person` expanding over **the excursion's participants** (decision #5),
`trip_global` once, dedup `max`/`sum` inside the excursion.

### 4.2 Linking into the trip list (decision #4)

For each resulting excursion row with `mode = pack`, while the trip's packing is **not closed** (`packing_closed_at`
null, ADR-070):

1. find a live trip row with the same `source_item_id` (and the same `assigned_traveler_id` for a per-person row);
2. **found** → link it; if its `quantity` is below the excursion row's, raise it to the excursion's (**max, not sum**
   — the hike borrows the suitcase's water bottle, it does not need a second one). A *skipped* trip row
   (*bewusst nicht einpacken*, FR-5.5) is **not** revived silently: the excursion row links it and wears §4.3's marker;
2. **not found** → create the trip row (provenance: the excursion's group, per FR-27.10) and link it.

`buy_local` rows (lunch) never touch the trip list. A group position's `buy_before` becomes `pack` here: bought
before the trip means it is in the suitcase by the time of the hike.

The whole creation is **one snackbar undo**, like FR-27.10's group add — the trip rows it created or raised go back
with it.

### 4.3 After the suitcase is closed (decision #9)

When `packing_closed_at` is set (or the trip has started — the same *before is over* test as FR-7.12 uses), step 2/3
**do not write the trip list**. An excursion row that has no packed trip row behind it carries
`not_in_luggage = 1` and shows *nicht im Gepäck* with one action: *Vor Ort besorgen* → a shopping entry in the
*Vor Ort* list (FR-30, through the kernel contract `kernel/shoppingSources.ts` — the excursion code does not import the
shopping module). The marker is **stored**, not derived, because *was it in the luggage when we left* is a fact about
the moment of creation that a later edit to the trip list must not rewrite.

### 4.4 Packing an excursion (decision #10)

A lean M4: rows grouped by category, tick / partial / skip, quantity, per-participant clusters (§4.5), add a row
(from the trip list first — *aus dem Gepäck* — then the inventory, then free text), and the §3.28 item mark. **Not**
on an excursion row: packer, container, weight, comments, `packing_now`. A row linked to the trip shows a quiet
*aus dem Gepäck* line; that is all the link is visible as.

### 4.5 A thing per participant (decisions #13, #14)

**Defining it.** The excursion's composer carries M4's **for-whom strip** (FR-25.28) — *Gemeinsam*, *Alle*, an
avatar per participant — with the **excursion's participants** as its roster, not the trip's. *Alle* writes one row
per participant at one each with `for_all_participants = 1`; named avatars write rows for those people only, flag
off; *Gemeinsam* writes one row with no traveller. A group position marked `per_person` arrives as *Alle*. The strip
is absent on an excursion with fewer than two participants (G-8), as it is on M4.

**Reading and ticking it.** The rows render as M4's **FR-25.1 cluster**: the name once with `done/total` in units,
folded by default with a face per instance, one child row per participant with its own tick and stepper. Each child
links the trip row of **the same traveller** (§4.2 matches on `assigned_traveler_id`), so Sia's sleeping bag comes
out of Sia's part of the suitcase. A shared row can be turned into a per-participant set and back, from the row's
detail, with the same strip.

**When the participants change.**

* **Someone joins** → every `for_all_participants` set grows a row for them at the quantity the set's rows share
  (one when they differ), open, and §4.2/§4.3 run for the new rows: linked into the suitcase while it is open,
  *nicht im Gepäck* once it is closed.
* **Someone leaves** → their **open** rows are removed. A row they already ticked (packed or partial) **stays**,
  marked *nicht mehr dabei*, because the thing is physically in the rucksack and deleting the row would hide that;
  skipping or removing it is one tap. Rows named for that person without the flag are treated the same way.
* One snackbar undo takes back the whole participant edit, rows included.

The trip list is **not** shrunk when someone leaves: the suitcase row may serve another excursion or the trip itself,
and the max-not-sum rule of §4.2 never lowers a quantity.

### 4.6 Saving as a group (decision #2)

M26 ⋮ *Als Gruppe speichern* → the M21 flow (FR-27.5) scoped to the excursion's rows: new group, positions from the
rows (a `for_all_participants` set collapses back to one `per_person` position, `buy_local` survives as the position's
default mode). Updating the group it came from is **not** offered; FR-27.4's refresh does not reach excursions — an
excursion is a packing, not a subscription.

### 4.7 Time (decisions #3, #6)

* **M26 lists** dated excursions by `starts_on`, undated ones after them under *ohne Datum*, past ones folded at the
  end. A row: date range, name, `packed/total`, participants' initials when not all.
* **M1** shows an excursion **on its start day and the day before** as a card in the hero's list (through
  `kernel/tripCards.ts`), because the daypack is packed the evening before as often as the morning of.
* **The morning reminder** (ADR-076's server clock, six o'clock) names an excursion starting today with open rows.
  It is the same run and the same one notification per person, one line more — not a second job.
* **No return check** (decision #7). An excursion is over when its `ends_on` has passed; its list then reads as
  history and stays editable.

### 4.8 The three modes (invariant 5)

* **Local:** everything works; there is no server, so there is no morning reminder — the M1 card is the reminder.
* **Single-User:** everything works, including the reminder (ADR-076 already sends it there).
* **Server:** excursions are trip data — every member sees and ticks them; `author_id` is stamped, never trusted.

## 5. UI surfaces

| Where | What |
|---|---|
| Trip switcher (G-9, ADR-051) | Fifth pill *Ausflüge*, glyph + badge = excursions **upcoming or today** with open rows |
| **M26 *Ausflüge*** (new) | The list of §4.7; ＋ FAB creates (§4.1) |
| **M26b** — one excursion | The lean packing list of §4.4; head: name, date, participants; ⋮: edit, *Als Gruppe speichern*, delete |
| M4 | A trip row linked by an excursion shows the excursion's name as a chip (like FR-7.6's task chip) — so skipping it in the suitcase is not done blind |
| M1 | The card of §4.7 |
| M8 / M7 | Nothing new — a group is a group |
| `docs/` | A new page *Ausflüge* in the user manual |

## 6. The ADR owed

**ADR-077 — An excursion is its own list that borrows from the trip, not a view on it.** The real trade-off is
decision #1 against the removed Repack: a second packed state is exactly what was cut in July. It is justified here
because the second packing is of a **different, smaller set on a different day**, chosen per outing — not the same
list run backwards. Options weighed: filtered view (no second tick), container (a row in one bag only), own list
(chosen). Revisit trigger: a request for a *return* tick (decision #7), which is Repack's second half coming back.

## 7. Settled with the owner, 2026-09-26

Rows 1–12 of §2 — rounds 1–3 of the walk-through, the recommended option taken everywhere except #3 (each outing
its own excursion rather than one re-packed list).

Rows 13–14 followed the same evening, on the owner's addition that an excursion must be able to say *a sleeping
bag per participant*; both took the recommended option.

**Settled on the rendered mockup** (`UI_Concept_Excursions_variants.html` at `6b148419`, built by
`build-excursions-variants.mjs` at `6b148419`), the recommended variant each time:

* **The pill's glyph** is the signpost, `trailSignOutline` — it fits a hike, a boat trip and a town trip alike.
* **One excursion is its own route** under the trip, not a sheet or an accordion — room for the whole list, and a URL
  for M1's card and the morning reminder to open.
* ***nicht im Gepäck*** is a second line under the row with its action *Vor Ort besorgen*; the row stays in its
  category and the §3.28 mark is not painted on (FR-28.5/G-15).

## 8. Test plan (sketch)

* **Domain (Vitest, `excursion.spec.ts`):** instantiation over a participant subset; link-or-create with max
  quantities; skipped trip row not revived; closed packing ⇒ `not_in_luggage`, no trip write; save-as-group round
  trip; *Alle* over the participants; a joiner grows every flagged set, a leaver loses open rows and keeps
  packed ones as *nicht mehr dabei*; a per-participant row links the same traveller's trip row.
* **Store/API (Go, real SQLite):** the three tables in the trip partition; cascade on trip delete; `SET NULL` on trip
  row delete; `author_id` stamped; migration chain ends where `schema.sql` does.
* **E2E (M26):** create from a group → rows on the trip list too; tick the daypack while the suitcase is closed;
  a sleeping bag *für alle* ticked per participant, then a participant added; closed trip ⇒ *nicht im Gepäck* →
  *Vor Ort besorgen* lands in M6; switcher's five/six pills at 360 px (E2E-G12-07 extended); Local mode.
