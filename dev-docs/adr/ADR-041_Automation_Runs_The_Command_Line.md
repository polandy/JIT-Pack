# ADR-041: Automation reaches the app through the command line — subcommands vs. REST resources

**Status:** Accepted
**Related:** FR-18.7 (`jitpack import`), FR-18.8 (`jitpack traveler`), FR-2.5 (travelers), FR-23.7/ADR-039 (API tokens), ADR-025 (one implementation of the rules), ADR-027 (route shapes), ADR-038 (a master row has a delete endpoint), invariant 4 (generation runs client-side), invariant 5 (three modes, one artifact)

**Decision Drivers (in priority order):**
1. **One implementation of every rule** (invariant 4, ADR-025). A second copy of a rule drifts, and the drift is invisible: the server's own portable importer wrote rows that reached no device for weeks.
2. **Every mode keeps every feature** (invariant 5). A rule that moves server-side leaves Local Mode without it.
3. **An automatable instance.** The owner's goal is that anything worth doing in the app can also be done without it — seeding a season's trips, fixing a roster across 33 trips, scripting a restore.
4. **Footprint** (NFR-4.3). A surface that has to be declared, generated, versioned and documented costs more than one that reuses what exists.

---

## Considered Options

### Option A — subcommands on the existing command line *(recommended, accepted)*

`client/cli/` grows from one binary into `jitpack COMMAND`. Each command imports the app's own stores, mutation builders and `client/src/domain` rules, and pushes the resulting mutations through the ordinary sync endpoints with an API token. `import` and `traveler` are the first two; the dispatcher table is what makes the next one a line rather than a branch.

**Pros**
- A command runs *the* rules, not a copy of them — the property ADR-025 was written to protect.
- Nothing is added to the wire contract, so nothing new has to be generated, gated or kept in sync.
- Works against any instance a token reaches, and against Single-User Mode unchanged.
- Idempotence and refusals can be expressed where they belong (a name already on the trip, a trip name that means two trips), which a thin REST resource would push onto every caller.

**Cons**
- The caller needs Node and a checkout or a built artifact — a foreign tool holding only `curl` cannot use it.
- Each command is hand-written; there is no generated surface and no discovery document.
- It runs the client's rules, so a command is only as correct as the pull it did first (the same caveat ADR-030 records for the app).

### Option B — REST resources per entity

`POST /api/v1/trips/{id}/travelers` and siblings, the shape a caller expects.

**Pros**
- Reachable from anything that speaks HTTP; self-describing if an OpenAPI document is generated from `wire.go`.
- No runtime to install.

**Cons**
- Every endpoint with a rule behind it needs that rule in Go — a second implementation of exactly the kind ADR-025 deleted. Endpoints without a rule (a bare row insert) are the sync push with extra spelling.
- The rules that make the app worth automating (generation, dependencies, quantities, the FR-27.4 refresh) live in `client/src/domain` **because Local Mode has no server**; moving one server-side removes it from a supported mode.
- Grows the wire contract, the generator's output and the manual for every entity.

### Option C — document the sync push and stop there

Generate an OpenAPI document from `wire.go` and declare `POST /{scope}/sync` the public write API.

**Pros**
- Costs a generator and a page; it is already true today.

**Cons**
- Leaves the caller composing HLCs, mutation ids and column sets by hand — a protocol, not an API — and every rule still unavailable.

---

## Decision Matrix

| Driver | Weight | A — subcommands | B — REST resources | C — document only |
|---|---|---|---|---|
| One implementation of every rule | 5 | 5 — runs the app's own code | 1 — a second copy per rule | 5 — no code at all |
| Every mode keeps every feature | 5 | 5 — nothing moves server-side | 1 — a rule moved is a mode lost | 5 |
| An automatable instance | 4 | 4 — needs Node, does everything | 5 — reachable from anything | 1 — protocol, not API |
| Footprint | 3 | 4 — no contract growth | 2 — contract, generator, docs per entity | 5 |
| **Total** | | **74** | 38 | 63 |

---

## Decision

Automation reaches JIT-Pack through `jitpack COMMAND`, a Node command line over the app's own rules that writes through the ordinary sync endpoints with an API token. The Go server grows no per-entity write endpoints; the existing exceptions stay exceptions for the reasons their own ADRs give (ADR-038's master delete, because the outbox and Local Mode need one rule behind two doors).

## Consequences

**Positive**
- A command produces exactly the rows the app produces, and lands in the change log, so every device sees them.
- Adding the next command is a module and a table entry; the connection flags, exit codes and push chunking are shared.
- Nothing here is mode-specific: the same binary drives a Single-User instance and a multi-user one.

**Negative / accepted costs**
- **No `curl`-shaped API for writes.** A caller that cannot run Node has the raw sync push and nothing friendlier. This is the cost that would reverse the decision if it ever binds.
- The commands are hand-written and hand-documented; there is no generated client and no discovery document.
- The built artifact is renamed — `jitpack-import.mjs` becomes `jitpack.mjs`, spelled `jitpack import` — which breaks any script that named the old file. The alternative, shipping both, was rejected: two binaries for one tool is the shape this ADR exists to avoid, and the command is days old outside this repository.

**Neutral**
- Reads stay as they are: the cursor pull, `/me/export.json` and `/trips/{id}/export.csv`. A command that only prints could as well be `curl`.

## Revisit Trigger

A second consumer that is not this repository and not a browser — a home-automation hook, a phone shortcut, someone else's script — needs to *write*. At that point the ergonomics of Option B start to be worth a rule's second implementation, and the first thing to build is the OpenAPI document from `wire.go` (Option C), not the endpoints.
