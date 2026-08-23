/**
 * Builds UI_Concept_ClosingPass_variants.html — the rendered pair FR-9.3 asks
 * for: is the closing pass its own screen, or a mode of M4?
 *
 * Same rule as the other variant sheets: the CSS is lifted verbatim from
 * UI_Concept_Prototype.html, because a variant that looks different because
 * its stylesheet differs teaches nothing about the variant. Only the sheet
 * chrome and the classes this comparison needs are added, under a `cp-`
 * prefix so they cannot collide with the prototype's generic names.
 *
 * Unlike the earlier sheets this one links the two house faces. They render
 * against a fallback otherwise, and half of what separates these two
 * variants is how much text each row can carry.
 *
 * Run: node dev-docs/build-closing-pass-variants.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const proto = readFileSync(join(here, 'UI_Concept_Prototype.html'), 'utf8')
const css = proto.slice(proto.indexOf('<style>') + 7, proto.indexOf('</style>'))

/** One reviewable row: a packed thing, and the one judgement it can carry. */
const cpRow = ({ name, sub = '', marked = false, group = '' }) => `
  <div class="cp-row${marked ? ' on' : ''}">
    <div class="cp-grow">
      <div class="cp-nm">${name}</div>
      ${sub ? `<div class="cp-sub">${sub}</div>` : ''}
    </div>
    ${group ? `<span class="cp-grp">${group}</span>` : ''}
    <span class="cp-tog">${marked ? '✓' : ''}</span>
  </div>`

/* ------------------------------------------------------------------ *
 * A — its own screen. Reached from the archive action and nowhere else.
 * ------------------------------------------------------------------ */
const A = `
<div class="phone">
  <div class="bar">Rückschau · Samedan 2026</div>
  <div class="body cp-body">
    <div class="cp-lead">
      <div class="cp-q">Was hattest du dabei und nicht gebraucht?</div>
      <div class="cp-hint">18 gepackte Sachen · antippen genügt</div>
    </div>
    <div class="cp-list">
      ${cpRow({ name: 'Stativ', sub: 'Fotografie', marked: true })}
      ${cpRow({ name: 'ND-Filter', sub: 'Fotografie' })}
      ${cpRow({ name: 'Regenjacke', sub: 'Kleidung · 3×' })}
      ${cpRow({ name: 'Wanderstöcke', sub: 'Aktivität', marked: true })}
      ${cpRow({ name: 'Bouillon · Salz · Pfeffer', sub: 'Küche' })}
      ${cpRow({ name: 'Reiseapotheke', sub: 'Bad' })}
    </div>
    <div class="cp-foot">
      <span class="cp-skip">Überspringen</span>
      <span class="cp-done">Fertig · 2 markiert</span>
    </div>
  </div>
</div>`

/* ------------------------------------------------------------------ *
 * B — a mode of M4: the list it already is, in review posture.
 * ------------------------------------------------------------------ */
const B = `
<div class="phone">
  <div class="bar">M4 · Samedan 2026</div>
  <div class="body cp-body">
    <div class="cp-mode">
      <div>
        <div class="cp-q sm">Rückschau — was war ungenutzt?</div>
        <div class="cp-hint">nur gepackte Zeilen · 2 markiert</div>
      </div>
      <span class="cp-x">✕</span>
    </div>
    <div class="cp-grouphead">Fotografie</div>
    <div class="mcard">
      ${cpRow({ name: 'Stativ', marked: true })}
      ${cpRow({ name: 'ND-Filter' })}
    </div>
    <div class="cp-grouphead">Kleidung</div>
    <div class="mcard">
      ${cpRow({ name: 'Regenjacke', sub: '3 von 3 gepackt' })}
      ${cpRow({ name: 'Wandersocken', sub: '6 von 6 gepackt' })}
    </div>
    <div class="cp-grouphead">Aktivität</div>
    <div class="mcard">
      ${cpRow({ name: 'Wanderstöcke', marked: true })}
    </div>
    <div class="cp-foot inline">
      <span class="cp-skip">Ohne Markierungen abschliessen</span>
      <span class="cp-done">Fertig</span>
    </div>
  </div>
</div>`

const page = `<!doctype html>
<html lang="de" data-theme="mocha"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Abschluss-Durchgang — zwei Varianten</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,600&family=Hanken+Grotesk:wght@400;500;600&display=swap" rel="stylesheet" />
<style>${css}
/* Variant-sheet chrome only — everything inside a phone is the prototype's. */
body{padding:0;margin:0;display:block;height:auto}
.vwrap{max-width:1400px;margin:0 auto;padding:28px 20px 70px}
.vhead{max-width:76ch;margin-bottom:26px}
.vhead h1{font:600 27px/1.15 var(--display);margin:0 0 10px}
.vhead p{margin:0 0 8px;color:var(--sub0);font-size:14.5px;line-height:1.6}
.vhead em{color:var(--rose);font-style:italic}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(380px,1fr));gap:26px;align-items:start}
.vcol{display:flex;flex-direction:column;gap:12px}
.vcap .k{font:600 11.5px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--peach)}
.vcap h2{font:600 18px/1.2 var(--display);margin:6px 0 6px}
.vcap p{margin:0 0 6px;color:var(--sub0);font-size:13px;line-height:1.55}
.vcap .cost{color:var(--peach);font-size:12.5px}
.phone{width:380px;height:600px;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
.phone .bar{padding:11px 14px;border-bottom:1px solid var(--s0);background:var(--crust);
  font:600 13px/1 var(--ui);color:var(--sub0)}
.phone .body{flex:1;overflow:hidden;padding:12px;position:relative}
.mcard{background:var(--base);border:1px solid var(--s0);border-radius:16px;overflow:hidden}

.cp-body{display:flex;flex-direction:column;gap:10px}
.cp-lead{padding:2px 2px 4px}
.cp-q{font:600 17px/1.25 var(--display)}
.cp-q.sm{font-size:14.5px}
.cp-hint{color:var(--o0);font-size:12px;margin-top:3px}
.cp-list{background:var(--base);border:1px solid var(--s0);border-radius:16px;overflow:hidden}
.cp-row{display:flex;gap:10px;align-items:center;padding:12px 13px;border-top:1px solid var(--s0)}
.cp-row:first-child{border-top:0}
.cp-grow{flex:1;min-width:0}
.cp-nm{font-size:14.5px;font-weight:600}
.cp-sub{font-size:12px;color:var(--o0);margin-top:2px}
.cp-grp{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--s1);color:var(--o0);flex:none}
.cp-tog{width:26px;height:26px;border-radius:9px;border:1px solid var(--s1);flex:none;
  display:grid;place-items:center;font-size:13px;color:var(--crust);background:var(--base)}
.cp-row.on .cp-tog{background:var(--peach);border-color:var(--peach)}
.cp-row.on .cp-nm{color:var(--peach)}
.cp-mode{display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:14px;
  background:var(--s0);border:1px solid var(--s1)}
.cp-mode .cp-x{margin-left:auto;color:var(--o1);font-size:14px}
.cp-grouphead{font:600 11px/1 var(--ui);letter-spacing:.12em;text-transform:uppercase;
  color:var(--o0);margin:4px 2px 0}
.cp-foot{margin-top:auto;display:flex;align-items:center;gap:10px;padding-top:6px}
.cp-foot.inline{margin-top:8px}
.cp-skip{color:var(--o1);font-size:12.5px}
.cp-done{margin-left:auto;background:var(--peach);color:var(--crust);border-radius:12px;
  padding:10px 14px;font:600 13px/1 var(--ui)}
.shared{margin-top:34px;max-width:80ch}
.shared h2{font:600 21px/1.2 var(--display);margin:0 0 10px}
.shared p{color:var(--sub0);font-size:14px;line-height:1.6;margin:0 0 10px}
table.cmp{border-collapse:collapse;margin:14px 0 0;font-size:13.5px;width:100%;max-width:900px}
table.cmp th,table.cmp td{border-top:1px solid var(--s0);padding:9px 10px;text-align:left;
  color:var(--sub0);vertical-align:top}
table.cmp th{color:var(--text);font:600 12px/1 var(--ui);letter-spacing:.06em;text-transform:uppercase}
table.cmp td:first-child{color:var(--text)}
</style></head>
<body>
<div class="vwrap">
  <div class="vhead">
    <h1>Der Abschluss-Durchgang — eigener Screen oder ein Modus von M4?</h1>
    <p>FR-9.3 hat alles andere entschieden und genau diese Frage offen gelassen, weil sie
      am Bild hängt und nicht am Argument. Beide Varianten zeigen denselben Moment:
      <em>„Reise abschliessen“</em> ist getippt, die Reise ist noch nicht archiviert, und
      gefragt wird nach den Sachen, die mitgereist und nicht gebraucht wurden.</p>
    <p>Beide sind überspringbar, beide markieren nur <em>ungenutzt</em>, und beide zeigen
      ausschliesslich <strong>gepackte</strong> Zeilen — eine ungepackte ist entweder
      FR-5.5-weggelassen oder vergessen, und keins von beidem ist „ungenutzt“.</p>
  </div>

  <div class="vgrid">
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variante A</div>
        <h2>Eigener Screen</h2>
        <p>Eine flache Liste, nach Gruppe beschriftet statt gruppiert, ein Tipp pro Zeile.
          Nur über die Abschluss-Aktion erreichbar, danach nie wieder.</p>
        <p class="cost">Kosten: eine neue M-Nummer und eine zweite Listendarstellung, die
          mit M4 mitwachsen muss.</p>
      </div>
      ${A}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variante B</div>
        <h2>Modus von M4</h2>
        <p>Die Liste, die es schon gibt, in anderer Haltung: Gruppierung, Facetten und Suche
          bleiben, der Stepper weicht dem Schalter, ein Band oben sagt, worin man steckt.</p>
        <p class="cost">Kosten: derselbe Screen bedeutet zwei Dinge — und die Zeilengesten
          sind dort bereits vergeben.</p>
      </div>
      ${B}
    </div>
  </div>

  <div class="shared">
    <h2>Woran es sich entscheidet</h2>
    <table class="cmp">
      <tr><th>Frage</th><th>A · eigener Screen</th><th>B · Modus von M4</th></tr>
      <tr><td>Kann man versehentlich hineinlaufen?</td>
        <td>Nein. Es gibt genau einen Eingang.</td>
        <td>Ja — es ist die Liste, die man ohnehin ständig offen hat.</td></tr>
      <tr><td>Was kostet die zweite Darstellung?</td>
        <td>Eine eigene Liste, die M4s Verbesserungen künftig nachziehen muss.</td>
        <td>Nichts. Facetten (FR-25.11), Gruppierung und Suche gelten sofort mit.</td></tr>
      <tr><td>Kollidieren die Gesten?</td>
        <td>Nein, der Screen kennt nur eine Handlung.</td>
        <td>Ja. Press-and-hold trägt dort schon FR-5.5 und künftig FR-9.3s Menüeintrag.</td></tr>
      <tr><td>Sieht man, wie viel noch kommt?</td>
        <td>Ja, es ist eine Liste mit Ende — genau was FR-27.11 am Kartenstapel vermisst hat.</td>
        <td>Ja, aber vermischt mit allem, was M4 sonst zeigt.</td></tr>
      <tr><td>Wie liest sich eine Reise mit 120 Zeilen?</td>
        <td>Lang und ununterbrochen; die Gruppenspalte ist die einzige Ordnung.</td>
        <td>Wie M4 — eingeklappte Gruppen, Filter, Suche. Der klare Vorteil.</td></tr>
      <tr><td>Was passiert nach „Fertig“?</td>
        <td>Archiviert, weiter zu M14. Ein Weg, ein Ende.</td>
        <td>Modus aus — und man steht wieder in der Liste einer Reise, die es so nicht mehr gibt.</td></tr>
    </table>
    <p>Die letzte Zeile ist die, die am meisten zu denken gibt: B endet dort, wo es
      angefangen hat, auf der Packliste einer archivierten Reise. A hat einen Ausgang.</p>
    <h2 style="margin-top:26px">Entschieden am 23.08.2026: keine von beiden</h2>
    <p>Die Runde hat eine <em>dritte</em> Form hervorgebracht, und die ist es geworden:
      <strong>B mit A's Ausgang</strong> — der Modus von M4, dessen <em>„Fertig“</em> die Reise
      archiviert und M14 öffnet, statt bloss den Modus auszuschalten. Damit fällt die letzte
      Tabellenzeile weg, und B behält alles, was es oben gewinnt: Gruppierung, Facetten, Suche,
      nichts davon ein zweites Mal gebaut.</p>
    <p>Der Preis steht in Zeile drei und wird bezahlt, nicht wegerklärt: <strong>in dieser
      Haltung trägt die Zeile genau eine Geste — den Tipp, der markiert — und das
      Gedrückthalten ist stumm.</strong> Eine Ansicht, die eine Frage stellt, darf nicht drei
      beantworten; beide Menüeinträge sind einen Moment früher auf denselben Zeilen erreichbar.
      Der Wortlaut steht in FR-9.3.</p>
  </div>
</div>
</body></html>`

writeFileSync(join(here, 'UI_Concept_ClosingPass_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_ClosingPass_variants.html')
