# M19 — First-Launch Mode Selection

* **Purpose:** One-time choice between Local Mode and Server Mode on first app launch (Addendum FR-19.1). Shown exactly
  once; the decision is persisted on-device and never re-asked.
* **Elements:** Two large option cards: *"Just on this device"* (Local Mode — one sentence explaining data stays on the
  device, no account or server needed, single device only) and *"Connect to a server"* (Server Mode — server URL input,
  ~~with connectivity check on confirm~~ — **not built, see Actions**). The URL field arrives **pre-filled with
  the page's own origin**, which is the correct answer for every self-hosted instance: the SPA and the API share one
  origin because the API sets no CORS headers. An explicit build-time `VITE_API_URL` wins over it, and the Vite dev
  server keeps its split-origin backend. Below the cards, one line noting that Local Mode data can later be moved to a
  server via export (FR-19.5).
* **Actions:** Selecting Local Mode persists the choice, requests persistent storage (NFR-4.11 — on the boot that
  follows, since choosing re-inits the app by reloading) and lands on M1 with an empty state (G-7); all of that is
  E2E-M19-01. Selecting Server Mode stores the URL and lets the app discover the instance: an instance offering OIDC
  sends the device to login, a Single-User instance answers `/auth/config` with 501 and the device lands on M1
  (E2E-M19-02, both halves). ~~validates the URL against the server's health endpoint~~ — **not buildable as
  specified.** The field validates its *syntax* only, and a check from this screen against a
  *different* origin cannot distinguish an unreachable host from a reachable one whose API sets no CORS headers — which
  ours does not, deliberately. So the promised inline error would report a healthy instance as unreachable, which is
  worse than not checking: the device would be told its server is down by a probe that never reached it. The app learns
  the truth one step later, at the login attempt, where the server answers for itself; the pre-filled origin above
  makes the check unnecessary in practice.
* **States:** Local Mode has no failure state (a denied persistent-storage request is not blocking — it surfaces later
  as the NFR-4.11 warning in the G-2 detail). A syntactically invalid URL disables *Connect* and says so inline. **The
  login screen this leads to has three states, not two:** `GET /auth/config` says *a login is needed* by answering with
  the IdP's endpoints and *no login is needed* by answering **501** `not_configured` — and that status is the only thing
  that means it. An unreachable server, a reverse proxy's 502 and a 500 are no answer at all, and filing them under *no
  login needed* would show *„Server nicht erreichbar“* and *„Dieser Server verlangt keine Anmeldung“* in the same
  breath, the reassuring half being the false one. Only the 501 hides the sign-in; anything else names the failure and
  leaves the button, because attempting the login is the only thing left that can find out. The sign-in path draws the
  same line — a 502 there reports a server that did not answer, not a server without OIDC. ~~An unreachable server URL
  shows an inline error and keeps the user on this screen~~ — **not built, with the health check above (E2E-M19-03):**
  with no connectivity check there is nothing to report, so an unreachable instance is accepted and shows as offline on
  the G-2 glyph afterwards.
* **Navigation:** Entry point of the app on first launch only. Not reachable from anywhere afterwards; switching modes
  later is the explicit migration path of FR-19.5, not a revisit of this screen — **that path starts on M17
  (FR-19.8), and this screen stays shown exactly once.**
