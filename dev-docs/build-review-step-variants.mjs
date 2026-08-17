/**
 * Builds UI_Concept_ReviewStep_variants.html from the prototype's stylesheet —
 * same approach as the group-peek and resolved-list rounds.
 *
 * Question: M3 step 4 is called a review and only lets you change the *amount*.
 * What should you be able to decide before the trip exists — and where does
 * that editing live, given M4 and the M5 sheet already do all of it?
 *
 * Run: node dev-docs/build-review-step-variants.mjs
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
<title>Vor dem Anlegen bearbeiten — Varianten</title>
<style>${css}
body{padding:0;margin:0}
.vwrap{max-width:1320px;margin:0 auto;padding:28px 20px 60px}
.vhead{max-width:74ch;margin-bottom:26px}
.vhead h1{font:600 27px/1.15 var(--display);margin:0 0 10px}
.vhead p{margin:0 0 8px;color:var(--sub0);font-size:14.5px;line-height:1.6}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(390px,1fr));gap:26px;align-items:start}
.vcol{display:flex;flex-direction:column;gap:12px}
.vcap .k{font:600 11.5px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--peach)}
.vcap h2{font:600 18px/1.2 var(--display);margin:6px 0 6px}
.vcap p{margin:0 0 6px;color:var(--sub0);font-size:13px;line-height:1.55}
.vcap .cost{color:var(--peach);font-size:12.5px}
.phone{width:390px;height:730px;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
.phone .bar{padding:11px 14px;border-bottom:1px solid var(--s0);background:var(--crust);
  font:600 13px/1 var(--ui);color:var(--sub0)}
.phone .body{flex:1;overflow:auto;padding:12px 12px 20px;position:relative}
.rw{display:flex;gap:9px;align-items:center;padding:10px 12px;border-top:1px solid var(--s0)}
.rw:first-child{border-top:0}
.rw .nm{font-size:14.5px;font-weight:600}
.rw .sub{font-size:12px;color:var(--o0);margin-top:2px}
.rw.gone .nm,.rw.gone .sub{opacity:.45;text-decoration:line-through}
.step{display:flex;align-items:center;gap:6px;flex:none}
.step b{min-width:26px;text-align:center;font:600 14px/1 var(--ui)}
.sbtn{width:28px;height:28px;border-radius:9px;border:1px solid var(--s1);display:grid;place-items:center;
  color:var(--sub0);font-size:15px;background:var(--base);cursor:pointer}
.xbtn{width:28px;height:28px;border-radius:50%;border:1px solid var(--s1);display:grid;place-items:center;
  color:var(--o0);font-size:13px;background:none;cursor:pointer;flex:none}
.chipx{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--s1);color:var(--sub0)}
.chipx.buy{border-color:var(--peach);color:var(--peach)}
.chipx.pp{border-color:var(--green);color:var(--green)}
.chipx.skip{border-color:var(--o0);color:var(--o0)}
.hint{font-size:12px;color:var(--sapphire);margin-top:3px}
.secthead{display:flex;align-items:center;gap:8px;font:600 11.5px/1 var(--ui);letter-spacing:.1em;
  text-transform:uppercase;color:var(--o0);padding:13px 12px 7px}
.secthead .n{margin-left:auto;letter-spacing:0}
.qa{display:flex;gap:8px;align-items:center;margin:10px 0 0;padding:10px 12px;border-radius:12px;
  border:1px dashed var(--s1);color:var(--o0);font-size:13.5px}
.cta{margin:12px 0 0;padding:13px;border-radius:12px;background:var(--sapphire);color:var(--crust);
  text-align:center;font:600 15px/1 var(--ui)}
.sheet h3{font:600 17px/1.2 var(--display);margin:0 0 2px}
.sheet .sub2{color:var(--sub0);font-size:12.5px;margin-bottom:10px}
.glance{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.frow{display:flex;align-items:center;gap:10px;padding:11px 2px;border-top:1px solid var(--s0)}
.frow .lbl{font-size:13.5px}
.frow .val{margin-left:auto;color:var(--sub0);font-size:13px}
.note{margin:10px 12px 0;font-size:12px;color:var(--o0)}
</style></head>
<body>
<div class="vwrap">
  <div class="vhead">
    <h1>„Review“ heisst heute: die Menge</h1>
    <p>M3 Schritt 4 zeigt jede erzeugte Zeile und lässt genau eine Sache ändern — die <em>Anzahl</em>.
      Nicht: eine Zeile rauswerfen, die man dieses Mal nicht braucht; nicht: „kaufen statt packen“;
      nicht: die Zuständigkeit; nicht: etwas ergänzen, das man beim Durchlesen vermisst. Das alles
      geht erst, wenn die Reise existiert.</p>
    <p><strong>Die eigentliche Frage ist nicht „welche Felder“, sondern <em>wo</em>.</strong> M4 und das
      M5-Sheet können das alles bereits. Jeder Editor im Wizard ist ein zweiter Ort für dieselbe
      Regel — und der zweite Ort ist der, der später auseinanderläuft.</p>
  </div>
  <div class="vgrid" id="grid"></div>
</div>

<script>
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))
const ROWS = [
  { name:'Kamera', sub:'Technik · aus Makro & Wildlife', qty:1 },
  { name:'Ersatzakkus', sub:'Technik · aus Makro', qty:2, hint:'2024: 4 · 2025: 4 → 4 übernehmen' },
  { name:'Regenjacke', sub:'Andy', qty:1, pp:true },
  { name:'Regenjacke', sub:'Sia', qty:1, pp:true },
  { name:'Sonnencreme', sub:'Bad · vor der Reise kaufen', qty:1, buy:true },
  { name:'Stativ', sub:'Technik · aus Wildlife', qty:1, gone:true },
  { name:'Reiseapotheke', sub:'Bad · eigene Position', qty:1 },
]

const stepper = (r) => '<div class="step"><span class="sbtn">−</span><b>' + r.qty +
  '</b><span class="sbtn">+</span></div>'

/* A — the row itself carries the decisions. */
function inline(){
  return '<div class="card">' + ROWS.map((r) =>
    '<div class="rw' + (r.gone ? ' gone' : '') + '">' +
    '<div class="grow"><div class="nm">' + esc(r.name) +
      (r.pp ? ' <span class="chipx pp">pro Person</span>' : '') +
      (r.buy ? ' <span class="chipx buy">kaufen</span>' : '') +
      (r.gone ? ' <span class="chipx skip">weggelassen</span>' : '') + '</div>' +
    '<div class="sub">' + esc(r.sub) + '</div>' +
    (r.hint ? '<div class="hint">' + esc(r.hint) + '</div>' : '') + '</div>' +
    (r.gone ? '<span class="xbtn">↺</span>' : stepper(r) + '<span class="xbtn">✕</span>') +
    '</div>').join('') + '</div>' +
    '<div class="qa">＋ Etwas ergänzen, das fehlt…</div>' +
    '<div class="cta">Reise anlegen · 6 Artikel</div>'
}

/* B — the row opens the M5 sheet, in its reduced form. */
function sheetVariant(){
  return '<div class="card">' + ROWS.slice(0, 5).map((r) =>
    '<div class="rw"><div class="grow"><div class="nm">' + esc(r.name) +
    (r.pp ? ' <span class="chipx pp">pro Person</span>' : '') + '</div>' +
    '<div class="sub">' + esc(r.sub) + '</div></div>' +
    '<div class="step"><b>' + r.qty + '×</b></div><span class="xbtn">›</span></div>').join('') + '</div>' +
    '<div class="cta">Reise anlegen · 6 Artikel</div>' +
    '<div class="scrim open"></div><div class="sheet open"><div class="handle"></div>' +
    '<div class="sheet-body"><h3>Sonnencreme</h3>' +
    '<div class="sub2">wird mit der Reise angelegt</div>' +
    '<div class="glance"><span class="chipx">1×</span><span class="chipx buy">kaufen</span>' +
    '<span class="chipx">Bad</span></div>' +
    '<div class="frow"><span class="lbl">Menge</span><span class="val">− 1 +</span></div>' +
    '<div class="frow"><span class="lbl">Beschaffung</span><span class="val">Vor der Reise kaufen ›</span></div>' +
    '<div class="frow"><span class="lbl">Zuständig</span><span class="val">niemand ›</span></div>' +
    '<div class="frow"><span class="lbl">Weglassen</span><span class="val">✕</span></div>' +
    '<div class="note">Packen, Kommentare und Vorbereitung erscheinen erst auf der Reise.</div>' +
    '</div></div>'
}

/* C — don't build an editor: create, then edit on the real screen. */
function summary(){
  return '<div class="card">' +
    '<div class="rw"><div class="grow"><div class="nm">6 Artikel</div>' +
    '<div class="sub">aus 1 Ferien-Vorlage · 2 Gruppen</div></div></div>' +
    '<div class="rw"><div class="grow"><div class="nm">⇄ Kamera nur 1×</div>' +
    '<div class="sub">in Makro &amp; Wildlife</div></div></div>' +
    '<div class="rw"><div class="grow"><div class="nm">📋 1 Vorbereitungs-Aufgabe</div>' +
    '<div class="sub">Akkus laden · an Kamera</div></div></div>' +
    '<div class="rw"><div class="grow"><div class="nm">🛒 1 Artikel zu kaufen</div>' +
    '<div class="sub">Sonnencreme</div></div></div></div>' +
    '<div class="secthead">Mengen aus der Historie<span class="n">1</span></div>' +
    '<div class="card"><div class="rw"><div class="grow"><div class="nm">Ersatzakkus</div>' +
    '<div class="hint">2024: 4 · 2025: 4 → 4 übernehmen</div></div>' + stepper({qty:2}) + '</div></div>' +
    '<div class="cta">Reise anlegen und öffnen</div>' +
    '<div class="note">Alles Weitere änderst du gleich auf der Packliste — dort, wo du es später auch änderst.</div>'
}

const VARIANTS = [
  { key:'A', title:'Die Zeile kann alles', render:inline,
    why:'Jede Zeile trägt ihre Entscheidungen selbst: Menge, ✕ zum Weglassen (die Zeile bleibt sichtbar und durchgestrichen — FR-5.5 „bewusst weggelassen“, nicht spurlos weg), Chips für „kaufen“ und „pro Person“, und unten eine Ergänzen-Zeile. Kein Overlay, alles auf einer Fläche.',
    cost:'Kosten: die Zeile wird voll, und jede weitere Entscheidung macht sie voller. Umbenennen und Kategorien passen nicht mehr hinein — irgendwann ist es doch ein Editor, nur einer ohne Platz.' },
  { key:'B', title:'Das M5-Sheet, vorgezogen', render:sheetVariant,
    why:'Die Zeile öffnet dasselbe Sheet wie auf der Packliste, in reduzierter Form: Menge, Beschaffung, Zuständigkeit, Weglassen. Packen, Kommentare und Vorbereitung fehlen sichtbar, weil es sie ohne Reise nicht gibt. Eine Grammatik, zwei Zeitpunkte.',
    cost:'Kosten: ein zweiter Zustand desselben Sheets. Jedes künftige Feld muss beantworten „gibt es mich vor der Reise?“ — und die Antwort steht dann an zwei Stellen im Code.' },
  { key:'C', title:'Gar nicht hier bearbeiten', render:summary,
    why:'Schritt 4 wird ehrlich zur Zusammenfassung — was entsteht, was zusammengeführt wurde, was zu kaufen ist, welche Mengen die Historie vorschlägt — und der Knopf legt an und öffnet M4. Dort bearbeitest du mit den Werkzeugen, mit denen du es auch nächste Woche tust.',
    cost:'Kosten: „anlegen“ fühlt sich verbindlicher an als „weiter“. Wer eine Zeile schon im Wizard sicher nicht will, muss sie einmal entstehen lassen — und Archivieren/Löschen der ganzen Reise ist der einzige Rückweg.' },
]

document.getElementById('grid').innerHTML = VARIANTS.map((v) =>
  '<div class="vcol"><div class="vcap"><span class="k">Variante ' + v.key + '</span>' +
  '<h2>' + v.title + '</h2><p>' + v.why + '</p><p class="cost">' + v.cost + '</p></div>' +
  '<div class="phone"><div class="bar">‹ Neue Reise · Schritt 4/4</div>' +
  '<div class="body">' + v.render() + '</div></div></div>').join('')
</script>
</body></html>
`

writeFileSync(join(here, 'UI_Concept_ReviewStep_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_ReviewStep_variants.html')
