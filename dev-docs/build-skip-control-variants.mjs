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
    <div class="note">The swipe stays <em>inside</em> the card: same radius, same inset.
      Today it breaks out — that is the finding above.</div>
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
      <div class="note2">Greyed out in the list, counts as done (FR-25.2), and can go back to
        <em>offen</em> at any time.</div>
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
    <div class="note">No new gesture: the zero <em>is</em> the decision. FR-5.5 defines skipped
      exactly that way — „Menge 0“.</div>
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
    <h1>„Bewusst nicht einpacken“ — the state exists, the way to it does not</h1>
    <p>FR-5.5 separates <em>forgotten</em> from <em>decided</em>. The state is built: a skipped row
      counts as done, is shown struck through and is hidden with the packed ones by FR-25.2;
      <code>skipItem</code>/<code>unskipItem</code> exist, cascade (FR-20.2) included.</p>
    <p><strong>The finding on inspection is not "it is missing" but "it is invisible and
      broken":</strong> the action hangs on a bare Ionic swipe that nothing announces — and when it
      opens, it breaks out of the M4 card: a square panel running to the edge of the screen, and the
      row loses its stepper. Exactly the fault the swipe already failed on in the M7 round. So the
      question is not only <em>whether</em> a control is added, but <em>which one takes its
      place</em>.</p>
  </div>

  <div class="vgrid">
    <div class="vcol">
      <div class="vcap"><span class="k">Variant A</span>
        <h2>Press-and-hold menu on the row</h2>
        <p>Holding opens the same action sheet M7 has used since the A2 round: pack, assign,
          <em>do not pack</em>. On a skipped row the entry reads „Doch einpacken“.</p>
        <p class="cost">Cost: a gesture you have to know — but one that already exists here and
          breaks nothing.</p>
      </div>${A}
    </div>

    <div class="vcol">
      <div class="vcap"><span class="k">Variant B</span>
        <h2>The swipe, repaired and named</h2>
        <p>Keeps what is there but fixes both defects: the panel is forced into the card, and the
          label becomes an <em>action</em> („Nicht einpacken“ instead of the state name
          „Bewusst weggelassen“). Plus a one-time hint strip.</p>
        <p class="cost">Cost: a gesture that needs explaining still needs explaining — the strip is
          the admission.</p>
      </div>${B}
    </div>

    <div class="vcol">
      <div class="vcap"><span class="k">Variant C</span>
        <h2>In the M5 sheet, as a third state</h2>
        <p>The detail sheet shows the state as a chip anyway. Here it becomes operable:
          offen · gepackt · weggelassen, one move. Nothing hidden, everything named.</p>
        <p class="cost">Cost: two taps and a screen change for something that happens while going
          down the list.</p>
      </div>${C}
    </div>

    <div class="vcol">
      <div class="vcap"><span class="k">Variant D</span>
        <h2>The zero in the stepper</h2>
        <p>No new control at all: holding „−“ already sets the quantity to 0 today. Quantity 0
          <em>becomes</em> „bewusst weggelassen“ in future — exactly as FR-5.5 defines it
          literally.</p>
        <p class="cost">Cost: a zero can also mean "I don't know yet"; the meaning is imposed on the
          user rather than chosen by her.</p>
      </div>${D}
    </div>
  </div>

  <div class="shared">
    <h2>What stays the same in every variant</h2>
    <p>Four questions the background note raises, which have to be answered whichever gesture is
      chosen:</p>
    <ul>
      <li><strong>Quantity 0 is not the same as skipped.</strong> The zero is a counter reading,
        „weggelassen“ is a decision. Skipping produces both (<code>state='skipped'</code> and
        quantity 0, as <code>skipItem</code> writes it today); counting down produces only the
        zero.</li>
      <li><strong>Undoing reads as the opposite,</strong> not as „Rückgängig“: „Doch einpacken“
        puts the row back to open with quantity 1 (FR-5.5).</li>
      <li><strong>The FR-20.2 cascade says what it took with it.</strong> Today it is silent:
        skipping the drone loses the battery and the charger without a word. It belongs in the same
        snackbar mechanism FR-25.2 built for packing — one message, one undo that takes the whole
        cascade back.</li>
      <li><strong>Skipped stays visibly explainable:</strong> the row reappears through the
        <em>Erledigte</em> switch, struck through and carrying its reason („bewusst weggelassen“ or
        „weggelassen: Drohne nicht dabei“).</li>
    </ul>
    ${toast}

    <h2 style="margin-top:30px">Side by side</h2>
    <table class="cmp">
      <tr><th></th><th>discoverable</th><th>fast in a run</th><th>breaks the card</th><th>to build</th></tr>
      <tr><td>A press-and-hold</td><td>medium — a gesture, but a house one</td><td>yes</td><td>no</td><td>menu on M4</td></tr>
      <tr><td>B swipe</td><td>low</td><td>yes</td><td>yes, must be fixed</td><td>layout fix + hint</td></tr>
      <tr><td>C M5 sheet</td><td>high</td><td>no</td><td>no</td><td>state bar</td></tr>
      <tr><td>D stepper zero</td><td>low</td><td>yes</td><td>no</td><td>meaning of the zero</td></tr>
    </table>
    <p style="margin-top:14px"><strong>Recommendation: A and C together</strong> — the same division
      of labour M7/M8 already carry. The press-and-hold menu is the fast way while going down the
      list, the sheet is the discoverable one that explains itself; both call the same mutation. The
      broken swipe is dropped rather than repaired — the M4 row then carries exactly one gesture
      fewer, and the remaining one is the gesture the product already uses elsewhere. D stays out,
      because a zero is not a decision.</p>
  </div>
</div>
</body></html>`

writeFileSync(join(here, 'UI_Concept_SkipControl_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_SkipControl_variants.html')
