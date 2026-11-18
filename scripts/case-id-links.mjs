/**
 * The two links the case-id gate holds beyond uniqueness (see case-id-gate.mjs):
 * spec → title, and traceability → title. A promise is *carried* when a test
 * title names its id, or when its spec entry names the spec file or the case
 * that carries it. Pure functions, so `case-id-gate.test.mjs` can feed them text.
 */

const LIVE_ENTRY = /^\* \*\*(E2E-[A-Z0-9]+-\d+[a-z]*(?:\/\d+[a-z]*)*)\*\*[ \t]*(~~)?/
const CARRIER_FILE = /[\w./-]+\.(?:spec|test)\.(?:ts|mjs)/
const CASE_ID = /E2E-[A-Z0-9]+-\d+[a-z]*/g
const TRACE_ID = /\b(M\d+|G\d+|FLOW|NFR|VIS|SYNC)-(\d+[a-z]*)((?:\/\d+[a-z]*)*)/g

/** `E2E-M17-07/07b` defines two ids; the suffixes inherit the head's series. */
export function idsOf(heading) {
  const [head, ...rest] = heading.split('/')
  const prefix = head.slice(0, head.lastIndexOf('-') + 1)
  return [head, ...rest.map((suffix) => prefix + suffix)]
}

/** id → { struck, text } for every top-level bullet entry in the spec text. */
export function parseEntries(specText) {
  const entries = new Map()
  const lines = specText.split('\n')
  lines.forEach((line, i) => {
    const m = line.match(LIVE_ENTRY)
    if (!m) return
    let text = line.slice(m[0].length)
    for (let j = i + 1; j < lines.length && /^(?:\s+\S|$)/.test(lines[j]); j++) text += `\n${lines[j]}`
    for (const id of idsOf(m[1])) entries.set(id, { struck: Boolean(m[2]), text })
  })
  return entries
}

/** Whether `id` is carried: titled, retired, or carried through a named file or a carrying case. */
export function carried(id, entries, titled, visiting = new Set()) {
  if (titled.has(id)) return true
  const entry = entries.get(id)
  if (!entry) return false
  if (entry.struck) return true
  if (CARRIER_FILE.test(entry.text)) return true
  visiting.add(id)
  return (entry.text.match(CASE_ID) ?? []).some(
    (other) => !visiting.has(other) && carried(other, entries, titled, visiting),
  )
}

/** Live spec entries nothing carries: no title id, no named file, no carrying case. */
export function uncarriedSpecIds(entries, titled) {
  return [...entries.keys()].filter((id) => !carried(id, entries, titled))
}

/** Ids named by the "E2E" rows of the traceability matrix, retired mentions (`~~…~~`) left out. */
export function traceIds(traceText) {
  const ids = new Set()
  for (const line of traceText.split('\n')) {
    const cols = line.split('|')
    if (!/^\| (?:N?FR|G)-/.test(line) || !/E2E/.test(cols[2] ?? '')) continue
    const note = (cols.slice(3).join('|')).replace(/~~.*?~~/g, '')
    for (const [, series, num, rest] of note.matchAll(TRACE_ID)) {
      for (const suffix of [num, ...rest.split('/').filter(Boolean)]) ids.add(`E2E-${series}-${suffix}`)
    }
  }
  return [...ids]
}

/** Traceability ids that no title, entry or carrier backs. */
export function uncarriedTraceIds(traceText, entries, titled) {
  return traceIds(traceText).filter((id) => !carried(id, entries, titled))
}
