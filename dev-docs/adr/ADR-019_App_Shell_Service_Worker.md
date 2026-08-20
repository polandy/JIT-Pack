# ADR-019: App-shell caching — a hand-rolled service worker vs. vite-plugin-pwa

**Status:** Accepted (2026-08-20)
**Related:** NFR-4.13 (installable PWA, app shell), NFR-4.6 (Web Push — the same worker script), NFR-4.3 (footprint), NFR-4.2a (why `/api`, `/ws`, `/health` are never cached), invariant 8 (pinning), ADR-005 (push), `client/public/sw.js`, `client/vite.config.ts` (`jitpack-sw-precache`), `client/src/pwa/register.ts`

**Decision Drivers (in priority order):**
1. **The push path must keep working untouched** (NFR-4.6). `public/sw.js` has carried the push and notification-click handlers since ADR-005; whatever adds the shell cache must not regenerate, wrap or relocate them.
2. **The data story must stay out of the HTTP cache** (NFR-4.2a). Trips live in IndexedDB or behind the sync protocol; a caching layer that touches `/api`, `/ws` or `/health` hands the merge algorithm's job to a cache. The bypass must be legible and reviewable, not a config option three layers down.
3. **Footprint** (NFR-4.3, standard-library-first). A new dependency needs to buy something the platform does not already give.
4. **Reviewability of the update story.** "New version activates on next launch, the app only announces it" is a policy the owner decided; the code that implements it should be readable as that sentence.

---

## Considered Options

### Option A — Hand-rolled: extend `public/sw.js`, precache manifest injected by a ~50-line Vite plugin *(recommended, accepted)*

The existing worker gains three listeners (`install`, `activate`, `fetch`); a small plugin in `vite.config.ts` prepends the built file list and a content hash to `dist/sw.js` after the bundle is written. No new dependency, no second worker, no build-time code generation.

**Pros**
- The push handlers stay byte-for-byte where they are; the diff is additive.
- The whole offline story is one readable file: the never-cache rule is a named
  function (`bypassed`) at the top, the update policy is the *absence* of
  `skipWaiting()` with a comment saying so.
- Zero dependencies (NFR-4.3); nothing new for Dependabot or invariant 8 to pin.
- The precache manifest is trivially inspectable — `head -2 dist/sw.js`.

**Cons**
- We own every cache bug. Workbox has a decade of edge cases baked in, and one
  bit us immediately: `Vary: Origin` on statically served assets made every
  `caches.match(request)` miss (Vite emits `crossorigin` module scripts, so
  page requests carry an `Origin` header that install-time `addAll` fetches do
  not). Workbox ignores `Vary` for precached, content-hashed files by default;
  we now do the same, but we had to learn why.
- No ready-made extras (navigation preload, broadcast update, expiring runtime
  caches). Each future want is code we write.

### Option B — `vite-plugin-pwa` (Workbox) in `injectManifest` mode

The plugin generates the precache manifest and injects it into a source worker we still author (so the push handlers survive), pulling in `workbox-precaching`/`workbox-routing` as the runtime.

**Pros**
- Battle-tested cache semantics: the `Vary` pitfall, revisioned-URL handling,
  cache cleanup and update plumbing are solved and maintained upstream.
- The manifest generation follows Vite's build graph exactly (including
  `base`, out-of-dir assets) rather than re-walking `dist/`.
- Well-trodden update-UX recipes (`workbox-window`) if the announcement
  surface ever grows.

**Cons**
- A large dependency subtree (vite-plugin-pwa → workbox-build → ~100 packages
  including Rollup-plugin machinery) for what the platform API expresses in
  ~60 lines — against NFR-4.3 and the standard-library-first rule.
- The never-cache rule becomes plugin configuration (`navigateFallbackDenylist`,
  runtime-caching route order) instead of a visible `if` — reviewing driver 2
  means reading Workbox docs, not this repo.
- `generateSW` mode (the default) would replace the worker and lose the push
  handlers; `injectManifest` avoids that but keeps the whole subtree just for
  the manifest walk we can do ourselves.

---

## Decision Matrix

| Driver | Weight | A — hand-rolled | B — vite-plugin-pwa |
|---|---|---|---|
| Push path untouched (NFR-4.6) | 4 | 4 — additive diff in the same file | 3 — safe only in `injectManifest` mode, a config trap away from regenerating the worker |
| `/api`,`/ws`,`/health` bypass legible (NFR-4.2a) | 4 | 4 — a named function at the top of the file | 2 — denylist config interpreted by Workbox routing |
| Footprint (NFR-4.3) | 3 | 4 — zero new packages | 1 — workbox-build subtree for a file walk |
| Update policy reviewable | 2 | 3 — policy is visible (no `skipWaiting`), but we own its correctness | 3 — recipes exist, semantics live upstream |
| Cache-semantics correctness | 2 | 2 — we own the edge cases (`Vary` already paid for) | 4 — solved upstream for a decade |
| **Total** | | **52** | 36 |

---

## Decision

Extend the existing `public/sw.js` by hand: precache the built bundle (manifest injected by the `jitpack-sw-precache` plugin in `vite.config.ts`, versioned by a content hash), cache-first for the content-hashed assets, network-first with a cached-shell fallback for navigations, and a hard bypass for `/api/`, `/ws` and `/health`. No `skipWaiting()`: a new version installs in the background and takes over on the next launch; the running app only flips `swUpdateReady` (G-2 detail sheet).

## Consequences

**Positive**
- One worker file tells the whole story — push, shell, bypass, update policy.
- No new supply chain to pin; the build stays fully deterministic (the version
  hash is derived from file contents, so an unchanged bundle keeps its cache).
- E2E-PWA-01/02 assert the two behaviours that matter (offline shell paints;
  `/health` never appears in a cache) against the real built worker.

**Negative / accepted costs**
- Every future cache subtlety is ours. The `Vary: Origin` miss is the recorded
  precedent: platform cache matching is stricter than it looks, and the fix
  (`ignoreVary: true` for our content-hashed files) lives in `sw.js` with the
  full story in a comment.
- The precache walk trusts `dist/` to be exactly the deployable artifact. A
  build step that starts writing non-deployable files into `dist/` would bloat
  the cache (and the version hash would at least change loudly).
- No navigation preload: the first online navigation after activation pays an
  unoptimised worker startup. Measured in milliseconds, accepted.

**Neutral**
- Dev builds never register the shell worker (`import.meta.env.PROD` guard);
  `sw.js` served raw by the dev server stays inert via its injected-globals
  fallbacks.

## Revisit Trigger

Adopt Workbox (Option B, `injectManifest`) the day the worker needs a second
cache *strategy* — runtime caching with expiry (item photos, ADR-002's blob
endpoints), broadcast-update, or background sync. At that point the edge-case
surface stops being one file's worth, and the footprint argument flips.
