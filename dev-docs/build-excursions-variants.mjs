/**
 * Builds UI_Concept_Excursions_variants.html — the rendered round for the
 * excursions concept (dev-docs/excursions-concept.md), owner request of
 * 2026-09-26: a small packing list inside a trip for a day hike or a hut
 * night, packed from the trip's things and reusable through a Gruppe.
 *
 * The concept's twelve decisions are drawn as the "Decided" screens; the three
 * points it left to the picture are drawn as variants: the switcher pill's
 * glyph, whether one excursion is a route or a sheet, and how a row that is not
 * in the luggage looks beside the §3.28 mark.
 *
 * Same rule as the other variant sheets: the CSS is lifted verbatim from
 * UI_Concept_Prototype.html; only sheet chrome and an `ex-` prefixed set of
 * classes are added. Writes the standalone page for dev-docs and (with
 * --artifact) a head-less fragment for publishing as an Artifact.
 *
 * Run: node dev-docs/build-excursions-variants.mjs [--artifact <path>]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const proto = readFileSync(join(here, 'UI_Concept_Prototype.html'), 'utf8')
const css = proto.slice(proto.indexOf('<style>') + 7, proto.indexOf('</style>'))

/* --- pieces ------------------------------------------------------------- */

const phone = (inner) => `<div class="phone">${inner}</div>`

const appbar = (title = 'Sardinien 2026', icons = '🔍 ⋮') => `
  <div class="ex-bar">
    <span class="ex-back">‹</span>
    <span class="ex-title">${title}</span>
    <span class="ex-icons">${icons}</span>
  </div>`

/**
 * The G-9 switcher as built (ADR-051 amendment 3): the current view is the
 * only one in words, every other is its glyph with a badge. `glyph` is the
 * excursion pill's glyph, the thing question 1 decides.
 */
const pills = (cur, glyph = '🪧', extra = '') => {
  const views = [
    ['packing', '☰', 'Packliste', 0],
    ['shopping', '🛒', 'Einkaufen', 3],
    ['tasks', '☑', 'Aufgaben', 2],
    ['notes', '🗒', 'Notizen', 1],
    ['excursions', glyph, 'Ausflüge', 1],
  ]
  return `<div class="ex-pills">${views
    .map(([id, g, word, n]) =>
      id === cur
        ? `<span class="ex-pill on">${g} ${word}</span>`
        : `<span class="ex-pill ico">${g}${n ? `<i class="${id === 'notes' ? 'new' : ''}">${n}</i>` : ''}</span>`,
    )
    .join('')}${extra}</div>`
}

const head = (title, cur, glyph, sub = '') => `
    <div class="ex-head">
      <div class="ex-pagetitle">${title}</div>
      ${sub ? `<div class="ex-pagesub">${sub}</div>` : ''}
      ${pills(cur, glyph)}
    </div>`

/** The §3.28 mark: one emoji on a tinted disc. */
const mark = (e, hue = '--blue') => `<span class="ex-mark" style="--h:var(${hue})">${e}</span>`

/** One packing row of the lean excursion list. */
const row = ({ m, hue, name, sub = '', done = false, qty = '', warn = '', tail = '' }) => `
        <div class="ex-row ${done ? 'done' : ''}">
          ${mark(m, hue)}
          <div class="ex-grow">
            <div class="ex-name">${name}${qty ? ` <span class="ex-qty">${qty}</span>` : ''}</div>
            ${sub ? `<div class="ex-sub">${sub}</div>` : ''}
            ${warn}
          </div>
          ${tail}
          <div class="check ${done ? 'on' : ''}">${done ? '✓' : ''}</div>
        </div>`

const group = (name, n, rows) => `
      <div class="ex-group"><span>${name}</span><span class="n">${n}</span></div>
      <div class="ex-card">${rows}</div>`

const FROM = '<span class="ex-from">↳ aus dem Gepäck</span>'
const LOCAL = '<span class="ex-local">vor Ort</span>'

const fab = () => `<div class="ex-fab">＋</div>`

/* --- the one trip, Sardinien 2026: three excursions --------------------- */

const LIST_ROWS = `
      <div class="ex-sec-l">Kommende</div>
      <div class="ex-card">
        <div class="ex-exc">
          <div class="ex-date"><b>Di</b><span>14.7.</span></div>
          <div class="ex-grow"><div class="ex-name">Tageswanderung Gola Gorropu</div>
            <div class="ex-sub">Alle · aus Gruppe <em>Tageswanderung</em></div>
            <div class="progress"><i style="width:33%;background:var(--teal)"></i></div></div>
          <div class="ex-count">3/9</div>
        </div>
        <div class="ex-exc">
          <div class="ex-date"><b>Do–Fr</b><span>16.–17.7.</span></div>
          <div class="ex-grow"><div class="ex-name">Hüttentour Supramonte</div>
            <div class="ex-sub"><span class="avatar ex-av" style="background:var(--peach)">A</span>
              <span class="avatar ex-av" style="background:var(--mauve)">S</span> 2 von 4</div>
            <div class="progress"><i style="width:0%"></i></div></div>
          <div class="ex-count">0/12</div>
        </div>
      </div>
      <div class="ex-sec-l">Ohne Datum</div>
      <div class="ex-card">
        <div class="ex-exc">
          <div class="ex-date none"><b>—</b></div>
          <div class="ex-grow"><div class="ex-name">Bootsausflug Cala Luna</div>
            <div class="ex-sub">Alle</div></div>
          <div class="ex-count">0/5</div>
        </div>
      </div>
      <div class="ex-fold">1 vergangener Ausflug ›</div>`

const HIKE_ROWS = (warnStyle = null) =>
  group(
    'Ausrüstung',
    '2/4',
    row({ m: '🥾', hue: '--peach', name: 'Wanderschuhe', sub: FROM, done: true, qty: '×4' }) +
      row({ m: '🧴', hue: '--yellow', name: 'Sonnencreme', sub: FROM, done: true }) +
      row({ m: '💧', hue: '--sapphire', name: 'Trinkflasche', sub: FROM, qty: '×4' }) +
      (warnStyle ? warnStyle : row({ m: '🔦', hue: '--mauve', name: 'Stirnlampe', sub: FROM })),
  ) +
  group(
    'Verpflegung',
    '0/2',
    row({ m: '🥪', hue: '--green', name: 'Proviant', sub: LOCAL }) +
      row({ m: '🍫', hue: '--pink', name: 'Energieriegel', sub: LOCAL, qty: '×8' }),
  )

/* ====================================================================== *
 * Decided
 * ====================================================================== */

const D_LIST = phone(`
  ${appbar()}
  <div class="body ex-pad">
    ${head('Ausflüge', 'excursions')}
    ${LIST_ROWS}
    ${fab()}
  </div>`)

const D_HIKE = phone(`
  ${appbar('Sardinien 2026', '⋮')}
  <div class="body ex-pad">
    ${head('Tageswanderung Gola Gorropu', 'excursions', '🪧', 'Di 14.7. · Alle')}
    <div class="ex-headline">
      <div class="ring" style="--p:33;--c:var(--teal)"><span>33</span></div>
      <div class="ex-figtext"><b>2/6 gepackt</b><small>2 vor Ort besorgen</small>
        <div class="progress"><i style="width:33%;background:var(--teal)"></i></div></div>
    </div>
    ${HIKE_ROWS()}
    ${fab()}
  </div>`)

const D_CREATE = phone(`
  ${appbar()}
  <div class="body ex-pad ex-dim">
    ${head('Ausflüge', 'excursions')}
    ${LIST_ROWS}
  </div>
  <div class="ex-scrim"></div>
  <div class="ex-sheet"><div class="handle"></div><div class="ex-sheet-body">
    <div class="ex-sheet-h">Neuer Ausflug</div>
    <div class="ex-field"><span class="l">Name</span><span class="v">Hüttentour Supramonte</span></div>
    <div class="ex-field"><span class="l">Datum</span><span class="v">Do 16.7. – Fr 17.7. <em>optional</em></span></div>
    <div class="ex-field"><span class="l">Wer</span><span class="v">
      <span class="chip on">Andy</span><span class="chip on">Sia</span><span class="chip">Lio</span><span class="chip">Mia</span></span></div>
    <div class="ex-field col"><span class="l">Beginnen mit</span>
      <div class="ex-search">🔍 Gruppe suchen … <em>„Hütte“</em></div>
      <div class="ex-gopt on"><b>Hüttenübernachtung</b><span>12 Positionen · Schlafsack-Inlet, Stirnlampe …</span></div>
      <div class="ex-gopt"><b>Tageswanderung</b><span>9 Positionen</span></div>
      <div class="ex-gopt plain">Leer beginnen</div>
    </div>
    <div class="ex-note">3 Dinge fehlen im Gepäck und kommen auf die Packliste.</div>
    <div class="ex-btns"><button class="ex-primary">Ausflug anlegen</button></div>
  </div></div>`)

const D_M4 = phone(`
  ${appbar()}
  <div class="body ex-pad">
    ${head('Packliste', 'packing')}
    ${group(
      'Ausrüstung',
      '5/8',
      row({ m: '🥾', hue: '--peach', name: 'Wanderschuhe', done: true, qty: '×4',
        tail: '<span class="chip ex-chip">🪧 2 Ausflüge</span>' }) +
        row({ m: '🔦', hue: '--mauve', name: 'Stirnlampe', qty: '×2',
          sub: '<span class="ex-new">neu durch Hüttentour</span>',
          tail: '<span class="chip ex-chip">🪧 Hüttentour</span>' }) +
        row({ m: '⛺', hue: '--teal', name: 'Zelt' }) +
        row({ m: '🧴', hue: '--yellow', name: 'Sonnencreme', done: true,
          tail: '<span class="chip ex-chip">🪧 Wanderung</span>' }),
    )}
    <div class="ex-note">Die Chips sagen, welcher Ausflug die Position braucht — bevor man sie überspringt.</div>
  </div>`)


/* ====================================================================== *
 * Decided — a thing per participant (decisions #13, #14)
 * ====================================================================== */

const av = (l, hue) => `<span class="avatar ex-av2" style="background:var(${hue})">${l}</span>`

/** M4's FR-25.1 cluster: the name once, a child per participant. */
const cluster = ({ m, hue, name, count, kids, sub = '' }) => `
        <div class="ex-row ex-chead">
          ${mark(m, hue)}
          <div class="ex-grow"><div class="ex-name">${name} <span class="ex-car">⌃</span></div>
            ${sub ? `<div class="ex-sub">${sub}</div>` : ''}</div>
          <span class="ex-count">${count}</span>
        </div>${kids
          .map(
            ([l, hue2, who, done, note = '']) => `
        <div class="ex-row ex-kid ${done ? 'done' : ''}">
          ${av(l, hue2)}
          <div class="ex-grow"><div class="ex-name">${who}</div>${note}</div>
          <div class="check ${done ? 'on' : ''}">${done ? '✓' : ''}</div>
        </div>`,
          )
          .join('')}`

const P_DEFINE = phone(`
  ${appbar('Sardinien 2026', '⋮')}
  <div class="body ex-pad">
    ${head('Hüttentour Supramonte', 'excursions', '🪧', 'Do 16.7. – Fr 17.7. · Andy, Sia')}
    ${group(
      'Schlafen',
      '1/4',
      cluster({ m: '🛏', hue: '--blue', name: 'Hüttenschlafsack', count: '1/2', sub: 'für alle',
        kids: [['A', '--peach', 'Andy', true], ['S', '--mauve', 'Sia', false]] }) +
        row({ m: '🔦', hue: '--mauve', name: 'Stirnlampe', qty: '×2', sub: FROM }),
    )}
    <div class="ex-composer">
      <div class="ex-forwhom"><span class="seg">Gemeinsam</span><span class="seg on">Alle</span>
        ${av('A', '--peach')}${av('S', '--mauve')}</div>
      <div class="ex-cfield"><span>Ohrstöpsel</span><b>Hinzufügen</b></div>
      <div class="ex-csub">Wird für 2 Personen angelegt, je 1.</div>
    </div>
  </div>`)

const P_CHANGE = phone(`
  ${appbar('Sardinien 2026', '⋮')}
  <div class="body ex-pad">
    ${head('Hüttentour Supramonte', 'excursions', '🪧', 'Do 16.7. – Fr 17.7. · Andy, Lio')}
    ${group(
      'Schlafen',
      '2/4',
      cluster({ m: '🛏', hue: '--blue', name: 'Hüttenschlafsack', count: '2/3', sub: 'für alle',
        kids: [
          ['A', '--peach', 'Andy', true],
          ['L', '--teal', 'Lio', false, '<div class="ex-sub ex-new">neu dabei · ↳ aus dem Gepäck</div>'],
          ['S', '--mauve', 'Sia', true, '<div class="ex-warn">nicht mehr dabei · <b>herausnehmen</b></div>'],
        ] }) +
        row({ m: '🔦', hue: '--mauve', name: 'Stirnlampe', qty: '×2', sub: FROM }),
    )}
    <div class="ex-snack">Teilnehmer geändert · Lio +1 Zeile, Sia −1 offen <b>Rückgängig</b></div>
  </div>`)

/* ====================================================================== *
 * Question 1 — the pill's glyph
 * ====================================================================== */

const strip = (glyph, cur) => `
  <div class="ex-strip">
    <div class="ex-strip-l">auf der Packliste</div>${pills(cur === 'x' ? 'packing' : cur, glyph)}
    <div class="ex-strip-l">auf den Ausflügen</div>${pills('excursions', glyph)}
    <div class="ex-strip-l">auf <em>Gepäck</em> (⋮-Ansicht): sechs Pills, 360 px</div>
    <div class="ex-w360">${pills('packing', glyph).replace('<span class="ex-pill on">☰ Packliste</span>',
      '<span class="ex-pill ico">☰</span>')
      .replace('</div>', '<span class="ex-pill on">💼 Gepäck</span></div>')}</div>
  </div>`

/* ====================================================================== *
 * Question 2 — one excursion: route, sheet or inline
 * ====================================================================== */

const Q2A = D_HIKE

const Q2B = phone(`
  ${appbar()}
  <div class="body ex-pad ex-dim">
    ${head('Ausflüge', 'excursions')}
    ${LIST_ROWS}
  </div>
  <div class="ex-scrim"></div>
  <div class="ex-sheet tall"><div class="handle"></div><div class="ex-sheet-body">
    <div class="ex-sheet-h">Tageswanderung Gola Gorropu <small>Di 14.7. · 2/6</small></div>
    ${HIKE_ROWS()}
  </div></div>`)

const Q2C = phone(`
  ${appbar()}
  <div class="body ex-pad">
    ${head('Ausflüge', 'excursions')}
    <div class="ex-sec-l">Kommende</div>
    <div class="ex-card">
      <div class="ex-exc open">
        <div class="ex-date"><b>Di</b><span>14.7.</span></div>
        <div class="ex-grow"><div class="ex-name">Tageswanderung Gola Gorropu</div></div>
        <div class="ex-count">2/6 ⌃</div>
      </div>
      <div class="ex-inline">
        ${row({ m: '🥾', hue: '--peach', name: 'Wanderschuhe', sub: FROM, done: true, qty: '×4' })}
        ${row({ m: '🧴', hue: '--yellow', name: 'Sonnencreme', sub: FROM, done: true })}
        ${row({ m: '💧', hue: '--sapphire', name: 'Trinkflasche', sub: FROM, qty: '×4' })}
        ${row({ m: '🥪', hue: '--green', name: 'Proviant', sub: LOCAL })}
        <div class="ex-fold">+2 weitere</div>
      </div>
      <div class="ex-exc">
        <div class="ex-date"><b>Do–Fr</b><span>16.–17.7.</span></div>
        <div class="ex-grow"><div class="ex-name">Hüttentour Supramonte</div></div>
        <div class="ex-count">0/12 ⌄</div>
      </div>
    </div>
  </div>`)

/* ====================================================================== *
 * Question 3 — „nicht im Gepäck“
 * ====================================================================== */

const hutPhone = (rowsHtml, top = '') => phone(`
  ${appbar('Sardinien 2026', '⋮')}
  <div class="body ex-pad">
    ${head('Hüttentour Supramonte', 'excursions', '🪧', 'Do 16.7. – Fr 17.7. · Andy, Sia')}
    ${top}
    ${rowsHtml}
  </div>`)

const Q3A = hutPhone(
  group(
    'Schlafen',
    '1/3',
    row({ m: '🛏', hue: '--blue', name: 'Hüttenschlafsack', qty: '×2',
      warn: '<div class="ex-warn">nicht im Gepäck · <b>Vor Ort besorgen</b></div>' }) +
      row({ m: '🔦', hue: '--mauve', name: 'Stirnlampe', qty: '×2', sub: FROM, done: true }) +
      row({ m: '👂', hue: '--pink', name: 'Ohrstöpsel', qty: '×2',
        warn: '<div class="ex-warn">nicht im Gepäck · <b>Vor Ort besorgen</b></div>' }),
  ) + group('Verpflegung', '0/1', row({ m: '🥪', hue: '--green', name: 'Proviant', sub: LOCAL })),
)

const Q3B = hutPhone(
  group(
    'Schlafen',
    '1/3',
    row({ m: '🛏', hue: '--blue', name: 'Hüttenschlafsack', qty: '×2', sub: '<span class="ex-missing">nicht im Gepäck</span>' })
      .replace('<span class="ex-mark"', '<span class="ex-mark flag"') +
      row({ m: '🔦', hue: '--mauve', name: 'Stirnlampe', qty: '×2', sub: FROM, done: true }) +
      row({ m: '👂', hue: '--pink', name: 'Ohrstöpsel', qty: '×2', sub: '<span class="ex-missing">nicht im Gepäck</span>' })
        .replace('<span class="ex-mark"', '<span class="ex-mark flag"'),
  ) + group('Verpflegung', '0/1', row({ m: '🥪', hue: '--green', name: 'Proviant', sub: LOCAL })),
  `<div class="ex-banner">⚠ 2 Dinge sind nicht im Gepäck <b>Vor Ort besorgen</b></div>`,
)

const Q3C = hutPhone(
  `<div class="ex-group warn"><span>Nicht im Gepäck</span><span class="n">2</span></div>
      <div class="ex-card warn">
        ${row({ m: '🛏', hue: '--blue', name: 'Hüttenschlafsack', qty: '×2' })}
        ${row({ m: '👂', hue: '--pink', name: 'Ohrstöpsel', qty: '×2' })}
        <div class="ex-cta">Beide vor Ort besorgen ›</div>
      </div>` +
    group('Schlafen', '1/1', row({ m: '🔦', hue: '--mauve', name: 'Stirnlampe', qty: '×2', sub: FROM, done: true })) +
    group('Verpflegung', '0/1', row({ m: '🥪', hue: '--green', name: 'Proviant', sub: LOCAL })),
)

/* --- the sheet ---------------------------------------------------------- */

const style = `${css}
body{padding:0;margin:0;display:block;height:auto;min-height:0}
.vwrap{max-width:1400px;margin:0 auto;padding-block:28px 80px;padding-left:20px;padding-right:20px}
.vhead{max-width:78ch;margin-bottom:30px}
.vhead .k,.qhead .q,.vcap .k{font:600 11.5px/1 var(--ui);letter-spacing:.14em;text-transform:uppercase;color:var(--peach)}
.qhead .q{color:var(--blue)} .qhead .q.dec,.vcap .k.ok{color:var(--green)}
.vhead h1{font:600 30px/1.12 var(--display);margin:10px 0 12px;text-wrap:balance}
.vhead p,.qhead p{margin:0 0 9px;color:var(--sub0);font-size:14.5px;line-height:1.65}
.vhead em,.qhead em,.vcap em{color:var(--rose);font-style:italic}
.vhead b,.qhead b{color:var(--text)}
.qhead{max-width:78ch;margin:52px 0 22px}
.qhead h2{font:600 22px/1.2 var(--display);margin:8px 0 9px;text-wrap:balance}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:26px;align-items:start}
.vcol{display:flex;flex-direction:column;gap:12px;min-width:0}
.vcap h3{font:600 17px/1.25 var(--display);margin:7px 0 6px}
.vcap p{margin:0 0 6px;color:var(--sub0);font-size:13px;line-height:1.55}
.vcap .cost{color:var(--peach);font-size:12.5px}
.vcap .win{color:var(--green);font-size:12.5px}
.rec{display:inline-block;margin-left:6px;padding:3px 7px;border-radius:999px;background:var(--green);color:var(--crust);
  font-size:10px;letter-spacing:.06em}

.phone{width:100%;max-width:380px;height:640px;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
.phone .body{flex:1;overflow:hidden;padding:10px 13px;position:relative;display:flex;flex-direction:column;gap:6px}
.phone .body>*{animation:none}
.ex-dim{filter:saturate(.7)}
.ex-bar{flex:none;display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid var(--s0);background:var(--crust)}
.ex-back{color:var(--o1);font-size:19px;line-height:1}
.ex-title{font:600 15px/1.2 var(--display);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ex-icons{font-size:13px;color:var(--o1);flex:none}
.ex-head{padding:6px 2px 2px}
.ex-pagetitle{font:600 20px/1.18 var(--display);text-wrap:balance}
.ex-pagesub{font-size:12px;color:var(--o0);margin-top:3px}
.ex-pills{display:flex;gap:6px;margin-top:9px;overflow:hidden;align-items:center}
.ex-pill{flex:none;position:relative;padding:6px 10px;border-radius:999px;background:var(--mantle);border:1px solid var(--s0);
  font-size:11.5px;font-weight:600;color:var(--sub0);white-space:nowrap}
.ex-pill.ico{padding:6px 9px;font-size:13px;line-height:1}
.ex-pill.on{background:var(--s1);border-color:var(--s2);color:var(--text)}
.ex-pill i{position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;border-radius:8px;background:var(--s2);
  color:var(--text);font:600 9.5px/15px var(--ui);text-align:center;font-style:normal;padding:0 3px}
.ex-pill i.new{background:var(--blue);color:var(--crust)}
.ex-headline{display:flex;gap:10px;align-items:center;padding:4px 2px}
.ex-headline .ring{width:40px;height:40px}.ex-headline .ring span{font-size:10px}
.ex-figtext{flex:1;min-width:0}.ex-figtext b{display:block;font-size:12.5px;color:var(--sub1)}
.ex-figtext small{display:block;font-size:11px;color:var(--o0)}.ex-figtext .progress{margin-top:5px;height:6px}
.ex-group{display:flex;justify-content:space-between;padding:8px 4px 2px;font-size:12px;font-weight:600;color:var(--o1);
  letter-spacing:.06em;text-transform:uppercase}
.ex-group.warn{color:var(--peach)}
.ex-card{border-radius:14px;background:var(--base);border:1px solid var(--s0);padding:2px 0;flex:none}
.ex-card.warn{border-color:var(--peach)}
.ex-row{display:flex;align-items:center;gap:9px;padding:7px 11px;min-height:40px}
.ex-row.done .ex-name{color:var(--o1);text-decoration:line-through}
.ex-mark{width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:15px;
  background:color-mix(in srgb,var(--h) 22%,transparent);position:relative}
.ex-mark.flag::after{content:'!';position:absolute;right:-3px;bottom:-3px;width:13px;height:13px;border-radius:50%;
  background:var(--peach);color:var(--crust);font:700 9px/13px var(--ui);text-align:center}
.ex-grow{flex:1;min-width:0}
.ex-name{font-size:13.5px;color:var(--text);line-height:1.3}
.ex-qty{color:var(--o0);font-size:12px}
.ex-sub{font-size:11px;color:var(--o0);margin-top:2px;display:flex;align-items:center;gap:4px}
.ex-from{color:var(--o0)}
.ex-local{color:var(--green)}
.ex-new{color:var(--blue)}
.ex-missing{color:var(--peach)}
.ex-warn{margin-top:4px;font-size:11px;color:var(--peach)}
.ex-warn b{color:var(--blue);font-weight:600}
.ex-banner{display:flex;gap:8px;align-items:center;padding:9px 11px;border-radius:11px;border:1px solid var(--peach);
  font-size:12px;color:var(--peach)}
.ex-banner b{margin-left:auto;color:var(--blue)}
.ex-cta{padding:8px 12px;font-size:12px;font-weight:600;color:var(--blue);border-top:1px solid var(--s0)}
.ex-row .check{width:24px;height:24px;flex:none}
.ex-chip{flex:none;max-width:120px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;font-size:10.5px}
.ex-sec-l{font-size:12px;font-weight:600;color:var(--o1);padding:8px 4px 2px;letter-spacing:.06em;text-transform:uppercase}
.ex-exc{display:flex;gap:11px;align-items:center;padding:10px 12px;border-top:1px solid var(--s0)}
.ex-exc:first-child{border-top:0}
.ex-exc .progress{height:5px;margin-top:6px}
.ex-date{width:52px;flex:none;display:flex;flex-direction:column;font-variant-numeric:tabular-nums}
.ex-date b{font-size:13px;color:var(--text)}.ex-date span{font-size:10.5px;color:var(--o0)}
.ex-date.none b{color:var(--o0)}
.ex-count{flex:none;font-size:12px;color:var(--sub0);font-variant-numeric:tabular-nums}
.ex-av{width:18px;height:18px;font-size:9px}
.ex-inline{background:var(--mantle);border-top:1px solid var(--s0);border-bottom:1px solid var(--s0)}
.ex-fold{padding:7px 10px;font-size:12px;color:var(--sub0)}
.ex-fab{position:absolute;right:16px;bottom:16px;width:50px;height:50px;border-radius:50%;background:var(--blue);
  color:var(--crust);display:grid;place-items:center;font-size:24px;box-shadow:var(--shadow)}
.ex-scrim{position:absolute;inset:0;background:rgba(17,17,27,.55);z-index:20}
.ex-sheet{position:absolute;left:0;right:0;bottom:0;z-index:21;background:var(--mantle);border-radius:22px 22px 0 0;
  border-top:1px solid var(--s1);box-shadow:0 -16px 40px rgba(0,0,0,.6)}
.ex-sheet.tall{top:70px;overflow:hidden}
.ex-sheet .handle{width:42px;height:5px;border-radius:3px;background:var(--s2);margin:10px auto 2px}
.ex-sheet-body{padding:6px 14px 18px;display:flex;flex-direction:column;gap:4px}
.ex-sheet-h{font:600 17px/1.25 var(--display);margin:4px 2px 8px}
.ex-sheet-h small{display:block;font:400 12px/1.4 var(--ui);color:var(--o0)}
.ex-field{display:flex;gap:10px;align-items:center;padding:8px 2px;border-top:1px solid var(--s0);font-size:12.5px}
.ex-field.col{flex-direction:column;align-items:stretch;gap:6px}
.ex-field .l{width:70px;flex:none;color:var(--o0)}
.ex-field .v{display:flex;gap:5px;flex-wrap:wrap;color:var(--text)}
.ex-field em{color:var(--o0);font-style:normal;font-size:11px}
.ex-field .chip{font-size:11px}.ex-field .chip.on{background:var(--blue);color:var(--crust)}
.ex-search{padding:8px 10px;border-radius:10px;background:var(--s0);font-size:12px;color:var(--o0)}
.ex-search em{color:var(--text);font-style:normal}
.ex-gopt{padding:7px 10px;border-radius:10px;border:1px solid var(--s0);display:flex;flex-direction:column;gap:2px}
.ex-gopt b{font-size:12.5px;color:var(--text)}.ex-gopt span{font-size:11px;color:var(--o0)}
.ex-gopt.on{border-color:var(--blue);background:color-mix(in srgb,var(--blue) 10%,transparent)}
.ex-gopt.plain{border-style:dashed;font-size:12px;color:var(--sub0)}
.ex-note{font-size:11.5px;color:var(--o0);padding:6px 2px;line-height:1.5}
.ex-btns{display:flex}
.ex-primary{flex:1;border:0;border-radius:13px;padding:12px;background:var(--blue);color:var(--crust);font:600 13.5px/1 var(--ui)}
.ex-strip{width:100%;max-width:380px;border:1px solid var(--s0);border-radius:18px;background:var(--mantle);
  padding:12px 13px;display:flex;flex-direction:column;gap:4px}
.ex-strip-l{font-size:11px;color:var(--o0);margin-top:8px}
.ex-strip-l em{color:var(--rose)}
.ex-w360{width:334px;max-width:100%;border-right:1px dashed var(--red)}
.ex-av2{width:22px;height:22px;font-size:9.5px;flex:none}
.ex-chead .ex-name{font-weight:600}
.ex-car{color:var(--o0);font-size:11px}
.ex-kid{padding-left:34px;min-height:36px}
.ex-kid .ex-name{font-size:12.5px}
.ex-composer{margin-top:auto;border-radius:14px;background:var(--base);border:1px solid var(--s0);padding:9px 10px;
  display:flex;flex-direction:column;gap:7px}
.ex-forwhom{display:flex;gap:6px;align-items:center}
.ex-forwhom .seg{padding:5px 9px;border-radius:999px;background:var(--s0);font-size:11px;color:var(--sub0)}
.ex-forwhom .seg.on{background:var(--blue);color:var(--crust);font-weight:600}
.ex-cfield{display:flex;padding:9px 11px;border-radius:11px;background:var(--s0);font-size:12.5px;color:var(--text)}
.ex-cfield span{flex:1}.ex-cfield b{color:var(--blue);font-size:12px}
.ex-csub{font-size:11px;color:var(--o0)}
.ex-snack{margin-top:auto;padding:10px 12px;border-radius:12px;background:var(--s1);font-size:12px;color:var(--text);
  display:flex;gap:8px}
.ex-snack b{margin-left:auto;color:var(--blue)}
.tablewrap{overflow-x:auto;margin:14px 0 0;max-width:900px}
table.cmp{border-collapse:collapse;font-size:13.5px;width:100%;min-width:560px}
table.cmp th,table.cmp td{border-top:1px solid var(--s0);padding:9px 10px;text-align:left;color:var(--sub0);vertical-align:top}
table.cmp th{color:var(--text);font:600 12px/1 var(--ui);letter-spacing:.06em;text-transform:uppercase}
table.cmp td:first-child{color:var(--text);white-space:nowrap}
@media (max-width:560px){.phone{height:600px}}`

const glyphCol = (k, title, glyph, note, rec = false) => `
    <div class="vcol">
      <div class="vcap"><div class="k">${k}${rec ? '<span class="rec">Gewählt</span>' : ''}</div>
        <h3>${title}</h3><p>${note}</p></div>
      ${strip(glyph, 'packing')}
    </div>`

const body = `<div class="vwrap">
  <div class="vhead">
    <div class="k">Owner request · 2026-09-26 · excursions-concept.md</div>
    <h1>Ausflüge: a small packing list inside the trip</h1>
    <p>The concept is decided in fourteen points: an excursion owns <b>its own rows with their own tick</b>, a row may
      come <em>aus dem Gepäck</em>, an excursion starts <b>from a Gruppe</b>, each outing is <b>its own excursion
      with its own dates</b>, and what it needs from home <b>lands on the packing list too</b> while the suitcase is
      open. Every phone below shows one trip, <b>Sardinien 2026</b>, with four travellers and three excursions.</p>
    <p><b>The three points left to the picture are decided too</b> (owner, 2026-09-26: Variant A each): the switcher
      glyph, whether one excursion is a
      page or a sheet, and how <em>nicht im Gepäck</em> looks. The mark (§3.28) is the tinted disc on each row.</p>
  </div>

  <div class="qhead"><div class="q dec">Decided</div>
    <h2>The list, one excursion, creating one, and the trace on the packing list</h2></div>
  <div class="vgrid">
    <div class="vcol"><div class="vcap"><div class="k ok">M26 · Ausflüge</div><h3>The fifth pill, a list by date</h3>
      <p>Upcoming first, <em>ohne Datum</em> after, past ones folded. Initials only when not everyone goes.</p></div>${D_LIST}</div>
    <div class="vcol"><div class="vcap"><div class="k ok">One excursion · lean M4</div><h3>Tick, quantity, skip — nothing more</h3>
      <p>No packer, container, weight or comments. <em>aus dem Gepäck</em> is all the link shows; <em>vor Ort</em>
        rows never touch the packing list.</p></div>${D_HIKE}</div>
    <div class="vcol"><div class="vcap"><div class="k ok">Creating</div><h3>Name, optional dates, who — then a Gruppe</h3>
      <p>The FR-27.13 picker, searched by group and by the things inside. The sheet says in advance what it will add
        to the packing list; one undo takes it all back.</p></div>${D_CREATE}</div>
    <div class="vcol"><div class="vcap"><div class="k ok">M4 · the trace</div><h3>The packing list names who borrows a row</h3>
      <p>A chip per linked row, so skipping the headlamp in the suitcase is not done blind.</p></div>${D_M4}</div>
  </div>


  <div class="qhead"><div class="q dec">Decided · added 2026-09-26</div>
    <h2>A thing per participant: a sleeping bag each</h2>
    <p>The excursion reuses M4's own shapes over <b>its participants</b>, not the trip's: the composer's for-whom strip
      (FR-25.28) and the per-person cluster (FR-25.1). <em>Alle</em> is remembered on the rows, so the set follows
      when the participants change.</p></div>
  <div class="vgrid">
    <div class="vcol"><div class="vcap"><div class="k ok">Defining and ticking</div><h3>Alle = one row per participant</h3>
      <p>The sleeping bag reads once with <em>1/2</em>; Andy's is in the rucksack, Sia's is not. Each child links that
        person's own row in the suitcase.</p></div>${P_DEFINE}</div>
    <div class="vcol"><div class="vcap"><div class="k ok">Participants change</div><h3>Lio joins, Sia stays behind</h3>
      <p>Lio gets a row in every <em>für alle</em> set. Sia's open rows go; her packed sleeping bag stays as
        <em>nicht mehr dabei</em>, because it is physically in the rucksack. One undo takes the whole edit back.</p>
      </div>${P_CHANGE}</div>
  </div>
  <div class="qhead"><div class="q dec">Question 1 · decided 2026-09-26: Variant A</div><h2>Which glyph stands for Ausflüge?</h2>
    <p>The pill is a glyph everywhere except where you stand (ADR-051 amendment 3), so the glyph has to say
      <em>outing</em> on its own. Ionicons offers these; the emoji stand in for them here. The last line of each
      strip is the widest case: six pills, measured against 360 px (the dashed line, E2E-G12-07).</p></div>
  <div class="vgrid">
    ${glyphCol('Variant A', 'Signpost — <code>trailSignOutline</code>', '🪧',
      'Reads as "a route somewhere", fits hike, boat and town trip alike, and collides with none of the other four.', true)}
    ${glyphCol('Variant B', 'Walker — <code>walkOutline</code>', '🚶',
      'Immediate for a hike, wrong for a boat trip or a hut reached by cable car.')}
    ${glyphCol('Variant C', 'Compass — <code>compassOutline</code>', '🧭',
      'General, but reads as "navigation" or "explore" — easy to take for a map.')}
  </div>

  <div class="qhead"><div class="q dec">Question 2 · decided 2026-09-26: Variant A</div><h2>Is one excursion a page or a sheet?</h2></div>
  <div class="vgrid">
    <div class="vcol"><div class="vcap"><div class="k">Variant A<span class="rec">Gewählt</span></div>
      <h3>Its own page under the trip</h3>
      <p>The excursion's name is the page head, the switcher stays, back returns to the list. The route can be linked
        from M1's card and the morning reminder.</p>
      <p class="win">Room for the whole list; a deep link for the reminder.</p></div>${Q2A}</div>
    <div class="vcol"><div class="vcap"><div class="k">Variant B</div><h3>A tall sheet over the list</h3>
      <p>Quick to peek at and dismiss, but a twelve-row hut list scrolls inside a sheet, and a sheet has no URL for the
        reminder to open.</p><p class="cost">Needs a new pattern: a packing list inside a sheet.</p></div>${Q2B}</div>
    <div class="vcol"><div class="vcap"><div class="k">Variant C</div><h3>Open in place, like an accordion</h3>
      <p>Everything on one screen, but two open excursions push each other off it, and the FAB would have to ask which
        one a new row is for.</p><p class="cost">Adding a row becomes ambiguous.</p></div>${Q2C}</div>
  </div>

  <div class="qhead"><div class="q dec">Question 3 · decided 2026-09-26: Variant A</div><h2>How does <em>nicht im Gepäck</em> look?</h2>
    <p>The hut tour was created after the suitcase was closed: the sleeping-bag liner and the earplugs are not in the
      luggage. Each such row offers <em>Vor Ort besorgen</em>, which files a shopping entry in M6's <em>Vor Ort</em>
      list.</p></div>
  <div class="vgrid">
    <div class="vcol"><div class="vcap"><div class="k">Variant A<span class="rec">Gewählt</span></div>
      <h3>A line under the row, with its action</h3>
      <p>The row stays in its category; the second line says what is wrong and what to do. The mark stays untouched
        (G-15).</p><p class="win">One place, no new pattern, the action is where the problem is.</p></div>${Q3A}</div>
    <div class="vcol"><div class="vcap"><div class="k">Variant B</div><h3>A badge on the mark plus a banner</h3>
      <p>The banner gathers the action for all of them at once.</p>
      <p class="cost">Paints on the §3.28 mark, which FR-28.5/G-15 keep to the mark's own glyph.</p></div>${Q3B}</div>
    <div class="vcol"><div class="vcap"><div class="k">Variant C</div><h3>Its own section at the top</h3>
      <p>Impossible to miss, one action for all of them.</p>
      <p class="cost">The row leaves its category, and once it has been bought it has to move back.</p></div>${Q3C}</div>
  </div>
</div>`

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />`

const page = `<!doctype html>
<html lang="en" data-theme="mocha"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Ausflüge im Trip</title>
${fonts}
<style>${style}</style></head>
<body>
${body}
</body></html>`

const fragment = `<title>Ausflüge im Trip</title>
${fonts}
<style>${style}</style>
${body}`

writeFileSync(join(here, 'UI_Concept_Excursions_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_Excursions_variants.html')

const flag = process.argv.indexOf('--artifact')
if (flag !== -1 && process.argv[flag + 1]) {
  writeFileSync(process.argv[flag + 1], fragment)
  console.log(`wrote ${process.argv[flag + 1]}`)
}
