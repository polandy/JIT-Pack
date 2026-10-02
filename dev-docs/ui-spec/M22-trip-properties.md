# M22 — Trip Properties (FR-2.7) — *built*

* **Route:** `/trips/:tripId/edit`, back-target `/trips/:tripId` (the ADR-011 contract). Reached from **M2's** row menu
  and hero, *„Reise-Eigenschaften"* (G-12): the trip's properties are M2's, not M4's ⋮.
* **Why a screen and not a sheet** (by decision): the traveller roster is a list with its own add and remove
  affordances, and the M5 grammar would nest a list inside an overlay over a list. The other editors that own a
  roster-like section — M8 with its groups — are screens for the same reason.
* **Elements:** the trip **name** (commits on blur/Enter, the M8 pattern — the header keeps its own static title here,
  unlike M8: this screen is *about* a trip rather than being one, and a bar reading „Samedan 2026" would not say which
  screen it is); **the dates** (one G-17 `DateRangeField`; read-only under G-3's lock), both optional per FR-2.1b and
  never inverted (FR-2.1d), written together when *Fertig* is tapped; the **year** — a picker offering the same span M3
  and the clone form offer, from the one rule all three read (`domain/tripYears.ts`), plus the trip's own year where
  that lies outside the window, so an imported 2014 trip is not silently offered a move. FR-2.1b makes the year the one
  *required* temporal fact and the fact M2 sorts and groups by, so a trip created in the wrong year must not keep it for
  good; FR-2.7's own scope is *name, dates and travellers*, and the year is this document's addition to it, by decision
  (E2E-M22-12). And the **travellers** section — one row per person, rename in place, ＋ to add, ✕ to remove. The
  **series** is not edited here: it is edited on **M16**, whose *detach/attach trips* action is its one writer — as PRD
  FR-2.7's opening paragraph says. Each traveller row also carries an **account picker** (FR-2.5, ADR-058) — *„Kein
  Konto"* or one of the trip's members — in the row's end slot, between the name and the ✕. In the end slot rather than
  on a second line: the roster reads as a list of people, and a line per row would push the fourth traveller off a phone
  screen for a fact that is empty on most rows; the control states itself through its value, so it carries no visible
  label, only an aria one. One sentence under the list says what an account *does* (the person is told when an item is
  assigned to them) and what may be picked (members only), because that is a rule about the trip's notifications rather
  than a property of one person. **The add row carries the same picker**, between the name field and ＋, so a person can
  be added *as* the account they are in one act — on a shared trip the person being added is usually one of the people
  it is already shared with, and a two-step version would hide that behind a control found only afterwards. It offers
  the same names as the row pickers and appears under the same rule, so the two are never out of step; it returns to
  *„Kein Konto"* with the name field, because the next person is a different one far more often than not. What the write
  does with it is FR-2.5's ordering rule, not a screen decision: the traveller is inserted unlinked, FR-27.4's
  per-person rows follow, and the link is written last so the account is not told once per generated row.
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
