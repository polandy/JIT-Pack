# ADR-082: A link preview — read by the server, on by default vs. opt-in vs. the device's share sheet

**Status:** Accepted
**Related:** ADR-081 (idea pictures), FR-29.1, FR-29.16, FR-23.8 (the opt-in release check), invariant 5,
`internal/linkpreview/`, `internal/api/linkpreview.go`, `client/src/app/linkPreview.ts`,
`client/src/planner/IdeaEditSheet.vue`

**Decision Drivers (in priority order):**
1. **An idea should cost a paste.** A link from a chat is the commonest idea there is; typing its title, a note and
   finding a picture for it is what keeps the board empty.
2. **The server must not become a user's way into its own network.** A homelab instance sits beside a router, an IdP
   and a NAS; a fetch whose address a user chooses is server-side request forgery unless it is fenced.
3. **What an instance does unasked.** Until now a JIT-Pack server contacted nothing its operator had not switched on
   (FR-23.8's release check is opt-in).
4. **Local Mode keeps working**, if with less.

---

## Considered Options

### Option A — the server reads the page; on by default *(accepted — the owner's call)*

The sheet sends a rested link to `POST /trips/{id}/link-preview`; the server fetches it with a dialer whose Control hook
admits only public unicast addresses on ports 80 and 443, reads the head's OpenGraph, Twitter-card and plain tags, and
returns the words with the picture's address; a second read (`…/link-preview/image`) fetches that picture through the
same fence, and the client scales and uploads it like any picture (ADR-081). Two reads, because a camera photo from a
slow host takes seconds longer than the words. Only members reach the routes. `JITPACK_LINK_PREVIEWS=false` turns it
off; any value but `true`/`false` refuses to start.

**Pros**
- One paste brings title, note and picture (driver 1).
- The check is on the address actually dialled, so DNS rebinding and a redirect inward are refused alike (driver 2).
- Works on every device the moment the instance is updated.

**Cons**
- It breaks driver 3: an instance now talks to arbitrary sites without its operator having asked. The sites see the
  instance's address. Accepted: the owner judged the feature is what people expect of a link, and the switch is one
  line.
- Local Mode has no preview.
- A pattern parser, not an HTML parser: a page that builds its head in JavaScript, or blocks unknown agents, gives
  nothing — the sheet then stays as typed.

### Option B — the same, opt-in like the release check

**Pros**
- Keeps driver 3's promise intact.

**Cons**
- An instance whose operator never reads the configuration page never has the feature, and the owner rejected that
  trade for this one.

### Option C — no fetch: the phone's share sheet hands the app a title and a URL

The PWA registers as a share target; sharing a page from the browser opens a new idea with the title and link filled.

**Pros**
- No outbound request at all, works in Local Mode.

**Cons**
- No picture and no description — the part that makes the board worth looking at.
- Needs the installed PWA and a platform that honours share targets; a desktop has nothing. It can still come later
  beside Option A.

---

## Decision Matrix

| Driver | Weight | A — server, on by default | B — server, opt-in | C — share sheet |
|---|---|---|---|---|
| An idea costs a paste | 4 | 3 — everywhere, with a picture | 1 — only where switched on | 1 — title and link only |
| No way into the network | 4 | 3 — fenced dialer, members only | 3 — the same | 3 — nothing fetched |
| Nothing unasked | 2 | 0 — the first default-on request | 3 | 3 |
| Local Mode | 1 | 1 — nothing there | 1 | 3 |
| **Total** | | **25** | **23** | **25** |

A and C tie on the matrix; A was chosen because driver 1's picture is what C cannot give, and C stays open as an
addition.

---

## Decision

The server reads a pasted link's page for its title, description and picture through a dialer that admits public
addresses on 80/443 alone, behind the trip's membership, on unless the operator sets `JITPACK_LINK_PREVIEWS=false`.

## Consequences

**Positive**
- A pasted link becomes a titled, described, pictured idea.
- The fence is a unit of its own (`internal/linkpreview`), tested against loopback, private ranges, carrier-grade NAT,
  mapped IPv6 and a redirect inward.

**Negative / accepted costs**
- The instance contacts sites on its users' behalf by default; `docs/configuration.md` says so where the switch is.
- Local Mode has no preview.

**Neutral**
- An address the fence refuses answers like an unreadable page, so the route cannot be used to map the network.

## Revisit Trigger

An operator reports a fetch they did not expect — or a site's complaint about the instance's requests. Then the default
flips to opt-in (Option B), which is one line in `cmd/jitpackd/config.go`.
