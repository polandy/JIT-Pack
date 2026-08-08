# ADR-008: Generation and Import Run on the Client, Not the Server

**Status:** Accepted (recorded retroactively — the decision was taken during client implementation and had only been written down as prose in the implementation log)
**Related:** ADR-009 (three run modes), ADR-001 v2 (Go + embedded SQLite), FR-2.2/2.3a (template instantiation), FR-14.2 (history suggestions), FR-16.1–16.3 (spreadsheet import), FR-18.4/18.5 (portable import), FR-19.2 (Local Mode), NFR-4.11 (serverless backup/restore)

**Decision Drivers (in priority order):**
1. **Local Mode must not be a degraded product.** It runs with no backend at all (FR-19.x). A feature implemented server-side simply does not exist there.
2. **One implementation, not two.** A rule that runs in both modes must not be written twice, in two languages, and kept in agreement by hand.
3. Testability of the rules themselves — quantity formulas, dedup, instantiation are the product's actual intelligence and deserve exhaustive, I/O-free unit tests.
4. Server footprint (NFR-4.3) and the ability to keep the sync protocol generic rather than growing a feature-specific RPC per capability.

---

## Considered Options

### Option A — Rules live in `client/src/domain`, the server only stores and syncs *(recommended, accepted)*

Template instantiation, quantity formulas, dependency resolution, container weight math, analytics, the review assistant, cloning, spreadsheet import and portable import are pure TypeScript modules in `client/src/domain`. They read the synced stores and emit ordinary mutations. The server sees only those mutations and never knows a "generate" or "import" operation happened.

**Pros**
- Local Mode gets every one of these features for free, with no second code path — the mutations go into IndexedDB through the same funnel instead of the outbox.
- The rules are pure functions over plain data: no database, no HTTP, no fixtures. They are the best-tested part of the codebase for exactly that reason.
- The sync protocol stays generic. No `POST /generate`, `POST /clone`, `POST /suggestions` — each of which would have been a second, mode-specific way to write the same rows.
- Import decisions (the FR-16.3 merge prompts) need a human answer *before* rows are committed. A client-side plan/confirm/commit flow models that naturally; a server endpoint would need to hold a pending-import session.

**Cons**
- **No server-side enforcement.** A hostile or buggy client can write rows that the rules would never produce. Accepted: the server still enforces *authorization and referential integrity* (ownership, membership, FK, actor stamping — invariant 3), which is the security boundary. Generation rules are correctness, not security.
- Rules cannot be applied to data by a server-side job (e.g. a nightly recompute) without porting them.
- A rule change ships only when clients update. There is no server-side hotfix path.
- The client bundle carries logic that a thin client would not need.

### Option B — Rules on the server, exposed as RPC endpoints

The originally planned shape: `POST /trips` performs instantiation, `GET /suggestions` computes history defaults, import is a server endpoint. Several of these endpoints were in fact specified in Sync API Spec §8 before being struck through.

**Pros**
- One authoritative implementation with server-side enforcement; a buggy client cannot produce impossible rows.
- Rules can change without a client release.
- Go's testing story for these functions is as good as TypeScript's.

**Cons**
- **Fatal for Local Mode:** every one of these features would be missing with no backend, turning Local Mode from "a supported mode" into "a crippled demo". This alone decides it.
- Or: implement each rule twice, once per language, and keep them in agreement — the maintenance cost the product cannot carry.
- Grows a feature-specific RPC surface alongside the generic sync protocol, i.e. two ways to write the same tables.

### Option C — Rules on the server, with Local Mode running the server in WASM

**Pros**
- One implementation *and* server-side enforcement, in principle.

**Cons**
- Shipping the Go server plus SQLite as WASM to satisfy one mode is far outside the NFR-4.3 footprint budget, and drags the whole storage layer into the browser.
- Enormous complexity for a product whose rules are a few hundred lines of pure functions.

---

## Decision Matrix

| Driver | Weight | A (client) | B (server) | C (WASM) |
|---|---|---|---|---|
| Local Mode is fully featured | 5 | 5 — native fit | 0 — features absent | 4 — works, at high cost |
| Single implementation | 4 | 5 — one copy | 1 — two copies in practice | 5 — one copy |
| Rule testability | 3 | 5 — pure functions | 4 — also good | 3 — harder to isolate |
| Footprint / protocol simplicity | 3 | 4 — no new RPC | 2 — RPC per feature | 0 — very heavy |
| Server-side enforcement | 2 | 1 — none | 5 — full | 5 — full |
| **Total** | | **74** | **32** | **59** |

---

## Decision

The pure product rules live in `client/src/domain` as I/O-free TypeScript and emit ordinary sync mutations. The server stores, authorizes and syncs; it does not generate. The RPC endpoints that had been specified for generation, suggestions, clone, repack and review are struck through in Sync API Spec §8 rather than implemented.

This is invariant 4 in `CLAUDE.md`: moving one of these rules server-side silently removes the feature from a supported mode.

## Consequences

**Positive**
- Local Mode, Single-User Mode and Server Mode all get identical product behaviour from one code path.
- `client/src/domain` is pure and exhaustively unit-tested; adding a rule means adding a function and a table-driven test.
- The sync protocol stayed small: two partitions and a generic mutation envelope carry every feature.

**Negative / accepted costs**
- The server does not validate that a mutation is one the rules *would* have produced. Authorization, ownership and FK integrity remain server-side and are the actual trust boundary.
- Import transactionality is approximated (pre-validation plus a parents-first idempotent enqueue) instead of a real cross-mutation server transaction — noted against NFR-4.7 in Sync API Spec §8.
- Rule fixes require a client release.

**Neutral**
- The Go layout has no `internal/domain` package; `CODING_PRINCIPLES.md` §3 records why the directory that name would have described lives under `client/src/`.

## Revisit Trigger

Revisit if a non-browser client appears (a CLI, a native integration, a public API consumer) that must produce trips or import data without running the TypeScript domain layer — at that point the rules need a second home, and porting them to the server with the client calling the endpoint in Server Mode becomes the cheaper shape. Also revisit if client-produced data corruption is ever observed in practice rather than in theory.
