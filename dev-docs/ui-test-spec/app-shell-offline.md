# App shell offline (NFR-4.13) — `e2e/pwa-offline.spec.ts`

* **E2E-PWA-01** `local` (NFR-4.13): once the service worker controls the page, a reload with the network cut still
  paints the app — asserted on the rendered chrome (header logo, visible page), never the URL. Settling is the worker's
  own lifecycle (`ready`, `controllerchange`), no timeouts.
* **E2E-PWA-02** `local` (NFR-4.13/NFR-4.2a): the worker never **answers** `/api`, `/ws` or
  `/health`, all three asserted rather than one standing in for the class. The seam is a **planted response**: the case
  puts a marker body for each of those paths into a cache of its own, and `caches.match` searches every cache on the
  origin — so a worker that stopped bypassing would serve the plant. The positive signal beside it is a path the rule
  does *not* cover, which does come back as the plant, so an absence means the bypass rule and not a mechanism that
  never worked. The cache half (`/index.html` held, `/health` never in a shell cache) stays. *Why a plant:* the worker
  writes no runtime cache entries at all, so asserting only that no cache entry appears for `/health` is green against
  a build with the never-cache rule deleted outright — and a **combined** mutation (bypass removed *and* a `cache.put`
  added) hides exactly that, so the red-proof removes the bypass alone.
* **E2E-PWA-03** `local` (NFR-4.13): the install declaration is complete — the manifest link and apple-touch-icon are in
  the document head, the manifest names JIT-Pack with standalone display and a maskable icon, and every declared icon
  URL actually resolves. A typo'd path here ships silently, because nothing else in the app ever fetches these files.
  It also asserts the **`theme-color`** — the one tag of the declaration that is not static, repainted
  by `theme.ts` from the active flavour's `--ct-base` (FR-21), so the case reads the meta and the computed token and
  compares them.

* **E2E-PWA-04** `local` (NFR-4.13, ADR-019) — the update policy: a new
  version installs in the background, is announced, does not touch the running app, and takes over on the next launch.
  Driving it needs a second worker on the origin, and registering a *different script URL on the same scope* is what
  produces one — a registration is keyed by scope, so the browser installs it into the registration the app is already
  holding and its `updatefound` is the app's own signal. Asserted: the new worker is **waiting** while the old one still
  controls the page; the G-2 glyph carries the dot — in its lower half, with the indicator's box exactly as it was
  before, since the dot takes no room in the bar — and the sheet the sentence; the running app was neither reloaded (a
  `window` marker no reload survives) nor taken over under (`controllerchange` counted, and the controller re-read); and
  after the last client goes away — a *launch*, not a reload, which is why the case closes its page —
  `navigator.serviceWorker.ready` reports the new script active. **Not asserted:** that the
  relaunched app announces nothing — it registers `/sw.js` again, a *third* script URL in this fixture, which the
  browser installs as a new waiting worker, so the dot comes back a moment later and an absence asserted in that window
  is green only by being early (measured). *(Mutation-proved twice: with `watchForUpdate` unwired the announcement never
  appears, and with `self.skipWaiting()` in the install handler the takeover count reaches 1.)*

* **E2E-PWA-05** `local` (FR-19.7, ADR-044) — **the mirror of PWA-04**: the same waiting worker, applied
  *now* because somebody pressed for it. Shares PWA-04's fixture (a second script URL on the same scope). Asserted: the
  bar is on screen without opening anything, and the G-2 dot beside it; after the press the page is **replaced** — the
  settled state is a `window` marker no reload survives having gone, and `navigator.serviceWorker.controller` on the
  page that came up names the new script. **Deliberately not asserted:** that the bar and the dot
  are gone afterwards. The relaunched app registers `/sw.js` again, which in this fixture is a *third* script URL on the
  scope and installs as a fresh waiting worker, so the announcement returns a moment later; an absence asserted in that
  window is green only by being early (measured). The two cases are the whole policy
  between them and neither covers the other: deleting the `message` handler leaves PWA-04 green, and moving
  `skipWaiting()` into `install` leaves PWA-05 green.
* **E2E-PWA-05b** `local` (FR-19.7): *Später* is its own outcome. The bar goes away, the old worker is **still** the
  controller, and the offer stays where G-2 keeps it — the dot, and the sheet's action behind it. Without
  this the dismissal could be wired to the same handler as the press and every other assertion would stay green.
* **E2E-PWA-06** `local` (FR-19.7, G-19, ADR-060): the announcement arrives without moving the
  page under it. The content box is read before the worker is provoked and again once the bar is on screen, and the two
  are equal — the bar's own visibility is the settled state, so nothing waits on a clock. It is the case the ledger's
  *„a WebKit case lost its click to the FR-19.7 banner"* asked for, written as a property of the layout rather than as a
  hunt for the intermittent: a banner that pushes the page moves the content 64.8 px down and loses the same height.
  **Two more measurements** (ADR-060 amendment 1), both read off the same settled state: the banner starts at or below
  the page head's last pixel, and its box lies inside the content column's. A layer drawn over the head and across the
  full width fails the first by 80 px and the second by 288 px on either side at the default 1280 viewport.

*Chromium only:* Playwright hosts service workers only there; the worker under test is engine-independent and identical
in WebKit.
