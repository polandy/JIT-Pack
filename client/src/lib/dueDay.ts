/**
 * A due *day* read against today — the arithmetic FR-7.11 gave a task and
 * FR-30.10 gives a shopping entry. Kernel rather than `domain/` because both
 * features read it and a feature module reaches only the kernel (FR-30.3);
 * what makes a task or an entry *done* stays with each (`domain/taskDue.ts`,
 * `shopping/list.ts`), and only an open thing's day comes in here.
 *
 * A day is `YYYY-MM-DD`, never a moment: a day read on the other side of a
 * time zone must stay the same day. So nothing here parses a `Date` from it —
 * two days are compared as calendar days, and „today" arrives from the caller
 * (`orchestrator.today()`), which is what keeps every rule testable without a
 * clock.
 *
 * The three states that matter are the ones a person acts on: **overdue**,
 * **today**, and **soon** (the next two days). A day
 * further out is *later* — it is shown, but it does not move anything up.
 */
export const DUE_OVERDUE = 'overdue'
export const DUE_TODAY = 'today'
export const DUE_SOON = 'soon'
export const DUE_LATER = 'later'
export type DueState = typeof DUE_OVERDUE | typeof DUE_TODAY | typeof DUE_SOON | typeof DUE_LATER

/** How many days ahead still count as *soon*. */
export const DUE_SOON_DAYS = 2

/** The days from `today` to `day`, both `YYYY-MM-DD`; negative in the past. */
export function daysBetween(today: string, day: string): number {
  return Math.round((utcDay(day) - utcDay(today)) / MS_PER_DAY)
}

const MS_PER_DAY = 24 * 60 * 60 * 1000

/** A calendar day as UTC midnight — a count of days that no DST can bend. */
function utcDay(iso: string): number {
  const [year = 0, month = 1, day = 1] = iso.split('-').map(Number)
  return Date.UTC(year, month - 1, day)
}

/**
 * dueState reads where an open thing's day stands against today, or null
 * for no day. The caller passes null for a thing that is done — a finished
 * task or a bought entry is never overdue, whatever its date says.
 */
export function dueState(day: string | null, today: string): DueState | null {
  if (day === null) return null
  const days = daysBetween(today, day)
  if (days < 0) return DUE_OVERDUE
  if (days === 0) return DUE_TODAY
  if (days <= DUE_SOON_DAYS) return DUE_SOON
  return DUE_LATER
}

/** Whether a day is one somebody should look at now: overdue, today or soon. */
export function isPressingDay(day: string | null, today: string): boolean {
  const state = dueState(day, today)
  return state !== null && state !== DUE_LATER
}

/** Whether a day is due by tomorrow, the overdue ones included — what a reminder names. */
export function isDueByTomorrow(day: string | null, today: string): boolean {
  return day !== null && daysBetween(today, day) <= 1
}

/**
 * sortByDue puts the things with a day first, earliest first — which reads
 * overdue, today, soon, later — and leaves everything else in the order it
 * came in. Stable, so two things due the same day keep that order too.
 * `dayOf` answers null for a thing without a day or already done.
 */
export function sortByDue<T>(
  items: readonly T[],
  today: string,
  dayOf: (item: T) => string | null,
): T[] {
  const rank = (item: T) => {
    const day = dayOf(item)
    return day === null ? Number.POSITIVE_INFINITY : daysBetween(today, day)
  }
  return items
    .map((item, index) => ({ item, index, rank: rank(item) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map(({ item }) => item)
}

/**
 * pressingGroupsFirst moves the groups holding something pressing to the
 * top (a group with an overdue or soon task is shown above the rest), keeping
 * the reading order inside both halves.
 */
export function pressingGroupsFirst<G>(groups: readonly G[], pressing: (group: G) => boolean): G[] {
  return [...groups.filter(pressing), ...groups.filter((group) => !pressing(group))]
}
