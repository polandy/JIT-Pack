# Runbook: retag the inventory onto the item-mark facets

*One-off operational procedure for the maintainer, written 2026-09-19. Delete this file once it has been run on the
production instance — it describes a migration of data, not a feature of the product.*

## Why, and why through the UI

Tags accumulated organically, so one instance holds near-synonyms (`Elektronik`/`Technik`), tags that are really one
item (`Fotografie`) and a catch-all (`Diverses`, `Bad`) that hides what its items are. This procedure moves every item
onto **one shared vocabulary — the ten facets of the item-mark picker** (FR-28.2), so that tags and marks describe the
world the same way.

Everything below is done **in the app**, never in the SQLite file. A write straight into the database bypasses the
change-log, so no other device would ever receive it (invariant 4 records the same trap for the deleted server-side
importer), and it would skip FR-24.3's lifecycle rules. The tag manager (FR-24.10) and the bulk actions (FR-24.9) are
the sanctioned way, and both are undoable.

**Prerequisites.** The instance is on release 0.13.0 or later — M9's ⋮ menu carries *„Tags verwalten"* and the
selection mode is armed from the app bar. Step 4 (M24) and step 5 (tag marks) need a build from 2026-09-19 or later;
skip them if M9's ⋮ has no *„Aufräumen"* or the manager shows no mark slot. Take a backup first (NFR-4.5: the export
in Settings), because *Stilllegen* and a tag delete have no undo of their own.

## The target vocabulary

| Tag | Holds |
|---|---|
| Kleidung | everything worn, incl. sunglasses, swimwear, socks, rain gear |
| Reise | tickets-adjacent gear: adapters, alarm clock, luggage, pillows, binoculars |
| Dokumente | passport, ID, tickets, insurance cards, cash and cards |
| Hygiene | toothbrush, floss, soap, sun cream, towels, shampoo |
| Gesundheit | first-aid kit, plasters, medication, repellent |
| Technik | camera and lenses, cables, chargers, power banks, headphones, tripod |
| Camping | tent, sleeping bag, mat, stove, headlamp |
| Sport | trekking poles, bike gear, swim gear, balls |
| Essen | food, bottles, cutlery, cooking supplies |
| Sonstiges | what genuinely fits nowhere — keep it small |

Fewer than ten is fine: create a tag only when the first item lands in it. A mapping is a suggestion — where an item
could sit in two places, the **primary** tag is where it is filed on M9 and any further tag is an extra filter axis
(ADR-014), so pick the primary by *where you would look for it*.

## Step 0 — read what is there

1. M9 → ⋮ → *Tags verwalten*. Write down every tag with its count. This is the list steps 1–3 work through.
2. Note which existing tags already are a facet (`Technik`, `Camping`, `Kleidung` usually are) — those stay and
   receive items. Every other tag is a **source** that step 1 or 2 empties and step 3 deletes.

## Step 1 — rename or merge the obvious synonyms

Do this first: it moves whole tags at once, whereas step 2 moves items.

- A tag that *is* a facet under another name → **umbenennen** (tap its name). If the facet name is already taken the
  alert stays open and names the tag holding it; that is the cue to merge instead.
- Two tags for one thing (`Elektronik` + `Technik`, `Fotografie` + `Technik`) → on the source, **zusammenführen** into
  the target. Merging re-points the assignments and keeps each item filed under the target where the source was its
  primary tag, so no item drops into the leftover bucket (FR-24.10).

Rule of thumb for the common cases: `Elektronik` → merge into `Technik`; `Fotografie` → merge into `Technik`;
`Outdoor`/`Wandern` → merge into `Camping` or `Sport` depending on what the majority of its items are.

## Step 2 — refile catch-all tags in bulk

For each remaining source tag that holds items of several kinds (`Bad`, `Diverses`, `Sonstiges`, `Reisen`):

1. M9 → app bar → selection mode. Filter to the source tag (or search a keyword), then *„Alle N"* takes **what is on
   screen** — the filter is what makes this fast.
2. Select the items that belong to one target facet → **Tag geben** → pick the facet. If it does not exist yet, the
   dashed row creates it in the same act (FR-24.11).
3. **Switch on „Als primären Tag setzen".** Without it the item gains the tag but stays filed under the old one — that
   switch is the difference between labelling a group and emptying it (FR-24.9).
4. Repeat per facet until the source tag is empty. The counter in the manager tells you when.

Use these keyword groups to select quickly (search folds case and umlauts):

| Facet | Search for |
|---|---|
| Hygiene | zahn, seife, shampoo, creme, tuch, deo, rasier, kamm, bürste |
| Gesundheit | apotheke, pflaster, tablette, medik, fieber, mücken, verband |
| Kleidung | jacke, hose, socke, shirt, pullover, mütze, handschuh, brille, schuh |
| Technik | kabel, lade, akku, bank, kamera, objektiv, stativ, filter, kopfhörer, adapter, stecker |
| Camping | zelt, schlaf, matte, kocher, lampe, laterne |
| Sport | stock, stöcke, ball, helm, schwimm, velo |
| Essen | flasche, becher, besteck, snack, kaffee, tee |
| Dokumente | pass, ausweis, ticket, versicherung, karte (check hits: „Kartenspiel" is not one) |

Search hits are candidates, not verdicts: read the list before confirming, and deselect what does not belong.

## Step 3 — delete the emptied tags

A delete is refused while any item — **retired items included** — still carries the tag, and the refusal states the
count and offers *„Zusammenführen …"*. If the count is not the one you expect, the difference is retired items: open
M23 (or M9's retired mode) and look before merging them onward.

## Step 4 — find the leftovers and duplicates

- M24 (M9 → *Aufräumen*, FR-24.12) lists **untagged items**, **duplicates** and **tags with a single item**. Untagged
  items get a facet through the same bulk sheet; a single-item tag is usually a facet that was not yet reused.
- Duplicate names (two `Sonnenbrille`) are merged or retired there, not by editing names.

## Step 5 — give each tag a mark (optional)

In the tag manager every row has a mark slot. Setting one fills M9's leading slot for items that have neither photo
nor mark of their own, painted muted (FR-24.13). Suggested: 👕 Kleidung · 🧳 Reise · 🪪 Dokumente · 🧴 Hygiene ·
🩹 Gesundheit · 🔌 Technik · ⛺ Camping · 🥾 Sport · 🍎 Essen · 📦 Sonstiges — but only where the emoji is in the
picker's curated index, since that index is what the mark font is cut to (FR-28.6).

## Step 6 — verify

1. M9 grouped by tag shows only facet headings, each non-empty, `Sonstiges` the shortest.
2. The tag manager's counts sum to at least the number of items (an item with a second tag counts twice).
3. Open a second device or a private window on the same instance: it must show the same tags after a sync. If it does
   not, something was written outside the app — restore the backup from the prerequisites and start over.
4. Existing trips are unaffected: a trip row snapshots the tag's *name* when it is created (FR-24.2), so old trips keep
   their old headings by design. Only trips created afterwards read the new vocabulary.

## Rolling back

Steps 1–2 each raise a snackbar with *Rückgängig* for the last batch only. Past that, the backup from the
prerequisites is the way back (NFR-4.5 restore); there is deliberately no other.
