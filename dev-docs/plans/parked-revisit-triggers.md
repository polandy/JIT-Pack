# Analysis — have the parked items' revisit triggers fired?

Read at `origin/main` **`27fbae5f`** (2026-11-07).

## Question

The owner asked (translated): *"Has any of the revisit triggers of the parked items in `dev-docs/backlog.md` fired?"*

## Answer

**No.** None of the four parked items has a trigger that observably fired: there is no second household, no
request for protected templates, and nobody picked up a North-Star cluster or the calendar feed. But only one of
the four stubs carries a trigger that could fire on evidence: §3.26 and the North-Star phases have none, and
FR-27.8's is a milestone that passed before the owner parked it again.

## Evidence

The parked list is `dev-docs/backlog.md:8-11`. It claims *"Each carries a revisit trigger in its stub"*. Each
item in turn:

| Parked item | Trigger in its stub | Fired? |
|---|---|---|
| FR-1.6 publish/fork ownership model | *"the instance grows beyond one household, or someone wants templates the rest must not edit"* | **No** |
| §3.26 calendar feed | none, only open questions | **n/a**, no trigger written |
| North-Star phases beyond §3.29 | none beyond *"graduate … only when picked up"* | **No**, nothing picked up |
| FR-27.8 per-trip usage history | *"parked until after the MVP packing loop"* | **Met on its wording**, re-parked |

### FR-1.6: the ownership model

- Trigger: `dev-docs/prd-addendum/3.1-template-master-data-management.md:15-18`.
- No sign of a second household. The deployment the repo ships is *"a household stack with Pocket ID"*
  (`e9af3393`, #666). The North-Star's own collaboration rule says the same thing: *"Revisit only if extended
  family / multiple households become a real use case"* (`dev-docs/Vision_NorthStar_v1.0.md:45-48`).
- Nobody asked for protected templates. `TODO.md` is empty (`TODO.md:5`), the repository has no issues, and no
  PR or commit title on `origin/main` mentions ownership, publishing or forking a template.
- The one rule that leans on this trigger, the instance-wide unique template name
  (`3.1-template-master-data-management.md:19-21`, its trigger at `:57`), only waits for it.

### §3.26: the calendar feed

- The stub is `dev-docs/prd-addendum/3.26-calendar-reminders.md:3-6`, *"Status: proposed — not yet implemented"*,
  with four open questions (`:33-35`). **It has no revisit trigger**, so `backlog.md:11` is wrong for this item.
- Nothing has been built for it. No commit on `origin/main` touches `webcal`, `.ics` or a calendar feed. The
  commits that match "calendar" are the date picker (`1cd577e0`, `6c1e8060`).
- What the stub depends on has moved on, though. FR-26.2(b) wants *"preparation todos that carry a due date"*
  (`3.26-calendar-reminders.md:16-18`), and those now exist with reminder times and lead days: FR-7.18
  (ADR-105, `1f5fa91c`), FR-13.4 (ADR-106, `ad0462eb`), ADR-108. This makes the feed *cheaper* to build. That is
  not a trigger.

### The North-Star phases beyond §3.29's planner

- The vision lists the phases as *"a future PRD-Addendum candidate, not a commitment"*
  (`dev-docs/Vision_NorthStar_v1.0.md:75`). The addendum says clusters *"graduate into numbered sections only
  when picked up"* (`dev-docs/prd-addendum/README.md:11-14`). **This trigger is the owner's choice. Nothing in
  the repo can show it firing.**
- §3.29 has taken in more of the vision than its first slice: link preview, pictures, GPX tracks, live location,
  routes, a day plan with connections, the bridge to packing, preparations and links
  (`dev-docs/prd-addendum/3.29-planner.md:3-8`). §3.31 excursions and §3.33 the meal plan added more.
- What is still outside it, by its own words: *"polls with several options, expenses, group logistics, a map
  of places …, weather, transport beyond a day's connections, ideas belonging to no trip"*
  (`3.29-planner.md:450-452`). These are the Vision's remaining clusters (`Vision_NorthStar_v1.0.md:94-109`).
  `TODO.md` names none of them, and no PR started one.

### FR-27.8: per-trip usage history

- The stub: *"needs the trip-side query surface, parked until after the MVP packing loop"*
  (`dev-docs/prd-addendum/3.27-template-composition-trip-template.md:209-211`), and again at `:229-230`.
- **The MVP packing loop is built:** every track is merged and only the owner's M14 look is still owed
  (`dev-docs/mvp-plan.md:3-9`). The trip-side query it waited for exists too. FR-27.9 already
  aggregates rows across trips on the device through `trip_items.source_item_id` (`3.27-…:218-220`), and FR-14.3
  reads the full trip history (`dev-docs/prd-addendum/3.14-historical-quantity-insights.md`). Read literally,
  the condition holds.
- **But the owner parked it again after that point.** `e789823e` (2026-10-02, #660) lists it under *"Parked,
  specified, do not start"*, and the current text still does (`backlog.md:10`). The MVP tracks were all merged
  by then. So the parking is a standing decision now, and the old milestone no longer gates it.
  Reading the milestone as fired would overrule the owner, so this analysis does not.

## Follow-ups

None of these is started here. Each is a spec edit for the owner to approve:

1. **Give §3.26 a trigger**, or correct `backlog.md:11`. The trigger should be observable, for example *"a
   household member misses a task's reminder because the push did not reach them, or asks to see trips in
   their calendar"*.
2. **Replace FR-27.8's stale trigger** (`3.27-…:211`) with an observable one, for example *"someone asks which
   trips an item went on, or M10's comment history (FR-27.9) is used to answer that question"*.
3. **Name the North-Star trigger in `backlog.md`** as *"the owner picks a cluster up"*. Then the line reads as a
   standing choice and not as a condition someone could check.
