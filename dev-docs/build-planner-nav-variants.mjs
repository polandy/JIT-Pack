/**
 * Builds UI_Concept_PlannerNav_variants.html — the rendered round for the
 * planner's navigation (owner request of 2026-09-26): the Idea Board (§3.29
 * draft) and a day plan join the trip, and the owner asked to *see* the three
 * ways they could be reached before choosing one.
 *
 * Every variant draws the same three moments of one trip, Sardinien 2026:
 * the ideas before departure, the packing list before departure, and today's
 * plan during the trip. The idea's detail sheet and the day plan are drawn
 * once as the content the variants share.
 *
 * Same rule as the other variant sheets: the CSS is lifted verbatim from
 * UI_Concept_Prototype.html; only sheet chrome and a `pl-` prefixed set of
 * classes are added. Writes the standalone page for dev-docs and (with
 * --artifact) a head-less fragment for publishing as an Artifact.
 *
 * Run: node dev-docs/build-planner-nav-variants.mjs [--artifact <path>]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const proto = readFileSync(join(here, 'UI_Concept_Prototype.html'), 'utf8')
const css = proto.slice(proto.indexOf('<style>') + 7, proto.indexOf('</style>'))

/* --- pieces ------------------------------------------------------------- */

const phone = (inner, cls = '') => `<div class="phone ${cls}">${inner}</div>`

const appbar = (title = 'Sardinien 2026', icons = '🔍 ⋮') => `
  <div class="pl-bar">
    <span class="pl-back">‹</span>
    <span class="pl-title">${title}</span>
    <span class="pl-icons">${icons}</span>
  </div>`

/** Every destination a trip can have once the planner is in, named once. */
const VIEW = {
  ideas: ['💡', 'Ideen', 5, 'new'],
  packing: ['☰', 'Packliste', 0],
  shopping: ['🛒', 'Einkaufen', 3],
  tasks: ['☑', 'Aufgaben', 2],
  notes: ['🗒', 'Notizen', 1, 'new'],
  excursions: ['🪧', 'Ausflüge', 1],
  today: ['📅', 'Tagesplan', 0],
}

/** The G-9 switcher as built (ADR-051 amendment 3): only the current view in words. */
const pills = (ids, cur, more = false) => `<div class="pl-pills">${ids
  .map((id) => {
    const [g, word, n, kind = ''] = VIEW[id]
    return id === cur
      ? `<span class="pl-pill on">${g} ${word}</span>`
      : `<span class="pl-pill ico">${g}${n ? `<i class="${kind}">${n}</i>` : ''}</span>`
  })
  .join('')}${more ? '<span class="pl-pill ico more">⋯</span>' : ''}</div>`

/** Variant A's phase bar: a segmented control above the switcher. */
const phases = (cur, dot = '') => `<div class="pl-phases">${['Planen', 'Vorbereiten', 'Unterwegs']
  .map((p) => `<span class="${p === cur ? 'on' : ''}">${p}${dot === p ? '<i></i>' : ''}</span>`)
  .join('')}</div>`

const head = (title, nav, sub = '') => `
    <div class="pl-head">
      <div class="pl-pagetitle">${title}</div>
      ${sub ? `<div class="pl-pagesub">${sub}</div>` : ''}
      ${nav}
    </div>`

const mark = (e, hue = '--blue') => `<span class="pl-mark" style="--h:var(${hue})">${e}</span>`
const av = (l, hue) => `<span class="avatar pl-av" style="background:var(${hue})">${l}</span>`
const ANDY = av('A', '--peach')
const SIA = av('S', '--mauve')
const fab = () => `<div class="pl-fab">＋</div>`

/* --- content: the Idea Board ------------------------------------------- */

/** A picture stand-in: a tinted tile, since the sheet embeds no photos. */
const thumb = (hue, e) =>
  `<span class="pl-thumb" style="--h:var(${hue})">${e}</span>`

const idea = ({ t, img, hue, e, tag, rain, link, up = [], down = [], talk = 0, next = '', dim = false }) => `
      <div class="pl-idea ${dim ? 'dim' : ''}">
        ${img ? thumb(hue, e) : ''}
        <div class="pl-grow">
          <div class="pl-iname">${t}</div>
          <div class="pl-ichips">
            ${tag ? `<span class="chip pl-chip">${tag}</span>` : ''}
            ${rain ? '<span class="chip blue pl-chip">☂ auch bei Regen</span>' : ''}
            ${link ? `<span class="pl-link">🔗 ${link}</span>` : ''}
          </div>
          ${next ? `<div class="pl-next">${next}</div>` : ''}
          <div class="pl-ifoot">
            <span class="pl-vote on">👍 ${up.length}<span class="stack">${up.join('')}</span></span>
            <span class="pl-vote">👎 ${down.length}${down.length ? `<span class="stack">${down.join('')}</span>` : ''}</span>
            ${talk ? `<span class="pl-talk">💬 ${talk}</span>` : ''}
          </div>
        </div>
      </div>`

const segs = (cur) => `<div class="pl-segs">${[
  ['Ideen', 5],
  ['Shortlist', 3],
  ['Gemacht', 1],
  ['Verworfen', 2],
]
  .map(([s, n]) => `<span class="${s === cur ? 'on' : ''}">${s} <b>${n}</b></span>`)
  .join('')}</div>`

const tagRow = () => `<div class="pl-tags"><span class="chip on">Alle</span><span class="chip">Wandern</span>
      <span class="chip">Baden</span><span class="chip">Essen</span><span class="chip">☂</span></div>`

const IDEAS = `
    ${segs('Ideen')}
    ${tagRow()}
    <div class="pl-card">
      ${idea({ t: 'Bootsausflug Cala Luna', img: 1, hue: '--sapphire', e: '⛵', tag: 'Ausflug', link: 'dorgali-boats.it',
        up: [ANDY, SIA], talk: 3 })}
      ${idea({ t: 'Museo Nivola in Orani', img: 1, hue: '--mauve', e: '🏛', tag: 'Kultur', rain: 1, link: 'museonivola.it',
        up: [SIA], talk: 1 })}
      ${idea({ t: 'Culurgiones selber machen', tag: 'Essen', up: [ANDY], down: [SIA], talk: 4 })}
      ${idea({ t: 'Tauchkurs für Lio', tag: 'Baden', link: 'cala-gonone-diving.com', talk: 0 })}
    </div>
    ${fab()}`

const SHORTLIST_IN_PLAN = `
    ${segs('Shortlist')}
    <div class="pl-card">
      ${idea({ t: 'Schlucht Gola Gorropu', img: 1, hue: '--green', e: '🥾', tag: 'Wandern', link: 'gorropu.info',
        up: [ANDY, SIA], talk: 2, next: '📅 Di 14.7. · 🪧 Ausflug · ☑ Guide buchen' })}
      ${idea({ t: 'Grotta di Ispinigoli', img: 1, hue: '--teal', e: '🦇', tag: 'Ausflug', rain: 1, up: [SIA, ANDY],
        next: '<span class="pl-pool">noch nicht eingeplant</span>' })}
    </div>`

/* --- content: the packing list (unchanged M4, for the frame) ------------ */

const prow = (m, hue, name, sub, done = false) => `
      <div class="pl-row ${done ? 'done' : ''}">${mark(m, hue)}
        <div class="pl-grow"><div class="pl-name">${name}</div><div class="pl-sub">${sub}</div></div>
        <div class="check ${done ? 'on' : ''}">${done ? '✓' : ''}</div></div>`

const PACKING = `
    <div class="pl-headline">
      <div class="ring" style="--p:42;--c:var(--teal)"><span>42</span></div>
      <div class="pl-figtext"><b>21/50 gepackt</b><small>Abreise in 5 Tagen</small>
        <div class="progress"><i style="width:42%;background:var(--teal)"></i></div></div>
    </div>
    <div class="pl-group"><span>Kleidung</span><span>6/14</span></div>
    <div class="pl-card">
      ${prow('🩳', '--peach', 'Badehose', 'Lio · Andy', true)}
      ${prow('🧥', '--blue', 'Regenjacke', 'alle 4')}
      ${prow('🥾', '--green', 'Wanderschuhe', 'alle 4 · 🪧 Gola Gorropu')}
    </div>
    <div class="pl-group"><span>Strand</span><span>2/7</span></div>
    <div class="pl-card">
      ${prow('🤿', '--sapphire', 'Schnorchel-Set', 'Sia', true)}
      ${prow('⛱', '--yellow', 'Sonnenschirm', 'Andy')}
    </div>
    ${fab()}`

/* --- content: today's plan --------------------------------------------- */

const days = () => `<div class="pl-days">${[
  ['So', 12],
  ['Mo', 13],
  ['Di', 14],
  ['Mi', 15],
  ['Do', 16],
  ['Fr', 17],
]
  .map(([d, n]) => `<span class="${n === 14 ? 'on' : n < 14 ? 'past' : ''}"><small>${d}</small>${n}</span>`)
  .join('')}</div>`

const entry = ({ time, kind, cls, t, sub = '', tail = '', done = false }) => `
      <div class="pl-entry ${cls} ${done ? 'done' : ''}">
        <div class="pl-time">${time}</div>
        <div class="pl-grow"><div class="pl-kind">${kind}</div><div class="pl-name">${t}</div>
          ${sub ? `<div class="pl-sub">${sub}</div>` : ''}</div>
        ${tail}
      </div>`

const TODAY = `
    ${days()}
    <div class="pl-card pl-timeline">
      ${entry({ time: '07:30', kind: '🪧 Ausflug', cls: 'exc', t: 'Tageswanderung Gola Gorropu',
        sub: 'Rucksack 3/9 gepackt ›', tail: '<div class="ring pl-mini" style="--p:33;--c:var(--teal)"></div>' })}
      ${entry({ time: '09:00', kind: '💡 Idee', cls: 'idea', t: 'Schlucht Gola Gorropu',
        sub: '👍 2 · Guide Marco, Treffpunkt Parkplatz', tail: '<div class="check"></div>' })}
      ${entry({ time: 'heute', kind: '☑ Aufgabe', cls: 'task', t: 'Bootstickets Cala Luna buchen',
        sub: `${SIA} Sia`, tail: '<div class="check"></div>' })}
      ${entry({ time: '19:30', kind: '✎ Eintrag', cls: 'free', t: 'Tisch Su Gologone', sub: '4 Personen · Code 2291' })}
    </div>
    <div class="pl-group"><span>Morgen · Mi 15.7.</span><span>2</span></div>
    <div class="pl-card">
      ${entry({ time: '—', kind: '💡 Idee', cls: 'idea', t: 'Museo Nivola', sub: '☂ auch bei Regen · Regen gemeldet' })}
    </div>
    <div class="pl-poolbar">💡 2 Ideen auf der Shortlist noch ohne Tag ›</div>
    ${fab()}`

/* --- the three variants ------------------------------------------------- */

const ALL_B = ['ideas', 'packing', 'shopping', 'tasks', 'notes', 'excursions', 'today']

const A = {
  ideas: phone(`${appbar()}<div class="body pl-pad">
    ${head('Ideen', phases('Planen') + pills(['ideas', 'tasks'], 'ideas'))}${IDEAS}</div>`),
  packing: phone(`${appbar()}<div class="body pl-pad">
    ${head('Packliste', phases('Vorbereiten', 'Planen') + pills(['packing', 'shopping', 'tasks', 'notes', 'excursions'], 'packing'))}
    ${PACKING}</div>`),
  today: phone(`${appbar()}<div class="body pl-pad">
    ${head('Heute', phases('Unterwegs') + pills(['today', 'ideas', 'shopping', 'notes', 'excursions'], 'today'), 'Di 14.7. · Tag 5 von 14')}
    ${TODAY}</div>`),
}

const B = {
  ideas: phone(`${appbar()}<div class="body pl-pad">${head('Ideen', pills(ALL_B, 'ideas'))}${IDEAS}</div>`),
  packing: phone(`${appbar()}<div class="body pl-pad">${head('Packliste', pills(ALL_B, 'packing'))}${PACKING}</div>`),
  today: phone(`${appbar()}<div class="body pl-pad">
    ${head('Tagesplan', pills(ALL_B, 'today'), 'Di 14.7. · Tag 5 von 14')}${TODAY}</div>`),
}

const C_BEFORE = ['ideas', 'packing', 'shopping', 'tasks', 'notes']
const C_DURING = ['today', 'ideas', 'shopping', 'notes', 'excursions']
const C = {
  ideas: phone(`${appbar()}<div class="body pl-pad">${head('Ideen', pills(C_BEFORE, 'ideas', true))}${IDEAS}</div>`),
  packing: phone(`${appbar()}<div class="body pl-pad">
    ${head('Packliste', pills(C_BEFORE, 'packing', true))}${PACKING}</div>`),
  today: phone(`${appbar()}<div class="body pl-pad">
    ${head('Heute', pills(C_DURING, 'today', true), 'Di 14.7. · Tag 5 von 14')}${TODAY}</div>`),
}

/* --- shared content: one idea, opened ----------------------------------- */

const DETAIL = phone(`${appbar()}
  <div class="body pl-pad pl-dimmed">${head('Ideen', pills(ALL_B, 'ideas'))}${SHORTLIST_IN_PLAN}</div>
  <div class="pl-scrim"></div>
  <div class="pl-sheet"><div class="handle"></div><div class="pl-sheet-body">
    <div class="pl-photos">${thumb('--green', '🥾')}${thumb('--teal', '🏞')}<span class="pl-thumb add">＋</span></div>
    <div class="pl-sheet-h">Schlucht Gola Gorropu
      <small>von ${SIA} Sia · 3.6. · <span class="chip pl-chip">Wandern</span></small></div>
    <div class="pl-linkcard">🔗 <span><b>gorropu.info</b> · Führungen ab Parkplatz Sa Barva</span></div>
    <div class="pl-status"><span>Idee</span><span class="on">Shortlist</span><span>Gemacht</span><span>Verworfen</span></div>
    <div class="pl-votes"><span class="pl-vote on big">👍 ${ANDY}${SIA}</span><span class="pl-vote big">👎</span>
      <span class="pl-vtext">Andy und Sia dafür</span></div>
    <div class="pl-field"><span class="l">Einplanen</span><span class="v">Di 14.7. · 09:00</span></div>
    <div class="pl-field col"><span class="l">Daraus gemacht</span>
      <div class="pl-bridges">
        <span class="pl-bridge on">🪧 Ausflug · 3/9 ›</span>
        <span class="pl-bridge on">☑ Guide buchen · Sia ›</span>
        <span class="pl-bridge">＋ Einkauf</span>
      </div></div>
    <div class="pl-field col"><span class="l">2 Kommentare</span>
      <div class="pl-cmt">${ANDY}<div><b>Andy</b> Ist das mit Mia (6) machbar? <small>gestern</small></div></div>
      <div class="pl-cmt">${SIA}<div><b>Sia</b> Kurze Variante, 2 h, laut Marco ok. <small>vor 2 h</small></div></div>
    </div>
  </div></div>`)

/* --- width check -------------------------------------------------------- */

const strip = (label, nav, w) => `
    <div class="pl-strip-l">${label}</div>
    <div class="pl-wline" style="width:${w}px">${nav}</div>`

const WIDTHS = `
  <div class="pl-strip">
    ${strip('A · Vorbereiten, 360 px', phases('Vorbereiten') + pills(['packing', 'shopping', 'tasks', 'notes', 'excursions'], 'packing'), 334)}
    ${strip('B · sieben Ziele, Packliste aktiv, 360 px', pills(ALL_B, 'packing'), 334)}
    ${strip('B · sieben Ziele, Tagesplan aktiv, 360 px', pills(ALL_B, 'today'), 334)}
    ${strip('B · Tagesplan aktiv, 410 px (Pixel 9 Pro)', pills(ALL_B, 'today'), 384)}
    ${strip('C · unterwegs, 360 px', pills(C_DURING, 'today', true), 334)}
  </div>`

/* --- page --------------------------------------------------------------- */

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
.vrow{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:22px;align-items:start}
.vrow .lbl{font:600 11px/1 var(--ui);letter-spacing:.12em;text-transform:uppercase;color:var(--o1);margin-bottom:8px}
.vsum{max-width:78ch;margin:0 0 18px;color:var(--sub0);font-size:13.5px;line-height:1.6}
.vsum .win{color:var(--green)} .vsum .cost{color:var(--peach)}

.phone{width:100%;max-width:380px;height:640px;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
.phone .body{flex:1;overflow:hidden;padding:10px 13px;position:relative;display:flex;flex-direction:column;gap:6px}
.phone .body>*{animation:none}
.pl-dimmed{filter:saturate(.7)}
.pl-bar{flex:none;display:flex;align-items:center;gap:9px;padding:11px 13px;border-bottom:1px solid var(--s0);background:var(--crust)}
.pl-back{color:var(--o1);font-size:19px;line-height:1}
.pl-title{font:600 15px/1.2 var(--display);flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-icons{font-size:13px;color:var(--o1);flex:none}
.pl-head{padding:6px 2px 2px}
.pl-pagetitle{font:600 20px/1.18 var(--display);text-wrap:balance}
.pl-pagesub{font-size:12px;color:var(--o0);margin-top:3px}
.pl-phases{display:flex;margin-top:9px;padding:3px;border-radius:12px;background:var(--crust);border:1px solid var(--s0)}
.pl-phases span{flex:1;position:relative;text-align:center;padding:6px 4px;border-radius:9px;font-size:12px;font-weight:600;color:var(--o1)}
.pl-phases span.on{background:var(--s1);color:var(--text)}
.pl-phases i{position:absolute;top:5px;right:8px;width:7px;height:7px;border-radius:50%;background:var(--blue)}
.pl-pills{display:flex;gap:6px;margin-top:9px;overflow:hidden;align-items:center}
.pl-pill{flex:none;position:relative;padding:6px 10px;border-radius:999px;background:var(--mantle);border:1px solid var(--s0);
  font-size:11.5px;font-weight:600;color:var(--sub0);white-space:nowrap}
.pl-pill.ico{padding:6px 9px;font-size:13px;line-height:1}
.pl-pill.more{color:var(--o1)}
.pl-pill.on{background:var(--s1);border-color:var(--s2);color:var(--text)}
.pl-pill i{position:absolute;top:-5px;right:-5px;min-width:15px;height:15px;border-radius:8px;background:var(--s2);
  color:var(--text);font:600 9.5px/15px var(--ui);text-align:center;font-style:normal;padding:0 3px}
.pl-pill i.new{background:var(--blue);color:var(--crust)}
.pl-grow{flex:1;min-width:0}
.pl-card{border-radius:14px;background:var(--base);border:1px solid var(--s0);padding:2px 0;flex:none}
.pl-group{display:flex;justify-content:space-between;padding:8px 4px 2px;font-size:12px;font-weight:600;color:var(--o1);
  letter-spacing:.06em;text-transform:uppercase}
.pl-name{font-size:13.5px;color:var(--text);line-height:1.3}
.pl-sub{font-size:11px;color:var(--o0);margin-top:2px;display:flex;align-items:center;gap:4px}
.pl-mark{width:28px;height:28px;flex:none;border-radius:50%;display:grid;place-items:center;font-size:15px;
  background:color-mix(in srgb,var(--h) 22%,transparent)}
.pl-row{display:flex;align-items:center;gap:9px;padding:7px 11px;min-height:40px}
.pl-row.done .pl-name{color:var(--o1);text-decoration:line-through}
.pl-row .check,.pl-entry .check{width:24px;height:24px;flex:none}
.pl-headline{display:flex;gap:10px;align-items:center;padding:4px 2px}
.pl-headline .ring{width:40px;height:40px}.pl-headline .ring span{font-size:10px}
.pl-figtext{flex:1;min-width:0}.pl-figtext b{display:block;font-size:12.5px;color:var(--sub1)}
.pl-figtext small{display:block;font-size:11px;color:var(--o0)}.pl-figtext .progress{margin-top:5px;height:6px}
.pl-av{width:18px;height:18px;font-size:9px}
.pl-fab{position:absolute;right:16px;bottom:16px;width:50px;height:50px;border-radius:50%;background:var(--blue);
  color:var(--crust);display:grid;place-items:center;font-size:24px;box-shadow:var(--shadow)}

.pl-segs{display:flex;gap:4px;margin-top:4px;border-bottom:1px solid var(--s0)}
.pl-segs span{padding:7px 7px 8px;font-size:12px;font-weight:600;color:var(--o1);white-space:nowrap;border-bottom:2px solid transparent}
.pl-segs span b{font-weight:600;color:var(--o0);font-variant-numeric:tabular-nums}
.pl-segs span.on{color:var(--text);border-bottom-color:var(--blue)}
.pl-tags{display:flex;gap:5px;overflow:hidden;padding:4px 0 2px}
.pl-tags .chip{font-size:11px;flex:none}.pl-tags .chip.on{background:var(--blue);color:var(--crust)}
.pl-idea{display:flex;gap:10px;padding:10px 11px;border-top:1px solid var(--s0)}
.pl-idea:first-child{border-top:0}
.pl-idea.dim{opacity:.55}
.pl-thumb{width:58px;height:58px;flex:none;border-radius:11px;display:grid;place-items:center;font-size:24px;
  background:linear-gradient(145deg,color-mix(in srgb,var(--h) 55%,transparent),color-mix(in srgb,var(--h) 18%,transparent))}
.pl-thumb.add{--h:var(--s2);background:var(--s0);color:var(--o1);font-size:20px}
.pl-iname{font-size:13.5px;font-weight:600;color:var(--text);line-height:1.3}
.pl-ichips{display:flex;flex-wrap:wrap;gap:5px;align-items:center;margin-top:4px}
.pl-chip{font-size:10.5px;padding:2px 7px}
.pl-link{font-size:11px;color:var(--sapphire);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}
.pl-next{margin-top:5px;font-size:11px;color:var(--teal)}
.pl-pool{color:var(--o0);font-style:italic}
.pl-ifoot{display:flex;gap:12px;align-items:center;margin-top:6px}
.pl-vote{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--o1);font-variant-numeric:tabular-nums}
.pl-vote.on{color:var(--text)}
.pl-vote .stack .avatar{width:17px;height:17px;font-size:8.5px}
.pl-vote.big{padding:6px 10px;border-radius:999px;border:1px solid var(--s1);font-size:13px}
.pl-vote.big.on{border-color:var(--green);background:color-mix(in srgb,var(--green) 12%,transparent)}
.pl-vote.big .avatar{width:20px;height:20px;font-size:9px}
.pl-talk{font-size:11.5px;color:var(--o1);margin-left:auto}

.pl-days{display:flex;gap:4px;padding:2px 0 4px}
.pl-days span{flex:1;display:flex;flex-direction:column;align-items:center;padding:5px 0;border-radius:10px;font-size:13px;
  font-weight:600;color:var(--sub0);font-variant-numeric:tabular-nums}
.pl-days small{font-size:9.5px;color:var(--o0);font-weight:600}
.pl-days span.past{color:var(--o0)}
.pl-days span.on{background:var(--blue);color:var(--crust)}.pl-days span.on small{color:var(--crust)}
.pl-entry{display:flex;gap:10px;align-items:center;padding:9px 11px;border-top:1px solid var(--s0);position:relative}
.pl-entry:first-child{border-top:0}
.pl-entry::before{content:'';position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:2px;background:var(--c,var(--s2))}
.pl-entry.exc{--c:var(--teal)} .pl-entry.idea{--c:var(--yellow)} .pl-entry.task{--c:var(--peach)} .pl-entry.free{--c:var(--o0)}
.pl-time{width:40px;flex:none;font-size:12px;font-weight:600;color:var(--sub1);font-variant-numeric:tabular-nums}
.pl-kind{font-size:10px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:var(--c)}
.pl-mini{width:26px;height:26px}
.pl-poolbar{padding:9px 11px;border-radius:11px;border:1px dashed var(--s2);font-size:12px;color:var(--sub0)}

.pl-scrim{position:absolute;inset:0;background:rgba(17,17,27,.55);z-index:20}
.pl-sheet{position:absolute;left:0;right:0;bottom:0;top:62px;z-index:21;background:var(--mantle);border-radius:22px 22px 0 0;
  border-top:1px solid var(--s1);box-shadow:0 -16px 40px rgba(0,0,0,.6);overflow:hidden}
.pl-sheet .handle{width:42px;height:5px;border-radius:3px;background:var(--s2);margin:10px auto 2px}
.pl-sheet-body{padding:6px 14px 18px;display:flex;flex-direction:column;gap:7px}
.pl-sheet-h{font:600 17px/1.25 var(--display);margin:2px 2px 0}
.pl-sheet-h small{display:flex;gap:5px;align-items:center;margin-top:4px;font:400 11.5px/1.4 var(--ui);color:var(--o0)}
.pl-photos{display:flex;gap:7px}
.pl-photos .pl-thumb{width:74px;height:56px}
.pl-linkcard{display:flex;gap:7px;padding:8px 10px;border-radius:10px;background:var(--base);border:1px solid var(--s0);
  font-size:11.5px;color:var(--sub0)}
.pl-linkcard b{color:var(--sapphire);font-weight:600}
.pl-status{display:flex;padding:3px;border-radius:11px;background:var(--crust);border:1px solid var(--s0)}
.pl-status span{flex:1;text-align:center;padding:6px 2px;border-radius:8px;font-size:11.5px;font-weight:600;color:var(--o1)}
.pl-status span.on{background:var(--blue);color:var(--crust)}
.pl-votes{display:flex;gap:7px;align-items:center}
.pl-vtext{font-size:11.5px;color:var(--o0)}
.pl-field{display:flex;gap:10px;align-items:center;padding:7px 2px 0;border-top:1px solid var(--s0);font-size:12.5px}
.pl-field.col{flex-direction:column;align-items:stretch;gap:6px}
.pl-field .l{width:84px;flex:none;color:var(--o0)}
.pl-field .v{color:var(--text)}
.pl-bridges{display:flex;flex-wrap:wrap;gap:6px}
.pl-bridge{padding:6px 10px;border-radius:999px;border:1px dashed var(--s2);font-size:11.5px;color:var(--sub0)}
.pl-bridge.on{border-style:solid;border-color:var(--teal);color:var(--teal);background:color-mix(in srgb,var(--teal) 10%,transparent)}
.pl-cmt{display:flex;gap:8px;font-size:12px;color:var(--sub1);line-height:1.4}
.pl-cmt .avatar{width:22px;height:22px;font-size:9.5px;flex:none}
.pl-cmt b{color:var(--text);font-weight:600;margin-right:4px}.pl-cmt small{color:var(--o0);margin-left:4px}

.pl-strip{width:100%;max-width:420px;border:1px solid var(--s0);border-radius:18px;background:var(--mantle);
  padding:12px 13px;display:flex;flex-direction:column;gap:4px}
.pl-strip-l{font-size:11px;color:var(--o0);margin-top:8px}
.pl-wline{max-width:100%;border-right:1px dashed var(--red);padding-right:2px}
.pl-wline .pl-phases,.pl-wline .pl-pills{margin-top:4px}
.tablewrap{overflow-x:auto;margin:14px 0 0;max-width:900px}
table.cmp{border-collapse:collapse;font-size:13.5px;width:100%;min-width:560px}
table.cmp th,table.cmp td{border-top:1px solid var(--s0);padding:9px 10px;text-align:left;color:var(--sub0);vertical-align:top}
table.cmp th{color:var(--text);font:600 12px/1 var(--ui);letter-spacing:.06em;text-transform:uppercase}
table.cmp td:first-child{color:var(--text);white-space:nowrap}
@media (max-width:560px){.phone{height:600px}}`

const variant = (k, title, rec, summary, v, labels) => `
  <div class="qhead"><div class="q${rec ? ' dec' : ''}">${k}${rec ? ' · decided 2026-09-26' : ''}${rec ? '<span class="rec">Gewählt</span>' : ''}</div><h2>${title}</h2></div>
  <p class="vsum">${summary}</p>
  <div class="vrow">
    <div><div class="lbl">${labels[0]}</div>${v.ideas}</div>
    <div><div class="lbl">${labels[1]}</div>${v.packing}</div>
    <div><div class="lbl">${labels[2]}</div>${v.today}</div>
  </div>`

const body = `<div class="vwrap">
  <div class="vhead">
    <div class="k">Owner request · 2026-09-26 · §3.29 draft + day plan</div>
    <h1>Where do the ideas and the day plan live?</h1>
    <p>JIT-Pack grows a planner: the members of a trip collect <b>ideas</b> (link, pictures, note), comment, vote
      <b>👍/👎 with names</b>, and set each idea by hand to <em>Idee · Shortlist · Gemacht · Verworfen</em>. An idea
      on the shortlist gets a <b>day, with an optional time</b>, and can spawn an <b>excursion, a task or a shopping
      entry</b> while staying where it is. During the trip a <b>day plan</b> shows the planned ideas, dated excursions,
      due tasks, arrival and departure, and free entries such as a table booking.</p>
    <p>Three ways to reach it follow. Each shows the same three moments of <b>Sardinien 2026</b> (12.–25.7., four
      travellers, two accounts): the ideas before departure, the packing list before departure, and <em>today</em>
      on day five. Whatever the variant, a trip <b>opens by date</b> (decided): before departure on the last view
      visited, during the trip on today's plan, afterwards on the packing list.</p>
  </div>

  ${variant('Variant A', 'Phases on top, pills underneath', false,
    'A segmented <b>Planen · Vorbereiten · Unterwegs</b> above the switcher; each phase has its own short set of pills. ' +
      'Close to the North-Star vision and the §3.29 draft. <span class="win">Each row stays short and the trip reads as ' +
      'a lifecycle.</span> <span class="cost">A second navigation row on every trip screen (about 40 px), some views in ' +
      'two phases (Einkaufen, Notizen, Ausflüge), and reaching the packing list from the ideas takes two taps.</span>',
    A, ['Planen · Ideen', 'Vorbereiten · Packliste', 'Unterwegs · Heute'])}

  ${variant('Variant B', 'One switcher, seven destinations', true,
    'Two more pills, <b>💡 Ideen</b> first and <b>📅 Tagesplan</b> last, in the switcher that exists; only where you ' +
      'stand is in words (ADR-051 amendment 3). <span class="win">No new pattern, one tap to anything, and the ' +
      'opening-by-date rule does the phase work.</span> <span class="cost">Seven glyphs to learn; the row fills 360 px ' +
      'almost to the edge (see the width check), so an eighth view would not fit.</span>',
    B, ['Vor der Reise · Ideen', 'Vor der Reise · Packliste', 'Unterwegs · Tagesplan'])}

  ${variant('Variant C', 'The pills follow the date', false,
    'One switcher whose set changes with the trip: before departure <b>Ideen · Packliste · Einkaufen · Aufgaben · ' +
      'Notizen</b>, during the trip <b>Heute · Ideen · Einkaufen · Notizen · Ausflüge</b>; the rest behind ⋯. ' +
      '<span class="win">Always five, the ones that matter now.</span> <span class="cost">The same control shows ' +
      'different things on different days, a pill you used yesterday can be gone, and the rule for what counts as ' +
      '<em>during</em> must be exact (a started trip, a date, a packed row, as FR-7.14 decided).</span>',
    C, ['Vor der Reise · Ideen', 'Vor der Reise · Packliste', 'Unterwegs · Heute'])}

  <div class="qhead"><div class="q">Width check</div><h2>Does the row fit?</h2>
    <p>The dashed line is the content edge: 334 px on a 360 px phone, 384 px on the Pixel 9 Pro's 410 px.</p></div>
  <div class="vgrid"><div class="vcol">${WIDTHS}</div></div>

  <div class="qhead"><div class="q dec">Same in every variant</div><h2>One idea, opened</h2>
    <p>The detail sheet the three variants share: pictures, the link, the four states, votes with names, the day it
      is planned on, and <b>what was made from it</b>. The idea stays, and each result is a link to the real thing.</p></div>
  <div class="vgrid">
    <div class="vcol"><div class="vcap"><div class="k ok">Idea detail</div><h3>Shortlist, planned, two results</h3>
      <p>The hike became an excursion (its rucksack list 3/9) and a task for Sia. <em>＋ Einkauf</em> is offered and not
        used.</p></div>${DETAIL}</div>
  </div>

  <div class="qhead"><div class="q">Compared</div><h2>The three in one table</h2></div>
  <div class="tablewrap"><table class="cmp">
    <tr><th></th><th>A · Phases</th><th>B · One switcher</th><th>C · Date-driven</th></tr>
    <tr><td>Taps ideas → packing</td><td>2</td><td>1</td><td>1 (before), 2 via ⋯ (during)</td></tr>
    <tr><td>Rows of navigation</td><td>2</td><td>1</td><td>1</td></tr>
    <tr><td>New pattern</td><td>phase bar</td><td>none</td><td>a switcher that changes</td></tr>
    <tr><td>Room for more views</td><td>plenty, per phase</td><td>none at 360 px</td><td>behind ⋯</td></tr>
    <tr><td>Fits the vision</td><td>literally</td><td>by the opening rule</td><td>by the pill set</td></tr>
  </table></div>
</div>`

const fonts = `<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />`

const TITLE = 'Planer im Trip'

const page = `<!doctype html>
<html lang="en" data-theme="mocha"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<title>${TITLE}</title>
${fonts}
<style>${style}</style></head>
<body>
${body}
</body></html>`

const fragment = `<title>${TITLE}</title>
${fonts}
<style>${style}</style>
${body}`

writeFileSync(join(here, 'UI_Concept_PlannerNav_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_PlannerNav_variants.html')

const flag = process.argv.indexOf('--artifact')
if (flag !== -1 && process.argv[flag + 1]) {
  writeFileSync(process.argv[flag + 1], fragment)
  console.log(`wrote ${process.argv[flag + 1]}`)
}
