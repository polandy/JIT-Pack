/**
 * Builds UI_Concept_TripTasks_variants.html — the rendered round for the
 * owner request of 2026-09-20, second reading.
 *
 * The request in one line: **the trip's tasks get a screen of their own**,
 * beside the packing list and the shopping list — except the ones that are
 * packing work, which stay where the packing happens. A task carries a
 * phase (before the holiday / during it), an assignee like a packing row,
 * and its history: who wrote it and when, who finished it and when.
 *
 * The shopping list is **not** part of this (owner, same day): M6 keeps its
 * own two lists, and nothing here reads or writes them.
 *
 * Same rule as the other variant sheets: the CSS is lifted verbatim from
 * UI_Concept_Prototype.html, because a variant that looks different because
 * its stylesheet differs teaches nothing about the variant. Only sheet chrome
 * and the few classes this comparison needs are added, under a `tp-` prefix so
 * they cannot collide with the prototype's generic names.
 *
 * It writes two files from one body: the standalone page for dev-docs, and
 * (with --artifact) a head-less fragment for publishing as an Artifact, whose
 * host supplies the document skeleton itself.
 *
 * Run: node dev-docs/build-trip-tasks-variants.mjs [--artifact <path>]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const proto = readFileSync(join(here, 'UI_Concept_Prototype.html'), 'utf8')
const css = proto.slice(proto.indexOf('<style>') + 7, proto.indexOf('</style>'))

/* --- the pieces every phone is built from ------------------------------- */

const phone = (inner) => `<div class="phone">${inner}</div>`

/** The app bar: back, the trip's name (ADR-050 puts the page name below). */
const appbar = () => `
  <div class="tp-bar">
    <span class="tp-back">‹</span>
    <span class="tp-title">Samedan 2026</span>
    <span class="tp-icons">🔍 ⛭ ⤡ ⋮</span>
  </div>`

/**
 * The G-9 page head plus ADR-051's view switcher — with the third pill this
 * concept asks for. `cur` is one of packing | shopping | tasks.
 */
const head = (title, cur) => `
    <div class="tp-head">
      <div class="tp-pagetitle">${title}</div>
      <div class="tp-pills">
        <span class="tp-pill ${cur === 'packing' ? 'on' : ''}">☰ Packliste</span>
        <span class="tp-pill ${cur === 'shopping' ? 'on' : ''}">🛒 Einkaufen 3</span>
        <span class="tp-pill ${cur === 'tasks' ? 'on' : ''}">✓ Aufgaben 5</span>
      </div>
    </div>`

/** One figure of a header line: ring, headline, detail, track (FR-21.23). */
const fig = ({ p, head: h, detail = '', c = 'var(--teal)' }) => `
      <div class="tp-fig">
        <div class="ring" style="--p:${p};--c:${c}"><span>${Math.round(p)}</span></div>
        <div class="tp-figtext">
          <b>${h}</b>
          ${detail ? `<small>${detail}</small>` : ''}
          <div class="progress"><i style="width:${p}%;background:${c}"></i></div>
        </div>
      </div>`

const headline = (...figs) => `<div class="tp-headline">${figs.join('')}</div>`

/** FR-7.6's chip: the packing row a preparation belongs to, and the door into it. */
const rowChip = (name, mark = '') => `<span class="chip tp-chip">${mark} ${name}</span>`
/** FR-7.5's seat: whose job a task is, or the empty seat. */
const seat = (who, colour = 'var(--mauve)') =>
  who
    ? `<span class="avatar tp-seat" style="background:${colour}">${who}</span>`
    : `<span class="tp-seat empty"></span>`

/**
 * A task line. `sub` is the provenance line this round is deciding on; `end`
 * is what stands before the tick, which is always at the row's own edge.
 */
const task = ({ body, sub = '', end = '', done = false, sel = false }) => `
        <div class="tp-task ${done ? 'done' : ''} ${sel ? 'sel' : ''}">
          <div class="tp-grow">
            <div class="tp-body">${body}</div>
            ${sub ? `<div class="tp-sub">${sub}</div>` : ''}
          </div>
          <div class="tp-end">${end}</div>
          <div class="check ${done ? 'on' : ''}">${done ? '✓' : ''}</div>
        </div>`

const composer = (hint = 'Aufgabe hinzufügen…') => `
        <div class="tp-composer"><span>${hint}</span><b>Hinzufügen</b></div>`

/** A section head inside a screen: name, count, caret. */
const secHead = (line, { done = false, shut = false } = {}) => `
        <div class="tp-sechead ${done ? 'ok' : ''}">
          <span class="tp-ico">✓</span>
          <span class="grow">${line}</span>
          <span class="car ${shut ? 'shut' : ''}">⌄</span>
        </div>`

/* --- the trip's six tasks, once ----------------------------------------- */

const SALBE = 'Salbe in der Apotheke holen'
const TRAIN = 'Zugverbindung nach Pontresina abklären'
const PLANTS = 'Pflanzen giessen'
const POST = 'Post umleiten'
const FRIDGE = 'Kühlschrank leeren'
const AKKU = 'Kamera-Akkus laden'

/* ====================================================================== *
 * Decided — what the two screens are
 * ====================================================================== */

const DECIDED_TASKS = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Aufgaben', 'tasks')}
    ${headline(fig({ p: 33, head: '2/6 Aufgaben', detail: '4 offen', c: 'var(--green)' }))}
    <div class="tp-sec">
      ${secHead('Vor der Reise · 2 offen')}
      ${task({ body: PLANTS, sub: 'Andy · Mi · Sia', end: seat('S') })}
      ${task({ body: POST, sub: 'Andy · Mi', end: seat('') })}
    </div>
    <div class="tp-sec">
      ${secHead('Während der Reise · 2 offen')}
      ${task({ body: TRAIN, sub: 'Sia · gestern', end: seat('') })}
      ${task({
        body: SALBE,
        sub: 'Andy · Mi · verschoben',
        end: rowChip('Reiseapotheke', '💊') + seat('A', 'var(--peach)'),
      })}
    </div>
    <div class="tp-fold">2 erledigt</div>
    ${composer()}
  </div>`)

const DECIDED_PACKING = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Packliste', 'packing')}
    ${headline(
      fig({ p: 87, head: '84/96 gepackt', detail: '18 kg' }),
      fig({ p: 50, head: '1/2 beim Packen', detail: '1 offen', c: 'var(--green)' }),
    )}
    <div class="tp-sec">
      ${secHead('Beim Packen zu erledigen · 1 von 2')}
      ${task({ body: AKKU, sub: 'Andy · Mi', end: rowChip('Kamera', '📷') + seat('A', 'var(--peach)') })}
      ${task({ body: 'Wanderschuhe imprägnieren', sub: 'Sia · Do · Andy', end: rowChip('Wanderschuhe', '🥾') + seat('A', 'var(--peach)'), done: true })}
      <div class="tp-later plain">4 weitere Aufgaben der Reise <span>Aufgaben ›</span></div>
    </div>
    <div class="grouphead">Kleidung<span class="n">6/8</span></div>
    <div class="card">
      <div class="li"><div class="check"></div><div class="grow"><div class="name">Regenjacke</div></div></div>
      <div class="li"><div class="check on">✓</div><div class="grow"><div class="name">Wandersocken</div>
        <div class="desc">6 von 6 gepackt</div></div></div>
    </div>
  </div>`)

/* ====================================================================== *
 * Question 1 — what M4 keeps
 * ====================================================================== */

const Q1A = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Packliste', 'packing')}
    ${headline(
      fig({ p: 87, head: '84/96 gepackt', detail: '18 kg' }),
      fig({ p: 50, head: '1/2 beim Packen', detail: '1 offen', c: 'var(--green)' }),
    )}
    <div class="tp-sec">
      ${secHead('Beim Packen zu erledigen · 1 von 2')}
      ${task({ body: AKKU, sub: 'Andy · Mi', end: rowChip('Kamera', '📷') + seat('A', 'var(--peach)') })}
      ${task({ body: 'Wanderschuhe imprägnieren', end: rowChip('Wanderschuhe', '🥾') + seat('S'), done: true })}
      <div class="tp-later plain">4 weitere Aufgaben der Reise <span>Aufgaben ›</span></div>
    </div>
    <div class="tp-note">Nur was an einer Zeile hängt. „Pflanzen giessen“ steht hier nicht — es wird
      nicht gepackt.</div>
  </div>`)

const Q1B = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Packliste', 'packing')}
    ${headline(
      fig({ p: 87, head: '84/96 gepackt', detail: '18 kg' }),
      fig({ p: 25, head: '1/4 vor der Reise', detail: '3 offen', c: 'var(--green)' }),
    )}
    <div class="tp-sec">
      ${secHead('Vor der Reise zu erledigen · 1 von 4')}
      ${task({ body: AKKU, end: rowChip('Kamera', '📷') + seat('A', 'var(--peach)') })}
      ${task({ body: PLANTS, end: seat('S') })}
      ${task({ body: POST, end: seat('') })}
      <div class="tp-later plain">2 für unterwegs <span>Aufgaben ›</span></div>
    </div>
    <div class="tp-note">Alles, was vor der Abreise fällig ist — auch das, was mit Packen nichts zu
      tun hat.</div>
  </div>`)

const Q1C = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Packliste', 'packing')}
    ${headline(fig({ p: 87, head: '84/96 gepackt', detail: '18 kg · 1 Aufgabe offen' }))}
    <div class="grouphead">Kleidung<span class="n">6/8</span></div>
    <div class="card">
      <div class="li"><div class="check"></div><div class="grow"><div class="name">Regenjacke</div></div></div>
      <div class="li"><div class="check on">✓</div><div class="grow"><div class="name">Wandersocken</div>
        <div class="desc">6 von 6 gepackt</div></div></div>
    </div>
    <div class="grouphead">Technik<span class="n">3/4</span></div>
    <div class="card">
      <div class="li"><div class="check"></div><div class="grow"><div class="name">Kamera</div>
        <div class="desc">⚑ Akkus laden · offen</div></div></div>
    </div>
    <div class="tp-note">Kein Abschnitt: die Vorbereitung steht an ihrer Zeile, wie vor FR-7.6.</div>
  </div>`)

/* ====================================================================== *
 * Question 2 — how M25 is organised
 * ====================================================================== */

const Q2A = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Aufgaben', 'tasks')}
    ${headline(fig({ p: 33, head: '2/6 Aufgaben', detail: '4 offen', c: 'var(--green)' }))}
    <div class="tp-sec">
      ${secHead('Vor der Reise · 2 offen')}
      ${task({ body: PLANTS, sub: 'Andy · Mi', end: seat('S') })}
      ${task({ body: POST, sub: 'Andy · Mi', end: seat('') })}
    </div>
    <div class="tp-sec">
      ${secHead('Während der Reise · 2 offen')}
      ${task({ body: TRAIN, sub: 'Sia · gestern', end: seat('') })}
      ${task({ body: SALBE, sub: 'Andy · Mi', end: rowChip('Reiseapotheke', '💊') + seat('A', 'var(--peach)') })}
    </div>
    <div class="tp-sec">
      ${secHead('Erledigt · 2', { shut: true, done: true })}
    </div>
    ${composer()}
  </div>`)

const Q2B = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Aufgaben', 'tasks')}
    <div class="seg tp-seg">
      <button class="sel">Vor der Reise (2)</button>
      <button>Unterwegs (2)</button>
    </div>
    ${headline(fig({ p: 50, head: '2/4 vor der Reise', detail: '2 offen', c: 'var(--green)' }))}
    <div class="tp-sec">
      ${task({ body: PLANTS, sub: 'Andy · Mi', end: seat('S') })}
      ${task({ body: POST, sub: 'Andy · Mi', end: seat('') })}
      <div class="tp-fold">2 erledigt</div>
    </div>
    ${composer()}
    <div class="tp-note">M6s Grammatik, eine Tür weiter: ein Segment, eine Liste, ein Feld.</div>
  </div>`)

const Q2C = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Aufgaben', 'tasks')}
    ${headline(fig({ p: 33, head: '2/6 Aufgaben', detail: '4 offen', c: 'var(--green)' }))}
    <div class="tp-filters">
      <span class="chip blue">Alle 6</span><span class="chip">Vorher 2</span>
      <span class="chip">Unterwegs 2</span><span class="chip">Meine 3</span>
    </div>
    <div class="tp-sec">
      ${task({ body: PLANTS, sub: 'Vorher · Andy · Mi', end: seat('S') })}
      ${task({ body: POST, sub: 'Vorher · Andy · Mi', end: seat('') })}
      ${task({ body: TRAIN, sub: 'Unterwegs · Sia · gestern', end: seat('') })}
      ${task({ body: SALBE, sub: 'Unterwegs · Andy · Mi', end: rowChip('Reiseapotheke', '💊') + seat('A', 'var(--peach)') })}
      ${task({ body: FRIDGE, sub: 'Vorher · Andy · Mi · erledigt von Sia, heute', end: seat('S'), done: true })}
      <div class="tp-fold">1 weitere erledigt</div>
    </div>
    ${composer()}
  </div>`)

/* ====================================================================== *
 * Question 3 — how much history stands on the line
 * ====================================================================== */

const Q3A = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Aufgaben', 'tasks')}
    <div class="tp-sec">
      ${secHead('Vor der Reise · 2 offen')}
      ${task({ body: PLANTS, end: seat('S') })}
      ${task({ body: POST, end: seat('') })}
      ${secHead('Erledigt · 2', { done: true })}
      ${task({ body: FRIDGE, end: seat('S'), done: true })}
      ${task({ body: AKKU, end: rowChip('Kamera', '📷'), done: true })}
    </div>
    <div class="tp-note">Die Zeile bleibt eine Zeile. Wer und wann steht im Blatt, das ein Tipp
      öffnet.</div>
  </div>`)

const Q3B = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Aufgaben', 'tasks')}
    <div class="tp-sec">
      ${secHead('Vor der Reise · 2 offen')}
      ${task({ body: PLANTS, sub: 'Andy · Mi', end: seat('S') })}
      ${task({ body: POST, sub: 'Andy · Mi', end: seat('') })}
      ${secHead('Erledigt · 2', { done: true })}
      ${task({ body: FRIDGE, sub: 'Sia · heute 08:12', end: seat('S'), done: true })}
      ${task({ body: AKKU, sub: 'Andy · gestern 19:40', end: rowChip('Kamera', '📷'), done: true })}
    </div>
    <div class="tp-note">Eine Unterzeile, die ihre Rolle wechselt: offen zeigt sie die Herkunft,
      erledigt den Abschluss.</div>
  </div>`)

const Q3C = phone(`
  ${appbar()}
  <div class="body tp-body-pad">
    ${head('Aufgaben', 'tasks')}
    <div class="tp-sec">
      ${secHead('Vor der Reise · 2 offen')}
      ${task({ body: PLANTS, sub: 'Erstellt Andy · Mi 21:04', end: seat('S') })}
      ${task({ body: POST, sub: 'Erstellt Andy · Mi 21:05', end: seat('') })}
      ${secHead('Erledigt · 2', { done: true })}
      ${task({
        body: FRIDGE,
        sub: 'Erstellt Andy · Mi 21:06<br />Erledigt Sia · heute 08:12',
        end: seat('S'),
        done: true,
      })}
    </div>
    <div class="tp-note">Alles auf der Zeile. Vier Zeilen füllen den Screen, den die Liste selbst
      bräuchte.</div>
  </div>`)

/* The sheet Q3-A and Q3-B lean on. ---------------------------------------- */

const SHEET = phone(`
  ${appbar()}
  <div class="body tp-body-pad tp-dim">
    ${head('Aufgaben', 'tasks')}
    <div class="tp-sec">
      ${secHead('Vor der Reise · 2 offen')}
      ${task({ body: PLANTS, sub: 'Andy · Mi', end: seat('S'), sel: true })}
      ${task({ body: POST, sub: 'Andy · Mi', end: seat('') })}
    </div>
  </div>
  <div class="tp-scrim"></div>
  <div class="tp-sheet">
    <div class="handle"></div>
    <div class="tp-sheet-body">
      <div class="tp-sheet-h">Pflanzen giessen</div>
      <div class="tp-srow"><span class="l">Wann</span>
        <span class="tp-toggle"><b class="sel">Vor der Reise</b><b>Unterwegs</b></span></div>
      <div class="tp-srow"><span class="l">Wer</span>
        <span class="tp-val">${seat('S')} Sia</span></div>
      <div class="tp-srow"><span class="l">Gehört zu</span>
        <span class="tp-val tp-muted">keiner Packzeile</span></div>
      <div class="tp-hist">
        <div><b>Erstellt</b> Andy · Mi, 21:04</div>
        <div><b>Erledigt</b> —</div>
      </div>
      <div class="tp-btns"><button class="tp-primary">Erledigt</button>
        <button class="tp-ghost">Entfernen</button></div>
    </div>
  </div>`)

/* ====================================================================== *
 * Question 4 — the pill row
 * ====================================================================== */

const Q4A = `
  <div class="tp-strip">
    <div class="tp-pills wide">
      <span class="tp-pill on">☰ Packliste</span>
      <span class="tp-pill">🛒 Einkaufen 3</span>
      <span class="tp-pill">✓ Aufgaben 5</span>
    </div>
  </div>`

const Q4B = `
  <div class="tp-strip">
    <div class="tp-pills wide">
      <span class="tp-pill on">☰ Packliste</span>
      <span class="tp-pill">🛒 Einkaufen 3</span>
      <span class="tp-pill">✓ 5</span>
    </div>
  </div>`

const Q4C = `
  <div class="tp-strip">
    <div class="tp-pills wide">
      <span class="tp-pill on">☰ Packliste</span>
      <span class="tp-pill">🛒 Einkaufen 3</span>
    </div>
    <div class="tp-menu">⋮ <span>Aufgaben · Gepäck · Auswertung</span></div>
  </div>`

/* ====================================================================== *
 * M1 — what the dashboard does with two places
 * ====================================================================== */

const M1 = phone(`
  <div class="tp-bar"><span class="tp-title">Überblick</span><span class="tp-icons">⛭</span></div>
  <div class="body tp-body-pad">
    <div class="card tp-hero">
      <div class="tp-eyebrow">Läuft · noch 6 Tage</div>
      <div class="tp-heroname">Samedan 2026</div>
      ${headline(
        fig({ p: 100, head: '96/96 gepackt' }),
        fig({ p: 33, head: '2/6 Aufgaben', detail: '4 offen', c: 'var(--green)' }),
      )}
    </div>
    <div class="card tp-card">
      <div class="tp-cardhead">Aufgaben · Samedan 2026</div>
      ${task({ body: TRAIN, sub: 'unterwegs · Sia', end: '' })}
      ${task({ body: SALBE, sub: 'unterwegs · Andy', end: rowChip('Reiseapotheke', '💊') })}
      <div class="tp-later plain">2 von vor der Reise offen <span>öffnen ›</span></div>
    </div>
  </div>`)

/* --- the sheet ---------------------------------------------------------- */

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
.qhead .q.dec{color:var(--green)}
.qhead p{margin:8px 0 0;color:var(--sub0);font-size:14px;line-height:1.62}
.qhead em{color:var(--rose);font-style:italic}
.qhead b{color:var(--text)}
.qhead code{font-size:12.5px;color:var(--peach)}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:26px;align-items:start}
.vgrid.three{grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.vcol{display:flex;flex-direction:column;gap:12px;min-width:0}
.vcap .k{font:600 11.5px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--peach)}
.vcap .k.ok{color:var(--green)}
.vcap h3{font:600 17px/1.25 var(--display);margin:7px 0 6px}
.vcap p{margin:0 0 6px;color:var(--sub0);font-size:13px;line-height:1.55}
.vcap em{color:var(--rose);font-style:italic}
.vcap code{font-size:12px;color:var(--peach)}
.vcap .cost{color:var(--peach);font-size:12.5px}
.vcap .cost.bad{color:var(--red)}
.vcap .win{color:var(--green);font-size:12.5px}

.phone{width:100%;max-width:380px;height:628px;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
.phone .body{flex:1;overflow:hidden;padding:10px 13px;position:relative;display:flex;flex-direction:column;gap:2px}
.phone .card{border-radius:14px;overflow:hidden}
.tp-body-pad{gap:8px}
.tp-dim{filter:saturate(.72)}
.tp-bar{flex:none;display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid var(--s0);
  background:var(--crust)}
.tp-back{color:var(--o1);font-size:19px;line-height:1}
.tp-title{font:600 15px/1.2 var(--display);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.tp-icons{font-size:13px;color:var(--o1);letter-spacing:.06em;flex:none}

.tp-head{padding:6px 2px 2px}
.tp-pagetitle{font:600 21px/1.15 var(--display)}
.tp-pills{display:flex;gap:6px;margin-top:9px;overflow:hidden}
.tp-pill{flex:none;padding:6px 10px;border-radius:999px;background:var(--mantle);border:1px solid var(--s0);
  font-size:11.5px;font-weight:600;color:var(--sub0);white-space:nowrap}
.tp-pill.on{background:var(--s1);border-color:var(--s2);color:var(--text)}

.tp-headline{display:flex;gap:14px;align-items:flex-start;padding:8px 2px 4px}
.tp-fig{display:flex;gap:9px;align-items:center;flex:1;min-width:0}
.tp-fig .ring{width:40px;height:40px}
.tp-fig .ring span{font-size:10px}
.tp-figtext{min-width:0;flex:1}
.tp-figtext b{display:block;font-size:12.5px;font-weight:600;color:var(--sub1);font-variant-numeric:tabular-nums;
  white-space:nowrap}
.tp-figtext small{display:block;font-size:11px;color:var(--o0);margin-top:1px}
.tp-figtext .progress{margin-top:5px;height:6px}

.tp-sec{border-radius:16px;background:var(--base);border:1px solid var(--s0);padding:4px 0 6px;flex:none}
.tp-sechead{display:flex;align-items:center;gap:8px;padding:10px 12px 8px;font-size:13px;font-weight:600;
  color:var(--sub1)}
.tp-sechead .grow{flex:1;min-width:0}
.tp-sechead.ok{color:var(--green)}
.tp-sechead .tp-ico{color:var(--green);font-size:12px}
.tp-sechead .car{color:var(--o0);font-size:13px}
.tp-sechead .car.shut{transform:rotate(-90deg);display:inline-block}

.tp-task{display:flex;align-items:center;gap:8px;padding:7px 12px;min-height:38px}
.tp-grow{flex:1;min-width:0}
.tp-task .tp-body{font-size:13.5px;color:var(--text);line-height:1.3}
.tp-task .tp-sub{font-size:11px;color:var(--o0);margin-top:2px;line-height:1.35}
.tp-task.done .tp-body{color:var(--o1);text-decoration:line-through}
.tp-task.sel{background:rgba(137,180,250,.10);border-radius:10px}
.tp-task .tp-end{display:flex;align-items:center;gap:6px;flex:none;max-width:52%}
.tp-task .check{width:24px;height:24px;flex:none}
.tp-chip{flex:none;max-width:132px;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.tp-seat{width:24px;height:24px;font-size:10px;flex:none}
.tp-seat.empty{border:1px dashed var(--s2);background:none;border-radius:50%;display:inline-block}
.tp-fold{padding:7px 14px;font-size:12px;color:var(--sub0)}
.tp-filters{display:flex;gap:6px;padding:2px 2px 4px;overflow:hidden}
.tp-filters .chip{flex:none}
.tp-composer{display:flex;align-items:center;gap:8px;margin:4px 2px 2px;padding:10px 12px;border-radius:12px;
  background:var(--s0);font-size:12.5px;color:var(--o0)}
.tp-composer span{flex:1;min-width:0}
.tp-composer b{color:var(--blue);font-size:12px}
.tp-toggle{display:flex;gap:4px;flex:none}
.tp-toggle b{padding:5px 9px;border-radius:8px;background:var(--s1);color:var(--sub0);font-size:11px}
.tp-toggle b.sel{background:var(--blue);color:var(--crust)}
.tp-seg{margin:6px 2px 2px}
.tp-seg button{font-size:11.5px}
.tp-later{display:flex;align-items:center;gap:8px;margin:6px 12px 2px;padding:9px 11px;border-radius:11px;
  border:1px dashed var(--s1);font-size:12px;color:var(--sub0)}
.tp-later span{margin-left:auto;color:var(--blue);font-weight:600}
.tp-later.plain{border:0;padding:7px 0;margin:0 12px}

.tp-scrim{position:absolute;inset:0;background:rgba(17,17,27,.55);z-index:20}
.tp-sheet{position:absolute;left:0;right:0;bottom:0;z-index:21;background:var(--mantle);
  border-radius:22px 22px 0 0;border-top:1px solid var(--s1);box-shadow:0 -16px 40px rgba(0,0,0,.62)}
.tp-sheet .handle{width:42px;height:5px;border-radius:3px;background:var(--s2);margin:10px auto 2px}
.tp-sheet-body{padding:8px 16px 20px}
.tp-sheet-h{font:600 17px/1.25 var(--display);margin:6px 2px 12px}
.tp-srow{display:flex;align-items:center;gap:10px;padding:9px 2px;border-top:1px solid var(--s0);font-size:12.5px}
.tp-srow .l{width:82px;flex:none;color:var(--o0)}
.tp-srow .tp-val{display:flex;align-items:center;gap:7px;color:var(--text)}
.tp-muted{color:var(--o0)}
.tp-hist{margin:12px 0 14px;padding:11px 12px;border-radius:12px;background:var(--base);border:1px solid var(--s0);
  display:grid;gap:6px;font-size:12px;color:var(--sub0)}
.tp-hist b{color:var(--o1);font-weight:600;margin-right:6px}
.tp-btns{display:flex;align-items:center;gap:10px}
.tp-primary{flex:1;border:0;border-radius:13px;padding:12px 14px;background:var(--green);color:var(--crust);
  font:600 13.5px/1 var(--ui)}
.tp-ghost{border:0;background:none;color:var(--sub0);font:600 13px/1 var(--ui);padding:12px 6px}
.tp-note{font-size:12px;color:var(--o0);padding:10px 2px;line-height:1.5;margin-top:auto}
.tp-hero{padding:12px 13px 10px;background:var(--base);border:1px solid var(--s0)}
.tp-eyebrow{font:600 10.5px/1 var(--ui);letter-spacing:.14em;text-transform:uppercase;color:var(--peach)}
.tp-heroname{font:600 19px/1.2 var(--display);margin:8px 0 2px}
.tp-card{padding:10px 2px 8px;background:var(--base);border:1px solid var(--s0)}
.tp-cardhead{font:600 12px/1 var(--ui);letter-spacing:.09em;text-transform:uppercase;color:var(--o1);
  padding:2px 12px 8px}
.tp-strip{width:100%;max-width:390px;border:1px solid var(--s0);border-radius:18px;background:var(--mantle);
  padding:12px 13px}
.tp-pills.wide{overflow:hidden}
.tp-menu{margin-top:10px;font-size:12px;color:var(--o0)}
.tp-menu span{color:var(--sub0)}

.shared{margin-top:44px;max-width:82ch}
.shared h2{font:600 21px/1.2 var(--display);margin:0 0 10px}
.shared h3{font:600 15px/1.2 var(--ui);margin:24px 0 6px}
.shared p{color:var(--sub0);font-size:14px;line-height:1.65;margin:0 0 10px}
.shared b{color:var(--text)}
.shared em{color:var(--rose);font-style:italic}
.shared code{font-size:12.5px;color:var(--peach)}
.shared ul{margin:0 0 12px;padding-left:20px;color:var(--sub0);font-size:14px;line-height:1.65}
.shared li{margin-bottom:5px}
.sidebyside{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,380px);gap:26px;align-items:start;
  max-width:1000px}
.tablewrap{overflow-x:auto;margin:14px 0 0}
table.cmp{border-collapse:collapse;font-size:13.5px;width:100%;min-width:560px}
table.cmp th,table.cmp td{border-top:1px solid var(--s0);padding:9px 10px;text-align:left;
  color:var(--sub0);vertical-align:top}
table.cmp th{color:var(--text);font:600 12px/1 var(--ui);letter-spacing:.06em;text-transform:uppercase}
table.cmp td:first-child{color:var(--text);white-space:nowrap}
@media (max-width:900px){.sidebyside{grid-template-columns:minmax(0,1fr)}}
@media (max-width:560px){.phone{height:590px}}`

const body = `<div class="vwrap">
  <div class="vhead">
    <div class="k">Owner request · 2026-09-20 · second reading</div>
    <h1>The trip's tasks get a screen — and packing keeps the ones it does</h1>
    <p><b>What was decided.</b> Tasks are their own place, <em>neben Packliste und Einkaufsliste</em>.
      The ones you do <b>while packing</b> stay on the packing list, because that is when they happen.
      A task can be <b>handed to somebody</b>, the way a packing row can. And a task carries its
      <b>history</b>: who wrote it and when, who finished it and when.</p>
    <p><b>What is still open</b> are the four questions below: what exactly the packing list keeps, how
      the new screen is organised, how much of the history stands on a line, and what happens to the
      row of pills under the trip's name — which was measured down to two only this morning.</p>
    <p><b>Not in scope, by the owner's ruling:</b> the shopping list. M6 keeps its own two lists
      (FR-30) and nothing here reads or writes them. That is also why the phase wording is
      <em>„Vor der Reise“ / „Während der Reise“</em> and not M6's <em>„Vor der Abreise“ / „Vor Ort“</em>
      — two separate features that happen to divide the same journey.</p>
    <p>Every phone shows the same trip, <b>Samedan 2026</b>: six tasks. Two hang off packing rows
      (<em>Kamera-Akkus laden</em>, and the one that started this — <em>Salbe in der Apotheke holen</em>,
      which belongs to the row <em>Reiseapotheke</em>); two are the household's chores; one was written
      for the road (<em>Zugverbindung abklären</em>); two are already done.</p>
  </div>

  <div class="qhead">
    <div class="q dec">Decided</div>
    <h2>Two screens, one list underneath</h2>
    <p>The tasks are <b>one list in the data</b> — every task is a <code>comments</code> row with
      <code>is_task=1</code>, as both kinds already are (FR-7.3/7.4/7.6). What changes is that the list
      gets <b>two windows</b>: its own screen, which shows all of it, and the packing list, which shows
      the part that is packing work. No task lives in only one of them by a rule of its own; the window
      decides what it lets through.</p>
  </div>
  <div class="vgrid">
    <div class="vcol">
      <div class="vcap">
        <div class="k ok">The new screen · M25</div>
        <h3><em>Aufgaben</em>, beside the packing and shopping lists</h3>
        <p>Every task of the trip, split by phase, each with its assignee, its history and — where it
          prepares a packing row — that row's chip. Written here, ticked here, handed over here.</p>
      </div>
      ${DECIDED_TASKS}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k ok">The window · M4</div>
        <h3>The packing list keeps what packing owes</h3>
        <p>The section narrows to the tasks that hang off a row and are due before departure — with one
          line at its foot naming what is elsewhere. The second figure counts <em>that</em> window, not
          the trip's whole task list.</p>
      </div>
      ${DECIDED_PACKING}
    </div>
  </div>

  <div class="qhead">
    <div class="q">Question 1</div>
    <h2>What exactly does the packing list keep?</h2>
    <p>FR-7.6 put <b>every</b> task in M4's section this morning, on the argument that a preparation and
      a chore are the same thing to the person doing them. A screen of their own answers that argument
      differently, and the question is how far M4 steps back.</p>
  </div>
  <div class="vgrid">
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant A</div>
        <h3>Only what hangs off a row</h3>
        <p>A task with a chip, still due before departure. <em>„Pflanzen giessen“</em> is not packing
          work and is not here; <em>„Salbe holen“</em> is, until it is moved to <em>unterwegs</em> —
          then it leaves, which is what moving it means.</p>
        <p class="win">Wins: one rule, and it is the owner's sentence — <em>im Rahmen des Packens</em>.
          The section's count and the figure beside it measure the packing screen's own job.</p>
        <p class="cost">Cost: a before-chore is now <b>only</b> on M25. Somebody who never opens that
          screen will not water the plants.</p>
      </div>
      ${Q1A}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant B</div>
        <h3>Everything due before departure</h3>
        <p>The phase decides, not the chip: every before-task stands in M4, the during ones are on M25.
          Close to today's section, minus the road.</p>
        <p class="win">Wins: nothing that has to happen before you leave can hide on a second screen,
          and M4 stays the one place you open while getting ready.</p>
        <p class="cost bad">Cost: then the new screen is a filter, not a place — it shows what M4
          already showed plus two lines. The request asked for a place.</p>
      </div>
      ${Q1B}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant C</div>
        <h3>Nothing — the row carries its own</h3>
        <p>No section on M4 at all. A row with an open preparation says so on its own line (the state
          before FR-7.4, FR-7.3's original shape), and the tasks screen is the only list.</p>
        <p class="win">Wins: the packing list gets its band back, and there is exactly one place a task
          is read as a task.</p>
        <p class="cost bad">Cost: the reason FR-7.4 moved the section above the list was that at the
          foot it went unseen — a mark on a row is less than that, not more. And a preparation whose
          row you have not scrolled to is invisible while packing.</p>
      </div>
      ${Q1C}
    </div>
  </div>

  <div class="qhead">
    <div class="q">Question 2</div>
    <h2>How is the new screen organised?</h2>
    <p>M25 stands next to M6, so its grammar is read against M6's: a segment, one list, one field. But
      unlike a shopping list, a task list is read for <em>what is mine and what is left</em>, and it now
      carries two more facts per line — a person and a history.</p>
  </div>
  <div class="vgrid">
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant A</div>
        <h3>Two sections, and a third for what is done</h3>
        <p>Both phases visible at once, resolved folded away under its own head. The screen is a
          document you read top to bottom.</p>
        <p class="win">Wins: the whole trip in one scroll, and moving a task between the two is a move
          you can see happen.</p>
        <p class="cost">Cost: on a long trip the second phase is below the fold, and the composer is
          far from the section you were reading.</p>
      </div>
      ${Q2A}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant B</div>
        <h3>A segment, like the shopping list next door</h3>
        <p>One phase at a time, the count on the other tab, the figure measuring the open tab. The
          composer writes into the tab you are on — nothing to choose.</p>
        <p class="win">Wins: the two screens beside each other work the same way, and the line has room
          for the seat and the history.</p>
        <p class="cost">Cost: half the list is always hidden, and the crossing of a task (Q2 of the
          first round) happens between two tabs, where it cannot be watched.</p>
      </div>
      ${Q2B}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant C</div>
        <h3>One list, filter chips above it</h3>
        <p>Everything in one order, with <em>Alle · Vorher · Unterwegs · Meine</em> as chips — M4's own
          facet idiom, one screen over. The phase is a word on the line.</p>
        <p class="win">Wins: <em>Meine</em> — the one question a household asks that neither other
          variant can answer, now that a task has an assignee.</p>
        <p class="cost">Cost: a third control band above a list that also has a figure and a composer;
          and a filter is a state the screen remembers or forgets, either of which surprises somebody.</p>
      </div>
      ${Q2C}
    </div>
  </div>

  <div class="qhead">
    <div class="q">Question 3</div>
    <h2>How much of the history stands on the line?</h2>
    <p>Four facts are being asked for: <b>who wrote it, when, who finished it, when</b>. They are two
      pairs, and only one pair is ever the answer to a question somebody actually has — which is the
      argument for not printing both.</p>
  </div>
  <div class="vgrid">
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant A</div>
        <h3>Nothing on the line, everything in the sheet</h3>
        <p>The list stays one line per task; a tap opens the task's sheet, where the four facts stand
          in full, beside the phase and the assignee.</p>
        <p class="win">Wins: the densest list, and the sheet is needed anyway — the phase, the
          assignment and the deletion have to live somewhere once a line is full.</p>
        <p class="cost">Cost: <em>„wer hat das abgehakt?“</em> is one tap per task, and that is the
          question a shared list raises most often.</p>
      </div>
      ${Q3A}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant B</div>
        <h3>One sub-line that changes its job</h3>
        <p>Open: who wrote it and when. Resolved: who finished it and when. The line answers the
          question its state raises, and the sheet holds all four.</p>
        <p class="win">Wins: the shared list's question is answered where it is asked, at the cost of
          one small line — the same shape a packing row's sub-line already has.</p>
        <p class="cost">Cost: the fact that is not shown is genuinely invisible until the sheet is
          opened, and the two states show different things in the same place.</p>
      </div>
      ${Q3B}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant C</div>
        <h3>Both pairs on the line</h3>
        <p>Created and resolved, always, each on its own line under the task.</p>
        <p class="win">Wins: nothing is hidden, and an audit reads off the list.</p>
        <p class="cost bad">Cost: a resolved task is three lines tall. Four tasks fill the screen the
          list itself needs, and the thing you came to read — what is still open — is pushed below
          what is finished.</p>
      </div>
      ${Q3C}
    </div>
  </div>

  <div class="sidebyside" style="margin-top:34px">
    <div class="vcap">
      <div class="k">The sheet A and B lean on</div>
      <h3>One task, opened</h3>
      <p>The phase as a toggle, the seat as the picker a packing row uses (FR-25.25), the row it
        belongs to (or that it belongs to none), and the history as a block of two lines — the shape
        M5 already uses for <em>„gepackt von … am …“</em> (FR-25.17).</p>
      <p>It is also where the two things a line cannot hold live: <b>editing the text</b> and
        <b>removing</b> the task. This is the piece that makes variant A of question 3 affordable.</p>
      <p class="cost">In Local Mode and Single-User Mode the <em>who</em> is dropped and the
        <em>when</em> stays (G-8): there is only one person, and naming them on every line is noise.</p>
    </div>
    ${SHEET}
  </div>

  <div class="qhead">
    <div class="q">Question 4</div>
    <h2>The pill row was measured at two this morning</h2>
    <p>ADR-051 amendment 1 (today) took the luggage and the analytics out of the switcher because four
      pills filled a 390 px line to within six pixels, and left the two views a trip is <em>worked</em>
      in. A tasks screen is a third view that is worked in daily — so it belongs in that row by the
      amendment's own reasoning, and the row has to be measured again.</p>
  </div>
  <div class="vgrid three">
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant A</div>
        <h3>Three words</h3>
        <p><em>Packliste · Einkaufen 3 · Aufgaben 5</em> — the row scrolls rather than wraps, so it
          fits; the question is whether the third pill is still readable at 360 px.</p>
        <p class="win">Wins: says where you are and where you can go, in words, for all three.</p>
        <p class="cost">Cost: the row is full. A fourth view would have to displace one.</p>
      </div>
      ${Q4A}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant B</div>
        <h3>Three, the last one short</h3>
        <p>The tasks pill is a glyph and a count while it is not current, and takes its word back when
          it is.</p>
        <p class="win">Wins: fits at 360 px without scrolling.</p>
        <p class="cost bad">Cost: a pill that changes its name depending on where you stand is the one
          thing the switcher must not do — it stops being a map.</p>
      </div>
      ${Q4B}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant C</div>
        <h3>Two pills, tasks in the ⋮</h3>
        <p>The switcher stays as amendment 1 left it, and the new screen joins the luggage and the
          analytics behind the bar's menu.</p>
        <p class="win">Wins: nothing to re-measure, and today's decision stands unamended.</p>
        <p class="cost bad">Cost: it contradicts the request. A screen reached through a menu is not
          <em>neben</em> the packing list, and the open-task count — the reason to go there — would be
          invisible.</p>
      </div>
      ${Q4C}
    </div>
  </div>

  <div class="shared">
    <h2>What M1 does with two places</h2>
    <div class="sidebyside">
      <div>
        <p>M1 reports and takes no actions (FR-7.4). With a screen of their own the tasks keep their
          card, and the card's job narrows to <b>what is due now</b>: a running trip leads with the
          road, a trip still being packed leads with the packing work. What is not due is one line at
          the foot, and both lead into M25 rather than into the packing list.</p>
        <p>The hero keeps the pair of figures — the packing share and, beside it, the trip's tasks.
          <b>That figure counts every task</b>, both phases, because the dashboard is not standing in
          either window; M4's figure is the one that counts a window (the <em>Decided</em> pair above).
          Two figures with two scopes is the cost, and naming them differently is how it is paid:
          <em>„1/2 beim Packen“</em> on M4, <em>„2/6 Aufgaben“</em> on M1.</p>
      </div>
      ${M1}
    </div>

    <h2>The data model</h2>
    <p>Everything is still <code>comments</code> — one table, one partition, one merge (ADR-022). Four
      columns are added or newly written:</p>
    <ul>
      <li><code>phase TEXT CHECK (phase IN ('before','during'))</code>, nullable, <code>NULL</code> =
        <em>before</em>. Nullable and free of a cross-field CHECK for the reason
        <code>assignee_user_id</code> is (FR-7.5): field-level LWW merges one field at a time, and a
        constraint that can refuse a single-field mutation loses the user's choice.</li>
      <li><code>resolved_at</code> and <code>resolved_by_user_id</code> — the task's counterpart of
        <code>packed_at</code> / <code>packed_by_user_id</code>. <b>Server-stamped</b>
        (<code>stampActor</code>, invariant 3): a record of who did something is not a field a client
        may pick. The <em>when</em> may be named by the client, exactly as FR-25.17 allows for packing,
        because a tick happens offline and pushes days later. Unticking clears both.</li>
      <li><code>author_id</code> and <code>created_at</code> already exist and are already stamped —
        they were simply never shown.</li>
      <li><code>assignee_user_id</code> exists too, and is now written for <b>every</b> task, not only
        the trip's own. This reverses FR-7.5's one exclusion (<em>a preparation names nobody, its row
        already does</em>) on the owner's request: with a screen where a task is a thing in its own
        right, the row's packer and the errand's owner are genuinely two people — whoever passes the
        Apotheke fetches the salve.</li>
      <li><code>template_tasks.phase</code>, so a Ferien-Vorlage can carry
        <em>„Zugverbindung abklären“</em> as a during-task. <code>template_item_tasks</code> gets no
        phase in this round — a template position's preparation is a before-task in every case we
        have.</li>
    </ul>
    <p><b>The cost:</b> a schema change is a reseed (invariant 2) — every development database is
      deleted, the <code>:3000</code> instance included. Three columns in one change rather than three
      changes.</p>

    <h2>Two things that are not what they look like</h2>
    <h3>M25 is not a feature module</h3>
    <p>The shopping list is one (ADR-066): its own store, actions and screen, and
      <code>scripts/module-boundary-gate.mjs</code> holds it and the packing code apart. Tasks cannot
      be: a task names a packing row, follows it when it is deleted (<code>sync/cascade.ts</code>),
      and is read by the packing list itself. The coupling is the feature. M25 is a view over
      <code>domain/tripTodos.ts</code>, in <code>views/trips/</code> — and that is worth an ADR, because
      the shape next door suggests otherwise.</p>
    <h3>„Erledigt von“ is not a permission</h3>
    <p>Every member may tick any task, as FR-7.4 settled — there is no row, so there is no G-3 claim.
      The stamp records who did, not who may; and the assignee says whose job it is, not who is allowed
      (FR-7.5). None of that changes here.</p>

    <h2>The recommendation, if it helps</h2>
    <div class="tablewrap">
      <table class="cmp">
        <tr><th>Question</th><th>Pick</th><th>Why that one</th></tr>
        <tr><td>1 · what M4 keeps</td><td>A</td>
          <td>It is the request's own sentence, and it gives the new screen a reason to exist. The
            cost — a chore visible only on M25 — is paid by M1's card and by the pill's count, which
            both say a number that is not zero.</td></tr>
        <tr><td>2 · how M25 reads</td><td>A, with C's <em>Meine</em> chip</td>
          <td>Sections, because the crossing has to be watchable and both phases are short in practice.
            The one filter worth the band is <em>Meine</em> — a question that only exists now that a
            task has an assignee.</td></tr>
        <tr><td>3 · the history</td><td>B</td>
          <td>One sub-line that answers the question its state raises, with the sheet holding all four
            facts. C is honest and unreadable; A hides the very fact a shared list is opened for.</td></tr>
        <tr><td>4 · the pills</td><td>A</td>
          <td>Amendment 1's rule — the views a trip is worked in — puts tasks in the row. Re-measure at
            360 px before it ships; if it clips, the answer is shorter words
            (<em>Packen · Kaufen · Aufgaben</em>), not a glyph.</td></tr>
      </table>
    </div>
    <p>Nothing here is built. Once the four are settled this is <b>FR-7.7</b> in §3.7 (amending FR-7.4,
      FR-7.5 and this morning's FR-7.6), a new <b>M25</b> in the UI-Spec with its sheet, an <b>ADR</b>
      on why the tasks are not a feature module, three columns in <code>schema.sql</code> plus a
      reseed, the third pill in <code>lib/tripViews.ts</code>, and cases in the ledger: a task written
      on M25 and read on M4, a task crossed, a task handed over, and a tick that names its person.</p>
  </div>
</div>`

const page = `<!doctype html>
<html lang="en" data-theme="mocha"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>Aufgaben als eigene Maske</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${style}</style></head>
<body>
${body}
</body></html>`

const fragment = `<title>Aufgaben als eigene Maske</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${style}</style>
${body}`

writeFileSync(join(here, 'UI_Concept_TripTasks_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_TripTasks_variants.html')

const flag = process.argv.indexOf('--artifact')
if (flag !== -1 && process.argv[flag + 1]) {
  writeFileSync(process.argv[flag + 1], fragment)
  console.log(`wrote ${process.argv[flag + 1]}`)
}
