# M1 — Dashboard "My Tasks"

* **G-18 (A Create That Leaves Happens Once):** Where a control writes a whole object and then
  navigates away from the screen it was pressed on, the control is spent by the first press. Between the write and the
  repaint the button is still under the finger, and the second press is a second object — a trip with the same name, the
  same dates and the same positions, with nothing on either screen to say it happened and no undo that names it. The
  button therefore reports itself as disabled from the moment it is pressed, and the action refuses a second run even
  when it is reached by another route: M3's *Reise erstellen* is also G-16's default action, so the Enter key can press
  it without a second tap. The latch is **one-way**, because the act ends by leaving; it re-opens only where the act
  reports that it did nothing — M19's clone of a trip that has since been deleted writes nothing, navigates nowhere, and
  leaves a screen that must stay usable. Sites today: M3 step 4, M19's clone. Not a rule for a control that stays on its
  screen — a quick-add writes a row and the screen is still the answer, and pressing it twice means two rows on purpose.
* **G-20 (A Selection Wears The App Bar):** While a list is selecting
  (`useRowSelection`, ADR-075), the app bar **is** the selection's bar: ✕ on the left, *„Nichts ausgewählt"* /
  *„N ausgewählt"* beside it, *„Alle N"* on the right, and the sync glyph (G-2, unconditional). Back, the G-12
  cluster, the ⋮ and the gear give way, since each would leave or change the screen under a half-made batch. The page
  registers the selection (`setHeaderSelection`, keyed by route path like the cluster); the bar renders it. **Why the
  bar and not the page:** a counting bar inserted into the list's flow on entry, above the rows, would move every row
  under it down — the user would lose the row they had just held (M6, M25, M9; M11 and M23 alike). G-19's rule for
  banners, applied to a bar the user summons: **starting a selection moves nothing on the page.** The tools above a
  list stay where they are: a **filter** (M9's search and tag chips, M25's *Meine*) stays live, because narrowing is a
  way to choose; an **input** (M6's field and its tag chips, M25's composers) stays in place **at rest** — dimmed and
  `inert` — because typing a new entry mid-batch is a different act. The actions stay in the floating bottom bar. A
  **sheet** has no app bar (the tag manager, M9): there the sheet's head is the bar — the line under the title counts
  the selection, *„Alle N"* joins the checkbox icon, and the checkbox icon, lit while the mode is on, is the way out.
* **G-19 (A Banner That Can Arrive Never Moves The Page — ADR-060):** The frame's banners sit under the
  app bar, and which of the two kinds a banner is decides where it lives. A banner that can appear **while the screen is
  in use** — FR-19.7's update offer, flipped by a worker that finished installing — renders in the frame's own layer
  **over** the content (`.app-banner-layer`), never in the column: a bar inserted into the column shifts every target
  below it out from under the finger already reaching for one, and the press then lands beside the control while the
  app reports nothing at all. **The layer is the column's, not the window's (ADR-060 amendment 1):** it begins at the
  page head's last pixel and is the width of the content column, because it is a child of that column contributing no
  height to it. What it costs is stated rather than avoided — the layer covers the top band of the content while it is
  up, and a press aimed at that band during its arrival hits the banner, which is visible under the pointer when it is
  hit. What it must **not** cover is the frame's own head: the screen's name (G-9) and whatever the screen hangs beside
  it, M4's view switcher above all, because half a control still reads as a control and takes the press that the banner
  then swallows. On a screen that collapses its head the layer rises with it, and the band it covers is the content's.
  A banner that can only ever be present **from the first paint** — FR-19.8's migration bar,
  whose flag is read at boot after a reload — stays in the column, where it costs nothing and reflows nothing that was
  already on screen. The same rule is why M5's desktop panel is fixed beside the list rather than squeezing it.
* **Purpose:** Single entry point answering "what do I have to do right now?" across all active trips (FR-6.1).
* **The first active trip is a hero card, the rest stay list cards (FR-21.13).** It carries when the trip is, who is on
  it, a progress ring with the share in words beside it, a track, and — in the hero itself — the same preview of what is
  still open the card has. There is exactly **one** hero: a screen has one thing you are on, and a second hero is a
  second answer to which one that is. It is the only card in the app that paints brand on its own plane (G-11). The
  active trips are ordered **soonest departure first** — the hero is the head of that list.
* **A finished packing recedes (FR-5.10).** On a trip whose packing has been declared finished, the hero and the trip
  cards below it drop the packing **figure**: the phase has moved on, and a ring is the loudest thing on the card about
  a question that is settled — the date line's phase word says it instead (below). What is still owed moves up into the
  space: the trip's tasks become the card's one figure at the lone ring size (FR-7.4), and the shopping card under it
  opens on *Vor Ort* (FR-30.8). The open-rows preview needs no rule — it lists open rows, of which a finished list has
  none, and a row added afterwards belongs there. (E2E-M1-25)
* **The *Heute* card (FR-29.7).** On a trip's days, the planner module's card (`PlannerTodayCard.vue`, through
  `TRIP_CARDS`, first of the two) stands under the trip as a `.jp-card` (`dashboard-today-<trip>`): its head
  *„Heute · Fr., 2.10."* with the count of what is still to come, a link onto M29 (`dashboard-today-<trip>-head`); then
  at most **three** of today's lines from the next one on, as M29's `DayLineRow` — a timed line leaves once its time
  has passed, a connection once its last leg arrived, arrival and departure are left out — ticked and opened as on
  M29, the plan's own entries opening M29; then *„+ n weitere · Tagesplan ›"* or *„Tagesplan öffnen ›"*
  (`dashboard-today-<trip>-more`), and *„Für heute ist nichts mehr geplant."* in place of the lines once nothing is
  left. Once the packing is finished it is a block of the hero after the task block, drawn by `DashboardBlock`
  without a field — a line of the plan wants a time the field cannot take. Before and after the trip's days, and on a
  trip without both dates, there is no card. (E2E-M29-11)
* **The hero after the packing (FR-7.10, ADR-074, from `UI_Concept_DashboardAfterPacking.html`).** Rendered from top to
  bottom on a trip whose packing is finished:
  * **Date line:** the dates, then a dot and the phase word (*Vor Ort* once the packing is finished, *Packen* until
    then, on every trip card), in `--jp-done` once finished and `--ct-subtext0` before. The word is the packing stamp,
    not `listInFocus` (FR-7.10).
  * **Name row:** the trip's name, and opposite it the day counter in the action ink with its second line in
    `--ct-subtext0` — *in 3 Tagen*, *Abreise heute*, *Tag 2 von 7* / *noch 5 Tage*, *Letzter Tag*, nothing afterwards;
    without an end date *Tag 2*, without a start date none. The meta line follows.
  * **Two blocks** in the sunken surface (G-14) side by side, stacked below the width where both do not fit at 300 px.
    Each: a head — the name in the label role, the open count in the numeric face at 24 px (*„12 offen“*; a done tick
    when none) and an arrow — then the field (48 px input, 48 px ＋), then the rows, then the *„+ n weitere · … ›“* line.
  * **Rows** are 52 px high at body size 16: the title, and beneath it what kind of task it is (its tag, or the row it
    prepares) or the quantity at 13 px, the **check box on the right** as a 28 px box inside a 56 × 52 px target that
    reaches the card's edge. In Server Mode the assignee's name follows it. Order and counts: Aufgaben four, the phase
    in front of the trip first, mine first; Einkauf seven of the list in focus. A task may carry a due day (FR-7.11):
    its pill (M25's) leads the second line, and the pressing ones — overdue, today, the next two days — lead the block,
    earliest first, ahead of the phase rule. The block's field writes *during* (FR-7.12: it is shown only once the
    packing is finished, and a finished packing closes *before*).
  * **Local Mode's reminder (FR-7.11):** with no server to send the morning's push, M1 says once per app start, as a
    toast, *„N Aufgaben fällig"* — the open tasks due by tomorrow across the active trips, the overdue included — once
    their rows are on the device, and nothing when there are none. The due purchases are counted beside them (FR-30.10):
    *„1 Aufgabe und 2 Einkäufe fällig"*, or *„2 Einkäufe fällig"* alone.
  * **Folding:** the head is a button (`aria-expanded`), the arrow turns, the rows collapse over about 0.3 s while
    fading and the blocks below follow; `prefers-reduced-motion` skips the motion. A folded block keeps head, count and
    field; its rows leave the tab order. Both start open, and the state is remembered per block on this device.
  * **Feedback:** a tick takes the row off and raises the app's snackbar with *Rückgängig* (the shopping block:
    FR-30.7's undo bar). An entry added to an **open** block appears on top, tinted for a moment; added to a **folded**
    one only the count pulses and the snackbar says *„Milch“ zu Einkaufsliste hinzugefügt* / *„Post nachsenden“ zu
    Aufgaben hinzugefügt*. The block never unfolds by itself.
  * **Empty (G-7):** the block stays; done tick in the head, the field, and a quiet sentence in the place of the rows —
    *Für unterwegs ist nichts notiert.*, *Vor Ort ist nichts zu kaufen.* / *Vor der Reise ist nichts zu kaufen.*
  * **Foot:** a 48 px bordered control, *Packliste öffnen ›*, leads to M4. Links: the card's head into the trip, a
    block's *„weitere“* line into M25 / M6 (its head folds it), and none inside another. The Playwright cases are in the
    ledger (`dev-docs/e2e-ledger/`).
* **Its blocks are the app's card (FR-21.28).** Every section on M1 — delegation, last-minute, prep, the trip cards
  under the hero, the planned lookahead — is `.jp-card` (G-14) under a section head (G-13). Ionic's card would sit 10 px
  further in than the hero above it, at a quarter of its radius and under a shadow from a system nothing else here uses.
  A section's count sits with the name in the head, so it is set in the numeric face; the titles carry no icons, as
  section heads elsewhere have none. The cards under the hero carry the hero's own `ProgressFigure` at the list ring
  size, not a full-width progress bar with a count written beside it — one progress design for the screen, and the same
  one M2's rows read.
* **Elements:** The greeting is the screen's **page head** (G-9, FR-21.27) — its title, with *„Was beim Packen ansteht"*
  as the meta line under it — and is therefore drawn by the frame, at the same place and size as every other screen's
  name; the greeting buckets the hour: *Guten Morgen* 05–11, *Guten Tag* 12–17, *Guten Abend* 18–21, and a neutral
  *Hallo* through the night (UX-15: 00:14 is not morning, and night deliberately makes no time-of-day claim). The rule
  is the pure `greetingKey` in `lib/greeting.ts`. Trip cards render their dates through the one `formatTripPeriod`
  formatter (UX-5, see M2); grouped card list per active trip: open packing items (a count and three of them) and the
  trip's open tasks. The list is **not filtered to me** — M1 aggregates every open row of every active trip, and a
  personal filter would empty the screen in Local and Single-User Mode, where nobody is assigned anything (Addendum
  FR-6.1 carries the ruling and the highlight that replaces it; E2E-M1-01); **no order defines which three rows** the
  preview shows — they are the first three of the store's own array, whose order after a reload is IndexedDB's over
  random ids. Two sections sit beside the aggregation. *Delegated to me* is a card above the trip list: every open row
  assigned to me across active trips, what arrived **since this device last showed the section** marked and sorted to
  the top, and a count of the new ones on the header. It is a **section beside** the aggregation and not a lens over it
  — a filter empties the screen in the two modes with no account, and G-8 hides this card there instead. *„Seit dem
  letzten Besuch"* is a device-local **set of row ids** rather than a timestamp: a row carries no assignment time, and a
  set answers the question identically after a clock change or a week switched off. It is written when the screen is
  **left**, by either exit — an in-app navigation and the browser leaving the document are two different events and only
  one of them runs a Vue hook. *Last things to pack* is the FR-5.1 section: the flagged, still-open rows of a trip
  departing **today**, absent on every other day, because a permanent section counting down to a date is a different
  feature. **Planned trips section:** below the active trip cards, a *Geplant ({n})* card lists every trip in `planning`
  — the lookahead, so a trip created but not started is on a screen the app opens on. Sorted by departure, soonest
  first, with the undated ones last (FR-2.1b makes the date optional, and „no date yet" says the departure is unknown,
  never that it is imminent); each row names the trip and its period through `formatTripPeriod` and leads to the trip,
  the way an active card does. **Involvement needs no filter here:** in Server Mode the master feed carries only the
  trips this account is a member of, and the two modes without accounts have nobody to be involved — so the device's
  trip list *is* the list of trips I am part of. The card is **display-only**: unlike the active trips above it, no
  planned trip's partition is fetched or subscribed, because nothing on the row is read out of it and one request per
  planned trip would buy numbers this section does not show (E2E-M1-08). ~~**Preparation Todos section (FR-7.3)**~~ —
  **one card (FR-7.6, ADR-068).** A preparation is listed in the *Aufgaben* card below, among the trip's own tasks and
  named by the chip of the row it prepares; the chip **leads to that row's M5 sheet**, on an element that is a link for
  the keyboard and for assistive technology too. ~~Tapping a todo toggles it resolved~~ — **M1 takes no actions**, so
  the card lists the tasks as text and they are resolved in M4 or M5 (E2E-M1-02, E2E-M1-07).
* **Tasks section (FR-7.4, FR-7.6 — *built*).** An *Aufgaben* card under its section head (G-13, the open count beside
  the name) **reports, never operates**: M1 takes no actions. It lists every active trip that has at least one trip
  todo, soonest departure first — the hero's order — each as a block that leads into the trip: the trip's name, its own
  check (*„1 von 2 erledigt"*, or *„✓ Alle Aufgaben erledigt"* in `--jp-done` once none is open), and its open tasks as
  plain text — an assigned one followed by its assignee's name in `--ct-subtext0` (*„Pflanzen giessen · Sia"*, FR-7.5),
  one that prepares a row followed by that row's chip instead (FR-7.6), which is the one link on the line and leads into
  the row. The block's head is the other link, and leads into the trip; the two are never nested. A trip without any
  task is left out, and the card is absent when none has one, so no empty editor stands above the hero. **The trip cards
  carry the check too:** the hero as the **packing share's pair** — the same ring (both step down to 46 px while
  paired), *„1/4 Aufgaben"*, *„3 offen"* while any is open, and a track, in `--jp-done` like the share's (G-11). Side by
  side where both sentences fit, headlines on one line and tracks on another; stacked where they do not, which is a
  phone — each column's basis is the ring, its gap and the longest sentence measured, so no breakpoint is involved and
  no sentence is ellipsized. Each list card below the hero keeps one line, *„Aufgaben: 2 offen"* or *„Aufgaben: alle
  erledigt"*. Both are present only when the trip has at least one trip todo, and neither is folded into the ring, the
  track or the share. The todos are written in M4 (*Aufgaben für die Reise*). All three modes; nothing here is
  server-only (G-8). (E2E-M1-10, E2E-M1-11) The hero of a trip whose packing is finished carries its own task block,
  which is worked in place, and this card leaves that trip out (FR-7.10, ADR-074).
* **The *Neue Notizen* card (FR-7.9 decision 1/2, FR-7.13 — *built*).** M1's one deliberate exception to *„M1 takes no
  actions"*: a card under a section head lists up to three **threads** with something new for this reader — an entry by
  somebody else created or edited after their tick reached, or after their own latest entry — across active trips, the
  newest unseen entry first. Each row is the thread's name (its title, or the first line), then that entry as *„Chris:
  Danke! Parkplatz ist Nr. 12"* with *+n* when more are unseen, and the trip's name; the words open **that thread's own
  view** (`/trips/:id/notes/:threadId`) — **and, beside them, its own tick**, a control of its own rather than the row's
  `button`, the way the shopping card's per-row check-off already is. Ticking calls the same `toggleNoteTick` M26 uses,
  reaching the thread's newest entry (`seen_through`), so the row leaves the card until somebody writes again. **The
  card is absent** where it has nothing to show — or (Single-User/Local, G-8) there is no other author for anything to
  ever be new from. **Modes:** Server only; the other two never populate it, because nothing is ever new without a
  second identity (FR-7.9's own reasoning, not a separate gate here). (E2E-M1-14)
* **The *Ausflüge* block (FR-31.10 — *built*).** Under its section head, a card lists every excursion of a trip that
  is not archived **starting today or tomorrow** while its list has something open, today's first: *„Heute:
  Tageswanderung"* / *„Morgen: Hüttentour Supramonte"*, then *„0/8 gepackt · Samedan Sommer"*; a row opens the
  excursion's own list (M27). Absent when there is none. All three modes. (E2E-M27-01)
* **Actions:** Tap card → M4 (E2E-M1-01); pull-to-refresh forces a sync of every active trip. ~~deep link into M4 *at
  the item*~~ and ~~swipe an item row → quick-complete~~ are **not built**: the preview rows are neither links nor
  sliding items and their checkboxes are deliberately `disabled` — the card is the only affordance. G-4's landing is
  exercised from a notification instead (E2E-G4-01).
* **The shopping card (FR-30.7 — the one card M1 lets you work).** Under each trip's card, as a sibling (the trip card
  is a link): title *„Einkaufen"* (*„Einkaufen · Elba 2027"* under a planned trip), two chips *Vor der Reise (n)* · *Vor
  Ort (n)* with the list that is *now* pressed — *Vor Ort* for a running trip, *Vor der Abreise* for a planned one —,
  the field *„Was kaufen? z. B. Milch, Brot …"* with ＋, at most five lines (own entries first, packing lines after them
  with a *Packliste* tag, the amount when above one), each with a check-off. A check-off shows *„„Brot" gekauft ·
  Rückgängig"* inside the card. Last line: *„Zur Einkaufsliste →"*, or *„Alle 7 anzeigen →"* past five. No remove, no
  reveal, no stamps — those are M6's. A running trip always has the card (with *„Vor Ort ist nichts zu kaufen"* when
  empty, once the rows are here, ADR-033); a planned trip has it only while something is left. The card is the way onto
  M6 from here (FR-30.5). A dated entry wears M6's due pill after its name, and the pressing ones — overdue, today, the
  next two days — lead the lines, earliest first (FR-30.10); the hero's *Einkauf* block (FR-7.10) does the same, the
  pill leading the row's second line as a task's does. (E2E-M6-35)
* **The screen loads what it aggregates.** A trip partition arrives when its trip is opened, so in Server Mode an M1
  that did not ask would count an empty store: every active trip rendered with „0 offen", no preview rows and no prep,
  until the user had visited each trip in that page session. M1 therefore calls `ensureTripData` for each active trip
  **as the list arrives** (a watcher, not a mount hook: the trip list itself comes with the master partition, which on a
  cold boot has not landed yet), and **subscribes to each trip's channel**, which is what makes FR-4.4's live delegation
  possible at all — a device sitting on the dashboard hears about the trips it is displaying. Local Mode rehydrates
  everything from IndexedDB on boot.
* **States:** Empty (**no active *and* no planned trips** — a trip that exists but has not started must not leave the
  screen saying there is nothing) → CTA "Plan a trip" → M3 (G-7, E2E-M1-05); offline → cached data with glyph. ~~badge
  counts update in real time via WebSocket (FR-4.4)~~ — **there are no badges on M1**; a trip's card recomputes from the
  store like everything else, and the delegation that FR-4.4 would announce arrives as an FR-6.2 toast (E2E-FLOW-02).
* **Navigation:** Tab 1. Deep-link target from notifications.
