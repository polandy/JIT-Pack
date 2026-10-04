# M29 — Tagesplan (a trip's day plan, FR-29.14/29.15)

* **E2E-M29-01** `local` (FR-29.7/29.15) — **implemented** (`planner/dayplan.spec.ts`): a trip with only an end date has
  no *Day plan* pill; one with both has, and its strip lists every day with the first one chosen and *day 1 of 4* over
  the timeline. *Arrival* stands on the first day, *Departure* on the last, and a day between says *Nothing planned
  yet.*
* **E2E-M29-02** `local` (FR-29.15) — **implemented** (`planner/dayplan.spec.ts`): an entry written through the ＋ with
  a note and a time stands on the chosen day above the untimed arrival; a tap opens it to change its time, which the
  line follows; deleting it asks first and takes the line away.
* **E2E-M29-03** `local` (FR-29.14/29.15) — **implemented** (`planner/dayplan.spec.ts`): a shortlisted idea's card says
  *not planned yet*; a day chosen in its detail changes the card and puts the idea on that day of the plan. The pool bar
  names the one still without a day; its sheet plans it on another day with a chip and says every idea has a day, and
  the bar is gone. Ticking the idea on the plan strikes it through and M28 counts it *Done*.
* **E2E-M29-04** `local` (FR-29.15) — **implemented** (`planner/dayplan.spec.ts`): an excursion with two days stands on
  both — *Excursion · Start* on the first, *Excursion · Return* on the last — and a tap opens its list on M27. The line
  comes from the packing side through `lib/dayPlanSources.ts`, so the case also proves `App.vue`'s binding (it went red
  with the binding removed). A task due on a day is the same source's (`dayPlanSource.spec.ts`: the line, its tick by
  the live row).
* **E2E-M29-05** `local` (FR-29.18) — **implemented** (`planner/connections.spec.ts`): an SBB link pasted into the
  *Connection* segment's field is read without a button — *✓ 5 legs read.*, the five legs as a preview with the walk's
  🚶, the hand fields gone — and the button names the link's day, two days after the chosen one. Written, the plan
  moves to that day, where the line stands at 10:58 as a *Connection* with *arr. 15:46 · RE 3, IC 3, IC 1, T 6 · 3
  changes*; ▸ opens its five legs and the link to the app, and closes them again. Went red with the paste's read
  removed. The reader itself, against a real shared link, is `planner/domain/__tests__/connections.spec.ts`.
* **E2E-M29-06** `local` (FR-29.15/29.18) — **implemented** (`planner/connections.spec.ts`): a connection whose link
  names a day the trip does not have is written and listed *Outside the trip*; a tap opens *Edit connection* without
  segments and with its legs, and deleting it there empties the list.
* **E2E-M29-07** `local` (FR-29.18) — **implemented** (`planner/connections.spec.ts`): a link no reader knows says *I
  can't read this link – please enter it by hand.* and keeps the button off until the hand fields hold both stops and
  both times; an arrival before the departure reads *arr. 06:45 (+1) · Fähre · direct* on the chosen day, and the kept
  link opens from its legs. Opened again, the hand fields hold its leg, and a changed arrival reaches the line.
* **E2E-M29-08** `local` (FR-29.18) — **implemented** (`planner/connections.spec.ts`, Chromium only — WebKit grants a
  test no clipboard): the clipboard button puts the clipboard's link in the field and reads it.
* **E2E-M29-09** `server` (FR-29.18) — **implemented** (`planner/server/connections.spec.ts`): a pasted SBB short link
  asks the server's page read once, finds the trip link among the page's links and reads its legs; the written
  connection opens the app through the short link that was pasted. The page read is planted, as in E2E-M28-09; the
  server's half — the page's links in its answer — is `TestParse_ReadsThePagesLinks_FR29_18` and
  `TestLinkPreview_CarriesThePagesLinks_FR29_18`.
* **E2E-M29-10** `local` (FR-29.7) — **implemented** (`planner/opening.spec.ts`): a trip ahead opened from M2 lands on
  the view last visited (*Aufgaben*), and with that forgotten — a first visit on this device — on *Ideen*, its packing
  list being empty; a trip containing today, with an entry on today's plan, lands on the day plan with today chosen,
  from M2 and from M1's *Geplant* row, whatever view was last; a trip whose last day has passed lands on the packing
  list though the day plan was last. The rule's other branches — a start before the date, a closed trip, a trip without
  both dates, rows not yet on the device — are `lib/__tests__/tripOpening.spec.ts` and
  `router/__tests__/tripOpening.spec.ts`.
* **E2E-M29-12** `local` (FR-29.7) — **implemented** (`planner/opening.spec.ts`): a trip under way whose plan holds
  nothing today opens on *Einkauf* while nothing is open anywhere, on *Aufgaben* once a task is open and nothing is to
  buy, on *Einkauf* again once something is, and on the day plan with today chosen once an entry stands on today. The
  partition not yet on the device is `router/__tests__/tripOpening.spec.ts`; what counts as an empty day — arrival and
  departure do not, and a trip started early asks about its first day — is `dayHoldsNothing` and
  `openingDayHoldsNothing` in `planner/domain/__tests__/dayPlan.spec.ts`.
* **E2E-M29-11** `local` (FR-29.7) — **implemented** (`planner/opening.spec.ts`): during a trip, M1's *Heute* card
  lists three of today's four lines and says *„+ 1 more · day plan"*; a trip ahead has no card; an idea ticked on the
  card is done, and the link opens M29 on today with the idea ticked there. Which lines are still to come at a time of
  day is `linesAhead` in `planner/domain/__tests__/dayPlan.spec.ts`.
* **E2E-M29-13** `local` (FR-29.13/29.15/29.18) — **implemented** (`planner/bridge.spec.ts`): a shortlisted idea
  planned on a day and made into an excursion stands on that day as one *Excursion* line naming *💡 Gola Gorropu* —
  the plan holds one line, not two. A connection written by hand on the excursion's own screen (M27) stands
  beside it labelled *Way there · Gola Gorropu*. The merge rule
  (time, the idea's missing line, pool and outside) is `dayPlan.spec.ts`; the server's check of the link is
  `TestApplyMutation_ConnectionExcursion_KeepsItOnTheTripsOwn`.
* **E2E-M29-14** `local` (FR-29.15/29.18) — **specified** (`planner/connections.spec.ts`, the timetable stubbed): an
  entry written through the ＋ without a connection — title and *09:30*, no connection — is opened again and gains
  one: *Add train connection* opens the step, *Von* and *Nach* typed list results with no search button pressed, a
  tap brings the step back to the form with the connection's card, the title and *09:30* untouched. Saved, the
  entry's line keeps its title and time and carries *🚆 Luzern → Hergiswil · arr. 08:34 · S 4 · direct* under it.
  Opened once more, *Remove* takes the connection off and *Save* leaves the entry alone on its line — the connection
  line gone, the title still there.
* **E2E-M29-15** `local` (FR-29.15/29.18) — **specified** (`planner/connections.spec.ts`, the timetable stubbed): on a
  new entry with *What* and *Time* empty, a connection taken fills *What* with *To Hergiswil* and *Time* with *08:06*,
  both labelled *from the connection* (`day-entry-filled`); typing into *What* drops its label and keeps the typed
  title, and *Remove* empties *Time* again but not the typed title. In the step, ⇅ swaps *Von* and *Nach* and the
  results follow; *Later ›* adds later connections. ‹ leaves the step with nothing taken.
* **E2E-M29-16** `local` (FR-29.18) — **specified** (`planner/connections.spec.ts`, the timetable stubbed, the
  position planted through the browser context's geolocation): *📍 My location* sets *Von* to the nearest stop with
  its distance and offers three nearby stops, the nearest pressed; each result opens with *„🚶 3 min · leave at
  08:03"*, and the connection written begins with the walk from *My location*. With the permission refused the step
  says so and *Von* keeps what it held.
* **E2E-M29-17** `local` (FR-29.18) — **specified** (`planner/connections.spec.ts`, the timetable stubbed, tiles
  off): a connection taken from the search shows the small map (`connection-map`) with a line per leg; *⤢ Map*
  opens the full map with a row per leg, and ‹ returns to the form. Written, the plan's line offers *Map ›*
  (`m29-map-<key>`), which opens the same map. A connection entered by hand has neither map nor *Map ›*.
* **E2E-M29-18** `local` (FR-29.18) — **specified** (`planner/connections.spec.ts`): with the search turned off by
  the instance, the step offers no search and shows *SBB link* and *By hand* as its two large rows; an SBB link
  pasted there is read and taken into the form as a card. E2E-M29-05…08 reach the link and the hand fields through
  *Not there?* and the ＋'s one form — no segments.
