# M11 — Container Management

Every id is read clause by clause against the built screen; the notes per case say which layer keeps what.

* **FR-10.3's threshold is a fixed 15 %, by decision, and there is nothing here to configure.** `imbalanceThreshold()`
  is the constant `IMBALANCE_THRESHOLD_PERCENT`; no screen writes a per-trip threshold (the M3 wizard writes `season`,
  `transport_mode`, `accommodation` and `tags`; M16 the series' defaults of the same three; M22 name, dates and
  travelers). A percentage field is wanted only by someone who has met a warning they disagree with. **Revisit
  trigger:** a warning that fires wrongly.
* **E2E-M11-01** `all` (FR-10.1) — **implemented across M11-05/06** (`e2e/containers.spec.ts`): create/edit/delete
  containers with name, carrier, max weight. **The carrier is *optional***: M11-05 hands a bag to Andy and reads the
  name off the card, which a chip that could only ever hand it on would satisfy just as well. Taking the carrier off
  again is a write rule, so it is asserted at the write layer — `components/trips/__tests__/ContainerSheet.spec.ts`,
  tapping the active chip calls `updateContainer` with `carrier_traveler_id: null`. Red-proved by making `toggleCarrier`
  always assign.
* **E2E-M11-05** `all` (FR-10.1/25.15/24.5) — **implemented** (`e2e/containers.spec.ts`, mutation-proved: a one-sided
  pair write fails it): the ＋ FAB creates a container and opens its sheet; name and weight limit save on change with no
  Save button. Pairing is set **on both sides at once** and released on both when cleared. (The *deletion* half of that
  rule is asserted by E2E-M11-04, where it is visible; this case's containers are empty, and an empty pair renders
  identically whether or not the survivor was released.) **„No Save button"** is asserted beside the visible indicator,
  the positive signal the absence stands against. Red-proved with a Save button added to the sheet. (The *signal* the
  indicator is handed is `saveIndicatorWiring.spec.ts`'s — a scan over all four call sites, see E2E-M5-07.)
* **E2E-M11-08** `local` (FR-10.2, ADR-075) — **implemented** (`e2e/containers.spec.ts`): the
  unassigned bucket selects like the other lists. Three rows, one container. A **real right-click** on a row starts
  the mode with it picked and opens **no** picker; the next tap on another row picks it (the count reads two) and
  still opens no picker; the bar's *In Gepäckstück …* opens the picker once, its subject line naming the two
  positions, and choosing the container leaves **exactly the unpicked row** in the bucket, the mode ended and the ＋
  FAB back. The app bar's checkbox glyph then arms the mode with nothing picked. The single-tap path is
  E2E-M11-06's, unchanged.
* **E2E-M11-09** `local` (FR-10.2, UX-13) — **implemented** (`e2e/containers.spec.ts`): the dev seed's per-person
  shape, imported as a portable trip (three travellers, a Regenjacke each, a Sonnenhut for two, a row of Andy's, rows
  for the whole trip). **No two bucket rows read alike**: the rows' visible texts are all distinct — before UX-13 the
  three Regenjacke rows were three equal strings, so the assertion fails on the old screen. The siblings read
  *Regenjacke Andy / Sia / Leonardo* in the trip's traveller order, a whole-trip row names nobody, and the picker opened
  from Sia's row says *„Regenjacke · Sia"*. The one-traveller rule is unit-owned (`rowTravelerName`).
* **E2E-M11-07** `all` (UX-8) — **implemented** (`e2e/containers.spec.ts`): with zero containers and nothing
  unassigned, the unassigned section is **absent** — "everything is assigned to a container" must not stand under "no
  containers yet". Creating the first container brings the section back with its (0) count and hint, which is the
  positive signal the absence is asserted against.
* **E2E-M11-06** `all` (FR-10.2/25.5) — **implemented** (`e2e/containers.spec.ts`; the no-grid assertion counts
  `ion-select`, not `button` — Playwright CSS pierces shadow DOM, where ion-item's own tap surface is a native button):
  the unassigned bucket renders **one row per item** (asserts no per-container button grid); tapping a row opens the
  container picker with each container's current load, and choosing one assigns the item. Deleting a container
  **unassigns** its items — they must still be on the packing list afterwards. The FR-25.5 half of the credit is this
  last clause and nothing more: *„assignment never blocks packing"* is asserted by every M4 case that packs an
  unassigned row, and no case here needs to restate it.
* **E2E-M11-02** `all` (FR-10.3) — **implemented** (`e2e/containers.spec.ts`; the weight arrives through the app's own
  paths, M10 minimal form → quick-add suggestion): weight bar goes amber at ≥90%, red beyond max. The *boundary itself*
  is unit-owned (`budgetLevel` in `domain/__tests__/containers.spec.ts`); what the e2e adds is that the grade reaches
  the painted bar and that the sheet words the overrun — a rule can be right in the domain and never arrive on a pixel
  (G-14).
* **E2E-M11-03** `all` (FR-10.2) — **folded into M11-06, and narrowed to what the screen does**: unassigned bucket;
  assign an item **into** a container; deleting a container unassigns its items first. Moving an item *between*
  containers is deliberately not an M11 gesture — an assigned item leaves the bucket and the cards do not list their
  contents, so the screen offers no path to it. Re-assignment lives in M5's container control (`m5-container`), and is
  **E2E-M5-22**.
* **E2E-M11-04** `all` (FR-10.3) — **implemented** (`e2e/containers.spec.ts`, asserted on both cards of the pair;
  mutation-proved: emptying the delete path's release writes fails it): pairing control shows a live imbalance indicator
  against the threshold, and **deleting one side releases the other** — the survivor stops reporting an imbalance
  instead of weighing itself against a container that no longer exists. The skew is what makes that assertable, which is
  why the rule is asserted here rather than beside the pairing case. **The threshold it is measured against is a fixed
  15 %** — see the note at the top of this block.
