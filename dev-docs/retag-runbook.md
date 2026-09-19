# Runbook: retag the inventory onto the item-mark facets

*One-off operational procedure for the maintainer, written 2026-09-19 and rewritten the same day around `jitpack tags`
(FR-18.9). Delete this file once it has been run on the production instance — it describes a migration of data, not a
feature of the product.*

## Why, and why through `jitpack tags`

Tags accumulated organically, so one instance holds near-synonyms (`Elektronik`/`Technik`), tags that are really one
item (`Fotografie`) and a catch-all (`Diverses`, `Bad`) that hides what its items are. This procedure moves every item
onto **one shared vocabulary — the ten facets of the item-mark picker** (FR-28.2), so that tags and marks describe the
world the same way.

The retag is written down as a plan file and run with `jitpack tags apply`, never as SQL against the database file. A
write straight into SQLite appends nothing to the change log, so no device would ever receive it — the trap the
deleted server-side importer fell into (ADR-025) — and it would skip the tag rules. The command runs the actions M9's
tag manager and selection mode run (ADR-042), writes ordinary sync mutations, and sends nothing unless every step of
the plan succeeded. The plan file is also the record of what was done.

**Prerequisites.**

- A build of the command from a checkout containing FR-18.9 (`cd client && npm ci && npm run build:cli`). The instance
  itself needs no upgrade for steps 1–3 — the command writes plain tag and assignment rows — but **tag marks (step 4)
  need release 0.14.0 or later** on the instance and on every device, or the marks are stored and not shown.
- `JITPACK_SERVER` and an API token in `JITPACK_TOKEN` (Settings → API tokens) for the instance.
- **A database backup** (docs `backup.md`: an online snapshot with `sqlite3 .backup`, or a cold copy of all three WAL
  files). There is no undo for a plan and **no in-app restore of the JSON export**: Settings' *„Vollständiger Export
  (JSON)"* is export-only, and M18's YAML import only adds. The snapshot is the only way back.

## The target vocabulary

| Tag | Holds | Mark |
|---|---|---|
| Kleidung | everything worn, incl. sunglasses, swimwear, socks, rain gear | 👕 |
| Reise | tickets-adjacent gear: adapters, alarm clock, luggage, pillows, binoculars | 🧳 |
| Dokumente | passport, ID, tickets, insurance cards, cash and cards | 🪪 |
| Hygiene | toothbrush, floss, soap, sun cream, towels, shampoo | 🧴 |
| Gesundheit | first-aid kit, plasters, medication, repellent | 🩹 |
| Technik | camera and lenses, cables, chargers, power banks, headphones, tripod | 🔌 |
| Camping | tent, sleeping bag, mat, stove, headlamp | ⛺ |
| Sport | trekking poles, bike gear, swim gear, balls | 🥾 |
| Essen | food, bottles, cutlery, cooking supplies | 🍎 |
| Sonstiges | what genuinely fits nowhere — keep it small | 📦 |

All ten marks are in the picker's index (checked 2026-09-19); the command refuses any that is not. Fewer than ten tags
is fine — `give` creates a tag only when the first item lands in it. Where an item could sit in two places, the
**primary** tag is where it is filed on M9 and any further tag is an extra filter axis (ADR-014), so pick the primary
by *where you would look for it*.

## Step 1 — read what is there

```bash
node client/dist-cli/jitpack.mjs tags list --items > before.txt
```

One heading per tag with its count (retired items included, the tag manager's number) and the active items filed
under it, then `(no tag)` with the untagged ones. Every item in this file must end up under a facet; `before.txt` is
what the plan is written from.

## Step 2 — write the plan

`retag.yaml`, in this order (the steps run top to bottom, each seeing what the previous ones wrote):

1. **Renames** — a tag that *is* a facet under another name: `- rename: Bad` / `to: Hygiene`. If the facet already
   exists the step is refused naming it; use a merge instead.
2. **Merges** — synonyms and single-subject tags: `- merge: Elektronik` / `into: Technik`, likewise `Fotografie` →
   `Technik`, `Outdoor`/`Wandern` → `Camping` or `Sport` by majority. A merge keeps each item filed where the source
   was its primary tag, and **removes the source itself** — no delete step needed.
3. **Gives** — the items of each catch-all, per facet: `- give: Hygiene` / `items: [Zahnbürste, Seife, …]`. Filing
   is the default; add `primary: false` for an extra tag only. Item names are matched ignoring case; a name two
   active items share is refused; `list` prints the id beside such a name, and the plan names them by id.
4. **Takes and deletes** — once a catch-all's items are refiled, `- take: Diverses` / `items: all`, then
   `- delete: Diverses`. If the delete is refused because *retired* items still carry it (the message says how many),
   replace the take/delete pair with `- merge: Diverses` / `into: Sonstiges`.
5. **Marks** — `- mark: Technik` / `as: 🔌` for each tag in the table.

To find candidates in `before.txt`, grep for these stems (the file has umlauts; `grep -i` is enough):

| Facet | Stems |
|---|---|
| Hygiene | zahn, seife, shampoo, creme, tuch, deo, rasier, kamm, bürste |
| Gesundheit | apotheke, pflaster, tablette, medik, fieber, mücken, verband |
| Kleidung | jacke, hose, socke, shirt, pullover, mütze, handschuh, brille, schuh |
| Technik | kabel, lade, akku, bank, kamera, objektiv, stativ, filter, kopfhörer, adapter, stecker |
| Camping | zelt, schlaf, matte, kocher, lampe, laterne |
| Sport | stock, stöcke, ball, helm, schwimm, velo |
| Essen | flasche, becher, besteck, snack, kaffee, tee |
| Dokumente | pass, ausweis, ticket, versicherung, karte (check hits: „Kartenspiel" is not one) |

Hits are candidates, not verdicts — read each before putting it in a `give`.

## Step 3 — dry run, then run

```bash
node client/dist-cli/jitpack.mjs tags apply retag.yaml --dry-run
```

Every step is reported, then the axis the plan would leave behind. Iterate on the file until the dry run passes and
the axis reads right: only facet names, `Sonstiges` the shortest. Then run it without `--dry-run`. A refused step
stops the run and sends nothing, so a failed real run is fixed and re-run like a failed dry run.

## Step 4 — verify

1. `tags list --items > after.txt`: only facets, no `(no tag)` section.
2. Open M9 on a phone after a sync: grouped by tag, the same headings; each tag's mark fills the leading slot of items
   with neither photo nor mark of their own, muted (FR-24.13).
3. M24 (M9 ⋮ → *Aufräumen*) shows no untagged items; its *„Tag mit nur einem Artikel"* rule points at a facet that
   may deserve merging into `Sonstiges`. M24 has no duplicate-name rule — duplicates are not this procedure's job.
4. Existing trips are unaffected: a trip row snapshots the primary tag's *name* when it is created (FR-24.2), so old
   trips keep their old headings by design. Only trips created afterwards read the new vocabulary.

## Rolling back

There is no undo for an applied plan (M9's *Rückgängig* covers only a bulk batch made on that screen). The way back is
restoring the backup from the prerequisites (docs `backup.md`, „Restoring") — which also discards anything written on
any device since, so decide quickly.
