#!/usr/bin/env node
// Holds every nginx sample in the repository to `proxy_set_header Host
// $http_host`. nginx's `$host` drops the port, and the sync WebSocket's
// same-origin check compares the browser's `Origin` (which carries the
// port) against the request `Host` — so `$host` answers every dial on a
// non-default port with 403 while the whole REST surface stays green.
// Since ADR-043 JIT-Pack ships as one container and needs no proxy of its
// own, so the manual's copy-paste blocks — the TLS terminator an operator
// puts in front — are where that mistake reaches a running instance from.

import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const WANTED = '$http_host'

// `make ci` runs this from the repository root, the CI client job from
// `client/` — the sibling gates settle that with this line.
const root = resolve(process.cwd().endsWith('client') ? '..' : '.')

// Files carrying nginx directives: the manual's fenced blocks, which an
// operator copies verbatim.
const SOURCES = ['docs/installation.md', 'docs/getting-started.md']

const DIRECTIVE = /^\s*proxy_set_header\s+Host\s+(\S+?);/gim

const findings = []
for (const file of SOURCES) {
  let text
  try {
    text = readFileSync(resolve(root, file), 'utf8')
  } catch (err) {
    console.error(`proxy-host-gate: cannot read ${file}: ${err.message}`)
    process.exit(1)
  }
  const lines = text.split('\n')
  lines.forEach((line, i) => {
    DIRECTIVE.lastIndex = 0
    const m = DIRECTIVE.exec(line)
    if (m && m[1] !== WANTED) {
      findings.push(`${file}:${i + 1}: proxy_set_header Host ${m[1]} — must be ${WANTED}`)
    }
  })
}

if (findings.length > 0) {
  console.error('proxy-host-gate: the reverse proxy must forward the browser\'s Host header verbatim.\n')
  for (const f of findings) console.error('  ' + f)
  console.error(
    `\n$host drops the port, so a browser on http://host:3000 sends Origin "host:3000"` +
      `\nwhile the backend sees Host "host" — the WebSocket handshake is answered 403 and` +
      `\nlive updates, presence and the G-3 lock silently never arrive.`,
  )
  process.exit(1)
}

console.log(`proxy-host-gate: ok — every proxy_set_header Host forwards ${WANTED}`)
