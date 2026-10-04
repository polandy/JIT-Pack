# PRD Addendum (Consolidated): „JIT-Pack" — Extensions & Clarifications (v2.10)

**Document Status:** Accepted
**Scope:** New functional sections 3.10–3.23 (accepted) plus **3.24 (built, item tags & master-item lifecycle)**,
**3.25 (built, packing-screen M2/M4/M5/M6/M8 refinements)** and **3.26 (proposed and parked, calendar-reminder
iCalendar subscription — Variant B)**, **3.27 (accepted, template composition)**, **3.28 (built, one emoji mark per
item)**, **3.30 (accepted, the shopping list as a module of its own)**, **3.31 (built, excursions — a small
packing list inside a trip)** and **3.33 (built, the meal plan)**, clarifications to existing FRs, and
refined/added NFRs (incl. **NFR-4.12 i18n, accepted**). Numbering continues the base PRD; a retired FR/NFR number
keeps a removal stub and is never reused.
**Forward direction (non-binding):** A north-star expansion of the product beyond packing — into a full family vacation
companion (idea board, scheduling, live during-trip collaboration) — is captured in `Vision_NorthStar_v1.0.md`. It adds
no FRs/NFRs here and does not change any scope below; clusters graduate into numbered sections only when picked up, and
packing ships first.

## Sections

One file per section, named by its number, so a change to §3.29 reads `3.29-*.md` and nothing else.
Part A holds the new functional sections (3.10 on), Part B the clarifications to the base PRD's
sections (3.1–3.9), Part C the non-functional requirements.

| Section | File |
|---|---|
| 3.10 Luggage Container Management | [`3.10-luggage-container-management.md`](3.10-luggage-container-management.md) |
| 3.11 Return-Trip Mode (Repack) — **REMOVED** | [`3.11-return-trip-mode.md`](3.11-return-trip-mode.md) |
| 3.12 Trip Cloning | [`3.12-trip-cloning.md`](3.12-trip-cloning.md) |
| 3.13 Trip Series & Destination Profiles | [`3.13-trip-series-destination-profiles.md`](3.13-trip-series-destination-profiles.md) |
| 3.14 Historical Quantity Insights | [`3.14-historical-quantity-insights.md`](3.14-historical-quantity-insights.md) |
| 3.15 Conditional Items & Trip Attributes | [`3.15-conditional-items-trip-attributes.md`](3.15-conditional-items-trip-attributes.md) |
| 3.16 Data Migration & Import | [`3.16-data-migration-import.md`](3.16-data-migration-import.md) |
| 3.17 Single-User Mode | [`3.17-single-user-mode.md`](3.17-single-user-mode.md) |
| 3.18 Portable Template & Trip Export/Import | [`3.18-portable-template-trip-export.md`](3.18-portable-template-trip-export.md) |
| 3.19 Local Mode (Backend-Free Operation) | [`3.19-local-mode.md`](3.19-local-mode.md) |
| 3.20 Item Dependencies ("Companion Items") | [`3.20-item-dependencies.md`](3.20-item-dependencies.md) |
| 3.21 Theming (Dark Mode Default) | [`3.21-theming.md`](3.21-theming.md) |
| 3.22 Item Images | [`3.22-item-images.md`](3.22-item-images.md) |
| 3.23 Instance User Management | [`3.23-instance-user-management.md`](3.23-instance-user-management.md) |
| 3.24 Item Tags & Master-Item Lifecycle | [`3.24-item-tags-master-item.md`](3.24-item-tags-master-item.md) |
| 3.25 Packing-Screen Concept Refinements (M2 / M4 / M5 / M6 / M8) | [`3.25-packing-screen-concept-refinements.md`](3.25-packing-screen-concept-refinements.md) |
| 3.26 Calendar Reminders (iCalendar Subscription) | [`3.26-calendar-reminders.md`](3.26-calendar-reminders.md) |
| 3.27 Template Composition ("Gruppen"), Trip→Template Round-Trip & Planning-Trip Refresh | [`3.27-template-composition-trip-template.md`](3.27-template-composition-trip-template.md) |
| 3.28 Item Marks (One Emoji per Item) | [`3.28-item-marks.md`](3.28-item-marks.md) |
| 3.29 The Planner — Ideas, Votes and a Day Plan Inside a Trip | [`3.29-planner.md`](3.29-planner.md) |
| 3.30 The Shopping List as a Module of Its Own | [`3.30-shopping-list-module.md`](3.30-shopping-list-module.md) |
| 3.31 Excursions — A Small Packing List Inside a Trip | [`3.31-excursions.md`](3.31-excursions.md) |
| 3.32 The Activity Log — Who Changed What | [`3.32-activity-log.md`](3.32-activity-log.md) |
| 3.33 The Meal Plan — What the Family Eats, Day by Day | [`3.33-meal-plan.md`](3.33-meal-plan.md) |
| 3.1 Template & Master Data Management | [`3.1-template-master-data-management.md`](3.1-template-master-data-management.md) |
| 3.2 Trip Management | [`3.2-trip-management.md`](3.2-trip-management.md) |
| 3.4 Multi-User & Collaboration | [`3.4-multi-user-collaboration.md`](3.4-multi-user-collaboration.md) |
| 3.5 Packing Workflow | [`3.5-packing-workflow.md`](3.5-packing-workflow.md) |
| 3.6 Notifications & Delegation | [`3.6-notifications-delegation.md`](3.6-notifications-delegation.md) |
| 3.7a Preparation Todos | [`3.7a-preparation-todos.md`](3.7a-preparation-todos.md) |
| 3.9 Trip Feedback & Post-Trip Review | [`3.9-trip-feedback-post-trip.md`](3.9-trip-feedback-post-trip.md) |
| Part C — Refined & New Non-Functional Requirements | [`nfr.md`](nfr.md) |
## Architecture-Phase Decisions (Resolved)

Every architecture-phase decision is recorded directly in its owning FR/NFR: deduplication default (FR-2.3a),
conflict log retention (NFR-4.2a), imbalance threshold (FR-10.3), suggestion algorithm (FR-14.2), attribute model
(FR-15.1), import granularity (FR-16.1), and Single-User→multi-user linking (FR-17.4, always-manual). No open decisions
remain in this document.
