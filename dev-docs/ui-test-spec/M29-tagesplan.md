# M29 — Tagesplan (a trip's day plan, FR-29.14/29.15)

* **E2E-M29-01** `local` (FR-29.7/29.15) — **implemented** (`planner/dayplan.spec.ts`): a trip with only an end date has
  no *Day plan* pill; one with both has, and its strip lists every day with the first one chosen and *day 1 of 4* over
  the timeline. *Arrival* stands on the first day, *Departure* on the last, and a day between says *Nothing planned
  yet.*
* **E2E-M29-02** `local` (FR-29.15) — **implemented** (`planner/dayplan.spec.ts`): an entry written through the ＋ with
  a note and a time stands on the chosen day above the untimed arrival; a tap opens it to change its time, which the
  line follows; deleting it asks first and takes the line away.
* **E2E-M29-03** `local` (FR-29.14/29.15) — **implemented** (`planner/dayplan.spec.ts`): a shortlisted idea's card says
  *not planned yet*; a day chosen in its detail, and a time typed as *1430* and kept as *14:30*, change the card and put
  the idea on that day of the plan at that time. The pool bar names the one still without a day; its sheet plans it on
  another day with a chip and says every idea has a day, and the bar is gone. The idea's line opens it, *Done* set
  there is counted on M28, and its line on the plan is struck through (UX-09: no tick of its own on M29).
* **E2E-M29-04** `local` (FR-29.15) — **implemented** (`planner/dayplan.spec.ts`): an excursion with two days stands on
  both — *Excursion · Start* on the first, *Excursion · Return* on the last — and a tap opens its list on M27. The line
  comes from the packing side through `lib/dayPlanSources.ts`, so the case also proves `App.vue`'s binding (it went red
  with the binding removed). A task due on a day is the same source's (`dayPlanSource.spec.ts`: the line, its tick by
  the live row).
* **E2E-M29-05** `local` (FR-29.18) — **implemented** (`planner/connections.spec.ts`): an SBB link pasted into the
  link step is read without a button — *✓ 5 legs read.*, the five legs in the read-only card with the walk's 🚶 —
  and *Take* stays off until it is read. Taken, the entry is named *To Bern, Cäcilienstrasse* and says it moves to the
  link's day, two days after the chosen one. Written, the plan moves to that day, where the line stands at 10:58 as
  a *Connection* carrying *Samedan → Bern, Cäcilienstrasse · arr. 15:46 · RE 3, IC 3, IC 1, T 6 · 3 changes*; ▸ opens
  its five legs and the link to the app, and closes them again. The reader itself, against a real shared link, is
  `planner/domain/__tests__/connections.spec.ts`.
* **E2E-M29-06** `local` (FR-29.15/29.18) — **implemented** (`planner/connections.spec.ts`): an entry whose link
  names a day the trip does not have is written and listed *Outside the trip*; a tap opens *Edit entry* with its
  connection's card and five legs, and deleting it there empties the list.
* **E2E-M29-07** `local` (FR-29.18) — **implemented** (`planner/connections.spec.ts`): a link no reader knows says *I
  can't read this link – please enter it by hand.*, keeps *Take* off and offers *By hand* with the link kept beside
  the fields; *Take* stays off until they hold both stops and both times. An arrival before the departure reads
  *Olbia → Civitavecchia · arr. 06:45 (+1) · Fähre · direct* on the chosen day, and the kept link opens from its legs.
  Opened again, *Change* → *By hand* holds its leg, and a changed arrival reaches the line.
* **E2E-M29-08** `local` (FR-29.18) — **implemented** (`planner/connections.spec.ts`, Chromium only — WebKit grants a
  test no clipboard): the link step's clipboard button puts the clipboard's link in the field and reads it.
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
* **E2E-M29-11** `local` (FR-29.7, FR-29.15) — **implemented** (`planner/opening.spec.ts`): during a trip, M1's *Heute*
  card lists three of today's four lines and says *„+ 1 more · day plan"*, each entry for Sia saying *for Sia* as on M29
  (FR-29.15); a trip ahead has no card; the idea's line on the card ends in nothing but its own button (UX-09), and
  the link opens M29 on today with the idea's line there. Which lines are still to come at a time of day is
  `linesAhead` in `planner/domain/__tests__/dayPlan.spec.ts`.
* **E2E-M29-13** `local` (FR-29.13/29.15/29.18) — **implemented** (`planner/bridge.spec.ts`): a shortlisted idea
  planned on a day and made into an excursion stands on that day as one *Excursion* line naming *💡 Gola Gorropu* —
  the plan holds one line, not two. A connection written by hand on the excursion's own screen (M27) stands
  beside it labelled *Way there · Gola Gorropu*. The merge rule
  (time, the idea's missing line, pool and outside) is `dayPlan.spec.ts`; the server's check of the link is
  `TestApplyMutation_ConnectionExcursion_KeepsItOnTheTripsOwn`.
* **E2E-M29-14** `local` (FR-29.15/29.18) — **implemented** (`planner/connections.spec.ts`, on a touch screen, the
  timetable stubbed): an entry written through the ＋ without a connection — title and *930*, saved as *09:30* — is
  opened again and gains one: *Add train connection* opens the step headed *For “Glasi Hergiswil”*, *From* and *To*
  typed and left list results with no button, and a tap brings the connection's card back to the form, the title and
  *09:30* untouched and marked as filled by nothing. Saved, the line becomes a *Connection*, keeps title and time, and
  carries *Luzern → Hergiswil Matt · arr. 08:31 · S 4 · direct*. Opened once more, *Remove* takes the connection off,
  the add row returns, and *Save* leaves the entry alone on its line. Every button is tapped: a sheet that shrank
  under the finger would take the click that follows on its backdrop.
* **E2E-M29-15** `local` (FR-29.15/29.18) — **implemented** (`planner/connections.spec.ts`, the timetable stubbed by
  time): on a new entry the step is *For “New entry”*; six connections come, *Later ›* adds the next two, ⇅ swaps the
  stops and the one connection back comes, ⇅ again brings the six; ‹ goes back with nothing taken. A connection then
  taken fills *What* with *To Hergiswil Matt* (*from the connection*, `day-entry-filled`) and *Time* with *08:36*
  (`day-entry-time-filled`); typing into *What* drops its label and keeps the typed title, and *Remove* empties *Time*
  again but not the title.
* **E2E-M29-16** `local` (FR-29.18) — **implemented** (`planner/connections.spec.ts`, the timetable stubbed, the
  position planted through the browser context): *My location* asks the timetable for the stops near the planted
  position, sets *From* to the nearest with *180 m from you*, offers three, that one pressed and the next *Luzern,
  Schwanenplatz · 320 m*; each result opens with *🚶 3 min · leave at 08:03*, and the connection taken begins with the
  walk *My location → Luzern, Bahnhof* at 08:03. A refused position says *Without your location this won't work –
  enter the stop.* and leaves *From* as it was — a test of its own without the id (Chromium only: WebKit leaves an
  ungranted position unanswered).
* **E2E-M29-17** `local` (FR-29.18) — **implemented** (`planner/connections.spec.ts`, the timetable and the tiles
  stubbed): a connection from the timetable shows the small map with one train line; *⤢ Map* opens the full map with
  that line, the legend *Train* and the leg beneath, and ‹ closes it. Written, the plan's line opens the same map by
  *Map ›*. A connection entered by hand has neither the small map nor *Map ›*.
* **E2E-M29-18** `local` (FR-29.18) — **implemented** (`planner/connections.spec.ts`): offline, the add row says
  *Paste an SBB link or enter it by hand*, the step offers no search and shows *SBB link* and *By hand* as its two
  large rows under the reason, and a way by hand is taken into the entry. E2E-M29-05…08 reach the link and the hand
  fields through *Not there?* and the ＋'s one form. Local Mode keeps the search on at start (it has no instance to
  turn it off), so the instance's switch is `TestInstanceConfig_TimetableOnUnlessTurnedOff_FR29_18`'s and
  `lib/__tests__/timetable.spec.ts`'s.
* **E2E-M29-19** `local` (FR-29.15, FR-31.3) — **implemented** (`planner/dayplan.spec.ts`): on a trip of three, a new
  entry's *For whom* has *Everybody* chosen; tapping *Sia* names her alone and the line says *for Sia*, while an entry
  nobody narrowed says nothing. Reopened, the sheet has *Sia* chosen; *Everybody* saved takes the words off. An
  excursion narrowed to Sia on M27 says *for Sia* on its day. E2E-M29-02's trip of one shows no *For whom* row. The
  chip rule is `lib/__tests__/whoGoes.spec.ts`'s, whom a line names `domain/__tests__/dayPlan.spec.ts`'s, the rows a
  save writes and a delete takes `planner/__tests__/sync.spec.ts`'s, and the server's cascade and scope
  `TestApplyMutation_DayEntryTraveler*`.
* **E2E-M29-20** `local` (FR-29.15) — **implemented** (`planner/dayplan.spec.ts`): on a trip of three in Local Mode the
  *For* chips start on *Everybody*; Sia chosen leaves out Leonardo's entry and the excursion only Andy goes on and says
  *2 lines for others*, Leonardo added brings his entry back, and a new entry's *For whom* starts on the two. The
  choice outlives a reload; *Show all* is everybody again. Which lines concern whom — a task by its assignee's account,
  a way by its excursion — is `concerns`' in `domain/__tests__/dayPlan.spec.ts`, the first visit on my own traveller
  `openingFilter`'s, the remembered choice `planner/__tests__/dayPlanFilter.spec.ts`'s.
* **E2E-M29-21** `local` (FR-21.24) — **implemented** (`planner/dayplan.spec.ts`): with the second day chosen, the ＋
  opens the entry sheet titled *„New on …"*, and the ＋ is named with exactly that title; with the last day chosen it no
  longer is. M29 keeps its sheet rather than M6's composer.
* **E2E-M29-22** `local` (FR-29.15, UX-09) — **implemented** (`planner/dayplan.spec.ts`, the browser's clock set): on a
  day holding every kind, in German, the time column reads *10:00* (an idea), *mittags* and *abends* (untimed meals),
  *ganztags* (an excursion) and nothing for a task due that day, an untimed entry and the arrival; the cooked meal's
  ring is named *„0 von 2 Zutaten"* and the excursion's *„0 von 1 gepackt"*; the task carries a checkbox named
  *„„Briefkasten leeren" abhaken"*; the idea, the entry and the eaten-out meal have their line's button and nothing
  else. The checkbox strikes the task through, and a tap on the meal's ring opens the meal's sheet. The words per kind
  are `dayLineTime`'s in `planner/__tests__/dayLineText.spec.ts`, the ring's names the sources' specs'.
