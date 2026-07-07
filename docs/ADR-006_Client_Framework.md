# ADR-006: Client Framework — Vue 3 vs. React vs. Svelte (within the PRD-Mandated Capacitor Shell)

**Status:** Accepted (already the ADR-001 v2 stack choice; this ADR supplies the comparison ADR-001 left implicit)
**Related:** Base PRD Section 2 (Capacitor iOS/Android mandated for native apps — a given constraint, not itself decided here), ADR-001 v2, UI-Spec v1.7, CODING_PRINCIPLES

**Context:** The PRD (Section 2) already mandates Capacitor for the native shell — that part is not a free architectural choice available to this ADR. What ADR-001 left unjustified is *which JavaScript framework runs inside that Capacitor shell*. This ADR fills that specific gap.

**Decision Drivers (in priority order):**
1. Small hobby-team maintainability (ADR-001 driver #5) — favor a gentle learning curve and low boilerplate over raw performance ceiling.
2. Strong, mature Capacitor/Ionic integration and community precedent.
3. Bundle size / footprint discipline extends conceptually to the client — a lighter runtime keeps the mobile webview snappy on modest hardware.
4. Good fit for the UI-Spec's component patterns (G-6 stepper, G-10 facepile, offline-first optimistic state per G-5) without a heavyweight state-management library.

---

## Considered Options

### Option A — Vue 3 (Composition API) *(recommended, accepted)*

**Pros**
- Capacitor is built by the Ionic team, whose own component library has historically had its deepest, most idiomatic integration with Vue; tooling and examples are correspondingly mature.
- Single-File Components keep template, script, and scoped style together per component — a good match for this project's "clear responsibilities, minimal ceremony" bias, and easy to review.
- The Composition API's reactive primitives (`ref`/`reactive`/`computed`) map cleanly onto the offline-first optimistic-update model (UI-Spec G-5): local reactive state updates immediately, a background sync effect reconciles with the server — no separate heavyweight state-management library needed at this app's size.
- Gentle learning curve for a small/hobby team; template syntax stays close to plain HTML.

**Cons**
- Smaller talent pool than React's — a real consideration only if the team ever grows well beyond "small hobby team" (ADR-001 driver #5), which is not the current target.

### Option B — React (either inside Capacitor, or via React Native instead of Capacitor)

**Pros**
- Largest ecosystem and talent pool; React Native offers genuinely native (non-webview) rendering, which Capacitor's webview-based approach doesn't.

**Cons**
- React Native is architecturally a different choice than "Capacitor + web app," and adopting it would mean discarding the PRD's already-mandated Capacitor shell (Section 2) — out of scope here, which takes that constraint as given.
- Plain React *inside* Capacitor is possible but forfeits React Native's main advantage (non-webview rendering) while still carrying more boilerplate — explicit state management, more verbose component definitions — than Vue, for no offsetting benefit specific to this app's size.

### Option C — Svelte / SvelteKit

**Pros**
- Compiles away most framework runtime, yielding the smallest bundle/footprint of the three — attractive given the project's general footprint discipline.
- Very low boilerplate, arguably an even gentler learning curve than Vue.

**Cons**
- Materially thinner Capacitor/Ionic-specific integration and community precedent than Vue's — more "does this pattern even work with Capacitor" research burden falls on a small team.
- A smaller ecosystem of ready-made components matching the UI-Spec's needs (steppers, bottom sheets, facepiles) means more custom UI work would need to be built without existing Svelte-specific prior art to lean on.

---

## Decision Matrix

| Criterion (weight) | A: Vue 3 | B: React | C: Svelte |
|---|---|---|---|
| Capacitor/Ionic fit (×3) | ●●● | ●●○ | ●○○ |
| Team maintainability (×2) | ●●● | ●●○ | ●●● |
| Footprint (×1) | ●●○ | ●●○ | ●●● |
| Ecosystem / ready-made components (×2) | ●●○ | ●●● | ●○○ |
| **Weighted total** | **21/24** | **18/24** | **14/24** |

## Decision

**Option A: Vue 3 with the Composition API**, already the ADR-001 stack choice. This ADR records the comparison ADR-001 skipped, so a future maintainer sees why Vue rather than React or Svelte.

## Consequences

1. Client code organization follows Vue 3 Composition API conventions — e.g., a `useSyncOutbox()` composable wrapping the pull/push cycle described in the Sync-API Spec.
2. Ionic's Vue component bindings are the default source for base UI primitives (bottom sheets, tab bars) per UI-Spec G-1/G-9, customized to the project's visual language rather than used as unstyled defaults.
3. **Revisit trigger:** none anticipated absent a fundamental change to the mandated Capacitor constraint itself — which is a PRD/Section 2 decision, not this ADR's to revisit.
