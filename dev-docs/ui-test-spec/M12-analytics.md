# M12 — Analytics

All seven ids are implemented and read clause for clause against the screen. **M12 is a screen of
derived numbers, so most of its promises are kept in `domain/analytics.ts` and only their *rendering* is e2e work** —
the bar order (*heaviest first*), the unweighted row's exclusion from the bars, the slice keys and the trend arithmetic
are all unit-owned, and each case below says which layer answers for what. What e2e alone can establish is that the
number reaches a pixel and that the switcher and the bars actually move it.

* **E2E-M12-01** `all` (FR-8.1/8.2/**10.4**) — **implemented**: two weighted rows, one packed and one not (`5.0 kg / 6.0
  kg`, two different numbers — one packed row would let a KPI printing the planned weight twice pass), one of them in a
  bag
  created through M11's own FAB, and the *Gepäck* view splitting them into the named bag and the absence bucket — two
  slices where *Kategorie* had one, so a dead segment fails on the count alone (`analytics-slice-none` alone is rendered
  by both views for an uncategorized item). This is the case that renders FR-10.4's dimension over a real bag.
  Mutation-proved twice: pointing `dimensionKey`'s container case at the absence bucket, and printing `plannedWeight` on
  both sides of the KPI.
* **E2E-M12-04** `all` (FR-8.2/25.11) — **implemented**: a picked bar lands on M4 **filtered** to that value — asserts
  the facet is set (a row outside the slice is gone), the removable chip names the value, and clearing the chip reveals
  the grouping that came along. Regression guard: setting only the grouping fails every assertion but the last. The
  clause *„clearing every other facet, since the reader picked these numbers"* is **unit-owned**
  (`composables/__tests__/usePackingFilter.spec.ts`, seven cases on `setStoredFacet` including a stale
  facet from a previous mount) — the e2e world has only one facet in force, so an assertion here could not tell a
  replacement from an addition.
* **E2E-M12-08** `all` (FR-8.2/25.11) — **implemented**: bars are picked, not followed. Two of three
  Person bars are picked and land on M4 as **two chips of one facet**, OR'd — both picked rows stay and the third
  person's row is gone, which a single-value handoff cannot produce. On M12 itself: no button while nothing is picked,
  the count follows each pick, a second tap takes one back (`aria-pressed`), and switching the dimension away and back
  drops them.
* **E2E-M12-05** `all` (FR-8.2/25.1) — **implemented**: with rows assigned per traveler, the Person view shows **one
  contribution per traveler** plus the *Shared* bucket and no `undefined` bucket; the Category view sums the same rows
  into a single bucket, so the totals match across dimensions. (The multi-row per-person cluster shape is unit-owned in
  `analytics.spec.ts`, same rule.)
* **E2E-M12-02** `all` (FR-8.2) — **implemented**: an item without weight is counted beside the chart ("＋ n …"), never
  drawn as a zero-width bar; with no weighted rows the bar card states its empty state **and no KPI tile stands under
  it** (UX-11 — the visible empty state and the unweighted counter are the settled positive signal beside the two
  absence assertions). **Which layer keeps which half:** *„never drawn
  as a zero-width bar"* is unit-owned — this case's world has no bars at all, so the interesting arrangement (one
  weighted row *and* one unweighted, one bar not two) exists only in `domain/__tests__/analytics.spec.ts`. What the e2e
  keeps is that the counter and the empty line are painted and the tiles are not.
* **E2E-M12-07** `all` (FR-8.1, UX-11) — **implemented**: the value KPI exists only when something carries
  a value — a priced master item quick-added to the trip renders the tile with the locale-formatted amount, while
  E2E-M12-02's price-less world renders no tile at all. **The amount is unit-less here because the case is `local`** —
  `formatValue` carries (FR-21.9) the instance's currency where one is named, and Local Mode has no
  server to name one. That half is E2E-M9-09's, on the `single` project, and it is the same `formatValue` on both
  screens; a currency assertion added here would assert the absence of a feature the mode cannot have.
* **E2E-M12-03** `all` (FR-14.3) — **implemented, both halves**. The absence half: with a series but no
  archived history the trend section is *absent* rather than empty. The positive half: last year's trip taken through
  the whole lifecycle by hand — a weighted row packed, the trip started, the thing nobody had packed typed in (which is
  where FR-9.1 *missing* comes from), then archived — and this year's trip in the same series draws one trend column
  labelled with last year's year and carrying its **packed** kilos, with "Powerbank · 1× missing" in the flag list
  beside it. The flag is read back off the stored row in M5 before archiving, because an empty flag list would report a
  never-written flag just as quietly. The trip is moved out of *planning* through M4's start action (E2E-M4-43). **A
  third clause (C-3b):** the section heading names the *series*, not the trip — `trip.series_name` is a field no writer
  fills, and falling through to the trip's own name would say „Series Elba 2026 · trend" about a series called Elba.
  Mutation-proved three times — pointing the trend at *active* trips, dropping *missing* from the flag counter, and
  putting the heading back
  on the trip name each redden it.
* **E2E-M12-06** `all` (FR-8.2/25.18) — **implemented** (`e2e/packing-list.spec.ts`): opening a picked slice sets the
  grouping M4 comes back with, asserted after clearing the facet chip the same step set. Crosses the screen boundary on
  purpose: M12 and M4 each hold their own grouping state and each is self-consistent, so no unit can see the handoff
  between them break. ADR-012 leaves one router outlet, so M4 is **not** remounted on the way back
  and a value written only to storage would not be read until the next cold start.
* **Not implemented, and not a test gap — there is no way from M12 to M11.** UI-Spec M11's *Navigation* line says
  *„from the luggage button in M4's toolbar … and from M12"*. `AnalyticsPage.vue` pushes
  exactly one route, `/trips/{id}`: opening a picked *Gepäck* bar sets the container facet and lands on the packing
  list, which is FR-8.2's own action and a different thing from opening the bag's screen. No case id claims the M12→M11
  edge (E2E-G9-11 covers M4↔M11 only), so nothing is red — the sentence describes an affordance the screen does not
  have. **Open decision:** add the edge (the natural place is the *Gepäck* view's header, not the bar, whose tap
  is already spoken for) or strike the clause. UI-Spec M11 says it is not built; no other document leans on it.
