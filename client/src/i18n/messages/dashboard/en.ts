/** English messages for M1, the dashboard — "what do I have to do right now?" (NFR-4.12). Assembled in ../en.ts. */
export const dashboardEn = {
  // M1 dashboard — "what do I have to do right now?".
  'dashboard.greetingMorning': 'Good morning',
  'dashboard.greetingAfternoon': 'Good afternoon',
  'dashboard.greetingEvening': 'Good evening',
  // Deliberately neutral at night (UX-15): any time-of-day claim at 00:14 is wrong.
  'dashboard.greetingNight': 'Hello',
  'dashboard.subtitle': 'Your packing tasks',
  // FR-7.11/FR-30.10: M1's due line — “2 tasks (1 overdue) · 3 purchases due”.
  'dashboard.dueWord': 'due',
  'dashboard.overdueWord': 'overdue',
  'dashboard.overdueOf': '({n} overdue)',
  'dashboard.planTrip': 'Plan a trip',
  'dashboard.delegated': '{n} thing for you | {n} things for you',
  'dashboard.delegatedNewRow': '{name} — new',
  'dashboard.delegatedNew': '{n} new',
  'dashboard.latePackers': '{n} last thing to pack | {n} last things to pack',
  // FR-7.9 decision 1/2 — M1's notes card: the newest notes by others I
  // have not ticked, each with its own trip chip and its own tick. The
  // deliberate exception to "M1 takes no actions" — see the concept's
  // decision 2 and its consequence paragraph.
  'dashboard.newNotes': 'New notes',
  'dashboard.newNotesTick': 'Mark as seen',
  'dashboard.planned': 'Planned',
  'dashboard.tripTasks': 'Tasks',

  'dashboard.taskLineOpen': 'Tasks: {n} open',
  'dashboard.taskLineDone': 'Tasks: all done',
  'dashboard.openWord': 'open',
  'dashboard.blockAdd': 'Add',
  'dashboard.tasksTitle': 'Tasks',
  'dashboard.tasksTitleMine': 'Tasks · mine first',
  'dashboard.tasksMore': '+ {n} more · all tasks',
  'dashboard.tasksAll': 'All tasks',
  'dashboard.tasksAdded': '“{body}” added to tasks',
  'dashboard.taskCheck': '{body} done',
  'dashboard.phasePacking': 'Packing',
  'dashboard.phaseOnSite': 'On site',
  'dashboard.dayBefore': 'in {n} day | in {n} days',
  'dashboard.dayFirst': 'Departure today',
  'dashboard.dayLast': 'Last day',
  'dashboard.dayOf': 'Day {day} of {total}',
  'dashboard.dayOpenEnded': 'Day {day}',
  'dashboard.dayRemaining': '{n} day left | {n} days left',
  'dashboard.openPackingList': 'Open the packing list',
  'dashboard.openCount': '{n} open',
  'dashboard.packingList': 'Packing list',
  'dashboard.moreItems': '+{n} more',
} as const
