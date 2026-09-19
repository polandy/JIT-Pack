/**
 * `jitpack tags` — read and reshape an instance's tag axis from a shell
 * (FR-18.9): the acts of M9's tag manager and selection mode (FR-24.9,
 * FR-24.10, FR-24.13), one at a time or as a whole plan.
 *
 * It owns no rules. Each step runs the action the screen runs, against a
 * command-line `SyncContext` (ADR-042), and everything it writes is pushed
 * through the ordinary master sync endpoint — so a retag done here reaches
 * every device like one done by hand.
 */

import { APIClient } from '@/api/client'
import { MASTER_PARTITION, pullPartitionAll } from '@/sync/partition'
import { HLCGenerator } from '@/sync/hlc'
import {
  message,
  DEFAULT_SERVER,
  ENV_SERVER,
  ENV_TOKEN,
  EXIT,
  pushPending,
  type CommandIO,
  type Connection,
} from './common'
import { createCommandContext } from './context'
import { ALL_ITEMS, TAG_OP, describeTags, parseTagPlan, runTagPlan, type TagStep } from './tagPlan'

/** Reading the axis and running a plan file, beside the six single steps. */
export const TAGS_LIST = 'list'
export const TAGS_APPLY = 'apply'

/** What the command was asked to do: print, run a file, or run one step. */
export type TagsTask =
  | { kind: typeof TAGS_LIST; items: boolean }
  | { kind: typeof TAGS_APPLY; file: string }
  | { kind: 'step'; step: TagStep }

export interface TagsOptions extends Connection {
  task: TagsTask
  dryRun: boolean
}

export type ParsedTagsArgs =
  ({ ok: true } & TagsOptions) | { ok: false; error: string } | { ok: false; help: true }

export const TAGS_USAGE = `Usage: jitpack tags ACTION [flags] [args]

Reads and reshapes the tags items are filed under — what the app's tag manager
and selection mode do, from a shell. A name is matched ignoring case.

Actions:
  list [--items]              every tag, its mark and how many items carry it;
                              --items also lists what is filed under each
  rename TAG NAME             give a tag a new name
  merge TAG INTO              move TAG's items onto INTO, then remove TAG
  give TAG ITEM...            give TAG to items and file them under it;
                              --no-primary only adds it. Creates TAG if missing
  take TAG ITEM... | --all    take TAG away from items (--all: every active one)
  delete TAG                  remove a tag no item carries
  mark TAG EMOJI | --clear    set or clear a tag's mark
  apply PLAN.yaml             run a list of the steps above, in order; nothing
                              is sent unless every step succeeds

Flags:
  --server URL   instance base URL (default $${ENV_SERVER}, else ${DEFAULT_SERVER})
  --token TOKEN  bearer token for an instance with accounts (default $${ENV_TOKEN})
  --dry-run      run everything and report it, then send nothing`

/** How many names each single step takes before its item list. */
const STEP_ARITY: Record<
  Exclude<TagStep['op'], typeof TAG_OP.give | typeof TAG_OP.take>,
  number
> = { rename: 2, merge: 2, delete: 1, mark: 1 }

const ACTIONS = [TAGS_LIST, TAGS_APPLY, ...Object.values(TAG_OP)]

/**
 * Read the command line. `getenv` supplies the fallbacks, so the precedence —
 * flag over environment over default — is decided here and can be tested
 * without touching the real environment.
 */
export function parseTagsArgs(
  argv: string[],
  getenv: (name: string) => string | undefined,
): ParsedTagsArgs {
  let serverUrl = ''
  let token = ''
  let dryRun = false
  let items = false
  let all = false
  let clear = false
  let noPrimary = false
  const words: string[] = []

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!
    if (arg === '--help' || arg === '-h') return { ok: false, help: true }
    else if (arg === '--dry-run') dryRun = true
    else if (arg === '--server') serverUrl = argv[++i] ?? ''
    else if (arg === '--token') token = argv[++i] ?? ''
    else if (arg === '--items') items = true
    else if (arg === '--all') all = true
    else if (arg === '--clear') clear = true
    else if (arg === '--no-primary') noPrimary = true
    else if (arg.startsWith('-')) return { ok: false, error: `unknown flag: ${arg}` }
    else words.push(arg)
  }

  const [action, ...args] = words
  if (action === undefined) return { ok: false, error: `no action given (${ACTIONS.join(', ')})` }
  const task = taskOf(action, args, { items, all, clear, noPrimary })
  if ('error' in task) return { ok: false, error: task.error }

  return {
    ok: true,
    task,
    dryRun,
    serverUrl: serverUrl || getenv(ENV_SERVER) || DEFAULT_SERVER,
    token: token || getenv(ENV_TOKEN) || null,
  }
}

function taskOf(
  action: string,
  args: string[],
  flags: { items: boolean; all: boolean; clear: boolean; noPrimary: boolean },
): TagsTask | { error: string } {
  if (action === TAGS_LIST) {
    return args.length === 0
      ? { kind: TAGS_LIST, items: flags.items }
      : { error: 'list takes no names' }
  }
  if (action === TAGS_APPLY) {
    return args.length === 1
      ? { kind: TAGS_APPLY, file: args[0]! }
      : { error: 'apply takes one plan file' }
  }

  const [tag, ...rest] = args
  if (tag === undefined) return { error: `${action} needs a tag` }

  switch (action) {
    case TAG_OP.give:
      if (rest.length === 0) return { error: 'give needs at least one item' }
      return {
        kind: 'step',
        step: { op: TAG_OP.give, tag, items: rest, primary: !flags.noPrimary },
      }
    case TAG_OP.take:
      if (flags.all === rest.length > 0) return { error: 'take needs either items or --all' }
      return { kind: 'step', step: { op: TAG_OP.take, tag, items: flags.all ? ALL_ITEMS : rest } }
    case TAG_OP.mark: {
      if (flags.clear === rest.length > 0) return { error: 'mark needs either an emoji or --clear' }
      if (rest.length > 1) return { error: 'mark takes one emoji' }
      return { kind: 'step', step: { op: TAG_OP.mark, tag, mark: flags.clear ? null : rest[0]! } }
    }
    case TAG_OP.rename:
    case TAG_OP.merge:
    case TAG_OP.delete: {
      if (args.length !== STEP_ARITY[action]) {
        return {
          error: `${action} takes ${STEP_ARITY[action]} name${STEP_ARITY[action] > 1 ? 's' : ''}`,
        }
      }
      if (action === TAG_OP.rename) return { kind: 'step', step: { op: action, tag, to: rest[0]! } }
      if (action === TAG_OP.merge)
        return { kind: 'step', step: { op: action, tag, into: rest[0]! } }
      return { kind: 'step', step: { op: action, tag } }
    }
    default:
      return { error: `unknown action: ${action} (${ACTIONS.join(', ')})` }
  }
}

export async function runTags(opts: TagsOptions, io: CommandIO): Promise<number> {
  let steps: TagStep[] = []
  if (opts.task.kind === TAGS_APPLY) {
    let text: string
    try {
      text = await io.readFile(opts.task.file)
    } catch (e) {
      io.write(`${opts.task.file}: ${message(e)}`)
      return EXIT.failed
    }
    const plan = parseTagPlan(text)
    if ('error' in plan) {
      io.write(`${opts.task.file}: ${plan.error}`)
      return EXIT.failed
    }
    steps = plan.steps
  } else if (opts.task.kind === 'step') {
    steps = [opts.task.step]
  }

  const hlc = new HLCGenerator(io.now, io.deviceId)
  const client = new APIClient(opts.serverUrl, () => opts.token)
  const ctx = createCommandContext(hlc, io.now)
  try {
    ctx.applyPulled('master', (await pullPartitionAll(client, hlc, MASTER_PARTITION, 0)).changes)
  } catch (e) {
    io.write(`${opts.serverUrl}: ${message(e)}`)
    return EXIT.failed
  }

  if (opts.task.kind === TAGS_LIST) {
    for (const line of describeTags(ctx, opts.task.items)) io.write(line)
    return EXIT.ok
  }

  const run = runTagPlan(ctx, steps)
  for (const line of run.lines) io.write(line)
  if (run.failure) {
    io.write(`${run.failure} — nothing sent`)
    return EXIT.failed
  }

  const writes = ctx.pending.master.length
  if (opts.dryRun) {
    io.write(`${writes} writes (dry run, not sent). Tags afterwards:`)
    for (const line of describeTags(ctx, false)) io.write(`  ${line}`)
    return EXIT.ok
  }
  if (writes > 0) {
    try {
      await pushPending(client, hlc, ctx.pending)
    } catch (e) {
      io.write(`failed — ${message(e)}`)
      return EXIT.failed
    }
  }
  io.write(`${writes} writes sent`)
  return EXIT.ok
}
