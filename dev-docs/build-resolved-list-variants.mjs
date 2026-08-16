/**
 * Builds UI_Concept_ResolvedList_variants.html from the prototype's own
 * stylesheet — same approach as build-group-peek-variants.mjs, and for the same
 * reason: three forms judged in the language they would live in.
 *
 * Question: from a Ferien-Vorlage, how do you see **what a trip would actually
 * get**? M8's resolution footer states a number and nothing else.
 *
 * Run: node dev-docs/build-resolved-list-variants.mjs
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
<title>Alle resultierenden Artikel — Varianten</title>
<style>${css}
body{padding:0;margin:0}
.vwrap{max-width:1320px;margin:0 auto;padding:28px 20px 60px}
.vhead{max-width:72ch;margin-bottom:26px}
.vhead h1{font:600 27px/1.15 var(--display);margin:0 0 10px}
.vhead p{margin:0 0 8px;color:var(--sub0);font-size:14.5px;line-height:1.6}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(390px,1fr));gap:26px;align-items:start}
.vcol{display:flex;flex-direction:column;gap:12px}
.vcap .k{font:600 11.5px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--peach)}
.vcap h2{font:600 18px/1.2 var(--display);margin:6px 0 6px}
.vcap p{margin:0 0 6px;color:var(--sub0);font-size:13px;line-height:1.55}
.vcap .cost{color:var(--peach);font-size:12.5px}
.phone{width:390px;height:720px;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
.phone .bar{padding:11px 14px;border-bottom:1px solid var(--s0);background:var(--crust);
  font:600 13px/1 var(--ui);color:var(--sub0)}
.phone .body{flex:1;overflow:auto;padding:12px 12px 20px;position:relative}
.rl{padding:2px 0}
.rl .row{display:flex;gap:10px;align-items:flex-start;padding:9px 12px;border-top:1px solid var(--s0)}
.rl .row:first-child{border-top:0}
.rl .nm{font-size:14.5px;font-weight:600}
.rl .src{font-size:12px;color:var(--o0);margin-top:2px}
.rl .qty{margin-left:auto;color:var(--sub0);font-size:12.5px;white-space:nowrap}
.tagx{display:inline-block;font-size:10.5px;letter-spacing:.04em;padding:1px 6px;border-radius:999px;
  border:1px solid var(--s1);color:var(--sub0);margin-left:6px;vertical-align:1px}
.tagx.merge{border-color:var(--sapphire);color:var(--sapphire)}
.tagx.pp{border-color:var(--green);color:var(--green)}
.tagx.cond{border-color:var(--peach);color:var(--peach)}
.foot{margin:10px 0 0;padding:11px 13px;border-radius:12px;background:var(--base);border:1px solid var(--s0);cursor:pointer}
.foot .big{font:600 16px/1.2 var(--display)}
.foot .ln{font-size:12.5px;color:var(--sub0);margin-top:3px}
.foot .more{font-size:12.5px;color:var(--sapphire);margin-top:6px}
.sheet h3{font:600 17px/1.2 var(--display);margin:0 0 2px}
.sheet .sub{color:var(--sub0);font-size:12.5px;margin-bottom:8px}
.secthead{display:flex;align-items:center;gap:8px;font:600 11.5px/1 var(--ui);letter-spacing:.1em;
  text-transform:uppercase;color:var(--o0);padding:13px 12px 7px}
.secthead .n{margin-left:auto;letter-spacing:0;font-size:11.5px}
</style></head>
<body>
<div class="vwrap">
  <div class="vhead">
    <h1>Was kommt am Ende dabei heraus?</h1>
    <p>M8 sagt heute „<em>9 items resolved · 2 Gruppen + 3 eigene Positionen</em>“ — und lässt dich die
      neun nicht sehen. Die Zahl beantwortet „wie viel“, nie „was“: ob das Stativ dabei ist, ob die
      Kamera wirklich nur einmal kommt, ob die Regenjacke pro Person fällt.</p>
    <p>Drei Formen, dieselbe Vorlage <em>Fotoreise (Beispiel)</em>: zwei Gruppen, die sich die Kamera
      teilen, plus drei eigene Positionen. Die Kosten stehen unter der Variante.</p>
  </div>
  <div class="vgrid" id="grid"></div>
</div>

<script>
/* The seeded example: two photo groups sharing the camera, three own rows. */
const ROWS = [
  { name:'Kamera', qty:'1×', from:['Makro Fotografie','Wildlife Fotografie'], merge:true },
  { name:'Ersatzakkus', qty:'2×', from:['Makro Fotografie'] },
  { name:'Makro-Objektiv', qty:'1×', from:['Makro Fotografie'] },
  { name:'Regenjacke', qty:'1× p.P.', from:['eigene Position'], perPerson:true },
  { name:'Reiseapotheke', qty:'1×', from:['eigene Position'] },
  { name:'Ringlicht', qty:'1×', from:['Makro Fotografie'] },
  { name:'Sonnencreme', qty:'1×', from:['eigene Position'], cond:'kaufen' },
  { name:'Stativ', qty:'1×', from:['Wildlife Fotografie'] },
  { name:'Teleobjektiv', qty:'1×', from:['Wildlife Fotografie'] },
]
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))

function marks(r){
  let out = ''
  if (r.merge) out += '<span class="tagx merge">nur 1×</span>'
  if (r.perPerson) out += '<span class="tagx pp">pro Person</span>'
  if (r.cond) out += '<span class="tagx cond">' + esc(r.cond) + '</span>'
  return out
}

/* A — flat, as the packing list will read, with provenance under each name. */
function flat(){
  return '<div class="card rl">' + ROWS.map((r) =>
    '<div class="row"><div class="grow"><div class="nm">' + esc(r.name) + marks(r) + '</div>' +
    '<div class="src">aus ' + r.from.map(esc).join(' & ') + '</div></div>' +
    '<div class="qty">' + esc(r.qty) + '</div></div>').join('') + '</div>'
}

/* B — grouped by where it comes from. */
function grouped(){
  const order = ['Makro Fotografie','Wildlife Fotografie','eigene Position']
  return order.map((src) => {
    const rows = ROWS.filter((r) => r.from[0] === src)
    if (!rows.length) return ''
    const head = src === 'eigene Position' ? 'Eigene Positionen' : src
    return '<div class="secthead">' + esc(head) + '<span class="n"></span></div><div class="card rl">' +
      rows.map((r) => '<div class="row"><div class="grow"><div class="nm">' + esc(r.name) + marks(r) +
        '</div>' + (r.merge ? '<div class="src">auch in ' + esc(r.from[1]) + '</div>' : '') +
        '</div><div class="qty">' + esc(r.qty) + '</div></div>').join('') + '</div>'
  }).join('')
}

const VARIANTS = [
  { key:'A', title:'Footer öffnet die Liste', sheet:true, render:flat,
    why:'Der Auflösungs-Footer — die Stelle, die heute die Zahl nennt — wird tippbar und öffnet das ' +
        'bestehende Peek-Sheet (FR-27.12) auf die Vorlage selbst. Flach und alphabetisch, so wie die ' +
        'Packliste später liest, mit der Herkunft unter jedem Namen.',
    cost:'Kosten: eine Ebene. Man verlässt den Editor kurz — aber nur zum Lesen, nichts wird bearbeitet.' },
  { key:'B', title:'Nach Herkunft gruppiert', sheet:true, render:grouped,
    why:'Dasselbe Sheet, aber nach Quelle gegliedert: was kommt aus welcher Gruppe, was ist eigene ' +
        'Position. Beantwortet „woher stammt das“ direkt und macht die Struktur der Vorlage sichtbar.',
    cost:'Kosten: beantwortet nicht „was kriege ich“ ohne Kopfrechnen — geteilte Artikel stehen einmal, ' +
         'aber unter einer der beiden Gruppen, und die Liste liest sich nie wie die spätere Packliste.' },
  { key:'C', title:'Footer klappt auf', sheet:false, render:flat,
    why:'Kein Overlay: der Footer selbst wächst und zeigt die Liste unter der Zahl. Der Editor bleibt ' +
        'vollständig sichtbar, man kann Positionen ändern und das Ergebnis daneben lesen.',
    cost:'Kosten: der Footer sitzt unten. Bei neun Artikeln schiebt er sich über den halben Editor, bei ' +
         'dreissig scrollt man in einer Seite, die schon scrollt.' },
]

function phone(v){
  const footer = '<div class="foot"><div class="big">9 Artikel</div>' +
    '<div class="ln">2 Gruppen + 3 eigene Positionen</div>' +
    '<div class="ln" style="color:var(--sapphire)">⇄ Kamera nur 1× — in Makro &amp; Wildlife</div>' +
    '<div class="more">' + (v.sheet ? 'Alle 9 Artikel ansehen ›' : 'Alle 9 Artikel ⌃') + '</div></div>'
  const editorStub =
    '<div class="secthead">Gruppen<span class="n">2</span></div>' +
    '<div class="card rl"><div class="row"><div class="grow"><div class="nm">Makro Fotografie</div>' +
    '<div class="src">4 Artikel · Ersatzakkus · Kamera +2</div></div><div class="qty">›</div></div>' +
    '<div class="row"><div class="grow"><div class="nm">Wildlife Fotografie</div>' +
    '<div class="src">3 Artikel · Kamera · Stativ +1</div></div><div class="qty">›</div></div></div>' +
    '<div class="secthead">Eigene Positionen<span class="n">3</span></div>' +
    '<div class="card rl"><div class="row"><div class="grow"><div class="nm">Regenjacke</div>' +
    '<div class="src">pro Person</div></div><div class="qty">1×</div></div></div>'

  if (v.sheet) {
    return '<div class="phone"><div class="bar">‹ Fotoreise (Beispiel)</div><div class="body">' +
      editorStub + footer +
      '<div class="scrim open"></div><div class="sheet open"><div class="handle"></div>' +
      '<div class="sheet-body"><h3>Fotoreise (Beispiel)</h3>' +
      '<div class="sub">9 Artikel · so, wie sie auf die Packliste kämen</div>' +
      v.render() + '</div></div></div></div>'
  }
  return '<div class="phone"><div class="bar">‹ Fotoreise (Beispiel)</div><div class="body">' +
    editorStub + footer + '<div style="margin-top:8px">' + v.render() + '</div></div></div>'
}

document.getElementById('grid').innerHTML = VARIANTS.map((v) =>
  '<div class="vcol"><div class="vcap"><span class="k">Variante ' + v.key + '</span>' +
  '<h2>' + v.title + '</h2><p>' + v.why + '</p><p class="cost">' + v.cost + '</p></div>' +
  phone(v) + '</div>').join('')
</script>
</body></html>
`

writeFileSync(join(here, 'UI_Concept_ResolvedList_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_ResolvedList_variants.html')
