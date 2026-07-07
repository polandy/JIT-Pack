# ADR-005: Push Notification Architecture — Self-Hosted Web Push + UnifiedPush vs. FCM/APNs vs. WebSocket-Only

**Status:** Accepted (already specified — NFR-4.6, FR-6.2, reflected in ADR-001 v2's stack table)
**Related:** ADR-001 v2, Sync-API Spec §7 (WebSocket event catalog), CODING_PRINCIPLES §5

**Decision Drivers (in priority order):**
1. No mandatory dependence on third-party cloud services (NFR-4.6) — a self-hosted app whose notifications silently require Google/Apple accounts undermines its own premise.
2. Must still deliver something when the app is fully backgrounded or killed on mobile — a pure WebSocket connection does not survive OS-level app suspension on either iOS or Android; this is a real platform limitation, not a theoretical one.
3. Minimal footprint / no additional server-side service (ADR-001's single-container goal).
4. Reasonable delivery reliability without demanding complex infrastructure from a hobbyist operator.

---

## Considered Options

### Option A — Standards-based Web Push (VAPID) for web, UnifiedPush for native, WebSocket in-app as universal fallback *(recommended, accepted)*

**Pros**
- Web Push with self-generated VAPID keys needs no external account or service at all for the web client — genuinely zero mandatory third-party dependency.
- UnifiedPush lets the operator (or user) choose their own push distributor rather than the app mandating one.
- WebSocket in-app notifications (already built, Sync-API §7) provide a universal, zero-extra-infrastructure fallback whenever the app is foregrounded and connected — covering the common case for free.
- FCM/APNs remain available as an explicitly opt-in build configuration (NFR-4.6) for operators who accept that trade-off — the architecture doesn't forbid it, it just refuses to require it.

**Cons**
- Background delivery reliability on iOS specifically is weaker without APNs, historically the most dependable way to wake a backgrounded iOS app. Accepted because the self-hosted/no-mandatory-cloud principle (NFR-4.6) outweighs "best possible iOS background reliability" for this product's audience.
- Requires the operator to understand and configure a UnifiedPush distributor for native background push — mitigated by deployment documentation (parallel to the NFR-4.9 exposure-guidance obligation) and by the WebSocket fallback covering the foregrounded case regardless.

### Option B — Mandate FCM (Android) and APNs (iOS) as the only push mechanism

**Pros**
- Best achievable background-delivery reliability on both platforms; simplest for the app itself, since both are mature, single-vendor services.

**Cons**
- Directly and unambiguously violates NFR-4.6 and the product's self-hosted premise: every install would non-negotiably require a Google/Firebase project and an Apple Developer account/APNs certificate for a feature — packing reminders — meant to work in a private home-lab deployment.
- A privacy-sensitive family packing list routing "someone packed your toothbrush" through Google/Apple infrastructure is a real objection this product's audience (self-hosting enthusiasts, PRD Section 2) would raise, not a hypothetical one.

### Option C — WebSocket-only, no OS-level push at all

**Pros**
- Simplest possible implementation — the WebSocket channel already exists for realtime sync pings; reusing it for all notifications needs zero new infrastructure.

**Cons**
- Fails FR-6.2 in exactly the case that matters most: the app is backgrounded or closed while someone delegates an item, or a departure deadline approaches — precisely when a real OS-level push (not an in-app one) is needed.
- Not a viable stepping stone: it silently drops the entire "delegate an item, get notified" flow's single most valuable moment — when the recipient isn't looking at the app.

---

## Decision

**Option A**, already the shape captured in NFR-4.6 and ADR-001's stack table. This ADR makes the reasoning and the two rejected alternatives explicit for future maintainers.

## Consequences

1. `internal/notify` (per CODING_PRINCIPLES package layout) sits behind a small interface so VAPID, UnifiedPush, and the optional FCM/APNs build variant are swappable implementations, not hardwired into handlers.
2. Deployment documentation must cover generating VAPID keys and selecting/configuring a UnifiedPush distributor — an obligation parallel to the NFR-4.9 exposure documentation already required for Single-User/Demo Mode.
3. **Revisit trigger:** if real-world background-delivery reliability on iOS proves unacceptable to users despite Option A, the already-supported opt-in APNs build configuration (NFR-4.6) is the escape hatch — no architecture change required, just enabling what's already designed in.
