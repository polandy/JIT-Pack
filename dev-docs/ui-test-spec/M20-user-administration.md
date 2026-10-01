# M20 — User Administration

* **E2E-M20-01** `server` (FR-23.2) — **implemented**, in `e2e/server/admin.spec.ts`. Avatar, name, e-mail, provisioning
  date (in the *app's* language), usage counts, admin chip and the "you" marker are each asserted. One clause the screen
  answers differently: there is **no „active" chip**. A row's
  status is the deactivated chip *or nothing*, plus the dimming UI-Spec M20 names under States — so ~~status chip
  (active / deactivated)~~ is one chip and an absence, and the case pins what exists. The deactivated half is asserted
  by E2E-M20-02 and E2E-M20-06. **The dimming is deliberately asserted nowhere**: it restates the chip in colour, and
  the only way to assert it in Playwright is a class or an opacity, which is an assertion about the stylesheet rather
  than about the pixel (G-14's lesson in reverse).
* **E2E-M20-02** `server` (FR-23.3) — **implemented**. The confirmation's four sentences, the deactivated
  chip, the target's *own screen* falling back to the login, and the way back. Two notes.
  **The clause *„no Deactivate on admins"* is proved on the one row that is admin *and* own**, because the fixture
  instance has exactly one admin, so which of the two exemptions fired is not separable on screen —
  `domain/__tests__/admin.spec.ts` separates them. And FR-23.3's other sentence — *„open JIT provisioning does not
  resurrect a deactivated account"* — is **E2E-M20-06**.
* **E2E-M20-07** `server` (FR-23.3, ADR-047) — **implemented** (U-10): a deactivation reaches the *other*
  screens of the same session. Alice opens the FR-4.5 sharing picker on a trip of her own and Dave is offered; she
  deactivates him on M20; she opens the same picker again and he is not. **Every step is in-app** — a `page.goto`
  reboots the document, and a rebooted app re-fetches the directory whatever the store does, so a navigating-by-URL
  version of this case cannot fail. Bob is the standing control: the roster renders its picker only while a candidate
  exists, so *„Dave is not offered"* alone would be satisfied by a control that disappeared.
  The directory is fetched once per session, not on every screen's mount, so freshness is what the four identity
  writers owe. This is the one of those four with a surface a person can see.
* **E2E-M20-03** `server` (FR-23.4): Remove avatar / **Reset display name** — the name half only, and that is what the
  case asserts (the row falls back to the account id, pinned beside the list still holding the same number of rows). The
  avatar half is **E2E-M20-03b**.
* **E2E-M20-03b** `server` (FR-23.4/23.4a) — **implemented**, in `e2e/server/admin.spec.ts`: a picture is put
  on Dave's account through the app's own `self`-guarded endpoint, M20's row shows it laid over his initials, and
  *Remove avatar* takes it away leaving *DA*. (The admin cases use an account no other file logs in as — see
  `e2e-ledger/`, *„Two files, one account, two workers"*.) **The removal must show on M20**: the row is keyed by user
  id, so without FR-17.13's cache-busting query (which M17 carries too) a reload hands the same `<img>` the same `src`
  and the browser never asks again, and the avatar response carries `max-age=3600` so it would not be told anything if
  it did. Red-proved against a line without the query. The upload does not go through M17's control on purpose: the
  crop modal renders into a canvas with no settled signal, and this case is about M20's row.
* **E2E-M20-04** `server` (FR-23.5/23.1) — **implemented**: the per-row sheet is the only place an action
  could hide, and its buttons are **counted**, so a fourth cannot arrive unnoticed.
* **E2E-M20-05** `server` (FR-23.1/G-8) — **implemented** for the half that can be red-proved: a non-admin
  OIDC account is offered no entry in M17 *and* is served `admin-unavailable` at `/admin`. The clause ~~hidden entirely
  in `single`/`local`~~ **is not coverage and cannot be made into any**: the gate is `collaborative
  && me?.is_instance_admin`, and in both of those projects there is no `me` at all — so deleting the `collaborative`
  half leaves the row just as hidden, and a case asserting the absence there would be green against the rule being gone
  (the tautology shape). It stays hidden by construction; the assertion that can fail is the one this case makes.
* **E2E-M20-06** `server` (FR-23.3/23.6) — **implemented**, in `e2e/server/admin.spec.ts`: a deactivated
  account signs in again through the real broker, and the screen **names the reason**. FR-23.6 keeps provisioning open,
  so the IdP goes on vouching for the account; FR-23.3's answer is that this does not bring it back, *„otherwise
  deactivation would be meaningless"*. The store proves the login does not clear `deactivated_at` and `issueSession`
  refuses the exchange; the screen must not answer with *„The server rejected the login."*, the same sentence a
  replayed code gets — a permanent state read as a glitch, and a person told nothing. The callback narrows on the
  `account_deactivated` code exactly as `client.ts` does, and the case asserts the sentence rather than the refusal — a
  regex matching the generic one would pass against a build without the narrowing.
