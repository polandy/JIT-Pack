/**
 * What a finished trip gives back to the master data (M14, M21): FR-9.2's
 * review proposals, one row at a time, and FR-27.5's fold of a whole trip
 * into a composed Ferien-Vorlage.
 *
 * One group because both run the same way round — a trip is the *input* and
 * master data the output, which is the opposite direction from every other
 * group here. Neither queues a mutation of its own: they compose the master
 * data group's writers, which is why that group is the only edge.
 */
import { foldName } from '@/domain/nameCollision'
import { planTemplateFromTrip, recogniseTripComposition } from '@/domain/templateFromTrip'
import type { DeviationChoice, PositionDraft } from '@/domain/templateFromTrip'
import type { ReviewProposal } from '@/domain/review'
import type { SyncContext } from '../context'
import type { createMasterDataActions } from './masterData'

/** createPostTripActions binds M14's and M21's write paths to one context. */
export function createPostTripActions(
  ctx: SyncContext,
  deps: { masterData: ReturnType<typeof createMasterDataActions> },
) {
  const { tripStore, masterStore, names, tripDataLoaded } = ctx
  const { masterData: masterDataActions } = deps

  /**
   * applyReviewProposal writes one review row back to master data
   * (FR-9.2). The target is a *group* (FR-27.11) — the row's picker may
   * have moved it off the proposal's default, so the group id is passed
   * explicitly. Groups are shared instance-wide (FR-1.6 MVP), so the
   * change lands in place — there is no fork step. Returns the id of
   * the group that received the change.
   */
  function applyReviewProposal(proposal: ReviewProposal, groupId: string): string {
    if (proposal.kind === 'unused') {
      // Look the position up by item at apply time: the proposal may
      // predate an edit that replaced the row.
      const target = masterStore
        .getTemplateItems(groupId)
        .find((ti) => ti.item_id === proposal.itemId)
      if (target) masterDataActions.updateTemplateItem(target, { quantity: 0 })
      return groupId
    }
    const itemId = proposal.itemId ?? masterDataActions.createMasterItem(proposal.itemName)
    masterDataActions.addTemplateItem(groupId, itemId)
    return groupId
  }

  /**
   * createTemplateFromTrip folds a finished trip back into templates (M21,
   * FR-27.5) and returns the id of the composed Ferien-Vorlage it created.
   *
   * The writes run in the order FR-27.5 spells out — master items first, then
   * the group updates the user let through, then the optional bundle group,
   * then the Vorlage that **references** the recognised groups. Referencing
   * rather than copying is the whole point of the screen: a flat copy forks
   * every group the trip came from, and next year two divergent camera lists
   * exist.
   *
   * A deviation written into a group reaches every trip that still follows it
   * — the FR-27.4 question does the rest on the next open, which is why
   * nothing is recorded against those trips here.
   *
   * Returns null when the trip's own rows are not on this device: "not pulled
   * yet" must never be read as "a trip of nothing", which would silently
   * produce an empty template (the same guard addGroupToTrip carries).
   */
  function createTemplateFromTrip(
    tripId: string,
    answers: {
      templateName: string
      choices: Record<string, DeviationChoice>
      checkedLooseIds: string[]
      bundleName: string | null
    },
  ): string | null {
    if (!tripDataLoaded(tripId)) return null
    // Before the first write, not between them: this screen creates a
    // Vorlage and possibly a group, and half of M21's work landing before a
    // refused name would leave the trip folded into nothing (FR-1.6).
    if (names.templateNameCollision(answers.templateName)) return null
    if (answers.bundleName !== null) {
      if (names.templateNameCollision(answers.bundleName)) return null
      if (foldName(answers.bundleName) === foldName(answers.templateName)) return null
    }

    const composition = recogniseTripComposition({
      tripItems: tripStore.getItems(tripId),
      // M21 offers existing groups to fold the trip into, so it offers only
      // groups that still exist for the user (FR-24.3).
      templates: masterStore.activeTemplateList,
      positions: masterStore.activeTemplateList.flatMap((t) => masterStore.getTemplateItems(t.id)),
      masterItems: masterStore.itemList,
    })
    const writes = planTemplateFromTrip({
      composition,
      templateName: answers.templateName,
      choices: answers.choices,
      checkedLooseIds: answers.checkedLooseIds,
      bundleName: answers.bundleName,
      masterItems: masterStore.itemList,
    })

    // 1. The master items the ad-hoc names had no counterpart for (FR-9.2).
    const invented = new Map<string, string>()
    for (const name of writes.newMasterItems)
      invented.set(name, masterDataActions.createMasterItem(name))
    const itemIdOf = (p: PositionDraft) => p.itemId ?? invented.get(p.name)

    // A trip row is one thing somebody packed, not a per-head rule — the
    // per-person default belongs to positions written in M8, where the
    // question was actually asked.
    const write = (templateId: string, positions: PositionDraft[]) => {
      for (const p of positions) {
        const itemId = itemIdOf(p)
        if (itemId)
          masterDataActions.addTemplateItem(templateId, itemId, { assignment: 'trip_global' })
      }
    }

    // 2. Deviations flowing back into their group.
    for (const update of writes.groupUpdates) write(update.groupId, update.positions)

    // 3. The optional bundle group, included like any other.
    const includeIds = [...writes.template.includeGroupIds]
    if (writes.newGroup) {
      const groupId = masterDataActions.createTemplate(writes.newGroup.name, 'group')
      if (groupId === null) return null
      write(groupId, writes.newGroup.positions)
      includeIds.push(groupId)
    }

    // 4. The composed Ferien-Vorlage itself.
    const templateId = masterDataActions.createTemplate(writes.template.name, 'template')
    if (templateId === null) return null
    write(templateId, writes.template.positions)
    for (const groupId of includeIds) masterDataActions.addTemplateInclude(templateId, groupId)

    return templateId
  }

  return { applyReviewProposal, createTemplateFromTrip }
}
