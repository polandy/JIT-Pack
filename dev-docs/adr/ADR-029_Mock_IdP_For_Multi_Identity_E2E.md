# ADR-029: How the suite gets a second account — a mock IdP fixture vs. a real provider vs. a test-only bypass

**Status:** Accepted
**Related:** UI-Test-Spec §2.3 (mode `server`), ADR-007 (the OIDC broker being driven), NFR-4.8 (no IdP required to
run), NFR-4.3 (dependency footprint), invariant 5 (three modes, one artifact), invariant 8 (everything pinned by hash),
FR-5.7 / ADR-028 (the takeover this unblocks), E2E-G3-01 / E2E-G3-02, MVP plan Track B

**Decision Drivers (in priority order):**
1. **Two different accounts, driven through the app.** Everything the project exists for — whose name is on a claimed
   row, who packed an item, who may take a row over — is unreachable with one identity. The `single` project has had two
   browser contexts since August and can prove none of it.
2. **The login path itself is under test.** ADR-007's broker is where identity enters the product: code + PKCE verifier,
   exchange, ID-token verification, UserInfo, JIT provisioning. A harness that skips it makes the display name a fixture
   rather than a fact, and the display name is what every assertion here reads.
3. **The shipped artifact must not grow a test seam.** Invariant 5 says behaviour is selected at runtime, not by a
   build; a bypass that exists only for tests is a second authentication path in production code.
4. **It must run where CI runs, in the time CI has** — inside the pinned Playwright image, with no network beyond
   localhost, on a two-core runner.
5. **Cost to build and to keep.**

---

## Considered Options

### Option A — a mock IdP fixture in the harness *(recommended, accepted)*

A ~250-line Node module under `client/e2e/server/` implementing the four surfaces the broker actually uses: discovery,
JWKS, the authorization-code grant with PKCE S256, and UserInfo. It signs RS256 with a keypair generated at start-up
(`node:crypto`, no dependency), and `/authorize` renders an account chooser so the *test* picks who logs in.

**Pros**

- Two real accounts, and the login is the product's own: the browser leaves the app's origin, comes back with a code,
  the server exchanges it and provisions the user (drivers 1 and 2).
- Nothing is added to the shipped artifact — the fixture is test-only, which is also what keeps NFR-4.8 intact (driver
  3).
- Starts in milliseconds inside the Playwright image with no image pull and no network (driver 4). Ordering against
  jitpackd's start-up discovery is solved by construction: one launcher starts the IdP, then spawns the server.
- The failure modes it cannot produce are named rather than pretended away (see Consequences).

**Cons**

- **It is not Authelia.** Provider-specific behaviour — Authelia's `email_verified` handling, its refresh-token
  asymmetry for disabled users (ADR1), consent screens — is unreachable here, so an integration defect against the real
  IdP still ships green.
- A second implementation of an OIDC *server*, however small, is code that can drift from the spec the broker reads.

### Option B — a real Authelia container in the harness

Run the reference provider (the one `docs/authentication.md` is written against) as a container beside the backend, with
a static users file.

**Pros**

- Covers driver 2 completely and driver 1 as well as A does — the login path is the real one end to end, including the
  provider quirks A cannot reproduce.
- The instance under test resembles the family instance exactly.

**Cons**

- **The image is a third pinned toolchain decision** (invariant 8): another digest to bump by hand, and a provider
  upgrade becomes a red suite for reasons that have nothing to do with the change under review.
- Start-up cost per run — image pull plus Authelia's own boot — against a suite whose whole `server` project runs in ~27
  s today.
- Its configuration is a second product to learn and keep: sessions, storage, notifier, a users file with hashed
  passwords, and a login form that the suite must drive through and that changes between versions.
- Nested containers: the suite already runs *inside* the pinned Playwright image, so this needs either a sibling
  container on the host network or docker-in-docker in CI.

### Option C — a test-only authentication bypass in jitpackd

An env-gated mode where a header or a query parameter names the user, so the suite can be any account without an IdP at
all.

**Pros**

- Cheapest by far, and completely deterministic.
- No fixture to maintain, no second OIDC implementation.

**Cons**

- **A second authentication path in the shipped binary**, gated by an environment variable — exactly the shape invariant
  5 forbids, and the one bug class nobody would find funny in a self-hosted app that holds a family's data (driver 3).
- Driver 2 goes entirely uncovered: the broker, the PKCE exchange and JIT provisioning would have *no* running coverage
  in the app, which is where they are least covered today.
- The display names would be the harness's own invention, so every identity assertion would be asserting the fixture.

---

## Decision Matrix

| Driver | Weight | A (mock IdP fixture) | B (real Authelia) | C (test-only bypass) |
|---|---|---|---|---|
| Two accounts, driven through the app | 5 | 5 | 5 | 4 — accounts, but not through the login |
| The login path itself is covered | 4 | 4 — the broker's whole path, against a stand-in provider | 5 — the real provider too | 0 |
| No test seam in the shipped artifact | 5 | 5 | 5 | 0 |
| Runs where and as fast as CI needs | 4 | 5 — milliseconds, no image | 2 — image pull, boot, nested containers | 5 |
| Cost to build and keep | 2 | 3 — ~250 lines, four endpoints | 2 — a provider's configuration surface | 5 |
| **Total** | | **86** | **71** | **45** |

---

## Decision

The suite gets its second account from a **mock IdP fixture** in `client/e2e/server/mockIdp.mjs`, started together with
a multi-user `jitpackd` by `client/e2e/server/backend.mjs` and driven through the app's real login. The shipped binary
learns nothing about tests.

Two harness consequences follow from it and are decided here rather than left to a comment: the `server` project runs
its **own backend and its own `vite preview`** (Single-User and multi-user are mutually exclusive configurations of one
process, and the client reaches its server same-origin), and the IdP is started **before** the backend by one launcher,
because jitpackd resolves discovery at start-up and exits when the issuer does not answer.

## Consequences

**Positive**

- E2E-G3-01's identity half and E2E-G3-02's takeover half become runnable — both had been waiting on this since
  2026-08-22, and the takeover found a real defect the day the project first ran.
- The broker path (ADR-007) gains running coverage in the product, not only in Go tests.
- Two accounts make membership, attribution and presence assertable, so FR-4.5, FR-25.9 and G-10 stop being unverifiable
  at the screen.

**Negative / accepted costs**

- **A real-provider integration defect still ships green.** Named, not mitigated: the pre-release check against a real
  Authelia stays the manual step §2.3 and the UI-Test-Spec already call for, and Track H's dogfood deployment is where
  it is actually paid. **Partly paid 2026-08-30**: the part of that check that reads *published metadata* is now
  `internal/api/realprovider_test.go`, opted into with `JITPACK_REAL_IDP_ISSUER` and skipped everywhere else — it
  asserts, against the live provider, every capability the broker and the client depend on, and it runs the shipped
  `FetchDiscovery` rather than a second reading of it. It does **not** narrow this cost as far as it looks: metadata
  says what a provider *offers*, never what it does, so the login itself, the second factor, the consent screen, the
  refresh grant and the disabled-account asymmetry stay a person's job. The procedure for those is written down in
  `dev-docs/e2e-tests.md` instead of being an intention.
- A second OIDC server implementation exists in the repo. It is bounded to the four endpoints the broker calls, and it
  drifts loudly rather than quietly: a change to the broker's expectations fails the whole `server` project at login.
- CI grows a job (~1 min): the backend-backed projects cannot share a run.

**Neutral**

- NFR-4.8 is untouched: nothing about the shipped artifact requires an IdP, and the `single` project still boots with no
  network to one.
- The fixture's credentials and session secret are test material by construction — the only IdP that honours them is
  started by the config that names them and lives for the run.

## Revisit Trigger

**A defect reaches the family instance that this harness could not have caught** — an Authelia-specific claim, a consent
step, a refresh asymmetry. That is the evidence B was worth its cost, and the answer then is to add a real-provider job
beside this one rather than to replace it: the fast fixture is what makes the identity cases runnable on every PR.

**Or:** the fixture grows a fifth endpoint. Four is the broker's surface; a fifth means the suite is testing the IdP
rather than the app, and the option to run the real one deserves a second reading.
