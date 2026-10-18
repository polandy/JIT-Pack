# ADR-096: The client is cut into named layers — a directory per layer vs. a role per file

**Status:** Accepted
**Related:** ARCH-16, ARCH-16b, ARCH-16c, ARCH-17a (`scripts/layer-gate.mjs`, the gate that holds it), ARCH-19,
ADR-066 (feature modules), ADR-097 (`domain/shared/`), ADR-008 / ADR-025 (`domain/` runs client-side),
`dev-docs/CODING_PRINCIPLES.md` §3, `client/CLAUDE.md`

**Decision Drivers (in priority order):**
1. A contributor can tell from a file's directory what it may import, and so where a new rule goes.
2. The rule is checkable by a path-prefix gate, without reading each file's imports to decide its role.
3. A module's view of the kernel follows a folder, not a hand-kept list of files with a comment each.
4. Size of the move: the cut has to be reachable by mechanical `git mv`, with no behaviour change.

---

## Considered Options

### Option A — One directory per layer, Vue reactivity only above `lib/` *(recommended, accepted)*

`domain → lib → auth → sync → local → edges → kernel → stores → app → composables → components → views`, each
importing only leftwards; the feature modules sit beside `views/`, and below them all lies the vocabulary — `types/`,
`api/`, `i18n/`, `theme/` — which any layer may read.

- **`domain/` is the bottom, without exception.** A rule reads `types/`, `api/` and other rules, never `lib/`,
  `sync/` or `kernel/`: the day rules and the hand order are rules and live there (`dueDay.ts`, `handOrder.ts`); a
  port a module's rules read keeps its shape in `domain/` (`dayPlanLine.ts`, `ideaBridge.ts`, `mealContext.ts`) and
  only its `InjectionKey` in `kernel/`; a rule hands back domain values and `sync/` encodes them
  (`trackSettingsColumns`). The portable import declares `ImportMutations`, the builders it consumes, which
  `sync/mutations` satisfies structurally; the option shapes both sides read live in `types/creationOptions.ts`, so
  the port is no copy of them. The rules a module may read are `domain/shared/` (ADR-097).
- **`lib/` is pure** (no `vue`, Ionic, router or `.vue`).
- **`auth/` sits below `sync/`.** The HTTP client calls the token refresh, and `auth/` reads only the wire's words and
  the clock, so the transport depends on it without a cycle.
- **`sync/` is the Vue-free transport**, the HTTP client among it (`sync/apiClient.ts`): `api/` is vocabulary —
  generated wire types, routes, tables and status codes — and performs no request.
- **`edges` are the app's edges with the platform**: `notifications/`, `pwa/`, `mode.ts`, `config.ts` and the
  navigation helpers in `router/`, above `local/` and below `kernel/`.
- **`kernel/`** holds the ports a module meets the kernel through and the adapters that fill them; **`app/`** the use
  cases the orchestrator and the CLI share; **`composables/shared/`** what a module may mount.
- **The composition root** — `router/index.ts`, `App.vue`, `main.ts` and `dev/` — imports every layer and is imported
  by none.

**Pros**
- A file's layer is its first path segment, so `layer-gate.mjs` is a table of allowed edges.
- `lib/` can be held pure in one line; the Vue helpers that lived there are now where reactivity is expected.
- The module boundary's kernel list shrinks from ~15 file entries to three folders.

**Cons**
- ~60 files move; open branches touching them rebase over renames.
- One more layer name for a contributor to learn (`edges`).
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
`client/CLAUDE.md`. `scripts/layer-gate.mjs` holds the whole order: every file under `client/src` belongs to the layer
of its longest path prefix and imports only its own layer or earlier ones, and a file in no layer fails; an import of
`dev/` is `dev-code-gate.mjs`'s to judge. `scripts/domain-purity-gate.mjs` holds `domain/` to the vocabulary with no
list of allowed files, and `scripts/module-boundary-gate.mjs` lets a module import `kernel/`, `composables/shared/` and
`domain/shared/` by folder.

## Consequences

**Positive**
- A new pure helper goes to `lib/`, a new use case to `app/`, a new contract between the kernel and a module to
  `kernel/` — decided by what it imports.
- `sync/tableRegistry.ts` no longer reaches up into `composables/` for its row codecs.
- No gate carries an exception: an edge the table refuses is answered by moving the file.

**Negative / accepted costs**
- A reactive value a pure helper reads has to live below it: the currency moved beside the locale in `i18n/`.
- `auth/` reads above the vocabulary only through `lib/clock`, and a port a rule reads is split across two files — its
  shape in `domain/`, its key in `kernel/`.
- Specs moved with their subjects, so `git log --follow` is needed to read a spec's history across the move.

**Neutral**
- `useSyncOrchestrator.ts` stays in `composables/` as the Vue facade over `app/`, one namespace per group (ADR-098).

## Revisit Trigger

A layer whose files keep needing an exception to the edge table, or a fourth feature module that needs a kernel
contract `kernel/` cannot express without importing a module. An edge the table refuses is answered by moving the
file, not by an exception.
