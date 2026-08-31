/**
 * Executable entry for `jitpack`, the repository's command line (FR-18.7,
 * FR-18.8). Everything it decides is in `dispatch.ts` and in the commands
 * themselves, where it can be tested; this file only supplies the process's
 * outside world.
 */

import { readFile } from 'node:fs/promises'
import { randomBytes } from 'node:crypto'
import { dispatch } from './dispatch'

/** `sync/hlc` wants 8 lowercase hex chars; a run is a device, freshly named. */
const DEVICE_ID_BYTES = 4

process.exitCode = await dispatch(
  process.argv.slice(2),
  (key) => process.env[key],
  { out: (line) => console.log(line), err: (line) => console.error(line) },
  () => ({
    readFile: (path) => readFile(path, 'utf8'),
    write: (line) => console.log(line),
    now: () => Date.now(),
    deviceId: randomBytes(DEVICE_ID_BYTES).toString('hex'),
  }),
)
