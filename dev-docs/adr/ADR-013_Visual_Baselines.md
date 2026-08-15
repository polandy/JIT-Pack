# ADR-013: Visual Baselines — Pinned Container vs. Runner-Native vs. Local-Only

**Status:** Accepted
**Related:** ADR-006 (client framework), invariant 8 (everything resolves to an exact version verified by hash), FR-21.5–21.8 (the design foundation these baselines guard), `dev-docs/design-foundation-plan.md` PR 5, `dev-docs/UI_Test_Spec_v1.0.md` §3

**Decision Drivers (in priority order):**

1. **A baseline that fails for the wrong reason is worse than no baseline.** A visual suite that goes red on an intended change *and* on a font-hinting difference teaches the maintainer to ignore it, at which point it guards nothing while still costing a job. Determinism is not one property among several here; it is the whole value.
2. **The maintainer must be able to update baselines from the machine they work on.** If accepting an intended change means pushing a commit and copying files back out of CI, the suite is a tax rather than a tool, and it will be deleted.
3. **Invariant 8 — a rendering environment is a dependency.** A "browser on the runner" is as much an unpinned dependency as a bare Docker tag; it changes under you when the runner image rolls.
4. **The phone-first layout is the one worth guarding** (NFR-4.12's screens are drawn at 390 px in the concept prototype). Baselines at a desktop viewport only would protect the layout nobody sees first.
5. **Footprint (NFR-4.3).** A new CI job that pulls a browser image on every pull request costs minutes and bandwidth.

---

## Considered Options

### Option A — Chromium only, inside the digest-pinned Playwright container, locally and in CI *(recommended, accepted)*

A separate Playwright project (`visual`) excluded from the default run, executed by `make visual` and by a CI job that runs the tests **inside `mcr.microsoft.com/playwright` pinned by digest**. The same image renders the baselines on the maintainer's machine and checks them in CI, so the two agree byte for byte. WebKit is excluded: a second engine doubles the baselines and the review burden while guarding the same CSS.

**Pros**

- Local and CI render in the same userland — same fontconfig, same FreeType, same Chromium build. Updating a baseline is `make visual-update` and a commit.
- Honours invariant 8: the renderer is pinned by `@sha256:` like every other image.
- The maintainer's NixOS host already cannot run Playwright's downloaded browsers (`client/e2e/README.md`), so the container is the local path regardless. This makes that constraint an asset rather than a workaround.

**Cons**

- **A CI job that pulls a browser image on every PR.** ~2 GB, a minute or two, on top of the existing `e2e` job which does *not* use the container.
- The pinned digest must be bumped deliberately, and every bump rewrites every baseline. That is a real chore, and it arrives as a large, unreviewable diff.
- Two different ways of running browsers now exist in CI: `e2e` on the runner, `visual` in the container. Anyone reading `ci.yml` has to learn why.

### Option B — Runner-native, matching the existing `e2e` job

Generate and check baselines on `ubuntu-latest` with `npx playwright install`, exactly as `e2e` runs today. No new container.

**Pros**

- No image pull; reuses the browser cache the `e2e` job already warms.
- One way of running browsers in CI instead of two.

**Cons**

- **The maintainer cannot reproduce it.** NixOS cannot launch Playwright's downloaded browsers, so local runs happen in the container — which renders differently from the runner. Accepting an intended change would mean pushing, letting CI fail, downloading the actual-image artifacts, and committing them blind. Driver 2 fails outright.
- The runner image is unpinned by nature; a GitHub runner update can change font rendering and turn every baseline red for no reason anyone changed. Driver 1 and 3 both fail.

### Option C — Local-only tool, no CI check

`make visual` exists; nothing runs in CI. Baselines are a thing the maintainer consults before asking for a merge.

**Pros**

- Zero CI cost, zero new infrastructure, no digest to maintain.
- No false reds, because nothing is enforced.

**Cons**

- **It does not do the job.** The point of step 5 is to turn "looks right" from a permanent debt into a one-time acceptance *per change* — which requires something to notice the change. A check nobody runs automatically is the eyeball pass with extra steps.
- Baselines rot silently: nothing tells you they stopped matching until someone happens to look.

---

## Decision Matrix

| Driver | Weight | A — pinned container | B — runner-native | C — local only |
|---|---|---|---|---|
| Fails only for the right reason | 5 | **5** — one pinned userland renders both sides | 1 — runner image rolls under you | 3 — nothing to fail, nothing to trust |
| Maintainer can update baselines locally | 5 | **5** — same image, `make visual-update` | 0 — cannot reproduce CI at all on NixOS | 5 — trivially, it is all local |
| Renderer pinned by hash (invariant 8) | 4 | **4** — `@sha256:` like every other image | 1 — runner image is not pinned | 2 — pinned locally, enforced nowhere |
| Guards the phone-first layout | 3 | **3** — 390 px project alongside desktop | 3 — same, if configured | 3 — same, if run |
| Footprint (NFR-4.3) | 2 | 0 — an image pull per PR | **2** — reuses the existing cache | **2** — no CI cost |
| **Total** | | **17** | 7 | 15 |

Option C scores close, and the gap is entirely driver 1 read honestly: "nothing can fail" is not the same as "failures are trustworthy". It was rejected on what it *cannot* do rather than on points.

---

## Decision

Visual baselines run **Chromium only, inside the `mcr.microsoft.com/playwright` image pinned by digest**, as a `visual` Playwright project that the default run excludes. `make visual` checks, `make visual-update` rewrites, and a CI job runs the same image so the two agree byte for byte. Two viewports: **390 px** (the width the concept prototype is drawn at) and desktop. The job is **not** a required check, for the same reason `e2e` is not — it `needs` the client build, and a skipped required check blocks a PR with a less useful message than the build failure itself.

## Consequences

**Positive**

- "Looks right" becomes assertable. The four token PRs before this each shipped a hand-built screenshot artifact because nothing else could show what changed; from here a diff does that automatically and the artifact is for explaining, not for detecting.
- The 390 px viewport is guarded, which is where every design decision in the concept prototype was actually made.
- A baseline update is a reviewable diff in the PR that causes it — an intended visual change becomes visible in review rather than being discovered later.

**Negative / accepted costs**

- **A second browser mechanism in CI.** `e2e` on the runner, `visual` in the container. `ci.yml` carries a comment saying why; without it this reads as an inconsistency somebody forgot to clean up.
- **Digest bumps rewrite every baseline.** The diff will be large and genuinely unreviewable image-by-image; the honest review is "the digest changed, the images changed, spot-check a few".
- **PNGs in the repository.** They grow the clone, and they grow it permanently — git keeps every version. This is the cost that would eventually force a revisit.
- **WebKit is not covered visually.** It stays covered behaviourally by the `e2e` job. A WebKit-only rendering bug will not be caught by a baseline.

**Neutral**

- The dev gallery that ships alongside these baselines is **deliberately not one of them**. It is `import.meta.env.DEV`-only, following `client/src/dev/sampleTrip.ts`, so it does not exist in the bundle the visual project runs against. That is a real limit — component states are not regression-guarded — and the alternative was worse: shipping a developer surface into every self-hosted instance to make it screenshottable. The gallery's job is to make *human* review cheap; the baselines' job is to make regression detection automatic. Different tools, and conflating them would have cost the bundle.

## Revisit Trigger

**When the baseline images pass ~20 MB in the working tree, or a digest bump lands for the third time in a year.** The first says the repository is paying too much for the coverage; the second says the chore has become routine enough to deserve automation (a scheduled bump PR that regenerates and opens for review) or a different storage strategy (an artifact store rather than git).

Sooner and independently: **if a WebKit-only rendering regression ever reaches the owner's eye**, the WebKit exclusion above is what let it through, and the cost of a second engine has to be re-weighed against having been wrong once.
