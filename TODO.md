# Todo / roadmap

One line per item, newest at the end. A finished item is deleted.

## Open

- [ ] "Forgotten" radar — when a trip resembling an earlier one is created, show what that trip's review (M14) recorded as missed, so the same gap is not repeated; builds on the commented slice (FR-27.9), not FR-27.8's parked usage history; open: what makes two trips similar (shared template, tags or destination) (2026-10-04)
- [ ] Concept for judging a trip afterwards in three verdicts and a comment — per row: should have been packed, should not have come along, and new: too many, fewer next time; each with a free-text comment saying why; overlaps FR-9.1, FR-9.3, FR-9.4 and FR-27.9; open: whether a verdict edits the template or only proposes to (FR-9.2), and where a comment is read back (M14, M10's history, or both); concept first (2026-10-04)
- [ ] Work through `ARCH-REVIEW.md` (repo root, untracked) — 32 architecture and code-quality items, one per session, in the checklist order at the top of the file; ARCH-01 (push results paired by index) and ARCH-02 (dashboard UTC day) are defects and go first (2026-10-06)
- [ ] An idea or programme carries its own advance preparation — some need a step done ahead, e.g. reserving a bus or registering by phone, typically a week before; capture such steps on the idea and prompt for them in time; touches the planner (§3.29) and may reuse the preparation todos (§3.7a) (2026-10-06)
- [ ] Restore a per-person inventory item as one cluster — a portable trip import gives every `from_inventory` row its own master item (`resolveItem` in `client/src/domain/portableImport.ts`, ADR-024/ADR-030), so a per-person item comes back as N lone rows and N inventory items instead of one cluster; found while writing E2E-M4-153 (UX-03) (2026-10-06)
- [ ] Standard tasks per trip series — a series such as Samedan carries recurring trip todos (e.g. reserving the ibex hike) that materialise on every trip generated into it, with a due day relative to the trip start; same pattern as `template_tasks` (FR-7.4), likely on the destination profile (FR-13.2); open: relative offset only or fixed yearly dates, default assignee, offer on later series assignment; concept to be worked out during implementation (2026-10-08)
