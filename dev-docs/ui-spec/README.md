# UI Specification: „JIT-Pack" — Screens & Interaction Design (v1.10)

**Document Status:** Proposed for Review
**Basis:** Base PRD + Addendum v2.10 (Consolidated)

**Platform Targets:** Mobile-first (Capacitor iOS/Android), responsive web — mobile is the primary design target, but
every screen must remain fully and comfortably usable on desktop (G-9). All screens must function fully offline
(NFR-4.1); sync state is surfaced globally, not per screen.

## Files

One file per screen (`M04-*.md` is M4) and one for the global patterns G-1 to G-20.

| Section | File |
|---|---|
| 0. Global Patterns | [`global-patterns.md`](global-patterns.md) |
| M1 — Dashboard "My Tasks" | [`M01-dashboard-my-tasks.md`](M01-dashboard-my-tasks.md) |
| M2 — Trip List | [`M02-trip-list.md`](M02-trip-list.md) |
| M3 — Trip Creation Wizard | [`M03-trip-creation-wizard.md`](M03-trip-creation-wizard.md) |
| M4 — Packing List (Trip Detail) — *core screen* | [`M04-packing-list.md`](M04-packing-list.md) |
| M5 — Item Detail (Bottom Sheet) | [`M05-item-detail.md`](M05-item-detail.md) |
| M6 — Shopping Views | [`M06-shopping-views.md`](M06-shopping-views.md) |
| M7 — Template List | [`M07-template-list.md`](M07-template-list.md) |
| M8 — Template Editor | [`M08-template-editor.md`](M08-template-editor.md) |
| M9 — Item Inventory | [`M09-item-inventory.md`](M09-item-inventory.md) |
| M10 — Item Editor | [`M10-item-editor.md`](M10-item-editor.md) |
| M11 — Container Management | [`M11-container-management.md`](M11-container-management.md) |
| M12 — Analytics | [`M12-analytics.md`](M12-analytics.md) |
| M13 — Repack Mode — **REMOVED** | [`M13-repack-mode.md`](M13-repack-mode.md) |
| M14 — Post-Trip Review Assistant | [`M14-post-trip-review.md`](M14-post-trip-review.md) |
| M15 — Import Wizard | [`M15-import-wizard.md`](M15-import-wizard.md) |
| M16 — Series & Destination Profile | [`M16-series-destination-profile.md`](M16-series-destination-profile.md) |
| M17 — Settings & Notifications | [`M17-settings-notifications.md`](M17-settings-notifications.md) |
| M18 — Portable Import Preview | [`M18-portable-import-preview.md`](M18-portable-import-preview.md) |
| M19 — First-Launch Mode Selection | [`M19-first-launch-mode.md`](M19-first-launch-mode.md) |
| M20 — User Administration | [`M20-user-administration.md`](M20-user-administration.md) |
| M22 — Trip Properties (FR-2.7) — *built* | [`M22-trip-properties.md`](M22-trip-properties.md) |
| M23 — Hidden Items and Templates (FR-24.3) — *built* | [`M23-hidden-items-templates.md`](M23-hidden-items-templates.md) |
| M24 — Aufräumen (Inventory Cleanup, FR-24.12) — *built* | [`M24-aufraumen.md`](M24-aufraumen.md) |
| M25 — Aufgaben (A Trip's Tasks, FR-7.7, FR-7.14) — *built* | [`M25-aufgaben.md`](M25-aufgaben.md) |
| M26 — Notizen (A Trip's Notes, FR-7.13) — *built* | [`M26-notizen.md`](M26-notizen.md) |
| M27 — Ausflüge (A Trip's Excursions, FR-31) — *built* | [`M27-ausfluge.md`](M27-ausfluge.md) |
| M28 — Ideen (A Trip's Ideas, §3.29) — *built* | [`M28-ideen.md`](M28-ideen.md) |
| M29 — Tagesplan (A Trip's Day Plan, FR-29.14, FR-29.15, FR-29.18) — *built* | [`M29-tagesplan.md`](M29-tagesplan.md) |
| M30 — Aktivität (Activity Log, §3.32) — *built* | [`M30-aktivitat.md`](M30-aktivitat.md) |
| M21 — Vorlage aus Reise (Template from Trip) | [`M21-vorlage-aus-reise.md`](M21-vorlage-aus-reise.md) |
## 1. Screen Inventory

| # | Screen | Priority | Primary FRs |
|---|--------|----------|-------------|
| M1 | Dashboard "My Tasks" | MVP | 6.1, 6.3 |
| M2 | Trip List | MVP | 2.1, 13.1 |
| M3 | Trip Creation Wizard | MVP | 2.1–2.3, 14.2, 15.1 |
| M4 | Packing List (Trip Detail) | MVP | 3.x, 4.x, 5.x, 8.1 |
| M5 | Item Detail Sheet | MVP | 4.2, 4.3, 7.x, 14.1 |
| M6 | Shopping Views | MVP | 3.1–3.3 |
| M7 | Template List | MVP | 1.2, 1.6 |
| M8 | Template Editor | MVP | 1.3–1.5, 15.2 |
| M9 | Item Inventory | MVP | 1.1 |
| M10 | Item Editor | MVP | 1.1, 1.7, 1.8, 1.9 |
| M11 | Container Management | P2 | 10.1–10.3 |
| M12 | Analytics | P2 | 8.1, 8.2, 14.3 |
| ~~M13~~ | ~~Repack Mode~~ — removed (§3.11) | — | — |
| M14 | Post-Trip Review Assistant | P2 | 9.1, 9.2 |
| M15 | Import Wizard | P2 | 16.1–16.3, NFR-4.7 |
| M16 | Series & Destination Profile | P2 | 13.1–13.3 |
| M17 | Settings & Notifications | P2 | 6.2, NFR-4.5/4.6 |
| M18 | Portable Import Preview | P2 | Addendum 3.18 |
| M19 | First-Launch Mode Selection | P2 | Addendum 3.19 |
| M20 | User Administration | P3 | Addendum 3.23 |
| M21 | Vorlage aus Reise (Template from Trip) | MVP | Addendum 3.27 (27.5, 27.1, 27.4) |
| M24 | Aufräumen (Inventory Cleanup) | P2 | Addendum 24.12, 24.13 |
| M25 | Aufgaben (A Trip's Tasks) | MVP | Addendum 7.7 |
| M26 | Notizen (A Trip's Notes) | MVP | Addendum 7.9, 7.13 |
| M27 | Ausflüge (A Trip's Excursions) | MVP | Addendum 31.1–31.15 |
| M28 | Ideen (A Trip's Ideas) | MVP | Addendum 29.1–29.17, 29.19, 29.20 |
| M30 | Aktivität (Activity Log) | P2 | Addendum 32.1–32.3 |

## 3. Cross-Screen Flows (Reference)

1. **Happy path packing:** M1 → M4 → hold a row → *Jetzt packen* → check → real-time update on partner's device.
2. **Delegation:** M4 → M5 → set packer → push notification → recipient taps → deep link into M4/M5 (G-4).
3. **Purchase transition:** M6 (Before the trip) → check item → appears in M4 as PACK/Open (FR-3.3).
4. **Feedback loop:** M4 flag *Missing* → trip archived → M14 proposes template addition → next M3 run includes the
   item.
5. **Migration:** M15 import → M2 shows archived series trips → M3 step 4 surfaces historical suggestions (FR-14.2)
   immediately — **on a device that did the import and on one that only synced it** (E2E-FLOW-05).
6. **Template round-trip (§3.27):** M3 creates a trip from a Ferien-Vorlage plus extra groups (overlaps deduped in the
   preview) → items are added ad-hoc while packing → trip archived → M21 recognises the groups, folds the chosen
   deviations back into them → the trips using those groups are asked, and show the applied-changes chip on M2 once they
   accept (FR-27.4) → next year's M3 run starts from the new composed template.

## UI Decisions (Resolved)

Every UI decision is recorded in its owning pattern or screen: grouping persistence (M4), stepper/checkbox threshold
(G-6), "Never ask again" scope (M14), desktop two-pane layout (G-9, M4/M5), and presence on M2 (not on M2 at all — see
the M2 elements list and G-10). No open UI decisions remain in this document.
