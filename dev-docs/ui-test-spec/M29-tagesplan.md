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
