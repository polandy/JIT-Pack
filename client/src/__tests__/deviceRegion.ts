/**
 * The device's time zone, as a spec decides it.
 *
 * The app reads the device's region off the time zone the browser reports
 * (`Intl.DateTimeFormat().resolvedOptions().timeZone`, NFR-4.12), so a spec
 * pins what that call reports — the way it pins the clock with
 * `vi.setSystemTime` — rather than the app carrying a setter only specs call.
 *
 * Only the *reported* zone moves: a formatter built without a `timeZone`
 * option reports the pinned one, and formatting itself still runs in the
 * machine's zone, as it does for the app in the browser. The patch lives on
 * `globalThis` so a second install in the same worker finds the first.
 */
const STATE = Symbol.for('jitpack.test.deviceTimeZone')

interface PinState {
  zone: string
}

type WithPin = typeof globalThis & { [STATE]?: PinState }

function install(): PinState {
  const state: PinState = { zone: 'Europe/Zurich' }
  const proto = Intl.DateTimeFormat.prototype
  const native = proto.resolvedOptions
  const machineZone = native.call(new Intl.DateTimeFormat()).timeZone
  proto.resolvedOptions = function resolvedOptions(this: Intl.DateTimeFormat) {
    const options = native.call(this)
    return options.timeZone === machineZone ? { ...options, timeZone: state.zone } : options
  }
  return state
}

/** Make the browser report `timeZone` as the device's zone. */
export function pinDeviceTimeZone(timeZone: string): void {
  const global = globalThis as WithPin
  global[STATE] ??= install()
  global[STATE].zone = timeZone
}
