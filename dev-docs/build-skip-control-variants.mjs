/**
 * Builds UI_Concept_SkipControl_variants.html from the prototype's stylesheet —
 * same approach as the group-peek, resolved-list and review-step rounds.
 *
 * Question: FR-5.5 says a user must be able to mark an item *deliberately not
 * packed*. The state exists and renders; the way to say it is a bare Ionic
 * swipe that nothing announces and that breaks out of the M4 card when it
 * opens. Where does the control live, how does undoing it read, and what does
 * the FR-20.2 co-skip cascade tell the user?
 *
 * Run: node dev-docs/build-skip-control-variants.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const proto = readFileSync(join(here, 'UI_Concept_Prototype.html'), 'utf8')
const css = proto.slice(proto.indexOf('<style>') + 7, proto.indexOf('</style>'))

/** One packing row inside a card, in the M4 grammar. */
const row = ({ name, qty = '0/1', sub = '', cls = '', end = '' }) => `
  <div class="rw ${cls}">
    <div class="step"><span class="sbtn">−</span><b>${qty}</b><span class="sbtn">+</span></div>
    <div class="grow"><div class="nm">${name}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
    ${end}
  </div>`

const card = (inner) => `<div class="mcard">${inner}</div>`

const A = `
<div class="phone">
  <div class="bar">M4 · Kleidung</div>
  <div class="body">
    ${card(
      row({ name: 'Wandersocken', qty: '4/6' }) +
        row({ name: 'Regenjacke', qty: '0/3', cls: 'held' }) +
        row({ name: 'Sonnenhut', qty: '0/2' }),
    )}
    <div class="sheetup">
      <div class="shead">Regenjacke</div>
      <div class="srow"><span class="ic">◐</span>Jetzt packen</div>
      <div class="srow"><span class="ic">👤</span>Mir zuweisen</div>
      <div class="srow warn"><span class="ic">⊘</span>Nicht einpacken</div>
      <div class="srow mut"><span class="ic">✕</span>Abbrechen</div>
    </div>
  </div>
</div>`

const B = `
<div class="phone">
  <div class="bar">M4 · Kleidung</div>
  <div class="body">
    ${card(
      row({ name: 'Wandersocken', qty: '4/6' }) +
        `<div class="rw sliding">
           <div class="step"><span class="sbtn">−</span><b>0/3</b><span class="sbtn">+</span></div>
           <div class="grow"><div class="nm">Regenjacke</div></div>
           <div class="slide-panel">Nicht einpacken</div>
         </div>` +
        row({ name: 'Sonnenhut', qty: '0/2' }),
    )}
    <div class="note">Der Wisch bleibt <em>im</em> Kärtchen: gleiche Rundung, gleicher
      Einzug. Heute reisst er aus — das ist der Befund oben.</div>
    <div class="hintbar">Tipp: nach links wischen lässt eine Sache bewusst weg. <span class="x">✕</span></div>
  </div>
</div>`

const C = `
<div class="phone">
  <div class="bar">M5 · Regenjacke</div>
  <div class="body">
    <div class="sheet2">
      <h3>Regenjacke</h3>
      <div class="sub2">Kleidung</div>
      <div class="statebar">
        <div class="seg">offen</div>
        <div class="seg">gepackt</div>
        <div class="seg on">weggelassen</div>
      </div>
      <div class="frow"><span class="lbl">Menge</span><span class="val">0 von 3</span></div>
      <div class="frow"><span class="lbl">Weil</span><span class="val">bewusst entschieden</span></div>
      <div class="note2">Ausgegraut in der Liste, zählt als erledigt (FR-25.2),
        jederzeit wieder auf <em>offen</em>.</div>
    </div>
  </div>
</div>`

const D = `
<div class="phone">
  <div class="bar">M4 · Kleidung</div>
  <div class="body">
    ${card(
      row({ name: 'Wandersocken', qty: '4/6' }) +
        `<div class="rw">
           <div class="step"><span class="sbtn hot">−</span><b>0/3</b><span class="sbtn">+</span></div>
           <div class="grow"><div class="nm">Regenjacke</div>
             <div class="sub">gedrückt halten → Menge 0</div></div>
         </div>` +
        row({
          name: 'Sonnenhut',
          qty: '0/0',
          cls: 'gone',
          sub: 'bewusst weggelassen',
          end: '<span class="chipx skip">weggelassen</span>',
        }),
    )}
    <div class="note">Keine neue Geste: die Null <em>ist</em> die Entscheidung.
      FR-5.5 definiert übersprungen genau so — „Menge 0“.</div>
  </div>
</div>`

const toast = `
<div class="toastwrap">
  <div class="toast">„Drohne“ weggelassen — auch Akku und Ladegerät<br />
    <span class="tsub">gehören zur Drohne (FR-20.2)</span>
    <span class="tundo">Rückgängig</span>
  </div>
</div>`

const page = `<!doctype html>
<html lang="de" data-theme="mocha"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bewusst nicht einpacken — Varianten</title>
<style>${css}
body{padding:0;margin:0}
.vwrap{max-width:1400px;margin:0 auto;padding:28px 20px 60px}
.vhead{max-width:76ch;margin-bottom:26px}
.vhead h1{font:600 27px/1.15 var(--display);margin:0 0 10px}
.vhead p{margin:0 0 8px;color:var(--sub0);font-size:14.5px;line-height:1.6}
.vgrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(360px,1fr));gap:26px;align-items:start}
.vcol{display:flex;flex-direction:column;gap:12px}
.vcap .k{font:600 11.5px/1 var(--ui);letter-spacing:.1em;text-transform:uppercase;color:var(--peach)}
.vcap h2{font:600 18px/1.2 var(--display);margin:6px 0 6px}
.vcap p{margin:0 0 6px;color:var(--sub0);font-size:13px;line-height:1.55}
.vcap .cost{color:var(--peach);font-size:12.5px}
.phone{width:360px;height:560px;border:1px solid var(--s0);border-radius:22px;overflow:hidden;
  background:var(--mantle);box-shadow:var(--shadow);position:relative;display:flex;flex-direction:column}
.phone .bar{padding:11px 14px;border-bottom:1px solid var(--s0);background:var(--crust);
  font:600 13px/1 var(--ui);color:var(--sub0)}
.phone .body{flex:1;overflow:hidden;padding:12px;position:relative}
.mcard{background:var(--base);border:1px solid var(--s0);border-radius:16px;overflow:hidden}
.rw{display:flex;gap:9px;align-items:center;padding:10px 12px;border-top:1px solid var(--s0);position:relative}
.rw:first-child{border-top:0}
.rw .grow{flex:1}
.rw .nm{font-size:14.5px;font-weight:600}
.rw .sub{font-size:12px;color:var(--o0);margin-top:2px}
.rw.gone .nm{opacity:.5;text-decoration:line-through}
.rw.gone .sub{opacity:.6}
.rw.held{background:var(--s0)}
.rw.sliding{padding-right:0;overflow:hidden}
.slide-panel{align-self:stretch;display:flex;align-items:center;padding:0 14px;margin-left:8px;
  background:var(--s1);color:var(--text);font:600 12.5px/1 var(--ui);white-space:nowrap}
.step{display:flex;align-items:center;gap:6px;flex:none}
.step b{min-width:30px;text-align:center;font:600 13.5px/1 var(--ui);color:var(--sub0)}
.sbtn{width:26px;height:26px;border-radius:9px;border:1px solid var(--s1);display:grid;place-items:center;
  color:var(--sub0);font-size:14px;background:var(--base)}
.sbtn.hot{border-color:var(--peach);color:var(--peach)}
.chipx{font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--s1);color:var(--o0)}
.sheetup{position:absolute;left:12px;right:12px;bottom:12px;background:var(--base);
  border:1px solid var(--s0);border-radius:18px;overflow:hidden;box-shadow:var(--shadow)}
.shead{padding:12px 16px;font:600 13px/1 var(--ui);color:var(--o0);border-bottom:1px solid var(--s0)}
.srow{padding:13px 16px;font-size:14.5px;border-top:1px solid var(--s0);display:flex;gap:11px;align-items:center}
.srow:first-of-type{border-top:0}
.srow .ic{width:18px;text-align:center;color:var(--o1)}
.srow.warn{color:var(--peach)}
.srow.mut{color:var(--o0)}
.note{margin:12px 2px 0;font-size:12.5px;color:var(--o0);line-height:1.5}
.note2{margin:12px 0 0;font-size:12.5px;color:var(--o0);line-height:1.5}
.hintbar{margin:10px 0 0;padding:9px 12px;border-radius:12px;border:1px dashed var(--s1);
  color:var(--sapphire);font-size:12.5px;display:flex;align-items:center}
.hintbar .x{margin-left:auto;color:var(--o0)}
.sheet2{background:var(--base);border:1px solid var(--s0);border-radius:18px;padding:16px}
.sheet2 h3{font:600 19px/1.2 var(--display);margin:0}
.sub2{color:var(--o0);font-size:12.5px;margin:2px 0 14px}
.statebar{display:flex;gap:6px;background:var(--crust);padding:4px;border-radius:12px}
.seg{flex:1;text-align:center;padding:8px 6px;border-radius:9px;font:600 12.5px/1 var(--ui);color:var(--o1)}
.seg.on{background:var(--s1);color:var(--text)}
.frow{display:flex;align-items:center;gap:10px;padding:11px 2px;border-top:1px solid var(--s0)}
.frow .lbl{font-size:13.5px}
.frow .val{margin-left:auto;color:var(--sub0);font-size:13px}
.shared{margin-top:34px;max-width:76ch}
.shared h2{font:600 21px/1.2 var(--display);margin:0 0 10px}
.shared p{color:var(--sub0);font-size:14px;line-height:1.6;margin:0 0 10px}
.shared li{color:var(--sub0);font-size:14px;line-height:1.6;margin-bottom:7px}
.toastwrap{margin:14px 0 0;max-width:420px}
.toast{background:var(--s0);border:1px solid var(--s1);border-radius:14px;padding:12px 14px;
  font-size:13.5px;line-height:1.45;position:relative}
.tsub{color:var(--o0);font-size:12px}
.tundo{display:block;margin-top:8px;color:var(--sapphire);font:600 12.5px/1 var(--ui)}
table.cmp{border-collapse:collapse;margin:14px 0 0;font-size:13.5px;width:100%;max-width:820px}
table.cmp th,table.cmp td{border-top:1px solid var(--s0);padding:9px 10px;text-align:left;color:var(--sub0);vertical-align:top}
table.cmp th{color:var(--text);font:600 12px/1 var(--ui);letter-spacing:.06em;text-transform:uppercase}
</style></head>
<body>
<div class="vwrap">
  <div class="vhead">
    <h1>„Bewusst nicht einpacken“ — es gibt den Zustand, nur keinen Weg dorthin</h1>
    <p>FR-5.5 trennt <em>vergessen</em> von <em>entschieden</em>. Der Zustand ist gebaut: eine
      übersprungene Zeile zählt als erledigt, wird durchgestrichen gezeigt und von FR-25.2
      mit den gepackten versteckt; <code>skipItem</code>/<code>unskipItem</code> existieren
      samt FR-20.2-Kaskade.</p>
    <p><strong>Der Befund beim Nachsehen ist nicht „es fehlt“, sondern „es ist unsichtbar und
      kaputt“:</strong> die Aktion hängt an einem blossen Ionic-Wisch, den nichts ankündigt — und
      wenn er aufgeht, bricht er aus dem M4-Kärtchen aus: eckiges Panel bis an den Bildschirmrand,
      die Zeile verliert ihren Stepper. Genau der Fehler, an dem der Wisch schon in der
      M7-Runde gescheitert ist. Die Frage ist also nicht nur <em>ob</em> ein Bedienweg dazukommt,
      sondern <em>welcher an seine Stelle tritt</em>.</p>
  </div>

  <div class="vgrid">
    <div class="vcol">
      <div class="vcap"><span class="k">Variante A</span>
        <h2>Langdruck-Menü auf der Zeile</h2>
        <p>Halten öffnet dasselbe Aktionsblatt, das M7 seit der A2-Runde benutzt: packen,
          zuweisen, <em>nicht einpacken</em>. Auf einer weggelassenen Zeile heisst der
          Eintrag „Doch einpacken“.</p>
        <p class="cost">Kosten: eine Geste, die man kennen muss — aber eine, die es hier
          schon gibt und die nichts kaputt macht.</p>
      </div>${A}
    </div>

    <div class="vcol">
      <div class="vcap"><span class="k">Variante B</span>
        <h2>Der Wisch, repariert und benannt</h2>
        <p>Bleibt beim Bestehenden, behebt aber beide Mängel: das Panel wird ins Kärtchen
          gezwungen, und die Beschriftung wird zur <em>Handlung</em> („Nicht einpacken“ statt
          des Zustandsnamens „Bewusst weggelassen“). Dazu ein einmaliger Hinweisstreifen.</p>
        <p class="cost">Kosten: eine erklärungsbedürftige Geste bleibt erklärungsbedürftig —
          der Streifen ist das Eingeständnis.</p>
      </div>${B}
    </div>

    <div class="vcol">
      <div class="vcap"><span class="k">Variante C</span>
        <h2>Im M5-Sheet, als dritter Zustand</h2>
        <p>Das Detail-Sheet zeigt den Zustand ohnehin als Chip. Hier wird er bedienbar:
          offen · gepackt · weggelassen, ein Zug. Nichts versteckt, alles benannt.</p>
        <p class="cost">Kosten: zwei Taps und ein Screenwechsel für etwas, das beim
          Durchgehen der Liste passiert.</p>
      </div>${C}
    </div>

    <div class="vcol">
      <div class="vcap"><span class="k">Variante D</span>
        <h2>Die Null im Stepper</h2>
        <p>Gar keine neue Bedienung: langes Drücken auf „−“ setzt die Menge schon heute auf
          0. Menge 0 <em>wird</em> künftig „bewusst weggelassen“ — so, wie FR-5.5 es
          wörtlich definiert.</p>
        <p class="cost">Kosten: eine Null kann auch „ich weiss noch nicht“ heissen; die
          Bedeutung wird der Nutzerin untergeschoben statt von ihr gewählt.</p>
      </div>${D}
    </div>
  </div>

  <div class="shared">
    <h2>Was in jeder Variante gleich bleibt</h2>
    <p>Vier Fragen, die die Hintergrund-Notiz stellt, und die unabhängig von der gewählten
      Geste beantwortet werden müssen:</p>
    <ul>
      <li><strong>Menge 0 ist nicht dasselbe wie weggelassen.</strong> Die Null ist ein
        Zählerstand, „weggelassen“ eine Entscheidung. Wer skippt, bekommt beides
        (<code>state='skipped'</code> und Menge 0, wie <code>skipItem</code> es heute schreibt);
        wer nur zählt, bekommt nur die Null.</li>
      <li><strong>Zurücknehmen liest sich als Gegenteil,</strong> nicht als „Rückgängig“:
        „Doch einpacken“ stellt die Zeile auf offen mit Menge 1 (FR-5.5).</li>
      <li><strong>Die FR-20.2-Kaskade sagt, was sie mitgenommen hat.</strong> Heute schweigt
        sie: wer die Drohne weglässt, verliert Akku und Ladegerät stumm. Sie gehört in
        denselben Snackbar-Mechanismus, den FR-25.2 fürs Packen gebaut hat — eine Meldung,
        ein Rückgängig, das die ganze Kaskade zurücknimmt.</li>
      <li><strong>Weggelassen bleibt sichtbar erklärbar:</strong> die Zeile taucht über den
        <em>Erledigte</em>-Schalter wieder auf, durchgestrichen und mit ihrem Grund
        („bewusst weggelassen“ bzw. „weggelassen: Drohne nicht dabei“).</li>
    </ul>
    ${toast}

    <h2 style="margin-top:30px">Gegenüberstellung</h2>
    <table class="cmp">
      <tr><th></th><th>auffindbar</th><th>schnell in Folge</th><th>Bruch am Kärtchen</th><th>neu zu bauen</th></tr>
      <tr><td>A Langdruck</td><td>mittel — Geste, aber hausüblich</td><td>ja</td><td>nein</td><td>Menü an M4</td></tr>
      <tr><td>B Wisch</td><td>gering</td><td>ja</td><td>ja, muss behoben werden</td><td>Layoutfix + Hinweis</td></tr>
      <tr><td>C M5-Sheet</td><td>hoch</td><td>nein</td><td>nein</td><td>Zustandsleiste</td></tr>
      <tr><td>D Stepper-Null</td><td>gering</td><td>ja</td><td>nein</td><td>Bedeutung der Null</td></tr>
    </table>
    <p style="margin-top:14px"><strong>Empfehlung: A und C zusammen</strong> — dieselbe
      Arbeitsteilung, die M7/M8 schon tragen. Das Langdruck-Menü ist der schnelle Weg beim
      Durchgehen der Liste, das Sheet der auffindbare, der sich selbst erklärt; beide rufen
      dieselbe Mutation. Der kaputte Wisch fällt dabei weg, statt repariert zu werden — die
      M4-Zeile behält damit genau eine Geste weniger, und die verbleibende ist die, die im
      Produkt schon woanders gilt. D bleibt draussen, weil eine Null keine Entscheidung ist.</p>
  </div>
</div>
</body></html>`

writeFileSync(join(here, 'UI_Concept_SkipControl_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_SkipControl_variants.html')
