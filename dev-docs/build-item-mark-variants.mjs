/**
 * Builds UI_Concept_ItemMark_variants.html from the prototype's own stylesheet.
 *
 * Same reasoning as build-group-peek-variants.mjs: a variant that looks
 * different because its stylesheet differs teaches nothing, so the CSS is
 * lifted verbatim from UI_Concept_Prototype.html and only the sheet chrome and
 * the mark/picker classes are added here. Those carry an `mk-` prefix because
 * the prototype already owns generic names like `.field`.
 *
 * Run: node dev-docs/build-item-mark-variants.mjs
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
<title>Artikel-Marke — Varianten</title>
<style>${css}
/* Variant-sheet chrome only — everything inside a phone is the prototype's. */
body{padding:0;margin:0;display:block;height:auto}
.vwrap{max-width:1720px;margin:0 auto;padding:28px 20px 70px}
.vhead{max-width:76ch;margin-bottom:26px}
.vhead h1{font:600 30px/1.12 var(--display);margin:0 0 12px}
.vhead p{margin:0 0 9px;color:var(--sub0);font-size:14.5px;line-height:1.62}
.vhead em{color:var(--rose);font-style:italic}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:24px;align-items:start}
.vcol{display:flex;flex-direction:column;gap:12px}
.vcap .k{font:600 11.5px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--peach)}
.vcap h2{font:600 18px/1.2 var(--display);margin:6px 0 6px}
.vcap p{margin:0 0 6px;color:var(--sub0);font-size:13px;line-height:1.55}
.vcap .cost{color:var(--peach);font-size:12.5px}
/* The four captions differ in length; without a floor the four phones start at
   four different heights and the rows stop lining up across the columns, which
   is the one thing this comparison needs. */
#grid .vcap{min-height:300px}
@media (max-width:1500px){ #grid .vcap{min-height:0} }
.secthead{margin:46px 0 20px;max-width:76ch}
.secthead h2{font:600 23px/1.2 var(--display);margin:0 0 9px}
.secthead p{margin:0 0 8px;color:var(--sub0);font-size:14px;line-height:1.6}

/* The whole 15-row list must be visible at once: the coverage gaps sit in the
   last section, and a comparison you have to scroll is not a comparison. */
#grid .phone{height:1240px}
.phone{width:100%;max-width:390px;height:720px;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
.phone .bar{padding:11px 14px;border-bottom:1px solid var(--s0);background:var(--crust);
  font:600 13px/1 var(--ui);color:var(--sub0);display:flex;gap:8px;align-items:center}
.phone .bar .grow{flex:1}
.phone .body{flex:1;overflow:auto;padding:12px 14px 22px;position:relative;scrollbar-width:none}
.phone .body::-webkit-scrollbar{display:none}
.phone .grouphead:first-child{margin-top:4px}
.phone .li{gap:11px}
.qty{font-size:12px;font-weight:700;color:var(--o1);font-variant-numeric:tabular-nums;flex:none}

/* ---------- the four marks ---------- */
/* one geometry, four fillings — so the comparison is about the mark, not the frame */
.mark{width:34px;height:34px;border-radius:11px;flex:none;display:grid;place-items:center;
  background:var(--mantle);border:1px solid var(--s0);overflow:hidden;position:relative}
.mark.emoji{font-size:19px;line-height:1}
.mark.line{color:var(--sub1)}
.mark.line svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.6;
  stroke-linecap:round;stroke-linejoin:round}
.mark.photo{border:0;background-size:cover;background-position:center}
.mark.initial{font-size:14px;font-weight:800;color:var(--crust)}
/* a substitute — nothing fitting existed and something near it was used */
.sub-mark::after{content:"";position:absolute;right:3px;bottom:3px;width:6px;height:6px;border-radius:50%;
  background:var(--yellow);box-shadow:0 0 0 2px var(--base)}
.gapnote{margin-top:10px;font-size:11.5px;color:var(--o1);line-height:1.55;display:flex;gap:8px}
.gapnote .dot{width:6px;height:6px;border-radius:50%;background:var(--yellow);flex:none;margin-top:6px}

/* ---------- picker (mk- prefixed: the prototype owns .field/.input) ---------- */
.mk-field{margin-bottom:12px}
.mk-field label{display:block;font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;
  color:var(--o1);margin:0 0 6px 3px}
.mk-input{width:100%;background:var(--mantle);border:1px solid var(--s1);border-radius:12px;color:var(--text);
  font:600 15px var(--ui);padding:11px 13px;outline:none}
.mk-input::placeholder{color:var(--o0);font-weight:500}
.mk-input:focus{border-color:var(--blue)}
.mk-search{position:relative}
.mk-search .mk-input{padding-left:36px;font-weight:500;font-size:14px}
.mk-search svg{position:absolute;left:12px;top:50%;transform:translateY(-50%);width:16px;height:16px;
  fill:none;stroke:var(--o0);stroke-width:2}
.mk-chosen{display:flex;align-items:center;gap:12px;padding:12px 13px;margin-bottom:14px}
.mk-chosen .big{width:52px;height:52px;border-radius:16px;flex:none;display:grid;place-items:center;font-size:28px;
  background:var(--mantle);border:1px solid var(--s0)}
.mk-chosen .lbl{font-size:11.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--o1)}
.mk-chosen .val{font-size:14.5px;font-weight:600;margin-top:3px}
.mk-chosen .clear{margin-left:auto;border:1px solid var(--s0);background:var(--mantle);color:var(--sub0);
  border-radius:10px;font:600 12px var(--ui);padding:7px 11px;cursor:pointer}
.mk-suggest{border-radius:14px;padding:11px 12px 12px;margin-bottom:14px;
  background:rgba(137,180,250,.10);border:1px solid rgba(137,180,250,.26)}
.mk-suggest .h{display:flex;align-items:center;gap:7px;font-size:11.5px;font-weight:700;
  letter-spacing:.07em;text-transform:uppercase;color:var(--blue);margin-bottom:9px}
.mk-suggest .row{display:flex;gap:8px}
.mk-sg{flex:none;width:48px;height:48px;border-radius:13px;display:grid;place-items:center;font-size:24px;cursor:pointer;
  background:var(--base);border:1px solid var(--s0);transition:.14s}
.mk-sg:hover{border-color:var(--blue);transform:translateY(-1px)}
.mk-sg.first{border-color:var(--blue);box-shadow:0 0 0 3px rgba(137,180,250,.16)}
.mk-suggest .none{font-size:12.5px;color:var(--sub0)}
.mk-suggest .why{font-size:11.5px;color:var(--o1);margin-top:9px}
.mk-facets{display:flex;gap:6px;overflow-x:auto;padding:2px 0 10px;scrollbar-width:none}
.mk-facets::-webkit-scrollbar{display:none}
.mk-ff{flex:none;font:600 12px var(--ui);padding:6px 11px;border-radius:20px;cursor:pointer;
  border:1px solid var(--s0);background:var(--mantle);color:var(--sub0)}
.mk-ff.on{background:var(--blue);border-color:var(--blue);color:var(--crust)}
.mk-grid{display:grid;grid-template-columns:repeat(6,1fr);gap:7px}
.mk-eg{aspect-ratio:1;border-radius:12px;display:grid;place-items:center;font-size:22px;cursor:pointer;
  background:var(--base);border:1px solid transparent;transition:.12s}
.mk-eg:hover{background:var(--s0)}
.mk-eg.on{border-color:var(--blue);background:rgba(137,180,250,.14)}
.mk-empty{padding:26px 10px;text-align:center;color:var(--o1);font-size:13px}
.mk-kw{font-size:11.5px;color:var(--o1);margin:12px 3px 0;line-height:1.55}

.notes{margin-top:44px;display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:18px}
.note{padding:16px 17px;border-radius:16px;background:var(--base);border:1px solid var(--s0)}
.note h3{font:600 15.5px var(--display);margin:0 0 8px}
.note p{margin:0 0 7px;font-size:13px;color:var(--sub0);line-height:1.6}
.note ul{margin:6px 0 0;padding-left:17px;font-size:13px;color:var(--sub0);line-height:1.65}
.note strong{color:var(--text)}
.note.warm{border-color:rgba(250,179,135,.3);background:rgba(250,179,135,.07)}
</style></head>
<body>
<div class="vwrap">

  <div class="vhead">
    <h1>Was steht links vom Artikelnamen?</h1>
    <p>Heute steht dort nichts. Ein Foto kann man hochladen (FR-22.1), aber kaum jemand tut es für 40 Zeilen —
      und ein Foto beantwortet „<em>welche</em> Jacke“, nicht „was ist das“ beim Überfliegen.
      Die Frage dieser Runde ist die <em>Marke</em>: das kleine, immer vorhandene Ding links,
      das eine 40-Zeilen-Liste scanbar macht.</p>
    <p>Vier Formen, dieselbe Liste, dieselbe Reise. Der gelbe Punkt auf einer Marke heißt:
      <em>dafür gab es nichts Passendes</em>, hier steht ein Ersatz. Genau dieser Punkt ist die
      eigentliche Entscheidung — die Kosten stehen unter jeder Variante.</p>
  </div>

  <div class="vgrid" id="grid"></div>

  <div class="secthead">
    <h2>Und so würde man sie setzen</h2>
    <p>Der Luxus aus der Frage: der Picker <em>schlägt vor</em>. Er tut das ohne Netz und ohne Modell —
      derselbe Keyword-Index, der die Suche trägt, wird gegen die Tokens des Namens gescort.
      Der Picker unten ist echt: Namen ändern, tippen, suchen.</p>
    <p>Probier <strong>Zahnbürste</strong>, <strong>Kaffeekanne</strong>, <strong>Tarnzelt</strong> — Komposita werden
      zerlegt, deshalb findet „Tarnzelt“ das Zelt. Und dann <strong>Zwischenringe</strong> oder
      <strong>Trekkingstöcke</strong>, damit der Leerfall sichtbar wird.</p>
  </div>

  <div class="vgrid" id="pickergrid"></div>

  <div class="notes" id="notes"></div>
</div>

<script>
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]))

/* ------------------------------------------------------------------ *
 * The list. One real trip, one real mix: things that have an obvious
 * mark, and things that deliberately do not.
 * \`emoji:null\` / \`sub:true\` are honest, not decorative — they carry the
 * coverage argument that the whole round is about.
 * ------------------------------------------------------------------ */
const LIST = [
  { g:'Kleidung', items:[
    { n:'Regenjacke',        q:1, emoji:'🧥', icon:'jacket',
      photo:'radial-gradient(80% 70% at 30% 20%,#7c8aa3,transparent 70%),radial-gradient(70% 90% at 80% 90%,#1f2a3a,transparent 70%),linear-gradient(150deg,#46586f,#22303f)' },
    { n:'Wanderschuhe',      q:1, emoji:'🥾', icon:'boot' },
    { n:'Socken',            q:3, emoji:'🧦', icon:'sock',  iconSub:true },
    { n:'Fleecepullover',    q:1, emoji:'🧶', emojiSub:true, icon:'shirt', iconSub:true },
  ]},
  { g:'Hygiene & Gesundheit', items:[
    { n:'Zahnbürste',        q:2, emoji:'🪥', icon:'brush' },
    { n:'Sonnencreme',       q:1, emoji:'🧴', icon:'bottle' },
    { n:'Erste-Hilfe-Set',   q:1, emoji:'🩹', icon:'aid',
      photo:'radial-gradient(70% 60% at 35% 25%,#f2f2ef,transparent 65%),radial-gradient(80% 80% at 75% 85%,#7f1d1d,transparent 70%),linear-gradient(150deg,#c2413f,#5c1414)' },
  ]},
  { g:'Technik', items:[
    { n:'Kamera',            q:1, emoji:'📷', icon:'camera' },
    { n:'Ladekabel USB-C',   q:2, emoji:'🔌', emojiSub:true, icon:'cable' },
    { n:'Powerbank',         q:1, emoji:'🔋', icon:'battery' },
    { n:'Stirnlampe',        q:2, emoji:'🔦', emojiSub:true, icon:'lamp', iconSub:true },
  ]},
  { g:'Camping', items:[
    { n:'Schlafsack',        q:2, emoji:'🛌', emojiSub:true, icon:'sleep', iconSub:true,
      photo:'radial-gradient(70% 60% at 30% 20%,#4ea36a,transparent 65%),radial-gradient(80% 80% at 80% 90%,#052e16,transparent 70%),linear-gradient(150deg,#1d7a45,#0a3a1e)' },
    { n:'Trekkingstöcke',    q:2, emoji:null,               icon:null },
    { n:'Gaskocher',         q:1, emoji:'🔥', emojiSub:true, icon:'flame', iconSub:true },
    { n:'Wasserflasche',     q:2, emoji:'🧃', emojiSub:true, icon:'bottle', iconSub:true },
  ]},
]
const DONE = new Set(['Wanderschuhe','Zahnbürste','Powerbank'])

/* Line icons drawn in the weight a library like Phosphor/Tabler ships.
   Where such a library genuinely has no match, \`iconSub\` marks the nearest thing. */
const ICONS = {
  jacket:'<path d="M9 3.5 4.5 6.2 6 11.2l1.7-.7v9.9h8.6v-9.9l1.7.7 1.5-5-4.5-2.7"/><path d="M9 3.5 12 7.2l3-3.7"/><path d="M12 7.2v13.2"/>',
  boot:'<path d="M8 3.5h4v8.2l4.6 2.4c1.5.8 2.4 1.7 2.4 3.3v3.1H8V3.5Z"/><path d="M8 16.5h4.5"/>',
  sock:'<path d="M8.5 3.5h4.2v9.2l2.9 3a3 3 0 0 1-4.3 4.2l-4.4-4.5a3.2 3.2 0 0 1-.9-2.2V3.5h2.5Z"/><path d="M8.5 7h4.2"/>',
  shirt:'<path d="M9 4 4 7l2 4 2-1v9h8v-9l2 1 2-4-5-3-3 2-3-2Z"/>',
  brush:'<rect x="6" y="3" width="4.4" height="6.4" rx="1.4"/><path d="M8.2 9.4v11.1"/><path d="M6.6 5h3.2M6.6 6.8h3.2"/>',
  bottle:'<path d="M10 3h4v3l2 3v12H8V9l2-3V3Z"/><path d="M8 13h8"/>',
  aid:'<rect x="3" y="7" width="18" height="12" rx="3"/><path d="M12 10v6M9 13h6"/>',
  camera:'<rect x="3" y="7" width="18" height="13" rx="3"/><circle cx="12" cy="13.5" r="3.5"/><path d="M9 7l1.5-3h3L15 7"/>',
  cable:'<path d="M9.5 3v4.6M14.5 3v4.6"/><rect x="7" y="7.6" width="10" height="4.4" rx="1.4"/><path d="M12 12v3.6a4 4 0 0 0 4 4h2.5"/>',
  battery:'<rect x="3" y="8" width="16" height="9" rx="2"/><path d="M21 11v3"/><path d="M6 11v3M9.5 11v3"/>',
  lamp:'<path d="M3.5 10.5a8.5 8.5 0 0 1 17 0"/><path d="M3.5 10.5v3.5M20.5 10.5v3.5"/><circle cx="12" cy="13.5" r="4"/><path d="M12 17.5v3"/>',
  sleep:'<path d="M3 18v-6a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v6"/><path d="M3 14h18"/>',
  flame:'<path d="M12 3c4 4 6 6 6 10a6 6 0 0 1-12 0c0-2 1-3 2-4 .5 2 2 2 2 0 0-2 1-4 2-6Z"/>',
}
const lineIcon = (k) => k && ICONS[k]
  ? '<svg viewBox="0 0 24 24">' + ICONS[k] + '</svg>'
  : '<svg viewBox="0 0 24 24"><rect x="4" y="6" width="16" height="14" rx="3"/><path d="M9 6V4h6v2"/></svg>'

/* Variant D's fallback: the first letter on a colour derived from the name. */
const HUES = ['--blue','--mauve','--teal','--peach','--sapphire','--pink','--green','--yellow']
const hueOf = (n) => HUES[[...n].reduce((a, c) => a + c.charCodeAt(0), 0) % HUES.length]

function markFor(kind, it){
  if (kind === 'A') return it.emoji
    ? '<div class="mark emoji' + (it.emojiSub ? ' sub-mark' : '') + '">' + it.emoji + '</div>'
    : '<div class="mark emoji" style="color:var(--o0);opacity:.55">–</div>'
  if (kind === 'B') return '<div class="mark line' + (it.icon && !it.iconSub ? '' : ' sub-mark') + '">' + lineIcon(it.icon) + '</div>'
  if (kind === 'C') return it.photo
    ? '<div class="mark photo" style="background-image:' + it.photo + '"></div>'
    : (it.emoji
        ? '<div class="mark emoji' + (it.emojiSub ? ' sub-mark' : '') + '">' + it.emoji + '</div>'
        : '<div class="mark emoji" style="color:var(--o0);opacity:.55">–</div>')
  return '<div class="mark initial" style="background:var(' + hueOf(it.n) + ')">' + esc(it.n[0]) + '</div>'
}

function row(kind, it){
  const done = DONE.has(it.n)
  return '<div class="li' + (done ? ' done' : '') + '">' +
    markFor(kind, it) +
    '<div class="grow"><div class="name">' + esc(it.n) + '</div></div>' +
    (it.q > 1 ? '<span class="qty">×' + it.q + '</span>' : '') +
    '<div class="check' + (done ? ' on' : '') + '">' +
      '<svg viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="3" d="M5 13l4 4 10-10"/></svg>' +
    '</div></div>'
}

function listFor(kind){
  return LIST.map((sec) =>
    '<div class="grouphead">' + esc(sec.g) + '<span class="n">' + sec.items.length + '</span></div>' +
    '<div class="card">' + sec.items.map((it) => row(kind, it)).join('') + '</div>').join('')
}

const VARIANTS = [
  { key:'A', title:'Emoji als Marke',
    why:'Ein Unicode-Codepoint pro Artikel, farbig und figürlich. Die Zeile ist auf einen Blick sortierbar: Kleidung ist bunt-textil, Technik ist grau-eckig, Camping ist grün. Für den langen Schwanz („Zwischenringe“) gibt es nichts — dann bleibt die Marke leer statt falsch.',
    cost:'Kosten: die Farben kommen nicht aus eurer Tabelle. Vier Marken sind Ersatz (🧶 für Fleece, 🔌 für Kabel, 🔦 für Stirnlampe, 🧃 für Wasserflasche) — Emoji hat keine Wasserflasche. Das 🧶 hätte der Picker unten übrigens gar nicht vorgeschlagen; es ist von Hand gewählt.' },
  { key:'B', title:'Icon-Bibliothek',
    why:'Monochrome Strichicons in der Rollenfarbe. Fügt sich lückenlos in Invariante 9 ein, skaliert scharf, wiegt fast nichts. Die Liste bleibt ruhig — sie sieht aus wie der Rest der App.',
    cost:'Kosten: ruhig heißt hier gleichförmig. Sechs von fünfzehn Zeilen tragen ein Ersatz-Symbol, und auf 34 px sehen Flasche, Sonnencreme und Wasserflasche identisch aus. Als Scan-Hilfe trägt das kaum. Fairness-Hinweis: die Striche sind in der Strichstärke von Phosphor/Tabler nachgezeichnet, nicht aus der Bibliothek importiert — die Gleichförmigkeit ist die Aussage, nicht meine Zeichenhand.' },
  { key:'C', title:'Foto zuerst, Emoji dahinter',
    why:'Was ein Foto hat, zeigt das Foto — das ist die Identität, die FR-22.1 meint. Der Rest fällt auf das Emoji zurück. Realistisch sind drei von fünfzehn Zeilen fotografiert, so ist es hier gerendert.',
    cost:'Kosten: zwei Bildsprachen in einer Spalte. Das Foto zieht das Auge und gewinnt jeden Scan — die drei fotografierten Zeilen wirken wichtiger als die zwölf anderen, ohne es zu sein.' },
  { key:'D', title:'Nur Initiale (Nullvariante)',
    why:'Kein neues Feld, keine Datei, keine Migration: der erste Buchstabe auf einer aus dem Namen abgeleiteten Farbe. Ehrliche Vergleichsbasis — vielleicht reicht das ja, und alles andere ist Aufwand für Zierrat.',
    cost:'Kosten: der Buchstabe wiederholt nur den Namen, der direkt daneben steht. Er trennt Zeilen, aber er sagt nichts. Farbe ohne Bedeutung ist Rauschen.' },
]

document.getElementById('grid').innerHTML = VARIANTS.map((v) =>
  '<div class="vcol"><div class="vcap"><span class="k">Variante ' + v.key + '</span>' +
  '<h2>' + v.title + '</h2><p>' + v.why + '</p><p class="cost">' + v.cost + '</p></div>' +
  '<div class="phone"><div class="bar">‹ Samedan 2026<span class="grow"></span>15 Artikel</div>' +
  '<div class="body">' + listFor(v.key) + '</div></div>' +
  '<div class="gapnote"><span class="dot"></span><span>Gelber Punkt = Ersatzmarke, nichts Passendes vorhanden.</span></div>' +
  '</div>').join('')

/* ------------------------------------------------------------------ *
 * The picker. A trimmed keyword index — the real one (FR-28.2) would be
 * curated from CLDR/emojibase (de + en) down to what packing needs.
 * Scoring and search run on exactly this shape.
 * ------------------------------------------------------------------ */
const EMOJI = [
  ['🧥','Kleidung','jacke regenjacke mantel anorak coat jacket'],
  ['👕','Kleidung','t-shirt shirt oberteil hemd tshirt'],
  ['👖','Kleidung','hose jeans trousers pants'],
  ['🩳','Kleidung','shorts kurze hose badehose'],
  ['🧦','Kleidung','socken strümpfe socks'],
  ['🩲','Kleidung','unterwäsche unterhose slip underwear'],
  ['👗','Kleidung','kleid dress'],
  ['🧣','Kleidung','schal halstuch scarf'],
  ['🧤','Kleidung','handschuhe gloves'],
  ['🧢','Kleidung','mütze kappe cap hut'],
  ['👒','Kleidung','sonnenhut hut hat'],
  ['🥾','Kleidung','wanderschuhe stiefel schuhe boots'],
  ['👟','Kleidung','turnschuhe sneaker laufschuhe schuhe shoes'],
  ['🩴','Kleidung','badeschlappen flipflops sandalen'],
  ['🕶️','Kleidung','sonnenbrille brille sunglasses'],
  ['🦺','Kleidung','warnweste weste sicherheitsweste'],
  ['🧳','Reise','koffer gepäck trolley luggage suitcase'],
  ['🎒','Reise','rucksack backpack tagesrucksack'],
  ['👜','Reise','tasche handtasche bag'],
  ['🛂','Dokumente','reisepass pass ausweis passport'],
  ['🪪','Dokumente','ausweis führerschein id personalausweis'],
  ['🎫','Dokumente','ticket fahrkarte eintritt bordkarte'],
  ['💳','Dokumente','kreditkarte karte ec-karte bankkarte'],
  ['💶','Dokumente','bargeld geld euro cash'],
  ['🗺️','Dokumente','karte landkarte wanderkarte map'],
  ['📕','Dokumente','buch reiseführer notizbuch book'],
  ['🧾','Dokumente','beleg quittung rechnung buchung'],
  ['💊','Gesundheit','medikamente tabletten pillen medizin'],
  ['🩹','Gesundheit','pflaster erste-hilfe verband erstehilfe'],
  ['🩺','Gesundheit','arzt medizin gesundheit'],
  ['😷','Gesundheit','maske mundschutz'],
  ['🧴','Hygiene','sonnencreme lotion creme shampoo duschgel flasche'],
  ['🪥','Hygiene','zahnbürste zähne zahnpasta'],
  ['🧼','Hygiene','seife waschen soap'],
  ['🧻','Hygiene','klopapier toilettenpapier taschentücher'],
  ['🪒','Hygiene','rasierer rasur razor'],
  ['💄','Hygiene','make-up lippenstift kosmetik'],
  ['🪮','Hygiene','kamm bürste haare'],
  ['🧽','Hygiene','schwamm putzen spülen'],
  ['📷','Technik','kamera fotoapparat foto camera'],
  ['🎥','Technik','videokamera film'],
  ['🔭','Technik','fernrohr teleskop spektiv'],
  ['🔬','Technik','mikroskop makro lupe'],
  ['📱','Technik','handy smartphone telefon'],
  ['💻','Technik','laptop notebook rechner computer'],
  ['🎧','Technik','kopfhörer headset ohrhörer'],
  ['🔌','Technik','ladekabel kabel stecker netzteil ladegerät adapter'],
  ['🔋','Technik','powerbank akku batterie battery'],
  ['🔦','Technik','taschenlampe stirnlampe lampe licht'],
  ['💡','Technik','licht lampe birne leuchte'],
  ['🖲️','Technik','maus trackball zubehör'],
  ['⌚','Technik','uhr armbanduhr watch'],
  ['🧭','Technik','kompass navigation orientierung'],
  ['⛺','Camping','zelt tent camping'],
  ['🛌','Camping','schlafsack schlafen bett isomatte'],
  ['🔥','Camping','feuer gaskocher kocher feuerzeug streichhölzer'],
  ['🪵','Camping','holz brennholz'],
  ['🪓','Camping','axt beil werkzeug'],
  ['🔪','Camping','messer taschenmesser klinge'],
  ['🍴','Camping','besteck gabel löffel geschirr'],
  ['🍳','Camping','pfanne kochen topf'],
  ['☕','Camping','kaffee kaffeekanne tee becher tasse'],
  ['🧊','Camping','kühlbox eis kühltasche'],
  ['🪢','Camping','seil schnur kordel spannband'],
  ['🧗','Sport','klettern klettergurt seil bergsteigen'],
  ['🥽','Sport','schwimmbrille skibrille brille goggles'],
  ['🎿','Sport','ski skifahren'],
  ['🏂','Sport','snowboard board'],
  ['🚴','Sport','fahrrad velo bike radfahren'],
  ['🥊','Sport','handschuhe boxen training'],
  ['🩱','Sport','badeanzug bikini schwimmen baden'],
  ['🏊','Sport','schwimmen baden pool'],
  ['⛑️','Sport','helm schutzhelm kletterhelm'],
  ['🧘','Sport','yoga matte yogamatte entspannung'],
  ['🍫','Essen','schokolade riegel snack'],
  ['🥜','Essen','nüsse snack trockenfrüchte'],
  ['🍎','Essen','apfel obst frucht'],
  ['🥤','Essen','getränk becher trinken flasche wasserflasche'],
  ['💧','Essen','wasser trinkwasser flüssigkeit'],
  ['🧃','Essen','saft trinkpäckchen getränk'],
  ['🧂','Essen','salz gewürz'],
  ['🥫','Essen','konserve dose proviant'],
  ['🐕','Sonstiges','hund haustier leine'],
  ['🧸','Sonstiges','kuscheltier spielzeug kind'],
  ['🎲','Sonstiges','spiel würfel karten'],
  ['🎣','Sonstiges','angeln rute'],
  ['☂️','Sonstiges','regenschirm schirm regen'],
  ['🧯','Sonstiges','feuerlöscher sicherheit'],
  ['🔑','Sonstiges','schlüssel key'],
  ['🧰','Sonstiges','werkzeug werkzeugkasten reparatur'],
  ['🪫','Sonstiges','leer ersatz reserve'],
  ['📦','Sonstiges','kiste box karton behälter'],
]
const FACETS = ['Alle','Kleidung','Reise','Dokumente','Hygiene','Gesundheit','Technik','Camping','Sport','Essen','Sonstiges']

const STOP = new Set(['und','der','die','das','ein','eine','für','mit','von','zum','set','pro'])
const VOCAB = new Set(EMOJI.flatMap((e) => e[2].split(' ')))
function tokens(s){
  const raw = String(s).toLowerCase().split(/[^a-zäöüß]+/).filter((t) => t.length > 2 && !STOP.has(t))
  const out = new Set(raw)
  // German compounds: „Tarnzelt“ must reach „zelt“. A suffix is only kept when
  // the index actually knows it — otherwise the tail of every word becomes a
  // token („ürste“) and the suggestion line reads like noise.
  raw.forEach((t) => { for (let i = 3; i <= t.length - 4; i++) { const tail = t.slice(i); if (VOCAB.has(tail)) out.add(tail) } })
  return [...out]
}
/* score: exact keyword > keyword starts with token > token contains keyword */
function score(entry, toks){
  const kws = entry[2].split(' ')
  let best = 0
  toks.forEach((t) => kws.forEach((k) => {
    let s = 0
    if (k === t) s = 100
    else if (k.startsWith(t) && t.length >= 4) s = 70
    else if (t.startsWith(k) && k.length >= 4) s = 60
    else if (k.length >= 5 && t.includes(k)) s = 40
    if (s > best) best = s
  }))
  return best
}
function suggestFor(name){
  const toks = tokens(name)
  if (!toks.length) return []
  return EMOJI.map((e) => [e, score(e, toks)]).filter((p) => p[1] > 0)
    .sort((a, b) => b[1] - a[1]).slice(0, 4).map((p) => p[0])
}
function searchIn(q, facet){
  const needle = q.trim().toLowerCase()
  return EMOJI.filter((e) => (facet === 'Alle' || e[1] === facet) &&
    (!needle || e[2].split(' ').some((k) => k.startsWith(needle)) || e[1].toLowerCase().startsWith(needle)))
}

const st = { name:'Zahnbürste', q:'', facet:'Alle', chosen:null }

function drawPicker(){
  const sugg = suggestFor(st.name)
  const hits = searchIn(st.q, st.facet)
  document.getElementById('pickerbody').innerHTML =
    '<div class="mk-field"><label>Artikelname</label>' +
      '<input class="mk-input" id="pname" value="' + esc(st.name) + '" placeholder="z. B. Regenjacke" /></div>' +

    (st.chosen
      ? '<div class="card mk-chosen"><div class="big">' + st.chosen + '</div>' +
        '<div><div class="lbl">Marke</div><div class="val">' + esc(st.name || 'Artikel') + '</div></div>' +
        '<button class="clear" id="pclear">Entfernen</button></div>'
      : '') +

    '<div class="mk-suggest"><div class="h">' +
      '<svg viewBox="0 0 24 24" style="width:14px;height:14px;fill:none;stroke:currentColor;stroke-width:2">' +
      '<path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6 6 4.5 4.5M18 6l1.5-1.5M6 18l-1.5 1.5M18 18l1.5 1.5"/>' +
      '<circle cx="12" cy="12" r="4"/></svg>Vorschlag</div>' +
      (sugg.length
        ? '<div class="row">' + sugg.map((e, i) =>
            '<div class="mk-sg' + (i === 0 ? ' first' : '') + '" data-pick="' + e[0] + '">' + e[0] + '</div>').join('') +
          '</div><div class="why">aus „' + esc(st.name) + '“ · ' + esc(tokens(st.name).slice(0, 4).join(', ')) + '</div>'
        : '<div class="none">Für „' + esc(st.name || '…') + '“ passt nichts — dann bleibt die Zeile ohne Marke. ' +
          'Das ist ein gültiger Zustand, kein Fehler.</div>') +
    '</div>' +

    '<div class="mk-search mk-field">' +
      '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>' +
      '<input class="mk-input" id="psearch" value="' + esc(st.q) + '" placeholder="Symbol suchen — „regen“, „lampe“, „pass“" /></div>' +

    '<div class="mk-facets">' + FACETS.map((f) =>
      '<div class="mk-ff' + (f === st.facet ? ' on' : '') + '" data-facet="' + f + '">' + f + '</div>').join('') + '</div>' +

    (hits.length
      ? '<div class="mk-grid">' + hits.map((e) =>
          '<div class="mk-eg' + (st.chosen === e[0] ? ' on' : '') + '" data-pick="' + e[0] + '" title="' + esc(e[2]) + '">' +
          e[0] + '</div>').join('') + '</div>'
      : '<div class="mk-empty">Nichts gefunden für „' + esc(st.q) + '“.<br />Ein Artikel darf ohne Marke bleiben.</div>') +

    '<div class="mk-kw">' + hits.length + ' von ' + EMOJI.length + ' Symbolen · gesucht wird über deutsche <em>und</em> ' +
    'englische Stichwörter, nicht über den Emoji-Namen.</div>'

  bindPicker()
}

function keepCaret(id, apply){
  const el = document.getElementById(id)
  el.oninput = () => { apply(el.value); const next = document.getElementById(id); next.focus(); next.setSelectionRange(next.value.length, next.value.length) }
}

function bindPicker(){
  keepCaret('pname', (v) => { st.name = v; drawPicker() })
  keepCaret('psearch', (v) => { st.q = v; drawPicker() })
  document.querySelectorAll('[data-facet]').forEach((el) => { el.onclick = () => { st.facet = el.dataset.facet; drawPicker() } })
  document.querySelectorAll('[data-pick]').forEach((el) => { el.onclick = () => { st.chosen = el.dataset.pick; drawPicker() } })
  const clear = document.getElementById('pclear')
  if (clear) clear.onclick = () => { st.chosen = null; drawPicker() }
}

document.getElementById('pickergrid').innerHTML =
  '<div class="vcol"><div class="vcap"><span class="k">Picker</span>' +
  '<h2>Suchen wie bei WhatsApp, vorschlagen wie ein Kollege</h2>' +
  '<p>Die Suche läuft über Stichwörter, nicht über den Unicode-Namen: „regen“ findet 🧥 und ☂️, obwohl keines der beiden „Regen“ heißt. ' +
  'Der Vorschlag oben ist derselbe Index, gegen die Tokens des Artikelnamens gescort — clientseitig, offline, testbar (Invariante 4).</p>' +
  '<p class="cost">Kosten: der Index muss kuratiert werden. Die volle CLDR-Tabelle schlägt für „Bau“ ein 🏛️ vor; hier stehen 92 packrelevante Einträge.</p></div>' +
  '<div class="phone"><div class="bar">‹ Neuer Artikel<span class="grow"></span>Marke wählen</div>' +
  '<div class="body" id="pickerbody"></div></div></div>' +

  '<div class="vcol"><div class="vcap"><span class="k">Was der Picker beweisen soll</span>' +
  '<h2>Drei Fälle, die er überleben muss</h2>' +
  '<p><strong>Der Treffer.</strong> „Zahnbürste“ → 🪥 steht vorne, ein Tap. Das ist der Normalfall und er muss ohne Suchfeld auskommen.</p>' +
  '<p><strong>Der schiefe Treffer.</strong> „Stirnlampe“ → 🔦 ist eine Taschenlampe. Nah genug zum Scannen, falsch als Aussage. ' +
  'Deshalb ist der Vorschlag ein <em>Angebot</em> und nie eine stille Vorbelegung.</p>' +
  '<p><strong>Der Leerfall.</strong> „Zwischenringe“, „Trekkingstöcke“, „Fleecepullover“ → nichts. Der Screen muss das als gültigen Zustand zeigen, ' +
  'nicht als Lücke, die man füllen muss — sonst tippt sich jeder ein 📦 hin und die Spalte wird wieder bedeutungslos.</p>' +
  '</div></div>'

drawPicker()

document.getElementById('notes').innerHTML = [
  { c:'warm', h:'Entschieden: A (Owner, 2026-08-17)', b:
    '<p>Die vier Listen nebeneinander beantworten die Frage deutlicher als die Argumente davor. ' +
    'B ist ruhig und regelkonform und trägt <strong>trotzdem nicht</strong>: auf 34 px sind die Striche zu ähnlich, ' +
    'und die Ersatzquote ist höher als bei Emoji, weil Bibliotheken Gear führen und keinen Alltag. ' +
    'D zeigt, dass eine Marke ohne Bedeutung schlechter ist als keine.</p>' +
    '<p>C ist keine eigene Variante, sondern die <em>Regel innerhalb</em> von A: wo ein Foto existiert, gewinnt es. ' +
    'Was C hier zeigt, ist der Preis davon — die Spalte wird uneinheitlich — und der ist bezahlt, ' +
    'weil ein Foto sonst gar keinen Platz mehr hätte. Ausspezifiziert in PRD §3.28 und UI-Spec G-15.</p>' },
  { h:'Was das an Arbeit heißt', b:
    '<ul>' +
    '<li>Neue Migration: <strong>icon TEXT</strong> auf <code>items</code> und <code>templates</code>, NULL = keine Marke. ' +
    'Gewöhnliche Sync-Spalte im Master-Feed — der billige Gegenentwurf zum BLOB-Sonderweg von ADR-002 (FR-28.9).</li>' +
    '<li>Selbst gehostete, subgesetzte Emoji-Font, sonst sieht dieselbe geteilte Liste auf zwei Geräten anders aus (FR-28.6). ' +
    'Gewicht messen, bevor es committet wird — und einmal <code>make visual-update</code>, weil jede Baseline neu gerendert wird.</li>' +
    '<li>Kuratierter Keyword-Index in <code>client/src/domain/itemMarks.ts</code> — Suche und Vorschlag sind dieselbe Funktion (FR-28.2/28.3).</li>' +
    '<li>G-15 hält die Marke im Inhalt: kein Emoji in Buttons, Status oder Fortschritt (FR-28.5).</li>' +
    '</ul>' },
  { h:'Was in der Spec offen blieb', b:
    '<ul>' +
    '<li>Eine trip-eigene Marke gibt es <em>nicht</em>: die Zeile liest die des Stammartikels (FR-28.7). Revisit-Trigger dort.</li>' +
    '<li>Ad-hoc-Zeilen aus dem Quick-Add bleiben ohne Marke, bis sie ein Stammartikel sind.</li>' +
    '<li>Latte ist nicht gerendert: Emoji sind für hellen Grund gezeichnet, diese Runde ist Mocha. ' +
    'Gehört in den Eyeball der Umsetzung.</li>' +
    '<li>Der ADR wird mit dem Code geschrieben, nicht hier — <code>adr/README.md</code>: ein ADR ohne Code ist ein Plan.</li>' +
    '</ul>' },
].map((n) => '<div class="note' + (n.c ? ' ' + n.c : '') + '"><h3>' + n.h + '</h3>' + n.b + '</div>').join('')
</script>
</body></html>
`

writeFileSync(join(here, 'UI_Concept_ItemMark_variants.html'), page)
console.log('wrote UI_Concept_ItemMark_variants.html (%d KB)', Math.round(page.length / 1024))
