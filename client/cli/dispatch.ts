/**
 * Which command a command line means, and what the process should answer when
 * it means none of them.
 *
 * It is its own module because `main.ts` cannot be imported by a test — it
 * runs on import, by design — and this is the only decision in it.
 */

import { EXIT, type CommandIO } from './common'
import { USAGE as IMPORT_USAGE, parseImportArgs, runImport } from './importCommand'
import { TRAVELER_USAGE, parseTravelerArgs, runTraveler } from './travelerCommand'

export const USAGE = `Usage: jitpack COMMAND [flags] [args]

Commands:
  import     put portable YAML into a running instance
  traveler   read or extend a trip's roster

Run a command with --help for its own flags.`

/**
 * One command's two halves: reading the arguments and doing the work. Keeping
 * them in a table is what makes adding the next command a line rather than a
 * branch.
 */
const COMMANDS = {
  import: { usage: IMPORT_USAGE, parse: parseImportArgs, run: runImport },
  traveler: { usage: TRAVELER_USAGE, parse: parseTravelerArgs, run: runTraveler },
} as const

export type CommandName = keyof typeof COMMANDS

function isCommand(name: string): name is CommandName {
  return Object.hasOwn(COMMANDS, name)
}

/** Where usage and failure go, so a test reads them instead of the terminal. */
export interface DispatchOut {
  out(line: string): void
  err(line: string): void
}

/**
 * dispatch turns one argument vector into an exit code. `io` is only built by
 * the caller, so a run that never reaches a command never builds one.
 */
export async function dispatch(
  argv: string[],
  getenv: (name: string) => string | undefined,
  out: DispatchOut,
  io: () => CommandIO,
): Promise<number> {
  const [name, ...rest] = argv
  // Asking for help is not a usage error, and being told nothing is: an empty
  // invocation prints the same text and answers differently.
  if (name === '--help' || name === '-h') {
    out.out(USAGE)
    return EXIT.ok
  }
  if (name === undefined) {
    out.err(USAGE)
    return EXIT.usage
  }
  if (!isCommand(name)) {
    out.err(`jitpack: unknown command: ${name}\n\n${USAGE}`)
    return EXIT.usage
  }

  const command = COMMANDS[name]
  const parsed = command.parse(rest, getenv)
  if (!parsed.ok) {
    if ('help' in parsed) {
      out.out(command.usage)
      return EXIT.ok
    }
    out.err(`jitpack ${name}: ${parsed.error}\n\n${command.usage}`)
    return EXIT.usage
  }

  // Each command's options are its own parse result; the dispatcher only
  // knows they belong together.
  return command.run(parsed as never, io())
}
