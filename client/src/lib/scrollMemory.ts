/**
 * Where a list stood when an overlay was opened over it.
 *
 * ADR-012's overlay amendment: M5's URL is an *alias* of M4's, and opening
 * or closing the sheet `replace`s rather than pushes — a push would mount a
 * second live copy of the packing list behind the sheet. The cost the
 * amendment recorded is that a replace re-renders the list from the top,
 * and the repair it named is to remember the offset. That memory cannot
 * live in the component, because the component is exactly what the replace
 * tears down (and a `<script setup>` top-level binding is per *instance*,
 * not per module — which is the trap this file exists to avoid).
 *
 * Keyed by whatever identifies the list — M4 uses the trip id. One position
 * per key, written on the way into the overlay and taken on the way out, so
 * nothing accumulates beyond the screens a session actually opened.
 */

/** A list's position, in the two parts that decide which rows are on screen. */
export interface ScrollPosition {
  /** The scroll offset in CSS pixels. */
  top: number
  /**
   * Whether the screen's collapsing header was folded away at that offset.
   *
   * It travels with the number rather than being derived afterwards: the
   * header occupies real height in the scrolled content, so re-entering
   * expanded and then applying the same offset lands on different rows —
   * and, while its max-height transition runs, on a different set every
   * time the restore is attempted.
   */
  headerCollapsed: boolean
}

const positions = new Map<string, ScrollPosition>()

/** Remember where the list identified by `key` stands. */
export function rememberScroll(key: string, position: ScrollPosition): void {
  positions.set(key, position)
}

/** The remembered position for `key`, left in place — the overlay is still up. */
export function peekScroll(key: string): ScrollPosition | undefined {
  return positions.get(key)
}

/** The remembered position for `key`, forgotten in the same breath. */
export function takeScroll(key: string): ScrollPosition | undefined {
  const position = positions.get(key)
  positions.delete(key)
  return position
}
