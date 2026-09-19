# Feature ideas — usability backlog

Candidates raised 2026-09-19 for making the app easier to use. **None is specified, decided or scheduled**: each is a
todo to be checked against the PRD Addendum and the UI-Spec (it may already be covered, or deliberately rejected)
before any work starts. When one is taken up, it gets an FR in the Addendum and its line here is struck through with a
pointer. Delete this file once it is empty.

Every idea must answer the three-mode question (CLAUDE.md invariant 5): what happens in Server, Single-User and Local
Mode. Rule logic lives in `client/src/domain` (invariant 4).

- [ ] **I-1 — „Forgotten" radar.** When a trip resembling an earlier one is created, show what that trip's review (M14)
  recorded as missed, so the same gap is not repeated. Builds on the review data; **not** FR-27.8's parked full
  per-trip usage history — only the commented slice (FR-27.9). Open question: what makes two trips „similar" (shared
  template, tags, or destination).
- [ ] **I-2 — Who packs what, at a glance.** One overview with a progress bar per person. FR-25.19 already carries the
  responsibility and FR-25.28 answers it per row; the gap is a whole-trip view. Check the per-person rows concept
  (`UI_Concept_PerPersonRows_variants.html`) first — this may already be settled there.
- [ ] **I-3 — Share a template.** A link or QR code that loads a template into another account or into Local Mode,
  through the portable format (`domain/portable.ts` / `portableImport.ts`). A small step toward FR-1.6, which is
  parked with its own revisit trigger: **no publish/fork ownership model**, so decide whether this fires it.
- [x] **I-4 — Sync status per device.** Done 2026-09-19: the G-2 detail says when the last sync completed (FR-19.6,
  PR #508). The rest of the idea — pending count, refusal reason, last failed request — was already there.
- [x] **I-5 — Undo toast instead of confirmation.** Rejected 2026-09-19. A trip delete is hard: the server cascades
  every child row and the trip's own change log, so nothing is left to restore. Archiving is the lifecycle's last step
  (FR-9.1/9.2, `nextLifecycleStep`), already guarded on M4 by the closing pass (FR-9.3); an undo would need a backward
  step and an owner ruling on the lifecycle. The parts that could be undone already are (FR-25.2, PR #509).
- [ ] **I-6 — FR-7.3 prep-task undo has no case.** PR #509 wired the undo snackbar for prep tasks (`togglePrepTodo`) but
  only E2E-M4-105 (trip todos) drives it; the PRD sentence „M4's FR-7.3 prep section does the same" is unproven.
  Add the case, or narrow the sentence.
