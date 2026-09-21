/**
 * Builds UI_Concept_ClosePacking_variants.html — the rendered round for the
 * owner request of 2026-09-20: an action that *finishes packing* (every row
 * still open becomes FR-5.5's „bewusst nicht mitgenommen"), and M6 no longer
 * opening on „Vor der Abreise" once the trip has started or packing is closed.
 *
 * Same rule as the other variant sheets: the CSS is lifted verbatim from
 * UI_Concept_Prototype.html, because a variant that looks different because
 * its stylesheet differs teaches nothing about the variant. Only sheet chrome
 * and the few classes this comparison needs are added, under a `cl-` prefix so
 * they cannot collide with the prototype's generic names.
 *
 * It writes two files from one body: the standalone page for dev-docs, and
 * (with --artifact) a head-less fragment for publishing as an Artifact, whose
 * host supplies the document skeleton itself.
 *
 * Run: node dev-docs/build-close-packing-variants.mjs [--artifact <path>]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const proto = readFileSync(join(here, 'UI_Concept_Prototype.html'), 'utf8')
const css = proto.slice(proto.indexOf('<style>') + 7, proto.indexOf('</style>'))

/* --- the pieces every phone is built from ------------------------------- */

/** A packing row as M4 renders it: control, name, sub-line, right-edge marks. */
const row = ({ name, sub = '', marks = '', done = false, on = false }) => `
      <div class="li ${done ? 'done' : ''}">
        <div class="check ${on ? 'on' : ''}">${on ? '✓' : ''}</div>
        <div class="grow"><div class="name">${name}</div>${sub ? `<div class="desc">${sub}</div>` : ''}</div>
        <div class="cl-marks">${marks}</div>
      </div>`

const groupHead = (name, n) => `<div class="grouphead">${name}<span class="n">${n}</span></div>`

/** The trip line (G-12): figures on the left, the trip's other views right. */
const tripLine = (status, nav = true) => `
    <div class="cl-tripline">
      <div class="stack"><span class="avatar" style="background:var(--peach)">A</span><span class="avatar" style="background:var(--mauve)">S</span></div>
      <div class="cl-figs">${status}</div>
      ${nav ? `<div class="cl-nav"><span>🛒</span><span>🧳</span><span>📈</span></div>` : ''}
    </div>`

/** The app bar, with the icon cluster M4 actually carries. */
const appbar = (title, { more = false } = {}) => `
  <div class="cl-bar">
    <span class="cl-back">‹</span>
    <span class="cl-title">${title}</span>
    <span class="cl-icons">🔍 ⛭ ⤡ ${more ? '<b class="cl-more">⋮</b>' : ''}</span>
  </div>`

const phone = (inner) => `<div class="phone">${inner}</div>`

/* ====================================================================== *
 * Question 1 — where the action lives
 * ====================================================================== */

const Q1A = phone(`
  ${appbar('Samedan 2026', { more: true })}
  <div class="body cl-body">
    ${tripLine('84/96 gepackt · 18 kg · Prep 2')}
    <div class="cl-popover">
      <div class="cl-poprow">✎ <span>Reise bearbeiten</span></div>
      <div class="cl-poprow sel">✓ <span>Packen abschliessen</span></div>
      <div class="cl-poprow">🗄 <span>Reise abschliessen</span></div>
    </div>
    ${groupHead('Kleidung', '6/8')}
    <div class="card">
      ${row({ name: 'Regenjacke' })}
      ${row({ name: 'Wandersocken', sub: '4 von 6 gepackt' })}
    </div>
  </div>`)

const Q1B = phone(`
  ${appbar('Samedan 2026', { more: true })}
  <div class="body cl-body">
    ${tripLine('84/96 gepackt · 18 kg · Prep 2')}
    <div class="banner cl-close">
      <span class="cl-ico">🧳</span>
      <div class="grow">
        <b>Noch 12 Sachen offen</b>
        <div class="tiny muted">Was liegen bleibt, wird als bewusst nicht mitgenommen vermerkt.</div>
      </div>
      <button>Packen abschliessen</button>
    </div>
    ${groupHead('Kleidung', '6/8')}
    <div class="card">
      ${row({ name: 'Regenjacke' })}
      ${row({ name: 'Wandersocken', sub: '4 von 6 gepackt' })}
    </div>
  </div>`)

const Q1C = phone(`
  ${appbar('Samedan 2026', { more: true })}
  <div class="body cl-body">
    <div class="cl-tripline">
      <div class="stack"><span class="avatar" style="background:var(--peach)">A</span><span class="avatar" style="background:var(--mauve)">S</span></div>
      <div class="cl-figs"><span class="cl-pill">88 % ▾</span> 18 kg · Prep 2</div>
      <div class="cl-nav"><span>🛒</span><span>🧳</span><span>📈</span></div>
    </div>
    ${groupHead('Kleidung', '6/8')}
    <div class="card">
      ${row({ name: 'Regenjacke' })}
      ${row({ name: 'Wandersocken', sub: '4 von 6 gepackt' })}
    </div>
    <div class="cl-sheet">
      <div class="handle"></div>
      <div class="cl-sheet-body">
        <div class="cl-sheet-h">Packen · 12 offen</div>
        <div class="cl-actrow">Nur Offene zeigen</div>
        <div class="cl-actrow sel">Packen abschliessen</div>
      </div>
    </div>
  </div>`)

/* ====================================================================== *
 * Question 2 — what the action asks, and what the undo is
 * ====================================================================== */

const Q2A = phone(`
  ${appbar('Samedan 2026')}
  <div class="body cl-body cl-dim">
    ${tripLine('84/96 gepackt · 18 kg · Prep 2')}
    ${groupHead('Kleidung', '6/8')}
    <div class="card">
      ${row({ name: 'Regenjacke' })}
      ${row({ name: 'Wandersocken', sub: '4 von 6 gepackt' })}
    </div>
    ${groupHead('Ausrüstung', '9/12')}
    <div class="card">
      ${row({ name: 'Stirnlampe', marks: '⏰' })}
      ${row({ name: 'Wanderstöcke' })}
    </div>
  </div>
  <div class="cl-scrim"></div>
  <div class="cl-sheet">
    <div class="handle"></div>
    <div class="cl-sheet-body">
      <div class="cl-sheet-h">Packen abschliessen?</div>
      <p class="cl-lead">12 offene Sachen werden als <b>bewusst nicht mitgenommen</b> vermerkt.
        Die Packliste ist damit fertig.</p>
      <div class="cl-facts">
        <div>2 sind angefangen — <span class="muted">Wandersocken 4 von 6</span></div>
        <div>3 stehen auf <span class="muted">„erst am Abreisetag“</span> ⏰</div>
        <div>1 hat Sonja gerade in der Hand 🔒</div>
      </div>
      <div class="cl-btns">
        <button class="cl-primary">Abschliessen · 12</button>
        <button class="cl-ghost">Abbrechen</button>
      </div>
    </div>
  </div>`)

/** The moment after the tap — shown beside the phone, not on top of it. */
const Q2ASnack = `
    <div class="cl-after">
      <div class="cl-afterlbl">und danach, für ein paar Sekunden</div>
      <div class="cl-snack">12 als nicht mitgenommen vermerkt<b>Rückgängig</b></div>
    </div>`

const pickRow = (name, sub, keep = false) => `
        <div class="li ${keep ? 'cl-keep' : ''}">
          <div class="grow"><div class="name">${name}</div><div class="desc">${sub}</div></div>
          <span class="opt ${keep ? 'sel' : ''}">${keep ? 'doch packen' : 'bleibt liegen'}</span>
        </div>`

const Q2B = phone(`
  ${appbar('Samedan 2026')}
  <div class="body cl-body cl-dim">
    ${tripLine('84/96 gepackt · 18 kg · Prep 2')}
    ${groupHead('Kleidung', '6/8')}
    <div class="card">
      ${row({ name: 'Regenjacke' })}
      ${row({ name: 'Wandersocken', sub: '4 von 6 gepackt' })}
    </div>
    ${groupHead('Ausrüstung', '9/12')}
    <div class="card">
      ${row({ name: 'Stirnlampe', marks: '⏰' })}
      ${row({ name: 'Wanderstöcke' })}
    </div>
  </div>
  <div class="cl-scrim"></div>
  <div class="cl-sheet tall">
    <div class="handle"></div>
    <div class="cl-sheet-body">
      <div class="cl-sheet-h">Was bleibt liegen?</div>
      <p class="cl-lead">12 Sachen sind offen. Tippe an, was doch noch mitkommt.</p>
      <div class="card">
        ${pickRow('Regenjacke', 'Kleidung')}
        ${pickRow('Wandersocken', 'Kleidung · 4 von 6 gepackt')}
        ${pickRow('Stirnlampe', 'Ausrüstung · ⏰ erst am Abreisetag', true)}
        ${pickRow('Ladegerät', 'Technik · 🔒 bei Sonja', true)}
        ${pickRow('Reiseapotheke', 'Bad')}
      </div>
      <div class="cl-btns">
        <button class="cl-primary">Abschliessen · 10</button>
        <button class="cl-ghost">Abbrechen</button>
      </div>
    </div>
  </div>`)

/* ====================================================================== *
 * Question 3 — how a half-packed row reads afterwards
 * ====================================================================== */

const partial = (title, note, cost, rowHtml, bad = false) => `
    <div class="vcol">
      <div class="vcap">
        <div class="k">${title}</div>
        <p>${note}</p>
        <p class="cost ${bad ? 'bad' : ''}">${cost}</p>
      </div>
      <div class="cl-rowbox">
        <div class="grouphead">Kleidung<span class="n">8/8</span></div>
        <div class="card">${rowHtml}</div>
      </div>
    </div>`

const Q3 = `
  <div class="vgrid three">
    ${partial(
      'P1 · the amount shrinks to what is in the bag',
      'quantity 6 → 4, count stays 4. The row reads as packed and the trip line completes.',
      'Cost: nothing records that two were left behind — the row simply says four were wanted.',
      row({ name: 'Wandersocken', sub: '4 von 4 gepackt', done: true, on: true }),
    )}
    ${partial(
      'P2 · the whole row is skipped',
      'quantity 0, count 0 — exactly what the row menu writes today.',
      'Cost: it denies four socks that are in the bag, and M14 loses them as packed-and-unused.',
      row({ name: 'Wandersocken', sub: 'weggelassen', done: true, marks: '<span class="chip">weggelassen</span>' }),
      true,
    )}
    ${partial(
      'P3 · the state is written, the numbers are kept',
      'state = skipped beside quantity 6 / count 4 — FR-5.5 already calls that a legal row.',
      'Cost: `unitsOf` has to read the state, or the trip line sits at 4/6 for ever.',
      row({
        name: 'Wandersocken',
        sub: '4 von 6 gepackt · Rest weggelassen',
        done: true,
        on: true,
        marks: '<span class="chip">weggelassen</span>',
      }),
    )}
  </div>`

/* ====================================================================== *
 * Question 4 — what „packing is closed" is, and what M4 says afterwards
 * ====================================================================== */

const Q4A = phone(`
  ${appbar('Samedan 2026', { more: true })}
  <div class="body cl-body">
    ${tripLine('84/84 gepackt · 18 kg · Prep 2')}
    <div class="emptyfilter">
      <b>Packen abgeschlossen 🎉</b>
      Nichts mehr offen für diese Reise.
    </div>
    <div class="donebar">✓ 12 nicht mitgenommen anzeigen</div>
    <div class="donebar">✓ 84 gepackte anzeigen</div>
  </div>`)

const Q4B = phone(`
  ${appbar('Samedan 2026', { more: true })}
  <div class="body cl-body">
    ${tripLine('84/84 gepackt · 18 kg · Prep 2')}
    <div class="card cl-stamp">
      <div class="li">
        <span class="cl-ico ok">✓</span>
        <div class="grow">
          <div class="name">Packen abgeschlossen</div>
          <div class="desc">heute 18:40 · Andy · 12 nicht mitgenommen</div>
        </div>
        <span class="opt">wieder öffnen</span>
      </div>
    </div>
    <div class="grouphead">Später dazugekommen<span class="n">0/1</span></div>
    <div class="card">${row({ name: 'Zahnbürste', sub: 'Bad · nach dem Abschluss ergänzt' })}</div>
    <div class="donebar">✓ 12 nicht mitgenommen anzeigen</div>
  </div>`)

/* ====================================================================== *
 * Question 5 — which M6 tab opens
 * ====================================================================== */

const shopTabs = (onLocal, beforeN, localN) => `
    <div class="shtabs">
      <button class="${onLocal ? '' : 'on'}">Vor der Abreise<span class="b">${beforeN}</span></button>
      <button class="${onLocal ? 'on' : ''}">Vor Ort<span class="b">${localN}</span></button>
    </div>`

const shopRow = (name, sub) => `
      <div class="li"><div class="check"></div>
        <div class="grow"><div class="name">${name}</div>${sub ? `<div class="desc">${sub}</div>` : ''}</div></div>`

const Q5A = phone(`
  ${appbar('Einkaufen')}
  <div class="body cl-body">
    <div class="cl-sub">Samedan 2026 · läuft seit heute</div>
    ${shopTabs(true, 5, 3)}
    ${groupHead('Küche', '')}
    <div class="card">
      ${shopRow('Brot', '')}
      ${shopRow('Käse', 'für Andy, Sonja')}
    </div>
    ${groupHead('Bad', '')}
    <div class="card">${shopRow('Sonnencreme', '')}</div>
  </div>`)

const Q5B = phone(`
  ${appbar('Einkaufen')}
  <div class="body cl-body">
    <div class="cl-sub">Samedan 2026 · läuft seit heute</div>
    ${shopTabs(false, 5, 0)}
    ${groupHead('Küche', '')}
    <div class="card">
      ${shopRow('Kaffee', '')}
      ${shopRow('Bouillon', '')}
    </div>
    <div class="cl-note">„Vor Ort“ ist leer — die Liste öffnet dort, wo etwas offen ist.</div>
  </div>`)

/* ====================================================================== */

const style = `${css}
/* Variant-sheet chrome only — everything inside a phone is the prototype's. */
body{padding:0;margin:0;display:block;height:auto;min-height:0}
.vwrap{max-width:1400px;margin:0 auto;padding-block:28px 80px;padding-left:20px;padding-right:20px}
.vhead{max-width:78ch;margin-bottom:30px}
.vhead .k{font:600 11.5px/1 var(--ui);letter-spacing:.16em;text-transform:uppercase;color:var(--peach)}
.vhead h1{font:600 30px/1.12 var(--display);margin:10px 0 12px;text-wrap:balance}
.vhead p{margin:0 0 9px;color:var(--sub0);font-size:14.5px;line-height:1.65}
.vhead em{color:var(--rose);font-style:italic}
.vhead b{color:var(--text)}
.qhead{max-width:78ch;margin:52px 0 22px}
.qhead h2{font:600 22px/1.2 var(--display);margin:0 0 9px}
.qhead .q{font:600 11.5px/1 var(--ui);letter-spacing:.16em;text-transform:uppercase;color:var(--blue)}
.qhead p{margin:8px 0 0;color:var(--sub0);font-size:14px;line-height:1.62}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:26px;align-items:start}
.vgrid.three{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.vcol{display:flex;flex-direction:column;gap:12px;min-width:0}
.vcap .k{font:600 11.5px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--peach)}
.vcap h3{font:600 17px/1.25 var(--display);margin:7px 0 6px}
.vcap p{margin:0 0 6px;color:var(--sub0);font-size:13px;line-height:1.55}
.vcap .cost{color:var(--peach);font-size:12.5px}
.vcap .cost.bad{color:var(--red)}
.vcap .win{color:var(--green);font-size:12.5px}

.phone{width:100%;max-width:380px;height:588px;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
.phone .body{flex:1;overflow:hidden;padding:10px 13px;position:relative;display:flex;flex-direction:column;gap:2px}
.phone .card{border-radius:14px;overflow:hidden}
.phone .grouphead{margin:14px 2px 8px}
.cl-bar{flex:none;display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid var(--s0);
  background:var(--crust)}
.cl-back{color:var(--o1);font-size:19px;line-height:1}
.cl-title{font:600 15px/1.2 var(--display);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cl-icons{font-size:13px;color:var(--o1);letter-spacing:.06em;flex:none}
.cl-more{color:var(--text)}
.cl-sub{font-size:12px;color:var(--o0);padding:4px 2px 2px}
.cl-tripline{display:flex;align-items:center;gap:9px;padding:9px 2px 4px}
.cl-figs{flex:1;min-width:0;font-size:12.5px;font-weight:600;color:var(--sub1);font-variant-numeric:tabular-nums}
.cl-pill{display:inline-block;padding:3px 9px;border-radius:999px;background:var(--s0);border:1px solid var(--s1);
  color:var(--text);margin-right:5px}
.cl-nav{display:flex;gap:9px;font-size:13px;flex:none;opacity:.85}
.cl-marks{display:flex;align-items:center;gap:6px;flex:none;font-size:12px}

.cl-popover{position:absolute;right:11px;top:6px;z-index:22;width:212px;background:var(--base);
  border:1px solid var(--s1);border-radius:14px;box-shadow:0 18px 40px -14px rgba(0,0,0,.8);overflow:hidden}
.cl-poprow{display:flex;gap:10px;align-items:center;padding:11px 13px;font-size:13.5px;color:var(--sub1)}
.cl-poprow+.cl-poprow{border-top:1px solid var(--s0)}
.cl-poprow.sel{color:var(--text);background:rgba(137,180,250,.12)}
.banner.cl-close{margin:4px 0 2px;background:rgba(137,180,250,.10);border-color:rgba(137,180,250,.30)}
.banner.cl-close b{font-size:13.5px}
.banner.cl-close button{background:var(--blue)}
.cl-ico{font-size:18px;flex:none}
.cl-ico.ok{width:24px;height:24px;border-radius:50%;background:var(--green);color:var(--crust);
  display:grid;place-items:center;font-size:13px;font-weight:700}
.cl-stamp{margin:4px 0 2px}

.cl-scrim{position:absolute;inset:0;background:rgba(17,17,27,.55);z-index:20}
.cl-dim{filter:saturate(.7)}
.cl-sheet{position:absolute;left:0;right:0;bottom:0;z-index:21;background:var(--mantle);
  border-radius:22px 22px 0 0;border-top:1px solid var(--s1);box-shadow:0 -16px 40px rgba(0,0,0,.62)}
.cl-sheet .handle{width:42px;height:5px;border-radius:3px;background:var(--s2);margin:10px auto 2px}
.cl-sheet-body{padding:8px 16px 20px}
.cl-sheet-h{font:600 16px/1.25 var(--display);margin:6px 2px 6px}
.cl-lead{font-size:13px;color:var(--sub0);line-height:1.55;margin:0 2px 12px}
.cl-lead b{color:var(--text)}
.cl-facts{display:grid;gap:7px;padding:11px 12px;border-radius:12px;background:var(--base);
  border:1px solid var(--s0);font-size:12.5px;color:var(--sub1);margin-bottom:14px}
.cl-btns{display:flex;align-items:center;gap:10px}
.cl-primary{flex:1;border:0;border-radius:13px;padding:12px 14px;background:var(--blue);color:var(--crust);
  font:600 13.5px/1 var(--ui)}
.cl-ghost{border:0;background:none;color:var(--sub0);font:600 13px/1 var(--ui);padding:12px 6px}
.cl-actrow{padding:12px 13px;border-radius:12px;background:var(--base);border:1px solid var(--s0);
  font-size:13.5px;font-weight:600;color:var(--sub1);margin-top:8px}
.cl-actrow.sel{color:var(--crust);background:var(--blue);border-color:var(--blue)}
.cl-after{max-width:380px;display:flex;flex-direction:column;gap:7px}
.cl-afterlbl{font-size:11.5px;color:var(--o0);letter-spacing:.04em;padding-left:2px}
.cl-after .cl-snack{position:static;left:auto;right:auto;bottom:auto}
.cl-snack{position:absolute;left:14px;right:14px;bottom:14px;z-index:30;background:var(--s1);
  border:1px solid var(--s2);border-radius:13px;padding:12px 14px;display:flex;align-items:center;gap:12px;
  font-size:12.5px;box-shadow:var(--shadow)}
.cl-snack b{margin-left:auto;color:var(--peach);font-size:12.5px}
.cl-keep .name{color:var(--text)}
.cl-note{font-size:12px;color:var(--o0);padding:12px 2px;line-height:1.5}
.cl-rowbox{padding:12px 13px;border-radius:18px;background:var(--mantle);border:1px solid var(--s0)}
.cl-rowbox .card{border-radius:14px;overflow:hidden}
.cl-rowbox .grouphead{margin:2px 2px 9px}

.shared{margin-top:40px;max-width:82ch}
.shared h2{font:600 21px/1.2 var(--display);margin:0 0 10px}
.shared h3{font:600 15px/1.2 var(--ui);margin:22px 0 6px}
.shared p{color:var(--sub0);font-size:14px;line-height:1.65;margin:0 0 10px}
.shared b{color:var(--text)}
.shared ul{margin:0 0 12px;padding-left:20px;color:var(--sub0);font-size:14px;line-height:1.65}
.shared li{margin-bottom:5px}
.tablewrap{overflow-x:auto;margin:14px 0 0}
table.cmp{border-collapse:collapse;font-size:13.5px;width:100%;min-width:560px}
table.cmp th,table.cmp td{border-top:1px solid var(--s0);padding:9px 10px;text-align:left;
  color:var(--sub0);vertical-align:top}
table.cmp th{color:var(--text);font:600 12px/1 var(--ui);letter-spacing:.06em;text-transform:uppercase}
table.cmp td:first-child{color:var(--text)}
@media (max-width:560px){.phone{height:560px}}`

const body = `<div class="vwrap">
  <div class="vhead">
    <div class="k">Owner request · 2026-09-20</div>
    <h1>Finishing the packing, and what „before departure“ stops meaning</h1>
    <p>Two requests, one moment in a trip's life. First: <b>an action that finishes the packing</b> —
      everything still open becomes FR-5.5's <em>bewusst nicht mitgenommen</em>, so the list states a
      decision instead of an unfinished job. Second: once the trip has <b>started</b>, or the packing is
      <b>closed</b>, M6 must stop opening on <em>„Vor der Abreise“</em> — that moment is past, and the tab
      that is still worth working is <em>„Vor Ort“</em>.</p>
    <p>Every phone below shows the same trip: <b>Samedan 2026</b>, 84 of 96 packed, twelve rows still open —
      among them one half-packed row, three marked <em>„erst am Abreisetag“</em> (FR-5.1) and one Sonja is
      holding right now (G-3). Those three are what separate the variants; a list of plain open rows would
      make them all look equally good.</p>
  </div>

  <div class="qhead">
    <div class="q">Question 1</div>
    <h2>Where does <em>„Packen abschliessen“</em> live?</h2>
    <p>It is a bulk write over up to a hundred rows, so it has to be found on purpose rather than by
      accident. M4's app bar carries no overflow of destinations by decision (§3.25) — but it does carry
      the two lifecycle steps, and this is a third.</p>
  </div>
  <div class="vgrid">
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant A</div>
        <h3>In the ⋮ menu, beside the lifecycle steps</h3>
        <p>Where <em>Reise starten</em> and <em>Reise abschliessen</em> already are: words, not glyphs,
          and the same grammar as every other thing that changes the trip.</p>
        <p class="win">Wins: nothing new to learn, nothing added to a working list.</p>
        <p class="cost">Cost: two entries reading <em>„abschliessen“</em> one under the other, and the
          action is invisible until you open the menu looking for something else.</p>
      </div>
      ${Q1A}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant B</div>
        <h3>A card above the list, only when it is due</h3>
        <p>The shape M4 already uses for the closing pass: it states how much would be left behind and
          carries the verb. Shown once the trip is running (or on the departure day), never while planning.</p>
        <p class="win">Wins: discoverable exactly when it applies, and it names the consequence before
          the tap.</p>
        <p class="cost">Cost: a third band above the list, after trip todos (FR-7.4) and prep — and on a
          trip you are still packing it reads as a nag.</p>
      </div>
      ${Q1B}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant C</div>
        <h3>Behind the progress figure</h3>
        <p>The trip line's percentage becomes the door: tap it for a small sheet about packing — what is
          open, show only those, finish.</p>
        <p class="win">Wins: it sits on the number that raises the question in the first place.</p>
        <p class="cost">Cost: the trip line is a <em>figure</em> today (G-12) and stays unfiltered on
          purpose; making it a control is new grammar, and nobody presses a statistic.</p>
      </div>
      ${Q1C}
    </div>
  </div>

  <div class="qhead">
    <div class="q">Question 2</div>
    <h2>What does it ask before writing?</h2>
    <p>The write is reversible in principle — FR-5.5's undo restores the rows a skip found — but only if
      the batch is undone as one thing. The variants differ in whether the twelve rows are a
      <em>number</em> to confirm or a <em>list</em> to look at.</p>
  </div>
  <div class="vgrid">
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant A</div>
        <h3>One confirm, one undo</h3>
        <p>A sheet that states the count and the three things a count hides: started rows, late-packer
          rows, a row somebody is holding. Then the FR-25.2 snackbar with a single
          <em>Rückgängig</em> for the whole batch.</p>
        <p class="win">Wins: two taps on any trip size, and the exceptions are still named.</p>
        <p class="cost">Cost: you confirm a number. The one thing you actually forgot is inside it,
          unnamed, and the undo window is seconds long.</p>
      </div>
      ${Q2A}
      ${Q2ASnack}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant B</div>
        <h3>A last look, row by row</h3>
        <p>The rows about to be left behind, each one tappable back into the list. The default is
          <em>bleibt liegen</em>; the late-packer and held rows arrive pre-kept, because neither is
          evidence of a decision.</p>
        <p class="win">Wins: the forgotten thing gets caught here, which is the entire point of the
          action; and it is FR-9.3's closing pass in a posture people already know.</p>
        <p class="cost">Cost: a second review in front of the trip's own review, and on a 40-row
          remainder it is a screen rather than a question.</p>
      </div>
      ${Q2B}
    </div>
  </div>

  <div class="qhead">
    <div class="q">Question 3</div>
    <h2>How does a half-packed row read afterwards?</h2>
    <p>This is the one question with a wrong answer. <b>Four of six socks are in the bag.</b> Today's skip
      writes quantity 0 and count 0, which is the middle card — it denies four socks that travelled.
      FR-5.5 already settled that <b>state <code>skipped</code> beside a quantity above zero is a legal
      row</b>, which makes the third card available.</p>
  </div>
  ${Q3}

  <div class="qhead">
    <div class="q">Question 4</div>
    <h2>Is „packing is closed“ a stamp, or is it read off the rows?</h2>
    <p>The M6 rule needs the phrase to mean something, and the two readings differ the moment somebody
      quick-adds a toothbrush afterwards (FR-5.6).</p>
  </div>
  <div class="vgrid">
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant A</div>
        <h3>Derived: nothing is open</h3>
        <p>No new column. The list's own empty state says it, and the two reveal bars hold what is
          behind it. A row added later reopens the trip — and M6 goes back to defaulting to
          <em>„Vor der Abreise“</em>.</p>
        <p class="win">Wins: no schema change, so no dev database is deleted (invariant 2), and no new
          field in the sync contract.</p>
        <p class="cost">Cost: „abgeschlossen“ is not a fact anybody recorded, so it cannot be dated, shown
          or reopened — and one forgotten toothbrush silently undoes it.</p>
      </div>
      ${Q4A}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant B</div>
        <h3>Stamped: <code>trips.packing_closed_at</code></h3>
        <p>A decision with a time and a person, like every other stamp on the trip. M4 leads with it and
          offers the way back; a row added afterwards is open without reopening the decision.</p>
        <p class="win">Wins: the state survives the toothbrush, reads as history in M14, and
          <em>„wieder öffnen“</em> exists.</p>
        <p class="cost">Cost: a schema change — every development database is deleted and reseeded — plus
          a field in the master partition and its field clock.</p>
      </div>
      ${Q4B}
    </div>
  </div>

  <div class="qhead">
    <div class="q">Question 5</div>
    <h2>Which M6 tab opens?</h2>
    <p>Both variants stop opening on <em>„Vor der Abreise“</em> once the trip runs. They differ on the
      trip that departed with five things still unbought — and the open tab is also where a quick-add
      lands, so this decides more than what you read first.</p>
  </div>
  <div class="vgrid">
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant A</div>
        <h3>The phase decides</h3>
        <p>Running, or packing closed → <em>„Vor Ort“</em>. Planning → <em>„Vor der Abreise“</em>, as
          today. One rule, no arithmetic.</p>
        <p class="win">Wins: predictable — the same trip always opens the same way, and the count on the
          other tab still says what is over there.</p>
        <p class="cost">Cost: departing with five unbought things puts them one tap away instead of in
          front of you.</p>
      </div>
      ${Q5A}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant B</div>
        <h3>The phase decides, the content breaks the tie</h3>
        <p>Same rule, with one clause: if the preferred tab is empty and the other one is not, open the
          one with something on it.</p>
        <p class="win">Wins: never opens on an empty list while work is waiting on the other side.</p>
        <p class="cost">Cost: the screen opens differently as rows are checked off, so the tab you were
          working stops being the tab you return to — the reason the tab is not remembered either.</p>
      </div>
      ${Q5B}
    </div>
  </div>

  <div class="shared">
    <h2>What the action deliberately does not touch</h2>
    <ul>
      <li><b>Shopping rows.</b> An unbought <em>vorher kaufen</em> row is the shopping list's business,
        and question 5 is the answer to it — finishing the packing does not decide it.</li>
      <li><b>Prep todos (FR-7.3) and trip todos (FR-7.4).</b> They are outside every packing figure, and
        „nicht mitgenommen“ says nothing about a task.</li>
      <li><b>The trip's lifecycle.</b> It neither starts nor archives the trip; <em>Reise abschliessen</em>
        stays the only door into the closing pass.</li>
      <li><b>Somebody else's claim.</b> The G-3 lock is advisory by decision, so a held row can be closed
        — which is why the variants show it rather than hide it.</li>
    </ul>

    <h2>The recommendation, if it helps</h2>
    <div class="tablewrap">
      <table class="cmp">
        <tr><th>Question</th><th>Pick</th><th>Why that one</th></tr>
        <tr><td>1 · where</td><td>A <span class="muted">+ B once running</span></td>
          <td>The menu is the honest home for a trip-changing verb; the card is what makes it findable on
            the day it matters. B alone would offer it nowhere while planning.</td></tr>
        <tr><td>2 · the ask</td><td>B</td>
          <td>The action exists to turn „forgotten“ into „decided“. A number cannot tell the two apart,
            and a list of twelve is shorter than the packing list behind it.</td></tr>
        <tr><td>3 · half-packed</td><td>P3</td>
          <td>It is the only one that stays true, and FR-5.5 already legalised the row shape. The cost is
            one honest change in <code>packState.unitsOf</code>.</td></tr>
        <tr><td>4 · the state</td><td>B</td>
          <td>M6's default hangs on it, „wieder öffnen“ needs it, and a rule that a quick-add silently
            revokes is not a rule. Schema cost is real but one-off.</td></tr>
        <tr><td>5 · the tab</td><td>A</td>
          <td>A default that moves as rows are checked off is the thing M6 already refuses to do with the
            remembered tab. The count on the other tab does B's job at no cost.</td></tr>
      </table>
    </div>
    <p>Nothing here is built yet. Once the five are settled they become one FR each in §3.5 and §3.2's
      shopping half, plus the M4/M6 lines in the UI-Spec and a case in the ledger — and, if question 4
      lands on B, a line in <code>schema.sql</code> and a reseed.</p>
  </div>
</div>`

const page = `<!doctype html>
<html lang="en" data-theme="mocha"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Packen abschliessen</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${style}</style></head>
<body>
${body}
</body></html>`

const fragment = `<title>Packen abschliessen</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${style}</style>
${body}`

writeFileSync(join(here, 'UI_Concept_ClosePacking_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_ClosePacking_variants.html')

const flag = process.argv.indexOf('--artifact')
if (flag !== -1 && process.argv[flag + 1]) {
  writeFileSync(process.argv[flag + 1], fragment)
  console.log(`wrote ${process.argv[flag + 1]}`)
}
