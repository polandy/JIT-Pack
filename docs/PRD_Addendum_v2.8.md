# PRD Addendum (Consolidated): „JIT-Pack" — Extensions & Clarifications (v2.8)

**Document Status:** Accepted
**Supersedes:** Addendum v2.7 (adds Section 3.18: portable, human-readable YAML export/import for individual templates and trip packing lists, distinct from the full JSON backup of NFR-4.5 and the legacy spreadsheet import of 3.16; no other changes)
**Scope:** New functional sections 3.10–3.18, clarifications to existing FRs, and refined/added NFRs. Numbering continues the base PRD.

---

## Part A — New Functional Sections

### 3.10 Luggage Container Management

* **FR-10.1 (Container Entities):** Users can define luggage containers per trip (e.g., "Left Pannier", "Kids' Backpack", "Roof Box") with a name, type, an optional carrier (Traveler), and an optional maximum weight (in grams).
* **FR-10.2 (Item-to-Container Assignment):** Every item on an active packing list can optionally be assigned to exactly one container. Unassigned items appear in a dedicated "Unassigned" bucket to keep them visible.
* **FR-10.3 (Weight Budgets & Warnings):** The system displays the live cumulative weight per container and issues a visual warning when a container exceeds its maximum weight (e.g., airline baggage limit) or when paired containers (e.g., left/right pannier) diverge beyond a configurable imbalance threshold. **Default threshold: 15 % weight difference**, configurable per trip.
* **FR-10.4 (Analytics Integration):** Containers serve as the data source for the *Luggage Container* dimension defined in FR-8.2.

### 3.11 Return-Trip Mode (Repack)

* **FR-11.1 (Repack Trigger):** Before departure from the destination, any trip participant can activate *Return Packing Mode*. All items in mode PACK are reset to state *Open* for the return leg, while the original outbound packing history is preserved for the Post-Trip Review (FR-9.x).
* **FR-11.2 (Consumables Exclusion):** Items flagged as *Consumable* (FR-1.7) and items originally in mode BUY_LOCAL are excluded from the repack reset by default, with a per-item override.
* **FR-11.3 (Leave-Behind Check):** Repack Mode provides a dedicated checklist view ("Nothing left behind"), grouped by container and/or assigned Traveler, so rooms and vehicles can be cleared systematically.

### 3.12 Trip Cloning

* **FR-12.1 (Clone from Archive):** Users can duplicate any archived or completed trip as the basis for a new one. The clone includes all manual edits made to the original trip list (respecting the decoupling principle of FR-2.4). Within a Trip Series (FR-13.1), the most recent trip of the series is offered as the default clone source.
* **FR-12.2 (Clone Options):** During cloning, the user chooses whether to carry over (a) participant assignments, (b) packer delegations, and (c) container assignments. Dates are entered fresh; all quantity formulas are re-evaluated against the new trip duration.

### 3.13 Trip Series & Destination Profiles

* **FR-13.1 (Trip Series):** Trips can be assigned to a named *Trip Series* (e.g., "Samedan Summer", "Samedan Winter"). A series groups recurring trips to the same destination or of the same type and serves as the anchor for historical comparisons (3.14), attribute defaults (FR-15.1), and cloning defaults (FR-12.1).
* **FR-13.2 (Destination Profiles):** A series can carry a *Destination Profile* with persistent, destination-bound data: notes (e.g., "washing machine available"), local conditions, and reusable destination checklists.
* **FR-13.3 (Destination-Bound Shopping Lists):** Recurring BUY_LOCAL lists (e.g., a grocery list for a specific holiday location) can be stored on the Destination Profile and are automatically offered when a new trip in that series is generated.

### 3.14 Historical Quantity Insights

* **FR-14.1 (Per-Item History):** When generating or editing a trip within a series, the system displays each item's packed quantities from previous trips in the same series (e.g., "Underwear — 2024: 5, 2025: 6").
* **FR-14.2 (Smart Quantity Suggestions):** The system proposes a default quantity derived from the series history — **decided: the duration-normalized median of the last three series trips** — which the user can accept with a single tap or override manually at any time.
* **FR-14.3 (Long-Term Analytics):** Across the full trip history, the system can surface trends: most frequently forgotten items (Missing flags per FR-9.1), consistently unused items (Unused flags), and per-series weight development over the years.

### 3.15 Conditional Items & Trip Attributes

* **FR-15.1 (Trip Attributes):** Trips carry structured attributes beyond dates and participants. **Decided model:** a small fixed core — *Season* (summer/winter/transitional), *Transport Mode* (car, bike, plane, train), and *Accommodation Type* (hotel, holiday flat, camping) — plus user-definable free-form tags, both usable in conditional rules (FR-15.2) and formulas (FR-15.3). Attributes and tags are defined per trip and inherited as defaults from the Trip Series.
* **FR-15.2 (Conditional Inclusion Rules):** Template items support include/exclude conditions based on trip attributes (e.g., "Long underwear: only if season = winter"; "Bike repair kit: only if transport = bike").
* **FR-15.3 (Attributes as Formula Variables):** Trip attributes are available in quantity formulas (FR-1.3/FR-1.5), extending the variable catalog (e.g., `season`, `transport_mode`).

### 3.16 Data Migration & Import

* **FR-16.1 (Spreadsheet Import Wizard):** The system provides a guided import for CSV/XLSX files with the common legacy layout: rows = items (with category grouping), columns = trips with quantities. The wizard maps columns to historical trips within a series and rows to items in the central item database. **Decided:** the user selects which historical trip columns to import (not all-or-nothing), with a "select all" default already checked to keep the common case a single click.
* **FR-16.2 (History Preservation):** Imported trips are created as archived trips with their original quantities, so Historical Quantity Insights (3.14) work from day one — including up to a decade of pre-existing data.
* **FR-16.3 (Deduplication on Import):** The wizard detects near-duplicate item names across imports and existing master data and offers merge suggestions before committing.

### 3.17 Single-User Mode & Demo Mode

Single-User Mode and Demo Mode are two **orthogonal** declarative flags. Single-User Mode changes *authentication*; Demo Mode changes *persistence*. Demo Mode requires Single-User Mode to be enabled — a demo instance is, by definition, single-user — but Single-User Mode is fully usable on its own for permanent, real households.

**Single-User Mode (permanent use)**

* **FR-17.1 (Mode Toggle):** The instance can run in *Single-User Mode* via a declarative deployment flag (Section 2), set at startup and not changeable through the UI. This targets a genuinely single-person household that has no interest in operating an OIDC provider. Data is fully persistent, exactly as in normal mode — the only difference is authentication.
* **FR-17.2 (Authentication Bypass):** In Single-User Mode, OIDC/OAuth (Section 2) is fully disabled. No login screen is shown; the app auto-authenticates every request against one implicit local user, bootstrapped by the application itself on first start with a default display name ("Demo User"), freely editable thereafter per FR-17.13. This is a local bootstrap, distinct from the OIDC JIT-provisioning of Section 2 — the row is identified by a dedicated `is_local_singleuser` marker, not by pattern-matching a reserved string in `oidc_subject`, so a genuine OIDC subject can never collide with or be mistaken for it, however the IdP happens to format subject claims.
* **FR-17.3 (Collapsed Multi-User Model):** Multi-user constructs stay in the data model unchanged — trip sharing, roles (FR-4.5), and the Traveler/User/Packer separation (FR-2.5/FR-4.2) are not removed, so an instance can be upgraded later without a schema migration — but they are inert and hidden in the UI: the implicit user is automatically the Owner and Packer of every item and trip. Delegation, presence indicators, and push notifications (FR-6.2) are disabled since there is no second party to notify or delegate to.
* **FR-17.4 (Non-Destructive Upgrade Path):** An operator can switch a running instance from Single-User Mode to normal OIDC mode without data loss: on first OIDC login, the operator links the newly JIT-provisioned account to the existing implicit user (one-time manual confirmation, clearing the `is_local_singleuser` marker and attaching the real `oidc_subject`), after which sharing, roles, and notifications become active for that account and any additionally invited users.
* **FR-17.5 (Multi-Device Sync Unaffected):** Single-User Mode does not restrict sync to one device. The sole user can run the app on multiple devices (e.g., phone and tablet); each installation keeps its own randomly generated HLC device id, and the standard pull/push protocol (Sync-API Spec §3) applies completely unchanged — Single-User Mode only removes the *second person*, not multi-device use by the one person. No special-casing of the sync or merge layer is needed or permitted for this mode.
* **FR-17.11 (Auth Layer Behavior):** In Single-User Mode, the API's authentication middleware is bypassed at the deployment level, not per-request: requests need not carry a bearer token, and the server attaches the implicit user's id to every request context directly before it reaches trip-membership and permission checks (FR-4.5), which otherwise run unmodified. This is a startup-time configuration, never a runtime or per-request toggle, keeping the security model simple to audit.
* **FR-17.13 (Editable Profile — Display Name & Picture):** In Single-User Mode, the user may freely customize how they appear throughout the app (dashboard greeting, "Packed by" avatar, presence facepile per FR-4.6, etc.), editable at any time via Settings (M17):
  * *Display name:* up to 50 characters, restricted to `[A-Za-z0-9._-]` (no spaces or other punctuation); validated client- and server-side; the startup default ("Demo User") is simply the initial value of this same editable field, not a separate concept.
  * *Profile picture:* the user selects a source photo and positions a circular crop over it (pan/zoom); the client then renders the selected region to a **256×256 px square JPEG (quality ≈ 0.8)** on an offscreen canvas and uploads that — the user is never asked about resolution, format, or file size. The circular presentation is a CSS mask applied at display time (`border-radius: 50%`); the stored asset itself stays a plain square, keeping the format simple and avoiding an alpha channel. **Server-side hard limits (defense in depth, enforced independently of client behavior):** the upload must be JPEG and ≤ 100 KB, checked at the database layer via a `CHECK` constraint, not by a resizing library — non-conforming uploads are rejected outright (client is expected to already conform; no server-side re-processing). The avatar is never displayed above ~96×96 CSS pixels anywhere in the UI, so 256 px storage comfortably covers even high pixel-density displays without over-provisioning.
  This customization is scoped to Single-User Mode; how (or whether) avatars are sourced for OIDC-managed users is out of scope for this addendum.

**Demo Mode (ephemeral, evaluation only)**

* **FR-17.6 (Demo Toggle, Requires Single-User Mode):** *Demo Mode* is a second declarative flag, valid only in combination with Single-User Mode. The instance rejects startup with a configuration error if Demo Mode is enabled while Single-User Mode is not — this guards against ever accidentally wiping a real multi-user deployment's data (FR-17.9).
* **FR-17.7 (Seeded Example Data):** On (re-)start with Demo Mode enabled, the instance seeds one example trip using the Base Travel template so the demo is immediately explorable without manual setup.
* **FR-17.8 (Periodic Reset):** Demo Mode periodically discards all data and re-seeds it: a full wipe (drop and recreate the database file) rather than selective cleanup. Both trigger modes are supported and configurable: a scheduled interval (**default: nightly**, for a long-running public demo) and reset-on-every-process-restart (useful for ephemeral container orchestration). Because the reset is a full recreation, no per-entity cleanup logic is required in the application.
* **FR-17.9 (Fail-Safe Isolation):** Demo Mode must never be combinable with normal OIDC mode; the reset job itself refuses to run if any user row lacks the `is_local_singleuser` marker (FR-17.2) — i.e., if a real OIDC account exists — as a second independent guard beyond the startup check in FR-17.6.
* **FR-17.10 (In-App Reset Notice):** While Demo Mode is active, the UI shows a persistent, dismissible-per-session banner stating that data resets periodically and will not be retained, so evaluators are not surprised by disappearing trips.
* **FR-17.12 (Optional Demo Access Passphrase):** Demo Mode may additionally require a single shared passphrase, configured via one environment variable and checked by a lightweight middleware ahead of every API request. This is deliberately not a user-account system — no per-user credentials, no registration, no password reset flow — and therefore does not conflict with the no-internal-password-database principle of Section 2; it is a coarse gate (comparable to a locked door's shared key), not an authentication system. Disabled by default; recommended whenever a Demo Mode instance is reachable beyond a trusted network.

---

### 3.18 Portable Template & Trip Export/Import

* **FR-18.1 (Human-Readable Format):** Templates (FR-1.2) and individual trip packing lists can be exported to, and imported from, a single **YAML** file — deliberately distinct from the full-instance JSON backup (NFR-4.5), which is optimized for disaster recovery, not for a person to open and read. A portable export is meant to be opened in a plain text editor, understood at a glance, and hand-edited if desired.
* **FR-18.2 (Template Export):** Any template the user owns or has forked (FR-1.6) can be exported as one YAML file capturing its items, quantity formulas, assignment types (FR-1.4), conditions (FR-15.2), and per-item defaults. The file is environment-agnostic — no user IDs, no owner, no instance-specific identifiers — so it can be shared (e.g., posted in a forum, emailed to a friend) and imported into a completely different JIT-Pack instance. Example shape:
  ```yaml
  kind: template
  schema_version: 1
  name: Base Travel
  items:
    - name: Toothbrush
      quantity: "1"
      assignment: per_person
      unit: pieces
    - name: Sunscreen
      quantity: "ceil(trip_duration / 7)"
      unit: pieces
      conditions:
        season: [summer]
  ```
* **FR-18.3 (Trip Export):** A trip's packing list (active or archived) can be exported the same way: item names, quantities, and packed state, with containers and traveler assignments referenced **by name**, not by internal database id, since those ids are meaningless on a different instance. The user chooses whether to include current pack progress or export a "clean" (unpacked) list.
* **FR-18.4 (Round-Trip Import):** Importing a previously exported file reconstructs it against the local item database (FR-1.1), matching items by name and offering the same merge/near-duplicate prompts as FR-16.3 whenever a name is ambiguous. Importing a template creates a new, private, owned template (FR-1.6); importing a trip creates a new trip in *planning* status — this is distinct from the legacy spreadsheet import (FR-16.2), which explicitly creates *archived* historical trips.
* **FR-18.5 (Format Stability):** Every exported file carries an explicit `schema_version` field. Imports ignore unrecognized fields rather than failing outright, so a file exported by an older or newer app version remains importable.
* **FR-18.6 (Distinct from Full Backup):** This format is explicitly not a substitute for the full-instance backup (NFR-4.5): it captures exactly one template or one trip's packing list, with no user accounts, sync metadata, or conflict history — it exists for sharing and portability, not disaster recovery.

## Part B — Clarifications & Extensions to Existing Sections

### 3.1 Template & Master Data Management

* **FR-1.5 (Formula Variable Catalog):** Quantity formulas (FR-1.3) support a defined, documented set of variables: `trip_duration`, `num_travelers`, `num_adults`, `num_children`, the trip attributes per FR-15.3, plus the rounding functions `ceil()`, `floor()`, and `round()` (e.g., `ceil(trip_duration / 2)`). Formulas are validated at template save time; invalid formulas cannot be persisted.
* **FR-1.6 (Template Ownership & Scope):** Templates are owned by a single user account. Owners can optionally publish a template instance-wide in read-only mode; other users consume it by reference or fork a private copy. The Review Assistant (FR-9.2) writes optimizations only to templates owned by the confirming user; for shared templates it offers to fork instead.
* **FR-1.7 (Consumable Flag):** Items in the central item database support an optional *Consumable* attribute, consumed by Repack Mode (FR-11.2) and excludable from return-weight analytics.
* **FR-1.8 (Quantity Units):** Items support a quantity unit: *pieces* (default), *pairs*, or *per-day consumable* (e.g., contact lenses at 1/day yielding 30 for a 30-day trip via `trip_duration * rate`). Units are displayed throughout packing views and analytics.

### 3.2 Trip Management

* **FR-2.3a (Deduplication Default — refines FR-2.3):** The default merge strategy for overlapping items across templates is *maximum value* (the larger of the two quantities wins), with an override configurable per item category (e.g., always *sum* for consumables like sunscreen, always *max* for durable gear).
* **FR-2.5 (Traveler vs. User Separation):** The system strictly distinguishes between a *Traveler* (a trip-level record with name and profile type *Adult*/*Child*) and a *User* (an OIDC-provisioned account per Section 2, or the implicit local user per FR-17.2). A Traveler can optionally be linked to a User account; Travelers without accounts (typically children) are fully supported. All *Assigned to* references (FR-4.2) point to Travelers; all *Packed by* references point to Users.

### 3.4 Multi-User & Collaboration

* **FR-4.5 (Roles & Permissions):** Trip sharing (FR-4.1) supports two roles: *Owner* (full control: edit trip metadata, add/remove participants, delete items, archive the trip, confirm Review Assistant write-backs) and *Collaborator* (edit item states, self-assign, delegate, comment, create tasks, flag items per FR-9.1). A trip has at least one Owner; ownership is transferable. In Single-User Mode (3.17) this model is present but inert — see FR-17.3.
* **FR-4.6 (Trip Presence Indicator):** While viewing an active trip, users see who else is currently present on the same trip (sourced from the real-time channel of FR-4.4) and a best-effort indication of whether the group is caught up to the latest state. This is an advisory UI signal only (UI-Spec G-10) — it never gates or blocks any packing action, and it says nothing about devices that are fully offline rather than simply idle.

### 3.5 Packing Workflow

* **FR-5.4 (Partial Quantities):** Items with a quantity greater than 1 track a `packed_count` (e.g., 3 of 5 socks). The item state is derived: *Open* (0 packed), *Partially Packed* (0 < packed < quantity), *Packed* (packed = quantity). The quick actions of FR-5.2 increment the count; a long-press completes the item in one step. *Packing Now* and collision locking (FR-5.3) apply at the item level regardless of partial progress.
* **FR-5.5 (Considered & Skipped State):** Items whose resolved quantity is 0 — whether by formula, conditional rule (FR-15.2), or manual decision — remain visible in a collapsed "Consciously skipped" section of the trip list instead of being removed. Each skipped item can be reactivated with a single tap (swipe-to-unskip restores to open state with quantity 1). This preserves the decision log and prevents silent omissions. **Clarification:** users can also explicitly skip an item via swipe action in M4, setting its state to `skipped` and quantity to 0 — distinguishing "deliberately left behind" from "forgot to pack."
* **FR-5.6 (Inline Quick-Add in Packing List):** While working in the packing list (M4), the user can add new items directly via an inline input field without navigating away. The input provides autocomplete suggestions from the master item inventory (FR-1.1), reusing the selected item's metadata (weight, value, category). Free-text entry creates a new ad-hoc trip item. If the trip is in active status, newly added items are automatically flagged as *Missing* (FR-9.1). The input stays expanded after adding an item for rapid sequential entry. This removes the friction of switching context during the packing workflow.

---

## Part C — Refined & New Non-Functional Requirements

* **NFR-4.2a (Conflict Resolution Strategy — refines NFR-4.2):** Offline conflicts are resolved with field-level Last-Write-Wins based on hybrid logical clocks, with two domain rules taking precedence: (1) terminal states win over transient states (*Packed* beats *Packing Now*), and (2) additive operations (comments, tasks, flags) are always merged, never overwritten. Every automatic resolution is written to a per-trip conflict log surfaced in the UI so users can audit and manually revert. **Retention:** conflict log entries persist until the trip is archived, at which point they are compacted into the trip's permanent history record rather than kept as individually actionable rows.
* **NFR-4.5 (Export & Backup):** The system provides a full instance export (all templates, items, trips, history) as versioned JSON via UI and CLI, plus a per-trip CSV export of the packing list. The deployment documentation includes a reference backup strategy suitable for home-lab operation.
* **NFR-4.6 (Self-Hosted Notification Architecture):** Push notifications (FR-6.2) must function without mandatory dependence on third-party cloud services. Web clients use standards-based Web Push with self-generated VAPID keys. Native mobile clients prefer UnifiedPush; FCM/APNs support is an optional, explicitly opt-in build configuration. In-app notifications over the existing WebSocket channel (FR-4.4) serve as the universal fallback. Not applicable in Single-User Mode (FR-17.3).
* **NFR-4.7 (Import Robustness):** The import wizard (3.16) must tolerate real-world spreadsheet noise: merged category header rows, empty columns, trailing question marks in item names (imported as an attached open task per FR-7.2), and mixed-language labels. Imports are transactional: a failed import leaves no partial data behind.
* **NFR-4.8 (Single-User Mode Independence):** Single-User Mode (3.17) must not require network access to an identity provider under any circumstance, including first boot — it is fully self-contained and works on a fresh, offline deployment. This applies whether or not Demo Mode is layered on top.
* **NFR-4.9 (Public Exposure Guidance):** Because Single-User Mode and Demo Mode perform no per-request authentication, the deployment documentation must state explicitly that such an instance must only be exposed to a network the operator trusts (e.g., home LAN, VPN/Tailscale) or protected by an additional layer — reverse-proxy Basic Auth, IP allowlisting, or the optional passphrase of FR-17.12 — before being reachable from the public internet. The documentation must include at least one concrete, copy-pasteable example (e.g., a Caddy or Traefik Basic-Auth snippet) so operators are not left to work this out themselves.
* **NFR-4.10 (Demo Rate Limiting):** A public Demo Mode instance is expected to receive uncoordinated, potentially abusive traffic. The `rate_limited` error path (Sync-API Spec §9) must be enabled by default whenever Demo Mode is active, with conservative default thresholds, even in configurations where rate limiting is otherwise optional.

---

## Architecture-Phase Decisions (Resolved)

All decisions originally listed as open here have been resolved and are now recorded directly in their owning FR/NFR: deduplication default (FR-2.3a), conflict log retention (NFR-4.2a), imbalance threshold (FR-10.3), suggestion algorithm (FR-14.2), attribute model (FR-15.1), import granularity (FR-16.1), and Single-User→multi-user linking (FR-17.4, always-manual — already specified there since v2.0). No open decisions remain in this document.
