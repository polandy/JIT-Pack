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
  'trip.until': 'until {date}',
  'trip.from': 'from {date}',
  'trip.status.planning': 'Planning',
  'trip.status.active': 'Active',
  'trip.status.archived': 'Archived',

  // Packing list (M4).
  'packing.title': 'Packing list',
  'packing.itemsLeft': '{n} item left | {n} items left',
  'packing.showPacked': 'Show {n} packed',
  'packing.hidePacked': 'Hide {n} packed',
  'packing.allDone': 'All packed 🎉',
  'packing.allDoneHint': 'Nothing left for this trip.',
  'packing.skipped': 'Deliberately skipped',
  'packing.undo': 'Undo',
  'packing.packedToast': '“{name}” packed ✓',
  'packing.openPrep': '{n} preparation open | {n} preparations open',
  'packing.prepSection': 'Preparation',
  'packing.empty': 'Nothing on this list yet',
  'packing.emptyHint': 'Add the first item with ＋.',

  // M4 header line and app-bar cluster (G-12).
  'packing.progress': '{packed}/{total}',
  'packing.searchPlaceholder': 'Search the packing list…',
  'packing.closeSearch': 'Close search',
  'packing.foldAll': 'Collapse all groups',
  'packing.unfoldAll': 'Expand all groups',
  'packing.groupOpen': '{n} open',
  'packing.shopping': 'Shopping',
  'packing.luggage': 'Luggage',
  'packing.analytics': 'Analytics',
  'packing.archive': 'Finish trip',

  // FR-25.20 — rows somebody else is responsible for.
  'packing.othersHidden': '{n} item is with {who} · show | {n} items are with {who} · show',
  'packing.othersShown': 'Hide {n} from {who}',

  // FR-25.17 — who packed a row, and when.
  'packing.packedBy': 'packed by {who} · {when}',
  'packing.packedByUnknown': 'packed · {when}',
  'packing.responsibleWas': 'assigned to {who}',
  'stamp.today': 'today',
  'stamp.yesterday': 'yesterday',

  // FR-25.11e — an empty list means one of two very different things.
  'packing.noMatches': 'No matches',
  'packing.noMatchesSearch': 'Nothing matches “{term}”.',
  'packing.noMatchesFilter':
    '{n} open item is behind the filter. | {n} open items are behind the filter.',
  'packing.noMatchesBoth': 'Nothing matches “{term}” and the filter.',
  'packing.resetSearch': 'Clear search',
  'packing.resetAll': 'Clear search and filter',

  // FR-27.5 — the closing card on an archived trip.
  'packing.tripFinished': '🧩 Trip finished',
  'packing.reviewSuggestions': 'Review suggestions →',

  // The app bar's magnifier, per screen (G-12, FR-25.11k).
  'trips.searchPlaceholder': 'Search trips…',
  'templates.searchPlaceholder': 'Search templates…',
  'items.searchPlaceholder': 'Search items…',

  // M5 item detail.
  'item.details': 'Details',
  'item.detailsHint': 'Who · procurement · luggage · flags',
  'item.notes': 'Notes',
  'item.addNote': 'Write a note…',
  'item.addPrep': 'Add preparation…',
  'item.flagAsTask': 'Turn into a preparation task',
  'item.companions': 'Belongs with',
  'item.usedBy': 'Who needs this?',
  'item.luggageOptional': 'Luggage · optional',
  'item.latePackerHint': 'Pack on departure day',
  'item.flags': 'Flags',
  'item.noFlags': 'none set',
  'item.notFound': 'This item is not on the list.',
  'item.stateOpen': 'open',
  'item.statePartial': 'partly packed',
  'item.statePacked': 'packed',
  'item.stateSkipped': 'skipped',
  'item.statePackingNow': 'packing now',
  'item.statePackedOpenPrep': 'packed · prep open',

  // Quick-add (FR-5.6, FR-25.13a).
  'quickAdd.trigger': 'Add item…',
  'quickAdd.placeholder': 'Item name…',
  'quickAdd.missingHint': 'New items are flagged as missing',
  'quickAdd.newItem': 'Add “{name}” as a new item',

  // Faceted filter panel (FR-25.11), shared by M4 and M6.
  'filter.title': 'Filter',
  'filter.open': 'Filter',
  'filter.groupBy': 'Group by',
  'filter.reset': 'Reset',
  'filter.showing': 'showing {n} item | showing {n} items',
  'filter.allValues': 'all',
  'filter.groupedBy': 'Grouped by {axis}',
  'filter.doneLabel': 'Packed',
  'filter.doneHint': 'Show packed items',
  'filter.othersLabel': 'Assigned to others',
  'filter.othersHint': 'Show other people’s items',

  'facet.person': 'Person',
  'facet.category': 'Category',
  'facet.mode': 'Procurement',
  'facet.container': 'Luggage',
  'facet.flag': 'Traits',
  'facet.shared': 'Shared',
  'facet.noCategory': 'No category',
  'facet.noLuggage': 'No luggage',
  'facet.flagLate': '⏰ Late packer',
  'facet.flagMissing': 'Missing',
  'facet.flagPrep': 'Has preparation',

  'group.category': 'Category',
  'group.person': 'Person',
  'group.container': 'Luggage',
  'group.status': 'Status',

  // Procurement modes (FR-25.4).
  'mode.pack': 'Pack',
  'mode.buyBefore': 'Buy before',
  'mode.buyLocal': 'Buy there',
  'mode.latePacker': 'Late packer',

  // M3 trip wizard, step 1 (FR-2.1b year only, FR-2.1c folded options).
  'wizard.sectionTrip': 'Trip',
  'wizard.name': 'Name',
  'wizard.namePlaceholder': 'e.g. Engadin 2026',
  'wizard.year': 'Year',
  'wizard.moreOptions': 'More options',
  'wizard.moreSummaryEmpty': 'Dates · series · attributes',
  'wizard.startDate': 'Start date (optional)',
  'wizard.endDate': 'End date (optional)',
  'wizard.duration': 'Duration: {n} day | Duration: {n} days',
  'wizard.series': 'Series',
  'wizard.seriesNone': 'No series',
  'wizard.seriesNew': 'New series…',
  'wizard.seriesName': 'Series name',
  'wizard.seriesNamePlaceholder': 'e.g. Samedan Summer',
  'wizard.sectionAttributes': 'Attributes',
  'wizard.season': 'Season',
  'wizard.transport': 'Transport',
  'wizard.accommodation': 'Accommodation',
  'wizard.tags': 'Tags',
  'wizard.tagsPlaceholder': 'bike, lake (comma-separated)',
  'wizard.unset': '—',

  // M20 clone (FR-13.x). Reuses the wizard's field labels above.
  'clone.title': 'Clone · {name}',
  'clone.carryOver': 'Carry over',
  'clone.travelerAssignments': 'Participant assignments',
  'clone.packerDelegations': 'Packer delegations',
  'clone.containerAssignments': 'Container assignments',
  'clone.previewItems': '{n} item | {n} items',
  'clone.previewTravelers': '{n} traveller | {n} travellers',
  'clone.previewContainers': '{n} container | {n} containers',
  'clone.create': 'Create clone',
  'clone.notFound': 'Trip not found on this device.',

  // Trip attributes (FR-2.1a). Also read by the folded summary above, so
  // the row never shows a raw enum value like "holiday_flat".
  'season.summer': 'Summer',
  'season.winter': 'Winter',
  'season.transitional': 'Transitional',
  'transport.car': 'Car',
  'transport.bike': 'Bike',
  'transport.plane': 'Plane',
  'transport.train': 'Train',
  'accommodation.hotel': 'Hotel',
  'accommodation.holiday_flat': 'Holiday flat',
  'accommodation.camping': 'Camping',

  // Settings (M17).
  'settings.title': 'Settings',
  'settings.appearance': 'Appearance',
  'settings.lightTheme': 'Light theme',
  'settings.defaultTravelers': 'Default travellers',
  'settings.defaultTravelersHint':
    'A new trip starts with these people. This device only; you can change them per trip.',
  'settings.addTraveler': 'Add a traveller',
  'settings.language': 'Language',
  'settings.languageHint': 'This device only.',
  'settings.languageEnglish': 'English',
  'settings.languageGerman': 'German',
} as const
