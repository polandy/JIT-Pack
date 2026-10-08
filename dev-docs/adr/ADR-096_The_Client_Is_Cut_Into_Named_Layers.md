# ADR-096: The client is cut into named layers — a directory per layer vs. a role per file

**Status:** Accepted
**Related:** ARCH-16, ARCH-17 (the gate that will hold it), ADR-066 (feature modules), ADR-008 / ADR-025
(`domain/` runs client-side), `dev-docs/CODING_PRINCIPLES.md` §3, `client/CLAUDE.md`

**Decision Drivers (in priority order):**
1. A contributor can tell from a file's directory what it may import, and so where a new rule goes.
2. The rule is checkable by a path-prefix gate, without reading each file's imports to decide its role.
3. A module's view of the kernel follows a folder, not a hand-kept list of files with a comment each.
4. Size of the move: the cut has to be reachable by mechanical `git mv`, with no behaviour change.

---

## Considered Options

### Option A — One directory per layer, Vue reactivity only above `lib/` *(recommended, accepted)*

`domain → lib → sync → kernel → stores → app → composables → components → views`, each importing only
leftwards; the feature modules sit beside `views/`. `lib/` is pure (no `vue`, Ionic, router or `.vue`);
`app/` holds the use cases the orchestrator and the CLI share; `sync/` the Vue-free transport; `kernel/` the
ports a module meets the kernel through and the adapters that fill them; `composables/shared/` what a module may
mount.

**Pros**
- A file's layer is its first path segment, so the gate ARCH-17 adds is a table of allowed edges.
- `lib/` can be held pure in one line; the Vue helpers that lived there are now where reactivity is expected.
- The module boundary's kernel list shrinks from ~15 file entries to two folders.

**Cons**
- ~60 files move; open branches touching them rebase over renames.
- Two files split along the line (`activityReaders`, `tripViews`), so a reader follows a port to its types in a
  second file.

### Option B — Keep the directories, write each file's role into §3

Leave `lib/` and `composables/` as they are and describe what each may hold.

**Pros**
- No moves.

**Cons**
- The roles are not visible in the path, so no prefix gate can hold them; the three inversions ARCH-16 found stay
  reachable.
- `composables/` keeps code that declines reactivity, against §3's own rule.

### Option C — Layers, but `lib/` keeps Vue

As A, with `lib/` allowed reactivity and Ionic controllers.

**Pros**
- About 15 fewer moves.

**Cons**
- `lib/` has no rule a gate can check beyond "no components", and pure helpers and reactive state stay mixed.

---

## Decision Matrix

| Driver | Weight | A — layers, pure lib | B — roles in prose | C — layers, Vue lib |
|---|---|---|---|---|
| Where a rule goes | 4 | 5 — the directory says | 2 — a paragraph says | 4 — except inside `lib/` |
| Gate by path | 3 | 5 — prefix edges | 1 — none | 3 — `lib/` unchecked |
| Module view by folder | 2 | 5 — two folders | 1 — the list stays | 5 — two folders |
| Size of the move | 1 | 2 — ~60 files | 5 — none | 3 — ~45 files |
| **Total** | | **47** | **20** | **38** |

---

## Decision

Option A. The order and each layer's role are written in `dev-docs/CODING_PRINCIPLES.md` §3 and
`client/CLAUDE.md`; `scripts/module-boundary-gate.mjs` lets a module import `kernel/` and `composables/shared/` by
folder.

## Consequences

**Positive**
- A new pure helper goes to `lib/`, a new use case to `app/`, a new contract between the kernel and a module to
  `kernel/` — decided by what it imports.
- `sync/tableRegistry.ts` no longer reaches up into `composables/` for its row codecs.

**Negative / accepted costs**
- A reactive value a pure helper reads has to live below it: the currency moved beside the locale in `i18n/`.
- Specs moved with their subjects, so `git log --follow` is needed to read a spec's history across the move.

**Neutral**
- `useSyncOrchestrator.ts` stays in `composables/` as the Vue facade over `app/`; splitting it is ARCH-13.

## Revisit Trigger

A layer whose files keep needing an exception to the edge table, or a fourth feature module that needs a kernel
contract `kernel/` cannot express without importing a module.
