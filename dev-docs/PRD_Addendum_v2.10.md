# PRD Addendum (Consolidated): „JIT-Pack" — Extensions & Clarifications (v2.10)

**Document Status:** Accepted
**Scope:** New functional sections 3.10–3.23 (accepted) plus **3.24 (proposed, item tags & master-item lifecycle)**,
**3.25 (proposed, packing-screen M2/M4/M5/M6/M8 refinements)** and **3.26 (proposed, calendar-reminder iCalendar
subscription — Variant B)**, **3.27 (accepted, template composition)**, **3.28 (proposed, one emoji mark per item)**
and **3.30 (accepted, the shopping list as a module of its own)**, clarifications to existing FRs, and refined/added
NFRs (incl. **NFR-4.12 i18n, accepted**). Numbering continues the base PRD; a retired FR/NFR number keeps a removal
stub and is never reused.
**Forward direction (non-binding):** A north-star expansion of the product beyond packing — into a full family vacation
companion (idea board, scheduling, live during-trip collaboration) — is captured in `Vision_NorthStar_v1.0.md`. It adds
no FRs/NFRs here and does not change any scope below; clusters graduate into numbered sections only when picked up, and
packing ships first.

---

## Part A — New Functional Sections

### 3.10 Luggage Container Management

* **FR-10.1 (Container Entities):** Users can define luggage containers per trip (e.g., "Left Pannier", "Kids'
  Backpack", "Roof Box") with a name, an optional carrier (Traveler), and an optional maximum weight (in grams). ~~a
  *type*~~ — not a field: the name already carries the distinction ("Roof Box" *is* its type), so a second field would
  be a second spelling of the same fact, asked of the user on every container. **Revisit trigger:** something has to
  *reason* about the kind of container — a weight rule per type, an icon per type — rather than merely display it.
* **FR-10.2 (Item-to-Container Assignment):** Every item on an active packing list can optionally be assigned to exactly
  one container. Unassigned items appear in a dedicated "Unassigned" bucket to keep them visible.

  **Several at once (ADR-075).** The bucket selects like the app's other lists: a hold on a row
  (or a right-click, or the app bar's checkbox icon) starts a selection, a tap then picks rows, and the bar's *In
  Gepäckstück …* opens the one container picker once and assigns every selected row to the container chosen. Outside
  the mode a tap still opens the picker for that one row. Only the bucket selects — assigned positions are not rows on
  M11, re-assigning one stays M5's (FR-10.2's other half). Like the single assignment, the batch has no undo: the rows
  leaving the bucket and the card's load are the confirmation, and a wrong bag is one tap in M5 away.
* **FR-10.3 (Weight Budgets & Warnings):** The system displays the live cumulative weight per container and issues a
  visual warning when a container exceeds its maximum weight (e.g., airline baggage limit) or when paired containers
  (e.g., left/right pannier) diverge beyond an imbalance threshold. **Threshold: a fixed 15 % weight difference.**
  ~~configurable per trip~~ — not configurable: the value is the constant `IMBALANCE_THRESHOLD_PERCENT`, and no trip
  attribute overrides it. A percentage field is wanted only by someone who has met a warning they disagree with, and a
  reader kept for a writer that does not exist is what CODING_PRINCIPLES §4a forbids. **Revisit trigger:** the first
  imbalance warning that fires on a pair the owner considers balanced. The warnings themselves are built and covered
  (E2E-M11-02/04).
* **FR-10.4 (Analytics Integration):** Containers serve as the data source for the *Luggage Container* dimension defined
  in FR-8.2.

### 3.11 Return-Trip Mode (Repack) — **REMOVED**

**Status: removed** — the Repack feature is not part of the product, by decision: it is not wanted.
FR-11.1–11.3 are retired; the numbers are kept stable (per this document's removal-stub convention) and must not be
reused. UI-Spec M13 is removed accordingly. The `outbound_packed` column and any repack code/tests are scheduled for
removal as a follow-up code cleanup; until then they are inert dead surface, not a supported feature. FR-11.2's
consumable/BUY_LOCAL exclusion logic and any other reference to repack elsewhere in the specs are void.

* ~~**FR-11.1 (Repack Trigger)**~~ — removed.
* ~~**FR-11.2 (Consumables Exclusion)**~~ — removed.
* ~~**FR-11.3 (Leave-Behind Check)**~~ — removed.

### 3.12 Trip Cloning

* **FR-12.1 (Clone from Archive):** Users can duplicate any archived or completed trip as the basis for a new one. The
  clone includes all manual edits made to the original trip list (respecting the decoupling principle of FR-2.4). Within
  a Trip Series (FR-13.1), the most recent trip of the series is offered as the default clone source.
* **FR-12.2 (Clone Options):** During cloning, the user chooses whether to carry over (a) participant assignments, (b)
  packer delegations, and (c) container assignments. Dates are entered fresh; quantities carry over unchanged (plain
  amounts have nothing to re-derive — FR-1.3/1.5 are retired).

### 3.13 Trip Series & Destination Profiles

* **FR-13.1 (Trip Series):** Trips can be assigned to a named *Trip Series* (e.g., "Samedan Summer", "Samedan Winter").
  A series groups recurring trips to the same destination or of the same type and serves as the anchor for historical
  comparisons (3.14), attribute defaults (FR-15.1), and cloning defaults (FR-12.1). **A series name is unique
  instance-wide** (`trip_series` UNIQUE (name)): a series is the anchor a whole
  household's history hangs on, and two "Samedan Sommer" owned by two accounts would split that history in two while
  looking like one thing on every screen. Same reasoning, and the same accepted offline cost, as FR-1.6's template
  names. **The wizard answers it where the name is typed:** M3's *neue Serie* field checks the typed
  name against the series the device already holds and, when it is taken, names the existing series and blocks the step
  instead of writing a second one. It deliberately does **not** attach the trip to the existing series by itself — the
  select right above the field already offers it, and quietly deciding whose series a trip joins is not the wizard's
  call. M16's rename is refused the same way and the field goes back to the stored name.
* **FR-13.2 (Destination Profiles):** A series can carry a *Destination Profile* with persistent, destination-bound
  data: notes (e.g., "washing machine available"), local conditions, and reusable destination checklists.
* **FR-13.3 (Destination-Bound Shopping Lists):** Recurring BUY_LOCAL lists (e.g., a grocery list for a specific holiday
  location) can be stored on the Destination Profile and are automatically offered when a new trip in that series is
  generated.

### 3.14 Historical Quantity Insights

* **FR-14.1 (Per-Item History):** When generating or editing a trip within a series, the system displays each item's
  packed quantities from previous trips in the same series (e.g., "Underwear — 2024: 5, 2025: 6").
* **FR-14.2 (Smart Quantity Suggestions):** The system proposes a default quantity derived from the series history —
  **decided: the duration-normalized median of the last three series trips** — which the user can accept with a single
  tap or override manually at any time.
* **FR-14.3 (Long-Term Analytics):** Across the full trip history, the system can surface trends: most frequently
  forgotten items (Missing flags per FR-9.1), consistently unused items (Unused flags), and per-series weight
  development over the years.
**The per-series trend heading names the series.** A trip row carries no series name — the name lives on the master
  partition's `trip_series` row, which the trip store cannot reach — so the analytics view resolves it from the trip's
  `series_id` against the master store, and falls back to the trip's own name only when the trip belongs to no series.

### 3.15 Conditional Items & Trip Attributes

* **FR-15.1 (Trip Attributes):** Trips carry structured attributes beyond dates and participants. **Decided model:** a
  small fixed core — *Season* (summer/winter/transitional), *Transport Mode* (car, bike, plane, train), and
  *Accommodation Type* (hotel, holiday flat, camping) — plus user-definable free-form tags, usable in conditional rules
  (FR-15.2). Attributes and tags are defined per trip and inherited as defaults from the Trip Series.
* **FR-15.2 (Conditional Inclusion Rules):** Template items support include/exclude conditions based on trip attributes
  (e.g., "Long underwear: only if season = winter"; "Bike repair kit: only if transport = bike").
* ~~**FR-15.3 (Attributes as Formula Variables)**~~ — void: FR-1.3/1.5 are retired. Attributes remain
  the condition axes of FR-15.1/15.2.

### 3.16 Data Migration & Import

* **FR-16.1 (Spreadsheet Import Wizard):** The system provides a guided import for CSV/XLSX files with the common legacy
  layout: rows = items (with category grouping), columns = trips with quantities. The wizard maps columns to historical
  trips within a series and rows to items in the central item database. **Decided:** the user selects which historical
  trip columns to import (not all-or-nothing), with a "select all" default already checked to keep the common case a
  single click. **The sheet's own layout is read rather than assumed:** the *header block* is every leading row that
  names no item, and within it one row names the trips and another dates them, each chosen over the whole block rather
  than per column so a stray cell cannot become one trip's name. A sheet that writes the year above the name therefore
  yields both facts; a sheet whose only header is the year names its trips by it. **A header row cannot be found by
  having no quantities in it: a year parses as a quantity**, so a row of years and a row of amounts are
  indistinguishable by their cells — the item column's emptiness is what separates them. **The category may equally be a
  column** beside the item name, written only where it changes and carried down, instead of a heading row; both layouts
  are in the wild and neither is a variant of the other, so the mapping step offers a *category column* picker (default
  *None*) alongside the category-row ticks, and a detected category column suppresses the row suggestions — with one
  present, "a row with no quantities" means not a heading but an item nobody ever packed. **One deviation from the
  select-all default above:** a column the header neither names nor dates is *not* preselected, because it can never
  satisfy the mapping's validation and would otherwise hold thirty valid columns hostage until the user found it.
  **Accepted cost:** the header block, the naming row and the dating row are inferred with no manual override — a
  misread leaves one stray row as an item, which the user can only absorb by ticking it as a category row. **Revisit
  trigger:** the first sheet whose header block is read wrong. **A trip column is not required:** a sheet that is a
  *list of things* rather than a matrix of trips is the ordinary way an inventory arrives. The gate is *something to
  import*, plus the two facts a trip cannot be created without on the columns that are ticked. The rule that finds
  category **rows** follows from it: "a row with no quantity in any trip column" is **vacuously true of every row when
  there is no trip column**, so with no trip column the wizard claims no category rows and the ticks are the user's. An
  import that creates no trip **lands on the inventory** rather than on a trip list that would have nothing to show for
  it — the same reasoning as the archived-segment landing (FR-16.2).
* **FR-16.2 (History Preservation):** Imported trips are created as archived trips with their original quantities, so
  Historical Quantity Insights (3.14) work from day one — including up to a decade of pre-existing data. **A tag
  assignment is sent after the item it points at:** `item_tags.item_id` is a foreign key, so a server applying the batch
  in order refuses a link enqueued before its item's insert — and the importing device cannot tell, because it holds
  both optimistically, while Local Mode has no outbox and never sees it. Such an ordering defect shows only by importing
  into a real server and reading it back from a second device. **The trip carries its year (FR-2.1b):** `trips.year` is
  NOT NULL, so a trip without it is `rejected` by the server and reaches no other device, and it is read off the end
  date the mapping already validated rather than asked for a second time. **The wizard lands on the segment where its
  result is:** FR-16.2 always produces *archived* trips while M2 opens on *Active*, so the wizard navigates through the
  `status` route query, as the restore path does (ADR-024), rather than ending on "No active trips". **A date in a
  sheet's header has to be a day that exists:** the engine rolls the 30th of February forward to March rather than
  refusing it, so the header cell goes through the same calendar check the portable document uses (FR-18.4), which is a
  round trip: a date that does not come back unchanged is not a date.
* **FR-16.3 (Deduplication on Import):** The wizard detects near-duplicate item names across imports and existing master
  data and offers merge suggestions before committing. **A name the file itself lists twice is folded without asking:**
  `items` is UNIQUE (name), and the prompt above compares the file against the *inventory* and never against itself, so
  a second row would be refused at the wire and its amounts lost. The repeats become one item keeping the first spelling
  and the first category; a trailing `?` on either occurrence carries (NFR-4.7); and where both rows carry an amount for
  the same trip **the larger wins**, because they describe one packing and adding them would invent luggage. No prompt,
  deliberately: within one file a repeated name is a listing accident, not two things, and the user has no second answer
  to give.

### 3.17 Single-User Mode

Single-User Mode is a declarative flag that changes *authentication* for a genuinely single-person household.
FR-17.6–17.10 and FR-17.12 below are removal stubs (Demo Mode).

**Single-User Mode (permanent use)**

* **FR-17.1 (Mode Toggle):** The instance can run in *Single-User Mode* via a declarative deployment flag (Section 2),
  set at startup and not changeable through the UI. This targets a genuinely single-person household that has no
  interest in operating an OIDC provider. Data is fully persistent, exactly as in normal mode — the only difference is
  authentication.
* **FR-17.2 (Authentication Bypass):** In Single-User Mode, OIDC/OAuth (Section 2) is fully disabled. No login screen is
  shown; the app auto-authenticates every request against one implicit local user, bootstrapped by the application
  itself on first start with a default display name ("Demo User"), freely editable thereafter per FR-17.13. This is a
  local bootstrap, distinct from the OIDC JIT-provisioning of Section 2 — the row is identified by a dedicated
  `is_local_singleuser` marker, not by pattern-matching a reserved string in `oidc_subject`, so a genuine OIDC subject
  can never collide with or be mistaken for it, however the IdP happens to format subject claims.
* **FR-17.3 (Collapsed Multi-User Model):** Multi-user constructs stay in the data model unchanged — trip sharing, roles
  (FR-4.5), and the Traveler/User/Packer separation (FR-2.5/FR-4.2) are not removed, so an instance can be upgraded
  later without a schema migration — but they are inert and hidden in the UI: the implicit user is automatically the
  Owner and Packer of every item and trip. Delegation, presence indicators, and push notifications (FR-6.2) are disabled
  since there is no second party to notify or delegate to.
* **FR-17.4 (Non-Destructive Upgrade Path):** An operator can switch a running instance from Single-User Mode to normal
  OIDC mode without data loss: on first OIDC login, the operator links the newly JIT-provisioned account to the existing
  implicit user (one-time manual confirmation, clearing the `is_local_singleuser` marker and attaching the real
  `oidc_subject`), after which sharing, roles, and notifications become active for that account and any additionally
  invited users.
* **FR-17.5 (Multi-Device Sync Unaffected):** Single-User Mode does not restrict sync to one device. The sole user can
  run the app on multiple devices (e.g., phone and tablet); each installation keeps its own randomly generated HLC
  device id, and the standard pull/push protocol (Sync-API Spec §3) applies completely unchanged — Single-User Mode only
  removes the *second person*, not multi-device use by the one person. No special-casing of the sync or merge layer is
  needed or permitted for this mode.
* **FR-17.11 (Auth Layer Behavior):** In Single-User Mode, the API's authentication middleware is bypassed at the
  deployment level, not per-request: requests need not carry a bearer token, and the server attaches the implicit user's
  id to every request context directly before it reaches trip-membership and permission checks (FR-4.5), which otherwise
  run unmodified. This is a startup-time configuration, never a runtime or per-request toggle, keeping the security
  model simple to audit.
* **FR-17.13 (Editable Profile — Display Name & Picture):** The user may customize how they appear throughout the app
  (the M17 profile row, the "Packed by" avatar, the presence facepile per FR-4.6, etc. — **not** the dashboard
  greeting, which is a time-of-day sentence carrying neither a name nor a picture), editable at any time via Settings
  (M17). The display name is editable in Single-User Mode, the picture wherever there is a server identity (see below):
  * *Display name:* 1–50 printable characters, no leading or trailing whitespace; validated client- and server-side; the
    startup default ("Demo User") is simply the initial value of this same editable field, not a separate concept. The
    rule note is shown only once the field was touched — an untouched default must never open the screen with a standing
    error. The rule admits every name the system itself hands out: the seeded "Demo User", an IdP-sourced name with a
    space, a name with a diacritic. **The IdP's name is sanitised rather than refused:** a name that arrives on the OIDC
    token has nobody to be told about it, so the login path strips control characters, trims the edges and cuts to 50
    *characters* — the rule both other writers of this column apply; a cut at 50 bytes would halve the allowance of a
    Cyrillic or CJK name and could store half a rune — and only where the claim leaves nothing behind does the subject
    stand in.
  * *Profile picture:* the user selects a source photo and positions a circular crop over it (pan/zoom); the client then
    renders the selected region to a **256×256 px square JPEG (quality ≈ 0.8)** on an offscreen canvas and uploads that
    — the user is never asked about resolution, format, or file size. The circular presentation is a CSS mask applied at
    display time (`border-radius: 50%`); the stored asset itself stays a plain square, keeping the format simple and
    avoiding an alpha channel. **Server-side hard limits (defense in depth, enforced independently of client
    behavior):** the upload must be JPEG and ≤ 100 KB, checked at the database layer via a `CHECK` constraint, not by a
    resizing library — non-conforming uploads are rejected outright (client is expected to already conform; no
    server-side re-processing). The avatar is never displayed above ~96×96 CSS pixels anywhere in the UI, so 256 px
    storage comfortably covers even high pixel-density displays without over-provisioning.
  The picture is editable **wherever there is a server identity**, the display name only in Single-User Mode.
  * *Why they differ:* **no identity provider supplies a picture**. Authelia, the reference provider, returns a display
    name and an email and nothing else, so a read-only picture would mean there is never a picture at all and every
    surface falls back to initials — in the only mode a family instance runs in. The display name is genuinely
    IdP-sourced, so it stays read-only under an OIDC session rather than becoming an editable copy of a value the
    provider owns.
  * *Mode-independent below the screen:* the crop, the 256×256 JPEG, the 100 KB `CHECK`, and the `PUT
    /users/{userID}/avatar` route are the same in every mode and `authed(self(…))` — a user can only write their own.
    Which half is editable is one client-side flag.
  * *The screen says which half is which.* The note under the name says that the display name specifically is managed by
    the identity provider, not the whole profile.
  * Local Mode is unaffected: it has no server identity and the section stays a note.

**Not Demo Mode:** `client/src/dev/sampleTrip.ts` seeds one ready-made active trip behind `import.meta.env.DEV`, so it
leaves the production bundle entirely and E2E-G8-02 asserts its absence there. The difference that matters: Demo Mode
would be a *product* surface a user could enter, with its own banner, reset and ephemeral persistence; this is a
development convenience with no user-facing existence. It lands through the FR-18.4 import path rather than a second way
of building a trip.

**Demo Mode — removed**

* ~~**FR-17.6 – FR-17.10, FR-17.12**~~ — removed (Demo Mode: demo toggle, seeded example data, periodic reset, fail-safe
  isolation, reset notice banner, optional access passphrase). No public demo deployment is planned, so neither the
  feature nor its operational surface (reset jobs, seeding, rate limiting per NFR-4.10) is part of the product. The
  numbers are retired and must not be reused.

---

### 3.18 Portable Template & Trip Export/Import

* **FR-18.1 (Human-Readable Format):** Templates (FR-1.2) and individual trip packing lists can be exported to, and
  imported from, a single **YAML** file — deliberately distinct from the full-instance JSON backup (NFR-4.5), which is
  optimized for disaster recovery, not for a person to open and read. A portable export is meant to be opened in a plain
  text editor, understood at a glance, and hand-edited if desired.
* **FR-18.2 (Template Export):** Any template can be exported (every account sees every template — FR-1.6 MVP) as one
  YAML file capturing its items, quantities, assignment types (FR-1.4), conditions (FR-15.2), and per-item defaults. The
  file is environment-agnostic — no user IDs, no owner, no instance-specific identifiers — so it can be shared (e.g.,
  posted in a forum, emailed to a friend) and imported into a completely different JIT-Pack instance. Example shape: The
  document also carries the template's **composition** (FR-27.1) and its positions' **preparation tasks** (FR-27.7),
  *built*. A Ferien-Vorlage's groups travel **whole** under `includes:` — name plus their own positions — rather than as
  bare references, because a reference means nothing on the instance the file lands on, and because the NFR-4.11 backup
  is the only copy of a Local Mode device (ADR-017). Import **links** a group of the same name and **never rewrites**
  it: the file may be older than the group, and since FR-27.4 a group edit reaches every trip that follows it. That rule
  holds for a group's **own document** exactly as for a nested one — a backup carries the same group both ways, so
  anything else would make the result depend on which document the file lists first. A Ferien-Vorlage whose name is
  taken **links to it as well (ADR-030)** rather than landing under an `(import)` suffix — the file people actually
  re-import is their own backup, where a second copy is never what anybody wanted. Structural rules are enforced at the
  file boundary on both parsers — includes only on a Ferien-Vorlage (never on a trip, never on a group: FR-27.1 is two
  levels), and every included group must be named. The document carries the template's **scope** (FR-27.1) beside its
  kind — `kind` says whether the file is a template or a trip, `scope` says whether that template is a Gruppe or a
  Ferien-Vorlage. Without it a group would import back as a Ferien-Vorlage: the same name, the wrong thing. It is
  **omitted on trips**, and a template document that carries none reads back as `template`. An unknown scope is rejected
  rather than defaulted, on both the Go and the client parser. Example shape (quantities are plain integers with no unit
  — FR-1.3/1.5 are retired): ```yaml kind: template schema_version: 1 name: Base Travel scope: template includes: -
  name: Makro Fotografie items: - name: Kamera quantity: 1 tasks: ["Akkus laden"] items: - name: Toothbrush quantity: 1
  assignment: per_person - name: Sunscreen quantity: 2 conditions: season: [summer] ```
  * **Shared, not only saved.** M7's row menu hands the same document to the device's share sheet
    (Web Share with a file) beside the export that saves it — on a phone, passing a Vorlage on to someone running their
    own instance is a message, and a saved file is a detour through the file manager. The file travels as
    `text/plain` named `<name>.yaml.txt`, not as `application/yaml`: Chrome shares only an allowlist of file types, YAML
    is not on it, and a type it refuses makes the action disappear on exactly the platform it is for; M18's picker
    accepts `.txt` already. The entry is **offered only where the browser can share a file** (G-8's stance — Web Share
    with files is a mobile-first API that many desktop browsers lack), and a share that fails for any reason but the
    person's own dismissal saves the file instead and says so. This is **not** FR-1.6's publish/fork model and does not
    fire its revisit trigger: the file leaves the instance exactly as the export's does, and nothing on this
    instance changes owner or visibility.
* **FR-18.3 (Trip Export):** A trip's packing list (active or archived) can be exported the same way: item names,
  quantities, and packed state, with containers and traveler assignments referenced **by name**, not by internal
  database id, since those ids are meaningless on a different instance. The user chooses whether to include current pack
  progress or export a "clean" (unpacked) list. **The FR-27.4 state travels too:** a trip document also carries *how the
  trip follows its groups* — the templates it follows (`follows:`), the generation ledger (`generated:`) and the
  applied-changes log (`applied_changes:`), all three by name like everything else in the format. Without them a
  restored trip keeps its rows and forgets its answers: proposals the user already refused are asked again, and
  positions they deleted come back as fresh offers. A ledger entry names the master item and the traveler it is about
  (its identity), the template that contributed it, and the snapshot generation last produced — the snapshot is what
  separates "the group changed this" from "the user changed this", so it travels even where it differs from the row
  beside it. A single-trip export (M17) carries the sections too where they exist; a group the receiving instance does
  not have simply drops out on import. **Not carried:** these three sections make a *restore* correct, not a
  cross-instance clone — the server's own single-document import endpoints ignore them (unknown fields, FR-18.5).
* **FR-18.4 (Round-Trip Import):** Importing a previously exported file reconstructs it against the local item database
  (FR-1.1), matching items by name and offering the same merge/near-duplicate prompts as FR-16.3 whenever a name is
  ambiguous. **A file may hold more than one document (NFR-4.11):** a Local Mode backup is every trip and template of
  the device, so the importer reads a multi-document YAML file, lists what is in it and imports the documents together —
  a per-item merge prompt fifty times over is not a restore. Matching then happens **per document as it is imported**,
  never once up front: a backup names the same master item in a template and in every trip that uses it, and matching
  against the inventory as it was before the restore would create one copy per mention. A document that cannot be read
  is reported in its place and skipped; the intact ones around it still import, because a restore that gives up on the
  first bad document loses everything behind it. Importing a template creates a new template, shared instance-wide like
  the rest (FR-1.6 MVP); importing a trip creates a new trip in **the status the file carries, and in *planning* when it
  carries none** (ADR-024). Forcing *planning* suits a file one person hands another and is wrong for the only copy of a
  device: a restore would turn a decade of archived history into a decade of plans, taking the FR-3.14 historical
  quantities with it. **The accepted cost is that a *shared* file now carries a status too**, so a trip somebody sends
  you can arrive archived or active; the alternatives (a backup-only document kind, or honouring the status only on the
  restore path) were weighed and rejected in ADR-024, the second because the same file would behave differently
  depending on which button opened it with nothing on screen saying so. A value this build does not know is **dropped
  rather than refused** — the fallback is correct, and losing a whole trip out of a restore to save its lifecycle state
  is the wrong trade; what it must never do is reach the schema's CHECK, where a failed constraint parks the push. This
  remains distinct from the legacy spreadsheet import (FR-16.2), which explicitly creates *archived* historical trips
  regardless of what any file says. **A position carries what its master item is (ADR-024):** its **ordered tags**
  (FR-24.1 — the order *is* `item_tags.position`, so the first name is the primary tag FR-24.2 files it under, and a set
  would carry the same names and lose which one that is) and, on a trip row, the **mark** (FR-28.1) and
  **`from_inventory`**. That last one is what separates the two kinds of trip row: without it a row that came from the
  inventory and one the user typed on the trip are both just a name, and a restore must either invent inventory nobody
  filed or drop inventory they did — and dropping loses a master item that only a trip references, with its mark and its
  tags. A tag is linked **by name** and created only when the device has never heard of it, the identity rule groups
  follow too (`tags.name` is UNIQUE, so a duplicate is impossible rather than untidy). A file without these fields
  restores with no tags, no marks, ad-hoc rows. **A trip that is already here is not imported a second time (ADR-030):**
  a trip's identity across files and devices is its **year and its name**, trimmed and case-folded, and an import that
  finds one adds nothing at all — not the trip, not its rows, not the master items and tags those rows would have needed
  — reporting instead which trip was already there. This is what makes a restore *repeatable*: running the file again is
  exactly what somebody does when they are unsure the first run worked, and it must not build a second copy of every
  trip, silently, with the first still on screen. Every surface that imports says so rather than looking like an import
  that did nothing — M18's restore list marks the document **before** the button is pressed, the commit raises a toast
  counting what it left alone, and FR-18.7's command writes a line per document plus a count, on `--dry-run` too. **The
  accepted cost is that two genuinely different trips of one name in one year cannot both be imported** — the family
  sheet has exactly one such pair — so the second has to be named apart in the file; the alternatives (a UNIQUE
  constraint, which parks the outbox behind a refused mutation; a `(import)` suffix, which labels duplication instead of
  preventing it; a row-level merge, which cannot tell "add what is missing" from "undo what the user deleted") are
  weighed in ADR-030. **The same holds for a Ferien-Vorlage, by its name alone** (ADR-030): treating two Vorlagen of one
  name as two different plans would make every second run of a backup double the Vorlagen and their includes. A group
  links by name (ADR-017) and a re-import says so rather than reporting it as an import; items and tags merge by name
  (FR-16.3). Every name comparison in the format is trimmed and case-folded.
**The FR-27.4 sections are re-keyed, not copied:** every id in them is rebuilt by the restore, so `follows:` resolves
against the templates the same file just created or linked (by the name the document carried, which per ADR-030 resolves
to a Vorlage that is already here), a ledger entry re-derives its id from (trip, master item, traveler), and its row is
found by the same identity rather than by name — a row the user renamed is exactly the case the ledger exists to
survive. A reference this device cannot resolve is **dropped rather than pointed at nothing**: a source with no template
would never propose anything, and a ledger entry keyed on the wrong position would detach one nobody asked to detach.
The applied-changes log is the exception, because its group name is denormalised for precisely this reason — the record
of what a group did outlives the group — and it is replayed with **its own timestamp**, never the restore's. **Fallback,
tested:** a file without these sections restores its rows, and the trip simply starts following its groups afresh; a
malformed entry inside one of the three is skipped rather than failing the document, because the items are the user's
data while these are bookkeeping the refresh can re-derive.
* **FR-18.5 (Format Stability):** Every exported file carries an explicit `schema_version` field. Imports ignore
  unrecognized fields rather than failing outright, so a file exported by an older or newer app version remains
  importable — and the same tolerance applies to an unrecognized *value* of a known field. A row's `mode` and a
  position's `default_mode` are read only when they name one of the three modes — anything else restores as 🧳 *packen*,
  the way `bought_from` and `status` are read only from their own vocabularies. Unchecked, a file could put a value into
  the database that no chip, no facet and no filter matches, on a row the app then renders as procurement. **A trip's
  two dates are read the same way:** `start_date` and `end_date` are taken only when they are a real calendar date in
  `YYYY-MM-DD`, and dropped otherwise — the trip keeps the dateless shape FR-2.1a already allows for. They are the one
  field the database cannot check: the column is plain text, and the duration derived from it computes to nothing over
  nonsense rather than refusing it, so `2024-02-30` would reach every screen that renders a trip's span.
* **FR-18.6 (Distinct from Full Backup):** This format is explicitly not a substitute for the full-instance backup
  (NFR-4.5): it captures exactly one template or one trip's packing list, with no user accounts, sync metadata, or
  conflict history — it exists for sharing and portability, not disaster recovery.
* **FR-18.7 (Import from the Command Line; ADR-025):** The repository ships an `import` command —
  `jitpack import [--server URL] [--token TOKEN] [--dry-run] FILE...` — that sends portable YAML (FR-18.1) into a
  *running* instance. It exists because the file and the browser are not always in the same place: seeding a fresh
  instance, restoring on a headless box, or replaying a hand-edited file are all done from a shell. The binary is
  `jitpack` and `import` is one of its subcommands (ADR-042).
* **FR-18.8 (The Command Line Beyond Import; ADR-042):** Automation reaches JIT-Pack through `jitpack
  COMMAND`, not through per-entity REST endpoints — a command imports the app's own stores and `client/src/domain` rules
  and pushes ordinary sync mutations with an API token (FR-23.7), so what it writes is what the app would have written
  and every device sees it (invariant 4, ADR-025). The second command is **`jitpack traveler add|list --trip TRIP
  [--year YEAR] [--user WHO] [--dry-run] [NAME...]`**, which reads and extends a trip's roster (FR-2.5) — the one part
  of the model the spreadsheet import never produces, and which is otherwise typed on M3 or M22. Three rules
  it carries: **adding is idempotent per trip**, a name already on the roster is reported and left alone, so a run can
  be repeated over a season; **a trip is addressed by id or by name**, and a name that means several trips is refused
  naming their years rather than resolved by picking one (ADR-030's identity rule); and **`--user` records which account
  the person is** by id or display name — the directory carries no address to match on (FR-4.5) — and takes exactly one
  name, because one account is one person. The link is *recorded*, not acted on (see FR-2.5), which is why this says
  „records" and not „links … so that". Removing a traveler is deliberately not offered: it decides what
  happens to the rows that person owns, and that question belongs on the screen that asks it (M22, FR-2.7).
  * **Adding a traveller runs M22's action, not the insert under it.** The mutation is the smaller half of what the
    screen does: a trip that still follows its groups also gets the new person's positions in the same breath (FR-2.7,
    FR-27.4), and a command that composed the insert itself would leave the person on an empty list while the same name
    typed on M22 fills it. `SyncContext` is a spine, not a browser, so `client/cli/context.ts` binds the app's own
    action groups to a collecting sink and the command calls `addTravelerToTrip`. **The general rule this states, for
    every command after it: a command calls the action, never the mutation factory** — the mutation is what a rule ends
    in, not the rule.
  * **It runs the same rules M18 runs, because it runs the same code.** The import rules live once, in
    `client/src/domain/portableImport.ts`, behind an injected environment (the inventory view, the mutation factory, and
    a sink for each write). The app's sink applies optimistically and enqueues into the outbox; the command's sink
    collects and pushes. A CLI import therefore produces the same rows as a restore in the app — tags (FR-24.1), marks
    (FR-28.1), trip status (ADR-024), `from_inventory` and the FR-27.4 refresh state included. **The command is
    therefore a Node program, not part of the server binary**, and the cost of that is written out in ADR-025.
  * **It writes sync mutations, not rows.** This is the requirement, not an implementation note: a write that appends
    nothing to the change log is invisible to every device — the state exists and no screen can reach it. Anything that
    imports must go through the sync feed.
  * **Multi-document is the command's job.** A backup file (NFR-4.11) holds every trip and template of a device; the
    command reads them **in file order**, which is what makes FR-18.4's "matching happens per document as it is
    imported" hold — each document matches against the inventory the ones before it just created.
  * **One failure never costs the documents behind it** (FR-18.4), and every failure is *said*: an unreadable document,
    a document the server refused, a file that is not there, and a server that cannot be reached each report on their
    own line, and the run ends with a count. The exit code is 1 when any document failed and 2 when the invocation
    itself was wrong, so a script can tell "nothing landed" from "some of it did".
  * **`--dry-run`** reads and reports without sending anything — the answer to "would this file import?" for a
    hand-written file, asked before it creates something nobody can see coming. It answers the sharper question too
    (ADR-030): a trip the instance already holds is reported as *already here* on the dry run, so what the file would
    actually add is visible before it is sent.
  * **Running it twice is safe (ADR-030).** A trip the instance already holds is skipped, named on its
    own line, and counted separately in the closing summary — `2 documents: 1 imported, 1 already here, 0 failed` —
    because a command in a script is run again, and an idempotent import is the difference between a re-run and a second
    copy of the data.
  * **Authentication follows the instance's mode** (invariant 5): a Single-User instance authenticates nobody and needs
    no token; a multi-user instance needs `--token` (or `$JITPACK_TOKEN`), sent with every push. `$JITPACK_SERVER`
    supplies the address where the flag is omitted. Local Mode has no server and therefore no CLI import — its restore
    is M18, which is where it belongs.
  * **A write the instance rejects fails the run (all commands).** A push answers 200 and still reports each mutation's
    outcome, so a count of what was *sent* is not a count of what landed — an import whose rows were refused would say
    „imported", and where the trip follows its groups, half a write is a person without their positions. Every command
    names the refused writes (`table/id (reason)`) and exits 1: `import` counts that document as failed, and `traveler`
    says it rather than closing with a count that includes it.
* **FR-18.9 (Tags from the Command Line; ADR-042):** `jitpack tags ACTION` does to the tag axis
  what M9's tag manager (FR-24.10, FR-24.13) and its selection mode (FR-24.9) do: `list [--items]`, `rename TAG NAME`,
  `merge TAG INTO`, `give TAG ITEM... [--no-primary]`, `take TAG ITEM...|--all`, `delete TAG`, `mark TAG EMOJI|--clear`,
  and **`apply PLAN.yaml`**, which runs an ordered list of those steps. It exists because retagging a whole inventory
  onto a new vocabulary is a hundred taps that are better written down, reviewed and run once. Rules it carries:
  * **Every step is the screen's action.** Giving and taking in bulk are
    `giveTagToItems`, `takeTagFromItems` and `undoBulkTag` in the master-data action group, which M9 and the command
    both call. A refusal the manager shows is the refusal here: a rename onto a taken name, a delete of a tag items
    still carry (ADR-063).
  * **A plan is all or nothing.** Every step runs against the pulled stores first, in order, each seeing what the steps
    before it wrote; the first refused step ends the run and nothing is sent. `--dry-run` runs the whole plan and prints
    the axis it would leave behind. A plan describes a *change*, not a target state, so running it a second time
    stops at its first rename or merge — safely, since nothing is sent. „Nothing" is a promise about the plan's own
    refusals; a write the *instance* rejects after sending (another device renamed a tag in the meantime) is named,
    with the instance's reason, and the run exits 1 rather than reporting it sent.
  * **An item named twice in one step is one item** — by name, by id, or both — because a second insert of the same
    pairing is a `UNIQUE (item_id, tag_id)` violation the instance would reject.
  * **Names mean what they mean on screen.** Tags and items are matched ignoring case, or by id. Only active items are
    addressed, because M9's selection never offers a retired one: a name only a retired item holds is refused as such,
    and `take --all` / `items: all` takes the tag from the active items carrying it — what „Alle N" over that tag's
    filter selects. A tag that retired items still carry is therefore not deleted by take-then-delete; the refusal says
    how many of them are retired, and a merge is the way out, as on M9.
  * **Giving files by default**, like the sheet's „Als primären Tag setzen" that opens switched on; `primary: false`
    only adds the tag. Giving a tag that does not exist creates it (FR-24.9's create row).
  * **A mark must be in the picker's index** (FR-28.2): the picker offers nothing else, and the instance's mark font is
    cut to that index (FR-28.6).

### 3.19 Local Mode (Backend-Free Operation)

Local Mode is a **client-only deployment shape**: the app runs entirely from on-device persistence — in the browser or
in the Capacitor shell — with **no JIT-Pack server at all**. It is distinct from, and orthogonal to, Single-User Mode
(3.17): Single-User Mode still runs the full server and sync stack and merely bypasses authentication; Local Mode
removes the server entirely. Everything inherently multi-user or multi-device is unavailable by construction.

* **FR-19.1 (Mode Selection):** On first launch, the client asks the user to choose between *Local Mode* and *Server
  Mode* (entering a server URL). The choice is persisted on the device and is not silently switchable: leaving Local
  Mode goes through the explicit migration path of FR-19.5, never through a toggle that could strand or shadow data —
  **that path starts on the same device (FR-19.8): a guarded three-step move on M17 whose switch cannot
  happen before a backup newer than the last change, and whose data still travels as FR-19.5's file.** Local Mode is
  inherently **single-device** — multi-device use by one person requires a server, even in Single-User Mode (FR-17.5).
* **FR-19.2 (On-Device Persistence):** All data — master items, categories, templates, trips, packing history — persists
  on the device (IndexedDB in browser and Capacitor WebView). Rows are stored in the same shape the sync protocol
  delivers (Sync-API Spec §4), so the store layer loads local data through the identical code path as a server pull.
  Consequence for the write path: in Local Mode the client-side mutation layer is the **sole authority** over row
  contents — every mutation must produce a complete, correct row on its own, with no server-side completion or later
  correction. (In Server Mode the same rows are merely optimistic previews per UI-Spec G-5; this requirement makes them
  trustworthy in both modes.) **Durability is a write that has landed, not one that was issued:** a fire-and-forget save
  lets a reload right after an add cancel the transaction the app has already reported as stored. Writes are serialised,
  and the G-2 glyph reports *syncing* until the write closes and "on this device" only afterwards. That signal is also
  what lets a test wait for the state instead of for a duration.
* **FR-19.3 (Collaboration Inert):** Mirroring FR-17.3, multi-user constructs remain in the data model unchanged but are
  inert and hidden in the UI: no trip sharing, roles, delegation, presence (G-10), collision locking, comments by
  others, or push notifications. The implicit local user is automatically Owner and Packer of every trip and item.
  **Travelers are unaffected:** they are trip-level records, not accounts (FR-2.5), so families with children,
  per-traveler assignment, and per-person quantities work fully in Local Mode.
* **FR-19.4 (Feature Parity):** Everything not inherently multi-user or multi-device behaves identically to Server Mode:
  templates and quantities, conditional items (3.15), trip series and historical insights (3.13/3.14), cloning (3.12),
  analytics (FR-8.x), spreadsheet import (3.16), and portable YAML export/import (3.18). The portable export doubles as
  the Local Mode **backup and transfer** mechanism.
* **FR-19.5 (Migration Path to a Server):** Moving from Local Mode to a server instance is done via portable YAML
  export/import (FR-18.2/18.3) in **one step**: the NFR-4.11 backup file carries every template and trip, and importing
  it in the app while it points at the server moves the lot (ADR-015). Per-document export stays available. **The server
  has no `/api/v1/*/import` endpoints** (ADR-025): a second implementation of the import rules drifts from the client's,
  and one that writes nothing to the change log reaches no device. Importing is the app's job, or the FR-18.7 command's
  — both run the one implementation and both go through the sync feed. The move starts on the same device, from M17
  (FR-19.8, ADR-045), or device-to-device — back up here, restore on a device that is already in server mode (a second
  device, or a reinstall). The restore pushes the master partition **and** the trips with their rows (E2E-FLOW-07). A
  native one-shot "adopt local data into server" flow — replaying the local state as sync mutations, which is
  architecturally possible since HLC timestamps and device ids are already generated client-side — is not offered
  (ADR-045's rejected option C).
* **FR-19.6 (Sync Indicator in Local Mode):** The G-2 glyph shows a distinct *local* state instead of
  synced/syncing/offline. Tapping it opens a storage & backup detail — persistence status per NFR-4.11, time of last
  portable export, one-tap export — instead of the conflict log: with a single user on a single device, conflicts cannot
  occur, so the conflict log is meaningless here. *Built.* Two further rules. (1) The detail exists in **every** mode,
  not only in Local Mode: Server Mode shows the same sheet — state, explanation, queued count, and the conflict log
  where a trip is open. Which half a user sees is decided by the **run mode**, not by the glyph's state, so an offline
  Local Mode write (FR-19.2) still shows the storage detail rather than a network story. (2) The **one-tap export is the
  whole device** — every trip and every template as one multi-document YAML file (`jitpack-backup-<date>.yaml`), not the
  per-document export M17 also offers: a backup that asks the user to remember each trip and template one by one is not
  a backup anybody performs. Restoring it is the ordinary FR-18.4 path (see there); the file shape and its accepted cost
  are ADR-015.
**The detail names the last failed request.** Without it a device that shows no trips and a permanent *offline* glyph
  while the server is healthy cannot be diagnosed by the person holding it or by the maintainer: a 401, a 500 and a dead
  radio are one indistinguishable dot, and the instance keeps no request log. The sheet therefore carries one diagnostic
  line: **the method, the path and the status of the last request that failed**, or that nothing answered at all, with
  the time it happened. It is reported by the transport rather than by the callers — every caller swallows its own
  failure on purpose (G-2 is the only surface that says anything), and the last request to fail is not necessarily the
  one anybody was waiting for. Three rules follow. (1) **Status, method and path are not translated**: a diagnostic is
  read out or copied, and NFR-4.12 translates screen copy, not error detail — the sentence around it is translated. (2)
  **A later success does not clear it**, because a background drain that failed under a green glyph is exactly the case
  nobody was watching; the line says *last failed*, not *currently failing*. (3) **A 401 that the refresh repaired is
  not a failure** and is never shown — only a 401 whose retry also failed.
**The detail says when the last sync completed.** *Synced* alone does not say since when, so a device left in a drawer
  for a weekend would read exactly like one that has just pulled. In Server Mode the sheet carries one line, *„Zuletzt
  synchronisiert: …"*: a time of day when the cycle was today, date and time on any other day (a bare time would read as
  today for a device offline for days). It is **session-scoped**: absent until a cycle has completed since the page
  loaded, because after a reload nothing has yet talked to the server and a remembered time would vouch for a connection
  this page never made. Only a user-visible cycle counts — a background row load (ADR-033) leaves the glyph alone and so
  leaves this line alone. Local Mode never syncs and shows no line.

* **FR-19.7 (Apply a Waiting Version Now — accepted):** When NFR-4.13 has a newer build installed and
  waiting, the app offers to apply it immediately, in two places. (1) A **bar under the app bar**, on every screen,
  saying a new version is ready and carrying the action plus a *Later*; and (2) the **G-2 detail sheet**, where the
  existing sentence gains the same action beneath it. The press wakes the waiting worker and the app reloads onto it as
  soon as that worker controls the page — the reload follows the takeover, never a timer, so the outcome is assertable
  rather than raced. **What this does not change:** nothing reloads without the press (the automatic policy stays
  next-launch takeover), the first install is still never announced as an update, and an origin with no service worker
  offers neither surface. **The bar states what the press costs**, because it reloads: the outbox is durable (NFR-4.1),
  so unsent changes survive — a claim the bar makes and E2E-PWA-05 does not have to. *Later* is the running app's own
  state and is deliberately not stored: a full page load is the launch the waiting version takes over on anyway, so a
  stored dismissal could only hide an announcement that has stopped being true. It applies in all three modes — a bundle
  update is not a data operation, and Local Mode updates identically. Tradeoff (staleness against a reload that a person
  did not schedule) is ADR-044. **The bar is over the content, not in it (ADR-060, G-19):** it is the
  one surface in the app that can appear while somebody is already using a screen, and a bar inserted into the column
  moves every control below it out from under the finger — the press then lands beside the control and nothing happens
  anywhere. It therefore renders in its own layer, which contributes no height to the column it sits in; its arrival and
  its dismissal change no other element's geometry. **Below the screen's name and as wide as the column (ADR-060
  amendment 1):** the layer is a child of the content column, so it starts where the page head ends
  and takes the column's width rather than the window's. The accepted cost is that it covers the top band of the
  content while it is up — never the head, whose name and view switcher stay whole.
* **FR-19.8 (Leaving Local Mode — accepted):** A Local Mode device can move to a server **from M17, on the
  same device**, in three numbered steps on one card (*„Auf einen Server umziehen"*, Local Mode only, G-8). **(1) Back
  up:** the same whole-device export as the G-2 sheet's (FR-19.6 / NFR-4.11), one function called from both surfaces.
  **(2) Point at a server:** a URL field pre-filled with the page's origin and validated for syntax exactly as M19's;
  confirming writes the mode, the URL and a durable *migration pending* flag, and reloads the app — the orchestrator is
  built once per app start, the same reason M19's choice reloads. **The switch is enabled only while the backup is newer
  than the last change made on this device**: the app stamps the time of its last Local Mode write, a pure rule compares
  the two, and an edit made after the backup disables the switch again until the card's own backup is taken once more. A
  device that never wrote has nothing to lose and is not held. This is the guard FR-19.1's *"never through a toggle"*
  asks for, made into a rule rather than a warning. **(3) Restore:** after the reload the app runs in Server Mode
  against the chosen instance, and while the flag is set **a bar under the app bar** — the FR-19.7 shape — says the move
  is unfinished and opens M18, whose restore branch (FR-18.4, ADR-015) brings every template and trip *and their rows*
  onto the server (E2E-FLOW-07). The flag clears when a restore commits in Server Mode, or on *Skip*, confirmed —
  a fresh start is a legitimate outcome, and a durable flag with no way out would nag forever. Unlike FR-19.7's *Later*
  the flag **is** stored: the restore is a task the reload must not forget. **What this does not change:** M19 is still
  shown exactly once and never re-asked; Server → Local is not offered; the file remains the only carrier of the data —
  no replay of local rows as sync mutations (ADR-045's rejected option C); the Local Mode store in the browser is **left
  in place** and never read again, since Server Mode does not open it, so it can shadow nothing and the app deletes
  nothing; the outbox is untouched, because Local Mode never writes it. In Single-User Mode the card does not exist (the
  device is already in Server Mode); the bar can appear in Server Mode only, since only the switch sets the flag.
  Tradeoff (a file round-trip on one device against a replay engine or a second device) is ADR-045.
* **FR-19.9 (Logging Out and Resetting the Connection — accepted):** M17 carries a **Connection** block in Server Mode
  (absent in Local Mode per G-8: there is no connection to name). It states the instance this device is connected to,
  and offers the two ways off it. **Log out** ends the session — the same end an IdP refusing a refresh brings about
  (FR-23.3's path), so the device returns to M16 and unsent changes stay queued on it; offered only where there *is* a
  session, i.e. not in Single-User Mode, where the button could do nothing. **Reset connection** forgets the session,
  the mode and the stored server URL and reloads, so M19 asks again. Both ask once before acting. The second exists
  because **three device states have no other repair inside the app**: a token the instance no longer accepts, a mode
  chosen by mistake, and a stored server URL that wins over the page's own origin (`client/src/config.ts`) and points
  somewhere that has stopped answering. Otherwise each of them can only be cleared through iOS Settings → Safari →
  Website Data — and, for an installed PWA, by deleting it from the home screen as well, which is also how the last copy
  of a Local Mode device's data is thrown away. **What the reset deliberately keeps:** the device's sync identity,
  because two HLC stamps from one device must never order by a fresh random id (Sync-API §3); the Local Mode row store,
  which FR-19.8 already leaves in place; and FR-19.8's *migration pending* flag, because the restore it stands for is
  still owed if this device is pointed at a server again. Nothing on the device is deleted, which is what the
  confirmation says. No ADR: nothing was traded.
### 3.20 Item Dependencies ("Companion Items")

**Status: implemented** — table `item_dependencies`, `client/src/domain/dependencies.ts`
(resolver + cycle validator), M10 Depends-on section, M3 companion preview/suggestions, M4 co-skip cascade + quick-add
companions, M5 suggestion hint.

* **FR-20.1 (Dependency Declaration):** A master item (FR-1.1) can declare that it depends on another master item
  ("companion of"). Examples: a spare camera battery is only relevant if the camera is packed; a screwdriver is only
  relevant if the drone is packed; a spare Arca-Swiss plate is an optional companion to a telephoto lens. A dependency
  is a relation with its own attributes (mode, FR-20.4; optional quantity), not a single foreign key on the item — one
  item can have several dependencies, in either direction. **Declarable from either end:** the M10 editor writes the
  same row from the dependent's side (*„Hängt ab von"*) and from the main item's (*„Begleitartikel"*). The direction a
  relation is declared from is the user's position, not a property of the relation: standing on the tripod, „this needs
  the Arca plate" is the sentence at hand, and having to leave the item, find the plate and declare it backwards is the
  same edge written the long way. Both ends carry the same three controls — the mode toggle, removal, and the save-time
  cycle refusal, which is asked about the *edge* and so answers identically whichever side posed it.
* **FR-20.2 (Resolution at Instantiation & Packing):** A dependent item appears on a trip's packing list only if its
  main item is on the list and not skipped (FR-5.5). If the main item is later skipped or removed, its dependents are
  marked "co-skipped" and surfaced with the other done rows (FR-25.2) carrying a reason ("weggelassen: „Drohne“ ist
  nicht dabei") rather than being silently deleted. *Built:* the selection is `coSkipTargets` in
  `client/src/domain/dependencies.ts` and the reason is `skippedVia` beside it — derived from the graph and the current
  states, so it cannot go stale; the skip announces the companions by name and one undo restores the whole cascade
  (FR-5.5). **Nothing depends on itself:** M10 refuses to *save* an edge that closes a circle, but that guard lives in
  one screen while the rows also arrive by sync — from another device, or a build older than the guard — so the walk
  that collects the dependents has to survive a cycle, and it never reports the item it started at. A `per_person`
  position expands to one row per traveller, all of them carrying the same master item, and the selection excludes the
  skipped row by row id — so on cyclic data the traveller's siblings would follow it off the list, and `skippedVia`
  would name one of those rows as the reason for another. **"Its main item" is not always the row in hand:** every other
  live row the cascade does not itself take is an *anchor*, and whatever an anchor depends on stays — skipping one
  traveller's per-person tent (FR-25.1) keeps the pegs while the other traveller's tent is still coming, and skipping
  the camera keeps the battery the drone also needs. Skip and FR-5.8's removal share the rule — it is `coSkipTargets`.
* **FR-20.3 (Deduplication Against Explicit Items):** A dependent item may also already be on the list in its own right
  — added directly, or pulled in by a different template. Resolution deduplicates by `source_item_id`: if the item is
  already explicit on the list, the dependency does not create a second instance; quantities merge under the existing
  max/sum rule (FR-2.3a). This reuses the cross-template dedup machinery as-is rather than introducing a parallel
  mechanism — the Arca-Swiss-plate case ("don't duplicate what's already there") is not a special case of dependency
  resolution, it *is* the existing dedup rule applied to one more source.
* **FR-20.4 (Optionality Modes):** Each dependency has a mode: *required* (e.g., battery → camera: pulled in
  automatically without prompting) or *suggested* (e.g., Arca-Swiss plate → lens: surfaced as a one-tap suggestion, e.g.
  in the M3 quantity-review step or as a hint on the main item in M5). Suggested dependencies never add an item without
  the user's tap; required dependencies behave like any other resolved template item.

**Architecture notes for implementation:**
* **Data model:** master-partition table `item_dependencies` (`item_id`, `depends_on_item_id`, `mode` `CHECK
  ('required','suggested')`, optional `quantity`, `updated_hlc`) — analogous to `template_items`. A relation table, not
  a column on `items`, because an item can have multiple dependencies and the relation itself carries attributes. Sync:
  whitelist in `syncableColumns` + `masterPartitionTables`; the existing generic push/pull/LWW pipeline needs no
  special-casing beyond that.
* **Resolution logic:** a pure function in `client/src/domain/` (alongside `instantiate.ts`) that runs after template
  instantiation, resolves dependencies transitively, and dedups against already-generated `source_item_id`s per FR-20.3.
  Keeping it client-side and pure gives Local Mode (3.19) the feature for free, and lets the M3 preview footer report it
  in the same style as the existing merged/excluded summary (e.g., "+ 2 companion items (battery, screwdriver)";
  "Arca-Swiss plate: already on the list, not duplicated").
* **Runtime behavior:** skipping a main item in M4 cascades to co-skip its companions with a reason (reuse of the FR-5.5
  section); quick-adding an item with required companions (FR-5.6) proposes them alongside it.
* **Cycle detection:** belongs in save-time validation — a dependency cycle cannot be persisted.
* **UI:** managed in M10 (Item Editor) as a "Depends on / Companions" section with a required/suggested mode toggle
  per dependency, **each of the two lists writing its own end of the relation** (FR-20.1); surfaced as a preview note in
  M3 and a hint in M5 per FR-20.4.

### 3.21 Theming (Dark Mode Default)

**Status: implemented** — `client/src/theme/palette.css` (token table, the *Bergluft* palette with its flavours Nacht
and Tag, ADR-048), `client/src/theme/theme.ts` (selection/persistence), M17 Appearance toggle; typography
(FR-21.5/FR-21.6) in `client/src/theme/typography.css`, the colour anchors (FR-21.7), and surfaces (FR-21.8) in
`client/src/theme/surfaces.css` plus the `scripts/design-tokens-gate.mjs` lint gate. Those are the first three of the
design-foundation steps in `dev-docs/design-foundation-plan.md`.

The client carries an app-owned theme rather than Ionic's stock palette and the OS light/dark preference: an explicit
theme, defaulting to dark, on a palette of its own.

* **FR-21.1 (Dark Default, Independent of OS Preference):** Every new install, in every mode (Server, Single-User,
  Local, 3.17/3.19), renders with a dark theme active by default. This is an app-level default, not a reflection of
  `prefers-color-scheme` — a device set to light mode still opens JIT-Pack in dark, until the user opts out via FR-21.3.
* **FR-21.2 (One Palette, One Token Table — ADR-048):** Theme colours are drawn from one fixed token
  table rather than invented ad hoc. The palette is the app's own, *Bergluft*: the default dark flavour is **Nacht**,
  the opt-in light flavour (FR-21.3) is **Tag**. Twelve neutrals form a depth ramp that keeps the step names the app was
  built on — `crust`/`mantle`/`base` for background depth (sunken sections, app background, cards),
  `surface0`–`surface2` for lines, controls and inputs, `overlay0`–`overlay2` and `text`/`subtext0`/`subtext1` for the
  typography hierarchy — and **ten accents named for what they are on this palette** rather than for a generic hue:
  `larch` (brand) and `larch-deep`, `glacier` (action), `pine` (done) and `moss` (the start of the done ramp), `straw`
  (caution), `ember` (danger), `heather` (per-person, tertiary), `lupine` and `alpenrose` (the brand mark's outline and
  the avatar set). They are mapped onto the app's existing colour-coded semantics rather than introduced per component:
  primary actions/links, packed/success state, container-weight warnings (FR-10.3's straw/ember thresholds),
  destructive/skip actions, and informational badges/flags. **Why a palette of its own rather than a stock one** such
  as Catppuccin: a syntax-highlighting palette — fourteen accents of equal weight on a violet-biased navy, built so that
  every token class gets a hue of its own — reads as an editor theme however carefully the roles are assigned; the app
  needs a palette with one identity, one action, one done and a handful of semantics. The mapping is a single fixed
  token table, so a palette adjustment touches one file, not every component.
* **FR-21.3 (Opt-In Light Theme & Persistence):** Users can switch to the light theme (Tag) from M17
  Settings. The choice is a **device-local display preference** — not a synced account field (distinct from the FR-17.13
  profile edits) and not per-trip — persisted the same way other device-local UI state is (e.g., FR-19.2-style on-device
  storage), and read synchronously at boot, before first paint, per FR-21.4. Local Mode behaves identically: dark by
  default, light opt-in, both fully offline.
* **FR-21.4 (No Flash of Unstyled/Wrong Theme):** Because the app's default does not follow the OS, the resolved theme
  (persisted choice, or dark if none yet set) must be applied before first paint, not from a mounted-hook check —
  otherwise every load would flash the wrong theme before switching to the persisted one.
* **FR-21.5 (Two Faces, One Type Scale):** The app has a typeface of its own, in the same sense FR-21.2 gives it a
  palette of its own. Two faces, each with one job: **Fraunces** (a serif with an optical-size axis) for titles and
  headline figures, **Hanken Grotesk** for every other piece of text, including all controls. Which of the two a piece
  of text takes is decided by its *role* — page title, hero/greeting, sheet title, app-bar title, headline figure — and
  a role is defined exactly once, so a screen never picks a family or a display size for itself. Sizes, weights, line
  heights and tracking are a fixed scale in the same file as the faces; like FR-21.2's token table, a later adjustment
  touches that file rather than every component. Figures that change in place (counters, quantities, weights) are set in
  tabular figures, so a list does not reflow while it is being packed.

  **Icons are sized from a second table, not from the type scale.** `font-size` on an `ion-icon` sets a *glyph box*, and
  treating that as a text size is how a 64 px empty-state illustration comes to sit on the same scale as body copy —
  after which any later adjustment to body copy silently resizes every icon in the app. Six steps, from an inline caret
  to an empty-state illustration.

  **An element that many screens draw is a named role, not a hand-written style.** The section label is one role class
  owning face, size, weight, tracking, case and colour — the small uppercase label the concept prototype specifies — so
  a screen contributes only its own spacing; left to each screen, the same element gets several answers, none written
  down. A token for a hand-written variant would put a step into the table that the design does not use.
* **FR-21.6 (Self-Hosted Fonts, No Third-Party Request):** Both faces ship inside the app bundle and are served from the
  instance's own origin. Loading them from a font CDN is not acceptable in any mode: it adds a third-party request to
  every boot (against NFR-4.3 and against a self-hosted instance's expectations), it leaks a request per user to a party
  the operator did not choose, and it breaks outright in Local Mode, which may have no network at all. Subsetting is
  **latin + latin-ext** — latin-ext is required, not optional, because the German UI language (NFR-4.12) needs the
  extended range.
* **FR-21.7 (Three Colour Anchors — Brand, Action, Done):** FR-21.2 says which hues exist; this says what they *mean*,
  because a palette without roles makes an app look like a stock Ionic app despite having one. **Larch is the brand**,
  and it appears only where identity does: the anchor you are on, the primary create affordance, the eyebrows, the
  preparation and shopping marks. **Glacier is the action colour** — buttons, links, selection — and it stays Ionic's
  `primary` precisely because primary is what Ionic paints on things you act on; repainting that in the brand would
  make every button shout the brand. **Pine, ramping from moss, is done** — a checked box, a progress bar, a completion
  ring. Two consequences are load-bearing rather than incidental: **progress is never painted in the brand colour**,
  since a brand-coloured progress bar reads as an alert rather than as headway; and **caution keeps its own hue**
  (straw), because a brand colour serving as `warning` would make a container over its weight limit and the product's
  own identity indistinguishable. **A role is flavour-relative, not a fixed hue.** The two flavours are not each
  other's inverse: a pastel that is an accent on a near-black ground is a wash on a near-white one, so the same token
  can arrive roughly twice as loud in the light theme *and* less legible. The rule is general: a role that lands
  differently in the two flavours is restated per flavour, never averaged into one compromise value that suits
  neither. A role is defined exactly once **per flavour**, in the same token table as the palette, and a component asks
  for the role rather than for a hue — including the components Ionic would otherwise paint `primary` on its own (the
  FAB, checkboxes, toggles, progress bars). The flavour-relative rule is paid for in the flavour blocks rather than in
  the anchors (ADR-048) — Tag's accents are dark and saturated where Nacht's are light, each measured above 4.5:1 as
  text on both planes, so the anchor block is one declaration.
* **FR-21.9 (The Instance Names Its Currency):** an amount is stored as `value_cents`; the instance names its currency
  in `JITPACK_CURRENCY` (the UI-Spec M10 *„instance currency"* setting), and the client renders every amount with it.
  **Three things this is not**, each decided rather than left open. **(a) It is a label, never a conversion.** The
  stored amount is already in that currency; naming one changes how it reads and never what it is, and no rate, no
  history and no second currency exist anywhere. **(b) It is per instance, not per user**, by decision. One database
  holds one set of amounts, so two family members reading the same jacket in two currencies would be two answers to one
  question — and deriving it from the *locale* would produce exactly that, since `de-CH` and `de-DE` would disagree
  about a number neither of them owns. **(c) It is not required.** An instance that names none keeps unit-less amounts,
  so nothing about the feature is load-bearing. **The consequence to accept is Local Mode** (invariant 5): it has no
  server to ask, so its amounts stay unit-less, and the alternative — a device-level setting — is rejected for the
  reason in (b): it would make the currency a device opinion in the one mode where it is least ambiguous, and a second
  writer for a value that has one. **A malformed code is refused at start-up, not ignored**: the only visible effect of
  ignoring it would be a missing label, which names neither the cause nor the fix. Delivered over `GET
  /api/v1/instance/config`, unauthenticated and answering in every server mode — Single-User has a currency and no
  session, which is why `/auth/config`, that answers 501 there, could not carry it. The client persists the last known
  code, so a device that starts offline keeps its labels instead of dropping every amount back to a bare number. `Intl`
  places the symbol and the separators, so the currency is named once and the locale still decides how it reads.
* **FR-21.8 (Three Planes, One Radius Scale, One Elevation):** FR-21.2 gives the app a palette and FR-21.5 a type scale;
  this gives it a **shape** vocabulary, because without one a defect escapes every colour rule: a card painted in a
  correct palette token can be **the exact colour of the page behind it**, a hairline rectangle drawn on the page rather
  than an object raised above it. Depth is therefore a role, like brand and action: **page**, **card** (one step up,
  where every list row and item lives) and **sunken** (one step down), each named once and each asked for by role.
  Corner radius is a **six-step scale** — checkbox (ADR-049: a 24 px box at the inline-control step reads as a circle),
  inline control, block, card, sheet, and pill — so a radius is chosen by rule rather than invented per view; a radius
  that is half its own element's height is a pill rather than a small step, and a circle keeps `50%` because that is a
  shape and not a size. Elevation is **one geometry cast in the flavour's ink**: the offsets and blur are written once,
  while which colour a shadow is cast in and how hard is restated per flavour, for the same reason FR-21.7's brand is —
  Nacht casts in its darkest plane, which in Tag is a light grey that would cast no shadow at all. **The two flavours do
  not end up mirroring each other, and measuring says why:** a dark theme's neutrals are compressed at the dark end —
  crust sits seven units below mantle — so a shadow there cannot darken much however hard it is thrown, while the same
  role on a light ground has 442 units to work with. Elevation on the dark ground is therefore carried by the **plane
  step** (a card is 21 units lighter than its page) with the shadow as the bloom that stops the edge looking cut out; on
  the light ground it is carried by the shadow. Each flavour uses the mechanism its own ground supports. **This is
  enforced, not documented:** a view that writes a raw colour, a raw radius or a raw shadow fails the build (invariant
  9b).

* **FR-21.10 (The Page Names Itself — ADR-050):** Every screen states its own name, in the page, in the display role
  FR-21.5 defines — not in the app bar. The name may carry a **second line** for what the screen belongs to: the trip a
  sub-screen is part of, the step a wizard is on. The head is rendered **once, by the frame**, from a name the screen
  registers, so it is not a decision any view can forget and so a screen added later is named by default. The bar is not
  the place for it: at 390 px beside M4's icon cluster a bar title has 54 px, so „Samedan 2026“ renders as „S…“, and two
  facts (a sub-screen and its trip) cannot be stated at one size — they are a name and a second line. The tab roots
  register a name like every other screen rather than writing a display-face heading into their own content. **The app
  bar's per-screen icon cluster is capped at three**, with the surplus becoming words in its ⋮, so there is a rule for
  what full looks like. Accepted cost, stated in ADR-050: the head is a fixed band and does not scroll away, and the
  trip's three other views are one tap deeper than the §3.25 directive asked for — what that directive protects,
  that they are *named* rather than hidden behind an unlabelled glyph, is what the menu gives them.

**Architecture notes (as implemented):**
* `src/main.ts` does not import `@ionic/vue/css/palettes/dark.system.css` (which would drive dark mode off
  `prefers-color-scheme`). Nacht is the `:root` default in `palette.css`; the `jitpack-day` root class (set by
  `src/theme/theme.ts`) switches to Tag. The persisted value is `night`/`day`; a stored legacy `latte` is read as `day`,
  and nothing writes it.
* Nacht and Tag are each defined once as a full CSS custom-property block in `client/src/theme/palette.css`; Ionic's
  own `--ion-color-*`/`--ion-background-color`/stepped-color variables and any app-specific component styles both
  consume the same custom properties — no second, parallel color system. Semantic mapping: primary=glacier,
  secondary=moss, tertiary=heather, success=pine, warning=straw, danger=ember, light=surface0, medium=overlay1,
  dark=text; app background=mantle, cards/items=base, borders=surface0. Stepped colors are derived via `color-mix()`
  from the background/text anchors, so they follow the flavour automatically.
* The M17 toggle is a new Appearance control in the existing Settings screen (visible in every mode), not a new screen.
  Persistence key: `localStorage['jitpack_theme']`.
* FR-21.4 is satisfied twice: an inline script in `index.html` tags the root before first paint (covers a pre-bundle
  paint), and `initTheme()` runs synchronously in `main.ts` before mount. Because dark is the stylesheet default, a
  missing/unreadable preference paints dark with no flash.
* No server or sync involvement: purely a display-time, on-device setting.
* Typography lives beside the palette, not inside it: `client/src/theme/typography.css` owns the `@font-face` rules, the
  `--jp-font-*` families, the `--jp-text-*` scale, and the `.jp-*` role classes; `palette.css` keeps colour and
  nothing else. Both are imported from `main.ts`. Ionic derives every component's type from `--ion-font-family`, which
  is bound to the UI face once.
* Shape is the third table: `client/src/theme/surfaces.css` owns the `--jp-r*` radius scale, the three elevation casts
  and the `.jp-card` class. Elevation is deliberately **split across two files** — the ink (`--jp-shadow-ink-rgb`,
  `--jp-shadow-alpha`, `--jp-shadow-rim`) sits with the palette because it is flavour-relative, the geometry sits with
  the shapes because it is not. The plane roles (`--jp-surface-page/card/sunken/border`) live with the palette for the
  same reason, and Ionic's `--ion-background-color`, `--ion-item-background` and `--ion-card-background` resolve
  *through* them rather than reaching for `--ct-*` directly.
* `scripts/design-tokens-gate.mjs` enforces invariant 9b across `client/src`, run by `make client` and by the CI
  `client` job. Node built-ins only, no dependency (NFR-4.3). It rejects a colour literal, a raw `border-radius` length
  and a raw `box-shadow` outside the three theme files; `50%` and a `0 0 0 <n>px` ring are allowed by rule rather than
  by allowlist, because neither is a size decision. An empty sweep exits non-zero: a gate that scanned nothing must not
  report "ok".
* **A colour is a colour in every notation it can be written in.** The gate reads hex, `rgb`/`hsl`, the CIE and OKLab
  functions, `color()`, `light-dark()` and all 148 CSS colour names as the same decision, so the rule cannot be stepped
  around by spelling. The names are read only in a property that can carry a colour — `client/src` holds `.ts` as well
  as CSS, and a colour name there is usually an English word. `color-mix()` is the one function a view may write,
  because it can be composed entirely of tokens — and the gate holds it to exactly that: every colour argument must be a
  `var(--…)`, `transparent` or `currentColor`, checked over the whole file because a mix's arguments wrap. It is not
  banned outright because its uses outside the theme files tint a role token (`color-mix(in srgb, var(--jp-brand) 14%,
  transparent)`), which is the right practice. `scripts/__tests__` has no home in this repo, so the gate's own cases
  live in `client/src/theme/__tests__/designTokensGate.spec.ts`, which runs it as a process over a fixture tree — both
  what it must reject and what it must keep letting through.
* Both faces are the **variable** font, subset to latin and latin-ext — four `woff2` files, ~180 KB in total, under
  `client/src/assets/fonts/`. One file per subset covers the whole weight range, and Fraunces' optical-size axis is
  driven by the browser (`font-optical-sizing: auto`), which is the reason for shipping the variable file rather than
  three static weights. `font-display: swap` means the fallback paints first rather than nothing.
* The prototype (`dev-docs/UI_Concept_Prototype.html`) keeps its Google Fonts link — it is a single file opened from
  disk, not the app, and self-hosting it would mean checking the same four files in twice.

### 3.22 Item Images

**Status: implemented** — server (migration 012 `item_images` + `items.image_hash`, `GET`/`PUT`/`DELETE
/api/v1/items/{id}/image`, server-side HLC change-log stamp) and client (on-device optimizer with FR-22.3 backoff, Local
Mode blob store, M10 editor + M9/M5 display) as specified below.

Master items (FR-1.1) can optionally carry a single reference photo (e.g., a photo of a specific piece of gear), shown
in M9 (Item Inventory thumbnail), M10 (Item Editor), and M5 (Item Detail). The central product commitment is that **the
user never has to think about file size, resolution, or format** — the client resizes and re-encodes automatically, the
same way it already does for avatars (FR-17.13), so an item photo taken straight from a phone camera never reaches the
server unprocessed.

* **FR-21.11 (A Section Head Names Its Block, and Its Count Sits Beside It):** The head above a
  block of content is a **display role**, not a small tracked label: the display face at the app-bar step,
  sentence case, with the section's own count set beside it at the right — UI face, one step smaller, recessive, and
  tabular so a figure that changes in place cannot shift the head's baseline. The small uppercase label survives for
  what the concept prototype actually draws in capitals: a marker *inside* dense content, never a title over it.

  **The head is a component, not only a role.** A role that every call site has to complete — its margin, above all —
  gets a different answer at each one; head and count come from one component.

  **A count is a value the head is given, not a sentence the catalogue joins** — never *Open · 3* with the number set in
  the display face and aligned with nothing. The catalogue keeps only the part that is language: the label, and where
  two figures need a word between them, the phrase that holds them.
* **FR-21.12 (A Sheet's Head Is a Component):** A bottom sheet opens with its name, and that head
  is drawn once: the sheet title role with the h1 margin already declined, an optional second line at `.jp-meta`, an
  optional lead — a mark, a thumbnail, a state glyph — an optional trailing indicator, and the way out.

  **The way out has one design** — the concept prototype's filled circle on the sunken plane with a rim — and no sheet
  draws its own. **The second line is `.jp-meta`**, the role the page head already uses for the same fact, and the
  title is always the sheet title role. A component is the only guard here, because **a token table can only say where
  a value came from, never that two places meant the same thing**: two close designs or two title sizes built from
  legal tokens both pass the design gate.
* **FR-21.13 (The Trip You Are On Is a Card, Not a Row):** M1 opens on the trip a person is actually
  packing, rendered as a **hero**: when it is, who is on it, a progress ring with the share in words beside it and a
  track under them, and the preview of what is still open that the list card carries. Exactly one hero per
  screen — the point of the card is to say *which* trip, and a second one unsays it. It is the only card that paints
  brand on its own plane (FR-21.7), for the same reason the active tab does: identity marks the thing you are on.

  **Which trip it is is a rule.** Store order — IndexedDB's key order over random ids — is harmless for a list and not
  for a *singular*: with two active trips the screen would name a different one depending on the browser. M1's running
  trips are ordered **soonest departure first**, sharing the comparator with FR-6.1's planned lookahead, and an undated
  trip sorts last for the same reason it does there (FR-2.1b: no date says the departure is unknown, never that it is
  imminent). The hero is the head of that list.

  M2 carries the same hero on its *Active* segment (FR-21.15).

  **The concept's italic is not built.** The hero's first line is Fraunces *italic* in the concept and upright here:
  neither face ships an italic, so asking for one would synthesise a slant rather than render a face, and shipping the
  real one is a second pair of files beside the roman's 126 KB, on every boot, in every mode, for one line — against
  NFR-4.3 and against FR-21.6's reason for self-hosting at all. The rule is guarded rather than remembered, because a
  synthesised italic is exactly the kind of wrong that survives a screenshot.
* **FR-21.14 (The Type Scale Carries the Body Text):** The list row's name and the line under it
  take their size from the type table, and so does any text that reaches the screen without a role of its own. A row's
  name is **one size whatever element carries it**, set a step above the detail that qualifies it and at the weight
  that makes it read as the thing the row is about.

  **The scale carries the body, not Ionic.** Left to the browser and Ionic, `body` computes to 16px — a step the table
  does not have, and larger than every heading the app draws below a page title — and Ionic sets `ion-label h2` at
  16px, `h3` at 14px and `p` at 14px: a row's name would change size with whether a screen writes `h2` or `h3` for it,
  and the detail under a name would be the same size as the name.

  The concept draws the row's name at 15.5px. The scale has 15 and that is what ships — half a pixel is not a step,
  the same call FR-21.11's section head made against the app-bar title.

  **One implementation detail is load-bearing and therefore guarded.** `ion-label` is a *scoped* Ionic component, so
  its own rules arrive as `.sc-ion-label-md-s h3` — one class more specific than a bare `ion-label h3`, which
  therefore never applies at all. The app's rules carry an `[class]` attribute selector to match the scope class
  without naming it. Removing it is the tidying edit that would silently hand every row back to Ionic, and only a
  rendered pixel would say so.
* **FR-21.15 (The Hero Comes to M2):** M2's *Active* segment opens on the same card M1 does: the
  running trip that departs soonest, as a hero at the head of the list, lifted out of the grouped list rather than
  drawn twice.

  **Only on *Active*, and that is the whole scoping rule.** The hero answers „which one am I packing", and the other
  two segments have no answer to give — a planned trip is not being packed and an archived one is done, so a card over
  either would state something untrue about the list under it. Exactly one per screen (FR-21.13) follows from the
  choice being a single trip rather than a list.

  **M1 and M2 have to name the same trip**, so the choice is a rule (`heroTripOf`) and not the head of whichever list
  each screen happened to sort. It matters here more than it looks: M2 orders every segment **newest-first** through
  `tripOrderKey`, which for two running trips is the *opposite* end from FR-21.13's soonest-departure order — so the
  screen's own list is the one thing the hero must not be the head of.

  **Lifting the trip out of its series group costs nothing.** Its actions are *stated* on the hero — export, share,
  the lifecycle step and delete, from the same list (`tripRowActions`) the rows' hold menu reads, so the two can never
  offer different steps. The series count needs no change — the header counts the trips it *lists*, as a search
  already shrinks it. What the hero keeps saying for itself is which series it came out of, as the first term of its
  own meta line, in front of who the trip is for.

  **What travels with the card.** The FR-27.4 chips — proposed, applied and its foldable log — and FR-16.2's imported
  chip are the row's, and the trip you are packing is where „what changed under me" is asked most; they are one
  component (`TripChangeChips`) rather than a block written into each of the two representations. The hero also
  asks for its own trip partition: it is not a row and never enters M2's intersection observer (ADR-033), so without
  that it would say „items loading" forever on the one trip the screen exists to answer for.

  **M2's row actions are a hold menu, not a swipe.** A trip row's actions open on a **hold or a right-click** as an
  action sheet headed by the trip's name, the way M4's (FR-5.5) and M7's (FR-18.2) rows do, so no list hides its row
  actions behind a swipe. The actions and their conditions — export (FR-18.3); share only with a second account to
  share with (G-8); clone from the archive only (FR-12.1); the one lifecycle step; delete, Owner-only and confirmed
  (FR-4.5) — come from **one list** (`tripRowActions`) that the row menu and the hero both read. Tap opens the trip,
  and the tap that ends a hold does not also open it. UI-Spec M2, E2E-M2-19.
* **FR-21.16 (A Cluster Names Its Item Louder Than Its People):** In a per-person cluster (FR-25.1)
  the head names the **item** and the rows under it name **people**, so the head is set at the row's own size and in
  the page's text colour, and a child row steps one size down and recessive. The person qualifies the item; the item is
  the thing being packed.

  **Only a render can check this.** The inverse — a head one step under the body scale in a subdued colour, children
  larger and brighter — is built entirely from legal tokens, which is the case invariant 9b exists for. M4's per-person
  cluster is the app's most-read block, so it is also where an inverted hierarchy costs most.
* **FR-21.17 (The Page Head Yields With the Line Under It):** On a screen that drives it, the G-9
  page head collapses on a downward scroll and returns on any upward one, together with the screen's own header
  line. M4 is the first and so far only such screen; every other page head stands, which is the default.

  **Scrolling M4 down takes the whole header, *the trip's name included*** — you know which list you are on, and the
  rows are what the screen is for. Since ADR-050 the name sits in the frame's page head, so the page head yields with
  the figures; otherwise the biggest block on the most-scrolled screen would be the only one that never moves (on a
  390×844 phone against the sample data, 329 of 844 px stand between the app bar and the first row).

  **The collapse must not read its own effect as a gesture.** Handing the head's height to the scroll viewport shortens
  the scrollable range by the same amount, and the browser answers by clamping `scrollTop` down — which arrives at the
  scroll handler as an upward scroll, re-opens the head, and lengthens the range again, so the head would open and shut
  on a single flick near the end of the list. A clamp can only ever leave the scroller at its own bottom, so that is
  where the rule stops reading direction: an upward reading taken at the bottom is not a gesture. The rule is a pure
  step (`lib/headScroll.ts`) rather than a scroll listener, because that is the only shape in which the clamp case can
  be reached by a test at all.

  **A list that would not survive the yield keeps its head.** The clamp guard above only holds at the bottom of a list
  that is long enough to begin with. A list that overflows its screen by less than the yield releases — 147 px on a
  phone: the 96 px line plus the page head — has its range shortened below the reader's offset, is clamped, and the
  head returns: the list would jump back up on every swipe down. A search narrows a long list to a short one, so this
  is common. **The head yields only where the scroller overflows by more than the threshold plus 192 px** (the
  release, rounded up past the paired two-figure line), and a shorter list simply keeps its head. Read from the
  scroller's own geometry, which the page resolves at mount rather than from the first scroll event — that event is
  the one the jump starts on. E2E-M4-129.

  **Only a scroll somebody made moves the head.** Besides the rule's own clamp, the browser scrolls a control into
  view whenever it has to, for a keyboard focus and for every click a test driver aims at a row that is off screen.
  Read as a gesture, an upward one of those would bring the head back and push every row down by its height (on
  WebKit at 1280×600, a 60 px scroll moves the row 162 px) — a tap landing on the row below the one it was aimed at.
  **The head answers only an input the reader made** — a wheel, a touch drag, a paging key, or a pointer on the
  scrollbar itself — and holds still for every other scroll, taking up the new offset so the next gesture is
  measured from where the list actually is. Two exclusions carry the fix rather than decorate it: a pointer *inside*
  the list is a row being tapped, and that tap is what scrolls the next target into view; and a key that is not one
  of the paging keys is somebody typing in the quick-add, which sits inside the same scroller. The window is the
  scroller's own — armed on the input, closed when the scroller comes to rest — so a flick's momentum still counts
  as the flick. E2E-M4-135.

  *The variant weighed and not taken, by decision:* let the head return only where the list is back within the threshold
  — no direction read at all, no listeners. It is rejected for the cost it puts on the reader: the head would then be
  reachable only by scrolling a long list all the way back to its top, and the flick that recalls it is what makes the
  collapse a yield rather than a disappearance. *Revisit trigger:* an engine where the gesture window cannot be closed
  reliably — the head would then be stuck yielded, which is the failure the simpler rule does not have.
* **~~FR-21.18 (A List of Controls Takes a Narrower Column Than a Page of Prose)~~ — superseded by FR-21.26: no
  screen takes a second measure, so the content column has one.** The measurement behind it stands: the distance
  between a row's name and its control is a property of the *row*, not of the window — on a 1280×900 window an M4
  child row puts `Sia` 834 px from her checkbox at the reading measure against 474 px at a 600 px one.
* **FR-21.19 (The Lead Column Is One Thing Wide):** Every M4 row opens with a lead column of a
  single glyph: the item's mark on an item row (FR-28.4), the traveler's face on a child row under a cluster
  (FR-25.1). Never both. The column holds its width when the glyph is absent, which is what keeps the names of all
  three row kinds on one x.

  **A lone per-person instance takes the mark, not the face.** When only one traveler is assigned, `packingView`
  renders no cluster and folds the person into the row's label instead — `Wanderstöcke · Andy` — precisely because no
  cluster head is there to say who it is for. A face beside the mark would start its name 32 px right of every sibling
  in the same group; the person is not lost without the face, because the label is where that row says it. E2E-M4-72
  covers this third row shape, and the unit case names the traveler explicitly — a `traveler: null` input cannot
  falsify the rule.
* **FR-21.20 (A Cluster Head Is a Line of the List):** A per-person cluster's head (FR-25.1)
  starts its name on the same x as every plain item row: it names an item, and so does the row beside it. The step
  and the rule that mark the cluster belong to the **children** — the travelers under the head are what is nested,
  and the head is what they are nested under.

  An indent on the whole cluster, head included, would land the item's name 8 px right of every other item name in the
  list and only 6 px left of its own travelers, and a head that close to its children reads as one of them. This is
  FR-21.16's question at the other axis — that one gives the head its size, this one its column. The list has one name
  column, and every kind of line that names an item — plain row, lone per-person row, cluster head — stands in it.
* **FR-21.21 (A Trip's Views Are Named in the Page):** Every
  screen that is one of a trip's four views — the packing list (M4), the shopping list (M6), the luggage (M11) and the
  analytics (M12) — carries a row of pills under the page's name (G-9) and, for the views the row leaves out, entries in
  the bar's ⋮. The one being looked at is marked (`aria-current="page"`) and inert; every other view is reachable **from
  any of the four**, so the step from the shopping list to the luggage does not go back through M4 first. Which view
  a screen is comes from the route table (`meta.tripView`) — a screen that had to remember to offer its siblings is a
  screen that will forget. The same applies to the ⋮: the frame fills it, so none of
  the four screens registers those entries and none of them can forget to.

  **Which views stand in the row (ADR-051 amendment 1).** *Packliste* and *Einkaufen (n)* — the two a trip is
  **worked** in — plus the view being looked at when it is neither of them, so the row never stops saying where you
  are. *Gepäck* and *Auswertung* are words in the ⋮ instead: neither is important enough to stand at the top of the
  packing list, and a screen read once a trip must not be as loud as the list being packed. The notes join as a pill
  of their own (below).

  **The row pays back a cost ADR-050 wrote down.** ADR-050 moved the views into the bar's ⋮ so the bar could stop
  growing glyphs, spending §3.25's "one tap each"; ADR-051 weighs the ways back. What is left behind the ⋮ is what
  *changes* the trip — its properties, and the one lifecycle step that is next — and the two views the row does not
  show. The sheet leads with **where you can go** and follows with what you can do: a
  lifecycle step between two destinations reads as neither.

  **The count is things to buy, not rows** (FR-25.6), which is the arithmetic M6's own segments use: `buyRowCount` is
  one function in `domain/shoppingView.ts`, read by both, so the pill and the segments cannot disagree. A count lives
  **in the label** (*„Einkaufen (12)"*), because an action-sheet entry can render no badge (ADR-050) — which is what
  lets a view carry its number into either shape; a glyph-only pill also shows it as a badge.

  **A view is described once.** Its word, its glyph and its destination are one table (`lib/tripViews.ts`), read by
  the switcher and by the bar's ⋮, and a view keeps the same id in both — so a case that knows where to click does
  not have to know which shape the view is wearing. Written twice, a view could be renamed in one shape and
  not in the other with nothing failing.

  **Only the current view is a word (ADR-051 amendment 3).** The one you stand on shows its glyph and its word; every
  other view is its glyph alone, its count a badge, its label its `aria-label` and `title`. Holding a glyph shows the
  label in a bubble, and the release does not navigate; a tap does. Words do not fit: four words with their counts
  overrun a 390 px phone in German. With glyphs the widest row fits 360 px (E2E-G12-07). The glyphs carry meaning
  alone, so E2E-G12-05's pairwise distinctness is load-bearing; a held glyph naming itself is E2E-G12-08.

  **The notes are a pill of their own (FR-7.13).** Their badge counts the entries new for me, never
  the total, and wears the colour a new thing wears (`--jp-action`) where the shopping count is grey; the word, when the
  badge is not a pill's, is *„Notizen · 2 neu"*. Standing on *Gepäck* or *Auswertung* the row holds five pills, measured
  at 360 px by E2E-G12-07.
* **FR-21.22 (A Dashed Edge Means *Not Yet*):** A dashed outline marks a place where something is
  not there: the empty picker slot (M9), the quick-add invitation, the browse hand-over. A control that acts on
  content which *exists* is a solid, filled button. The reveal bars are that second kind — M4's *„{n} Erledigte
  anzeigen"* and its *others* bar (FR-25.2/25.20), M6's *„{n} gekaufte anzeigen"* (FR-25.11j) — and each states the
  count of rows it is holding back, so a dashed edge would tell the reader those rows were a placeholder. They are one
  `RevealBar` component: a filled bar with a caret that turns, carrying `aria-expanded` for the reader who cannot see
  the caret. M9's *included* result is on the same side of the rule, solid and muted.
* **FR-21.23 (The Packing List Draws Its Own Progress):** M4's header line answers *how far along am I* the way M1 and
  M2 answer it: a ring, the share in words, and a track under them — the screen where the progress is actually *made*
  carries the same figure as every other screen. The three parts are one component (`ProgressFigure`) drawn from one
  percentage (`packedPercent`, over the FR-25.22 units), so the ring and the track cannot disagree with the sentence or
  with the group heads under it. The line yields to the list on the way down (FR-21.17).
* **FR-21.24 (One Door Per Screen to the Quick-Add):** A screen offers the shared composer (FR-5.6/25.13) exactly
  once — never a labelled pill above the list *and* a ＋ FAB over it. On M4 and M8 the door is the FAB, because it is
  reachable from anywhere in a list and a pill is only reachable by scrolling back to the top of one.
  M6 has no FAB and keeps the pill, so the composer's trigger is a caller's decision (`showTrigger`), not a constant.

  *The cost, accepted:* a pill names the action in words and the FAB does not. Weighed against a labelled
  invitation that is out of reach for most of the screen's life, and against a screen that says one thing twice —
  which has to be read twice before it can be used once.
* **FR-21.25 (M5 Puts Its Weight on What It Was Opened For):** The item sheet is as tall as its content and no taller,
  so an item with no prep and no notes does not spend the screen on nothing while covering the list; it grows to the 85
  % ceiling when *Details* is unfolded. It is the app's own `SheetModal`. The pack control — the reason the sheet is
  opened — is drawn at a main action's size rather than a row's, and the *Add* buttons of prep and notes are not filled,
  since a fill is what makes a button read as the screen's answer. The field and the button that commits it share a
  height and an edge.

* **FR-21.26 (One Content Measure — supersedes FR-21.18):** The frame's content column has one width,
  `--jp-measure` (600 px), and every screen takes it. UX-17's cap is inert below its own width, one rule in `App.vue`
  rather than a decision each view remembers; there is no second, wider measure a screen can ask for, and no
  `meta.measure` in the route table. Between that width and the app's other breakpoint (900 px) the token is `92vw`,
  so a phone's width and an iPad mini's do not get the same margin with the frame's native scrollbar stranded in the
  unused gutter; on both sides of that gap it is 600 px, so a desktop window keeps the narrow column E2E-M4-71 checks
  for while a tablet gets a real one.

  **One measure, because the switcher of FR-21.21 makes the trip's four views peers**, one tap apart (ADR-051,
  driver 4). Two measures would move the page's name sideways and widen everything under it on every step between
  views taking different ones (at 1440 px: 460–1060 against 280–1240).

  **No screen needs a wider reading measure.** At 960 px on a 1440 px window, the chevron that opens a row sits 855 px
  from its name on M8 and 890 px on M12, and a settings toggle 857 px from its label — the failure UX-17 exists for.
  Nor does a 960 px line read well: at this type size it runs to some 120 characters, where the comfortable range ends
  around 75; at 600 px the same settings paragraph wraps at 74. That holds for the charts, the wizards and the CSV
  importer's column mapping too. The two conflict logs are rows of `ion-item`s with a wrapping label and an end slot,
  which is the shape the measure is for; a fixed-column table there would need the wider one.

  **The cost reaches the tablet.** A 768 px window carries 84 px of margin either side; the list reads as a column
  rather than as a full-width sheet, the same argument as on the desktop, one screen size down. On a 1440 px window
  the app uses 600 px, and a list of short names leaves empty space beside it. That is the trade UX-17 makes —
  desktop is not the primary surface, and a row whose control is 855 px from its name is not using the space, it is
  spending the reader's eye on crossing it.

* **FR-21.27 (M1's Greeting Is M1's Page Head):** The dashboard registers a head like every other screen (G-9,
  ADR-050): the time-of-day greeting is its title and *„Was beim Packen ansteht"* the meta line under it; M1's
  content writes no `h1` of its own. Switching tabs therefore leaves the first line of the app where it is and at one
  size.

  **Two costs, both accepted.** The greeting takes the page-title role rather than the hero one, so it is the larger
  size — which is what makes it line up with the screens beside it. And, being the frame's band, it does not scroll
  away with M1's cards; that is ADR-050's stated cost. The screen
  keeps a `data-testid` of its own (`dashboard`), because a test that says *which* screen is up cannot point at the
  greeting: the head is outside the router outlet.

* **FR-21.28 (M1's Cards Are the App's Card):** Every block on the dashboard — the delegation section, the
  last-minute section, the prep section, the trip cards under the hero and the planned lookahead — is the card of G-14
  (`.jp-card`), headed where it needs a name by the section head of G-13. No screen draws Ionic's `ion-card`, which is
  a second radius, a second elevation and an inset of its own — two cards a finger apart would disagree about where
  the page's edge is.

  **The section head carries what the card title would.** Each section's name is a section head, so the count sits in
  the numeric face beside the name (*„Geplant"* with *1*), never in brackets inside a title; the titles carry no
  decorative icons, no section head in the app having one; and the delegation section's *„n neu"* is that head's
  count, the one place a section's number belongs.

  **A trip's progress is one composition.** The following cards carry the same `ProgressFigure` the hero and M2's rows
  do, one ring size down — the app's only progress design.

* **FR-22.1 (Optional Item Photo):** Each item in the central item database (FR-1.1) can optionally have one photo
  attached. Absence is the default and the common case — this is a reference aid, not a required field, and nothing else
  in the product (quantities, dedup, sync) depends on its presence.
* **FR-22.2 (Zero-Configuration Client-Side Optimization):** The user only selects a source photo (camera or gallery);
  they are never asked about resolution, format, quality, or shown a file size or compression dialog. The client
  performs the entire optimization automatically before any bytes leave the device, exactly as FR-17.13 already
  establishes for avatars — this section extends that precedent from a fixed 256×256 identity crop to a
  variable-aspect-ratio reference photo.
* **FR-22.3 (Sizing Target):** The client downsamples the image so its longer edge is at most **1024 px**, preserving
  the original aspect ratio with no forced crop (unlike the avatar's circular crop, an item photo is a reference image,
  not an identity picture, so cropping content away would be actively unhelpful). It re-encodes as JPEG starting at
  quality ≈ 0.82 and, because real-world item photos vary far more in visual complexity than a face crop, iteratively
  steps quality down (and, if quality alone isn't enough, the target dimension too) until the result is at or under a
  **150 KB hard cap** — the same cap enforced server-side (FR-22.4), so the client's job is to always land under it, not
  merely to aim for it.
* **FR-22.4 (Server-Side Enforcement, Defense in Depth):** Independent of client behavior, the server rejects any upload
  that is not `image/jpeg` or exceeds 150 KB, checked at the database layer via a `CHECK` constraint — mirroring
  FR-17.13's avatar enforcement exactly. Non-conforming uploads are rejected outright; the server never resizes or
  re-processes on the client's behalf.
* **FR-22.5 (Replace & Remove):** The photo can be replaced (the client re-runs FR-22.3 on the new source) or removed
  entirely at any time from M10. Removing it is a first-class action, not just "replace with nothing."
* **FR-22.6 (Shared, Not Per-Trip, No Role Gate):** Items are shared master data, not trip-scoped (FR-1.1); a photo is
  therefore shared instance-wide the moment it's attached, visible to every user who can already see that item. No new
  permission concept: attaching, replacing, or removing a photo is authorized exactly like any other item edit (name,
  weight, category, ...) — which means any authenticated user, full stop. In particular, the FR-4.5 trip role
  model (Owner/Admin/Editor) does **not** apply here and must not be checked: that model gates trip-scoped actions
  (traveler management per FR-4.7, role changes), not the shared item database. An Editor on every trip they're a member
  of can attach, replace, or remove any item's photo exactly as freely as an Owner — deliberately, since the underlying
  edit-item permission they're both exercising already works this way for every other item field.

**Architecture notes for implementation:**
* **Data model:** a table `item_images` (`item_id` PK, `REFERENCES items(id) ON DELETE CASCADE`, `image BLOB NOT
  NULL`, `mime TEXT NOT NULL DEFAULT 'image/jpeg' CHECK (mime = 'image/jpeg')`, `CHECK (length(image) <= 153600)` for
  the 150 KB cap of FR-22.4, `updated_at`) — a dedicated table, not a column on `items`, and deliberately **not** added
  to `syncableColumns`/the master-partition generic pull-push pipeline. This follows ADR-002 (Avatar Storage) directly:
  embedding BLOBs in the JSON pull envelope would bloat every device's ordinary sync response, even devices that never
  display item photos. `users.avatar_image` is excluded from sync the same way, for the same reason.
* **Sync hint:** `items` carries one *synced* column, `image_hash TEXT` (nullable — `NULL` means no photo), which *is*
  part of `syncableColumns` and flows through the ordinary master-partition pull/push like any other item field (name,
  weight, etc.). This is the lightweight signal other devices use to know a photo exists or changed, without carrying
  its bytes. The client never sets this field directly via a mutation (it has no way to compute the server-stored hash
  of bytes it hasn't uploaded yet); instead, the image upload handler stamps it server-side after storing the BLOB,
  using a freshly generated HLC — the same pattern already used for `packing_now_by`/`packer_user_id`/comment
  `author_id` (`stampActor` in `internal/api/server.go`). Stamping it server-side, through the normal change-log path,
  means the update reaches other devices on their next ordinary pull with no protocol addition. On item delete,
  `item_images` cascades via its own `ON DELETE CASCADE`, mirroring how template deletes cascade `template_items`
  (`cascadeChildren`).
* **Endpoints:** mirrors `GET/PUT /api/v1/users/{userID}/avatar` (`internal/api/singleuser.go`) exactly:
  * `GET /api/v1/items/{itemID}/image` — streams the BLOB with `Content-Type: image/jpeg` and `ETag` set to the same
    value stored in `items.image_hash`, long `Cache-Control`; 404 when the item has no image.
  * `PUT /api/v1/items/{itemID}/image` — accepts the client's already-optimized JPEG, validates format/size server-side
    (FR-22.4), stamps `items.image_hash` on success.
  * `DELETE /api/v1/items/{itemID}/image` — clears the row and nulls `items.image_hash`.
  Per FR-22.6, `PUT`/`DELETE` are wrapped only in `s.authed` (any logged-in user) — no trip-membership or role
  middleware, since items carry no trip or role association to check against.
* **Client fetch/caching:** the client treats `image_hash` like any other synced field. A pulled item row whose
  `image_hash` is non-null and differs from what's cached locally triggers a background `GET .../image` — lazy, off the
  pull's critical path, never blocking the trip/master drain. In Local Mode (3.19), there is no server round-trip at
  all: `PUT`/`DELETE` are ordinary local writes of the row and the blob together (IndexedDB, keyed by item id, same as
  every other locally persisted table per FR-19.2) — no extra logic needed, since Local Mode's client mutation is
  already the sole authority over row contents.
* **Client resize implementation:** reuses the offscreen-canvas technique FR-17.13 already established for avatars
  (`<canvas>` draw + `toBlob('image/jpeg', quality)`), generalized rather than duplicated. The two behavioral
  differences from the avatar path are (a) no crop UI and no forced square output, and (b) the iterative
  quality/dimension backoff loop of FR-22.3 — avatars don't need a loop because a fixed 256×256 square crop reliably
  clears 100 KB at a fixed quality of 0.8, while item photos are larger and far more variable in content, so a single
  fixed setting can't be guaranteed to land under the cap.
* **Revisit trigger (mirrors ADR-002 §4):** if item photos need to grow meaningfully past ~150 KB, or this product's
  deployment profile moves beyond a home-lab/small-instance scale, the BLOB-in-SQLite decision should be revisited the
  same way ADR-002 already flags for avatars — migrating to filesystem or object storage at that point is a contained,
  additive change, not a rearchitecture.

### 3.23 Instance User Management

**Status: implemented** — server (`/api/v1/admin/` endpoints, `authed`/WS enforcement) and client (M20, M17 entry)
as specified below.

JIT provisioning (Section 2) means every account that exists at the IdP gets full access to the instance the moment it
first authenticates — there is no instance-level counterpart to the per-trip role model (FR-4.5): no way to see who has
been provisioned, to revoke an account's access, or to correct an inappropriate display name or avatar. This section
adds a deliberately *small* user management to close that gap. It does not touch identity itself — account creation,
passwords, e-mail, and sessions remain entirely the IdP's job, and JIT provisioning stays open (FR-23.6).

**Relationship to Section 2 (resolved, not an exception):** Section 2 forbids administrative *infrastructure* changes
via the UI — server configuration, OIDC settings, mode flags. The actions in this section are administration of
*application data* (account rows the app itself provisioned), the same category as changing a trip member's role per
FR-4.7, and are therefore permissible in the UI. The one piece that *is* infrastructure-shaped — who holds the
instance-admin role — accordingly stays declarative and out of the UI entirely (FR-23.1).

* **FR-23.1 (Declarative Instance Admin Role):** A user account can hold the *instance admin* role, recorded as
  `users.is_instance_admin`. The role is determined **exclusively** by a deployment-level environment variable
  `JITPACK_ADMIN_EMAILS` (comma-separated e-mail addresses, Section-2 style like FR-17.1), matched case-insensitively
  against the `email` claim the IdP's **UserInfo endpoint** reports (ADR-007 — identity never comes from token claims)
  **and only when it also asserts `email_verified`**: at every login and session refresh, the account's flag is stamped
  to `is_instance_admin = (email_verified ∧ email ∈ list)` — the list is authoritative in both directions, so removing
  an address from the variable revokes the role at the next restart+login (or, once a session exists, at its next
  refresh — at most the 15-minute access-token lifetime after the restart) with no residue. The verification requirement
  is not optional hardening: OIDC Core §5.7 gives `email` no verification guarantee on its own, so on an IdP with
  self-service profiles an account could otherwise name the configured admin address and inherit the role on its very
  next request. `email_verified` is accepted as a JSON boolean or as the string `"true"` (providers differ); anything
  else, an absent claim included, counts as unverified, because a provider that asserts nothing has verified nothing.
  **Operator consequence:** an IdP that does not emit `email_verified` via UserInfo grants no instance admin at all —
  Authelia includes it in the `email` scope. E-mail is the matching key deliberately: the operator knows it *before* the
  first login, whereas the OIDC `sub` claim is an opaque identifier at most IdPs and only discoverable from
  application-created data — a configuration value must never depend on those. Considered and rejected as matching keys:
  `sub` (the discoverability problem above), an IdP group claim (admin management would live in the IdP with no restart
  needed, but every IdP first has to be configured to emit the claim and its name varies — setup friction
  disproportionate for a small feature), `preferred_username` (already in the token via the `profile` scope, but not
  guaranteed stable or unique by the OIDC spec), and multi-key matching of sub-or-email (fuzzier semantics for no
  additional need). There is deliberately **no** UI to grant or revoke the role: role assignment is infrastructure
  configuration and stays declarative per Section 2. In Single-User Mode (3.17) and Local Mode (3.19) this section is
  entirely inert and hidden (FR-17.3/FR-19.3, UI-Spec G-8) — with one account there is nobody to administer.
* **FR-23.2 (User Overview):** Instance admins can view a list of all provisioned accounts: display name, avatar,
  e-mail, provisioning date, active/deactivated status, and lightweight usage indicators (number of trips the account is
  a member of, number of templates it owns). For non-admins the overview is invisible in the UI and its endpoints reject
  with 403 — it is never merely hidden.
* **FR-23.3 (Deactivate / Reactivate):** An instance admin can deactivate any non-admin account. A deactivated account
  loses all access — every authenticated request is rejected with 403 and a distinct `account_deactivated` error code,
  its Web Push subscriptions (NFR-4.6) are deleted, and no new notifications (FR-6.2) are created for it — but **no data
  is touched**: trip memberships, packing attributions (`packer_user_id`, comment authorship), owned templates and
  series all remain intact and continue to display the account's name and avatar to other members. Crucially, open JIT
  provisioning does **not** resurrect a deactivated account: a deactivated user authenticating at the IdP again stays
  deactivated — otherwise deactivation would be meaningless under FR-23.6. Reactivation is the exact inverse and
  restores access with everything as it was (push subscriptions require the client to re-register, which the existing
  registration flow does on next app start). **"All access" includes a socket that is already open** (ADR-056):
  authentication happens once, at the dial, so the hub re-asks on every send — otherwise a deactivated account whose
  every HTTP request is refused would keep receiving its trips' WebSocket events. The silence arrives with the next
  event rather than with the next reconnect — and reactivation resumes it just as quietly, with no re-subscribe.
  Accounts currently holding the instance-admin role cannot be deactivated; the operator removes them from
  `JITPACK_ADMIN_EMAILS` first, which keeps the environment variable and the database from contradicting each other.
  **On the client, that 403 ends the session:** the tokens are dropped and the app returns to the login screen. Without
  it a deactivated account keeps tokens that still look valid in `localStorage`, so nothing ever expires them and the
  app simply stops syncing — indistinguishable from being offline, and a person told nothing. The client narrows on the
  `account_deactivated` code rather than on the status, because a 403 is also how the server refuses a non-admin the
  FR-23.2 endpoints and logging *that* person out would be the worse defect. **And the login screen names it too**
  (E2E-M20-06): without that, the refusal `issueSession` returns to a deactivated account would reach the OIDC callback
  as the generic *„The server rejected the login."* — the sentence a replayed code gets — so the one refusal a person
  can do nothing about by trying again would read as the one thing they would try. The callback narrows on the same
  code, for the same reason and with the same exception: any other failed exchange keeps the generic sentence, because
  it says nothing about the account.
* **FR-23.4a (The circle is one component, and the picture is the optional half, *built*):** Wherever a person is
  drawn as a circle — M4/M5's rows, M17's profile, M20's overview — it is the FR-25.3 avatar, and the **initials are
  the ground with the picture laid over them**. The order matters because the avatar endpoint answers `404` for every
  account that never uploaded one, which is the ordinary case: a bare `<img>` would show the browser's torn-picture
  glyph, and hiding the element on error would leave a hole. A picture that is still loading, absent, or refused
  therefore shows the letters rather than a gap, and a re-upload — which changes only FR-17.13's cache-busting query —
  is retried rather than staying hidden behind the previous failure.
* **FR-23.4 (Profile Intervention):** For inappropriate content, an instance admin can reset an account's display name
  and remove its avatar (FR-17.13 fields). A reset display name falls back to the IdP-provided name, re-stamped at the
  account's next login exactly as JIT provisioning stamped it initially; the avatar is simply cleared. The affected user
  can set both again themselves — this is moderation, not a lock.
* **FR-23.5 (No Deletion):** There is deliberately no way to delete an account — deactivation is the terminal state.
  `users.id` is a foreign-key target across effectively the whole schema (`packer_user_id`, `packing_now_by`, comment
  `author_id`, item `created_by`, template/series `owner_id`, `trip_members`, `notifications`,
  `push_subscriptions`), so deletion would require ownership-transfer rules, cascade decisions for shared history, and
  master-partition sync tombstones — a large surface bought for a need a home-lab instance does not have. **Revisit
  trigger:** a legal/GDPR-style erasure requirement, or the deployment profile moving beyond the home-lab scale, reopens
  this as *anonymization* (strip name/e-mail/avatar/subject, keep the row and its references) rather than physical
  deletion.
* **FR-23.6 (Provisioning Stays Open):** JIT provisioning remains exactly as Section 2 defines it — every
  IdP-authenticated account is provisioned with full access, no approval step, no pending state. The IdP is the access
  gate an operator already controls; FR-23.3 is the retroactive correction for the cases the gate let through. An
  approval/pending workflow was considered and rejected as disproportionate for the target deployment.

* **FR-23.7 (API Tokens, *built*):** A person can create a **long-lived credential** for a
  script or another tool, in M17 Settings and with `jitpackd token create`. It is shown **exactly once**, at creation,
  and stored nowhere at all.

  **What this is not, stated first, because it changes what the FR is for.** A long-lived credential is possible
  without it: `authed` trusts any HS256 JWT signed with `JITPACK_SESSION_SECRET` whose `sub` is a `users.id`, and the
  server names that mode on startup — *"multi-user mode (externally minted session tokens)"*. Anyone holding the secret
  could mint a ten-year token by hand. What this FR adds is a way to make one without hand-crafting a JWT, plus the
  hygiene that makes a machine credential recognisable as one.

  **The token is a JWT with three extra claims** — `kind: "api"`, a `jti`, and the `name` the person gave it — and an
  `exp` chosen from a closed vocabulary: an hour, a day, a week, 30 days, 90 days, a year, or never, with **90 days the
  default and the choice required rather than inherited**. The short end matters most for the case this is for: a
  credential for one cleanup run should be able to die with the run, and with no revocation `exp` is the only thing
  that ever ends it. Because a JWT
  payload is base64 rather than encryption, the name is readable by whoever holds the token, which is why nothing else
  goes in there and why the name is capped: it travels *inside* the credential, so an unbounded name is an unbounded
  token. A session token carries **no** `kind` at all — the absence is what identifies a browser session, so nothing may
  ever start stamping one there.

  **Nothing is stored, and that is the decision (ADR-039).** There is no table, no schema change, and therefore no
  listing and no revoking of one token: revoking means rotating `JITPACK_SESSION_SECRET`, which invalidates every API
  token at once. What makes that affordable was measured rather than assumed — refresh tokens are opaque values stored
  hashed in `sessions` rather than signed, so a rotation voids only the 15-minute access tokens and every browser
  recovers at its next refresh. **The one caveat belongs in the operator's manual, not here alone:** on an instance with
  no OIDC configured there is no refresh path (`501 not_configured`), so a rotation there does log everyone out.

  **A token may not mint another token.** Without that a leaked credential renews itself before its own expiry and
  outlives every lifetime its owner ever chose — and with no listing and no individual revocation, `exp` is the only
  bound an unmanaged token has. This is deliberately *not* a scope (§9 of the concept rejects scopes, and rightly): a
  scope asks which resources a credential may touch, an open-ended question asked at every handler and wrong by
  omission. This asks whether a credential may extend its own life, a closed question with exactly one place to ask it,
  because exactly one endpoint answers with a credential.

  **A subject no row carries is refused.** Existence and deactivation are one question (`store.AccountStatus`): a gate
  that asked only whether a subject is *not deactivated* would pass a credential naming nobody. At fifteen minutes that
  is nearly unreachable; at ninety days it is not, because a token outlives the account it was minted for. An unknown
  subject is refused with the **same** answer a bad signature gets, so probing cannot enumerate ids.

  **Mode behaviour (invariant 5, G-8):** the surface exists only in Server Mode with a session. In **Single-User Mode**
  authentication is bypassed entirely and no session secret is even configured, so the endpoint answers `501` as its
  **first** statement — it is not merely inert there, it would be open. In **Local Mode** there is no server and no API
  to hold a token. **Endpoint:** `POST /api/v1/me/tokens`, the only response in this API whose body is a credential and
  the only one that sets `Cache-Control: no-store`. **CLI:** `jitpackd token create --user <id|email> --name …
  [--expires …]`, dispatched *before* OIDC discovery so it still works when the IdP is the broken thing, refusing an
  ambiguous `--user` (`users.email` carries no UNIQUE constraint) and refusing to write the secret when stdout is not a
  terminal unless `--print-secret` says so. **Deliberately absent:** scopes, service accounts, an admin view of other
  people's tokens, and any storage at all — including a `jti` denylist, which would pay the schema cost without
  answering *what exists*. The `jti` ships anyway, so a denylist stays addable later without invalidating tokens already
  issued.

* **FR-23.8 (Knowing the Instance Is Behind Upstream, *built*):** An instance can tell its
  operator that a **newer release exists on GitHub**. It is **off unless `JITPACK_UPDATE_CHECK=true`**, and the
  default is the decision, not an omission: a self-hosted, offline-first application contacts a third party because
  its operator asked it to, never because it was installed (ADR-062).

  **This is not NFR-4.13's waiting build, and the difference decides the shape.** FR-19.7's banner is about client
  assets *this instance already serves*, which the device seeing it applies itself. A new release can be applied by
  exactly one person — whoever pulls the image — so a banner on every family member's phone would promise an action
  nobody but them can take. It is therefore **one line in M17's About block**, where the operator already looks, and
  it is never a banner, a toast or a badge.

  **The server asks, once a day.** The binary carries its own release tag, stamped at build time, and asks GitHub's
  `releases/latest` at most every 24 hours, lazily — an instance whose settings screen nobody opens makes no request
  at all. The endpoint is `GET /api/v1/instance/update`, unauthenticated like `/instance/config` beside it: it names
  no caller, Single-User Mode has no session to present (invariant 5), and the version it reports is the one the app
  bar already shows to anybody who loads the client. Asking from the browser instead was rejected in ADR-062 — a
  household behind one NAT would spend the unauthenticated rate limit device by device, and every device would tell
  GitHub that this household runs JIT-Pack.

  **Four states, and a fifth that renders nothing.** `available` names the new release and links to its notes —
  because the question a newer version always raises is what changed; `current` says so with the moment the answer
  was obtained, since *"up to date"* with no age is a claim nobody can judge; `unreachable` reports that the check
  did not get an answer, in recessive ink and not as an error, because an instance that cannot reach GitHub is the
  normal case for an offline-first deployment; `off` renders nothing at all, which is also what a build that names
  no release tag produces — every locally built binary — since there is nothing to compare it against.

  **The link is checked before it is passed on.** It arrives from off the network and is rendered as an `href`, so a
  release whose URL is not an absolute `https` one loses its link and keeps its version — the useful half stands on
  its own, and a scheme a browser would execute never reaches a screen.

  **Two rules inside the answer:** a release already known **outranks** a later failed check (the release did not
  stop existing, and the reported check time says how old the knowledge is), and a tag that cannot be parsed is
  never reported as an update — *"cannot compare"* reaching a person as *"you are behind"* is the one failure here
  that costs something.

  **Mode behaviour (invariant 5, G-8):** Server and Single-User Mode both have a server to ask, so both can carry
  the line. **Local Mode has none**, and asks nothing at all — the line is absent rather than broken.

**Architecture notes for implementation:**
* **Data model:** one migration — `users` gains `is_instance_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_instance_admin
  IN (0,1))` and `deactivated_at TEXT` (NULL = active; the timestamp doubles as audit information for the overview).
  `users` is not part of either sync partition, so neither column touches `syncableColumns` or the pull/push pipeline.
* **Enforcement point:** a single check in the `authed` middleware (`internal/api/server.go`) directly after the token
  subject is resolved to a `users` row — deactivated → 403 `account_deactivated`; the same check in `wsAuth` covers
  WebSocket dials. The Single-User path (`api.NewSingleUser`) bypasses `authed` entirely and is unaffected, consistent
  with FR-17.11. An already-open WebSocket connection is not closed; the hub re-checks the account on every send and
  stops delivering (FR-23.3, ADR-056).
* **Admin bootstrap:** `JITPACK_ADMIN_EMAILS` parsed in `cmd/jitpackd/config.go` (empty ⇒ no admins ⇒ the feature is
  dormant); the authoritative stamping lives in `store.EnsureOIDCUser`, which the OIDC broker runs at every login and
  session refresh (ADR-007) and which distinguishes first provisioning from re-login. The client authorize request
  carries the `email` scope (`client/src/auth/pkce.ts`); the server reads `email` from the UserInfo response alongside
  the display-name lookup. `EnsureOIDCUser` takes the e-mail as a parameter and stamps it into `users.email` at each of
  those points — keeping it current when the IdP-side address changes, and feeding the FR-23.2 overview at the same
  time. Comparison is case-insensitive; a UserInfo response without an `email` claim simply yields no admin role (not an
  error), and neither does one without an affirmative `email_verified` — see the requirement text above. Because
  stamping happens at every login and refresh, a changed variable takes effect within one refresh interval after the
  restart with no manual DB edit.
* **Endpoints:** new admin surface under `/api/v1/admin/`, guarded by an `s.adminOnly(...)` middleware layered on
  `s.authed` (mirrors how `s.member` layers today): `GET /api/v1/admin/users` (overview incl. counts), `POST
  /api/v1/admin/users/{userID}/deactivate`, `POST .../reactivate`, `DELETE .../avatar`, `DELETE .../display-name` (reset
  per FR-23.4). `GET /api/v1/me` additionally returns `is_instance_admin` so the client knows whether to render the M20
  entry point; the existing `GET /api/v1/users` member-picker list excludes deactivated accounts.
* **Deactivation side effects:** delete the account's rows from `push_subscriptions` (`internal/store/push.go` already
  owns that table's semantics); the notification-creation path (`internal/api/notifications.go`) skips deactivated
  targets the same way it already skips per-kind preference opt-outs.
* **UI:** a dedicated screen (UI-Spec M20) entered from a new Administration row in M17, rendered only when
  `me.is_instance_admin` and an OIDC session exists — the exact gating pattern of M17's Notifications section
  (FR-17.3/FR-19.3/G-8).

### 3.24 Item Tags & Master-Item Lifecycle

**Status: implemented.** The section holds two independent changes to the central item database (FR-1.1) — the tag
model and lifecycle-aware deletion — and the two merges (FR-24.14, FR-24.15) that answer duplicates of both kinds.

* **The tag model — FR-24.1, FR-24.2, FR-24.4, FR-24.5 — is *accepted and implemented***. Tags live in `tags`, and the
  assignment in `item_tags (item_id, tag_id, position)`, position 0 being the primary tag; an item name is unique across
  the inventory rather than per category. M9 and M10 are built on it. The options weighed — and the cost of that
  uniqueness — are in **ADR-014**.
* **Lifecycle-aware deletion — FR-24.3 — is *accepted and implemented*** for master items **and** Vorlagen. It is a
  rule about history rather than about classification, independent of the tag model: `items.retired_at` and
  `templates.retired_at` carry the marker, the server turns the `still_referenced` refusal into the decision, and the
  client states which of the two deletions will happen before the confirm. Where the rule runs, and why it runs in two
  places, is **ADR-032**.

One consequence is worth stating where the requirement lives rather than only in the ADR: **`trip_items.category_name`
stays a single key.** It is a denormalised snapshot of *one* grouping key, taken when the trip is generated, and holds
the **primary tag** at generation time. The trip side therefore keeps a single grouping key and does not gain the set —
which is why M4, M12, analytics, export and the spreadsheet import each group by one key.

* **FR-24.1 (Multi-Tag Categorisation — replaces FR-1.1's single "default category"):** A master item carries a
  **set of tags** (zero or more) rather than a single category. Tags serve simultaneously as categories and as free-form
  labels (e.g., an item can be tagged `Kleidung`, `Sommer`, and `Strand` at once). The **first tag is the item's
  *primary* tag**, used wherever exactly one grouping key is needed (so an item appears once in a grouped list).
  Rationale: an item legitimately belongs to several axes at the same time — a swimsuit is Clothing *and* Summer *and*
  Beach — and a single mandatory category throws away filter reach the user expects. Tags are **shared master data**,
  governed exactly like the item itself (the FR-22.6 model): any authenticated user creates a tag simply by typing it in
  the item editor, and there is no fixed taxonomy. A tag is renamed, merged, reordered and deleted in M9's tag manager
  (FR-24.10), which changes nothing about how a tag is *created* — that stays this sentence's filter-or-create idiom;
  the manager adds the ability to fix one afterwards. **Capture:** the tag input in M10 is a **search field** — typing
  filters the tag chips live (assigned tags stay pinned above the matches); tapping a match assigns it, and when the
  typed name matches no existing tag, **＋ (or Enter) creates and assigns it** in one step — the same filter-or-create
  idiom as the quick-add (FR-25.13 family). A separate "add new tag" input next to a full, unfiltered chip cloud is
  rejected as overload. Considered and rejected: a privileged *category* field plus optional tags
  (keeps a special primary but duplicates the concept); a rigid, admin-curated tag list (governance overhead
  disproportionate for a home-lab instance).
* **FR-24.2 (Tag Filtering & Grouping in Inventory):** The Item Inventory (M9) filters by tag: an item matches a tag
  filter when that tag is in its set, so the same item surfaces under **every** one of its tags. The grouped default
  view groups by **primary tag** so each row appears exactly once; each row still displays all of its tags. **What
  decides the primary tag when two assignments share a position:** the lower `item_tags.id`. There is a tie to decide
  because nothing forbids one — reordering N tags is N separate mutations, so every intermediate state has two rows at
  one position, and a UNIQUE (item_id, position) would refuse the first half of every reorder and, offline, lose it.
  Without the rule the tie would fall to arrival order in each client's store, and two devices could file the same item
  under two different headings. The rule is applied at read time, in one place (`client/src/domain/tags.ts`), so the
  M9 grouping and the M10 chip order cannot disagree. This is the item-editor counterpart to the reusable filter bar
  used across the list screens (search + chip axis). **The same tag is what a trip row is filed under.** A
  `trip_items` row snapshots one grouping key, `category_name`: the master item's primary tag. Every path that creates
  a row — the quick-add, template instantiation, the FR-20 companion resolution and the FR-27.4 refresh — takes it
  from the inventory as handed to generation, `CategorisedMasterItem`, carrying the key `domain/tags.withCategories`
  derives; `items` has no category column. It is derived on read, not stored, so renaming or reordering a tag moves the
  next generated row with it.
* **FR-24.4 (Lean Inventory List with Configurable Properties, *built*):** The inventory list (M9) is **lean by
  default**: primary-tag avatar + name per row, nothing else — the inventory is a lookup surface, not a spreadsheet,
  and all tags as chips with weight and price right-aligned on every row reads as overloaded. Which extra properties
  the list shows — **Tags, Gewicht, Preis, Zuständig** (FR-1.9's default assignee) — is a **device-local preference**
  behind an eye icon next to the search field, opening a small settings sheet ("Angezeigte Eigenschaften") with one
  toggle per property; the icon carries a count badge while anything is shown. *Zuständig* is not offered everywhere:
  the list of *offered* properties is filtered by G-8, while what is *stored* never is (`offeredProperties`).
  Persistence class = the FR-25.2 reveal-done toggle (localStorage, per device, never synced). *Considered and
  rejected:* a single "Details" on/off toggle — configuring *which* properties show serves the weight-focused packer
  and the price-focused shopper with the same mechanism.
* **FR-24.5 (Minimal Item Creation, *built*):** Creating a master item is a **minimal form**: intro line ("nur der
  Name ist nötig"), name (focused), tags, and Gewicht/Preis behind a **"Mehr ▾"** disclosure (the FR-25.7 principle
  applied to M10). The existing-item sections are **absent, not emptied**: an item that does not exist yet cannot have
  a photo, a companion or a delete card, and showing "In keiner Gruppe oder Vorlage." on a blank form is noise. The
  full list of sections creation mode hides is the photo, „Hängt ab von", the delete card, and the two rear-view
  sections „Enthalten in" (FR-27.8) and „Kommentare aus Reisen" (FR-27.9) — E2E-M10-07 asserts the absence, with
  E2E-M10-17/18 as the positive halves. "Artikel anlegen ✓" commits (a missing name is caught with a hint, not a
  disabled button the user must diagnose); afterwards the full editor appears for optional follow-ups (photo,
  dependencies).
* **FR-24.6 (The Inventory's Tools Stay On The Screen, *built*):** M9 carries a **tool bar that does not scroll
  away**: the search field, the sort control and a chip for whatever tag is narrowing the list, with the group
  headings sticking directly beneath it. The head states the size of the collection („184 Artikel · 23 Tags") and
  what a filter leaves of it („12 von 184 Artikeln"). *Why it is a requirement and not a layout preference:* measured
  against the family instance the list is **10 391 px against a 671 px viewport** — fifteen screens — and with both
  controls in the scrolling content, two swipes in there would be no heading, no axis and no field on screen, and
  filtering would mean scrolling back to the top. **The search field leaves the G-12 magnifier on this screen, and
  only on this screen** (by decision): G-12 collapses a screen's search behind an icon because a permanently open box
  costs a row of a list that is read at arm's length — true where searching is occasional, false where the screen *is*
  a lookup surface over a few hundred rows, where every lookup would pay a tap to reveal the field. The exception is
  written into G-12 itself rather than left as an inconsistency, and E2E-G12-02 lives on M7 because a screen without
  the action cannot carry the case for it.
  **The sort has two values and no more** (`Nach Tag gruppiert` / `Alle alphabetisch`): the second is the flat A–Z run
  that 23 groups make impossible, and ordering by recency or by usage is deliberately *not* offered, because neither
  number is on the client — `items` carries no client-visible clock and usage is the trip partitions this device may
  not hold. An option whose ordering the device cannot compute is worse than its absence.
* **FR-24.7 (Inventory Search That Reaches The Data, *built*):** M9's search matches an item's **name, its tags, its
  mark's keywords and the display name of its FR-1.9 default assignee**, the last the weakest of the four reasons
  because the name it matches is a person's rather than the item's. That field is what stands in for a filter by
  account (see FR-1.9), and it exists only where FR-1.9 does: in Local and Single-User Mode the directory is empty, so
  the fold has three reasons there. **It reaches every surface built on the same construction**, which is the point of
  there being one: M9's field, FR-24.11's composer — where the hit says *über {Name}*, as it does for a tag — and
  FR-25.13j's
  browse sheet, which groups by tag rather than by reason and already takes mark-keyword hits the same way. Every
  field is matched under a fold that accepts **both keyboard spellings of an umlaut** — „gurtel" and „guertel" both
  reach „Gürtel". Each hit carries **why** it matched, and the results are grouped by that reason (*Treffer im Namen*
  before *Treffer im Tag* before *Treffer in der Marke* before *Treffer bei „zugewiesen an"*), with a row that matched
  through something other than its name saying what — a row arriving under a query it does not visibly contain reads
  as a bug, which is the finding FR-27.13's picker already paid for with its `via` field. An item is reported
  **once**, under the strongest reason it has, so FR-24.2's „each row appears exactly once" holds while searching too.
  *Why:* a plain substring match on the name (`name.toLowerCase().includes(term)`) returns **0 of 184** for both
  „guertel" and „gurtel" against the real inventory while the belt sits in the list; dozens of names carry ä/ö/ü/ss,
  and the tag every row displays could not be typed at all. **A dead end explains itself:** when a tag filter is what
  emptied the result, the no-match state names that tag, counts the hits outside it and offers to drop it — keeping the
  query,
  because the user asked for socks and not for the unfiltered inventory. The rule is a pure module
  (`client/src/domain/itemSearch.ts`) rather than a computed property, for invariant 4's reason and because the
  ranking two devices must agree on is arithmetic worth unit-testing. The app's fold lives once, in
  `domain/search.ts`, shared with the marks index and the group picker.
* **FR-24.8 (Choosing a Tag Without a Swipe Axis, *built*; the options and their costs are **ADR-061**):** M9 has
  **no tag swipe axis** (`ion-segment`). In its place: the **three tags holding the most items** as chips in the tool
  bar, each carrying its count; **„Alle N Tags"**, which opens a sheet listing every tag with its count, searchable,
  with several choosable at once under *irgendeiner* / *alle* and the **„Ohne Tag"** bucket; and a chip for any chosen
  tag that is not one of the three, so a filter the bar cannot show cannot exist. **The group heading is the jump
  control**: it opens a list of the groups with their counts and **scrolls** to the one chosen (scroll, do not anchor
  — the rows above stay where they were, so a jump is undone by scrolling back). *Why no axis:* at 390 px it shows
  **4 of 24** chips, clips the fourth mid-word, keeps no scroll position, offers no counts and holds one tag at a
  time. *Why the jump exists at all, and why it is the primary control:* **3 of 184 items carry a second tag**, so
  filtering by tag almost never separates anything the grouping has not separated already — what an axis actually
  buys is arriving at a group without fifteen screens of swiping. That is navigation, and it is named as navigation;
  real filtering (two tags, the untagged bucket) stays behind the sheet, being the rarer question. *Considered and
  rejected:* a **wrapping chip cloud** (everything visible without an overlay, but 23 chips expand to five or six rows
  of a sticky bar, and it degrades as the vocabulary grows — the one option that gets worse with use); a **single
  anchored dropdown** (cheapest, but one tag at a time, which forecloses FR-24.9's bulk selection); the **sheet alone**
  (thorough and scale-free, but every tag costs the same two taps, including the three that answer most questions).
  **Three consequences are taken on purpose:** the sort control sits in the app bar's G-12 cluster, because a fourth
  chip wraps the sticky bar to three rows at 390 px; „Stillgelegt" is **not** offered as a filter, because FR-24.3
  settled that a retired row leaves this list rather than becoming a mode of it (M23 owns them); and the untagged
  bucket is **exclusive** in the sheet, because „alle" plus a real tag is empty by construction.
* **FR-24.9 (Acting on Several Items at Once, *built*):** M9 has a **selection mode**, armed from the app bar or by
  a hold: the rows stop navigating and carry a checkbox, *„Alle N"* takes **what is on screen** — the filter and the
  search included, which is what makes it worth having — and three actions act on the set: **Tag geben**, **Tag
  nehmen**, **Stilllegen**. *Why:* „Diverses" holds **49 of 184** items on the family instance, and refiling them one
  at a time costs 49 round trips through M10 (open, search the tag, assign, remove the old one, back). **Giving carries
  the switch that refiles**, and that is the point rather than a convenience: assigning a tag does not move a row in
  the grouped list — the *primary* tag decides that, and it is the one assigned first — so „Als primären Tag setzen"
  is the difference between labelling 49 items and emptying a group. The write is
  a position below every sibling (`primaryPosition`), one row each, never a reindex of the others. **A batch reports
  what it actually wrote:** an item already carrying the tag as asked is not rewritten, so pressing twice writes
  nothing twice, and a selection that is already as asked is answered with a sentence rather than a silent no-op.
  **Undo, and where it stops.** The two tag actions arm one undo for the whole batch — the assignments it created are
  removed, the ones it moved go back to the position they held, the ones it deleted are written again where they were.
  **Stilllegen has none, by decision:** FR-24.3 makes a delete two different acts, and the *removed* half cannot come
  back (nothing was tombstoned to restore), so the honest safety is the sentence before the act — which is also what
  M10's delete card does. That sentence names **both** halves („N werden versteckt …, M werden endgültig entfernt"),
  in three forms so that a batch of one kind never reads „0 werden versteckt"; the hidden half stays recoverable on
  M23. **The same write reaches M10:** an assigned chip has two targets — the name files the item under that tag, the
  ✕ takes it off — and the primary one says so and stops offering an act it has performed. With the ✕ alone, where an
  item is filed would be decided by the accident of assignment order and could only be changed by removing every tag.
  *Considered and rejected:* a fourth bulk action „Primär setzen" beside „Tag geben" (it is the same write with the
  switch on, and two controls for one write is how a second one drifts).

  **A hold selects here too (ADR-075)**, as on M6 and M25, so the three lists of that shape behave alike. A hold on a
  row (or a right-click) starts the mode with that row picked; the app bar's glyph stays. The row navigates in code
  rather than as a router link, so the release after a hold is spent on the selection rather than opening M10. **M9
  does not take the drag** the other two have: its groups are the primary tag, and a drop would have to decide
  silently whether the tag the row leaves stays as a secondary one; *Tag geben* with its refiling switch already moves
  any number of rows and says so.

  **Giving creates the tag it does not find (see FR-24.12).** A query that names no tag under the **uniqueness** fold
  (`findNameCollision`, so „diverses" is not offered beside „Diverses") is offered as a new tag in FR-24.11's dashed
  row, created and given in one act; the batch's undo removes the tag again once it has emptied it. Taking never offers
  it. Without this, tagging forty untagged items with a new category would be a detour through M10 first.

  **Three more acts, behind one door.** Beyond tags and retiring, the mode sets what else an inventory row carries:
  who it is usually assigned to (FR-1.9), what it depends on and what comes along with it (FR-20.1). Those three are
  reached from a **⋯ „Mehr"** in the action bar rather than as three more controls beside the two tag ones — measured
  at 390 px the bar carries **four** before the labels clip, the two tag actions are the mode's core, and a sheet has
  room for the words these three need („Hängt ab von" alone does not say which end of the edge the selection is on).
  *„Üblicherweise zuweisen an …"* offers the directory plus **„Niemand"**, which is what takes an assignment away
  again, and is **absent where the instance has fewer than two accounts** (G-8, the same rule M10's own field follows
  — Local and Single-User Mode never see it). *„Hängt ab von …"* and *„Begleitartikel …"* open one sheet whose only
  difference is the sentence and the direction: the same stored edge read from its two ends, as M10 renders it for a
  single item. The sheet carries the **mode** the batch writes (FR-20.4's required/suggested), because deciding it
  per row afterwards is the saving the batch exists for, and it offers the inventory **capped and sorted by name**
  with what the cap holds back named — an uncapped sheet is two hundred rows, and an unsorted one is ten arbitrary
  ones.

  **A batch skips, it does not refuse** (the shape is **ADR-061**'s, driver 4). A link is planned per item
  (`planDependencyBatch`): the picked item inside its own selection, an edge that already exists, and one that would
  close a cycle are each left out and **counted in the
  result sentence**, while the rest is written. Refusing the whole batch over one offender would leave the user to find
  it among fifty rows, and the cycle it protects is the same one M10's save-time validator refuses. The assignee batch
  skips on the same principle: an item already naming that person is not rewritten, which under field-level LWW
  (ADR-022) matters beyond tidiness — a no-op write still carries a newer clock and would beat a real change made on
  another device. **Both have an undo**, the assignee's putting *each item's own* previous value back rather than one
  value for the batch; the link's removing exactly the rows it created.
* **FR-24.10 (Managing the Tags Themselves, *built*; the delete's options and their costs are **ADR-063**):** M9
  carries a **tag manager**, reached as a word in the app bar's ⋮ (ADR-050 spends its three glyphs on FR-24.4's eye,
  the sort and FR-24.9's selection, and this is the rarest of the four). It lists every tag with the number of
  **assignments** it has, searchable under FR-24.7's fold, and each row offers four acts: **umbenennen** (tapping the
  name), **reordering** on the grouping axis (a drag grip), **zusammenführen** and **löschen**. *Why it exists:*
  without it a tag can be made and given away and nothing else, so a name typed wrong stays wrong, a tag typed twice
  stays twice, and the axis order is the order the tags happened to be created in. Against this instance's own data
  (23 tags, **49 of 184 items under „Diverses"**) that is the gap between tagging and *filing*.

  **A rename is refused when another tag holds the name.** `tags.name` is the third `UNIQUE (name)` space beside
  Vorlagen (FR-1.6) and series (FR-13.1), and every device holds the whole master partition, so the collision is found
  where the name was typed rather than arriving later as a refused push. The alert **stays open with the typed text**,
  the idiom the other two prompts use, because dismissing it throws away an edit that was one character from right.

  **A delete is refused while items carry the tag, and the refusal hands back the merge (ADR-063).** `item_tags.tag_id`
  is `ON DELETE CASCADE`, so deleting a carried tag would strip it from every item and drop each one whose *primary*
  tag it was into the leftover bucket — a change to where rows are filed, made silently, on rows the user was not
  looking at. So the refusal states the count and offers **„Zusammenführen …"** in the same breath: „geht nicht"
  without a way forward is what sends somebody back to retagging by hand. **Merging re-points the source's
  assignments at the target**, drops the ones that would collide with `UNIQUE (item_id, tag_id)`, and — the clause
  that carries the feature — **promotes the surviving assignment into the source's position where the source was the
  item's primary tag**, so the item stays filed under the merged tag instead of moving to a heading neither tag had.
  The source is deleted last, once nothing carries it. *Considered and rejected:* the cascade with a well-written
  warning (the one act in the inventory with no undo), and FR-24.3's retire (a schema change, and its premise is
  absent — nothing resolves against a tag row, because FR-24.2 snapshots the tag's *name* onto the trip row).

  **The counter beside each tag is the one the refusal uses**, read through the same rule: a manager showing „1" beside
  a tag whose delete is then refused over 2 is the screen contradicting itself. It therefore counts assignments and not
  visible rows, so a **retired** item counts — it still carries its tags, and a cascade would still have stripped them.
  **The order is set by the drag grip** M6 and M25 use (ADR-075): the tag is dragged to the gap it belongs in, any
  distance in one move. **Reordering renumbers from the order on screen** and writes only the rows that change:
  `sort_order` is an integer with no room between neighbours, and the axis routinely arrives flat, because `createTag`
  takes `tagList.length` while a restore and the dev seed produce all-zero orders. The grip is **drawn dashed (inert)
  while a search is narrowing the list** — a move between two rows eleven apart on the axis is an ordering nobody can
  predict.
* **FR-24.11 (The Search Creates What It Did Not Find, *built*):** while M9's search holds a query that **no active
  item carries as its exact name**, the top of the results offers
  *„‚{Name}' anlegen"*. A tap opens a sheet with the **name** (the query, trimmed) and the **tags** — nothing else;
  weight, price, the mark and a photo stay M10's, reached from the toast's *„Öffnen"* or from the sheet's second
  button *„Anlegen und öffnen"*. *„Anlegen"* writes the item exactly as M10's creation does (FR-24.5: a blank name is
  answered with a hint, a name another active item holds is refused before the push) and **leaves the user on M9**:
  the query and the filter survive, the new row appears among the hits marked *„Neu"*, and the offer goes, because the
  name now exists. *Why:* the inventory is a lookup surface (FR-24.6), and the moment a lookup fails is the moment the
  user knows what is missing — the FAB alone would make them retype it on a second screen and lose the search on the
  way back. Five rules decide the details:
  * **The offer answers a missing name, not an empty result.** „Zelt" finds *Zeltheringe* and *Zeltunterlage* and
    the tent is still missing; an offer made only in the no-match state would never reach that, the commonest case.
    „Exact" is the **search's** fold (`domain/search.ts`, both umlaut spellings), deliberately wider than the naming
    rule's: „gurtel" typed while „Gürtel" is listed is the belt, and offering a near-duplicate is the one answer that
    cannot be right. It blocks an *offer*, never a write, so the wider fold costs nothing.
  * **At the top, the same place with or without hits** — with the keyboard up the end of a list of partial hits is
    out of reach. Enter in the field **opens the sheet and never writes**: a typo must not become an item.
  * **The filter's tags come along.** Every tag narrowing the list is assigned from the start, because without it the
    new item would vanish from the filtered list the moment it exists, which reads as a failed write. *„Ohne Tag"* is
    a bucket, not a tag, and assigns nothing. The tags of the items the query found **by name** are offered first.
  * **A retired name is offered back, not re-created.** Retiring frees the name (ADR-034), so a second row would be
    allowed — but it would start without the tags, weight and history the hidden one kept. The row reads
    *„‚{Name}' ist stillgelegt — Wiederherstellen"* and is M23's restore, in place.
  * **No offer while the master partition has not arrived** (ADR-033 — „no such item" is a claim about a list the
    device may not hold) **and none in FR-24.9's selection mode**, where rows do not navigate.
  *Considered and rejected:* the form **inline** in the list (no overlay, but it pushes the hits off screen and leaves
  no room for tags under a raised keyboard), and handing the name to M10 as `?name=` (no new UI, but the search and
  the filter are gone — the round trip this exists to remove). The tag control is **one component shared with M10**
  (`TagChooser`), so filter-or-create stays one rule. An empty inventory has no search field (G-7's empty state stands
  in for it), so the offer cannot appear there — the FAB and the spreadsheet import are that state's two ways in.
  * **M10's two dependency pickers make the same offer.** Without it, declaring a *Begleitartikel* (FR-20.1) the
    inventory does not hold yet means leaving the item in hand, creating the other one in M9, finding the first again
    and only then declaring the pair. The picker's query carries the same offer through
    the same control and the same sheet, and taking it **declares the pair in the same act**: the new item depends on
    the one being edited, in the default mode, and the user stays in that editor with the picker closed and the new row
    in the list. This item's tags are offered first in the sheet (the batteries are filed where the headlamp is); none
    is pre-assigned, because there is no filter to vanish from. A **retired** name is offered back and declared in one
    tap too — but the cycle check runs **before** the restore, because a retired row keeps its dependency rows: a
    refused companion must not leave the item un-retired as a side effect. A new item has no edges, so its declaration
    cannot close a cycle. *„Hängt ab von"* makes the same offer from the other end: there the new or restored item
    becomes the **main item** this one depends on, and its cycle check is that edge's.
    Both pickers share one sheet.
  * **The add composer makes the same offer.** The quick-add that M4, M6 and M8 share (FR-5.6/25.13) works like the
    inventory — search, and create what is not there, **with the same component**. The composer:
    * **searches with M9's rule** (`domain/itemSearch`, FR-24.7 — both umlaut spellings, tag names, mark keywords; one
      character is a query), and a hit that does not visibly contain the query says why (*„über Camping"*);
    * **makes M9's offer above its hits** through the same `SearchOfferButton`, under the same test (no *active* item
      of exactly this name, by the search's fold; none before the partition has arrived, ADR-033), and takes it
      through the same `CreateItemSheet` — name and tags, the tags of the name hits offered first, none pre-assigned
      (the composer has no filter to vanish from);
    * **adds what the sheet created at once**, like a picked suggestion: for whoever FR-25.28's strip names on M4, as
      a position on M8, as a row of the open tab on M6. The composer stays open for the next name; *„Anlegen und
      öffnen"* adds and then opens M10;
    * restores a **retired** name in place (M23's restore) and adds it in the same tap — its tags and weight are still
      there, so there is nothing left to ask;
    * gives the **confirm button and Enter** exactly two jobs: add the item the query names exactly, or take the
      offer. A new name therefore opens the sheet and **never writes on its own** — FR-24.11's typo rule. A name the
      scope already carries says *„‚{Name}' ist schon drin"* and the confirm rests.

    *Consequence, accepted:* **the composer makes no ad-hoc rows** — an unknown name never becomes a trip row no
    inventory knows, with no tags, no weight and no second life on the next trip, nor a master item created silently
    from the bare name. Rows without a `source_item_id` still exist — from the portable import, from older trips, from
    another device — and every rule that reads them (FR-25.1's name-held clusters, FR-27.5's *„Eigene Artikel"*, M14's
    *„ins Inventar übernehmen"*) keeps handling them; the composer just does not produce them. *Considered and
    rejected:* keeping ✓ as
    the ad-hoc add with the offer beside it — two answers to one unknown name, and the quicker one would have been the
    one without tags. *Scope:* all three screens, because the composer is one component (FR-25.13's „one way to add,
    everywhere"); M3's wizard does not use it.

* **FR-24.12 (Tidying the Inventory Up, *built*; screen M24):** M9 reaches a screen **„Aufräumen"** that runs a set
  of **rules** over the inventory and lists what each one finds, every finding beside **the one repair that answers
  it**. Its first rule is „every item carries at least one tag". Three rules ship, a fourth is owed:
  * **Ohne Tag** — an active item with no tag. Repair: a **suggested tag**, one tap, or **„Tag wählen …"**, which is
    FR-24.9's give sheet — searchable, and it creates a tag it does not find (see FR-24.9). **A suggestion is offered
    only with its reason, and the reason is shown:** first the primary tag most fellow positions of the item's active
    **Vorlagen** carry (ties by the axis order) — somebody put it there on purpose; failing that, a *name neighbour*
    (the tagged item sharing the longest folded name prefix, at least four letters — Zahnseide „wie Zahnbürste") lends
    its primary tag. The Vorlagen come first because German compounds make a shared first word common and weak: a
    name neighbour alone would offer *Bad* for a Reiseadapter filed in „Strom & Laden", because it shares „Reise" with
    the Reiseapotheke. No reason, no offer — a guess that cannot say why is the column everyone learns to ignore.
    Several suggestions can be taken at once.
  * **Lange nicht gebraucht** — in no active Vorlage, and its last known trip ended more than *N* months ago (6, 12 or
    24; 12 by default). Repair: **Stilllegen** (FR-24.3's retire; the undo is M23's restore) or **Behalten**. Two
    deliberate limits: an item **never** on a trip is not flagged, because items carry no creation date and one created
    yesterday looks exactly like one forgotten for years; and an untagged item is left to the first rule, so one row is
    one question. **One limit it can only admit:** in Server Mode a device holds only the trips it has opened (ADR-032),
    so a more recent use may sit in a trip it has not seen — the card says how many trips in the window it has not seen,
    and stays silent in Local Mode, where there are none.
  * **Tag mit nur einem Artikel** — a tag exactly one active item carries: a typo of another tag, or a category that
    never caught on. Repair: **Zusammenführen …**, FR-24.10's merge through the same prompt the tag manager uses, or
    **Behalten**.
  * ***Similar names*** (*owed*) — its repair is FR-24.15's item merge: a rule that finds a duplicate can hand over
    the act that fixes it, the shape „Tag mit nur einem Artikel" already has.

  **A rule finds; it never refuses.** „At least one tag" cannot be a constraint: an assignment is its own `item_tags`
  row, and a mutation refused for breaking a cross-row rule is one the outbox drops (the argument that keeps
  `retired_at` free of CHECKs). Untagged items also keep arriving by design — FR-24.11's quick create, the spreadsheet
  import, M21 — so the rule runs afterwards over what is there. **No repair is a new way to write:** giving a tag,
  retiring and merging are FR-24.9/24.3/24.10's acts, and every one raises a snackbar with **Rückgängig**. The rules are
  pure client-side functions (`domain/inventoryHygiene`, invariant 4), so Local Mode has them.

  **Which rules run, the window, and every „Behalten" are device-local** (FR-24.4's persistence class), by choice of
  the cheaper option. *Cost, accepted:* in the multi-user case a „Behalten" pressed on one phone is not seen on
  another, and the household member is asked about the same camping stove again. **Revisit trigger:** that complaint
  — the fix is a column on `items` and `tags` and a reseed. **M9's entrances:** a word behind the app bar's ⋮
  (*„Aufräumen"*, offered whatever the count — „alles aufgeräumt" is an answer the screen gives, and the rule settings
  live there), and a sentence at the list's foot beside the retired count, *„N Hinweise zum Aufräumen"*, present only
  while something is found, never before the master partition has arrived (ADR-033) and never in the selection mode.
  *Considered and rejected:* a banner above the list (a list that is untidy is not wrong, and a standing banner is noise
  the day after); and making the tag mandatory in M10 (the refusal above).

* **FR-24.13 (A Tag Carries a Mark, *built*):** a tag may carry **one emoji**, the item mark's column on `tags` (`icon`,
  FR-28.1's shape: optional, capped at 32 bytes, no „is it really an emoji" check — FR-28.9), chosen with the item
  mark's own picker (FR-28.2) and rendered through `ItemMark`, so FR-28.5's confinement
  of the mark face still holds. **Where it is set:** the tag manager (FR-24.10) gives every row a mark control — the
  mark, or an empty dashed slot. **Where it shows:** M9's tag chips and group headings, the tag filter sheet and
  FR-24.9's give/take sheet. **It fills M9's leading slot:** the inventory ladder (FR-28.4) gains a rung — photo → the
  item's mark → **the primary tag's mark** → the tag's initial — and the borrowed mark is painted muted, so an item's
  own mark stays recognisable beside it. Only on M9: the packing surfaces keep FR-28.4's empty slot, because a tag's
  mark beside every row of a packing list is decoration, not identification. **The portable format does not carry it** —
  a trip document names tags by name only, and adding a tag vocabulary section is its own change; the NFR-4.5 backup
  does, being every column of `tags`. *Considered:* the mark at creation time in the give sheet (a strip of marks) —
  deferred, because the sheet then needs the picker inside a sheet, and the manager is one tap away.
* **FR-24.14 (Merging Several Tags In One Act, *built*):** FR-24.10's *„zusammenführen"* takes **one** source and one
  target. Filing a grown axis is rarely one such act: *„Sommer"*, *„Sommerurlaub"* and *„Sommersachen"* are three rows,
  two merges and two confirms, and the user carries which tag
  is meant to survive across both. The tag manager therefore has a **selection over tag rows** — FR-24.9's idiom, one
  screen further in — with one *„Zusammenführen"* over it: the user names the **target** among the picked tags, every
  other picked tag is re-pointed at it, and the sources are deleted once nothing carries them.
  * **One plan over the set, not a merge per pair.** The rule per item is FR-24.10's, but `planTagMergeMany` decides
    the whole selection in one pass, and that is the feature rather than an optimisation: an item carrying **two** of
    the picked tags would otherwise be re-pointed twice, because each pair is planned against assignments the
    previous merge has not written back yet — two `item_tags` rows naming the target for one item, which
    `UNIQUE (item_id, tag_id)` refuses on the server *after* the outbox has accepted both. So exactly one assignment
    per item survives: the **lowest-positioned** picked tag is re-pointed at its own position and the rest are
    dropped, or — where the item already carries the target — every picked tag is dropped and the target inherits the
    lowest position. Either way FR-24.2's heading does not move, which is what FR-24.10's promote clause buys for one
    pair and this keeps for N.
  * **The target is named in one sheet, the same one the single merge uses.** It lists the picked tags **with their
    assignment counts, largest first** — the tag most items already carry is almost always the real one, and it is
    the choice that moves the fewest rows. The target comes from *inside* the selection: picking one outside it would
    make „these three are one thing" mean something else on the next screen. *Considered and rejected:* a
    multi-source picker grown into the row act (one entry point, but the selection is the idiom the screen next door
    already teaches), and a confirm per pair.
  * **The confirm names the surviving tag, how many items move and how many tags go.** A merge is the one act in the
    inventory with no undo (ADR-063) and an N-way merge loses N times as much in one tap. The number it states is the
    **upper bound** — the sum of the sources' assignments — because an item carrying two of them ends under the
    target once; the toast afterwards reports what the merge actually did, counted in items. A confirm may overstate
    the work and may never understate it.
  * **The selection survives the search and the act.** A picked tag stays picked while a query narrows it off the
    screen — two spellings of one idea are rarely one query — and the manager stays open with the mode on afterwards,
    because tidying an axis is rarely one merge. The merged tags leave the selection by themselves: it is read
    against the axis, and they are no longer on it.
  * **While picking, a row asks one question.** The rename control, the arrows, the mark and the two per-row acts
    withdraw, so the only thing a tap can mean is *pick this one* — FR-24.9's rule for M9's own rows, one screen in.
  * **It selects the way every list does (ADR-075)**, with the shared pieces: a **hold** (or right-click) on a tag
    row picks it and starts the mode, the head's checkbox icon starts it empty and ends it, the bar is the lists' own
    (*✕*, *„N ausgewählt"*, *„Alle N"* — the rows the search leaves), and *„Zusammenführen"* waits in the same bulk bar
    at the sheet's foot, dimmed under
    two. The release that ends a hold is spent on the pick, so a hold that lands on the name never also renames.
* **FR-24.15 (Merging Duplicate Items, *built*; the trade is **ADR-069**):** two inventory rows that are the same
  thing — *„Stirnlampe"* and *„Stirnlampe Petzl"*, typed a year apart on two devices — are **merged into one**: the
  user names the survivor, and the other rows' references move to it before they go. FR-16.3's deduplication answers
  this **on import** (M15, M18) and only there; typing is the other way a duplicate is born, and this is its answer.
  FR-27.5's rejection of fuzzy matching in M21 rests partly on *„a duplicate master item is visible in M9 and can be
  merged"* — this is that merge — and FR-24.12's owed fourth rule, *similar names*, hands over to it.
  **Where it is done:** FR-24.9's selection mode, behind the ⋯ sheet, offered from **two** picked rows up. The
  survivor is named in a sheet that lists the candidates with **what each brings** — its tags, its weight, whether
  it has a photo, and how much of the product resolves against it — **most-used first**, because the row a
  duplicate was split off from is the one the rest of the data already hangs on. The confirm names the survivor and
  how many rows go; there is no undo (ADR-063's rule, one table over).
  **What a merge moves, and how each collision resolves** (`domain/itemMerge.ts`, one plan over the whole set for
  FR-24.14's reason — the writes of one pair are not in the store when the next is planned):
  * `item_tags` — the union, minus what `UNIQUE (item_id, tag_id)` refuses. **The survivor keeps its own primary
    tag** and a re-pointed assignment is appended after it: unlike FR-24.14, what the user chose to preserve here is
    the *item*'s filing, not the tag's.
  * `item_dependencies` — both ends move, and three shapes cannot: an edge **between** two merged rows (it would
    become the `CHECK (item_id <> depends_on_item_id)` self-edge), one the survivor already has (`UNIQUE`), and one
    that would close a cycle the two rows kept open while they were apart (§3.20). Each is dropped, counted, and
    **named in the sentence afterwards** — a merge may not be refused by an edge the user cannot see from the
    inventory, but it owes them the fact.
  * `template_items` — `UNIQUE (template_id, item_id)`: a Vorlage holding both ends with **one** position. It keeps
    the survivor's settings (or, where the survivor is not in that Vorlage, the first loser's position becomes the
    survivor's and the rest fold into it), takes the **higher `quantity`** — FR-2.3's `dedup: max`, the product's
    existing answer to the same item twice — and **carries the dropped position's FR-27.7 tasks over**, because
    user-typed prose is the one thing a merge may never drop. This is why the position is *updated* rather than
    re-created: `template_item_tasks.template_item_id` is `ON DELETE CASCADE`, so a delete-and-add would take the
    words with it.
  * **The survivor's own empty fields** — `weight_grams`, `value_cents`, the §3.28 mark and `default_assignee_id`
    (FR-1.9) are filled from the losers in the order they were picked, and **never overwritten**. The photo is the
    same rule and the only part of a merge that moves **bytes** (ADR-002): it is *copied* where the survivor has
    none, after the mutations, so the losing row keeps its own. *Why not a per-field prompt:* the survivor was
    chosen because it is the better row; what the act owes instead is a sentence naming what it took over, which is
    the part of a merge that is invisible on the list afterwards.
  * **History stays where it is** — `trip_items.source_item_id` and `trip_generated_positions.source_item_id` are
    **not** re-pointed. The reasoning, the two rejected alternatives and the accepted costs are **ADR-069**.
  **The rear view reads the two pasts as one, through an alias.** `items.merged_into_id` is written on each losing
  row — before the delete, and even for a row about to be removed outright, so a device that sees only those two
  changes still learns where the row went. `mergedIdsOf` gives M10's FR-27.9 section the survivor's id plus
  everything aliased at it; `resolveMergedItem` answers the other direction. **One hop, never a chain:** the plan
  flattens older aliases at merge time, and a reader treats an alias whose target is itself aliased as no alias —
  which is what makes two devices merging the same pair in opposite directions degrade to unaliased history instead
  of looping. **FR-27.8's „Enthalten in" and FR-8/FR-14's analytics deliberately do not read it**: the first reads
  template positions, which the merge re-points itself, and the second aggregates trip rows by name and category.
  * **The column clears itself** (`ON DELETE SET NULL`): deleting the survivor — which FR-24.3 only allows once
    nothing else resolves against it — gives the merged-away rows their own past back rather than refusing a delete
    over a pointer nobody can see. `internal/store`'s foreign-key guard is what insisted the question be answered.
  **What happens to the loser: FR-24.3's ordinary delete, not a third lifecycle.** Retired while anything still
  references it — which, with history left in place, is every item that was ever on a trip — and removed when
  nothing does. Retiring **frees the name** (`idx_items_active_name` is partial over active rows), so the survivor
  can be renamed to the loser's wording straight afterwards. The retired row is **not an undo**: it preserves the
  loser's own data and not the references that moved. **M23 therefore says which rows got there by a merge** and
  names the survivor (*„zusammengeführt mit ‚Stirnlampe'"*), because its restore is otherwise an offer to re-create
  the duplicate the user just removed — and the restore **clears the alias**, since a row that is active again has
  a past of its own.
  **Still owed, deliberately:** FR-24.11's near-miss search as a second entry point (*„Zelt"* finding two tents is
  where a duplicate is actually noticed) and FR-24.12's *similar names* rule. Both are second ways into the same
  sheet and the same rule, which is why neither blocked this.

* **FR-24.3 (Lifecycle-Aware Deletion of Master Items and Vorlagen, *built*):** Deleting a master item or a Vorlage
  behaves differently according to whether it has ever been used:
  * **Ever referenced** — a trip item was instantiated from it (historical or active), or a template includes it —
    deletion is **logical only**: the row is **tombstoned** (hidden from the inventory, from item pickers, and from
    quick-add autocomplete) but retained, so historical trips, analytics (FR-8, FR-14), and attributions keep resolving
    against it.
  * **Never referenced anywhere** — deletion is **physical**: the row is removed outright.

  **Where the refusal still stands.** The `stillReferenced` check chooses between the two branches for master items and
  Vorlagen. Every entity FR-24.3 does *not* name (a series a trip uses, a traveler a row is assigned to, a container)
  keeps the refusal: the push answers `still_referenced` (Sync-API §5), because those are not history the way a master
  item is, and a retired traveler would be a person nobody can see attached to rows everybody can.

  **The rules of the decision.**
  * **The marker is a column, not a table**: `retired_at TEXT` on `items` and `templates`, NULL while active, an RFC3339
    stamp once retired, on the sync whitelist like any other field. It carries **no `NOT NULL` and no `CHECK`** on
    purpose — field-level LWW merges it independently, and a constraint able to refuse a single-field mutation loses the
    user's decision, since a rejected mutation is one the outbox drops.
  * **Name uniqueness ranges over the active rows.** Both tables carry a partial unique index on the name over
    `retired_at IS NULL`. A name held by a row no screen shows is a name taken by nothing, and re-creating the item you
    just deleted is the common case, not the exotic one. FR-16.3 and FR-1.6 range over the active rows too.
  * **The retire re-logs the children the client mirrored away.** The device that asked for the delete drew its cascade
    optimistically, so a retired Vorlage would otherwise reappear with none of its positions — the same debt ADR-031
    pays for a refusal.
  * **The decision is made twice, deliberately** (ADR-032): authoritatively on the server, where the complete reference
    count lives in Server Mode, and advisorily on the client, which is authoritative in Local Mode and everywhere else
    exists to state the outcome before the confirm. A client that guesses "remove" where the server retires costs a
    wrong sentence, never a wrong row.
  * **Where M7 owes the same statement, it gives it.** A Vorlage is the FR-9.2 case, so M7's existing delete confirm
    carries the sentence too. Its separate FR-27.6 guard — a group another Vorlage *includes* is refused, naming the
    consumer — stands: that is a structural rule about composition, asked before FR-24.3 is asked anything.
  * **Restore, and what it costs.** The data half is free: the marker is an ordinary field, so one mutation clears
    it. A retire is one-way in practice without a surface that lists retired rows; that surface is **UI-Spec M23**,
    off M17 beside the conflict-log pointer — the three alternatives (a filter chip on M9's tag axis, a folded section
    at the foot of M9 and M7, a `?retired=1` mode of M9) are weighed and rejected there.
    The name is not free. **Retiring frees the name on purpose**, so an active row can hold it
    by the time the restore is asked for — and then two active rows would share a name, which is what FR-16.3/FR-1.6
    exist to prevent. The restore is the write that loses, and it loses **on the client, before the mutation is
    enqueued**: the device holds the whole master partition, so this is the one FR-24.3 question it can answer *exactly*
    in all three modes, unlike the reference count ADR-032 had to make advisory. **The refusal carries its own way out**
    — a replacement name, written in the *same* mutation as the cleared marker, because two writes leave a moment where
    the index is violated and the second one can be the one the outbox drops. The whole tradeoff, and the three answers
    rejected (refuse and stop, merge into the holder, let the push refuse it), is **ADR-034**.
  * **A retired row does not become undeletable.** Once whatever kept it alive is itself gone, FR-24.3's second branch
    applies to it again, and M23 offers *delete for good* on exactly those rows — absent, with the usage count saying
    why, on the rows still referenced. Without it the retire would be permanent by omission, which is not what "logical
    delete" was supposed to mean.
  * **Several at once (ADR-075).** M23 selects like the app's other lists — a hold, a right-click
    or the app bar's checkbox icon — and a bar restores or deletes the selection with the same per-row acts, looped. A
    batch keeps both refusals the single act has. **Restore:** every row whose name is free comes back in one go; a
    row whose name is taken is *not* prompted for — it stays selected and the toast says how many did not come back,
    because a queue of rename dialogs, each about a name the reader has to recall, is worse than a list of what is
    left. A selection of one *is* the single-row restore, prompt included, so the way to a new name is unchanged. The
    rows restore in order, so two hidden rows of one name collide with each other and the second stays. **Delete:**
    only the rows the single delete is offered on; one confirmation names how many go for good and how many stay
    because something still uses them, and those stay selected. A selection with nothing deletable asks nothing and
    says why. Neither act gains an undo — the single ones have none — and switching the segment ends the selection.

* **FR-24.4 (A Master Row Has A Delete Endpoint, *built*):** Deleting a master row from outside the app is one
  authenticated request — `DELETE /api/v1/master/{tags|items|templates|template-items}/{id}` — rather than a
  hand-composed sync mutation. **Why:** without it the only write path is `POST /master/sync`, whose shape is
  load-bearing for the app and pure overhead for anyone else — a caller with no local state would have to invent a
  device identity, format a 13-4-8 HLC, mint a `mutation_id` and read a per-mutation outcome array, all to remove one
  row. Every external tool would have to become a partial sync client, which is the duplicate-implementation class
  **ADR-025** is about, only outside this repository where nothing could notice it drifting.

  **The endpoint holds no rule of its own.** It mints the clock and the mutation id the caller would otherwise compose
  and hands an ordinary delete to `ApplyMasterMutation` — the same function the push calls — so FR-24.3's
  retire-or-remove decision, the authorization and the change-log entry stay where they are. **The
  response carries `retired`** because that is the one thing the status code cannot say: a `200` on a row FR-24.3
  retired does not mean the row is gone, and a caller cleaning up must not have to pull the partition back down to find
  out. An unknown id answers `404` rather than an applied delete of nothing, so a script working through a list can tell
  a row it removed from one it never had.

  **The app deliberately does not use it** (ADR-038). Its writes have to survive being offline, and Local Mode has no
  server at all (invariant 5), so it keeps writing through the outbox and the push; making the client call the route
  when online and the outbox when not would produce three write paths for one act and would exercise the online one in
  development while leaving the offline one — the one an offline-first app most needs confidence in — untested. The two
  doors differ in transport and share the rule.

  **Four tables, as an allowlist rather than a partition.** `tags`, `items`, `templates` and `template_items` — what M7,
  M10 and M23 delete. `trips`, their membership and their series are in the same partition and stay unreachable:
  deleting a trip is a different act with a different authorization story, and a path parameter must not be able to ask
  for it. With this set a delete cannot be *refused* — the four are shared, so nobody is unauthorized, and a reference
  retires an item or a Vorlage rather than refusing it — which is why the endpoint has no per-reason error code and why
  a test, not a comment, fails the day a widening makes one possible.

  This is the item-granularity counterpart of the account-deletion reasoning in FR-23.5 (an id that is a foreign-key
  target across history cannot simply vanish), while keeping the common case — deleting a just-created mistake — clean
  and tombstone-free. The Item Editor (M10) surfaces the item's usage count and states, *before* the user confirms,
  which of the two deletions will happen. Sync consequence (master partition): a logical delete is an ordinary tombstone
  in the master change-log; a physical delete is safe precisely because, by definition, nothing references the row.
  **Restoring a logically-deleted row is one mutation clearing the marker (M23)** — the *data* is free; the *name* is
  not, because retiring releases it and the row that took it has to be made room for (ADR-034).

**Architecture note:** the model is an item→tags many-to-many relation (`item_tags`) over a first-class `tags` table
with its own ids, which is what makes a rename one row, plus the `retired_at` marker on items and Vorlagen; the exact
schema is `internal/store/schema.sql`'s and is deliberately **not** restated in this document.

### 3.25 Packing-Screen Concept Refinements (M2 / M4 / M5 / M6 / M8)

**Status: proposed** — **not yet implemented**. M4 (the packing list) is the product's core screen and is to be
**re-mocked from scratch** with these in mind; the points below are the binding intent for that redesign. Moves to
*accepted* + schema when the concept is locked.

* **FR-25.1 (Per-Traveler Packing Instances):** For per-person items (FR-1.4), the packing list (M4) shows **one packing
  instance per traveler**, each independently checkable and labelled with the traveler (name/avatar), so it is visible
  *which* instance is packed *for whom*. Each instance is a real `trip_items` row (the item is generated per traveler,
  FR-1.4; the row carries `assigned_traveler_id` and its own `quantity`/`packed_count`/`state`/`packer`), so
  per-traveler quantities (FR-25.8/25.9) and independent packing fall out of the existing model — no new structure.
  **Presentation:** the instances render as a **named cluster** — the item name appears **once** as a sub-header
  carrying a `done/total` count over its instances, with one **indented child row per traveler** (avatar + name + its
  own check/stepper). Rationale: the cluster gives the same ownership clarity as flat rows (every child shows avatar +
  name) while naming the item only once and scaling far better for larger families. **Flat fallback:** where a
  per-person item contributes only a *single* instance to the current group — most notably when the list is **grouped by
  traveler**, but also any lone instance — that instance renders as an ordinary flat row labelled "Item · Person" (a
  lone one-child cluster would be noise). For per-person items this takes the place of the pure `packed_count` progress
  of FR-5.4 (which remains the model for trip-global quantity items like "8 of 10 T-shirts"). **The cluster obeys
  FR-25.2** — a done instance drops out (and the whole cluster disappears once every instance is done), while the
  sub-header keeps `done/total` over the full set.
  * **Cluster identity.** Because the instances are *separate* `trip_items` rows, something has to make them
    recognisable as instances of **one** item; otherwise they render as N unrelated flat rows repeating the same name.
    The grouping key is **`source_item_id` when the rows came from a master item, and the trip-scoped,
    case-insensitively normalised item `name` when they did not** — ad-hoc quick-adds (FR-5.6/25.8) create no master
    item, so a name-based fallback is required, not optional. Two further rules keep the list stable while packing: the
    key is **scoped to the current group**, so instances in different categories or containers do not merge across group
    boundaries; and **cluster-vs-flat is decided over the full instance set, before FR-25.2 hides anything** — otherwise
    packing one instance of a two-person item would silently restructure the list under the user's finger. The full set
    is the one the **person facet** lets through (FR-25.30); every other facet, the search and the done rule leave the
    shape alone.
* **FR-25.2 (Completed & Skipped Items Hidden by Default):** An item that is **done** — either fully packed, or
  consciously skipped (FR-5.5) — is **hidden from the active packing list by default**, keeping the working list focused
  on what is left. A persistent, unobtrusive control re-reveals them — *„{n} Erledigte anzeigen"* / *"Show {n} done"*;
  revealing is non-destructive and per-user. **The word is the neutral one:** one word covers both halves of *done*,
  packed and deliberately skipped alike, and there is no second count beside it. Skipped is an ordinary case, not a rare
  one: closing a packing (FR-5.10) decides every row still open in a single act. **When revealed, a done row sinks to
  the end of its group and wears its name struck through:** sinking says the same thing the hiding says — this one is
  not waiting for you — without taking the row away, so the rows still asking for something stay together at the top
  instead of being interleaved with the settled ones. Order within each half is untouched, and the strike is used rather
  than a blanket dim, which would also dim the FR-25.17 stamp naming who packed it and when — the one part of a done row
  still worth reading. The row stays interactive, so a mistaken pack can be corrected. Two exemptions, each for the same
  reason — a list where everything is done sorts by an axis nobody is working through: **a cluster sinks only when every
  visible instance is done** (the head names one item and cannot be in two places, and the people inside it keep their
  traveler order), and **FR-9.3's closing pass does not sink at all**, since everything it lists was packed by
  definition and "done" there separates fully packed from partly packed. A row counts as *done* only when fully packed
  **with no open preparation task** — a "packed with open prep" row (FR-7.3) stays visible because work remains. Group
  headers keep their `done/total` count over the full set even while the done rows are hidden, and a group all of whose
  rows are done collapses entirely (header included). This extends FR-5.5 (which only collapsed *skipped* items) to also
  hide *packed* ones. The reveal toggle sits at the list foot. Disappearing is **animated** (a brief green flash +
  control pop, then the row collapses to zero height and fades — ~0.3 s) so the pack registers visibly rather than the
  item just vanishing, and an **undo snackbar** ("„<name>" gepackt ✓ · Rückgängig") gives an immediate correction path.
  *Built:* a `<TransitionGroup>` leave on the M4 row — the DOM holds the node while it collapses, so nothing in the view
  model has to track "still animating" — with the wash in the `--jp-done` role and the whole thing dropped under
  `prefers-reduced-motion`, where the row still leaves and the snackbar still offers the undo. **One undo, not a
  stack:** packing is a run of taps, so a second pack replaces the first snackbar rather than queueing behind it.
  *Un*-packing a revealed row is announced like every other act on the list (FR-25.31), although its result is already
  on screen. The undo restores only `packed_count` and `state`, re-read against the current row rather than the caller's
  snapshot, so it cannot revert a packer avatar or a sync that landed in between.
* **FR-25.3 (Packer Attribution on the Row):** When a user marks an item packed, that item's row shows the **packer's
  avatar/circle** (who packed it), not only in the detail sheet — so a collaborating couple sees at a glance who handled
  what, in the list itself (builds on the FR-4.2 *Packed by*). **Presentation:** the packer avatar sits at the **right
  edge** of the row, visually set apart from the traveler avatar ("for whom", which stays on the **left**) by a **green
  ring + a small check badge** — so "for whom" and "by whom" never read as the same thing, even on a per-person row
  whose traveler *is* the packer (two same-initial circles, disambiguated by the ring). It appears as soon as
  **anything** is packed on the row — including a *partially* packed multi-quantity item (e.g. "4/6", packed by Andy) —
  not only when fully done, so the attribution is visible on the default (unhidden) list and not just on revealed done
  rows. On a per-person **cluster** (FR-25.1) the avatar attaches to each packed **child row** individually, since
  instances can be packed by different people. The row carries no "gepackt von …" subtitle text (the avatar carries it;
  the name is a hover tooltip). **Interaction with FR-25.2 (hide-done):** because fully-packed rows are hidden by
  default, the packer avatar is most prominent on partially-packed rows and during the brief pack animation before a row
  collapses; on revealed done rows it shows dimmed with the row.
* **FR-25.4 (Procurement Modes — Icons, Filter, Clearer Naming):** The three procurement modes (FR-3.1) are shown as an
  **icon on the row** and are filterable in M4. Their labels keep timing and procurement apart: **🧳 Packen · 🛒 Vorher
  kaufen · 📍 Vor Ort kaufen**. The **Late Packer** flag (FR-5.1) is *kept* but is explicitly a **separate concept**
  (pack-timing, not procurement) with its own distinct marker (⏰); it is not one of the three modes, and naming +
  iconography keep the two apart. **Presentation:** (a) *icon only on the two buy modes* — 🛒/📍 rows carry a coloured
  mode glyph while **🧳 Packen rows stay icon-free**. Deliberately not an icon on *every* row: packing is the dominant
  case, so marking every row with 🧳 is noise; leaving the default silent makes the **exceptions worth acting on**
  (something to buy) stand out. The glyph attaches to the item — on a per-person cluster (FR-25.1) it sits **once on the
  cluster header**, not on each child row. (b) *The mode filter is FR-25.11's* *Beschaffung* facet group —
  **multi-select**, the values **combine** (e.g. Vorher + Vor Ort together shows everything still to be bought). The
  view model has no mode filter of its own — `facets.mode` is the only one. (c) The ⏰ Late-Packer flag renders as its
  own amber marker on the row, orthogonal to the mode glyph (an item can be *pack* **and** late).
* **FR-25.11 (Faceted Filter Panel in M4):** M4's filtering is a **single collapsible facet panel** rather than a
  permanent strip of pills. Rationale: two horizontal bars that look alike but do opposite things — the grouping
  switcher (arranges rows) and a mode filter (hides rows) — are confusable, and "Person" is both a grouping and a
  filter; one panel also makes every axis filterable rather than procurement mode alone.
  * **FR-25.11a (Collapsed state):** M4 shows **one** row: a *Filter* button carrying the count of active facet values,
    followed by a **removable chip per active value**, and a *Reset* action. With no filter active the row instead
    states the current grouping ("Gruppiert nach Kategorie"). The chips are not decoration — **an active filter must
    never be invisible.** On a packing list a hidden row reads as "nothing left to do", and combined with FR-25.2's
    hide-done a filtered list can look complete while items remain unpacked.
  * **FR-25.11b (Panel):** tapping *Filter* opens a **bottom sheet**, not an inline accordion — M4 is full-screen with
    the tab bar deliberately hidden (§3.25) to win list height, which a panel pushing the list down would give back. The
    sheet holds **Gruppieren nach** at the top (the grouping switcher lives here, so the two axes are separated and
    explained rather than adjacent and confusable) followed by the facet groups: **Person, Kategorie, Beschaffung,
    Gepäck, Merkmale** (⏰ late packer / missing / has preparation). **The panel applies as you tap.** There is **no
    apply button**: every value is in force the moment it is tapped, and the head states the *outcome* of what the list
    behind the panel is already showing ("zeigt 14 Sachen"), next to a *Zurücksetzen* that appears only when something
    is set. Committing would be a fiction — the list underneath has changed already — and a button that claims otherwise
    costs a tap on every use.
  * **Values are chips, not an accordion.** Each facet shows all of its values at once. Folding them behind a caret
    makes the panel unreadable: the current filter would take one tap per axis to *see*, and FR-25.11d's counts — which
    say what picking a value would yield, recomputed against the other facets — would stay hidden exactly while they are
    most useful. With chips they visibly shrink as you filter, which is the requirement doing its job in the open. There
    is no per-facet *Alle*/*Keine* pair: *Alle* is what an empty facet already means, and *Keine* is the same act as
    clearing it, which the facet's own *zurücksetzen* does.
  * **The panel is visibly a layer**, not part of the page: a lighter surface than the list, a rim, a shadow and a
    dimmed backdrop. At the same background as the screen it would read as an extension of it.
  * **The way out is a ✕ in a circle** at the top right, not a text button — it is the same affordance a sheet has
    everywhere else, and it never competes with *Zurücksetzen* beside it.
  * **Every axis carries an icon** — Person, Kategorie, Beschaffung, Gepäck, Merkmale, and the four *Gruppieren nach*
    options — so the panel is scannable before it is read. Same glyphs in both places for one idea (Person and Gepäck
    appear as both a grouping and a facet).
  * All-open chips were chosen over a master/detail split and one row per facet; the prototype carries them for M4 and
    M6 alike.
  * **FR-25.11c (Combination semantics):** values **within** a facet are OR'd, facets **across** each other are AND'd —
    the convention every shop filter uses, so it needs no explanation in the UI. An empty facet means *no restriction on
    that axis*, never *show nothing*.
  * **FR-25.11d (Counts):** each value's count is computed against the **other** active facets but not its own, so the
    numbers say what picking it would yield. Counts run over **open** rows only; offering to filter for work already
    done would mislead. A **selected** value is always listed even at count 0 — otherwise a filter could become
    impossible to undo from inside the panel.
  * **FR-25.11e (Empty states must be distinguishable):** an empty list means either "everything is packed" or "nothing
    matches", and conflating them is how a packing app tells someone they are finished when they are not. **The
    completion state may appear only when *nothing* is narrowing the list** — that means no active filter **and no
    active search**. Any narrowing in force yields "Keine Treffer", naming what is in force (the search term, the
    filter, or both) and offering a reset that clears **all** of it; a reset that leaves the search behind simply
    re-renders the same empty screen. A search for a string the list does not contain must never announce "Alles gepackt
    🎉".
  * **FR-25.11f (Shared items in the Person facet):** the whole-trip bucket appears as **"Gemeinsam"** (FR-25.10's
    term), listed first and never as "Alle" — a filter option labelled "Alle" reads as *select everything* rather than
    *shared items*.
  * The trip status line above the filter row stays **global and unfiltered**, so real packing progress is always
    visible regardless of the current view.
  * **FR-25.11g (The filter panel is one mechanism, not one per screen):** the panel takes a context describing its
    facets, switches and grouping rather than being copied per screen — a second filter implementation is how two
    screens drift apart, which is the complaint FR-25.13 came from. *Built:* `FilterSheet.vue` takes its facets,
    switches and grouping as props and knows nothing about M4. **RETIRED for M6:** M6 has no filter sheet and stays the
    focused procurement checklist it is — two tabs, category groups, the shared composer and the FR-25.11j reveal. A
    shopping list rarely runs to twenty rows, so the weight M4 carries here buys nothing; M4's own half of this FR
    stands.
  * **FR-25.16 (Collapsible groups):** M4's groups **fold**. Tapping a group header collapses the group to **that header
    line alone, which then carries the open count** ("Kleidung · 12 offen") in place of the done/total it shows when
    expanded; a **fold-all / unfold-all** control in the app-bar cluster turns the whole list into a table of contents
    and back. The count belongs *on* the header, not on a separate line beneath it: collapsed, the header is all that is
    left of the group, so it has to answer the question the hidden rows would have — and splitting one statement across
    two lines spends a row saying it twice. The collapsed set is per group key and survives re-rendering, so packing a
    row does not silently unfold the rest. Rationale: on a long list you work one category at a time and everything else
    is noise until you reach it. **This composes with, and does not replace, FR-25.2:** a group whose rows are *all*
    done still disappears entirely — header, stub and all — and only returns when "Erledigte" is switched on
    (FR-25.11i). Folding is a *view* state, doneness is a *content* rule, and the two must not be confused: a folded
    group with open items is still on your list, an absent group is not.
  * **FR-25.17 (Who packed it, and when):** when packed rows are revealed (FR-25.11i), each shows **"gepackt von Andy ·
    heute 14:32"** — relative day, absolute time, with the packer's avatar. Same treatment and the same helper as the
    shopping list's bought stamp (FR-25.12), because a finished row raises the same question in both places: not
    *whether* it is done but *who* dealt with it and *how long ago*. The stamp is written at the moment of the tap and
    **cleared when a row is un-packed**, so a stale attribution can never outlive the state it describes.
  * **FR-25.18 (M4 Filter Persists for the Session):** The M4 facet filter (FR-25.11), the *Erledigte* switch and the
    grouping choice are **remembered per trip for the duration of the session**, so leaving M4 for M5/M6/the dashboard —
    or the web view being reloaded after the app was backgrounded — does not throw the view away. Packing is a
    constantly interrupted activity; re-picking four facet values on every return is the friction that makes people stop
    filtering at all. **Scope: per trip**, matching the grouping rule in UI-Spec M4 — a Person filter on one trip means
    nothing on another. **Lifetime: the session, deliberately weaker than the grouping preference, which persists
    durably.** A filter *hides rows*, and FR-25.11a's own argument applies: a hidden row reads as „nothing left to do“,
    and combined with FR-25.2's hide-done a filtered list can look complete while items remain unpacked. Carrying a
    forgotten filter into next week's packing is exactly that failure with no visible cause, so a fresh session always
    starts unfiltered; within the session the removable chip row (FR-25.11a) keeps the filter visible at all times.
    **Not restored: the search term** — a momentary lookup rather than a view, whose field collapses behind its icon
    (G-12), so a restored term would filter with no control on screen. Storage is device-local session state
    (`sessionStorage` on the web, the per-launch equivalent under Capacitor); storage refused by the browser degrades
    gracefully — filtering still works, it simply forgets.
  * **FR-25.19 (Responsibility and packing record are two things):** who is *responsible* for a row and who *actually
    packed* it are two fields. Read from one field, delegating to Sia and then packing it yourself would make the app
    claim Sia had packed it. **„Zugewiesen an“** (one term across M4/M5 and M6 — one idea deserves one word) is assigned
    deliberately and triggers the FR-6.2 push (`packer_user_id`); **who actually packed it** is **written automatically
    from the acting user** the moment the row is checked, and cleared when it is un-packed (FR-25.17's rule). *A record
    you can pick is not a record* — there is deliberately no control for it. **On the row only one avatar occupies the
    right edge**: the responsible person before packing (blue ring), the person who packed it afterwards (green ring +
    check, FR-25.3) — with the traveler avatar on the left answering *for whom*, a third circle makes the row
    unreadable. Where the two differ, **the M5 sheet and the revealed-row stamp name both** („gepackt von Andy ·
    zuständig war Sia“), which is where there is room for it. Consequences: M1's *„Dir zum Packen übergeben“* reads
    responsibility, not the record; the record is `trip_items.packed_by_user_id`, a second, nullable column beside
    `packer_user_id` (migration 019). `packer_user_id` is the assignment alone and is the client's to set; the record is
    written by `stampActor` from the authenticated pusher when the state becomes `packed` and cleared on any other
    state, and a client-sent value is discarded before that (invariant 3). *M4 built:* the row's right edge carries the
    one avatar (assignee with a blue ring while open, packer with a green ring and check once packed) and the revealed
    row names both where they differ; migration 020 adds the `packed_at` the FR-25.17 stamp needs. M5's half follows
    with that screen.
  * **FR-25.20 (Other people's rows are hidden by default):** M4 opens showing **your** work: rows whose *responsible
    person* (FR-25.19) is somebody else are filtered out. They are that person's job, and on a shared household list
    they sit between you and your own. **Unassigned rows always stay visible** — nobody has claimed them, so they are
    everybody's; the default hides only what has an owner who is not you. **Never silently:** a reveal bar at the foot
    of the list states the count and names the people („3 Sachen liegen bei Sia · anzeigen“), exactly like FR-25.2's
    done bar, and one tap shows them. The switch also sits in the filter panel beside *Erledigte* — both are the same
    kind of control, hiding a class of rows, and belong in the same place. **The header stays unfiltered** (G-12):
    packed/total, weight and open prep keep counting the whole trip, which is what makes a short list safe to look at.
    State is kept per trip for the session like the rest of the view (FR-25.18); a fresh session returns to this default
    rather than to "everything". In Single-User and Local Mode nothing is assignable, so nothing is hidden.
  * **FR-25.21 (Per-Traveler Membership with Individual Amounts):** *„Wer braucht das?"* (FR-25.10) carries an amount
    per person: an item is either **gemeinsam** — one row for the whole trip — or **per person**, where **several
    travelers can be selected and each carries their own quantity** (Andy 2, Leonardo 3, Mia 1). **No new structure is
    introduced:** each selected traveler is one ordinary `trip_items` row with its own `quantity`, `packed_count`,
    `state`, container and packer, exactly the shape FR-25.1 chose so that per-traveler quantities „fall out of the
    existing model". M4's cluster, the FR-27.4 refresh and the M12 per-person analytics therefore need no change at all
    — they read rows and already sum. **M6 is the exception:** a per-person item appears in the shopping list as **one
    aggregated buy row** (FR-25.6) — because buying is a single act — keyed exactly like M4's cluster (`source_item_id`,
    else the folded name); it sums the quantities, shows the recipients' names and avatars, and one check-off writes
    FR-3.3 to every instance. N identical rows would be redundant, and with differing amounts plainly wrong (three
    „Kurze Hosen“ reading 2, 3 and 1). *Built* in `domain/shoppingView.ts`, with E2E-M6-05/06. **A rewritten row's state
    must stay true of its own numbers:** both conversions change what a row holds and how much of it is packed, and two
    of the states describe exactly those numbers — *skipped* is FR-5.5's quantity of nothing, *packed* means the count
    has reached the amount. Left standing over new numbers either one makes `isDone` true of a row that is not, and
    FR-25.2 then takes it off the list **while it is unfinished** — a skipped item split per person would vanish at the
    moment its rows are created. The repair is a derivation and not a policy — the state falls back to *open* exactly
    when it has stopped being true, and is left alone otherwise, so a collapse where every instance was packed stays
    packed and an in-progress claim is untouched. Only one of the two cases undoes a decision somebody made: taking a
    *weggelassen* row along again is **confirmed first**, naming the item and the person, while a packed row growing
    past its count is bookkeeping and is not worth a question. `packed_at` and `packed_by_user_id` are deliberately
    **not** cleared with the state: those units really were packed by that person, and the count still says so.
    **Membership is a checkbox, never a quantity of 0:** a checked traveler's stepper floors at 1, because 0 already
    means *skipped* (FR-5.5) and one control must not carry two decisions. **The control is one component on two
    surfaces** (invariant 4's second half): M5's *Details ▾* and M4's quick-add (FR-25.8). **Its surface is FR-25.28's
    for-whom strip on the row**, in M5 and in the quick-add, which asks its questions inline; every rule here stands. It
    is **absent** rather than disabled on a trip with fewer than two travelers (G-8) — there is no membership to
    distribute — and **read-only while any instance of the item is claimed by somebody else** (G-3), because a
    conversion rewrites rows another person is packing at that moment. Available in all three modes: travelers are trip
    records, not accounts. **Templates stay uniform:** a position keeps `assignment: per_person` with one per-head
    quantity, since a Vorlage written in March has no Mia to give a 1 to; per-traveler amounts are trip-level only and
    M8 is untouched. A hand-set amount is **protected** from a template refresh — `isProtected` in `domain/refresh.ts`
    compares the row's quantity against the generation snapshot — so FR-27.4 cannot flatten the amounts back to the
    per-head figure. **Three decisions:** **(a)** the **M4 cluster head counts units**, like every fraction on M4
    (FR-25.22): with Andy 2, Leonardo 3 and Mia 1 the child rows carry six units, and a head counting people (*of
    three*) would be the one line on the cluster that could not be added up from the lines beneath it. **(b)**
    **Collapsing back to gemeinsam sums the amounts** (2+3+1 = 6), it does not keep the largest: each amount is a
    decision somebody made, and the shared row has always carried a quantity above one (FR-5.4's „8 of 10 T-shirts"), so
    *gemeinsam* never meant one object. The confirm names the resulting figure, so a sum that is wrong for this item is
    visible before it is written and correctable with the stepper after. **(c)** The write path is a real tradeoff and
    gets **ADR-036** — keep-and-repoint, against delete-and-recreate and against a `trip_item_members` table. **M5 opens
    on one instance**, because the route is `trip/{id}/item/{id}` and a G-4 deep link lands on a row: M5 shows that
    instance’s own stepper, and every instance together lives in M4’s cluster and in the membership editor; FR-25.14’s
    rule — **the aggregate is a read-only chip, never an operable stepper, because „+1“ cannot say for whom** — is what
    the `3 Personen` glance chip is. **Three further rules:** (i) the editor has **no *Übernehmen* button** — every
    control commits immediately (G-5, FR-25.15); the footer keeps the running *„3 Personen · 6 Stück"* summary, which is
    the half a person actually reads. (ii) The `Pro Person` tab **shows the roster and writes nothing**: as an action
    its only possible effect with nobody picked yet would be to assign the item to whoever is first in the roster — a
    silent decision on somebody else’s packing list. Checking a person is the write. (iii) **A collapse of two or more
    always asks, even when it destroys no progress**, because it takes the personal row off *everyone’s* list and the
    resulting amount is worth reading first; a single traveler leaving asks only when their row carries something. Both
    destructive conversions — removing a traveler whose row has progress or notes, and collapsing N rows into one — are
    confirmed with the outcome stated *before* it happens, the FR-24.3/ADR-032 idiom; a traveler whose row is untouched
    is removed silently.
    **FR-25.21c (the roster has a head row):** checking five people one at a time is five taps for the answer *„alle"*,
    which is the common one on a family trip — a sunscreen, a toothbrush, a rain jacket. The roster therefore opens with
    **„Alle Reisenden"**, a row wearing the same checkbox grammar as the lines under it rather than a link or a chip,
    because the editor has exactly two kinds of control (the tab and the row) and a third would have to be learned. It
    is **tri-state** — mixed while only some travelers are members — so it also answers *„sind alle dabei?"*, which is
    otherwise read by counting. **It only ever enlarges the membership:** the travelers who have no row arrive at the
    floor of one and every amount somebody chose is left standing, so the shortcut can never overwrite a decision.
    **Unchecking it is deliberately not the reverse.** An empty membership is not a state the model has — nobody
    per-person means *gemeinsam* — so the way back stays the *Gemeinsam* tab, which sums the amounts and confirms the
    outcome first (b); a second, silent path to that rewrite is exactly what the confirm exists to prevent. Once
    everybody is a member the head is simply a checked box: the tap changes nothing, and it is deliberately **not**
    disabled — a faded control is the G-3 lock's sentence about a row somebody else has claimed, and saying it here
    about a full roster would make one appearance mean two things. It writes through the same `apply()` as every other
    control, so FR-5.5's *weggelassen* question is asked once for the whole tap rather than once per person, and G-3
    freezes it with the rest of the editor.
  * **FR-25.14 (Per-person items have no aggregate stepper):** in M5, a per-person item's total renders as a **read-only
    progress chip** ("0/3"), never as a +/− stepper: a summed quantity inside a stepper cannot be operated, and should
    not be — "+1" cannot say *for whom*. The working controls belong on **one row per traveler**, each with its own
    check or stepper — M5 shows the one instance it opened on, M4's cluster and the membership editor carry them all
    (FR-25.21); that is also the only place where incrementing has a defined meaning. A control that looks operable and
    is not is worse than no control.
  * **FR-25.15 (Editing saves as you go, and says so):** the item sheet has **no Save button** — on a phone there is
    nowhere sensible to put one, and G-5 already applies mutations optimistically. The sheet confirms instead, with a
    compact **icon-only indicator** and no text beside it — a labelled chip would wrap next to long item names in the
    sheet header. **Deliberately distinct from G-2**, the global sync glyph: this says the change is captured *on this
    device*, G-2 says whether it reached the server. Offline that difference is the entire story, so the two indicators
    must not be merged into one. Controls that only fold the sheet open (the *Details* toggle) must **not** claim to
    have saved anything. **The signal is `capturePending`**, which counts this device's own open writes (the Local Mode
    save; the outbox's append to the device) and is blind to the connection; `syncStatus.state` must not drive it, since
    it reports `offline` ahead of `syncing` and would render an open offline write as saved.
    **It is silent until it has written something** — a latch inside the component, raised by the first open write and
    never lowered, so the lamp appears only as the consequence of an act of yours and then stands for the life of the
    surface, **keyed to the item on M5's G-9 side panel**, which is re-pointed at the next row rather than closed and
    reopened (ADR-046) and would otherwise confirm on a fresh item a write that belonged to the previous one. An
    indicator that is always on carries no information: `capturePending` is false on a sheet just opened, so it would
    confirm nothing. And it is **a drawn lamp, not a glyph** — 9 px, amber while in flight, `--jp-done` once captured —
    which offers no tap target and borrows no meaning: a ✓ on a filled circle the diameter of the ✕ beside it reads as
    *accept*, and as a pair of controls. It keeps a cell as tall as the ✕ so the two centres stay on one line, and is
    otherwise no wider than itself; its meaning on screen rides on the `title` tooltip (the G-12-06 rule for unlabelled
    glyphs). *Options weighed and declined: a ✓ stripped of its chrome (still a confirmation of nothing); a word under
    the title (it wraps, and the line under the title is the context line); and only an in-flight lamp with no settled
    state (takes away the positive confirmation this FR exists for — offline, where the difference from G-2 is the
    entire story, the head would say nothing at all).* Two consequences: the meaning rides **entirely** on the tooltip,
    which a phone does not have, and a lamp says *state* without saying *which* — accepted. E2E-M5-14 asserts that
    indicator and ✕ share one centre line and that the lamp is visibly smaller than the button beside it.
    **The spoken half.** What the indicator **says** is separate from what it *shows*. *Silent* and *absent* are the
    same thing to the eye and opposite things to a screen reader: an announcement is made when the text inside a live
    region **changes**, so a region that appears together with its own first words has nothing to change from and is not
    reliably announced at all. The lamp is therefore not the announcement. The words live in a **permanent, visually
    hidden `role="status"` region** that is in the DOM from the first frame and **empty** until there is something to
    say; the lamp beside it is **`aria-hidden`**, so one fact is not announced from two elements that could drift apart.
    The wording is the catalogue's (`item.saving`/`item.saved`) and is the same string the tooltip carries — the tooltip
    rule (G-12-06) covers the sighted mouse user and says nothing about the spoken one. *Note the distinction this draws
    for G-12:* an icon-only **control** names itself with `aria-label`, an icon-only **readout** cannot, because a label
    that changes on a live region is no better announced than a region that appears. **One accepted limit:** M5's side
    panel keys the indicator to the item (ADR-046), so switching rows re-creates the region. Created **empty**, which is
    the correct shape — except when the switch happens while a write is still in flight, where the region is born
    already carrying *„Speichert…"* and that one announcement is lost. The content is never wrong, only occasionally
    unspoken, and the alternative is hoisting the region out of the component that owns the state it reports.
  * **FR-25.11k (Search and filter are icons, not a permanent row):** **RETIRED for M6**, with FR-25.11g and for the
    same reason: M6 has no filter bar to put a magnifier beside, and a list of this length is read rather than searched.
    M4's half stands. *Specified for M6, not built:* the search field is **collapsed behind a magnifier** in the tab
    row, with the filter entry as a second icon beside it; the field appears only when asked for. A permanently open
    search box costs a full row of a screen that has to be readable at arm's length in a shop, for something used
    occasionally. Closing the search (✕) **closes it rather than only emptying it** — leaving an empty field open would
    give back the row the icon just reclaimed. The filter icon carries the active-value count as a badge; the chip row
    from FR-25.11a still appears below whenever a filter is active, since an invisible filter on a shopping list is how
    you leave the shop without half of it.
  * **FR-25.11i ("Show done" belongs in the filter panel):** hiding finished rows *is* a filter, so its control lives in
    the filter sheet on **every** list screen, as an "Erledigte" section carrying the count. Default stays hidden
    (FR-25.2); revealed rows are dimmed and **remain interactive**, so a mistap is undone by tapping the same control
    again. M4 also keeps its list-foot *„{n} Erledigte anzeigen"* shortcut, and the two reflect one state. A list screen
    without such a control leaves a checked row no way back.
  * **FR-25.11j (Leaving a list must stay reversible):** checking off a **BUY_BEFORE** row does not merely mark it done,
    it *changes the item's mode* (FR-3.3) and so removes it from the shopping side entirely. The item must therefore
    record **which list it was bought from**, or "show done" cannot find it and the action is irreversible. Revealed
    rows note where they went ("auf der Packliste"); undoing restores the previous mode. *Built:*
    `trip_items.bought_from` is that record — nullable, carrying `mode`'s own vocabulary, and **independent of `mode` on
    purpose**: field-level LWW merges fields one at a time (NFR-4.2a), so a NOT NULL or a CHECK coupling the two would
    refuse an ordinary single-field mutation, and a refused mutation leaves the outbox with the user's change in it. It
    is written in the *same* upsert as the change it explains, because two mutations land far apart offline and a row
    that has left the shopping side with no record of where from is exactly the irreversible state this FR exists to
    prevent. Further rules:
      * **No bought-at time and no buyer.** The FR asks for the list, and nothing on the screen states a when or a who
        for a purchase. Where a purchase *is* a packing act — the BUY_LOCAL row, which is bought and thereby packed —
        `packed_at` and `packed_by_user_id` already record both through the ordinary FR-25.17 path; a BUY_BEFORE
        purchase is not a packing act and would carry a column nothing renders, which is what FR-25.9 removed a field
        for.
      * **The value belongs to the client** (invariant 3): it records a decision the person made, not a claim about who
        they are, so `stampActor` leaves it alone, exactly as it leaves the FR-25.19 assignment.
      * **The reveal follows M4's FR-25.2 done bar** rather than a filter sheet of its own — count in the label, off by
        default, one tap — because M6 has no filter panel and inventing one for a single switch is a second grammar for
        the same act. It is deliberately **not** carried across a session the way FR-25.18 carries M4's switch: that
        rule is about not re-picking a filter of four facet values, its own argument is about a filter *hiding* rows,
        and M6's tab is not remembered either — so a restored reveal would open on a list the reader did not choose.
      * **The two lists are disjoint by construction:** a row still actionable on its tab is never also reported as
        bought, even when its mode was put back by hand rather than by this undo. An actionable row hidden under a
        reveal is the failure FR-25.11a names.
      * **A BUY_LOCAL purchase is found two ways:** `bought_from` is what M6's own check-off writes, and for a
        BUY_BEFORE row it is the only way back, because the purchase changed the mode. A BUY_LOCAL row is bought *by
        being packed*, so checking it off on the packing list records it the ordinary FR-25.17 way and writes no
        `bought_from` at all — reading the column alone would lose such a row off both tabs at once: no longer open,
        never bought. The bought list therefore unions the column with the state — a `buy_local` row that is `packed` —
        and keeps the column beside it, because a row bought on M6 and later moved to `pack` by hand is findable only
        there. `bought_from` records *which list a row left*, not *whether* it was bought.
    **The portable format carries `bought_from`**, so a Local Mode backup and restore (NFR-4.11) keeps which list a row
    was bought from: the trip document carries it as a progress field — written with `packed_count` under
    `includeProgress` and dropped with it, because where a row was bought is a fact about this trip's progress and not
    about its composition — read back only from `mode`'s own vocabulary, and written onto the restored row by the one
    importer M18 and the FR-18.7 command share. Additive key, no `schema_version` bump (FR-18.5). E2E-M18-12.
    * **M6's own undo, ahead of the reveal:** a checked-off row leaves the open list with a wash-collapse-fade rather
      than vanishing, and a toast with **Rückgängig** offers the way back immediately, M4's own shape (`presentToast`
      with a button, anchored clear of the FAB) rather than the dashboard card's inline panel, which exists only because
      several cards share M1's page and a toast could not say which one it was for. The reveal (above) is still the way
      back once the toast has gone. Applies to an own entry and a packing row's projection alike, since both check off
      through `buy()`.
  * **FR-25.11h (Nothing may sit permanently under the FAB):** the floating ＋ hovers over the list, so every scrollable
    list must be able to scroll **clear of its whole footprint**. Otherwise the last row is permanently underneath it
    and whatever sits at that row's right edge — the assignee mark in M6 (FR-25.12), the packer avatar in M4 (FR-25.3) —
    is both unreadable and untappable. This holds for full-screen packing too, whose tightened list padding must still
    clear the FAB's height.
  * **FR-25.11l (Status facet):** M4's facet panel carries a sixth axis, **Status**, offering exactly three values —
    *„Gepackt"*, *„Bewusst weggelassen"* (FR-5.5) and *„Noch nicht gepackt"* — rather than the five raw {@link
    ItemState} values: `packing_now` and `partial` collapse into *„Noch nicht gepackt"* because the question is packed /
    skipped / not yet packed, and a fourth or fifth chip would answer a question nobody asked. It follows FR-25.11c's
    ordinary OR/AND rule and composes with every other facet (e.g. "my items, not yet packed"). **Picking a Status value
    overrides the "Erledigte" reveal switch** (FR-25.11i) for exactly the rows it names — without that, selecting
    *„Gepackt"* while Erledigte is off would match every packed row in the facet pass and then hide every one of them
    again as done, reporting a nonzero count that renders nothing. The panel's per-value counts (FR-25.11d) are the one
    exception to "counted over open rows only": Status names a done-state on purpose, so its counts run over the *whole*
    set, or "Gepackt"/"Bewusst weggelassen" would always read zero. The inventory browse-sheet answers the same "show me
    packed/skipped rows" question on its own screen; its undo-across-openings gap is a separate open item. **By
    decision, the wording stays three-shaped here and stays a single "nur Entschiedenes" switch on the browse-sheet
    (FR-25.13i)** — the tasks differ (this facet filters a list; that switch finds rows to reset), "entschieden" names
    the *union* the three-value facet has no single word for, and the sheet's row has no space for a segmented control.
* **FR-25.5 (Container Assignment Optional & De-emphasized — refines FR-10.2):** Assigning an item to a luggage
  container (FR-10.2) **defaults to none** and is de-emphasized in the packing flow (M4/M5) so that container management
  never becomes a step the user must clear in order to pack. It remains fully available for those who want it (M11), but
  the common path packs without ever touching it.
* **FR-25.6 (Shopping View — Assignment & Per-Item Notes):** In the shopping views (M6), "for whom" is **derived from
  per-person membership (FR-25.10), never re-entered.** A per-person item appears as **one aggregated buy row** — the
  summed quantity, the recipients' names, and their avatars — rather than one row per traveler. Rationale: buying is a
  *single act*, so a row per person would make the shop the place where you do the distributing, which is packing's job
  (FR-25.1 is a *packing*-list shape, not a procurement one); and a free-form "for whom" field here would reintroduce
  exactly the unattached attribution FR-25.10 removed. Checking the row off therefore settles **every** instance at
  once, per FR-3.3 (BUY_BEFORE → becomes something to pack; BUY_LOCAL → packed). *Built*, on three rules: **(a)** the
  row is keyed by the **same** function M4's cluster uses (`perPersonKey`, exported from `domain/packingView.ts`) — two
  screens grouping the same rows by two rules would be two answers to one question; **(b)** the **reveal below the list
  aggregates too**, or a purchase made in one tap would come back as N rows and cost N taps to undo; **(c)** each tab's
  **segment counts rows to buy**, not `trip_items` rows, because a segment promising three over a list showing one is
  the same lie the aggregation exists to remove. An instance whose traveler has left the roster still counts towards the
  amount — it is a thing to buy — it just has no name to show. FR-25.21 is what produces a per-person item by hand.
  **Assigning a buyer is FR-25.12's row sheet.** ~~A per-item note on the shopping row~~ — retired, with FR-25.11g/k and
  FR-25.13a's two composer fields: M6 stays the focused checklist it is.
  * **FR-25.12 (Shopping buyer delegation + description — *accepted*, not yet built):** owed, in its own PR, because it
    is the one M6 promise with a use nothing else covers: *„Andy kauft das"* is the multi-user case M6 cannot express
    otherwise. Each shopping row can **optionally** carry (a) an **assignee** — labelled **"Zugewiesen an"** (*not* "Wer
    kauft?", which over-specifies the act) — and (b) a free-text **description**. Both are set in a compact sheet opened
    by tapping the row (the M4 → M5 pattern), so the list stays scannable in a shop; the add-time description field
    FR-25.13a specified is retired. The buyer is a **procurement delegation and is deliberately not the same thing as
    "for whom"**, which stays derived per FR-25.6 — the two are shown apart on the row (recipients left, buyer right
    with a 🛒 badge and a ring), mirroring how FR-25.3 separates the packer from the traveler, so two person marks on one
    row can never be read as the same. The assignee is chosen from the trip's **users** (people who can be asked to
    shop), not its travelers, and "niemand" clears it. On a row with nobody assigned the affordance is an **edit glyph
    (✎), not a ＋** — it opens the row's editor, and a plus would promise "add something" while delivering an editor. The
    description doubles as the procurement note — one field, since "50+, ohne Duft" and "war im Migros, gab es dort
    nicht" are the same affordance used at different moments; it renders inline on the row so it is visible without
    opening the sheet.
  * **FR-25.13 (One way to add, everywhere):** every list screen that adds inventory items adds them the same way: the
    item list stays free of a permanent "add" row, and the **＋ FAB expands an inline quick-add** above the list (§3.25's
    M4 directive; the FAB does not focus it, FR-25.13c). Adding must not depend on which screen you are standing on. M6
    is not a caller: the shopping list adds entries of its own (FR-30.1, FR-30.2), and an inventory item to buy goes
    onto the packing list on M4. **On M8** adding a position to a template or group uses the **identical quick-add** —
    collapsed card, ＋ FAB expands it, master-item autocomplete (FR-5.6), a visible scope-labelled confirm ("Zur
    Gruppe/Vorlage hinzufügen"), Enter as the desktop shortcut, the field stays open for the next position (FR-25.13a
    rules). A picked suggestion is the FR-25.7 one-tap add with defaults; a free-text name creates the master item first
    (FR-1.1) through FR-24.11's offer and sheet, as on M4, never silently from the bare name; a name already in the
    template is reported ("schon drin — nicht doppelt") and never duplicated, the FR-20.3 stance applied at authoring
    time. **Editing follows the same directive:** tapping a position opens the **M5-pattern bottom sheet** — name
    header, read-only glance-chip row, the FR-25.15 auto-save chip, the routinely-touched sections first (Menge,
    Vorbereitung), and per-person/procurement/dedup/conditions/Später-Packer behind **"Details ▾"**, M5's own
    progressive-disclosure toggle (incl. M5's "Wer braucht das?" wording, FR-25.10). Template positions and packing rows
    are handled through one visual grammar.
  * **FR-25.13a (Confirm button and Enter at add time):** what this FR owns, and what E2E-M6-16/M4-21 cite it for, is
    the rule of the composer's commit: **a visible confirm button is the primary commit** — on a phone there is no Enter
    key in reach, and leaving the action to the soft keyboard's return key makes it invisible; **Enter remains the
    desktop shortcut from any field**. This holds for **M4's quick-add** in both its modes. The form **does not collapse
    on blur** — it closes on ✕, Escape or the FAB: collapsing removes a block from the flow above the list, so the rows
    move between pointer-down and pointer-up and the browser dispatches no click, swallowing the first tap after an add.
    ~~A description field and an inline "Zugewiesen an" chip row in M6's quick-add~~ — retired: an M6-only field on the
    shared composer would be a second template for one rule, the shape invariant 4 exists to prevent, applied to a
    screen. M6's own field (FR-30) carries the name only, so neither returns with it; a buyer is named in FR-25.12's row
    sheet.
  * **FR-25.13b (Category at add time, mostly answered for you):** the quick-add carries a **category selector**, but it
    is the fallback rather than the main path: M6 gained the **master-item autocomplete M4 already had** (FR-5.6), and
    picking a known item **adopts its category** (its primary tag) — asking would be asking for something the system
    knows. The selector offers the household's own vocabulary (categories the trip uses, plus every master item's
    primary tag, plus *Sonstiges* as the guaranteed default), and a category adopted from a suggestion is added to the
    list even when this trip has not used it yet. Without this, everything added during a trip piles into *Sonstiges*,
    which makes both the category grouping and the FR-25.11g category facet useless. **The assignee deliberately carries
    over to the next add** — shopping lists are entered in runs ("everything Sia picks up"), so resetting it each time
    would cost a tap per row; the description does not carry over, since it is specific to the item. **Consistency
    note:** this makes M6's quick-add richer than M4's, a deliberate, narrow divergence from FR-25.13 — the
    *interaction* (FAB → inline form → Enter) is identical, only the field set differs. If M4's quick-add later gains
    note or delegation fields, both should converge on this shape rather than diverging further. **The ＋ appears only
    where it can add something:** while the quick-add composer is open, the button that opens it has nothing left to do,
    so it steps aside and gives the composer the room. Its *container* stays, deliberately — M4 and M8 anchor their
    toasts to it, and removing it would drop those behind the tab bar.
  * **FR-25.13c (Chips before the keyboard):** on a phone, composing a template out of the *existing* inventory by
    typing alone is two characters, a suggestion under the soft keyboard, twenty times over. So the **empty composer
    leads with tappable chip rows**. Of three rendered variants (chips in the composer · inventory browse-sheet ·
    two-step tag tiles), the chips are one change to the shared composer and so land on every composer caller alike,
    keeping FR-25.13's "one way to add, everywhere" literally true. Rules: **(a)** the ＋ FAB expands the composer but
    **does not focus it**, because the auto-raised keyboard would cover exactly the chips; the accepted cost is one
    extra tap for whoever wants to type, and the field's own tap raises the keyboard. **(b)** One row while the field is
    empty, capped and **excluding everything the scope already carries**: *„Zuletzt verwendet"*, a **device-local**
    recency trail (a typing convenience, not domain data — deliberately unsynced, the review-dismissals stance); a
    free-text add creates its master item first (FR-24.11) and is recorded like a pick. ~~A second row, *„Passt zu
    {Tags}"* — items sharing a primary tag (FR-24.2) with the scope's contents~~ — not offered: a tag-based offer reads
    as noise rather than a suggestion, most visibly when the contributing tag is the *Diverses* catch-all. **(c)** A
    chip tap is the FR-25.7 one-tap add with defaults and does *not* refocus the field — the user is tapping through an
    offer, and the keyboard would end it; a typed suggestion pick keeps refocusing, that user is in a typing run.
    **(d)** **What a scope already carries is never offered**, in chips *or* autocomplete — M8 passes its positions, M4
    the trip's items (skipped rows included: bringing one back is FR-5.5's reveal-and-undo, not a second add). Typing
    yields: chips disappear at the first character and the autocomplete takes over.
  * **FR-25.13d (Inventory browse-sheet, *built*):** the answer to "assemble from the whole inventory": the FAB's
    composer carries a *„Mehr aus dem Inventar…"* entry opening a bottom sheet over the full inventory — **its own** tag
    axis to filter (a segment: the sheet has four tags on screen rather than a screen-long list to navigate; M9 filters
    by FR-24.8), one-tap rows that stay open for runs, an already-carried item stating *„schon drin"* in place of its
    add control (state, not an error), free text demoted to an explicit footer line. Chips answer "offer me something",
    the sheet answers "let me work through it": *Erfassen* (the composer's field and chips) and *Zusammenstellen* (this
    sheet) are the two postures FR-25.13's "one way to add" takes — and the "one way" stays literally true because the
    shared composer is the sheet's only door, so every composer caller carries it without a per-screen rollout. The
    third variant (two-step tag tiles) is rejected: it solves the sheet's problem with more navigation and a
    back-gesture inside a sheet, and its one advantage — scaling — the tag axis covers at household inventory sizes.
    *Revisit trigger:* the chip rows visibly failing as the inventory grows past what "related + recent" can surface.
    Two further rules: **(a)** the door — *„Mehr aus dem Inventar…"* — appears only in the **empty** composer (typing is
    the *Erfassen* posture, and an empty inventory has nothing to browse); **(b)** the *„schon drin"* state doubles as
    the run's feedback — a tapped row flips to it in place, so the sheet needs no toast and never closes between taps.
    What counts as carried is the trip's **whole** contents. The sheet's name search is M9's own (FR-25.13j), not a
    second one — a second name search would be the drift FR-25.11g warns about.
  * **FR-25.13e (The browse-sheet hides what is already in, *built*):** a carried item marked *„schon drin"* keeps the
    sheet honest at an inventory of thirty; at two hundred, the sheet's whole job — *let me work through what is still
    missing* — sits under rows that are done. So the sheet has **one opt-in switch that takes those rows out of the
    way**, and hiding is paid for three times over: the switch is off by default, the hidden rows stay **present as a
    number**, and every state it can empty offers *„Trotzdem anzeigen"* in one tap. Nothing becomes unreachable; it
    becomes quiet. The rules:
    * **One line under the tag axis, above the first group heading** — where the filtering already happens. Left the
      count as a statement (*„14 schon drin"* → *„14 ausgeblendet"*), right the switch labelled *„ausblenden"*. The
      count is **scoped to the current tag filter**, not to the whole inventory: a number that does not match what the
      screen would hide is one the user can catch out. With nothing carried inside the filter the line is **absent**
      rather than reading zero — a control that would do nothing is furniture.
    * **Off by default, remembered per device** (`jitpack_browse_hide_carried`, the `useInventoryProperties` stance: a
      viewing preference, never synced) and **shared by M4 and M8** — it is a working posture, not a fact about one
      list, and the sheet is one component in both.
    * **The snapshot rule, and it is the load-bearing one:** hiding applies to what was carried **when the switch was
      flipped**, never to what this run adds. A tapped row that vanished under the finger would reflow the list into the
      next tap — and it would delete the sheet's only feedback, which FR-25.13d(b) deliberately put in that flip. A row
      added while the sheet is open therefore **stays where it is** and reads *„✓ hinzugefügt"*. The set is re-taken on
      exactly three events: the switch going on, the tag filter changing, and the sheet re-opening. The count follows
      the same clock and does not tick up during the run, since those rows are on screen.
    * **Three empty states, three sentences.** *„Noch keine Packelemente mit diesem Tag"* is an inventory gap; *„Alles
      mit diesem Tag ist schon drin."* is success under a filter; *„Alles aus dem Inventar ist schon drin."* is success
      without one. The last two carry *„Trotzdem anzeigen"*, which is also the way back out, and the **tag axis stays
      rendered** in all three — an empty sheet that has also lost its filter is a dead end. A tag group whose rows are
      all hidden renders **no heading**: an empty heading promises a list that is not there.
    * **The wording stays scope-neutral** — *„schon drin"*, never *„in der Packliste"*, because on M8 there is no trip.
      And the count is spoken as well as printed: the switch is a button with `aria-pressed` whose accessible name
      carries the number, so the size of what is being hidden is not a sighted-only fact.
    * **No wire, no schema, no ADR.** It filters data the device already holds, so it is identical in Server,
      Single-User and Local Mode; the tradeoff — hiding carried rows rather than stating them — is carried by this FR.
      *Revisit trigger:* if the switch turns out to be permanently on, the default is wrong and the sheet should open
      filtered with the count line as the only thing that says so; if nobody ever flips it, the tag axis was sufficient
      and the line is clutter to remove.
  * **FR-25.13f (Two verbs in the browse-sheet, one tap each, *built*):** besides *hinzufügen*, the sheet carries the
    decision actually being made in front of the wardrobe: *„das ist schon eingepackt"* and *„das lassen wir diesmal zu
    Hause"*. Both verbs exist on M4 — packing is its checkbox, FR-5.5's skip its press-and-hold — and from the sheet
    both would cost three steps per item: close the sheet, find the row in M4, act, come back. So the line carries them,
    **one tap each**. Of three rendered variants — **(A)** two icon targets on the line, **(B)** a verb-mode bar in the
    sheet head deciding what a tap means, **(C)** one target cycling through the states — **A** is the design: in front
    of the wardrobe the verb changes *per item* rather than in runs, so B's mode would be paid for on nearly every line
    and would fail silently in the way modes do — a tap in the wrong one writes the wrong verb without saying so. C
    makes *nicht einpacken* cost three taps. A swipe is out — FR-5.5 deliberately carries none — and the press-and-hold
    menu is M4's grammar but is by definition not one tap. The rules:
    * **Two targets at the right edge of the line: ✓ (*gepackt*) and ✕ (*nicht einpacken*).** The name keeps the plain
      add, so the line's own tap is unchanged; the ⊕ glyph steps aside where the verbs are shown, because three glyphs
      beside a name leave the name nothing on a phone, and the sheet's subtitle states what the plain tap does.
    * **Four cases, not two.** On a **free** line the verb *adds and decides in one write* — one insert carrying the
      decided state, never an insert followed by a second mutation, because offline the window between them is
      unbounded. On a line the scope **already carries** the verb acts on the existing rows. The shapes are the ones the
      verbs write elsewhere, so a row born packed is indistinguishable from one packed a minute later.
    * **A skip-add is deliberately kept:** it costs a row to record a decision that would otherwise evaporate, and that
      record is what stops the item being offered again, what M4 shows on reveal, and what M14 reads later. Chosen by
      decision over offering ✕ only on carried lines.
    * **A skip-add is never flagged *Missing* (FR-9.1)**, where a pack-add is, on an active trip, like any other add.
      „The plan forgot this" and „we are deliberately not taking it" are opposite statements, and writing both would
      feed M14 a contradiction — the same reasoning FR-27.10 applies to a whole group. **A skip-add likewise pulls no
      companions**: FR-20.4 brings along what a *packed* item needs, and the spare battery for a camera that is staying
      home is the one offer nobody wants.
    * **A verb acts on every row the item has** (FR-25.21's per-person fan-out), skipping the rows already in that state
      — packing an already-packed row would restamp somebody else's FR-25.17 record with mine. Where it reached more
      than one row the line says so (*„eingepackt · 3 Personen"*), because a single ✓ that quietly packed three rows
      claims less than it did.
    * **The way back lives in the line, not in a toast.** FR-25.13d(b) put the sheet's feedback in the state flip on
      purpose and gave it no toast; so the acted line reads what happened and carries *„Rückgängig"* beside it, for as
      long as the sheet is open. It undoes exactly what the verb wrote — a delete for an add, FR-25.2's and FR-5.5's own
      restores for the rest — and the line then renders from the trip again, ready for a different decision. **What it
      does not do is name the FR-20.2 companions** a skip took along, which M4's snackbar does: there is no room on a
      line for a list, the undo puts them back regardless, and a half-list would be worse than none.
    * **Locked lines offer nothing; settled lines offer only a reset.** A line whose rows are all packed or all skipped
      states that and carries *„zurücksetzen"* (FR-25.13i) instead of the verbs; a line G-3 says somebody else is
      packing names the holder instead and offers nothing — a takeover is FR-5.7's confirmed step and must not be a
      one-tap verb.
    * **M4 only.** M8 has no packing states at all, and M6 carries no composer (FR-30.2). Mechanically the gate is that
      the caller passes the per-item states or does not: **the sheet renders verbs only for a caller that reports them**
      (G-8), which is why M8 keeps the plain sheet.
    * **No wire, no schema, no ADR.** One insert gains an optional decided state; everything else is the existing pack
      and skip actions called from a second surface. Identical in Server, Single-User and Local Mode.
  * **FR-25.13g („Für alle" in the browse-sheet, *built*):** the sheet can add an item and it can decide what happens to
    it; it also says **who needs it**. FR-25.8's composer mode ends each add in the membership editor — one sheet per
    item, after the fact. So the line carries a **third verb, 👥 (*für alle*)**. Of four variants weighed (ADR-054) —
    **(A)** a *Gemeinsam / Pro Person* segment in the sheet head, **(B)** a third verb on the line, **(C)** the roster
    unfolding inside the line, **(D)** a *Für alle* offer appearing beside *Rückgängig* after an ordinary add — **B** is
    the design: the decision is per item rather than per run, so A's mode would be paid for on nearly every line and
    fails silently the way modes do — FR-25.13f's reasoning. C reorders the list under the finger, which FR-25.13e
    forbids on purpose, and buys a traveler *subset* the membership editor already offers. D costs a second tap for the
    common case and only exists in the seconds after an add. The rules:
    * **One tap, one row per traveler, amount one.** On a **free** line the tap adds the row and hands it to everybody;
      on a line the trip **already carries** it gives the travelers who have none a row of their own, keeping the amount
      anybody already chose — the FR-25.21c shortcut's rule, so a spread can enlarge a membership and never rewrite one.
      The rows are ADR-036's keep-and-repoint: the existing row *becomes* the first traveler's, so its comments, todos
      and packing progress survive the spread rather than being deleted beside it.
    * **No editor opens, and that is the point.** FR-25.8's mode ends in the membership editor and therefore has to
      close the sheet first; this verb ends in the sheet, which is what lets a run of them be tapped one after another.
      The amount stays one per person: setting different amounts is the editor's, one screen away, and asking here would
      rebuild it.
    * **It only ever adds, checked twice.** A row belonging to somebody who has left the trip is left out of the plan
      entirely rather than swept up by it — the planner would read it as a member nobody asked for and *delete* it,
      which is a decision ADR-036 gives a confirm and a run has no room for. And a plan that still comes back carrying a
      delete of any kind is not written at all: the line's *„Rückgängig"* restores fields and removes what was inserted,
      so a row a spread deleted would be one the way back could not bring back. Nothing is written, and the screen says
      so.
    * **The verb is absent where it would do nothing** (G-8): below two travelers, on a line that already reaches every
      traveler, on settled and locked lines, and in a sheet that renders no verbs at all (M8). Absent rather than
      disabled, for FR-25.13f's reason.
    * **On a line this run itself added the offer is *Rückgängig*, not 👥.** The acted line's job is the way back
      (FR-25.13f), and a fourth control beside a state and an undo leaves the name nothing on a phone. Reopening the
      sheet offers the spread again, because the row is then simply a carried one. Accepted cost, and the one thing
      variant D would have done better.
    * **Where it says how many it reached**, it uses FR-25.13f's own sentence — *„für alle · 3 Personen"* — for the same
      reason: a tap that wrote three rows must not report as one.
    * **No wire, no schema.** The membership planner, the add and the undo are the ones FR-25.8, FR-25.21 and FR-25.13f
      already own; what is new is one composite action and the row that offers it. Identical in Server, Single-User and
      Local Mode.
  * **Per-person items reach the shopping list.** A per-person item carries no `packed`/`quantity` of its own — those
    live on its per-traveler instances — so a shopping list selecting open items by the item's own fields compares
    `undefined < undefined` and silently drops every per-person item in a buy mode. Quantity and packed count are
    aggregated over the instances wherever an item is treated as a whole. Covered by E2E-M6-05.
  * **FR-25.13h (Assign travelers from the browse-sheet, *built*):** FR-25.13g's 👥 answers *who* for everybody; the line
    also answers it in one tap for one or more **named** travelers, sparing the detour through the membership editor
    FR-25.13g exists to remove. The line carries a second shape of the same answer, decided by how many travelers there
    are to draw:
    * **Up to three travelers, a button per person, in the line.** Each traveler gets a small avatar button beside 👥, ✓
      and ✕, sized to the same touch-target floor those three already use — a button shrunk to its own glyph is
      impractical to tap. The line never wraps to a second row: the name truncates with an ellipsis correspondingly
      earlier, as it does for any long name.
    * **Multi-select, not one traveler and done.** A tap toggles: assigning the item to a second traveler is a second
      tap on their button, not a second sheet visit, and the line stays open — offering more avatars and its own Undo —
      instead of closing the way the other four verbs do. Tapping an already-selected avatar again removes just that
      traveler; emptying the set reaches the same outcome as the line's own *„Rückgängig"*. `assigned_traveler_id` is
      one row's field, so what an avatar tap turns the row into is exactly the FR-25.21 cluster: one row per selected
      traveler, written and rewritten by `domain/membership.ts`'s own planner as the set changes — a second tap never
      creates a second, unrelated row.
    * **Above three, a long press on 👥 instead.** The line keeps its shape — 👥, ✓, ✕, nothing added — and a
      press-and-hold on 👥 opens a small menu naming *für alle* first, then every traveler. `INLINE_PERSON_BUTTONS_MAX`
      names the threshold once, beside `MIN_TRAVELERS_FOR_PER_PERSON`. The menu is multi-select too, in effect: a second
      long press and a second pick adds a second traveler to the same row — an action sheet has no way to show a pick as
      already selected, so a pick here only ever adds, and taking one back off stays the line's Undo.
    * **👥's plain tap is untouched in every shape.** It is the one thing this FR must not cost: „für alle" stays a
      single tap whether the line shows avatar buttons, none, or is already mid-selection, and the long press is a
      second gesture on the same target, never a detour the first one has to take.
    * **At up to three travelers, 👥's tap *is* select-all, not a shortcut past it.** Wherever 👥 sits beside avatar
      buttons it writes through the identical `assignToTravelers` path an avatar tap uses — the whole roster as the
      selected set — so the row stays `assigning` and every traveler it just picked stays a live toggle. FR-25.13g's
      bulk verb would close the line as `acted` and take the buttons with it, and with them the only way to take one
      traveler back off. Above three travelers, where there is no avatar row to keep open for, 👥 is FR-25.13g's bulk
      verb unchanged.
    * **A long press on the name shows what the ellipsis hid**, in a small label above the line — a second, unrelated
      target from 👥's, so the two presses never race each other. Opening a new press anywhere else in the sheet closes
      it; nothing here is a menu with a choice to make.
    * **Free lines only.** A carried line keeps exactly the 👥 spread it has from FR-25.13g. *Revisit trigger:* if a
      carried line turns out to want the same per-traveler shortcut, it is FR-25.13g's `spreadToAll` generalised to a
      chosen set rather than everybody, not a new mechanism.
    * **No wire, no schema, no ADR.** The rows an avatar button or a menu pick write are `domain/membership.ts`'s own
      planner, called with a target of exactly the selected set — the same planner FR-25.13g calls with the whole
      roster. Nothing new is stored; `assigned_traveler_id` is the field FR-25.21 already owns. Identical in Server,
      Single-User and Local Mode.
  * **FR-25.13i (A settled line's way back, and the filter that finds it, *built*):** a settled line states its
    decision, and M4 can undo it one screen away — but the line's *„Rückgängig"* is **line-local and as short-lived as
    the modal**: reopen the sheet and it is gone, so an item left at home a minute ago could not be brought back from
    the surface the decision was made on. Two halves, and neither works alone: a control nobody can find in a
    hundred-row inventory is a control nobody has, and a filter onto rows nothing can be done to is a list to look at.
    The rules:
    * **The settled line carries *„zurücksetzen"***, on the same G-8 gate the verbs use — the caller reports packing
      states or it does not, so M8 keeps the plain sheet. A **locked** line still offers nothing: FR-25.13f's reason for
      that half holds, a takeover is FR-5.7's confirmed step.
    * **It resets, it does not restore.** The write is the pair M4's own row menu already makes — a skipped row comes
      back open at amount one, a packed one keeps its amount and loses its packed count — and it acts on every row the
      item has (FR-25.21's fan-out), like the verbs. Deliberately **not** FR-25.13f's undo, which replays a closure this
      run recorded: the whole point is a decision *this run did not make*, so there is no closure to replay, and on a
      skipped row there is no way back to the amount FR-5.5's skip zeroed either. The accepted cost is that one number:
      a skip of three socks reset here returns one sock. Nothing else on the row is touched, and the alternative —
      storing the pre-skip amount so it could be restored — is a schema field paid for on every row to spare a
      correction that M4's own stepper makes in one tap.
    * **What is left is an ordinary carried line**, with both verbs back on it, which is what makes a *different*
      decision one tap away rather than a second trip through the composer.
    * **A second filter finds the decided rows**, *„nur Entschiedenes"*, with the count beside it (*„2 entschieden"*),
      counted inside the current tag filter for FR-25.13e's reason. One switch for packed and skipped together rather
      than two: both are the same stuck state to the person looking for them, and the line says which it is anyway.
      *Revisit trigger:* if a pass over the packed rows alone turns out to be the real task, this becomes a three-value
      control rather than a second switch beside it.
    * **It deliberately does not share FR-25.11l's words:** M4's Status facet names the three states separately —
      *Gepackt*, *Bewusst weggelassen*, *Noch nicht gepackt* — and this switch names their union, which that facet has
      no word for. The shapes differ because the tasks do: the facet filters a list somebody is reading, this finds the
      lines somebody is about to reset, and a segmented control has no room on the sheet's row. The divergence is by
      decision, not an oversight.
    * **It inherits FR-25.13e's snapshot rule, and needs it more.** What the filter shows is the set that was decided
      **when it was switched on** (re-taken when the tag axis moves), not the live one — so resetting a line leaves it
      in place, flipping to *„schon drin"* with its verbs back, exactly as an acted line stays put during a run of adds.
      Without it the first reset of a pass deletes its own row, reflows the rows below into the finger and throws away
      the only feedback the sheet gives; here that is worse than in FR-25.13e, because the pass *is* a run of taps down
      one list. The count beside the switch stays **live** rather than following the snapshot: during a pass *„1
      entschieden"* under two listed rows is the honest reading of how much is left to do.
    * **It is transient, where FR-25.13e's switch is remembered.** Hiding what is already in is a posture somebody works
      in; a pass over the decisions is a task somebody finishes, and a filter that outlived its task would open the
      sheet on a fraction of the inventory with nothing saying why. It also **takes precedence** over that switch rather
      than composing with it — every decided row is a carried one, so the two together can only ever render nothing —
      and the switch steps aside entirely while it is on, rather than sitting there inert.
    * **Its own kind of empty says so:** a tag the filter finds nothing decided under leaves *„Hier ist noch nichts
      gepackt oder zu Hause gelassen."* with *„Alle anzeigen"* beside it — a third kind of empty next to FR-25.13e's
      two, and like both it carries the way out. It is reached by moving the tag axis, never by a reset, which the
      snapshot rule above keeps on the screen.
    * **No wire, no schema, no ADR.** Both writes are the existing unskip and zero-pack actions called from a second
      surface, and the filter is local view state. Identical in Server, Single-User and Local Mode.
  * **FR-25.13j (The browse-sheet searches, and creates what it did not find, *built*):** working through the inventory
    stops at two points the tag axis cannot reach: the item one knows by name and cannot find by scrolling two hundred
    rows, and the item the inventory does not hold yet — which would otherwise mean leaving the sheet through
    *„Stattdessen neuen Namen eintippen…"*, losing the run's filter and ledger on the way. The sheet reuses M9's parts
    rather than growing its own:
    * **M9's field, persistent** (`SearchRow`), between the head and the tag axis. It **takes no focus on arrival**, so
      FR-25.13d's „the sheet raises no keyboard" still holds for everyone who does not tap it. The match is M9's rule
      (FR-24.7, `searchItems`: both umlaut spellings, tag names, mark keywords) — one rule, so the FR-25.11g drift
      cannot happen — and it **narrows inside the tag axis**: the rows stay grouped by primary tag, because the groups
      are where the sheet's runs happen, and a query only thins them. Every count on the sheet (FR-25.13e's,
      FR-25.13i's) is read inside both filters. A query that leaves nothing says *„Nichts im Inventar passt dazu"*
      rather than the tag axis's *„Noch keine Packelemente mit diesem Tag"*.
    * **FR-24.11's offer, at the top** (`SearchOfferButton`), by FR-24.11's five rules unchanged: a missing *name*, not
      an empty result; Enter opens the sheet and never writes; the filtered tag is assigned from the start; a retired
      name is restored instead; nothing is offered before the master partition has arrived (ADR-033). The hints are the
      composer's (*„Neu im Inventar anlegen und gleich hinzufügen"*), because what follows is the composer's outcome,
      not M9's.
    * **What the creation sheet makes is added like a tapped line.** `CreateItemSheet` opens over the browse-sheet and
      closes back onto it; the query survives, the offer goes because the name now exists, and the new line reads *„✓
      hinzugefügt"* with its *„Rückgängig"* — the run's ledger covers it like any other tap. A restore is added the same
      way. *„Anlegen und öffnen"* adds, closes the browse-sheet and continues in M10.
    * **The two verbs do not reach the offer.** A new item is added plain; packing it, skipping it or naming its
      travelers is one more tap on the line it has just become. Folding them into the offer would put five buttons on a
      row that is not an item yet.
    * The footer line *„Stattdessen neuen Namen eintippen…"* stays: it is the way back to the composer's *Erfassen*
      posture (FR-25.28's for-whom strip, the chips), which the offer does not replace.
    * **No wire, no schema, no ADR** — three existing components composed on a fourth surface. Identical in Server,
      Single-User and Local Mode; M8 gets it with the shared composer (M6 carries no composer, FR-30.2).
* **FR-25.7 (Template-Item Entry — Sensible Defaults & Progressive Disclosure):** templates (packing-list subsets) are a
  **core feature**, and a template editor (M8) exposing every parameter at once (quantity, per-person vs. trip-global,
  procurement mode, dedup strategy, conditions, Late Packer) makes adding a single item cumbersome. The form therefore
  applies **sensible defaults** — a plain item is quantity 1, trip-global, mode *Packen*, dedup *max*, no conditions,
  not a Late Packer — and **reveals the advanced parameters only on demand** (progressive disclosure / "override when
  needed"). Adding a position is **one tap** — the row lands *collapsed* with the defaults above and reads "Standard";
  nothing auto-opens. Editing happens in the M5-pattern sheet (see FR-25.13's M8 paragraph): **Menge** and
  **Vorbereitung** first (FR-27.7 — the two things actually touched routinely); per-person, procurement, dedup,
  conditions and Late-Packer behind the **"Details ▾"** toggle. (In this document's numbering, M7 = template list, M8 =
  the item-parameter editor.)
* **FR-25.8 (Per-Traveler Quantities at Add-Time — its surface is superseded by FR-25.28: the strip picks the travelers
  before the add, no editor opens after it, and amounts are set on the child rows):** When quick-adding an item **during
  packing** (M4, FR-5.6), the user can give it a **different quantity per traveler in one step** — e.g. "kurze Hosen:
  Andy 2, Leo 3, Mia 0". The quick-add offers a **"pro Person" mode** that opens the FR-25.21 membership editor — a
  checkbox and an amount per traveler, and an unticked traveler is simply not given the item (0 is FR-5.5's *skipped*
  and may not also mean *not for this person*). On add, the item expands to **one packing row per ticked traveler**
  (consistent with FR-25.1), each carrying that traveler's own quantity and independently packable. **Those rows are
  instances of *one* item and must render as a single FR-25.1 cluster** — named once, with a child row per traveler —
  **not as N independent items repeating the name**: N separate items leave every row present and individually correct,
  yet the screen shows three unrelated "Jacke" rows instead of one grouped item. The composer creates the master item
  first (FR-24.11), so the instances share a `source_item_id`; rows without one (imports, older trips) are held together
  by the normalised name per FR-25.1's cluster-identity rule. The per-person amounts are **trip-scoped** (FR-5.6) — they
  modify no master item and no template quantity. The uniform single-quantity mode ("Gesamt") stays the **default** for
  the common case; per-person is one tap away, and the mode also governs FR-25.13f's one-tap verbs: a browse-sheet line
  decided *already packed* or *stays home* in *Pro Person* mode writes its decision and then distributes it. Rationale:
  real families need "3 shorts for Leo, 2 for Andy, none for Mia" without building a template or editing each row
  afterwards. *Built.* The composer carries a *Gesamt* / *Pro Person* segment — the same two words the membership editor
  uses, because it is that editor the mode opens — offered only where the caller has travelers to distribute over: M8
  never (a Vorlage has no people, FR-25.9) and a trip with fewer than two travelers not either (G-8). **(a) The row is
  written first and the editor opens on it**, rather than the mode collecting a draft membership and writing N rows at
  the end: the editor edits rows, and one able to work on a draft would be a second implementation of the rules
  `domain/membership.ts` already owns (invariant 4, ADR-036) — the same duplication ADR-025 exists to prevent. The
  accepted cost is that abandoning the flow leaves an ordinary shared row behind, which is what was asked for by typing
  the name. **(b) The mode survives an add and dies with the composer**: rows are entered in runs (FR-25.13a), so a run
  of per-person rows is entered the way a run of shared ones is, and *Gesamt* is the default the next opening returns
  to. **(c) The editor opens on the roster** instead of on *Gemeinsam*, because the mode is already the answer to which
  tab this is; asking twice would make the mode a label rather than a choice. **(d) G-3: the editor is read-only while
  any instance of the item is claimed by somebody else**, and the claim is read off **every row the editor would
  touch**, not the one row it was opened from: on the quick-add a freshly minted row carries no claim while its
  folded-name key can still pull an older, claimed ad-hoc row into the same cluster — which the conversion would then
  rewrite. A caller knows one row, the editor knows the cluster. **And the editor says whose claim it is** (E2E-G3-04):
  every other G-3 surface names the holder, and this one can inherit none of them, because M5's banner is absent on the
  unclaimed row the editor is opened from and the editor is a modal above M5 in any case. A frozen editor stating no
  reason is a dead end, so it carries its own line, naming the holder where the directory knows them and saying *„Jemand
  …"* where it does not. **(e) An add made from the FR-25.13d browse-sheet closes the sheet before the editor opens**,
  because a modal presented while the sheet is up renders behind it. The sheet exists for runs and the mode ends each
  add in an editor, so the two postures cannot share a tap — the sheet closing *is* the answer to which one this is.
  With nobody to distribute over the mode is absent, so FR-25.1's flat fallback is reached by a membership of one and is
  asserted where that state arises (E2E-M5-19).
* **FR-25.9 (Per-Person Quantities in Templates) — REMOVED:** there is no distinction between adult and child
  quantities. A per-person template position carries **one quantity**, applied to every traveler alike; the concrete
  per-person numbers are set on the trip (FR-25.8), which is where the actual people are known. **This also retires the
  traveler *type*** — see FR-2.5. *Revisit trigger:* a household where adults and children genuinely need different
  counts of the *same* templated item often enough that setting it per trip is a chore.
* **FR-25.10 (Item Membership replaces free-form "Used by"; M5 "Wer braucht das?"):** The base-PRD *Used by* attribution
  (FR-4.2) — a single traveler label on an otherwise shared row — is **removed**: it carries weight only for genuinely
  per-person items and for weight-by-person, and otherwise adds noise to every row. What remains, and is **directly
  editable in M5**, is **per-person membership**: a control ("Wer braucht das?") where `Gemeinsam` = one shared row for
  the whole trip, and the **FR-25.21 membership editor** — one or more travelers, each with their amount — turns the
  item into a **per-person item** (FR-1.4/25.1) with one independently-packable row per selected traveler. **Adding a
  traveler adds *their own* packing-list row** (e.g. "Leonardo also needs sunglasses" → a Sonnenbrille row appears on
  his list); removing one drops that row. Consequences: shared M4 rows carry no *for-whom* avatar (only per-person child
  rows show their owner); **person grouping** (M4) and **per-person weight/analytics** (M12) key off per-person rows
  rather than a shared-row label; the shopping view derives "for whom" from this model (FR-25.6); *Packed by*
  (delegation — FR-4.2's other half) is unaffected and keeps its own control.

**UI directives for the M4/M5/M6/M8 redesign (to UI-Spec, no separate FR):**
* **Keep secondary-tool entries discoverable:** entries to Shopping (M6), Containers (M11), and Analytics (M12) are
  **hard to find** when containers sit under the M4 grouping switch and analytics only behind the KPI tile. The M4
  header must *not* hide these — they need obvious, discoverable entry points.
* **M4 header (FR-21.10, G-12):** the trip's name lives in the page head at every width (FR-21.10) and the trip is
  named exactly once; M4's own header line is one row of figures — progress and presence. The name is not in the app
  bar because the bar has no room for it: with the FR-27.5 lifecycle step beside search, filter, fold-all, the sync
  glyph and the settings gear, **54 px are left for a title at 390 px**, and „Samedan 2026" renders as **„S…"** — a
  title that survives as one letter names nothing. M4's tools are **G-12's icon cluster** — search (FR-25.11k's
  collapsed field), filter with its badge, Shopping with its open count, then ⋯ for containers and analytics — placed
  **in the app bar, replacing the settings gear**, with the chip row appearing under the header only when a filter is
  actually set. The cluster lives in the app bar rather than on the header line because M4's header line **collapses
  on scroll**: a cluster there would slide away mid-task, while the app bar keeps search and filter reachable
  throughout packing. Shopping is a permanent icon rather than being buried behind an unlabelled ⋯, which satisfies
  the discoverability directive above.
  * **Scroll behaviour:** on scroll-down M4's header line goes, whole; the page head above it does not, which is
    ADR-050's accepted cost and its revisit trigger. Nothing migrates into the app bar — *you generally know which
    packing list you are on*, so the rows are worth more than a permanent label.
* **M4 full-screen packing (Vollbild):** to maximise vertical room for the list, **the bottom tab bar
  (Übersicht/Reisen/Vorlagen/Inventar) is hidden on M4** — packing runs full-screen. This is consistent with M4 being a
  drilled-into trip-detail screen (reached from M2/M1): the top-bar **‹ back** chevron is the return path to Reisen,
  so the root anchors need not be present. The **＋ FAB drops to the screen foot** and the list padding tightens to
  reclaim the freed space. Chosen over an auto-hide-on-scroll tab bar and an explicit focus toggle — full-screen is
  calmest and matches the standard iOS/Ionic detail-screen pattern. On desktop (≥ 900 px) the left nav rail is
  unaffected (this concerns the mobile bottom bar only).
  * **Global top app bar (all screens):** slimmed to a **short, single-line title, no subtitle**, with reduced height
    (compact status area, small logo/gear). The **logo is a lightweight line mark** (a suitcase; doubles as the home
    affordance per Navigation_Concept §1.2), not a heavy filled tile. The bar is static on every screen.
* **M4 quick-add:** keep the inline quick-add (FR-5.6, well-liked); it **collapses when it loses focus**, and the
  **bottom-right ＋ (FAB) expands *and* focuses it** as the primary entry point.
* **FR-25.22 (One Arithmetic for Every Fraction on M4):** Every `x/y` M4 draws counts the same
  thing: **units**. The trip line, a group head, a cluster head and the row's own stepper are four levels of one sum,
  so a head is always the total of the lines under it and the trip line is the total of the heads.

  **Read off the rendered screen, not off any one of the four.** A phone shows half a dozen fractions at once; if a
  group head counted *rows done* while the trip line and the row counted units, a row that is one of two packed would
  contribute **nothing** to its group, and a group could be worked on all morning and still read `0/2`.

  **A skipped row counts as no units — `0/0`.** FR-5.5's *bewusst nicht einpacken* is a quantity of nothing. Counting
  it as one unit, done, reads as progress nothing earned: on a trip with 57 consciously-skipped items the trip line
  would say `57/284 gepackt` while not a single item had been packed. The trip line is the number a person actually
  reads, so a skipped row is neither packed nor part of what is left to pack; it drops out of both halves of every
  fraction. This is decided once in `domain/packState.ts` beside `stateFor`, because it is the same reading of the same
  two numbers.

  **What is *not* a fraction stays a count with a noun.** „2 Erledigte anzeigen" and the filter sheet's „zeigt 13
  Packelemente" count **rows**, correctly — a reveal toggle promises how many lines will appear, which is not a
  quantity of anything. They are safe from this rule precisely because they name what they count; a bare `x/y` cannot.

  The cluster head therefore counts units, not people (FR-25.21(a)). FR-21.16 is the type half of the same reading of
  the same screen.
* **FR-25.23 (A per-person cluster folds, and starts shut):** A cluster (FR-25.1) **folds like a
  group does** (FR-25.16), and **shut is its default**: the packing list shows one line per per-person item, not one
  line per item *per traveler*.

  **Why.** A head above children that are always open is an *extra* line, so naming the item once costs a line rather
  than saving any: four travelers who each need a rain jacket render five lines for one item. On a trip whose roster is
  a family, the list a person opens is mostly the same item name written down again and again, and the categories the
  grouping exists to separate are pushed off the screen. Measured on the mockup sheet
  (`dev-docs/UI_Concept_PerPersonRows_variants.html`): the same trip is **20 lines open and 6 folded**.

  **What a shut head owes.** Shut, the head is all that is left of the cluster, so — exactly as a folded group header
  does — it has to answer what the hidden rows would have:
  * **who**, as one **face per instance in roster order**, with the faces of instances already dealt with ringed in the
    done colour. A face, not a name: the head has a name already, and it is the item's.
  * **how far**, as the **open count in units** („4 offen"), the same arithmetic as everything else on M4 (FR-25.22).
    Open, the head goes back to `done/total`, because the children are then making the per-person statement themselves
    and a head that repeats it spends a line saying it twice.

  **The caret trails the item's name** rather than leading the line. Leading it would push the name off the x that
  every other item row's name sits on, which is the alignment FR-21.20 exists to hold — a cluster head is one of the
  list's lines, not a heading over them.

  **Folding is view state, and it is not persisted.** The expanded set is per cluster key and survives re-rendering, so
  packing an instance does not shut the cluster you are working in; it does not survive a reload, unlike the FR-25.18
  filter, because it is a position in a list rather than a choice about it. FR-25.16's last paragraph holds here
  unchanged: a folded cluster with open instances is still on your list, and FR-25.2's disappearing rows are a
  different rule entirely.

  **The cost, stated rather than hidden:** packing one person's instance costs a tap to open the cluster first. That is
  the trade — the common act on M4 is *reading* the list, and an unfolded list is unreadable. The follow-up that removes
  the tap again is the avatar-per-instance variant (B on the sheet), where a face on the shut head is itself the pack
  control; it is deliberately a second step, because it changes what a face *is* and should be decided against a built
  fold rather than against a drawing.
* **FR-25.24 (A row's planned amount is changed where the row is):** the
  *planned* quantity of a packing row is editable **from M4**, on the row's own count, and from M5's detail block for
  the other posture. Correcting an amount is something a person does to five rows in a row while looking at the list,
  and a sheet per row cost the list five times over. The row menu carries it too (*„Menge ändern"*), because a row of
  one renders a checkbox and has no number to tap. **A skipped row is offered none of it:** the editor's smallest
  amount is 1, so setting one there would be an unskip that leaves the FR-20.2 companions behind — *„Doch einpacken"*
  is the entry that does that correctly.
* **FR-25.25 (Assignment and late-packer are set from the row):** the two decisions a packing row carries about *who*
  and *when* — FR-25.19's assignment (`packer_user_id`) and FR-5.1's late-packer flag — are set from the row itself,
  not only through M5 (open the row, expand *Details*, scroll, set, close). Both are decisions made while reading the
  list, often on several rows in one pass, which is the same argument FR-25.24 makes for the amount.

  **Where each one sits, and only there.** The assignment is the **row's edge avatar** (FR-25.19), which already names
  the responsible person: tapping it opens a picker of the trip's other members plus *niemand*. A row nobody has shows
  an **empty seat** in that same place rather than nothing at all — it is the row that most needs the control and the
  one with nothing to tap. The late-packer flag is an entry in the **row's press-and-hold menu**, last of the row's
  own actions, because it says something about *when* rather than about now. **One door each:** the flag gets no
  second target on the row and the assignment no second entry in the menu — two ways to make one change are two things
  that drift (FR-21.24). M5 keeps both controls: it is the surface that shows everything about one row.

  **What the control is not offered on.** The seat is absent where there is nobody to assign to — Local and
  Single-User Mode have no second account (G-8) — while somebody else holds the row (G-3), in FR-9.3's closing pass,
  and once the avatar has become the **packing record**: who packed it is not a choice (FR-25.19), so the row that
  shows it offers nothing to pick. The late-packer entry is absent on a skipped row, where nothing is being packed.

  **A consequence worth naming:** assigning a row to somebody else makes FR-25.20 hide it from your own list. That is
  the same thing M5's control does; from the row it is more visible, because the row you just touched
  leaves. The FR-25.20 reveal bar names the person, which is what keeps it from reading as a row that vanished.
* **FR-25.26 (A per-person cluster's head acts on every instance at once):** the driving case is the toothbrush: four
  travelers, four instances, and one true statement about all of them — everybody packs it on the morning the trip
  leaves. Said per instance it costs four passes through M5 for one boolean. The **cluster head** (FR-25.1) carries the
  same press-and-hold menu a row does — the short tap stays FR-25.23's fold.

  **The head offers everything a row's own menu does.** A shut cluster is one line on the screen, and a press on it that
  could do less than a press on a row would teach the reader to open the cluster first. The head carries the late-packer
  flag and *„Alle zuweisen an …"*, each **for every instance under it**, and FR-25.24's *Menge*, *„Jetzt packen"*,
  FR-5.5's skip and its *„Doch einpacken"*, G-3's release, FR-9.3's *unused* judgement and FR-5.8's removal — in the
  row's order, in the row's words (the sub-header already says how many rows they reach). **Each entry reaches the
  instances whose own row menu would offer it**, so a head over two open instances and a skipped one skips the two and
  un-skips the third, and an entry is on the head when at least one instance nobody else holds would offer it
  (`clusterMenuEntries`, `clusterTargets` in `domain/clusterActions.ts`). The late-packer flag and the assignment reach
  every instance. Four points:
  * **The takeover stays off the head**, for the reason below: breaking a claim is a decision about one row.
  * **The amount is written, the same number, to every instance.** It is per person (FR-25.1), so one number is the
    statement; the editor opens on the first instance's amount, and the first tap makes that true of all of them.
  * **Skip and removal are one gesture with one undo.** Their snackbar names the item — with *„(3 von 4)"* when a
    claim kept the write off an instance, since the undo-bearing snackbar cannot hand its report to the fan-out toast.
  * **A removal of every instance asks what the instances only kept for each other.** FR-20.2 keeps a companion while
    another traveler's row of its main item is still on the list, so asked row by row every instance would name no
    companion, and the confirmation would promise less than the write takes (`planRemovals`). Likewise ADR-065's
    inventory prune: the instances are no use of each other (`itemLeftUnusedByRows`).

  **No new structure.** A fan-out writes each instance's own field, exactly as the row-level control does, so
  field-level LWW (NFR-4.2a) merges the result with no rule of its own and an instance set differently afterwards
  **stays** different. The head is not a row and owns no state; nothing is added to the schema, the sync envelope or
  the merge.

  **The set it writes is the set it counts.** A shut head answers for the instances FR-25.2 has hidden as done and for
  the ones the facets let through — so those, and only those, are what „für alle" reaches. A head that said *„4 offen"*
  and wrote three, or that reached a fifth instance the filter is hiding, would be lying in one of the two directions.

  **A held instance is skipped, not obeyed.** Where somebody else is packing one of the instances (G-3), the fan-out
  writes the rest and **says so**: *„3 von 4 geändert · Sia packt gerade"*. Refusing the whole action would give the
  lock teeth it deliberately does not have — it is advisory by decision — and writing the held row
  anyway would change it under the hands of the person holding it. Only when **every** instance is held does the head
  offer no menu at all, which is the answer a fully locked row already gives. The head offers no *takeover*: breaking
  a claim is a decision about one row, named and confirmed (FR-5.7).

  **The flag is read over every instance, the write only over the writable ones.** The head paints its ⏰ when any
  instance carries the flag (FR-25.23), so the menu offers *„aus"* only when all of them do — including any a lock is
  keeping it from writing. Otherwise the head would offer to switch on what it is already showing as on.
* **FR-25.27 (What is packed on departure day gets out of the way):** the late-packer flag (FR-5.1) says *when* a row
  is due; this is what it does to where the row sits. On a list being worked through now, a row that cannot be dealt
  with now is an interruption: it is read, skipped over, and read again on the next pass. The flag is set from the row
  (FR-25.25) and from a cluster head (FR-25.26).

  **Two halves, and the first needs no control.** (a) A flagged entry **sinks to the end of its group**, below the rows
  that can be packed now and above the ones that are done — three tiers in the order the day runs, extending FR-25.2's
  partition rather than adding a second rule beside it. A cluster sinks as soon as one visible instance is flagged, the
  same rule its ⏰ follows: a warning that holds for only some children is one the reader misses. (b) A **third reveal
  switch** in the filter sheet (FR-25.11i), beside *Erledigte* and FR-25.20's, puts them away entirely.

  **The switch is the one that starts *on*.** The other two hide rows that ask nothing of the reader — done, or
  somebody else's. A late-packer row asks for something, just not yet, so hiding it is something the reader chooses;
  a screen that did it by itself would be leaving the house without the keys. It is session state per trip like the
  rest of the filter (FR-25.18), and the *Zurücksetzen* that clears the filter turns it back on.

  **The bars run in the order the rows do.** Above the list the flagged rows sit over the packed
  ones; under it their reveal bars do the same, because the ordering rule is *does this row still ask for something*
  and a late-packer row does. The foot of the list therefore reads: late-packers, then FR-25.20's rows in somebody
  else's hands, then — last, asking nothing of anyone — the done ones.

  **Never silently, and never twice.** A trip with flagged rows carries a reveal bar for them, and while they are
  hidden the view reports itself as *narrowed* — otherwise a trip whose remainder is all late-packers renders *„alles
  gepackt"* over rows nobody has touched (FR-25.11e). Bar and switch carry **one number**, the flagged rows the filter
  lets through, whichever way the switch stands: a count that dropped to zero on reveal would be labelling two
  different sets with one word (FR-25.22, the defect E2E-M4-69 was written for). The two hiding rules exclude each
  other's rows from their counts: a row that is both somebody else's and flagged stays hidden whichever bar is tapped,
  so neither bar may promise it. Picking ⏰ in *Merkmale* **overrides** the switch for exactly those rows, which is
  FR-25.11l's rule on a second axis — a panel that reports a count and then shows nothing for it is the contradiction
  both forbid.

  **Why a switch and not a filter value.** *Merkmale* is an including facet: picking ⏰ asks to see those rows and
  nothing else. Hiding is the opposite ask, and expressing it as a negation would give one axis two meanings and every
  other facet a question it does not answer. FR-9.3's closing pass is exempt from both halves: it reviews what was
  taken along, and a late-packer row was taken along like any other.
* **FR-25.28 (Who an item is for is answered on the row, *built*):** FR-25.21's question — *gemeinsam*, or which
  travelers — is answered on the row, not at the bottom of a stack of sheets. It is a decision made while reading the
  list and usually for several rows in one pass — the argument FR-25.24 makes for the amount and FR-25.25 for the
  assignment.

  **The for-whom strip.** One control answers it: a single line of toggles — *Gemeinsam*, then
  *Alle*, then one avatar per traveler in roster order — with a one-line summary beneath it (*„3 Personen · 6 Stück"*,
  or *„Gemeinsam · 1 Stück"*). **Every tap commits** (G-5, FR-25.15); there is no *Übernehmen*. It is the grammar
  FR-25.13h's avatar buttons already taught in the browse-sheet, grown by the two ends that line had no room for.
  * **No avatar lit means *gemeinsam*.** An empty membership is not a state the model has (FR-25.21c), so the strip
    does not invent one: *Gemeinsam* is lit exactly when no traveler is.
  * **The first traveler takes the row over**, amount and progress included — ADR-036's keep-and-repoint, unchanged.
    Every further traveler arrives at the floor of 1.
  * ***Alle* only ever enlarges**, FR-25.21c's rule verbatim: travelers without a row arrive at 1, every amount
    somebody chose is left standing. Once everybody is lit it is a lit toggle whose tap changes nothing, and it is
    not disabled, for the reason FR-25.21c gives.
  * **Tapping a lit avatar removes that traveler.** Removing the **last** one turns their row into the shared row
    with its amount and progress — **silently**, see *Four decisions* below.
  * **Tapping *Gemeinsam* over two or more travelers collapses them**, summing the amounts (FR-25.21 (b)), and asks
    first.

  **Three surfaces, one component** (invariant 4's second half, as FR-25.21 already ruled for the sheet):
  * **M4 — the seat.** The list gains a leading ***who* column**, one avatar wide, before the mark. On an item row and
    on a cluster head it holds the **for-whom seat**: a shared row shows an **empty seat** with the people glyph —
    FR-25.25's idiom, mirrored — a lone per-person row shows its traveler, and a cluster head shows **how many**
    travelers it is for. Not an avatar stack: the faces are the child rows directly under the head, and a stack
    would make the column as wide as its longest roster and pushed every name on the list off its x
    (FR-21.19). A **child row's avatar moves into the same column**, under its head's seat, and leaves the mark slot
    empty beside it, so item rows, heads and child rows still start their names in one line (FR-28.4). Tapping the seat
    unfolds the strip **inline under the row**, above the child rows; tapping it again, or another row's seat, folds it.
    **At most one strip is open**, so working down a list costs one tap per row to move on, not a close and an open —
    and it is **held by the item, not by the row**: the first traveler turns a row into a lone per-person row and the
    second turns that into a cluster under a different list key, and the strip stays open across both. The M4 strip
    carries **no steppers**: a lit traveler *is* a child row from the same tap, and a child row's count is already where
    its amount is changed (FR-25.24). Left says *for whom*, right says *who packs* (FR-25.25) — two seats, two
    questions, never the same glyph: the left one draws travelers, the right one accounts. A child row gets no seat; its
    avatar is its answer, and the head above it owns the question.
  * **M5 — above the fold, in place of a membership chip.** The strip sits under the packing block; *Details ▾*
    carries no *„Wer braucht das?"* row and there is no second sheet. M5 has the room for amounts, and carries them as
    **one line per lit traveler under the toggles** — name and stepper — not as a stepper under each avatar: a stepper
    is wider than a toggle, and at five travelers on a 360 px phone each one would reach into its neighbours' columns
    and take their taps. FR-25.14 holds: the
    aggregate stays a read-only figure in the summary line, and every stepper belongs to one named person. **The sheet
    closes when the strip deletes the row it is open on** — M5 stands on one instance and the strip acts on all of them,
    so unlighting that traveler would otherwise leave the sheet reporting *not found* about a row it was just asked to
    remove (the rule FR-5.8 already follows). A sibling leaving changes nothing about the sheet.
  * **Quick-add — in place of the *pro Person* switch.** The strip sits over the composer's field and a sentence under
    it states the outcome (*„Wird für 2 Personen angelegt, je 1."*); the choice **survives an add**,
    because per-person rows come in runs, and dies with the composer. The add writes one row per lit traveler at 1 and
    **opens nothing** — amounts are corrected on the child rows that have just appeared. With nothing lit the add is a
    shared row. **The strip speaks for what the composer adds — typed names, chips, suggestions — and for
    nothing else.** The browse-sheet answers *for whom* per line with its own 👥 and avatars (FR-25.13g/h), and one door
    per surface is the rule (FR-21.24): a sheet add never reads a strip the sheet is covering, FR-25.13f's two decided
    verbs included, and with no editor to make way for, nothing waits for the sheet to close.

  **Questions are asked in the strip, not over it.** The two confirmations FR-25.21 keeps — a traveler whose row
  carries progress or notes (`rowsCarryingContent`), and a collapse of two or more — and FR-5.5's *weggelassen*
  question replace the summary line with the outcome stated before it happens and two buttons, *Abbrechen* and the
  verb itself (*Entfernen*, *Zusammenlegen*, *Doch einpacken*). An `IonAlert` would take the screen away from a
  control whose point is that the list stays put, and would sit a viewport away from the finger that asked. **This
  is confined to the strip**: every other destructive confirm keeps the FR-24.3/ADR-032 alert, and the strip's
  question is that idiom's sentence in a different container, not a second idiom. While a question stands the
  toggles are inert; folding the strip answers *Abbrechen*.

  **What is unchanged, because the model is.** No schema, no wire, no merge rule, no ADR: the strip calls the
  planner in `domain/membership.ts` that the sheet and FR-25.13h's `assignToTravelers` already call, and each
  traveler remains an ordinary `trip_items` row. Membership is a toggle and never a quantity of 0; a child row's
  count floors at 1. A rewritten row's state follows its numbers (FR-25.21). **G-3:** while somebody
  else holds any instance the strip reads and does not write, and says who is packing — the seat still opens it,
  because *who is this for* stays a fair question to a locked row. **G-8:** below `MIN_TRAVELERS_FOR_PER_PERSON`
  there is no seat and no strip on any surface. FR-9.3's closing pass offers no seat, as it offers no assignment.
  Identical in Server, Single-User and Local Mode — travelers are trip records, not accounts.

  **Four decisions:**
  1. **There is no membership sheet beside the strip.** One door per decision (FR-21.24); a sheet kept „for the
     overview" is a second writer of the same rows and the two drift. FR-25.21's points (i)–(iii) about *the editor*
     describe the strip where they apply.
  2. **A visible seat, not a press-and-hold entry.** The seat costs about 44 px of every shared row's width. A menu
     entry would cost nothing and leave the question as hard to find as a path through M5 — being unable to see where
     the question lives is what the seat answers.
  3. **The inline question**, above.
  4. **FR-25.21 (iii) narrows: a collapse asks only from two travelers up.** With one traveler left nothing is summed
     and no amount changes; the row moves from one person's list to the shared one and the toggle that did it is still
     under the finger to undo it. It also destroys nothing, which is why it needs no rule of its own: the last
     traveler's row is **re-pointed** to *gemeinsam*, not deleted, so its amount, its progress and whatever hangs off it
     survive (`membershipWithout`, E2E-M4-101). *A traveler leaving while others stay* keeps FR-25.21's rule — silent
     when the row is untouched, asked when it carries something — because that row really is deleted.

  **Rules found by rendering it rather than by reading it:**
  * **Laid out for three travelers.** Three is the common trip, so up to three the toggles are full 40 px faces with the
    name spelled out under them; from the fourth they step down to a compact 32 px face with a 40 px column, which fits
    five on a 360 px phone, and past that the line scrolls sideways — it never wraps and never shrinks further. Sizing
    every roster for five looks cramped at three for no reason.
  * **The strip is opaque, sunken and raised above the rows below it.** It appears at once while those rows slide down
    to make room (FR-25.2's move transition), and a later sibling paints over an earlier one: unraised, for 0.3 s the
    rows are drawn across the strip, which reads as a background too transparent to hide them. Raised, they slide out
    from underneath. The seat is also its own tap target (`ion-activatable`): Ionic's tap feedback lights the first
    activatable on the event's path in the capture phase, so otherwise a tap on the seat ripples the whole row, as if
    it were opening the item.
  * **A converting row leaves at once.** The list animates a departing row shut (FR-25.2's pack-out), and a row turning
    into a cluster is, to the list, one entry departing and another arriving. Animated, the old row and its strip would
    stand beside their own replacement for the length of the collapse — the item named twice and the control drawn
    twice (E2E-M4-100). The rule is `isReshaped` in the domain: an element leaves at once when its item is **still
    shown** under another entry and its row did not merely go out of sight — so a row that is packed, filtered away or
    taken off the list keeps its collapse, even with a sibling instance still on screen. It holds whichever strip made
    the change, including **M5's**, which reshapes the list under the sheet exactly as M4's does (E2E-M5-29).
  * **The who-column costs 32 px of every row**, less than the 44 px decision 2 accepts, and only on a trip with two
    travelers or more and outside FR-9.3's closing pass — a solo trip's list is unchanged.
  * **The plan decides what is asked, in the domain.** `membershipQuestion` answers *collapse*, *remove*, *unskip* or
    nothing from the plan alone, not inside a Vue component, where invariant 4 says a rule must never be reachable
    only.
* **FR-25.29 (How far each traveler is, *built*):** M4 shows, under its
  trip line, **one ring per traveler around their face** with *„x von y"* beneath it — *„fertig ✓"* once all of it is
  packed, *„nichts zu packen"* while nothing is theirs — and, as a line of its own under them, the rows that are for
  nobody (*Gemeinsam*). The axis is **for whom** (`assigned_traveler_id`), not *who packs* (FR-25.19's
  `packer_user_id`): it is the axis every mode has, Local Mode included, and the one the person facet (FR-25.11) already
  filters on. Rules:
  * **The shares add up to the trip line.** They count FR-25.22's units, so a skipped row counts nowhere, and a row
    whose traveler is not on the roster counts as shared rather than disappearing from the sum.
  * **The whole trip, whatever the filter** — like the trip line (FR-25.20). A share that shrank with the list would
    stop being a share of the trip.
  * **A tap toggles that traveler in the person facet; a second tap takes them back out.** The rings are quick filters:
    several can be picked at once, OR'd like the sheet's chips, so *mine and the shared ones* is two taps. The strip
    owns no filter: the chip row names each pick like any other facet value. *Gemeinsam* selects the facet's no-value.
  * **Drawn for three travelers:** three columns, no scrolling. Larger parties wrap in threes;
    beyond six, five faces stay and the rest fold behind *„+N weitere"* with how many of them still have something open,
    and a traveler the list is filtered to is never folded away. The order is the roster's, never the progress's, so a
    face does not move out from under the thumb reaching for it.
  * **Absent below two travelers**, where it would only repeat the trip line, and during FR-9.3's closing pass. It is
    content, not a control row (G-12): it sits under the sticky trip line and scrolls away with the list.
* **FR-25.30 (Filtered to one person, a cluster is a row, *built*):** When the person facet (FR-25.11) — typically set
  by a tap on a FR-25.29 ring — leaves a per-person item **one** instance in the group, that instance renders as an
  **ordinary row** with its own check or stepper, not as a shut FR-25.23 cluster with one person inside. *Why:* packing
  one's own things with the list filtered to oneself, every item everybody needs — socks, underwear, a toothbrush —
  would otherwise be a fold around a single row that has to be opened before it can be ticked, two taps per item on the
  list a person works through alone. Rules:
  * **Only the person facet shapes the list.** FR-25.1's full-set rule stays for everything else: packing an instance,
    hiding done rows, the search, and every other facet leave the shape as it was, because none of them is a choice
    about *whose* things are on screen. A choice of people is — so the shape follows it, and the row moving is the
    expected consequence of the tap that filtered, not a restructuring under the finger. Packed and revealed, the row
    stays a row.
  * **The row does not say whose it is when the filter names one person.** The FR-25.1 flat label *„Item · Person"*
    drops the person, since the chip row (FR-25.11a) and the pressed ring already say it for every line. With several
    people chosen the label keeps the name, because then no single chip does. The FR-25.28 seat keeps its face: it is
    the control that changes whose the row is, not a label.
  * **Several people chosen keeps the cluster** for an item two or more of them have, with faces and open count over
    those people only — the FR-25.23 head answering for what it hides, over the list that is actually shown.
  * **No wire, no schema:** a view-model rule in `domain/packingView.ts`, identical in all three modes. **Not a check on
    the cluster head:** it would keep the fold and turn one tap into a bulk action over several rows, which is
    FR-25.26's head menu's job, not the list's.
* **FR-25.31 (Every act on the packing list can be taken back, *built*):** **each act on the list itself** raises
  FR-25.2's snackbar, naming what happened, with one *Rückgängig* — the pack, FR-5.5's skip, FR-5.8's untouched
  removal, FR-27.16's names and a ticked-off task, and every other act below. Without it a mistap on the stepper, a
  wrong person in the picker or a flag set in the closing pass would be final unless the user found the control that
  reverses it; every act on the list is undoable the way a pack is:
  * **The row's controls:** check and un-check (a revealed done row included), the stepper's ＋/－ (the step that
    completes the row reads as a pack), *auf null*, and the amount popover (FR-25.24) — **one opening is one act**,
    announced when the popover closes: three taps on ＋ are one change, and the undo returns to the amount it opened
    on. Announced per tap, the snackbar would also stand over the open popover as the overlay Escape closes first.
  * **The row menu:** *Doch einpacken*, *Ich packe das* and *freigeben* (each other's undo, G-3), Spätpacker on/off,
    *Ungenutzt* / *aufheben*, *Vor Ort kaufen* / *Doch mitnehmen* (FR-5.9), and the removal — **the confirmed one
    included**; the row avatar's assignment (FR-25.25).
  * **The cluster head's fan-out (FR-25.26):** one undo gives every instance the value *it* had, since the instances
    may have disagreed before.
  * **The closing pass (FR-9.3):** each tap on the pass's mark — the pass is exactly where a run of fast taps lands on
    the wrong row.
  * **Tasks:** a prep todo or a trip task (FR-7.4) reopened, a trip task added, and a trip task deleted.

  Rules:
  * **One undo, never a stack.** Each act replaces the snackbar before it, as FR-25.2 decided for packing.
  * **An undo writes back only its own field, onto the row as it is now.** The old value is captured before the act;
    the row is re-read when the undo fires, so a sync or another device's write in between is not reverted, and a row
    deleted meanwhile stays deleted — the rule `restorePack` follows.
  * **A deletion that cascades is deferred, not restored.** The confirmed removal skips its FR-20.2 companions at once
    (an ordinary write the undo reverses), but its own row only leaves the screen: it is deleted when the undo lapses,
    exactly when ADR-065 prunes the inventory item. Re-inserting would have to re-create the row's comments and todos,
    whose authors the server stamps (invariant 3) — an undo would turn somebody else's note into mine. A deleted trip
    task follows the same rule. While hidden, the trip line, the FR-25.29 shares and the FR-7.4 check count what the
    list shows, not what the store still holds. *Accepted cost:* the app killed while the snackbar is up keeps the row
    or the task, and other devices see it until the lapse — the safe direction for a delete.
  * **Not undoable, on purpose.** Taking over somebody else's claim (FR-5.7): the server stamps the holder, so the claim
    cannot be handed back by the client. Nor *Reise starten*, nor the FR-27.4 group changes, adding a group (FR-27.10)
    and FR-25.13f's browse-sheet verbs (it keeps its in-line undo): their writes run through the FR-27.4 position ledger
    (ADR-030), where taking an add back is a decision of its own. M5's controls are out of scope: their result stays on
    the open sheet.
  * **No wire, no schema:** the undo is `useRowUndo`'s `armAction`, the same one-slot record the pack uses; identical
    in all three modes.
* **FR-25.32 (A search finds what the reveal switches put away, *built*):** M4 hides three classes of rows by default
  or on request — packed (FR-25.2), somebody else's (FR-25.20) and late packers (FR-25.27). A search that only narrowed
  what was left would make a packed row unfindable by typing its name; the reader would have to leave the field and
  turn *Erledigte* on first. **A non-blank search term lifts all three switches for the rows it matches.**
  * **A lift, not a flip:** the switch states are not written. Clearing the term returns the list to exactly what the
    switches say, so nothing is left switched on behind the reader (the reason FR-25.18 keeps them per session).
  * **Facets are not lifted.** A Person or Status value was chosen; a switch is a default. Same rule as FR-25.11l, in
    the other direction: a picked value reveals its own bucket, a typed term reveals its own matches.
  * **The closing pass** (FR-9.3) already shows everything it lists and is unchanged.
  * **The Erledigte and Spätpacker bars go while a term is typed.** The Erledigte bar's offer — *„Gepackte anzeigen"* —
    would stand beside a packed row that is already on screen, and its tap would change nothing the reader can see. The
    sheet's switch still counts the *matches*, so FR-25.22's pairing of bar and switch is read without a search
    (E2E-M4-69). The *Spätpacker* bar follows the same rule (E2E-M4-94), and the *Anderen zugewiesen* bar reports 0
    hidden and is gone with them — while a term stands, no reveal bar is shown.
  * **No wire, no schema; identical in all three modes.** A tap on a switch's *words* toggles it once (E2E-M4-127).
* **M4 explicit "do not pack" — *built*:** the consciously-skip action (FR-5.5) is discoverable through the row's
  press-and-hold menu and, spelled out, through the M5 sheet — not through a swipe, which is not discoverable at all
  (FR-5.5).
* **M5 progressive disclosure — *built*:** the detail sheet leads with only the header, a compact read-only
  **glance-chip row** (mode · luggage · ⏰ · packer), FR-25.28's for-whom strip, the **Preparation** section, and the
  **Comments** thread; everything else (*Packed by*, mode, luggage, late-packer, flags, history) collapses behind a
  **"Details ▾"** toggle. This applies the M8 progressive-disclosure principle (FR-25.7) to M5 — the common reasons to
  open an item (check prep, read/add comments) are one glance away; the rarely-touched controls are one tap away. The
  membership control is above the fold because it is reached often (FR-25.28).
* **M5 delegation is reversible — *built*:** *Packed by* has an explicit **"niemand"** option that clears
  the delegation.
* **M5 comment entry — *built*:** the comment/task thread (FR-7.1) has a **visible composer** input on the
  sheet.
* **M5 preparation lifecycle — *built*:** the *Preparation todos* section (FR-7.3) supports add / resolve
  / reopen inline, and a *packed with open prep* item shows the amber state.
* **M2 default ordering:** trips are **grouped by Trip Series** under tappable headers that lead to M16, every segment
  sorted by date **newest first**, with no series chip on the row; the opening segment is FR-2.8's derived one (UI-Spec
  M2, *Default ordering*). Refines the M2 presentation under FR-2.1.

### 3.26 Calendar Reminders (iCalendar Subscription)

**Status: proposed** — **not yet implemented** (no schema, no code, no UI). Direction chosen:
a **read-only iCalendar subscription feed (Variant B)**, deliberately *not* a writing CalDAV push. Relates to the
North-Star "Prepare" phase (`Vision_NorthStar_v1.0.md`). Details below are the intent; the open questions must be
resolved before this moves to *accepted*.

* **FR-26.1 (Calendar Reminder Feed):** JIT-Pack exposes, per user, a stable **read-only iCalendar (`.ics`) subscription
  URL** (`webcal://…`) that the user subscribes to **once** in their calendar app (Apple / Google / Nextcloud /
  Thunderbird / …). The calendar client *pulls* the feed on its own sync schedule; JIT-Pack **never writes into, nor
  authenticates against, the user's calendar**. Rationale for choosing this over a writing CalDAV integration: it keeps
  the app offline-first and self-hosted, stores no third-party calendar credentials, and adds **no outbound network from
  the JIT-Pack server** — so it **does not trip ADR-007** (that gate concerns JIT-Pack *fetching* external content; here
  JIT-Pack is the one being fetched, read-only). Trade-off accepted: no actively-pushed alarms and updates appear only
  at the calendar client's next sync, not instantly.
* **FR-26.2 (What becomes an event — to specify):** candidate sources: **(a)** a trip's **departure date** → an all-day
  "Für &lt;Trip&gt; packen" event; **(b)** **preparation todos** (FR-7.3) that carry a due date; **(c)** the
  **late-packer** departure-day reminder (FR-5.1). The exact set is open — likely (a) first, (b)/(c) as opt-ins.
* **FR-26.3 (Lead time / VALARM — to specify):** each event carries a configurable reminder **lead time** (e.g. a
  `VALARM` at −1 day). Default value and whether it is per-source configurable are open.
* **FR-26.4 (Feed scope & security):** the feed URL embeds an **unguessable, revocable per-user token** (bearer
  capability — no login in the calendar client, rotatable if leaked). Multi-user: **each member gets their own feed**,
  visibility-filtered to that member's trips (mirrors the sync visibility rules). Whether a *shared per-trip* calendar
  is additionally offered is open (FR-26.2/26.4 interact).
* **FR-26.5 (Stable event identity):** each event uses a **deterministic `UID`** derived from its source (trip id / todo
  id) so the feed updates **in place** — changing a trip's dates moves the event, removing the source drops it — on the
  calendar client's next pull. No duplicate events on re-sync.
* **FR-26.6 (Local Mode — no server, no feed):** Local Mode (3.19) has no server to host a subscription URL, so the live
  feed is a **Server-Mode-only** feature (FR-19.3-style gating). Local Mode instead offers a one-tap **`.ics` file
  download** (like the portable-YAML backup, FR-18.2) that the user imports into their calendar manually — non-live, but
  serverless-consistent.

**Open questions to resolve before *accepted*:** exact trigger set (FR-26.2); default lead time(s) (FR-26.3); per-member
vs. additional shared trip calendar (FR-26.4); feed refresh cadence expectations to document for users (calendar clients
poll on their own, often only every few hours).

### 3.27 Template Composition ("Gruppen"), Trip→Template Round-Trip & Planning-Trip Refresh

*Part of the packing MVP. Concept realised and click-tested in `dev-docs/UI_Concept_Prototype.html`.*

The driving scenario: reusable **groups** like *Makro Fotografie* (camera + macro lens) and *Wildlife Fotografie*
(camera + tripod + tele lens); a **vacation template** composed of such groups, where the shared camera lands on the
packing list **once**; trip planning that combines a template with **additional groups and single inventory items**;
turning a finished (and mutated) trip back **into a template for next year**, with the groups recognised and *reused,
not copied*; and group edits that reach **pending** trips but never touch running or past ones.

* **FR-27.1 (Composable Templates — groups *are* templates, with an explicit scope):** A template can, besides its own
  item positions (FR-1.2), **include other templates by reference**. There is deliberately **no second entity**: a
  "Gruppe" is an ordinary template row, which keeps the template machinery — FR-1.6 governance (in its MVP shared form),
  portable YAML (FR-18.x), master-partition sync, and the M7/M8 screens working unchanged. *Considered and rejected:* a
  dedicated group table — it would duplicate the entire template machinery (ownership, sync whitelist, export, editor).
  Every template carries an explicit **scope** — `kind` `CHECK ('group','template')` — **Gruppe** (contains only item
  positions; includable) or **Ferien-Vorlage** (includes groups + may carry own positions; the thing a trip starts
  from). The scope is **declared at creation, not derived from usage** — a freshly created, not-yet-included group would
  otherwise be unclassifiable. The hierarchy is therefore deliberately **two levels**, which makes include cycles
  **structurally impossible** — *as long as a template cannot change scope underneath its edges*: the guard for that is
  FR-27.6's, and it runs on the server as well as in the editor. The FR-20.5-style cycle validator stays as
  defense-in-depth only. *Considered and rejected:* arbitrary nesting — more machinery (transitive resolution depth,
  cycle UX) for a case the user's mental model does not contain; **revisit trigger:** a real need for groups inside
  groups. Data model: `kind` column on `templates` plus the master-partition relation `template_includes`
  (`template_id`, `included_template_id`, `updated_hlc`) analogous to `template_items`; sync needs only the usual
  `syncableColumns`/`masterPartitionTables` whitelist entries.
* **FR-27.2 (Resolution & Named Dedup):** Trip generation expands a template's includes and merges the expanded set **by
  master item** under the existing FR-2.3a rule (max by default, sum where requested). This is *not* a new algorithm —
  it is FR-2.2/2.3a applied to one more source, implemented client-side in `instantiate.ts` like everything else (Local
  Mode gets it free, FR-19.4). New is the **reporting**: the M3 step-3 preview and the M8 resolution footer **name every
  merge and its contributing groups** ("Kamera nur 1× — in Makro & Wildlife") instead of showing an anonymous count,
  because the merge is the user-visible point of the whole feature. **Include order is derived, not stored:**
  `template_includes` carries no sort column and the rows arrive in whatever order the sync or IndexedDB produced, so
  resolution orders the included groups **by name**, with the include id as tie-break. This is not cosmetic — the order
  decides which group is a merged item's *first contributor*, and therefore whose attributes and `source_template_id`
  the generated row carries, which FR-27.5 and FR-27.11 read back later; two devices must not disagree about where a
  packed item came from. *Considered and rejected:* a `sort_order` column, which would buy manual ordering of a
  composition at the price of a migration and a reordering UI for a list that is typically two or three entries long.
  **Revisit trigger:** a user wanting their groups in a chosen order rather than alphabetically.
* **FR-27.3 (Trip Creation = template + groups + single items, *built*):** M3 step 3 lets the user freely combine
  templates/groups **and single master items from the inventory** (search + add, chip list). Single items dedup against
  the already-resolved set the same way dependencies do (FR-20.3): an item already present is reported ("bereits
  enthalten, nicht doppelt") and never duplicated. Three rules, each visible in the screen: the singles resolve
  **after** the templates, which is what makes „already there" decidable at all; a **per-person fan-out counts as
  present** (the item is on the trip twice already, so a trip-global third row would read as a third one); and a
  position a **condition kept out** (FR-15.2) is *overridden* rather than obeyed — picking it by name afterwards is a
  decision, and the exclusion report stops claiming it is off the list. The generated row carries **no template**
  (`source_template_id` null): FR-27.4 and FR-27.5 both read that provenance, and claiming a template would make the
  trip follow a lie. The picker is deliberately not the FR-25.13 quick-add — see the UI-Spec's M3 entry.
* **FR-27.4 (Group Changes are *Offered* to Trips that are not Past — refines FR-2.4, *built*):** When a template/group
  a trip was generated from changes, the trip is **asked** whether to take the change over: added positions, removed
  positions, quantity/attribute changes. **Past trips are never touched** — archived, or their end date gone by; a trip
  without an end date is open-ended, not over. Everything else is asked, **a running trip included**: departure does not
  freeze a trip, it only means the change arrives as a question rather than silently. One absolute rule: **manual edits
  on the trip always win.** A row the user overrode, deleted, packed or skipped is never touched. **Where the question
  is asked: at the trip, and only there.** Not at the moment the group is saved — in Server Mode the person editing the
  group is usually not the person travelling, the affected trips' partitions are not even loaded on the editing device
  ("not loaded" ≠ "empty"), and a modal on every group edit trains the user to dismiss it. M4 therefore carries a card
  above the list naming **every** change before either answer is offered (a count alone can only be answered by
  guessing), folding above ten lines for the same reason M2's log does. **"Yes"** applies the diff and writes M2's
  applied-changes log. **"No" advances the ledger snapshot and touches nothing on the trip** — which needs no new state
  at all: the ledger already records what generation last produced, and a row differing from it is already read as the
  user's own, so writing the *refused* version there detaches exactly the refused positions and leaves the rest of the
  group still speaking for the trip. There is no pending flag, nothing extra to sync, and no expiry. The consequence is
  stated where the refusal is pressed: **a refused position stops following the group in that trip** — a refused
  addition is not offered again, a refused removal stays, a refused change keeps the trip's value. M2 carries **two
  chips**: „⟳ N Änderungen vorgeschlagen“ (a pointer — the decision is at the trip) and the retrospective „⟳ N
  Änderungen aus Gruppen übernommen“ with its expandable log. **The card's opening sentence is counted in groups, not in
  changes:** it says that a group this trip follows has changed, so one group that moved two positions announces itself
  once rather than as several. The chips above are counted in changes, which is what they name. The proposal chip can
  only speak for a trip whose partition the device holds, which is why M4 asks again on open rather than trusting the
  list. Mechanism: a re-resolution diff on trip open and after every master pull — client-side, identical in Local Mode
  (invariant 4). Data model (migration 023, ADR-016) — three facts make the rule decidable: `trip_template_sources`
  records what a trip follows (registered by M3 from the user's picks — not derived from
  `trip_items.source_template_id`, which would drop a group whose positions were all excluded or deleted, and would
  re-add rows the user removed on purpose); `trip_generated_positions` records what generation last produced per
  position, which is what tells a manual edit from the refresh's own previous work — **and a ledger entry whose row is
  gone is how a hand-deleted position stays deleted**; `trip_applied_changes` is the log behind the M2 chip, storing
  *structured* detail rather than a sentence, because the row syncs and the view owns the wording. Further rules: a row
  is protected not only when it deviates from the snapshot but also when packing has begun on it or it was skipped
  (FR-5.5); a protected row's snapshot is deliberately **not** refreshed, so reverting one's own edit does not hand the
  row back to the template; the trip's **travelers** are part of what it follows, so a person added receives the
  per-person positions (FR-25.8) and one removed takes their untouched rows along — applied at once rather than
  proposed, see below; bookkeeping that changes nothing a user could answer — adopting a hand-added row into the ledger,
  dropping an entry whose row and position are both long gone — is applied on sight and deliberately **not** counted as
  a proposal. Ids of propagated rows are **derived** from (trip, item, traveler) so two devices applying the same group
  edit converge on one row rather than two (ADR-016). Trips created before the registry existed have no sources and
  therefore never move. The M8 editor states the blast radius before you edit — „⟳ Änderungen hier werden N Reisen (…)
  vorgeschlagen, die beim nächsten Öffnen entscheiden — vergangene Reisen werden nie geändert". This **refines FR-2.4**:
  rather than waiting for the next generation, a change reaches the trip as a question the trip's owner answers.

  **A traveller change made *at the trip* applies immediately rather than being proposed (with FR-2.7).** The travellers
  are part of what a trip follows — a person added receives the per-person positions (FR-25.8), one removed takes their
  untouched rows along — protection included: a row that was packed, skipped, overridden or hand-added is never touched
  by either direction. What differs is only *when the user is asked*, and the reason is the same one that puts the
  question at the trip. A group change usually arrives from someone else, on a device that may not even hold the
  affected trips, so it must be a question. A traveller change is made **by the person travelling, in the trip's own
  editor, deliberately** — asking them to confirm on the next open what they just did in front of the app is a dialogue
  with no second party in it. So the rows follow the save, and the result is *reported* the FR-27.10 way: what was
  added, what the traveller already had, and what this trip's conditions excluded. A row the traveller change cannot
  decide by itself is *asked* about rather than decided: a row that was already **packed** is the subject of FR-2.7's
  choice at the confirmation (*Alles entfernen* vs. *Gepackte behalten*), because whether the thing comes back out of
  the bag is not a property of the data. A row that was skipped, overridden or hand-added is not asked about at all and
  simply stays, losing only the assignment — it is evidence of work somebody did, and nobody was offered a say in it.
* **FR-27.5 (Template from Trip with Group Recognition, *built*):** From an archived trip (entry: the closing card at
  the top of M4), the user creates a reusable template. Rows **fold back into the groups they came from** via
  `source_template_id` provenance; ad-hoc rows are matched against master items by name (exact, see below; unknown names
  create master items first — FR-9.2 mechanics). **Which of the group's positions a recognised row *is* follows the same
  provenance:** the row's master item names the position, and the name is consulted only for a row that has no master
  item. Renaming a generated row on the trip is ordinary M4 editing, and matching by name alone would report that rename
  twice — as a position the trip had added, and as one it had dropped — so the trip's own wording would become a second
  position in next year's template. Recognised groups are **referenced, not copied** — they stay independently
  maintainable. Per group, rows the trip **added** under it offer a choice: **"Gruppe aktualisieren"** (the deviation
  flows back into the group, reaching everything that includes it, incl. the FR-27.4 question on the trips that still
  follow it) or **"nur in diese Vorlage"** (kept as an own position of the new template). Default is *update* — the trip
  mutation is treated as learned truth, the same stance as the M14 review assistant. Group positions that were *absent*
  on the trip are reported but leave the group untouched (a skipped tripod is trip history, not a group edit). Loose
  ad-hoc rows become own positions of the new template, optionally bundled into a **new group** instead (name prompt)
  when they form a reusable unit. The result is a composed template (FR-27.1) named by the user — next year's M3 run
  starts from it. Four consequences, each visible in the screen or in what it refuses to do:

  * **The entry needs a lifecycle step.** M21 lives on an archived trip and both archive affordances are gated on
    *active*, so M4's app bar and M2's swipe offer *start* (`activateTrip`) on a planning trip. Deliberately a plain
    status change: the departure ritual belongs to the parked North-Star Plan/During phases. The positive M12 and M14
    e2e cases rest on the same step.
  * **Only a *Gruppe* can be recognised.** A row generated from the source Ferien-Vorlage's own positions carries that
    Vorlage as provenance, and FR-27.1 fixes the hierarchy at two levels — there is nothing to reference. Such a row is
    loose and says so differently from an ad-hoc one ("aus „X“ — als eigene Position übernommen"): it was planned, just
    not by a reusable building block. A provenance id this device cannot resolve is loose too, because guessing would
    fabricate a reference.
  * **„Während der Reise ergänzt" names a cause the app cannot produce**, and the computation is right anyway. The
    wording pictures a row added *under a group* while packing; a quick-add writes `source_template_id = null`, so that
    row is loose by construction. What really produces a row with a group's provenance that the group no longer contains
    is the **group** changing after generation — a position removed in M8, or an FR-27.4 removal the trip declined. Both
    ends read identically from the group's side and both deserve the same offer, so the computation stands; only the
    sentence attributes the change to the wrong end. The prototype's mock has the same shape. *Considered and rejected:*
    the neutral alternative ("Auf dieser Reise dabei, in der Gruppe nicht"). **Revisit trigger:** a surface that lets a
    trip row be assigned to a group — the M14 retarget idea applied to packing — at which point the sentence becomes
    literally true instead of merely well-phrased.
  * **The ad-hoc name fold is exact, not FR-16.3-fuzzy.** The Levenshtein matcher belongs to M15's import, where a human
    confirms every non-exact match before it is written; M21 confirms nothing, and German is full of four-letter
    neighbours within two edits (Zelt/Welt, Hose/Dose, Buch/Bach). The two failure modes are not symmetric: a duplicate
    master item is *visible* in M9 and each row deletable there, while a wrong link silently hands the position somebody
    else's weight, tags and photo — and FR-27.4 then propagates that lie to every trip following the group. Exact means
    case- and whitespace-tolerant, which is also what the M14 fold does. **Revisit trigger:** a confirmation step in
    M21, at which point fuzzy becomes affordable again.
  * **No group change history table.** A fold-back is not recorded in a per-group change history; the FR-27.4 mechanism
    already carries the consequence — the edit is offered to every trip that still follows the group and lands in that
    trip's applied-changes log. A per-group ledger is not worth it for one writer. **Revisit trigger:** a second writer
    wanting group provenance, or a user asking where a group position came from.
* **FR-27.6 (Scope Management in M7/M8/M3):** The two scopes are first-class in the UI. **M7** segments into *Alle ·
  Ferien-Vorlagen · Gruppen* (no *Veröffentlicht* tab, per the FR-1.6 MVP simplification); the *Alle* view renders the
  scopes as two sections, vacation templates first (they are what a trip starts from, groups are the building blocks),
  and group rows carry a *Gruppe* chip. **Creating** via the M7 FAB asks which scope to create (two-option chooser with
  one-line explanations) — **only where the question is real:** the scope segment already states what you are looking
  at, so on *Gruppen* the ＋ creates a Gruppe and on *Ferien-Vorlagen* a Ferien-Vorlage, opening the same sheet directly
  on the name. A question with one possible answer is a tap that carries no information. Only *Alle* asks, because there
  both answers are plausible. The scope is never *guessed*: the rule returns "ask" rather than a default for the
  ambiguous case (`scopeForNewTemplate`), since the two kinds are not interchangeable — a Gruppe cannot be promoted once
  something includes it (FR-27.1). The **M8 editor is scope-shaped**: a Gruppe shows only *Positionen* (no group picker
  — nothing to nest per FR-27.1); a Ferien-Vorlage shows *Gruppen* (picker offers **groups only**, plus **"Neue Gruppe
  anlegen…"** inline so a missing building block never forces a detour through M7) and *Eigene Positionen*. The **scope
  is switchable, guarded**: a Vorlage that still includes groups cannot become a Gruppe (remove them first), and a
  Gruppe that is included somewhere cannot be promoted (it would vanish from its consumers) — the editor names the
  consumers ("Eingebunden in: …") instead of failing opaquely. **Both guards run on the server too**, and must: they are
  the *only* thing holding FR-27.1's "cycles are structurally impossible". `templates.kind` is an ordinary syncable
  column, so with the guards in the editor alone two pushes — demote A, promote B — would turn a legal edge A→B into a
  legal edge B→A and the include rule would accept the cycle. `authorizeMaster` judges only a mutation that actually
  *changes* the scope: one carrying no `kind`, or restating the stored one, stays an ordinary edit, because refusing an
  offline rename would cost more than the invariant (NFR-4.2a). **M3 step 3** mirrors the split: *Ferien-Vorlagen* and
  *Zusätzliche Gruppen* as separate sections/tabs — pick one Ferien-Vorlage, then any additional groups. The FR-27.5
  flow assigns the scope (recognised → the new template is a Ferien-Vorlage; the optional leftovers bundle is a Gruppe).

* **FR-27.7 (Preparation Tasks on Template Positions):** A template position — in any scope, typically a group's — can
  carry **preparation tasks** (free-text, zero or more; e.g. "Ladegerät für Kamera: Akkus laden"). At trip generation
  each task becomes an **FR-7.3 preparation todo attached to the generated trip item**, so the existing rule does the
  rest without any new mechanism: an item with an open preparation todo **does not count as done** on the packing list
  (FR-7.3 / FR-25.2 — the todo, not a new flag, is the blocker), it surfaces in the M4 prep section, the M5 item sheet,
  and the M1 dashboard exactly like a hand-added todo. Tasks that belong to the trip rather than to one of its items are
  FR-7.4's. Task edits on a template travel like any other position change — a trip that is not past is offered the
  gained/lost todo per FR-27.4, past trips never are. The M3 step-3 preview reports the count it will carry over ("📋 N
  Vorbereitungs-Aufgaben übernommen"); the M8 position form offers the task list under progressive disclosure (FR-25.7)
  with a count chip on the collapsed row. Tasks are part of the portable YAML shape (FR-18.2). **Deliberate
  non-feature:** todos added *on a trip* do **not** flow back into the group in FR-27.5 — they are usually trip-specific
  ("Offline-Karten Engadin laden"); revisit trigger: recurring hand-copying of the same todo across trips. Data model:
  `template_item_tasks` (`template_item_id`, `task`, `updated_hlc`) or a JSON column on `template_items` — decided at
  implementation; instantiation writes ordinary FR-7.3 rows either way.

* **FR-27.8 (Item → Group Back-References in M10, *built*):** The item editor (M10) shows an **"Enthalten in"** section
  listing every group and Ferien-Vorlage whose positions contain the item, each row tappable straight into that
  template's M8 editor and labelled with its scope chip — **both scopes wear the same chip, unlike M7 where only a group
  needs one**: there the two live in separate sections and the section is the label, while in one mixed list an unmarked
  row beside a chipped one reads as an inconsistency rather than as a rule (G-14). Each row also states how many of that
  template's positions name the item. **Own positions only**, deliberately: this is the navigable counterpart to the
  FR-2.4 usage count (the delete card's „An N Stellen verwendet", asserted in E2E-M10-14/15): the count says *how many*,
  this says *which* — the question a user actually asks when deciding whether an item edit is safe. **Parked:**
  additionally showing **which trips** the item travelled on (usage history per trip) — needs the trip-side query
  surface, parked until after the MVP packing loop.

* **FR-27.9 (Item Comment History in M10, *built*):** The item editor shows a **"Kommentare aus Reisen"** section: every
  comment (FR-7.1) written on a packing row generated from this item, across trips, each with **author, trip, and
  timestamp**, newest first. The section is read-only — the thread lives on the trip item; this is the *aggregated
  rear-view*, because the product's loop is **continuous improvement from trip to trip**: the remark "Ersatzakku
  mitnehmen" made on the 2025 trip is worth most exactly where next year's list is curated — on the item and its groups
  (FR-27.8 sits directly above it). Mechanism: aggregation over `comments` joined through `trip_items.source_item_id`,
  computed client-side over the trips synced to the device (the M12 honesty rule — no server round-trip, works in Local
  Mode); items without comments show no section at all. **Four rules:** the join is the foreign key and *nothing else*,
  so an ad-hoc row's remark never reaches an item — matching by name would put one item's comment on another, the same
  argument FR-27.5 makes against fuzzy folding; **a comment with no timestamp sorts last, not first**, because
  `created_at` is nullable and treating an absent stamp as the epoch would bury the one row nobody can date at the
  bottom of a list read from the top, while treating it as *now* would crown it; the **author line is absent rather than
  a raw id** where nobody can be named, which is Local and Single-User Mode in full (G-8) — the line then carries the
  trip and the date, which is less rather than something untrue; and in Server Mode a trip partition arrives when its
  trip is opened, so the section says so, reusing the very condition FR-24.3's delete card already hedges its count
  with. A screen that qualifies one number and not the list above it is contradicting itself. Relation to FR-27.8's
  parked per-trip usage history: FR-27.9 delivers the *commented* slice; the full "was on trips X, Y, Z" listing stays
  parked.
* **FR-27.10 (Add a Whole Group to a Running Trip, *built*):** A group can be added to an **existing trip** from the
  packing list, not only when the trip is generated. Not every scope decision is made in the M3 wizard: you decide on
  site that you will shoot macro this time, and the alternative would be hand-copying a dozen positions. **Surface: the
  M4 quick-add (FR-25.13), verbatim** — no new control. Typing filters **groups** alongside items under a *„Ganze Gruppe
  hinzufügen“* heading, each entry showing its emoji, name and resolved position count and rendered distinctly from the
  item chips; one tap expands the group. **Expansion is the same resolution M3 performs at generation**, minus the
  wizard: per-person positions fan out over the travelers (FR-25.8), **dedup against what the trip already carries** (by
  name, FR-2.3 spirit), and FR-27.7 preparation tasks materialise as FR-7.3 todos on the generated rows. **Rows carry
  the group's provenance** (`source_template_id`), which is what keeps the round trip intact: FR-27.5 recognises them a
  year later instead of reporting them as ad-hoc additions. **The result is always reported** — „Gruppe ‚Makro
  Fotografie‘ hinzugefügt — 3 Positionen, 2 schon dabei“ — and a group already fully present says so rather than adding
  nothing silently (the FR-25.13 duplicate-report rule). **Deliberately not flagged *Missing*** (FR-9.1), unlike a
  single ad-hoc add on an active trip: the item was never missing from the plan — the plan grew. Flagging it would feed
  the M14 review assistant a lie and produce ‚add it to the template‘ proposals for items that came *from* a template.
  **Propagation:** the group is registered as one of the trip's sources unless the trip is already past, so later group
  edits are offered to it per FR-27.4; on a past trip nothing is registered, and a manual add always wins either way.
  Four further rules. The composer matches **group names only** — searching the resolved item names is FR-27.13's
  decided concept for the M8 picker, and half of it here would be a second, quieter rule for the same question. Presence
  is decided **by master item first and by name second**, trip-globally: a row typed by hand on the trip carries no
  `source_item_id`, and a hand-typed „Powerbank" is the same thing the group is about to bring. A **third outcome**
  stands beside the two above: a group every FR-15.2 condition kept out of *this* trip added nothing and was already
  present in nothing, and saying „hinzugefügt — 0 Positionen" about it would be a lie in both directions — it gets its
  own sentence. And the registration is written **even when the group placed nothing**, because following a group is
  about what it does from here on, not about what it happened to contribute today. **FR-20.4 applies to the group path
  too:** what the group placed pulls its missing required companions, exactly as a single quick-add does and as M3's
  generation does — otherwise the same camera brings its spare battery when added alone and does not when it arrives
  inside a group. The rows are **not** written into the FR-27.4 ledger: `planRefresh` adopts a row it finds without a
  ledger entry, which is the same path a hand-added row takes, so the first refresh records them with no extra
  mechanism. The emoji the FR asks each entry to show waits for §3.28, which owns the mark.
* **FR-2.6 (The Review Step Reviews, Not Only Counts, *built*):** M3 step 4 is a review, so it lets the user correct the
  list rather than only approve it. A step that could change nothing but the *amount* — not drop a row this trip does
  not need, not „kaufen statt packen“, not who it is for, not add the thing you notice missing while reading the list —
  would ask you to approve a list you cannot correct, because all of that waits until the trip exists.

  **Variant A: the decisions live on the row.** B (the M5 sheet pulled forward) and C (no editor at all) are out, with
  their costs recorded below. **The question is not which fields — it is where.** M4 and the M5 sheet already do every
  one of these, so any editor built into the wizard is a second place for the same rule, and the second place is the one
  that drifts. The variants were rendered against that tension (`dev-docs/UI_Concept_ReviewStep_variants.html`): **A**
  puts the decisions on the row (stepper, ✕, chips, an add line), **B** opens the M5 sheet in a reduced form (Menge,
  Beschaffung, Zuständigkeit, Weglassen — with packing, comments and preparation *visibly* absent because they do not
  exist before the trip), **C** declines to build an editor at all: step 4 becomes an honest summary — what is produced,
  what merged, what will be bought, which amounts history suggests — and the button creates the trip and opens M4.

  **Two rules that hold for any variant:**

  * **Dropping a row means FR-5.5, not deletion.** A row removed here is *considered and skipped* — quantity 0, visible
    and struck through, reversible — because that is what the same act means everywhere else in the product, and because
    a trip that silently lacks a template row teaches the next trip nothing. M4 also deletes a row (FR-5.8), as its own
    named act beside the skip; the wizard's *drop* is a skip.
  * **Whatever step 4 gains, M4 keeps.** No decision may become wizard-only; the wizard may only bring a decision
    *forward*.

  **Scope of A:** the row carries the two decisions a review actually makes — the amount, and *drop it this time* — plus
  the marks that explain what the row already is (*pro Person*, the procurement mode). **The chips are labels, not
  editors:** turning them into controls would put a second procurement and assignment editor beside M5, which is the
  very thing this FR argues against. **The add line from the mockup is deliberately not built here:** adding single
  items to a trip being created is FR-27.3, which owns it in step 3, and building a second path for it in step 4 would
  leave two mechanisms to reconcile.

  *The costs of the variants*, recorded on the mockup: A's row fills up and cannot grow to renaming; B doubles the
  sheet's states, so every future field must answer "do I exist before the trip?"; C makes „anlegen“ feel more committal
  than „weiter“, and a row you were certain about must be created before it can be dropped.

* **FR-2.7 (A Trip Can Be Edited After It Is Created, *built*, M22):** A trip's name, its dates and **its travellers**
  are decided in M3 and stay editable once the trip exists — a child does come along after all, a name is mistyped, the
  trip shifts by a week — and the only alternative, cloning (FR-12.1), loses the packing progress, which is exactly what
  makes it no alternative. The status lifecycle (planning → active → archived) and the series assignment keep their own
  surfaces.

  **A screen of its own**, reached from M4's app-bar cluster rather than a sheet: travellers, dates and attributes
  together need the room, and the M5 grammar would nest a list inside an overlay. It edits the trip's own fields and the
  traveller roster; it is not the sharing screen — roles and members stay where FR-4.5 put them, and are hidden entirely
  outside Server Mode per G-8.

  **Renaming a traveller is a rename**, never a removal followed by an addition: their rows point at the traveller row,
  and re-creating it would detach every one of them at the moment the user meant the least by the change.

  **Removal is offered only while the trip has not started.** On an active or archived trip the control is **not
  rendered at all**, and one sentence under the roster says why: a control that is visibly there and answers no tap
  reads as a broken app, and the sentence already answers the question the ✕ raises (UI-Spec M22, E2E-M22-04). **On an
  archived trip the sentence is absent too**, because it is gated on the trip not having started — so that screen offers
  neither the control nor a reason, by decision (UI-Spec M22, E2E-M22-10).

  **The year is deliberately outside this requirement's scope** — it names the trip's name, its dates and its travellers
  — and so is the series, which is attached and detached on M16; M22 renders neither. The year has no writer after
  creation anywhere in the app, which FR-2.1b makes consequential, and whether that becomes a field is an open product
  decision rather than a defect of this FR.

  **What happens to their *packed* rows is the user's choice, taken at the confirmation.** A packed row means somebody
  physically put the thing in the bag, and whether it should come back out is not a question the app can answer: on one
  trip the answer is *take it out*, on another it is *leave it visible so somebody remembers to*. So the confirmation
  offers **Alles entfernen** beside **Gepackte behalten** — and only when there is something to answer about. With
  nothing packed the removal has one outcome, and a question with one answer teaches the user to dismiss questions. The
  question **names the quantity** it concerns, for the same reason FR-27.4's card lists its changes rather than counting
  them: a choice offered over an unnamed number can only be answered by guessing. *Gepackte behalten* is FR-27.4's
  ordinary protection; *Alles entfernen* deletes those rows outright, because that protection is precisely what the user
  just overruled for this person. Unpacked rows go with the traveller either way.

  **What a traveller change does to the list is FR-27.4's job, not a second mechanism** — see its traveller-change
  paragraph. This FR owes the surface, the lifecycle rule and the rename guarantee; the consequences are already
  written.

* **FR-2.8 (M2 Opens Where the Trips Are, *built*):** A fixed *Active* segment is empty for most of the year: a
  household plans in spring, travels for two weeks and archives for the other fifty, so a main entry pinned to it would
  greet the common case with *„Keine aktiven Reisen"* over a list holding twenty-nine trips one tap away. The segment is
  therefore not a constant but a consequence of what exists.

  **The rule, in one sentence: on entering M2, a segment showing nothing is left for the first one that shows something,
  in the order Active → Planned → Archived.** Spelled out, because every clause pays for a failure mode:

  * **It is evaluated on entry, never while the screen is watched.** Ionic keeps M2 mounted, so "entry" is the screen
    becoming visible, not its mount. Archiving the last active trip *from M2's own context menu* therefore leaves the
    segment exactly where it is — with its now-empty state — because a list that reorganises itself under the finger
    that just acted is worse than an empty one. Coming back to M2 later re-decides.
  * **It never overrides a choice that is showing something.** If the segment the user last tapped still holds trips,
    entry changes nothing. This is what keeps it from being a second mechanism fighting the first: the rule only ever
    fires against an empty view, so there is no state in which it and the user disagree about a non-empty list.
  * **`?status=` still wins** (M18's restore, M15's migration, FR-16.2). A caller that names a segment has an answer
    this rule is guessing at, and it is honoured even when the named segment is empty — landing on *„Keine archivierten
    Reisen"* after a restore that produced none is the truth, and better than being shown somebody else's trips instead.
  * **Empty everywhere means *Active*.** A fresh install falls through all three and stays on the first, whose empty
    state is the one that offers *„Reise planen"* (G-7). The rule must not leave a new user on the archive.
  * **Unknown is not empty, and this is the clause with the sharpest edge.** In Server Mode the trip list arrives from
    the master partition after the screen is already on the display; jumping on a list that is merely still loading
    would send every device to *Archived* on every cold start and then leave it there, because the rule does not
    re-decide once the user is watching. It therefore waits for the **settled** signal — the same doctrine ADR-033 wrote
    for the progress ring — and does nothing at all until then. For the master partition that signal is
    `masterDataLoaded`, beside the per-trip `tripDataLoaded`: it is `localHydrated` in Local Mode and the first
    completed master drain in Server Mode. **An offline cold start in Server Mode therefore shows no counts and does not
    walk**, which is the honest answer rather than a defect: that device has no trip list at all, and a walk over three
    zeros would be a decision taken about nothing.
  * **The screen owes the same answer as the arithmetic:** M2's *empty state* waits for the same settled signal as the
    counts and the walk, so an unsettled device never renders *„Keine aktiven Reisen"* over rows that are on their way.
    Until the master partition is settled the screen says *„Reisen werden geladen …"* instead and claims no absence. It
    persists for as long as no pull has succeeded, so an offline cold start stays on that notice rather than being told
    it owns nothing — the G-2 indicator carries the reason and pull-to-refresh is the retry. UI-Spec M2, E2E-M2-18.
  * **And so does every other screen that can say „nothing here":** nothing about the rule is M2's. M1, M7, M9, M23 and
    the FR-4.5 roster (off the master partition), M4, M6 and M11 (off the trip's own) and the conflict log (off a
    request in flight) each say the list is loading before they render a G-7 state off rows they have not read. The rule
    and the three facts that answer it live with the pattern, in **UI-Spec G-7**; the roster's loading and empty
    sentences are distinct, because one sentence cannot say both states. E2E-M4-86.

  **The segment states its count** — what makes the jump legible rather than mysterious: the user sees *why* they landed
  where they did, and, more often, that the two segments they are not on are worth a tap. The count stands **beside the
  label, in brackets** — `Aktiv (3)`. Width is the constraint: **measured at 390 px, the German `ARCHIVIERT (29)`
  truncates before the number** with Ionic's default segment padding, and it still truncates with the padding removed.
  It fits because two things are spent on it — the segment's horizontal padding (the same remedy M21's deviation segment
  uses) and one step down the type scale for the label and its count. **Three digits do not fit and are not made to**:
  an instance with a hundred archived trips loses the closing bracket, which costs a character rather than the number,
  and buying that case would cost the label a second line or a third type step for every device that will never see it.
  Three rules on the number itself:

  * **Zero is written out.** A segment with no trips reads `0`, it does not drop the line — an absent number is
    ambiguous with "not counted", which is exactly the third state below.
  * **Unknown shows nothing**, in both the count and the jump: before the settled signal every segment carries its label
    alone. The same rule as the ring — summing what has not arrived would print `0/0 gepackt` over a decade of finished
    holidays.
  * **The count follows the search** (the shared list-filter pattern's field), because a count contradicting the list
    under it is worse than no count: with a search typed, the numbers say which segments hold hits, which is the
    cheapest possible cross-segment search. The **jump does not** — it reads the unfiltered counts, so a search left
    behind on the field cannot decide which segment the user lands on, and typing never moves the segment under them.

  **The count is not a badge and not a control.** It is part of the button's accessible name (`Aktiv, 3 Reisen`), so a
  screen reader hears the same fact sighted users read, rather than a bare digit after the label.

  **All three modes alike.** Nothing here is server-dependent: the counts come from the trip list the device already
  holds, and Local Mode's settled signal is the hydration it already tracks.

  *Considered and rejected:* remembering the last segment across sessions. It answers a different question — where you
  were — and it decays into exactly the defect being fixed here, because the last segment you were on is usually the one
  that was interesting *last* season. The rule as written needs no persisted state at all.

  *Revisit trigger:* the walk order stops matching how the household reads the list — for instance a device that mostly
  consults the archive and is annoyed at being sent to *Planned* by one trip somebody sketched.

* **FR-27.12 (Looking Inside a Group, *built*):** A group can be **inspected wherever it is offered**, not only in the
  M8 editor. A group that announces *how many* items it holds and never *which* would have M3's step 3, M8's Gruppen
  section and M14's target picker ask the user to accept a name and a count, and reaching the M8 editor costs the M3
  draft or the M14 review pass. **Two halves:** the **row names its first two items** and counts the remainder („Kamera
  · Makro-Objektiv +2“ — the count is fixed once, in the domain, at two: three German names wrap at 390 px), which
  answers the frequent case with no interaction and no state; and a **chevron opens a read-only sheet** in the M5/M8
  sheet grammar listing the *resolved* content — what a trip would actually get, dedup included (FR-27.2), so a
  Ferien-Vorlage peeks through its composition and a shared camera appears once. *Considered and rejected:* an unfolding
  row, which reads best on M3 and transfers to neither of the other two surfaces — M8's picker is a chip row and M14's
  target a select, so a per-screen mechanism would have left two of the three questions unanswered; and the summary line
  alone, which cannot answer "is the tripod in there?". **The sheet is deliberately read-only:** editing a group has one
  home (M8), and a second editing surface is a second place for the same rule to drift. **Where each half sits:** both
  on M3's rows and M8's included groups; on M14 the sheet only, because that row already carries the proposal and its
  FR-27.4 blast radius and a fourth line would bury both. Ordering is derived (by item name), for the same reason
  FR-27.2's include order is. **Not covered here:** M8's *picker* chips offer names alone — a pill has no room for a
  summary, and the peek is one tap away once the group is included. Finding a group is the problem the peek does not
  solve; **FR-27.13** answers it — search, and results as rows carrying this summary.

* **FR-27.11 — the applied-changes footer states the offer model.** A group change is **offered** to every trip that is
  not past and answered *at the trip* (FR-27.4), which the per-row blast line says („wird {n} Reisen vorgeschlagen");
  M14's footer says the same — the trips following the groups are **asked on their next open** — rather than promising
  that planned trips pick the change up immediately. The component test asserts the claim rather than the copy.
* **FR-9.1 (Trip Feedback Flags):** *Missing* is stamped automatically by the M4 quick-add on an active trip (FR-5.6).
  **Both flags are controls in M5's *Details* block** (UI-Spec M5) and **revocable**: a judgement made by mistake must
  not be permanent, which the merge already allows — setting a flag is additive (NFR-4.2a rule 1, so concurrent feedback
  is never lost), clearing one is ordinary last-writer-wins. The *missing* control is offered only while the trip is
  active; *unused* stays settable and revocable on the archived trip too, where M14 shows what it did (FR-9.3). *Unused*
  needs a writer of its own because FR-9.2's assistant, written around overpacking, reads it as its main input.
* **A generated row keeps its provenance through an ordinary edit.** The client's optimistic update carries a *whole
  row*, and both the in-memory store and the Local Mode IndexedDB write **replace** rather than patch — so a projection
  that omits a column erases it from the device. Omitting `source_template_id`, `packed_by_user_id`, `packed_at` or
  `packing_now_at` would let one M5 edit — a flag, a traveler, a container, the Late-Packer toggle — detach a generated
  row from the group it came from, permanently in Local Mode where no pull ever restores it, breaking everything that
  reads that provenance: FR-27.4's refresh, FR-27.5's recognition, and FR-9.2's *unused* proposals. The guard is a test
  written against the whole `TripItem` type rather than the four columns, so the next column added is covered the day it
  is added.
* **FR-27.11 (The Review Assistant writes to *groups* — §3.27 consequence):** M14's proposals (FR-9.2) target the
  **Gruppe an item came from**, not the composed Ferien-Vorlage the trip was generated from. An item has provenance
  (`source_template_id`), and the group is where the knowledge belongs: writing „Reiseadapter aufnehmen“ into the
  vacation template would teach exactly one trip shape and leave every other trip that uses the same group none the
  wiser — the same reasoning FR-27.5 applies to its fold-back. **Every row names its target group and lets it be
  changed** (the picker offers groups only); an *unused* proposal targets the group the row came from, a *missing*
  proposal — an ad-hoc row with no provenance — defaults to the group that contributed most of the trip, which is what
  the user thinks of as "the list"; **a tie is broken by group name**, because the rows arrive in whatever order sync
  produced them and "whichever was seen first" would have two devices propose two different groups for the same trip.
  Applying states the **blast radius** ("wirkt auf N Reisen", FR-27.4) and is logged as an applied change on those
  trips, so nothing lands silently. **Presentation: a list, not a card stack** — the harvest of a trip is a handful of
  one-line judgements, and a stack shows one at a time while hiding how much is left, the same dishonesty FR-25.11a
  rejects on the packing list. Applied and skipped rows **stay visible, marked**, rather than vanishing, so the pass can
  be reviewed before leaving. *Division of labour with FR-27.5:* M21 folds back **structure** (which groups were used,
  what deviated), M14 folds back **individual items** (unused, missing) — both reachable from the closing card on the
  archived trip.

* **FR-27.13 (Searching the Group Picker, *built*):** M8's *„Gruppe einbinden…"* picker offers every available group as
  a chip. That works at three groups and collapses at twenty: the chip row wraps into a wall, and the only way to find
  *the group with the tripod in it* is to read all of them. The FR-27.12 peek is one tap away only once the group is
  included, which is no answer when the problem is finding the group in the first place.

  **The concept:**

  * **A search field inside the picker card**, above the offers. It appears only when the picker holds **more than six
    groups** — below that, scanning six chips is faster than typing, and a field that is never useful is one more thing
    on screen. It is **not auto-focused**, deliberately breaking with FR-25.13a's *„＋ opens and focuses"*: the quick-add
    exists to be typed into, this picker exists to be *tapped*, and raising the keyboard would bury the very chips that
    answer the common case.
  * **It searches the group's name *and* the names of its resolved items** (FR-27.2 resolution, so an item reached
    through the composition counts). „Kamera" finding *Makro Fotografie* is the question a user actually has — "which
    group has the camera?" — and matching names alone would answer a question nobody asks. **A hit that came from an
    item says so** („über Kamera"), because a result that matches nothing visible reads as a bug.
  * **Matching** is case- and diacritics-insensitive substring. No fuzzy matching — a wrong-but-confident hit costs more
    than a missed one when the result *writes* a composition.
  * **Ordering is derived, not incidental** (the FR-27.2/27.12 rule): name matches first, item matches after,
    alphabetical within each group. Two devices must not offer the same search two different orders.
  * **While searching, the offers become rows rather than chips**, carrying the FR-27.12 summary line, so what you are
    about to include is visible before you include it. This is the half FR-27.12 deliberately leaves out, and the search
    is what makes it worth its space — a chip row cannot hold it, a result list can.
  * **An already-included group that matches says so** („bereits eingebunden") instead of being silently absent: the
    picker hides included groups when browsing, which is right there and wrong when searching, because a search that
    finds nothing implies the group does not exist (the FR-25.13 duplicate-report rule).
  * **No match offers creation with the typed name** — the existing *„Neue Gruppe anlegen…"* inline field, prefilled,
    keeping the M7 rule that no row exists until a name does.
  * **Client-side throughout**, so Local Mode and Single-User behave identically (invariant 4/5); the group set is
    already on the device.

  *Considered and rejected:* a separate full-screen group picker (M7 in a modal) — it answers search well and costs the
  editor's context, which is exactly the detour FR-27.12 was built to remove; and filtering the chips in place without
  switching to rows — cheap, but it keeps the picker unable to say *why* something matched.

  **Three further rules.** The six-group gate counts the **searchable set** — every group except the template itself,
  included ones too — rather than the offered chips: the search covers included groups, and a field that disappeared
  because enough groups were included would vanish exactly as the set grows. The diacritics folding is `foldForSearch`
  in `domain/templates.ts`; the M4 quick-add and the G-12 context search lower-case only, and moving them onto it is
  open and cheap, but not this FR's write. And *„Neue Gruppe anlegen…"* stays visible below the results rather than
  appearing only on no-match — either way it prefills the typed query, so a search that found the wrong groups ends in
  creation just as a search that found none does.

* **FR-27.14 (Seeing a Vorlage's Resulting Items, *built*):** M8's resolution footer states „9 Artikel · 2 Gruppen + 3
  eigene Positionen“, which answers *how many* and never *what*: whether the tripod is in, whether the shared camera
  really arrives once, whether the rain jacket falls per person. The editor of a Ferien-Vorlage therefore shows what a
  trip generated from it would actually get — the very thing the Vorlage exists to produce.

  **The concept: variant A of the rendered variants** (`dev-docs/UI_Concept_ResolvedList_variants.html`); B (grouped by
  source) and C (footer expanding in place) are out, with their costs recorded below:

  * **The footer is the entry** — the line that states the count carries a *„Alle N Artikel ansehen ›“* affordance and
    opens the **existing FR-27.12 peek sheet on the Vorlage itself**. No new surface: the sheet already resolves a
    Vorlage through its composition, and this is the same question asked from one screen further in.
  * **Flat and alphabetical, the way the packing list will read**, with the **provenance under each name** („aus Makro
    Fotografie“, „aus Makro Fotografie & Wildlife Fotografie“, „aus eigener Position“). *Considered and rejected:*
    grouping by source, which answers „woher stammt das“ but never „was kriege ich“ — a shared item can only sit under
    one of its groups, and the list then reads like nothing the user will ever see again.
  * **Three marks, because the honest answer is not always a number.** A merged row says *nur 1×* (FR-27.2); a
    per-person position says *pro Person* rather than inventing a count, since the traveler count belongs to the trip
    and not to the template (FR-25.8); a conditional or buy-mode position carries its condition (*„nur bei Winter“*,
    *„kaufen“*), because at template level nothing is excluded yet — the trip decides (FR-15.2).
  * **Read-only, like the peek it reuses.** Editing a position has one home, the position sheet; a second one would be a
    second place for the same rule to drift (the FR-27.12 argument).
  * *Considered and rejected:* expanding the footer in place. It keeps the editor visible, which is genuinely nicer
    while adjusting positions — but the footer sits at the bottom of a page that already scrolls, so at nine items it
    covers half the editor and at thirty it becomes a scroll inside a scroll.

  **Where else this belongs, deliberately not scoped here:** M3 step 3 answers the same question for the *whole
  selection* (Vorlage + extra groups + companions) and does it in its own preview footer; if that footer ever needs the
  same list, it reuses this sheet rather than growing its own.

* **FR-27.15 (Recognising a Group in Loose Positions, *built*):** A Ferien-Vorlage built position by position can end up
  containing, as *own positions*, exactly what an existing Gruppe already defines — the user typed the camera, the macro
  lens and the ring flash without noticing (or without remembering) that *Makro Fotografie* exists. Unnoticed, the cost
  is silent: those rows carry no group provenance, so FR-27.4 edits never reach them, FR-27.5 reports them as ad-hoc a
  year later, and the knowledge the group exists to hold quietly forks. The editor notices the shape and offers the
  fold.

  **The concept:**

  * **M8 only, Ferien-Vorlage only.** The conversion has a structural home exactly there: loose positions become a group
    *include* (FR-27.1), which is a real change of kind. *Considered and rejected:* detection on a Gruppe (nothing to
    include into — the hierarchy is two levels) and detection on the **trip** — a trip has no includes, so "conversion"
    there could only mean stamping `source_template_id` onto existing rows, which silently subscribes them to FR-27.4
    refreshes the user never asked for; the trip↔group flows already have owners (FR-27.10 adds a group deliberately,
    FR-27.5/M21 recognises groups after the fact, M14 folds items back). Revisit trigger: a user asking, on M21's
    recognition screen, why the app could not have told them *during* the trip.
  * **A group is recognised when its complete resolved item set is contained in the Vorlage's own positions**, compared
    by master-item id — every position references a master item (FR-1.1 creates one even from free text), so name
    fuzziness has no role here, unlike FR-27.5's after-the-fact match. Surplus loose positions simply stay loose.
    Quantities and per-position deviations (per-person, conditions, mode, prep tasks) do **not** block the match — a
    deviation is stated, not disqualifying (below). *Considered and rejected:* requiring equal quantities (a deviated
    amount is the common case, and the miss costs more than the explanation) and threshold matching à la "≥ 80 %" (a
    half-hit needs its gaps explained, and FR-27.13 already settled the stance: a wrong-but-confident offer costs more
    than a missed one when accepting it *writes* the composition).
  * **Two guards keep the hint rare and meaningful:** a group with **fewer than two** resolved positions never matches
    (a one-item group would claim every list that mentions its item), and a group **already included** is never offered
    (its items are covered by the include; the loose duplicates are FR-27.2's dedup question, not this one's).
  * **Propose, never act — the FR-27.4 lesson.** The editor shows a **non-blocking suggestion row** between the
    *Gruppen* section and the own positions: „*4 Positionen entsprechen ⛺ Makro Fotografie*" with **Zusammenfassen** and
    **Ignorieren**, plus the FR-27.12 peek chevron so what the group would bring is one tap away. Nothing changes until
    a tap. The emoji on the row waits for §3.28, which owns the mark (the FR-27.10 rule). *Considered and rejected:*
    converting automatically with a one-click undo. The undo is genuinely lossless here (the include resolves back to
    the same items), but acting silently and explaining afterwards reads as the app rewriting the user's work, and a
    user who typed the positions loose *may have meant it* — deviating from the group is a legitimate reason to not want
    the include.
  * **When positions deviate from the group's, the row says so before the tap** („Menge weicht bei 2 Positionen ab —
    nach dem Zusammenfassen gilt die Gruppe"): accepting means the group's own definitions apply from then on, which is
    what following a group *is* (FR-27.4), and the one thing this feature must never do is change what a trip would
    generate without having said so.
  * **Zusammenfassen** removes the matched own positions and adds the include — the same write path as picking the group
    in the picker, so the FR-27.4 blast-radius note, the resolution footer and the scope guards all apply unchanged. The
    result is reported in the anchored snackbar with **Rückgängig**, which restores exactly the removed positions,
    deviations included, and drops the include — cheap honesty on top of an already-reversible edit.
  * **Ignorieren is remembered per device, per (Vorlage, Gruppe) pair, keyed to the group's item set** — the M9
    property-sheet precedent (`localStorage`, never synced): a dismissed hint is a viewing preference, not data, and
    syncing it would make one person's "stop asking" everyone's. The pair is re-offered only when the group's resolved
    item set has changed since the dismissal, because then the question is genuinely new.
  * **Several groups can match at once** (the shared camera sits in *Makro* and *Wildlife*): one row each, largest
    resolved set first, alphabetical within — derived ordering, the FR-27.2/27.12 rule. Accepting one recomputes the
    rest against the now-shrunken loose set, so a subsumed candidate disappears rather than converting the same items
    twice.
  * **Client-side throughout** (invariant 4): detection is a pure function in `client/src/domain` over data already on
    the device, identical in all three modes; the dismissal store is the only state it adds, and that is deliberately
    device-local.

  **Three further rules, each a widening of the text above:**

  * **The deviation the row states is any generation-relevant one, not only the quantity.** The FR's example sentence
    names the amount, and the amount is the common case — but assignment, procurement mode, Late Packer, dedup and
    conditions all decide what a trip generates, and the group governs every one of them after the fold. A row that
    announced only the quantity would let a per-person position turn trip-global in silence, which is the exact change
    this FR says it must never make. The comparison therefore covers all six fields and the sentence counts positions
    rather than amounts.
  * **The dismissal is keyed to the item set, and that key is what makes it decidable.** The FR asks for re-offering
    "only when the group's resolved item set has changed since the dismissal"; storing the set's signature rather than a
    timestamp is what lets a device answer that without a schema, an HLC or a server. A malformed stored entry is
    dropped rather than trusted — it would otherwise suppress a suggestion permanently with a signature nothing can
    match.
  * **Nothing recomputes the candidates after a fold, because nothing has to.** The FR promises a subsumed candidate
    disappears rather than converting twice; the detector runs over the live positions, so removing them is the
    recomputation. The same falls out for the guards: the folded group becomes an include, and an include is already
    excluded.

* **FR-27.16 (Taking Names over from the Inventory, *built*):** A trip row copies its master item's name when it is
  written (`trip_items.name`) and keeps it. Renaming the item in the inventory (M10) reaches a trip only through
  FR-27.4, and FR-27.4 is deliberately narrow: it asks about rows a followed group generated, never about a packed,
  skipped or hand-edited row, and never on a past trip. Every other row would keep its old name with no way to catch up
  short of retyping it. **M4 offers the inventory's current name on request:**

  * **Which rows:** every row with a master item whose current name differs from the row's — packed, skipped and
    single-item (FR-27.3) rows included, because a name counts nothing and decides nothing. A row without a master item
    has nothing to take over. A rename the FR-27.4 card is *already asking about* is left to that card, so one question
    is not asked twice with two answers that can disagree. Per-person rows of one item under one name are **one**
    choice: they are one cluster on M4, and renaming only some of them would split it.
  * **Past and archived trips too.** FR-27.4 never touches them because it *proposes*; this only ever acts on a tap, so
    renaming history is the user's call rather than a prompt.
  * **Where:** the ⋮ carries „Namen aus dem Inventar (N)" — only while N > 0 — and opens a sheet listing each choice as
    the old name struck through above the new one, with a tick each, a leading **„Alle"** tick (tri-state) and one
    button („N Namen übernehmen", „Alle N übernehmen" when all are ticked). M5 carries the one-row form: „Im Inventar
    heisst es jetzt „X"." with **Übernehmen**, under the row's name. Either path reports in M4's snackbar with
    **Rückgängig**, which puts the old names back.
  * **Pre-selection:** everything is ticked except a row the trip **named on purpose** — a generated row whose name
    differs from what its ledger says generation produced, which is a hand edit or a refused FR-27.4 rename. Only a
    generated row can say so; a single item has no ledger entry and is always ticked. „Alle" takes the deliberate ones
    along.
  * **Adopting moves the ledger with the row.** A generated row whose name no longer matched its ledger snapshot would
    read to FR-27.4 as hand-edited from then on and quietly stop following its group. The entry is rewritten to the new
    name in the same breath, and the undo restores it with the row.
  * **Nothing is stored.** The list is recomputed from the two names each time, so there is no "declined" flag to sync
    and nothing in the schema. *Considered and rejected:* a card above the list announcing the renames (the mockup's
    variant B). It is easier to discover, but it sits beside the FR-27.4 card asking a near-identical question, and a
    card must remember a dismissal or it returns on every open — a new synced field per row for a notice. The ⋮ entry
    with its count costs neither. **Revisit trigger:** users asking why a renamed item never reached a trip they were
    packing.
  * **Names only** — weight, value and tag can drift the same way and are not offered. Client-side throughout (invariant
    4): `domain/inventoryNames.ts`, identical in all three modes.

**Concept prototype:** `dev-docs/UI_Concept_Prototype.html` realises §3.27 end-to-end and
`UI_Concept_Prototype.verify.mjs` checks it headless — M7 scope tabs and sections with the FAB create-chooser; M8 with
the scope-shaped editor (guarded scope switch, cycle-blocked group picker, inline group creation, resolution footer,
blast-radius note), the task list in the position form (FR-27.7), the packing list's quick-add as position picker
(FR-25.13) and the M5-pattern position sheet; M3 with scope sections, real resolution with named merges, the task count
and the single-item picker; the M2 applied-changes chip; the full template-from-trip screen (recognition, deviation
choice, new-group toggle); M10's "Enthalten in" (FR-27.8) and comment aggregation (FR-27.9); FR-25.7's progressive
position entry; M4's *„Ganze Gruppe hinzufügen“* strip (FR-27.10) with all three reporting cases; and FR-25.18's
per-trip persistence of filter, Erledigte switch and grouping. Every template row is editable (FR-1.6 MVP form). The
seed's "Velohelme: Passt Leonardos Helm noch?" todo originates from the Sommer group's position task.

### 3.28 Item Marks (One Emoji per Item)

*Status: **built** (ADR-021). The rendered variant round: `dev-docs/UI_Concept_ItemMark_variants.html`, built by
`dev-docs/build-item-mark-variants.mjs`.*

A packing list is **scanned, not read**: forty rows, most of them known, the eye looking for one. The reference photo of
§3.22 does not help with that — it answers *which* jacket (identity), it is present on a handful of rows at best, and
nobody photographs forty items. What the row is missing is a **mark**: a small, always-affordable symbol that says *what
kind of thing this is* before the name is read.

**The round, and what it decided.** Four marks were rendered into the same fifteen-row list, in the same frame, with the
same rows — emoji, a monochrome icon library, photo-first-with-fallback, and a coloured initial as the honest null
variant. The list deliberately contained things nothing fits — *Trekkingstöcke*, for which neither option has anything
at all, and near-misses like *Fleecepullover*, *Schlafsack* and *Wasserflasche* (Unicode has no water bottle) — because
the tail is where a symbol system is actually decided. Results:

* **Emoji won on the pixels.** Colour and figure separate the sections without being told to: clothing reads textile,
  tech reads grey-and-angular, camping reads green. Substitute rate 6 of 15, plus one row with no mark at all.
* **The icon library lost on the pixels, not on the argument.** It is the only option that fits the token tables
  (G-11/G-13/G-14) without exception, and it is *quieter*. But at 34 px sunscreen, bottle and water bottle are the same
  stroke, and its substitute rate was **higher still** — 7 of 15 against emoji's 6 — because libraries carry travel gear
  and not household detail. The margin on coverage is one row and decides nothing on its own; what decides is that a
  mark needing a second look is not a scan aid.
* **Photo-first is not a competing variant but a rule inside the chosen one** — see FR-28.4. Rendered on its own it
  showed its cost honestly: three photographed rows out of fifteen dominate the column and read as more important than
  the twelve beside them.
* **The initial tile is worse than nothing.** It repeats, in a coloured circle, the name standing right next to it.
  Colour without meaning is noise — which is also why the mark is never a stand-in for a category colour (FR-28.5).

* **FR-28.1 (Optional Item Mark):** Each master item (FR-1.1) can carry **one mark**: a single emoji, stored as
  `items.icon`. Absence is the default and stays a **first-class state** — a list where every row has been given a mark
  by obligation is a list where the mark means nothing. Nothing else in the product depends on it (quantities, dedup,
  sync, analytics), and it is never required to save an item. Governance follows the photo exactly (FR-22.6): items are
  shared master data, so a mark is shared instance-wide the moment it is set, and setting/changing/clearing it is
  authorised exactly like editing an item's name — the FR-4.5 trip role model does **not** apply and must not be
  checked.
* **FR-28.2 (Searchable Mark Picker):** The mark is chosen from a picker with a **search field over keywords, not over
  Unicode names** — typing „regen“ must find 🧥 and ☂️, neither of which is called *Regen* in any catalogue. The picker
  offers a **curated index** (order of 350 packing-relevant entries — large enough to browse a real inventory, not the
  full ~3,700-emoji table), each entry carrying **German and English keywords** and one coarse facet (*Kleidung · Reise
  · Dokumente · Hygiene · Gesundheit · Technik · Camping · Sport · Essen · Sonstiges*) so the grid is browsable without
  typing. Curation is part of the requirement, not a shortcut: the full CLDR table answers „Bau“ with 🏛️ and „Reise“
  with a cruise ship, which is how a picker teaches users that it does not understand them. **Removing the mark is a
  first-class action**, worded as removal and never as „choose the empty one“ (FR-22.5 establishes the same for the
  photo).
* **FR-28.3 (Suggestion from the Item Name — the reason this is worth building):** The picker **proposes** marks derived
  from the item's name, scored client-side against the same index that powers the search — no second data structure, no
  network, no model, and therefore identical in Local Mode. German compounds are split, but **only against the index's
  own vocabulary**: „Tarnzelt“ reaches ⛺ because *zelt* is a known keyword, while „Zahnbürste“ does not decay into
  *ürste*, because that is not. Three cases are specified because the picker must survive all three:
  * **The hit** — „Zahnbürste“ → 🪥 sits first, one tap, no search field involved. This is the common case and must not
    require typing twice.
  * **The skewed hit** — „Stirnlampe“ → 🔦 is a *torch*. Close enough to scan by, wrong as a statement. The suggestion is
    therefore always an **offer that must be tapped**, never a silent pre-fill: a mark the user did not choose is a
    claim the app made on their behalf.
  * **The empty result** — „Zwischenringe“, „Trekkingstöcke“ → nothing. The picker **names this as a valid outcome**
    instead of rendering an empty state that reads as a gap; otherwise every user types a 📦 into the field and the
    column loses its meaning within a week.
* **FR-28.4 (Where the Mark Appears, and the Fallback Ladder):** The mark renders on the M4 packing row, the M5 item
  sheet header, the M9 inventory row, and the M10 editor (where it is also set). The fallback ladder is deliberately
  **not the same on every surface**, because the surfaces answer different questions:
  * **M9 (inventory, master data): photo → mark → the primary tag's mark (muted; FR-24.13) → primary-tag initial.**
    The inventory is where an item is identified, the initial tile already exists there (ADR-014), and a row that
    never falls back to *nothing* keeps the column aligned.
  * **M4/M5 (packing): photo → mark → nothing.** No letter tile: the rendered round showed it as pure noise beside the
    name it repeats, and the packing row already carries a checkbox, quantity, badges and up to two avatars. On the M4
    row an empty mark slot holds its width so the names stay aligned — and a per-person item's row is its **cluster
    head** (FR-25.1), the line that names it once, so that is where its mark and photo render (otherwise the mark would
    leave the list exactly when the item is shared); the M5 header has no column to align, so it shows nothing at all
    rather than a blank slot before the title.
  * A **photo always wins where one exists** (FR-22.1) — it is the more specific answer, and the item that got
    photographed is the item whose identity mattered. The cost is a visibly mixed column, accepted by decision.
* **FR-28.5 (The Mark is Content, Never Chrome — extends G-11):** The mark is *the user's data about a thing*, in the
  same category as the item's name. It is therefore never used as interface: no emoji in buttons, tab bars, section
  headings, status pills, progress or empty-state illustrations, and never as a substitute for a tag colour or a state
  colour. This is not taste — the mark is the one surface in the app whose colours do **not** come from the token table
  (invariant 9), and confining it to content is what keeps that exception from becoming a second, unreviewed palette
  spread across the UI. It is also never the **sole** carrier of meaning: the accessible name of a row is its item name,
  the mark is presentational (`aria-hidden`), and no state, filter or count is ever expressed by a mark alone. *(The
  🧳/🛒/📍 procurement glyphs and ⏰ late flag of FR-25.4 predate this rule and are **not** item marks: they are a fixed,
  three-value state vocabulary owned by the app, not user data. They are the ceiling, not a precedent for more.)*
* **FR-28.6 (Self-Hosted Emoji Face):** The emoji are rendered from an emoji font **served by the instance**, subsetted
  to the curated index of FR-28.2 and committed as a `woff2` beside the two text faces, with a `unicode-range` covering
  exactly that set — the same mechanism, the same reasoning as FR-21.6: a face fetched at boot is a face that is
  sometimes absent, and Local Mode may have no network at all. The stronger reason here is agreement rather than
  availability: a packing list is **shared** (FR-4.x), and on platform emoji the same row shows a different picture on
  an iPhone, an Android and a Linux desktop — the sender and the reader would be looking at different lists.
  Consequences: the subset's weight is measured and justified against NFR-4.3 (the index is a few hundred glyphs,
  ~280 KB, not the full table), and the subsetting command is documented in the same place the text faces document
  theirs. A change to the face goes with a deliberate `make visual-update` (ADR-013); the visual fixture's rows are
  ad-hoc and carry no marks, so no emoji is painted in the suite at all (ADR-021).
* **FR-28.7 (Trip Rows Inherit the Mark, They Never Copy It):** `trip_items` gains **no** column. A generated packing
  row renders the mark of the master item it came from (`source_item_id`); an **ad-hoc row has no mark** until it
  becomes a master item, and shows none rather than a placeholder. Rationale: the mark is a property of the *thing*, not
  of one trip's plan, and copying it would create per-trip drift the user has no screen to reconcile — exactly what
  §3.22 avoided for the photo, which is likewise resolved through the master item and shared instance-wide. Consequence,
  stated because it is not obvious: changing an item's mark changes it on **every** trip that shows it, archived ones
  included. This does not violate the FR-2.4 freeze — the freeze governs a trip's *content* (which rows, how many, which
  attributes), while the mark is a display property of the underlying item, the same way its photo already is. **Revisit
  trigger:** someone wanting a different mark for the same item on one particular trip.
* **FR-28.8 (Groups and Vacation Templates Carry the Same Field):** `templates.icon`, set with the same picker,
  suggested from the template's own name. This is not scope creep bolted on — the concept prototype has shown groups
  with an emoji since §3.27 (📷 *Makro Fotografie*, ⛺ *Camping Basis*) and every one of them is **hardcoded in the
  mock**; M3 step 3, the M7 list, the M8 groups section, the FR-27.12 peek sheet and M14's target picker all already
  have a slot drawn for it. Shipping the field for items only would leave the product's most-shown symbols permanently
  faked. Same optionality, same fallback rule (no mark → no slot, never a letter), same governance.
* **FR-28.9 (Sync, Validation, and What the Server Refuses to Know):** `icon` is an **ordinary synced column** on
  `items` and `templates` — it joins `syncableColumns` and flows through the master-partition pull/push like `name` or
  `weight_grams`, with field-level LWW resolution per NFR-4.2a. It is deliberately **not** given the §3.22 treatment:
  that split exists because BLOBs bloat every device's pull envelope (ADR-002), and a mark is a handful of bytes.
  Validation is a **length cap and nothing else** (`CHECK (length(icon) <= 32)`, mirrored at the handler): the server
  treats the value as opaque text exactly like a name, and does **not** attempt to verify that it is „really an emoji“.
  Unicode adds emoji every year, so such a check is a table that silently rejects next year's valid input, on a field
  where a wrong value costs a wrong little picture. The client is where the curated index lives, and it is the client
  that keeps values sensible — this is a display preference, not a security boundary, and it is **not** covered by
  invariant 3 (nothing is being attributed to an actor).
* **FR-28.10 (Portable Export/Import):** `icon` is part of the portable YAML shape for both items and templates
  (FR-18.2), as one optional scalar key. An import that carries a mark keeps it; an import from an older export simply
  has none (FR-18.4 tolerance). Without this, the round trip that §3.27's fold-back depends on would quietly strip the
  marks off a whole template.
* **FR-28.11 (All Three Modes, Unchanged):** Index, scoring and font are client assets; the picker and the suggestion
  work identically in Server, Single-User and Local Mode with no server involvement (invariant 4). There is no
  server-side surface to hide per G-8, and nothing degrades offline.

**Architecture notes for implementation:**
* **Schema:** `icon TEXT` (nullable, `CHECK (icon IS NULL OR length(icon) <= 32)`) on **`items`** and **`templates`**,
  plus both entries in the `syncableColumns` whitelist.
* **Index and scoring:** `client/src/domain/itemMarks.ts` — pure, no I/O, exhaustively unit-tested (invariant 4/1),
  exporting the curated entries, `searchMarks(query, facet)` and `suggestMarks(name)`. Search and suggestion **must be
  the same index**: two lists drift, and the drift is invisible until a user searches for the thing the suggester just
  proposed. The three FR-28.3 cases are the test names.
* **Picker component:** one component used by M10 and M8; the suggestion band, the search field, the facet row and the
  grid are one surface, not a per-screen reimplementation.
* **Rendering:** a shared `ItemMark` presentational component owns the fallback ladder of FR-28.4 so no screen
  re-decides it, and owns the `aria-hidden` rule of FR-28.5 so no screen forgets it.
* **ADR-021** holds the decision, with this section's variant round as its evidence, the measured 80 KB subset as its
  footprint entry and the trench-coat/peacoat difference between the self-hosted and the platform faces as the reason
  self-hosting is about *agreement* rather than availability.

**Rules that are not derivable from the code alone:**

* **The mark's absence is enforced, not merely allowed.** FR-28.5's "never chrome" rule needs something that can see
  a *whole* screen, so it is a unit gate over the source (`markRendering.spec.ts`): outside `ItemMark.vue` and
  `MarkPicker.vue`, no view may apply the mark face or render an `icon` value as text. The shape is borrowed from the
  FR-21.7 hex-in-`client/src` rule, and for the same reason — a rendered test of one screen cannot see what the twenty
  beside it do.
* **The seed may only use marks the curated index knows.** A glyph outside the index has no glyph in the self-hosted
  subset, and the row would render tofu on a device with no platform emoji font. A test holds this, and it is also the
  honest exercise of the index: if the seed cannot say what it wants with the curated list, neither can a user.
* **An optimistic master row keeps every column.** The optimistic row for a master item is built with `image_hash` and
  `icon` intact; a helper that omitted one would blank the photo or mark until the next pull in Server Mode, and
  permanently in Local Mode, where the optimistic row *is* the row.
* **A trip row that inherits is not the same as a trip row that was typed.** FR-28.7 resolves through `source_item_id`,
  and M4's composer has two paths: the suggestion (a master item, so a mark) and the free-text confirm (ad-hoc, so
  none). The e2e case covers both paths, because "shows no mark" is only meaningful beside a row that shows one.

* **The FR-28.8 fallback rule is two rules.** On a **column** — M7's list, M3 step 3 — dropping the slot would push
  every marked group's name right of the unmarked ones beside it, which is precisely the misalignment FR-28.4's held
  slot exists to prevent on M4. Those two surfaces therefore hold the width; the *single* mark beside one name (M8's
  editor head, the FR-27.12 peek header) renders nothing when absent, because there is no column there to align. The
  letter is refused everywhere.
* **Every surface that offers the group carries the mark.** M3 step 3 lists Ferien-Vorlagen and Gruppen as **two**
  columns, and both carry it. E2E-M8-18 walks all four surfaces in one run — a screen keeping its rendering says
  nothing about the three beside it.
* **The dev seed's trip is linked to the inventory.** `sampleTrip.ts` links every row whose name the inventory already
  knows (`source_item_id`), so marks and reference photos appear on the trip the seed button opens, and deliberately
  leaves the rest ad-hoc: that mixture is what the empty slot is for.

### 3.30 The Shopping List as a Module of Its Own

**Status: accepted** — **implemented** (ADR-066). A trip's shopping list — the groceries of a holiday flat above all —
is kept **independently of the packing list**, and whatever the packing list marks *vor Ort kaufen* still lands on it.
A shopping item is therefore not a packing row: were it one, „Milch" would count in the packing progress, the weight,
the analytics, FR-9's feedback and M21's *Vorlage aus Reise*, and buying it at the destination would mark it *packed*.
By decision there is **one shopping list per trip** (not several named lists, not lists outside trips), with two
lists — *Vor der Abreise* and *Vor Ort* — for the list's own entries as for the packing rows.

* **FR-30.1 (The List's Own Entries):** A trip carries any number of **shopping entries**: a name, the list it is on
  (`buy_before` or `buy_local`, `mode`'s vocabulary without `pack`) and whether it is bought. They live in their own
  table, `shopping_entries`, in the **trip partition**, and sync like every other trip row (field-level LWW,
  tombstones; they go with their trip). An entry is **on the shopping list alone**: it is no packing row and no packing
  figure counts it. M6's field adds one to the open tab; checking it off marks it bought and moves it under FR-25.11j's
  reveal, unchecking puts it back, and a row control removes it. An entry carries no amount, category, recipient or
  inventory link — „500 g Hackfleisch" is written in the name — because a shopping list rarely runs to twenty rows and
  every field would be asked on every add (the reasoning of FR-25.11g/k's retirement).
* **FR-30.2 (The Packing List Feeds the List by Projection):** A packing row whose mode is BUY_BEFORE or BUY_LOCAL
  (FR-3.1) appears on the matching tab **while its mode says so** — it is read from the packing row on every render,
  never copied into `shopping_entries`. Everything FR-3.3, FR-25.6 and FR-25.11j say about such a row holds unchanged:
  one line per thing to buy (per-person instances aggregated), check-off writes the mode transition and `bought_from` on
  the packing row, the reveal says where it went. A packing row leaves the list by being bought or by changing mode on
  M4/M5 — M6 offers no remove for it. **M6 adds no packing rows**: the shared composer (FR-25.13) is not on M6, and an
  inventory item to buy is put on the packing list in M4 with its mode chosen there — in M5, or for *vor Ort kaufen*
  straight from the row's menu (FR-5.9). The list shows the packing rows first, **combined under one heading
  regardless of category** (a packing category is not this list's tag, and a heading per category would read as more
  shopping-list structure than it is), then the own entries under their own heading, a section per tag;
  an entry and a packing row of the same name are **not merged** — they are two decisions, and the list does not guess
  that they are one.
* **FR-30.3 (Module Boundary):** The shopping list's client code is a feature module under `client/src/shopping/`
  (store, actions, screen, specs), its Playwright cases under `client/e2e/shopping/` — the layout FR-29.9 names for the
  planner, used here first. Packing code never imports the module and the module never imports packing views, stores,
  domain rules or composables; the two meet only through kernel contracts — `lib/shoppingSources.ts` (what a source of
  lines is), `sync/featureModule.ts` (how the orchestrator routes a module's rows, cascades a trip delete into them and
  lets the module write) and `lib/tripViews.ts` (the switcher's count) — which the composition root, `App.vue`, binds.
  `scripts/module-boundary-gate.mjs` holds both directions in `make client` and the CI client job.

* **FR-30.4 (Who Bought It, and When):** every bought line — an entry or a packing row —
  shows **„gekauft von Andy · heute 14:32"** under FR-25.11j's reveal, with the buyer's avatar: FR-25.17's stamp for a
  purchase, from the same helpers (`domain/stamp.ts`, `lib/rowFacts.ts`), because a finished purchase raises the same
  question as a packed row — *who* dealt with it and *how long ago*. The record is two columns, `bought_at` and
  `bought_by_user_id`, on `shopping_entries` **and on `trip_items`**: a BUY_BEFORE purchase flips the row to *pack*
  (FR-3.3), and without its own record the row keeps no trace of who bought it. The buyer is **stamped by the server
  from the pusher** (invariant 3; Sync-API §5), the time is the tap's (offline purchases keep their moment), and
  taking the purchase back clears both. **Per mode:** Server Mode names the buyer; Single-User names its one account;
  Local Mode states the time alone, because there is no account to name (G-8). A purchase with neither shows no stamp.

* **FR-30.5 (From the Dashboard Onto the List):** M1 leads straight onto a trip's shopping list through FR-30.7's
  card, which carries the way onto M6 itself (*„Zur Einkaufsliste →"*, or *„Alle 7 anzeigen →"* past five lines) — one
  way to one destination under one card.
* **FR-30.6 (The ＋ Bottom Right):** M6 carries M4's FAB. It leads to the field — scrolled
  to the top, focused — rather than opening a second one, and the list scrolls clear of it (FR-25.11h).

* **FR-30.7 (The Shopping List on the Dashboard, Workable):** under each trip on
  M1 sits its shopping card: at most **five** open lines of the list that is *now* — *Vor Ort* for a running trip, *Vor
  der Abreise* for a planned one — with a chip per list to switch, a field that adds an entry to the shown list, a
  check-off per line (a packing line through FR-3.3, as on M6) with the card's own *Rückgängig*, and the way onto M6.
  Packing lines carry a *Packliste* tag. Removing, the bought reveal and FR-30.4's stamps stay on M6. A running trip
  always has its card; a planned trip only while something is left to buy. **This is the one exception to M1's „reports,
  takes no actions" rule (FR-7.4)**, taken on purpose: the list is opened in the shop, where a detour through the trip
  is what nobody wants. The cost that rule names — an empty composer on every dashboard — is accepted for this card and
  not extended to trip todos, which stay read-only. Rejected: a single *Einkaufen* section gathering every trip, which
  cuts the list off from its trip and repeats the field per trip. M1 does not import the module: the card reaches it
  through `lib/tripCards.ts` (FR-30.3). Once the packing is finished (FR-7.10, ADR-074) the card is a block of the
  hero — seven lines, under the trip's head rather than a sibling under it — and the *„sibling, because a card that can
  be worked is not a link“* rule is kept by making the hero's head the link and nothing else.

* **FR-30.8 (The List That Is Now, *built*):** *Vor der Abreise* is the one list which is certainly over once you have
  left, so the list in focus is the one still worth working: ***Vor der Abreise*** while the trip is planned **and** its
  packing is open, ***Vor Ort***
  otherwise — a running trip, an archived one, and a planned trip whose packing has been declared finished (FR-5.10),
  which is the case the phase alone gets wrong: the bag is shut the evening before, on a trip nobody has tapped
  *Reise starten* on. **One rule for both of the module's screens** (`listInFocus` in `client/src/shopping/list.ts`):
  M6 and the dashboard card under each trip (FR-30.7) must not disagree about the same trip.
  * **Nothing is hidden.** The other list keeps its count, so the five things still unbought before departure are one
    tap away and say how many they are.
  * **The reader's pick wins for the visit** and is not remembered across visits (FR-25.18's rule is about a filter of
    four facet values, not about a tab). **Until the trip itself is on the device** the rule answers *Vor der Abreise*:
    a rule read off an absent trip would open a planned trip at the destination and then move the tab under the reader
    (ADR-033's reasoning).
  * Rejected: letting the **content** decide — open whichever tab has something on it. It never opens on an empty list,
    and it makes the screen open differently as lines are checked off, so the tab you were working stops being the tab
    you come back to.
  * **On M6** (FR-30.11), which has no tabs — both lists stand on one screen — the rule decides only whether the
    composer still offers *Vor der Abreise* (its list chips). On the dashboard card it decides which list is shown and
    where the card's field files an entry.

* **FR-30.9 (Tags on the List's Own Entries, Grouped by Them):** an entry carries **at most
  one tag**, a short free-text label of the person's own — *Supermarkt*, *Apotheke*, *Baumarkt*. It is one nullable
  column, `shopping_entries.tag` (1–40 characters, trimmed; a blank is no tag), that syncs and merges like the entry's
  other fields, so tagging never contends with a purchase. **Free text rather than a reference:** a shopping list's
  tags are made up on the spot for one trip, and a table of them — or a reach into the inventory's tags (FR-24), which
  classify what a thing *is* and not where it is bought — would be a second list to keep beside the entries. The
  tags on offer are read off the trip's open entries, so one whose last entry was bought is not offered again.
  * **The open list is grouped by it:** the packing list's rows first, combined under one heading (FR-30.2), then one
    heading per tag, A–Z, then the untagged entries under *„Eingetragen"*. **What is bought is not grouped** — the
    reveal (FR-25.11j) stays one flat list, and each row says its tag, because the heading that named it is gone.
  * **Set in two places:** a chip row under M6's field — the trip's tags and *＋ Tag* — files the *next* entry and
    holds until the reader taps the chip again, so the things for one shop are typed one after another; and the
    **entry sheet**, which *＋ Tag* and a tap on an own entry's name both open. It is the packing list's creation
    sheet for an entry: a name field, **M10's search-or-create mask** for the tag (FR-24.1 — *„Tags suchen oder
    anlegen…"*, the matching tags as chips, a dashed *„… neu anlegen"* chip for a name nothing carries) and one
    button, *Hinzufügen* — or *Speichern* on an existing entry, which also renames it and writes only what changed.
    A new tag is never typed straight into the row or the composer. **A tag made in this visit stays a chip** while no
    entry carries it, so unselecting it does not make it vanish.
    **Only own entries carry a tag:** a packing row keeps its category, and the dashboard card (FR-30.7) shows an
    entry's tag but offers no way to choose one.
  * **The check-off sits at the end of the row**, on M6 and on the dashboard card: the thumb rests on the right. On the
    dashboard card the remove (✕) of an own entry stands beside it, to its left; M6's row carries no ✕ — an entry is
    removed from its sheet (FR-30.11).
  * **Several entries retagged at once:** an untagged entry carries no per-row *＋ Tag* label — a line of clutter
    repeated once per row; a tap on any own entry's name opens the entry sheet, with no label to announce it. An entry
    can be **selected** — long-pressing an own row, or the
    app bar's own icon (mirroring M9's `m9-select`, FR-24.9) — and the mode reaches **every own entry on the open
    tab, already tagged or not**: the reach this adds over M9's own screen, which offers no *retag*, only a first
    assignment. Inline on the list itself rather than a separate screen, because unlike M9's rows a shopping row is
    not a navigation link, so a long press fights no tap the way it would there. A packing row's projection carries
    no tag and is never selectable, named once below the list rather than dashed out on every row it excludes.
    *„Alle N"* takes the open tab's own entries, filtered by nothing since M6 has no filter. The bar's *Tag vergeben*
    opens the same search-or-create sheet a single entry's does, titled for the batch; choosing a tag files every
    selected entry under it at once — only what changes is written, so an entry already carrying that tag is
    untouched — the mode ends with the batch, and the toast's undo puts each entry back under the tag it carried
    before.
  * **One entry, dragged into another heading:** a grip at the leading edge of an own row,
    shown while nothing is selected, lifts it and carries it over the open list; the heading under the pointer lights
    up while it could honestly hold the row, and lets go of it into that tag — or into *„Eingetragen"* to clear one.
    The write is the same batch-of-one `bulkSetTag` a selection's *Tag vergeben* uses, so its undo is exactly as
    correct as a bulk retag's. A packing row's projection is refused the way it is refused a selection: its own
    heading never lights up and never takes the drop, since it carries no tag of its own to file under.
  * *Not carried:* the portable backup, like the entries themselves; trip cloning.

**Behaviour per mode:** identical in all three — entries are ordinary trip rows, and Local Mode persists them like
every other. **Not carried:** the portable backup (NFR-4.11) does not carry entries, like FR-7.3/7.4's todos; trip
cloning (§3.12) copies none; the destination-bound lists of FR-13.3 are unbuilt and would pre-fill entries rather
than packing rows. **Revisit trigger** for the missing fields: an owner asking for an amount, a category or a
buyer on an entry — FR-25.12's *Zugewiesen an* is the likely first, and it would then apply to both kinds of line.

* **FR-30.10 (A shopping entry may name the day it is due, *built*):** an optional due date on the shopping list,
  highlighted there and on the dashboard like a task's — FR-7.11's model, applied to an entry:
  * **Only the list's own entries** carry a day (`shopping_entries.due_date`, `YYYY-MM-DD`, nullable, one field so a
    day and a tag set on two devices both stand — NFR-4.2a). The packing list's buy rows stay undated: their moment is
    the list they sit on (FR-3.2), and a date there would be a second column on `trip_items` for a question the mode
    already answers. Rejected by decision: dating those rows too.
  * **Set in the entry's sheet** (FR-30.9's name-and-tag sheet, M6) and in the composer, with M25's day chips (FR-7.14
    item 2, FR-30.11) — *Vor Abreise* for the list before departure only; written with the sheet's *Speichern* /
    *Hinzufügen* like the name and the tag.
  * **The same four readings and the same pill** as a task (FR-7.11): *Überfällig* (red), *Heute*, *Morgen* / *In 2
    Tagen*, a short date further out. A bought entry is never overdue and wears no pill.
  * **Order on M6, M25's rule:** inside every section the dated entries come first, earliest first, the undated ones in
    the list's order after them; **a section holding an overdue, today or soon entry moves above the others**, the
    packing list's combined heading included — M25's behaviour, chosen over a pill-only highlight.
  * **On M1:** the trip card under a trip (FR-30.7) and the hero's *Einkauf* block (FR-7.10) wear the pill beside the
    entry, and **the pressing ones lead** — overdue, today, the next two days, earliest first — with everything else
    in the order it had.
  * **The reminder.** The server's FR-7.11 run sends a second kind, **`shopping_due`**, the day before and on the due
    day, at the same `JITPACK_TASK_REMINDER_TIME` and under the same once-a-day claim. **Recipient: every member of the
    trip** — an entry has no assignee, and a purchase nobody in particular was handed is everybody's, the rule a task
    without an assignee already follows. Single-User is reminded too (FR-17.3 does not apply, FR-7.11's reason). The
    payload names the entry (`item_name`, `entry_id`) and the day; a tap opens M6. **Its own M17 toggle, *Fällige
    Einkäufe*** — a person reminded of their chores need not want the groceries. **Local Mode:** M1's opening hint
    counts the due purchases beside the tasks (*„1 Aufgabe und 2 Einkäufe fällig"*, or either alone).
  * Like every entry, a due day is not in the portable backup (item 25).

* **FR-30.11 (M6 reads like M25, *built*):** the shopping list and the tasks screen (FR-7.14) share one look and feel,
  M25's — its composer area, and its *Vor Abreise* day chip on the shopping list too. Pure client work: no schema, wire
  or server change.
  1. **No tabs; M25's reading.** The two lists stand one under the other as sections, each with its head and what is
     open under it, above them a ***Fällig*** block — every open line overdue, due today or in the next two days,
     from both lists, earliest first, which **leaves its group** while it is there (`shoppingBoard` in
     `shopping/list.ts`, `taskBoard`'s rule). Rejected: keeping the tabs and aligning only the rows — a thing due
     tomorrow on the tab not open stays a thing nobody sees. FR-30.8's rule decides only whether the composer offers
     *Vor der Abreise*.
  2. **No ✕ on the row.** An own entry is removed from its sheet (*Entfernen*), as a task is from its own — so *done*
     and *delete* are not same-sized neighbours. The selection offers *Tag vergeben* across both lists. Rejected:
     keeping the ✕ for the one-tap delete.
  * **The composer and rows:** M25's composer card with **list chips** (*Vor der Abreise* / *Vor Ort*,
    gone when FR-30.8 names *Vor Ort*), tag chips and **day chips** (`DueChips`, in `components/global/` so the
    module may use it — ADR-066); two-line rows (due pill, amount, recipients under the name); one ***gekauft* fold
    per list**, M25's *erledigt* fold; a finished packing's *Vor der Abreise* **folded at the end** (FR-7.12, M25's
    way), the composer staying and writing for *Vor Ort*.
  * **And the other way round, on M25:** its *＋ Tag* opens M6's entry sheet, and the task tag chooser is M6's
    search-or-create mask (FR-7.14).
  * **A part with nothing open:** a list or phase **with nothing open anywhere** (the *Fällig* block included) leaves
    reading order for **one line at the end of the screen**, on M6 and M25 alike — *„Vor der Reise · nichts offen"*,
    and *„· 2 gekauft ›"* / *„· 3 erledigt ›"* once something is finished, which opens onto those rows directly. A
    heading, a hint and a fold would take room above the list still being worked. Rejected: hiding it (what was bought
    or done would have no place) and a one-line head in place (it stays in the way). The closed *before* of FR-7.12
    wears the same line. A part whose last open lines stand in the *Fällig* block folds too — a heading over nothing
    but a fold would not look like the other screen's line — and the line counts what waits up there (*„Vor der Reise ·
    2 fällig · 3 erledigt ›"*). M6's first list is called ***Vor der Reise*** (*Before the trip*), M25's name for the
    same time; the day chip *Vor Abreise* keeps its name, since it names a day.
  * **One set of components, so the two screens cannot drift:** both are drawn from
    `components/global/` — `ListComposer`, `ChipRow`, `DueChips`, `DueBlock`, `ListSection`, `ListGroup`,
    `ListRow`, `FoldToggle`, `RestLine`, `TagPicker` and `EntrySheet`. What stays per screen is what a line is.
  * **Modes.** All three, like the list itself. **Surfaces:** M6 (UI-Spec M6), M25. E2E-M6-36.

## Part B — Clarifications & Extensions to Existing Sections

### 3.1 Template & Master Data Management

* ~~**FR-1.3 (Dynamic Quantity Formulas)** / **FR-1.5 (Formula Variable Catalog)**~~ — **retired: entering the
  quantity is enough.** Template and dependency quantities are **plain integers** (`template_items.quantity` /
  `item_dependencies.quantity`); the portable YAML `quantity` is a number, with FR-18.4-tolerant import of legacy string
  values. The UI captures quantities with a **numeric stepper**. Trip-specific amounts are set in the **M3 step-4
  quantity review**, helped by the FR-14.2 history suggestions ("’25: 30 → übernehmen") — which cover the real
  per-duration cases without a formula language. Numbers kept stable per the removal-stub convention; FR-15.3
  (attributes as formula variables) is void with them.
* **FR-1.6 (Template Ownership & Scope) — MVP simplification, *parked* ownership model:**
  templates and groups are **shared instance-wide like master items** (the FR-22.6 governance model): every
  account sees and edits every template; there is no publish switch, no read-only state, and no forking. `owner_id`
  stays recorded as *creator* metadata but grants no exclusivity. Consequences: the Review Assistant (FR-9.2) writes its
  accepted optimisations directly to the source template (no fork offer); M7 has no "my vs. published" split and M8 no
  publish toggle. **Parked:** the ownership model — templates owned by a single user account, optionally published
  instance-wide in read-only mode, consumed by reference or forked into a private copy, with the Review Assistant
  writing only to own templates and offering to fork shared ones. **Revisit trigger:** the instance grows beyond one
  household, or someone wants templates the rest must not edit.
  * **The name is unique instance-wide too.** `templates.name` is UNIQUE across the instance: if every account sees
    every template, two accounts holding two "Sommer" would produce two rows that every screen shows side by side and
    nobody can tell apart. FR-18.2/18.4 link an imported group **by name** across the instance, and FR-27.5/27.15
    recognition keys on the same shared set. `items.name` and `tags.name` are globally unique too; this is the same
    rule, applied where the FR-1.6 simplification makes it necessary.
  * **What the constraint costs, and how it is paid.** A UNIQUE name means a
    create against a taken name is a **refused push**: the optimistic row appears, the rejection
    repair removes it again, and the only explanation stands in the G-2 sheet — the user watches
    the thing they just made disappear, with nothing at the point where they did the work. It does
    not have to reach the server at all: the client pulls the master partition in full
    (`pullMasterAll`), so **every device knows every taken name, offline included**, and the
    collision is decided locally before a mutation is enqueued. This is also the *only* guard
    Local Mode has, which has no constraint behind it at all — so the check lives in the
    orchestrator, under every surface, and not in the views alone.
    * **The matching rule is trimmed and case-insensitive, and keeps diacritics.** It is a
      deliberate superset of what SQLite's `UNIQUE (name)` refuses and nothing more. Case is not a
      distinction a person makes in a name — the database would hold "Sommer" and "sommer" as two
      rows no screen can tell apart, which is exactly what the constraint exists to prevent — so
      folding it is prevention. Diacritics are the opposite: "Frühling" and "Fruhling" are two
      names the database accepts, and folding them would refuse a name the user is entitled to.
      FR-27.13's picker search folds them because recall is free in a search; here a hit blocks a
      write, so precision wins.
    * **The answer depends on what the surface can do with the row that holds the name.** M7's
      create names it with its scope and offers to *open* it. M8's inline *"Neue Gruppe anlegen…"*
      **includes the existing group** — referencing an existing group is that picker's whole
      purpose, so a taken group name is the user describing what they already have. A **Vorlage**
      holding the name cannot stand in for a group, and saying which scope holds it is the only
      way that refusal does not read as a bug. M21 and M3 gate their own step, because a fold or a
      trip is not an edit of the row that happens to share the name; renames in M7, M8 and M16 are
      refused and the field goes back to the stored name, since G-5's auto-save has no other
      acknowledgement.
    * FR-18.4's importer does not go through the collision guard: it answers a taken name by
      landing on the row that already holds it and importing nothing (ADR-030), and a restore
      must never stop to ask.
  * **The accepted cost is on the offline path, and it is real.** Two devices that each create "Sommer" while offline do
    not both succeed: the second push is `rejected`, and — since a rejected mutation is one the outbox drops — that
    device loses its group rather than getting a duplicate. It is the trade the shared model already implies (the same
    is true of an item name), and it is stated here so the next reader does not discover it from a support
    question. **Revisit trigger:** the parked ownership model returning, which makes per-owner names meaningful again —
    or a rejected-name push becoming frequent enough to deserve a client-side rename prompt instead of a drop.
* ~~**FR-1.7 (Consumable Flag)**~~ — **retired: the feature is not needed.** There is no consumable attribute and no
  *per-day* quantity unit or rate. Per-day needs are handled by setting the quantity — adjusted per trip in the M3
  step-4 review with FR-14.2 history suggestions. The number is kept stable per the removal-stub convention and must
  not be reused.
* ~~**FR-1.8 (Quantity Units)**~~ — **retired: everything is counted in pieces.** Items carry no unit; the portable
  YAML has no `unit` field (legacy files still import — unknown fields are ignored per FR-18.5), and quantity displays
  are bare numbers ("6×"). The G-6 "unit label" clause is void. Number kept stable per the removal-stub convention.
* **FR-1.9 (Default assignee):** an inventory item can name the account it is usually
  somebody's job for. It is **optional** — most items have none, and none is a first-class state, not a gap to fill.
  * **Storage:** `items.default_assignee_id`, a nullable reference to `users`, synced like any other item field
    (field-level LWW, no CHECK — a constraint that could refuse a single-field mutation would lose the user's choice).
    An id that names no account is refused per mutation, and the rows beside it still land.
  * **Where it is set:** M10, *Usually assigned to*, in the create form and on a saved item. Offered only where there
    is more than one account to choose between (G-8): absent in Local Mode, Single-User Mode and a one-person instance.
  * **Where it acts:** at generation, for a **trip-global** row (a position with assignment `trip_global`) and for a
    hand-picked single item (FR-27.3). The row is assigned to the traveler **linked to that account** (FR-2.5); if no
    traveler is linked, the row stays unassigned — never an error. A per-person position is unaffected: it already
    belongs to every traveler. Two groups bringing the same assigned item still merge into one row (FR-2.3a). It is a
    starting point only: the row's own assignment (FR-25.19) is edited in M5 and is never rewritten from the item.
  * **M3 step 2** therefore gets an optional account picker per traveler (Server Mode with a shared trip only, G-8),
    offering the creator and the accounts the trip is shared with — the trip's future members, which is all the server
    accepts as a link (ADR-058). A traveler added through FR-2.5's *account* picker already carries its link and has
    no per-row picker; no account is offered on two rows, and the two lists never offer one twice. The review step
    reads the links it will be created with. A group added to a running
    trip (FR-27.10) applies the rule against the travelers' existing links; the FR-27.4 refresh does **not**, because
    it keys rows by (item, traveler) and an assignment appearing there would read as a new position.
  * **Where it is seen (*built*):** M9's row names the account, and M9's search finds the item by it — otherwise an
    inventory of two hundred rows would answer *„was ist üblicherweise meins?"* one editor at a time. It is an **FR-24.4
    property**, not a new row element — the sheet behind the eye carries a fourth toggle beside Tags/Gewicht/Preis,
    device-local like the other three — and a row that names nobody shows **nothing**: *„Niemand"* is the editor's empty
    state, and repeating it down a list is the overload FR-24.4 took the columns away for. Toggle and column are
    **absent wherever FR-1.9 itself is** (G-8: Local Mode, Single-User Mode, a one-person instance), because a property
    nothing can carry is a switch that does nothing; what is already **stored** is never cleared, since the same phone
    may open a shared instance tomorrow. **No filter chip follows, and the search answers instead:** FR-24.2's axis is
    tags, an account is not a tag — the argument that kept *„Stillgelegt"* off the axis (FR-24.8) — and a second axis
    would go into a bar that is already three rows at 390 px, so the assignee's name joins FR-24.7's fold as a fourth
    field instead. **Revisit trigger:** a filter chip is owed the first time that search is used to *work through* the
    list rather than to find one row — the signal is a query that is a name and stays put while rows are edited.
  * **Not carried:** the portable format (FR-18) and the backup's inventory view name no account, because account ids
    mean nothing on another instance.
* **FR-1.1 refinement (see §3.24):** an item carries **multiple tags** (FR-24.1) in place of FR-1.1's "default
  category", and master-item deletion is lifecycle-aware — logical tombstone if ever used, physical delete if never
  referenced (FR-24.3). Both are *implemented*.

### 3.2 Trip Management

* **FR-2.1a (Optional Start Date — refines FR-2.1):** The trip start date is optional. A trip without a start date has
  no computed duration and no departure-day triggers (Late Packer promotion). Whether the end date is required is
  FR-2.1b's.
* **FR-2.1c (Optional fields are folded away):** M3's step 1 shows **only what it
  requires** — the trip's name and its year (FR-2.1b) — and puts everything optional behind a single **"Mehr Optionen
  ▾"** row: both dates, the series, and the season/transport/accommodation attributes. The same progressive-disclosure
  idiom FR-25.7 established for template positions and FR-24.5 for master items; a trip is *created* far more often than
  it is *configured*, and seven fields at once make the common case look like the rare one.
  * **The fold never hides state.** The collapsed row states what is set behind it ("13.9.–20.9. · Samedan · Sommer")
    and, when nothing is, names what is inside ("Daten · Serie · Merkmale"). An option nobody can see is one nobody
    remembers setting — the argument FR-25.11a makes for the filter's chips, applied here. It matters twice over because
    a series *prefills* attributes (FR-13.2): that prefill has to be visible without opening anything.
  * The fold is presentation only: nothing about which fields exist or what they mean changes, and step 1's gate stays
    the name (FR-2.1b).

* **FR-2.1b (Only the year is required):** A trip needs **no date at all**; the one
  required temporal fact is its **year**, and the year selector opens on the **current year**, so the requirement is
  already satisfied when M3 does. Both dates are optional and independent: neither, one, or both.
  * **Why the year, and why required.** A trip exists as a plan long before its dates do ("Samedan 2027"). Demanding an
    end date would mean inventing one, and an invented date is worse than an absent one: it drives M2's ordering, the
    series history and the *until …* line, all of them stating knowledge the household does not have. The year is the
    smallest fact that is genuinely known when a trip is created, and it is enough to place the trip in time.
  * **Consequences.** `trips.year` is `NOT NULL` and `end_date` is nullable; `duration_days` needs both dates and stays
    null otherwise, so anything derived from duration takes FR-2.1a's no-duration path. M2 sorts on a derived key
    (start date → end date → year), and a year-only trip sits at the start of its year. Where a date line would go, the
    trip reads by its year. The portable document (FR-18.2/18.3) carries `year` and omits an absent date rather than
    inventing one; a file without a `year` field has its year read out of its end date.
  * The departure-day triggers need a start date (FR-2.1a), and the FR-14.2 history hint labels its trips by the
    `year` field.
* **FR-2.1d (The two dates bound each other):** Wherever a trip's start and end dates are edited — M3's
  step 1, M22, and the clone screen — **each one bounds the other's calendar**: the end picker offers no day before the
  start already set, and the start picker no day after the end. An unset counterpart is *no* restriction, because
  FR-2.1b makes both optional and independent.

  * **A bound, not a validation.** The invalid pair is made unreachable rather than refused after the fact: there is no
    message to word, no error state to render per screen, and no way for the three screens to disagree about the rule.
    The date control carries it (ADR-035), so a fourth surface that uses the control inherits it.
  * **Why it is needed.** An end before its start would give a negative duration — a trip stored as 26 September →
    5 September would carry `duration_days = -20` into its row *and* into generation, where duration is a quantity
    input.
  * **A row can still arrive inverted** — synced from an older device, or imported — so the bound constrains
    the picker and never the field's own value: such a trip still renders and is still repairable from either end.
    `durationDays` reads an inverted pair as **no length** rather than a negative one, which is the absence every
    consumer already handles (FR-2.1b).

* **FR-2.3a (Deduplication Default — refines FR-2.3):** The default merge strategy for overlapping items across
  templates is *maximum value* (the larger of the two quantities wins), with an override configurable **per template
  position** — `template_items.dedup`, one of `max` or `sum` — not per item category. The same item is a *sum* where
  two groups each contribute a share ("Sonnencreme" in the beach group and in the first-aid group) and a *max* where two
  groups both mean the one you own ("Regenjacke"), so the answer belongs to the contribution rather than to the item. A
  per-category default would still have to be overridable per position to express that, which is the field that
  exists. **Revisit trigger:** setting `sum` position by position becomes
  repetitive enough that a category default would save real typing — then it becomes a *default for* this field, never a
  second answer beside it.
* **FR-2.5a (Default travellers):** A household travels with the same people nearly
  every time, so the travellers a new trip starts with are **configured once** (M17 Settings: add, remove, reorder by
  re-adding) and are **already present in M3's step 2**. They are a *starting point*, never a constraint: the step adds,
  renames and removes as it would anyway, and a trip that drops one is an ordinary edit rather than an override.
  * **Device-local**, like the theme and the language (FR-21.3): it needs no schema, no sync and no account, so it
    behaves identically in Server, Single-User and Local Mode — the last of which has no account to hang a synced
    preference on. **The cost is explicit:** a second device configures its own list. **Revisit trigger:** the first
    time someone keeps two devices in step by hand, this belongs in the synced master partition beside the trip data.
  * **A default may be an existing account:** in a session, M17 offers the instance's
    users next to the free-text field. A picked user is stored with its account id, so M3's step 2 starts with that
    traveller already linked (FR-1.9) and, exactly as when picked in the wizard, a collaborator of the trip from its
    first moment (the creator's own account is linked without a share). One account is one default. The picker is
    absent without a session (G-8).
  * Names are trimmed, non-empty and unique (case-insensitively). A blank name would block step 2's own validation, and
    two travellers with one name make every per-person row ambiguous — so the setting refuses to produce either, rather
    than the wizard having to.

* **FR-2.5b (An empty roster reports what it cannot place — ADR-053):** A per-person position
  (FR-1.4) fans out over the trip's travellers, so on a trip with nobody on it it produces **no row at all**. That is
  a state the product allows — step 2 accepts an empty roster and says so, and it is what a fresh device starts the
  wizard in, because FR-2.5a's defaults are empty until somebody configures them. Dropped silently, those positions
  would make the M3 preview count lower than the picked groups contain and name none of the difference. Generation
  therefore **reports them**, as its own category beside the FR-15.2 exclusions rather than
  as one of them: no condition decided against these, and what they lack is a traveller rather than a different trip.
  * **M3 step 3** names them in an open block (*„Braucht Reisende"*) with the items and the step that fixes it.
    Deliberately not folded away like the exclusions above it — an exclusion is a decision the trip made, this is a
    decision nobody made.
  * **FR-27.10's group add** answers *„braucht Reisende"* rather than *„steuert zu dieser Reise nichts bei"*, which
    would be false about a group whose every position is per-person, and unactionable besides.
  * **A position whose item another contributor placed is not reported** — trip-global from a second group, or picked
    as an FR-27.3 single item. It is on the list, so asking for a traveller on its account would be work with nothing
    behind it. Same rule the exclusion report already follows.
  * **The refresh (FR-27.4) is deliberately excepted.** There the roster is *part of the plan* — a traveller added
    gets the per-person positions, one removed takes their untouched rows with them — so a trip whose roster went
    empty is supposed to lose them, and a report would contradict the removal planned beside it. ADR-053 carries the
    revisit trigger.

* **FR-2.5 (Traveler vs. User Separation):** The system strictly distinguishes between a *Traveler* (a trip-level record
  with a **name**) and a *User* (an OIDC-provisioned account per Section 2, or the implicit local user per FR-17.2). A
  Traveler can optionally be linked to a User account; Travelers without accounts (typically children) are fully
  supported. All *Assigned to* references (FR-4.2) point to Travelers; all *Packed by* references point to Users. A
  Traveler carries **no Adult/Child profile type** — no rule evaluates one, and a field nothing reads is a question
  asked of the user for nothing. The sync whitelist does not accept `travelers.profile` (a client sending it is
  rejected, not ignored); an older exported trip that carries the key still imports — the key is dropped rather than
  refused.

  * **The optional link notifies (ADR-058).** Assigning a `trip_items` row's *Assigned to* to a traveler whose
    `linked_user_id` is set notifies that account (`planRosterAssignment`, reusing FR-6.2's `NotifyDelegation` kind
    rather than adding a fifth). **The link may only ever name a current `trip_members` row of the same trip.** The
    notification pipeline trusts `trip_members` as its whole recipient universe, and a link outside it would be a deep
    link the recipient's device cannot open — so the server refuses the write (`not_a_trip_member`) and the CLI
    (`jitpack traveler --user`, FR-18.8) checks the same rule before sending it. The operator sequence is therefore
    invite, then link, not the reverse. Rejected: a personal *„my rows"* filter as the link's reader, because two of
    the three modes have no accounts at all. Cross-device packing-record attribution through the link is unbuilt.
    **The built way to say „this row is that person's" is FR-25.19's assignment**, which names an account directly;
    the link is not described as more than the notification it drives.

  * **The link is set on M22's roster row.** Each roster row carries an account picker beside the ✕ (UI-Spec M22);
    what it offers is exactly `trip_members`, so the rule ADR-058 enforces cannot be broken from the screen that
    writes it.
    * **The picker includes myself.** M5's *Assigned to* excludes the viewer, because the sole user is already
      every row's packer. Here the opposite holds: the account most worth recording is my own, since the point of
      the link is that *somebody else's* assignment reaches me — `planRosterAssignment` skips the actor, so a link
      to myself costs nothing and is silent exactly when it should be.
    * **It is absent below two members** (G-8), which covers Local Mode, Single-User Mode and an unshared
      Server-Mode trip in one rule: with one member the only linkable account is the one that would never be
      notified, and a control whose every answer is inert is worse than none.
    * **The add row takes the account too.** The person being added to a shared trip is usually one of the people it
      is already shared with, and making that a correction after the fact would hide it behind a control nobody is
      looking for. An **ordering rule in one place** keeps it quiet: `addTravelerToTrip` inserts the traveller
      **unlinked**, lets FR-27.4 generate its per-person rows, and writes the link as its own mutation afterwards.
      Inserted already linked, every one of those generated rows would earn the account a delegation notification
      (`planRosterAssignment` fires on any push pointing an `assigned_traveler_id` at a linked traveller). The rule
      lives in the action rather than on the screen, so `jitpack traveler --user` is quiet too.

### 3.4 Multi-User & Collaboration

  * **M3 takes accounts as travellers.** Step 2 of the wizard has an *account* picker beside *Add traveller*: a
    picked account becomes a traveller named like it (the name stays editable) **and a member of the trip from its
    first moment**, with the role a share would carry (Editor by default). Sharing is therefore one act for someone who
    travels, not a second list to fill in; the plain *Share with* list remains for a collaborator who does not travel,
    and the two never offer the same account twice. Points that settle it:
    * **The creator is offered too.** They are Owner already, so the row has no role and no membership grant — only
      the link, for the reason M22 gives.
    * **The link is written after the generated rows**, as its own mutation, exactly as `addTravelerToTrip` does:
      inserted already linked, every per-person row FR-27.4 generates would notify the new member of a delegation
      at the moment the trip is created. The membership grant drains first (master partition), so the server's
      `not_a_trip_member` check finds the row.
    * **Absent without accounts** (G-8): Local and Single-User Mode show no picker, as they show no share list.
* **FR-4.5 (Roles & Permissions):** Trip sharing (FR-4.1) supports three roles: *Owner* (immutable for the trip creator
  — full control: edit trip metadata, add/remove participants, manage roles, delete items, archive the trip, confirm
  Review Assistant write-backs), *Admin* (can add/remove travelers, change roles of non-creator members, edit trip
  metadata — everything except deleting the trip or modifying the creator's role), and *Editor* (default for new members
  — edit item states, self-assign, delegate, comment, create tasks, flag items per FR-9.1, but cannot add travelers or
  change roles). A trip has exactly one Owner (the creator); admin rights can be granted to any member. **Enforced in
  three places:** the push path refuses any client-sent `owner` role and freezes the creator's row, and `trip_members`
  carries a partial unique index on `(trip_id) WHERE role = 'owner'` besides. No client traffic can reach that index —
  which is the point: it is there to catch a *server* bug, the only way a second owner row could ever be written. In
  Single-User Mode (3.17) this model is present but inert — see FR-17.3.
* **FR-4.7 (Traveler Management Authorization):** New travelers can be added to a trip at any time by members with
  *Owner* or *Admin* role. Editors can see all travelers but cannot add or remove them. Role changes are restricted:
  only *Owner* and *Admin* can change a member's role, and no one — not even another Admin — can change the trip
  creator's (Owner's) role. This protects against accidental or malicious demotion of the original organizer.
* **FR-4.6 (Trip Presence Indicator):** While viewing an active trip, users see who else is currently present on the
  same trip (sourced from the real-time channel of FR-4.4) and a best-effort indication of whether the group is caught
  up to the latest state. This is an advisory UI signal only (UI-Spec G-10) — it never gates or blocks any packing
  action, and it says nothing about devices that are fully offline rather than simply idle. **A presence entry carries
  the account id and nothing else**, so the face is named from the trip's participant directory — the same one the
  packing stamps read (`users.id` is a random 32-hex-character key, and initialling it identifies nobody). **The signal
  is carried by the pile itself rather than by a view behind it**: each face shows whether that person has caught up,
  the badge beside them gives the group answer as a glyph with a count in a bubble (the same grammar the G-2 indicator
  uses, with the words carried as its accessible name), and a tap names one person for a device that cannot hover. There
  is no per-person sheet: its whole content would be three fields, and it would place the one actionable fact — *who*
  is behind — one tap deeper than a pile already on screen. The **device count stays on the wire and is rendered
  nowhere**: that somebody has the trip open twice is not something anyone packing acts on.

### 3.5 Packing Workflow

* **FR-4.9 (Who Is Packing Right Now):** The sync sheet behind the status glyph (G-2b) names the other people who
  currently have the packing list of a trip open, and which trip, so a family knows before opening anything that
  somebody else is already on it. **Only trips the viewer is a member of, and only people who are members of them too**:
  the hub authorises both ends of every listing, so a trip a person may not know exists is never named to them. **What
  counts as "working on it" is the packing list being open (M4), not a subscription** — the dashboard follows every
  active trip and never unsubscribes, so a roster read from subscriptions would go on naming somebody after they had
  left; the client says it explicitly (`viewing` frame, Sync-API §7) and the hub forgets it with the connection.
  Consequently a person who is online but on no trip, or only on a screen other than the packing list, is not listed:
  "online" here means *at work on a shared trip*, and a bare "is connected" list would have to name people with whom the
  viewer shares nothing. Advisory and best-effort like FR-4.6 (a device that is offline is not listed), absent in
  Single-User and Local Mode (G-8), and it gates nothing. FR-4.6's per-trip facepile stays as it is; this is the
  account-wide answer to a different question.
* **FR-5.4 (Partial Quantities):** Items with a quantity greater than 1 track a `packed_count` (e.g., 3 of 5 socks). The
  item state is derived: *Open* (0 packed), *Partially Packed* (0 < packed < quantity), *Packed* (packed = quantity).
  The quick actions of FR-5.2 increment the count; a long-press completes the item in one step. *Packing Now* and
  collision locking (FR-5.3) apply at the item level regardless of partial progress.
* **FR-5.5 (Considered & Skipped State):** Items whose resolved quantity is 0 — whether set in the template, by
  conditional rule (FR-15.2), or by manual decision — remain visible as **done rows, revealed by M4's *Erledigte* switch
  (FR-25.2)**, instead of being removed. Each skipped item can be reactivated with a single tap — *Doch einpacken*, from
  the row's press-and-hold menu or the M5 control below, restores it to open with quantity 1. This preserves the
  decision log and prevents silent omissions. There is no separate *"Consciously skipped"* section — a skipped row is
  a done row (FR-25.2, UI-Spec M4) — and no swipe-to-unskip: nothing would announce it, and its option panel breaks out
  of the M4 card, the failure that lost the swipe in the M7 A2/B2 round. **Clarification:** users can also explicitly
  skip an item in M4, setting its state to `skipped` and quantity to 0 — distinguishing "deliberately left behind" from
  "forgot to pack." **The two fields are written together and are deliberately *not* coupled by a CHECK:** the client
  does send both, but the merge decides them separately (NFR-4.2a field-level LWW), so a concurrent newer quantity from
  another device leaves the skip applied on its own. Under `CHECK (state <> 'skipped' OR quantity = 0)` that whole push
  would be refused — and a refused mutation is one the outbox drops, so the user's skip would vanish instead of a stale
  amount surviving beside it (measured: with the CHECK in place, exactly that push comes back `rejected`).
  `state = 'skipped'` with a quantity above zero is therefore a legal row; every surface reads the state.
  * **The two paths** (`dev-docs/UI_Concept_SkipControl_variants.html`, variants A + C):
    * **M4, press and hold a row** → the M7 action sheet: *Jetzt packen* · *Nicht einpacken*, and on an already-skipped
      row *Doch einpacken* and nothing else. The fast path while going down the list.
    * **M5, a spelled-out control beside the stepper** — *Nicht einpacken* / *Doch einpacken*. The findable path: the
      stepper says *how many*, and only this says *none, on purpose*.
  * **Quantity 0 is not the same as skipped.** The zero is a counter reading, "weggelassen" is a decision. Skipping
    writes both (`state='skipped'` **and** quantity 0); zeroing the stepper writes only the count and leaves the row
    open. The **D variant** of the round — letting the zero *mean* the decision — was rejected for exactly that reason:
    it would put words in the user's mouth.
  * **Undoing reads as the opposite, not as "undo".** The reverse action is *Doch einpacken* and restores quantity 1,
    open (as this requirement already said). "Rückgängig" appears only in the snackbar, for the seconds in which it
    means the tap just made.
  * **The FR-20.2 cascade says what it took along.** Skipping raises the FR-25.2 snackbar naming the companions that
    followed, and its single undo restores the **whole** cascade — the rows are snapshotted before the write, so a
    companion that was already skipped stays skipped. A revealed co-skipped row states its reason ("weggelassen:
    „Drohne“ ist nicht dabei"), **derived** from the dependency graph and the current states rather than stored: a
    column would have to survive un-skips on either side and edits to the dependency itself.
* **FR-5.6 (Inline Quick-Add in Packing List):** While working in the packing list (M4), the user can add new items
  directly via an inline input field without navigating away. The input provides autocomplete suggestions from the
  master item inventory (FR-1.1), reusing the selected item's metadata (weight, value, category). A name the inventory
  does not hold is created there first, through FR-24.11's offer and sheet, and then added — the composer makes no
  ad-hoc rows. If the trip is in active status, newly added items are automatically flagged as *Missing* (FR-9.1). The
  input stays expanded after adding an item for rapid sequential entry. This removes the friction of switching context
  during the packing workflow.

* **FR-5.7 (A claim is broken by a person, not by a clock, *built*):** FR-5.3's lock ends in one of three ways: the
  holder packs the row, the holder gives it back, or somebody else **takes it over**. There is no staleness window: a
  claim holds until somebody ends it, and taking it over is a decision a person makes and answers for rather than one a
  clock makes for them.

  * **Taking over claims the row for the taker.** One gesture, no free intermediate state: the previous claim ends and
    the taker's begins, so the row stays locked for everyone else including the person it was taken from. This follows
    the occasion — you take a row over because you intend to pack it now, and an "unlock, then claim" pair would cost
    two steps for the only case that occurs.
  * **The taker is told whom they are interrupting, before the fact.** The action confirms, naming the holder and what
    they are holding ("Sia packt das gerade. Übernehmen?"). This is the whole difference between a lock that can be
    broken and a lock that is not a lock: the cost of breaking it is that you have to say you meant to.
  * **The holder finds out.** An FR-6.2 notification of a new kind reaches the person whose claim was taken, with its
    own toggle in M17 like every other kind. **This is what makes the lock partly server-side** rather than a
    client-side courtesy: only the server can stamp *who* took over (invariant 3) and create a notification for another
    account. A client cannot send itself one.
  * **Every takeover is recorded**, in its own table beside the conflict log — who took what from whom and when — and is
    readable per trip the way `conflict_log` is. A takeover is deliberately **not** written into `conflict_log`: that
    table holds merge losers, and one table holding two unrelated kinds of event is how a log stops being readable.
  * **Modes.** Local Mode has no server and no second person, and Single-User Mode has one account: in both, nothing can
    be taken over and nothing is notified, so the whole surface is hidden per G-8 rather than shown inert. The *release*
    stays in all three — giving your own row back needs nobody else.
  * **No window.** There is no `JITPACK_LOCK_TIMEOUT`, no `lock_timeout_seconds` on `GET /config`, no client staleness
    test and no "claim expired" row note. Without a window there is no *stale*: a row is claimed or it is free, and the
    way from the first to the second is a person.
  * **Nothing is written optimistically**: the takeover is the one lock action that does not go through the outbox,
    because a refusal would have to be undone and a taker shown a claim they do not hold is worse than a taker who waits
    for the answer. **The Playwright case needs a second account**, which the `single` project cannot supply — its two
    browser contexts are one Single-User identity, so a takeover there is a takeover of one's *own* claim and the server
    refuses it by design; E2E-G3-02 covers the G-8 gate there and the taking-over half in the mock-IdP `server` project
    (ADR-029). **A claim stops being this device's when the holder the server names is a different account.** A claim
    is a device flag on the client (`myLocks`), which it has to be, because Local and Single-User Mode have no second
    account to compare against; without that revocation the loser's screen would keep the row as her own claim, fully
    interactive, while the notification told her it was gone — breaking the promise that the row stays locked for
    everyone else *including the person it was taken from*.
  * **Decided in ADR-028**: *a claim that expires by itself* against *a claim that only a person can end* is a real
    tradeoff with a real cost on the chosen side. A holder who closes their laptop mid-pack blocks the row until
    somebody notices and takes it; what is bought is that no claim is ever discarded behind the holder's back, and that
    every break has an author, a record and a notice. The middle option — *expire and announce the expiry* — loses on
    cost: announcing an expiry needs the **server** to notice one, and expiry is the one event no request causes, so it
    would need periodic work in a process whose only goroutine is the listener. Once the notification is paid for, the
    clock buys nothing but the ability to decide on the holder's behalf.

* **FR-5.8 (A row can be taken off the list, *built*):** FR-5.5's *Nicht einpacken* keeps the row as a decision —
  which is right for "deliberately left behind" and wrong for the typo, the duplicate and the thing that was never going
  to be on this trip, which would stay on the list forever as a skipped row. Removing a row is therefore a separate act:
  * **Where.** A last entry in M4's press-and-hold row menu, *Von der Liste entfernen* — a long press on the row's
    icon opens this menu too, since the icon is inside the row; a second, icon-only gesture would compete with the
    row's own. It sits **below every row action**, marked destructive (red on
    iOS). It is absent where the menu offers nothing else of the row's: under somebody else's claim (G-3), in the
    closing pass (FR-9.3), and on a row the viewer holds, which offers only the release. A skipped row offers it beside
    *Doch einpacken* — cleaning up a decision made in error is one of the cases it exists for.
  * **What it is.** A delete of the `trip_items` row, cascading its comments and FR-7.3 todos (the server's cascade,
    mirrored client-side for Local Mode, C-3a). The FR-27.4 ledger already keeps a hand-deleted position deleted: a
    group refresh does not bring the row back.
  * **When it asks: only when the row carries something.** A row with **nothing on it** — no packed units, no notes, no
    companions to take along — goes at once, and the FR-25.2 snackbar offers the undo. A row carrying **any** of the
    three is confirmed first, the FR-24.3 idiom: the dialog says what the row is about to lose (*„Bereits 2 gepackt."*,
    *„3 Notizen werden mitgelöscht."*, *„Ebenfalls nicht eingepackt: Akku."*) and always points at *Nicht einpacken* for
    the other intent. A confirmed removal has an undo too, by deleting later rather than restoring (FR-25.31), because
    what it announces is what a re-insert cannot bring back. The rule is `removalNeedsConfirm` in
    `client/src/domain/rowRemoval.ts`; always asking, and never asking with only an undo, are the two options declined.
  * **The undo re-inserts the row under its own id** with every field the user chose, and none of the server's stamps
    (invariant 3). The same id is what makes the FR-27.4 ledger find its row again; a fresh id would read as a
    hand-deleted position plus a new row. ADR-052 lets it through because the insert is newer than the tombstone.
  * **Companions (FR-20.2).** Removing a main item co-skips its dependents, exactly as skipping it does — they stay on
    the list as done rows rather than vanishing — and, as there, only those nothing else on the list still needs: a
    per-person item (FR-25.1) is still on the trip while another traveler's row of it is not skipped (FR-20.2, for the
    skip too). Once the main row is gone, a co-skipped companion reads as plainly skipped:
    `skippedVia` names the *skipped* row it followed, and there is none left to name.
  * **Not in M5, deliberately.** M5 has no *Entfernen* control (FR-5.5's findable path stays the skip): it would be one
    more entry point for the same act. **Revisit trigger:** somebody looks for removal in M5. The FR-25.26 cluster head
    offers what a row does, the removal included.
  * **Modes.** Identical in all three: a trip-partition delete and, for the undo, an insert — nothing server-only.
  * **The item goes with its last use (*built*; the how is ADR-065).** Every name typed into the composer is an
    inventory item (FR-24.11), so without this a removed typo or one-off would stay in the inventory for good. A removed
    row takes its inventory item along when **nothing else uses it**: no Vorlage or group position, no other trip row —
    another traveler's row of the same item counts — and no other item that brings it as a companion (FR-20.1; its own
    companion list goes with it). **Automatically, without a question** — chosen over asking in the removal, over
    limiting it to items made on the side (a provenance column) and over an M24 rule. **Only once the removal is
    final**: when the snackbar's undo lapses (it runs out, the screen is left, the next action replaces it), after a
    confirmation too (FR-25.31), so the undo still re-inserts one row and never has to re-create an item with its tags,
    rules and photo. Both surfaces say it: the
    snackbar reads *„„Zelt" entfernt – auch aus dem Inventar"*, and the dialog ends with *„Der Artikel kommt sonst
    nirgends vor und wird auch aus dem Inventar gelöscht."* **Local Mode** deletes on its own answer, which is complete.
    **A server device asks the server** (`POST /master/items/{id}/prune`, after the removal has been answered): it holds
    only the trips it has opened, so the server deletes only if nothing anywhere uses the item and otherwise leaves it
    untouched — not retired, which is FR-24.3's answer to a deliberate delete. *Accepted costs:* offline at that moment,
    the item stays; a tab closed while the snackbar is up keeps it too; and in Server Mode the sentence can promise a
    prune the server then declines over a trip this device has not seen. Other removals — the browse sheet's undo of an
    add, a group refresh, a membership change, deleting a trip — never prune.
* **FR-5.9 (A row is bought at the destination from its own menu, *built*):** *„das kaufe ich dort"* is a decision
  made while reading the list, like the amount (FR-25.24) and the late-packer flag (FR-25.25), so the row's mode
  (*Packen* / *Vorher kaufen* / *Vor Ort kaufen*) is not M5's alone. M4's press-and-hold menu offers ***Vor Ort
  kaufen*** on a row whose mode is anything else, and ***Doch mitnehmen*** (back to *Packen*) in its place on a
  `buy_local` row — after *Nicht einpacken*, before the late-packer flag.
  * **Only on an untouched row** (`state = open`). On a `buy_local` row the packed state *is* „bought" (FR-25.11j), so
    switching a half-packed row would claim a purchase nobody made, and the way back from a bought row would turn the
    purchase into a packing. M5's mode control stays the complete one, for every row and all three modes; *Vorher
    kaufen* gets no menu entry, because a menu that grows one entry per mode stops being short.
  * **The cluster head** offers both, reaching the instances whose own row would offer each (FR-25.26's rule).
  * **Taken back like every act on the list (FR-25.31):** the snackbar names it (*„„Sonnencreme" wird vor Ort
    gekauft"*), and its *Rückgängig* writes the previous mode back — per instance, from the head.
  * **Modes.** Identical in all three: one trip-partition field write.

* **FR-5.10 (Finishing the packing, *built*):** a trip is packed at some point, and the list says so. Without it, a
  row still open means two different things — *not done yet* and *decided against* — and only the person holding the
  bag can tell them apart. M4's ⋮ carries ***Packen abschliessen***,
  one step above the lifecycle's two, and it makes the whole list a statement: **whatever is still open becomes FR-5.5's
  *bewusst nicht mitgenommen*.** It is offered while the trip is not archived and the packing is not closed, **including
  on a list with nothing left open** — declaring a finished list finished is the ordinary case, not a no-op.
  * **What it writes, per row** (`client/src/domain/closePacking.ts`, so the question, the write and the undo read one
    rule):
    * **Nothing packed** → the skip M4's row menu already writes (quantity 0, `state='skipped'`), **plus the release of
      a claim** (FR-5.3). That release is the one difference from the row menu's own skip, and it is owed: the menu is
      not offered on a row somebody else holds, while this reaches every open row at once — the G-3 lock is advisory by
      decision — and a decided row must not still read *„Sonja packt gerade"*.
    * **Half packed** → **the amount shrinks to what is in the bag** (`quantity = packed_count`, state *packed*).
      Variant **P1** of the round, chosen over skipping the row (**P2**, which writes quantity 0 and thereby denies four
      socks that travelled — M14 would lose four packed rows it could have judged) and over keeping both numbers beside
      `state='skipped'` (**P3**, the most truthful and the most expensive: `packState.unitsOf` would have to read the
      state, or the trip line would sit at 4/6 for ever). **The accepted cost of P1 is that nothing records how many
      were left behind on that row** — the row says four were wanted and four are packed, and the two that were not
      taken are gone from the record.
    * **Untouched:** an already-decided row (packed, or *skipped* — the **state** is the decision, and FR-5.5 makes
      `state='skipped'` beside an amount above zero a legal row), and the lifecycle — closing the packing neither
      starts nor archives the trip. A row in a buy mode is the shopping list's business (FR-30.2) and is not skipped
      or shrunk.
    * **Tasks and buy rows move with it.** Todos are not packing, but finishing the packing is the moment „before the
      trip" ends: every task still open and still due before it crosses to *during* in the same batch, under the same
      undo, and the question above names how many will move — see FR-7.7 for the rule, and for why a decision may move
      a task where a date may not. Likewise the buy rows still to buy *before departure* move to *at the destination*
      in the same act, with the shopping list's own entries, and *before* stays closed until the packing is reopened
      (FR-7.12).
  * **One question, one undo** (variant **A** of the round). A single confirmation — **a sheet, not a system dialogue**,
    because an `ion-alert` looks like the cheap way to ask, on the one moment in a trip where the app should look like
    itself — states the count and then the three things a count hides, each on its own line: how many rows packing has
    begun on, how many are due on departure day (FR-5.1), and how many somebody else is holding. The snackbar's
    *Rückgängig* then takes the **whole batch** back (FR-25.31), and it also lifts the stamp — a close that was undone
    did not happen. Not **variant B**, a last look row by row with each row tappable back into the list: it would catch
    the one thing you actually forgot, which is the point of the action, but it is a second review in front of the
    trip's own (FR-9.3), and on a forty-row remainder it is a screen rather than a question.
  * **The last row packed offers the step.** The step is offered where the moment is, not only where the menu is: when
    the last open row is packed, the step appears **in the *„Alles erledigt"* empty state the list already shows at that
    moment** (FR-25.11e) — no new element enters the flow, so nothing moves under the finger that packed the row
    (ADR-060). The sheet opens from it, headed *„Das war das letzte offene Packelement."*, and *Später* there waves it
    off for the visit. **Neither a sheet opening by itself nor a bar above the list:** the first puts a modal under taps
    meant for the list, the second moves the page under an open sheet. The offer also disappears by itself when the list
    reopens — a row added or un-packed — so it never outlives the moment it reports. **It lives in the empty state, so
    it needs the list to be empty:** with the *Erledigte anzeigen* bar open the packed rows are listed, the empty state
    does not render, and the offer waits until the bar is closed again (the ⋮ entry carries the step in every case). An
    accepted cost: a second place to render it would be a second thing that can move the page under a tap. Three guards,
    each against a way this becomes a nuisance: it fires on the **transition** and never on arrival at a list that was
    already complete (that moment passed before the screen opened); a reader who answers *Später* is not asked again for
    that trip while the screen lives, or ticking the last box would raise it every time; and a list that has not arrived
    is not a finished one (ADR-033). **What counts as finished is its own rule** (`packingIsFinished`), and not „the
    close would decide nothing": a trip carrying only shopping rows has an empty plan because a buy row is not this
    list's (FR-30.2), and a trip whose last row was *skipped* was decided rather than packed — asking in either place is
    asking about a moment that never happened. So: at least one packing row, none of them open or half packed, and at
    least one of them actually packed. It remains a *question* — nothing is written until it is answered, because the
    decision is the user's and not the app's.
  * **„Abgeschlossen" is a stamp, not a reading.** `trips.packing_closed_at` (master partition, merged on its own under
    NFR-4.2a) records the moment. Deriving it from *„nothing is open"* was the cheaper option and is wrong here for one
    reason: **the list stays workable afterwards** (below), so the next row added would silently revoke the decision —
    and with it FR-30.8's default and the card that offers the way back. The cost is a schema change.
  * **The finished list says so.** M4 leads with a card naming the moment and how many rows the list carries as
    *nicht mitgenommen*, and carrying ***Wieder öffnen***. Reopening lifts the stamp **and nothing else**: the rows it
    decided stay decided, because that is what the decision was — and with P1 the amount a half-packed row wanted is no
    longer recorded anywhere, so a wholesale restore would have to invent it. A single row comes back through FR-5.5's
    reveal. No name on the card: a person would have to be stamped by the server (invariant 3), and
    Local Mode has nobody to name.
  * **Adding afterwards is the point, not an exception** — something packed but never put on the list is added on the
    road. The list is not locked — quick-add, the
    ＋ FAB and the browse-sheet all stay — and **while the packing is closed a row typed into the composer lands
    *packed*** (the FR-25.13f machinery), with the hint under the field saying so instead of FR-9.1's. On an active trip
    it is still flagged *Missing*, which is exactly right: the plan forgot it, and M14 should propose it for next time.
    **An add for named travelers still writes an open row** — a row per person is a plan being made, not a bag
    being recorded.
  * **FR-5.11 — packed or forgotten:** an add on the road is either *packed* — forgotten to put on the list — or
    *forgotten to pack*, recorded so the next holiday accounts for it. FR-5.10's add records something that
    **travelled**; this is the second answer, what **stayed home**. **Once the packing is closed** the composer asks
    *what happened to it* with two equal answers: ***Eingepackt*** (the default, and exactly what FR-5.10 already
    writes) or ***Vergessen***. Before the close nothing changes: the open row with FR-9.1's hint, no question, because
    a list still being packed has nothing yet to have forgotten. *Vergessen* writes a row that is **skipped at quantity
    0 and flagged *Missing*** (FR-9.1) — neither packed nor an open job, so the packing figure does not move, and M14
    (FR-9.2) proposes it for the next trip like any other *Missing* row. No new state and no schema change: the row is
    the shape FR-5.5's skip already writes, plus the flag. **The one *not-taken* add that is flagged** — FR-25.13f's
    skip-add is not, because *„we are leaving it"* and *„the plan forgot it"* are different statements — and flagged
    whatever the trip's status, since a trip still *planning* can have its packing closed. The choice never reads
    FR-25.28's for-whom strip (one thing stayed home, for nobody in particular), stays across a run of adds and is back
    on *Eingepackt* the next time the composer opens. Not offered in M8. **The row says so:** a revealed skipped row
    that is flagged *Missing* reads *„Vergessen einzupacken"* where its siblings read *„Bewusst weggelassen"*. Both
    answers set the flag, so M14 reads them alike today; giving *Vergessen* its own proposal is left open.
  * **M1 lets the packing recede**, because the trip is in another phase. On a trip whose packing is closed, the
    dashboard's hero and its trip cards drop the packing **figure** — a ring, the loudest thing on the card — and name
    the phase after the dates instead (FR-7.10, ADR-074). What is still owed takes the space: the trip's tasks become
    the card's one figure and take the lone ring size back (FR-7.4), and the shopping card below opens on *Vor Ort*
    (FR-30.8). The open-rows preview needs no rule of its own — it lists open rows, and a finished list has none; a row
    added afterwards (above) reappears there, which is correct, because that one really is open. No *„Packen
    abgeschlossen"* line: it would take a figure's height to say one thing, and the room carries the open tasks and
    shopping lines themselves.
  * **Modes:** identical in all three — one batch on the trip partition and one field on the master partition.
    **Not carried** by the portable backup (NFR-4.11), like every other piece of progress and like FR-7.3/7.4's todos —
    a restored trip's packing is open again with its decided rows still decided, which `docs/backup.md` states.
  * The round: `dev-docs/UI_Concept_ClosePacking_variants.html`, five questions rendered against one trip; the answers
    are A (where it lives), A (what it asks), P1 (the half-packed row), the stamp, and FR-30.8's phase rule.

### 3.6 Notifications & Delegation

* **FR-6.1 (Personalized Dashboard) — the aggregation is not filtered by person.** PRD-Base FR-6.1 says M1 aggregates
  the items *„assigned to them"*; M1 lists every open row of every active trip instead. ~~assigned to them~~ is
  **struck**, for a reason that is structural and not a matter of effort — **a personal filter empties the screen in
  two of the three run modes.** Local Mode has no accounts and Single-User bypasses membership, so in both there is
  nobody for a row to be assigned to, and the dashboard would greet the user with nothing at all. What stands instead
  is the **highlight**: delegation becomes visible *on* the aggregation (UI-Spec M1, E2E-M1-03) without the
  aggregation becoming personal, which is a surface Server Mode can carry and the other two can hide per G-8. The
  assignment it highlights is FR-25.19's `packer_user_id`.

### 3.7a Preparation Todos

* **FR-6.1 — M1 also shows the trips that have not started yet.** Aggregating **active** trips only would leave a trip
  created and not yet started on no screen the app opens on, only on M2's *Geplant* segment. M1 therefore carries a
  *Geplant* card below the trip cards, listing every planned trip by departure — soonest first, undated last — each row
  naming the trip and its period and leading to it. Two rules come with it. **„The trips I am involved in" needs no
  membership filter**, because there is nothing to
  filter: in Server Mode the master feed is membership-scoped (`masterVisible`), and Local and Single-User Mode have no
  accounts at all — a filter would be a no-op in one mode and empty the section in the other two, which is the trap
  FR-6.1's personal filter was struck for. And the section is **display-only**: no planned trip's partition is fetched
  or subscribed, unlike the active trips above, because the row shows nothing that lives in it — the counts M1's active
  cards spend a request each on are exactly what a planned trip has not got yet. The empty state needs *no* trips at
  all, since a screen saying „no trips" above a trip nobody started would be worse than no empty state (UI-Spec M1,
  E2E-M1-08).

* **FR-7.3 (Preparation Todos):** Trip items can have preparation todos — small tasks that must be completed before the
  item is truly "ready to go" (e.g., "charge battery," "format SD card," "wash"). Todos are modeled as task-type
  comments (FR-7.2, `is_task = 1`) attached to a trip item. An item whose `packed_count` equals `quantity` but still has
  open todos is displayed as **packed with open prep** — visually distinct from fully complete — to prevent the false
  sense of "all done." **This overrides PRD_Base FR-7.2's *„An item cannot be fully marked as ready until all nested
  tasks are Resolved"***: packing such a row is *allowed* and produces this state, because refusing the tap would leave
  a packed rucksack the app insists is empty. Doneness, not the tap, is what the open todo withholds (FR-25.2). Todos
  can be added and resolved directly from M5 (Item Detail); M1 takes no actions — it lists them. Resolving the last
  open todo on a packed item transitions its visual state to fully complete. **Visibility:** All open preparation todos
  of a trip are visible to every trip member — not just the item's assignee — in the trip's one task list, where each
  preparation carries the chip of the row it prepares, and in the task figure beside the packing share (FR-7.6); there
  is no separate prep section and no open-prep count in the header. The M1 Dashboard (FR-6.1) aggregates open
  preparation todos across all active trips in the *Aufgaben* card, each named by its row's chip. It is **not
  filtered** to the current user's assigned items, on this card or on the trip cards beside it — M1 shows every open
  row and every open todo of every active trip, because Local and Single-User Mode have no account to be assigned
  anything, so a personal filter would empty the one screen the app opens on (FR-6.1, UI-Spec M1). **Resolving a prep
  todo is open to every member of the trip**: the todos are visible to **every** trip member, not just the assignee,
  and a household packing list where anyone may read a preparation task but only two people may tick it is friction
  with no threat behind it; the trip is already membership-gated. `toggleTodo` guards only on the G-3 claim, and the
  server has no per-field rule.
  * **Open-prep is derived, never stored.** "Has open preparation" must be computed from the todos themselves at read
    time. A **count on the item** kept alongside the todos' own `done` flags drifts the moment a todo is resolved: the
    count stays at 1, so a fully packed item with all its tasks finished never becomes done and never leaves the list —
    the FR-7.3 transition cannot be reached. The same duplication fails in the opposite direction too: an item with a
    todo but no stored count shows no prep badge at all. Wherever doneness, the amber "packed with open prep" state, the
    badge, or the *Merkmale* facet ask about preparation, they must ask the todo list.

* **FR-7.4 (Trip Todos — Tasks That Belong to the Trip, Not to an Item), *built*.** Some of what has to happen before a
  holiday has nothing to do with the luggage: *„Elektronische Geräte abschalten"*, *„Pflanzen giessen"*, *„Kühlschrank
  leeren"*. With tasks only on packing rows (FR-7.3, FR-27.7), the only way to keep one would be a placeholder item — a
  *„Wohnung"* row on the packing list, ticked as if it were packed, whose open task holds back doneness for something
  nobody packs. A **trip todo** is a task anchored to the trip itself.
  * **Data model — none new on the trip side.** A trip todo is a `comments` row with `trip_item_id` null and
    `is_task=1`: the shape FR-7.1's trip-level comment and FR-7.2's task flag allow together. It therefore travels the
    trip partition, merges field by field (ADR-022), is in the server's JSON export with the rest of `comments`, and has
    its author stamped by the server (invariant 3) — exactly like an FR-7.3 todo. The client files it in a list of its
    own rather than filtering the row todos, so that no packing figure can count it by accident. **Not in the portable
    file, and so not in Local Mode's backup** — neither kind of todo is. *Revisit trigger:* a Local Mode restore that
    loses todos somebody missed.
  * **It does not block packing, and „all done" is its own answer.** Trip todos count toward **nothing** the packing
    list measures — not a row's doneness (FR-25.2), not the progress ring, not M2's share, not M4's open-prep KPI, not
    FR-7.3's amber state. A trip whose every row is packed is fully packed while *„Pflanzen giessen"* is still open, and
    the reverse holds too. What the user gets instead is a **second, independent check**: *n von m erledigt*, and *„Alle
    Aufgaben erledigt"* once none is open. The two are not folded into one figure: that would let a houseplant hold a
    finished rucksack at 97 %, which is the false signal FR-7.3 was written to prevent, pointed the other way. The
    second check counts **every** task of the trip, its own and its rows' preparations alike (FR-7.6) — what stays
    apart is the *packing* figure, which counts rows and nothing else: no task of either kind moves the share.
  * **Surface: written in the trip, reported on the dashboard.** The trip's task list (M25, FR-7.7) holds the
    editable list: open ones ticked off in place, resolved ones reachable again to untick, a composer, and a ✕ per row.
    **Ticking a task off raises FR-25.2's snackbar with its undo** — the row leaves the open list the way a packed row
    leaves the packing list, so a mistap is taken back the same way. **M1 takes no actions** — it reports: an
    *Aufgaben* card lists the open trip todos of every active trip that has any, each trip's block leading into the
    trip, and each active trip card states the check beside — never inside — its packing progress (**one exception:
    the shopping list, FR-30.7**). No editor on M1: an empty composer would stand above the hero on every dashboard, and
    the dashboard is for reading. The rule holds for the *Aufgaben* overview card and every trip card, but not for the
    hero of a trip whose packing is finished — its task block is worked in place, on purpose, for the reason FR-30.7
    gave the shopping list (FR-7.10, ADR-074). M5 does not show trip todos. Planned trips are not on M1 — its *Geplant*
    card is display-only and fetches no trip partition — but their task list works like any other. **Revisit
    trigger:** a trip todo somebody needs to see on M1 before the trip is started.
  * **Visibility.** A section closed at the foot of M4, under every group and reveal bar, goes unseen, so two of four
    mocked variants work together: **(A) a second figure** — M4's header line and M1's hero carry the todos as the
    packing share's pair: the same ring, *„1/4 Aufgaben"*, *„3 offen"* while any is, and a track, in the same
    `--jp-done` because progress has one colour (G-11). The two read as one: side by side with both headlines on a line
    and both tracks on another, or — where two columns would cut a sentence short (measured: *„118/118 gepackt"* needs
    115 px, a 360 px phone's hero column has 77) — one above the other. On M4 a tap on it unfolds the section and brings
    it into view. It is absent on a trip with no todo, rather than reading *0/0*. **(B) Tasks first** — the section sits
    above the list, directly under the header line, **unfolded while any todo is open and folded to its one line once
    none is**, so a finished section gives the rows their room back; a fold the user makes holds for the visit. The two
    rejected variants, kept for their triggers: a separate *Aufgaben* view beside the packing list (*trigger:* todos
    that grow fields of their own — a note, or a second field beside FR-7.5's assignee, which alone does not fire it),
    and a departure countdown band from three days before the start (*trigger:* A and B still missed in practice). The
    list cards below M1's hero keep the one-line check, because a card that small has no room for a second ring.
  * **Who may resolve:** every member of the trip, as for FR-7.3. There is no row, so there is no G-3 claim to
    respect. A due day is optional and FR-7.11's.
  * **From a template.** A template — either scope, in practice the Ferien-Vorlage — can carry **trip tasks** beside its
    positions, stored in a master table `template_tasks` (`template_id`, `task`, field HLCs) so that two devices
    editing two tasks do not overwrite each other, the reason FR-27.7 chose a table over a JSON column. At trip
    generation the template's own tasks and those of every included group (FR-27.1) become open trip todos,
    **deduplicated by exact trimmed text** — two groups both saying *„Pflanzen giessen"* give one todo. M3's step 3
    reports the count on its own line, apart from FR-27.7's preparation tasks. They are part of the portable template
    shape (FR-18.2) as a `trip_tasks` list on the template and on each group it carries — a key of its own, because
    `tasks` already means a position's preparation. The dev seed's Ferien-Vorlage carries two of them, per the standing
    rule that master-data features extend it.
  * **Deliberate non-features, each with its trigger.** A task edited on a template is **not offered** to trips
    generated from it (FR-27.4 offers position changes only); it reaches the next generated trip. *Trigger:* a Vorlage
    task added and expected on a running trip. Trip todos do **not** flow back into a template, neither by FR-27.5 nor
    by M21, for FR-27.7's reason — a trip's own todos are often about this trip only. *Trigger:* the same trip todo
    typed by hand on a second trip. Cloning a trip (§3.12) does not carry them, like it carries no FR-7.3 todo.

* **FR-7.5 (A trip todo names whose job it is, *built*):** a packing row can be handed to somebody (FR-25.19,
  FR-25.25), and so can a task — otherwise *„Pflanzen giessen"* on a household's list is everybody's and therefore
  nobody's. A task carries an **assignee**, set and read the way a row's is.
  * **Storage:** `comments.assignee_user_id`, a nullable reference to `users`, synced as an ordinary field of the trip
    partition (field-level LWW, no CHECK — a constraint that could refuse a single-field mutation would lose the
    choice). It is the task's counterpart of `trip_items.packer_user_id` and, like it, **the client's to set**:
    invariant 3 is about who *wrote* the todo (`author_id`, stamped by the server), not about whose job it is. FR-7.3's
    preparation todos carry one too (FR-7.7): a battery can be Sia's to charge on a camera Andy is packing.
  * **Where it is set — the row's seat, on the task.** In the trip's task list every open todo ends in
    FR-25.25's seat — the same component: the assignee's avatar, or an empty seat while it is nobody's — and a tap
    opens the same picker a row's seat does, plus *niemand*, with the same snackbar undo (FR-25.31). A resolved todo
    **names** its assignee but offers no seat: handing over a finished task decides nothing. **G-8:** the seat exists
    only where somebody else can be picked — absent in Local Mode, Single-User Mode and on a trip nobody else is a
    member of; an assignee already on a todo is still named there.
  * **One difference from a row, on purpose: the picker offers me too.** A row's picker leaves the current user out
    because an unassigned row is already on my list (FR-25.20), so assigning it to myself says nothing. A trip todo
    has no such filter, and *„ich mach das"* is the most common thing a household says about one.
  * **What it does not change.** A todo assigned to somebody else is **not hidden** — FR-25.20 is not extended to the
    section. It is a handful of lines whose head counts every todo (*„1 von 4 erledigt"*); hiding some would make the
    count disagree with the list under it. And it is **not a permission**: every member may still tick any todo
    (FR-7.4 *Who may resolve*) — the assignment says whose job it is, not who may do it.
  * **Notification (FR-6.2).** Handing a todo to another member sends them a **delegation** — the kind a row's
    assignment sends, in its words (*„Alice hat dir ‚Pflanzen giessen' zugewiesen"*), under the same M17 switch. No
    fifth kind: to the recipient it is the same sentence. The payload carries the trip and the comment and no item, so
    FR-6.3's deep link opens the trip, where the section is. Nobody is told about a todo taken on oneself, a todo
    handed back to *niemand*, or an account that is not a member of the trip (ADR-058's rule). A todo written already
    assigned and mentioning its assignee notifies them once.
  * **M1 reports it.** The *Aufgaben* card names the assignee after each open todo (*„Pflanzen giessen · Sia"*),
    read-only like the rest of the card.
  * **Not a trigger by itself.** FR-7.4's trigger for a separate *Aufgaben* view names fields a todo grows; one
    assignee fits on the task line in the idiom the row already uses. The trigger stands for the rest of its list — a
    note, or a second field beside this one.
  * **Not carried:** a template's trip task (FR-7.4) names nobody, so a generated todo starts unassigned — the
    precedent is FR-1.9, which put a default assignee on the inventory item, not on a template position. *Revisit
    trigger:* the same Vorlage task assigned to the same person by hand on every trip. Not in the portable format or
    the backup (neither carries todos, FR-7.4), and not carried by cloning a trip.

* **FR-7.6 (The trip's tasks are one list, *built*; decided from an interactive mockup):** a preparation declared on a
  packing row (FR-7.3) and a chore of the trip itself (FR-7.4) are the same thing to the person doing them — something
  that has to be done before leaving. **Both kinds are one list, one count and one card, and what tells them apart is
  the row a task belongs to.** The tradeoff is ADR-068.
  * **Data model — nothing new.** Both kinds are `comments` rows with `is_task=1`; `trip_item_id` is what
    distinguishes them. The whole feature is a reading of rows the trip already carries (`tripTasks` in
    `client/src/domain/tripTodos.ts`).
  * **The chip is the distinction.** A task that prepares a row ends in a chip naming that row — its mark (FR-28.7,
    inherited from the master item) and its name — and the chip **leads to the row's own sheet**. A task of the trip
    itself carries no chip, and that absence is the only thing a reader has to learn. A preparation carries **no ✕**
    on the line (it is removed where it lives, in M5). *Revisit trigger:* somebody asks to delete a preparation from
    the task list without opening its row.
  * **Order.** Open before resolved; within each half the trip's own before a row's; a row's grouped by the row and
    each group by text. So the chores read first and a row's preparations stand together.
  * **One figure, one head.** M4's second figure, M4's section head, M1's *Aufgaben* card and each M1 trip card's task
    line all count both kinds. **The packing figures count rows only**: the share, the ring, M2's figure and a row's
    doneness, and FR-7.3's „packed with open prep" holds — a packed row with an open preparation stays on the list. Two
    answers, as FR-7.4 settled.
  * **No second place.** There is no separate *Vorbereitung* section in M4 and no *Vorzubereiten* card on M1. The
    header's detail line under the packing share carries the weight and no *„N Vorbereitungen offen"*: the figure
    beside it states that count, and a number said twice on one line is a number two places can disagree about.
  * **The task goes with the row.** Deleting a packing row cascades its preparations — the server's `ON DELETE
    CASCADE`, the client's own cascade (`sync/cascade.ts`), and, on M4, the row's tasks leave the list the moment the
    row does, while FR-25.31's undo can still bring both back. The reading rule closes the last gap: a preparation
    whose row this device does not hold is **not listed**, so a device that has not yet pulled a delete cannot show a
    task whose chip leads nowhere. FR-5.8's confirmation already asks before a removal that takes notes or todos along.
  * **Templates are unaffected**: `template_item_tasks` generates preparations on the rows they belong to (FR-27.7)
    and `template_tasks` generates the trip's own (FR-7.4). They arrive in the one list
    like everything else, which is the whole point.
  * **Modes.** All three, like both FRs it joins: the rule is pure and client-side (invariant 4), and nothing here is
    server-only (G-8).
  * **Surfaces:** M4 (the section, the figure, the header line), M1 (the *Aufgaben* card, the trip cards' line), M5
    (where a preparation is declared). UI-Spec M1/M4; E2E-M4-136, E2E-M4-137, E2E-M1-02,
    E2E-M1-07, E2E-M1-10.

* **FR-7.7 (When a task is due, and a screen of its own, *built*; decided from an interactive mockup):** a trip has
  two kinds of moment. *„Eine Salbe in der Apotheke holen"* is a task for before the holiday; when it did not happen
  before departure it does not stop being a task — **it changes phase**. And a task can be written for the road from
  the start: *„am Bahnhof die Zugverbindung nach X abklären"*. Beside that, **a task can be assigned to somebody like a
  pack item**, and **when it was written and when it was done are visible, with who did each**. The shape is **one list
  in the data, two windows on it**, and the tradeoff is ADR-071.
  * **The phase is stored, not derived.** `comments.phase` is `'before' | 'during'`, nullable and free of a CHECK
    (ADR-022, like every column of this table). Nothing else in the row separates *not done yet* from *always meant
    for later* — both are open tasks — so a reading could never tell them apart. **NULL reads as *before***
    (`taskPhaseOf`): a task that states no phase is a task for before the trip, and writing the column onto such rows
    would claim a statement nobody made.
  * **M25 *Aufgaben* is the third trip view**, a screen like the packing list, with a pill beside *Packliste* and
    *Einkauf*. It holds **every** task of the trip in two sections, *Vor der Reise* and
    *Während der Reise* — variant **A** of the round, over a segment like M6's: the shopping list's two tabs are two
    places you stand and you are only ever in one of them, while the two phases of a trip are one thing read top to
    bottom. Each section has its own composer, and what is typed there is written in that section's phase.
  * **M4 keeps a window, and only a window** (variant **A** of the round): the tasks that **hang off a packing row and
    are still due before the trip** — the ones you do as part of packing — under *„Beim Packen zu erledigen"*. It has
    **no composer**: everything it shows hangs off a row, so a trip task typed there would be written into a list that
    cannot show it; a line leads to M25, where it is written. M4's task figure and section head count the window, not
    the trip's whole list — a head reporting on a screen the reader is not looking at is a head that disagrees with
    what is under it.
  * **Nothing is filed twice.** The window is a *reading* of the one list, which is what makes the phase mean
    something: moving the salve to *during* takes it off the packing list, and moving it back puts it there. A second
    list would have made the same act a copy.
  * **The crossing happens when the packing is declared finished**, and the user is told the tasks move. Closing the
    packing (FR-5.10) writes `phase='during'` on **every task still open and still due before
    the trip**, both kinds, and the question that is asked first says how many will move. It is a **write**, not a
    window rule: the phase is stored precisely so that it can be the user's own statement, and a reading taken off
    `packing_closed_at` would contradict a field they can set by hand — a later *Wieder öffnen* would silently reclaim
    tasks somebody has been working on since.
    * **Why an automatic move is right here and not elsewhere.** A *date* never moves a task: a departure day passing is
      a clock, and a clock does not know whether you still mean to do the thing. Closing the packing is a person saying
      they are done. **A decision may move the tasks; a date may not.**
    * **One undo for the whole act** (FR-25.31). The rows travel as the snapshot the snackbar holds and the moved
      tasks ride in the same restore — a second undo would replace the first, because the record holds one action at a
      time by design, and the rows would quietly lose their way back. The undo writes back **the phase each task
      actually had**, which may be none at all (NULL).
    * **Undo is not *Wieder öffnen*.** FR-5.10's rule covers the tasks too: *reopening lifts
      the stamp and nothing else — the rows it decided stay decided*, and so do the tasks it moved. An undo takes back
      the tap just made; reopening is a new decision.
    * **A resolved task never crosses.** Its phase says when it *was* done, and rewriting that would invent a second
      history.
  * **The crossing by hand** is the task's own sheet, opened by tapping its words on either screen: *„Auf Während der
    Reise schieben"* / *„Zurück auf Vor der Reise"*, with its own undo.
  * **Assignment reaches both kinds.** A task is handed over like a pack item, and a preparation is a task, even though
    its row already names a person. The two are different questions — a battery can be Sia's to charge on a camera Andy
    is packing — and they are different columns (`comments.assignee_user_id` beside `trip_items.packer_user_id`). The
    seat, the picker and the FR-6.2 delegation notification are FR-7.5's. **The ✕ still belongs to the row**: a
    preparation is removed in M5, which is the one place that shows what else that row still owes.
  * **Provenance, and who owns which half.** Four facts, and the split follows invariant 3 exactly:

| Fact | Column | Written by | Note |
|---|---|---|---|
| when it was written | `comments.created_at` | server (default on insert) | FR-7.1's column |
| who wrote it | `comments.author_id` | server (`stampActor`, on insert only) | FR-7.1's column |
| when it was done | `comments.resolved_at` | **client may name the tap** | FR-25.17's precedent — a task is ticked off offline |
| who did it | `comments.resolved_by_user_id` | **server only** (`stampActor`) | a record you can pick is not a record |

  * Both are cleared when a task is unticked, with the state they described — a record must not outlive what it
    describes. The stamping rule is `stampRecord` in `internal/api/server.go`, which FR-30.4's purchase and this
    share: three records in the schema obey one rule, and it is written once.
  * **The line says one of them, the sheet says all of them** (variant **B** of the round). Under a task's words
    stands **one** line whose role changes with the task: *erstellt von … · heute 14:32* while it is open, *erledigt
    von … · gestern 09:15* once it is done. An open task is a promise, so it names who made it; a finished one is a
    record, so it names who kept it. Two lines would double the height of every row to say, on the open ones, nothing
    that is not true of all of them. The task sheet carries both pairs, the row a preparation belongs to, the
    phase, and the move.
  * **G-8 in both halves.** Where nobody can be named — Local Mode, and Single-User Mode, which has no second account
    — the line **keeps the moment and drops the person**: *erstellt · heute 14:32*. A line that said less is right; a
    line that invented „von jemandem" would not be. The *Meine* chip is absent for the same reason: with nobody to
    hand a task to, every task is everybody's and the filter is for a distinction that does not exist.
  * **Templates carry the phase.** `template_tasks.phase` (same shape, same NULL reading) lets a Vorlage author a task
    for the road, and M8's task list shows each one's phase as a chip that flips it. Instantiation carries the phase
    into the generated task; where two sources say the same text, the first one supplies the phase, as it supplies
    every other attribute (FR-27.2). A template's *item* tasks (FR-27.7) are preparations and start *before*.
  * **The portable format does not carry the phase.** `trip_tasks` is a list of words and stays one (NFR-4.11); an
    imported template task therefore arrives as a task for before the trip — what a task without a phase means — and
    can be moved afterwards. Reading a phase out of a document that never stated one would be a
    claim, not an import.
  * **The pill row is measured, not assumed.** Four pills fill a 390 px line to within six pixels, which is why ADR-051
    keeps the row to the views a trip is *worked* in. The third pill is right by that rule — the tasks are returned to
    across a trip rather than read once — and the row is checked at 360 px (UI-Test-Spec M25).
  * **Modes.** All three. The phase, the sections and the move are pure client-side rules (invariant 4) and work with
    no backend; what Local and Single-User Mode lose is the *who* of each stamp and the assignment, per G-8 above.
  * **Schema cost.** Four nullable columns on two tables, no CHECK, no NOT NULL, no change to an existing column — so
    the ADR-067 migration chain expresses all of them as `ALTER TABLE ADD COLUMN`.
  * **Surfaces:** M25 and its task sheet, M4 (the window, the section head, the close question), M8 (the phase chip), M1
    (it counts every task, per FR-7.6), M5 (where a preparation is declared). UI-Spec M25/M4/M8; E2E-M25-01…04,
    E2E-M4-141.


* **FR-7.8 (One tag per task, and the groups it makes, *built*):** M25 lists a trip's tasks and, past a handful,
  listing is not ordering. A task can carry exactly one tag; M25 groups by it by default, and a task can be moved
  between tags directly. The tradeoff is ADR-072.
  * **Their own tags** (`task_tags`), not the inventory's — variant B, chosen over sharing the `tags` axis. An item is
    filed by what it *is*, a task by what it is *about*, and the two words rarely coincide:
    *„Pflanzen giessen"* has no place among *Technik* and *Kleidung*, and the inventory's leftover bucket already
    holds 49 of 184 items (ADR-063). **Accepted cost:** the same word may exist in both lists. They never appear in
    one picker, so neither means the other.
  * **Exactly one, and none is one of the answers.** `comments.task_tag_id`, nullable, no join table: *at most one,
    never two* is the rule, and a set that may hold one element states its rule nowhere the database can see it. NULL
    is a real state — a task typed in a hurry has no tag.
  * **The untagged group is named after where the task came from**: a preparation
    that hangs off a packing row reads under ***Aus Packliste***, a chore of the trip under ***Ohne Tag***. Both are
    `task_tag_id IS NULL`; only the heading differs. **It is deliberately not a tag row**: as one it could be
    renamed, deleted, and hung on tasks that never came from a packing list, and the heading would then be false. As
    the name of an origin that cannot happen, and nothing has to seed it, protect it or keep it in step.
    * A group therefore **refuses what it could not honestly head**: *Aus Packliste* does not light up under a chore
      of the trip, and does not take it.
  * **The phase stays the outer split** (variant A): *Vor der Reise* and *Während der Reise* first, the tag groups
    inside each. „What is still open before we leave" remains one look, which is what M25 was built for (FR-7.7) —
    and the crossing between phases keeps a target to drag to.
  * **Dragging moves it, by the grip.** The group under the pointer says *hier ablegen* before the drop. **A movement
    may change the tag and the phase at once**, because a drop across both is what the reader meant, and the snackbar
    names it. Holding the row **selects**, as it does on the shopping list (FR-30.9), and only the grip drags
    (ADR-075).
  * **Several tasks at once (ADR-075)** — the task list looks and behaves like the shopping list. A hold on a task's
    words (500 ms, 8 px — `useLongPress`'s own values, so a finger can still scroll), a right-click or the app bar's
    icon selects, exactly as on M6; *„Alle N"* takes every open task shown, in both phases and of both kinds. The
    selection can be given **one tag** (the task sheet's own list, *no tag* included) or sent to **one phase**. Only
    what changes is written, one undo takes the whole batch back, and a batch that changes nothing says so. Both lists
    draw the selection, the grip and the grouped rows with the same client components, so the two cannot drift apart.
  * **An empty group is not drawn**, and is therefore not a target. Losing a tag is the task sheet's job — *Ohne Tag*
    is a choice in a list there, not a place to find. Bringing empty groups out when a task is lifted would move the
    list under the finger that had just lifted it (ADR-060).
  * **One undo for the whole movement** (FR-25.31). Tag and phase are written and taken back together: the undo
    record holds one action at a time, so arming a second would leave the first without a way home. A drop that
    changes nothing writes nothing and arms nothing — and the gesture still ends, which is a rule the drag composable
    carries rather than this screen.
  * **A tag is created where it is needed** — a word the picker does not have yet is the next tag, the way an item's
    tag is created in M10 rather than in a screen of its own. Any account may: task tags are instance-wide master
    data like `tags`, and Single-User and Local Mode have nobody to disagree.
  * **Modes.** All three. The grouping, the drag and the sheet are client-side; `task_tags` travels the master
    partition like every other shared list, and in Local Mode it lives in the same IndexedDB row store as everything
    else — a new syncable table is new *keys* there, not a new object store, so nothing had to be migrated.
  * **A deleted tag unassigns itself** and the tasks stay: `ON DELETE SET NULL`, where `item_tags` cascades. The
    difference is what the row is — there it *is* the assignment, here it is the task, and deleting the task would
    throw away the work. This is also why ADR-063's merge-instead-of-delete does not have to reach task tags.
  * **A task whose tag this device does not know reads as untagged**, under the group named after where it came
    from. It is not an error state and nothing says so: the master and trip partitions arrive through separate
    feeds, so a task can land before the tag it names — and when the tag arrives the task moves to it. Without the
    rule such a task matches neither pass and is **invisible while sitting in the data**, which is also what would
    happen on a device that never saw a tag's deletion, since `SET NULL` does not travel the change log.
  * **The portable format does not carry the tag**, exactly as it does not carry the phase (FR-7.7): `trip_tasks` is
    a list of words. An imported task arrives untagged and can be filed afterwards. Reading a tag out of a document
    that never stated one would be a claim, not an import — and `docs/backup.md` says so.
  * **Surfaces:** M25 (the groups, the drag, the sheet's tag list, the selection), M8 and M4 unchanged — the packing
    list's window is a handful of row-bound lines and has nothing to sort into. UI-Spec M25; E2E-M25-07/08/09/12.

* **FR-7.9 (Trip Notes — Written by One Traveller, Read by All, Ticked per Person, *built*):** a traveller can leave
  information for the others — a key-box code, a courier's phone number — that everyone reads and can tick off for
  themselves; the tick holds for the person who set it, not globally. The tradeoff is ADR-073. FR-7.13 makes notes
  threads.
  * **A note is information, not work.** It is a trip-level `comments` row — `trip_item_id` NULL, `is_task = 0` —
    the shape FR-7.1 allows. Author and time are stamped the same way a comment's are (invariant 3); sync, export and
    delete come with the table.
  * **The tick is per reader, not global** (ADR-073): `note_acks`, one row per (note, person). A whole-field
    `acked_by` column would let two people's concurrent ticks overwrite each other under NFR-4.2a's field-level
    merge — the same reason FR-7.4's tasks are a table and not a column. Un-ticking sets `acked` back to `0` rather
    than deleting the row; field-level LWW never deletes.
  * **"New for me" is derived, never stored** (`noteThreads`, `client/src/domain/tripNotes.ts`): "new" belongs to the
    thread, and a tick records how far it reached — a later entry by somebody else makes the thread new again
    (FR-7.13). Own notes are never new and never carry a tick — a tick on your own words would say nothing. The rule
    is the same shape as FR-7.3's open-prep derivation applied again.
  * **Where a note lives on the screen: a view of its own, M26** (FR-7.13), the fourth pill ADR-051 amendment 3 made
    room for — not a card above the packing list, which would compete with the list being worked.
  * **M1's one deliberate exception.** A *Neue Notizen* card lists threads with something new by others I have not
    ticked, across active trips, quoting each one's newest unseen entry, with its trip's name and **its own tick** —
    the words open the thread on M26, the tick is a control beside them. This is an exception to FR-7.4's *„M1 takes
    no actions"* for notes only: *„gesehen"* is exactly what one says at the dashboard, and what rules actions out
    there is an empty composer standing above every card, which a tick is not.
  * **Everyone sees who ticked a note, in the note's own sheet only** — never a line per note in the list, which
    would turn the list into a read-receipt board.
  * **Push.** A new note reaches every member but its author — a new `note` notification kind
    (`store.NotifyNote`), the same infrastructure a mention or a delegation already rides (FR-4.2's shape), but a
    genuine broadcast rather than a reuse: unlike a mention, a note needs no `@name` to reach the people it is for.
    Without it, nobody reads a time-sensitive code before it is needed.
  * **A phone number reads as a `tel:` link, and holding a press on the note copies it** — presentation only; the
    note stays plain text either way, and a short run of digits (a key-box code) is deliberately left untouched by
    the phone-number pattern.
  * **Not a secret store.** The note is stored in clear text, visible to every member and in the server export. It
    is a key-box code, not a password, and `docs/notifications.md`/`docs/backup.md` say so.
  * **Not in the portable backup** (NFR-4.11), like every task and shopping entry — neither the note nor its ticks.
  * **Modes.** Server: everything. Single-User: one account, so nothing is ever new and M1's card stays silent; the
    screen still works as a scratchpad. Local: no user id (`identityStore.myUserId` is null by design), same as
    Single-User, and no `note_acks` row is ever written — the tick control renders only where there is a reader to
    tell apart from the author, so this is not a separate guard, it falls out of the same rule that hides an
    author's own tick.
  * **Surfaces:** M26 (FR-7.13), M1 (the *Neue Notizen* card). UI-Spec M26/M1;
    E2E-M26-01/03, E2E-M1-14.
* **FR-7.10 (The dashboard once the packing is done, *built*; mockup
  `dev-docs/UI_Concept_DashboardAfterPacking.html`):** once the packing is declared finished (FR-5.10), the dashboard
  carries no *„Packen abgeschlossen“* line — it takes too much room for what it says. The phase is shown in the date
  line instead, and the freed room carries what is useful then: *how many tasks and shopping items* are open. The
  packing figures are not, because on that dashboard the packing is over. The tradeoff is ADR-074.
  * **No line; the phase is in the date line.** The hero and every trip card below it carry the trip's
    phase after the dates (*„12.–18. Okt 2026 · ● Vor Ort“*): a dot and one word — ***Vor Ort*** once the packing is
    declared finished (FR-5.10) and ***Packen*** until then — in `--jp-done` ink for the first and `--ct-subtext0` for
    the second. The word is the packing stamp (`isPackingClosed`) and **not** `listInFocus`: the dashboard's trips are
    all active, and `listInFocus` calls every active trip *Vor Ort*, which would put that word on a trip whose ring is
    still on screen. The two answers differ only for an active trip with open packing, where M6's tab is right to open
    at the destination and the dashboard is right to say the bag is still being packed.
  * **A day counter opposite the name**, on the hero: *„in 3 Tagen“* before the start, *„Abreise heute“* on the first
    day, ***„Tag 2 von 7“*** with *„noch 5 Tage“* beneath while the trip runs (both days count, so a trip 12.–18. Oct is
    seven days), *„Letzter Tag“* on the last, and nothing afterwards. The counter says *which day of how many*; the
    two edge days have their own words because *„Tag 7 von 7“* reads like a fault. A trip without an end date has no
    total (*„Tag 2“*), one without a start date has no counter. The count is a calendar-day difference in the device's
    own zone, never a duration in hours, so it does not change between 23:59 and 00:01 by a rounding.
  * **Two blocks in the hero, one for the tasks and one for the shopping** — shown once the packing is declared
    finished; while it is open the hero keeps the ring, FR-7.4's pair and FR-30.7's card exactly as they were. Each is a
    section of the hero's own card, headed by its name and the **open count in the numeric face** (*„12 offen“*; a
    done-role tick in place of the number when none is open):
    * **Aufgaben** lists the **next four** open tasks of the trip. A second line says what kind of task it is — its tag
      (FR-7.8), or the packing row it prepares (FR-7.6) — and in Server Mode the assignee's name follows it (FR-7.5), as
      it does on the overview card. **Order:** what is due — overdue, today, the next two days (FR-7.11) — leads,
      earliest first. The rest follow the phase in front of the trip first (*Während der Reise* while it runs, *Vor der
      Reise* before), then the other; inside a phase, in Server Mode mine before the rest, then M25's own order
      (`compareTasks`). An undated task is never shown as late: closing the packing moves it to *during* (FR-5.10).
      The block's composer writes *during* once the packing is finished, which is the only time the block is shown
      (FR-7.12). Single-User and Local have no assignee and no *„meine zuerst“* in the head.
      Below the rows, *„+ 8 weitere · alle Aufgaben ›“* names the remainder and leads into M25.
    * **Einkauf** lists the **next seven** open lines of the list that is *now* (`listInFocus`, FR-30.8) with the
      quantity on the second line, and *„+ 7 weitere · zur Einkaufsliste ›“* leads onto M6. Packing lines keep FR-30.7's
      *Packliste* tag. Seven, not FR-30.7's five: here the list is not a second object under the hero, and it is
      what the person came for.
    * **Both are workable in place** — the exception ADR-074 records. **Check-off on the right, and hard to
      miss**: the box is drawn 28 px inside a **56 × 52 px** target that runs to the card's edge, on a **52 px** row at
      body size 16. *Right, always*, in both blocks, and on M6 too where FR-30.9 already put it. A tick takes the row
      off the list and raises the app's snackbar with ***Rückgängig*** (the one M4 and M25 raise, through the same act,
      `useTaskActs`; the shopping block keeps FR-30.7's undo bar), so a mis-tap is a tap rather than a hunt: a list that
      shifts under the finger with no way back is the harm G-19 names for banners, and it is no less one here. A packing
      line is checked through FR-3.3, as FR-30.7 already had it.
    * **Both take an entry in place**: a field under the head, 48 px, with a ＋ of the same height; Enter or ＋ adds it
      and the field keeps focus for the next. The task goes to the phase in front of the trip (*„Aufgabe für
      unterwegs…“* while it runs, *„Aufgabe für vor der Reise…“* before — M25's own two labels); the shopping entry goes
      onto the list shown, as FR-30.1 says. A task typed here has no tag; that is set on M25.
    * **The confirmation names what was added and where**, in the app's quoting: ***„Milch“ zu Einkaufsliste
      hinzugefügt*** and ***„Post nachsenden“ zu Aufgaben hinzugefügt***. In an open block the new row also appears at
      the top, tinted for a moment, and the count moves. In a **folded** block only the count moves (with a short pulse)
      and the snackbar confirms — see below.
    * **Each block folds and unfolds**, by tapping its head (the arrow turns with it), **with a motion that shows it
      happening**: the rows glide shut over about 0.3 s while they fade, and the blocks below move up with them — no
      jump. `prefers-reduced-motion` gets no animation. A folded block keeps its head, the count and its field, and its
      rows are out of the tab order and the accessibility tree. **The state is remembered per block, on this device**
      (`lib/blockFold.ts`, the M9 property-sheet hint's precedent: a viewing preference, never synced), and both blocks
      start open. It is the person's choice, so it is not the trip's and is not in the partition.
    * **Adding to a folded block does not unfold it.** Whoever folded it did not want the list; and adding several
      things in a row is the ordinary case at a shopping list, where a layout that opens and pushes the field away makes
      the second entry a search. The evidence that it landed is the count and the snackbar, and the field stays focused.
      Rejected: unfolding on add.
    * **Empty is not absent.** A block with nothing open stays, because it is where the next entry is typed: the head
      carries the done tick, the field stays, and one quiet sentence replaces the rows — the ones M25 and M6 already
      say, by phase (*„Für unterwegs ist nichts notiert.“*, *„Vor Ort ist nichts zu kaufen.“*, *„Vor der Abreise ist
      nichts zu kaufen.“*). A planned trip with nothing to buy shows no shopping block, as FR-30.7 says.
    * **The way back to the packing list.** Without the ring the hero does not show the packing, and the list must
      stay one tap away — a row added after the packing was finished belongs there (FR-5.10). A full-width control under
      the blocks, ***Packliste öffnen ›***, 48 px high, leads to M4. The head of the card (dates, name, counter) leads
      into the trip.
    * **The hero is not one link** (FR-30.7's own rule: *the trip card is a link, and a card that can be worked is
      not*). The head — dates, name, meta and counter — is the link into the trip, the block heads fold their block and
      each block's *„weitere“* line leads where it says, and the check boxes, fields and the fold are controls; none is
      nested in another. The blocks are drawn as sections of the hero's card, not as sibling cards under it, and
      `TripHero` accepts them through its slot; **M1 does not import the shopping module** — the block is bound
      through `lib/tripCards.ts` (FR-30.3), which carries the contract for a slot in the hero.
    * **What does not change.** The trip cards below the hero keep their FR-30.7 shopping card and FR-7.4's one-line
      task summary; they carry no *„Packen abgeschlossen“* line, and carry the phase and, when the trip is running, the
      counter. **Two consequences on M1:** FR-7.6's *Aufgaben* overview card leaves the hero's trip out (the same tasks
      twice on one screen disagree the moment one is ticked), and the hero draws no preview of open packing rows — a row
      added after the packing was finished is one tap away under *Packliste öffnen*. No new table is written: a task is
      a `comments` row, an entry a `shopping_entries` row, and both travel their own partitions. **Three modes:** Server
      as above; Single-User has no assignee; Local has no network and needs none, and the per-user memory of the fold is
      the device's own there.
    * **Rejected:** three key figures (packed, left at home, open purchases) in a row — the metrics are of no use
      there, and the dashboard normally holds one trip; a done-tick after the name in place of the line; hiding an
      empty block, which would take the field with it; and a synced per-user fold state, which would follow the person
      to a second device — the fold is device-local. FR-30.7's chip per list is not in the shopping block, which reads
      the list in focus.

* **FR-7.11 (A task may name the day it is due, *built*, ADR-076):** beside its phase (FR-7.7), a task may carry a
  due date — optional, and a **day, never a time**:
  * **Set on the task's own sheet** (M25 and M4's window open the same one): a *Fällig* date field, the app's date
    control (ADR-035), with *Löschen* to take the date off again. Both kinds of task can carry one. A finished task
    offers no date field — its date says when it was meant, nothing is left to set. One field on the row
    (`comments.due_date`, `YYYY-MM-DD`), so a date set on one device and a tag on another both stand (NFR-4.2a).
  * **Four readings against the device's today:** ***Überfällig*** (the day has passed, a red pill), ***Heute***,
    ***Morgen*** / ***In 2 Tagen*** (*soon* — the next two days) and a short date further out (*„Fr., 17.7.“*).
    A resolved task is never overdue. The pill sits on the task's line on M25, in M4's window and in M1's block.
  * **Order.** Inside every M25 group the open tasks with a date come first, earliest first — which reads overdue,
    today, soon, later — and the undated ones keep FR-7.6's order after them. **A group holding an overdue, today or
    soon task moves above the others**, keeping the tag order inside both halves. M4's window leads with what is due;
    M1's block leads with the pressing ones ahead of FR-7.10's phase rule.
  * **The reminder.** The server sends a notification, kind `task_due`, **the day before and on the due day** — never
    again once the day has passed. Once a day at **`JITPACK_TASK_REMINDER_TIME`** (`HH:MM`, default **06:00**) in
    the server's own time zone (`TZ`). A server started after that time sends the day's reminders late rather than not
    at all, and never twice in a day (the day is claimed in `server_keys`). Tasks of an archived trip are history and
    are not reminded of. **Recipient:** the assignee (FR-7.5); a task nobody has been handed — or whose assignee has
    left the trip — goes to every member. The payload names the task and whether it is *today* or *tomorrow*; a tap
    opens M25. M17 carries a toggle for the kind (*Fällige Aufgaben*).
  * **Three modes.** FR-17.3's rule that a trip of fewer than two people stays silent **does not apply** here: it
    exists so nobody is told about their own act, and a reminder is nobody's act — so a **Single-User** instance is
    reminded too. **Local Mode** has no server: when the app opens, M1 says once, as a toast, ***„N Aufgaben fällig“***
    — the open tasks due by tomorrow, the overdue ones included, across the active trips; nothing when there are none.
  * Like every task, a due date is not in the portable backup (item 24).
  * The shopping list's own entries may carry a day too (FR-30.10); the same daily run reminds every member of a trip
    of them, as a kind of its own (`shopping_due`).

* **FR-7.12 (A finished packing closes *before the trip*, *built*, ADR-076):** FR-7.7 moves the open *before* tasks to
  *during* when the packing is closed. The shopping list follows, and *before* stays closed afterwards:
  * **The trigger is closing the packing** (FR-5.10), never a date: a person saying they are done, as FR-7.7 argued.
  * **In the same act**, every open purchase still *before departure* moves to ***Vor Ort*** — the packing rows in
    `buy_before` and the shopping list's own entries alike — and FR-5.10's confirmation names the number (*„2 offene
    Einkäufe wandern von „Vor der Abreise“ zu „Vor Ort“.“*). What was bought stays where it was bought (FR-25.11j).
    The close's one snackbar undo takes all of it back. The shopping list is a module (FR-30.3), so the packing side
    reaches its entries through a kernel contract the composition root binds (`lib/packingClose.ts`).
  * **Afterwards *before* is read-only**, as history. M25's *Vor der Reise* keeps its tasks and says why
    (*„Die Packliste ist abgeschlossen — hier steht, was vor der Reise erledigt wurde.“*); it has no field, its ticks do
    not move, nothing is handed over or removed there, nothing can be dragged into it, it is not in a selection and
    no batch or sheet offers a move into it. M6's *Vor der Abreise* keeps its bought reveal and says so
    (*„… diese Liste zeigt jetzt, was vor der Abreise gekauft wurde.“*); no field, no ＋, nothing put back. A new task
    asked for *before* — a row's preparation from M5, a group added late, a comment made a task — is written for
    *during*, and M5 does not offer *Vor der Abreise kaufen* for a row not already there.
  * **Reopening the packing lifts the lock** (FR-5.10) and moves nothing back: reopening is not an undo.
* **FR-7.13 (Trip notes are threads, *built*; mockup `dev-docs/UI_Concept_TripNoteThreads_variants.html`, reasoning
  in `dev-docs/trip-note-threads-concept.md`):** notes work like a forum: replies attach to a note, one level only; the
  first note may carry a title the overview shows; entries can be edited; a new note also shows on the dashboard; and
  when somebody else responds, everyone who took part is notified. It builds on FR-7.9 and changes only what the
  bullets below say.
  * **A thread is a first note with replies.** A reply is a `comments` row of the note shape with **`parent_id`** naming
    the thread's first note. It is written once — the server drops it from every later op, like `author_id` — and **one
    level is a server rule**: an insert naming a parent that is itself a reply, is not a note, or is another trip's is
    refused (`constraint_violated`), as is a reply that is a task or hangs off a packing row, because a `CHECK` cannot
    see another row. Deleting the first note deletes its thread (`ON DELETE CASCADE`, tombstoned like every cascade).
  * **A title, optional, on a first note only** (`comments.title`); the server drops it from a reply. Without one a
    thread is named by its first line — *„Pizza Bella 079 555 12 34"* is its own title.
  * **Only the author edits an entry**, in place from the entry's menu, the first note's title with it. An
    entry carries its author's name, and words changed by somebody else would still be signed by them — so the server
    refuses a change to a note's `body`, `title` or `edited_at` pushed by anybody else (`not_authorized`). A task's
    words stay everybody's. **`edited_at`** is named by the device, like `resolved_at`, because an edit happens offline
    too, and the entry says *bearbeitet*. An edit sends no push.
  * **Ordered by latest activity**: a reply lifts its thread. On the list a thread is one card that shows what is in
    it — its name, the first note's words, the newest reply with its writer, a *Neu* count — and opens the thread's
    **own view**. There the first note stands on top and the replies follow **in the order they were written**, with
    the reply field fixed at the bottom, so what I wrote still lands where I wrote it and the reading direction holds
    (concept §7b). Opening a thread is not seeing it: a divider marks where the new begins, and ***Gelesen*** is a
    labelled button there — FR-7.9's tick, which on a list would read as a task's checkbox.
  * **"New for me" belongs to the thread.** The tick is one `note_acks` row per (first note, person) and records how
    far it reached: **`seen_through`**, the stamp of the thread's newest entry when it was ticked. An entry by somebody
    else created or edited after that — or after the reader's own latest entry, since what I answered is behind me
    (replying is not ticking) — is unseen, and its count is the thread's *Neu* count. So a reply after my tick makes
    the thread new again, and **an edit by somebody else re-opens it**: a corrected key-box code must not go unseen by
    everyone who ticked the wrong one. A tick without a `seen_through` covers the first note as it was. Derived in
    `noteThreads` (`client/src/domain/tripNotes.ts`), never stored. A ticked thread keeps its place in the list; only
    its marker goes. My own thread can be marked read once somebody else has written in it.
  * **A view of its own, M26**, not a segment of M25: a note is not work, and a thread is a place people write in —
    ADR-051's revisit trigger. It is the fourth pill (`chatbubblesOutline`), which ADR-051 amendment 3's icon row made
    room for; its badge counts the entries new for me, never the total, in the colour a new thing wears (FR-21.21).
    M25 is one list.
  * **M1's *Neue Notizen* shows threads:** one row per thread with something new for me, up to three, the newest unseen
    entry first — the thread's name, then *„Chris: Danke! Parkplatz ist Nr. 12"* and *+n* when more are unseen, the
    trip, and the tick (FR-7.9, ticking through the newest entry). The words open that thread's view.
  * **Push.** A new first note: `note`, to every member but its author (FR-7.9). A reply: its own kind,
    **`note_reply`**, to the thread's **participants** — the first note's author and everyone who has replied, still
    on the trip, never the replier (a tick does not make a participant; it would subscribe a reader to the
    discussion). It has **its own switch** in the settings: a person who wants new codes need not want the discussion.
    Its sentence names the thread: *„Chris hat auf „Schlüsselbox“ geantwortet: …"*. A note's or a reply's notification
    opens its thread's view (`/trips/:id/notes/:threadId`).
  * **Modes.** Server: everything. Single-User: one author, so nothing is ever new and no push is sent; threads, titles
    and edits work as a scratchpad. Local: the same, and no `note_acks` row, as FR-7.9 has it.
  * **Not in the portable backup** (NFR-4.11), like FR-7.9's notes. Migration `006_note_threads.sql` adds the four
    columns; a database without them reads every note as a first note and every tick as reaching its first note.
  * **Surfaces:** M26, M1's card, the switcher (FR-21.21), M17's switch. UI-Spec M26/M1; E2E-M26-01..04, E2E-M1-14.
    ADR-073 and ADR-051 amendment 3 record the tradeoffs.

* **FR-7.14 (M25 arranged for use, *built*; decided from a UX review with rendered mockups):** the tasks screen's
  layout, built around G-20's selection, the due day and its pill (FR-7.11), the two phases (FR-7.7) and the closed
  *before* (FR-7.12). Pure client work: no schema, wire or server change.
  1. **What is due now leads.** A *Fällig* block on top holds every open task that is overdue, due today or in the next
     two days — FR-7.11's pressing states — **across both phases and every tag**, earliest first. A task in it
     **leaves its tag group** while it is there, so nothing is listed twice; its row names its tag instead. The block
     is not drawn when nothing is pressing. Rejected: a *by tag / by day* switch (one more control, and the drag between
     groups has nowhere to go in the day view), and keeping the groups with a *„2 fällig"* head (the pressing rows stay
     scattered). A task left open in a closed *before* is history and not in the block.
  2. **One composer on top, in M6's shape**, and the FAB the sibling lists carry, which focuses it. Its chips file the
     task as it is typed: the **phase** (*Vor der Reise* / *Unterwegs*), the **tag** and the **day** — *Heute*,
     *Morgen*, *Vor Abreise*, *Datum…*. One insert carries all three. Phase and tag stay chosen for the next task; the
     day does not. Rejected: an add sheet behind the FAB (M26's way — it covers the list while you write) and a
     composer per section moved to its top.
     * **From the trip's first day a task cannot be written *before* it**: the composer names no phase and writes for
       the road — the day the dashboard leads with the road's tasks (`taskPhaseInFront`), read by `hasDeparted` in
       `domain/tripDay.ts`. The phase chips are also gone once *before* is closed. An undated trip keeps both chips:
       it has no day to have passed. Only the composer: a task still standing in *before* may be moved or reworded
       until the packing closes it (FR-7.12).
     * **The tag dialog is the shopping list's.** The composer's *＋ Tag* opens **M6's entry sheet** for a task (*Neue
       Aufgabe*: the words typed so far, the day chips, the tag chooser and *Hinzufügen*), and the tag chooser — here,
       in the task sheet and in the selection's batch sheet — is **M6's search-or-create mask** (a search field, the
       chosen tag with its ✕, matching chips, a dashed *„… neu anlegen"*, a summary line). M6 shares M25's composer
       and reading (FR-30.11). **A task tag is drawn as its name alone** — no mark in the composer's chips, the group
       headings or the chooser, as a shopping tag has none; the `task_tags.icon` column stays, unread by the screen,
       and the dev seed sets none.
  3. **Two-line rows, no ✕.** The words, then under them the due pill, the row a preparation belongs to and the
     person. *Done* and *delete* as same-sized neighbours a finger-width apart invite the wrong tap; a task is removed
     from its sheet or from a selection. M4's compact window is unchanged.
  4. **After the packing is closed, *Während der Reise* comes first** and *Vor der Reise* is one folded line at the
     end — its lock line inside the fold — so the history does not stand above the live work with empty headings.
  5. **One *erledigt* fold per phase**, at the section's end, rather than one under every tag group.
  6. **The task sheet is ordered by how often each act is wanted**: the words are its title and are **edited in
     place** (one act, one undo; any member may reword a task — the author-only rule is a note's, FR-7.13);
     ***Erledigt*** is the primary button (*Wieder öffnen* on a finished task); then the due day as the same chips;
     then the tag (labelled *Tag*); the phase move as a secondary row; the facts; the removal last.
  7. **Local Mode and travellers.** A task's seat stays an account (G-8), though Local Mode names travellers on packing
     rows; letting a task name a traveller in every mode was the alternative, not taken.
  * **Alongside:** the selection's icon is its own glyph (`SELECTION_ICON`, `checkmarkDoneOutline`, on every list that
    selects), distinct from the *Aufgaben* pill's ☑ directly above it on M6 and M25; the selection's bar carries
    **Erledigt**, **Fällig** and **Löschen** (the trip's own tasks only) and offers a phase only where it would move
    something; and M4's task figure says what it counts, *„Beim Packen 0/2"*, so no two screens say *Aufgaben* with
    different numbers.
  * **Details:** *Vor Abreise* is the **day before the trip's start**, offered only for a task before the trip and
    only when that day is later than tomorrow (earlier it would duplicate *Heute* or *Morgen*, or be past); a phase
    chip in the composer reads *Unterwegs* rather than *Während der Reise*, to fit the row; the *Fällig* block wears a
    faint tint of the overdue ink; the phase button in the selection's bar reads *Unterwegs* for the same reason.
    M1's *Aufgaben* card is unchanged.
  * **Modes.** All three; nothing here reaches the server. The seat and *Meine* stay Server-only (G-8).
  * **Surfaces:** M25 (composer, *Fällig* block, rows, folds, closed *before*, sheet, selection bar, FAB), M4 (the
    figure's words; the task sheet it shares), M6/M9/M11/M23 (the select icon). UI-Spec M25/M4; E2E-M25-14..17,
    E2E-M25-01/03/06/12/13, E2E-M4-97/149.

### 3.9 Trip Feedback & Post-Trip Review

* **FR-9.3 (Capturing Trip Feedback Without Visiting Every Row, *built*):**
  An active trip is editable — adding something bought on the way, so that the next trip or
  template accounts for it, and marking packing elements as unused. The asymmetry between the
  two halves is the requirement.

  ***Missing* costs nothing.** It is stamped by the act itself: anything typed into the M4
  quick-add on an active trip is flagged (FR-5.6), so the user buys a travel adapter, adds it
  to the list because they want it packed, and the feedback is a by-product of a thing they
  wanted to do anyway. ***Unused*, through M5 alone, costs three taps per row and a decision to
  go looking**: open the row's sheet, unfold *Details* — a block whose subtitle reads *„Wer ·
  Beschaffung · Gepäck · Flags"* — and set a toggle. Nothing there asks for it, and twenty
  overpacked things are sixty taps at the moment the user is coming home. **And an
  `active`-only window would shut before the consequence is visible**: FR-9.2's assistant runs
  on the *archived* trip, so the first time anyone sees what a flag was worth, it could no
  longer be given or taken back.

  This matters more than a convenience: *unused* is the input FR-9.2 is built around
  (overpacking), and FR-14.3's long-term trends read the same column. A flag nobody sets is
  an assistant with nothing to assist and a trend line over an empty set.

  **The decision, three parts:**

  * **The judgement leaves the fold.** *ungenutzt* joins the row's **press-and-hold menu** in
    M4, next to FR-5.5's *„Nicht einpacken"* — the idiom this app already uses for a one-word
    judgement about a row, and one gesture from the list instead of three taps into a sheet.
    The M5 *Details* toggles stay as the spelled-out home, exactly the menu-plus-control pair
    FR-5.5 settled on (variants A + C there).
  * **A closing pass at the moment of archiving.** *„Reise abschliessen"* does not archive
    straight away: it puts **M4 into a review posture** listing the rows that were actually
    packed, each with a single *ungenutzt* toggle, and a way to finish without judging
    anything. This is where going through the trip once at the end lives, and it is the only
    point in the lifecycle where the user is thinking about the whole trip at once. **Packed rows
    only, deliberately:** an unpacked row is either FR-5.5-skipped — already a judgement, and the
    opposite one — or it was forgotten, and neither is *unused*. The pass is skippable and
    produces no flags when skipped; it must never become a gate in front of archiving. **Its
    door is M2's** (a ⋮ holds its own context, and the trip's lifecycle steps are the trip's,
    not the packing's): *„Reise abschliessen"* on the trip's row or hero opens M4 in the pass
    (`?closing=1`), and M2 offers no archive that goes round it.
  * **The window stays open on the archived trip.** FR-9.1's `active`-only gate does not apply
    to *unused*: the flag stays settable and revocable on an archived trip, because that is where M14 shows what it did.
    *Missing* keeps its automatic stamp and needs no manual path afterwards — a thing bought after the trip is not a
    thing that was missing on it. That the flags „only mean anything on a live trip" is true of *setting* them in the
    moment and false of *correcting* them, and the correction is the half the assistant makes visible.

  *Considered and rejected:* **a multi-select mode on M4** — a second selection model on the
  busiest screen of the app, carried year-round for a job done once per trip, and it would
  still have to be discovered; **inferring *unused* from behaviour** (packed but never
  touched) — the app cannot see use, and guessing here would feed FR-9.2 a fabricated opinion
  that the user then has to argue with; **asking one row at a time in a card stack** — FR-27.11
  rejected the stack for the same harvest, for the same reason: it hides how much is left.

  **Where the pass lives:** it is **a mode of M4 that archives and continues to M14**. The
  rendered pair (`UI_Concept_ClosingPass_variants.html`, built by
  `build-closing-pass-variants.mjs` with the prototype's stylesheet lifted verbatim, so no
  difference between the options can come from the CSS) set its own screen against a mode of
  M4, and neither wins outright — the chosen shape is a **third one**.

  **Why neither of the two:** a mode of M4 wins the question you ask first — at a hundred and
  twenty rows it brings the grouping, the FR-25.11 facets and the search, and none of that has
  to be built a second time — and loses the question you ask last, because it ends where it
  began, in the packing list of a trip that no longer exists. Its own screen is the mirror
  image: an endless single column, whose one virtue is that it has an **exit**, and the exit
  leads where the marks are going. So the mode keeps M4's rendering and takes the screen's
  ending: *„Fertig"* **archives the trip and opens M14**, rather than merely switching a mode
  off. A closing pass that hands you back the list you just finished with is not a closing
  pass.

  **What the choice costs, and the rule that pays it:** M4's row carries a press-and-hold
  (FR-5.5, and this FR adds *ungenutzt* to that same menu). **A screen asking one question
  offers nothing that answers another.** In the review posture the row has exactly one gesture
  — the tap, which marks — and press-and-hold is inert; the two menu entries are both reachable
  a second earlier, on the same rows, before the pass is entered. The posture also drops the
  quick-add row, the ＋ FAB, the FR-25.2 *„{n} Erledigte anzeigen"* reveal bar and the app-bar
  cluster's *Reise bearbeiten* and *Reise abschliessen* — the archive action, which would be
  offered from inside the room it opens. What stays is what the mode was chosen for (grouping,
  FR-25.11 facets, search). **The mark is a control of its own**: a button rendering straight
  off `flag_unused`, not a checkbox — that is M4's *packed* idiom, sitting beside rows whose
  subtitle reads „gepackt · heute", and an Ionic-owned checked state drifts from the row. G-3's
  padlock still wins over it.

  *Also rejected:* making the pass its own M-number for the sake of being unenterable by
  accident. It cannot be walked into either way — the only door is the archive action, and it
  is a door that asks.

  **Revisit trigger:** the pass is skipped every time. If it is, the pass asks the wrong
  question at the wrong moment, and the answer is not to make it harder to skip.

* **FR-9.4 (M14 With Real Proposals, *built*):** how the review assistant (FR-9.2) behaves with
  populated cards. The dev fixture (`reviewFixture.ts`) renders that state.

  * ***„Nie mehr fragen" is a worded button*, not an unlabelled ✕** — `aria-label` and `title`
    are no label at all on a phone, and it is the one consequential action on the screen:
    device-local and permanent. It follows FR-27.15's answer for the same kind of dismissal — a
    worded *„Ignorieren"* button, and *„Rückgängig"* on its sibling path — rather than a second
    grammar for „ask me no more".
  * **A handled card leaves the *Offen* block.** Handled rows stay visible rather than vanish
    (FR-27.11), under the outcome block, and *Offen* holds only what is open — so the heading's
    count and the cards under it agree, and nothing is counted in two blocks.
  * **The empty state is reachable by handling the proposals**: *„Nichts zu prüfen"* appears
    once nothing is open, not only after every proposal has been dismissed permanently.
  * **A handled proposal is one record line under *Erledigt***: kind, item, target group,
    outcome. The same card at reduced opacity would keep a target picker, a peek chevron and a
    blast-radius line for a decision already made. The block is a record of the pass, not a
    second workspace, which is what lets it hold twenty rows without becoming the screen.
  * **The snackbar never lands on the navigation bar.** Ionic's `positionAnchor` puts a bottom
    toast above a named element; deciding the anchor per screen makes it forgettable, so the
    decision lives in `client/src/lib/toast.ts` and every call site goes through it: a caller's
    own anchor still wins, and **a hidden tab bar counts as no tab bar** — Ionic measures a
    `display: none` anchor as a zeroed box and subtracts a whole viewport height from the
    offset, which throws the toast off screen instead of onto the bar. E2E-M22-09 asserts the
    geometry.

---

## Part C — Refined & New Non-Functional Requirements

* **NFR-4.2a (Conflict Resolution Strategy — refines NFR-4.2):** Offline conflicts are resolved with field-level
  Last-Write-Wins based on hybrid logical clocks, with two domain rules taking precedence: (1) terminal states win over
  transient states (*Packed* beats *Packing Now*), and (2) additive operations (comments, tasks, flags) are always
  merged, never overwritten. **A delete takes part in that ordering rather than standing outside it (ADR-052):** it is
  an all-fields decision, so a write only creates a deleted row again if it is strictly newer than the delete. An older
  one — the edit an offline device made before somebody else deleted the row — is refused with `row_deleted` instead of
  quietly undoing the delete, which is the same loss as an overwritten field with nobody told about it. Every automatic
  resolution is written to a conflict log surfaced in the UI so users can audit and manually revert. **The revert is an
  ordinary new mutation with a fresh server HLC, not an undo of the past** (ADR-023, Sync-API §6.1): it wins by being
  newer, it reaches every device through the normal change feed, it is refused where the merge rules of §6 outrank it
  (a `packing_now` restored onto a packed row) or where the row has since been deleted, and the log entry it acts on is
  marked spent rather than erased — the loss happened, and the record of it stays. **There is one log per sync
  partition**, not one per trip: a conflict belongs to the partition its mutation was pushed to, so a trip's own fields
  (name, dates, status) are audited and reverted on the master log rather than inside the trip. **Retention: nothing
  is compacted, and there is no permanent history record.** Archiving a trip touches no log; the entries live exactly
  as long as the trip does, because `conflict_log.trip_id` cascades on delete, and they stay individually actionable
  (which is what the revert above needs them to be). This matches the same absence Sync-API §4 records for
  `change_log` tombstones and the `mutations` memo: deliberate for a single-household instance, where the log is small
  enough that compaction would be machinery with nothing to do, and named here so the gap is a known cost rather than a
  promise the code does not keep. **Revisit trigger:** the log growing large enough that the M-screen listing it needs
  paging, or a second household on the instance.
  * **A database constraint is a merge decision, not a tidiness decision.** Because push is the only
    write path and a constraint violation comes back as a `rejected` mutation — which the client's outbox drops — **a
    CHECK or UNIQUE that can refuse a legitimate offline mutation destroys the user's change to buy an invariant.** So
    each candidate is decided one of three ways: enforce it in the schema (only where no legitimate push can reach it),
    enforce it on the authorization path where it can be a considered refusal with its own sentence, or state the rule
    and enforce nothing. The current answers: enforced in the schema are the one-Owner index (FR-4.5) and the
    instance-wide names of `templates`/`trip_series` (FR-1.6/FR-13.1, whose offline cost is written out there); enforced
    on the authorization path are the FR-27.6 scope guards; and deliberately unenforced are the skip's
    `state`/`quantity` pairing (FR-5.5) and the primary tag's position (FR-24.2), both of which were measured against
    the constraint and found to reject an ordinary push. The one-directional `comments` CHECK belongs to the same
    reasoning: a task must carry a state, because every todo row is rendered as open or resolved, but a *plain* comment
    carrying a leftover `task_state` is noise nothing reads — and the reverse CHECK that would tidy it away would refuse
    a demotion whose whole content is `is_task = 0`.
  * **The clock is a client value, and invariant 3 reaches it too.** Comparison is lexicographic
    (Sync-API §3), so a clock outside the format does not fail to sort — it sorts wherever its bytes fall, and one
    above `f` outranks every clock a device can generate. Stored, it wins that field's LWW for good: nobody, on any
    device, can ever write the field again, and no conflict is logged because nothing lost a comparison. The server
    therefore refuses a mutation whose `hlc` is not exactly what the generator would have written (`malformed_hlc`,
    Sync-API §5), the same way it refuses to take the client's word for who packed a row. It is a client bug rather
    than a user's mistake, so the copy says so, and the rest of the batch still applies.
  * **A conflict entry records a value that was overwritten**, not merely a field that lost the write. A push carries
    fields it did not change — an FR-2.7 date edit writes `start_date` and `end_date` together — and logging every one
    of them would offer entries reading `2026 → 2026` with a revert button for a value already in place, and answer the
    push `merged` rather than `applied`, which the client announces as overwritten fields to someone whose data no one
    touched. The merge compares values as well as clocks (Sync-API §6).
  * **„Field-level" means a clock per field, persisted** (`field_hlcs` beside `updated_hlc`, Sync-API §6, ADR-022):
    compared against the row's single clock, an offline pack would lose to any unrelated later edit of the same row.
    And rule (1) is exactly the pair it names — *Packed* beats *Packing Now*, nothing wider: between a pack made
    offline and a later deliberate unpack or skip (FR-5.5) the later decision stands and the pack is logged; letting
    every incoming *Packed* win regardless of clock would silently reverse later decisions and write no conflict. Each
    conflict entry also names the losing `mutation_id` and the `actor_user_id` who pushed it — the grouping a revert
    needs and the person it belongs to.
* **NFR-4.5 (Export & Backup):** The system provides a full instance export (all templates, items, trips, history) as
  versioned JSON via UI and CLI, plus a per-trip CSV export of the packing list. The deployment documentation includes a
  reference backup strategy suitable for home-lab operation.
* **NFR-4.6 (Self-Hosted Notification Architecture):** Push notifications (FR-6.2) must function without mandatory
  dependence on third-party cloud services. Web clients use standards-based Web Push with self-generated VAPID keys.
  Native mobile clients prefer UnifiedPush; FCM/APNs support is an optional, explicitly opt-in build configuration.
  In-app notifications over the existing WebSocket channel (FR-4.4) serve as the universal fallback. Not applicable in
  Single-User Mode (FR-17.3) — the detection does not run there at all, whatever the pushed rows say, because the mode
  and not the data is what decides it. A Web Push send is detached from the request that earned it but not from the
  process: shutdown drains the sends still in flight within its existing deadline, since the clients this reaches are
  by definition the ones the WebSocket fallback cannot (ADR-055).
* **NFR-4.7 (Import Robustness):** The import wizard (3.16) must tolerate real-world spreadsheet noise: merged category
  header rows, empty columns, trailing question marks in item names (imported as an attached open task per FR-7.2), and
  mixed-language labels. Imports are transactional: a failed import leaves no partial data behind. The trailing
  question mark becomes an item plus an open task on the trip row, and the wizard says so inline (UI-Spec M15 Step 2,
  E2E-M15-02). **The commit is an approximation of a transaction, not a transaction** (E2E-M15-04): the plan is
  validated in full before a single mutation is enqueued, parents precede children in the queues and replay is
  idempotent, but nothing rolls back and there is no progress indicator — there is no server-side transaction across a
  push batch to build one on, and Local Mode has no server at all. The approximation is the deliberate design and is
  recorded in `commitImport`'s own doc comment.
* **NFR-4.8 (Single-User Mode Independence):** Single-User Mode (3.17) must not require network access to an identity
  provider under any circumstance, including first boot — it is fully self-contained and works on a fresh, offline
  deployment.
* **NFR-4.9 (Public Exposure Guidance):** Because Single-User Mode performs no per-request authentication, the
  deployment documentation must state explicitly that such an instance must only be exposed to a network the operator
  trusts (e.g., home LAN, VPN/Tailscale) or protected by an additional layer — reverse-proxy Basic Auth or IP
  allowlisting — before being reachable from the public internet. The documentation must include at least one concrete,
  copy-pasteable example (e.g., a Caddy or Traefik Basic-Auth snippet) so operators are not left to work this out
  themselves.
* ~~**NFR-4.10** (demo rate limiting)~~ — retired with Demo Mode (see 3.17). The generic `rate_limited` error path in
  Sync-API Spec §9 remains available but is mandatory nowhere. The number must not be reused.
* **NFR-4.11 (Local Storage Durability):** Browser-managed storage is evictable under storage pressure. In Local Mode
  (3.19) the client must request persistent storage (`navigator.storage.persist()`) on first launch and surface a
  visible, non-blocking warning in the G-2 storage detail (FR-19.6) whenever persistence is not granted. Because there
  is no server copy, the storage detail must always offer a one-tap portable YAML export (FR-18.2/18.3) as backup, and
  the app shows an unobtrusive, dismissible export reminder when the last export is older than 30 days (configurable).
  That export is the *whole device* in one file, and the restore side is part of the requirement — a backup the app
  itself cannot read back is not a backup, which is why FR-18.4 accepts a multi-document file. The file also carries
  the FR-27.4 refresh state of every trip (see FR-18.3), so a restored device does not keep its Vorlagen and trips and
  start following them from zero. The storage figures are reported honestly: a browser that does not answer the
  Storage API produces "unknown", never a reassuring zero, and the eviction warning fires only where the browser *was*
  asked and said no. On native Capacitor builds, storage is app-scoped and durable; the persistence warning does not
  apply there, but the export reminder does. **What resets the reminder is the whole-device backup, and only that**
  (ADR-015, E2E-M17-07): M17's per-trip and per-template YAML downloads do not stamp `jitpack_last_export`, because
  exporting one trip must not clear the warning about everything the file does not hold. The banner is recomputed on
  entering M17 rather than by the export that clears it: the backup is taken on the G-2 sheet, another component, so a
  value read once at setup would go on warning for the rest of the session about a backup the user had just made.
* **NFR-4.12 (Internationalization, *accepted*):** The UI is fully localizable; no user-facing string is hard-coded.
  The shipped locales are **English and German**, with **English as the primary/default** and **German fully
  supported** — both ship in the MVP, neither is a stub. English-primary matches the code base, which is written in
  English, and makes German an addition rather than a rewrite. Locale is user-selectable and persisted device-local
  (like the theme, FR-21), defaulting to the browser locale when that is German and to English otherwise. Scope note:
  this is UI-string localization plus locale-aware date/number formatting; it does **not** imply localizing user
  *content* (item names, template names, comments stay as the user typed them). Additional locales are additive later.
  * **Notifications are localized too (ADR-037)** — both the in-app toast and the OS notification the service worker
    shows, which cannot import modules and cannot read `localStorage`. The wording is in the catalogue like every
    other string:
    `notifications/messages.ts` owns the *choice* — which body a kind renders with, and that a mention is about its
    preview while everything else is about its item — and `format.ts` renders it with `t()`. The worker's half is
    answered by an **IndexedDB mirror**: the app writes the finished templates for the active language into
    `jitpack-sw`/`meta`/`notifications` on boot and on every language change (one `watchEffect` in `App.vue`,
    deliberately not a call beside each `setLocale`), and `public/sw.js` reads them there, picks a body and fills its
    slots.
    Three costs taken on purpose:
    **The selection is written twice and the vocabulary is not.** A classic worker cannot import a module, so the four
    lines that pick a body exist in both files — but no sentence does, and `notifications/__tests__/workerBody.spec.ts`
    loads the worker source and drives both renderers over every kind in both languages, so a divergence is a red test
    rather than a comment nobody reads. The same spec refuses any notification wording reappearing in the worker.
    **One English sentence stays in the worker** — *„You have a new notification"* — for a device whose storage is
    denied or that receives a push before the app has ever run. It deliberately says nothing about *what* happened: a
    detail in a language nobody chose is worse than no detail, and the app says it correctly on open.
    **The actor fallback is a word, so it is translated too.** *„Someone mentioned you"* inside a German sentence is
    exactly the half-translated state this NFR exists to prevent, which is why `notify.actorUnknown` is a catalogue key
    rather than a literal default.
  * **No i18n dependency.** Localization is a small in-house module rather than
    `vue-i18n`. Justification per NFR-4.3 (footprint is first-class, standard library first): two locales need only key
    lookup, `{placeholder}` interpolation and a one/other plural rule, while locale-aware date/number formatting is
    `Intl`, built into every target browser — none of that warrants a dependency, and the same reasoning already
    rejected an XLSX parser (§3.16). The call shape is kept **`vue-i18n`-compatible** (`t('key', { n })`) so adopting
    the library later stays a swap of the module rather than a rewrite of every call site. **Revisit trigger:** a locale
    whose pluralization needs more than one/other forms, or a need for message-format features (gender, select, nested
    formats).
  * **Where the requirement stops: a product statement is localized, a technical diagnosis is not.** *„No
    user-facing string is hard-coded" is about the sentences the product speaks* — labels, hints, confirmations,
    notifications. It does not cover a diagnosis about a broken input, which is written for whoever has to fix the
    file and stays English. The ten parse errors of `client/src/domain/portable.ts`, rendered raw by M18, are the
    standing example. The boundary is also the cheap answer: `domain/` may not import `i18n/` (invariant 4,
    `scripts/domain-purity-gate.mjs`), so translating one of those errors means first turning it into a code the view
    resolves to a key — the `rejectionReasonKey` shape in `SyncDetailSheet.vue`. Two further texts are deliberately
    English for their own reasons, recorded above and in ADR-037: the worker's `FALLBACK_BODY`, and
    `manifest.webmanifest`'s description, which a static manifest cannot localize at all. M17's example server URL is
    a literal in a production template; its own label is a key.
* **NFR-4.1a (Durable Outbox — refines NFR-4.1, *accepted*):** In Server Mode the queue of mutations that have
  not reached the server is kept **on the device** (IndexedDB), not in the open document: it is written per mutation,
  removed when the server acknowledges it, and replayed at the next app start **before the first pull**, so a change
  made offline is never overwritten by the server's older copy of the same row. Replay is safe by the Sync-API's
  `mutation_id` memo (P-5), which the client serves by minting the id once, at enqueue, and storing it with the
  mutation. Two consequences the user sees, both in G-2: the queued-changes count belongs to the *queue* and survives a
  reload, and a change the server **permanently refuses** is taken out of the queue and kept as evidence rather than
  retried forever — one bad row must not stop a whole partition from syncing. A network failure and a server error are
  not refusals. What this deliberately does **not** add is a reconnect drain: the queue moves on the app's next own
  action or its next start, not on the browser's `online` event. Local Mode is unaffected — it has no outbox.
* **NFR-4.14 (One Checked Contract Between Client and Server, *built*):**
  The backend's HTTP surface is a **contract**, not a convention, and the frontend consumes it: it
  is described in one machine-readable place, the client's types are **derived from that
  description rather than written a second time by hand**, its error vocabulary is a shared
  enumeration rather than a string literal at each end, and its route shapes are predictable.
  **A contract that is not checked by the build is a comment**, so the acceptance test is a CI
  gate, not a document: a wire change that the client has not followed fails the pipeline rather
  than the next hand-test.

  **Why.** Types written twice and checked nowhere drift in exactly the shape both sides' test
  suites cannot see — a client reading a key no server sends, a pull cursor taken from the wrong
  field, one partition answering `500` where the other answers `rejected` — because a fake that
  agrees with its author agrees with the wrong thing just as happily. An error code spelled as a
  literal at both ends is kept in step by discipline, not by construction; per CODING_PRINCIPLES
  §4a a value compared against belongs in one named place, and the documented "serialization
  keys" carve-out covers the *keys*, not a vocabulary the client branches on. The error
  *envelope* — `writeError(status, code, message)` producing `{"error":{"code","message"}}`, parsed
  by `APIRequestError` on the client — is uniform and is kept as it is.

  **Scope boundary, stated because the phrase invites the other reading:** this is about the
  *contract*, not about moving work to the server. Invariant 4 stands — generation, dependency
  resolution, quantities, analytics, the review assistant, cloning and import stay in
  `client/src/domain`, because **Local Mode has no server** and moving any of them server-side
  silently removes a feature from a supported mode. Whether a particular rule belongs on the
  server is a separate question, to be asked per rule with that price written out, and this NFR
  does not open it.

  **The Go declaration is the source (ADR-026).** `internal/api/wire.go` is the one declaration of
  the sync envelopes, the WebSocket frame, the conflict-log shapes, every response body and the
  error vocabulary; `cmd/wiregen` writes `client/src/api/types.ts` from it, `make wire`
  regenerates, and `scripts/wire-contract-gate.sh` — in `make ci` and in the CI `go` job — fails
  the build when the checked-in file does not match. The error codes are `ErrorCode` constants in
  Go and a generated union plus a frozen `ERROR_CODE` object in TypeScript, so `writeError` cannot
  invent a code the client does not know and the screen that branches on one is checked rather
  than disciplined. OpenAPI was weighed and rejected: the failure being fixed *is* a hand-kept
  file that drifts, and adding a third artefact to keep in agreement is not an answer to it.
  Sync-API-Spec v1.3 stays the prose account of *why* the protocol behaves as it does; `wire.go` is
  the machine-checkable shape beside it. The generated types are also the truthful ones — a nil Go
  map or pointer marshals to `null`, so `row`, the WebSocket `payload` and a notification's
  `payload` are nullable, and the compiler holds every reader to a check.

  **The route shapes (ADR-027).** One rule, and it has no exception: **the path names the scope
  first, then the resource**; the master partition belongs to no trip, so its scope segment is the
  literal `master`; and **an export names its format** as the path's extension. So
  `GET/POST /trips/{id}/sync` and `/master/sync`, `GET /master/conflicts` beside
  `GET /trips/{id}/conflicts`, and `GET /me/export.json` beside `GET /trips/{id}/export.csv` — the
  full export lives under `/me` because it is filtered to what the caller may pull, which makes it
  the caller's export rather than the instance's. The sync endpoints follow the rule too: leaving
  the busiest pair as the one exception would keep the surface unpredictable in exactly the place
  it is read most. A path outside the rule **404s rather than aliasing** — with two spellings
  serving, nothing could tell whether the client had followed.

  **The paths are part of the contract.** `wire.go` declares every path as a `Route*` constant and
  every path variable as a `Path*` constant; the mux registers from them, and `cmd/wiregen` writes
  `client/src/api/routes.ts` from the same declaration, so the drift gate that holds the envelopes
  holds the paths. A path with no placeholder generates a string, one with placeholders a function
  whose parameters *are* the placeholder names — so an id cannot be forgotten and the two
  spellings of a path variable cannot come apart. Four AST rules hold the Go side: a declared route
  the mux does not serve, a route or a path variable taken from a literal instead of the
  declaration, and a placeholder no constant names. The version prefix stays spelled out on every
  line on purpose — the block is a table, and `/api/v2` is one pass over it.

  **Every response body is a declared type**, the admin overview, the notification list and its
  preference set, the instance config and the auth pair included; the client's copies are aliases
  of the generated ones. Two tests keep it closed, and the second exists because the first has a
  blind spot. `TestEveryResponseBodyIsADeclaredType` reads `internal/api`'s own AST and fails on a
  map literal handed to `writeJSON` or an encoder, so the next response cannot be added untyped —
  but it cannot see a map held in a *variable*, which is exactly what the preference handler does.
  `TestWire_NotificationPrefsNamesEveryKindTheStoreKnows` therefore holds the wire struct against
  `store.NotificationKinds()`: a notification kind added to the store fails the build instead of
  being persisted, honoured server-side and invisible on the wire. **A gate that overstates its
  reach is worse than one that names its limit**, so the limit is written in the test itself. The
  *request* body of the preference endpoint stays an untyped map on purpose: a missing key there
  means *leave that kind enabled*, and a struct would decode it as `false` and switch the kind off.

* **NFR-4.13 (Installable PWA & App Shell, *accepted*):** The web client is installable to the home screen
  (manifest with the Packed Backpack icon set incl. a maskable variant, `display: standalone`, the Apple tag set, a
  `theme-color` that follows the FR-21 flavour) and, once opened online, **starts without a network**: a service worker
  — the same script that carries NFR-4.6's push handlers — precaches the built bundle and answers navigations with the
  cached shell when the network is gone. The shell cache carries the *bundle only*, never data: `/api`, `/ws` and
  `/health` are never answered or cached by the worker, because sync consistency belongs to NFR-4.2a and `/health` must
  always tell the truth about the server. Registration happens unconditionally at app start (not only when push is
  enabled); on an insecure origin there is no service worker and no install offer, and the app runs as an ordinary
  website — plain-HTTP LAN instances stay supported. **Update policy:** a new version installs in the background and
  takes over on the next launch — never an **unprompted** reload; the running app announces it through the G-2
  indicator (dot on the glyph, sentence in the detail sheet), and the announcement carries an action that applies the
  waiting version immediately (FR-19.7, ADR-044). Nothing reloads on its own, and the worker's `install` handler never
  calls `skipWaiting()`; the only thing that shortens the wait is a press. Mechanism and tradeoff (hand-rolled worker
  vs. `vite-plugin-pwa`) are ADR-019. Applies to all three run modes; in Local Mode it means the app itself, not only
  its *data*, works without the network.

---

## Architecture-Phase Decisions (Resolved)

Every architecture-phase decision is recorded directly in its owning FR/NFR: deduplication default (FR-2.3a),
conflict log retention (NFR-4.2a), imbalance threshold (FR-10.3), suggestion algorithm (FR-14.2), attribute model
(FR-15.1), import granularity (FR-16.1), and Single-User→multi-user linking (FR-17.4, always-manual). No open decisions
remain in this document.
