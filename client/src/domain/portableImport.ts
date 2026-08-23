/**
 * What a portable YAML document *means* (FR-18.4) — the rules that turn one
 * into rows, expressed once.
 *
 * ADR-008 puts these rules on the client because Local Mode has no server to
 * run them; the same reasoning makes them useless where only a Vue composable
 * can reach them, since anything else that imports — the command line, a
 * script — would have to write them a second time. So the rules live here as
 * plain functions over plain data, and everything that imports supplies a
 * `PortableImportEnv`: where to read the inventory, how to build a mutation,
 * and what to do with one.
 */

import { TABLE } from '@/types/tables'
import { matchPortableItems, portableYear } from '@/domain/portable'
import type { PortableDocument, PortableItem } from '@/domain/portable'
import { ledgerId, positionKey, propagatedItemId } from '@/domain/refresh'
import type { Mutation } from '@/api/types'
import type { GeneratedPosition, MasterItem, Tag, Template } from '@/types/domain'
import type { useMutations } from '@/composables/useMutations'

/**
 * The mutation builders an import uses. Deliberately the real factory rather
 * than a hand-written interface: a builder is where a row's shape is decided,
 * and an import that built its rows a second way would be the drift this
 * module exists to prevent.
 */
export type ImportMutations = ReturnType<typeof useMutations>

/**
 * The inventory an import matches against. It has to be a **live** view, not
 * a copy: the rules re-read it between writes — a group created for one
 * document is found by the next, and the FR-27.4 ledger indexes items that
 * the same import created moments earlier.
 */
export interface PortableImportMasterView {
  readonly itemList: MasterItem[]
  readonly tagList: Tag[]
  readonly templateList: Template[]
}

/** What one imported document produced. */
export interface PortableImportResult {
  kind: 'template' | 'trip'
  id: string
}

export interface PortableImportEnv {
  master: PortableImportMasterView
  mutations: ImportMutations
  /**
   * Record one write: apply it locally and queue it for the server. It must
   * be visible in `master` by the time it returns, because the rules above
   * read their own output back.
   */
  emit(
    partition: 'master' | 'trip',
    tripId: string | null,
    table: string,
    id: string,
    mutation: Mutation,
  ): void
}

/**
 * importPositions writes one template's positions and their FR-27.7 tasks
 * from a portable document. Shared by the document's own template and by
 * the groups it brought (ADR-017), so the two cannot drift apart.
 */
function importPositions(
  env: PortableImportEnv,
  templateId: string,
  items: PortableItem[],
  resolveItem: (item: PortableItem) => string | null,
): void {
  for (const item of items) {
    const itemId = resolveItem(item)
    if (!itemId) continue
    const ti = env.mutations.addTemplateItem(templateId, itemId, {
      quantity: item.quantity,
      assignment: item.assignment ?? 'per_person',
      dedup: item.dedup ?? 'max',
      defaultMode: item.default_mode ?? 'pack',
      latePacker: item.late_packer,
      conditions: item.conditions,
    })
    env.emit('master', null, TABLE.templateItems, ti.id, ti.mutation)

    for (const task of item.tasks) {
      const t = env.mutations.addTemplateItemTask(ti.id, task)
      env.emit('master', null, TABLE.templateItemTasks, t.id, t.mutation)
    }
  }
}

/**
 * ensureGroup returns the id of the group of that name, creating it with
 * the file's positions only when this device has never heard of it.
 *
 * ADR-017: the name is a group's identity across instances, so an import
 * links and never rewrites — the file may be older than the group, and
 * since FR-27.4 a group edit reaches every trip that follows it. The rule
 * belongs to the *group*, not to where in the file it appears, which is why
 * a group's own document and a Vorlage's `includes:` both come through
 * here: a backup carries the same group both ways, and whichever document
 * the file happens to list first must not leave a second copy behind.
 */
function ensureGroup(
  env: PortableImportEnv,
  name: string,
  items: PortableItem[],
  resolveItem: (item: PortableItem) => string | null,
  icon: string | null = null,
): string {
  const existing = env.master.templateList.find((t) => t.kind === 'group' && t.name === name)
  if (existing) return existing.id

  const created = env.mutations.createTemplate(name, '', 'group', icon)
  env.emit('master', null, TABLE.templates, created.id, created.mutation)
  importPositions(env, created.id, items, resolveItem)
  return created.id
}

/**
 * Restore the FR-27.4 refresh state of a trip that has just been imported
 * (ADR-015): what it follows, what generation last produced for it, and the
 * record of what it already took over.
 *
 * Every reference in the file is a name and every id here is new, so the
 * three sections are re-keyed rather than copied. A reference this device
 * cannot resolve is dropped — a source pointing at no template would never
 * propose anything, and a ledger entry keyed on the wrong position detaches
 * one nobody asked to detach. The log is the exception: its group name is
 * denormalised for exactly this reason and survives without the group.
 */
function restoreRefreshState(
  env: PortableImportEnv,
  tripId: string,
  doc: PortableDocument,
  templateIdByName: Map<string, string>,
  travelerIDs: Map<string, string>,
  rowIdByPosition: Map<string, string>,
): void {
  // Indexed once: a restored trip resolves a name per source, per ledger
  // entry and per log line, and both lists are the whole device.
  const templatesByName = new Map(env.master.templateList.map((t) => [t.name, t.id]))
  const itemsByName = new Map(env.master.itemList.map((i) => [i.name, i.id]))
  const templateId = (name: string): string | undefined =>
    templateIdByName.get(name) ?? templatesByName.get(name)

  for (const name of doc.follows) {
    const followed = templateId(name)
    if (!followed) continue
    const { mutation, id } = env.mutations.registerTripSource(tripId, followed)
    env.emit('master', null, TABLE.tripTemplateSources, id, mutation)
  }

  for (const entry of doc.generated) {
    const sourceTemplateId = templateId(entry.source)
    const sourceItemId = itemsByName.get(entry.item)
    if (!sourceTemplateId || !sourceItemId) continue
    const travelerId = entry.traveler === null ? '' : (travelerIDs.get(entry.traveler) ?? '')
    // A per-person entry whose traveler is not on the restored trip has no
    // position to be about (FR-25.8); '' would silently make it trip-global.
    if (entry.traveler !== null && travelerId === '') continue
    const position: GeneratedPosition = {
      id: ledgerId(tripId, sourceItemId, travelerId),
      trip_id: tripId,
      // The restored row, or the id that row *would* have had. The entry
      // outliving its row is FR-27.4's record of a deleted position, and
      // restoring it as anything else offers the position again.
      trip_item_id:
        rowIdByPosition.get(positionKey(sourceItemId, travelerId)) ??
        propagatedItemId(tripId, sourceItemId, travelerId),
      source_template_id: sourceTemplateId,
      source_item_id: sourceItemId,
      traveler_id: travelerId,
      name: entry.name,
      quantity: entry.quantity,
      mode: entry.mode,
      late_packer: entry.late_packer,
      weight_grams: entry.weight_grams,
      value_cents: entry.value_cents,
      category_name: entry.category,
      tasks: entry.tasks,
    }
    const mutation = env.mutations.writeGeneratedPosition(position)
    env.emit('trip', tripId, TABLE.tripGeneratedPositions, position.id, mutation)
  }

  for (const change of doc.applied_changes) {
    const { mutation, id } = env.mutations.logAppliedChange(
      {
        trip_id: tripId,
        source_template_id: templateId(change.source) ?? '',
        source_template_name: change.source,
        kind: change.kind,
        item_name: change.item,
        detail: change.detail,
      },
      change.at,
    )
    env.emit('master', null, TABLE.tripAppliedChanges, id, mutation)
  }
}

/**
 * File a restored master item under the tags the document named, in order
 * (FR-24.1/24.2) — the list's order *is* `item_tags.position`, so the first
 * name becomes the primary tag.
 *
 * A tag is linked by name and only created when this device has never heard
 * of it, the same identity rule groups follow (ADR-017): `tags.name` is
 * UNIQUE, so a second copy is not merely untidy, it is impossible.
 */
function applyTags(env: PortableImportEnv, itemId: string, names: string[]): void {
  if (names.length === 0) return
  const byName = new Map(env.master.tagList.map((t) => [t.name.toLowerCase(), t.id]))
  names.forEach((name, position) => {
    const existing = byName.get(name.toLowerCase())
    const tagId = existing ?? createTag(env, name)
    if (!existing) byName.set(name.toLowerCase(), tagId)
    assignTag(env, itemId, tagId, position)
  })
}

/** Create a tag by name (FR-24.1) — there is no tag admin. */
function createTag(env: PortableImportEnv, name: string): string {
  const { mutation, id } = env.mutations.createTag(name, env.master.tagList.length)
  env.emit('master', null, TABLE.tags, id, mutation)
  return id
}

/**
 * Record one item↔tag assignment on the import path, which enqueues
 * directly rather than through enqueueAndDrain: an import lands many
 * mutations and drains once at the end.
 */
function assignTag(env: PortableImportEnv, itemId: string, tagId: string, position: number): void {
  const { mutation, id } = env.mutations.assignTag(itemId, tagId, position)
  env.emit('master', null, TABLE.itemTags, id, mutation)
}

/**
 * importPortableDocument lands an M18 portable YAML document (FR-18.4):
 * a template becomes a new private owned template (FR-1.6) with its
 * master items merged per the dedup decisions (imported name →
 * existing item id) or created; a trip becomes a *planning* trip with
 * travelers/containers remapped by name and pack progress preserved.
 */
export function importPortableDocument(
  doc: PortableDocument,
  mergeDecisions: Map<string, string>,
  env: PortableImportEnv,
  /**
   * Templates this restore has already created, by the name their document
   * carried. A Ferien-Vorlage may land under a suffixed name (see below),
   * and a trip that follows it must still find it.
   */
  restoredTemplates?: Map<string, string>,
): PortableImportResult {
  const resolveItem = (item: PortableItem): string | null => {
    const merged = mergeDecisions.get(item.name)
    if (merged) return merged
    /*
     * A trip row is only inventory if it says so (ADR-024). Before the file
     * carried that, every unmatched row stayed ad-hoc, which lost the master
     * item of anything no template also used — and with it the mark and the
     * tags. Creating one for *every* row would be the opposite error: a row
     * the user typed once on a trip is not something they filed away.
     */
    if (doc.kind === 'trip' && !item.from_inventory) return null
    const { mutation, id } = env.mutations.createMasterItem(item.name, { icon: item.icon })
    env.emit('master', null, TABLE.items, id, mutation)
    applyTags(env, id, item.tags)
    return id
  }

  if (doc.kind === 'template' && doc.scope === 'group') {
    // A group document is the same group the Vorlagen carry nested, so it
    // obeys the same identity rule rather than arriving as a copy.
    const groupId = ensureGroup(env, doc.name, doc.items, resolveItem, doc.icon)
    return { kind: 'template', id: groupId }
  }

  if (doc.kind === 'template') {
    // UNIQUE(owner_id, name): dodge collisions with a visible suffix. Two
    // Ferien-Vorlagen of one name are two different plans — unlike groups,
    // merging them would lose one, so only groups link (ADR-017).
    const taken = new Set(env.master.templateList.map((t) => t.name))
    const name = taken.has(doc.name) ? `${doc.name} (import)` : doc.name
    const { mutation, id: templateId } = env.mutations.createTemplate(
      name,
      '',
      'template',
      doc.icon,
    )
    env.emit('master', null, TABLE.templates, templateId, mutation)

    importPositions(env, templateId, doc.items, resolveItem)

    // FR-27.1/ADR-017: the file brought its groups whole, and each is
    // linked or created by name — never rewritten.
    for (const group of doc.includes) {
      const groupId = ensureGroup(env, group.name, group.items, resolveItem, group.icon)

      const inc = env.mutations.addTemplateInclude(templateId, groupId)
      env.emit('master', null, TABLE.templateIncludes, inc.id, inc.mutation)
    }

    return { kind: 'template', id: templateId }
  }

  // Trip import — planning status (FR-18.4), fresh trip partition.
  // FR-2.1b: neither date has to be there any more, so an absent one
  // stays absent rather than being invented as today's date; the year
  // is what the document must yield, from its own field or its dates.
  const { mutation: tripMut, id: tripId } = env.mutations.createTrip(
    doc.name,
    portableYear(doc),
    doc.start_date,
    doc.end_date,
    // FR-2.2/ADR-024: the status the file carried, or planning when it
    // carried none — which every file written before ADR-024 does, and
    // which is exactly what those files have always produced.
    { status: doc.status ?? undefined },
  )
  env.emit('master', null, TABLE.trips, tripId, tripMut)

  const travelerIDs = new Map<string, string>()
  for (const traveler of doc.travelers) {
    const { mutation, id } = env.mutations.addTraveler(tripId, traveler.name, null)
    env.emit('trip', tripId, TABLE.travelers, id, mutation)
    travelerIDs.set(traveler.name, id)
  }

  const containerIDs = new Map<string, string>()
  for (const container of doc.containers) {
    const { mutation, id } = env.mutations.addContainer(tripId, container.name, {
      carrierTravelerId: container.carrier ? (travelerIDs.get(container.carrier) ?? null) : null,
      maxWeightGrams: container.max_weight_grams,
    })
    env.emit('trip', tripId, TABLE.containers, id, mutation)
    containerIDs.set(container.name, id)
  }

  // The FR-27.4 ledger is keyed on (master item, traveler), so the rows are
  // indexed on the way in rather than searched for by name afterwards: a
  // manual rename is exactly the case the ledger has to survive.
  const rowIdByPosition = new Map<string, string>()

  for (const item of doc.items) {
    const sourceItemId = resolveItem(item)
    const { mutation, id } = env.mutations.addPortableTripItem(
      tripId,
      {
        name: item.name,
        sourceItemId,
        categoryName: item.category,
        quantity: Math.max(0, Math.ceil(Number(item.quantity) || 0)),
        packedCount: item.packed_count ?? 0,
        mode: item.mode === 'buy_before' || item.mode === 'buy_local' ? item.mode : 'pack',
        latePacker: item.late_packer,
      },
      item.traveler ? (travelerIDs.get(item.traveler) ?? null) : null,
      item.container ? (containerIDs.get(item.container) ?? null) : null,
    )
    env.emit('trip', tripId, TABLE.tripItems, id, mutation)
    if (sourceItemId) {
      const key = positionKey(
        sourceItemId,
        item.traveler ? (travelerIDs.get(item.traveler) ?? '') : '',
      )
      if (!rowIdByPosition.has(key)) rowIdByPosition.set(key, id)
    }
  }

  restoreRefreshState(env, tripId, doc, restoredTemplates ?? new Map(), travelerIDs, rowIdByPosition)

  return { kind: 'trip', id: tripId }
}

/**
 * Restore a whole backup file (NFR-4.11): every document, in order.
 *
 * Matching happens **per document, as it is imported**, not once for the
 * file: a backup names the same master item in a template and in every trip
 * that uses it, so matching up front against the inventory as it was before
 * the restore would create one copy per mention. A document that carries no
 * name is skipped rather than aborting the restore — the rest of the file is
 * still the user's data.
 */
export function importPortableBackup(
  docs: PortableDocument[],
  env: PortableImportEnv,
): PortableImportResult[] {
  const imported: PortableImportResult[] = []
  // A trip's FR-27.4 sections name the templates it follows, and a Vorlage
  // may have landed under a suffixed name; `buildBackup` writes the
  // templates first, so by the time a trip arrives this map has them.
  const restoredTemplates = new Map<string, string>()
  for (const doc of docs) {
    if (doc.name.trim() === '') continue
    const decisions = new Map<string, string>()
    for (const match of matchPortableItems(doc, env.master.itemList)) {
      if (match.existingId) decisions.set(match.name, match.existingId)
    }
    const result = importPortableDocument(doc, decisions, env, restoredTemplates)
    if (result.kind === 'template') restoredTemplates.set(doc.name, result.id)
    imported.push(result)
  }
  return imported
}
