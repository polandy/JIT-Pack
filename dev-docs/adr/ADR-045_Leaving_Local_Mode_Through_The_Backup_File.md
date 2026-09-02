# ADR-045: Leaving Local Mode goes through the backup file, on the same device

**Status:** Accepted (2026-09-02)
**Amends:** nothing — it *discharges* the open decision FR-19.5 and E2E-FLOW-07 carried since 2026-08-31
**Related:** FR-19.1 (mode selection is not a toggle), FR-19.5 (the migration path), FR-19.6 / NFR-4.11 (the whole-device backup), FR-19.8 (the surfaces this decides), ADR-015 (the backup file), ADR-025 (one importer), UI-Spec M17 / M19, E2E-M17-14/14b/14c, E2E-FLOW-07

**Context.** FR-19.1 says leaving Local Mode "goes through the explicit migration path of FR-19.5, never through a toggle", and E2E-FLOW-07 found that this sentence is the entire implementation: `jitpack_mode` is written in exactly one place, M19's first-launch choice, and M17 states the mode without offering to change it. So the move is *device-to-device* — back up here, restore on a device that is already in Server Mode — which means a second phone or a reinstall for the one person FR-19.5 exists for. Local Mode is a trap for exactly the user it was meant to serve first. The pieces of the way out already exist: the whole-device backup (FR-19.6), M19's server-URL entry, and the M18 restore branch, which since FLOW-07's fix drains every partition the file brought.

**Decision Drivers (in priority order):**
1. **No data is stranded.** Whatever is built must make it impossible to leave Local Mode while a change exists that no backup holds — that is the trap FR-19.1's "never through a toggle" is guarding against, and it must stay guarded.
2. **One implementation of the import rules** (ADR-025). The data must reach the server through the same importer the app and the command line already run; a second writer of the sync feed for one event is the drift ADR-025 deleted.
3. **Local Mode stays single-device** (FR-19.1). The move is an *exit*, not a second mode: nothing here makes a Local Mode device also talk to a server.
4. **Small.** The three pieces exist; the change should be the card that strings them together and the guard, not a new subsystem.

---

## Considered Options

### Option A — Status quo: device-to-device (FLOW-07's world)

Back up on the Local Mode device, restore on a device already in Server Mode. Document it.

**Pros**
- Nothing to build; FLOW-07 walks it and is green.
- Drivers 1–3 hold trivially: the Local Mode device is never touched.

**Cons**
- Needs a second device or a reinstall, and the manual would have to say "clear site data and start over" — an instruction that destroys the only copy if the backup step was skipped.
- The one screen that knows the device is in Local Mode (M17) says so and offers nothing, which is the *reader-and-no-verb* shape FR-19.7 just corrected on another surface.

### Option B — A three-step move on M17, through the backup file *(recommended, accepted)*

A card in M17's Local Mode data section: **(1)** take the whole-device backup, **(2)** point the app at a server, **(3)** restore the file after the app comes back up in Server Mode. Step 2 is enabled only while the backup is newer than the last local write; confirming it writes the mode, the URL and a durable *migration pending* flag and reloads. Step 3 is a bar under the app bar (the FR-19.7 shape) that opens M18 while the flag is set, cleared when a restore commits or when the person says they want a fresh start.

**Pros**
- Driver 1 holds by construction: the switch is a function of `lastExportAt > lastLocalWriteAt`, so an edit after the backup disables it again. The guard is a pure rule with a unit test, and E2E-M17-14b operates it.
- Driver 2 holds: the data travels as the FR-19.6 file and enters through `commitPortableRestore`, the one importer — nothing new touches the feed.
- Driver 3 holds: the reload rebuilds the app once, in Server Mode, with no `IndexedDBPersistence`; the Local Mode store is left where it is and is never read again.
- Reuses the export, the restore branch, M19's URL validation and the FR-19.7 bar's shape (driver 4).

**Cons**
- A manual file round-trip: the person downloads a file and picks it again one reload later. Accepted — the file is also the one thing that survives a failed step 2 (a wrong URL, a server that refuses the login).
- A second copy of the data stays in the browser's `jitpack-local` database. Accepted, and deliberate: the app deletes nothing on a path a person may not have understood, and Server Mode never opens that database, so it cannot shadow anything.
- One new device-local stamp (the last local write), written in the orchestrator's single local funnel — the first timestamp the Local Mode persistence has ever needed.
- The pending flag is durable, unlike FR-19.7's dismissal, because the restore is a task the reload must not forget — so it needs a *Skip* with a confirmation, or a person who wants a fresh start carries the bar forever.

### Option C — Native adopt: replay the local store as sync mutations

FR-19.5 names it: on the switch, read every row out of `jitpack-local`, turn each into a mutation, and push. No file.

**Pros**
- One press, no download, no file picker — the smoothest possible move.
- Device ids and HLCs are already generated client-side, so the envelopes can be formed.

**Cons**
- A second writer of the sync feed (driver 2): the portable importer already knows how to map a document onto the master partition, remap travelers and containers by name, skip what is already there (ADR-030) and drain every partition (FLOW-07); a replay would re-implement each of those against the raw store, and drift the way the server's importer did.
- The HLCs it would replay are Local Mode's, from a clock that never met the server — every row would arrive claiming a time the server cannot order, and the field-level merge (ADR-022) would be asked to decide on the basis of it.
- Untestable against the path that exists: the file path can be asserted end to end on a third device (FLOW-07); a replay has no artifact between the two states to inspect when it goes wrong.
- Fails driver 1 in a subtler way: a replay that stops half-way leaves a device with no file and half its data on the server.

### Option D — A guarded toggle without a backup

Switch on confirm; warn that the data stays behind.

**Pros**
- Smallest change of all.

**Cons**
- It is the toggle FR-19.1 forbids, with a sentence in front of it: the data is stranded by design, and the warning is the only thing between the person and losing it (driver 1).

---

## Decision Matrix

| Driver | Weight | A — device-to-device | B — three steps on M17 | C — native adopt | D — guarded toggle |
|---|---|---|---|---|---|
| No data stranded (driver 1) | 4 | 3 — safe, but only by needing a second device | 4 — the switch cannot happen before the backup | 2 — a half-finished replay has no file to fall back on | 1 — strands by design |
| One importer (driver 2) | 4 | 4 — the file path | 4 — the file path | 1 — a second writer of the feed | 4 — nothing imports |
| Local Mode stays single-device (driver 3) | 3 | 4 | 4 — an exit, not a second mode | 3 — a Local Mode device talks to a server for one event | 4 |
| Small (driver 4) | 2 | 4 — nothing | 3 — a card, a guard, a bar | 1 — a replay engine | 4 |
| **Total** | | **48** | **50** | **26** | **40** |

A and B are close on the matrix, and the tie-break is the one thing the matrix does not weigh: A answers the request by *requiring a second device*, and B is the first shape in which a person with one phone can leave Local Mode at all.

---

## Decision

Option B. FR-19.8 specifies the card, the guard and the bar; UI-Spec M17 describes them. In code (steps 2–4 of the same PR): `client/src/mode.ts` owns the mode keys and the pending flag; the orchestrator stamps `jitpack_last_local_write` in its local funnel; `backupCoversDevice(lastExportAt, lastLocalWriteAt)` is the pure guard; the FR-19.6 export is lifted out of `App.vue` into one composable so M17 and the G-2 sheet call the same function; the bar clears the flag through `commitPortableRestore` in Server Mode or through a confirmed *Skip*.

## Consequences

**Positive**
- Local Mode is no longer a trap: the exit is on the one screen that knows the device is in it, and every step is one the app already knew how to perform.
- The guard is a rule with a unit test, and the three cases (E2E-M17-14/14b/14c) can each fail for their own reason: the walk, the guard, the skip.
- FR-19.5 keeps being true as written — the file carries the data — and gains a first step.

**Negative / accepted costs**
- A file round-trip on one device (Option B's first con).
- A second copy of the data in `jitpack-local` that nothing reads and nothing deletes.
- A new device-local stamp and a durable flag — two more `localStorage` keys, both owned by `mode.ts` / `exportReminder.ts` rather than scattered.

**Neutral**
- Nothing on the wire changes: no new endpoint, no new envelope field, no schema change.
- Server → Local is still not offered; M19 is still shown exactly once.

## Revisit Trigger

Revisit when a second surface asks for *"adopt this device's data"* — most likely the Capacitor shell (ADR-006), where a file dialog is the friction rather than the safety net. Then Option C is re-weighed, with one constraint carried over from here: whatever replays the store must go through `portableImport.ts`'s importer, not beside it, so the document it forms in memory is the same one the file would have carried.
