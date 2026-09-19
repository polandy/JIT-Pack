/**
 * `jitpack tags`' plan: an ordered list of the acts M9 offers on tags —
 * rename, merge, give, take, delete, mark (FR-24.9/24.10/24.13) — read from
 * YAML or from one command line, and run against a command context.
 *
 * It owns no rule of its own. Every step calls the action the screen calls
 * (`client/cli/context.ts`, ADR-042), so a refusal the tag manager would
 * show — a taken name, a tag items still carry — is the refusal here. What
 * this module adds is only what a screen gets from a finger: which tag and
 * which items a *name* means.
 */

import { parse } from 'yaml'
import { foldName } from '@/domain/nameCollision'
import { MARK_INDEX } from '@/domain/itemMarks'
import { isRetired } from '@/domain/masterDeletion'
import { primaryTagOf, tagDeletion } from '@/domain/tags'
import type { MasterItem, Tag } from '@/types/domain'
import type { CommandContext } from './context'

/** The step kinds, spelled as the plan file spells them. */
export const TAG_OP = {
  rename: 'rename',
  merge: 'merge',
  give: 'give',
  take: 'take',
  delete: 'delete',
  mark: 'mark',
} as const

export type TagOp = (typeof TAG_OP)[keyof typeof TAG_OP]

/** `take: X, items: all` — every active item carrying the tag. */
export const ALL_ITEMS = 'all'

/** One act on the tag axis. Tags and items are named as a person would name them. */
export type TagStep =
  | { op: typeof TAG_OP.rename; tag: string; to: string }
  | { op: typeof TAG_OP.merge; tag: string; into: string }
  | { op: typeof TAG_OP.give; tag: string; items: string[]; primary: boolean }
  | { op: typeof TAG_OP.take; tag: string; items: string[] | typeof ALL_ITEMS }
  | { op: typeof TAG_OP.delete; tag: string }
  | { op: typeof TAG_OP.mark; tag: string; mark: string | null }

/** Each step kind's companion keys — anything else in an entry is a typo. */
const COMPANIONS: Record<TagOp, readonly string[]> = {
  rename: ['to'],
  merge: ['into'],
  give: ['items', 'primary'],
  take: ['items'],
  delete: [],
  mark: ['as'],
}

const OPS = Object.values(TAG_OP)

/**
 * Read a plan file. Every entry is checked before anything runs, so a typo
 * in step 30 is reported before step 1 has written — the plan is one
 * decision, not thirty.
 */
export function parseTagPlan(text: string): { steps: TagStep[] } | { error: string } {
  let doc: unknown
  try {
    doc = parse(text)
  } catch (e) {
    return { error: `not YAML: ${e instanceof Error ? e.message : String(e)}` }
  }
  if (!Array.isArray(doc)) return { error: 'a plan is a list of steps' }

  const steps: TagStep[] = []
  for (const [index, entry] of doc.entries()) {
    const where = `step ${index + 1}`
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
      return { error: `${where}: expected a mapping such as "merge: Elektronik"` }
    }
    const fields = entry as Record<string, unknown>
    const ops = Object.keys(fields).filter((key): key is TagOp => OPS.includes(key as TagOp))
    if (ops.length !== 1) {
      return { error: `${where}: name exactly one of ${OPS.join(', ')}` }
    }
    const op = ops[0]!
    const stray = Object.keys(fields).find((key) => key !== op && !COMPANIONS[op].includes(key))
    if (stray) return { error: `${where}: "${stray}" does not belong to ${op}` }

    const step = stepOf(op, fields)
    if ('error' in step) return { error: `${where}: ${step.error}` }
    steps.push(step)
  }
  return { steps }
}

function stepOf(op: TagOp, fields: Record<string, unknown>): TagStep | { error: string } {
  const tag = text(fields[op])
  if (!tag) return { error: `${op} needs a tag name` }

  switch (op) {
    case TAG_OP.rename: {
      const to = text(fields.to)
      return to ? { op, tag, to } : { error: 'rename needs "to"' }
    }
    case TAG_OP.merge: {
      const into = text(fields.into)
      return into ? { op, tag, into } : { error: 'merge needs "into"' }
    }
    case TAG_OP.give: {
      const items = names(fields.items)
      if (!items || items.length === 0) return { error: 'give needs a list of "items"' }
      if (fields.primary !== undefined && typeof fields.primary !== 'boolean') {
        return { error: '"primary" is true or false' }
      }
      // The bulk sheet's switch defaults on: giving is usually refiling.
      return { op, tag, items, primary: fields.primary !== false }
    }
    case TAG_OP.take: {
      if (fields.items === ALL_ITEMS) return { op, tag, items: ALL_ITEMS }
      const items = names(fields.items)
      if (!items || items.length === 0) {
        return { error: `take needs a list of "items", or "items: ${ALL_ITEMS}"` }
      }
      return { op, tag, items }
    }
    case TAG_OP.delete:
      return { op, tag }
    case TAG_OP.mark: {
      if (!('as' in fields)) return { error: 'mark needs "as" — an emoji, or null to clear' }
      if (fields.as === null) return { op, tag, mark: null }
      const mark = text(fields.as)
      return mark ? { op, tag, mark } : { error: '"as" is an emoji, or null to clear' }
    }
  }
}

function text(value: unknown): string | null {
  if (typeof value === 'number') return String(value)
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null
}

function names(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null
  const out = value.map(text)
  return out.every((name): name is string => name !== null) ? out : null
}

/** What a run did: one line per step, and whether it got through all of them. */
export interface TagPlanRun {
  lines: string[]
  /** Set when a step was refused; the run stops there and nothing is sent. */
  failure: string | null
}

/**
 * Run the steps in order against the context's stores. Each step sees what
 * the ones before it wrote — the actions paint the store as they go — so a
 * plan can give a tag it creates and then delete what it emptied.
 */
export function runTagPlan(ctx: CommandContext, steps: TagStep[]): TagPlanRun {
  const lines: string[] = []
  for (const [index, step] of steps.entries()) {
    const outcome = runStep(ctx, step)
    if ('error' in outcome) {
      return { lines, failure: `step ${index + 1} (${step.op} ${step.tag}): ${outcome.error}` }
    }
    lines.push(outcome.line)
  }
  return { lines, failure: null }
}

type StepOutcome = { line: string } | { error: string }

function runStep(ctx: CommandContext, step: TagStep): StepOutcome {
  const { master, masterData } = ctx

  if (step.op === TAG_OP.give) {
    // FR-24.9's create row: giving a tag that does not exist yet makes it.
    // Items first, so a misspelt one does not leave a tag created for nothing.
    const items = resolveItems(master.itemList, step.items)
    if ('error' in items) return items
    const existing = findTag(master.tagList, step.tag)
    const tagId = existing?.id ?? masterData.createTag(step.tag)
    const { touched } = masterData.giveTagToItems(items.items, tagId, step.primary)
    const made = existing ? '' : ' (new tag)'
    const how = step.primary ? 'filed under' : 'also tagged'
    return {
      line: `give ${step.tag}${made}: ${touched} of ${counted(items.items.length)} ${how} it`,
    }
  }

  const tag = findTag(master.tagList, step.tag)
  if (!tag) return { error: `no tag called "${step.tag}"` }

  switch (step.op) {
    case TAG_OP.rename: {
      // Read before the write: the action paints the store, and the row may be
      // the one it repaints.
      const was = tag.name
      const result = masterData.renameTag(tag.id, step.to)
      if (!result.ok)
        return { error: `"${result.collision}" already exists — merge into it instead` }
      return { line: `rename ${was} → ${step.to}` }
    }
    case TAG_OP.merge: {
      const target = findTag(master.tagList, step.into)
      if (!target) return { error: `no tag called "${step.into}" — rename instead` }
      if (target.id === tag.id) return { error: 'a tag cannot be merged into itself' }
      const moved = masterData.mergeTags(tag.id, target.id)
      return {
        line: `merge ${tag.name} → ${target.name}: ${counted(moved)} moved, ${tag.name} removed`,
      }
    }
    case TAG_OP.take: {
      const items =
        step.items === ALL_ITEMS
          ? { items: carriersOf(ctx, tag.id) }
          : resolveItems(master.itemList, step.items)
      if ('error' in items) return items
      const { touched } = masterData.takeTagFromItems(items.items, tag.id)
      return { line: `take ${tag.name}: removed from ${counted(touched)}` }
    }
    case TAG_OP.delete: {
      const result = masterData.deleteTag(tag.id)
      if (!result.ok) return { error: refusalOf(ctx, tag.id, result.references) }
      return { line: `delete ${tag.name}` }
    }
    case TAG_OP.mark: {
      if (step.mark !== null && !MARK_INDEX.some((entry) => entry.emoji === step.mark)) {
        // The picker offers only the curated index — and the instance's mark
        // font is cut to it (FR-28.6), so anything else renders as tofu.
        return { error: `${step.mark} is not in the mark picker's index` }
      }
      masterData.setTagMark(tag.id, step.mark)
      return { line: `mark ${tag.name}: ${step.mark ?? 'cleared'}` }
    }
  }
}

function findTag(tags: Tag[], name: string): Tag | undefined {
  const folded = foldName(name)
  return tags.find((tag) => tag.id === name || foldName(tag.name) === folded)
}

/**
 * Items by id or name. Only active ones: M9's selection never offers a
 * retired item, so a name that only a retired item holds is an error that
 * says so rather than a silent write to a row nobody sees.
 */
function resolveItems(
  all: MasterItem[],
  wanted: string[],
): { items: MasterItem[] } | { error: string } {
  const items: MasterItem[] = []
  for (const name of wanted) {
    const byId = all.find((item) => item.id === name && !isRetired(item))
    if (byId) {
      items.push(byId)
      continue
    }
    const named = all.filter((item) => foldName(item.name) === foldName(name))
    const active = named.filter((item) => !isRetired(item))
    if (active.length === 1) items.push(active[0]!)
    else if (active.length > 1) return { error: `"${name}" is several items — name it by id` }
    else if (named.length > 0) return { error: `"${name}" is retired — restore it first` }
    else return { error: `no item called "${name}"` }
  }
  return { items }
}

/** What M9's „Alle N" over a tag filter selects: the active items carrying it. */
function carriersOf(ctx: CommandContext, tagId: string): MasterItem[] {
  const carrying = new Set(
    ctx.master.itemTagList.filter((a) => a.tag_id === tagId).map((a) => a.item_id),
  )
  return ctx.master.activeItemList.filter((item) => carrying.has(item.id))
}

function refusalOf(ctx: CommandContext, tagId: string, references: number): string {
  const retired = references - carriersOf(ctx, tagId).length
  const hidden = retired > 0 ? `, ${retired} of them retired` : ''
  return `${counted(references)} still carry it${hidden} — merge it into another tag instead`
}

/**
 * The axis as the tag manager shows it: each tag, its mark, and how many
 * items carry it — retired ones included, because that is the count a delete
 * is refused with (FR-24.10). `withItems` adds the active items filed under
 * each tag, and those filed under none, which is what a plan is written from.
 */
export function describeTags(ctx: CommandContext, withItems: boolean): string[] {
  const { master } = ctx
  const lines: string[] = []
  const filed = new Map<string, string[]>()
  const untagged: string[] = []
  for (const item of master.activeItemList) {
    const primary = primaryTagOf(item.id, master.itemTagList, master.tagList)
    if (primary) filed.set(primary.id, [...(filed.get(primary.id) ?? []), item.name])
    else untagged.push(item.name)
  }

  for (const tag of master.tagList) {
    const count = tagDeletion(tag.id, master.itemTagList).references
    lines.push(`${tag.name}${tag.icon ? ` ${tag.icon}` : ''} — ${counted(count)}`)
    if (withItems) for (const name of sorted(filed.get(tag.id) ?? [])) lines.push(`  ${name}`)
  }
  if (withItems && untagged.length > 0) {
    lines.push(`(no tag) — ${counted(untagged.length)}`)
    for (const name of sorted(untagged)) lines.push(`  ${name}`)
  }
  return lines
}

/** „1 item", „2 items" — the report is read by a person. */
function counted(n: number): string {
  return `${n} ${n === 1 ? 'item' : 'items'}`
}

function sorted(names: string[]): string[] {
  return [...names].sort((a, b) => a.localeCompare(b))
}
