# 0. Global Patterns

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
  while it had not. **The count rides the glyph's upper corner** and takes no room in the bar: the glyph keeps one
  footprint in every state, so a queue that appears or drains never moves the glyphs beside it; the waiting-update dot
  (NFR-4.13) takes the lower corner.
  The detail sheet adds two lines beneath the count: that the changes are **saved on this device**, or
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
  drill-down is the back-target contract rather than the logo (ADR-011). **The bar's two ends are the frame's, its
  cluster is the page's (ADR-050 amendment 2, UX-14):** from the desktop breakpoint up the cluster and its ⋮ end at the
  content column's right edge — following the column when a detail pane re-centres it — while back or the logo keep
  the left corner and the sync glyph and the gear the right one. Below the breakpoint the column is the window and the
  cluster stands beside the sync glyph. **The bar is part of the page, not a slab over
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
* **A trip's screen names the trip's other screens (FR-21.21, ADR-051 and its amendments 1, 3 and 4).** Under the page
  head, and inside it — so it yields with the name where a screen collapses its head (FR-21.17) — the views a trip is
  *worked* in are a row of pills: *Ideen (n)* (§3.29), *Packliste*, *Einkaufen (n)*, *Aufgaben (n)*, *Notizen*
  (FR-7.13), *Ausflüge (n)* (FR-31), *Tagesplan* (FR-29.15) and *Essen* (§3.33) — the last two only while the trip has
  both dates — plus the view being looked at when it is none of them, so the row always marks where you are. **The
  current one is marked, inert and the only one in words** (its glyph at `--jp-icon-sm` beside the word);
  every other view is its G-12 glyph at `--jp-icon-md`, its count a badge on the glyph's corner, and its whole label
  (*„Einkaufen (12)"*) its `aria-label` and `title` — six words and their counts do not fit a phone. **Holding a glyph
  shows that label in a bubble** below it, which stays a moment after the release and does not navigate; a tap is one
  tap, from any of the trip's screens. *Gepäck* and *Auswertung* are words in the bar's ⋮ instead — the frame puts them
  there, from the same `meta.tripView` the row comes from, so the screens decide nothing in either shape and a view
  cannot be named differently in the two. The row is laid out for the Pixel 9 Pro's 410 CSS px (ADR-051); six pills fill
  it, and where they do not fit — a narrower phone, a longer word, a seventh pill while standing on one of the ⋮'s views
  — **the row scrolls sideways, with the pill you stand on scrolled to its centre** (amendments 4 and 5; E2E-G12-07
  measures both shapes), as near as the row's ends allow. **A 24 px fade marks each side that holds more pills**, and
  a swipe rests on a whole pill (`scroll-snap-type: x proximity`), so a glyph is never cut at a hard edge — G-13's
  sideways-row rule, which every scrolling row of chips shares. **The notes'
  badge counts what is new for me, never the total, in the action colour** (`count-new`) where every other badge is
  grey.
* **The bar's cluster is capped at three glyphs, one on a tab root (ADR-050 and its amendment 1).** A page describes its
  actions in registration order (G-12); the bar renders the first three that are not marked for the ⋮ and puts
  everything after them into the menu, ahead of the actions the page marked itself. Without a cap a screen gathers
  glyphs one at a time, because nothing says what full looks like. The right-hand group — ⋮ where anything is behind it,
  sync glyph, avatar/settings — is present on **every** screen, which is what keeps the conflict log reachable inside a
  trip. **One exception:** the gear hides on M17 itself, where it would only reopen the screen it is on; the sync glyph
  stays. **And because it is on every screen, M17 gives back the screen it was opened from:** a control offered
  everywhere cannot declare one true parent, so the route records where it was entered from and `‹` returns there — the
  gear tapped inside a trip comes back to that trip, not to the dashboard. The same holds for the two import flows (M15,
  M18), which are each entered from more than one screen. An entry that carries no origin — a notification deep link, a
  pasted URL — falls back to the declared parent (ADR-011, Navigation_Concept §7). There is exactly one header bar in
  the app, and exactly one page head; no screen supplies its own.
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
  writing them first; what it cannot do is add a fourth without noticing. **On a tab root the size is one (ADR-050
  amendment 1, UX-05):** M1, M2, M7 and M9 show at most the magnifier and the ⋮ before the sync glyph. The roots are the
  family's first row on every visit, and what else stood there — the two imports, done a few times a year, and M9's eye,
  ↕ and ✓✓, none of which reads literally — is a word in the ⋮ (*Datei importieren*, *Tabelle importieren*) or moved
  into the screen (M9's sort and shown properties head its *Ansicht & Filter* sheet; its selection starts on a row's
  hold). `AppHeader` holds the root budget itself, so a root action added later becomes a word without its page
  remembering the rule. E2E-G12-02 reads the bar at 412 and 360 px. The trip's views are the switcher under the page
  head (FR-21.21, ADR-051), except *Gepäck* and *Auswertung* (ADR-051 amendment 1): they are ⋮ entries, contributed by
  the frame rather than by the page, and they **head** the sheet — where you can go first, what you do after. The page's
  own entries keep their order among themselves.
  **A ⋮ holds its own context and nothing else (ADR-051 amendment 2).** *Gepäck* and *Auswertung* are packing's, so the
  frame offers them only on packing's views (M4, M11, M12) — **M6 and M25 have no ⋮ at all**, and the packing pill is
  the way from there. What changes the whole trip rather than the packing — *„Reise-Eigenschaften"*, *„Reise starten"*
  and *„Reise abschliessen"* — is **M2's alone** (the row's hold menu and the hero's buttons). M4's ⋮ holds packing's:
  the two views, *„Packen abschliessen"* (FR-5.10) and *„Namen aus dem Inventar"* (FR-27.16).
  **An overflow entry runs after the sheet closes, never inside its handler:** while an overlay is up Ionic marks the
  router outlet `aria-hidden`, and an action that navigates from within the handler leaves that flag behind — the screen
  then renders and responds to every tap while being absent from the accessibility tree.
  * **Placement — the app bar, over the column's right edge.** On any screen reached with the back chevron (M4, M6, …)
    the cluster occupies the app bar's right side: beside the sync glyph and the gear on a phone, and from 900 px up
    ending where the content column ends, so on a 1920 px window it is not 530 px from the list it acts on (G-9, ADR-050
    amendment 2). E2E-M4-71 measures it at 1280 and 1920 px, with and without M5's pane. The gear stays on every
    screen except M17 itself, because G-9's "back returns to where the gear was tapped" only works if the gear can be
    tapped anywhere. The cost — M4's bar carrying the cluster
    *and* the gear — is a known crowding finding (UX-13) and is decided there, not here. A tab root shows the magnifier
    at most (see the size above). Rationale beyond tidiness: M4's sub-header **collapses on scroll** (Addendum §3.25),
    so a cluster living in that sub-header would slide away mid-task — in the app bar the actions stay reachable while
    packing.
  * **Order and meaning:** 🔍 **search**, collapsed — the field appears below only when the icon is tapped, and its ✕
    *closes* it rather than merely emptying it, since an empty open field gives back the row the icon just reclaimed.
    **Where it appears is the top of what the screen holds still**, never down in the list's flow: on M4 it stands in
    the progress card's place in the sticky band, directly under the page head, and keeps that place while the head
    yields to the list (FR-21.17) — a field opened 500 px below its glyph, which then scrolls away with the rows it
    narrows, is a field the reader has to hunt for twice (UX-18). Its ✕ is the round close control (G-14).
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
  * **Budget.** The cluster holds at most **three glyphs** (ADR-050, `MAX_BAR_ACTIONS` in `AppHeader.vue`), and **one**
    on a tab root (amendment 1, `MAX_ROOT_BAR_ACTIONS`); a screen needing more has the surplus rendered behind the ⋮ as
    words rather than widening the cluster. M4 fills the three with search, filter and fold-all.
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
    * **The head is inset by what holds it.** No side margin of its own, so in a padded page, sheet or card it meets
      the padding's edge; on a page of inset cards (M7, M8) it takes `--jp-card-list-inset` with them (`cardList`). The
      count ends on the card's right edge, the name starts on its left.
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
  * **A word on a chip, pill or toggle is never cut (UX-08).** No ellipsis and no hard edge on the reference device or
    at 360 px: a row of chips **wraps** (`ChipRow`, the default), or, where a run is too long to wrap — a trip's days,
    the trip switcher's pills, a long roster on the for-whom line — it is **a sideways row**, and every sideways row
    follows one rule from one place (`useEdgeFades` and `edgeFades.css`): a 24 px fade on each side that holds more, a
    swipe resting on a whole item (`scroll-snap-type: x proximity`), and the chosen item scrolled to the row's centre
    when the row is laid out and whenever the choice changes (`ChipRow scroll`). A screen does not draw its own edge. A
    word too long for its column takes the room it needs — the for-whom line gives each toggle its word's width
    (FR-25.28) — and a chip wider than its whole row breaks its words inside the chip rather than run past the edge. A
    shorter word is a copy decision, made where the vocabulary lives (M31's slot names), never a truncation.

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
    leave nothing recording which was meant. The search field's ✕ (G-12) is the same control (`RoundClose`): a bare
    12 px glyph beside a field is a target a thumb misses.
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
  (`UI_Concept_ItemMark_variants.html` at `6b148419`); the losing options and their measured costs are in Addendum 3.28.
  An icon library would fit the token tables and still loses: at 34 px its strokes stop being distinguishable, and its
  substitute rate is the *higher* of the two.
  * **The slot holds its width when it is empty.** An item with no mark is the normal case (FR-28.1), and a column that
    collapses on unmarked rows re-rags the names on every list.
  * **The ladder is per surface, not global.** M9 falls back photo → mark → the primary tag's mark, painted muted
    (FR-24.13) → primary-tag initial; M4 and M5 fall back photo → mark → *nothing*. The inventory identifies an item and
    already owns the initial tile (ADR-014); the packing row is scanned, and a coloured letter repeating the name beside
    it is noise — rendered, it lost to *no mark at all*.
  * **Under its own tag's heading the borrowed rungs stop** (UX-19). In M9 grouped by tag a row's group *is* its
    primary tag, so the tag's mark and its initial would only repeat the heading down the column — rendered, ten muted
    🔧 under „🔧 Technik" were louder than the two marks the items owned. There the ladder ends photo → mark →
    *nothing*, the slot holding its width; a dot or a blank tile in the slot lost the rendered round as a second
    repeated column. Where no heading names the tag — search results, the alphabetical run, the untagged bucket — the
    full ladder stays.
  * **A photo wins wherever one exists.** It is the more specific answer (FR-22.1). The accepted cost is a mixed column:
    on a realistic list three rows in fifteen are photographed, and they pull the eye harder than the twelve beside
    them.
  * **The mark is content, never chrome** (FR-28.5). It is the one thing on screen whose colours do not come from the
    token table (G-11, invariant 9), and it stays confined to item and template rows for exactly that reason: no emoji
    in buttons, headings, status pills, progress or empty states, and never as a stand-in for a tag or state colour. It
    is presentational for assistive technology — the row's name is its accessible name, and no count, filter or state is
    ever expressed by a mark alone. The FR-25.4 procurement glyphs (🧳/🛒/📍) and the ⏰ late flag are **not** marks: they
    are a fixed app-owned state vocabulary, and they are the ceiling rather than a precedent.
  * **On M4 the slot is one slot whatever else it does** (UX-03). Where the list carries FR-25.28's *who* column the
    slot is also the door to the for-whom strip and a lone per-person row's face takes the mark's place; no glyph is
    drawn beside it, so the name column keeps every pixel the slot does not need (UX-9).
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
  * **In a multi-step flow the default action has a fixed place** (M3): a footer band above the tab bar carries the
    step's default action and its back square on every step, so the button sits at the same spot whatever the step's
    length. A single screen or sheet keeps its button where its content puts it.
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
  a task's and a shopping entry's due day, M15's and M18's file pickers. Accepted cost (ADR-035): a date cannot be
  typed — revisit at the first field whose value is far from today.
  * **A first and a last day are one `DateRangeField`** (ADR-080) — M3's and M22's dates, the clone form's and an
    excursion's on M27. The field shows the range through `formatDayRange` with its length as a pill (*„10 Tage"*), one
    day alone through `formatDay`, and *„Zeitraum wählen"* when empty. It opens one sheet: the two sides in its head
    (*Beginn → Ende*, *Von → Bis*), the weekday row Monday first, and the months stacked one under the other — scrolled
    to the range's month, else today's — so a range across a month's end is seen whole. The first tap sets the start,
    the next the end, the same day twice is a one-day range; a tap on a side in the head chooses which one the next tap
    sets, so one day moves alone and an end alone stays enterable (FR-2.1b). The footer carries *Leeren*, a line saying
    what the next tap does or how many days are picked, and *Fertig*, which alone writes; leaving the sheet otherwise
    changes nothing. The tap rule never holds an end before its start (FR-2.1d), and the field carries **bounds**
    (`min`/`max`) as days that cannot be tapped — an excursion's are its trip's days (FR-31.1). An absent bound is no
    restriction, and a bound constrains the calendar only: a row that already holds an inverted range still renders and
    is repaired by picking a new one. An open side lists 12 months back and 24 ahead of where the sheet opened, with
    *Frühere Monate* / *Spätere Monate* at its ends adding 12 more each, so no day is out of reach. Under G-3's lock the
    field opens nothing.
  * **Why not native (ADR-035, UX-6):** the browser's control text is unreachable by NFR-4.12 and its chrome by the
    token tables; the accepted cost and its revisit trigger are in the ADR.
  * **The calendar mounts once the sheet has *landed*** (Ionic's `didPresent`), and the sheet chrome renders that state
    as `data-presented`. Ionic readies `ion-datetime` — listeners attached, the calendar body unhidden — from an
    IntersectionObserver rooted on the component, with one fallback 100 ms after mount; a calendar mounted while the
    sheet is still `display: none` fires that fallback against a box of zero height and leaves readiness to an observer
    measured on a loaded WebKit at 0.6–4.6 s. A calendar mounted into a laid-out sheet is ready on the fallback's own
    clock. The sheet keeps its height across the swap, because the second calendar is the size of the first (G-2: an
    auto-height sheet is measured once at presentation).
* **G-21 (Dragging a Row — ADR-094):** Wherever a row is moved by its **grip** (`DragGrip.vue`; M6's lines, M25's
  tasks, M9's tag manager, M31's meals), one gesture does it, `useDragToGroup`, and it feels the same everywhere:
  * **The grip lifts at once**; a hold on the rest of the row selects instead (ADR-075), or does nothing where the
    screen has no selection (M31).
  * **The row stays where it was, dimmed** (`data-drag-source`), so nothing moves under the finger (ADR-060).
  * **What travels is a chip above the fingertip**, not a copy of the row under it (`data-drag-ghost`): the grip's
    glyph, what is carried (`data-carry-title`) with a quiet word beside it where the screen has one (a meal's slot,
    `data-carry-tag`), and **where a drop would put it** (`data-carry-where`) — *„→ Do., 15.10."*, *„→ Vor der Reise ·
    Haus"*, *„→ Platz 3"* in the action ink, or quiet *„bleibt am Mo., 12.10."* / *„bleibt, wo es ist"* while a drop
    would change nothing. Its bottom edge floats 22 px above the fingertip and its grip sits over the finger; it keeps
    8 px from either edge of the screen. The finger aims, so the place it aims at is never under the chip, and a place
    the hand itself covers is still named on the chip. It appears with a short scale-in, none under reduced motion.
  * **A second choice rides in the chip, never under the finger.** Where a drop can change something besides the
    place (M31's slot), the chip is as wide as the lifted row (`data-carry-wide`) and carries a row of fields under
    its head (`data-carry-choices`): first the one that keeps (*„bleibt Abend"*, the leading 34 % of the row, where
    the grip is and a finger dragged straight down stays), then one per option (*Früh · Mittag · Zw. · Abend*), the
    current one outlined. Each field stands over its own column of the list, so the field lit (`data-on`) is the one
    directly above the finger: up and down chooses the place, how far right the option. The chip's line says both,
    *„→ Do., 15.10. · Mittag"*. Elsewhere the chip stays compact.
  * **The list scrolls under a finger held at its edge**: within 64 px of the scroller's top or bottom it scrolls that
    way, slowly as the finger enters the zone and faster deeper in (by the square of the depth, a quarter of the top
    speed half-way in), at most 360 px a second — measured in time, not frames, so a 120 Hz phone scrolls no faster
    than a 60 Hz one and a busy one painting as few as four frames a second no slower, while a page that hung for
    seconds moves on by a short step (at most a quarter of a second's worth), not by the whole stall — and stops when
    the finger leaves the zone or the list its end (at once where it already stands there), so a place below the fold
    is reached without letting go and the rows going by can still be read. The scroller is the screen's
    Ionic content, or the nearest scrolling ancestor. The pointer is held from the lift, so a toast lying over the
    bottom edge never takes the finger's moves. `data-drag-scroll` on the page reads `up`, `down` or `still`.
  * **The place under the finger is framed** in the action colour with its tint and says *hier ablegen*; a place that
    would refuse the row dims for as long as it is in the air (`data-drop-refused`); a place where a drop would change
    nothing is not framed at all, and a drop there writes nothing.
  * **Letting go writes at once** and raises the screen's toast with **Rückgängig**. `data-drag` on the page reads
    `idle`, `lifting`, `dragging` or `settling`, and returns to `idle` only once the write has landed.
  * The chip's frame, the dimmed row and M6's insert line are drawn once, in `composables/dragToGroup.css`; a place's
    name comes from its own `data-drop-label` (a heading's title by default, `ListGroup.vue`).
* **G-22 (The Start Animation — FR-21.29):** One overlay over the whole app, `SplashScreen.vue`, mounted by `App.vue`
  once per app start while M17's *Start animation* is on (`lib/splash.ts`, `claimGreeting`: a `sessionStorage` marker,
  so the reloads the app makes of itself do not greet again). On `--ct-base`, the mark centred at 152 px
  with the wordmark under it in the app bar's lockup at the display size:
  * **Intro, 0–1.3 s:** the bag's outline and its pocket are drawn (stroke, 0.52 s), the moss cube and then the larch
    cube drop in from above with a small overshoot, the letters of *JIT·Pack* rise one after another, the dot in the
    brand ink. The app bar's (or M19's) mark — the one carrying `data-splash-target` — is hidden meanwhile.
  * **Flight, 1.3–1.78 s:** the mark moves and shrinks onto that landing mark, measured at that moment; the overlay's
    ground clears to transparent and the wordmark fades, so the app is seen arriving round the mark. When the mark
    lands the overlay is removed and the landing mark shown. Without a visible landing mark (a drill-down) the
    overlay fades instead.
  * **A tap anywhere or any key ends it at once.** It never takes the first tap meant for the app after the flight
    has begun: from then on it lets taps through.
  * **Reduced motion:** no intro and no flight; the packed mark stands for 0.5 s, then the overlay fades in 0.25 s.
  * `data-testid="splash"` carries `data-phase` — `intro`, `flight` or `fade`. The phases are timers, so a case drives
    them with Playwright's clock; the e2e suite starts every context with the animation off, through the preference
    itself.
