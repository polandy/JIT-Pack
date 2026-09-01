# ADR-043: One container serves the client and the API — a runtime web root vs. an embedded bundle vs. keeping nginx

**Status:** Accepted
**Related:** ADR-027 (route shapes), NFR-4.3 (footprint), NFR-4.13 (PWA update policy), invariant 5 (three modes, one artifact), invariant 8 (pinned toolchains), Sync-API §7 (the same-origin handshake)

**Decision Drivers (in priority order):**
1. **Fewer moving parts in the deployment.** A self-hosted app is operated by one person in their spare time. Every container, config file and proxy rule is something that can be wrong at 23:00 on a Tuesday.
2. **The same-origin requirement is satisfied by construction, not by configuration.** The API sets no CORS headers and the WebSocket refuses a cross-origin handshake, so the two halves must share an origin. Until now that was a *rule the operator had to keep* — and the one deployment that broke it (`proxy_set_header Host $host`, #181) failed silently, with every REST call green and only sync dead.
3. **A fresh clone must still build with `go build ./...`.** The Go toolchain alone, with no Node run and no generated file checked in.
4. **The published artifact stays the thing the tests exercise** (invariant 8): whatever version builds the bundle has to be named where the toolchain gate can see it.

---

## Considered Options

### Option A — a runtime web root (`JITPACK_WEB_ROOT`) *(recommended, accepted)*

`internal/webui` wraps the API handler: requests under the API's own prefixes go to the API, everything else is served from a directory of static files, with the history fallback the client's routing needs. `cmd/jitpackd` builds that wrapper only when `JITPACK_WEB_ROOT` is set. The root `Dockerfile` grows a Node stage that builds the client into `/srv/web` and sets the variable, so the image is the whole app and the binary alone is unchanged.

**Pros**
- One container, one origin, no proxy rules to get right; the `/ws` trap simply cannot be sprung by a default deployment.
- `go build ./...` is untouched — the Go side never needs a `dist` to exist.
- A UI-only change does not relink the binary.
- Serving the client from a CDN or an existing web server stays supported: leave the variable unset.

**Cons**
- The binary alone is not the whole app; "one artifact" is true of the *image*, not of the file.
- A directory can be missing or wrong at runtime, which is a failure mode a compiled-in bundle does not have. Paid for by refusing to start: a root with no `index.html` is a startup error naming the path.

### Option B — `//go:embed` the bundle into the binary

**Pros**
- Literally one file: the binary is the app, which is the strongest possible version of driver 1.
- No runtime path to misconfigure.

**Cons**
- `go:embed` cannot reach outside its package directory, so `client/dist` has to be copied to `internal/webui/dist` before *any* Go build. A fresh clone would fail to compile until Node had run, breaking driver 3 — unless a placeholder `index.html` is committed, which then introduces the failure this option was chosen to avoid: an image built with the placeholder starts, passes every check and serves a white page.
- Every UI change relinks the binary and invalidates the Go build cache.

### Option C — keep nginx in front (the shape being replaced)

**Pros**
- Static files served by software that does nothing else; caching, ranges and compression are somebody else's problem.
- The client image is independently useful to a deployment that wants only the SPA.

**Cons**
- Two images, two Dockerfiles, two base-image update streams, an `upstream` hard-wired to the hostname `app`, and a routing table the operator must reproduce for any other proxy.
- The same-origin rule stays an operator responsibility, and its violation is silent (driver 2).
- The nginx config was a third place the API's own path surface was written down.

---

## Decision Matrix

| Driver | Weight | A: runtime root | B: embed | C: nginx |
|---|---|---|---|---|
| Fewer moving parts | 5 | 5 — one container, one config value | 5 — one file | 1 — two images plus a routing table |
| Same origin by construction | 5 | 5 — one server | 5 — one server | 1 — a rule the operator keeps |
| `go build ./...` in a fresh clone | 4 | 5 — unchanged | 1 — needs Node first, or a committed placeholder | 5 — unchanged |
| Published artifact is what was tested | 3 | 4 — the node major moves into the root Dockerfile, where the gate reads it | 4 — same | 4 — the gate already covered it |
| **Total** | | **77** | **57** | **44** |

---

## Decision

`jitpackd` serves the built client from `JITPACK_WEB_ROOT` on the same origin as the API, and the published image sets that variable to a bundle it builds itself. `client/Dockerfile`, `client/nginx.conf` and the `ghcr.io/polandy/jit-pack-client` image are deleted; `docker.yml` publishes one image.

## Consequences

**Positive**
- The README's long-standing "one container" quickstart became true: before this, `docker run ghcr.io/polandy/jit-pack` served a 404 at `/`.
- `scripts/proxy-host-gate.mjs` now guards only the manual's copy-paste blocks; the shipped configuration it was written for no longer exists.
- The `docker-build` job asserts the *served* app, not just a successful build (`scripts/docker-smoke.sh`): a bundle that never reached `/srv/web` produces a green build and a 404 for every browser, and nothing else in CI would have seen it.
- Two cache rules are now the server's own and are tested: content-hashed `/assets/` are immutable, everything else revalidates — which is what NFR-4.13's update policy needs from the transport.

**Negative / accepted costs**
- The image build is longer: Node and Go stages run in series where two images built in parallel.
- The root `Dockerfile` names a node major, so a bump there is a four-file change (it was already a three-file one) — held by `scripts/toolchain-pins-gate.sh`, which now reads node from the root Dockerfile.
- A deployment pulling `ghcr.io/polandy/jit-pack-client` stops receiving updates. It is replaced by the single image, and the standalone bundle is still `npm run build`.
- `internal/webui` is a fourth package in a codebase that keeps its layers deliberately thin. It imports only the standard library and does not import `internal/api` — the API's prefixes are passed in — so invariant 1's direction is unaffected.

**Neutral**
- `JITPACK_WEB_ROOT` unset reproduces exactly the previous behaviour, so the API-only shape is a configuration rather than a mode (invariant 5 is about *product* modes; this is not one).

## Revisit Trigger

The web root becomes a compiled-in bundle (option B) if the project ever ships a binary release without a container — at that point "download one file and run it" is the product, and the committed-placeholder risk is worth taking with a gate against it. Conversely, if static-asset serving grows requirements the standard library does not answer (byte ranges for video, on-the-fly compression, per-path auth), option C comes back for those assets alone.
