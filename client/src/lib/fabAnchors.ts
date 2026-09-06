/**
 * The `id` each screen's floating action button carries.
 *
 * It exists so a bottom toast can be positioned *above* the FAB rather than
 * under it — `lib/toast.ts` explains the measurement. The id was therefore
 * written twice per screen, once on the `IonFab` and once at every call site
 * that anchors to it, and at four screens across three directories that is
 * the shape CODING_PRINCIPLES §4a names: a literal compared across files.
 *
 * The key is the UI-Spec's screen id rather than a description of the screen,
 * for two reasons: it is what the elements are already called (`m7-fab` is
 * the button's own testid), and a descriptive key borrows words another
 * vocabulary owns — `templateList` is a `masterStore` getter, and the
 * FR-24.3 scanner in `masterListFiltering.spec.ts` reads it as one.
 *
 * Deliberately free of imports, Ionic included, so the Playwright suite can
 * assert against the same constant instead of keeping a third copy.
 */
export const FAB_ANCHOR = {
  /** M2 — the trip list. */
  m2: 'm2-fab-anchor',
  /** M4 — the packing list. */
  m4: 'm4-fab-anchor',
  /** M7 — the template list. */
  m7: 'm7-fab-anchor',
  /** M8 — the template editor. */
  m8: 'm8-fab-anchor',
} as const
