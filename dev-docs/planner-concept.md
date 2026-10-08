# Concept — the planner: ideas, votes and a day plan inside a trip

**Status:** **accepted; slice 1a and the CI fast loop built** (2026-09-27) — the board, votes and discussion, as §3.29
FR-29.1–29.15 in the PRD Addendum, M28 in the UI Spec, ADR-078 and ADR-051 amendment 4; the loop as ADR-079. Those are
now authoritative; this file is the reasoning, and where it and they differ, they win. Written 2026-09-26 on the owner's
request; the walk-through settled the points in §2 the same evening, and the navigation was chosen on the rendered
mockup (`UI_Concept_PlannerNav_variants.html` at `6b148419`, built by `build-planner-nav-variants.mjs` at `6b148419`).
It takes the Idea Board draft as its base — §3.29 on the unmerged branch `docs/idea-board-spec` (commit `53130c83`,
2026-09-19) — and adds what the draft left out: the bridge from an idea to the packing side, a fourth state, and the day
plan.

**What building slice 1a changed here.** The screens are **M28 *Ideen*** and **M29 *Tagesplan***, since the
excursions took M27. The discussion is **its own table, `idea_comments`**, not `comments.idea_id` (ADR-078): every
reader of trip-level comments would otherwise have had to exclude it, across the module boundary. The mockup's claim
that seven glyphs fit 360 px did not survive the real pills — six fill 410 px — and the owner chose a row that
scrolls with the current pill in view (ADR-051 amendment 4). §7's trip without dates is decided as recommended.

**Asked for:** JIT-Pack as a trip planner and a coordination planner. The travellers note ideas, attach more
information and pictures, the others comment, a proposal is given a thumbs up or turned down, links can be posted.

**What already stands.** `Vision_NorthStar_v1.0.md` puts packing inside a four-phase trip (Plan → Prepare → During →
After) and names the Idea Board as the first buildable slice of *Plan*. The §3.29 draft specified it: one card type,
hand-set states, votes per account, the reused comment thread, images outside the envelope, a fixed tag set, a
rain-proof mark, no copying on clone, a module boundary. Since that draft, FR-7.9 notes, FR-7.11 due days, the
shopping module (§3.30, ADR-066) and excursions (FR-31, PR #614) have been built or decided — and the last three are
exactly what an idea turns into.

---

## 1. The shape, in one paragraph

An **idea** is a trip-partition row: a title, optionally a note, one link, one tag, a rain-proof mark and up to four
pictures. Every member with an account comments on it and votes 👍 or 👎, **with their name shown**. A person moves
it by hand through **Idee → Shortlist → Gemacht**, or to **Verworfen**; votes never move it. An idea on the
shortlist is **planned on a day, with an optional time**, and can **spawn an excursion, a task or a shopping entry**
— it stays where it is and links to what came of it. During the trip a **day plan** reads everything that has a day:
the planned ideas, the dated excursions, the tasks due, arrival and departure, and free entries such as a table
booking. The planner is a **feature module** (`client/src/planner/`), reached by two more pills in the trip's one
switcher.

## 2. Decisions

| # | Question | Decided | Cost accepted |
|---|---|---|---|
| 1 | Base | The **§3.29 draft** stands where §2 does not amend it: states set by hand, fixed tags, rain-proof mark, links stored and not fetched | The draft's rule „no phase without content gets a tab" is replaced by #10 |
| 2 | Who plans and votes | **Every account on the trip**, any number of them; travellers without an account do not vote | The Vision's „two equal adults" is widened; a vote tally means more with five voters than two, and no rule reads it |
| 3 | Planning before a trip exists | **No** — ideas live inside a trip; no someday list, no trip without a destination | Choosing *where* and *when* stays outside the app |
| 4 | Votes | **Open, with names** — tallies and the voters' avatars | Nobody votes in secret |
| 5 | States | **Four**: *Idee · Shortlist · Gemacht · Verworfen*; *Gemacht* is new against the draft | A planned idea is not done by its date passing; somebody ticks it |
| 6 | An idea becomes an excursion, task or shopping entry | **The idea stays and links** to each result; several results per idea | Two rows name the same plan, and deleting one leaves the other |
| 7 | Planning an idea | **A day, the time optional**; without a day it waits in *noch nicht eingeplant* | A time without a duration: the plan orders, it does not block out hours |
| 8 | Scope beyond the board | **The day plan**; polls, expenses and group logistics are not in this concept | Picking one of several options is still done with one idea per option |
| 9 | What the day plan reads | Planned ideas, **dated excursions**, **tasks due that day**, **arrival and departure**, **free entries** | The day plan writes one table of its own (free entries) and reads four others |
| 10 | Navigation | **Variant B**: two more pills in the one switcher — *💡 Ideen* first, *📅 Tagesplan* last (ADR-051 amendment 3: only the current one in words) | Seven glyphs; the row fills 360 px almost to the edge, so an eighth view does not fit |
| 11 | Where a trip opens | **By date**: before departure the view last visited (on a first visit *Ideen* while the packing list is empty); during the trip *Tagesplan*; afterwards *Packliste* | A trip opens on different screens on different days |
| 12 | Code separation | **A feature module with a hard boundary, and CI runs only the module's e2e cases on a diff that stays inside it** (§5a) | Path-based selection can miss a regression that crosses the boundary at run time; a packing smoke set rides along to catch the obvious one |

## 3. Data model

All new rows live in the **trip partition** (ADR-022: one merge, field-level LWW, cascade with the trip). Schema
change ⇒ `schema.sql` **and** a migration (invariant 2); the number is whatever is next when it is built (PR #614
takes `006`).

**`ideas`** — `id`, `trip_id` (cascade), `title`, `note`, `link` (http/https only, client *and* server), `tag` (the
FR-29.10 key, CHECK), `rain_proof` (0/1), `state` (`idea`/`shortlisted`/`done`/`dropped`, CHECK), `planned_on TEXT
NULL`, `planned_at TEXT NULL` (`HH:MM`), `author_id` (server-stamped, invariant 3), `created_at`, `field_hlcs`,
`updated_hlc`.

* **No CHECK that ties `planned_on` to the trip's dates or `planned_at` to `planned_on`**, for the reason
  `assignee_user_id` has none: field-level LWW merges each field alone, and a constraint that refuses one field
  loses the user's choice. The reader treats a time without a day as no time, and a day outside the trip as
  *außerhalb der Reise* (§4.4).
* **A planned day survives a state change.** Dropping a planned idea keeps `planned_on`; the day plan reads only
  *Shortlist* and *Gemacht*, so it vanishes from the plan and returns with the idea.

**`idea_votes`** — `idea_id` (cascade), `user_id` (server-stamped), `vote` (`up`/`down`/NULL for withdrawn),
`field_hlcs`. One row per (idea, person), for FR-7.9's reason (ADR-073): two people voting at once must not merge
into one field.

**`idea_comments`** — `idea_id` (cascade), `author_id` (server-stamped), `body`, `created_at`. The discussion, in a
table of the planner's own rather than a column on `comments` (ADR-078).

**`idea_images`** — `idea_id` (cascade), `position`, `image_hash`; the bytes move over their own endpoints (ADR-002),
≤ 500 KB JPEG scaled by the client, the limit held at handler, store and CHECK (draft FR-29.5).

**The links (decision #6) are a nullable `idea_id` on the row that came of it**, never a list on the idea:

| Result | Column | Why there |
|---|---|---|
| Task | `comments.idea_id`, `is_task = 1` | A task **is** a comment row already (FR-7.4), and M25 names its origin *Aus Idee …* as it names *Aus Packliste* |
| Excursion | `excursions.idea_id` | Beside `source_template_id` (FR-31) — the group it was packed from, the idea it was planned from |
| Shopping entry | `shopping_entries.idea_id` | The module's own table (§3.30) |

* **A column on the result, not a list on the idea**, because a list on the idea is one field merged whole: two
  people making a task and an excursion from the same idea at once would lose one link. The idea's *Daraus gemacht*
  is a read over the three tables.
* **`ON DELETE SET NULL`** on every link: deleting an idea leaves its excursion, task and shopping entry standing,
  now without an origin (decision #6's cost). Deleting the result simply drops the link.

**`day_entries`** — the day plan's own entries (decision #9): `id`, `trip_id` (cascade), `kind` (`note`/`connection`,
CHECK), `on_date`, `at_time NULL`, `title`, `note`, `link NULL`, `legs NULL`, `author_id` (server-stamped),
`field_hlcs`, `updated_hlc`. A connection (FR-29.18) keeps its legs as one JSON field — each leg `from`, `to`, `dep`,
`arr` (local `YYYY-MM-DDTHH:MM`, so a night train arrives on its own day), `line` (empty for a walk) — written whole
by one person and never merged leg by leg; `at_time` is its first departure, so one ordering serves every kind. Its own
table rather than an idea in a hidden
state, because a table booking is not a proposal: it has no votes, no thread and no state, and an idea row carrying
all of those unused would be asked about them on every screen.

**Not stored:** arrival and departure (read from `trips.start_date`/`end_date`), what is *new for me* (derived, as
FR-7.9), the vote tally.

## 4. Behaviour

### 4.1 The board (draft FR-29.6, amended)

Four segments with counts — *Ideen · Shortlist · Gemacht · Verworfen* — a tag-chip row filtering the current
segment (plus ☂ for rain-proof), cards ordered by vote score or newest, a „+ Idee" action. A card shows a picture
tile when it has one, the tag, ☂, the link's domain, both tallies with the voters' avatars and the comment count.
On *Shortlist* a card also shows its day and its results (`📅 Di 14.7. · 🪧 Ausflug · ☑ Guide buchen`) or
*noch nicht eingeplant*.

### 4.2 One idea (the detail sheet)

Pictures, title with author and date, the link as a card, the four-state control, the vote buttons with names, the
day and time, *Daraus gemacht* with one chip per result and a dashed chip per result not yet made, the thread and
its composer. Delete is a confirmed action at the foot, taking comments, votes and pictures with it and leaving the
results (§3).

### 4.3 From an idea to the packing side (decision #6)

Each dashed chip opens the existing creator, **pre-filled**, never a new one:

* **🪧 Ausflug** — FR-31's *Neuer Ausflug* sheet with the idea's title as the name and its planned day as the date;
  the group picker is where the gear comes from. The written excursion carries `idea_id`.
* **☑ Aufgabe** — M25's composer with a suggested title (*„… buchen"*, editable) and the idea's day minus one as the
  due day (FR-7.11), so the morning reminder comes before, not on, the day.
* **＋ Einkauf** — M6's composer on *Vor Ort* with the idea's title.

Undo on the snackbar takes the result back; the idea is untouched either way.

### 4.4 The day plan

One screen per trip. A **day strip** across the trip's dates, today selected during the trip and the first day
before it; a **timeline** for the chosen day, timed entries first by time, untimed after, each with its kind as a
coloured edge and label: 🪧 excursion (its rucksack progress, opens M27), 💡 idea (checkable: the tick sets
*Gemacht*), ☑ task (checkable, as on M25), ✎ free entry, 🚗 arrival/departure. **Tomorrow** below today, folded
after one entry. A **pool bar** — *n Ideen auf der Shortlist noch ohne Tag* — opens a sheet to plan them by drag or
by day chip. „+" adds a free entry on the chosen day, or plans an idea.

* **A multi-day excursion** stands on each of its days; the first day says *Start*, the last *Rückkehr*.
* **An idea planned outside the trip's dates** (the dates moved) is listed under *außerhalb der Reise* at the end of
  the strip rather than lost.

### 4.5 Notifications (draft FR-29.8, amended)

Three kinds, per-kind preferences, the recipient's language (ADR-037), never to the actor: *added an idea* and *moved
an idea to the shortlist* to every co-traveller, *commented on an idea* to its participants only — its author and its
commenters, FR-7.13's reply rule. One notification per idea, never bundled. Votes do not notify — five people voting
on ten ideas is fifty pushes. The task a planned idea spawned brings FR-7.11's morning reminder with it, which is the
day plan's only reminder.

### 4.6 Navigation (decision #10, #11)

`TRIP_VIEW_IDS` grows `ideas` in front and `dayplan` at the end, both pills (`TRIP_VIEW_PILLS`). Glyphs: 💡 stands for
`bulbOutline`, 📅 for `calendarOutline`. The opening rule is one pure function over the trip's dates, status and
packed rows — the same *under way* test FR-7.14 uses — and the device's last view.

### 4.7 The three modes (invariant 5)

* **Server:** everything.
* **Single-User:** one account — votes, the vote order, author lines and the three notifications are **hidden per
  G-8**; the board is a personal list of plans, the day plan works whole.
* **Local:** as Single-User, no `user_id` is written; pictures live in IndexedDB beside the item images.

### 4.8 Clone and backup

Cloning copies no ideas, votes, idea comments, pictures or free entries (draft FR-29.11); a clone repeats a packing
effort. **Not in the portable backup**, like tasks, notes, shopping entries and excursions (NFR-4.11).

## 5. UI surfaces

| Surface | Change |
|---|---|
| G-9 switcher | Two pills, *Ideen* first and *Tagesplan* last; E2E-G12-07 proves seven at 360 px |
| **M28 *Ideen*** (new) | The board, the add sheet, the detail sheet (pane on a wide window, ADR-064) |
| **M29 *Tagesplan*** (new) | Day strip, timeline, pool sheet, free-entry sheet |
| M25 *Aufgaben* | A task from an idea names it: *Aus Idee „…"* |
| M27 *Ausflüge* | An excursion from an idea names it under its title |
| M6 *Einkaufen* | An entry from an idea names it |
| M1 dashboard | The notes card's pattern for ideas: *neu von anderen* (derived); during the trip *Heute* with the next entry |
| Dev seed | Sardinien's ideas, votes, a planned day and a free entry (standing rule: new features extend the seed) |

## 5a. Module boundary and a fast CI loop (decision #12)

**Asked for:** the planner cleanly separated from the rest of the code, so that CI gives fast feedback. The boundary
is what makes the fast loop sound: if nothing outside the module can reach into it, a diff that stays inside it
cannot break anything outside it at compile time, and the packing suite has nothing new to say about it.

**What exists (checked 2026-09-26).** `scripts/module-boundary-gate.mjs` already holds both directions for `shopping`
and already names the planner in its header; `MODULES` is the one list. CI knows one kind of path selection only:
the `changes` job's `markdown_only`, which skips `e2e`, `e2e-single`, `e2e-server` and `visual`. Every code diff
runs the full ten-leg e2e matrix, including a diff that touches only `client/src/shopping/`.

### Where the planner's code lives

| Layer | Place | Boundary |
|---|---|---|
| Client code | `client/src/planner/` — store, actions, M28, M29, its sheets, `index.ts` as the public face | `MODULES += 'planner'` in the gate: the module reaches only the kernel; only `App.vue`, the router (lazy page) and the dev seed reach it |
| Pure rules | `client/src/planner/domain/` — the day-plan merge, the opening rule, the results read | Also under `domain-purity-gate.mjs` (no Vue, no Pinia, no Ionic), so they stay Local-Mode-safe and unit-testable (invariant 4) |
| Unit specs | `client/src/planner/**/__tests__/` | `npx vitest run src/planner` runs the module alone, in seconds |
| E2E cases | `client/e2e/planner/`, case ids `E2E-M28-*`, `E2E-M29-*` | Only planner screens; helpers from `client/e2e/helpers/` (the shared ones, `e2e-helpers-gate.mjs`) |
| Go | `internal/store/planner.go` (table names, stamping list), `internal/api/planner.go` (image endpoints, the three notification kinds), each with its `_test.go` | No new package: invariant 1 keeps `database/sql` in `store`, and the generic sync carries the rows. Planner Go stays in its own files so a diff says which feature it is |
| Kernel contracts | the switcher's entries (`lib/tripViews.ts`), `sync/featureModule.ts` routing, a *results* contract so M25/M27/M6 can name an idea without importing the planner | Touched once, in slice 1; a later change to them is a kernel change and runs everything |

**How the packing side names an idea without importing the planner.** M25, M27 and M6 show *Aus Idee „…"*. They
read the title through a kernel lookup (`lib/ideaTitles.ts`: `(ideaId) => string | undefined`), which `App.vue`
binds to the planner's store, in the same way `kernel/shoppingSources.ts` binds the shopping module to packing rows.
Without the planner, the lookup returns nothing and the line is simply absent.

### The fast loop in CI

The `changes` job gains a second output, **`module_only`**: the name of the one feature module a diff stays inside,
or empty. A diff is *inside `planner`* when every changed path matches one of:

```
client/src/planner/**    client/e2e/planner/**    internal/store/planner*.go    internal/api/planner*.go
*.md (anywhere)          dev-docs/**
```

and **nothing else** — `schema.sql`, `migrations/`, `wire.go`, `App.vue`, the router, `lib/`, `sync/`, `package.json`,
the lockfile and `ci.yml` all make it a full run. The same rule, with the same shape, is given to `shopping` now,
which is where it proves itself before the planner exists.

| Job | Full diff | Planner-only diff |
|---|---|---|
| `go`, `go-lint`, `format`, `client`, `docker-build` | run | run unchanged (required checks; fast; the client job's vitest is the whole suite, a few minutes) |
| `e2e` ×10 | run | **one leg**: `client/e2e/planner/` plus a **packing smoke set** (`global-nav.spec.ts` and the packing list's first cases, tagged `@smoke`) |
| `e2e-single`, `e2e-server` | run | run the planner's backend-backed cases only (`--grep @planner`), since votes and names need a second identity |
| `visual` | run | runs the planner's baselines only (`VIS-M28-*`, `VIS-M29-*`) |

**Why a smoke set rides along.** The boundary is a compile-time fact. At run time the planner still shares the
orchestrator, IndexedDB and the sync feed with packing: a planner store that throws inside the feature-module routing
callback would stall every row. The smoke set costs about a minute and catches that class of fault; anything finer
is what the full run on `push` to `main` is for.

**Locally**, `make e2e-module M=planner` runs the same selection as the CI leg, and `make ci` stays as it is.

**What the fast loop does not buy.** Slice 1 and slice 2 each touch the schema, `wire.go`, the switcher and
`App.vue`, so **both run the full suite**. The fast loop pays off afterwards: the iterating PRs on the board, the day
plan and their polish — the bulk of the work — stay inside the module.

## 6. The ADRs owed

* **Where the planner is reached** — the three variants of the mockup, B chosen; an amendment to ADR-051 rather than
  a new record, since it is that record's switcher.
* **An idea's results are a column on the result** — against a list on the idea and against a join table; the
  field-level-merge argument of §3.
* **CI selects e2e by module** (§5a) — a full run on every diff, against a module-only run with a smoke set, against
  test-impact analysis from an import graph; the smoke set is the cost of not knowing run-time coupling. *Written as
  ADR-079 and built 2026-09-27.*
* **The draft's image limit** (500 KB, four per idea) stands beside invariant 6's 150 KB — recorded in the ADR-002
  line, not a new one.

## 7. Still open

* ~~**A trip without dates.**~~ **Decided (owner, 2026-09-27) as recommended:** the *Tagesplan* pill is **hidden
  until the trip has both dates**, and an idea can be planned only then.
* **Polls with several options** (*Ferienhaus A, B oder C?*) — decided out of scope (#8); recorded here so the next
  round starts from it.
* **Link preview** — still the later slice with its outbound-fetch ADR; the stored link is its floor.

## 8. Order of work

0. **The fast loop** *(built 2026-09-27, after slice 1a, for `shopping` and `planner` at once; ADR-079)*: `module`
   in the `changes` job, the one-leg e2e selection, `@smoke` and module tags held by the boundary gate,
   `make e2e-module`. `visual` runs in full rather than per module — one job, inside the module leg's time.
1. PR #614 (excursions) merges first — the bridge writes `excursions.idea_id`.
2. **Slice 1a — the board** *(built 2026-09-27; the owner put it before step 0)*: `ideas`, `idea_votes`,
   `idea_comments`, M28 with the four states, votes, discussion, tags and the rain mark, the switcher's *Ideen* pill,
   the dev seed.
3. **Slice 1b onwards — the rest of slice 1:** pictures (`idea_images`), the three link columns and *Daraus gemacht*,
   the three notifications — one PR each.
4. **Slice 2 — the day plan:** `day_entries`, M29, the *Tagesplan* pill, the opening rule, M1's *Heute*.

## 9. Test plan (sketch)

* **Domain (Vitest):** the opening rule over dates/status/packed rows; the day plan's merge of five sources for one
  day, ordering timed before untimed; a multi-day excursion on each day; an idea planned outside the dates; the
  results read for one idea; *Gemacht* from the day plan's tick.
* **Store/API (Go, real SQLite):** the four tables in the trip partition; cascade on trip delete; `SET NULL` on idea
  delete for all three results; the `comments` CHECK; `author_id` and `user_id` stamped; the image limit at three
  layers; migration chain ends where `schema.sql` does.
* **E2E:** add an idea with a link, vote from the second identity (ADR-029), comment, shortlist, plan on a day, make
  an excursion from it → M27 names the idea; the day plan shows the idea, the excursion, a due task and a free entry
  on their day; tick an idea → *Gemacht*; seven pills at 360 px; Single-User hides votes; Local mode.
