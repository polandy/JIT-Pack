# ADR-062: The Release Check Asks From The Server, And Only When Asked — server-side and opt-in vs. in the browser, or on by default

**Status:** Accepted
**Related:** FR-23.8, NFR-4.13 / FR-19.7 (ADR-044, the *other* update), invariant 5 (three modes), UI-Spec M17,
`GET /api/v1/instance/update`

**Decision Drivers (in priority order):**
1. **Offline-first is a promise about the network, not only about the data** (PRD §1, NFR-4.9). An instance must not
   contact a third party because it was installed, only because its operator asked it to.
2. **One request per instance, not one per device.** GitHub's unauthenticated API allows 60 requests an hour per IP;
   a household of five phones with the settings screen open would spend them on a question whose answer changes
   monthly.
3. **The person who can act is the person who runs the instance.** Nothing the app renders may promise an action to
   somebody who cannot take it.
4. **Local Mode keeps every feature it can have, and is never shown a broken one** (invariant 5, G-8).

---

## Considered Options

### Option A — the server asks, once a day, and only when the operator turned it on *(recommended, accepted)*

`JITPACK_UPDATE_CHECK=true` enables a lazy checker in `internal/api`: the first request to
`GET /api/v1/instance/update` after 24 hours asks `releases/latest`, and every request in between is answered from
what it learned. The binary's own release tag is stamped at build time (`-ldflags -X main.version`), so the
comparison happens where the version is known. M17 renders the four states the endpoint reports; Local Mode never
calls it.

**Pros**
- One instance makes at most one upstream request a day, whatever the number of devices.
- The answer is cached where the cache can be shared, so the 60/hour limit is never a consideration.
- An instance nobody configured contacts nothing at all — the promise is kept by construction, not by a setting the
  operator has to find and switch off.
- The comparison is made against the *server's* build, which is the artefact an upgrade actually replaces.

**Cons**
- The feature is invisible until someone reads the manual: an operator who would want it has to find out it exists.
- A new environment variable, a new endpoint and a build-time stamp for one line of text.
- The server needs outbound HTTPS, which a hardened deployment may not grant it — that instance gets
  `unreachable` rather than an explanation.

### Option B — the browser asks GitHub directly

The settings screen fetches `api.github.com` itself. No endpoint, no env var, no version stamp on the binary: the
client already knows its own build.

**Pros**
- No server work at all, and it works in Local Mode too — a device with no instance still has a browser.
- The instance itself needs no outbound network.

**Cons**
- Every device, every visit, spends a request against a per-IP limit shared by the whole household — and behind one
  NAT they are one IP.
- Every device tells GitHub that this household runs JIT-Pack, which is precisely the phone-home the offline-first
  promise is about, and no operator setting can stop it centrally.
- It compares the *client bundle's* version. In the one deployment shape that matters — the published image — client
  and server ship together, but a split deployment (`JITPACK_WEB_ROOT` unset, a CDN in front) can serve a bundle
  older than the binary, and the answer would then be about the wrong artefact.

### Option C — on by default

Option A, with the variable defaulting to `true`.

**Pros**
- Every instance gets the benefit without reading anything, which is where the feature earns its keep — the
  operator who never looks is exactly the one running a year-old image.

**Cons**
- A self-hosted, offline-capable application that contacts a third party out of the box breaks the expectation the
  whole product is built on, and does it silently.
- The first thing it would cost is trust in every other claim the manual makes about the network.

---

## Decision Matrix

| Driver | Weight | A: server, opt-in | B: browser | C: server, default on |
|---|---|---|---|---|
| Offline-first promise | 5 | 5 — nothing happens unasked | 1 — every device, unstoppably | 1 — happens unasked |
| One request per instance | 4 | 5 — one a day, cached | 1 — one per device per visit | 5 — same as A |
| Acts for whoever can act | 3 | 4 — a line where the operator looks | 3 — same line, wrong artefact | 4 — same as A |
| Local Mode stays whole | 3 | 4 — absent, not broken (G-8) | 5 — works there too | 4 — same as A |
| Cost to build | 2 | 2 — env var, endpoint, stamp | 5 — a fetch | 2 — same as A |
| **Total** | | **73** | 40 | 57 |

---

## Decision

The server makes the check, at most once a day, and only when `JITPACK_UPDATE_CHECK=true`. M17 renders the result
as one line in the About block — a line, not a banner, because a waiting client build (FR-19.7) is applied by the
device that sees it while a new release can only be pulled by whoever runs the instance.

Two rules inside the answer were decided with it:

- **A known release outranks a failed check.** When yesterday's check found `v0.10.0` and today's attempt fails, the
  state stays `available`; `checked_at` says how old the knowledge is. Withdrawing it would be less true, not more.
- **"Cannot compare" is never "there is an update."** A tag that does not parse — and a build that names no release
  tag at all, which is every locally built binary — leaves the check off or the state `current`. The failure mode of
  a version comparison must be silence.

## Consequences

**Positive**
- The default deployment's network behaviour is unchanged: no instance contacts GitHub because it was installed.
- The version the line compares is the server binary's own, which makes it an answer about the thing an operator
  upgrades.
- The endpoint is unauthenticated like `/instance/config` beside it, so Single-User Mode gets the feature without a
  session, and it discloses nothing the app bar does not already show to anyone who loads the client.

**Negative / accepted costs**
- An operator who never reads the manual never learns the check exists. This is the price of driver 1 and it was
  paid knowingly.
- An instance with no outbound HTTPS can only ever report `unreachable`, and cannot tell the operator why.
- Three of the four states cannot be driven from Playwright, because no project can serve a release feed; they are
  covered against the endpoint in Go and against the component in Vitest, and e2e covers the default (E2E-M17-17).

**Neutral**
- The 24-hour interval and the upstream URL are constants, not configuration. A fork that wants its own feed changes
  one constant; nothing about the feature suggests an instance should point at an arbitrary URL.

## Revisit Trigger

Any of:

- **JIT-Pack reaches 1.0** and upgrades carry the database forward. The advice around an upgrade changes completely
  then (see `docs/upgrades.md`), and a line that only says "something newer exists" may be worth more than a line.
- **A release feed that is not GitHub** becomes real — a mirror, a private registry — at which point the URL stops
  being a constant and becomes configuration.
- **The check is asked for by a second surface** (a health endpoint, a CLI subcommand). The lazy, request-driven
  cache is sized for one caller that a person is looking at; a poller would want the background loop this decision
  deliberately did not build.
