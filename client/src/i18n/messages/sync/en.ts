/** English messages for the sync indicator, its detail sheet, the outbox and the conflict log (G-2, NFR-4.2a, NFR-4.12). Assembled in ../en.ts. */
export const syncEn = {
  // G-2 sync indicator.
  'sync.synced': 'Synced',
  'sync.syncing': 'Syncing…',
  'sync.offline': 'Offline',
  'sync.local': 'On this device',
  'sync.offlineQueued': 'Offline ({n} queued)',

  // G-2 detail sheet (FR-19.6): what the glyph's state means, and what to do about it.
  'sync.detail.explain.synced': 'Every change made on this device has reached the server.',
  'sync.detail.explain.syncing': 'A change is on its way to the server and is not confirmed yet.',
  'sync.detail.explain.offline':
    'The server cannot be reached. Your changes are kept on this device and sent as soon as it is back.',
  'sync.detail.explain.local':
    'Local Mode: there is no server. Everything you enter stays in this browser, on this device.',
  'sync.detail.lastSynced': 'Last synced: {when}',
  'sync.detail.online': 'Packing right now',
  'sync.detail.onlineNobody': 'Nobody else is packing right now.',
  'sync.detail.live':
    'Live updates are connected — changes from other devices arrive as they happen.',
  'sync.detail.liveGap':
    'Live updates are not connected right now. Reconnecting — until then, changes from other devices arrive with the next sync.',
  'sync.detail.lastFailure': 'Last failed request, {when}: {status} on {method} {path}',
  'sync.detail.lastFailureUnreachable':
    'Last failed request, {when}: no answer from {method} {path}',
  'sync.detail.lastFailureHint':
    'Read that line out when you report a problem — it says what failed, not just that something did.',
  'sync.detail.pending': '{n} change waiting to be sent | {n} changes waiting to be sent',
  'sync.detail.conflicts': 'Conflicts in this trip',
  'sync.detail.conflictsMaster': 'Conflicts in inventory, groups and trip data',
  'sync.detail.storage': 'On-device storage',
  'sync.detail.storageUsage': '{used} MB of {quota} MB used',
  'sync.detail.storageUnknown': 'This browser does not report how much space it uses.',
  'sync.detail.persistent': 'Marked as persistent — the browser will not clear it on its own.',
  'sync.detail.eviction':
    'Not marked as persistent: the browser may clear this data when space runs short.',
  'sync.detail.backup': 'Backup',
  'sync.detail.backupNever': 'Never backed up',
  'sync.detail.backupToday': 'Last backup today',
  'sync.detail.backupAge': 'Last backup {n} day ago | Last backup {n} days ago',
  'sync.detail.backupNow': 'Back up now',
  'sync.detail.backupEmpty': 'Nothing to back up yet — no trips and no templates on this device.',
  'sync.detail.backupHint': 'One YAML file with every trip and template. Restore it under Import.',
  'sync.detail.backupSaved': 'Backup saved: {file}',
  'sync.detail.updateReady':
    'A new version of JIT-Pack is ready. It takes over the next time you open the app — or now.',

  // B2/NFR-4.1 — the durable outbox.
  'sync.detail.pendingDurable':
    'They are saved on this device and go out as soon as it is back online.',
  'sync.detail.pendingFragile':
    'This device could not save them — closing the app now would lose them.',
  'sync.conflictToast':
    'Another device overwrote {n} field of your change | Another device overwrote {n} fields of your changes',
  'sync.conflictToastOpen': 'Show',
  'sync.detail.conflicted':
    '{n} field of your changes was overwritten by another device | {n} fields of your changes were overwritten by another device',
  'sync.detail.parked': 'The server rejected {n} change | The server rejected {n} changes',
  'sync.detail.parkedHint':
    'They were taken out of the queue so the rest could be sent, and are kept on this device. They will not be tried again.',
  'sync.rejectionToast':
    'The server refused {n} change — it has been undone | The server refused {n} changes — they have been undone',
  'sync.detail.rejected.notAuthorized': 'You are not allowed to make that change.',
  'sync.detail.rejected.outOfScope': 'It named a trip other than the one it was sent for.',
  'sync.detail.rejected.stillReferenced':
    'Other data still refers to it — deleting it would take that with it, so the server kept it.',
  'sync.detail.rejected.templateScope':
    'It would break the rule that a Vorlage contains groups and a group contains items.',
  'sync.detail.rejected.constraintViolated':
    'Something it refers to no longer exists on the server.',
  'sync.detail.rejected.malformedHlc':
    'The change carried an unusable timestamp — this device produced it wrongly.',
  'sync.detail.rejected.rowDeleted':
    'Somebody deleted the entry after you made this change — the server did not bring it back.',
  'sync.detail.rejected.notATripMember':
    'That person is not a member of this trip — invite them before linking their account.',

  // G-2 conflict log (NFR-4.2a).
  'conflicts.title': 'Conflict log',
  'conflicts.takeoverSection': 'Items taken over',
  'conflicts.takeoverLine': '{to} took the item over from {from}',
  'conflicts.titleMaster': 'Conflicts · shared data',
  'conflicts.unavailable': 'Conflict log unavailable — offline?',
  'conflicts.listUnknown': 'Loading the log …',
  'conflicts.empty': 'No conflicts — every change merged cleanly',
  'conflicts.emptyMaster':
    'No conflicts in inventory, groups or trip data — every change merged cleanly',
  'conflicts.emptyValue': '—',
  'conflicts.revert': 'Revert',
  'conflicts.reverted': 'Reverted',
  'conflicts.revertHint':
    'Reverting writes the losing value again — as an ordinary change that reaches every device.',
  'conflicts.entity.trips': 'Trip',
  'conflicts.entity.trip_items': 'Item',
  'conflicts.entity.items': 'Inventory item',
  'conflicts.entity.templates': 'List',
  'conflicts.entity.tags': 'Tag',
  'conflicts.entity.travelers': 'Traveler',
  'conflicts.entity.containers': 'Container',
  'conflicts.entity.comments': 'Comment',
  'conflicts.entity.trip_series': 'Series',
  'conflicts.entity.shopping_entries': 'Shopping entry',
  'conflicts.entity.ideas': 'Idea',
  'conflicts.revertFailed.alreadyReverted': 'This conflict has already been reverted.',
  'conflicts.revertFailed.rowDeleted': 'That entry has since been deleted.',
  'conflicts.revertFailed.refused': 'Cannot revert: the item has since been packed.',
  'conflicts.revertFailed.forbidden': 'You may not change this entry.',
  'conflicts.revertFailed.generic': 'Revert failed — offline?',
} as const
