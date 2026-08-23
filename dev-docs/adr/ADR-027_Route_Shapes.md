# ADR-027: What Shape a Route Has — Scope First Everywhere, or a Rule With the Sync Channel Exempted

**Status:** Accepted (owner decision, 2026-08-24)
**Related:** NFR-4.14 (its third point — the route shapes — is what this decides), ADR-026 (the mechanism, which deliberately left this out), ADR-025 (removed the two endpoints that made the export family a three-way disagreement), ADR-023 (the revert endpoints, one per partition), CODING_PRINCIPLES §4a (a value repeated across files is named once)

**Decision Drivers (in priority order):**

1. **A surface should be predictable rather than memorised.** Given one route, the next one should be guessable. That is the whole of NFR-4.14's third point.
2. **A rule with an exception is two rules.** Whatever is chosen has to cover the sync endpoints, or the exemption becomes the thing that has to be remembered.
3. **The cost is paid once and only now.** There is no third-party consumer and no released version; the same rename after a release is a deprecation cycle instead of a commit.
4. **The next shape change should be one file, not forty call sites** — which is what this one cost.

---

## What made the choice necessary

Three families described the same two ideas — *which partition* and *which format* — in three different ways:

| | | |
|---|---|---|
| sync | `GET/POST /sync/master` | `GET/POST /sync/trips/{id}` |
| conflicts | `GET /conflicts/master` | `GET /trips/{id}/conflicts` |
| export | `GET /export/full` | `GET /trips/{id}/export.csv` |

Read down the columns: the master partition is a sub-resource of a collection in one row and a scope of its own in another; the trip leads its path in one row and trails it in the next; and one export names its format while the other does not. Each is defensible in isolation. Together they mean a reader who knows two of the six cannot predict the third.

NFR-4.14 named a narrower version of this — it also listed `export.yaml` and `/templates/{id}/export`, both of which ADR-025 has since deleted — and ADR-026 deliberately left it, so that a rename would not travel with the mechanism it would otherwise be confused for.

---

## Considered Options

### Option A — Scope first, everywhere, with no exception *(recommended, accepted)*

The path names the **scope** first, then the resource. The master partition belongs to no trip, so its scope segment is the literal `master`. An export names its **format** as the path's extension.

```
GET/POST /api/v1/trips/{tripID}/sync          GET/POST /api/v1/master/sync
GET      /api/v1/trips/{tripID}/conflicts     GET      /api/v1/master/conflicts
POST     /api/v1/trips/{tripID}/conflicts/{conflictID}/revert
POST     /api/v1/master/conflicts/{conflictID}/revert
GET      /api/v1/trips/{tripID}/export.csv    GET      /api/v1/me/export.json
```

**Pros**
- One sentence covers every route on the surface, the ones this change does not touch included: `/users/{id}/avatar`, `/items/{id}/image`, `/notifications/{id}/read`, `/admin/users/{id}/deactivate` were already scope-first, so the rule describes what most of the surface already did and the outliers were the sync and conflict paths.
- The registration block can be **grouped by scope**, so the rule is legible in `server.go` rather than only in a spec.
- The full export gets an honest home: it is filtered to the caller's pull visibility, so it is the caller's export — `/me/export.json` beside `/me` and `/me/notification-prefs` — and naming its format puts it in the same shape as the CSV one.

**Cons**
- **It renames the hottest path in the application.** Every pull and every push moves. Nothing external calls it, and no version is released, so the cost is one commit — but it is the largest single-route blast radius in the tree (64 references across 29 files, nearly all mechanical strings in Go tests and Vitest specs).
- A trailing scope reads slightly worse aloud for the sync channel: `/master/sync` is a stranger sentence than `/sync/master`.

### Option B — Collection first for anything partitioned, scope trailing

Keep `/sync/master` and `/sync/trips/{id}`, and bring the others into line with *them*: `/conflicts/master` + `/conflicts/trips/{id}`, `/export/full` + `/export/trips/{id}`.

**Pros**
- The sync endpoints, the most-called routes, do not move at all.
- Reads well: the collection is the subject, the scope qualifies it.

**Cons**
- It is a **second idiom beside the one most of the surface already uses**. `/users/{id}/avatar` and `/items/{id}/image` are scope-first and would stay so, because nobody would seriously write `/avatars/users/{id}`. So the rule becomes "scope first, except for things that have partitions" — which is exactly the memorisation this is meant to remove.
- The revert path degenerates: `/conflicts/trips/{tripID}/{conflictID}/revert` has two bare ids in a row with nothing naming the second.

### Option C — Leave the shapes and document them

Write the three families down in the Sync-API-Spec and stop.

**Pros**
- Costs nothing and breaks nothing.

**Cons**
- It answers a requirement about predictability with a lookup table, which is the definition of the problem. NFR-4.14's own wording — "the surface has to be read rather than predicted" — is the objection.
- The next endpoint has no rule to follow, so the disagreement grows rather than stops.

### Option D — Rename, but keep the old paths serving as aliases

Register both shapes for a transition period.

**Cons, and why it was not weighed further**
- There is no consumer to transition. The client ships from this repository, the FR-18.7 command runs against the same tree, and no release exists. An alias would exist purely to keep a mistake reachable.
- It makes the rename unfalsifiable: with both paths serving, nothing can tell whether the client actually followed. The test that proves this change is `TestRouteShapes_PreviousPathsAreGone`, and an alias deletes it.

---

## Decision Matrix

| Criterion | Weight | A: scope first | B: collection first | C: document only |
|---|---|---|---|---|
| One rule, no exception | 5 | 5 | 2 | 1 |
| Agrees with the routes not being changed | 4 | 5 | 2 | 3 |
| Predictable from any one example | 4 | 5 | 3 | 1 |
| Blast radius now | 2 | 2 | 4 | 5 |
| Reads well aloud | 1 | 3 | 5 | 3 |
| **Weighted total** | | **82** | **51** | **38** |

---

## Decision

**Option A.** The path names the scope first, then the resource; the master partition's scope segment is the literal `master`; an export names its format as the path's extension.

The client's UI router follows the same move for the one path it shares the disagreement with — the master conflict log is `/master/conflicts` there too — because a screen route reading `/conflicts/master` beside an API route reading `/master/conflicts` is the same confusion with a smaller blast radius rather than a different one.

## Consequences

- **The old paths 404 rather than alias.** `TestRouteShapes_PreviousPathsAreGone` asserts it, and it has to distinguish the mux's "no such path" from a handler's "no such row" — both are 404, and asserting on the status alone would have called the revert routes gone while they were still there.
- **Every dev database is unaffected, but every running client must be rebuilt.** No schema changes; a stale bundle in a browser tab pushes to a path that no longer exists and its outbox retries forever. In practice a reload fixes it, and invariant 2 already reseeds development instances routinely.
- **The client's forty path literals now live in `client/src/api/routes.ts`** (§4a). That was not required by the rename, but the rename is what proved the cost of not having it: without one place, this change was forty edits and the next one would be forty again.
- **Typing those builders found a latent defect.** `SyncOutbox.syncPath` took a nullable id, and a *trip* partition with no id used to interpolate as the literal string `null` — a push to `/api/v1/sync/trips/null`, which the server answers 404 and the outbox retries forever, naming nothing. A template literal accepted it silently; a typed builder did not. It now refuses, with a case asserting the refusal beside the two that assert the paths.
- **The routes are still not in the contract.** `wire.go` declares the envelopes, not the paths, so this rule is held by a Go test and a Vitest spec that spell the same strings on both sides rather than by the ADR-026 gate. That is weaker than the envelopes have, and deliberately so for now — see the trigger.

## Revisit Trigger

Any of:

1. **A route the rule does not answer.** The likely first one is a resource scoped to two things at once (an item within a trip, say). If the rule needs a second sentence, it needs a second look.
2. **A third route-shape drift.** The paths are agreed by two test tables, not generated from one declaration. If a rename ever lands on one side without the other — the exact failure NFR-4.14 exists to prevent — the answer is to move the routes into `wire.go` and let `cmd/wiregen` emit `routes.ts`, which would put them behind the gate that already holds the envelopes.
3. **A published API.** After a release the old paths have consumers, and Option D stops being a way of keeping a mistake reachable and starts being a deprecation policy.
