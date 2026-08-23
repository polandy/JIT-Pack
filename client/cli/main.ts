/**
 * Executable entry for `jitpack-import` (FR-18.7). Everything it decides is
 * in `importCommand.ts`, where it can be tested; this file only supplies the
 * process's outside world.
 */

import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { EXIT, USAGE, parseImportArgs, runImport } from './importCommand'

/** `sync/hlc` wants 8 lowercase hex chars; a run is a device, freshly named. */
const DEVICE_ID_BYTES = 4

async function main(): Promise<number> {
  const parsed = parseImportArgs(process.argv.slice(2), (name) => process.env[name])
  if (!parsed.ok) {
    if ('help' in parsed) {
      console.log(USAGE)
      return EXIT.ok
    }
    console.error(`jitpack-import: ${parsed.error}\n\n${USAGE}`)
    return EXIT.usage
  }

  return runImport(parsed, {
    readFile: (path) => readFile(path, 'utf8'),
    write: (line) => console.log(line),
    now: () => Date.now(),
    deviceId: randomBytes(DEVICE_ID_BYTES).toString('hex'),
  })
}

process.exitCode = await main()
