/**
 * Builds UI_Concept_PerPersonRows_variants.html from the prototype's own stylesheet.
 *
 * The problem being mocked (owner, 2026-09-11): a per-person item costs one rendered
 * row per traveler. FR-25.1's cluster names the item once, but it does not *save* a
 * line — the head is an extra line above N children that are always expanded. On a
 * four-person trip a toothbrush is five lines, and a list of twelve such items is
 * sixty. The four variants are four different answers to "what may a cluster cost".
 *
 * As with every variants sheet here, the CSS is lifted verbatim from
 * UI_Concept_Prototype.html rather than re-written: a variant that looks different
 * because its stylesheet differs teaches nothing.
 *
 * Run: node dev-docs/build-perperson-rows-variants.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const proto = readFileSync(join(here, 'UI_Concept_Prototype.html'), 'utf8')
const css = proto.slice(proto.indexOf('<style>') + 7, proto.indexOf('</style>'))

/* The trip the variants are judged against. Four travelers, because the defect is
   invisible at two and obvious at four — and the amounts differ, because equal
   amounts are the case variant D is allowed to fold away. */
const AV = {
  Andy: ['A', 'var(--peach)'],
  Sia: ['S', 'var(--mauve)'],
  Leonardo: ['L', 'var(--sky)'],
  Mia: ['M', 'var(--teal)'],
}
const TRAVELERS = Object.keys(AV)

/** qty per traveler; packed per traveler. `mode` only where it is not the silent 🧳. */
const ITEMS = [
  {
    name: 'Zahnbürste',
    kind: 'pp',
    per: { Andy: 1, Sia: 1, Leonardo: 1, Mia: 1 },
    packed: { Andy: 0, Sia: 0, Leonardo: 0, Mia: 0 },
    uniform: true,
  },
  {
    name: 'Kurze Hosen',
    kind: 'pp',
    per: { Andy: 2, Sia: 1, Leonardo: 3, Mia: 1 },
    packed: { Andy: 0, Sia: 0, Leonardo: 0, Mia: 0 },
    uniform: false,
  },
  {
    name: 'Regenjacke',
    kind: 'pp',
    per: { Andy: 1, Sia: 1, Leonardo: 1, Mia: 1 },
    packed: { Andy: 0, Sia: 1, Leonardo: 0, Mia: 0 },
    uniform: false, // one instance is packed — the children no longer agree
  },
  { name: 'Sonnencreme', kind: 'shared', qty: 2, packed: 0, mode: 'buy' },
  {
    name: 'Badeschuhe',
    kind: 'pp',
    per: { Leonardo: 1, Mia: 1 },
    packed: { Leonardo: 0, Mia: 0 },
    uniform: true,
  },
  { name: 'Reiseapotheke', kind: 'shared', qty: 1, packed: 0 },
]

const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  )
const members = (it) => Object.keys(it.per)
const units = (it) => members(it).reduce((n, t) => n + it.per[t], 0)
const packedUnits = (it) => members(it).reduce((n, t) => n + it.packed[t], 0)
const av = (t) => AV[t] || ['?', 'var(--s2)']

const avatar = (t, cls = 'mini-av') =>
  `<span class="${cls}" style="background:${av(t)[1]}">${av(t)[0]}</span>`

const modeIcon = (it) => (it.mode === 'buy' ? `<span class="ppmode">🛒</span>` : '')

/** The prototype's own two controls: a check at qty 1, a stepper above it. */
const ctrl = (packed, qty) =>
  qty === 1
    ? `<div class="check ${packed >= qty ? 'on' : ''}"><svg viewBox="0 0 24 24"><use href="#i-check"/></svg></div>`
    : `<div class="stepper"><button>–</button><b>${packed}/${qty}</b><button>+</button></div>`

const sharedRow = (it) => `
  <div class="li">
    ${it.qty === 1 ? ctrl(it.packed, it.qty) : ''}
    <div class="grow"><div class="name">${esc(it.name)}</div></div>
    <div style="display:flex;align-items:center;gap:7px">${modeIcon(it)}${it.qty === 1 ? '' : ctrl(it.packed, it.qty)}</div>
  </div>`

const childRow = (it, t) => `
  <div class="li ppkid">
    ${it.per[t] === 1 ? ctrl(it.packed[t], it.per[t]) : ''}
    ${avatar(t)}
    <div class="grow"><div class="name">${esc(t)}</div>${
      it.per[t] > 1 ? `<div class="desc">${it.packed[t]}/${it.per[t]} gepackt</div>` : ''
    }</div>
    <div style="display:flex;align-items:center;gap:8px">${it.per[t] === 1 ? '' : ctrl(it.packed[t], it.per[t])}</div>
  </div>`

const facepile = (it, withCounts = false) =>
  `<span class="ppfaces">${members(it)
    .map(
      (t) =>
        `<span class="ppface${it.packed[t] >= it.per[t] ? ' packed' : ''}">${avatar(t, 'mini-av')}${
          withCounts && it.per[t] > 1 ? `<i class="ppn">${it.per[t]}</i>` : ''
        }</span>`,
    )
    .join('')}</span>`

/* ---------------------------------------------------------------- variants */

/** Today: head + one always-expanded child per traveler. The baseline being judged. */
const today = (it) => `
  <div class="ppcluster">
    <div class="pphead"><span class="ppname">${esc(it.name)}</span>${modeIcon(it)}
      <span class="ppcount">${packedUnits(it)}/${units(it)}</span></div>
    <div class="ppkids">${members(it)
      .map((t) => childRow(it, t))
      .join('')}</div>
  </div>`

/** A — the cluster folds, exactly like a group (FR-25.16). Shut by default. */
const variantA = (it, open) => `
  <div class="ppcluster ${open ? '' : 'shut'}">
    <div class="pphead tap" data-fold="${esc(it.name)}">
      <span class="ppcaret">${open ? '▾' : '▸'}</span>
      <span class="ppname">${esc(it.name)}</span>${modeIcon(it)}
      ${open ? '' : facepile(it)}
      <span class="ppcount">${packedUnits(it)}/${units(it)}</span></div>
    ${
      open
        ? `<div class="ppkids">${members(it)
            .map((t) => childRow(it, t))
            .join('')}</div>`
        : ''
    }
  </div>`

/** B — one row, the people are avatar buttons on it. No child rows at all. */
const variantB = (it) => `
  <div class="li ppinline">
    <div class="grow">
      <div class="name">${esc(it.name)}</div>
      <div class="ppbtnrow">${members(it)
        .map(
          (t) =>
            `<button class="ppbtn${it.packed[t] >= it.per[t] ? ' on' : ''}" data-pp="${esc(it.name)}|${esc(t)}">
              ${avatar(t, 'mini-av')}${it.per[t] > 1 ? `<i>${it.packed[t]}/${it.per[t]}</i>` : ''}
            </button>`,
        )
        .join('')}</div>
    </div>
    <div style="display:flex;align-items:center;gap:7px">${modeIcon(it)}
      <span class="ppcount">${packedUnits(it)}/${units(it)}</span></div>
  </div>`

/** C — my own row is a row; everybody else is one line. */
const variantC = (it, me) => {
  const others = members(it).filter((t) => t !== me)
  const mine = members(it).includes(me)
  return `
  <div class="ppcluster">
    <div class="pphead"><span class="ppname">${esc(it.name)}</span>${modeIcon(it)}
      <span class="ppcount">${packedUnits(it)}/${units(it)}</span></div>
    <div class="ppkids">
      ${mine ? childRow(it, me) : ''}
      ${
        others.length
          ? `<div class="li ppmore tap" data-fold="${esc(it.name)}">
               ${facepile(it)}
               <div class="grow"><div class="desc">${others.length} weitere ${
                 others.length === 1 ? 'Person' : 'Personen'
               } · ${others.reduce((n, t) => n + it.per[t] - it.packed[t], 0)} offen</div></div>
               <span class="ppcaret">▸</span>
             </div>`
          : ''
      }
    </div>
  </div>`
}

/** D — the cluster folds only while its children say nothing of their own. */
const variantD = (it) => {
  if (!it.uniform) return today(it)
  const per = it.per[members(it)[0]]
  return `
  <div class="li ppinline">
    ${per === 1 ? ctrl(0, 1) : ''}
    <div class="grow">
      <div class="name">${esc(it.name)}</div>
      <div class="ppwho">${facepile(it)}<span class="desc">alle ${members(it).length} · je ${per}</span></div>
    </div>
    <div style="display:flex;align-items:center;gap:7px">${modeIcon(it)}
      ${per === 1 ? '' : `<span class="ppcount">${packedUnits(it)}/${units(it)}</span>`}</div>
  </div>`
}

const listHTML = (render) => `
  <div class="card">
    ${ITEMS.map((it) => (it.kind === 'shared' ? sharedRow(it) : render(it))).join('')}
  </div>`

const lineCount = (render) => {
  // What each variant costs in rendered lines, counted the way a reader counts.
  let n = 0
  for (const it of ITEMS) {
    if (it.kind === 'shared') n += 1
    else n += render(it)
  }
  return n
}
const COSTS = {
  today: lineCount((it) => 1 + members(it).length),
  A: lineCount(() => 1),
  B: lineCount(() => 1),
  C: lineCount((it) => 1 + 1 + 1),
  D: lineCount((it) => (it.uniform ? 1 : 1 + members(it).length)),
}

const VARIANTS = [
  {
    id: 'today',
    kicker: 'Heute',
    title: 'Kopf plus eine Zeile pro Person',
    body: `Der Cluster nennt das Item einmal (FR-25.1) — aber er <em>spart</em> keine Zeile: der Kopf ist eine
           zusätzliche Zeile über N Kindern, die immer offen stehen. Vier Reisende machen aus einer Zahnbürste
           fünf Zeilen.`,
    cost: `${COSTS.today} Zeilen für 6 Items. Das ist der Befund, nicht die Lösung.`,
    html: listHTML(today),
  },
  {
    id: 'a',
    kicker: 'Variante A',
    title: 'Der Cluster faltet — wie eine Gruppe',
    body: `Dieselbe Grammatik wie FR-25.16: Tippen auf den Kopf klappt auf und zu, zu ist der Normalfall. Der
           geschlossene Kopf trägt die Gesichter der Betroffenen und den Bruch, also beantwortet er
           <em>„wer und wie weit"</em> ohne die Kinder. Nichts Neues zu lernen — die Geste existiert schon.`,
    cost: `${COSTS.A} Zeilen. Kosten: eine Person packen heißt erst aufklappen — ein Tap mehr auf dem
           häufigsten Weg. Und der Faltzustand will erinnert werden, sonst klappt die Liste bei jedem
           Betreten wieder zu.`,
    html: listHTML((it) => variantA(it, it.name === 'Kurze Hosen')),
  },
  {
    id: 'b',
    kicker: 'Variante B',
    title: 'Eine Zeile, die Personen sind die Knöpfe',
    body: `Keine Kinderzeilen. Jede Person ist ein Avatar-Knopf auf der Item-Zeile: Tippen packt genau ihre
           Instanz, der Ring zeigt den Zustand, eine Menge über 1 steht als <code>0/2</code> am Avatar.
           Das ist exakt die Mechanik, die FR-25.13h gerade in die Inventar-Sheet gebaut hat — die Form ist
           im Haus bereits erprobt.`,
    cost: `${COSTS.B} Zeilen, und das Packen bleibt ein Tap. Kosten: ab etwa fünf Reisenden bricht die
           Knopfreihe um; die Mengen sind ablesbar, aber nicht mehr bequem einstellbar — der Stepper lebt
           dann nur noch in M5. FR-25.13h zieht genau deshalb bei &gt;3 in ein Popover.`,
    html: listHTML(variantB),
  },
  {
    id: 'c',
    kicker: 'Variante C',
    title: 'Meine Zeile ist eine Zeile, der Rest ist eine',
    body: `Die Liste wird persönlich: die eigene Instanz steht ausgeschrieben da, alle anderen fallen in eine
           Sammelzeile mit Gesichtern und offener Menge. Wer auf der gemeinsamen Liste packt, sieht zuerst,
           was <em>er</em> zu tun hat — die Fortsetzung dessen, was FR-25.20 mit fremden Zuständigkeiten
           schon tut.`,
    cost: `${COSTS.C} Zeilen. Kosten: es braucht ein „ich" — im Local Mode gibt es keine Identität, dort
           fällt die Variante auf A zurück. Und es versteckt fremden Fortschritt, den man auf einer
           Familienliste oft gerade sehen will.`,
    html: listHTML((it) => variantC(it, 'Andy')),
  },
  {
    id: 'd',
    kicker: 'Variante D',
    title: 'Eine Zeile kostet nur, was sie an Unterschied trägt',
    body: `Kein Schalter, keine Geste: der Cluster rendert <em>eine</em> Zeile, solange die Kinder nichts
           Eigenes sagen — gleiche Menge, gleicher Zustand, niemand hat etwas beansprucht. Sobald sie sich
           unterscheiden (Andy 2 · Leonardo 3, oder Sia hat schon gepackt), klappt genau dieses Item auf.
           Zahnbürste und Badeschuhe sind eine Zeile, kurze Hosen und Regenjacke sind es nicht.`,
    cost: `${COSTS.D} Zeilen — ohne dass jemand etwas tippt. Kosten: die Liste <em>strukturiert sich um</em>,
           wenn man packt, und genau das verbietet die heutige Regel „Cluster-vs-flach wird über die volle
           Menge entschieden". Diese Variante ist nur zu haben, wenn diese Regel bewusst fällt.`,
    html: listHTML(variantD),
  },
]

const page = `<!doctype html>
<html lang="de" data-theme="mocha"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Pro-Person-Zeilen auf M4 — Varianten</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>${css}
/* Variant-sheet chrome only — everything inside a phone is the prototype's. */
body{padding:0;margin:0;display:block;min-height:0}
.vwrap{max-width:1760px;margin:0 auto;padding:28px 20px 70px}
.vhead{max-width:74ch;margin-bottom:8px}
.vhead .k{font:600 11.5px/1 var(--ui);letter-spacing:.12em;text-transform:uppercase;color:var(--peach)}
.vhead h1{font:600 30px/1.15 var(--display);margin:10px 0 12px}
.vhead p{margin:0 0 10px;color:var(--sub0);font-size:15px;line-height:1.62}
.vhead code{font-size:12.5px;background:var(--base);padding:1px 5px;border-radius:6px;color:var(--sub1)}
.vnote{max-width:74ch;margin:18px 0 30px;padding:13px 15px;border-radius:14px;
  background:var(--base);border:1px solid var(--s0);color:var(--sub1);font-size:13.5px;line-height:1.6}
.vnote b{color:var(--text)}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(306px,1fr));gap:26px;align-items:start}
.vcol{display:flex;flex-direction:column;gap:12px;min-width:0}
.vcap{min-height:210px}
.vcap .k{font:600 11.5px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--peach)}
.vcap.base .k{color:var(--o1)}
.vcap h2{font:600 18px/1.25 var(--display);margin:7px 0 7px}
.vcap p{margin:0 0 8px;color:var(--sub0);font-size:13px;line-height:1.58}
.vcap .cost{color:var(--peach);font-size:12.5px;line-height:1.55;display:block}
.vcap.base .cost{color:var(--o2)}
/* No fixed height: the whole point being judged is how many lines a variant
   costs, and a scroll frame is exactly what hides that. */
.phone{width:100%;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);display:flex;flex-direction:column;align-self:start}
.phone .bar{padding:11px 14px;border-bottom:1px solid var(--s0);background:var(--crust);
  font:600 13px/1 var(--ui);color:var(--sub0);display:flex;gap:8px;align-items:center}
.phone .bar .grow{flex:1}
.phone .bar .n{font-size:11.5px;font-weight:700;color:var(--peach)}
.phone .body{flex:1;padding:12px 12px 20px}

/* --- the bits the variants add on top of the prototype's row grammar --- */
.ppcluster.shut{padding-bottom:2px}
.pphead.tap{cursor:pointer}
.ppcaret{color:var(--o1);font-size:11px;width:10px;flex:none}
.pphead .ppmode,.li .ppmode{font-size:13px}
.ppfaces{display:inline-flex;align-items:center;gap:3px;margin-left:2px}
.ppface{position:relative;display:inline-grid;place-items:center}
.ppface .mini-av{width:19px;height:19px;font-size:9.5px}
.ppface.packed .mini-av{box-shadow:0 0 0 2px var(--green)}
.ppface .ppn{position:absolute;right:-3px;bottom:-3px;background:var(--s1);color:var(--sub1);
  font:700 8.5px/1 var(--ui);font-style:normal;border-radius:6px;padding:1px 3px}
.ppinline .name{margin-bottom:2px}
.ppwho{display:flex;align-items:center;gap:7px;margin-top:3px}
.ppwho .desc{margin-top:0}
.ppbtnrow{display:flex;flex-wrap:wrap;gap:6px;margin-top:7px}
.ppbtn{display:inline-flex;align-items:center;gap:5px;padding:4px 8px 4px 4px;border-radius:999px;
  border:1px solid var(--s0);background:var(--base);color:var(--sub1);cursor:pointer;font-family:var(--ui)}
.ppbtn .mini-av{width:20px;height:20px;font-size:10px}
.ppbtn i{font-style:normal;font-size:11px;font-weight:700;color:var(--sub0)}
.ppbtn.on{border-color:var(--green);background:rgba(166,227,161,.12)}
.ppbtn.on i{color:var(--green)}
.ppmore{cursor:pointer;padding-left:14px}
.ppmore .desc{margin-top:0}
.ppmore .ppcaret{margin-left:auto}
.li.ppinline{align-items:flex-start}
.li.ppinline .check,.li.ppinline .stepper{margin-top:1px}
</style></head>
<body>
<svg style="display:none">
  <symbol id="i-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"
    stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></symbol>
</svg>

<div class="vwrap">
  <div class="vhead">
    <div class="k">M4 · FR-25.1 / FR-25.21 / FR-25.22</div>
    <h1>Ein Item, das mehrere Reisende brauchen, kostet heute eine Zeile pro Person</h1>
    <p>Der Befund des Owners (2026-09-11): auf der Packliste wird es unübersichtlich, sobald mehrere
      Reisende dasselbe Element brauchen. FR-25.1s Cluster nennt das Item zwar nur einmal, aber er spart
      keine einzige Zeile — er fügt eine hinzu. Bei vier Reisenden ist eine Zahnbürste fünf Zeilen, und
      zwölf solche Items sind sechzig.</p>
    <p>Alle vier Varianten rendern <b>dieselbe Reise</b>: vier Reisende, vier Pro-Person-Items (eines mit
      ungleichen Mengen, eines halb gepackt, eines nur für zwei) und zwei gemeinsame Items. Die Zahl in
      jeder Kopfzeile ist die gerenderte Zeilenzahl — so wie ein Mensch Zeilen zählt.</p>
  </div>

  <div class="vnote">
    <b>Was die Varianten nicht antasten.</b> Das Datenmodell bleibt in allen vieren unverändert: jede
    Person ist weiterhin eine eigene <code>trip_items</code>-Zeile mit eigener Menge und eigenem Zustand
    (FR-25.21, ADR-036). Es geht hier ausschließlich um die <b>Darstellung</b> — und der Bruch im Kopf
    zählt in allen Varianten Einheiten, nicht Personen (FR-25.22).
  </div>

  <div class="vgrid">
    ${VARIANTS.map(
      (v) => `
    <div class="vcol">
      <div class="vcap${v.id === 'today' ? ' base' : ''}">
        <div class="k">${v.kicker}</div>
        <h2>${v.title}</h2>
        <p>${v.body}</p>
        <span class="cost">${v.cost}</span>
      </div>
      <div class="phone">
        <div class="bar"><span class="grow">Packliste · Sommerferien</span><span class="n">${v.kicker}</span></div>
        <div class="body">${v.html}</div>
      </div>
    </div>`,
    ).join('')}
  </div>
</div>

<script>
/* Only enough interaction to judge the shapes: folding in A/C, packing in B. */
document.addEventListener('click', (e) => {
  const fold = e.target.closest('[data-fold]')
  if (fold) {
    const cluster = fold.closest('.ppcluster')
    const kids = cluster.querySelector('.ppkids')
    const caret = fold.querySelector('.ppcaret')
    if (fold.classList.contains('ppmore')) { fold.style.opacity = .45; return }
    cluster.classList.toggle('shut')
    if (kids) kids.style.display = cluster.classList.contains('shut') ? 'none' : ''
    if (caret) caret.textContent = cluster.classList.contains('shut') ? '▸' : '▾'
    return
  }
  const btn = e.target.closest('.ppbtn')
  if (btn) btn.classList.toggle('on')
})
</script>
</body></html>
`

writeFileSync(join(here, 'UI_Concept_PerPersonRows_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_PerPersonRows_variants.html')
