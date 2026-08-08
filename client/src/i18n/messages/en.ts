/**
 * English catalogue — the primary locale (NFR-4.12) and the fallback for
 * any key a translation is missing.
 *
 * Keys are flat and dot-namespaced by screen or concern rather than nested,
 * so a missing translation is a single visible diff against this file and
 * the catalogue-integrity test can compare key sets directly.
 *
 * A message may carry two forms separated by ' | ' (singular | plural);
 * `t` picks between them from the `n` parameter.
 */
export const en = {
  // Shared vocabulary — used across screens.
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.delete': 'Delete',
  'common.add': 'Add',
  'common.done': 'Done',
  'common.close': 'Close',
  'common.back': 'Back',
  'common.edit': 'Edit',
  'common.remove': 'Remove',
  'common.confirm': 'Confirm',
  'common.search': 'Search',
  'common.retry': 'Retry',
  'common.nobody': 'Nobody',
  'common.all': 'All',
  'common.none': 'None',

  // G-2 sync indicator.
  'sync.synced': 'Synced',
  'sync.syncing': 'Syncing…',
  'sync.offline': 'Offline',
  'sync.local': 'On this device',

  // Trips.
  'trip.daysUntil': '{n} days to go',
  'trip.departsToday': 'Departs today',
  'trip.status.planning': 'Planning',
  'trip.status.active': 'Active',
  'trip.status.archived': 'Archived',

  // Packing list (M4).
  'packing.title': 'Packing list',
  'packing.itemsLeft': '{n} item left | {n} items left',
  'packing.showPacked': 'Show {n} packed',
  'packing.hidePacked': 'Hide packed',
  'packing.allDone': 'All packed 🎉',
  'packing.skipped': 'Deliberately skipped',
  'packing.undo': 'Undo',
  'packing.packedToast': '“{name}” packed ✓',
  'packing.openPrep': '{n} preparation open | {n} preparations open',

  // Procurement modes (FR-25.4).
  'mode.pack': 'Pack',
  'mode.buyBefore': 'Buy before',
  'mode.buyLocal': 'Buy there',
  'mode.latePacker': 'Late packer',

  // Settings (M17).
  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.lightTheme': 'Light theme',
  'settings.language': 'Language',
  'settings.languageHint': 'This device only.',
  'settings.languageEnglish': 'English',
  'settings.languageGerman': 'German',
} as const
