# UI Specification: „JIT-Pack" — Screens & Interaction Design (v1.10)

**Document Status:** Proposed for Review
**Basis:** Base PRD + Addendum v2.10 (Consolidated)

**Platform Targets:** Mobile-first (Capacitor iOS/Android), responsive web — mobile is the primary design target, but
every screen must remain fully and comfortably usable on desktop (G-9). All screens must function fully offline
(NFR-4.1); sync state is surfaced globally, not per screen.

---

## 0. Global Patterns

These patterns apply to every screen and are specified once.

* **G-1 (Navigation Model):** Bottom tab bar with four tabs: *Dashboard*, *Trips*, *Templates*, *Items*. Everything else
  is reached contextually (drill-down, bottom sheets, wizards). Settings via avatar in the top bar. In Single-User Mode
  (Addendum FR-17.2), there is no account to display, so the avatar is replaced by a plain settings-gear icon; it still
  opens M17.
* **G-2 (Sync Indicator):** A persistent, unobtrusive status glyph in the top bar: synced / syncing / offline (queued
  changes count). Tapping it opens the sync detail incl. the conflict log (NFR-4.2a). **Local Mode (Addendum 3.19):**
  the glyph shows a distinct *local* state (device icon) instead of the three network states — but it reports *syncing*
  while a write to IndexedDB is still open: FR-19.2 calls an applied change durable, and saying "on this device" before
  the transaction closed would be a promise made before it was kept, which a reload in that window turns into apparent
  data loss; tapping it opens the storage & backup detail (FR-19.6: persistence status per NFR-4.11, last portable
  export, one-tap export) instead of the conflict log — conflicts cannot occur in Local Mode. A write that *fails* shows
  the offline state, since there is no truthful "on this device" to show; **the next write that lands clears it again**.
  Local Mode has no connection to lose, so the state means only "the last write did not stick", and leaving it set would
  strand the glyph on offline for the rest of the session. **Durable queue (B2/NFR-4.1):** the queued-changes count is a
  property of the *queue* rather than of the offline state — it stays on the glyph whenever something is unsent, because
  the outbox is durable and a queue outlives the connection state that produced it (a reload, or a trip partition still
  waiting for its trip to be opened); hiding it the moment the glyph says *synced* would claim everything had been sent
  while it had not. The detail sheet adds two lines beneath the count: that the changes are **saved on this device**, or
  — when the browser refused to keep them — that closing the app now would lose them; and, when the server has refused a
  change outright, that it was taken out of the queue so the rest could go, is kept on the device and will not be
  retried. Both are Server-Mode-only: Local Mode has no queue and no server to refuse anything. There is no screen
  listing the refused changes individually (revisit trigger in Sync-API §5.1). **The refusal says why:** a third line
  names the reason of the most recent one — not allowed, sent for another trip, other data still refers to it, the
  two-level template rule, or something it refers to is gone — because a count on its own describes a divergence nobody
  can act on: the app has usually already removed the row the server kept. Only the closed vocabulary Sync-API §5 lists
  is rendered; anything else the server says is a diagnostic, and the general line above is what the user gets. **And
  the refusal is undone, not only reported (ADR-031):** the row the server refused goes back to what the server holds —
  it arrives through the ordinary pull, because the refusal re-logs it — so the change disappears from the screen by
  itself. That is why it is also **said**: one toast per push, naming how many changes were refused and, where the
  vocabulary above has a sentence for it, why. One per push for the same reason the merge toast below is, and without an
  *Ansehen* action, because there is no screen listing refused changes to lead to; the detail sheet's reason line is the
  record. Server Mode only: Local Mode has no server to refuse anything. **A merge is announced, not only logged
  (NFR-4.2a):** when a push comes back `merged` — the server kept another device's value and dropped a field of this
  one's — the app raises **one toast per push** naming how many fields were overwritten, with *Ansehen* leading to that
  partition's conflict log; the detail sheet carries the same count as a standing line for the rest of the session. One
  per push rather than one per conflict, because a reconnect drains a whole queue at once. The toast is the *telling*
  and the log is the record: without it the outcome is indistinguishable from `applied`, so the only way to learn an
  edit had been overwritten would be to go looking for a log nothing gave you a reason to suspect. **Live updates have a
  line (Sync-API P-1/§9):** in Server Mode the detail sheet states whether the WebSocket is open — *„Live-Updates sind
  verbunden"* or, while it is not, that they are not and a reconnect is under way, with the other devices' changes
  arriving on the next sync until then. Not a fifth state and not on the glyph: the four states describe *this* device's
  changes reaching the server, which stays true of a device whose socket is dead — such a device would otherwise look
  synced while hearing nobody, leaving a one-directional sync unexplained. Both outcomes render a sentence, so the
  absence of live updates is a line and not a blank. Local Mode has no socket and shows neither. **The last failed
  request is named (FR-19.6):** in Server Mode the sheet carries one diagnostic line — the method, the path and the
  status of the last request that failed, or that nothing answered at all, with the time — plus a note saying to read it
  out when reporting a problem. Four situations share one glyph and a failure shares none of them, so *offline* alone is
  the same word for a 401, a 500 and a dead radio; the person holding the device needs something to report and the
  maintainer, whose instance keeps no request log, something to work backwards from. Three rules the line follows: the
  status, the method and the path are **not translated** (a diagnostic is copied, not read as screen copy); a later
  success does **not** clear it, because a background drain that failed under a green glyph is the case nobody was
  watching; and a 401 the token refresh repaired is not a failure and never appears. Local Mode sends no requests and
  shows no line. **The last completed sync is stated (FR-19.6):** one line in Server Mode, absent until a cycle has
  completed this session. **Waiting update (NFR-4.13):** when a newer build of the app is installed and waiting for the
  next launch, the glyph carries a small action-coloured dot and the detail sheet states, above the mode-specific half,
  that a new version is ready and takes over the next time the app is opened. It is an annotation on the glyph, not a
  fifth state — the sync story is untouched. **The announcement carries an action (FR-19.7):** the sheet's sentence has
  *„Jetzt aktualisieren“* beneath it, and — because reaching that sentence costs knowing what the dot means — a **bar
  under the app bar** carries the same action on every screen, with a *Später* that hides the bar for this load while
  the dot and the sheet keep the offer. The bar says that unsent changes are kept, because the press reloads the page.
  It is the only thing that shortens the wait: nothing takes over unprompted, and an origin with no service worker
  renders neither surface (ADR-019, ADR-044). **The conflict log takes a loss back (NFR-4.2a's second half):** each open
  entry carries a *Revert* control beside the losing → winning line; an entry already reverted says so instead, because
  a revert is spent once. The page states in one line that reverting writes the losing value **again, as a new change
  that reaches every device**; where a value is one half of a coupled pair (a pack's state and its count, FR-5.4) both
  halves come back and both rows read *reverted* afterwards — the word „revert“ invites the expectation of an undo, and
  it is not one (ADR-023). Every refusal is rendered **on its own row** rather than as a snackbar: the entry was already
  reverted, the row has since been deleted, the merge rules outrank the restore (an item packed meanwhile), or the
  caller may not write that row. The row is where the reader is already looking, and a sentence there stays readable —
  unlike a snackbar, which on this app lands on the tab bar. Local Mode never shows the log at all, so the control
  cannot appear there. **An entry is written for a reader:** the row names the *thing* — the trip, the item, the
  inventory article — and the *column* in the app's language, not the table and field of the schema; both values are
  rendered decoded, so a name arrives without the JSON quotes it is stored in and a flag reads as a word rather than as
  `true`; and the timestamp follows the app's language rather than the device's. A column whose value **is** a foreign
  key resolves too — an assignment reads *Mia → Andy*, not one uuid to another. Two deliberate limits, each a case of
  saying less over saying something untrue: anything this device cannot name — a row deleted since, one never pulled, an
  id belonging to a partition it has not loaded — falls back to the *kind* of thing, or to the id itself; and a column
  with no word for it keeps its own name. **There are two logs, one per sync partition** — a single log reached from a
  trip would hide the other partition's losers behind nothing. The detail is reachable from the glyph on every screen,
  not only where a trip's log is open. The storage facts are read *before* the sheet opens, because an auto-height sheet
  is measured once at presentation and a section arriving a tick later pushes its last line under the tab bar; and the
  backup age is clamped at zero, because the sheet captures `now` when it opens while the stamp is written when the user
  taps (*"Last backup -1 days ago"*). The tooltip is on the catalogue (NFR-4.12). **The glyph belongs to the *title*:**
  the two are centred on each other and the explanation is indented to the title's edge; the ✕ sits on the title's line,
  since a 38 px circle and a 29 px line flush at the top cannot centre on each other. The sheet is in a visual baseline
  (E2E-VIS-08).
* **G-2b (Who Is Packing Right Now — FR-4.9):** the sheet behind the status glyph also answers *who else is at work*. A
  section **„Packing right now"** sits under the live-updates line: one row per person per trip they have open in the
  packing list — the person's name over the trip's name, a tap closes the sheet and opens the trip. **An empty list says
  so** (*„Nobody else is packing right now."*) rather than dropping the section, so the sheet never looks unfinished and
  the absence is assertable. **Absent altogether in Local and Single-User Mode** (G-8): there is nobody to be told
  about. It lives here because this sheet is where a person looks to see who is around. It is not G-10: G-10's facepile
  lives in M4's header and speaks about one trip; this is the account-wide answer. Test ids `sync-detail-online`,
  `sync-detail-online-<name>`, `sync-detail-online-nobody`; E2E-G10-03.
* **G-3 (Presence & Locks):** Items locked via *Packing Now* (FR-5.3) render with the locker's avatar and name ("In
  progress by Andy") and are non-interactive for others except viewing. **The lock reaches M5, not only M4's row:** a
  locked row opens its sheet — viewing is the half G-3 keeps — but the sheet leads with a banner naming the holder and
  every control that writes is gone or disabled, the *Details* fold included. It is all-or-nothing on purpose: a sheet
  where the quantity is frozen and the container is not would be a third state with no model behind it, and the accepted
  cost is that a note cannot be left on a row while somebody packs it. A row that names no holder still says it is being
  packed. **A claim has no lifetime** (FR-5.7, ADR-028): nothing about a row's age changes how it renders, and the row
  keeps naming its holder however long they take. **A claim can be ended by the person holding it:** the row I claimed
  says so to *me* — nothing is locked for my own device, so without a word there I cannot tell that I am holding it
  against everyone else — and its press-and-hold menu offers *Artikel wieder freigeben* and nothing else, since packing
  it is already the checkbox's job and skipping something you are mid-way through packing is not a thing anyone means.
  The state it returns to is derived from the packed count rather than remembered, because the claim overwrote whatever
  was there. **And a claim can be ended by somebody else, by taking it over:** a locked row's press-and-hold menu
  carries exactly one entry, *Übernehmen* — every other action on it belongs to the holder — and it confirms first,
  naming the holder and the row ("Sia packt „Zelt" gerade. Übernehmen?"). Confirming makes the row *mine*: it does not
  pass through free, because a takeover happens in order to pack the thing. The holder is told (FR-6.2, its own M17
  toggle) and the trip records it. There is no time-based "you can take over" line: a row never silently stops being
  locked. **The takeover is the one server-side part of the lock:** only the server can stamp who took over and notify
  another account. It is therefore absent in Local Mode and in Single-User Mode, per G-8 — there is nobody to take a row
  from — while the release stays in all three.
* **G-4 (Deep Linking):** Every notification and dashboard entry resolves to `trip/{id}/item/{id}`; the target screen
  scrolls to the item, flashes it once, and expands attached comments/tasks (FR-6.3).
  **A screen that shows one trip loads that trip's partition itself** (U-10, E2E-G9-18): it says it is watching the
  trip and pulls its rows on mount, rather than relying on having been reached through M4 — otherwise, in Server and
  Single-User Mode, a link or a reload straight onto M6, M11, M12, M14, M16, M21 or M22 would paint that screen's empty
  state over rows that are on the server (the ADR-033 mistake, one screen up). Local Mode does not need it: the whole
  database is on the device before the first screen renders.
* **G-5 (Optimistic UI):** All mutations commit locally first and render immediately; server confirmation is silent.
  Failures surface via the sync indicator, never as blocking dialogs.
* **G-6 (Quantity Stepper):** Wherever quantities appear, a unified stepper component is used: tap = ±1, long-press =
  complete/zero (quantities are bare numbers, FR-1.8). **Decided: items with quantity = 1 use a plain checkbox instead
  of the stepper**; the stepper itself only ever appears for quantity > 1.
  **A gesture the browser or the finger took away writes nothing:** the stepper runs on the same `useLongPress` as the
  row around it, so its holds disarm on `pointercancel`, past the travel slop, on leaving the button and on unmount. A
  timer of its own would let a flick beginning on ✚ either pack the row completely — the browser takes the pointer to
  scroll with it, so neither an up nor a leave ever arrives and the timer runs out undisturbed — or step it by one.
  Leaving the 28 px circle cancels the tap, which is what a native button does, and the two holds are driven by unit
  test rather than by Playwright: `pointercancel` is the browser taking the pointer away and cannot be asked for from a
  case.
  **The checkbox is a target, not a glyph (E2E-G6-03):** on a row it answers a tap within 12 px of the glyph on every
  side, as far as the row's own edge. The glyph alone is 24 px wide, and the 44 px control column around it stops every
  click so that the row does not open M5 — without the wider target a thumb that landed beside the box would do nothing
  at all, and one just below it would open the sheet. The target is widened by an overlay, not by the box, so the glyph
  keeps its place and the name column (UX-9) its width. M5's large checkbox (FR-21.25) carries no overlay: it is its
  own target, and the skip button sits close beneath it.
* **G-7 (Empty States):** Every list screen defines an empty state with a single primary action (e.g., Templates empty →
  "Create first template" / "Import from spreadsheet"). **One component renders all of them**
  (`components/global/EmptyState.vue`): a centred column of illustration, the one sentence that names the state, an
  optional second line in the smaller size, and the control that leads out of it. **The spacing is `48px` above and
  below and `24px` from each edge** — the inset is not decorative, it is what keeps a sentence that wraps from running
  edge to edge under a centred glyph (E2E-G2-09). **The sentence is regular weight**: nothing else is on the screen to
  compete with it, and where a second line is needed the hint's smaller size carries the whole hierarchy. Three shapes
  are deliberately *not* this: M14's "everything reviewed" is a success state and paints its glyph in `--jp-done`; M8's
  and M10's "not found" line is an error about one record; and the inline hints inside a populated section (M11's
  unassigned box, M8's group and position lists, M3's steps) annotate a section rather than replace a screen.
  **An empty state is a claim, and every one of them is gated on hydration** (ADR-033). A list that has not arrived is
  not an empty list, and G-7's sentence is exactly the one a user acts on — so the pattern has a state *before* itself:
  the same component, no illustration, one sentence saying the list is loading, and no primary action. Which fact
  answers „has it arrived" depends on where the rows come from, and there are three: `masterDataLoaded()` for the
  master partition (M1, M7, M9, M23, the FR-4.5 roster and M2 itself), `useTripScreen`'s `loaded` for a trip's own
  rows (M4, M6, M11), and — for the conflict log, which fetches rather than syncs — its own request having come back.
  The notice **persists for as long as nothing has arrived**, so an offline cold start stays on it: the G-2 indicator
  carries the reason and pull-to-refresh is the retry, and a screen must never borrow G-2's job by guessing an absence.
  The states that are *not* gated say why in the same breath: M9's *„no item found"* and M4's *„no matches"* sit behind
  a non-empty list, so reaching either already proves the rows are here.
  **And the gate covers every figure the screen derives from those rows, not only the sentence.** A count beside a
  segment label and a progress figure above a list are the same claim in the form a reader trusts *more* than a
  sentence — „Artikel (0)" over „Loading the archive …" states both answers at once, and the number is the one acted
  on. So a derived figure waits on the same fact its notice does, and returns the moment the rows make it a
  measurement: a genuinely empty tab is worth naming, which is why the count is deferred rather than dropped. Three
  carry it today — M4's header figure (hidden, and its band collapsed with it, so no empty container is left asserting
  itself), M23's two segment counts and M6's two tab counts; each has a plain catalogue key beside its `…Count` one,
  the pair `packing.shopping`/`packing.shoppingCount` already used. What is *not* gated is chrome that states nothing
  about the rows: M4's grouping caption names the user's own setting, and presence is about who is here rather than
  what is on the list.
  **Chrome that appears only for a populated list is the same claim in a fourth form** (M9): removing the FR-24.6 tools
  row and shrinking the bar to two glyphs states „there is nothing here" as plainly as a sentence would, and then jumps
  when the rows land. So a screen keeps the controls it is going to have until the rows say otherwise — `knownEmpty`
  there is `isEmpty && itemsKnown`, and it is what the chrome decides on rather than `isEmpty` alone.
* **G-1 icons:** the four anchors are Dashboard · **Trips (a train)** · Templates · Items. A plane would say something
  untrue about the household: these are ground journeys, and the anchor icon is the first statement the app makes about
  itself. The same list feeds the desktop rail and the mobile bar (`router/anchors.ts`), so the two cannot drift.
* **G-8 (Single-User Mode):** Single-User Mode (Addendum FR-17.1) shows no banner — it is visually indistinguishable
  from normal operation except for the absence of sharing, delegation, and notification UI, hidden per screen as noted
  in M2, M3, M5, and M17 below. **Local Mode (Addendum FR-19.3)** hides the same collaboration UI the same way and
  likewise shows no banner; its only visible marker is the G-2 *local* glyph.
* **An anchor switch is a root navigation, not a push (ADR-012).** The four anchors — in the bottom bar below the
  breakpoint and in the rail above it — are siblings with no back edge between them, so a switch *replaces* the outlet's
  page instead of stacking one on top. As plain pushes an interrupted switch would leave two pages live and the older
  one on top, so a tap on the screen the URL named would go to the screen two anchors ago (E2E-G9-17, E2E-G1-06). The
  anchors stay real links: the `href` is what makes them middle-clickable and readable as links, and only the default
  action is taken over.
* **G-9 (Header & Desktop Navigation):** The frame is two bands: the top bar, and — under it, inside the content column
  — the **page head**. The bar shows, left to right: the app logo on a tab root (a compact mark on mobile, the full
  wordmark from the desktop breakpoint up, a link/tap-target to M1) or **`‹ back` alone on every other screen**, and on
  the right the page's G-12 cluster, the ⋮, the sync glyph (G-2) and the avatar/settings control (G-1). The way out of a
  drill-down is the back-target contract rather than the logo (ADR-011). **The bar is part of the page, not a slab over
  it (ADR-049):** it is painted transparent and casts no shadow, so the page's own ground — and the G-11 wash at its
  top-left — runs under the bar, the head and the content alike.
* **The body is up to three columns, and the third is the detail pane (ADR-064).** Left to right: the desktop rail (≥
  900 px), the content column, and — when a screen has one open — a **detail pane** at `--jp-panel-w`. The pane belongs
  to the frame rather than to the screen: a screen teleports its pane into the frame's host, which takes no width while
  empty. Two consequences worth stating. A pane laid out *by the frame* cannot overlap the content column and needs no
  positioning to reach the window's edge — anything `fixed` inside a screen is bounded by the content column instead,
  since Ionic gives `.ion-page` `contain: layout`. And the content column **re-centres in what is left** when a pane
  opens, which is the accepted cost recorded in ADR-064. M5 is the only screen with one today.
* **The bar does not name the page (ADR-050).** The screen's name is the **page head**: an `h1` in the display role
  (`.jp-page-title`, G-13) with an optional second line under it — `.jp-meta` — naming what the screen belongs to, the
  trip for a trip sub-screen or the step for a wizard. It renders **once, in the frame** (`PageHead` in `App.vue`, above
  the router outlet and inside the content column), from the head each screen registers, so no view decides whether to
  have one; a screen that registers nothing gets no head. **Every screen registers one (FR-21.27)**, M1 included, so no
  screen's title sits lower or smaller than its neighbour's. A title in the bar's `ion-title` would render "Samedan
  Sommer" as "S…" at 390 px beside M4's cluster, and an `h1` each screen writes into its own content by hand drifts from
  the others. Accepted cost: the head is a fixed band rather than part of the scroller, so it does not scroll away; the
  revisit trigger is in ADR-050.
* **A trip's screen names the trip's other screens (FR-21.21, ADR-051 and its amendments 1 and 3).** Under the page
  head, and inside it — so it yields with the name where a screen collapses its head (FR-21.17) — the views a trip is
  *worked* in are a row of pills: *Packliste*, *Einkaufen (n)*, *Aufgaben (n)* and *Notizen* (FR-7.13), plus the view
  being looked at when it is none of them, so the row always marks where you are. **The current one is marked, inert and
  the only one in words** (its glyph at `--jp-icon-sm` beside the word); every other view is its G-12 glyph at
  `--jp-icon-md`, its count a badge on the glyph's corner, and its whole label (*„Einkaufen (12)"*) its `aria-label` and
  `title` — four words and their counts do not fit a 390 px phone. **Holding a glyph shows that label in a bubble**
  below it, which stays a moment after the release and does not navigate; a tap is one tap, from any of the trip's
  screens. *Gepäck* and *Auswertung* are words in the bar's ⋮ instead — the frame puts them there, from the same
  `meta.tripView` the row comes from, so the screens decide nothing in either shape and a view cannot be named
  differently in the two. The widest row, five pills while standing on one of the ⋮'s views, fits 360 px (E2E-G12-07
  measures it). **The notes' badge counts what is new for me, never the total, in the action colour** (`count-new`)
  where every other badge is grey.
* **The bar's cluster is capped at three glyphs (ADR-050).** A page describes its actions in registration order (G-12);
  the bar renders the first three that are not marked for the ⋮ and puts everything after them into the menu, ahead of
  the actions the page marked itself. Without a cap a screen gathers glyphs one at a time, because nothing says what
  full looks like. The right-hand group — ⋮ where anything is behind it, sync glyph, avatar/settings — is present on
  **every** screen, which is what keeps the conflict log reachable inside a trip. **One exception:** the gear hides on
  M17 itself, where it would only reopen the screen it is on; the sync glyph stays. **And because it is on every screen,
  M17 gives back the screen it was opened from:** a control offered everywhere cannot declare one true parent, so the
  route records where it was entered from and `‹` returns there — the gear tapped inside a trip comes back to that trip,
  not to the dashboard. The same holds for the two import flows (M15, M18), which are each entered from more than one
  screen. An entry that carries no origin — a notification deep link, a pasted URL — falls back to the declared parent
  (ADR-011, Navigation_Concept §7). There is exactly one header bar in the app, and exactly one page head; no screen
  supplies its own.
* **Desktop breakpoint (≥ 900 px, resolving Open UI Decision #4):** the bottom tab bar (G-1) is replaced by a persistent
  left-side navigation rail carrying the same four tabs (Dashboard/Trips/Templates/Items); the top bar then spans the
  remaining width and additionally hosts page-level primary actions inline (e.g., M2's "New trip" FAB, M4's G-12 action
  cluster) instead of floating over content. Below the breakpoint, the mobile layout (bottom tabs, floating FAB, compact
  logo mark) applies unchanged. **The content stops at a column (UX-17):** beside the rail the content area is **capped
  and centred** (the width is named two sentences down), one rule in `App.vue` for every screen rather than a decision
  each view has to remember — and the page head sits inside that column (ADR-050), for the same reason. Edge to edge a
  settings row would put its label and its control 1100 px apart and M9's tag segment would spread three chips across
  1176 px — lines that read as several things rather than one. The cap needs no breakpoint of its own: below it, it is
  inert, so the phone keeps every pixel it has. The **bar itself stays full width**, because it is the app's frame
  rather than its content — the logo belongs at the window's corner and the gear at the opposite one. **The column is
  600 px, and one measure — with one redefinition in the tablet gap.** `--jp-measure` in `theme/surfaces.css`, read once
  by `App.vue`. It is narrower than a reading column because this app has no page of prose: every screen is rows
  carrying a name at one edge and the control that acts on it at the other, and at 960 px that control would sit 855 px
  from its name on M8, 890 px on M12 and 857 px on M17. One measure rather than a per-screen choice because the trip's
  four views are peers a tap apart (ADR-051), and a column that changed width between them would move the page under the
  reader. It is still inert below its own width. A flat 600 px cap would leave that margin static above its own width
  too: on an iPad mini it would run the same 600 px as a phone turned sideways, stranding the frame's native scrollbar
  in the unused gutter instead of at the screen edge. Between 600 px and the app's one other breakpoint (900 px, G-9's
  own rail switch) `--jp-measure` is redefined to `92vw` — a real gutter rather than a near-miss, ~30 px a side on an
  iPad mini's 744 px — and 600 px again outside that band, both below it (already inert) and above it (E2E-M4-71 checks
  a 1280 px window keeps its column capped well under the window, which a single `clamp()` cannot do past 900 px without
  staying pinned there for every wider desktop window too — `vw` only rises with the viewport). The revisit trigger is a
  screen whose content is genuinely a page of prose or a wide table; a census rendering every screen found none.
* **G-10 (Trip Presence & Group Sync):** Distinct from G-2, which reflects only *your own* device's connection state,
  this pattern shows who else is currently on the same trip and whether the *group* is caught up. It lives in the
  trip-level header (M4's sticky header, not the global app header of G-9), since presence is meaningless outside a
  specific trip — **and only there**: M2's trip rows carry no facepile. Presence is scoped to a subscribed trip on the
  wire as well, so M2 would have to subscribe every listed trip to draw circles. **Everything the pattern knows is on
  screen** (E2E-G10-01):
  * **Facepile:** overlapping circular avatars of everyone currently viewing/editing this trip (sourced from the
    `presence` WebSocket event, Sync-API Spec §7). Mobile shows up to 2 avatars plus a "+N" overflow bubble; desktop (≥
    900 px) shows up to 4 before overflow, simply reflecting the wider header — the host screen passes the count,
    because it is a question about the header's width. **Whoever is still catching up sorts first**, so the overflow can
    only ever hide people nothing can be done about. A face is the FR-25.3 avatar, initialled from the person's display
    name and coloured from their account: the presence event carries the account id alone, and that id is a random hex
    key. Below two people the pile is absent entirely rather than shrinking to a lone face of oneself.
  * **Per-face state:** an **amber ring marks somebody still catching up**; a caught-up face is plain. The ring marks
    the exception rather than the norm: ringing everyone who *is* caught up repeats what the badge beside it already
    says, and leaves the one person worth noticing marked by an absence, which is harder to see. Best-effort by nature
    (it reflects only devices currently connected over WebSocket, never a fully offline one) and never blocks anything.
  * **Group-sync badge:** beside the pile, always present, and rendered in **the app's own indicator grammar rather than
    as a labelled chip** — a glyph, with the count in a bubble on its corner where there is something to count, exactly
    as G-2's `SyncIndicator` carries its queue. Green ✓✓ and no bubble when every present device's last-acknowledged
    pull cursor matches the trip's `change_log` head; the amber sync glyph with an amber count otherwise. The two are
    exclusive by construction. **The words are the element's accessible name**, not text beside it: the pile lives in a
    header next to the trip's own name, and a spelled-out sentence there competes with it — but nothing is lost to a
    reader who cannot see the colour.
  * **Tap/click on a face** spells that person out in a line under the pile — *„Bob · holt auf"* — with a ✕, and a
    second tap on the same face puts it away. There is **no per-person sheet**: its entire content would be three
    fields, one of which — the device count — nobody packing acts on, and it would put the single actionable fact (*who*
    is behind) one tap deeper than a pile that is already on screen. What the tap gives is the half a hover cannot give
    a touch device: the name. **The device count is not rendered anywhere**, though the wire carries it.
* **G-11 (Theming, Addendum 3.21):** The app defaults to a dark theme, **Nacht**, of its own palette — *Bergluft*,
  ADR-048 — in every mode including Local Mode, independent of OS color-scheme preference. Background depth
  (`crust`/`mantle`/`base`), surfaces (`surface0`–`surface2`), and text hierarchy (`text`/`subtext0`/`subtext1`) form a
  twelve-step neutral ramp with a blue-green bias; the ten accents are mapped onto the app's existing color-coded states
  rather than introduced per component — e.g. G-6's packed state, G-3's lock chip, M11's straw/ember weight thresholds,
  and M4's mode chips all draw from the same token set. A light theme, **Tag**, is available as an opt-in toggle in M17
  (Addendum FR-21.3); the choice is a device-local preference, applied before first paint to avoid a flash of the wrong
  theme (FR-21.4). ADR-048 records why the app carries a product palette rather than a syntax palette of fourteen equal
  pastels.
  * **Three anchors, and a role is what a component asks for (Addendum FR-21.7).** **Larch = brand**, **glacier =
    action**, **pine/moss = done**. The palette says which hues exist; the anchors say what they mean, and only one
    block decides. A screen never names a hue. Without them Ionic's own primary would paint the tabs, the FAB and the
    checkboxes, and the app would read as a stock Ionic app, where the concept prototype puts the brand on identity and
    keeps blue for what you act on.
  * **The brand is not the primary.** Ionic paints `--ion-color-primary` on buttons and links — things you act on — so
    it stays the action blue. Identity gets the few surfaces that actually carry it: the anchor you are on in the tab
    bar and the desktop rail (one rule, two presentations), the create FAB, the eyebrows, the preparation and shopping
    marks.
  * **Done is never the brand, and neither is progress.** A checked box, a progress bar and a completion ring run the
    moss→pine ramp. A brand-coloured progress bar reads as an alert rather than as headway — a trip ring brand-coloured
    below half would tell a user with an unpacked trip that something was wrong.
  * **Caution keeps its own hue.** Straw, not the brand. With the brand hue as `warning`, a container over its weight
    limit and the product's own identity would be the same colour, and the louder reading would win.
  * **A role is flavour-relative.** Nacht and Tag are not each other's inverse, so the same role can need a different
    hue in each: a pastel that is an accent on a near-black ground is a wash on a near-white one, and a stock light
    brand can manage only 2.45:1 as an 11 px tab label. Bergluft pays for this in the flavour blocks — Tag's accents are
    dark and saturated where Nacht's are light, every one of them measured above 4.5:1 as text on both the page and the
    card — so the anchors themselves are one declaration. Restate a role per flavour when it lands differently; never
    average the two into one value that suits neither.
  * **The components Ionic would paint itself are told once.** FAB, checkbox, toggle and progress bar are set in the
    token table as element rules, not per screen — so a FAB added six rebuilds from now is not a fresh decision about
    what colour the brand is.
  * **The wash (ADR-049 and its amendment 1).** The app carries a breath of the brand at its top-left — a radial wash at
    14 % on the page plane, painted once on the app element, behind the header bar and the page head. It is the one
    place identity sits on the ground rather than on a control. It stops there: the page itself paints an **opaque**
    plane, because a page that only glazes the app element shows the page behind it for the length of every transition.
    The active tab carries the same tint as a soft pill behind its glyph, so the anchor you are on reads at a glance and
    not only by comparing hues.
* **G-12 (Screen Actions in the App Bar):** A screen carries its actions as a **compact icon cluster in the global app
  bar (G-9)**, never as additional full-width rows of controls below it. It is the house pattern, M4 included: two
  stacked control rows (a labelled filter bar plus a "grouped by" line) make the product's core working screen restless.
  **Every icon-only control names itself (UX-13):** a button whose body renders no text carries an `aria-label` — a
  `title` alone is a tooltip, not a name. The rule is held over the source by `iconButtonLabels.spec.ts`, because bars
  grow unlabeled glyphs faster than per-screen cases can chase them.
  **A readout is not a control, and naming it is not enough (FR-25.15):** the rule above answers *what is this?*, which
  is a question about a thing that sits still. A glyph that reports a **changing state** — the save indicator is the
  built example — is asked *what just happened?*, and an `aria-label` does not answer it: a label that changes on a live
  region is not reliably announced, and neither is a region that appears already carrying its first words. Such a glyph
  is **`aria-hidden`** and the words go in a **permanent, visually hidden `role="status"` region** that is present
  before it has anything to say. `iconButtonLabels.spec.ts` deliberately does not cover these — it scans button-shaped
  elements, and a readout is a `span`.
  **And a cluster has an overflow (UX-13):** a page may mark an action `overflow`, and the bar then renders it behind a
  single **⋮** that opens the action sheet the row menus already use, where each entry is a **word**. The bar decides
  nothing itself — an unmarked action is always a glyph. An action whose meaning a glyph never carries belongs there;
  M4's *Suchen*, *Filter* and *Zuklappen* stay on the bar because they are tapped while packing.
  **The cluster has a size (ADR-050):** the bar renders at most **three** glyphs from a page's list and puts the rest
  into the ⋮ in registration order, ahead of the entries the page marked itself. The page chooses which three, by
  writing them first; what it cannot do is add a fourth without noticing. The trip's views are the switcher under the
  page head (FR-21.21, ADR-051), except *Gepäck* and *Auswertung* (ADR-051 amendment 1): they are ⋮ entries, contributed
  by the frame rather than by the page, and they **head** the sheet — where you can go first, what you do after. The
  page's own entries keep their order among themselves.
  **A ⋮ holds its own context and nothing else (ADR-051 amendment 2).** *Gepäck* and *Auswertung* are packing's, so the
  frame offers them only on packing's views (M4, M11, M12) — **M6 and M25 have no ⋮ at all**, and the packing pill is
  the way from there. What changes the whole trip rather than the packing — *„Reise-Eigenschaften"*, *„Reise starten"*
  and *„Reise abschliessen"* — is **M2's alone** (the row's hold menu and the hero's buttons). M4's ⋮ holds packing's:
  the two views, *„Packen abschliessen"* (FR-5.10) and *„Namen aus dem Inventar"* (FR-27.16).
  **An overflow entry runs after the sheet closes, never inside its handler:** while an overlay is up Ionic marks the
  router outlet `aria-hidden`, and an action that navigates from within the handler leaves that flag behind — the screen
  then renders and responds to every tap while being absent from the accessibility tree.
  * **Placement — the app bar, beside the gear.** On any screen reached with the back chevron (M4, M6, …) the cluster
    occupies the app bar's right side. The gear stays on every screen except M17 itself, because G-9's "back returns to
    where the gear was tapped" only works if the gear can be tapped anywhere. The cost — M4's bar carrying the cluster
    *and* the gear — is a known crowding finding (UX-13) and is decided there, not here. Root/tab screens show no
    cluster. Rationale beyond tidiness: M4's sub-header **collapses on scroll** (Addendum §3.25), so a cluster living in
    that sub-header would slide away mid-task — in the app bar the actions stay reachable while packing.
  * **Order and meaning:** 🔍 **search**, collapsed — the field appears below only when the icon is tapped, and its ✕
    *closes* it rather than merely emptying it, since an empty open field gives back the row the icon just reclaimed.
  * **One screen is exempt: M9 (FR-24.6).** The inventory's field is part of the screen, permanently, and the magnifier
    is not in its cluster at all. The collapse is paid for by the row it reclaims, and that trade only holds where
    searching is occasional; on a 184-row database the lookup *is* the screen's purpose, and a tap before every one of
    them is a toll. The exception is deliberately narrow — it is a property of the screen's job, not a licence for the
    next list — and the persistent row behaves differently in kind: it takes no focus on arrival (a keyboard nobody
    asked for covers the list), and its ✕ appears only with something to clear. E2E-G12-02 proves the pattern travels on
    M7 instead.
    Then the **filter** icon, carrying its active-value count as a badge (Addendum FR-25.11a/k).
  * **Icon-only controls must still be nameable — in the app bar.** Every icon-only control carries an `aria-label`,
    instance-wide and held over the source by `iconButtonLabels.spec.ts`; the **`title`** for desktop hover is the
    **bar's** rule alone (E2E-G12-06). The bar is the one place where the label is dropped *to buy room*, so it is the
    one place where the name has to stay retrievable some other way — everywhere else an icon sits beside the text it
    belongs to, and a tooltip would repeat what is already on screen. It costs nothing to keep, because the bar has no
    per-screen markup: `AppHeader.vue` renders back, the G-12 cluster (through `useHeaderActions`, whose `label` is
    already the accessible name), the ⋮ and the gear, and `SyncIndicator.vue` renders G-2 — five call sites, all
    compliant. The gate asserts it over the toolbar and over **whatever is slotted into it**, resolved from
    `AppHeader`'s own markup rather than listed, so the next bar control is covered without anyone remembering the file.
    It matches the attribute exactly, not as a *substring*, so the settings gear's `:aria-label="t('settings.title')"`
    cannot satisfy the tooltip rule. ~~shows the same name as a bubble on **long-press** for touch~~ — **not built.**
    G-12 already answers this question better in the same bar: an action whose glyph nobody can read is marked
    `overflow` and rendered behind the ⋮ **as a word**. A bubble would be a second, weaker answer — and a *third*
    meaning for a gesture the app already spends twice (FR-5.5's row menu, G-6's stepper holds), where colliding
    meanings are a defect. **Revisit trigger:** a bar glyph that turns out to be unlearnable moves behind the ⋮; if one
    ever cannot, the bubble is back on the table. **It has fired once (ADR-051 amendment 3):** the trip switcher's
    glyphs are destinations that are not in the ⋮, so a held glyph there shows its name (E2E-G12-08). The rule stands
    everywhere else; a switcher pill carries no other hold for the gesture to collide with. Note also that the *four
    navigation anchors* are not subject to the naming rule at all: both the rail and the tab bar render a visible label.
  * **What stays out of the cluster:** identity and progress. Identity is the **page head** (ADR-050); the screen's own
    header line carries the figures. Neither belongs in the action cluster. The line stays **unfiltered**, so real
    progress remains visible regardless of the current view.
  * **Active state still shows below.** When a filter is set, the removable chip row (FR-25.11a) appears under the
    header; when nothing is filtered, no row is drawn at all. The cluster is an entry point, not a status display — the
    badge says *that* something is filtered, the chips say *what*.
  * **Icons must be literal.** Concept testing rejected a generic cube standing in for both Shopping and Luggage: a cart
    means buying, a suitcase means luggage, and one glyph for two destinations defeats the point of shrinking labels
    away.
  * **Budget.** The cluster holds at most **three glyphs** (ADR-050, `MAX_BAR_ACTIONS` in `AppHeader.vue`); a screen
    needing more has the surplus rendered behind the ⋮ as words rather than widening the cluster. M4 fills the three
    with search, filter and fold-all.
* **G-13 (Typography):** The app has two faces, and which one a piece of text takes is decided by its **role**, never by
  the screen it happens to be on (Addendum FR-21.5). This is the counterpart to G-11: G-11 says where colour comes from,
  G-13 says where type does. Without it the client declares **no `font-family` at all** and renders in whatever Ionic's
  platform stack resolves to — a screen can land the information architecture faithfully and still not look like the
  prototype.
  * **Two faces, one job each.** **Fraunces** — a serif with an optical-size axis — carries titles and headline figures.
    **Hanken Grotesk** carries everything else, including every control. Nothing is set in a third face.
  * **The display face has five roles, and only those.** Page title (a tab root's own heading, e.g. *Trips*, and M1's
    greeting, FR-21.27), hero (a hero card's own name, M1/M2), sheet title (M5's item name), app-bar title (G-9),
    headline figure (a KPI number — `.jp-figure`). Everything else — item names, group headings, chips, labels, buttons,
    body copy — is the UI face. A trip row's name is **not** a title: it is a list entry, and setting it in the serif
    would flatten the very hierarchy the serif exists to state.
  * **Roles are defined once.** Family, size, weight, line height and tracking live in one place per role; a screen
    applies the role and adds nothing. A screen that wants a size the scale does not have is a signal about the scale,
    not a licence for a magic number.
  * **Figures that change in place are tabular.** Counters, quantities and weights are set in tabular figures — M4's
    `12/48` reflows on every pack otherwise, which is exactly the moment the number needs to be readable.
  * **Icons have their own scale.** `font-size` on an icon is a glyph box, not type; the two tables are separate so that
    a change to body copy cannot resize an empty-state illustration, and so that neither table has to compromise for the
    other.
  * **The body text is the table's too (FR-21.14).** A list row's name is one size whatever element carries it, a step
    above the line that qualifies it and at the weight that makes it read as the thing the row is about; text with no
    role of its own lands on the body size rather than on the browser's. Ionic decides none of the three.
  * **The head above a block is a sixth display role (FR-21.11).** A section head is set in the display face at the
    app-bar step, sentence case, with the section's own **count beside it** — right-aligned, in the UI face, one step
    smaller, recessive and tabular. Head and count share a baseline, and both come from one component, because the
    pairing is what rots when every screen writes its own margin.
    * **The count is a value, not part of the label.** Joining the two inside the translated string (*Open · 3*, *Own
      items · 1 of 2*) would set the figure in the display face and leave it nothing to align with. The catalogue keeps
      the sentence where the figures need a word between them; the head renders it as the count.
  * **A sheet's head is a component, not a shape each sheet draws (FR-21.12).** The sheet's name at the sheet title role
    with the h1 margin already declined, an optional second line under it at `.jp-meta`, an optional lead (a mark, a
    thumbnail, a state glyph) and an optional trailing indicator, and the way out. The lead sits against the **top** of
    the name, as the concept prototype draws it — a 38 px glyph beside a 27 px line cannot also be centred on it.
  * **The eyebrow is what is left, and it is a label inside a list.** Small uppercase in the UI face, opened up,
    recessive — the letter head in the inventory, the chip groups in quick-add, the word above a banner's sentence. It
    is never a section head: one class carries one job.
  * **Controls are set in sentence case (ADR-049).** Buttons and segment labels read as words — *Plan a trip*, *Archived
    (3)* — never as Material's tracked capitals. Decided once, as an element rule in the type table; the eyebrow above
    is the only uppercase role, and it is a label, not a control.
  * **The faces are served from the instance, never from a font CDN** (Addendum FR-21.6). Local Mode may have no network
    at all, so a face fetched at boot is a face that is sometimes absent.

* **The pack-out (M4, Addendum FR-25.2).** Packing is the app's most repeated act, and on M4 its result is that the row
  *leaves*. Three beats say so: the done colour washes over the row, it collapses to nothing, and a snackbar names it
  with one **Rückgängig**. The snackbar is the correction path the screen otherwise lacks — a mistap removes its own
  evidence, and recovering it through the reveal bar costs four deliberate actions. **One undo at a time:** packing is a
  run of taps, so a second pack replaces the snackbar rather than queueing behind it. Under `prefers-reduced-motion` the
  row still leaves and the snackbar still appears; only the travel is dropped. **Every act on M4's list raises this
  snackbar (FR-25.31)**, un-packing a revealed row included, though its result is on screen. Each names what happened
  (*„„Zelt": 2 von 3 gepackt"*, *„„Zelt": Menge 3"*, *„„Zelt" → Anna"*, *„„Zelt" wird spät gepackt"*, *„Du packst
  „Zelt""*, *„„Pass erneuern" gelöscht"*) and carries the one *Rückgängig*. The amount popover (FR-25.24) announces
  once, when it closes, and its undo returns to the amount it opened on.

* **G-14 (Surfaces):** The third of the pattern trio: G-11 says where colour comes from, G-13 where type does, G-14
  where **shape and depth** do (Addendum FR-21.8). It exists for a defect none of the other rules can see — a group card
  painted in a legitimate palette token that is the *same colour as the page behind it*, which is invisible in a
  stylesheet and obvious in a screenshot.
  * **Three planes, asked for by role.** **Page**, **card** — one step up, and where every list row lives — and
    **sunken**, one step down. A card is not a hairline: it is a lighter plane with a rim and a lift, and a component
    asks for `card` rather than for a palette token that happens to look right today.
  * **Every sheet leaves the same way (FR-21.12).** The round close control is one design, drawn once: a filled circle
    on the sunken plane with a rim, at the round-control size. No sheet draws its own — two designs for one control
    leave nothing recording which was meant.
  * **A row menu is a sheet.** Every hold/right-click menu is an `ion-action-sheet`, and it wears the bottom sheet's
    shape: the sheet radius on its top corners, the handle, the sheet plane and cast, and its header in the sheet
    title's type. Told once in the theme files rather than per call site, so a new menu cannot miss it; Material's flat,
    square slab beside the app's rounded sheets reads as two designs for one gesture.
  * **A dashed edge means *not yet* (FR-21.22).** It marks a place where something is missing and could be put: the
    empty picker slot, the quick-add invitation, the hand-over into the full inventory. A control that acts on content
    which exists is a solid, filled button — as the three reveal bars (FR-25.2, FR-25.11j) are, each stating in its own
    label the count of rows it is holding back.
  * **One card class, not a card per screen.** `.jp-card` carries the plane, the border, the radius and the elevation
    together; a screen positions it and adds nothing. **No screen keeps Ionic's `ion-card`** (FR-21.28): it brings
    Ionic's radius, inset and shadow with it, and the two surfaces read as two systems the moment they are on one page.
    Its children defer to it, so no row can repaint itself a shade off the surface it sits in.
  * **Radius is a six-step scale**: checkbox, inline control, block, card, sheet, pill. A radius that is half its own
    element's height is a **pill**, not a small step — that is what stray 2/4/7 px values all mean. A circle keeps
    `50%`, because a circle is a shape rather than a size. The checkbox has the smallest step of its own (ADR-049): on
    the inline-control step a 24 px box at 10 px renders as a circle and says *radio*, and a checkbox must not.
  * **One Ionic mode, and the controls Material would shape are told once (ADR-049).** The client runs in Ionic's `md`
    mode on every platform — left to detection, an iPhone renders iOS chrome while every baseline renders Material, so
    the household and the suite would never see the same product. On that one mode, the shapes Material would decide are
    decided here instead: a button is a pill without a shadow, a segment is a pill track on the sunken plane whose
    chosen option is a card-coloured pill (no underline), a checkbox is a 24 px rounded square, the header bar casts no
    shadow. Each is an element rule in the shape table, never a per-screen override.
  * **Elevation is one geometry in the flavour's ink.** Offsets and blur are written once; which colour a shadow is cast
    in and how hard is restated per flavour, exactly as G-11 restates the brand. Reusing the dark theme's ink in the
    light one produces a shadow the same lightness as a surface — which is to say, no shadow. And the two do not come
    out symmetrical: a dark palette is compressed at its dark end, so **Nacht lifts a card mostly by the plane step and
    Tag mostly by the shadow**. Rendering a card edge and reading the pixels is what establishes that; it is not
    visible in the tokens.
  * **A round control has one diameter** (`--jp-control-round`). Two sizes hung from a shared top edge put their centres
    on different lines: 26 px against 34 px reads as a crooked header on a phone. The size is a shape decision, so it
    lives in `surfaces.css` with the radii rather than being restated per sheet.
    **What a sheet header carries is *not* a pair of them.** A status readout such as the FR-25.15 save indicator is not
    a control, and at the ✕'s diameter in the same filled circle it would read as a second button. A readout takes the
    diameter only as a **height**, so the two centres still coincide, and is otherwise as small as it needs to be. *One
    diameter* governs round **controls**, and the test that measures them must say which property it is protecting —
    E2E-M5-14 measures the shared centre line and that the lamp is visibly smaller than the button, since asserting
    equal width and height would hold the confusion in place.
  * **The rule is enforced, not stated.** A view that writes a raw colour, radius or shadow fails the build
    (`scripts/design-tokens-gate.mjs`, invariant 9b). Without the gate every screen invents its own numbers again.

* **G-15 (The Item Mark — ADR-021, Addendum 3.28):** An item may carry **one emoji** as its mark, and that mark is drawn
  in a **fixed slot at the row's leading edge** — one geometry across M4, M5, M9 and M10, so a list stays aligned
  whether its rows are marked or not. Decided on a rendered four-way round
  (`dev-docs/UI_Concept_ItemMark_variants.html`); the losing options and their measured costs are in Addendum 3.28. An
  icon library would fit the token tables and still loses: at 34 px its strokes stop being distinguishable, and its
  substitute rate is the *higher* of the two.
  * **The slot holds its width when it is empty.** An item with no mark is the normal case (FR-28.1), and a column that
    collapses on unmarked rows re-rags the names on every list.
  * **The ladder is per surface, not global.** M9 falls back photo → mark → the primary tag's mark, painted muted
    (FR-24.13) → primary-tag initial; M4 and M5 fall back photo → mark → *nothing*. The inventory identifies an item and
    already owns the initial tile (ADR-014); the packing row is scanned, and a coloured letter repeating the name beside
    it is noise — rendered, it lost to *no mark at all*.
  * **A photo wins wherever one exists.** It is the more specific answer (FR-22.1). The accepted cost is a mixed column:
    on a realistic list three rows in fifteen are photographed, and they pull the eye harder than the twelve beside
    them.
  * **The mark is content, never chrome** (FR-28.5). It is the one thing on screen whose colours do not come from the
    token table (G-11, invariant 9), and it stays confined to item and template rows for exactly that reason: no emoji
    in buttons, headings, status pills, progress or empty states, and never as a stand-in for a tag or state colour. It
    is presentational for assistive technology — the row's name is its accessible name, and no count, filter or state is
    ever expressed by a mark alone. The FR-25.4 procurement glyphs (🧳/🛒/📍) and the ⏰ late flag are **not** marks: they
    are a fixed app-owned state vocabulary, and they are the ceiling rather than a precedent.
  * **The emoji face is served by the instance**, subsetted to the picker's curated set (FR-28.6) — the same rule as the
    two text faces (G-13). Platform emoji would render a *shared* list as a different picture per device, which is the
    failure this pattern exists to avoid; being available offline is the second reason, not the first.
* **G-16 (Default Action):** A screen, or a self-contained form context within one (a wizard step, a sheet, a composer),
  has **at most one default action** — the single button the context exists to reach, painted in the action role (G-11)
  like everything else you act on. **On desktop, Enter in one of the context's plain single-line fields triggers that
  action** exactly as if the button had been clicked: same handler, same validity gate, so the key can never do more
  than the click could — a disabled default action means Enter does nothing, silently. This generalises FR-25.13a's
  ruling beyond the composers: the **visible button remains the primary commit** (a phone has no reachable Enter), and
  Enter is an accelerator, never the only path.
  * **A field that owns its Enter is exempt by rule.** Commit-on-blur/Enter name fields (M8's template name, M22's trip
    name), the filter-or-create tag input (FR-24.1), the quick-add composers (FR-25.13 family), and any search field
    whose result list Enter may later pick from (M3's single-item search, FR-27.13's picker search): there Enter belongs
    to the field, and the default action is reached by its button alone. Multi-line fields are never wired — Enter
    inserts a newline.
  * **Opt-in per field, never a global key capture.** The binding sits on the field itself, not on a document- or
    container-level listener — a context-wide capture is precisely how an exempt field gets its Enter stolen, and
    per-field wiring keeps *which* fields fire the default action a reviewable property of the template.
  * **On M3** each wizard step's plain fields fire the step's own navigation button behind its existing validity gate —
    steps 1 and 2 fire *Weiter*, a step-4 quantity fires *Reise erstellen*; step 3's only field is the exempt
    single-item search, so step 3 is left by the button alone. Other screens adopt the pattern as they are touched, not
    in one sweep.

---
* **G-17 (Form Controls Wear the Theme — ADR-035):** A form control the browser would paint in its own chrome and
  language is presented by the app instead. A **date** is entered through the shared `DateField`: a read-only field that
  renders its value through `formatDay` — the one temporal formatter — and opens the calendar in the app's sheet chrome,
  in the app's locale with Monday first; clearing it is a picker action, and under G-3's lock the field opens nothing. A
  visible **file trigger** is a catalogue-labelled button in front of a hidden input (`FilePickButton`), as M10's photo
  and M17's avatar use it. A view never writes `<input type="date">` or a visible `<input type="file">`. Sites today:
  M3's and M22's dates and the clone form's, M15's and M18's file pickers. Accepted cost (ADR-035): a date cannot be
  typed — revisit at the first field whose value is far from today. **A `DateField` also carries its bounds**
  (`min`/`max`, FR-2.1d): where two fields describe a range, each bounds the other's calendar, so the invalid pair is
  unreachable rather than refused — no per-screen error state, and a fourth surface using the control inherits the rule.
  An absent bound is no restriction, and the bound constrains the calendar only: a row that already holds an inverted
  range still renders and is still repairable.
  * **Why not native (ADR-035, UX-6):** the browser's control text is unreachable by NFR-4.12 and its chrome by the
    token tables; the accepted cost and its revisit trigger are in the ADR.
  * **The calendar mounts once the sheet has *landed*** (Ionic's `didPresent`), and the sheet chrome renders that state
    as `data-presented`. Ionic readies `ion-datetime` — listeners attached, the calendar body unhidden — from an
    IntersectionObserver rooted on the component, with one fallback 100 ms after mount; a calendar mounted while the
    sheet is still `display: none` fires that fallback against a box of zero height and leaves readiness to an observer
    measured on a loaded WebKit at 0.6–4.6 s. A calendar mounted into a laid-out sheet is ready on the fallback's own
    clock. The sheet keeps its height across the swap, because the second calendar is the size of the first (G-2: an
    auto-height sheet is measured once at presentation).

## 1. Screen Inventory

| # | Screen | Priority | Primary FRs |
|---|--------|----------|-------------|
| M1 | Dashboard "My Tasks" | MVP | 6.1, 6.3 |
| M2 | Trip List | MVP | 2.1, 13.1 |
| M3 | Trip Creation Wizard | MVP | 2.1–2.3, 14.2, 15.1 |
| M4 | Packing List (Trip Detail) | MVP | 3.x, 4.x, 5.x, 8.1 |
| M5 | Item Detail Sheet | MVP | 4.2, 4.3, 7.x, 14.1 |
| M6 | Shopping Views | MVP | 3.1–3.3 |
| M7 | Template List | MVP | 1.2, 1.6 |
| M8 | Template Editor | MVP | 1.3–1.5, 15.2 |
| M9 | Item Inventory | MVP | 1.1 |
| M10 | Item Editor | MVP | 1.1, 1.7, 1.8, 1.9 |
| M11 | Container Management | P2 | 10.1–10.3 |
| M12 | Analytics | P2 | 8.1, 8.2, 14.3 |
| ~~M13~~ | ~~Repack Mode~~ — removed (§3.11) | — | — |
| M14 | Post-Trip Review Assistant | P2 | 9.1, 9.2 |
| M15 | Import Wizard | P2 | 16.1–16.3, NFR-4.7 |
| M16 | Series & Destination Profile | P2 | 13.1–13.3 |
| M17 | Settings & Notifications | P2 | 6.2, NFR-4.5/4.6 |
| M18 | Portable Import Preview | P2 | Addendum 3.18 |
| M19 | First-Launch Mode Selection | P2 | Addendum 3.19 |
| M20 | User Administration | P3 | Addendum 3.23 |
| M21 | Vorlage aus Reise (Template from Trip) | MVP | Addendum 3.27 (27.5, 27.1, 27.4) |
| M24 | Aufräumen (Inventory Cleanup) | P2 | Addendum 24.12, 24.13 |
| M25 | Aufgaben (A Trip's Tasks) | MVP | Addendum 7.7 |
| M26 | Notizen (A Trip's Notes) | MVP | Addendum 7.9, 7.13 |

---

## 2. Screen Specifications

### M1 — Dashboard "My Tasks"

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
    ledger (`dev-docs/e2e-tests.md`).
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

### M2 — Trip List

* **Purpose:** Overview and entry to all trips.
* **Elements:** Filter bar (search + segmented *Active / Planned / Archived*, the shared list-filter pattern); per-trip
  row: **the trip's travellers as small faces at the row's end** (FR-2.1/8.1) — the *roster*, who the trip is for, and
  never the G-10 presence facepile. **Two faces before the „+N" bubble, measured rather than chosen:** at 390 px three
  faces plus „+1" is 64 px and pushes „Sommerferien im Tessin 2027" onto a second line, taking the row from 87 px to 106
  px; two plus „+2" is 61 px and the name stays on one. It is the wrap boundary rather than a comfortable margin — a
  longer name still wraps, which is fine; paying a line for a face nobody asked for is not. A trip with nobody on it
  shows no pile at all. Name, dates — **locale-formatted through the one `formatTripPeriod` helper** (UX-5: `22.08. –
  05.09.2026` in German, `Aug 22 – Sep 5, 2026` in English via `Intl`, never a raw ISO string; *bis/until* and *ab/from*
  for a single known date, and the bare year for a year-only trip, FR-2.1b — the same helper serves M1's cards and M16's
  history; asserted by E2E-M2-12 and unit-owned per locale in `lib/__tests__/format.spec.ts`), progress ring
  (packed/total — **and *unknown* rather than zero while the trip's own rows are still coming**, ADR-033: `trip_items`
  live in the trip's partition, so a trip this device has never opened has nothing to sum, and printing the sum of
  nothing would read as „you packed none of it" for a decade of finished holidays. The row then says the items are
  loading and the ring stays unfilled and unlabelled. **M2 fetches the partition of a row when that row is on screen**,
  so the cost is the viewport rather than the archive — measured on a 33-trip device: 8 requests on opening the list
  against 33 for loading them all, and the list fills in as you scroll, which is the accepted price written into
  ADR-033), an item summary and the FR-27.4 chips. **No presence facepile:** G-10 states that presence is meaningless
  outside a specific trip, and the wire agrees — presence is broadcast per *subscribed* trip, so a list would have to
  subscribe every row it shows in order to draw circles on it.
* **The running trip is a hero card at the head of *Active* (FR-21.15).** The same card M1 draws, naming the same trip —
  the running one that departs **soonest**, which is deliberately not the head of M2's own newest-first order. Only on
  *Active*: the other two segments are lists by definition, and a card over either would claim a trip is being packed
  that is not. The trip is **lifted out** of the grouped list rather than drawn twice, so the series header below counts
  what it lists. The hero states the series it came out of, in front of who the trip is for. Because a card has no row
  menu of its own, the row's actions are **stated on it**: export, share (G-8), the one lifecycle step and delete, read
  from the same list as the row menu (`tripRowActions`). It carries the FR-27.4 and FR-16.2 chips with it, and asks for
  its own trip partition — no observer would ever ask for a card (ADR-033).
* **Default ordering (E2E-M2-15): grouped by series under tappable headers that lead to M16, every segment
  newest-first** (through `tripOrderKey`), **no series chip on the row**, and the opening segment is FR-2.8's derived
  one. A flat list ordered by usefulness (active, then upcoming soonest first, then archived newest first) was weighed
  and rejected by decision: its premise — that the list stays short — does not hold over years of use, and the series
  grouping is the way through a long history.
* **Actions:** Tap → M4; FAB "New trip" → M3; **hold or right-click a trip row → its row menu**, an action sheet headed
  by the trip's name: *„Reise-Eigenschaften"* first (FR-2.7, → M22), *Export* (Addendum FR-18.3), *Share* (FR-4.5),
  *Clone* on an archived trip only (FR-12.1), the one lifecycle step the trip's status offers — *Start* on a planned
  trip, *Archive* on a running one (FR-9.1/9.2) — and *Delete*, destructive, confirmed, Owner-only (FR-4.5); tap series
  header → M16. The trip's properties and its lifecycle steps are **M2's alone** — M4's ⋮ holds packing's entries only
  (G-12). Starting says what it changes in a toast (FR-9.1: later additions count as forgotten). The running trip's step
  reads *„Reise abschliessen"* and **opens M4 in its closing pass** (FR-9.3, `?closing=1`) instead of archiving here:
  the pass is what archives, with *Fertig*, and archiving straight from M2 would skip it. (E2E-M2-34) In Single-User
  Mode (Addendum FR-17.3) and Local Mode, *Share* is omitted from this menu — there is no second account to share with.
  The tap that ends a hold does not also open the trip. The hero card (FR-21.15) opens the same menu on a hold or
  right-click, and states the same list as its own action row besides. There is no swipe: a hold opens a row's actions
  on every list (M4 FR-5.5, M7 FR-18.2), one gesture across the app.
  *Import trip from file* → M18 and the legacy spreadsheet importer → M15 are **two buttons in the title row**, not
  overflow entries (see M15's *Navigation*). **The list opens on the segment a caller names**
  (`?status=active|planned|archived`) — M18 uses it to land a restore where its own result is; an absent or unknown
  value never resets the segment the user last chose.
* **The opening segment is derived, not fixed (FR-2.8, *built*):** on entering the screen, a segment showing nothing is
  left for the first one that does, in the order *Active → Planned → Archived*; a segment that still holds trips is
  never taken away from the user, `?status=` still wins over the walk, and all three empty leaves the list on *Active*
  with its G-7 CTA. It decides **on entry only** — archiving the last active trip from M2's own context menu does not
  reorganise the list under the finger that did it — and it waits for the trip list to be **settled** before deciding at
  all, since a list that has not arrived yet is not an empty one (the ADR-033 rule, with a master-partition counterpart
  to `tripDataLoaded`). **Each segment button carries its count in brackets beside the label** (`Aktiv (3)`): `(0)`
  where a segment is empty, **nothing at all** while the count is unknown, and part of the button's accessible name
  (`Aktiv, 3 Reisen`) rather than a bracketed digit read out after it. Fitting `ARCHIVIERT (29)` at 390 px costs the
  segment its horizontal padding and one step down the type scale, both measured against the rendered German label; a
  three-digit count truncates and is deliberately not paid for. The counts follow the search field so they say where the
  hits are; the jump deliberately does not, so a leftover search cannot decide where the user lands.
* **The empty state carries no CTA of its own:** create is the `trips-new` FAB and it is on screen either way, which is
  the ruling M7's *States* line records for the same reason. What is still owed here is a `data-testid` on that state,
  so E2E-G7-01's M2 half can be asserted at all.
* **The empty state waits for the list, and says so meanwhile (E2E-M2-18):** a device whose master pull has not landed
  must not render *Keine aktiven Reisen* over a list that is on its way — the ADR-033 mistake in the one place the user
  reads it. Until the partition is settled the screen says **„Reisen werden geladen …"** instead: the same block without
  its illustration, because it is a notice rather than an absence — one component and one spacing rule, not a second
  loading layout beside the G-7 one. It persists for as long as no pull has succeeded, so an **offline cold start stays
  on the notice**, which is the same honest answer FR-2.8 gives for the counts: the G-2 indicator carries the reason and
  pull-to-refresh (`drainAll`) is the retry. The rule is general (G-7).
* **States:** Archived trips render muted with final stats; imported legacy trips (FR-16.2) carry an **„Importiert"**
  chip, read from `trips.imported` (written by M15's migration, carried into `Trip.imported`). On an instance carrying a
  decade of migrated history it is what separates the two kinds of past. **A trip carries up to two FR-27.4 chips.** The
  first is a *pointer*: „⟳ N Änderungen vorgeschlagen“ — a group the trip follows has changed and the trip has not
  answered yet. It is a label, not a control: the two answers live at the trip (M4), and tapping the row is already the
  way there. It can only appear for a trip whose partition this device holds — in Server Mode a trip's rows arrive when
  it is opened — so its absence means "nothing to say from here", never "nothing to decide", which is why M4 asks again
  on open. The second is the record: „⟳ N Änderungen aus Gruppen übernommen“ above one line per change naming its source
  group, followed by the note that past trips are never changed. **Up to ten changes the log is simply written out**
  under the row; above that it folds away behind the chip, which then carries a chevron and toggles it. The reason for
  the threshold rather than always folding: a handful of lines is worth reading where it happened, but M2 is the app's
  main entry and there is deliberately no *seen* state, so an unbounded log would push every other trip down the list
  until the busy one departs. A folding chip stops the tap, so opening the log does not also open the trip; a
  non-folding one is a label and takes no interaction at all. **No status rule on either chip:** a running trip is asked
  too, and a past one produces nothing to show.
* **Navigation:** Tab 2.

### M3 — Trip Creation Wizard

* **Enter is the step's button (G-16):** each step's plain text fields fire the step's own navigation action
  behind its validity gate — the name, series name and tags on step 1 and the traveller names on step 2 fire *Weiter*
  (the dates are G-17 fields — their Enter opens the picker, and the folded row's summary states them
  through `formatDay`), a step-4 quantity fires *Reise erstellen*. The single-item search on step 3 is G-16-exempt (its
  Enter is reserved for the field's own result list), so step 3 is left by the button alone.
* **Step 2 opens with the default travellers (FR-2.5a)** from M17, editable there like any other traveller.
  A default picked from the accounts opens as the account picker adds one: linked, a collaborator, with
  the role selector.
* **Step 1 folds its optional fields (FR-2.1c):** name and year stand alone; dates, series and attributes
  live behind one *Mehr Optionen ▾* row that states what is set behind it.
* **Step 1 requires a name and a year (FR-2.1b).** The year is a picker that opens on the current one, so
  the required field is satisfied on arrival; both dates are marked optional and neither gates *Next*. The duration line
  appears only when both dates are set.

* **Purpose:** Generate a trip instance from templates with correct quantities on the first pass.
* **Step 1 — Metadata:** Name, series picker (or "New series"), optional start date and end date (duration auto-computed
  and displayed when both dates are set, FR-2.1/2.1a), attribute chips: season, transport, accommodation (FR-15.1;
  prefilled from series defaults). **A new-series name that is taken is refused here (FR-13.1):**
  `trip_series.name` is UNIQUE instance-wide, so the field carries a note naming the existing series and *Weiter* stays
  disabled. The step deliberately does **not** attach the trip to that series by itself — the picker right above the
  field already offers it, and quietly choosing whose series a trip joins is not the wizard's decision to make.
* **Step 2 — Travelers:** Add travelers (name only — no Adult/Child type, FR-25.9, FR-2.5),
  optionally link to a registered user account — **an *account* picker beside *Add traveller* adds an existing account
  as a traveller and, in the same act, as a member of the trip with a role picker (FR-2.5)**; share the
  trip with user accounts that do not travel and assign roles: Owner (creator,
  immutable), Admin (can manage travelers and roles), Editor (default — can edit items but not manage travelers)
  (FR-4.5/4.7). In Single-User Mode (Addendum FR-17.3), the sharing and role-assignment part of this step is hidden
  entirely — only traveler add/edit remains, and the sole user is silently the trip's Owner.
  **Each traveler row carries an optional account select (FR-1.9)**, offering the creator and the accounts
  the trip is shared with, and shown only once the trip is shared with somebody (G-8) — a link outside the trip's
  members would be refused. It is what lets an item's default assignee land on a traveler: step 4's review reads the
  links it will be created with, so a row handed over that way names the traveler and is *not* marked „per person".
* **Step 3 — Templates:** Checkbox lists of all templates (shared instance-wide, FR-1.6 MVP simplification),
  **split by scope per FR-27.6: *Ferien-Vorlagen* first, *Zusätzliche Gruppen* below** — the
  Vorlage is what a trip starts from, groups are what you add to it. Every row counts what picking it would *resolve* to
  (FR-27.2), not the template's own positions: a Vorlage frequently owns none and is nothing but its groups. A group a
  picked Vorlage already brings along says so on the row („bereits über ‚Sommerferien' enthalten") rather than letting
  the user believe a second tap added something — the FR-25.13 duplicate-report rule. **Every row can be looked into
  (FR-27.12):** it names its first **two** items with a count for the rest („Kamera · Makro-Objektiv +2“) —
  two rather than three because three German item names wrap at 390 px, which turns a scannable row into a four-line
  block, and a chevron opens the read-only peek sheet with the resolved list. The footer **names every merge and its
  contributing groups** („Kamera nur 1× — in Makro & Wildlife", FR-27.2) instead of an anonymous count, and states the
  preparation tasks the trip inherits („📋 2 Vorbereitungs-Aufgaben übernommen", FR-27.7). The trip tasks it inherits are
  a line of their own („✅ 3 Aufgaben für die Reise übernommen", FR-7.4) — deduplicated by text across the Vorlage and
  its groups — because they are not preparation of anything on the list (E2E-M3-23). Live preview footer also:
  resulting item count, deduplicated overlaps listed with the applied merge strategy (FR-2.3); items excluded by
  conditional rules (FR-15.2) shown collapsed with reason ("skipped: season ≠ winter"). **And
  (FR-2.5b/ADR-053) the per-person positions the trip's roster cannot place** — named in an *open* block
  (*„Braucht Reisende"*) rather than a collapsed one, because unlike an exclusion nobody decided against them: the
  block names the items and the step that fixes it. It is absent whenever the roster holds anybody, and a position
  whose item another contributor already placed is not among them. **Companions (Addendum 3.20):**
  the footer additionally reports companion items pulled in automatically ("+ 2 companion items (battery,
  screwdriver)"); step 4 lists them with their main item, notes FR-20.3 dedups ("already on the list, not duplicated"),
  and offers suggested companions as opt-in checkboxes (FR-20.4).
* **Step 4 — Quantity Review:** Virtualized list of all generated items; each row: name, the template quantity with a
  stepper, history hint "2024: 5 · 2025: 6 → suggested 6" with one-tap accept (FR-14.1/14.2; no formulas); destination
  checklist offer if the series has one (FR-13.3). **The hint waits for the series' own trips (E2E-FLOW-05):** their
  rows live in each trip's partition, which Server and Single-User Mode pull only when a trip is *opened* (ADR-033), so
  the screen asks for them and offers nothing until every one of them is here — an unpulled partition would read not as
  *unknown* but as a trip that packed none of it, and the median would be taken over whichever subset happened to be on
  the device.
* **Actions:** Back/Next per step; "Create trip" commits and opens M4.
* **States:** Draft persists locally between steps (offline-safe).
* **Step 3 also takes single items (FR-27.3, *built*).** Below the two scope sections sits *„Einzelne
  Artikel"*: a search field over the **inventory** (two characters before it offers anything, five matches at a time),
  results as tappable rows, picks as removable chips. Deliberately **not** the M4/M8 quick-add despite the §3.25
  consistency directive — that composer exists to *write a row*, free text included; this one picks something that
  already exists, because a name nobody owns has no weight, no tag and nothing for FR-27.5 to recognise a year later.
  What the two share is the rule behind them (`searchItems`). A pick the composition already carries is **reported in
  the footer** („Bereits enthalten, nicht doppelt: …") and changes no count; an already-picked item leaves the
  suggestions rather than being offered twice; and an empty result says so, because an empty inventory and an unmatched
  search are different problems.
* **Navigation:** From M2 FAB or M1 empty state. Cancel returns without residue.

### M4 — Packing List (Trip Detail) — *core screen*

* **Purpose:** The live, collaborative packing workspace, and — by decision — **the trip screen itself**: tapping a trip
  in M2 or M1 opens M4 directly, with no hub in between. Highest design investment.
* **No phase hub in the MVP.** A four-phase trip hub (*Planen · Vorbereiten · Unterwegs · Danach*) was mocked and
  rejected. Two reasons: three of its four panels would be North-Star content with nothing behind them (idea board, day
  plan, expenses — `Vision_NorthStar_v1.0.md` §2 marks Plan and During as ❌ new), and its remaining entries duplicate
  what M4 already reaches (G-12). A hub with two dead tabs claims a structure the app does not have, and every later
  design question would have to ask "hub or M4?". **Re-entry point, so this stays deliberate rather than forgotten:**
  when the Plan and During phases acquire real content, they attach *here* as a phase frame above M4 — M4 becomes the
  *Vorbereiten* phase rather than being replaced.
* **The screen (Addendum §3.25).** It gives the actual packing as much room as possible. The full reasoning per decision
  lives in the addendum; what M4 *is*:
  * **The header line** — packed/total · weight with the presence facepile, and — once the trip has a task — **the
    tasks' own figure** as the share's pair (FR-7.4, FR-7.6; the window's, FR-7.7): same ring, *„Beim Packen 1/4"*
    (FR-7.14 — it counts the window, and three screens saying *Aufgaben* with three numbers would read as a defect), *„3
    offen"*, a track; side by side, or on two rows where the line is too narrow for both sentences (the line's height
    allows for it). **The figures are a card** (`.jp-card`, G-14): the line itself is page-coloured with the page's
    gutter, so the card has the same radius and width as the cards below it rather than being one full-width,
    square-cornered band. A tap unfolds *Aufgaben für die Reise* and scrolls it into view. Nothing else. It stays
    **unfiltered**, so real progress is visible whatever the current view shows. On scroll-**down** the whole line hides
    and any upward scroll brings it back — and so does a list the hiding itself made fit its screen: with nothing left
    to scroll, no upward gesture could, and the view switcher above would stay gone.
  * **The trip is named once, in the G-9 page head, at every width (ADR-050)**, and M4 registers a title like every
    other screen. **"S…" names nothing:** with search, filter, fold-all, the FR-27.5 lifecycle step, the sync glyph and
    the settings gear beside it, 54 px are left at 390 px and "Samedan 2026" renders as **"S…"** in the bar — measured
    off the visual baseline, and weighed on a rendered four-way round (`dev-docs/UI_Concept_M4Title_variants.html`). On
    scroll, *you generally know which packing list you are on*, so identity does not migrate into the app bar. The head
    collapses on the same gesture as the line (FR-21.17), which is 89 px of a 390×844 phone returned to the list — on
    the reader's *gesture* and on nothing else: a wheel, a touch drag, a key or the scrollbar. A scroll the browser
    makes to bring a control into view leaves both standing, because answering it moves every row by the head's height
    under a finger already on its way to one (E2E-M4-135).
  * **The line draws the trip as a figure, not as a fraction** (FR-21.23): a ring, the share in words (*„1/4 gepackt"*)
    and a track, with the weight on the second line under it. It is the same `ProgressFigure` M1's and M2's hero cards
    carry, from the same percentage — the screen where the progress is made carries it too. Measured on a 390×844 phone:
    59 px while it stands, and it still yields entirely on the way down (FR-21.17).
  * **The list stays where it was left.** Opening an item is a state of the list's own page (ADR-046), so the list never
    leaves the screen and keeps its offset and its folded header line by simply staying — a remount would put a
    forty-row list back at the top mid-pack, the screen's most expensive small failure. The line also stops travelling
    entirely under `prefers-reduced-motion`: it is the largest movement on the screen and it happens while the list is
    moving too.
  * **Actions live in the app bar (G-12), not in the header:** search (collapsed behind its icon), filter (badge =
    active facet count), fold-all — the three glyphs the bar's budget allows, and the three tapped while packing. The
    trip's *other views* are the **G-9 switcher under the page head** (FR-21.21, ADR-051): *Einkaufen* stands in the
    switcher and carries its open count — things to buy, the same arithmetic M6's segments use — while *Gepäck* and
    *Auswertung* head the ⋮ (ADR-051 amendment 1), ahead of packing's own entries (G-12).
  * **One door to the quick-add** (FR-21.24): the ＋ FAB, and nothing else. A collapsed composer pill above the list
    would say the same thing as the FAB hovering over it — the FAB is what stays, because it is reachable from anywhere
    in a list and the pill only from the top of one. M8's editor makes the same choice; M6, which has no FAB, is where
    the pill is the way in. *Rejected:* dropping the FAB instead, which would put the app's one-tap add behind a scroll
    to the top on the longest list it has.
  * **Faceted filter panel** (FR-25.11): a bottom sheet holding *Gruppieren nach*, three reveal switches (*Erledigte*,
    *Anderen zugewiesen* and *Spätpacker*, FR-25.27), and the facets Person / Kategorie / Beschaffung / Gepäck /
    Merkmale / Status. OR within a facet, AND across facets; active values appear as removable chips under the header.
    The panel has **no apply button** (FR-25.11b-rev) — every tap is in force behind it, and the head states the outcome
    — its values are **chips rather than folded accordions**, each axis carries an icon, and it is visibly a layer over
    the list rather than more page. **Status (FR-25.11l)** has three values — *Gepackt* / *Bewusst weggelassen* / *Noch
    nicht gepackt* — that override the Erledigte switch for whichever bucket is picked, so "show me only the skipped
    rows" works whether or not done rows are otherwise revealed.
  * **The empty list says what actually hid the rows.** With every row assigned to somebody else and neither a search
    nor a facet set, M4 reads *„Alles ist bei jemand anderem"* and names them, and its action is *„Alle anzeigen"* — the
    same reveal the foot bar offers. FR-25.20's hiding is not a filter anybody chose, so *„Keine Treffer"* over *„Suche
    und Filter zurücksetzen"* would be untrue.
  * **Rows assigned to someone else are hidden by default** (FR-25.20; "Zugewiesen an" is the term everywhere, M4/M5 and
    M6 alike): M4 opens on your own work. Unassigned rows stay — they belong to everyone. A reveal bar names the count
    and the people, and the switch sits in the filter panel beside *Erledigte*; the header keeps counting the whole trip
    regardless.
  * **Done rows drop out** (FR-25.2) — fully packed *or* consciously skipped, but never a row with open preparation
    (FR-7.3). Revealed via the *Erledigte* switch, dimmed but interactive, each showing **who packed it and when**
    (FR-25.17). A fully-done group disappears header-and-all.
  * **Late-packer rows sink, and can be put away (FR-25.27).** A row carrying the ⏰ flag (FR-5.1)
    sits at the end of its group, below what can be packed now and above what is done — three tiers, one partition. A
    cluster sinks as soon as one visible instance carries the flag, matching the ⏰ its head already paints
    (FR-25.23). The filter panel's **third switch**, *Spätpacker*, hides them outright; it is the only one of the three
    that starts **on**, because those rows are not finished with, merely not due yet. Hidden, they get the same reveal
    bar the other two classes get and the list still counts as narrowed, so *„alles erledigt"* cannot appear over them.
    **The three bars sit in the same order as the rows:** Spätpacker, then *Anderen zugewiesen*,
    then *Erledigte* last — the two whose rows still ask for something stand above the one whose rows do not.
    Picking ⏰ in *Merkmale* overrides the switch, as a *Status* value overrides *Erledigte* (FR-25.11l). The closing
    pass (FR-9.3) is exempt from both halves. **A typed search term lifts all three switches** for the rows it
    matches (FR-25.32); clearing it puts them away again. While the term stands, the *Erledigte* and *Spätpacker*
    bars are absent — their matches are already on screen — and they return with the cleared term. A switch's words
    are inside its checkbox, so a tap on the words and a tap on the box are one toggle.
  * **Groups fold** (FR-25.16): tapping a header collapses the group to that line, which then carries its open count;
    fold-all turns the list into a table of contents.
  * **Per-person items render as a named cluster** (FR-25.1) — item name once with `done/total`, one indented child row
    per traveler; a lone instance (notably when grouped by traveler) falls back to a flat "Item · Person" row.
    Cluster-vs-flat is decided over the *full* set, so packing one instance never restructures the list — the full set
    being what the **person facet** lets through (FR-25.30): filtered to Andy, his socks are a plain row with their own
    check, labelled *„Socken"* without *„· Andy"*, which the chip row already says. **The head counts units, like every
    other fraction on the screen** (FR-25.22): with Andy 2, Leonardo 3 and Mia 1 it reads `0/6`, and the child rows add
    up to it. A head counting *travelers* (`1/3` = one of three people done) could not be added up from the lines
    beneath it, and fractions on one screen would mean different things. **And the head is set louder than its
    children** (FR-21.16): the item is what is being packed and the person only qualifies it, so the head takes the row
    size and the child steps down.
  * **A cluster folds too, and starts shut** (FR-25.23): the child rows are not rendered until the head is tapped, so a
    per-person item is **one** line on the list rather than one line per traveler. Shut, the head carries **a face per
    instance in roster order** (ringed in the done colour once that instance is dealt with) and the **open count in
    units** („4 offen"); open, it hands both statements back to the children and returns to `done/total`. The caret
    **trails the item's name** instead of leading the line, because leading it would move the name off the x every other
    item row's name sits on (FR-21.20). The fold is view state per cluster key and is deliberately **not** persisted,
    unlike the FR-25.18 filter.
  * **One avatar at the right edge** (FR-25.3/25.19), set apart from the traveler avatar on the left: it shows the
    **assignee** while the row is open (blue ring) and **who actually packed it** once it is packed (green ring +
    check). Never both — the left avatar already answers *for whom*, and a third circle makes the row unreadable.
  * **Procurement glyph on the two buy modes only** (🛒 / 📍; 🧳 stays silent so the exceptions stand out), once per
    cluster header; **Late Packer** stays a separate ⏰ flag (FR-25.4).
  * **Quick-add** stays inline, collapses on blur, and is opened *and focused* by the ＋ FAB — which **hides while the
    composer is open**: it would only open what is already open, and the composer needs the room; its
    container stays, because M4 and M8 anchor their toasts to it. The composer also carries a **visible confirm button**
    — a phone has no reachable Enter (FR-25.13/13a). It also adds **whole groups** (FR-27.10): typing
    filters groups alongside items under *„Ganze Gruppe hinzufügen“*, and one tap expands the group into the trip —
    deduped against what is already there, provenance stamped, FR-27.7 tasks materialised, result reported, and
    deliberately **not** flagged *Missing*. A group entry is a **card**, not a list row like the item suggestions, and
    carries the group's name, the FR-27.12 summary („Makroobjektiv · Ringblitz +1“) and its resolved position count: a
    tap that adds a dozen rows must not look like a tap that adds one item, and the summary is what lets the user decide
    without opening anything. Matching is on the **group name** — the resolved item names are FR-27.13's job on M8's
    picker. Three outcomes, three sentences: what was added and what was already there, a group that is already fully on
    the list, and a group whose positions this trip's attributes all excluded (FR-15.2). The entry leads with the
    group's own mark (FR-28.8), and with the generic group glyph when the group has none.
  * **Full-screen:** the bottom tab bar is hidden here, the FAB drops to the screen foot, and the list scrolls clear of
    the FAB's whole footprint so nothing sits permanently underneath it (FR-25.11h).
  * Container assignment defaults to none and is de-emphasized so it never blocks packing (FR-25.5).
  * **The FR-27.4 question sits above the list.** When a group the trip follows has changed, a card
    names **every** change — „Aus den Gruppen“, one line per change with its source group — and offers exactly two
    answers: *Übernehmen* and *Nicht übernehmen*. Deliberately a card and not a modal: a modal over the packing list has
    to be dismissed before the list it talks about can be looked at, and dismissing is not one of the two answers.
    Deliberately the full list and not a count: „3 Änderungen“ with nothing to read can only be answered by guessing. It
    folds above ten lines, same threshold and same reason as M2's log. The cost of *no* is stated where *no* is pressed
    — the refused positions stop following the group in this trip — because it is the one thing about the card a user
    cannot work out from the list above it. Both answers are final and neither offers an undo, so both report through a
    plain toast rather than a snackbar.
  * **Names the inventory moved on from are taken over on request, from the ⋮ (FR-27.16).** While
    at least one row's master item is now called something else, the ⋮ carries „Namen aus dem Inventar (N)" — on a
    past or archived trip too — and opens a sheet: „Alle" (tri-state, with „N von M ausgewählt") on the sunken
    surface, then one row per choice with its tick, the old name struck through above the new one and small facts
    that make it recognisable (*für Andy, Mia*, *gepackt 1/1*, *nicht dabei*); a row the trip named on purpose carries
    *bewusst so benannt* and a sentence saying why it is not ticked. The footer's button counts what it will do
    („N Namen übernehmen", „Alle N übernehmen"). Deliberately **not** a card above the list: that place belongs to the
    FR-27.4 question, and a notice would have to remember its dismissal (the rejected variant is in the FR). The
    result reports through M4's snackbar with *Rückgängig*, because one tap on „Alle" renames many rows.
  * **An archived trip leads with a closing card** (where a *Danach* phase would stand): "Reise
    abgeschlossen" — plain, with no glyph: a composition glyph says nothing about a finished trip, every other heading
    in the app is plain text, and the card already carries two button icons — with **"Vorlage aus
    dieser Reise erstellen →"** (M21, FR-27.5) and the M14 review suggestions beneath it. The packed list stays visible
    below as the trip's record.
* **Group presentation:** a category **heads** the rows under it and must look like it — uppercase micro-type
  *smaller* than the item names it introduces would invert the hierarchy it exists to state. Three levels, three
  weights: the group heading, then a per-person cluster's name (FR-25.1), then the rows; the cluster's name is never
  set below the traveler rows under it (FR-21.16). **The other axis (FR-21.20):** the cluster's indent and its rule
  belong to the **children**, not the whole block — a head names an item, exactly like the plain row beside it, and
  stands in the same name column rather than 8 px right of every other item name.
  And **each group is its own block** — a bordered card carrying its rows — because with nothing but a gap between
  them, two categories run into each other on a long list.
* **Elements:**
  * Sticky header: **one row at every width (ADR-050)** — packed/total, weight (FR-8.1), the task figure (FR-7.6),
    trip presence facepile and group-sync badge per G-10. The name is the page head (G-9) and the trip's other views
    are the switcher and the ⋮, so the line states figures alone. There is no KPI tile strip: Analytics is a named
    entry rather than a tap on a tile, which testing found undiscoverable.
  * **Per person (FR-25.29):** under the sticky line, not in it, so it scrolls away with the list —
    one card per traveler with their face inside a `--jp-done` ring (the ProgressRing construction) and *„x von y"* /
    *„fertig ✓"* / *„nichts zu packen"* under the name, three to a row; a dashed *Gemeinsam* line with a track under the
    cards when any row is for nobody. A tap toggles the traveler in the person facet (pressed card, chip in the chip
    row), so several can be pressed at once — a quick filter, OR'd like the sheet's chips — and a second tap takes that
    one back out. Beyond six travelers the sixth
    slot reads *„+N weitere · M noch offen"* and unfolds the rest, *„Weniger zeigen"* folds them again. Absent with
    fewer than two travelers and during the closing pass.
  * Grouping switcher: *Category / Container / Person / Status*, inside the filter sheet's *Gruppieren nach* section.
    **Decided: persists per user per trip** (not a global preference) — switching to
    *Container* view on one trip doesn't affect another trip or another user's view of the same trip.
  * Item rows read **mark, name, then what you do to it**. The **lead column** is the mark slot (G-15: photo → item mark
    → nothing, width held either way) — a traveler avatar, where the row carries one, shares this column — and because
    it holds its width empty, the names line up straight without anything being told a number. Then the name and its one
    sentence. Then, at the row's other edge: the chips — mode (BUY_BEFORE/BUY_LOCAL), Late Packer flag, packer avatar,
    ~~container tag~~ — **no container chip** (E2E-M4-03): M4 answers *which bag* by grouping (FR-8.2), and a fifth mark
    at this edge is exactly what FR-25.19 kept off the row; and **last, the control**: checkbox for quantity 1, stepper
    per G-6 for quantity > 1 (showing "3/5"), the closing-pass toggle or the G-3 lock. The control is last so its outer
    edge is the row's on every row, whatever precedes it — the thing you tap sits under the thumb rather than across the
    screen from it.
    * **Why the control is last (UX-9).** A leading control column of one fixed width, sized to the stepper, would also
      give a straight name column, at the cost of a 108 px gap on every row that carries only a checkbox and the
      most-tapped control at the far edge from the thumb. With the control at the end the lead column holds the names,
      and the container's own edge holds the controls. E2E-M4-56 asserts both, because either one alone passes on a row
      that has lost the other. The mark is resolved through the row's source item (FR-28.7) — an ad-hoc row (an
      import's, an older trip's; the quick-add makes none, FR-24.11) carries none until it exists in the inventory, and
      shows an empty slot rather than a placeholder.
    * **The lead column is one glyph wide (FR-21.19).** The mark on an item row, the traveler's face on a child row
      under a cluster — never both. A *lone* per-person instance renders as an item row with the person folded into
      its label (`Wanderstöcke · Andy`) and draws no face beside the mark slot, which would start its name 32 px right
      of every sibling. A test of the rule must be given a row with a traveler.
    * **The edge avatar is a control (FR-25.25).** Tapping it opens the assignment picker — the
      trip's other members and *niemand* — instead of only naming the responsible person. A row nobody is responsible
      for renders an **empty seat** in the same place, which is the row's only affordance for being handed over. It is
      absent where nothing is assignable (G-8), under a G-3 lock, in the closing pass, and once the avatar names the
      packing record rather than the assignment: that one is not a choice (FR-25.19).
  * **Row press-and-hold menu (FR-5.5):** *Menge ändern*, *Packen*, *Nicht einpacken*, **_Vor Ort kaufen_** — on a
    `buy_local` row **_Doch mitnehmen_** in its place, and neither on a row already begun (FR-5.9) —,
    **Spätpacker ein/aus** (FR-25.25, last of the row's own actions), FR-9.3's unused mark where the trip can be judged,
    and **_Von der Liste entfernen_ last of all** (FR-5.8, destructive role). A row somebody else
    holds has no menu but the takeover (G-3/FR-5.7); a row the viewer holds offers only the release; a skipped row
    offers the way back and the removal, and no late-packer flag, because nothing is being packed on it.
    * **Removal (FR-5.8).** A row with nothing on it goes at once, with the pack snackbar's *Rückgängig*
      (*„„Zelt" von der Liste entfernt"*). A row carrying packed units, notes or FR-20.2 companions opens a destructive
      alert first — title *„„Drohne" entfernen?"*, a body naming each loss and pointing at *Nicht einpacken*, buttons
      *Abbrechen* / *Entfernen* — and a confirmed removal raises the same snackbar with *Rückgängig* (FR-25.31): the
      row leaves the screen and is deleted once the undo lapses, its companions skipped at once. A row whose M5 is open
      closes it: the sheet would otherwise report the item it was just asked to remove as not found.
      Where the row is the **only use of its inventory item** (ADR-065), the snackbar reads
      *„„Zelt" entfernt – auch aus dem Inventar"* and the alert's body ends with *„Der Artikel kommt sonst nirgends vor
      und wird auch aus dem Inventar gelöscht."*; the item goes once the undo has lapsed.
  * **Cluster head menu (FR-25.26):** the head of a per-person cluster (FR-25.1) takes the same
    press-and-hold, while the short tap stays FR-25.23's fold. It offers **Spätpacker für alle ein/aus** and **Alle
    zuweisen an …**, each acting on every instance the head counts, and **every entry of a row's
    own menu** except the takeover, in the row's order and words: *Menge ändern*, *Jetzt packen*, *Nicht einpacken* /
    *Doch einpacken*, *Freigeben*, *Unbenutzt*, *Von der Liste entfernen*. Each reaches the instances whose own row
    would offer it. *Menge ändern* opens the row's amount popover, centred, naming the item; each tap writes the same
    amount to every instance. Skip and removal carry one snackbar and one undo for all of them. It states the scope
    in its sub-header (*„4 Zeilen"*) because a shut head hides the rows it is about to write. Instances somebody else
    holds are skipped and reported in the toast (*„3 von 4 geändert · Sia packt gerade"*) — or, for skip and removal,
    in the snackbar's name (*„Zahnbürste (3 von 4)"*); a head whose every instance is held offers no menu at all, and
    none of its entries is a takeover.
  * **The for-whom strip (FR-25.28):** the list carries a leading ***who* column**, one avatar wide,
    before the mark — wherever the trip has two travelers or more and outside FR-9.3's closing pass (G-8). On an item
    row and on a cluster head it holds the **for-whom seat**: an empty seat with the people glyph on a shared row, the
    traveler on a lone per-person row, a **count** on a cluster head. A child row's avatar sits in the same column and
    leaves the mark slot empty beside it, so every name keeps one x (FR-21.19/FR-28.4). Tapping a seat unfolds the strip
    **as a line of the card under that row** — *Gemeinsam* ⎮ *Alle*, one avatar toggle per traveler in roster order, and
    a summary line (*„3 Personen · 3 Stück"*); tapping it again or another seat folds it, so **at most one** is open.
    Every tap commits (G-5). Unlit travelers keep their face at half weight; a lit one wears the action ring. **Laid out
    for three travelers**: up to three the faces are 40 px with the name spelled out; from the
    fourth they are 32 px in a 40 px column, five fit a 360 px phone, and a longer roster scrolls the line sideways. The
    strip is an **opaque, sunken** band raised above the rows below it, which slide out from underneath as it opens
    rather than across it; the seat is its own tap target, so tapping it does not ripple the row. **No steppers here** —
    a lit traveler is a child row at once, and its count is where the amount is changed (FR-25.24). A question the plan
    owes — a row with progress or notes going, two or more rows collapsing, a *weggelassen* item taken along again —
    **replaces the summary line inside the strip**: the outcome stated first, then *Abbrechen* and the verb (*Entfernen*
    / *Zusammenlegen* / *Doch einpacken*); the toggles are inert while it stands. It is the one place a destructive
    confirm is not an alert. **G-3:** with any instance held by somebody else the strip still opens, reads, names the
    holder and writes nothing. The strip stays open while its item turns from a row into a cluster and back, and that
    change is not animated (E2E-M4-100).
  * **Inline quick-add (FR-5.6):** A persistent "Add item..." trigger below the filter bar. Tapping it expands an inline
    text input with autocomplete suggestions from the master item inventory (M9). **The composer is M9's search
    (FR-24.11):** the suggestions follow M9's rule (umlaut fold, tags, marks — a tag or mark hit says *„über {Tag}"*),
    and a name no active item carries exactly is offered above them as *„‚{Name}' anlegen"* — M9's `SearchOfferButton`,
    dashed, hint *„Neu im Inventar anlegen und gleich hinzufügen"*. Taking it, or ✓/Enter, opens M9's *„Neuer Artikel"*
    sheet (name + tags); *„Anlegen"* creates the inventory item and adds it at once, for whoever the for-whom strip
    names, and the composer stays open. A retired name reads *„‚{Name}' ist stillgelegt"* and is restored and added in
    one tap. ✓/Enter add an exact inventory match directly and never write a new name on their own; a name already on
    the list reads *„‚{Name}' ist schon drin"* and ✓ rests. The placeholder says so: *„Suchen oder neu anlegen…"*.
    Selecting a suggestion reuses the master item's metadata (weight, value, category). If the trip is active, new items
    are auto-flagged *Missing* (FR-9.1). The input stays expanded after adding for rapid entry; Escape or the close
    button collapses it. No navigation away from M4 required. **FR-25.13c:** the FAB expands the composer **without
    focusing it**, because while the field is empty it leads with a tappable *„Zuletzt verwendet"* chip row (the
    device-local trail) — and the raised keyboard would cover it; a chip tap adds with the FR-25.7 defaults and stays in
    chip mode. There is no second row of items sharing a primary tag with what the trip already carries (*„Passt zu
    {Tags}"*): it reads as noise rather than a suggestion. What the trip already carries is offered in **no** row and
    not in the autocomplete either; typing hides the chips and the suggestions take over. **FR-25.13d:** the empty
    composer also carries the *„Mehr aus dem Inventar…"* line, opening the **inventory browse-sheet**: the whole
    inventory in a bottom sheet, grouped like M9 by primary tag — **under M9's own heading** (`ListGroup`: the tag's
    mark, its name and the number of lines under it) — and filtered along the M9 tag axis (any of an item's tags),
    one-tap rows that stay open for runs, a carried item stating *„schon drin"* in place of its add control and flipping
    to that state right after a tap, and free text demoted to an explicit footer line that hands back to the composer's
    field. **The sheet can also put the carried rows away (FR-25.13e):** one line under the tag axis — the count on the
    left (*„14 schon drin“* → *„14 ausgeblendet“*), a switch labelled *„ausblenden“* on the right — hides everything the
    scope carried **at the moment the switch was flipped**, so a row added during the run stays in place and reads *„✓
    hinzugefügt“* rather than disappearing under the finger. Off by default and remembered device-locally, the count
    scoped to the tag filter and the line absent when it would hide nothing; a tag whose rows are all hidden loses its
    heading, and the two „alles ist schon drin“ sentences carry *„Trotzdem anzeigen“*. The sheet is part of the shared
    composer, so M6 and M8 carry it identically — *Erfassen* and *Zusammenstellen*, the two postures of FR-25.13's one
    way to add. **Each line in M4 carries the two verbs as well (FR-25.13f):** ✓ *gepackt* and ✕ *nicht einpacken* at
    the right edge, the name keeping the plain add and the ⊕ stepping aside for them. On a free line they add and decide
    in one write (a skip-add is never flagged *Missing* and pulls no companions); on a line the trip already carries
    they act on all of its rows, naming the count where it is more than one (*„eingepackt · 3 Personen"*). The acted
    line stays where it is, says what happened and carries *„Rückgängig"* for as long as the sheet is open — the sheet
    still has no toast. A settled line states *„schon eingepackt"* / *„bleibt zu Hause"* and carries *„zurücksetzen"*
    beside it (FR-25.13i); a G-3-locked one names its holder and offers nothing at all. **M4 only:** the verbs appear
    for a caller that reports the per-item packing states, which M6 and M8 do not (G-8). **A third verb stands before
    them in M4 (FR-25.13g):** 👥 *für alle*, which puts the item on every traveler's list in that one tap — on a free
    line it adds and distributes, on a carried one it gives the travelers who have none a row of their own at amount
    one, keeping the amount anybody already chose (ADR-036 keep-and-repoint, ADR-054). No editor opens and the sheet
    stays open, which is what lets the taps run; the line then reads *„für alle · 3 Personen"* with *„Rückgängig"*
    beside it. The verb is **absent** where it would do nothing (G-8): under two travelers, on a line that already
    reaches every traveler, on settled and locked lines, and wherever the two verbs above are absent. A line this run
    has just added shows its *„Rückgängig"* and no 👥 — reopening the sheet offers it again. The head names all three
    (*„Tipp = hinzufügen · 👥 für alle · ✓ gepackt · ✕ nicht einpacken"*). Its glyph wears the brand role and its border
    the plain one: a brand-edged box on every free line reads as a column of warnings. **A free line can also name one
    or more travelers, multi-select (FR-25.13h).** Up to three travelers, an avatar button per person sits beside 👥, in
    trip order, sized to the same touch-target floor 👥/✓/✕ use (shrinking only the visible glyph leaves a target
    impractical to tap). A tap **toggles**: assigning a second traveler is a second tap on their button, and the line
    stays open, offering more avatars and its own *„Rückgängig"*, rather than closing the way the other four verbs do;
    tapping an already-selected avatar again takes just that traveler back off, and emptying the set reaches the same
    outcome as *„Rückgängig"* itself. The line never grows a second row for it — the buttons shrink a step and the
    name's existing ellipsis simply triggers earlier. Above three travelers the line stays exactly as FR-25.13g drew it,
    and a **long press on 👥** opens a small menu instead — *für alle* first, then each traveler by name; a second long
    press and a second pick adds a second traveler to the same row the same way the inline buttons do, an action sheet
    having no way to show a pick as already selected, so a pick here only ever adds. A plain tap on 👥 keeps meaning *für
    alle* in every shape, unconditionally. A second, unrelated **long press on the name** shows what its ellipsis hid,
    in a small label above the line; a new press starting anywhere else in the sheet closes it. Free lines only — a line
    the trip already carries keeps 👥/spread as FR-25.13g left it. **A settled line has a way back, and the sheet a
    second filter (FR-25.13i).** The line's right edge carries *„zurücksetzen"* where the caller reports packing states
    at all (M4; G-8 keeps it off M6 and M8, like the verbs), and one tap puts every row the item has back on the list —
    a skipped one at amount one, a packed one with its count cleared, the same two writes M4's own row menu makes. It is
    a **reset, not FR-25.13f's undo**: it is driven by what the trip says rather than by the run's ledger, so it works
    on a decision made yesterday, on another device, or by somebody else, and it does not restore an amount a skip
    zeroed. A locked line is untouched by it (FR-5.7). Above the FR-25.13e switch a second line counts the decided rows
    inside the current tag filter (*„2 entschieden"*) and offers *„nur Entschiedenes"*, which shows those rows alone —
    the pass the reset exists for, instead of a scroll through the whole inventory. What it shows is FR-25.13e's
    **snapshot**: the rows decided when it was switched on (re-taken when the tag axis moves), so a line reset during
    the pass stays in place and flips to *„schon drin"* with its verbs back, instead of vanishing under the finger; the
    count beside the switch stays live and says how much of the pass is left. It is transient rather than remembered,
    unlike the FR-25.13e switch (a task, not a posture), it takes precedence over that switch, which steps aside
    entirely while it is on, and it is absent where nothing has been decided. A tag it finds nothing decided under
    states *„Hier ist noch nichts gepackt oder zu Hause gelassen."* with *„Alle anzeigen"* beside it — a third kind of
    empty next to the two FR-25.13e already has. **The sheet searches (FR-25.13j):** M9's search field sits between the
    head and the tag axis, persistent and unfocused on arrival, and narrows the rows by M9's rule inside the tag filter,
    grouping kept. A name no active item carries is offered at the top as FR-24.11's dashed *„‚{Name}' anlegen"* row (a
    retired one as its restore); tapping it or pressing Enter opens the *„Neuer Artikel"* sheet over the browse-sheet,
    with the filtered tag assigned. *„Anlegen"* closes back onto the browse-sheet with the query intact, and the new
    line reads *„✓ hinzugefügt"* with *„Rückgängig"*; *„Anlegen und öffnen"* closes both sheets and opens M10. An
    emptied result reads *„Nichts im Inventar passt dazu"*. **The composer says who the next add is for (FR-25.28):**
    the **for-whom strip** sits over the field — *Gemeinsam*, *Alle*, one avatar toggle per traveler, the same line a
    row unfolds on M4 — with a sentence under it stating the outcome (*„Wird gemeinsam angelegt."* / *„Wird für 2
    Personen angelegt, je 1."*). An add writes one row per lit traveler at one each, as the FR-25.1 cluster, and **opens
    nothing**: amounts are changed on the child rows it produced. It is where FR-25.8's *Gemeinsam* or per-traveler
    choice is made, and no membership editor opens. The choice survives an add, because rows are entered in runs, and is
    forgotten when the composer closes. It is **absent** — not disabled — wherever there is nobody to distribute over:
    on M8, whose Vorlage has no people, and on a trip with fewer than two travelers (G-8). **The strip speaks for what
    the composer adds and for nothing else:** the browse-sheet answers *for whom* per line with its own 👥 and avatars
    (FR-25.13g/h), so a sheet add — FR-25.13f's two verbs included — never reads the strip, and no add waits for the
    sheet to close (E2E-M4-102).
  * Collapsed sections: "Consciously skipped" items (FR-5.5) and "Late Packers" (pinned to bottom until departure day,
    then pinned to top). ~~**"Preparation" (FR-7.3)**~~ — **no section of its own (FR-7.6, ADR-068):** the
    preparations are in *Aufgaben für die Reise* above the list, each with the chip of its row, and every member may
    tick them.
  * **"Aufgaben für die Reise" (FR-7.4, FR-7.6 — *built*)** — the trip's own chores that prepare no row (*„Pflanzen
    giessen"*) **and the preparations its rows owe** (FR-7.3), in one list: open before resolved, the trip's own before
    a row's, a row's grouped by the row. A task that prepares a row ends in the **chip** of that row — its mark and its
    name, leading to the row's M5 sheet — and carries neither the assignment seat (FR-7.5: the row names its person) nor
    the ✕ (it is removed in M5). A task of the trip itself carries both and no chip, which is the whole distinction on
    the line. A collapsible card **above the list, directly under the header line** (at the list's foot, closed, it
    would go unseen), **always present** outside the FR-9.3 closing pass, because it is where the first todo is typed —
    once the trip's partition is on the device (ADR-033): before it, the section would read folded and then spring open
    under a tap meant to open it. It is **unfolded while any todo is open** and folded to its head once none is — or
    while the trip has none; a fold the user makes holds for the visit. Its head names the section and, once the trip
    has a todo, the check: *„1 von 2 erledigt"*, or *„✓ Alle Aufgaben erledigt"* with the head in `--jp-done`. Unfolded:
    open todos, each **ticked at its own end** — past the seat, the ✕ or the chip, where the packing row one line down
    carries its control; the resolved ones folded under *„{n} erledigt"* where unticking reopens one, and a composer
    (*„Aufgabe hinzufügen…"*, Enter or *Hinzufügen*, which writes the trip's own kind — a preparation is declared on its
    row, in M5). Nothing here counts toward the packing ring or any row's doneness; the check in the head and the figure
    in the header count **both** kinds (FR-7.6). Every trip member may tick; there is no G-3 claim, because there is no
    row. (E2E-M4-96, E2E-M4-97)
    * **The tick sits at the row's end.** Leading the line it would be at the far edge from the thumb and, next to the
      packing rows the section stands above, would read as a different kind of row — the same cost and the same fix
      as UX-9 one screen down. The ✕ keeps its place before it, so the destructive control is not the
      one the thumb lands on. M5's preparation list follows (E2E-M4-138, E2E-M5-31).
    **Whose job (FR-7.5 — *built*).** Each open todo ends, before its ✕, in the row's assignment seat — the
    same component as FR-25.25's: the assignee's avatar, or the dashed empty seat. A tap opens the row's picker, whose
    list here includes the current user, plus *niemand*; the choice is taken back from the snackbar. A resolved todo
    shows its assignee's avatar and no seat. Where nobody else is a member (Local, Single-User, an unshared trip) no
    seat is rendered; an assignee already set is shown as a plain avatar. An assigned todo is never hidden.
    (E2E-M4-133, E2E-M4-134)
  * Item rows with open prep todos show a small **prep badge** (wrench icon + count) next to the item name. Packed items
    with open todos use a distinct "packed with open prep" style (e.g., amber checkbox instead of green) to signal
    incomplete readiness.
  * **Packen abschliessen (FR-5.10 — *built*).** A ⋮ entry (G-12), worded to stay one word away from M2's *Reise
    abschliessen*: finishing the packing is not finishing the trip. Offered while the trip is not archived and its
    packing is open, a list with nothing left open included. It asks once, in **the app's own sheet** (U-3's chrome,
    head + lead + the exceptions on the sunken plane + one primary): the count of what is about to be left behind, then
    how many rows are started, due on departure day (FR-5.1) or held by somebody else (G-3), each on its own line.
    **When the last open row is packed, the step appears in the *„Alles erledigt"* empty state** the list shows at that
    moment (FR-25.11e), and the sheet opens from it, headed *„Das war das letzte offene Packelement."* There rather than
    in a band of its own, because nothing may enter the flow above a list somebody is tapping (ADR-060) and an
    unasked-for modal takes the screen from the tap that follows it — both measured, at seventeen and four e2e flows.
    Once per trip per visit, on the transition only, never over a list that has not arrived, and gone again as soon as
    the list reopens. The snackbar's one *Rückgängig* takes the whole batch back, the stamp with it (FR-25.31). A row
    nothing was packed of becomes FR-5.5's *weggelassen* with its claim released; a half-packed row keeps what is in the
    bag, its amount shrinking to the count (variant P1). Afterwards **M4 leads with a card** naming the moment and how
    many rows are *nicht mitgenommen*, carrying *Wieder öffnen* — which lifts the stamp and decides nothing, so a single
    row still comes back through the *Erledigte* reveal. The list stays workable: the composer is where it was, and
    while the packing is closed what is typed into it lands **packed**, its hint saying so instead of FR-9.1's.
    (E2E-M4-139, E2E-M4-140, E2E-M4-141, E2E-M4-142, E2E-M4-143) The sheet carries one more crossing line (FR-7.12)
    beside FR-7.7's tasks, with the cart glyph: *„N offene Einkäufe wandern von „Vor der Reise" zu „Vor Ort"."*
    (`m4-close-sheet-shopping`) — the packing rows still to buy before departure plus the shopping list's own entries
    there, which move in the same act and come back with the same undo. The task window's lines carry FR-7.11's due
    pill, the dated ones first, and M5's mode select does not offer *Vor der Reise kaufen* for a row not already there
    while the packing is closed.
  * **Packed or forgotten (FR-5.11 — *built*).** Once the packing is closed the composer carries a
    two-way choice above its hint (`role=radiogroup`): ***Eingepackt*** — *stand nicht auf der Liste* — and
    ***Vergessen*** — *blieb zuhause*. *Eingepackt* is selected each time the composer opens and is exactly the add
    above; the choice stays across a run of adds. On *Vergessen* the hint reads *„Wird als vergessen vermerkt, damit es
    nächstes Mal auf der Liste steht"* and an add writes a row that stayed home: skipped at quantity 0, flagged
    *Missing*, so it is neither packed nor open and the figure does not move. It never reads the for-whom strip.
    Revealed with the other done rows, it says *„Vergessen einzupacken"* where its siblings say *„Bewusst
    weggelassen"*. No choice before the close, in M8, or on an archived trip. (E2E-M4-146)
  * **Consciously skipped (FR-5.5) — a state, not a *section* (FR-25.2).** A skipped row is a done
    row: it leaves the working list and returns, dimmed, through the same *Erledigte* switch as a packed one (two
    mechanisms would show it twice). What it keeps is its own words — *"Bewusst weggelassen"*, or the FR-20.2 reason —
    and the reverse action *Doch einpacken*, which restores it to open with quantity 1. Purpose unchanged: acknowledge
    that an item was considered and deliberately not packed, distinguishing "forgot" from "decided against."
  * Filtering: the faceted panel described above (FR-25.11), reached from the app-bar filter icon. **Decided: the
    filter, the Erledigte switch and the grouping persist per trip for the session** (FR-25.18) — deliberately
    session-scoped where grouping is durable, since a forgotten filter hides rows; a fresh session starts unfiltered and
    the chip row keeps the active filter visible throughout.
* **Actions (FR-5.5):** **press and hold a row** → its action sheet, the M7 idiom: *Jetzt packen* (FR-5.2), *Nicht
  einpacken* (FR-5.5) and — on a trip that is running or archived — *Als ungenutzt markieren* / *Ungenutzt aufheben*
  (FR-9.3); on an already-skipped row the sheet offers *Doch einpacken* and nothing else, since "pack now" on a row
  nobody is packing would invent a third state. The *ungenutzt* entry is the same judgement M5's *Details* block spells
  out, one gesture from the list instead of three taps into a fold nothing ever asks for — the menu-plus-control pair
  FR-5.5 settled on. It is a toggle, so the entry that sets it is also the one that takes it back, and **the row shows
  the mark** beside its mode icon: a judgement invisible on the row cannot be reviewed before the pass ends. A locked
  row (G-3) has no menu. **A press that begins on the packing control is that control's, not the row's (E2E-G6-01):**
  the stepper has holds of its own — G-6's + completes and − zeroes — which could never fire if the row armed its menu
  on every pointerdown inside it; the control column stops the row's *press* as it stops its *click*. Holding a row's
  name or its body opens the menu, holding its ✚/− does what G-6 says. **There is no swipe** — it would be announced by
  nothing and its option panel breaks out of the row's card (the M7 A2/B2 round). Skipping raises the FR-25.2 snackbar
  naming the FR-20.2 companions it took along, with one undo for the whole cascade; a revealed skipped row carries
  *"Bewusst weggelassen"* — or its reason where a cascade put it there — in the line a packed row uses for its FR-25.17
  stamp. tap row → M5; long-press checkbox → complete item. M4's bar holds no lifecycle step: M6 is the switcher's
  *Einkaufen* pill (G-9), and archiving is M2's *Reise abschliessen* (G-12), which opens M4's closing pass (FR-9.3)
  and continues into M14. **Companions (Addendum 3.20):** skipping an item cascades to co-skip its dependent companion
  items, which are revealed with the other done rows carrying their reason (e.g., "weggelassen: „Drohne“ ist nicht
  dabei", FR-20.2); a quick-add that matches a master item pulls its missing required companions in automatically
  (FR-20.4).
* **States:** Real-time: rows animate on remote changes with actor attribution ("packed by Sarah"); item blocked by open
  tasks shows a task badge and refuses completion with inline hint (FR-7.2); offline behaves identically (G-5).
* **Navigation:** From M1, M2, notifications. Deep-link anchor target (G-4). **Desktop (≥ 900 px, per G-9): two-pane
  layout** — M4's list occupies the left/main pane while M5 opens as a **persistent side panel** on the right rather
  than a bottom sheet; selecting a different row swaps the panel's content in place. Below the breakpoint, M5 remains
  the mobile overlay sheet described above. **The pane is the frame's, not the screen's (ADR-064)** — it is a flex
  column of the app body beside the content column, so the two never overlap and the pane ends at the window's edge; a
  layer inside the screen would cover the right 400 px of a 600 px column at every desktop width. The column re-centres
  in what is left when the pane opens, which is the accepted cost.

### M5 — Item Detail (Bottom Sheet)

* **The sheet is ordered by why it is opened.** The screen is opened for one of three reasons — to pack the thing, to
  note something about it, or to change one attribute — and nine equal sections, every one expanded, would give all
  three the same weight. The order is the order of those reasons: **identity** (name,
  small reference photo, one context line), **packing** as its own block and the largest control on screen, a read-only
  **glance row** for everything the sheet can also change, then **Preparation** and **Notes** with their composers, and
  finally *Details ▾* holding membership, procurement, luggage, the Late-Packer flag, the FR-9.1 flags and the
  FR-25.17/25.19 stamp.
* **A row whose inventory item was renamed says so under its name** (FR-27.16): „Im Inventar heisst
  es jetzt „X"." on the action colour's wash, with *Übernehmen* — the one-row form of M4's ⋮ sheet, reporting through
  M4's snackbar with *Rückgängig*. Absent when the names agree or when the FR-27.4 card is already asking.
* **It is a sheet over M4, and a side panel beside it above the G-9 breakpoint** — one content component either way,
  and *beside* is literal (ADR-064): the pane is a column of the frame, not a layer over the screen. The
  route carries it (`/trips/:tripId?item=:itemId`), which is what makes a notification deep link (G-4) land on the item
  with the list behind it. **The item is a query on the list's own route, not a path** (ADR-046 — to Ionic a
  parameterised path is a page of its own, so every open would mount a second copy of the list behind the sheet), and
  opening or closing *replaces* rather than pushes: the sheet is a state of the screen, and one screen keeps
  one history entry. **On a phone the sheet's ✕ (or a swipe) is the way out** — its backdrop covers the app bar, so `‹
  back` is deliberately unreachable there; with the desktop panel, back closes the panel first (`meta.overlayQuery`).
* **The sheet is as tall as what it holds** (FR-21.25), through the app's own `SheetModal` chrome rather than a third
  copy of the same five modal variables. A fixed height would spend two thirds of the screen on nothing for an item with
  no prep, no notes and *Details* folded away, over the list that could use it (measured on a 390×844 phone: 496 px
  rather than 743 px, growing to the 85 % ceiling once *Details* is unfolded). Weight follows the same reasons: the pack
  control is drawn at a main action's size rather than a row's — it is why the sheet is opened — and the *Add* buttons
  of prep and notes are not the only filled buttons on it, since a fill is what makes a button read as the screen's
  answer. A composer's field and its button share a height and an edge.
* **The context line and the FR-20.4 chips say what the sheet already knows.** The one line under the name
  is category · weight · amount, and the amount goes through the app's one money formatter, so an instance that names
  a currency (FR-21.9) names it here too. The chips that offer a suggested companion write the position the dependency
  describes: its **category**, so the new row is filed where FR-24.2 files it rather than under *Ohne Kategorie*, and
  its **quantity**, as the required-companion path does (FR-20.2). Both facts travel on the suggestion itself rather
  than being looked up again at the tap, so no caller can forget them.
* **The reference photo is small** (44 px beside the title, FR-22.1): it helps recognise the thing without taking the
  top of a screen most rows have no photo for. **The same slot carries the item mark when there is no photo** (G-15,
  Addendum FR-28.4) and stays empty when there is neither — the sheet's identity block is the one place both answers to
  "what is this" can live, and the ladder decides which is shown. The mark is not editable here: it belongs to the
  master item, and M10 is where master data is changed (FR-28.7).

* **Purpose:** Everything about one trip item without leaving context.
* **Concept-review refinements (Addendum §3.25):** the sheet is reorganised with
  **progressive disclosure** — *level 1* shows only the header, a compact read-only **glance-chip row** (who needs it ·
  mode · luggage · ⏰ · packer), the **Preparation** section, and the **Comments** thread **with a visible composer**;
  everything else collapses behind a **"Details ▾"** toggle. Inside Details: (1) delegation is reversible — *Packed by*
  gains a **"niemand"** clear option; (2) the container picker lives here, labelled **"Gepäck · optional"**, default
  none; (3) mode labels are 🧳 Packen · 🛒 Vorher · 📍 Vor Ort with **Late Packer** a *separate ⏰ flag* (FR-25.4); (4) the
  prep lifecycle (add / resolve / reopen, packed-with-open-prep amber) is explicit.
* **No "Used by" attribution; item membership editable:** the free-form *Used by* traveler
  label on a shared row (base FR-4.2) is **not carried** — it earns its keep only for per-person items and
  weight-by-person, and read as noise otherwise. In its place, M5's **"Wer braucht das?"** control edits **per-person
  membership** directly: `Gemeinsam` = one shared row for all; picking travelers turns the item into a **per-person
  item** (FR-1.4/25.1) with one independently-packable row each — so *adding Leonardo puts a "Sonnenbrille" row on his
  list*, removing a traveler drops their row. Consequences: M4 **shared** rows show no for-whom avatar (only
  per-person child rows carry their owner avatar) — their leading column holds an **empty seat**, the door to the
  for-whom strip, which names nobody; person-grouping (M4) and per-person analytics (M12) derive from
  **per-person rows** rather than a shared-row label; the shopping *Used by* idea (FR-25.6) is revisited under this
  model. FR-25.21 is where the multi-select, the per-traveler amounts and the write path live. The control is not
  M5's alone and not a sheet — see *The for-whom strip* under M4 (FR-25.28).
* **On a per-person instance the sheet says which one it is** (FR-25.21): the M5 header names the
  traveler and that instance's amount (*„für Leonardo · 3 Stück"*) and the glance chips carry the traveler beside a `3
  Personen` chip, so it is never ambiguous whether an edit here is the person's or the item's. Membership is the one
  field that is the item's, and it says so: *„Änderungen hier gelten für alle Zeilen dieses Packelements."*
* **Elements — progressive disclosure:** *Level 1 (always):* header (name, quantity stepper, state); a compact
  **glance-chip row** summarising the advanced blocks (membership · mode · luggage · ⏰ late · packer) with a **"Details
  ▾"** toggle; **Preparation Todos (FR-7.3)** (a tick at the end of each line, where M4 ticks the same task, + inline
  "Add prep todo…"); **comment/task thread (FR-7.1/7.2) with a visible composer** and per-comment "flag as task"; packed
  items with open todos show an amber state. **The for-whom strip (FR-25.28)** stands at level 1, under the packing
  block: the toggle line, and under it one line per lit traveler with a **quantity stepper** — a list rather than a
  stepper hung under each avatar, because a stepper is wider than a toggle and would reach into its neighbours' columns
  at five travelers on a phone. It closes with the summary *„3 Personen · 6 Stück"*, which a standing question replaces.
  It acts on **every instance** of the item, not only on the row the sheet was opened from. **No save button** — every
  control commits immediately (G-5, FR-25.15). Absent under two travelers (G-8), where the membership glance chip is
  what is left to say *Gemeinsam*; read-only under a foreign claim on any instance (G-3). *Level 2 (behind Details ▾):*
  *Packed by* delegation picker **with a "niemand" clear** (FR-4.2/6.2); mode selector (🧳/🛒/📍, FR-3.1); **optional**
  container picker default none (FR-10.2); Late Packer ⏰ flag; *Unused/Missing* flags (FR-9.1, active trips only);
  history sparkline (FR-14.1).
* **The FR-9.1 flags are controls, not a readout.** A readout would leave **no surface in the whole app that could
  mark an item *unused*** — and *unused* is the flag M14's assistant is mostly about (FR-9.2 is written around
  overpacking). They are two toggles with a one-line hint each („Mitgenommen, nie gebraucht" / „Gebraucht und nicht
  dabei"), and both are revocable, because a flag set by mistake is otherwise permanent. **The two have different
  windows (FR-9.3):** *unused* is offered
  while the trip is active **and after it is archived**, because M14 — the first place anyone sees what the flag was
  worth — runs on the archived trip, and FR-9.1's active-only rule was true of setting a judgement in the moment and
  false of correcting it; *missing* keeps the active-only gate, since it is stamped by the FR-5.6 quick-add and a thing
  bought after the trip is not a thing that was missing on it. A planning trip offers neither. Both flags show in the
  glance chip row.
* **The packing block names itself (UX-10).** The stepper/checkbox box carries the same eyebrow label as
  *Vorbereitung* and *Notizen* („Einpacken"): on a quantity-1 row the block would otherwise render as an unlabelled
  outlined box holding only a checkbox and the state chip, readable as anything.
* **"Nicht einpacken" sits beside the stepper (FR-5.5).** A full-width, spelled-out control directly
  under the packing block, flipping to *Doch einpacken* — and picking up the `--jp-done` role — once the row is skipped.
  It is a control rather than a chip because it is a *decision about* the row, not a property of it, and it is spelled
  out because M4's press-and-hold is the fast path while this is the one a user finds without knowing it exists. The
  stepper says *how many*; only this says *none, on purpose*.
* ***Zugewiesen an* is a control, not a readout.** It is the writer of `packer_user_id` (FR-25.19) that every surface
  reading responsibility — M4's row avatar, the „zuständig war …" stamp, FR-25.20's filter and its reveal bar — depends
  on, and the app's way to fire the FR-6.2 delegation notification. It is a picker in *Details ▾* beside the luggage
  one, with **„niemand"** as its clear, and it offers **the trip's members other than yourself** — not the instance
  directory the sheet also carries for naming a packing record, because a row handed to a non-member notifies somebody
  who cannot open the trip (P-3), and a row handed to yourself says nothing. It is therefore **absent** wherever that
  list is empty (G-8), which is the one rule covering all three cases: Local Mode has no members, Single-User has
  exactly one (the store writes a membership row for every trip's creator, there too), and an unshared Server-Mode trip
  has only you. A locked row (G-3) writes nothing.
* **Actions:** edit **membership** (add/remove a traveler → adds/removes that person's packing row, FR-25.1); **mark the
  row deliberately not packed, and take that back** (FR-5.5); set **Zugewiesen an** → notification (FR-6.2) — the
  *packed by* record beside it is written automatically and is not editable (FR-25.19); **clear *Packed by* via
  "niemand"**; expand/collapse **Details**; add a comment (composer); resolve/reopen tasks; add/resolve/reopen prep
  todos (FR-7.3); "Buy now" on *Vorher kaufen* items → mode flips to *Packen* with undo snackbar (FR-3.3). In
  Single-User Mode (Addendum FR-17.3), *Delegate* is hidden — the sole user is already every item's *Packed by*.
* **States:** Locked by another user → read-only with lock banner; unsaved edits impossible (every control commits
  immediately, G-5). **The for-whom strip carries its own lock line** (FR-25.21, FR-25.28, G-3): it is frozen by a claim
  on **any** instance of the item — a conversion rewrites every row of the cluster — so the claim may sit on a row the
  sheet was not opened from, where M5’s own banner is absent. The line names the holder (*„Alice packt gerade eine
  dieser Zeilen."*) and falls back to *„Jemand …"* for a holder the directory does not carry (E2E-G3-04).
* **Navigation:** Opens over M4/M6; swipe down to dismiss.

### M6 — Shopping Views

* **Purpose:** The trip's shopping list (FR-3.2), a feature module of its own (FR-30, ADR-066): it holds the entries
  typed into it, and shows the packing list's buy-mode rows beside them.
* **What M6 is (FR-30):** the two lists as sections one under the other, a ***Fällig*** block above them, M25's
  composer, the list's own entries under their tags, the packing list's buy rows under one heading, and one *gekauft*
  fold per list — **no tabs, no filter bar, no search field, no row sheet for a packing line, and no FR-25.13
  composer**. The screen lives in `client/src/shopping/` and renders lines without knowing whose they are
  (`lib/shoppingSources.ts`); the packing side supplies its rows as lines with their FR-3.3 writes bound in. Not built:
  FR-25.11g/k, FR-25.13a's two fields and FR-25.6's per-item note; owed: FR-25.12's row sheet (*Zugewiesen an* and
  *Beschreibung*), which would apply to both kinds of line.
* **M25's look and feel.** One look and feel across the two lists, M25's: **no tabs**, because a tab hides one list
  behind the other and a thing due tomorrow on the tab not open is a thing nobody sees; **M25's composer** (a card, with
  list chips and day chips); **two-line rows with no ✕** (an entry is removed from its sheet); **one *gekauft* fold per
  list**; a finished packing's *before* **folded at the end**, as M25's is. FR-30.8's rule decides only whether the
  composer still offers *Vor der Reise*.
* **One set of components for M6 and M25**, so the two are uniform by construction. Both screens are drawn from
  `components/global/`: `ListComposer` (the card, the field and its ＋) with `ChipRow`s of `ChoiceChip`s and `DueChips`;
  `DueBlock` (*Fällig*, tinted faintly in the overdue ink on both); `ListSection` (a section's head and count);
  `ListGroup` (a tag's heading and drop frame); `ListRow` (leading slot, name, facts line, trailing tick); `FoldToggle`
  (*„› N erledigt"* / *„› N gekauft"*); `RestLine` (a section with nothing open, at the end); `TagPicker` (the
  search-or-create tag mask, test ids `tag-pick-*`) and `EntrySheet` (name, day, tag, *Entfernen*, the writing button).
  What remains per screen is what a line *is* — a task or a thing to buy — never how it looks. The shopping module
  reaches these as kernel (ADR-066).
* **Elements, top to bottom:**
  * **The composer** (`m6-composer`, a `jp-card`, M25's shape): the **text field** with its ＋ (placeholder *„Was
    kaufen? z. B. Milch, Brot …"*), then chips that file the entry as it is typed. **The list** (`m6-composer-list`):
    *Vor der Reise* / *Vor Ort*, *Vor der Reise* chosen — offered only while FR-30.8's rule still names *before*
    (the trip not yet under way); otherwise the row goes and everything written is for *Vor Ort*. **The
    tag**: the tag chips and *＋ Tag* (below). **The day**: M25's day chips (`DueChips`), shown once something is
    typed — *Heute*, *Morgen*, *Vor Abreise* (for *Vor der Reise* only, while that day is later than tomorrow) and
    *Datum…*. The list and the tag stay chosen for the next entry; the day does not.
  * **The *Fällig* block** (`m6-due`), drawn only when something is pressing: every open line overdue, due today or
    in the next two days, **from both lists**, earliest first, one `ListGroup` headed *Fällig* with its count. **A
    line in it leaves its group.** Its rows name their tag on the second line — *Eingetragen* for an untagged entry,
    *Packliste* for a packing line (which carries no day today, so it does not appear here yet).
  * **Two sections**, *Vor der Reise* (`m6-before`) and *Vor Ort* (`m6-local`), each a `SectionHead` whose count is
    **what stands under it** (*„N offen"*). **A list with nothing open under its heading** — also when its last open
    lines stand in the *Fällig* block, since a heading over nothing reads as a list left over — leaves reading order for
    **one line at the end of the screen** (`RestLine`, M25 alike): *„Vor der Reise · nichts offen"*, a statement; *„· 1
    fällig"* in place of *nichts offen* while the block holds some of its lines; *„· 2 gekauft ›"* once something was
    bought, a fold that opens onto the bought rows directly (`m6-before-fold` / `m6-local-fold`). Inside each: the
    packing list's rows in that mode first, **combined under one *„Packliste"* heading regardless of category** (a
    packing category is not this list's tag), then the list's own entries — **a section per tag, A–Z, then the untagged
    under *„Eingetragen"* (FR-30.9)**. An entry and a packing row of the same name stay two lines. FR-13.3's destination
    entries are not built.
  * **One *gekauft* fold per list**, at the section's end (*„› N gekauft"*, `m6-bought-bar`, M25's *erledigt* fold)
    — see FR-25.11j below.
  * **The empty state** (*„Nichts zu kaufen"*, `m6-empty`) only when nothing is open and nothing bought on either list.
* **A line: two lines at most, as a task's.** The first is the grip (own entries; a dashed placeholder for a packing
  line) and the name; the second, where there is anything to say, the **due pill**, the amount when above one, the tag
  (in the *Fällig* block only) and — for a per-person item — the recipients (FR-25.6). **Who is to buy it (FR-30.12)**
  stands at the row's edge before the check-off, M25's seat (`m6-row-assign-<name>`): on an own entry in Server Mode
  when anybody else is on the trip; an avatar alone while selecting or on a closed list; nothing on a packing line,
  whose person is M4's question. The seat opens the person picker (headed with the entry's name, *„niemand"* last) and
  the hand-over raises a toast with **Rückgängig**. The recipients (*„für Mia"*, an 18 px avatar without a ring) and
  the assignee (the ringed 24 px avatar at the edge) never share a place. The check-off stands at the row's own
  edge. **No ✕ on the row**: an own entry is removed from its entry sheet (*Entfernen*, `m6-entry-remove`), as a task is
  from its own. A packing line offers neither.
* **Before the trip, closed (FR-7.12, *built*):** once the packing is finished, *Vor der Reise* is the record of what
  was bought before the trip. Closing the packing moves its open lines to *Vor Ort* (M4's close sheet names the number);
  the list is not drawn in reading order but **folded at the end of the screen**, M25's way: one line (*„Vor der Reise ·
  N gekauft"*, or *„· abgeschlossen"*, `m6-before-fold`) that opens onto the lock sentence (*„Die Packliste ist
  abgeschlossen — diese Liste zeigt jetzt, was vor der Reise gekauft wurde."*, `m6-before-locked`) and the list's bought
  fold, which can be read but not put back. The composer stays, writing for *Vor Ort*. Reopening the packing lifts it.
* **Tags (FR-30.9, *built*):** under the field a **chip row** — the tags still in use on the trip, those made in this
  visit, and *＋ Tag*. A chip selected files the next entry and stays selected after the add; a second tap on it
  unselects and the chip stays. *＋ Tag* (carrying what was typed in the field), and a tap on an own entry's name, open
  the **entry sheet**, laid out like the packing list's creation sheet (`CreateItemSheet.vue`): head *Neuer Eintrag* /
  *Eintrag bearbeiten* with the close, a **Name** field, M10's **search-or-create mask** (`ShoppingTagChooser.vue`, the
  shape of `TagChooser.vue`: a search field *„Tags suchen oder anlegen…"*, the chosen tag as a chip with its ✕, the
  matching tags as chips, a dashed *„… neu anlegen"* chip for a name nothing carries — matched case-insensitively, Enter
  chooses or creates — and a summary line) and one button, *Hinzufügen* or *Speichern*, disabled while the name is
  blank. Nothing is written before the button; *Speichern* writes the fields that changed. There is no inline field for
  a new tag. A packing row's name opens nothing. **An untagged own row carries no label of its own** — a *＋ Tag*
  repeated under every such row reads as clutter at any real list length; the row's own tappability is the whole
  affordance, exactly as a tagged row's is. **The reveal of what was bought is not grouped:** its rows say their tag as
  a small label under the name, and its check (which puts the line back) is at the end like the open rows'. (E2E-M6-31)
* ***Meine* (FR-30.12, *built*):** M25's chip above the composer (`m6-mine`), where anybody else is on the trip: only
  the lines I am to buy, on both lists and in the *Fällig* block; a packing line leaves too. With nothing of mine the
  lists fold to their end lines rather than the empty state. (E2E-M6-37)
* **The day an entry is due (FR-30.10, *built*):** the entry sheet carries a ***Fällig*** row between the name and the
  tag mask — **M25's day chips** (`DueChips`: *Heute*, *Morgen*, *Vor Abreise* where it applies, *Datum…* for the app's
  date control, ADR-035; the day in force as a chip with its ✕) — written with the sheet's button like the other two;
  the composer carries the same chips (above). An open entry with a day wears **M25's due pill** on its second line:
  *Überfällig* (red), *Heute*, *Morgen*, *In 2 Tagen*, a short date further out; one due within two days stands in the
  *Fällig* block instead of its group. Inside a group the dated entries lead, earliest first. A packing line carries no
  day; a bought entry wears no pill and its sheet offers no day. (E2E-M6-35)
* **Several entries retagged at once (FR-30.9, *built*):** a long press on an own row, or the app bar's own icon
  (`checkboxOutline`, mirroring M9's `m9-select`, FR-24.9) — active state on while the mode is on — arms an inline
  **selection**, reaching every own entry on both lists, tagged or not; unlike M9's, this selection offers a *retag*, so
  an already-tagged entry is as selectable as an untagged one. The app bar becomes the selection's bar (G-20): a ✕ to
  leave, *„Nichts ausgewählt"* at zero and *„N ausgewählt"* from one (the same two-form split as M9's own bar, since one
  entry is not a plural), and *„Alle N"* over every own entry; the field and chip row stay in place at rest. Each row
  grows a leading checkbox (a dashed, dimmed slot for a packing row's projection, which never carries a tag and is named
  once below the list rather than repeated per row: *„Packlisten-Positionen tragen nie ein Tag — nicht wählbar."*); the
  row's own tap toggles it instead of opening the entry sheet. A row selected by the long press that started the mode is
  not toggled off by the tap the browser sends on release — the same care M4's row menu takes with its own trailing
  click. Once at least one entry is picked, a bottom bar offers **Tag vergeben** and — where anybody else is on the
  trip — **Zuweisen** (FR-30.12: the person picker headed *„Wer kauft N Einträge?"*; only what changes is written, and
  the toast's **Rückgängig** gives each entry its own assignee back). **Tag vergeben** opens the same search-or-create
  sheet the single entry does — titled *„Tag für einen Eintrag"* / *„Tag für N Einträge"*, and with no trailing summary
  line, since that sentence is written for one entry staying staged until *Speichern* and this sheet applies the instant
  a chip is chosen, to more than one. Choosing files every selected entry at once; the mode ends with the batch, and a
  toast with **Rückgängig** puts each entry back under the tag it carried before. The header's icon is offered only
  while an own entry is open to select. **The gesture and its chrome are shared with M25** (ADR-075): `useRowSelection`
  holds the keys and the hold, `SelectBox` and `BulkBar` draw the box and the floating bar (the count is the app bar's,
  G-20), and `ListGroup` the headings and their drop frame — one component each, so the two lists cannot drift apart.
  (E2E-M6-32) M9 renders the same pieces, without the grip (see M9); so do M11's unassigned bucket and M23 (see there),
  flat lists with neither grip nor headings.
* **One entry, dragged into another heading (FR-30.9, *built*):** while nothing is selected, an own row carries a
  **grip** (`reorderThreeOutline`) at its leading edge, in the checkbox's own place. Pressed and carried across the
  list, it lifts the row (a clone follows the pointer, framed in the accent colour, while the row itself only dims in
  place) and the heading under the pointer takes the same accent frame while it could honestly hold it — a tag's own
  heading, or *„Eingetragen"* to clear one; the packing list's combined heading never frames and never takes it, the
  same refusal a selection gives it. Letting go over a framed heading files the row under it in one act, through the
  same `bulkSetTag` a selection's *Tag vergeben* uses (a batch of one), and raises the same toast with **Rückgängig**.
  The gesture itself is `useDragToGroup` (FR-7.8's own, first built for the trip's tasks) — a lift-carry-drop with no
  shape of its own beyond a place's name and what was dropped on it. The frame is the mockup's blue outline, on both the
  lifted clone and the target heading. A packing row has nothing to give the gesture either — its grip slot carries a
  dashed placeholder instead of standing empty, and the packing list's heading dims for as long as something is being
  dragged, the same refusal `SelectBox`'s `off` gives the checkbox one slot over; a line below the list also says so
  once in words, next to the checkbox's own hint (an empty gap and an inert heading read as broken, not as absent). The
  lifted clone's frame and the dimmed row it left behind are drawn once, in `composables/dragToGroup.css`, and reach
  every screen that lifts something with `useDragToGroup` — M25's own drag (FR-7.8) draws the identical frame for the
  same reason. (E2E-M6-34)
* **A bought row's own undo (FR-25.11j, *built*):** checking a row off — an own entry's or a packing row's projection
  alike — leaves the open list with a wash-collapse-fade, M4's FR-25.2 recipe, rather than vanishing, and raises a toast
  with **Rückgängig** immediately, M4's own shape (`presentToast`, anchored clear of the FAB) rather than the dashboard
  card's inline panel (which exists only because several cards share M1's page). The bought fold is the way back once
  the toast is gone. (E2E-M6-33)
* **Whether *Vor der Reise* is offered (FR-30.8 — *built*):** until the trip is under way the composer offers *Vor der
  Reise* and starts on it; once it is — started (even ahead of its date), its first day come, or its packing declared
  finished (FR-5.10) — it writes for *Vor Ort*. M25's composer asks the same rule (`beforeIsOver`). Until the trip
  itself is on the device the rule reads *before* (ADR-033's reasoning). The dashboard card (FR-30.7) opens by the same
  rule, from the same function. (E2E-M6-30, E2E-M25-19)
* **Actions:** Type and tap ＋ (or Enter) → an entry on the list the composer names; the field clears for the next. Check
  off an entry → bought, under its list's fold. Check off a packing row → FR-3.3 on the row (BUY_BEFORE → on the packing
  list, BUY_LOCAL → packed). *Entfernen* in an entry's sheet → removed. A packing row leaves only by being bought or by
  changing mode on M4/M5.
* **The ＋ bottom right (FR-30.6):** M4's FAB, same place and glyph. It scrolls the list to the top
  and puts the cursor in the field — the field stays where it is, so the screen keeps one way to add, and the ＋ is the
  way back to it from a long list. The list scrolls clear of the FAB's footprint (FR-25.11h's 96 px).
* **Adding an inventory item to buy (FR-30.2):** on **M4**, with the composer, then its mode — in M5, or *Vor Ort
  kaufen* from the row menu (FR-5.9). M6 writes no packing rows. The composer, its create sheet (FR-24.11) and its
  duplicate exclusion (FR-25.13d) are M4's and M8's.
* **Per-person items (Addendum §3.25 / FR-25.6, *built* with FR-25.21):** **one aggregated row per per-person item** —
  summed quantity, recipients' names and avatars, one check-off settling every instance. The row is keyed exactly like
  M4's cluster — the shared `perPersonKey` in `domain/packingView.ts` — the bought fold aggregates by the same rule, and
  each list's count counts *rows to buy* rather than `trip_items` rows. A line is not assigned to a traveler from here
  and carries no per-item note: free-form *Used by* is removed (FR-25.10), and assigning a line belongs to FR-25.12's
  owed row sheet.
* **What was bought (FR-25.11j, *built*):** checking a row off takes it off its list — a BUY_BEFORE row by changing its
  mode, a BUY_LOCAL row by being packed — and the row records **which list it left**. A BUY_LOCAL row checked off on the
  **packing list** rather than here records nothing of the kind, and is listed by its packed state instead. The bought
  rows sit in the list's *gekauft* fold, off by default, the count in its label, one tap. A revealed row states where it
  went (*„auf der Packliste"* for a purchase before departure, *„eingepackt"* for one at the destination) and its
  checkbox is the way back — unchecking restores the mode it was bought from and clears the record. Each list has its
  own fold, and the fold is **absent, not empty**, when nothing was bought from that list. Deliberately **not**
  remembered across a session the way M4's switch is (FR-25.18). **Every revealed line carries FR-30.4's stamp** —
  *„gekauft von Andy · heute 14:32"* with the buyer's avatar, or *„gekauft · heute 14:32"* where nobody can be named
  (Local Mode) — under its note. **An entry (FR-30.1)** is revealed the same way, with **no note** — it was never
  anywhere but here.
* **States:** An empty screen, once the trip partition is here (ADR-033), shows the G-7 empty state with the hint *„Trag
  oben ein, was ihr kaufen wollt. Was auf der Packliste gekauft statt eingepackt wird, erscheint hier von selbst."* —
  the one place the screen says where its other lines come from. Both lists empty → the G-9 switcher keeps the
  **shopping pill** and drops only its **count**: the destination exists either way.
* **Navigation:** From the G-9 trip switcher, which carries M6's pill on all four of the trip's views (FR-21.21);
  deep-linkable.

### M7 — Template List

* **Purpose:** Manage modular master templates and the groups they are built from (FR-1.2, §3.27).
* **Elements:** One shared instance-wide list (FR-1.6 MVP simplification — no my/published split, no publish toggle),
  segmented **Alle · Ferien · Gruppen** (FR-27.6) — the middle tab carries the *short* form of the scope name, because
  at 390 px "Ferien-Vorlagen" truncates to an ellipsis and an ellipsis names a scope worse than one word does; the
  section head below spells it out in full. *Alle* renders the two scopes as sections, vacation templates first — they
  are what a trip starts from, groups are the building blocks — and group rows carry a *Gruppe* chip. A section is
  **absent rather than empty** when its scope has no rows, and a single-scope tab drops the head entirely: the segment
  has already said which scope you are in. Per row: name, item count; a composed template counts its **resolved** set
  (own positions + included groups, deduped), so "2 Gruppen · 16 Artikel" rather than "0 Artikel", with an *enthält: …*
  line naming the included groups.
* **States:** No templates at all → the G-7 empty state naming both scopes, and **no segment** — a filter over an empty
  set is a control with nothing to do. The empty state carries **no CTA buttons of its own**: create is the FAB and
  import is the header icon, both already on screen, and a third and fourth copy of them would be the empty state's only
  content. Nothing *matching* the search → "Keine Vorlage gefunden", with the segment still in place, because there is
  something to widen back to.
* **Actions:** Tap → M8 (every template is editable by every account); **FAB asks which scope to create** (two-option
  chooser with one-line explanations, FR-27.6) — **but only on *Alle***: on a single-scope tab the segment has already
  answered, so the ＋ creates that scope and the sheet opens on the name, titled with the scope it is about to create —
  **picking a scope reveals the name field in the same sheet** (decided on a rendered variant pass, B1–B3): one surface,
  one commit, and no row exists until the name does. A create-then-rename flow would write an unnamed row on the first
  tap. **Long-press a row (right-click on desktop) → context menu with *Umbenennen*, *Export* and *Löschen*** (Addendum
  FR-18.2), and ***Vorlage teilen…*** after *Export* where the browser can share a file (FR-18.2) — decided on a
  rendered variant pass (A1–A3; a swipe's panel breaks out of the card) — the row itself keeps only what identifies it
  (name, counts, scope chip). Rename is an alert prefilled with the name; delete confirms first and states that
  generated trips keep their rows (FR-2.4), and **a group something includes refuses deletion naming its consumer** —
  the same stance as the FR-27.6 promotion guard, because a cascade would silently rewrite every Vorlage built on it.
  **A group a *trip* has already used is a different case (FR-24.3, *built*):** that delete is not refused — the Vorlage
  is **retired**, kept so FR-9.2's provenance keeps resolving and hidden from this list, from M3's scope rows and from
  M8's group picker. The confirm carries M10's outcome sentence in its three forms, for the same reason and with the
  same wording; the client's own count is advisory and the server's is authoritative (ADR-032); the outcome is stated
  before the tap rather than reported after it in G-2's detail. While the menu is open, row taps are inert. **Import is
  the header icon beside the page title** → M18 — ~~the FAB's *Import from file* entry~~ is **not built**: the FAB asks
  which scope to create and has no menu, and a second door to a function that already has one buys nothing. E2E-M7-05
  asserts the icon, including that the way back lands on M7 rather than on M18's declared parent. **A taken name is met
  in the sheet, not by a push (FR-1.6):** `templates.name` is UNIQUE instance-wide and across both scopes, and the
  device holds the whole master partition, so as the name is typed the sheet carries a line under the field naming what
  already holds it *and in which scope* ("Die Gruppe „Makro“ gibt es schon.") with an **Öffnen** button beside it, and
  *Anlegen* is disabled. Offering the existing row rather than only naming it is the point: someone typing a name that
  exists almost always means the thing that has it. The rename alert refuses the same way — a toast names the holder and
  the alert **stays open with the typed name**, because dismissing it would throw the edit away.
* **Navigation:** Tab 3.

### M8 — Template Editor

* **Purpose:** Define the positions of one template — and, for a Ferien-Vorlage, which groups it is built from (FR-1.2,
  FR-27.1).
* **The editor (Addendum §3.25/§3.27)** is **scope-shaped** and follows the same capture grammar as the packing list:
  * **A Gruppe shows only *Positionen*** — there is nothing to nest, since the hierarchy is deliberately two levels
    (FR-27.1). **A Ferien-Vorlage additionally shows *Gruppen***, whose picker offers groups only and carries **"Neue
    Gruppe anlegen…"** inline, so a missing building block never forces a detour through M7. A resolution footer states
    what the composition actually yields after dedup.
  * **The scope is switchable but guarded** (FR-27.6): a Vorlage that still includes groups cannot become a Gruppe, and
    an included Gruppe cannot be promoted — the editor names the consumers ("Eingebunden in: …") instead of failing
    opaquely.
  * **Adding a position is the packing list's quick-add, verbatim** (FR-25.13): ＋ FAB
    expansion — **without focus (FR-25.13c)**, because the empty composer leads with the
    device-local recents chip row, which the raised keyboard would cover — master-item autocomplete, a visible
    scope-labelled confirm, Enter, the field stays open (and never
    blur-collapses, FR-25.13a), a duplicate is reported rather than added twice and is **not
    offered** in chips or autocomplete to begin with, and a new name creates the master item (FR-1.1) through
    FR-24.11's offer and sheet, exactly as at M4's quick-add, never silently from the bare name. The composer's
    *„Mehr aus dem Inventar…"* browse-sheet (FR-25.13d) is here too, verbatim — described once at M4's quick-add.
  * **Editing a position is the M5 bottom sheet:** glance chips, **Menge und Vorbereitung first**,
    everything else behind "Details ▾", with the FR-25.15 indicator in the header (shared `SaveIndicator`). There is no
    inline expanding row form.
  * **Progressive disclosure on the parameters** (FR-25.7): sensible defaults (quantity 1, trip-global, mode *Packen*,
    dedup *max*, no conditions, no Late Packer) mean a typical position is one tap; assignment (FR-1.4), default mode,
    Late Packer, dedup (FR-2.3) and condition chips (season/transport/accommodation, FR-15.2) live behind "Mehr
    Optionen". A per-person position carries **one quantity for everyone** — no Adult/Child split (FR-25.9); concrete
    per-person numbers are set on the trip (FR-25.8).
  * **A group hiding in the loose positions is offered, never applied** (FR-27.15, *built*): when a
    Ferien-Vorlage's own positions contain a Gruppe's **complete** resolved item set, a non-blocking suggestion row sits
    between the *Gruppen* section and the own positions — „*2 Positionen entsprechen der Gruppe «Erste Hilfe»*", with
    the FR-27.12 peek chevron, *Ignorieren* and *Zusammenfassen*. Where those positions define something the group
    defines differently, the row says so **before** the tap, carrying its own tint rather than relying on the flavour's
    straw, which is legible on Nacht and thin on Tag. *Zusammenfassen* swaps the positions for the include on the
    picker's own write path and the anchored snackbar's *Rückgängig* restores exactly what went; *Ignorieren* is
    device-local (`localStorage`, the M9 property-sheet class) and keyed to the group's item set, so it lapses once that
    set changes.
  * **Preparation tasks on a position** (FR-27.7): a free-text list under progressive disclosure with a count chip on
    the collapsed row. Each task instantiates as an FR-7.3 todo on the generated trip item, and an open prep todo keeps
    that item from counting as done (FR-25.2).
  * **Trip tasks** (FR-7.4 — *built*): a section *„Aufgaben für die Reise"* below the positions, in both scopes
    — a group can carry them as well as a Vorlage. A free-text list with the position task list's add and ✕ idiom under
    a one-line hint that says what the tasks do (*„Jede neue Reise aus dieser Vorlage bekommt sie als Aufgabe — sie
    halten keine Packliste auf."*), placeholder *„z. B. „Pflanzen giessen““* — a longer one is cut off at 390 px — and
    a count on the section head. Each task becomes an open trip todo on every trip generated from this template, not on
    any row, so it holds back no item from counting as done. Editing the list changes the next generated trip only;
    running trips are not offered the change (FR-7.4 names the trigger). (E2E-M8-26)
    * **Each task carries its phase (FR-7.7 — *built*).** A quiet chip on the line reads *Vor der Reise* or
      *Während der Reise*, and tapping it flips the task to the other one; the composer carries the same chip, which
      says which phase the next task is written in and remembers the choice while the editor is open. A Vorlage can
      therefore author *„Am Bahnhof die Zugverbindung abklären"*, and the trip it generates starts that task in the
      right section of M25. A task that names no phase reads as one for before the trip.
* **The template's own mark (Addendum FR-28.8, G-15 — *built*):** the same picker as M10's, on the slot left of
  the editable name, suggested from the template's name. Every mark on a group row in M3, M7, M8 and the FR-27.12 peek
  sheet reads this column. Optional like the item's, and **never a letter**. Whether an unmarked group keeps its
  slot depends on what it stands in: in a **column** (M7's list, M3 step 3) the slot holds its width, because
  without it the marked rows push their names right of the unmarked ones — the same misalignment FR-28.4's held slot
  prevents on M4. Beside a **single** name (M8's own editor head, the FR-27.12 peek header) there is no column to align,
  so an absent mark renders nothing at all.
* **Elements:** editable name (commits on blur/Enter; the ADR-011 header mirrors it); scope
  selector with the *"Eingebunden in: …"* line on an included group; the FR-27.4 blast-radius note (yellow, above the
  sections it warns about); *Gruppen* section (Ferien-Vorlage only) — rows with resolved count, the FR-27.12 summary
  line and its peek chevron, and ✕, a collapsed *"Gruppe einbinden…"* trigger opening the picker card (available groups
  as chips, *"Neue Gruppe anlegen…"* revealing an inline name field — the M7 create lesson: no row until the name
  exists, and no `prompt()`; above six searchable groups the card carries a **search field** (FR-27.13)
  — never auto-focused, this picker exists to be tapped — matching group *and resolved item* names case- and
  diacritics-insensitively: while searching the offers become rows with the FR-27.12 summary, an item hit states its
  reason („über Kamera"), an already-included match says *„Bereits eingebunden"* instead of being absent, and no match
  leaves *„Neue Gruppe anlegen…"* prefilled with the query); the FR-27.15 fold suggestion rows, one per recognised
  group, largest resolved set first; *Positionen* / *Eigene Positionen* rows (name, deviation chips or *Standard*,
  quantity chip, ✕); the quick-add; the FR-27.2 resolution footer, which is **tappable** (FR-27.14):
  *„Alle N Artikel ansehen ›“* opens the FR-27.12 peek sheet on the Vorlage itself — the resolved list, flat and
  alphabetical, each line naming where it came from („aus Makro Fotografie“, „eigene Position“) and marked where a count
  would mislead (*nur 1×* for a merge, *pro Person* instead of a guessed traveler count, the procurement mode, *mit
  Bedingung* for a position the trip may still exclude).
* **Actions:** Add/remove positions and group includes; every change commits immediately (G-5): no save button, the
  FR-25.15 indicator in the sheet header confirms local capture, and is absent until the sheet has written something.
  A refused scope switch answers with an anchored
  toast naming the reason, never a silent no-op.
* **A name that is taken (FR-1.6):** the editable name refuses a rename onto a name another template holds —
  an anchored toast names it and **the field goes back to the stored name**, because G-5's auto-save has no other
  acknowledgement and a refused spelling left in the field reads as saved. *„Neue Gruppe anlegen…"* answers by scope: a
  **Gruppe** of that name is what this picker exists to reference, so it is **included** and the toast says so
  (*„«Kamera» gibt es schon — eingebunden"*); a **Ferien-Vorlage** holding the name cannot stand in for a group, and the
  toast says which scope holds it — a bare "name taken" on a screen that shows only groups reads as a bug.
* **States:** Editing a template used by trips that are not past shows the FR-27.4 blast-radius note naming those trips
  (each is *asked* on its next open — nothing lands silently and past trips are never touched; everyone else sees
  changes at the next trip generation per FR-2.4). The note also appears on a group reached through a Vorlage such a
  trip was generated from.
* **Navigation:** From M7.
* **The save indicator and removal.** The FR-25.15 indicator is one shared `SaveIndicator` in **both** sheets —
  FR-25.15 explicitly rejects "G-2 already says it": offline, captured-here versus reached-the-server is the entire
  story. Its seam is the orchestrator's `capturePending`, which counts this device's own open writes — not the *sync*
  state, which is G-2's and answers `offline` before `syncing`, so offline an open write would render as settled (see
  FR-25.15). A position is removed by the row's ✕, not by swipe — a swipe panel breaks out of the card (the M7 variant
  pass), and M8's rows sit in the same card. The FR-27.4 question a template edit raises is asked at the trip (M2's
  and M4's States, ADR-016).

### M9 — Item Inventory

* **Purpose:** Central item database (FR-1.1) — the master-data screen for every item that can be packed.
* **Built on the tag set** (FR-24.1, ADR-014), together with M10.
* **Elements (FR-24.6):** a **tool bar that stays while the list scrolls** — the shared search
  row, **always present rather than behind the G-12 magnifier** (the one exception to that pattern, see G-12), and the
  **tag controls of FR-24.8** below it. The **group headings stick directly under that bar**, at a height the bar
  reports rather than a constant, because the bar grows a row when a tag outside the three is chosen. The page head's
  meta line carries the collection's size and, while anything narrows it, what is left of it. In the app-bar cluster
  sit the **eye icon → "Angezeigte Eigenschaften" sheet** (FR-24.4), carrying the count of shown properties as a
  badge — the same `HeaderAction` badge the M4 filter uses — and the **sort** (*Nach Tag gruppiert* / *Alle
  alphabetisch*), which is a glyph rather than a chip because a fourth chip wraps the sticky bar to three rows at
  390 px, and which order is active is legible from the list itself. The list is grouped by each item's **primary
  tag** so a row appears exactly
  once (FR-24.2); groups order by the tag's `sort_order`, items by name, and items carrying no tag collect in a trailing
  **"Ohne Tag"** bucket that is present only when something is in it. Per row **lean by default**: the leading slot +
  name; tags, weight, price and — where FR-1.9 applies — **who the item is usually for** appear only
  when enabled in the property sheet (device-local, `localStorage`, never synced). The assignee line sits under the
  name in the meta weight, a person glyph and the account's display name; a row that names nobody shows nothing, and
  the toggle itself is absent where there are fewer than two accounts (G-8), while a preference already stored is
  kept. **The leading slot follows G-15's inventory ladder — photo → item mark → the primary tag's mark (muted,
  FR-24.13) → primary-tag initial** (Addendum FR-28.4): the tag initial is the last resort, so a marked item is
  recognised here
  the same way it is on the packing list.
* **The tag controls (FR-24.8, ADR-061).** Three chips for the tags holding
  the most items, each with its count; **„Alle N Tags"** opening the filter sheet (every tag with its count, searchable,
  several at once under *irgendeiner* / *alle*, plus the **„Ohne Tag"** bucket); and a removable chip for any chosen
  tag that is not one of the three. There is no swipe axis, and ~~E2E-M9-08~~ went with it; E2E-M9-13 holds the
  geometry: the heading stacked below the tool bar rather than sliding under it.
* **The filter reaches wider than the grouping:** an item matches a chosen tag when that tag is anywhere in its set,
  while the grouping stays on the primary one. Choosing *Sommer* therefore surfaces the swimsuit filed under
  *Kleidung* — the reach a single category could not give (FR-24.2).
* **The selection mode (FR-24.9):** the app bar's third glyph arms it. The rows stop navigating, carry a checkbox and
  lose their chevron; the app bar says how many are picked and offers *„Alle N"* over the **filtered** list (G-20); a
  bar above the tab bar carries *Tag geben*, *Tag nehmen* and *Stilllegen*. Giving and taking open the same sheet — the
  whole vocabulary for giving, only the tags the selection carries for taking — and giving offers *„Als primären Tag
  setzen"*, which is what moves the rows into that group rather than merely labelling them. The two tag actions raise a
  snackbar with one **Rückgängig** for the batch; *Stilllegen* raises a confirm that names both halves of FR-24.3's two
  acts and has **no** undo, because the removed half cannot come back. The mode ends with the batch. **The bottom bar's
  fourth control is ⋯ *Mehr***, between *Tag nehmen* and *Stilllegen*. It opens an action sheet carrying *„Üblicherweise
  zuweisen an …"* (FR-1.9; absent below two accounts, G-8), *„Hängt ab von …"* and *„Begleitartikel …"* (FR-20.1). Four
  is what the bar holds at 390 px before the labels clip, so the rarer acts live behind one door. The bar's count reads
  **„Nichts ausgewählt"** at zero and „N ausgewählt" from one — zero is its own sentence rather than a plural form,
  since the catalogue has two forms and `n === 1` takes the first. The assignee sheet lists the directory with
  **„Niemand"** first — the way an assignment is taken away again — and each row says how many of the selection already
  name it; the two link sheets are one component, differing in the sentence above the list and the direction the edge is
  written in, and carry the required/suggested switch (FR-20.4) plus a capped, name-sorted offer of the inventory that
  names what the cap held back. All three raise the same snackbar with one **Rückgängig**, and a link's result sentence
  names what it skipped. A batch that writes **nothing** — every item already named that person, or every edge already
  there or circular — is a plain toast instead, with no *Rückgängig* to offer, and the selection stays armed so the
  choice can be made again. **M9 selects the way M6 and M25 do** (ADR-075, amended): a **hold** on a row (500 ms, or a
  right-click) starts the mode with that row picked, besides the app bar's glyph; a tap opens the item outside the mode
  and picks the row inside it — the whole row is the surface, since M9 has no grip to share it with. The row navigates
  in code rather than through a router link, so the release that ends a hold never opens M10. The bars, the box and the
  headings are the shared components (`BulkBar` with *Stilllegen* as its `danger` button, `SelectBox`, `ListGroup`); the
  count, ✕ and *„Alle N"* are the app bar's (G-20), and the tools stay live beneath it. **M9 does not drag**, by
  decision: its groups are the *primary* tag, so a drop would have to decide silently what happens to the tag the row
  leaves, and neither the alphabetical order nor a search has a group to drop on — *Tag geben* with its refiling switch
  stays the way to move rows. *„Alle N"* compares the rows on screen with the chosen ones rather than counting, so a
  chosen row the filter now hides does not make it clear instead of take. (E2E-M9-31)
* **The hidden items are named (FR-24.3):** below the last row, M9 says how many items are **retired**
  and the sentence is the way to M23. A retired item stays out of the list by design (ADR-032); without the sentence
  the head's „N Artikel" would read as the whole collection and M23 would be reachable only by somebody who already
  knew it was there. It is absent while nothing is hidden, while the master
  partition has not arrived (ADR-033 — „nothing is hidden" is a claim), and in selection mode. **The tap target is
  the sentence, not the row it sits in:** a full-width button there runs under the FAB.
* **No pull-to-refresh:** M9 and M7 carry none — one there would fetch nothing and still report the list up to date; the
  sync pulls on its own in Server Mode and there is nothing to fetch in Local Mode. `scripts/refresher-gate.mjs` holds
  the rule for the four that remain (M1, M2, M4, the conflict log): the handler of every `<IonRefresher>` must `await`
  something.
* **The tag manager (FR-24.10, ADR-063):** a **word in the app bar's ⋮**, not a fourth glyph — the bar
  spends its three on the eye, the sort and the selection, and this is the rarest of the four. It is absent while the
  inventory has no tag. The sheet lists every tag with its **assignment count**, searchable under FR-24.7's fold, and
  each row carries: a **drag grip** on the grouping axis, the **name as the rename control**, the count, **merge** and
  **delete**. A rename refused because another tag holds the name keeps the alert open **with the typed text** and
  says which tag has it. A delete is **refused while items carry the tag** and the refusal offers *„Zusammenführen …"*
  in the same alert; merging asks for the target, confirms with the number of items moving, and deletes the source
  once it is empty. **The grip** sits at the row's leading edge (ADR-075), M6's and M25's: it lifts at once, a
  line in the action colour marks the gap the tag would land in, and the drop moves it there in one act. While a
  search narrows the list the grip is dashed and inert — it moves a tag on the axis, and a move between two rows
  eleven apart on it is an ordering nobody can predict; while picking, the selection box takes its place.
* **Several tags merged in one act (FR-24.14).** A hold or right-click on a tag row starts a **selection** with that
  row picked, as does the checkbox icon in the sheet's head (lit while the mode is on, a second tap leaves it) — a
  checkbox at the leading edge, the whole row picking it, and the per-row acts, the grip and the mark control
  withdrawn, so a tap can mean one thing (ADR-075). The head is the bar (G-20): the line under the title reads *„N
  ausgewählt"*, and *„Alle N"* over the rows the search leaves joins the checkbox icon; *„Zusammenführen"* sits in
  `BulkBar` at the sheet's foot, dimmed under two. The merge asks **which of the picked
  tags stays**, in the same action sheet the single merge uses, each named with its assignment count and the
  **largest first**; the confirm names the survivor, how many items move and how many tags go, and the toast counts
  the **items** that ended up under the survivor. A picked tag **stays picked while a search narrows it away** — two
  names for one idea are rarely one query — and after the merge the manager stays open with the mode on, the merged
  tags simply gone from the axis the selection is read against.
* **A tag carries a mark (FR-24.13).** The tag chips, the group headings, the filter sheet and the give/take
  sheet show it beside the tag's name, rendered through `ItemMark` (G-15). The tag manager gives every row a **mark
  control** before the name — the mark, or a dashed empty slot — which opens the item mark's own picker (FR-28.2) over
  the manager, its suggestion band derived from the tag's name.
* **Giving creates the tag it did not find (FR-24.9).** In *Tag geben*'s sheet a query that names no
  tag — under the uniqueness fold, so a different capitalisation is not offered — puts FR-24.11's dashed row above the
  list, *„‚{Name}' anlegen"* / *„Neuer Tag für N Artikel"*; taking it creates the tag and gives it in one act, and the
  snackbar's *Rückgängig* removes the tag again with the assignments. *Tag nehmen* never offers it.
* **The way into M24 (FR-24.12).** *„Aufräumen"* is a word behind the ⋮, after *„Tags verwalten"*, offered
  whatever the count. While a rule finds something, a sentence at the list's foot above the retired count says *„N
  Hinweise zum Aufräumen"* and is the way in — like that count, **the sentence is the tap target**, absent before the
  partition has arrived (ADR-033) and in the selection mode.
* **The group heading is the jump (FR-24.8):** it opens the list of groups with their counts and **scrolls** to the
  one chosen, leaving the list whole — filtering takes rows away, jumping does not. It is offered only where it is a
  question: in the grouped order, outside a search, with more than one group. The scroll waits for the sheet to have
  dismissed, because an overlay locks the scroll host while it is up.
  **The heading is drawn by `ListGroup`** (ADR-075, amended), M6's and M25's heading, so the three
  lists look alike: the row divider with the tag's mark before the name. M9 switches on the three extras only it needs —
  the group's **count** at the trailing edge, the heading **sticking under the tool bar** (`--list-group-top`, the
  measured bar height) and the **jump** (a chevron in the accent colour; the whole heading is the control). The groups
  do not sit in one card each: the list is one run of rows under its headings, as on M6 and M25.
* **Searching (FR-24.7):** the field matches **name, tags, mark keywords and — where FR-1.9 applies — the default
  assignee's name**, folding both spellings of an umlaut; while a query is running the
  list leaves its tag groups: the results are grouped by **why** they matched, the assignee last, and a row that
  matched through something else says *über <tag>*. A **dead end names its cause** — with a
  tag chip active the empty state reads *„Kein Treffer in ‚Hygiene'"*, counts the hits outside the filter and offers
  *„In allen Artikeln suchen"*, which drops the filter and keeps the query. The rule itself is
  `client/src/domain/itemSearch.ts`; what M9 owns is the grouping and the sentence.
* **What the search did not find, it offers (FR-24.11):** while the query names **no active item
  exactly** (under the search's fold), a dashed row sits **above** the results — and above the no-match sentence when
  there are none: *„‚{Name}' anlegen"* with the line *„Neuer Artikel — Name und Tags genügen"*. It opens a sheet
  (`SheetHead` *„Neuer Artikel"*): the name, prefilled from the query; the tag control M10 uses, with **every tag
  narrowing the list already assigned** and the tags of the name hits offered first, marked in the done hue; a line
  saying weight, price, mark and photo follow in the item view; then *„Anlegen und öffnen"* and *„Anlegen"*. After
  *„Anlegen"* the screen **stays**: the query and the filter are untouched, the new row wears *„Neu"* until the query
  changes, the offer is gone, and a toast *„‚{Name}' angelegt."* with *„Öffnen"* sits above the FAB (anchored to it,
  like M4/M7/M8). A name that only a **retired** item carries is offered back instead — *„‚{Name}' ist stillgelegt"*
  / *„Wiederherstellen statt neu anlegen"*, in the caution hue — and a tap restores it in place, without a sheet.
  Enter in the field opens the sheet and never writes. Absent before the partition has arrived (ADR-033) and in the
  selection mode.
* **Actions:** Tap → M10; FAB → new item. **Deleting lives in M10 (FR-24.3, *built*).** **Merging duplicates is
  FR-24.15** — in FR-24.9's selection mode, behind the ⋯ sheet, offered from two picked rows up. It opens its own
  sheet (`MergeItemsSheet`), not FR-24.14's action sheet: a tag is a name, an item is a name plus tags, a weight, a
  photo and a past, so every candidate says **what it brings** — its tags, its weight, whether it has a photo, how
  often it was used — and the **most-used is offered first**, being the row the rest of the data already hangs on.
  The confirm names the survivor and how many rows go; the sentence afterwards names what was **taken over** (the
  weight, the mark, the photo, the assignee), how many Vorlagen collapsed a position and how many companion edges
  were dropped — the parts of a merge that are invisible on the list. **Trip history is not re-pointed** (ADR-069),
  so the losing row is usually *retired* rather than gone, and the confirm may not read as an undo: M23 brings the
  row back, not the references that moved. The row swipe stays *proposed*: a shortcut past M10 is worth little while
  M10's own card carries the usage count and the outcome sentence — a swipe reveal has room for a label and not for a
  reason. It returns, if it returns, as a second
  entry point to the same rule and the same wording.
* **A retired item is absent, not dimmed (FR-24.3).** A row the lifecycle rule hid leaves this list, the tag axis counts
  and the search — no strike-through, no greyed section. **It goes to M23**, its own
  screen off Settings, not a filter chip on the tag axis (a lifecycle state is not a tag, and the same chip would then
  be owed on M7) and not a folded section at the foot of this list (FR-24.4 made M9 lean on purpose, and the same
  section would be owed twice). Retired rows leave M9 and do not come back as a
  mode of it.
* **Navigation:** Tab 4.

### M10 — Item Editor

* **Purpose:** Edit one master item.
* **Built with M9.** Two modes on one screen, chosen by the route: `/items/new` creates, `/items/:id`
  edits.
* **An optional field names its state, never a number (FR-24.5):** weight and price render a placeholder
  that says the value is *not recorded*, from the catalogue. „0" and „0.00" would be a value — an item that weighs
  nothing and is worth nothing — and both columns feed FR-8's totals and FR-14's suggestions, so the reading a person
  takes from the field must be the one the analytics would use.
* **Default assignee (FR-1.9):** *„Üblicherweise zugewiesen an"*, an optional select of accounts under the
  tags, in the create form and on a saved item, with a one-line hint. It is not folded behind „Mehr", because the point
  is to decide it once here. Shown only where the directory holds more than one account (G-8) — absent in Local and
  Single-User Mode. Editing commits immediately like every other field (G-5).
* **Elements:** Name, **multi-tag selector** (`TagChooser` — the same control M9's FR-24.11 sheet uses) — a search field
  filters the tag chips, **assigned tags stay pinned above the matches** so the filter can never hide what the item
  already carries; ＋/Enter creates an unmatched name as a new tag and assigns it (FR-24.1, filter-or-create; there is no
  single category picker). **With an empty query the offers are a shelf, not the vocabulary (UX-14):** the first eight
  unassigned tags, then a dashed *„N weitere per Suche"* tail that hands focus to the search — a grown instance carries
  dozens of tags, and rendering them all would make every item form scroll. A query lifts the cap, so the search still
  reaches everything. A summary line names the set and which of them is primary — i.e. where M9 will file it. Then
  weight (g) and price — displayed through `formatValue` where it is read (M9, M12), which carries the instance's
  currency where one is named (FR-21.9) and stays unit-less where none is. The currency is `JITPACK_CURRENCY`, an
  instance-wide label rather than a per-screen field; there are no units (FR-1.8). **Editing commits immediately (G-5)**
  with the FR-25.15 indicator; there is no save button. Its row keeps its height while the indicator is still silent,
  because here it stands alone on a line rather than beside a title.
* **The rear-view (FR-27.8 + FR-27.9):** below the dependency section and **above the delete card**,
  because the card's *„An N Stellen verwendet"* is the number this list makes navigable and the reader wants the names
  before the count. *„Enthalten in"* lists every group and Ferien-Vorlage whose own positions name the item, each row
  stating that template's position count, wearing its scope chip, and leading straight into its M8 editor. *„Kommentare
  aus Reisen"* lists every comment written on a packing row generated from this item, across the trips the device holds,
  newest first, each with its trip and — where an account can be named — its author; read-only, because the thread lives
  on the trip row. **Both sections are absent rather than empty** when there is nothing to show, which is FR-24.5's
  stance and what makes their absence in creation mode meaningful.
* **An assigned chip has two targets (FR-24.9):** its **name** makes that tag the item's primary one —
  where the inventory files it — and the **✕** takes the tag off. With the destructive action alone, the filing would
  be decided by the accident of which tag was assigned first. The primary chip wears
  its marker and its name stops being a control, an act it has already performed being no offer.
* **The mark sits beside the name (Addendum 3.28, G-15 — *built*):** a tappable slot left of the name field
  opens the **mark picker** — a suggestion band scored from the name as it is typed (FR-28.3), a keyword search field,
  the facet row, and the grid (FR-28.2). The first suggestion is offered, never pre-filled; "Marke entfernen" is its own
  action, not the empty cell. In **creation mode** the picker is present but never blocks: an item is saved without a
  mark as the normal case, and the suggestion band simply follows whatever the name field currently says. When the name
  matches nothing in the index, the band says so in one line rather than rendering an empty row — an empty offer is what
  makes people pick 📦 for everything.
* **Creation mode (FR-24.5):** minimal form — intro line, name (focused), tags, Gewicht/Preis behind "Mehr ▾"; the
  existing-item sections (photo, Hängt ab von, Begleitartikel) are **absent, not emptied**. "Artikel anlegen ✓" commits
  and a missing name is answered with a hint rather than a disabled button. Because the item's name is its identity
  (FR-24.1, `UNIQUE (name)`, ADR-014), a **duplicate name is reported here** rather than left to the sync push to
  reject. On success the route *replaces* rather than pushes, so "back" lands on the inventory and not on a creation
  form for an item that now exists. **Dependencies (Addendum 3.20):** a "Depends on" section listing this item's
  declared dependencies with a required/suggested mode toggle per row, an add-picker with save-time cycle rejection, and
  a *Begleitartikel* list of items depending on this one (FR-20.1/20.4). **The two lists are symmetric:**
  *Begleitartikel* carries the same add-picker, mode toggle and removal as *„Hängt ab von"* and sits directly beneath
  it, above the delete card, because an editable section under the destructive one is read as part of it. **Each name in
  either list is a link to that item's M10:** the name alone, in the action role, not the whole row, because the row
  also holds the mode select and the remove button. **The companion picker creates what it did not find** (FR-24.11): a
  query no active item carries as its exact name shows M9's dashed offer above the hits — *„‚{Name}' anlegen"*, hint
  *„Neuer Artikel — hängt danach von {Name} ab"* — and opens M9's creation sheet (name + tags, this item's tags offered
  first). *„Anlegen"* writes the item and the companion row together and leaves the user here, picker closed; a retired
  name is offered back (*„Wiederherstellen und als Begleitartikel eintragen"*) and declared without a sheet. *„Hängt ab
  von"*'s picker makes the same offer the other way round (hint *„Neuer Artikel — {Name} hängt danach von ihm ab"*,
  restore *„Wiederherstellen und als Hauptartikel eintragen"*): the new item becomes this one's main item. **Wording
  (NFR-4.12):** the modes are *nötig* / *empfohlen*, and the reverse list is *Begleitartikel* — the word M3 uses for the
  same relation. *„Wird gebraucht von"* would name it backwards: the list holds the items that need this one, not the
  ones it is needed by.
* **States:** archived trip snapshots are unaffected by edits (FR-2.4, stated in UI copy).
* **The delete card (FR-24.3, *built*)** — the last section of the existing-item block, absent in creation mode
  like the others (FR-24.5). Three lines and a destructive button: the **usage count** („An N Stellen verwendet"), the
  **outcome sentence**, and *„Artikel löschen"*, whose confirm repeats the same sentence — the card can be scrolled
  past, the confirm cannot. The sentence has three forms, because the device does not always know: an item something
  references says it will be **hidden and kept**; an unreferenced item on a device that holds every trip (Local Mode)
  says it will be **removed for good**; the same item in Server Mode says removal is what will happen *unless* a trip
  this device has not opened still uses it, in which case it is only hidden. The third form is not hedging for its own
  sake — the client holds the trip partitions it has opened and never every trip's, so a flat promise would be wrong
  exactly on the FR-9.2 case (ADR-032). Deletion is never blocked because the item is referenced.
* **Navigation:** From M9 or inline from M8. The delete card's outcome sentence has a counterpart on **M23**, which
  lists what this card hid.

### M11 — Container Management

* **Purpose:** Define luggage containers and balance weight (3.10).
* **As built:** containers are created and edited here, the FR-10.3 pairing indicator is reachable, and assigning an
  item is one tappable row, never *one button per container per row* — a wall that grows with containers × items and
  buries the item name. The carrier section is
  **absent, not emptied**, when the trip has no travelers (the FR-24.5 stance); the imbalance line appears only beyond
  the threshold, on **both** cards of the pair; delete lives in the sheet and its confirm states that the items stay on
  the list, unassigned. The pairing write set (both sides at once, exclusive, released on delete) is specified in
  `client/src/domain/containers.ts`.
* **Elements:** Per-trip container list: name, carrier, weight bar (current/max) turning amber at 90 % and red beyond
  max (FR-10.3); the pairing imbalance line on paired containers; "Unassigned items" bucket at the bottom (FR-10.2),
  **one tappable row per item** rather than a grid of buttons. **The bucket renders only when a container exists or
  something is unassigned (UX-8):** with zero containers and zero unassigned items, its "everything is
  assigned" line would contradict the empty state right above it, so the G-7 empty state stands alone.
* **Editing is the M5 bottom sheet**, the same grammar as M8's position sheet: header with the container's load, then
  name, carrier, weight limit and the pairing selector, with the FR-25.15 auto-save lamp — no Save button. **Pairing is
  exclusive and set on both sides at once**, and clearing or deleting one side releases the other; a half-set pair would
  render an imbalance against a container that does not consider itself paired.
* **Creating is the FR-24.5 minimal form:** the ＋ FAB creates the container with a placeholder name and opens its sheet,
  so a name is enough to start and carrier/limit are filled in afterwards.
* **Assigning:** tapping an unassigned row opens the same sheet as a **container picker**, each option showing its
  current load — so "which bag?" is answered where the load is visible. Assignment stays optional and never blocks
  packing (FR-25.5).
* **Several at once (FR-10.2, ADR-075 amended):** the bucket selects the way M6, M25 and M9 do. A **hold**
  on an unassigned row (500 ms, or a right-click) starts the mode with that row picked, as does the app bar's checkbox
  glyph — offered only while the bucket holds a row. While selecting, the app bar carries ✕, the count and *„Alle N"*
  over the bucket (G-20), each row carries a `SelectBox` in place of its chevron, a tap picks, and the
  ＋ FAB gives way to a `BulkBar` with one act, **In Gepäckstück …**. It opens the same picker once, its subject line
  reading *„N Positionen"*, and the chosen container takes every selected row; the mode ends with it. No grip, no drag
  and no headings — the bucket is one flat run. Assigned positions are not selectable here: they are not rows on M11.
  No undo, like the single assignment. (E2E-M11-08)
* **Actions:** Create/edit/delete containers; assign items from the unassigned bucket via the picker. **Deleting a
  container unassigns its items rather than removing them** — items outlive their bag, and deleting rows with it would
  silently shorten the packing list.
* **Navigation:** From *Gepäck* in the bar's ⋮ on packing's views (G-12, ADR-051 amendments 1 and 2) — the switcher
  is for the views a trip is worked in. Standing here, *Gepäck* **is** a pill, so the row still says where you are.
  There is no "Edit containers" entry inside the grouping switcher. ~~and from M12~~ — **not built:** M12's only
  navigation is to M4, and opening a picked *Gepäck* bar sets the container facet there rather than opening this
  screen — the more useful landing, since it puts the reader on the rows the bar was about.

### M12 — Analytics

* **Purpose:** Weight/value insight (3.8) and long-term trends (FR-14.3).
* **Elements (per the prototype):** Dimension switcher *Person / Kategorie / Gepäck* (FR-8.2); one packed-in-planned
  weight bar per dimension value, heaviest first; two KPI boxes below — weight packed/planned and **total value for the
  whole trip** (a per-slice value reads as noise); series trend section (archived trips of the series), **headed with
  the series' own name**, never the trip's: **packed** weight per year as columns, and one merged *Häufig markiert* list
  of the series' Missing/Unused items. The KPI numbers are the first use of G-13's **headline figure** role
  (`.jp-figure`).
* **Slices** are keyed by exactly what M4's facets filter on (traveler id,
  `category_name`, container id, `''` for the absence bucket), so a tapped bar becomes a facet without translation;
  absence buckets carry the facet wording (*Gemeinsam* / *Ohne Kategorie* / *Ohne Gepäck*, FR-25.11f/g). A bar lands
  on M4 *filtered*, never only regrouped, so the number that was tapped is on screen.
* **Actions:** Tapping a bar **picks** it (marked, `aria-pressed`); a second tap takes the pick back, and any number of
  bars of the current dimension can be picked. While at least one is, *„In der Packliste zeigen (n)"* stands under the
  bar card; it **sets the FR-25.11 facet** to the picked values — OR'd, as the sheet's chips are, and clearing every
  other facet, since the reader picked these numbers — and opens M4, where the chip row names the filter (FR-25.11a) and
  the session keeps it (FR-25.18); the grouping follows the dimension so the slices sit together. Switching the
  dimension drops the picks: a person and a bag are two facets, AND'd in M4, so a pick carried across would name nothing
  in the new view. ADR-012 leaves M4 mounted behind M12, so both writes move the live view state as well as the stored
  one. A bar is a quick filter rather than a link, so *„mine and the shared ones"* is put together here rather than by
  hand in the filter sheet; the cost is one more tap for the single-bar case.
* **Per-person items** (FR-25.1) need no expansion step in the client's data model: each traveler's instance is its own
  row with its own quantity and packed count, so by *Person* the rows are one contribution each and by *Kategorie* or
  *Gepäck* they sum back into a single bucket by construction. Rows with no traveler count as *Gemeinsam* (FR-25.11f's
  term).
* **States:** Items without weight metadata never enter a bar — a zero-width bar would read as "weighs nothing" — and
  are counted honestly beside the chart ("＋ n Artikel ohne Gewichtsangabe"); their value still counts. No weighted rows
  at all → an empty-state line in the bar card, **and no KPI tiles under it** (UX-11: „0 g / 0 g" and a unit-less „0.00"
  would restate the empty state as numbers). Each tile stands only when it has something to total: the weight tile with
  weighted rows, the value tile with a non-zero value — rendered through `formatValue` in the locale's number format,
  **which carries the instance's currency where one is named** (FR-21.9, `JITPACK_CURRENCY`) and stays unit-less where
  none is — as it does in Local Mode, which has no server to ask. No series, or a series with no archived trips → the
  trend section is absent, not empty.
* **Navigation:** From *Auswertung* in the bar's ⋮ on packing's views (G-12, FR-21.21, ADR-051 amendments 1 and 2 —
  a switcher pill while you are standing here); trend section also from M16.

### M13 — Repack Mode — **REMOVED**

Screen removed together with the Repack feature (PRD Addendum §3.11, removed by decision — not wanted). The
M-number is retired and must not be reused. No repack entry appears in the M4 toolbar.

### M14 — Post-Trip Review Assistant

* **Purpose:** Close the feedback loop into master templates (FR-9.2).
* **A list, aimed at groups (FR-27.11).** The assistant is **a list, not a card stack**, and its proposals target
  **groups**, not the composed vacation template.
* **Elements:** One row per proposal: a kind chip (*ungenutzt* / *fehlte*), the item name, why it is being proposed
  ("auf dieser Reise nicht gebraucht", "unterwegs nachgekauft — fehlte auf der Liste"), and the **target group named in
  a picker that offers groups only** (FR-27.11), beside which a chevron opens the FR-27.12 peek sheet on the chosen
  target — the row carries no summary line, because the proposal and its blast radius already own that space — for an
  *ungenutzt* row only groups that actually carry the item (zeroing a position that does not exist would apply as
  nothing, and a silent no-op is worse than a shorter picker). When the target group
  reaches trips that still follow it, the row states the blast radius ("Wird N Reisen vorgeschlagen …", FR-27.4). Per
  row: *Übernehmen · Überspringen · Nie mehr fragen*, all three worded (FR-9.4: an unlabelled ✕ carrying only an
  `aria-label` is no label at all on a phone, and the third is the one action here that is permanent, device-local and
  has no undo; the wording follows FR-27.15's *Ignorieren* rather than inventing a second grammar for
  the same dismissal).
* **Two blocks, and a handled proposal moves between them (FR-9.4).** *Offen · n* holds what is
  still open; *Erledigt · n* holds what was applied or skipped, as a record line naming the item, its target group and
  its outcome — visible and marked as FR-27.11 requires, and never under a heading that does not count it (a finished
  pass must not read „Offen · 0" above two cards). The footer sentence counting what was *written* stays, under
  *Erledigt*, and appears only when something was applied. **The finished state is reachable by finishing:** the empty
  block renders whenever nothing is open, saying „durchgesehen" where a pass was made and „nichts zu prüfen" where the
  trip produced no proposal at all — applying or skipping empties the list, so a finished review never needs every
  proposal dismissed permanently.
* **Actions:** Single-tap apply writes directly to the target group (shared instance-wide, FR-1.6 MVP simplification —
  no fork prompt) and logs an FR-27.4 applied change on every planning trip using it. **The harvested item becomes a
  trip-global position (E2E-FLOW-04):** one row for the trip, the way M21's fold writes a trip's row back, not one per
  traveler — the mutation's `per_person` default decides how many rows generation makes, so it would bring a shared item
  back once per head and, on a trip with no travelers, not at all. It is the position's *quantity* that the review pass
  moves; who it is for is not something a finished trip has an opinion about. **Decided: "Never ask again" scopes to the
  specific item–group pair**, not the item globally — the same item can still surface a proposal for a different group.
* **States:** No flags recorded → assistant skipped with a brief "nothing to review" toast; assistant is resumable if
  interrupted.
* **Navigation:** Auto-launch on archive from M4/M2 — and only when something was flagged; with no flags the archive
  stops on M4 with the *„nichts zu prüfen"* toast. Afterwards from the **closing card at the top of M4 on the archived
  trip**, which links to the full list **and teases the first two proposals**: a card that read no proposal would say
  the same thing whether eleven suggestions were waiting or none, which is the one question the tap answers. It calls
  the **same** rule M14 calls (invariant 4): a cheaper approximation on the card would be the review implemented twice,
  and the copy that drifts is always the summary. With nothing to propose it says so rather than listing nothing, which
  reads as *not loaded yet*. Sits beside the M21 entry there — M21 folds back structure, M14 folds back individual
  items.

### M15 — Import Wizard

* **Purpose:** Migrate legacy spreadsheet history (3.16).
* **Step 1 — File:** Upload **CSV** through the G-17 file trigger, or paste. ~~CSV/XLSX~~ — the picker accepts `.csv`
  only and the hint says so (XLSX is deferred by NFR-4.3 — a parser dependency for a format every tool exports as
  CSV). **The parser preview (ADR-041):** the first six parsed rows as a
  table, live while the text is being pasted, so the answer to *did it read my file the way I meant it?* arrives before
  *Analyze* rather than after. It renders `parseSpreadsheet` output and nothing derived, which is the point — it stays
  truthful when the analysis is wrong. Rows are padded to the widest so a ragged row keeps its shape, the header row
  carries the emphasis, and a note names the rows not shown. **Wide sheets scroll inside the box and the page never
  scrolls sideways** (G-9; measured at 390 px: a 358 px box over 617 px of content, body unchanged). E2E-M15-01.
* **Step 2 — Mapping:** Mark the item-name column, the **category column** (a picker whose first choice is *None*) *or*
  the category rows, and per trip column: include-toggle, trip name, date (or year — **a bare year imports a year-only
  trip** (UX-5), never a fabricated Dec-31 end date posing as a real date on every list), target series (FR-16.1); noise
  handling per NFR-4.7 — **said inline**: a note names how many entries the sheet marked with a trailing `?`, names up
  to three of them, and states that each becomes an open task on its row, so the user does not first meet the tasks
  inside the trip (E2E-M15-02). The task's body is on the catalogue (NFR-4.12), resolved at write time so a language
  switch reaches it. The trip name and date arrive **prefilled from the sheet's header block**, which may be more than
  one row — a column whose header carries neither is the one case that arrives unticked. Both column pickers label a
  column by its own header text, falling back to its position. **No trip column has to be ticked at all:** a sheet with
  none is an inventory, and the step's note then names the one thing still missing — a column holding the item names —
  rather than a trip.
* **Step 3 — Dedup:** Near-duplicate suggestions against existing master data with merge/keep-separate choice (FR-16.3).
* **Step 4 — Confirm:** Summary (n items, n archived trips, merges, categories) and one row per trip. **Each trip row
  names its target series**, and says *„keine Serie"* where none was chosen — a destination is a destination, and this
  is the last screen before an irreversible write. The picker is on step 2 and the commit writes `series_id`; this is
  where the choice is repeated. **The summary also counts the open tasks the commit will
  create** (NFR-4.7), for the same reason. E2E-M15-02, E2E-M15-04b. ~~transactional commit with progress; failure rolls
  back completely~~ — **the commit is an approximation** (NFR-4.7): the plan is validated in full
  before a single mutation is enqueued, parents precede children in the queues and replay is idempotent, but **nothing
  rolls back** and **there is no progress indicator**. There is no server-side transaction across a push batch to build
  either on. The commit lands on **M9, the inventory, when no trip was created**, and otherwise on **M2's Archived
  segment** — FR-16.2 only ever produces archived trips, and M2 opens on Active, so a default landing would report a
  successful migration with "No active trips".
* **Navigation:** From M9's empty state and from **M2's own title row** — a button beside M18's, not an overflow menu —
  with the origin stamped so `‹` returns to whichever of the two opened it (G-9, ADR-011). ~~and M17~~: Settings offers
  no import entry. **A second visit inside one session does not work** (open defect, E2E-M15-03): the commit's
  `router.replace` onto a tab root leaves that tab's page unhidden in the root outlet, so a later push renders M15
  *underneath* it; M18's restore replaces the same way.

### M16 — Series & Destination Profile

* **Purpose:** Manage recurring-trip context (3.13).
* **Elements:** Series name; the three default attribute **selects** — season, transport, accommodation (FR-15.1), which
  are what M3 prefills from; destination notes; destination checklist editor (FR-13.3), each entry carrying one of the
  three FR-25.13 procurement modes; trip history list of the series with per-trip stats; shortcut to series trends
  (M12). **The destination profile is created lazily** — nothing writes one until a note or a checklist entry is.
* **Actions:** Edit profile; create new trip in series (→ M3 prefilled, carrying the series *and* its defaults); clone
  the series' most recent archived trip (FR-12.1, offered only when there is one); detach/attach trips. Renaming onto a
  name another series holds is refused (FR-13.1): a toast names the holder and the field goes back to the stored name.
* **Navigation:** From M2 series headers.

### M17 — Settings & Notifications

**App info/version.** The About block's version line names the running build: `git describe` (the release-please tag
plus a commit count once ahead of it) and the short commit hash, e.g. `v0.8.0-4-g3b14038f`. The same string is shown,
muted, beside the header wordmark (G-9) on a tab root in every mode — it names the build itself rather than anything
server-side, so it needs no per-mode variant. **The same string means verbatim**: it already carries the tag's own `v`
from both sources (`git describe --tags`, and the release workflow's `APP_VERSION=${{ github.ref_name }}`), so no
surface prepends another — a prepended `v` would read `vv0.10.0-…` (E2E-G9-21). A Docker-built image gets it from the
build args the release workflow passes in, since that build stage has no `.git` to read.

**The release line (FR-23.8, ADR-062).** One line under the version, in the About block, saying
whether a **newer release exists upstream**. Present only where the instance makes that check: it is off unless the
operator set `JITPACK_UPDATE_CHECK`, and Local Mode has no server to ask, so in both cases nothing is rendered — not
a disabled row, not a placeholder (G-8). Where it does render it takes one of three shapes. **A newer release:** a
small *Neu* chip in the brand hue (`--jp-brand`, G-11 — a release is not a fault, so it is never the warning
colour), the tag as upstream writes it (*„v0.10.0 verfügbar"* — the string carries its own `v`, see the version line
above), and a link to that release's notes, because *what changed* is the question a new version always raises.
**Up to date:** the done hue, with the moment the answer was obtained — *„Aktuell · geprüft 14.09.26, 04:12"* —
since a claim of currency with no age cannot be judged. **No answer:** recessive ink, never the danger hue, because
an instance that cannot reach GitHub is the ordinary case for an offline-first deployment; it names the last
successful check where there was one. **It is a line and never a bar**, which is what separates it from FR-19.7's
update banner two blocks up: that one is applied by the device that sees it, and this one only by whoever pulls the
image.

**Leaving Local Mode (FR-19.8, ADR-045).** A card *„Auf einen Server umziehen"* at the end of the
**Local Mode** data section, absent in every other mode (G-8). It carries three numbered steps and states, above them,
the one sentence that matters: the data stays on this device until step 3 has been done. **Step 1 — *„Sicherung
herunterladen"*:** the whole-device backup, the same export the G-2 sheet offers (FR-19.6), one function behind both.
The step shows when the last backup was taken, or that none was. **Step 2 — *„Server verbinden"*:** a URL field
pre-filled with the page's own origin, validated for syntax exactly like M19's (an invalid URL disables the button and
says so inline; no reachability check, for M19's reason), and the confirm. **The confirm is disabled while the backup is
older than the last change on this device**, and the disabled state says so in words (*„Zuerst sichern — seit der
letzten Sicherung wurde etwas geändert."*), because a button that is grey for a reason it does not name is the FR-25.15
shape. Taking the backup in step 1 enables it; any further write disables it again. Confirming writes the mode, the
server URL and the *migration pending* flag, then reloads — the app comes back up in Server Mode (login for an OIDC
instance, M1 for a Single-User one, as M19 describes) and M19 is **not** shown. **Step 3 — *„Sicherung
wiederherstellen"*:** is described on the card as what happens next, and performed by the **migration bar** (below)
after the reload; the card itself is gone by then, with the mode. The Local Mode data in the browser is left in place —
the card says so, in the sentence about a second copy that this device keeps and the app will not read again. ADR-045
records the shape chosen over a second device and over a native replay.

**The migration bar (FR-19.8), the FR-19.7 bar's sibling.** While the *migration pending* flag is
set, a bar under the app bar on every screen of the app shell says *„Umzug abschliessen: Sicherung wiederherstellen"*
with the action *„Wiederherstellen"*, which opens M18, and a *„Überspringen"*, which asks once (*„Ohne Wiederherstellung
fortfahren? Die Daten bleiben nur in der Sicherungsdatei."*) and then clears the flag. The flag also clears when a
restore commits on M18 in Server Mode. It is the same component shape as the FR-19.7 bar and stacks below it if both are
up. It is never shown in Local Mode — nothing there can set the flag — and not on the login screen, which has no app
shell.

**Connection (FR-19.9).** A block before *About*, in **Server Mode only** (G-8: Local Mode has no connection to name).
It states the instance this device is connected to — the stored URL, which is what actually wins over the page's origin
— and carries the two ways off it. ***Log out*** (*„Abmelden"*) ends the session and leaves the device on the login
screen; it is offered only where there is a session, so not in Single-User Mode, where the button could do nothing.
***Reset connection*** (*„Verbindung zurücksetzen"*) forgets the session, the mode and the server URL and reloads, so
**M19 asks again** — which is the point: M19 renders only while no mode is stored, so without it a device that had
answered once could never see it again, and a token the instance refuses, a mode chosen by mistake or a server URL that
stopped answering would have no repair inside the app at all. Both ask once; the reset's confirmation says that nothing
on the device is deleted, because that is the question a person about to press it has. It is worded as the destructive
one of the two all the same — it throws a decision away, and a Local Mode device's data is reachable afterwards only
through the file it exported.

**API tokens (FR-23.7, ADR-039).** A block between *Administration* and *Hidden master data*: a name
field, an expiry select (an hour / a day / a week / 30 days / 90 days / a year / never, **90 preselected**), and a
create button. It is a **form, not a list**, because there is nothing to list — tokens are stored nowhere. On success a
sheet reveals the token **as text** and then offers to copy it: a value shown exactly once has to be shown to the
person, and the clipboard can be refused. The sheet says the three things nothing else will — that it will not be shown
again, that a single token cannot be taken back, and that changing the instance's session secret revokes them all.
Closing it is what ends the token's only readable moment. The whole block is **absent** in Single-User Mode and Local
Mode (G-8): the first bypasses authentication and configures no signing secret, the second has no server, so in both a
token would prove nothing there is anything to prove.

* **Default travellers (FR-2.5a):** a named list, added and removed inline, shown in every mode and stored on the
  device. Its hint says both things that matter: this device only, and changeable per trip. In a session an *Add an
  existing user* select beside the free-text field offers the accounts not yet listed; a picked one is named like the
  account and marked *Linked account*. Absent without a session (G-8).

* **Purpose:** Personal preferences within the declarative-infrastructure constraint (Section 2: no administrative
  *infrastructure* changes via the UI; application-level user administration lives in M20, proposed per Addendum 3.23).
* **Elements:** Profile — the **display name** is read-only and OIDC-sourced, the **picture is editable** (FR-17.13: no
  identity provider supplies a picture, so gating it on Single-User Mode would leave a multi-user instance without one).
  The picture control is the same one M17 offers in Single-User Mode, described in the variant below. The note under the
  name names the display name specifically rather than claiming the whole profile is managed elsewhere; notification
  preferences per event type: delegation, mention, task assigned, **items taken over** (FR-6.2, FR-5.7), **trip notes**
  (FR-7.9), **tasks due** (FR-7.11 — the server's morning reminder) and **purchases due** (FR-30.10, *Fällige Einkäufe*,
  the same run for the shopping list) with channel status (push registered via VAPID/UnifiedPush, NFR-4.6). **A
  preference turned off here reaches the server's own suppression rule and silences that kind alone** (E2E-M17-01 covers
  the wire between the two ends); data section: JSON full export, per-trip CSV export (NFR-4.5) — **this is the section
  a *server* account sees; Local Mode's data section is a different one**, per-trip and per-template YAML written
  client-side because there is no server to ask, plus the NFR-4.11 storage details (E2E-M17-03 covers both); conflict
  log viewer (G-2 target); app info/version. Appearance section with a dark (default, Nacht) / light (Tag) toggle (G-11,
  Addendum 3.21, ADR-048) — shown in every mode, device-local. An Administration row → M20, rendered only for instance
  admins with an OIDC session (FR-23.1).
* **Single-User Mode variant (Addendum 3.17):** The Profile section makes the *display name* editable too (the picture
  already is, see above), so it carries two editable controls: a display-name text field (1–50 printable characters, no
  edge whitespace per FR-17.13; the rule note appears only after the field was touched) and an avatar picture control
  (Addendum FR-17.13) — the user picks a source photo, positions a circular crop overlay on it via pan/zoom, and
  confirms; the app renders the selected region to a 256×256 px JPEG on-device and uploads only that, with no separate
  resize/format step exposed to the user. Both controls save immediately (G-5) and are reflected wherever an avatar/name
  appears — the M17 profile row itself, the "Packed by" tag, the presence facepile per G-10 (**not** the dashboard
  greeting, a time-of-day sentence that carries neither) — always rendered as a circle via a display-time mask, never
  stored as one. The *notification preferences* section **carries only what can happen to one person alone (FR-7.11):**
  the *Fällige Aufgaben* and *Fällige Einkäufe* rows (FR-30.10) — a reminder is nobody's act, so FR-17.3's silence does
  not cover it — and the *Push auf diesem Gerät* toggle they need to reach a closed app; every row that needs a second
  party stays hidden (Addendum FR-17.3). All other elements (data export, conflict log, app info) remain, unchanged from
  normal mode.
* **Explicitly absent:** instance configuration, OIDC settings, admin-role assignment — all declarative (Section 2).
  User administration (deactivate, profile moderation) is application data, not infrastructure, and lives in M20
  (Addendum 3.23).
* **Language (NFR-4.12):** the Language row is device-local like the theme, and **the whole screen follows it** — this
  is the worst place for a half-translated page: the user changes the language here and would watch half the page ignore
  them. Labels are catalogue keys and `t()` runs during render; a label held in a module-level constant, evaluated once
  at import, is out of reach of any language switch.
* **Navigation:** Avatar in top bar.

### M18 — Portable Import Preview

* **Purpose:** A lightweight, single-screen confirmation for importing a portable YAML template or trip file (Addendum
  FR-18.4) — deliberately not a multi-step wizard like M15, since the file is our own well-structured format and needs
  no column mapping.
* **Elements:** File summary header (kind: Template/Trip, name, item count, `schema_version`); item list preview with
  per-item state: *new* (no local match), *near-duplicate* (name closely matches an existing item, FR-16.3-style), or
  *matched* (exact name match) — each near-duplicate row offers *merge* or *keep separate*. **What M15 Step 3 and this
  list actually share is the rule, not the component:** both resolve names
  through `domain/spreadsheet.ts`'s `findDuplicates` — M18 through `matchPortableItems`, which wraps it — and both
  render their own list and hold their own choice map. The two catalogue keys (*Merge* / *Keep separate*) are shared,
  which is as far as the reuse goes. Kept as two lists deliberately: M15's row is a spreadsheet cell being mapped and
  M18's is a document position with a state chip beside it.
* **Actions:** *Import* commits — a template import creates a new template, shared instance-wide like every other
  (FR-1.6 MVP); a trip import creates a new trip in **the status the file carries, and *planning* when it carries none**
  (FR-18.4, ADR-024); *Cancel* discards with no residue. **Where the document is already here, *Import* opens what is
  already here and adds nothing** (ADR-030), confirming it with a toast: the screen still commits
  rather than disabling its own button, because "this is already yours, here it is" is a better answer than a dead
  control with no explanation.
* **States:** A `schema_version` newer than the app understands shows a plain warning but still attempts best-effort
  import, ignoring unrecognized fields (FR-18.5); a malformed file is rejected **at this screen's own picker step**,
  with an inline error naming the reason, and no preview is opened (the picker's trigger is G-17's button). The picker
  is M18's first state, so the refusal happens here — which is what makes it correctable, the pasted text still in the
  field. **A document this instance already holds is named as such in the preview** (ADR-030) — a note beside the schema
  warning, carrying the same weight, because it is the same kind of fact: something about this file the user should know
  before pressing the button rather than after. A trip is recognised by its year and its name, a Ferien-Vorlage and a
  group by their name.
* **Restore branch (ADR-015 — the screen the backup is read back through):** a file holding **more than one document**
  is a device backup rather than a single export, so it gets a list instead of the per-item merge preview: one row per
  document naming it and its kind and item count, an unreadable document reported **in its place** with its reason and a
  *skipped* chip, and one *Import all* commit that matches master items per document as each is imported. *Cancel*
  returns to the picker. It lands on the **trip list**, on `/tabs/trips` specifically (E2E-M18-05). **It lands on the
  segment its own result is on**, not the Active one the list opens on: a successful restore ending on the words „No
  active trips“ reads as a restore that did not happen. The segment travels as a route query (`?status=…`), which M2
  honours when it names one of its three segments and otherwise leaves the user's own choice alone. It is **derived from
  the first restored trip's status** (ADR-024, E2E-M18-09) — a device of archived history restored onto a hard-coded
  *planned* would land on an empty list. A file of templates only, having no trip to point at, lands on *planned*.
  **Every row that is already here carries a *Schon vorhanden* chip (ADR-030)**, decided by the import rules' own
  function rather than by a second reading of them — so the list answers "what would this restore actually add?" before
  *Import all* is pressed, and the commit's toast counts what it left alone. **A trip row also names what it follows
  (FR-27.4):** where the document carries the trip's group registry, the row reads „Reise · N Artikel · folgt M Gruppen“
  — the only place the restored refresh state is visible before anything is imported, and absent on a file written
  before those sections existed. **In Server and Single-User Mode the restore pushes what it wrote — all of it
  (E2E-FLOW-07):** a trip's rows are its own partition (ADR-033), so the restore drains one per trip the file brought as
  well as the master partition — otherwise a migration off Local Mode (FR-19.5) would send the trips' names and years
  and leave every packing list queued on the importing device, whose own screen shows the restored data either way.
  **The screen is localized** (EN/DE), M15 with it; the parser's own error strings stay English, because they
  interpolate the YAML library's message and would need an error model rather than a catalogue key.
* **Navigation:** From M7 (template import) and M2 (trip import).

### M19 — First-Launch Mode Selection

* **Purpose:** One-time choice between Local Mode and Server Mode on first app launch (Addendum FR-19.1). Shown exactly
  once; the decision is persisted on-device and never re-asked.
* **Elements:** Two large option cards: *"Just on this device"* (Local Mode — one sentence explaining data stays on the
  device, no account or server needed, single device only) and *"Connect to a server"* (Server Mode — server URL input,
  ~~with connectivity check on confirm~~ — **not built, see Actions**). The URL field arrives **pre-filled with
  the page's own origin**, which is the correct answer for every self-hosted instance: the SPA and the API share one
  origin because the API sets no CORS headers. An explicit build-time `VITE_API_URL` wins over it, and the Vite dev
  server keeps its split-origin backend. Below the cards, one line noting that Local Mode data can later be moved to a
  server via export (FR-19.5).
* **Actions:** Selecting Local Mode persists the choice, requests persistent storage (NFR-4.11 — on the boot that
  follows, since choosing re-inits the app by reloading) and lands on M1 with an empty state (G-7); all of that is
  E2E-M19-01. Selecting Server Mode stores the URL and lets the app discover the instance: an instance offering OIDC
  sends the device to login, a Single-User instance answers `/auth/config` with 501 and the device lands on M1
  (E2E-M19-02, both halves). ~~validates the URL against the server's health endpoint~~ — **not buildable as
  specified.** The field validates its *syntax* only, and a check from this screen against a
  *different* origin cannot distinguish an unreachable host from a reachable one whose API sets no CORS headers — which
  ours does not, deliberately. So the promised inline error would report a healthy instance as unreachable, which is
  worse than not checking: the device would be told its server is down by a probe that never reached it. The app learns
  the truth one step later, at the login attempt, where the server answers for itself; the pre-filled origin above
  makes the check unnecessary in practice.
* **States:** Local Mode has no failure state (a denied persistent-storage request is not blocking — it surfaces later
  as the NFR-4.11 warning in the G-2 detail). A syntactically invalid URL disables *Connect* and says so inline. **The
  login screen this leads to has three states, not two:** `GET /auth/config` says *a login is needed* by answering with
  the IdP's endpoints and *no login is needed* by answering **501** `not_configured` — and that status is the only thing
  that means it. An unreachable server, a reverse proxy's 502 and a 500 are no answer at all, and filing them under *no
  login needed* would show *„Server nicht erreichbar“* and *„Dieser Server verlangt keine Anmeldung“* in the same
  breath, the reassuring half being the false one. Only the 501 hides the sign-in; anything else names the failure and
  leaves the button, because attempting the login is the only thing left that can find out. The sign-in path draws the
  same line — a 502 there reports a server that did not answer, not a server without OIDC. ~~An unreachable server URL
  shows an inline error and keeps the user on this screen~~ — **not built, with the health check above (E2E-M19-03):**
  with no connectivity check there is nothing to report, so an unreachable instance is accepted and shows as offline on
  the G-2 glyph afterwards.
* **Navigation:** Entry point of the app on first launch only. Not reachable from anywhere afterwards; switching modes
  later is the explicit migration path of FR-19.5, not a revisit of this screen — **that path starts on M17
  (FR-19.8), and this screen stays shown exactly once.**

### M20 — User Administration

**Built (Addendum 3.23).**

* **Purpose:** The small instance-level user management of Addendum 3.23 — see who is provisioned, revoke access,
  moderate profiles. Application-data administration only; who *holds* the admin role stays declarative
  (`JITPACK_ADMIN_EMAILS`, FR-23.1) and is deliberately not editable here.
* **Elements:** List of all provisioned accounts: avatar, display name, e-mail, provisioning date, status chip,
  lightweight usage indicators (trips as member, owned templates) per FR-23.2. Instance admins are marked with a chip;
  the own account's row carries a "you" marker. **The status chip is one chip and an absence** (FR-23.2's *„active /
  deactivated"*): a deactivated row carries the chip and the dimming
  below, an active one carries neither — there is no *„active"* chip, and adding one would put a label on every row to
  say that nothing is wrong. **The avatar is the FR-23.4a circle with a cache-busting query:** the row is
  keyed by account id, so without one *Remove avatar* leaves the same `<img>` on the same `src` and the moderator
  watches nothing happen.
* **Actions:** Per-account ActionSheet: *Deactivate* (confirmation dialog spelling out the FR-23.3 consequences: access
  revoked, data and attributions untouched, JIT login does not restore access) / *Reactivate*; *Remove avatar* and
  *Reset display name* (FR-23.4). The own row and rows of instance admins offer no *Deactivate* (FR-23.3); there is no
  delete action anywhere (FR-23.5) and no role toggle (FR-23.1).
* **States:** Deactivated rows render dimmed with the status chip; empty state cannot occur (the viewing admin is always
  listed).
* **Visibility:** Rendered and routable only for instance admins with an OIDC session; hidden entirely in Single-User
  and Local Mode (FR-17.3/FR-19.3, G-8). Non-admin API access is rejected with 403 — the screen is access-controlled,
  not merely unlinked.
* **Navigation:** Administration row in M17 (only visible under the same conditions).

### M22 — Trip Properties (FR-2.7) — *built*

* **Route:** `/trips/:tripId/edit`, back-target `/trips/:tripId` (the ADR-011 contract). Reached from **M2's** row menu
  and hero, *„Reise-Eigenschaften"* (G-12): the trip's properties are M2's, not M4's ⋮.
* **Why a screen and not a sheet** (by decision): the traveller roster is a list with its own add and remove
  affordances, and the M5 grammar would nest a list inside an overlay over a list. The other editors that own a
  roster-like section — M8 with its groups — are screens for the same reason.
* **Elements:** the trip **name** (commits on blur/Enter, the M8 pattern — the header keeps its own static title here,
  unlike M8: this screen is *about* a trip rather than being one, and a bar reading „Samedan 2026" would not say which
  screen it is); **the two dates** (G-17 `DateField`s; read-only under G-3's lock), both optional per FR-2.1b and
  bounding each other (FR-2.1d); the **year** — a picker offering the same span M3 and the clone form offer, from the
  one rule all three read (`domain/tripYears.ts`), plus the trip's own year where that lies outside the window, so an
  imported 2014 trip is not silently offered a move. FR-2.1b makes the year the one *required* temporal fact and the
  fact M2 sorts and groups by, so a trip created in the wrong year must not keep it for good; FR-2.7's own scope is
  *name, dates and travellers*, and the year is this document's addition to it, by decision (E2E-M22-12). And the
  **travellers** section — one row per person, rename in place, ＋ to add, ✕ to remove. The **series** is not edited
  here: it is edited on **M16**, whose *detach/attach trips* action is its one writer — as PRD FR-2.7's opening
  paragraph says.
  Each traveller row also carries an **account picker** (FR-2.5, ADR-058) — *„Kein Konto"* or one
  of the trip's members — in the row's end slot, between the name and the ✕. In the end slot rather than on a
  second line: the roster reads as a list of people, and a line per row would push the fourth traveller off a
  phone screen for a fact that is empty on most rows; the control states itself through its value, so it carries
  no visible label, only an aria one. One sentence under the list says what an account *does* (the person is told
  when an item is assigned to them) and what may be picked (members only), because that is a rule about the trip's
  notifications rather than a property of one person.
  **The add row carries the same picker**, between the name field and ＋, so a person can be added *as* the account they
  are in one act — on a shared trip the person being added is usually one of the people it is already shared with, and a
  two-step version would hide that behind a control found only afterwards. It offers the same names as the row pickers
  and appears under the same rule, so the two are never out of step; it returns to *„Kein Konto"* with the name field,
  because the next person is a different one far more often than not. What the write does with it is FR-2.5's ordering
  rule, not a screen decision: the traveller is inserted unlinked, FR-27.4's per-person rows follow, and the link is
  written last so the account is not told once per generated row.
* **What a traveller change does** is FR-27.4's rule, and the screen states it rather than performing it silently:
  adding applies **immediately** and reports the FR-27.10 way — what was added, what that person already had, what this
  trip's conditions excluded. Removing takes their **unpacked** rows. What happens to a row that was already **packed**
  is asked at the confirmation — *Alles entfernen* beside *Gepackte behalten* — and only when the traveller has one,
  with the number stated in the question rather than left to be guessed. A row that was skipped or hand-edited follows
  the *behalten* branch either way, because it is evidence of work somebody did and no question was asked about it. The
  report names what stayed, so a row left behind is never a surprise found later.
* **States:** **Removal is offered only while the trip has not started.** On an active or archived trip the ✕ is **not
  rendered at all**, and one sentence under the roster says why: a control that is visibly there and answers no tap
  reads as a broken app, and the sentence answers the question the ✕ raises once rather than per row. Adding and
  renaming stay available on an active trip; on an archived one the whole screen is read-only, consistent with FR-27.4's
  "past trips are never touched". **An archived trip says why it answers no tap:** a single note above both cards,
  because the read-only state is the screen's rather than one section's — rendered inside the travellers card it would
  read as a rule about people. It is its own sentence rather than the started trip's: the reason is that the trip is
  over, and borrowing that wording would claim it has not left yet. The *„a traveller who joins…"* hint goes with the
  controls it explains (E2E-M22-10).
* **Modes:** unchanged in all three for name, dates, year and roster. The screen edits trip-level records, not
  membership — sharing and roles remain FR-4.5's roster (`/trips/:tripId/members`), which is hidden outside Server
  Mode per G-8. Local Mode has the full screen: travellers are trip records, not accounts (FR-19.3). The **account
  picker is the one part that is not in all three**: it renders only where the trip has more than one member, which
  is never in Local Mode (no accounts at all) and never in Single-User Mode (one member row, the creator's). The
  same rule hides it on an unshared Server-Mode trip — the account it could name is the one `planRosterAssignment`
  never notifies, so the control would be present and inert, which is what G-8 exists to prevent.

### M23 — Hidden Items and Templates (FR-24.3) — *built*

* **Purpose:** The way back from a retire. FR-24.3 hides a master item or Vorlage that something still uses instead of
  removing it; without this screen no surface would list those rows — the data half of the FR's "free restore" would be
  unreachable, making a retire one-way in practice.
* **Where it lives, and why not in M9/M7.** Off **M17's own section**, beside the conflict-log pointer, because it is
  the same kind of surface: corrective, opened after something went wrong, never during browsing. Three alternatives
  were weighed and rejected. A **filter chip on M9's tag axis** puts hidden rows one tap from the normal flow, which is
  the opposite of what retiring them is for, and a lifecycle state is not a tag; the same chip would then be owed on
  M7's scope segment, which is also not a lifecycle axis. A **folded section at the foot of M9 and M7** is two surfaces
  for one rule, in the screen FR-24.4 deliberately made lean. A **`?retired=1` mode of M9** inherits a grouping, a tag
  axis, a property sheet and a FAB that all mean nothing for a list whose only actions are *restore* and *delete for
  good*.
* **A row that got here by a merge says so (FR-24.15):** beneath the retire date it names the surviving
  item — *„zusammengeführt mit ‚Stirnlampe'"* — because a bare *Wiederherstellen* is otherwise an offer to re-create
  the duplicate the user has just removed. The restore is ADR-034's act unchanged and additionally **clears the merge
  alias**: a row that is active again has a past of its own. What it does *not* bring back are the references the
  merge moved — the tags, positions and companions are the survivor's now.
* **Elements:** the FR's sentence in one line, then a two-value segment — *Artikel (N)* / *Vorlagen (N)* — and one card
  list per side, **newest retire first**, because the row someone wants back is almost always the one they just lost. A
  row carries the mark, the name, the date it was hidden, and its usage count. **Both segments are always present, and
  an empty one says so** — "nothing is hidden" is an answer, and a screen that renders only the non-empty half cannot
  give it.
* **Restore** is a single button, **with no confirm step**: it is non-destructive and undone by the same delete that hid
  the row, so a dialog would ask the user to agree to what they just asked for. A toast names what came back.
* **The name may be gone (the hard case).** Retiring *frees* the name — `UNIQUE (name)` on both tables is a partial
  index over the active rows (FR-24.3), because re-creating what you just deleted is the common case — so an active row
  can hold it by the time the restore is asked for, and two active rows of one name is what FR-16.3/FR-1.6 exist to
  prevent. The refusal is met **before the mutation is enqueued**, on the client, over the complete master partition
  every device holds: this is the one FR-24.3 question the client can answer *exactly* in all three modes, unlike the
  reference count ADR-032 had to make advisory, and in Local Mode it is the only guard there is. Letting the push refuse
  it instead would show an optimistic restore that reverses itself a moment later (ADR-031), for an answer the device
  already had. **The refusal carries its own way out**: an alert names who holds the name and offers a text field
  prefilled with the old one; *Wiederherstellen* writes the new name **in the same mutation** as the cleared marker (two
  writes would leave a moment where the index is violated, and the second can be the one the outbox drops). A
  replacement that is also taken re-states the refusal and **keeps the alert open with the typed name** — M7's rename
  idiom, for the same reason: dismissing it would throw the edit away.
* **Delete for good** is offered on a row **only where the delete would actually be physical** — i.e. where FR-24.3's
  second branch now applies because whatever kept the row alive is itself gone. Without it a retire would become
  permanent by omission: the row would be unreferenced and undeletable forever. Where the row is still referenced the
  button is absent and the usage count says why, rather than a control that silently re-retires. The bin stands
  **before** *Wiederherstellen*, so the restore button ends at the same edge on every row. The confirm
  carries M10's three-form outcome sentence unchanged, including the Server-Mode hedge.
* **Several at once (FR-24.3, ADR-075 amended):** M23 selects the way M6, M25, M9 and M11 do. A **hold** on
  a row (500 ms, or a right-click) starts the mode with that row picked, as does the app bar's checkbox glyph — offered
  while the segment shown has a row. While selecting, the app bar carries ✕, the count and *„Alle N"* over the segment
  shown (G-20), each row carries a `SelectBox` and **its own two buttons step aside**, a tap picks, and a
  `BulkBar` offers **Wiederherstellen** and **Löschen** (the `danger` button). Outside the mode a tap on the row does
  nothing. Switching the segment ends the selection — it belongs to the list it was made in.
  * *Wiederherstellen* restores every selected row whose name is free, in one go, and **leaves the colliding rows
    selected**; the toast says how many came back and how many names are taken (*„2 Einträge sind wieder sichtbar. Ein
    Name ist vergeben — …"*). A selection of **one** is the single-row restore, so a collision there meets the rename
    alert above. No alert per collision in a batch: a queue of prompts is worse than a list of what is left.
  * *Löschen* deletes for good only the selected rows that carry their own delete button; one confirmation names the
    count (*„2 Einträge endgültig löschen?"*) and, where some are still used, adds that those stay hidden — they stay
    selected. A selection with nothing deletable asks nothing and says so in a toast. Neither act has an undo, like the
    single ones. No grip, drag or headings. (E2E-M23-06)
* **Modes:** all three. The screen is master data, so it is not gated on `authed`; in Local Mode the client's name check
  is the only thing between the user and two indistinguishable rows.
* **Navigation:** M17 → M23; the row carries the count of hidden rows and is silent when there are none. Back returns
  where it was opened from (the fifth route class, ADR-011). **The screen renders no heading of its own** — the
  one header bar names it from the route's `titleKey`, which is why the title is short enough not to truncate in either
  language, and why E2E-G9-14 asserts the bar rather than the page.

### M24 — Aufräumen (Inventory Cleanup, FR-24.12) — *built*

* **Purpose:** the inventory's cleanup rules, each finding beside the one repair that answers it. A rule **finds and
  never refuses** (the PRD says why a refusal cannot exist), so this screen is where the findings go.
* **Elements:** one card per rule the device runs, in a fixed order — *Ohne Tag*, *Lange nicht gebraucht*, *Tag mit nur
  einem Artikel*. A card's head is a status dot (caution while it finds something, done when not), the rule's name, the
  sentence saying what it looks for, and its count. **A rule with nothing to report stays on screen collapsed to „Nichts
  zu tun"** — a rule that vanished when satisfied would read as switched off. The page head's meta line counts the
  findings; with none, a G-7 state *„Alles aufgeräumt"* heads the collapsed cards.
* **Ohne Tag:** per item the leading slot (G-15's inventory ladder), the name, and two controls — the **suggested tag**
  as a dashed chip in the done hue, and *„Tag wählen …"*, which opens FR-24.9's give sheet without its refiling switch
  (an untagged item's first tag is its primary one either way), so it searches and creates. The **reason** sits under
  the controls: *„Vorschlag: wie ‚Zahnbürste'"*, *„Vorschlag: in Vorlage ‚Strand'"*, or *„Kein Vorschlag – es findet
  sich kein Grund."* With two or more suggestions the card's foot offers *„N Vorschläge übernehmen"*.
* **Lange nicht gebraucht:** the name, its primary tag and *„zuletzt auf einer Reise am {Datum}"*; *Stilllegen* in the
  danger hue and *Behalten* as a quiet word. Where the device has not opened every trip in the window (Server Mode,
  ADR-032) a line under the head says how many it has not seen.
* **Tag mit nur einem Artikel:** the tag's mark, its name and *„nur an {Artikel}"*; *Zusammenführen …* (FR-24.10's
  prompt, the same one the tag manager opens) and *Behalten*.
* **Every write raises a snackbar with *Rückgängig*:** a given tag is taken back (and a tag created for it deleted), a
  retire is M23's restore, a *Behalten* is forgotten. The merge is FR-24.10's and confirms before it acts, as it does
  there.
* **Rules sheet:** the app bar's one glyph (*Regeln*) opens a sheet with a toggle per rule and, under *Lange nicht
  gebraucht*, the window as three chips (6 / 12 / 24 Monate). Device-local, no save button, like FR-24.4's sheet.
* **Modes:** all three; the rules are client-side and read only what the device holds. **Before the master partition has
  arrived** the screen says the inventory is not here yet and lists nothing (ADR-033).
* **Navigation:** M9 → M24 (the ⋮ word or the foot sentence); back returns to M9. The one header bar names it from the
  route's `titleKey`.

### M25 — Aufgaben (A Trip's Tasks, FR-7.7, FR-7.14) — *built*

* **Purpose:** every task of one trip, in the two phases a trip has. *„Eine Salbe in der Apotheke holen"* is for
  before it; *„am Bahnhof die Zugverbindung abklären"* can only happen during it. The screen exists because the tasks
  outgrew the packing list: they are returned to across a whole trip, and half of them have nothing to do with packing.
* **Where it lives:** the third pill of the trip's view switcher (G-11/FR-21.21), after *Packliste* and *Einkauf*,
  at `/trips/{id}/tasks`. The page head names it *Aufgaben* with the trip's name as its meta (G-9).
* **One list in the data, two windows on it (ADR-071).** This screen shows **all** of a trip's tasks — both a
  preparation declared on a packing row (FR-7.3) and a chore of the trip itself (FR-7.4), which FR-7.6 already made one
  list. M4 shows a *window* of the same list. Nothing is filed twice, which is what gives the phase its meaning: moving
  a task to *Während der Reise* takes it off the packing list.
* **Shaped by a UX review (FR-7.14, which records its seven decisions).** In one line each: what is due now leads in
  its own block; one composer on top with chips, and the FAB; two-line rows with no ✕; one *erledigt* fold per phase;
  a finished packing's *before* at the end, folded; the sheet ordered by how often each act is wanted; the selection's
  bar carries *Erledigt*, *Fällig* and *Löschen*.
* **Elements, top to bottom:**
  * **The *Meine* chip**, off by default — the whole list is the screen's subject. It narrows to the tasks handed to
    the viewer. **Absent where nobody can be named** (Local Mode, Single-User Mode, a trip with no second member,
    G-8): with nobody to hand a task to, every task is everybody's.
  * **The composer** (`TaskComposer`, `m25-composer`, a card) — M6's shape: the field and its ＋, then chips that
    file the task as it is typed. **The phase**: *Vor der Reise* / *Unterwegs*, *Vor der Reise* chosen until the
    trip is **under way** — started, its first day come, or its packing finished (`beforeIsOver`, FR-30.8's rule; an
    undated trip nobody has started keeps both); then the row goes and the field says *„Aufgabe für unterwegs…"*.
    From then on no task is moved into *before* either: the sheet offers a road task no move back, the selection's
    bar no *Vor der Reise*, a drag no drop there. A task already in *before* is still worked and moved out.
    **The tag**: every task tag, and *＋ Tag*, which opens **M6's entry sheet** for a task (one dialog for both
    lists) — *Neue Aufgabe*, the words typed so far, the day chips and the
    tag chooser below, and *Hinzufügen*; the tag chosen there stays chosen in the composer (FR-7.8's „created where it
    is needed"). **The day**: `DueChips`, shown once something is typed — *Heute*, *Morgen*, *Vor Abreise* and
    *Datum…*. The task is written in **one insert** with its phase, tag and day. Phase and tag stay chosen for the next
    task, as M6's tag does — the things for one errand are typed one after another; the day does not.
  * **The *Fällig* block** (`m25-due`), drawn only when something is pressing: every open task that is overdue, due
    today or in the next two days (FR-7.11's *soon*), **from both phases and every tag**, earliest first, as one
    `ListGroup` headed *Fällig* with its count and tinted faintly in the overdue ink. **A task in it leaves its group**
    — listed twice, it would be ticked in one place and still open in the other. Its rows name their tag on the second
    line, since they stand outside their group (an untagged row names nothing: a preparation's chip already says
    where it came from). It is not a drop target:
    what makes a task pressing is its day, not where it was put. A task left open in a closed *before* is history and
    not in it (`domain/taskBoard.ts`).
  * **Two sections**, *Vor der Reise* and *Während der Reise*, each a `SectionHead` whose count is **what stands under
    it** — a task up in the *Fällig* block is not counted twice. Sections are **not** a segment: the two phases of a
    trip are one thing read top to bottom (M6's lists read the same way, FR-30.11). **A phase with no open task
    under its heading** — also when its last open tasks stand in the *Fällig* block — leaves reading order for **one
    line at the end of the screen** (`RestLine`, M6 alike): *„Vor der Reise · nichts offen"*, a
    statement (*„· 2 fällig"* while the block holds some of its tasks); *„· 3 erledigt ›"* once something is done, a
    fold that opens onto the finished tasks directly, with no second *erledigt* fold under it (`m25-before-fold` /
    `m25-during-fold`). Such a phase takes no heading, hint or fold of room above the one still being worked.
  * **Inside each section, the tag groups** (FR-7.8, ADR-072). One heading per task tag that holds something, in the
    tags' own order, then *Aus Packliste* and *Ohne Tag* for what carries none — the heading names where the task came
    from, and both are the same state in the data. **An empty heading is not drawn**, and is therefore not a drop
    target. Each group is a drop target carrying its phase *and* its tag, so one movement may change both. The groups
    hold open tasks only.
  * **One *erledigt* fold per phase**, at the section's end (*„N erledigt"*, `trip-todos-resolved`) — not one under
    every tag group, where a *„1 erledigt"* between two headings would read like a heading. Its
    rows name their tag on the second line and can be unticked.
  * **The FAB** (＋, `FAB_ANCHOR.m25`, `m25-fab`), the one M4, M6 and M26 carry: it scrolls to the top and focuses the
    composer's field. Hidden while selecting; the snackbar clears it.
* **A task's line (FR-7.14): two lines at most.** The first is the grip and the words; the second, where there is
  anything to say, is what is known about the task — the **due pill**, the **row it prepares** (the chip leading to
  it) and the **tag** where the row stands outside its group. **The person stands at the row's edge, before the tick**
  (`AssigneeSeat`: the seat in Server Mode, 24 px like an avatar; an avatar alone where the task can no longer be
  handed over), M4's place for it and M6's — so a task with nothing under its words is one line, as tall as a shopping
  row (E2E-M25-18). The tick stands at the row's own edge — the rule M4's packing rows follow. **No ✕ on the
  row**: *done* and *delete* would be same-sized neighbours a finger-width apart; a task is removed from its sheet or
  from a selection. A fact never squeezes the words: they take the row's width. M4's window keeps its compact one-line
  rows.
  * **The grip** (FR-7.8) is M6's own `DragGrip.vue`; it lifts the task at once, and **only the grip does** — a hold
    on the words selects instead (ADR-075). While a task is in the air the group under the pointer says *hier
    ablegen*; the row stays in the list, dimmed, and a clone travels (ADR-060), in the shared frame of
    `composables/dragToGroup.css`. The gesture's state is on the page as `data-drag`, always set, and returns to `idle`
    only once the write has landed. A row in the *Fällig* block is lifted into a group the same way.
  * **The provenance line is not on the row:** *„erstellt von Andy · heute 14:32"* and
    *„erledigt von Sia · gestern 09:15"* are fact lines in the task's sheet.
  * **The due pill (FR-7.11)**: *Überfällig* in the danger ink on its tint, *Heute* / *Morgen* / *In 2 Tagen* in the
    action ink, a short date (*„Fr., 17.7."*) quiet on the sunken plane further out. It stays visible while
    selecting — when a task is due is part of choosing it. Inside a group the dated open tasks lead, earliest first.
* **Before the trip, closed (FR-7.12, placed by FR-7.14).** Once the packing is finished, *Vor der Reise* is history,
  and history comes after the work: *Während der Reise* is the first section, and *Vor der Reise* is **one folded line
  at the end** (`m25-before-fold`, the same `RestLine` an empty phase folds to): *„Vor der Reise · N erledigt"*, or *„·
  abgeschlossen"* with nothing done. Unfolded it carries the lock line (*„Die Packliste ist abgeschlossen — hier steht,
  was vor der Reise erledigt wurde."*, `m25-before-locked`) and the phase's groups and fold read-only: ticks disabled,
  no grip, no seat, no drop. The composer has no *Vor der Reise* chip, *„Alle N"* leaves those tasks out, and the sheet
  offers no move back. Reopening the packing on M4 lifts all of it.
* **Several tasks at once (FR-7.8/ADR-075, extended by FR-7.14).** M6's selection, drawn by the same components
  (`useRowSelection`, `SelectBox`, `BulkBar`, and the app bar's G-20 mode): a **hold on a task's words** (500 ms, 8 px),
  a right-click, or the app bar's icon (`m25-select`) enters it. **The icon is `SELECTION_ICON`**
  (`checkmarkDoneOutline`, one constant for every list that selects) — not the *Aufgaben* pill's own ☑, which stands
  directly under it. While selecting, the selection box stands where the grip was, the seat and the tick step aside, a
  tap on the words toggles the row, and the app bar carries ✕, *„N ausgewählt"* and *„Alle N"*; the *Meine* chip stays
  live and the composer stays in place at rest. *„Alle N"* takes every **open** task shown, in both phases and of both
  kinds. The floating bar offers, left to right: **Erledigt** (every selected task ticked off, in the done ink),
  **Fällig** (a sheet of the same day chips, titled for the batch; *Vor Abreise* only where every selected task is for
  before the trip), **Tag** (the task sheet's tag chooser, titled for the batch), **Zuweisen** (the row's person
  picker, headed *„Wer übernimmt N Tasks?"*; only where anybody else is on the trip, FR-30.12), **the other phase** —
  one button per phase the batch would actually move something into, never back into a closed *before* — and
  **Löschen**, only when
  every selected task is the trip's own (a preparation is removed on its row, FR-7.3). Only what changes is written, one
  snackbar undo takes the whole batch back (a deletion is hidden at once and written when the undo lapses, as a single
  one is), and the mode ends with the batch; a batch that changes nothing says so instead. Switching views ends the
  mode. M4's window has no selection.
* **The rows look like M6's.** Each tag group is a `ListGroup` — the heading and drop frame M6's tag
  headings wear — and its rows are full-width list items with M6's separators, the task's words set in the row-name
  role (`ion-label h3`'s size and weight).
* **The task sheet** opens by tapping a task's words, on this screen and on M4's window. **Ordered by how often each
  act is wanted (FR-7.14):**
  * **The head**: the task's words **are its title and are edited in place** (`task-sheet-title-input`, the title
    role, a dashed underline): leaving the field or Enter writes the correction as one act with its own undo; emptied,
    the field returns to the words it had. Any member may reword a task (it is shared work; the author-only rule is a
    note's, FR-7.13). Its phase is the meta.
  * **Erledigt** — the one primary button, in the done ink; the sheet closes with it. On a finished task it is
    *Wieder öffnen*, outlined.
  * **Fällig** (an open task only): `DueChips` — the day in force as its own chip with ✕ (*„Sa., 26.9. ·
    Morgen"*), then *Heute*, *Morgen*, *Vor Abreise* (the day before the trip's start, for a task before the trip,
    when that day is later than tomorrow) and *Datum…*, which opens the app's calendar (`DateField`'s bare shape,
    ADR-035). A picked day is written at once, the sheet stays up, and the undo writes the day the task had before.
  * **Tag** (FR-7.8) — **M6's search-or-create mask** (`TaskTagChooser`, the shape of
    `ShoppingTagChooser`): a search field *„Tags suchen oder anlegen…"*, the chosen tag as a chip with its ✕ (which
    takes it off), the matching tags as chips, a dashed *„… neu anlegen"* chip for a word no tag
    carries, and a summary line — *„Abgelegt unter: X"*, or *„Noch kein Tag — die Aufgabe steht unter „Ohne Tag"."*
    naming the group it stands in (*Aus Packliste* for a preparation). Exactly one: choosing is the act. The batch
    sheet has no summary and offers the *no tag* group as a chip instead, since it has no one tag to ✕.
  * **The phase move** as a secondary, outlined row: *Auf „Während der Reise" schieben* / *Zurück auf „Vor der
    Reise"*.
  * **The facts** on the sunken plane: the row it prepares, who wrote it and when, who finished it and when.
  * ***Aufgabe entfernen*** last, quiet, in the danger ink — the trip's own kind only.
  * A task left open in a closed *before* is read, not worked: no *Erledigt*, no editable words, no day.
* **Every act raises the screen's one snackbar with *Rückgängig*** (FR-25.31): the tick, the add, the removal, the
  assignment, the phase move, the due date, the correction of the words, and each batch. The move's undo writes back
  the phase the task actually had, which for a task written before FR-7.7 is none at all.
* **Modes:** all three. Local and Single-User lose the seat, the chip and the *who* of each stamp (G-8) and keep
  everything else — the phases, the move and the moments are client-side rules. **Before the trip partition has
  arrived** the screen shows nothing rather than an empty list (ADR-033).
* **Navigation:** the pill row reaches it from M4 and M6 and back; M4's task section also carries *„Alle Aufgaben"* as
  the way out of its window. M25 has no ⋮: *Gepäck* and *Auswertung* are packing's (G-12).
* ~~**The notes segment (FR-7.9)**~~ — the notes are threads in a view of their own, **M26**, the fourth pill
  (FR-7.13); M25 is one list, with no segment. ~~E2E-M25-10/11~~ moved to E2E-M26-01/03.

### M26 — Notizen (A Trip's Notes, FR-7.13) — *built*

* **What it is:** a trip's notes as threads — information one traveller leaves for the others (a key-box code, a
  courier's number) and the answers to it. A thread is a first note with replies, one level deep. Reasoning:
  `dev-docs/trip-note-threads-concept.md` (§7b is the UX rework); the interactive mockup is
  `UI_Concept_TripNoteThreads_variants.html`.
* **Where it lives:** the fourth pill of the G-9 switcher, after *Aufgaben*, glyph `chatbubblesOutline`
  (`/trips/:id/notes`, `meta.tripView: 'notes'`). Its badge is the number of entries new for me, in the action colour.
  No ⋮ (ADR-051 amendment 2): nothing here is packing's. Back is M4.
* **The list:** the threads, the one with the latest activity first — a reply lifts its thread (question 1). Each is one
  card (`.jp-card`), itself a button into the thread: the first note's author's avatar; **its name** — the title in the
  heading weight, or else the first line in the body weight — with a ***Neu*** badge (*Neu 3* for three) where entries
  are new for me, and the card's edge in the action colour; **what is in it** — the first note's words under a title,
  the rest of them under a first-line name, two lines at most, with a phone number and a code marked as on the thread;
  under a hairline **the newest reply** as *„Ben: Parkplatz ist Nr. 12"* with Ben's avatar; and *„2 Antworten · vor 5
  Min"*, or who wrote it and when with no reply yet. No chevron and no checkbox: the notes are looked things up in, so
  the code is readable without a tap, and *seen* is said inside the thread. The empty trip says *„Für diese Reise gibt
  es noch keine Notizen."*
* **Writing a note:** the FAB (＋, `FAB_ANCHOR.m26`) opens a sheet *„Neue Notiz"*: *„Titel (optional)"*, the words
  (*„Eine Notiz für alle — ein Code, eine Nummer…"*), where another member shares the trip the line *„Alle
  Mitreisenden sehen die Notiz."*,
  *Abbrechen* and *Teilen*. It writes a first note with `created_at` from the device; the list stays where it is.
* **The thread view** (`/trips/:id/notes/:threadId`, `meta.parent` the list, no pills) is named by the thread, with the
  trip as meta. **The first note is a card on top** — avatar, *„Ben · heute 14:32 · bearbeitet"*, a ⋯, the words in
  full, and in Server Mode ***„Gesehen von Anna, Chris"*** (FR-7.9 decision 3, here rather than on the list). **Then
  the replies in the order they were written**, as bubbles: somebody else's on the left with avatar and name, mine on
  the right in the action colour's tint with only the time. **The reply field is fixed at the bottom** (*„Antworten…"*,
  a send button, Enter sends), and a reply lands at the bottom, scrolled into view — oldest first, so the field never
  stands between the note and its answers. A reply has no reply field of its own: one level.
* **New for me:** a divider ***„Neu seit deinem letzten Besuch"*** stands above the first unseen reply, and the view
  opens scrolled to it; a thread new as a whole has no divider — its first note's card takes the action colour at the
  edge. **What is new** is derived (`noteThreads`): an entry by somebody else created or edited after my tick reached,
  or after my own latest entry — replying is not ticking, but what I answered is behind me. Opening is not seeing.
* ***„✓ Gelesen"*** (FR-7.9's tick, per person) is a labelled button under the last entry while anything is new for
  me; it ticks the thread through its newest entry (`seen_through`) and goes. It is not a bare checkbox on the list,
  which would read as *done* one pill from the tasks.
* **Words:** a phone number is a `tel:` link; **a code** — three to six digits standing alone — is a chip that copies
  itself (*„4711 kopiert"*). On the list the chip only marks it: a card is one button already.
* **An entry's menu** opens on a tap on the entry (the ⋯ on the first note shows it can): *Text kopieren*,
  ***Bearbeiten* on my own entries only** (question 2; in Local Mode, with no identity, on every entry — one writer),
  and the delete — *„Notiz löschen, mit 2 Antworten"* on a first note with replies, which takes the thread and returns
  to the list; *„Antwort löschen"* on a reply. *Bearbeiten* opens the entry in place — a title field on a first note,
  the words, *Abbrechen* / *Speichern*; saving writes the words, the title and `edited_at`, the entry says
  *bearbeitet*, and for everybody else the thread is new again (question 3). No push. A thread deleted elsewhere
  leaves its view for the list.
* **A link naming a thread** — M1's row, a `note` or `note_reply` notification — opens its view directly.
* **Modes:** all three. Server: everything. Single-User and Local: one author, so nothing is new, *Gelesen* and
  *„Gesehen von"* never render and no push is sent; threads, titles and edits work as a scratchpad. **Before the trip
  partition has arrived** the screen shows nothing rather than an empty list (ADR-033).
* (E2E-M26-01/02 `local`, E2E-M26-03/04 `server`, E2E-M1-14, E2E-G12-06/07, E2E-VIS-14)

### M21 — Vorlage aus Reise (Template from Trip)

**Built** (Addendum §3.27, FR-27.5), mocked in `UI_Concept_Prototype.html`. A row generated from the old
**Ferien-Vorlage's own** positions is treated as loose rather than recognised, because FR-27.1 forbids a Vorlage
including another one, and it says so differently from an ad-hoc row; the *„Auf der Reise ergänzt"* wording
describes a path the app cannot walk — see FR-27.5's build note. The entry depends on the trip lifecycle M2 offers
(*Reise starten*, then the close).

* **Purpose:** Turn a finished trip back into a reusable template, so the year's learning ends up in the templates
  instead of in the archive. The screen exists because the naive "save as template" (copy everything flat) destroys
  composition: the trip's rows came *from* groups, and a copy would fork them, so next year two divergent camera lists
  exist. M21 is that recognition step, and it is the closing half of the FR-27.1 round-trip (M3 instantiates a template
  into a trip, M21 folds a trip back into templates).
* **Entry:** The closing card at the top of **M4 on an archived trip** — "Reise abgeschlossen", one line of explanation,
  one button "Vorlage aus dieser Reise erstellen →". Nothing else in the app links here. Full-screen with a back
  chevron, no FAB, no G-12 cluster (there is no list to search or filter).
* **Elements (top to bottom):**
  * One explanatory line stating the screen's contract: recognised groups are **referenced, not copied**, and stay
    independently maintainable.
  * **Name der Vorlage** — a text field, prefilled with a next-occurrence guess derived from the trip name. A name
    another template already holds is refused where it is typed (FR-1.6): a note under the field names the
    holder and *Vorlage erstellen* is disabled. There is no existing row to offer here — folding a trip is not an edit
    of the template that happens to share the name — and the check has to precede the screen's **first** write, since
    M21 writes master items and group updates before it writes the Vorlage. The optional bundle group's name is held to
    the same rule, and to one more: the two names this screen writes must also differ from each other.
  * **Erkannte Gruppen · N** — one card per group the trip's rows trace back to (`source_template_id` provenance), each
    with the group's name, "*n* Artikel dieser Reise stammen daraus", and a green **"wird wiederverwendet ✓"** chip.
    Group membership is a fact of the data, not a user choice: recognised groups are always referenced, so there is no
    per-group opt-out here.
  * **Per-group deviations.** A group whose trip rows contain additions names them literally — "Während der Reise
    ergänzt: **Gimbal**" — followed by a two-option segment: **Gruppe aktualisieren**
    (default) vs. **Nur in diese Vorlage**. While *aktualisieren* is selected, a muted line spells out the blast radius:
    the change reaches everything that includes the group and is proposed to the trips that still follow it (FR-27.4).
    Defaulting to *update* is deliberate and matches M14's stance — a change made on the trip is treated as learned
    truth, not as an accident.
  * **Absent positions are reported, never acted on.** Group positions the trip did not carry get one muted line ("…
    waren auf dieser Reise nicht dabei — Gruppe bleibt unverändert"). A skipped tripod is trip history; silently pruning
    the group over it would make every incomplete trip erode the master data.
  * **Eigene Artikel · n von m** — the loose ad-hoc rows (no group provenance), each a checkbox row with its category
    and "ohne Gruppe hinzugefügt", **all pre-checked**. Unchecking is how trip-specific one-offs stay out of the
    template.
  * **"Als neue Gruppe speichern"** toggle — bundles the checked loose rows into a *fresh group* (name field appears
    below, prefilled) instead of dropping them in as own positions, for the case where they form a reusable unit. Off by
    default: the common case is a handful of unrelated extras, and a group per trip would breed clutter.
  * Primary action **"Vorlage erstellen ✓"**.
* **Actions / result:** Creating writes, in this order — (1) deviations marked *aktualisieren* into their group, each
  recorded in the group's change history with its origin ("aus Reise „…“"), (2) the checked loose rows plus every
  deviation marked *nur in diese Vorlage* as own positions — or the loose rows into the new group when the toggle is on,
  (3) the composed **Ferien-Vorlage** itself (FR-27.6 scope, referencing the recognised groups and any freshly created
  one). Ad-hoc rows are matched to master items by tolerant name match (FR-16.3-style, the same fold M14 does); an
  unmatched name creates the master item first (FR-9.2 mechanics). A confirmation snackbar names the template, and the
  screen hands off **directly into M8** on the new template — creation ends where editing continues, and it is also the
  immediate proof that the groups were referenced rather than copied.
* **States:** No recognised groups (a purely ad-hoc trip) → the *Erkannte Gruppen* section is absent and the screen
  degrades to "name it, pick the rows"; no loose rows → the *Eigene Artikel* card shows its empty line and the bundle
  toggle is inert. The source trip is **never modified** by this screen, archived or not.
* **Navigation:** From M4's closing card on an archived trip; exits into M8 on success, back chevron to the packing list
  otherwise.

---

## 3. Cross-Screen Flows (Reference)

1. **Happy path packing:** M1 → M4 → hold a row → *Jetzt packen* → check → real-time update on partner's device.
2. **Delegation:** M4 → M5 → set packer → push notification → recipient taps → deep link into M4/M5 (G-4).
3. **Purchase transition:** M6 (Before the trip) → check item → appears in M4 as PACK/Open (FR-3.3).
4. **Feedback loop:** M4 flag *Missing* → trip archived → M14 proposes template addition → next M3 run includes the
   item.
5. **Migration:** M15 import → M2 shows archived series trips → M3 step 4 surfaces historical suggestions (FR-14.2)
   immediately — **on a device that did the import and on one that only synced it** (E2E-FLOW-05).
6. **Template round-trip (§3.27):** M3 creates a trip from a Ferien-Vorlage plus extra groups (overlaps deduped in the
   preview) → items are added ad-hoc while packing → trip archived → M21 recognises the groups, folds the chosen
   deviations back into them → the trips using those groups are asked, and show the applied-changes chip on M2 once they
   accept (FR-27.4) → next year's M3 run starts from the new composed template.

---

## UI Decisions (Resolved)

Every UI decision is recorded in its owning pattern or screen: grouping persistence (M4), stepper/checkbox threshold
(G-6), "Never ask again" scope (M14), desktop two-pane layout (G-9, M4/M5), and presence on M2 (not on M2 at all — see
the M2 elements list and G-10). No open UI decisions remain in this document.
