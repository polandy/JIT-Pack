# Todo / roadmap

One line per item, newest at the end. A finished item is deleted.

## Open

- [ ] Shrink `scripts/case-id-gaps.json` to empty: the M3 spec entries and traceability ids still listed (with the wizard item below), plus M6-09/10/20 once issue #908 is decided (2026-11-15)
- [ ] Wizard e2e: own cases for M3-04 (server: share at creation, role, rights afterwards) and M3-07 (companion suggestions, FR-20.3/20.4); map M3-02/06/08 to their carriers; decide M3-09 (build or strike) (2026-11-15)
- [ ] Deterministic clock in the 10 e2e places that read the real clock (`page.clock` or a seed date) and a completion seam for the 15–30 s deadlines in `single/server-sync.spec.ts` (2026-11-15)
