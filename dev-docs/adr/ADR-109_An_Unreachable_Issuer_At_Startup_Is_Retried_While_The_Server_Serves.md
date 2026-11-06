# ADR-109: An Unreachable Issuer at Startup — Retried While the Server Serves vs. Exiting

**Status:** Accepted
**Related:** ADR-007 (first-party sessions brokered from the IdP — its broker and ID-token check are unchanged), ADR-043
(one container serves API and client), FR-23.7 (`token create` without the IdP), Sync-API §2

**Decision Drivers (in priority order):**
1. Fail closed: no login is ever accepted without the ID-token check ADR-007 requires — signature against the
   discovered JWKS, `iss`, `aud`.
2. A deploy or restart must not fail because the IdP is briefly unreachable. In the reference deployment the issuer
   is reached through the same reverse proxy as everything else; while the proxy restarts, the issuer's discovery URL
   answers 404 for seconds to half a minute. A server that exits on that crash-loops, and a deploy tool that waits for
   the container to become healthy reads the crash loop as a failed deploy and rolls back.
3. A configuration mistake stays loud: an operator who mistypes the issuer must not get a server that quietly never
   offers login.
4. The process's health stays a statement about the process: the container healthcheck must not start depending on
   another service.

---

## Considered Options

### Option A — Serve at once, resolve the issuer in the background *(recommended, accepted)*

`cmd/jitpackd` starts the HTTP server before the issuer is resolved and runs `Server.ConnectOIDC` beside it, the way
it runs the task reminders. `ConnectOIDC` fetches discovery and then the JWKS, retrying both with exponential backoff
from one second to a one-minute cap, logging every failed attempt and the success once. The broker is installed
atomically only once both are in hand. Until then `/auth/config`, `/auth/token` and `/auth/refresh` answer **503
`idp_unreachable`**: no broker exists, so there is no code path that could exchange a code or skip the ID-token check.
A discovery document that answers and is wrong — an issuer mismatch, a missing endpoint (`ErrOIDCMisconfigured`) — is
not retried: the process exits with the same `oidc discovery: …` line as before.

**Pros**
- A restart that overlaps a proxy or IdP restart succeeds; logins open seconds later without anyone acting.
- Requests carrying a JIT-Pack session keep working throughout: per-request auth checks JIT-Pack's own HS256 token
  and never contacted the IdP (ADR-007).
- 503 is the status the client already treats as transient, so a refresh during the window keeps the session.
- `/health` is untouched — the process is healthy, and says so.

**Cons**
- A server can now be up without login for as long as the issuer stays unreachable. Before, that state was
  impossible; now it is visible only in the log (a warning per attempt, at most one a minute) and as 503s.
- The issuer is looked at once more after startup: a misconfiguration that only shows once the issuer answers now
  stops a running server rather than a starting one.
- A wrong issuer URL that lands on a page answering 200 with something other than the discovery document is read as
  an outage, not a mistake, and retried — logged every minute rather than exiting.

### Option B — Exit while the issuer is unreachable (the previous behaviour)

Discovery and the JWKS are fetched before the server listens; any failure exits the process with status 1, and the
container supervisor restarts it.

**Pros**
- A running server always has a working login; there is no "up but cannot log in" state.
- Every IdP fault, transient or not, is the same loud crash.

**Cons**
- The supervisor's restart loop is the retry, and it is invisible to a deploy tool except as a crash loop — the
  incident behind this decision: a deploy that coincided with a proxy restart was rolled back, although the server
  would have recovered unaided thirty seconds later.
- While the IdP is down, nothing is served — not the client bundle, not sync for users whose sessions never needed
  the IdP.

### Option C — Keep exiting, make the healthcheck or the deploy wait longer

**Pros**
- No change to the server.

**Cons**
- Treats the symptom in every deployment's tooling instead of once in the server, and does not help: a deploy tool
  reads a restarting container as a failure regardless of any healthcheck's grace period.

---

## Decision Matrix

| Driver | Weight | A: serve, retry in background | B: exit | C: wait longer outside |
|---|---|---|---|---|
| Fail closed | 3 | 3 — no broker, no login path | 3 — no process | 3 — no process |
| Deploy survives a brief outage | 3 | 3 — nothing restarts | 1 — crash loop, rollback | 1 — still a crash loop |
| Misconfiguration stays loud | 2 | 2 — exits on a wrong document; a 200 page is retried | 3 — always exits | 3 |
| Health is the process's | 1 | 3 | 3 | 1 — tied to the IdP |
| **Total** | | **25** | 21 | 19 |

---

## Decision

**Option A.** `jitpackd` serves while `ConnectOIDC` resolves the issuer with capped backoff; the auth endpoints answer
503 `idp_unreachable` until the broker is installed; a discovery document that is wrong still stops the process.

## Consequences

**Positive**
- Proxy and IdP restarts no longer fail JIT-Pack deploys or restarts.

**Negative / accepted costs**
- An instance can run without login while its issuer is unreachable; the operator finds out from the warning lines
  and the 503s, not from a crash.

**Neutral**
- `api.OIDCConfig` carries the issuer and the credentials only; discovery and the JWKS are resolved by the server.
- No readiness endpoint was added: `/auth/config` answering 200 is that signal already.

## Revisit Trigger

A deployment where the issuer is routinely unreachable for longer than the one-minute cap at startup, or a client
that needs to tell "login not ready yet" apart from other `idp_unreachable` answers.
