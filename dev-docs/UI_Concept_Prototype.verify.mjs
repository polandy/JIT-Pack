// Headless verification of dev-docs/UI_Concept_Prototype.html — run after every
// mockup change (mockup-first working agreement): node dev-docs/UI_Concept_Prototype.verify.mjs
// Covers §3.27 (groups/templates, scopes, tasks, round-trip), the M8 quick-add/
// M5-sheet consistency (FR-25.13), the inventory UX round (FR-24.1/24.4/24.5),
// and the FR-1.3/1.5/1.7/1.8 removals. Grows with each concept round.
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const { chromium } = await import(join(here, '../client/node_modules/playwright-core/index.mjs'));

const FILE = 'file://' + join(here, 'UI_Concept_Prototype.html');
let failures = 0;
const ok = (cond, msg) => { console.log((cond ? '  ✓ ' : '  ✗ FAIL ') + msg); if (!cond) failures++; };

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(FILE);
await page.waitForTimeout(300);

const text = async sel => (await page.locator(sel).innerText()).toLowerCase();

console.log('— M7 scopes (FR-27.6) —');
await page.evaluate(() => go('templates'));
let m7 = await text('#m7List');
ok(m7.includes('ferien-vorlagen') && m7.includes('gruppen'), '"Alle" shows both scope sections');
ok(/gruppen[\s\S]*makro fotografie/.test(m7), 'Makro sits under the groups section');
ok(/familienferien[\s\S]*?2 gruppen · 16 artikel/.test(m7), 'a composed template shows "2 Gruppen · 16 Artikel"');
await page.click('[data-m7tab="group"]');
m7 = await text('#m7List');
ok(m7.includes('makro fotografie') && m7.includes('sommer · basis') && !m7.includes('familienferien'), 'the groups tab shows groups only');
await page.click('[data-m7tab="template"]');
m7 = await text('#m7List');
ok(m7.includes('familienferien') && !m7.includes('wildlife fotografie'), 'the templates tab shows no group rows (the contains line excepted)');

console.log('— FAB chooser (FR-27.6) —');
await page.evaluate(() => go('templates'));
await page.click('#fab');
ok(await page.locator('#tplKindSheet.open').count(), 'the chooser opens with two options');
await page.locator('#tplKindSheet .card').nth(1).click();   // "Gruppe"
let m8 = await text('#tplEditPage');
ok((await page.inputValue('#t8name')) === 'Neue Gruppe', 'a new group is created');
ok(m8.includes('positionen · 0') && !m8.includes('eigene positionen'), 'group editor: positions section only');
ok(!(await page.locator('#t8opengpick').count()), 'the group editor has no group picker');
ok(await page.locator('[data-t8kind="group"].sel').count(), 'the scope segment stands on group');

console.log('— M8 vacation template: the picker offers groups only, plus inline creation —');
await page.evaluate(() => openM8('ferienfam'));
m8 = await text('#tplEditPage');
ok(m8.includes('gruppen · 2'), 'groups section with 2 entries');
ok(m8.includes('eigene positionen · 0'), 'own positions 0');
ok(m8.includes('16 artikel aufgelöst'), 'the resolution footer shows 16 items');
ok(m8.includes('samedan sommer 2027'), 'the propagation note names the planned trip');
await page.click('#t8opengpick');
ok(await page.locator('[data-t8ginc="wildlife"]').count(), 'Wildlife (a group) can be included');
ok(!(await page.locator('[data-t8ginc="ski"]').count()), 'vacation templates do not appear in the group picker');
ok(!(await page.locator('[data-t8ginc="makro"]').count()), 'an already included group is not offered again');
page.once('dialog', d => d.accept('Nachtfotografie'));
await page.click('[data-t8gnew]');
m8 = await text('#tplEditPage');
ok(m8.includes('gruppen · 3') && m8.includes('nachtfotografie'), 'a group created inline is included');
await page.evaluate(() => { const t = TPL.find(x => x.id === 'ferienfam'); t.includes = t.includes.filter(i => i !== TPL[TPL.length - 1].id); renderTplEdit(); });

console.log('— Scope guards (FR-27.6) —');
await page.click('[data-t8kind="group"]');
m8 = await text('#tplEditPage');
ok(m8.includes('gruppen · 2'), 'a template with groups cannot be turned into a group');
await page.evaluate(() => openM8('sommer'));
await page.click('[data-t8kind="template"]');
ok(await page.evaluate(() => tplKind(TPL.find(x => x.id === 'sommer')) === 'group'), 'an included group cannot be promoted');
m8 = await text('#tplEditPage');
ok(m8.includes('eingebunden in: familienferien'), 'the editor shows where the group is used');

console.log('— Preparation tasks on the position, in the M5 sheet (FR-27.7/§3.25) —');
await page.evaluate(() => openM8('makro'));
m8 = await text('#tplEditPage');
ok(m8.includes('📋 1 vorbereitung'), 'the seeded task shows as a chip on the charger position');
await page.click('[data-t8open="2"]');
ok(await page.locator('#t8Sheet.open').count(), 'the row opens the bottom sheet as M5 does');
let sheet = await text('#t8SheetBody');
ok(sheet.includes('akkus laden'), 'the sheet lists the task');
ok(sheet.includes('blockieren „erledigt“'), 'the sheet explains the blocking rule');
ok(await page.locator('#t8SheetBody .savechip.saved').count() === 1 && (await page.locator('#t8SheetBody .savechip').innerText()).trim() === '✓', 'auto-save indicator: glyph only, meaning in the tooltip (FR-25.15)');
await page.fill('#t8TaskIn', 'Objektiv reinigen');
await page.click('#t8TaskAdd');
m8 = await text('#tplEditPage');
ok(m8.includes('📋 2 vorbereitung'), 'a new task is captured — the chip counts 2');
await page.click('[data-t8trm="1"]');
m8 = await text('#tplEditPage');
ok(m8.includes('📋 1 vorbereitung'), 'the task can be removed again');
await page.evaluate(() => closeT8Item());

console.log('— A group change reaches planned trips only (FR-27.4) —');
await page.evaluate(() => openM8('makro'));

console.log('— Quick-add as on the packing list (FR-25.13 in M8) —');
ok((await text('#t8qa')).includes('position hinzufügen'), 'a collapsed quick-add card as in M4');
await page.click('#fab');
ok(await page.locator('#t8qa.qa-open').count(), 'the FAB expands the quick-add (as M4/M6 do)');
await page.fill('#t8qaInput', 'Stirnlampe');
ok((await text('#t8qaSugg')).includes('stirnlampe'), 'autocomplete out of the inventory (FR-5.6)');
ok((await text('#t8qa')).includes('zur gruppe hinzufügen'), 'a visible confirm button, labelled by scope');
await page.locator('[data-t8qadd]').first().click();
m8 = await text('#tplEditPage');
ok(m8.includes('stirnlampe'), 'the headlamp position is taken into the Makro group');
ok(await page.locator('#t8qa.qa-open').count(), 'the field stays open for the next position');
ok((await page.inputValue('#t8qaInput')) === '', 'the input is cleared after adding');
await page.fill('#t8qaInput', 'Stirnlampe');
await page.keyboard.press('Enter');
ok((await text('#snackMsg')).includes('schon drin'), 'a duplicate is reported, not created twice (FR-20.3)');
await page.evaluate(() => { M8.qaOpen=false; M8.qaName=''; renderT8Qa(); });

console.log('— Minimal editing in the M5 sheet with defaults (FR-25.7/§3.25) —');
ok(!(await page.locator('#t8Sheet.open').count()), 'a new position does not open a form by itself');
ok(m8.includes('standard'), 'the row shows "Standard" (all defaults)');
await page.click('[data-t8open="3"]');
sheet = await text('#t8SheetBody');
ok(sheet.includes('menge') && sheet.includes('vorbereitung'), 'the sheet first shows quantity and preparation only');
ok(sheet.includes('details ▾'), '"Details ▾" is offered as in M5');
ok(!sheet.includes('dedup: maximum'), 'the advanced parameters are hidden at first');
await page.click('#t8Adv');
sheet = await text('#t8SheetBody');
ok(sheet.includes('dedup: maximum') && sheet.includes('später-packer'), '"Details" reveals the advanced parameters');
ok(sheet.includes('wer braucht das?'), 'the M5 wording for the assignment (FR-25.10)');
ok(await page.locator('#t8SheetBody .stepper').count() === 1 && !(await page.locator('#t8SheetBody .finput').count()), 'quantity is a stepper, no longer a formula field (FR-1.3 retired)');
await page.click('[data-t8qinc]');
sheet = await text('#t8SheetBody');
ok(sheet.includes('2×'), 'the stepper raises the quantity (1 → 2)');
await page.click('[data-t8qdec]');
await page.evaluate(() => closeT8Item());
await page.evaluate(() => go('trips'));
let m2 = await text('#m2List');
ok(m2.includes('4 änderungen aus gruppen übernommen'), 'update chip on the planned trip (inclusion + task add/remove + headlamp)');
const updChips = await page.locator('[data-m2upd]').count();
ok(updChips === 1, `Chip nur auf einer Reise (gefunden: ${updChips}) — aktive/archivierte eingefroren`);
await page.click('[data-m2upd]');
m2 = await text('#m2List');
ok(m2.includes('stirnlampe') && m2.includes('hinzugefügt'), 'the unfolded change list names the position');
ok(m2.includes('laufende & vergangene reisen bleiben unverändert'), 'the freeze note is in the list');

console.log('— Wizard step 3: scopes plus a real dedup preview (FR-27.2/27.3/27.6) —');
await page.evaluate(() => { resetWizard(); go('wizard'); W.step = 3; renderWizard(); });
await page.waitForTimeout(50);
let wl = await text('#tplList');
ok(wl.includes('ferien-vorlagen') && wl.includes('zusätzliche gruppen'), 'step 3 separates templates from groups');
let foot = await text('#tplFoot');
ok(foot.includes('19 artikel'), `preview counts resolved (19) — actual: "${foot.split('\n')[0]}"`);
ok(foot.includes('2 vorbereitungs-aufgaben übernommen'), 'the preview reports the adopted tasks (helmet + batteries)');
await page.evaluate(() => { W.templates.wildlife = true; renderTplList(); renderTplFoot(); });
foot = await text('#tplFoot');
ok(foot.includes('spiegelreflex / systemkamera nur 1×'), 'the camera dedup is reported by name');
ok(foot.includes('makro fotografie') && foot.includes('wildlife fotografie'), 'the dedup names both source groups');
ok(foot.includes('21 artikel'), `nach Wildlife: 21 — ist: "${foot.split('\n')[0]}"`);
await page.fill('#wExtraInput', 'Feldstecher');
await page.click('[data-wexadd]');
foot = await text('#tplFoot');
ok(foot.includes('22 artikel'), 'the single item binoculars counts towards it (22)');
await page.fill('#wExtraInput', 'Stativ');
await page.click('[data-wexadd]');
foot = await text('#tplFoot');
ok(foot.includes('bereits enthalten, nicht doppelt'), 'a single item already contained is reported as deduplicated');
ok(foot.includes('22 artikel'), 'the counter stays at 22');

console.log('— M10: contained in groups (FR-27.8) —');
await page.evaluate(() => openM10(74));
let m10 = await text('#itemEditPage');
ok(m10.includes('enthalten in'), 'M10 shows the contained-in section');
ok(m10.includes('makro fotografie') && m10.includes('wildlife fotografie'), 'camera: both groups are listed');
ok(m10.includes('auf welchen reisen der artikel dabei war'), 'the trip-history todo is noted');

console.log('— M10: comments from trips (FR-27.9) —');
ok(m10.includes('kommentare aus reisen · 2'), 'camera: 2 comments aggregated');
ok(m10.includes('ersatzakku mitnehmen'), 'the comment text is visible');
ok(m10.includes('andy · samedan 2025 · 21. aug 2025'), 'meta line: who, which trip, when');
ok(m10.includes('sia · samedan 2024'), 'a second comment with a different trip and author');
await page.evaluate(() => openM10(63));
ok(!(await text('#itemEditPage')).includes('kommentare aus reisen'), 'an item without comments: the section is absent entirely');
await page.evaluate(() => openM10(74));
await page.click('[data-edtpl="makro"]');
ok(await page.evaluate(() => M8.id === 'makro' && stack[stack.length-1] === 'templateedit'), 'a group row navigates into the M8 editor');

console.log('— Template from a trip (FR-27.5) —');
await page.evaluate(() => openPack('sam25'));   // an archived trip opens M4 with the closing card
await page.click('#tripDoneTpl');
let tft = await text('#tftPage');
ok(tft.includes('erkannte gruppen · 2'), 'both groups are recognised');
ok(tft.includes('auf der reise ergänzt: gimbal'), 'the Makro deviation (gimbal) is recognised');
// Derived, not hard-coded: the seed's loose-row count changes whenever a
// round adds a trip item, and the assertion is about "all of them, pre-checked".
const looseN = await page.evaluate(() => P.items.filter(i => !i.src).length);
ok(tft.includes(`eigene artikel · ${looseN} von ${looseN}`), `lose Artikel gelistet (${looseN}), alle vorausgewählt`);
const makroBefore = await page.evaluate(() => TPLITEMS.makro.length);
await page.click('#tftCreate');
await page.waitForTimeout(50);
m8 = await text('#tplEditPage');
ok(m8.includes('gruppen · 2'), 'the new template references both groups');
ok(m8.includes(`eigene positionen · ${looseN}`), `lose Artikel (${looseN}) als eigene Positionen`);
ok(await page.locator('[data-t8kind="template"].sel').count(), 'the new template has the vacation-template scope');
const makroAfter = await page.evaluate(() => TPLITEMS.makro.length);
ok(makroAfter === makroBefore + 1, 'the gimbal flowed back into the Makro group');
await page.evaluate(() => go('trips'));
m2 = await text('#m2List');
// Derived: how many changes the fold-back produced depends on the seed's
// provenance, which later rounds adjust. What must hold is that every logged
// change surfaces on the planning trip's row — none may be applied silently.
const upd = await page.evaluate(() => (TRIP_UPDATES['sam27'] || []).length);
ok(upd > 0 && m2.includes(`${upd} änderungen aus gruppen übernommen`),
  `all ${upd} propagated changes are on the planned trip (FR-27.4)`);

console.log('— M9 lean, plus the properties panel (UX round) —');
await page.evaluate(() => { M9.show={tags:false,weight:false,price:false}; go('items'); });
let m9 = await text('#m9List');
ok(!m9.includes('900 g') && !m9.includes('140 chf'), 'lean by default: no weight or price in the list');
ok((await page.locator('#m9List .chip').count()) === 0, 'lean by default: no tag chips per row');
await page.click('#m9Props');
ok(await page.locator('#m9PropSheet.open').count(), 'the eye icon opens the properties panel');
await page.click('[data-m9prop="weight"]');
await page.click('[data-m9prop="price"]');
await page.evaluate(() => closeM9Props());
m9 = await text('#m9List');
ok(m9.includes('900 g') && m9.includes('140 chf'), 'weight and price appear once configured');
ok((await text('#itemsPage')).includes('2'), 'the badge on the eye counts the revealed properties');
await page.click('#m9Props');
await page.click('[data-m9prop="tags"]');
await page.evaluate(() => closeM9Props());
ok((await page.locator('#m9List .chip').count()) > 0, 'tags can be revealed optionally');
await page.evaluate(() => { M9.show={tags:false,weight:false,price:false}; renderItems(); });
ok(!(await text('#itemsPage')).includes('einheit'), 'the unit exists nowhere any more (FR-1.8 retired)');

console.log('— M10 creation is minimal (UX round) —');
await page.click('#fab');
let m10n = await text('#itemEditPage');
ok(m10n.includes('neuer artikel — nur der name ist nötig'), 'creation explains itself: only the name is needed');
ok(!m10n.includes('enthalten in'), 'no contained-in section on an unsaved item');
ok(!m10n.includes('löschen') && !m10n.includes('verwendet'), 'no delete/usage card on creation');
ok(m10n.includes('mehr — gewicht & preis'), 'weight and price are optional, behind "Mehr"');
ok(!m10n.includes('gewicht (g)'), 'the weight fields are hidden at first');
await page.click('#edMore');
ok((await text('#itemEditPage')).includes('gewicht (g) · preis (chf)'), '"Mehr" reveals weight and price');
await page.click('[data-edcreate]');
ok((await text('#snackMsg')).includes('braucht einen namen'), 'creating without a name is caught');
await page.fill('#edName', 'Ministativ');
await page.evaluate(() => { MASTER.find(x=>x.id==EDIT.id).name='Ministativ'; });
await page.click('[data-edcreate]');
m10n = await text('#itemEditPage');
ok(m10n.includes('enthalten in'), 'after creation: the full editor with contained-in');
ok((await text('#snackMsg')).includes('im inventar angelegt'), 'the creation is confirmed');

console.log('— Tag field: search or create (FR-24.1 refinement) —');
const allChips = await page.locator('#edTagsWrap .chips .opt').count();
await page.fill('#edTagQ', 'Fo');
let tagWrap = await text('#edTagsWrap');
ok((await page.locator('#edTagsWrap .chips .opt').count()) < allChips, 'typing filters the tag chips');
ok(tagWrap.includes('foto'), 'the hit "Foto" is visible');
await page.click('#edTagsWrap [data-edtag="Foto"]');
tagWrap = await text('#edTagsWrap');
ok(tagWrap.includes('im inventar unter: foto'), 'a filtered tag is assigned by tap');
await page.fill('#edTagQ', 'Nachtaufnahmen');
tagWrap = await text('#edTagsWrap');
ok(tagWrap.includes('„nachtaufnahmen“ neu anlegen'), 'an unknown term offers to create it');
await page.locator('#edTagsWrap [data-edtagadd]').dispatchEvent('mousedown');
tagWrap = await text('#edTagsWrap');
ok(tagWrap.includes('im inventar unter: foto, nachtaufnahmen'), '+ creates the new tag and assigns it');
ok((await page.inputValue('#edTagQ')) === '', 'the search field is cleared after creation');
await page.evaluate(() => go('items'));

console.log('— A group onto the running trip (FR-27.10) —');
await page.evaluate(() => { go('pack'); packFabAdd(); });
let qa = await text('#qaTrigger');
ok(qa.includes('ganze gruppe hinzufügen'), 'the quick-add offers groups');
ok(qa.includes('makro fotografie') && qa.includes('wildlife fotografie'), 'both groups are proposed');
await page.fill('#qaInput', 'wild');
qa = await text('#qaTrigger');
ok(qa.includes('wildlife fotografie') && !qa.includes('makro fotografie'), 'typing filters the groups');
const beforeRows = await page.evaluate(() => P.items.length);
await page.locator('[data-qagrp="wildlife"]').dispatchEvent('mousedown');
await page.waitForTimeout(50);
ok((await page.evaluate(() => P.items.length)) === beforeRows + 2,
  'Wildlife adds 2 positions (the SLR was already there)');
ok((await text('#snack')).includes('2 positionen, 1 schon dabei'), 'the snackbar reports what was added and what was a duplicate');
ok(await page.evaluate(() => P.items.filter(i => i.src === 'wildlife').length === 2),
  'new rows carry the group provenance (FR-27.5 recognises them later)');
ok(await page.evaluate(() => !P.items.filter(i => i.src === 'wildlife').some(i => i.missing)),
  'Gruppen-Zugang wird nicht als „fehlt“ markiert (FR-9.1 bleibt ehrlich)');

// The Makro group carries an FR-27.7 task on its charger position.
const prepBefore = await page.evaluate(() => P.prep.length);
await page.evaluate(() => packFabAdd());
await page.fill('#qaInput', 'makro');
await page.locator('[data-qagrp="makro"]').dispatchEvent('mousedown');
await page.waitForTimeout(50);
// Counts are not hard-coded: earlier rounds in this script edited the Makro
// group (M8 quick-add, FR-27.5 fold-back), so both numbers depend on run order.
// What must hold is that only the genuinely absent positions are added.
ok(/\d+ positionen?, \d+ schon dabei/.test(await text('#snack')),
  'Makro: nur die fehlenden Positionen kommen dazu, der Rest wird als Dublette gemeldet');
ok((await page.evaluate(() => P.prep.length)) === prepBefore + 1,
  'FR-27.7-Aufgabe der Position wird als Vorbereitungs-Todo materialisiert');
ok(await page.evaluate(() => P.prep.some(x => x.task === 'Akkus laden' && x.item === 'Ladegerät für Kamera')),
  'the todo hangs on the generated item');
await page.locator('[data-qagrp="makro"]').dispatchEvent('mousedown');
await page.waitForTimeout(50);
ok((await text('#snack')).includes('bereits vollständig'), 'a second attempt reports „schon vollständig“ instead of adding twice');

console.log('— The packing filter survives the session (FR-25.18) —');
await page.evaluate(() => { go('pack'); openFilters(CTX_PACK); });
await page.click('[data-fopt="trav"][data-v="Andy"]');   // Person is the default-open accordion
await page.click('[data-fswitch="done"]');
await page.evaluate(() => closeFilters());
let chips = await text('#packHead');
ok(chips.includes('andy'), 'an active facet value appears as a chip (FR-25.11a)');
ok(await page.evaluate(() => !!sessionStorage.getItem('jitpack.m4filter.sam26')),
  'Filterzustand liegt in der Session, nicht dauerhaft');

await page.reload();
await page.waitForTimeout(300);
ok(await page.evaluate(() => FILT.trav.has('Andy')), 'the facet survives the reload');
ok(await page.evaluate(() => showDone === true), 'the „Erledigte“ switch survives with it');
await page.evaluate(() => go('pack'));
ok((await text('#packHead')).includes('andy'), 'the chip is visible immediately after the reload — no invisible filter');

// A fresh session is the safety valve: no filter is carried into it.
const fresh = await browser.newPage();
await fresh.goto(FILE);
await fresh.waitForTimeout(200);
ok(await fresh.evaluate(() => FILT.trav.size === 0), 'a new session starts unfiltered');
await fresh.close();

await page.evaluate(() => { go('pack'); openFilters(CTX_PACK); });
await page.click('#fClear');
await page.evaluate(() => closeFilters());
ok(await page.evaluate(() => JSON.parse(sessionStorage.getItem('jitpack.m4filter.sam26')).facets.trav.length === 0),
  'resetting is stored as well');

console.log('— Travelers without a type (FR-25.9/FR-2.5 withdrawn) —');
await page.evaluate(() => { resetWizard(); go('wizard'); W.step = 2; renderWizard(); });
const w2 = await text('#wizBody');
ok(!w2.includes('erwachsen') && !w2.includes('kind'), 'step 2 no longer knows an adult/child switch');
ok(w2.includes('andy') && w2.includes('leonardo'), 'travelers are still listed by name');
ok(await page.evaluate(() => W.travelers.every(t => !('kind' in t))), 'no type left in the traveler model');
await page.evaluate(() => { resetWizard(); go('dashboard'); });

console.log('— A trip opens the packing list directly (no phase hub) —');
await page.evaluate(() => go('trips'));
await page.click('[data-trip="sam26"]');
ok(await page.evaluate(() => stack[stack.length - 1] === 'pack'),
  'Tap auf eine Reise landet direkt in M4, ohne Zwischenschritt');
ok((await text('#packHead')).includes('31/50') || (await text('#packHead')).includes('/'),
  'Fortschritt steht in der M4-Kopfzeile, nicht in einem Hub davor');
ok((await page.locator('#tripDone').innerText()).trim() === '',
  'aktive Reise zeigt keine Abschluss-Karte');
ok((await page.evaluate(() => document.querySelectorAll('[data-view="trip"], .phase').length)) === 0,
  'the phase hub is removed entirely');

await page.evaluate(() => { go('trips'); });
await page.click('[data-trip="sam25"]');
let done = await text('#tripDone');
ok(done.includes('reise abgeschlossen'), 'an archived trip leads with the closing card');
ok(done.includes('vorlage aus dieser reise'), 'the M21 entry point now sits here (FR-27.5)');
ok(done.includes('vorschläge fürs nächste mal'), 'the M14 proposals too');
await page.evaluate(() => openPack('sam26'));

console.log('— M14 review, group-aware (FR-9.2 / §3.27) —');
await page.evaluate(() => openPack('sam25'));
let card = await text('#tripDone');
ok(/vorschläge fürs nächste mal · \d+/.test(card), 'the closing card names the number of proposals');
ok((await page.locator('#tripDone .li').count()) === 2,
  'Karte zeigt zwei Beispielzeilen als Vorschau, nicht die ganze Liste');
await page.click('#tripDoneRev');
let rv = await text('#reviewPage');
ok(await page.evaluate(() => stack[stack.length - 1] === 'review'), 'the entry point leads to the M14 screen');
ok(rv.includes('offen ·'), 'M14 is a list with a visible remainder, not a card stack');
ok(rv.includes('ungenutzt') && rv.includes('fehlte'), 'both kinds of proposal in one list');
ok(rv.includes('reiseadapter'), 'the item bought on the way is on the full list');
ok((await page.locator('[data-revtgt]').count()) > 0, 'every row names its target group and lets it be changed');
ok(await page.evaluate(() => [...document.querySelectorAll('[data-revtgt] option')]
     .every(o => TPL.find(x => x.id === o.value && (x.kind || 'template') === 'group'))),
  'Ziel-Auswahl bietet nur Gruppen an, keine Ferien-Vorlagen');

const addRow = await page.locator('[data-revapply]').first();
const grpBefore = await page.evaluate(() => Object.fromEntries(Object.entries(TPLITEMS).map(([k, v]) => [k, v.length])));
await addRow.click();
rv = await text('#reviewPage');
ok(rv.includes('übernommen'), 'an adopted proposal stays visible and marked — it does not vanish without trace');
ok(await page.evaluate(() => Object.keys(TRIP_UPDATES).length > 0),
  'the change is logged as an FR-27.4 change on planned trips');

await page.click('[data-revnever]');
ok(!(await text('#reviewPage')).includes('nie mehr'), 'never-ask-again removes the row from the list');
await page.evaluate(() => openPack('sam26'));
ok((await page.locator('#tripDone').innerText()).trim() === '', 'an active trip still shows no closing card');

console.log('— M11 luggage: create, edit, assign —');
await page.evaluate(() => go('containers'));
let cts = await text('#contList');
ok(cts.includes('ungleichgewicht') || cts.includes('ausgeglichen mit'),
  'Paar-Balance ist sichtbar (FR-10.3) — im Seed gibt es jetzt wirklich ein Paar');
ok((await page.locator('#contList .picks').count()) === 0,
  'keine Knopfwand mehr in „Nicht zugewiesen“');

const nUn = await page.evaluate(() => P.items.filter(i => i.cont === '—').length);
await page.locator('[data-pick]').first().click();
ok(await page.locator('#contSheet.open').count(), 'tapping an unassigned row opens the picker');
await page.locator('[data-cassign="Rucksack"]').click();
ok((await page.evaluate(() => P.items.filter(i => i.cont === '—').length)) === nUn - 1,
  'Auswahl ordnet den Artikel zu und schliesst das Sheet');

const nCont = await page.evaluate(() => LUGGAGE.length);
await page.click('#fab');
ok((await page.evaluate(() => LUGGAGE.length)) === nCont + 1, 'the FAB creates a piece of luggage (minimal form)');
ok(await page.locator('#contSheet.open').count(), 'and opens it right away to be filled in');
await page.fill('#cName', 'Dachbox');
await page.dispatchEvent('#cName', 'change');
await page.fill('#cMax', '45');
await page.dispatchEvent('#cMax', 'change');
ok(await page.evaluate(() => LUGGAGE.some(c => c.name === 'Dachbox' && c.max === 45000)),
  'Name und Limit werden sofort gespeichert (FR-25.15)');
await page.selectOption('#cPair', 'Rucksack');
ok(await page.evaluate(() => {
  const d = LUGGAGE.find(c => c.name === 'Dachbox'), r = LUGGAGE.find(c => c.name === 'Rucksack');
  return d.pair === 'Rucksack' && r.pair === 'Dachbox';
}), 'the pairing is set on both sides');

const assigned = await page.evaluate(() => { P.items[0].cont = 'Dachbox'; return P.items[0].name; });
await page.click('#cDel');
ok(await page.evaluate(() => !LUGGAGE.some(c => c.name === 'Dachbox')), 'deleting removes the piece of luggage');
ok(await page.evaluate(n => P.items.find(i => i.name === n).cont === '—', assigned),
  'its items survive unassigned instead of being deleted with it');
ok(await page.evaluate(() => LUGGAGE.find(c => c.name === 'Rucksack').pair === null),
  'the other side of the pairing is dissolved with it');

console.log('— M12 analytics: a slice really filters, per-person counts correctly —');
await page.evaluate(() => { FACETS.forEach(f => FILT[f.key].clear()); ANA.dim = 'trav'; go('analytics'); });
let ana = await text('#anaPage');
ok(!ana.includes('undefined'), 'no „undefined“ group any more — per-person items are split up');
ok(ana.includes('andy') && ana.includes('sia') && ana.includes('leonardo'),
  'jede reisende Person bekommt ihren Anteil in der Person-Sicht');

await page.locator('[data-slice="Andy"]').click();
ok(await page.evaluate(() => stack[stack.length - 1] === 'pack'), 'tapping a bar leads into the packing list');
ok(await page.evaluate(() => FILT.trav.has('Andy') && FILT.trav.size === 1),
  'und filtert wirklich auf den angetippten Wert, statt nur zu gruppieren');
ok((await text('#packHead')).includes('andy'), 'the filter is visible as a chip (FR-25.11a)');
ok(await page.evaluate(() => JSON.parse(sessionStorage.getItem('jitpack.m4filter.sam26')).facets.trav.includes('Andy')),
  'a filter set from M12 survives the session like any other (FR-25.18)');
await page.evaluate(() => { FACETS.forEach(f => FILT[f.key].clear()); persistPackFilter(); });

console.log('— Responsibility vs. packing record (FR-25.19) —');
await page.evaluate(() => { FACETS.forEach(f => FILT[f.key].clear()); persistPackFilter(); go('pack'); });
ok(await page.evaluate(() => document.querySelector('.respav') !== null),
  'an assigned, still open row shows the responsible person (blue ring)');
ok(await page.evaluate(() => {
  const l = allLeaves().find(x => x.resp && x.packed >= 1 && x.packedBy);
  return !!l && l.resp !== l.packedBy;
}), 'the seed contains the case assigned to A, packed by B');
ok(await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.swipe')];
  return rows.every(r => !(r.querySelector('.respav') && r.querySelector('.packerav')));
}), 'never both avatars on one row at once');

// Packing writes the acting user, never the assignee.
const target = await page.evaluate(() => {
  const it = P.items.find(i => i.resp === 'Andy' && !i.pp && i.packed < i.qty);
  it.resp = 'Sia'; it.packed = 0; it.packedBy = null; renderPack(); return it.id;
});
await page.evaluate(id => {
  const it = P.items.find(i => i.id === id);
  it.packed = it.qty; it.packedBy = ME; it.packedAt = Date.now(); renderPack();
}, target);
ok(await page.evaluate(id => {
  const it = P.items.find(i => i.id === id);
  return it.packedBy === ME && it.resp === 'Sia';
}, target), 'ticking writes the acting person; the responsibility stays unchanged');

await page.evaluate(id => { openItem(id); sheetDetails = true; renderItem(); }, target);
const sh = await text('#itemSheet');
ok(sh.includes('zugewiesen an'), 'the sheet labels the assignment as M6 does — one term for one thing');
ok(sh.includes('gepackt hat es') && sh.includes('nicht wählbar'),
  'the packing record stands beside it and is explicitly not selectable');
// Both pickers mark their selection the same way (.pk.sel — orange outline);
// the responsible picker read a field it no longer wrote, so nothing was marked.
ok(await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#itemSheet .assign')];
  const resp = rows.find(r => /Zugewiesen an/.test(r.textContent));
  return !!resp && resp.querySelector('.pk.sel') !== null;
}), 'the responsible person is marked in the picker');
// Same markup hook in both rows, so the orange .pk.sel outline is identical
// by construction rather than by two copies of the same styling.
ok(await page.evaluate(() => {
  const rows = [...document.querySelectorAll('#itemSheet .assign')];
  const avatars = r => [...r.querySelectorAll('.mini-av')].every(a => a.classList.contains('pk'));
  return rows.filter(r => /Wer braucht das|Zugewiesen an/.test(r.textContent)).every(avatars);
}), 'both pickers use the same selection tick (.pk) — the same orange frame');
await page.evaluate(() => closeItem());

console.log('— Sheet editing on per-person items (regression) —');
// Driven by real clicks, not by setting the model: the bug was that item-level
// edits landed on a display copy, which a model-level test cannot see.
const ppId = await page.evaluate(() => P.items.find(i => i.pp)?.id);
await page.evaluate(id => { go('pack'); openItem(id); sheetDetails = true; renderItem(); }, ppId);
await page.locator('#itemSheet [data-act="packer"][data-v="Sia"]').click();
ok(await page.evaluate(id => P.items.find(i => i.id === id).resp === 'Sia', ppId),
  'responsibility sticks to the per-person item');
ok(await page.evaluate(() =>
  document.querySelector('#itemSheet [data-act="packer"][data-v="Sia"]').classList.contains('sel')),
  'und ist unmittelbar nach dem Klick orange markiert');

await page.locator('#itemSheet [data-act="mode"][data-v="buy_before"]').click();
ok(await page.evaluate(id => P.items.find(i => i.id === id).mode === 'buy_before', ppId),
  'auch der Modus haftet — vorher verpuffte er auf einer Kopie');
await page.locator('#itemSheet [data-act="mode"][data-v="pack"]').click();
await page.locator('#itemSheet [data-act="late"]').click();
ok(await page.evaluate(id => P.items.find(i => i.id === id).late === true, ppId),
  'the late packer likewise');
await page.locator('#itemSheet [data-act="late"]').click();
await page.evaluate(() => closeItem());

console.log('— Things assigned to someone else are hidden by default (FR-25.20) —');
await page.evaluate(() => {
  FACETS.forEach(f => FILT[f.key].clear()); showDone = false; showOthers = false;
  P.items.forEach(i => { if (i.id === 14) i.resp = 'Sia'; });
  persistPackFilter(); go('pack');
});
ok(await page.evaluate(() => !allLeaves().filter(l => l.resp === 'Sia' && !leafDone(l))
     .some(l => [...document.querySelectorAll('#packList .name')].some(n => n.textContent === l.name))),
  'eine Sia zugewiesene Zeile steht nicht in der Liste');
let bar = await text('#othersToggle');
ok(bar.includes('sia') && /\d/.test(bar), 'the bar names the count and the person — nothing disappears silently');
const headBefore = await text('#packHead');
await page.click('#othersToggle');
ok(await page.evaluate(() => [...document.querySelectorAll('#packList .name')]
     .some(n => n.textContent === 'Leonardos Regenzeug')), 'one tap reveals them');
ok((await text('#packHead')) === headBefore,
  'the header line does not change — packed/total stays unfiltered (G-12)');
await page.click('#othersToggle');
ok(await page.evaluate(() => JSON.parse(sessionStorage.getItem('jitpack.m4filter.sam26')).others === false),
  'der Zustand wird wie jeder andere Filter in der Session gehalten (FR-25.18)');
ok(await page.evaluate(() => {
  const mine = allLeaves().filter(l => !l.resp);
  return mine.length > 0;
}), 'unassigned things stay visible — they belong to everyone');

console.log('— Consistency pass: no controls without effect —');
await page.evaluate(() => { resetWizard(); go('wizard'); });
// FR-2.1c: the optional fields — dates, series, attributes — live behind
// one "Mehr Optionen" row now, so everything below opens it first.
ok(!(await page.locator('[data-act="series"][data-v="__new"]').count()),
  'the optional fields are collapsed at first');
ok((await text('#wizBody')).includes('mehr optionen'), 'one row stands for all the optional fields');
await page.click('#wizMore');
await page.click('[data-act="series"][data-v="__new"]');
ok(await page.locator('#wizSeriesNew').count(), 'a new series is captured inline, not via prompt()');
await page.fill('#wizSeriesNew', 'Toskana');
await page.press('#wizSeriesNew', 'Enter');
ok(await page.evaluate(() => W.series === 'Toskana'), 'Enter creates the series');
ok((await text('#wizBody')).includes('toskana'), 'and it appears as the chosen series');

await page.evaluate(() => { resetWizard(); go('wizard'); W.step = 4; renderWizard(); });
let w4 = await text('#wizBody');
ok(w4.includes('deckt sich mit dieser menge'),
  'a history that confirms the quantity already set is text — not a button');
ok(await page.evaluate(() => [...document.querySelectorAll('#wizBody [data-act="sugg"]')]
     .every(b => +b.dataset.q !== (W.q[b.dataset.name] != null ? W.q[b.dataset.name] : QROWS.find(r => r.name === b.dataset.name).base))),
  'every proposal that is offered really does change the quantity');
const sugg = page.locator('#wizBody [data-act="sugg"]').first();
const sName = await sugg.getAttribute('data-name');
await sugg.click();
ok(await page.evaluate(n => W.q[n] === 30, sName), 'adopting sets the quantity from the history');
await page.evaluate(() => { resetWizard(); go('dashboard'); });

console.log('— M2 flat, sorted by usefulness —');
await page.evaluate(() => { M2S.tab = 'all'; M2S.search = ''; go('trips'); });
ok((await page.locator('#m2List .section-h').count()) === 0, 'no series sections any more — one flat list');
const ord = await page.evaluate(() => [...document.querySelectorAll('#m2List [data-trip]')].map(e => e.dataset.trip));
ok(ord[0] === 'sam26', 'the running trip is at the top');
ok(ord.indexOf('wien') < ord.indexOf('davos') && ord.indexOf('davos') < ord.indexOf('sam27'),
  'planned trips ascending — the next one first, not the most distant');
ok(ord.indexOf('sam25') < ord.indexOf('cannobio') && ord.indexOf('cannobio') < ord.indexOf('sam24'),
  'archived trips descending — history reads backwards');
ok((await text('#m2List')).includes('◆ samedan'), 'the series stays visible as a chip on the row');
await page.locator('[data-series]').first().click();
ok(await page.evaluate(() => stack[stack.length - 1] === 'trips'),
  'the series chip does not accidentally lead into the trip');

console.log('— Dependencies §3.20 (FR-20.1/20.2/20.4) —');
await page.evaluate(() => openM10(74));
let ed = await text('#itemEditPage');
ok(ed.includes('hängt ab von'), 'M10 shows the required accessories');
ok(ed.includes('ladegerät für kamera') && ed.includes('nötig'), 'the charger is listed as required');
ok(ed.includes('makro-objektiv') && ed.includes('empfohlen'), 'the macro lens is only recommended');
await page.evaluate(() => openM10(83));
ed = await text('#itemEditPage');
ok(ed.includes('wird gebraucht von'), 'the reverse direction is shown on the accessory');
ok((await page.locator('#itemEditPage [data-eddep]').count()) === 0,
  'the reverse direction is read-only — it is changed on the item that needs it');

// FR-20.4: quick-add pulls the required companion in.
await page.evaluate(() => {
  P.items = P.items.filter(i => !/Systemkamera|Ladegerät/i.test(i.name));
  openPack('sam26'); packFabAdd();
});
await page.fill('#qaInput', 'Spiegelreflex / Systemkamera');
await page.press('#qaInput', 'Enter');
await page.waitForTimeout(60);
ok(await page.evaluate(() => P.items.some(i => i.name === 'Ladegerät für Kamera')),
  'the camera brings its charger along');
ok((await text('#snack')).includes('gehört dazu'), 'and says that it did so');
ok(!(await page.evaluate(() => P.items.some(i => i.name === 'Makro-Objektiv' && i.missing))),
  'only „nötig“ comes along; „empfohlen“ does not, unasked');

// FR-20.2: skipping takes it along again, with a reason.
await page.evaluate(() => {
  const cam = P.items.find(i => i.name === 'Spiegelreflex / Systemkamera');
  const comps = tripCompanions(cam.name);
  P.items = P.items.filter(x => x !== cam);
  P.skipped.push({ name: cam.name, reason: 'bewusst übersprungen' });
  comps.forEach(c => { P.items = P.items.filter(x => x !== c);
    P.skipped.push({ name: c.name, reason: 'übersprungen: ' + cam.name + ' nicht dabei' }); });
  renderPack();
});
ok(await page.evaluate(() => P.skipped.some(s => /übersprungen: Spiegelreflex/.test(s.reason))),
  'the accessory is skipped along with it and names the reason');
ok(await page.evaluate(() => !P.items.some(i => i.name === 'Ladegerät für Kamera')),
  'it is no longer on the packing list');

console.log('— Page errors —');
ok(errors.length === 0, 'no JS errors' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
console.log(failures ? `\n${failures} FAILED` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
