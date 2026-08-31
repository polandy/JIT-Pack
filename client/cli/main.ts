/**
 * Executable entry for `jitpack`, the repository's command line (FR-18.7,
 * FR-18.8). Everything a command decides is in its own module, where it can
 * be tested; this file only dispatches and supplies the process's outside
 * world.
 */

import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { EXIT, type CommandIO } from './common'
import { USAGE as IMPORT_USAGE, parseImportArgs, runImport } from './importCommand'
import { TRAVELER_USAGE, parseTravelerArgs, runTraveler } from './travelerCommand'

/** `sync/hlc` wants 8 lowercase hex chars; a run is a device, freshly named. */
const DEVICE_ID_BYTES = 4

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

type CommandName = keyof typeof COMMANDS

function isCommand(name: string): name is CommandName {
  return Object.hasOwn(COMMANDS, name)
}

async function main(): Promise<number> {
  const [name, ...rest] = process.argv.slice(2)
  if (name === undefined || name === '--help' || name === '-h') {
    console.log(USAGE)
    return name === undefined ? EXIT.usage : EXIT.ok
  }
  if (!isCommand(name)) {
    console.error(`jitpack: unknown command: ${name}\n\n${USAGE}`)
    return EXIT.usage
  }

  const command = COMMANDS[name]
  const parsed = command.parse(rest, (key) => process.env[key])
  if (!parsed.ok) {
    if ('help' in parsed) {
      console.log(command.usage)
      return EXIT.ok
    }
    console.error(`jitpack ${name}: ${parsed.error}\n\n${command.usage}`)
    return EXIT.usage
  }

  const io: CommandIO = {
    readFile: (path) => readFile(path, 'utf8'),
    write: (line) => console.log(line),
    now: () => Date.now(),
    deviceId: randomBytes(DEVICE_ID_BYTES).toString('hex'),
  }
  // Each command's options are its own parse result; the dispatcher only
  // knows they belong together.
  return command.run(parsed as never, io)
}

process.exitCode = await main()
