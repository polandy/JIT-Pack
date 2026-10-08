# M19 — First-Launch Mode Selection

> M19 is the screen every other spec **bypasses**: `seedMode` writes `jitpack_mode` into localStorage before boot, so
> only the cases below *make* the choice this screen exists for. The two ids that describe the connect path are half
> unbuilt by decision, and the unbuilt half is the same clause twice.

* **E2E-M19-01** `local` (FR-19.1, NFR-4.11) — **implemented** (`smoke.spec.ts`): the two cards, and in the same
  case *"Just on this device"* lands on M1's empty
  state (G-7), the device asks the browser to keep what is now its only copy, and a reload does not ask again. The
  persistence request is asserted through a stubbed `navigator.storage` whose `persisted()` answers false, so the
  request is actually made and the case does not depend on whether *this* browser grants it. It happens on the boot
  after the choice rather than in the click handler — `connect()` asks, once the mode is persisted — which is what
  NFR-4.11's *"on first launch"* means in a client that re-inits by reloading.
* **E2E-M19-02** `server/single` (FR-19.1) — **the two destinations are covered; the validation in front of them is not
  built.** The `server` destination is asserted by `loginAs` (`e2e/server/fixtures.ts`) in every multi-identity case: no
  session + an instance that offers OIDC → the login screen, and through it the real broker. The `single` destination is
  **E2E-M19-02's own case** (`e2e/single/mode-discovery.spec.ts`) — it asserts the 501 from
  `/auth/config` beside the rendered dashboard, because "no login screen" is equally green on a device that never asked,
  and because invariant 5's whole Single-User distinction is that one response. ~~validates the URL against the health
  endpoint~~ — **not built**: `ModeSelectionPage.vue` validates the URL's *syntax* (parses, and `http:`/`https:`),
  stores it and reloads; nothing requests `/health`. **Struck by decision: the check is not buildable as specified.**
  The API sets no CORS headers, deliberately, so a cross-origin probe cannot tell an unreachable host from a reachable
  one that will not answer a scripted request — the promised
  inline error would lie to whoever's instance is healthy. That is a contradiction between two decisions, not a test
  gap, and no amount of test-writing resolves it. The app learns the truth at the login attempt, where the server
  answers for itself. The field arrives **pre-filled with the page's own origin**
  (E2E-M19-04), which is the correct answer for every self-hosted instance.
* **E2E-M19-03** ~~`local` (FR-19.1): unreachable server URL → inline error, stays on the screen.~~ — **struck by
  decision, together with E2E-M19-02's validation clause: there is no connectivity check and none is owed.** There is no
  connectivity check, so there is no failure to report: an unreachable URL is accepted, the app reloads into the shell,
  and the G-2 indicator says offline from there on. The inline error that *does* exist is the
  syntax one (`firstRun.serverUrlInvalid`), which is a different promise.
* **E2E-M19-04** `local` (FR-19.1) — **implemented** (`smoke.spec.ts`): the field carries the page's origin and Connect
  is reachable without typing. Asserted on the inner `button`, since `toBeEnabled()` on an `ion-button` host is
  false-green. The value stands in a painted box of its own colour, not as a caption on the card (UX-21,
  `expectValueInABox`; E2E-M17-14b asserts the same of M17's move card).
* **E2E-M19-05** `local` (FR-19.1, Sync-API §2) — **implemented** (`login-screen.spec.ts`): a `server`-mode device on
  the login screen whose `/auth/config` comes back as a gateway failure is told the server did not answer, is *not* told
  the server requires no login, and keeps the sign-in. The 501 is the only answer that means no login is needed; a
  bare `!resp.ok` check would read both non-answers as that flag. The default project is the fixture here — it runs no
  backend behind its preview, so the failure is real rather than routed. The second non-answer, a fetch that never
  lands, is a unit case in `LoginPage.spec.ts`: a preview server cannot be asked to produce a rejected fetch, and
  routing one would assert against the route.
