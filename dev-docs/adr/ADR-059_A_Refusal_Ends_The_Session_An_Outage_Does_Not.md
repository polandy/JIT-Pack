# ADR-059: A refused refresh ends the session — retry only what was never answered

**Status:** Accepted (2026-09-13)
**Related:** FR-19.6, FR-19.9, FR-23.3, NFR-4.4, Sync-API §2, `client/src/auth/refresh.ts`,
`client/src/api/status.ts`, ADR-007 (the OIDC broker)

**Decision Drivers (in priority order):**
1. **A device must be able to say what is wrong with it.** The one symptom a user can report is the G-2 glyph, and a
   session that cannot be renewed used to reach them as *offline* — the same word as a tunnel (FR-19.6).
2. **Offline is the normal condition, not an error** (FR-19.2/19.4): a refresh that did not arrive must never log
   anybody out, which is what the previous rule was protecting and what this one keeps.
3. **No state the app cannot leave.** A device that 401s for ever and never ends its session can only be repaired from
   outside the app (FR-19.9 is the other half of that lesson).

---

## Considered Options

### Option A — classify by whether the refresh was *answered* *(recommended, accepted)*

`doRefresh` splits its outcomes in two. **Not answered** — the fetch rejected, a 5xx, or one of the 4xx whose cause is
a moment rather than a verdict (408, 425, 429) — keeps the session and the token. **Answered and refused** — every
other 4xx, 401 included — ends the session: tokens cleared, `AUTH_EXPIRED_EVENT` dispatched, the app returns to the
login page. A kept token is additionally only handed out while it is inside its own `expires_at`; past that, the
provider returns null, because the only thing an expired token can still produce is the next 401.

**Pros**
- The two causes stop sharing one symptom: an unrenewable session now reaches the user as a login page, and a tunnel
  still reaches them as *offline*.
- The retryable 4xx are named in one place (`api/status.ts`), shared with the outbox's identical question about a
  refused push, so the two cannot drift apart.
- An expired token is never sent, so the 401 it would have produced is never reported as a failure either (FR-19.6's
  diagnostic stays about causes, not about the client's own stale header).

**Cons**
- A misbehaving proxy that answers a 403 or a 400 in front of a healthy instance now logs the device out. The user
  logs in again; the previous behaviour instead left the device unusable until its website data was cleared, so this is
  the cost we chose to pay, not one we avoided.
- A 400 caused by a client bug now ends sessions loudly rather than quietly wedging them. That is a feature for
  debugging and a regression risk for a release — the e2e mock-IdP projects cover the shape.

### Option B — keep only 401 ending the session, and add a retry budget

Leave the classification alone; count consecutive failed refreshes and end the session after *n*.

**Pros**
- No 4xx from anything but the broker can ever end a session.

**Cons**
- Needs durable state (a counter that survives a reload) and a number nobody can derive: too low logs out a flaky
  network, too high keeps the wedged device.
- It still ends the session on a *network* failure once the budget is spent — exactly the thing driver 2 forbids.
- A budget cannot tell *why* it was spent, so FR-19.6's line would still have nothing to name.

### Option C — surface the state and change nothing

Leave the retry loop and let the new FR-19.6 diagnostic line explain the repeated 401s; FR-19.9's reset is the repair.

**Pros**
- Smallest diff; the session can only ever be ended by the IdP.

**Cons**
- The repair is a manual one, on a screen the user has to be told to find, for a condition the app could end by itself.
- Every request in the meantime carries a token the server rejects, so the device keeps producing 401s that mean
  nothing but "this client refuses to notice".

---

## Decision Matrix

| Driver | Weight | Option A | Option B | Option C |
|---|---|---|---|---|
| A device can say what is wrong | 3 | 3 — a refusal becomes a login page | 2 — eventually, without a reason | 2 — a line the user must find |
| Offline never logs out | 3 | 3 — unanswered is never a refusal | 1 — a spent budget logs out offline | 3 — unchanged |
| No state the app cannot leave | 2 | 3 — the session ends itself | 2 — after *n*, durably counted | 1 — only a manual reset |
| Cost of being wrong | 1 | 2 — a stray 4xx costs one login | 2 — a tuned constant, forever | 3 — nothing changes |
| **Total** | | **29** | 18 | 23 |

---

## Decision

The client ends the session when the refresh endpoint **answers** a refusal — any 4xx that is not 408, 425 or 429 —
and keeps the session when the refresh was not answered at all. It never hands out an access token that is already past
its expiry.

## Consequences

**Positive**
- A session that cannot be renewed ends, on its own, within one refresh attempt.
- One table of "a 4xx whose cause can pass" serves the refresher and the outbox.

**Negative / accepted costs**
- A proxy or a client bug answering an unexpected 4xx in front of `/auth/refresh` costs the user one login.
- The rule is about the *status*, not about the body: the broker's `invalid_grant` detail is not inspected, because a
  client that parsed the IdP's error vocabulary would be the second place it is written (the server already does).

**Neutral**
- The server side is unchanged: the broker already answers 401 for a rejected grant and 502 for an outage
  (Sync-API §2).

## Revisit Trigger

A deployment where something between the client and the instance answers a non-401 4xx for reasons of its own — a WAF,
an auth proxy, a captive portal answering 403 — which would show up as users being logged out while the instance logs
nothing. The answer then is to narrow the rule to 401 plus a broker-stamped error code, not to reinstate the retry.
