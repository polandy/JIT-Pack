# ADR-026: Where the Client/Server Contract Lives — Generate the Client from Go, or Hand-Keep a Description Beside Both

**Status:** Accepted (owner decision, 2026-08-23)
**Related:** NFR-4.14 (the requirement this decides the mechanism for), NFR-4.2a (the merge vocabulary the outcome words are shared with), ADR-022 (per-field clocks, whose two new conflict fields the client never received), ADR-008 / invariant 4 (generation stays client-side — this ADR does **not** touch it), NFR-4.3 (footprint), CODING_PRINCIPLES §4a (a value compared against is named once)

**Decision Drivers (in priority order):**

1. **The build must refuse a wire change the client has not followed.** A contract nothing checks is a comment; the defects below all passed both test suites.
2. **One declaration, not two kept in agreement by hand.** The same rule ADR-008 applies to the domain rules applies to the wire shape.
3. **The description must not become a third thing that drifts.** A hand-kept file beside two hand-kept implementations is one more place to forget.
4. **Footprint** (NFR-4.3): what has to be installed to build the project, and what a contributor has to learn.
5. Doc comments and the error vocabulary are part of the contract, not decoration — whatever carries the shape must carry those too.

---

## What made the choice necessary

Measured on 2026-08-23 across 40 routes. The error *envelope* was already uniform — `writeError` at 90 call sites in the production code, no handler writing a bare error status, and `APIRequestError` parsing exactly that shape. What was not a contract was everything around it, and it had a price paid three times in one week:

- The client read a `status` key on a push result. **No server has ever sent one** — the key is `outcome`. Every rejection therefore read as `undefined`, and the whole parked-mutation surface was dead code that its own fakes kept green.
- The client took `pull_hint.next_cursor` as its pull cursor. The hint says *there is something new*, not *you are here*, so everything between the device's position and the hint was skipped.
- The trip partition answered `500` where the master partition answered `rejected` for the same class of refusal, and the client parked one and retried the other forever.

Each was found by hand, late. None was visible to either suite, because a fake that agrees with its author agrees with the wrong thing just as happily.

Two more were found *while implementing this ADR*, which is the point: `ConflictEntry` on the client had never grown the `mutation_id` and `actor_user_id` that ADR-022 added to the server's copy, and `PresenceUser` was a second hand-written spelling of `PresenceMember`. Both compiled, both were wrong, and neither had a test that could say so.

---

## Considered Options

### Option A — Go declares the contract; the client's types are generated from it *(recommended, accepted)*

One file, `internal/api/wire.go`, declares the sync envelopes, the WebSocket frame, the conflict-log shapes and the error vocabulary. `cmd/wiregen` parses it and writes `client/src/api/types.ts` — and, since ADR-027's amendment of 2026-08-24, the paths as well, into `client/src/api/routes.ts`; `scripts/wire-contract-gate.sh` regenerates into a temporary file and fails the build when the checked-in one differs. `make wire` is the one way to update it.

**Pros**
- The declaration sits where the wire is actually served, so it cannot describe an endpoint that does not exist.
- The generated file carries the Go doc comments, so the reason a key is named `outcome` and not `status` reaches the client's editor rather than staying in a Go file nobody on the client side opens.
- The enums produce **both** halves the client needs: a union for the type system and a frozen object for the code that branches at runtime — which is what turns the 16 error codes from literals at both ends into one vocabulary (§4a).
- No new dependency, in either language: `go/ast` and `text/template` are the standard library, and the client gains nothing to install (NFR-4.3).
- The gate is the same idiom the repository already runs for the toolchain pins and the log index, so there is nothing new to learn.
- The generator is a pure function of the source (`wiregen.Generate(filename, src)`), so its own behaviour is table-tested without touching the filesystem.

**Cons**
- **The generator is code we own.** It supports the Go subset the contract uses and refuses the rest; a future field of an unsupported shape means extending it. That is deliberate — it fails loudly rather than emitting something plausible — but it is work that a third-party generator would not have needed.
- It formats its own output to the client's prettier settings (print width, quote style, trailing newline). If those settings change, the generator has to follow, or `make fmt` rewrites a generated file and the gate fails on a file nobody edited. Accepted with a test pinning the print width.
- **It covers the shapes the client consumes, not all 40 routes.** The admin, notification, config and auth responses are still hand-typed on both sides today. The gate protects what is in `wire.go`; growing that file is how the rest joins. **Done 2026-08-24**: those four families joined, and the rule is now held by a check rather than by intent — an AST test over `internal/api` fails on a map literal handed to `writeJSON`, so the next response cannot be added untyped. It has one blind spot (a map held in a variable, which the preference handler did) and a second test closes exactly that one.

### Option B — OpenAPI as the source, both sides generated or validated from it

A hand-kept `openapi.yaml` describes routes, envelopes and codes; `openapi-typescript` generates the client's types, and the Go handlers are validated against the spec in tests.

**Pros**
- Routes get a first-class home, which would make the shape disagreements (`export.csv` vs `/export` vs `/export/full`) visible in one place.
- A standard format, readable by tooling we do not write, and by anyone scripting the instance.

**Cons**
- **The description becomes a third hand-kept artefact.** The specific failure this NFR exists to fix is a hand-kept file that drifted three times; adding another one and hoping this one is different is not a decision, it is a wish.
- The Go handlers are still hand-written against it, so the spec is authoritative only as far as the validation reaches.
- A new npm dependency and a build step in the client for a project whose footprint is a stated requirement.

### Option C — Both sides stay hand-written, a gate compares them

A script parses the Go structs and the TypeScript interfaces and reports differences.

**Pros**
- The smallest change to what exists; nothing is generated, nothing regenerates.

**Cons**
- It is a generator with the useful half removed. The types are still typed twice, so the work is not saved — only the discovery of the mistake is moved earlier.
- The comparison has to understand both languages anyway, which is the same parsing cost as generating.

---

## Decision Matrix

| Criterion | Weight | A: Go generates TS | B: OpenAPI | C: compare only |
|---|---|---|---|---|
| The build refuses drift | 5 | 5 | 4 | 4 |
| One declaration | 5 | 5 | 3 | 1 |
| No new artefact that can drift | 4 | 5 | 1 | 3 |
| Footprint / no new dependency | 3 | 5 | 2 | 5 |
| Carries docs and enums | 3 | 5 | 4 | 2 |
| Effort we own and maintain | 2 | 2 | 4 | 2 |
| **Weighted total** | | **101** | **65** | **63** |

---

## Decision

**Option A.** The Go declaration is the contract; the client's half is generated and the build refuses a mismatch.

Two things this explicitly does **not** decide:

- **It does not move logic to the server.** NFR-4.14 states the boundary and invariant 4 stands: generation, dependency resolution, quantities, analytics, the review assistant, cloning and import stay in `client/src/domain`, because Local Mode has no server. This ADR is about the shape of what crosses the wire, not about what runs on which side.
- **It does not settle the route shapes.** `export.csv`/`export.yaml`/`/export`/`/export/full` and the two conflict paths stay as they are for now; that is the NFR's third point and a separate change, deliberately kept out so a mechanical rename does not travel with the mechanism (owner, 2026-08-23). **Settled the next day by ADR-027**, which chose scope-first for all three families; the two YAML endpoints named here had already gone with ADR-025.

## Consequences

- A wire change is now two files in one commit, and the gate says so by name when it is one.
- **The response *type* is now the enforced unit, not just the sync envelope** (added 2026-08-24). Encoding a map literal fails a test, so a new endpoint declares its shape here before it can answer. Two consequences that were accepted rather than avoided: a struct encodes its keys in field order where a map encoded them sorted, so key order moved on eight responses (no consumer depends on it, and no wire *name* changed — the tag set gained thirteen and lost none); and a *request* body may still be a map where an absent key means something other than the zero value, which is why the notification preference body stays one.
- The outcome vocabulary moved into `internal/sync` so `store`, `api` and the client all say the same four words; `api`'s wire copy is held to it by a test, because `sync` may import nothing internal (invariant 1) and so cannot own the wire declaration itself.
- The generated types are **more truthful than the hand-written ones were**, and the compiler found where the client had assumed otherwise: a nil map or pointer marshals to `null`, so `row`, `payload` and the conflict fields are nullable, and eight call sites that indexed a payload without checking now check.
- `internal/wiregen` is a new leaf package importing nothing internal, beside `internal/sync`. `cmd/wiregen` is the second command in the tree; `cmd/jitpackd` stays wiring-only.

## Revisit Trigger

Any of:

1. **A wire shape the generator cannot express** — a discriminated union keyed by `type` for the WebSocket payloads is the likely first one. Extending the generator is the cheap answer once; a second such shape means Option B deserves a fresh look.
2. **A published API.** Today the only consumer is this client and the FR-18.7 command. The moment a third party is expected to write against the surface, they need a description they can generate *their* client from, and that is OpenAPI's argument, not ours.
3. **The client's formatter changes its defaults**, which is the maintenance cost this option accepted.
