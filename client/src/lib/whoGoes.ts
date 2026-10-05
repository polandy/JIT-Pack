/**
 * Whom something is for, picked from the trip's travellers — who goes on an
 * excursion (FR-31.3), whom a day-plan entry is for (FR-29.15). One rule, so
 * the two sheets' chips behave alike.
 *
 * Null is everybody; a list is the people named, in roster order.
 */

/**
 * The choice after a tap on one person. Tapped while everybody is chosen, the
 * tap names just them — it says *who*, not *who not*. From there each tap
 * adds or takes one; naming everybody, or taking the last one off, is
 * everybody again (something for nobody is not one).
 */
export function toggleWho(
  who: readonly string[] | null,
  travelerId: string,
  roster: readonly { id: string }[],
): string[] | null {
  if (who === null) return [travelerId]
  const next = new Set(who)
  if (next.has(travelerId)) next.delete(travelerId)
  else next.add(travelerId)
  const named = roster.filter((traveler) => next.has(traveler.id)).map((traveler) => traveler.id)
  return named.length === 0 || named.length === roster.length ? null : named
}
