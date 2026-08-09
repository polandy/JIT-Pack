# ADR-010: Spreadsheet Import Accepts CSV Only, Not XLSX

**Status:** Accepted (recorded retroactively — the cut was documented as a struck-through line in Sync API Spec §8)
**Related:** ADR-008 (import runs client-side), FR-16.1–16.3 (spreadsheet import), NFR-4.3 (dependency footprint)

**Decision Drivers (in priority order):**
1. Dependency footprint (NFR-4.3) — every added module is weighed, and this one ships to the browser.
2. Get the migration path working at all: users have years of packing history in spreadsheets, and the import is what makes the product adoptable.
3. Import correctness — the hard part is the FR-16.3 duplicate matching and the grid analysis, not the container format.

---

## Considered Options

### Option A — CSV only; XLSX users export to CSV first *(recommended, accepted)*

`client/src/domain/spreadsheet.ts` contains a hand-written parser: delimiter auto-detection (`,` / `;` / tab), quoted fields, then `analyzeGrid` to suggest the item column, trip columns and category rows. Users with an `.xlsx` file use their spreadsheet application's "Save as CSV", which every one of them already has.

**Pros**
- **Zero new dependencies.** The parser is roughly a hundred lines of pure, exhaustively tested TypeScript.
- The parser is ours, so the ambiguous cases the product actually cares about — a `?` suffix meaning "open task", `x`/`✓` meaning quantity 1, a bare year meaning a date — are handled where they arise rather than post-processed.
- No parser-shaped attack surface on user-supplied files beyond text splitting. XLSX is a zip container with formulas and external references; a browser-side XLSX parser is a meaningfully larger thing to trust.
- Delivers the feature now. Format breadth is worth nothing if the dedup logic behind it does not exist.

**Cons**
- **A manual conversion step for the most common real-world input.** Most people's packing history is in Excel or Numbers, not in a `.csv` — so the feature asks for a step before it can be used, and some users will bounce off it.
- Multi-sheet workbooks lose their structure in the conversion; the user must pick a sheet.
- Cell formatting that encoded meaning (a colour marking "already owned") is lost — though this parser would not have read it either.

### Option B — Bundle a full XLSX parser (e.g. SheetJS)

**Pros**
- Users drop their actual file in. No conversion step, no explanation needed.
- Multi-sheet support comes along for free.

**Cons**
- The footprint is disproportionate — a general-purpose spreadsheet parser is one of the larger things one can add to a bundle, in service of a wizard most users run once. That fails NFR-4.3 on its face.
- Broad parsing surface for untrusted files, in the browser, for a once-in-a-lifetime operation.
- Full-fidelity XLSX parsing invites feature creep (formulas, merged cells, styles) that the import model has no use for.

### Option C — Server-side XLSX conversion

**Pros**
- Keeps the client bundle small.

**Cons**
- Contradicts ADR-008: import runs client-side because Local Mode has no server. A server-only import path means Local Mode users — the ones most likely to be migrating *into* the product — cannot import.
- Moves the parsing surface to the server without removing it.

---

## Decision Matrix

| Driver | Weight | A (CSV only) | B (bundle XLSX) | C (server-side) |
|---|---|---|---|---|
| Dependency footprint (NFR-4.3) | 5 | 5 | 1 | 4 |
| Works in every mode | 4 | 5 | 5 | 0 |
| User friction on real input | 4 | 2 | 5 | 4 |
| Parsing/attack surface | 2 | 5 | 2 | 3 |
| **Total** | | **63** | **49** | **42** |

---

## Decision

The M15 import wizard accepts CSV (and pasted text) only. `.xlsx` is out of scope; the UI tells the user to export to CSV. The parser stays hand-written and lives in `client/src/domain/spreadsheet.ts`.

## Consequences

**Positive**
- No dependency added for the feature; the parser is fully unit-tested including the delimiter and quoting edge cases.
- Import works identically in all three run modes, Local included.

**Negative / accepted costs**
- The conversion step is real friction on the most common input format, and it is the weakest point of the migration story. It is a documented cut, not an oversight.
- Cell formatting and multi-sheet structure are lost in conversion.

**Neutral**
- NFR-4.7 transactionality is approximated by pre-validation plus a parents-first idempotent enqueue rather than a cross-mutation transaction — a separate consequence of ADR-008, noted here because it surfaces in the same wizard.

## Revisit Trigger

Revisit if the conversion step is observed to actually block adoption — users reporting that they gave up at the file picker, not a hypothesis that they might. At that point the honest comparison is a *minimal* XLSX reader (unzip plus `sheet1.xml` cell text, no formulas or styles) against SheetJS, since the import only ever needs cell strings.
