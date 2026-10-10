/**
 * The device's `prefers-reduced-motion` setting, read once from one place
 * rather than the query spelled out again at every call site. `lib/` stays
 * Vue-free; every screen that varies a transition by it calls this.
 */

/** Whether the device asked for less motion — guarded for a `matchMedia` that is missing. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches
}
