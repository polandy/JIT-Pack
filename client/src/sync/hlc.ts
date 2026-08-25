/**
 * Hybrid Logical Clock (Sync-API Spec §3).
 *
 * Format: "{physical_ms:013d}-{counter:04x}-{device_id:8}"
 * Lexicographic order equals causal order.
 */

export type HLC = string

const HLC_LEN = 27 // 13 + 1 + 4 + 1 + 8
const DEVICE_ID_LEN = 8
const COUNTER_LIMIT = 0xffff

const LOWER_HEX = /^[0-9a-f]+$/

function isLowerHex(s: string): boolean {
  return s.length > 0 && LOWER_HEX.test(s)
}

function formatHLC(millis: number, counter: number, deviceId: string): HLC {
  return `${String(millis).padStart(13, '0')}-${counter.toString(16).padStart(4, '0')}-${deviceId}`
}

export interface HLCComponents {
  millis: number
  counter: number
  deviceId: string
}

/** Parse an HLC string into its components. Throws on malformed input. */
export function parseHLC(hlc: HLC): HLCComponents {
  if (hlc.length !== HLC_LEN || hlc[13] !== '-' || hlc[18] !== '-') {
    throw new Error(`malformed HLC "${hlc}"`)
  }
  const millis = Number(hlc.slice(0, 13))
  if (!Number.isFinite(millis)) {
    throw new Error(`malformed HLC millis in "${hlc}"`)
  }
  const counter = parseInt(hlc.slice(14, 18), 16)
  if (Number.isNaN(counter)) {
    throw new Error(`malformed HLC counter in "${hlc}"`)
  }
  const deviceId = hlc.slice(19)
  if (!isLowerHex(deviceId)) {
    throw new Error(`malformed HLC device id in "${hlc}"`)
  }
  return { millis, counter, deviceId }
}

/** Lexicographic comparison — causal order (Sync-API Spec §3). */
export function compareHLC(a: HLC, b: HLC): number {
  if (a < b) return -1
  if (a > b) return 1
  return 0
}

/**
 * Produces strictly increasing HLCs for one device and folds
 * observed remote clocks into its own notion of "now".
 */
export class HLCGenerator {
  private readonly nowMillis: () => number
  private readonly deviceId: string
  private lastMillis = 0
  private counter = 0

  constructor(nowMillis: () => number, deviceId: string) {
    if (deviceId.length !== DEVICE_ID_LEN || !isLowerHex(deviceId)) {
      throw new Error(`device id must be ${DEVICE_ID_LEN} lowercase hex chars, got "${deviceId}"`)
    }
    this.nowMillis = nowMillis
    this.deviceId = deviceId
  }

  /** Return an HLC strictly greater than any previously produced or observed. */
  next(): HLC {
    const now = this.nowMillis()
    if (now <= this.lastMillis) {
      this.counter++
      if (this.counter > COUNTER_LIMIT) {
        this.lastMillis++
        this.counter = 0
      }
    } else {
      this.lastMillis = now
      this.counter = 0
    }
    return formatHLC(this.lastMillis, this.counter, this.deviceId)
  }

  /** Advance past a remote HLC seen in a pull or push response. */
  observe(remote: HLC): void {
    const { millis, counter } = parseHLC(remote)
    if (millis > this.lastMillis) {
      this.lastMillis = millis
      this.counter = counter
    } else if (millis === this.lastMillis && counter > this.counter) {
      this.counter = counter
    }
  }
}

/**
 * Observe a clock that came from somewhere else, and report whether it was
 * usable. Returns false for a value `parseHLC` refuses.
 *
 * `observe` throwing is right for the generator's own contract, and wrong at
 * the boundary where a pull meets another device's data: the clock is an
 * optimisation for causality (§3), not a gate on rendering, so one unusable
 * value must never cost the page it arrived in. It can be produced — the
 * server stores an HLC verbatim and does not check its device id — and a
 * throw would then make every *other* row of that partition unreachable on
 * every device, for as long as the row exists.
 */
export function observeRemote(gen: HLCGenerator, remote: string): boolean {
  try {
    gen.observe(remote as HLC)
    return true
  } catch {
    // Not silent: a value nobody can parse means a producer that needs
    // finding, and the value is the only thing that identifies it.
    console.warn(`ignoring unusable remote HLC "${remote}"`)
    return false
  }
}
