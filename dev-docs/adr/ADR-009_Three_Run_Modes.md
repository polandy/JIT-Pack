# ADR-009: Three Run Modes from One Artifact

**Status:** Accepted (recorded retroactively — the mode model grew across FR-17.3, FR-19.x and G-8 without a single
record naming it)
**Related:** ADR-008 (client-side generation), ADR-004 (auth strategy), FR-17.3 (Single-User Mode), FR-19.1–19.6 (Local
Mode), FR-23.x (instance admin), G-8 (hide what a mode cannot do)

**Decision Drivers (in priority order):**
1. A self-hosted product must be trivially runnable by one person with no identity provider — the setup cost of OIDC
   must not be the price of entry.
2. A user must be able to use the app with **no server at all**, and later migrate to one without losing data (FR-19.5).
3. One build artifact, one test surface. Modes must not multiply the things that can be shipped broken.
4. A mode must never present a control that cannot work in it.

---

## Considered Options

### Option A — One artifact, mode selected at runtime *(recommended, accepted)*

The client is a single bundle whose behaviour is decided by `jitpack_mode` in local storage — which holds only `local`
or `server`, plus `jitpack_server_url`. Single-User is **not** a client mode: a `server`-mode client discovers it by
being offered no OIDC config and hides the collaborative surface accordingly (G-8). The server is a single binary whose
constructor is chosen from env: `api.New` (HS256), `api.NewWithJWKS` (RS256/OIDC) or `api.NewSingleUser` (auth and
membership bypassed). Local Mode never contacts a server; `useSyncOrchestrator` takes an `IndexedDBPersistence` and its
enqueue/drain/WebSocket paths become no-ops, while `onPullChanges` stays the single funnel every change flows through.

**Pros**
- One bundle to build, sign, ship and cache; one Docker image.
- Local Mode is a *configuration* of the sync orchestrator rather than a parallel implementation — the code path that
  applies a change is literally the same function, so it cannot drift.
- Playwright can exercise every mode against the same artifact by seeding local storage, without separate builds
  (`client/e2e/fixtures.ts`).
- Collaborative features degrade by being hidden (G-8), not by erroring.

**Cons**
- **Every feature must be designed three times over in the author's head.** "What does this do in Single-User Mode? In
  Local Mode?" is a permanent tax on every PR, and forgetting it produces a dead control rather than a compile error.
- Code for modes a given user will never use ships to them anyway.
- Mode-conditional UI is a class of bug that types cannot catch.

### Option B — Separate builds per mode

Build-time flags produce a local-only bundle, a single-user bundle and a full bundle.

**Pros**
- Each artifact contains only what it needs; dead controls are impossible by construction.
- Smaller bundles.

**Cons**
- Three artifacts to build, test and release; the test matrix triples, and in practice two of the three get exercised
  rarely.
- FR-19.5 migration (Local → Server) means *replacing the installed app*, not flipping a setting — hostile on mobile,
  and the PWA cache makes it worse.
- The mode-conditional logic does not disappear, it just moves into the build system where it is harder to test.

### Option C — Server-only, no Local Mode

**Pros**
- One mode, no conditionals, the simplest possible product.

**Cons**
- Contradicts FR-19 outright, and with it the offline-first doctrine the product is built on. A packing list is used in
  places with no network and by people who will not run a server.

---

## Decision Matrix

| Driver | Weight | A (runtime) | B (per-build) | C (server-only) |
|---|---|---|---|---|
| Zero-setup entry (no IdP, no server) | 5 | 5 | 4 | 0 |
| Migration path between modes | 4 | 5 | 1 | 0 |
| One artifact / one test surface | 4 | 5 | 1 | 5 |
| No dead controls in a mode | 3 | 3 — needs discipline | 5 — structural | 5 |
| **Total** | | **74** | **43** | **35** |

---

## Decision

One client bundle and one server binary. The mode is a runtime selection: `jitpack_mode` on the client, the constructor
choice on the server. Local Mode is a config variant of the sync orchestrator, not a second implementation. Features
that cannot work in a mode are **hidden** per G-8, never left present and broken.

This is invariant 5 in `CLAUDE.md`.

## Consequences

**Positive**
- `M19 ModeSelectionPage` is the only mode-specific screen; everything else adapts.
- Local Mode inherits sync-shaped persistence, so FR-19.5 migration in both directions is just the portable-YAML
  export/import path.
- Single-User Mode makes the entire auth, membership, notification, admin and presence surface inert by bypassing
  `authed` — one bypass, not a feature-by-feature opt-out.

**Negative / accepted costs**
- Every feature PR must answer the three-mode question explicitly. The `/pr-review` skill checks it precisely because
  nothing else will.
- Mode-conditional rendering is untyped and only e2e coverage per mode catches a regression.
- Users receive code for modes they do not run.

**Neutral**
- Switching mode after the first choice deliberately requires the export/import path rather than a toggle: the two
  stores have no shared identity, and a silent switch would strand data.

## Revisit Trigger

Revisit if a fourth mode is proposed, or if bundle size becomes a measured problem attributable to unused-mode code (not
a suspicion — a measurement). Also revisit if mode-conditional UI produces repeated escaped defects despite the review
gate, which would argue that structural separation is worth the artifact multiplication after all.
