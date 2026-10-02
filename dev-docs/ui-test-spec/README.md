# UI / End-to-End Test Specification — „JIT-Pack" (v1.0)

**Document Status:** Proposed for Review
**Basis:** ui-spec/ (screens M1–M21, patterns G-1–G-15) + PRD_Base + prd-addendum/ (FR/NFR catalogue).
**Purpose:** Define *what* the automated headless-browser test suite must cover so that every requirement with a UI
surface is exercised through the real, built client. This document is the specification; implementation (Playwright
config, fixtures, the tests themselves) follows and is tracked separately.

> This file is authoritative for E2E scope. When a requirement changes, its row in the traceability matrix (§7) must
change with it — same discipline as UI_Spec and Sync_API_Spec.

## Files

One file per screen (`M04-*.md` holds the E2E-M4-* cases), one for the global patterns' cases, the
non-functional journeys and the traceability matrix. `scripts/case-id-gate.mjs` reads every file here.

| Section | File |
|---|---|
| 3. Global Pattern Test Cases (G-1 – G-15) | [`global-patterns.md`](global-patterns.md) |
| M1 — Dashboard | [`M01-dashboard.md`](M01-dashboard.md) |
| M2 — Trip List | [`M02-trip-list.md`](M02-trip-list.md) |
| M3 — Trip Creation Wizard | [`M03-trip-creation-wizard.md`](M03-trip-creation-wizard.md) |
| Plain-HTTP instances (NFR-4.2a) — `e2e/insecure-context.spec.ts` | [`plain-http.md`](plain-http.md) |
| App shell offline (NFR-4.13) — `e2e/pwa-offline.spec.ts` | [`app-shell-offline.md`](app-shell-offline.md) |
| M4 — Packing List (core) | [`M04-packing-list.md`](M04-packing-list.md) |
| M5 — Item Detail | [`M05-item-detail.md`](M05-item-detail.md) |
| M6 — Shopping Views | [`M06-shopping-views.md`](M06-shopping-views.md) |
| M7 — Template List | [`M07-template-list.md`](M07-template-list.md) |
| M8 — Template Editor | [`M08-template-editor.md`](M08-template-editor.md) |
| M9 — Item Inventory | [`M09-item-inventory.md`](M09-item-inventory.md) |
| M10 — Item Editor | [`M10-item-editor.md`](M10-item-editor.md) |
| M11 — Container Management | [`M11-container-management.md`](M11-container-management.md) |
| M12 — Analytics | [`M12-analytics.md`](M12-analytics.md) |
| M13 — Repack Mode — **REMOVED (2026-07-17)** | [`M13-repack-mode.md`](M13-repack-mode.md) |
| M14 — Post-Trip Review Assistant | [`M14-post-trip-review.md`](M14-post-trip-review.md) |
| M15 — Import Wizard | [`M15-import-wizard.md`](M15-import-wizard.md) |
| M16 — Series & Destination Profile | [`M16-series-destination-profile.md`](M16-series-destination-profile.md) |
| M17 — Settings & Notifications | [`M17-settings-notifications.md`](M17-settings-notifications.md) |
| M18 — Portable Import Preview | [`M18-portable-import-preview.md`](M18-portable-import-preview.md) |
| M19 — First-Launch Mode Selection | [`M19-first-launch-mode.md`](M19-first-launch-mode.md) |
| M20 — User Administration | [`M20-user-administration.md`](M20-user-administration.md) |
| M21 — Vorlage aus Reise (new screen, §3.27) | [`M21-vorlage-aus-reise.md`](M21-vorlage-aus-reise.md) |
| M22 — Trip properties (new screen, FR-2.7) | [`M22-trip-properties.md`](M22-trip-properties.md) |
| M25 — Aufgaben (a trip's tasks, FR-7.7) | [`M25-aufgaben.md`](M25-aufgaben.md) |
| M26 — Notizen (a trip's notes as threads, FR-7.13) | [`M26-notizen.md`](M26-notizen.md) |
| M27 — Ausflüge (a trip's excursions, FR-31) | [`M27-ausfluge.md`](M27-ausfluge.md) |
| M28 — Ideen (a trip's ideas, §3.29) | [`M28-ideen.md`](M28-ideen.md) |
| M29 — Tagesplan (a trip's day plan, FR-29.14/29.15) | [`M29-tagesplan.md`](M29-tagesplan.md) |
| M30 — Aktivität (who changed what, §3.32) | [`M30-aktivitat.md`](M30-aktivitat.md) |
| 6. Non-Functional Journeys | [`non-functional.md`](non-functional.md) |
| 7. Requirement Traceability Matrix | [`traceability.md`](traceability.md) |
## 1.1 Layered coverage (decided)

The client already ships **412 Vitest unit/component tests** and a fully unit-tested pure domain layer (`src/domain/`,
`src/lib/`, `src/local/`, `src/notifications/`). The E2E suite does **not** re-derive that logic. It sits one layer
above:

* **Unit tests own the algorithm** — dedup/instantiation (FR-2.2/2.3/2.3a), analytics math (FR-8.2/10.4/14.3),
  clone/review planning (FR-12/9), spreadsheet & portable parsing (FR-16/18), dependency resolution (FR-20),
  image/avatar geometry (FR-22.2/22.3), HLC + merge (NFR-4.2a). These are proven in isolation and must stay there.
* **E2E owns the journey** — that a real user, in a real browser, driving the real built app, can reach a screen,
  perform the requirement's action, and observe the correct result *including its persistence and (where relevant)
  cross-device propagation*. E2E verifies the wiring: store ↔ outbox ↔ WebSocket ↔ server ↔ DOM.

Every FR/NFR in §7 is tagged **E2E** (a browser case exists), **UNIT** (logic already covered; E2E only touches it
incidentally through a journey), **SERVER** (backend/API concern with no UI surface — covered by Go tests, listed here
for completeness), or **DOC/N-A** (documentation-only or retired).

## 1.2 Tooling (proposed)

**Playwright** (`@playwright/test`), headless Chromium + WebKit. WebKit matters: the Capacitor iOS WebView is WebKit,
and it is the only cross-browser runner with real WebKit. Rationale for choosing it over Cypress/Selenium and the CI
wiring live in §8; the dependency-footprint justification (NFR-4.3 discipline) is recorded there.

## 1.3 Out of scope for E2E

* Pure algorithmic correctness already covered by unit tests (see §1.1) — E2E asserts the *outcome in the UI*, not every
  branch.
* Native Capacitor shells (iOS/Android builds), real push-service delivery (APNs/FCM/UnifiedPush), and real OIDC
  provider integration — replaced by a mock IdP (§2.3).
* Server-internal concerns without a UI surface: resource footprint (NFR-4.3), deployment/exposure guidance (NFR-4.9),
  JWT-vs-Authelia decoupling internals (NFR-4.4) — owned by Go tests and docs.
* Visual-regression / pixel diffing — explicitly deferred (see §9, Future); this suite asserts behaviour and semantic
  DOM state, not appearance. (Theming G-11 is checked structurally: correct theme class + token application, not
  screenshots.)

## 2. Test Environments (Run Modes)

All three product run modes are covered (decided), because collaboration requirements (FR-4.x, 6.x, G-3, G-10, M20) have
no meaning without a server and a second identity. Each E2E case is tagged with the mode(s) it runs in.

## 2.1 `local` — Local Mode, no backend

Client only, served by `vite preview`. IndexedDB is the store; enqueue/drain/WebSocket are no-ops. M19 selects "Just on
this device". Covers offline-first, persistence, and the serverless export/import path. **No `jitpackd` process.**

## 2.2 `single` — Single-User Mode

`jitpackd` started with `api.NewSingleUser` (no `JITPACK_JWT_SECRET`/`JWKS_URL`, no OIDC env). No auth, no membership,
collaboration UI hidden (G-8). Boots with zero network to any IdP (NFR-4.8). Covers the full single-writer product
surface against a real server + real sync.

> **Client-side note:** there is no distinct "single" client mode. The client persists `jitpack_mode = 'server'` and
points `jitpack_server_url` at the Single-User `jitpackd`; because that server's `GET /api/v1/auth/config` advertises no
OIDC, `App.vue` skips the login redirect and lands directly on M1 (M19-02). So the `single` vs `server` distinction is
purely a *harness* concern: which `jitpackd` the fixture starts and whether OIDC tokens are seeded — the client build is
identical.

## 2.3 `server` — Server / Collaboration Mode

**Built** (ADR-029). `jitpackd` in OIDC mode against a **mock IdP** fixture — `client/e2e/server/mockIdp.mjs`, an
HTTP server exposing discovery, `/jwks`, `/authorize`, `/token` and `/userinfo`, signing RS256 with a keypair generated
per run. It is a *test fixture*, not a shipped component, so NFR-4.8 is not violated, and the shipped binary carries no
test seam.

The login is **driven, never seeded**: `/authorize` renders an account chooser, the test picks the account, and the app
exchanges the code through the broker (ADR-007) — so the display name every identity assertion reads is the one UserInfo
supplied and the server provisioned. Harness shape: one launcher starts the IdP *before* jitpackd (discovery is resolved
at start-up, so the order is load-bearing), and the project runs its **own** `vite preview`, because the client reaches
its server same-origin and the Single-User instance is a different process with a mutually exclusive configuration.

What it covers today is one unit (`client/e2e/server/multi-user.spec.ts`); `dev-docs/e2e-ledger/` is the ledger,
including what is still owed. Enables:
* **Multi-client**: two (or more) browser contexts authenticated as different users (`alice`, `bob`) against the same
  server, to prove real-time convergence, presence, locks, delegation, and notifications.
* **Membership & roles** (FR-4.5/4.7), **admin** (M20, `JITPACK_ADMIN_EMAILS=alice@…`).

## 2.4 Shared fixtures & conventions

* **`data-testid`** is the required selector strategy for every asserted element — no text/CSS-class selectors (i18n-
  and refactor-stable). Adding missing `data-testid`s to the Vue components is part of implementation.
* **Seed helpers** drive the app *through its own mutation paths* (create item → template → trip via the orchestrator),
  never by injecting DB rows — so tests exercise the same code users do. A thin "fast seed" that posts to the sync API
  directly is allowed only for `server`-mode preconditions that aren't themselves under test.
* **Time control**: HLC/staleness assertions (G-3 15-min lock rule, NFR-4.11 30-day reminder) use injectable clocks /
  Playwright `clock` — never real `sleep`.
* **Offline simulation**: Playwright `context.setOffline(true)` for NFR-4.1 journeys; server-mode reconnection via
  toggling offline then draining.

## 4. Per-Screen Test Cases (M1 – M20)

Each case is **Given / When / Then**, tagged with mode(s) and the requirement(s) it exercises through the UI. IDs are
stable references for the traceability matrix.

## 8. CI Integration (proposed)

* **New CI job `e2e`** in `.github/workflows/ci.yml`, `needs`-gated after `client` and `go` build so it runs on a proven
  client + server.
* **Fixtures**: build the `jitpackd` binary (already built for `docker-build`); a shared harness starts it in `single`
  or `server` mode per test project. Playwright `webServer` starts `vite preview`.
* **Browsers**: Chromium + WebKit, inside the digest-pinned Playwright image (`scripts/e2e.sh`), each sharded on its
  own axis (`scripts/e2e-matrix.mjs`). A pull request runs WebKit on the `@smoke` and `@webkit` cases only — the ones
  whose subject is an engine difference — and a push to `main` runs every case in both engines (ADR-091).
* **Artifacts**: on failure, upload `playwright-report/` (HTML report + trace + video) via `actions/upload-artifact`.
* **Supply-chain (invariant 8)**: the Playwright dep is pinned in `package-lock.json` (sha512);
  any new Action in the job is pinned by full commit SHA; `playwright install` pinned to the package version.
  Dependabot's npm/actions ecosystems keep them fresh.
* **Dependency-footprint justification (NFR-4.3 discipline)**: Playwright is a **dev-only** dependency; it ships nothing
  to the container or client bundle and pulls no runtime code. Its browser binaries live only in the CI cache. This
  keeps the runtime footprint unchanged, satisfying the standard-library-first / minimal-footprint working agreement for
  production while accepting a heavier *test* toolchain.
* **Flakiness budget**: E2E stays journey-focused (this spec is deliberately ~90 cases, not ~400) so the suite is fast
  and stable; retries limited to 1; no arbitrary sleeps (clock injection only, §2.4).

## 9. Out of Scope / Future

* **Visual regression** (screenshot diffing of G-11 themes, layouts) — deferred; would layer on Playwright's
  `toHaveScreenshot` if desired later.
* **Native shell E2E** (Capacitor iOS/Android via Appium/Detox) — the web build is the coverage vehicle; the native
  WebView is approximated by WebKit.
* **Real IdP / real push-service delivery** — mocked (§2.3, §6); a smoke test against a real Authelia/UnifiedPush stack
  is a separate, manual pre-release check.
* **Load/perf** — not part of functional E2E.

## 10. Implementation Order (proposed, when we start building)

1. Playwright scaffold + `data-testid` pass on shared components, one smoke test per mode (M19 mode selection, M1
   loads).
2. Global patterns (§3) — they underpin everything.
3. Single-User screen cases (largest surface, simplest infra).
4. Local Mode delta (persistence, mode selection, serverless export).
5. Mock-IdP harness + Server/collaboration multi-client cases (FLOW-01/02/08, presence, locks, notifications, admin).
6. Cross-screen flows + non-functional journeys.
7. Wire the `e2e` CI job; make it required once green and stable.
