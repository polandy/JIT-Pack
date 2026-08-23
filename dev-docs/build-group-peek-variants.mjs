/**
 * Builds UI_Concept_GroupPeek_variants.html from the prototype's own stylesheet.
 *
 * The three variants have to be judged in the same visual language as the
 * screen they would live in, so the CSS is lifted verbatim from
 * UI_Concept_Prototype.html rather than re-written — a variant that looks
 * different because its stylesheet differs teaches nothing.
 *
 * Run: node dev-docs/build-group-peek-variants.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const proto = readFileSync(join(here, 'UI_Concept_Prototype.html'), 'utf8')
const css = proto.slice(proto.indexOf('<style>') + 7, proto.indexOf('</style>'))

const page = `<!doctype html>
<html lang="de" data-theme="mocha"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Gruppe anschauen — Varianten</title>
<style>${css}
/* Variant-sheet chrome only — everything inside a phone is the prototype's. */
body{padding:0;margin:0}
.vwrap{max-width:1320px;margin:0 auto;padding:28px 20px 60px}
.vhead{max-width:70ch;margin-bottom:26px}
.vhead h1{font:600 27px/1.15 var(--display);margin:0 0 10px}
.vhead p{margin:0 0 8px;color:var(--sub0);font-size:14.5px;line-height:1.6}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(390px,1fr));gap:26px;align-items:start}
.vcol{display:flex;flex-direction:column;gap:12px}
.vcap .k{font:600 11.5px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--peach)}
.vcap h2{font:600 18px/1.2 var(--display);margin:6px 0 6px}
.vcap p{margin:0 0 6px;color:var(--sub0);font-size:13px;line-height:1.55}
.vcap .cost{color:var(--peach);font-size:12.5px}
.phone{width:390px;height:660px;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
.phone .bar{padding:11px 14px;border-bottom:1px solid var(--s0);background:var(--crust);
  font:600 13px/1 var(--ui);color:var(--sub0);display:flex;gap:8px;align-items:center}
.phone .body{flex:1;overflow:auto;padding:12px 12px 20px;position:relative}
.peekitems{padding:2px 0 6px 46px}
.peekitems .pi{display:flex;gap:8px;align-items:center;padding:5px 10px 5px 0;font-size:13.5px}
.peekitems .pi .dot{width:5px;height:5px;border-radius:50%;background:var(--o0);flex:none}
.peekitems .pi .q{margin-left:auto;color:var(--o0);font-size:12px}
/* .scrim/.sheet are the prototype's own — the peek uses them verbatim, open
   modifier included, rather than a second sheet implementation beside them. */
.sheet h3{font:600 17px/1.2 var(--display);margin:0 0 2px}
.sheet .sub{color:var(--sub0);font-size:12.5px;margin-bottom:10px}
.chev{width:26px;height:26px;border-radius:8px;border:1px solid var(--s0);display:grid;place-items:center;
  flex:none;color:var(--sub0);font-size:12px;cursor:pointer;background:var(--mantle)}
.tplrow .grow{min-width:0}
</style></head>
<body>
<div class="vwrap">
  <div class="vhead">
    <h1>Looking inside a group before taking it</h1>
    <p>M3 step 3 shows „Makro Fotografie · 5 Artikel“ today — <em>which</em> five, the screen does not say.
      The content is visible only in the M8 editor, and getting there costs the wizard draft.
      The M8 group picker and the M14 retarget picker have the same gap.</p>
    <p>Three forms, the same data. Each one is clickable — the cost is written under the variant.</p>
  </div>
  <div class="vgrid" id="grid"></div>
</div>

<script>
/* The two photo groups from the owner's scenario, sharing the camera. */
const GROUPS = [
  { id:'g-makro', emoji:'📷', name:'Makro Fotografie',
    items:[['Kamera',1],['Makro-Objektiv',1],['Ringlicht',1],['Zwischenringe',2],['Stativ',1]] },
  { id:'g-wild', emoji:'🦌', name:'Wildlife Fotografie',
    items:[['Kamera',1],['Teleobjektiv',1],['Stativ',1],['Tarnzelt',1]] },
  { id:'g-camp', emoji:'⛺', name:'Camping Basis',
    items:[['Zelt',1],['Schlafsack',2],['Isomatte',2],['Gaskocher',1],['Stirnlampe',2],['Kaffeekanne',1]] },
]
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
const picked = {}

function checkbox(g){
  return '<div class="check ' + (picked[g.id] ? 'on' : '') + '" data-pick="' + g.id + '">' +
    '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3" d="M5 13l4 4 10-10"/></svg></div>'
}

/* A — the peek is its own surface, the M5/M8 sheet grammar. */
function variantA(g){
  return '<div class="tplrow" style="display:flex;gap:11px;align-items:center;padding:11px 12px">' +
    checkbox(g) + '<span style="font-size:20px">' + g.emoji + '</span>' +
    '<div class="grow"><div class="name">' + esc(g.name) + '</div>' +
    '<div class="desc">' + g.items.length + ' Artikel</div></div>' +
    '<div class="chev" data-sheet="' + g.id + '">›</div></div>'
}

/* B — the row unfolds in place. */
function variantB(g, open){
  return '<div class="tplrow" style="display:flex;gap:11px;align-items:center;padding:11px 12px">' +
    checkbox(g) + '<span style="font-size:20px">' + g.emoji + '</span>' +
    '<div class="grow"><div class="name">' + esc(g.name) + '</div>' +
    '<div class="desc">' + g.items.length + ' Artikel</div></div>' +
    '<div class="chev" data-fold="' + g.id + '">' + (open ? '⌃' : '⌄') + '</div></div>' +
    (open ? '<div class="peekitems">' + g.items.map((it) =>
      '<div class="pi"><span class="dot"></span>' + esc(it[0]) +
      (it[1] > 1 ? '<span class="q">×' + it[1] + '</span>' : '') + '</div>').join('') + '</div>' : '')
}

/* C — no interaction at all: the row simply says what is inside. */
function variantC(g){
  const shown = g.items.slice(0, 3).map((i) => esc(i[0])).join(' · ')
  const rest = g.items.length - 3
  return '<div class="tplrow" style="display:flex;gap:11px;align-items:flex-start;padding:11px 12px">' +
    checkbox(g) + '<span style="font-size:20px">' + g.emoji + '</span>' +
    '<div class="grow"><div class="name">' + esc(g.name) + '</div>' +
    '<div class="desc">' + g.items.length + ' Artikel</div>' +
    '<div class="desc" style="margin-top:3px">' + shown + (rest > 0 ? ' +' + rest : '') + '</div></div></div>'
}

const VARIANTS = [
  { key:'A', title:'Peek sheet', render:variantA,
    why:'The chevron opens a sheet over the list — the same grammar as M5 and the M8 position sheet. The list stays where it was; the sheet carries any number of items and fits the M8 picker and M14 unchanged.',
    cost:'Cost: one more layer. On a selection list you tap in and out of it repeatedly.' },
  { key:'B', title:'Unfold the row', render:variantB,
    why:'The chevron unfolds the items under the row. No overlay, no context switch, the checkbox stays within reach — you compare two groups by leaving both open.',
    cost:'Cost: the list jumps. With „Camping Basis“ at 6 items, one open group pushes the next one off screen.' },
  { key:'C', title:'The row says it itself', render:variantC,
    why:'No interaction: the row carries its first three items as a second line. Zero taps, no state, nothing to close — the same idea as „enthält: …“ on the template row in M7.',
    cost:'Cost: it stays a hint. „+2“ does not answer whether the tripod is in there.' },
]

const foldState = {}
function bodyFor(v){
  // Only the sheet variant carries a sheet: an unused one still paints its
  // handle at the foot of the phone and would make B and C look like they had
  // a mechanism they do not have.
  const sheet = v.key === 'A'
    ? '<div class="scrim" data-close="A" data-scrim="A"></div>' +
      '<div class="sheet" data-sheetof="A"><div class="handle"></div>' +
      '<div class="sheet-body" data-body="A"></div></div>'
    : ''
  return '<div class="grouphead">Zusätzliche Gruppen<span class="n">3</span></div>' +
    '<div class="card">' + GROUPS.map((g) => v.render(g, !!foldState[v.key + g.id])).join('') + '</div>' +
    sheet
}

function draw(){
  document.getElementById('grid').innerHTML = VARIANTS.map((v) =>
    '<div class="vcol"><div class="vcap"><span class="k">Variante ' + v.key + '</span>' +
    '<h2>' + v.title + '</h2><p>' + v.why + '</p><p class="cost">' + v.cost + '</p></div>' +
    '<div class="phone"><div class="bar">‹ Neue Reise · Schritt 3/4</div>' +
    '<div class="body" data-vbody="' + v.key + '">' + bodyFor(v) + '</div></div></div>').join('')
  bind()
}

function bind(){
  document.querySelectorAll('[data-pick]').forEach((el) => {
    el.onclick = (e) => { e.stopPropagation(); picked[el.dataset.pick] = !picked[el.dataset.pick]; draw() }
  })
  document.querySelectorAll('[data-fold]').forEach((el) => {
    el.onclick = () => {
      const key = el.closest('[data-vbody]').dataset.vbody + el.dataset.fold
      foldState[key] = !foldState[key]
      draw()
    }
  })
  document.querySelectorAll('[data-sheet]').forEach((el) => {
    el.onclick = () => {
      const vkey = el.closest('[data-vbody]').dataset.vbody
      const g = GROUPS.find((x) => x.id === el.dataset.sheet)
      const body = document.querySelector('[data-body="' + vkey + '"]')
      body.innerHTML = '<h3>' + g.emoji + ' ' + esc(g.name) + '</h3>' +
        '<div class="sub">' + g.items.length + ' Artikel · so, wie sie auf die Packliste kämen</div>' +
        g.items.map((it) => '<div class="li"><div class="grow"><div class="name">' + esc(it[0]) +
          '</div></div><div class="muted" style="font-size:12.5px">×' + it[1] + '</div></div>').join('')
      document.querySelector('[data-scrim="' + vkey + '"]').classList.add('open')
      document.querySelector('[data-sheetof="' + vkey + '"]').classList.add('open')
    }
  })
  document.querySelectorAll('[data-close]').forEach((el) => {
    el.onclick = () => {
      document.querySelector('[data-scrim="' + el.dataset.close + '"]').classList.remove('open')
      document.querySelector('[data-sheetof="' + el.dataset.close + '"]').classList.remove('open')
    }
  })
}

draw()
</script>
</body></html>
`

writeFileSync(join(here, 'UI_Concept_GroupPeek_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_GroupPeek_variants.html')
