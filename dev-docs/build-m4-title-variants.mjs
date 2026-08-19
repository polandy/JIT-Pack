/**
 * Builds UI_Concept_M4Title_variants.html from the prototype's stylesheet —
 * same approach as the group-peek, resolved-list, review-step and
 * skip-control rounds.
 *
 * Question: M4's app bar carries the trip name, and since the FR-27.5
 * lifecycle action landed (PR #115) it also carries six icons. At 390 px the
 * name is left with 54 px and renders as "S…" — measured off the visual
 * baseline `m4-list-visual-mobile-linux.png`, whose icon centres are
 * reproduced verbatim in the "Ist-Zustand" phone below. The screen's identity
 * is gone, and the UI-Spec's own M4 header line ("Reisename · gepackt/gesamt ·
 * Gewicht · offene Prep") never got the name in the first place. Where does
 * the trip name live?
 *
 * Run: node dev-docs/build-m4-title-variants.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const proto = readFileSync(join(here, 'UI_Concept_Prototype.html'), 'utf8')
const css = proto.slice(proto.indexOf('<style>') + 7, proto.indexOf('</style>'))

/* --- Icons -------------------------------------------------------------
   Ionicons' outline set, traced down to what reads at 22 px. They exist to
   occupy the right number of pixels in the right order — the round is about
   how much room is left over, so the cluster has to cost what it really
   costs. */
const svg = (d, extra = '') =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
     stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}${extra}</svg>`

const ICON = {
  back: svg('<path d="M15 4.5 7.5 12 15 19.5" />'),
  search: svg('<circle cx="10.5" cy="10.5" r="6.6" /><path d="M15.4 15.4 20.5 20.5" />'),
  filter: svg('<path d="M3.5 5h17l-6.6 7.8V19l-3.8 2v-8.2z" />'),
  fold: svg(
    '<path d="M10 4v6H4M14 4v6h6M10 20v-6H4M14 20v-6h6" /><path d="M6.5 6.5 10 10M17.5 6.5 14 10M6.5 17.5 10 14M17.5 17.5 14 14" />',
  ),
  play: svg('<path d="M7.5 4.6 19 12 7.5 19.4z" />'),
  archive: svg(
    '<rect x="3.2" y="4.4" width="17.6" height="4" rx="1.2" /><path d="M5 8.4v9.4a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8V8.4" /><path d="M10 12.4h4" />',
  ),
  sync: svg(
    '<path d="M4.2 12a7.8 7.8 0 0 1 13.2-5.6M19.8 12a7.8 7.8 0 0 1-13.2 5.6" /><path d="M17.6 2.6v3.9h-3.9M6.4 21.4v-3.9h3.9" />',
  ),
  gear: svg(
    '<circle cx="12" cy="12" r="3.1" /><circle cx="12" cy="12" r="7.2" /><path d="M12 2.4v2.4M12 19.2v2.4M21.6 12h-2.4M4.8 12H2.4M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7M18.8 18.8l-1.7-1.7M6.9 6.9 5.2 5.2" />',
  ),
  cart: svg(
    '<circle cx="9.5" cy="19" r="1.4" /><circle cx="17.5" cy="19" r="1.4" /><path d="M2.8 3.6h2.6l2.6 11.2h10.4l2-7.8H7" />',
  ),
  luggage: svg(
    '<rect x="3.4" y="7.2" width="17.2" height="12.4" rx="2.2" /><path d="M9 7.2V5.4a1.6 1.6 0 0 1 1.6-1.6h2.8A1.6 1.6 0 0 1 15 5.4v1.8" /><path d="M9.4 11v4.6M14.6 11v4.6" />',
  ),
  stats: svg('<path d="M4 20V9.6M10 20V4.4M16 20v-7.4M22 20H2" />'),
}

/**
 * The app bar, reproduced at the baseline's own geometry.
 *
 * The measured icon centres of m4-list-visual-mobile-linux.png are
 * 28 · 129 · 181 · 227 · 275 · 319 · 360 at 390 px — a 46 px pitch — and the
 * title box between the chevron and the first action is 54 px wide. A 46 px
 * button with a 12 px inset reproduces that, which is the whole point: a
 * mockup that flatters the bar cannot answer the question.
 */
const bar = ({ title = '', actions = [], sub = '' }) => `
  <div class="pv-bar">
    <span class="pv-btn">${ICON.back}</span>
    <span class="pv-title${title ? '' : ' pv-title-empty'}">${title}${
      sub ? `<i class="pv-sub">${sub}</i>` : ''
    }</span>
    ${actions.map((a) => `<span class="pv-btn">${ICON[a]}</span>`).join('')}
    <span class="pv-btn">${ICON.sync}</span>
    <span class="pv-btn">${ICON.gear}</span>
  </div>`

/** The trip's other views, as they sit on the header line today. */
const tripNav = (extra = '') => `
  <span class="pv-nav">
    <span class="pv-navbtn">${ICON.cart}<i class="pv-badge">2</i></span>
    <span class="pv-navbtn">${ICON.luggage}</span>
    <span class="pv-navbtn">${ICON.stats}</span>
    ${extra}
  </span>`

const progress = `<b>12/38</b><span class="pv-mut"> · 4,2 kg</span><span class="pv-prep"> · 3 Prep</span>`

/** FR-25.11a's row: with no filter set it states the grouping instead. */
const chipRow = `<div class="pv-chiprow">Gruppiert nach Kategorie</div>`

/** Two groups of the real list, so a header is judged against what it heads. */
const list = `
  <div class="pv-group">
    <div class="pv-ghead">Kleidung</div>
    <div class="pv-row"><span class="pv-box"></span><span class="pv-nm">Wandersocken</span><span class="pv-qty">4/6</span></div>
    <div class="pv-row"><span class="pv-box"></span><span class="pv-nm">Regenjacke</span><span class="pv-qty">0/3</span></div>
    <div class="pv-row"><span class="pv-box"></span><span class="pv-nm">Softshell</span><span class="pv-qty">0/1</span></div>
  </div>
  <div class="pv-group">
    <div class="pv-ghead">Fotografie</div>
    <div class="pv-row"><span class="pv-box"></span><span class="pv-nm">Makroobjektiv</span><span class="pv-qty">0/1</span></div>
  </div>`

const phone = ({ id, top, note = '', chiprow = true }) => `
  <div class="pv-phone" id="${id}">
    ${top}
    <div class="pv-body">${chiprow ? chipRow : ''}${list}</div>
    ${note ? `<div class="pv-scrollnote">${note}</div>` : ''}
  </div>`

/* --- Ist-Zustand -------------------------------------------------------- */
const IST = phone({
  id: 'ist',
  top:
    bar({ title: 'S…', actions: ['search', 'filter', 'fold', 'play'] }) +
    `<div class="pv-line">
       <span class="pv-progress">${progress}</span>
       ${tripNav()}
     </div>`,
})

/* --- A ------------------------------------------------------------------ */
const A = phone({
  id: 'a',
  top:
    bar({ actions: ['search', 'filter', 'fold', 'play'] }) +
    `<div class="pv-line">
       <span class="pv-tripname">Samedan 2026</span>
       <span class="pv-progress pv-tight"><b>12/38</b><span class="pv-mut"> · 4,2 kg</span></span>
       ${tripNav()}
     </div>`,
  note: 'Beim Scrollen nach unten klappt die Zeile weg — und mit ihr der Name.',
})

/* --- B ------------------------------------------------------------------ */
const B = phone({
  id: 'b',
  top:
    bar({ actions: ['search', 'filter', 'fold', 'play'] }) +
    `<div class="pv-line pv-line2">
       <span class="pv-tripname">Samedan 2026</span>
       ${tripNav()}
     </div>
     <div class="pv-line pv-line2b">
       <span class="pv-progress">${progress}</span>
       <span class="pv-face"><i></i><i></i></span>
     </div>`,
  note:
    'Gescrollt klappt nicht alles weg — es bleibt:' +
    `<div class="pv-condensed"><span class="pv-cname">Samedan 2026</span>
       <span class="pv-mut">· 12/38</span></div>`,
})

/* --- C ------------------------------------------------------------------ */
const C = phone({
  id: 'c',
  top:
    bar({ title: 'Samed…', actions: ['search', 'filter', 'fold'] }) +
    `<div class="pv-line">
       <span class="pv-progress">${progress}</span>
       ${tripNav(`<span class="pv-navbtn">${ICON.play}</span>`)}
     </div>`,
})

/* --- D ------------------------------------------------------------------ */
const D = phone({
  id: 'd',
  top:
    bar({ title: 'Samedan 2026', actions: ['play'] }) +
    `<div class="pv-line">
       <span class="pv-progress">${progress}</span>
       ${tripNav()}
     </div>
     <div class="pv-toolrow">
       <span class="pv-toolbtn">${ICON.search}</span>
       <span class="pv-toolbtn">${ICON.filter}</span>
       <span class="pv-toolbtn">${ICON.fold}</span>
       <span class="pv-toolsep"></span>
       <span class="pv-toolnote">Gruppiert nach Kategorie</span>
     </div>`,
  chiprow: false,
})

const col = (kicker, h2, body, cost, phoneHtml) => `
  <div class="pv-col">
    <div class="pv-cap">
      <div class="pv-k">${kicker}</div>
      <h2>${h2}</h2>
      ${body}
      ${cost ? `<p class="pv-cost">${cost}</p>` : ''}
    </div>
    ${phoneHtml}
  </div>`

const page = `<!doctype html>
<html lang="de" data-theme="mocha"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Der Reisename auf M4</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Hanken+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet" />
<style>${css}
/* The prototype's body is a centred single-phone stage; this sheet is a
   gallery, so it takes the tokens and lays itself out. */
body{padding:0;margin:0;display:block;background:var(--crust);min-height:100dvh}
.pv-wrap{max-width:1500px;margin:0 auto;padding:34px 22px 80px}
.pv-head{max-width:70ch}
.pv-head .k{font:600 11.5px/1 var(--ui);letter-spacing:.16em;text-transform:uppercase;color:var(--peach)}
.pv-head h1{font-family:var(--display);font-weight:600;font-size:32px;line-height:1.1;
  letter-spacing:-.015em;margin:10px 0 14px;text-wrap:balance}
.pv-head p{margin:0 0 11px;color:var(--sub0);font-size:14.5px;line-height:1.62}
.pv-head em{color:var(--rose);font-style:italic}
.pv-head b{color:var(--text)}

.pv-rules{margin:22px 0 0;padding:15px 17px;border:1px solid var(--s0);border-radius:16px;
  background:var(--mantle);max-width:70ch}
.pv-rules h3{font:600 11.5px/1 var(--ui);letter-spacing:.12em;text-transform:uppercase;
  color:var(--o1);margin:0 0 11px}
.pv-rules ul{margin:0;padding-left:17px}
.pv-rules li{color:var(--sub0);font-size:13.5px;line-height:1.6;margin-bottom:6px}
.pv-rules li b{color:var(--text)}

.pv-sect{margin:44px 0 0}
.pv-sect > h2{font-family:var(--display);font-weight:600;font-size:22px;margin:0 0 4px;letter-spacing:-.01em}
.pv-sect > p{margin:0 0 20px;color:var(--o1);font-size:13.5px;max-width:70ch;line-height:1.6}

.pv-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(392px,max-content));
  gap:32px;align-items:start;justify-content:start}
.pv-col{display:flex;flex-direction:column;gap:14px;width:392px}
.pv-cap .pv-k{font:600 11px/1 var(--ui);letter-spacing:.14em;text-transform:uppercase;color:var(--peach)}
.pv-cap h2{font-family:var(--display);font-weight:600;font-size:19px;line-height:1.22;
  margin:7px 0 7px;letter-spacing:-.01em}
.pv-cap p{margin:0 0 7px;color:var(--sub0);font-size:13px;line-height:1.6}
.pv-cap .pv-cost{color:var(--peach);font-size:12.5px}
.pv-cap .pv-cost::before{content:"Kosten · ";color:var(--o1)}

/* ---------- the phone: 390 px of real estate, not a flattering frame ----- */
.pv-phone{width:390px;flex:none;border:1px solid var(--s1);border-radius:20px;overflow:hidden;
  background:var(--base);box-shadow:0 26px 60px -34px rgba(0,0,0,.9)}
.pv-bar{height:56px;display:flex;align-items:center;padding:0 6px;background:var(--crust);
  border-bottom:1px solid var(--s0)}
.pv-btn{width:46px;height:44px;flex:none;display:grid;place-items:center;color:var(--sub1)}
.pv-btn svg{width:22px;height:22px}
.pv-btn.pv-hot{color:var(--peach)}
.pv-title{flex:1;min-width:0;font-family:var(--display);font-weight:600;font-size:18.5px;
  letter-spacing:-.01em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
.pv-title-empty{min-width:0}

/* ---------- the header line ---------- */
.pv-line{display:flex;align-items:center;gap:10px;padding:9px 12px;background:var(--base);
  border-bottom:1px solid var(--s0)}
.pv-line2{padding-bottom:2px;border-bottom:0}
.pv-line2b{padding-top:2px}
.pv-tripname{font-family:var(--display);font-weight:600;font-size:18.5px;letter-spacing:-.01em;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.pv-progress{flex:1;min-width:0;font-size:15px;font-variant-numeric:tabular-nums;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text)}
.pv-progress.pv-tight{flex:none;font-size:13.5px}
.pv-mut{color:var(--sub0);font-size:13px}
.pv-prep{color:var(--yellow);font-size:13px}
.pv-nav{display:flex;align-items:center;flex:none}
.pv-navbtn{width:38px;height:34px;display:grid;place-items:center;color:var(--sub1);position:relative}
.pv-navbtn svg{width:20px;height:20px}
.pv-navbtn.pv-hot{color:var(--peach)}
.pv-badge{position:absolute;top:-1px;right:2px;background:var(--peach);color:var(--crust);
  font:700 9.5px/1 var(--ui);font-style:normal;padding:2px 4px;border-radius:999px}
.pv-face{display:flex;flex:none}
.pv-face i{width:22px;height:22px;border-radius:50%;background:var(--s2);
  border:1.5px solid var(--base);margin-left:-6px}

/* ---------- D's tool row ---------- */
.pv-toolrow{display:flex;align-items:center;gap:2px;padding:5px 10px;background:var(--mantle);
  border-bottom:1px solid var(--s0)}
.pv-toolbtn{width:40px;height:34px;display:grid;place-items:center;color:var(--sub1)}
.pv-toolbtn svg{width:20px;height:20px}
.pv-toolsep{width:1px;height:20px;background:var(--s1);margin:0 9px}
.pv-toolnote{font-size:12.5px;color:var(--o1)}

/* ---------- the list underneath ---------- */
.pv-body{padding:11px 12px 16px;background:var(--base);min-height:236px}
.pv-chiprow{font-size:12px;color:var(--o1);padding:0 2px 9px}
.pv-group{background:var(--mantle);border:1px solid var(--s0);border-radius:16px;
  overflow:hidden;margin-bottom:10px}
.pv-ghead{padding:9px 13px 7px;font:600 12px/1 var(--ui);letter-spacing:.1em;
  text-transform:uppercase;color:var(--o1)}
.pv-row{display:flex;align-items:center;gap:11px;padding:9px 13px;border-top:1px solid var(--s0)}
.pv-box{width:21px;height:21px;border-radius:7px;border:1.6px solid var(--s2);flex:none}
.pv-nm{flex:1;font-size:14.5px;font-weight:500}
.pv-qty{font-size:13px;color:var(--sub0);font-variant-numeric:tabular-nums}
.pv-scrollnote{padding:10px 13px;border-top:1px dashed var(--s1);background:var(--crust);
  font-size:12.5px;color:var(--o1);line-height:1.5}
.pv-scrollnote b{color:var(--sub1)}
.pv-condensed{display:flex;align-items:baseline;gap:7px;margin-top:8px;padding:7px 13px;
  background:var(--base);border:1px solid var(--s0);border-radius:12px}
.pv-cname{font-family:var(--display);font-weight:600;font-size:15px;letter-spacing:-.01em;
  color:var(--text)}

/* ---------- comparison ---------- */
.pv-table{width:100%;max-width:1000px;border-collapse:collapse;margin:16px 0 0;font-size:13.5px}
.pv-table th,.pv-table td{border-top:1px solid var(--s0);padding:11px 12px;text-align:left;
  vertical-align:top;color:var(--sub0);line-height:1.55}
.pv-table th{color:var(--text);font:600 11px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase}
.pv-table td:first-child{color:var(--text);font-weight:600;white-space:nowrap}
.pv-table .yes{color:var(--green)}
.pv-table .no{color:var(--maroon)}
.pv-scroll{overflow-x:auto}

.pv-close{margin:40px 0 0;max-width:70ch}
.pv-close h2{font-family:var(--display);font-weight:600;font-size:21px;margin:0 0 10px}
.pv-close p{color:var(--sub0);font-size:14px;line-height:1.62;margin:0 0 10px}
.pv-close b{color:var(--text)}
</style></head>
<body>
<div class="pv-wrap">

  <div class="pv-head">
    <div class="k">M4 · Variantenrunde</div>
    <h1>Die Reise heißt „S…“</h1>
    <p>Seit der Lebenszyklus-Schritt aus PR&nbsp;#115 (FR-27.5) in der App-Leiste sitzt, teilen sich
      dort bei 390&nbsp;px ein Zurück-Chevron, der Reisename und <b>sechs Icons</b> eine Zeile. Aus
      der Visual-Baseline <code>m4-list-visual-mobile</code> gemessen: die Icon-Mitten liegen bei
      28 · 129 · 181 · 227 · 275 · 319 · 360, dem Titel bleiben <b>54&nbsp;px</b>. Er rendert als
      <em>S…</em>. Die Leiste in jedem Mockup unten hat exakt diese Geometrie.</p>
    <p>Der eigentliche Befund ist aber nicht die Kürzung. Die UI-Spec beschreibt für M4
      <b>eine Kopfzeile — „Reisename · gepackt/gesamt · Gewicht · offene Prep“</b>. Beim Rebuild ist
      der Name aus dieser Zeile gefallen und lebt seither ausschließlich in der App-Leiste — also an
      dem einen Ort, der keinen Platz dafür hat. Die Frage ist deshalb nicht, wie man kürzt, sondern
      <b>wo die Identität des Screens wohnt</b>.</p>
  </div>

  <div class="pv-rules">
    <h3>Was nicht zur Disposition steht</h3>
    <ul>
      <li><b>G-9:</b> genau <em>eine</em> Kopfleiste in der App; Sync-Glyphe und Einstellungen stehen
        auf <em>jedem</em> Screen rechts — das hält das Konfliktprotokoll aus der Reise heraus erreichbar.</li>
      <li><b>G-12 / FR-25.11k:</b> kein ⋯-Overflow. „Hinter drei Punkte“ ist genau die Stelle, an der
        das Konzepttest-Publikum die Nebenansichten nie gefunden hat.</li>
      <li><b>Die Reise-Zeile klappt beim Scrollen weg</b> — das war 2026-08-07 das Argument, die
        Werkzeuge überhaupt in die App-Leiste zu heben.</li>
    </ul>
  </div>

  <div class="pv-sect">
    <h2>Ist-Zustand</h2>
    <p>Zum Vergleich, mit den gemessenen Abständen. Sechs Icons, ein Buchstabe.</p>
    <div class="pv-grid">
      ${col(
        'heute',
        'Der Name verliert gegen den Cluster',
        `<p>Der Reisename steht nur hier oben, und hier oben ist er zu Ende. Die Kopfzeile darunter
          trägt Fortschritt, Gewicht, Prep und die drei Nebenansichten — <b>keinen Namen</b>.</p>`,
        'Die Reise ist auf dem eigenen Screen nicht benannt.',
        IST,
      )}
    </div>
  </div>

  <div class="pv-sect">
    <h2>Die vier Formen</h2>
    <p>A und B holen den Namen in die Kopfzeile, wo die Spec ihn ohnehin hinschreibt. C entlastet nur
      die Leiste. D dreht die Zuordnung um: der Titel bleibt oben, die Listenwerkzeuge ziehen nach unten.</p>
    <div class="pv-grid">
      ${col(
        'Variante A',
        'Der Name führt die Kopfzeile, die App-Leiste trägt keinen Titel',
        `<p>Ein Titel, der auf einen Buchstaben schrumpft, ist keiner — also gibt die App-Leiste ihn
          auf und behält den Zurück-Chevron. Der Name führt stattdessen die Zeile darunter, in der
          Display-Schrift, in voller Länge. Alles bleibt einzeilig.</p>`,
        'Die Prep-Zahl verliert ihren Platz, und beim Scrollen ist der Name weg.',
        A,
      )}
      ${col(
        'Variante B',
        'Wie A, aber die Zeile kondensiert statt zu verschwinden',
        `<p>Zeile eins nennt Reise und Nebenansichten, Zeile zwei die Zahlen und die Facepile. Beim
          Scrollen klappt nicht alles weg, sondern es bleibt eine schlanke Zeile stehen:
          <b>Samedan 2026 · 12/38</b>. Der Name ist damit <em>immer</em> zu sehen — was heute selbst
          im ungescrollten Zustand nicht stimmt.</p>`,
        'Rund 34 px dauerhaft weniger Liste; zwei Zeilen statt der einen, die die Spec nennt.',
        B,
      )}
      ${col(
        'Variante C',
        'Nur entlasten: ▷ zieht zu den Reise-Icons',
        `<p>Der kleinste Eingriff. Start und Archivieren sind reisebezogen wie 🛒🧳📊 und gehören zu
          denen; die App-Leiste behält die Listenwerkzeuge und den Titel. Ehrlich gerendert:
          <b>ein Icon weniger macht aus „S…“ ein „Samed…“.</b></p>`,
        'Löst die Kürzung nicht — sie wird nur eine Silbe länger.',
        C,
      )}
      ${col(
        'Variante D',
        'Der Titel bleibt oben, die Werkzeuge ziehen nach unten',
        `<p>Umgekehrte Zuordnung: die App-Leiste trägt, wozu G-9 sie erklärt — Zurück, Titel, Sync,
          Einstellungen — plus den einen Lebenszyklus-Schritt. Suche, Filter und Falten sitzen auf
          einer eigenen Werkzeugzeile, die <em>nicht</em> mitklappt. Der Reisename steht vollständig
          da, wo man ihn sucht.</p>`,
        'Öffnet die G-12-Entscheidung vom 2026-08-07 neu — deren Begründung („die Unterzeile rutscht beim Scrollen weg“) trifft auf diese Zeile allerdings nicht zu.',
        D,
      )}
    </div>
  </div>

  <div class="pv-sect">
    <h2>Nebeneinander</h2>
    <div class="pv-scroll">
      <table class="pv-table">
        <thead><tr>
          <th>Variante</th><th>Name ungescrollt</th><th>Name gescrollt</th>
          <th>Icons in der Leiste</th><th>Was es kostet</th>
        </tr></thead>
        <tbody>
          <tr><td>Heute</td><td class="no">„S…“</td><td class="no">„S…“</td><td>6</td>
            <td>Der Screen benennt seine Reise nicht.</td></tr>
          <tr><td>A</td><td class="yes">vollständig</td><td class="no">weg</td><td>6</td>
            <td>Prep-Zahl fällt aus der Zeile.</td></tr>
          <tr><td>B</td><td class="yes">vollständig</td><td class="yes">vollständig</td><td>6</td>
            <td>~34 px Liste, zweizeilige Kopfzeile.</td></tr>
          <tr><td>C</td><td class="no">„Samed…“</td><td class="no">„Samed…“</td><td>5</td>
            <td>Nichts — löst aber auch nichts.</td></tr>
          <tr><td>D</td><td class="yes">vollständig</td><td class="yes">vollständig</td><td>3</td>
            <td>G-12 wird neu verhandelt.</td></tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="pv-close">
    <h2>Was zu entscheiden ist</h2>
    <p><b>Eine Frage, nicht zwei:</b> gehört der Reisename in die App-Leiste (dann müssen dort Icons
      weichen — D) oder in die Kopfzeile (dann darf die App-Leiste auf M4 titellos bleiben — A/B)?
      C ist die Antwort „keins von beidem“ und ist mit aufgenommen, damit sie sichtbar
      danebensteht statt unausgesprochen zu bleiben.</p>
    <p>Alle vier sind ohne Backend, ohne Schema und ohne neue Abhängigkeit zu bauen. A und C sind je
      ein halber Tag, B kommt die Scroll-Kondensation dazu, D zusätzlich die UI-Spec-Änderung an
      G-12 samt Begründung — bei D ist die Spec-Arbeit der größere Teil.</p>
  </div>

</div>
</body></html>`

writeFileSync(join(here, 'UI_Concept_M4Title_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_M4Title_variants.html')
