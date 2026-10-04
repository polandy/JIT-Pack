/**
 * The shopping list's English copy (FR-30) — M6 and its sheets.
 *
 * Merged into the one catalogue by `i18n/index.ts`, so `t()` reads these keys
 * like any other. The copy lives here, beside the screens, so a diff that
 * changes only this module's words stays inside the module and CI runs its
 * cases alone (ADR-079). A key here is read only inside this module;
 * `module-boundary-gate.mjs` holds that, and the catalogue-integrity spec
 * holds that no key is defined twice.
 */
export const shoppingEn = {
  // M6 shopping views (FR-3.2/3.3).
  'shopping.title': 'Shopping',
  'shopping.beforeDeparture': 'Before the trip',
  'shopping.beforeDepartureCount': 'Before the trip ({n})',
  'shopping.atDestination': 'At destination',
  'shopping.atDestinationCount': 'At destination ({n})',
  'shopping.carriedOver': 'From before departure',
  'shopping.packingList': 'Packing list',
  'shopping.forWhom': 'for {names}',
  'shopping.bought': 'Bought: {name}',
  // FR-33.13: the mark on fresh food.
  'shopping.fresh': 'fresh',
  'shopping.undoBought': 'Not bought after all: {name}',
  'shopping.listUnknown': 'Loading the shopping list …',
  'shopping.dueField': 'Due',
  'shopping.beforeLocked':
    'The packing is finished — this list is now the record of what was bought before the trip.',
  'shopping.emptyBefore': 'Nothing to buy before the trip',
  'shopping.emptyLocal': 'Nothing to buy at the destination',
  'shopping.emptyHint':
    'Type what you mean to buy above. Anything on the packing list that is bought rather than packed shows up here by itself.',
  'shopping.ownEntries': 'Added here',
  'shopping.addPlaceholder': 'What to buy? e.g. milk, bread …',
  'shopping.addLabel': 'Add to list',
  'shopping.tags': 'Tags',
  'shopping.tagFiledUnder': 'Filed under: {tag}',
  'shopping.tagAdd': '＋ Tag',
  'shopping.dueGroup': 'Due',
  'shopping.openCount': '{n} open',
  'shopping.boughtFold': '{n} bought',
  'shopping.beforeHistory': 'Before the trip · {n} bought',
  'shopping.beforeHistoryEmpty': 'Before the trip · closed',
  'shopping.listRest': '{list} · nothing open',
  'shopping.listRestBought': '{list} · nothing open · {n} bought',
  'shopping.listRestDue': '{list} · {due} due',
  'shopping.listRestDueBought': '{list} · {due} due · {n} bought',
  'shopping.emptyAll': 'Nothing to buy',
  'shopping.listLabel': 'List',
  'shopping.tagNone': 'No tag yet — the entry is listed under “Added here”.',
  'shopping.entrySheetNew': 'New entry',
  'shopping.entrySheetEdit': 'Edit entry',
  'shopping.entryName': 'Name',
  'shopping.cardTitleFor': 'Shopping · {trip}',
  'shopping.fromPacking': 'Packing list',
  'shopping.boughtUndoable': '“{name}” bought',
  'shopping.buyAgain': 'Again',
  'shopping.buyAgainLabel': 'Buy {name} again',
  'shopping.onListAgain': 'On the list',
  'shopping.boughtAgain': '“{name}” is back on the list',
  'shopping.showAll': 'Show all {n}',
  'shopping.openList': 'Open the shopping list',
  'shopping.moreLines': '+ {n} more · open the shopping list',
  'shopping.addedToList': '“{name}” added to the shopping list',
  'shopping.select': 'Select',
  'shopping.selectHint': 'Packing-list positions never carry a tag — not selectable.',
  'shopping.bulkTag': 'Give a tag',
  'shopping.bulkTagTitle': 'Tag for one entry | Tag for {n} entries',
  'shopping.bulkTagged': '“{tag}” given to one entry | “{tag}” given to {n} entries',
  'shopping.bulkUntagged': 'Tag removed from one entry | Tag removed from {n} entries',
  'shopping.mine': 'Mine',
  'shopping.bulkAssign': 'Assign',
  'shopping.bulkAssignTitle': 'Who buys one entry? | Who buys {n} entries?',
  'shopping.bulkAssigned': 'One entry → {who} | {n} entries → {who}',
  'shopping.bulkUnassigned': 'One entry: nobody responsible | {n} entries: nobody responsible',
  'shopping.bulkNothingToDo': 'Nothing to change — the selection already carries that tag.',
  'shopping.bulkRemove': 'Delete',
  'shopping.bulkRemoved': 'One entry deleted | {n} entries deleted',
  'shopping.dragToMove': 'Move {name}',
  'shopping.retagged': '“{name}” → {group}',
  'shopping.dragHint':
    'Packing-list positions never carry a tag — they move only within their own group.',
} as const
