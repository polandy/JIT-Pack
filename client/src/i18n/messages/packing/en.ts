/** English messages for the packing list (M4), its containers, review and the kernel side of shopping (NFR-4.12). Assembled in ../en.ts. */
export const packingEn = {
  // Packing list (M4).
  'packing.title': 'Packing list',
  'packing.itemsLeft': '{n} item left | {n} items left',
  // FR-25.2: *done*, not *packed* — a deliberately skipped row is a done one,
  // and since FR-5.10 closes a list by skipping the rest in one act, naming
  // them all “packed” is wrong on the ordinary case rather than the rare one.
  // The split is degenerate here and has to be: English has one form, German
  // declines, and the catalogues are checked for the same split key for key.
  'packing.showDone': 'Show {n} done | Show {n} done',
  'packing.hideDone': 'Hide {n} done | Hide {n} done',
  // FR-25.11e, and the same word as the bar above: the state is reached by
  // packing *or* skipping the last open row, and since FR-5.10 one act can
  // do the skipping for every row at once.
  'packing.allDone': 'All done 🎉',
  'packing.allDoneHint': 'Nothing left for this trip.',
  'packing.skipped': 'Deliberately skipped',
  'packing.forgotten': 'Forgotten to pack',
  'packing.undo': 'Undo',
  'packing.skippedVia': 'skipped: “{name}” is not on this trip',
  'packing.passTitle': 'Finish the trip',
  'packing.passHint': 'Tap what you took along and never needed. You can also just finish.',
  'packing.passFinish': 'Done',
  'packing.flagUnusedAction': 'Mark as unused',
  'packing.unflagUnusedAction': 'Remove unused mark',
  'packing.flagUnusedToast': '“{item}” marked as unused',
  'packing.unflagUnusedToast': '“{item}” is no longer marked as unused',
  'packing.skipAction': 'Do not pack this',
  // FR-25.25/25.26 — the two decisions M4 makes without opening M5: who a row
  // is for, and whether it waits for the departure day. The cluster wordings
  // say "for everyone" because the head stands over several rows at once.
  'packing.latePackerOn': 'Late packer on',
  'packing.latePackerOff': 'Late packer off',
  'packing.clusterLatePackerOn': 'Late packer on for everyone',
  'packing.clusterLatePackerOff': 'Late packer off for everyone',
  'packing.clusterAssignAll': 'Assign all to …',
  'packing.clusterScope': '{n} row | {n} rows',
  'packing.clusterPartialName': '{name} ({n} of {total})',
  'packing.fanOutApplied': '{n} row changed | {n} rows changed',
  // Never silently partial (G-3): the count says how much landed, the names
  // say whom to ask about the rest.
  'packing.fanOutPartial': '{n} of {total} changed · {who} is packing right now',
  'packing.unskipAction': 'Pack it after all',
  'packing.packInsteadAction': 'Take it along instead',
  'packing.skippedToast': '“{name}” stays at home',
  'packing.companionsAdded':
    '“{names}” came along — it is required for what you added | “{names}” came along — they are required for what you added',
  'packing.forAllRefused':
    'Not distributed: doing so would delete a row. Decide that in the “Who needs this?” sheet.',
  'packing.skippedToastWith': '“{name}” stays at home — along with {companions}',
  'packing.packedToast': '“{name}” packed ✓',
  // FR-5.8 — a row off the list altogether, as against FR-5.5's decision to leave it home.
  'packing.removeAction': 'Remove from the list',
  'packing.taskDoneToast': '“{body}” done ✓',
  'packing.removedToast': '“{name}” removed from the list',
  'packing.removedToastInventory': '“{name}” removed — from the inventory too',
  // FR-25.31: every other act on the list, each behind the pack snackbar's undo.
  'packing.unpackedToast': '“{name}” unpacked',
  'packing.countToast': '“{name}”: {packed} of {quantity} packed',
  'packing.quantityToast': '“{name}”: quantity {n}',
  'packing.unskippedToast': '“{name}” is coming after all',
  'packing.latePackerOnToast': '“{name}” is packed late',
  'packing.latePackerOffToast': '“{name}” is no longer packed late',
  'packing.buyLocalToast': '“{name}” is bought there',
  'packing.packInsteadToast': '“{name}” is taken along after all',
  'packing.assignedToast': '“{name}” → {who}',
  'packing.unassignedToast': '“{name}”: nobody responsible',
  'packing.claimedToast': 'You are packing “{name}”',
  'packing.releasedToast': '“{name}” given back',
  'packing.taskReopenedToast': '“{body}” open again',
  'packing.taskDeletedToast': '“{body}” deleted',
  'packing.taskAddedToast': '“{body}” added',
  'packing.removeConfirmTitle': 'Remove “{name}”?',
  'packing.removeConfirmLead':
    'The row disappears from the packing list. To leave it at home on purpose, choose “Do not pack this”.',
  'packing.removeConfirmPacked': '{n} already packed.',
  'packing.removeConfirmNotes': '{n} note is deleted with it. | {n} notes are deleted with it.',
  'packing.removeConfirmCompanions': 'Not packed either: {names}.',
  'packing.removeConfirmInventory':
    'The item is used nowhere else and is deleted from the inventory too.',
  'packing.openPrep': '{n} preparation open | {n} preparations open',

  'packing.packSection': 'Packing',
  'packing.prepSection': 'Preparation',
  'packing.listUnknown': 'Loading the packing list …',
  'packing.empty': 'Nothing on this list yet',
  'packing.emptyHint': 'Add the first item with ＋.',

  // M4 header line and app-bar cluster (G-12).
  'packing.progress': '{packed}/{total}',
  'packing.searchPlaceholder': 'Search the packing list…',
  'packing.closeSearch': 'Close search',
  'packing.foldAll': 'Collapse all groups',
  'packing.unfoldAll': 'Expand all groups',
  'packing.openCount': '{n} open',
  'packing.shopping': 'Shopping',
  'packing.shoppingCount': 'Shopping ({n})',
  // FR-7.7 — the third view a trip is worked in.
  'packing.tasks': 'Tasks',
  'packing.tasksCount': 'Tasks ({n})',
  'packing.luggage': 'Luggage',
  'packing.analytics': 'Analytics',
  'packing.tripViews': "This trip's views",

  // FR-5.10 — finishing the packing: whatever stays open is a decision.
  'packing.closeAction': 'Finish packing',
  'packing.closeConfirmTitle': 'Finish packing?',
  'packing.closeConfirmMeta': 'Whatever stays open becomes a decision.',
  'packing.closePromptMeta': 'That was the last open item.',
  'packing.startConfirmTitle': 'Start trip',
  'packing.startConfirmMeta': 'Packing is still open. Finish it first?',
  'packing.startConfirmVerb': 'Finish and start',
  'packing.startOnly': 'Start only',
  'packing.startedToastShort': 'Trip started',
  'packing.closeLater': 'Later',
  'packing.closeConfirmBody':
    '{n} open item is recorded as deliberately left behind. | {n} open items are recorded as deliberately left behind.',
  'packing.closeConfirmStarted':
    '{n} started row keeps what is already packed. | {n} started rows keep what is already packed.',
  'packing.closeConfirmLate':
    '{n} of them is only due on departure day. | {n} of them are only due on departure day.',
  'packing.closeConfirmHeld':
    '{n} is in somebody else’s hands right now. | {n} are in other people’s hands right now.',
  'packing.closeConfirmNothing': 'Nothing is open — the packing list is recorded as finished.',
  'packing.closeConfirmVerb': 'Finish · {n}',
  'packing.closeConfirmVerbNothing': 'Finish',
  'packing.closedToast': 'Packing finished · {n} left behind | Packing finished · {n} left behind',
  'packing.closedToastNone': 'Packing finished',
  // FR-7.7 — what becomes of the open tasks when the packing ends.
  'packing.closeConfirmTasks':
    '{n} open task moves to the tasks for the trip itself. | {n} open tasks move to the tasks for the trip itself.',
  'packing.closedToastTasks':
    '{n} task is now for the trip itself | {n} tasks are now for the trip itself',
  'packing.closeConfirmShopping':
    '{n} open purchase moves from “Before the trip” to “At the destination”. | {n} open purchases move from “Before the trip” to “At the destination”.',
  'packing.closedToastShopping':
    '{n} purchase now at the destination | {n} purchases now at the destination',
  'packing.closedTitle': 'Packing finished',
  'packing.closedStamp': '{when} · {n} left behind | {when} · {n} left behind',
  'packing.closedStampNone': '{when}',
  'packing.reopen': 'Reopen',

  // FR-25.20 — rows somebody else is responsible for.
  'packing.othersHidden': '{n} item is with {who} · show | {n} items are with {who} · show',
  'packing.othersShown': 'Hide {n} from {who}',

  // FR-25.27 — what is packed on departure day.
  'packing.lateHidden': 'Show {n} late packer | Show {n} late packers',
  'packing.lateShown': 'Hide {n} late packer | Hide {n} late packers',

  // FR-25.17 — who packed a row, and when.
  'packing.packedBy': 'packed by {who} · {when}',
  'packing.packedByUnknown': 'packed · {when}',
  'packing.responsibleWas': 'assigned to {who}',
  'packing.claimedByMe': 'You are packing this — the others cannot change it',
  'packing.releaseAction': 'Give the item back',
  'packing.takeoverAction': 'Take over',
  'packing.takeoverConfirmTitle': 'Take this item over?',
  'packing.takeoverConfirmBody':
    '{who} is packing “{item}” right now. If you take over, the item becomes yours — and {who} is told.',
  'packing.takeoverConfirmBodyUnknown':
    'Somebody is packing “{item}” right now. If you take over, the item becomes yours — and they are told.',
  'packing.takeoverDone': 'Taken over from {who}',
  'packing.takeoverDoneUnknown': 'Taken over',
  'packing.takeoverFailed': 'Not taken over — nobody is packing this item any more.',
  'packing.lockedBy': '{who} is packing this right now',
  'packing.lockedByUnknown': 'Somebody is packing this right now',
  'packing.lockedHint': 'View only until they are done.',

  // FR-25.11e — an empty list means one of two very different things.
  'packing.emptyOthersHead': 'Everything here is somebody else\u2019s',
  'packing.emptyOthers': '{n} item is with {who}. | {n} items are with {who}.',
  'packing.emptyOthersAction': 'Show all',
  'packing.noMatches': 'No matches',
  'packing.noMatchesSearch': 'Nothing matches “{term}”.',
  'packing.noMatchesFilter':
    '{n} open item is behind the filter. | {n} open items are behind the filter.',
  'packing.noMatchesBoth': 'Nothing matches “{term}” and the filter.',
  'packing.resetSearch': 'Clear search',
  'packing.resetAll': 'Clear search and filter',

  'packing.startedToast':
    'Trip is under way — anything added now counts as missed on the plan (FR-9.1).',
  // FR-27.5 — the closing card on an archived trip.
  'packing.tripFinished': 'Trip finished',
  'packing.reviewTeaser': 'For example: {names}',
  'packing.reviewTeaserNone': 'Nothing to review — every flag has been dealt with.',
  'packing.reviewSuggestions': 'Review suggestions →',
  'packing.tripFinishedHint': "This trip's learning belongs in your templates, not in the archive.",
  'packing.templateFromTrip': 'Create a template from this trip →',
  // M11 — container management (FR-10.1–10.3, FR-25.5).
  'container.title': 'Luggage',
  'container.loadOf': '{weight} of {max}',
  'container.overLimit': 'Over the weight limit',
  'container.imbalance': '{n} % imbalance',
  'container.carriedBy': 'Carried by {name}',
  'container.new': 'New container',
  'container.namePlaceholder': 'e.g. Left pannier',
  'container.carrier': 'Carried by',
  'container.maxWeight': 'Weight limit',
  'container.maxWeightUnit': 'kg',
  'container.noLimit': 'No limit',
  'container.pairing': 'Paired with',
  'container.pairingHint': 'Left/right pairs are flagged beyond {n} % imbalance.',
  'container.delete': 'Delete container',
  'container.deleteNote': 'Its items stay on the list, unassigned.',
  'container.listUnknown': 'Loading the luggage …',
  'container.empty': 'No containers yet. Create one with ＋ to balance weight.',
  'container.unassigned': 'Unassigned items',
  'container.unassignedNone': 'Everything is assigned to a container.',
  'container.assignTitle': 'Which bag?',
  'container.assignNone': 'Create a container first, then assign items to it.',
  'container.notFound': 'This container does not exist.',
  'container.bulkAssign': 'Into luggage …',
  'container.assignCount': 'One position | {n} positions',

  // M14 — review assistant (FR-9.2, group-aware per FR-27.11).
  'review.title': 'Review',
  'review.intro':
    'What this trip taught your groups. Changes go into the group the item came from — not into the vacation template, or only this one trip would learn.',
  'review.open': 'Open',
  'review.kindUnused': 'unused',
  'review.kindMissing': 'missing',
  'review.whyUnused': 'not needed on this trip | not needed on {n} trips',
  'review.whyMissing': 'bought on the road — was not on the list | missing on {n} trips',
  'review.targetFrom': 'From group',
  'review.targetTo': 'Into group',
  'review.blast':
    'Will be proposed to {n} trip that includes “{group}”. | Will be proposed to {n} trips that include “{group}”.',
  'review.apply': 'Apply',
  'review.skip': 'Skip',
  'review.never': 'Never ask again',
  'review.stateApplied': 'applied ✓',
  'review.stateSkipped': 'skipped',
  'review.handledHead': 'Handled',
  'review.appliedSummary':
    '{n} change written to the groups. Trips that follow them are asked on their next open. | {n} changes written to the groups. Trips that follow them are asked on their next open.',
  'review.empty': 'Nothing to review — no flags were set.',
  'review.done': 'All done — every proposal has been handled.',
  'review.snackUnused': 'Set “{item}” to 0 in group “{group}”',
  'review.snackMissing': 'Added “{item}” to group “{group}”',
  'review.snackNever': 'Won’t be suggested again for this item and group',
  'review.nothingToast': 'Nothing to review — no flags were set.',

  // FR-27.16 — taking names over from the inventory. A trip row copies its
  // item's name when it is written, and outside FR-27.4 nothing carried a
  // rename across afterwards.
  'inventoryNames.menu': 'Names from the inventory ({n})',
  'inventoryNames.title': 'Names from the inventory',
  'inventoryNames.lead':
    'These things are called something else in the inventory now. Amounts, packing and assignments stay as they are.',
  'inventoryNames.all': 'All',
  'inventoryNames.selected': '{n} of {total} selected',
  'inventoryNames.for': 'for {names}',
  'inventoryNames.packed': 'packed {packed}/{quantity}',
  'inventoryNames.skipped': 'not coming',
  'inventoryNames.deliberate': 'named on purpose',
  'inventoryNames.deliberateNote': 'This trip kept the name on purpose, so it is not preselected.',
  'inventoryNames.apply': 'Take the name over | Take {n} names over',
  'inventoryNames.applyAll': 'Take the name over | Take all {n} over',
  'inventoryNames.none': 'Nothing selected',
  'inventoryNames.adopted': 'Name taken over | {n} names taken over',
  'inventoryNames.detail': 'The inventory calls it “{name}” now.',
  'inventoryNames.adoptOne': 'Take over',
  'packing.decrease': 'Decrease packed count',
  'packing.increase': 'Increase packed count',
  'travelerProgress.title': 'Per person',
  'travelerProgress.count': '{done} of {total}',
  'travelerProgress.done': 'done ✓',
  'travelerProgress.nothing': 'nothing to pack',
  'travelerProgress.face': '{name}: {count}',
  'travelerProgress.shared': 'Shared',
  'travelerProgress.sharedLabel': 'Shared: {count}',
  'travelerProgress.more': 'more',
  'travelerProgress.moreLabel': 'Show 1 more person | Show {n} more people',
  'travelerProgress.moreOpen': '{n} still open',
  'travelerProgress.moreAllDone': 'all done',
  'travelerProgress.less': 'Show fewer',

  // The shopping list as the packing side and M1 speak of it; the list's own
  // copy is in shopping/i18n/.
  'shopping.wentToPacking': 'on the packing list',
  'shopping.wentPacked': 'packed',
  'shopping.dueCount': '{n} purchase | {n} purchases',
  'shopping.dueHint': '{n} purchase due | {n} purchases due',
  'shopping.boughtBy': 'bought by {who} · {when}',
  'shopping.boughtByUnknown': 'bought · {when}',
} as const
