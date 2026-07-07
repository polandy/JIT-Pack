# ADR-003: Conflict Resolution Strategy — Field-Level LWW+HLC vs. CRDT vs. Whole-Row LWW

**Status:** Accepted (already implemented — `internal/sync/merge.go`, Sync-API Spec v1.2 §6, Addendum NFR-4.2a)
**Related:** NFR-4.2a, Sync-API Spec §3/§6, Schema v0.3 (`updated_hlc`, `conflict_log`, `change_log`), ADR-001 v2, CODING_PRINCIPLES §5 (footprint-guarded dependencies)

**Decision Drivers (in priority order):**
1. Domain-specific merge semantics are known and precisely specifiable (terminal-state precedence, additive merge) — NFR-4.2a already enumerates them in plain language.
2. Minimal footprint / no heavy new dependency, especially in Go, where mature CRDT libraries are far scarcer than in JS.
3. Auditability: every automatic resolution must be inspectable and manually revertible by a human (NFR-4.2a, UI-Spec G-2 conflict log detail).
4. Small, well-understood conflict surface — trip-partitioned data, a handful of concurrent users, mostly independent fields plus one causally-coupled pair (`packed_count`+`state`, FR-5.4).

---

## Considered Options

### Option A — Field-level LWW with Hybrid Logical Clocks + explicit domain overrides *(recommended, accepted)*

Already implemented as `internal/sync`: a dependency-free HLC generator plus a pure `Merge()` function, both at 100% test coverage.

**Pros**
- Simple, auditable, and entirely stdlib — no dependency at all.
- Domain rules (terminal-state-wins, additive-always-merge) map directly onto NFR-4.2a's plain-English requirements; the merge algorithm (Sync-API §6) can be checked against the PRD sentence by sentence.
- The conflict log is a natural byproduct: every dropped field becomes an explicit, structured record (losing/winning value) — exactly what NFR-4.2a requires for user-facing audit and revert.
- Field-level granularity avoids "whole item overwritten" data loss: two people editing different fields of the same item concurrently never lose either edit.

**Cons / accepted trade-offs**
- Field-level LWW can still silently drop a concurrent edit to the *same* field — mitigated by logging every drop to `conflict_log` (revertible) and by the two domain override rules covering the cases that matter most in this app (state-machine transitions, feedback flags).
- Not a general-purpose solution: a future feature with fundamentally different merge semantics (e.g., free-text collaborative comment editing) would need its own mechanism, not inherit one for free.

### Option B — CRDTs (e.g., Automerge- or Yjs-style)

**Pros**
- Convergence guaranteed by construction, no domain-specific merge function needed per field.
- Well-suited to fine-grained collaborative text editing — which JIT-Pack doesn't need; there is no shared document, only structured field mutations.

**Cons**
- No mature, lightweight Go-side CRDT implementation to match the JS ecosystem's; the server would need a JS/WASM bridge or a Go reimplementation — directly conflicting with the footprint and "standard library first" principles.
- CRDT metadata overhead (per-field or per-character operation logs) is significant relative to JIT-Pack's tiny per-trip data volumes — overkill for "a few hundred checkbox rows."
- The domain overrides this app actually needs (terminal-state-wins, additive-merge) are awkward to express in a generic CRDT model — likely requiring a custom CRDT type anyway, losing the "just use a library" benefit.
- Producing a simple, end-user-legible per-field conflict log (NFR-4.2a) from CRDT-internal operation logs is materially harder.

### Option C — Whole-row Last-Write-Wins (single HLC per row, no field granularity)

**Pros**
- Simplest possible implementation — one timestamp comparison per row.

**Cons**
- Directly violates NFR-4.2a: two people editing different fields of the same item concurrently (e.g., one sets `container`, another sets `late_packer`) would have one edit silently overwrite the other, with no override possible at row granularity.
- Cannot satisfy FR-5.4/FR-9.1 as specified — the `packed_count`+`state` coupling and the independent, always-additive flag fields need different treatment than a single row-level timestamp can express. This isn't a worse fit; it's a hard failure against the written requirements.

---

## Decision Matrix

| Criterion (weight) | A: Field LWW+HLC | B: CRDT | C: Whole-row LWW |
|---|---|---|---|
| NFR-4.2a fit (×3) | ●●● | ●●○ | ○○○ |
| Footprint / dependencies (×2) | ●●● | ●○○ | ●●● |
| Auditability (×2) | ●●● | ●○○ | ●●○ |
| Implementation effort (×1) | ●●○ | ●○○ | ●●● |
| **Weighted total** | **23/24** | **11/24** | **13/24** |

## Decision

**Option A: field-level LWW with hybrid logical clocks and two explicit domain overrides.** Already implemented; this ADR records the reasoning and the rejected alternatives for future maintainers who might otherwise reach for a CRDT as the "obvious" local-first default.

## Consequences

1. Merge semantics stay in `internal/sync` as pure, dependency-free functions. Any future mutable field must explicitly decide: independent LWW field (default), part of an existing causal group, or additive-always-apply — documented in code and here, never left implicit.
2. A genuinely collaborative free-text field (e.g., richer inline comment editing), if ever added, is explicitly out of scope for this merge algorithm and would need its own mechanism — not silently forced into field-LWW.
3. **Revisit trigger:** if the product ever needs real-time character-level collaborative text editing (not currently in the PRD), CRDTs would need reconsideration for that specific feature — alongside, not instead of, the existing field-LWW mechanism for structured fields.
