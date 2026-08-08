# ADR-004: Authentication Strategy — OIDC+PKCE with a Single-User Bypass

**Status:** Accepted (already specified — Addendum v2.7 FR-17.1/17.2/17.11, Schema v0.3 `is_local_singleuser`, implemented in `internal/api`)
**Note (2026-07-09):** Demo Mode (incl. its optional passphrase, FR-17.12) was removed in Addendum v2.10. Mentions of it below are part of the historical analysis and stand as written; the decision itself is unaffected — public exposure of Single-User Mode is handled by NFR-4.9 operator documentation alone.
**Related:** Base PRD Section 2 (OIDC/PKCE, declarative infrastructure, no internal password database), Addendum v2.7 §3.17 (Single-User & Demo Mode), NFR-4.4/4.8/4.9

**Decision Drivers (in priority order):**
1. No internal password database or registration UI, ever (PRD Section 2 hard constraint) — rules out any "just add a login form" option for Single-User Mode outright.
2. Single-User Mode must work with zero network access to an identity provider, including first boot (NFR-4.8).
3. Auditability and simplicity of the security model — an auth bypass must be trivially reviewable in one place, not sprinkled through business logic (CODING_PRINCIPLES).
4. Non-destructive upgrade path from Single-User to multi-user must be possible without a schema migration (FR-17.4).

---

## Considered Options

### Option A — Deployment-time middleware bypass + implicit local user, marked via `is_local_singleuser` *(recommended, accepted)*

**Pros**
- Auth logic stays binary and legible: either the JWT middleware runs (normal/OIDC mode) or it's swapped for a constant-user-injection middleware (Single-User Mode) — decided once at process startup, never per-request (FR-17.11).
- Downstream code (trip-membership checks, FR-4.5 role logic) is entirely unaware of which mode is active — it only ever sees a user id in the request context, so no mode-branching leaks into business logic.
- A dedicated marker column instead of a magic `oidc_subject` string removes any chance of collision with a real IdP subject, however that IdP formats its claims.
- The upgrade path is a single manual linking step (FR-17.4); no schema change required.

**Cons**
- Two code paths through authentication (even if each is individually simple) must both be tested and kept in sync as the app evolves — mitigated by the test-first requirement (CODING_PRINCIPLES §2) and by confining the bypass to exactly one middleware.

### Option B — Always run OIDC, auto-configure a "fake" always-valid IdP/JWT for Single-User/Demo Mode

**Pros**
- Only one code path through authentication ever runs; "Single-User Mode" becomes just a specific IdP configuration rather than a separate mechanism.

**Cons**
- Directly conflicts with NFR-4.8: a fake IdP is still an IdP-shaped moving part — a token issuer, a JWKS-like endpoint, or a signing key shipped in the image — either requiring network setup (violating zero-network-at-first-boot) or shipping a static signing secret in every install, a meaningfully worse security posture than "no auth at all, clearly labeled and guarded by deployment guidance" (NFR-4.9).
- More moving parts, not fewer: a fake token issuer is arguably more code than a middleware bypass, for no product benefit.

### Option C — Shared static passphrase for all of Single-User Mode (not scoped to optional Demo Mode)

**Pros**
- Provides some access control even for a private, permanent single-user instance.

**Cons**
- Over-engineers the common case: the PRD's premise for a private single-person household is "no login screen, ever." Demo Mode's optional passphrase (FR-17.12) is deliberately scoped to the actual risk — public internet exposure — which NFR-4.9 already addresses via operator-level guidance (reverse-proxy Basic Auth, VPN). Applying a passphrase universally defends against a threat model most Single-User deployments don't have.

---

## Decision

**Option A**, already specified in Addendum v2.7 (FR-17.2, FR-17.11) and reflected at the schema level (v0.3). This ADR exists so a future maintainer who reaches for Option B or C sees the trade-off already written down, rather than rediscovering it.

## Consequences

1. `main` wiring (`cmd/jitpackd`) selects between the two middleware chains once at startup based on the declarative flag (Section 2) — never a runtime toggle (FR-17.11), keeping the security model auditable in one place.
2. Any new authenticated endpoint works in both modes automatically without special-casing, since both paths converge on "a user id in the request context" before reaching business logic.
3. The public-exposure risk of Single-User Mode is handled entirely by operator-facing documentation (NFR-4.9: reverse-proxy Basic Auth, VPN, IP allowlisting), not by weakening the zero-setup promise of the common case. (Originally this also named the optional Demo passphrase FR-17.12; Demo Mode was removed in Addendum v2.10.)
