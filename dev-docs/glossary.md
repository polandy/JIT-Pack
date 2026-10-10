# Glossary — one word per concept

The project's ubiquitous language: the word each concept goes by in prose, code, i18n keys and spec file names, and
where that concept lives in each layer. A new type, file, i18n prefix or spec section takes its word from here; a
concept that is not here yet gets its line in the PR that introduces it.

**Table names are not renamed.** A table keeps the name it was created with (no migration churn, ADR-018/ADR-067),
so where a table name and the word differ the table is listed here and the code uses the word. **Spelling:** American
`traveler`, because the schema spells it so (`travelers`); prose follows the code.

## The words

| Word | Means | Table | Go | TS type | i18n prefix | Spec |
|---|---|---|---|---|---|---|
| **item** | A thing in the household's inventory, independent of any trip (FR-1.1). Never a row on a trip. | `items` | `TableItems` | `MasterItem` | `items.*` | §3.1, §3.24 · M9, M10 |
| **template** | A reusable set of items a trip is generated from (§3.1, §3.27). | `templates`, `template_items` | `TableTemplates`, `TableTemplateItems` | `Template`, `TemplateItem` | `templates.*`, `templateFromTrip.*` | §3.1, §3.27 · M7, M8, M21 |
| **trip** | One journey with its dates, members, travelers and lists. | `trips` | `TableTrips` | `Trip` | `trips.*` (`trip.*` for one trip's card) | §3.2 · M2, M3, M22 |
| **row** | One line of a trip's packing list: an item (or a free entry) to pack for one traveler or for everyone (§3.5, §3.25). | `trip_items` | `TableTripItems` | `TripItem` | `packing.*`, `row.*` (M5's detail) | §3.5, §3.25 · M4, M5 |
| **generated position** | The ledger entry recording what template generation last produced for one (trip, item, traveler) key — not a row, the memory of one (§3.27). | `trip_generated_positions` | `TableTripGeneratedPositions` | `GeneratedPosition` | — | §3.27 |
| **line** | What any list screen draws as one line, stored or projected: a shopping line, an excursion line, a day-plan line, a task line. Says nothing about storage. | — | — | `ShoppingLine`, `DayPlanLineKind` | per screen | M6, M25, M27, M29 |
| **entry** | A stored line of a module's own list — a row of a module table that is not a packing row. | `shopping_entries`, `day_entries` | `TableShoppingEntries`, `TableDayEntries` | `ShoppingEntry`, `DayEntry` | `shopping.*`, `dayPlan.*` | §3.30, §3.29 · M6, M29 |
| **excursion line** | One line of an excursion's own list, borrowed from a packing row or free (§3.31). | `excursion_items` | `TableExcursionItems` | `ExcursionItem` | `excursions.*` | §3.31 · M27 |
| **task** | Something to be done for a trip, ticked off by a member. Both kinds below are `comments` rows with `is_task = 1`; together they are one list (FR-7.6). | `comments` (`is_task`, `task_state`) | `TableComments` | `TripTask` (the projection over both kinds), `TaskState` | `tasks.*`, `tripTasks.*` | §3.7a · M25, M1, M4 |
| **preparation** (prep task) | A task that belongs to a packing row and keeps it from being done (FR-7.3). | `comments` with `trip_item_id` | — | `PrepTask` | `tasks.*` | §3.7a FR-7.3 · M5 |
| **own task** | A task of the trip itself, with no row (FR-7.4). | `comments` without `trip_item_id` | — | `OwnTask` | `tasks.*` | §3.7a FR-7.4 · M25 |
| **task tag** | The one tag a task may carry, separate from item tags (FR-7.8). | `task_tags` | `TableTaskTags` | `TaskTag` | `tasks.*` | §3.7a FR-7.8 |
| **comment** / **note** | A comment is a non-task `comments` row; a note is a trip-level comment, read and ticked per member (FR-7.9, FR-7.13). | `comments`, `note_acks` | `TableComments`, `TableNoteAcks` | `ItemComment`, `NoteAck` | `notes.*` | §3.7a FR-7.9, FR-7.13 · M26 |
| **member** | An account with access to a trip, with a role (FR-4.5). | `trip_members` | `TableTripMembers` | `TripMember` (the synced row), `TripParticipant` (the member with name and avatar) | `members.*`, `membership.*` | §3.4 · M22 |
| **traveler** | A person the trip packs for — linked to a member or not (a child without an account), FR-2.5. The packing facet calls it *person* on screen. | `travelers` | `TableTravelers` | `Traveler` | `forWhom.*`, `travelerProgress.*`, `facet.person` | §3.2 FR-2.5 · M3, M4 |
| **container** | A bag or box a row is packed into, carried by a traveler (FR-10.1). | `containers` | `TableContainers` | `Container` | `container.*` | §3.10 · M11 |
| **excursion** | A day trip inside a trip with its own list (§3.31). | `excursions` | `TableExcursions` | `Excursion` | `excursions.*` | §3.31 · M27 |
| **idea** | A planner idea: something the trip might do (§3.29). | `ideas` | `TableIdeas` | `Idea` | `ideas.*` | §3.29 · M28 |
| **meal** | One meal of the meal plan, with its ingredients (§3.33). | `meals`, `meal_ingredients` | `TableMeals`, `TableMealIngredients` | `Meal` | `meals.*` | §3.33 · M31 |
| **track** | A GPX route on an idea or an excursion (ADR-085). | `idea_tracks`, `excursion_tracks` | `TableIdeaTracks`, `TableExcursionTracks` | `TrackPoint`, `TrackUpload` | `track.*`, `routeEdit.*` | §3.29, §3.31 |

## Words retired

| Do not write | Write | Why |
|---|---|---|
| todo | task | One concept had both words; „task" is the PRD's and the screen's (*Aufgaben*). Older PRD prose still says „preparation todo" and „trip todo" — read them as *preparation* and *own task*. |
| position (for a packing row) | row | „Position" is kept for the generation ledger alone, where it names the key, not the row. |
| participant | member | A participant was a member with a name attached; it is the same person. |
| line (for a stored module row) | entry | A line is what a screen draws; an entry is what a module stores. |
| item (for a packing row) | row | An item is the inventory's; a row is the trip's. |

## Names that still disagree

The words are decided; these names in the code predate them and are renamed by their own worklist item, not in
passing:

- `TripParticipant` → a member's profile type (the „participant" word).
- `ExcursionItem` → an excursion line type (the „item" word on a trip).
- Go test names that still say `Todo` (`internal/notify/rules_test.go`, `internal/store/store_test.go`,
  `internal/api/notifications_test.go`).
- Test ids that still say `todo` (`trip-todo-*`, `m4-trip-todos*`, `m5-todo-*`, `dashboard-trip-todo*`): renaming them
  touches every e2e spec that reads them, so they go in one sweep of their own.
- The copy of `membership.confirmCollapse` still says „preparation todos" / „Vorbereitungs-Todos" where the screens say
  *tasks* / *Aufgaben* — a copy change, so the owner's.
