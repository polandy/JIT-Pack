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
    <h1>The closing pass — its own screen, or a mode of M4?</h1>
    <p>FR-9.3 decided everything else and deliberately left this one question open, because it
      hangs on the picture rather than on the argument. Both variants show the same moment:
      <em>„Reise abschliessen“</em> has been tapped, the trip is not archived yet, and the
      question being asked is which things travelled along and were not needed.</p>
    <p>Both are skippable, both mark only <em>unused</em>, and both show <strong>packed</strong>
      rows exclusively — an unpacked one is either FR-5.5 skipped or forgotten, and neither of
      those is "unused".</p>
  </div>

  <div class="vgrid">
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant A</div>
        <h2>Its own screen</h2>
        <p>A flat list, labelled by group rather than grouped, one tap per row. Reachable only
          through the closing action, and never again afterwards.</p>
        <p class="cost">Cost: a new M number and a second list rendering that has to grow along
          with M4.</p>
      </div>
      ${A}
    </div>
    <div class="vcol">
      <div class="vcap">
        <div class="k">Variant B</div>
        <h2>A mode of M4</h2>
        <p>The list that already exists, in a different posture: grouping, facets and search stay,
          the stepper gives way to the switch, and a band at the top says what you are in.</p>
        <p class="cost">Cost: the same screen means two things — and the row gestures there are
          already taken.</p>
      </div>
      ${B}
    </div>
  </div>

  <div class="shared">
    <h2>What it turns on</h2>
    <table class="cmp">
      <tr><th>Question</th><th>A · its own screen</th><th>B · a mode of M4</th></tr>
      <tr><td>Can you walk into it by accident?</td>
        <td>No. There is exactly one entrance.</td>
        <td>Yes — it is the list you have open all the time anyway.</td></tr>
      <tr><td>What does the second rendering cost?</td>
        <td>A list of its own, which has to follow M4's future improvements.</td>
        <td>Nothing. Facets (FR-25.11), grouping and search apply immediately.</td></tr>
      <tr><td>Do the gestures collide?</td>
        <td>No, the screen knows only one action.</td>
        <td>Yes. Press-and-hold there already carries FR-5.5, and FR-9.3's entry in future.</td></tr>
      <tr><td>Can you see how much is still to come?</td>
        <td>Yes, it is a list with an end — exactly what FR-27.11 missed in the card stack.</td>
        <td>Yes, but mixed in with everything else M4 shows.</td></tr>
      <tr><td>How does a 120-row trip read?</td>
        <td>Long and uninterrupted; the group column is the only order in it.</td>
        <td>Like M4 — collapsed groups, filters, search. The clear advantage.</td></tr>
      <tr><td>What happens after „Fertig“?</td>
        <td>Archived, on to M14. One path, one ending.</td>
        <td>The mode switches off — and you are back in the list of a trip that no longer exists that way.</td></tr>
    </table>
    <p>The last row is the one that gives most pause: B ends where it started, on the packing list
      of an archived trip. A has an exit.</p>
    <h2 style="margin-top:26px">Decided 2026-08-23: neither of them</h2>
    <p>The round produced a <em>third</em> form, and that is the one chosen:
      <strong>B with A's exit</strong> — the mode of M4 whose <em>„Fertig“</em> archives the trip
      and opens M14, instead of merely switching the mode off. That removes the last table row, and
      B keeps everything it wins above: grouping, facets, search, none of it built a second time.</p>
    <p>The price stands in row three and is paid rather than explained away: <strong>in that
      posture the row carries exactly one gesture — the tap that marks — and press-and-hold is
      inert.</strong> A view that asks one question must not answer three; both menu entries are
      reachable on the same rows a moment earlier. The wording is in FR-9.3.</p>
  </div>
</div>
</body></html>`

writeFileSync(join(here, 'UI_Concept_ClosingPass_variants.html'), page)
console.log('wrote dev-docs/UI_Concept_ClosingPass_variants.html')
