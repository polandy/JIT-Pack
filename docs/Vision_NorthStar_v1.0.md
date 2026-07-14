# Vision / North Star: „JIT-Pack" → Family Vacation Companion (v1.0)

**Document Status:** Proposed — directional, not yet a build commitment
**Basis:** PRD_Base + PRD_Addendum_v2.10 (packing product) + Navigation_Concept_v1.1 (IA) + the six ADRs
**Purpose:** Capture the *expanded product direction* — from a packing app to a family
vacation-planning companion — so that the design concept, IA, and data model account for it
**now**, while the team finishes and ships the packing product first. This document is the
single home for the north star and the phased backlog; it deliberately contains **no new
FRs/NFRs and drives no implementation**. When a cluster below is picked up, it graduates into
a proper PRD-Addendum section, ADR, and UI-Spec screens — this file only points the way.

> **Precedence:** Where this document and any existing spec differ on *current, buildable*
> behaviour, the existing spec wins. This is a forward-looking north star, not an authority
> over shipped scope.

---

## 0. The thesis

> **A trip is not a packing list. Packing is one phase of a shared vacation.**

Today a "Trip" is a container for a packing effort. The north star reframes it as the **whole
vacation as a shared, multi-phase object** that a couple plans, prepares, lives through, and
reflects on together. Packing keeps its full depth — it becomes one phase among four, not the
whole app.

This reframing is the organising idea. Every feature idea below lands in exactly one phase, and
the phase model is what keeps a growing feature set from becoming a grab-bag.

---

## 1. Decisions taken (2026-07-14)

Three forks were resolved up front so the concept below is concrete:

1. **Trip = Vacation with phases.** The existing `trips` object becomes the umbrella. It grows a
   lifecycle — **Plan → Prepare → During → After** — and packing is the Prepare-phase surface.
   The four IA anchors stay four; new features live *inside* a trip as phase sections, not as new
   top-level anchors. (See §4 for the IA consequence.)
2. **Network features are best-effort + cached, never online-only.** Link fetching and weather
   stay true to the offline-first doctrine (ADR-001/003, Local Mode): the server fetches when
   online and caches the result; offline and Local Mode show the last cached preview, or the raw
   URL as a floor. No feature is gated behind "must be online right now." The cost of this fidelity
   is accepted.
3. **Collaboration is designed for two equal adults.** Voting, assignment, expense-splitting and
   notifications target the couple. Children remain **Travelers** (packing subjects), not voting
   accounts. The owner/admin/editor model (FR-4.5/4.7) is sufficient; no child-account model is
   introduced. Revisit only if extended family / multiple households become a real use case.

---

## 2. The phase model

| Phase | What happens | Status today |
|---|---|---|
| **Plan** | Collect ideas (links!), discuss, vote, check weather & transport, shortlist | ❌ new |
| **Prepare** | Pack, book, prep-todos, documents/tickets | ✅ packing complete; prep-todos exist (FR-7.3) |
| **During** | Day plan, live "what shall we do today?", weather re-planning, expenses | ❌ new |
| **After** | Post-trip review, series/history, feed the next trip | ✅ M14 review, M16 series |

A trip carries a **phase**, but phases are *soft*: nothing forbids adding an idea mid-trip or
packing after departure. The phase drives emphasis (what the trip screen leads with), not locks.

---

## 3. Feature backlog by phase

Unordered within a phase; each is a future PRD-Addendum candidate, not a commitment.

### 3.1 Plan — the Idea Board
- **Link drop → server fetch → inline preview.** Paste a URL (the WhatsApp-share habit); the
  server fetches and extracts a readable preview (title, image, text, price when detectable) so
  both partners read it *in the app* instead of chasing chat links.
- **Per-idea discussion & decision.** Comment thread (reuses the existing comments table), 👍/👎
  or lightweight ranking as a two-person decision aid, status `idea → shortlisted → dropped`.
- **Push on activity.** Partner gets a push notification when the other adds an idea or comments
  (reuses the notification + Web-Push infrastructure; new notification kinds).
- **Place & map.** An idea with a location pins to a map; distance-to-accommodation and clustering
  help judge feasibility.

### 3.2 Plan / During — Scheduling
- **Transport / timetable.** Attach a connection ("Fahrplan") to an idea or activity.
- **Weekday proposal.** Propose an activity for a specific day, weather-permitting.
- **Weather suitability.** Tag an activity (sunny / rain-proof / indifferent); the app suggests
  *when* to do *what* against the forecast ("rain tomorrow — pull the museum day forward").

### 3.3 During — Live collaboration
- **Day plan / timeline.** Per-day agenda combining scheduled activities, transport, and meals.
- **Expense tracking & split.** Who paid what; running balance between the two.
- **Bookings & documents.** Reservation confirmations / PDF tickets with a date auto-slotting into
  the day plan.
- **Practical info per place.** Opening hours, notes.

### 3.4 Cross-phase
- Weather forecast integration feeds both planning (weekday choice) and during (re-planning).
- The Idea Board's shortlist feeds the day plan; the day plan feeds the packing list (an activity
  implies gear) — closing the loop back to the product's original strength.

---

## 4. Architectural consequences to hold in mind

The substrate is well-suited — this is why the vision is realistic — but three surfaces are new.

**4.1 The sync/collab substrate carries most of it, unchanged.** HLC field-level merge, the
master/trip partition split, the change-log + tombstone model, membership + roles, the comment
thread, per-kind notification prefs, and Web-Push are all **generic**. An "ideas" or "activities"
table is conceptually one more `syncableColumns` entry and one more notification kind. New domain,
same machine.

**4.2 Outbound content fetching is genuinely new — flag for ADR-007.** Today the server makes
outbound calls only to IdP/JWKS/push. Link-fetch and weather are the first features that reach the
open internet on the user's behalf. This needs its own decision record covering: **SSRF** defence
(arbitrary user-supplied URLs → block internal ranges, scheme allowlist, size/time caps), the
**cache** model (decision 2 above), a **weather provider** choice + API-key handling, and the
**Local-Mode** degradation path. *Do not start any Plan-phase feature before ADR-007 exists.*

**4.3 The four-anchor IA absorbs this as in-trip sections, not new anchors.** "Ideas", "Day plan",
"Map" are not Trips/Templates/Items — under decision 1 they are **phase sections within a trip**,
reached by drilling into the trip (Navigation_Concept §1.3 "drill-down"). The trip screen gains a
phase-aware structure; the four anchors and the top-bar chrome are untouched. Navigation_Concept
gets a forward note; the full screen designs come with each cluster.

---

## 5. Sequencing

1. **Finish and ship packing first.** No Plan/During work starts until the packing product
   (client item 6 in CLAUDE.md and the UI Test Spec E2E suite) is complete. This document does not
   change that scope or its priority.
2. **ADR-007 (Outbound Content Fetching)** is the gate for everything in §3.1–3.2. It is the first
   artifact to write when the vision graduates from north star to build.
3. **First buildable slice, when the time comes:** the Idea Board (§3.1) minus map — link drop,
   cached preview, comments, push. It exercises the one genuinely new surface (fetch) on top of
   otherwise-existing collab machinery, and delivers the feature the user asked for first.

---

## 6. What this document explicitly does *not* do

- It adds **no FRs/NFRs** and changes no existing one. Clusters become FRs when picked up.
- It changes **no data model** and writes no migration.
- It does **not** reprioritise the packing roadmap.
- It is **not** authoritative over any shipped or specced behaviour (see the precedence note up top).

---

**Revision note (v1.0):** New document. Captures the expansion from packing app to family vacation
companion agreed on 2026-07-14, with three up-front decisions (trip-as-phased-vacation, best-effort
cached network features, two-adult collaboration). Directional only — no build commitment.
