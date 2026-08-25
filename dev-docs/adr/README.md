# Architecture Decision Records

One file per decision, named `ADR-00N_Short_Title.md`, numbered in the order the decision was *taken*. An ADR is never rewritten to say something else — when a later decision overrides it, the old record gets a `Status: Superseded by ADR-00M` line and stays.

## Index

| # | Decision | Status |
|---|---|---|
| [001](ADR-001_v2_Stack_Sync.md) | Stack & sync architecture — Go + embedded SQLite (v2, replacing central PostgreSQL) | Accepted |
| [002](ADR-002_Avatar_Storage.md) | Avatar storage — database BLOB vs. filesystem | Accepted |
| [003](ADR-003_Conflict_Resolution.md) | Conflict resolution strategy | Accepted |
| [004](ADR-004_Auth_Strategy.md) | Authentication strategy | Accepted |
| [005](ADR-005_Push_Notifications.md) | Push notifications | Accepted |
| [006](ADR-006_Client_Framework.md) | Client framework | Accepted |
| [007](ADR-007_Session_Brokering.md) | First-party sessions brokered from the IdP | Accepted |
| [008](ADR-008_Client_Side_Generation.md) | Generation and import run on the client, not the server | Accepted |
| [009](ADR-009_Three_Run_Modes.md) | Three run modes from one artifact | Accepted |
| [010](ADR-010_CSV_Only_Import.md) | Spreadsheet import accepts CSV only, not XLSX | Accepted |
| [011](ADR-011_One_Header_Bar.md) | One header bar whose left slot switches, rather than a global bar plus per-screen headers | Accepted |
| [012](ADR-012_One_Router_Outlet.md) | One router outlet, rather than Ionic's nested `IonTabs` outlet | Accepted |
| [013](ADR-013_Visual_Baselines.md) | Visual baselines render in a digest-pinned container, not on the CI runner | Accepted |
| [014](ADR-014_Item_Tags.md) | An item carries a set of tags in a join table; the category is renamed away, not kept beside it | Accepted |
| [015](ADR-015_Local_Backup_File_Shape.md) | The Local Mode backup is one multi-document YAML file, not one file per trip | Accepted |
| [016](ADR-016_Group_Refresh_Ledger.md) | The group refresh keeps a ledger — for what it wrote, and for what was refused | Accepted |
| [017](ADR-017_Portable_Composition.md) | A portable Ferien-Vorlage carries its groups whole | Accepted |
| [018](ADR-018_No_DDL_Migrations_In_Development.md) | No DDL migrations during the development phase — one always-current `schema.sql` | Accepted |
| [019](ADR-019_App_Shell_Service_Worker.md) | App-shell caching is hand-rolled in the existing worker, not vite-plugin-pwa | Accepted |
| [020](ADR-020_Touch_First_Adding.md) | Touch-first adding — chip rows now (FR-25.13c), inventory browse-sheet as the decided next stage (FR-25.13d) | Accepted |
| [021](ADR-021_Item_Mark_Emoji.md) | One optional emoji per item and template as the packing row's scan aid, from a self-hosted subset — over an icon library, photo-only and an initial tile (§3.28, G-15) | Accepted |
| [022](ADR-022_Per_Field_Clocks.md) | The merge compares each field against its own persisted clock (`field_hlcs` JSON column) — over a side table and over the row-level clock the code had — and rule 2 is the two state pairs §6 names (NFR-4.2a) | Accepted |
| [023](ADR-023_Conflict_Revert_As_New_Mutation.md) | A manual conflict revert is an ordinary mutation with a fresh server HLC — over rewriting the row in place, a client-side re-issue, and leaving the log read-only (NFR-4.2a) | Accepted |
| [024](ADR-024_Portable_Restores_What_It_Saved.md) | A portable file restores what it saved — trip status, item marks and ordered tags in one format — over a backup-only dialect and over honouring them on the restore path alone (FR-18.2–18.5, NFR-4.11) | Accepted |
| [025](ADR-025_One_Importer.md) | One implementation of the portable format: the server's reader *and* writer are deleted and the CLI runs the client's, over porting them to Go behind a shared conformance corpus (ADR-008, FR-18.7) | Accepted |
| [026](ADR-026_Generated_Wire_Contract.md) | The client/server contract is declared once in Go and the client's types are generated from it with a CI gate, over a hand-kept OpenAPI file or a compare-only gate (NFR-4.14) | Accepted |
| [027](ADR-027_Route_Shapes.md) | A route names its scope first, then the resource — the master partition's scope segment is `master` and an export names its format — over a collection-first shape that would exempt the sync channel (NFR-4.14) | Accepted |
| [028](ADR-028_Claims_End_By_Decision.md) | A packing claim ends by decision — taken over by a named person, notified and recorded — over expiring on a clock, or expiring with an announcement, which costs the same and still lets a duration overrule a person (FR-5.7/FR-5.3) | Accepted |
| [029](ADR-029_Mock_IdP_For_Multi_Identity_E2E.md) | The e2e suite gets its second account from a **mock IdP fixture** driven through the app's real login, over running a real Authelia container (a third pinned toolchain plus a provider's configuration surface) or a test-only auth bypass in the shipped binary (UI-Test-Spec §2.3) | Accepted |
| [030](ADR-030_Trip_Identity_On_Import.md) | An imported document is a second copy when the **name** matches (plus the **year**, for a trip), decided in the client and reported per document, over a UNIQUE constraint (which parks the outbox), a `(import)` suffix (which labels duplication rather than preventing it) or a merge. Retires ADR-017's suffix for Ferien-Vorlagen (FR-18.4) | Accepted |
| [033](ADR-033_Trip_Progress_On_The_List.md) | M2 loads the trip partitions of the rows that are **on screen** and says *unknown* until they arrive, over loading every trip's partition on mount (measured 1.1 MB for one archive) or carrying the counts on the trip row (a derived aggregate under LWW) (FR-2.3) | Accepted |

| [031](ADR-031_Refusal_Repairs_The_Row.md) | A refused mutation repairs the row it refused — the server re-logs it so the ordinary pull carries the truth, and the client drops the one row the server cannot re-log without leaking it — over a client-side undo, a second read path for one entity, or a whole-partition resync (Sync-API §5, P-1/P-3) | Accepted |
| [032](ADR-032_Retire_Decided_Twice.md) | FR-24.3's retire-or-remove decision runs **on the server, authoritatively, and on the client, advisorily** — over one rule reached through a new usage endpoint, or one rule on the client with the server merely refusing; and `itemList`/`templateList` keep meaning everything while display surfaces opt in to the active lists (FR-24.3, invariants 4/5) | Accepted |

**Outbound Content Fetching** — `Vision_NorthStar` names this as the gate that must exist before any Plan-phase feature makes the server fetch external content. It had informally reserved number 007, which Session Brokering has since taken; it gets the next free number when it is written.

## When an ADR is owed

Write one when **alternatives were genuinely weighed and one was chosen at a cost** — when a competent person could have decided otherwise and would need to know why we didn't.

Do **not** write one for an additive config field, an endpoint that follows an existing pattern, or a mechanical refactor. An ADR that records a non-decision dilutes the ones that matter; a sentence in the relevant spec is enough there.

The ADR ships in the **same PR** as the code that implements it. An ADR written afterwards is a rationalisation, and one written without code is a plan.

## Claiming a number

The next free number is a shared id that two branches will race for. Take it as late as you can, and **re-check it after merging `main` in** — if another PR claimed it meanwhile, renumber yours (filename, heading, and every reference) before merge.

## Structure

Follow [`TEMPLATE.md`](TEMPLATE.md), which mirrors what ADR-001 through 006 already do:

1. **Decision drivers**, in priority order — what the decision optimises for.
2. **Considered options**, each with honest pros *and* cons. An option with no cons was not considered.
3. **Decision matrix** — the drivers weighted against the options, so the conclusion is reproducible rather than asserted.
4. **Consequences** — what this costs us, not just what it buys.
5. **Revisit trigger** — the concrete, observable condition under which this decision should be re-opened. "If it becomes a problem" is not a trigger; "if item photos need to exceed ~150 KB" is.
