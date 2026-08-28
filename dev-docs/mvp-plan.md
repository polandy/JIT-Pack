# MVP Plan — "the family packs a real vacation with it"

Status: **approved by the owner 2026-08-20** (scope cut incl. deferring FR-27.13/§3.28; parallel open PRs allowed for this push, merges stay serialized with explicit go-ahead). **Wave 1 is merged** (2026-08-21): Track A `56f15a3`, Track B `2b89504`, Track D `980ba1b` — D's release cut itself is still owed, see §7. **Wave 2 is merged too** (2026-08-21): Track C `61a790b`, Track F `46c1690`, Track G `2607317` (its steps 1 and 2 — the M14 eyeball on `:3000`, step 3, is still owed). **Track E (i18n) is the only track of the two waves still running.** **Track J is merged** (`443327d`, FR-2.7/M22) and **Track I is built** (variant A, the fifth route class). §5 records where they touch. Written from a full-repo survey (client/UX gaps + server/deploy readiness). Any session picking up a track: read `CLAUDE.md` fully first, then this file, then only the files your track names.

## 1. Goal and definition of done

The owner and their family use JIT-Pack as the packing tool for the next vacation:

- The instance runs on the owner's homelab in **Server Mode (multi-user, OIDC)** behind HTTPS.
- Every family member opens it on their own phone, installed to the home screen, logged in as themself.
- They plan the trip from templates (M3), pack from the shared list (M4/M5) with per-person assignment and packed-by attribution, and run the post-trip loop (M14/M21).
- A hotel-wifi dropout does not eat data or strand a phone on a dead reload.
- The owner can upgrade and back up the instance without losing the family's data.

**Why Server Mode and not Local Mode:** Local Mode is the only fully e2e-covered path today, but it is one device per person with no shared list — that is not "the family packs together". Server Mode is the product's point and the backend is built (ADR-007 auth, admin surface, push, sync); what it lacks is *confidence* (zero e2e coverage) and an *offline story* (in-memory outbox, no app-shell cache). Closing those two is the MVP, not building new features.

## 2. What already works — do not rebuild

All screens M1–M21 exist and the rebuilds are complete. End-to-end complete (with e2e coverage, in Local Mode): trip creation incl. §3.27 composition (FR-27.1/27.2/27.3/27.6/27.12, FR-2.6), packing (FR-25.2 pack-out, FR-25.17, FR-5.5 skip + FR-20.2 cascade, FR-25.13 quick-add, FR-27.10 group-onto-trip), trip lifecycle planning→active→archived, templates/groups (M7/M8), inventory (M9/M10), containers (M11), analytics (M12), review assistant (M14), template-from-trip (M21, FR-27.5), FR-27.4 group refresh, Local Mode backup/restore (ADR-015).

Server-side: OIDC broker + first-party sessions (ADR-007), JIT user provisioning on first login, admin API + `/admin` UI page, Web Push with self-generated VAPID (zero config needed), WebSocket hub, sync partitions, `docs/` manual (installation, configuration, authentication, user-management, backup, troubleshooting).

## 3. The gaps, ranked

**Blockers (family cannot realistically use it without these):**

- **B1 — Not installable, no offline shell.** No web app manifest anywhere; `client/index.html` has no manifest link / `theme-color` / `apple-mobile-web-app-*`; `client/public/sw.js` is push-only ("No caching" by design) and is registered only inside `registerPush()` — a user who never enables push has no service worker at all. Consequence: no home-screen install, no offline reload, and **no push on iOS at all** (iOS grants the Push API only to installed PWAs).
- **B2 — Server Mode offline = data at risk.** The sync outbox (`client/src/composables/useSyncOutbox.ts`) queues mutations **in memory only**. A reload or app kill while offline loses the queue; with no app-shell cache the reload itself has nothing to boot from.
- ~~**B3 — Server Mode has zero e2e coverage.**~~ **Closed 2026-08-24** by the two backend-backed projects: `single` (2026-08-21) for the wire, and the mock-IdP `server` project (ADR-029) for identity — two accounts, membership, attribution, the G-3 lock naming its holder and FR-5.7's takeover. Everything it left owed has since landed: delegation (E2E-FLOW-02) on 2026-08-25, presence (G-10) and the admin surface (M20) on 2026-08-28 — the last two found three defects nothing else could reach, recorded in `dev-docs/e2e-tests.md`. Only real-provider coverage is still open, and it is not an MVP blocker. Original finding:** All 25 Playwright specs run mode `local`; E2E-G2-01 (queue + conflict log) is explicitly unbuilt because no backend-backed Playwright project exists. Multi-user, presence, delegation and conflict paths have never been driven through the app.
- **B4 — No deployable release.** Docs in three places instruct `ghcr.io/polandy/jit-pack:1.0.0` — that tag does not exist (only `v0.1.0`, ~40 commits stale, and it would refuse today's schema via `ErrSchemaStale`). Only the backend image is in the publish workflow; the client image (`client/Dockerfile`) is published nowhere. There is no multi-user compose example — the one "production" Traefik snippet in `docs/installation.md` runs `JITPACK_SINGLE_USER: "true"`.
- **B5 — Upgrades lose family data.** Pre-1.0 upgrade path (ADR-018) is export portable YAML → empty DB → import, and the portable export carries **no item photos, no avatars, no packing progress, no accounts**. For a family instance with history this is real loss. MVP-grade mitigation is acceptable (see Track D), a full fix is not required.

**Important (should land before the vacation):**

- **S1 — i18n gaps.** Fully hard-coded English: M1 Dashboard, M6 Shopping, TripMembers, M16/M20, ConflictLog, Login, global chrome (TabBar/NavRail/avatars); M2 mostly hard-coded; M3 steps 1/2/4 hard-coded (step 3 is done). **M15 and M18 came off this list with Track F** (`46c1690` localized both while it was in there anyway) — verified in the code, not assumed. Rule: a section is a coherent unit to localize — finish whole screens.
- **S2 — Local Mode backup omits the three FR-27.4 tables** (`trip_template_sources`, `trip_generated_positions`, `trip_applied_changes` — confirmed absent from `client/src/local/backup.ts` and `domain/portable.ts`). A restored device re-asks answered proposals and resurrects deleted positions.
- **S3 — M4 loses scroll position when a detail opens** (ADR-012 overlay amendment). Painful on a 40-row list on a phone.
- **S4 — M14 has never been eyeballed with real proposals** (positive e2e written 2026-08-20; a rendered owner eyeball is still owed). E2E-M12-03's positive half is owed-but-unwritten.
- **S5 — Docs gaps for the operator path:** no push/notifications page (HTTPS requirement, iOS install requirement, how to verify), no upgrade procedure ("export *before* pulling"), no backup cron/timer example, no IdP-startup-ordering note (server fail-fasts if the IdP loses the boot race), no "create your family's users in the IdP" walkthrough.

**Deliberately out of the MVP** (specified, decided, do not start): FR-27.13 group-picker search, §3.28 item mark (emoji), FR-24.3 delete lifecycle (all three built since), §3.26 calendar feed, North-Star phases, FR-27.8 usage history, FR-1.6 publish/fork. Also out: Capacitor native shell (ADR-006 stays planned — the PWA covers the vacation).

## 4. Tracks — designed for parallel agents

Each track is one worktree under `.claude/worktrees/<name>` off `origin/main`, one PR (split into more if a track's steps merge independently), `/pr-review` before asking, merge only on explicit go-ahead, **merges serialized** even though development is parallel. Tracks are file-disjoint by construction; the table in §5 shows the two known touchpoints.

> Note on the standing "one open PR per session" agreement: this plan assumes the owner accepts **one open PR per parallel track** for the MVP push. Confirm before fanning out.

### Track A — PWA: installable + app shell *(blocker B1 · effort M · no dependencies)*

Files: `client/index.html`, `client/public/` (new `manifest.webmanifest`, icons), `client/public/sw.js`, `client/src/notifications/push.ts`, `client/src/main.ts` (SW registration), `docs/` page.

1. Web app manifest (name, icons from the Packed Backpack logo, `theme-color` per flavour, `display: standalone`), `apple-mobile-web-app-*` + `apple-touch-icon` tags.
2. Register the service worker **unconditionally at app start** (not only inside `registerPush()`); keep push handlers.
3. App-shell caching in `sw.js`: precache the built bundle (index, JS/CSS chunks, fonts, favicon), cache-first for hashed assets, network-first + fallback-to-cache for navigation. **Never cache `/api`, `/ws`, `/health`.** Decide hand-rolled vs `vite-plugin-pwa` — a new dependency needs its one-line justification (NFR-4.3); either way the SW must not break the existing push path. This is a real tradeoff → ADR.
4. Stale-bundle policy: on SW update, activate on next launch; surface "new version" via the G-2 indicator rather than an unprompted reload.
5. `docs/` page: installing to the home screen (iOS + Android), why HTTPS is required, push-on-iOS-needs-install.
6. Tests: e2e that a reload without network still paints the app shell (Local Mode makes this drivable today); unit for the registration seam. No `waitForTimeout` — the SW lifecycle has real events to await.

Renders on real phone sizes; owner eyeball before finalizing (working agreement).

### Track B — Server Mode e2e: a backend-backed Playwright project *(blocker B3 · effort L · no dependencies, but see C)*

Files: `client/playwright.config.ts` (new project), `scripts/e2e.sh`, `.github/workflows/ci.yml`, new specs under `client/e2e/`, `dev-docs/e2e-tests.md` ledger.

**Status 2026-08-24: both projects exist.** Step 1 and E2E-G2-01 landed with `single` (`2b89504`); step 2's multi-user half is the `server` project (ADR-029), whose first run found the defect it was built to find — a takeover the loser's screen contradicted. Steps 3 and 4 are done for both: `e2e-server` is its own CI job, and the ledger carries every case with mode `server`.

1. A Playwright project that boots `jitpackd` in Single-User or multi-user test configuration (in-memory or temp-file SQLite; the Go binary builds CGO-free, so it can run inside the pinned Playwright container or on the host with `--network host`).
2. First specs, in order of value: two-browser-context multi-user smoke (member A packs, member B sees it via WebSocket — the "family" scenario in miniature); **E2E-G2-01** (offline queue drains, conflict log fills); auth flow (test IdP or the single-user bypass — decide, note in the ledger which half is covered); server half of the G-2 sheet (currently component-test-only, flagged in the ledger).
3. CI: a new job or a fifth shard; `e2e` stays non-required (protection rationale in CLAUDE.md).
4. Ledger discipline: every case lands in `dev-docs/e2e-tests.md` with mode `server`.

Determinism rules apply hard here (no sleeps; wait on settled state / WS-delivered render). Budget note: units that build their world through the UI run near the budget on WebKit — smallest seed + `test.slow()`.

### Track C — Server Mode offline resilience: durable outbox *(blocker B2 · effort L · soft dependency on B)*

Files: `client/src/composables/useSyncOutbox.ts`, a small IndexedDB persistence seam (pattern: `client/src/local/persistence.ts`), G-2 detail sheet, `dev-docs/Sync_API_Spec_v1.3.md` if envelope semantics move.

1. Persist the outbox queue to IndexedDB per mutation, remove entries on server ack; replay on boot before the first pull. Ordering and idempotency: the HLC/merge algorithm (NFR-4.2a) already tolerates replays — verify, don't assume; the merge tests in `internal/sync` are the reference.
2. G-2 indicator reports "N queued locally" after a reload (it already knows in-flight Local Mode writes — same seam).
3. Failure paths: quota exceeded, a mutation the server permanently rejects (park it in the conflict log rather than wedging the queue).
4. Tests: Vitest on the persistence seam with a fake IDB or the real one; the e2e ("kill page offline, reload, queue drains") lands in Track B's server project → **coordinate: B's project merges first, C extends it.** C's client-side work needn't wait — only its e2e does.

### Track D — Release, deploy, operator docs *(blockers B4+B5, S5 · effort M · no dependencies, no client code)*

Files: `.github/workflows/docker.yml`, `release.yml`, `client/Dockerfile`, `docker-compose.yml` or a new `deploy/` example, `docs/installation.md`, `docs/configuration.md`, new `docs/` pages, `mkdocs.yml` nav, `README.md`.

1. Verify `RELEASE_PLEASE_TOKEN` is configured; merge/refresh the release-please PR (#19 is open since July) and cut a release so a current backend image exists on ghcr.
2. Add the client image (`client/Dockerfile`, nginx) to `docker.yml` — publish both on `v*` tags, digest-discipline per invariant 8.
3. A real multi-user compose example: backend + client + reverse proxy, OIDC env vars, same-origin routing (`/api`, `/ws`, `/health` → backend; **`/ws` outside `/api/v1` is the documented trap**), `Host` preserved, SPA fallback for `/auth/callback`, restart policy for the IdP boot race. Fix the existing Traefik snippet that runs `JITPACK_SINGLE_USER: "true"` in the production section.
4. Fix the phantom `:1.0.0` tag in `docs/installation.md:28,134`, `docs/index.md:23`, `README.md:27`.
5. New docs pages (each verified against code, not spec): **Upgrades** (export *first*; what the portable export does NOT carry — photos, avatars, packing history; recommendation: pin one image digest for the duration of the vacation and upgrade after), **Notifications/Push** (HTTPS, iOS home-screen requirement, verify-delivery steps), **Family setup** (create users in the IdP, `JITPACK_ADMIN_EMAILS`, first-login provisioning, admin page), backup automation example (systemd timer with `sqlite3 .backup`).
6. `mkdocs build --strict` gates all of it.

### Track E — i18n completion *(S1 · effort M · no dependencies, wide but shallow)*

Files: the zero-`t()` views listed in §3 S1, `client/src/i18n/messages/{en,de}.ts`, catalogue-integrity test.

Whole screens per PR (a half-translated section is worse than none): (1) M2 + M3 steps 1/2/4 — the family's entry path; (2) M1 + global chrome + Login + TripMembers + ConflictLog — the Server-Mode surfaces; (3) M6, M16/M20 — the long tail (M15/M18 are done, see §3 S1). The in-house module in `client/src/i18n/` is the mechanism (no `vue-i18n`, NFR-4.12). Low merge-conflict risk with other tracks: it touches views no other track edits (M4/M14 are already localized).

### Track F — Data-safety small fixes *(S2 · effort S–M · no dependencies)*

Files: `client/src/local/backup.ts`, `client/src/domain/portable.ts`, M18 restore branch in `client/src/views/import/PortableImportPage.vue`, `client/e2e/backup-restore.spec.ts`, ADR-015 + FR-18.x spec text.

Carry the three FR-27.4 tables through the ADR-015 device backup so a restored device keeps following its groups: answered proposals stay answered, detached positions stay detached. Failure-path test: restore of a backup *without* the new sections (old file) still succeeds — the current behaviour becomes the documented fallback.

### Track G — UX polish for the vacation *(S3+S4 · effort S–M · no dependencies)*

Files: `client/src/views/trips/PackingListPage.vue` (+ router/overlay layer per ADR-012), `dev-docs/e2e-tests.md`.

1. M4 scroll restoration when a detail sheet closes (the ADR-012 overlay amendment's carried cost). Assert on rendered position, not URL.
2. Write E2E-M12-03's positive half (unblocked since the lifecycle step exists).
3. Stage real proposals on :3000 (`docker stop jitpack-web` frees the port) and get the owner's M14 eyeball — deliverable is a click-path note or artifact link, per the standing eyeball rule.

### Track J — a trip cannot be edited after it is created *(owner-found 2026-08-21 · **merged `443327d`**, FR-2.7 / M22)*

Files (once the shape is decided): `client/src/composables/useMutations.ts`, a new trip-properties
surface under `client/src/views/trips/`, `client/src/domain/` for the consequence rules,
`router/index.ts`, `dev-docs/PRD_Addendum_v2.10.md` (a new FR), `dev-docs/UI_Spec_v1.10.md`
(a new screen or an M4 amendment), `dev-docs/UI_Test_Spec_v1.0.md`, `client/e2e/`.

**Not forgotten — never specified.** The screen inventory runs M1–M21 and none of them edits a
trip. Metadata is entered in **M3 step 1**, travelers in **M3 step 2**, and after the wizard
both are frozen.

**What the code actually allows on an existing trip**, verified rather than assumed: `updateTripStatus`
(the planning → active → archived lifecycle) and the series assignment. That is all. There is no
`updateTrip`, no rename, no date change, no destination change. `addTraveler` exists but is called
only from the wizard, the clone path and generation — **no surface in the app calls it on a trip
that already exists**.

One trap to name, because it looks like the missing feature: Settings offers *„Reisende:n
hinzufügen"*. Those are the household's **default travelers** (`useDefaultTravelers`), which
prefill M3. They change nothing about a trip that exists.

**Why this outranks polish for the vacation.** A child does come along after all, a name is
mistyped, the trip shifts by a week. Today the only answer is to create the trip again and rebuild
the packing list — with forty rows and half the packing done, that is not an answer. Travelers are
also load-bearing: `instantiate.ts` expands `per_person` positions over the traveler list
(FR-25.1), and assignment points at them.

**Two decisions before anyone builds:**

1. **Where the surface lives.** A screen of its own reached from M4's app bar, or a sheet in the
   M5 grammar — which is what M8 does for a template. The sheet keeps the trip on screen behind it;
   a screen has room for travelers, dates and attributes without nesting.
2. **What a late change does to what was generated.** Adding a traveler after generation is the
   hard half: do the `per_person` positions extend to the new person, and does removing a traveler
   take their rows with it? This is FR-27.4-shaped — a change with a blast radius, where manual
   edits must still win — and §3.27's answer is instructive: *ask at the trip, name every
   consequence, and make declining advance the ledger rather than leave pending state*. Renaming a
   traveler is the easy case and should stay one; it must not be modelled as remove-plus-add, which
   would detach their rows.

Until it is built, the honest workaround is the clone path (FR-12.1) — and it loses the packing
progress, which is exactly why this is a gap and not a preference.

### Track I — the back button's missing route class *(owner-found 2026-08-21 · effort S–M · **built 2026-08-21**, variant A)*

Files: `client/src/router/backTarget.ts`, `router/index.ts`, `components/global/AppHeader.vue`,
`router/__tests__/backTarget.spec.ts`, `client/e2e/global-nav.spec.ts`,
`dev-docs/Navigation_Concept_v1.0.md` §7, `dev-docs/adr/ADR-011_*.md`.

**The symptom the owner hit:** inside a trip, tap the gear, then `‹ back` — and the app lands on
the dashboard instead of the trip.

**The cause is a gap in the contract, not a bug in it.** ADR-011 decoupled back from history
deliberately: `‹` is the only way out of a drill-down, and a cold-start deep link has a
one-entry history, so every non-root route declares a static `meta.parent` and `backTarget()`
fills in the *current* route's params. §7 classifies routes four ways — tab roots, drill-downs,
flows, modal-ish. **Settings fits none of them.** It is a *global action*: `AppHeader.vue`
offers the gear unconditionally on every screen (deliberately — it is what keeps the conflict
log reachable from inside a trip), while `/tabs/settings` declares the single static parent
`/tabs/dashboard`. From anywhere but the dashboard, the chevron lies.

**Two findings came with it, same root:**

1. **The "flows" class has no mechanism at all.** §7 promises flows return to *"the origin the
   flow was entered from"*; there is no `from`, `origin` or `returnTo` anywhere in the router.
   Flows carry static parents like everything else, so M15 entered from Settings returns to
   the inventory. The concept documents a behaviour that was never built.
2. **The test believes Settings is a root.** `ROOT_PATHS` in `backTarget.spec.ts` lists
   `/tabs/settings` among the routes that "show the logo and therefore owe no parent" — while
   the route table gives it one. Nothing catches the contradiction, because the test only
   asserts that non-roots *have* a parent, never that roots lack one. The exemption list is a
   fossil of the other intention.

**The decision to take first** (both shapes keep ADR-011's cold-start guarantee):

- **A — a global action carries its origin.** The gear pushes `/tabs/settings` with the current
  path as `query.from`; `backTarget()` prefers a `from` that validates as an internal path and
  falls back to the declared `meta.parent` when it is absent or unsafe. Small, and it gives the
  flows row its missing mechanism at the same time. Adds a fifth route class to §7.
- **B — Settings becomes modal-ish**, a sheet over the current screen the way M5 is. Back then
  returns by construction, and it matches G-1's reading of settings as a tool rather than a
  place. Larger: M17 has sub-routes (admin, file import, gallery) that all declare
  `/tabs/settings` as their parent.

Whichever is chosen: a case in `client/e2e/global-nav.spec.ts` (the working agreement makes the
global patterns binding — they were made binding *by* four navigation defects found by hand),
the §7 table updated, an ADR-011 amendment, and the `ROOT_PATHS` contradiction resolved rather
than left standing.

### Track H — Dogfood deployment *(sequential, owner-driven, after A–D merge)*

**IdP settled 2026-08-22: Authelia** (§7.3). The OIDC half of this track is therefore a configuration exercise against a provider the manual is already written for, not an integration question.

Not agent work alone: deploy the released images to the homelab behind HTTPS, create the family's IdP users, set `JITPACK_ADMIN_EMAILS`, install on every phone, seed the real inventory/templates (the M2 dev seed is dev-only — real data is typed or imported via M15/M18), run a weekend-trip pilot before the actual vacation. Every friction found here becomes an issue; expect Track B's specs to grow from it.

## 5. Parallelization map

| Track | Depends on | Conflicts with | Start |
|---|---|---|---|
| A — PWA shell | — | C (both touch SW story; A owns `sw.js`) | now |
| B — server e2e | — | — | now |
| C — durable outbox | B for its e2e only; A owns the SW file | A (coordination, not code: C never edits `sw.js`) | now (client part) |
| D — release+docs | — | — | now |
| E — i18n | — | — | now |
| F — backup tables | — | — | now |
| G — UX polish | — | — | now |
| H — dogfood | A, B, C, D merged | — | after first release |
| I — back-button class | — | none (router + global header) | **next up** |
| J — trip editing | — | none (new surface + mutations) | after its two decisions |

Six tracks can fan out immediately. Recommended first wave if agent count is limited: **A, B, D** (the three blockers with no dependencies), then C, with E/F/G filling in.

## 6. Rules every track inherits (short form — CLAUDE.md is binding)

- Worktree off `origin/main`, never commit to `main`, PR → green CI → `/pr-review` verdict posted → **stop and wait for the merge go-ahead**. Delete worktree+branch after the merge.
- `make ci` green before finishing; UI changes are rendered and eyeballed (artifact link or :3000 with a click path), and ship a *running* Playwright case.
- Test-first; no timing-based tests; a "did not happen" assertion needs a positive signal; make the mutation the test should catch and watch it fall.
- Specs move in the same commit (PRD Addendum / UI-Spec / Sync-API-Spec / UI-Test-Spec / `docs/`); ADR only for a real tradeoff (Track A step 3 has one).
- i18n from the first line on any new/touched surface; colours/type/shape from the three token tables (invariants 9/9b — the gate enforces it).
- Schema changes edit `internal/store/schema.sql` (ADR-018, no migrations) and mean reseeding every dev database, `:3000` included.

## 7. Open decisions for the owner

1. ~~**Sign-off on this cut**~~ — **decided 2026-08-20**: approved, FR-27.13 and §3.28 wait until after the vacation.
2. ~~**Multiple parallel open PRs**~~ — **decided 2026-08-20**: allowed for this push; merges stay serialized and each still needs its own go-ahead.
3. ~~**IdP**~~ — **decided 2026-08-22: Authelia**, the owner's own instance, over OIDC. It confirms the built assumption rather than changing it: `docs/authentication.md` already names Authelia the reference provider (*where Authelia prescribes something, JIT-Pack conforms to it*), carries the paste-ready confidential-client block, and its three session-ending cases are verified against 4.39.20. `deploy/multi-user/docker-compose.yml` takes the issuer from the environment, which is the shape an already-running Authelia needs. **Nothing is owed in code or docs for this decision.** The one thing to carry into Track H is Authelia's own asymmetry (ADR1): marking a user *disabled* there blocks new logins but keeps honouring refresh tokens already issued — shutting an account out means revoking its tokens at Authelia or deactivating it in JIT-Pack.
4. **Upgrade stance for the vacation**: pin one digest and freeze (recommended in Track D) vs. building image-export tooling now.
5. Track A step 3: hand-rolled SW vs `vite-plugin-pwa` — the ADR will present it, but a prior leaning saves a round-trip.
6. ~~**Track I shape**~~ — **built as A** (2026-08-21): a global action carries its origin, stamped by the router rather than by each link. B (Settings as an overlay) was weighed and lost in the ADR-011 amendment: it fixes Settings and does nothing for the two import flows, which were half the defect. Say so if you want B instead — the branch is one guard and one branch in `backTarget`.
7. ~~**Track J shape**~~ — **decided 2026-08-21**: own screen from M4's cluster (M22). Merged as `443327d`.
8. ~~**Track J consequences**~~ — **decided 2026-08-21**: adding pulls the `per_person` positions immediately; removing takes the person's *untouched* rows and asks about the packed ones. FR-27.4 already specified it — the amendment there changed only the timing.
