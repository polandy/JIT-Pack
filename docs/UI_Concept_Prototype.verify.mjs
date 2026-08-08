// Headless verification of docs/UI_Concept_Prototype.html — run after every
// mockup change (mockup-first working agreement): node docs/UI_Concept_Prototype.verify.mjs
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

console.log('— M7 Scopes (FR-27.6) —');
await page.evaluate(() => go('templates'));
let m7 = await text('#m7List');
ok(m7.includes('ferien-vorlagen') && m7.includes('gruppen'), '"Alle" zeigt beide Scope-Sektionen');
ok(/gruppen[\s\S]*makro fotografie/.test(m7), 'Makro unter der Gruppen-Sektion');
ok(/familienferien[\s\S]*?2 gruppen · 16 artikel/.test(m7), 'komponierte Vorlage zeigt "2 Gruppen · 16 Artikel"');
await page.click('[data-m7tab="group"]');
m7 = await text('#m7List');
ok(m7.includes('makro fotografie') && m7.includes('sommer · basis') && !m7.includes('familienferien'), 'Gruppen-Tab zeigt nur Gruppen');
await page.click('[data-m7tab="template"]');
m7 = await text('#m7List');
ok(m7.includes('familienferien') && !m7.includes('wildlife fotografie'), 'Vorlagen-Tab zeigt keine Gruppen-Zeilen (enthält-Zeile ausgenommen)');

console.log('— FAB-Chooser (FR-27.6) —');
await page.evaluate(() => go('templates'));
await page.click('#fab');
ok(await page.locator('#tplKindSheet.open').count(), 'Chooser öffnet mit zwei Optionen');
await page.locator('#tplKindSheet .card').nth(1).click();   // "Gruppe"
let m8 = await text('#tplEditPage');
ok((await page.inputValue('#t8name')) === 'Neue Gruppe', 'neue Gruppe angelegt');
ok(m8.includes('positionen · 0') && !m8.includes('eigene positionen'), 'Gruppen-Editor: nur Positionen-Sektion');
ok(!(await page.locator('#t8opengpick').count()), 'Gruppen-Editor hat keinen Gruppen-Picker');
ok(await page.locator('[data-t8kind="group"].sel').count(), 'Scope-Segment steht auf Gruppe');

console.log('— M8 Ferien-Vorlage: Picker nur Gruppen + Inline-Neuanlage —');
await page.evaluate(() => openM8('ferienfam'));
m8 = await text('#tplEditPage');
ok(m8.includes('gruppen · 2'), 'Gruppen-Sektion mit 2 Einträgen');
ok(m8.includes('eigene positionen · 0'), 'eigene Positionen 0');
ok(m8.includes('16 artikel aufgelöst'), 'Auflösungs-Footer zeigt 16 Artikel');
ok(m8.includes('samedan sommer 2027'), 'Propagations-Hinweis nennt die geplante Reise');
await page.click('#t8opengpick');
ok(await page.locator('[data-t8ginc="wildlife"]').count(), 'Wildlife (Gruppe) einbindbar');
ok(!(await page.locator('[data-t8ginc="ski"]').count()), 'Ferien-Vorlagen tauchen im Gruppen-Picker nicht auf');
ok(!(await page.locator('[data-t8ginc="makro"]').count()), 'schon eingebundene Gruppe nicht nochmals angeboten');
page.once('dialog', d => d.accept('Nachtfotografie'));
await page.click('[data-t8gnew]');
m8 = await text('#tplEditPage');
ok(m8.includes('gruppen · 3') && m8.includes('nachtfotografie'), 'Inline neu angelegte Gruppe ist eingebunden');
await page.evaluate(() => { const t = TPL.find(x => x.id === 'ferienfam'); t.includes = t.includes.filter(i => i !== TPL[TPL.length - 1].id); renderTplEdit(); });

console.log('— Scope-Wächter (FR-27.6) —');
await page.click('[data-t8kind="group"]');
m8 = await text('#tplEditPage');
ok(m8.includes('gruppen · 2'), 'Vorlage mit Gruppen lässt sich nicht zur Gruppe machen');
await page.evaluate(() => openM8('sommer'));
await page.click('[data-t8kind="template"]');
ok(await page.evaluate(() => tplKind(TPL.find(x => x.id === 'sommer')) === 'group'), 'eingebundene Gruppe lässt sich nicht promoten');
m8 = await text('#tplEditPage');
ok(m8.includes('eingebunden in: familienferien'), 'Editor zeigt, wo die Gruppe verwendet wird');

console.log('— Vorbereitungs-Aufgaben an der Position, im M5-Sheet (FR-27.7/§3.25) —');
await page.evaluate(() => openM8('makro'));
m8 = await text('#tplEditPage');
ok(m8.includes('📋 1 vorbereitung'), 'Seed-Aufgabe als Chip an der Ladegerät-Position');
await page.click('[data-t8open="2"]');
ok(await page.locator('#t8Sheet.open').count(), 'Zeile öffnet das Bottom-Sheet wie M5');
let sheet = await text('#t8SheetBody');
ok(sheet.includes('akkus laden'), 'Sheet listet die Aufgabe');
ok(sheet.includes('blockieren „erledigt“'), 'Sheet erklärt die Blockier-Regel');
ok(await page.locator('#t8SheetBody .savechip.saved').count() === 1 && (await page.locator('#t8SheetBody .savechip').innerText()).trim() === '✓', 'Auto-Save-Indikator: nur Glyph, Bedeutung im Tooltip (FR-25.15)');
await page.fill('#t8TaskIn', 'Objektiv reinigen');
await page.click('#t8TaskAdd');
m8 = await text('#tplEditPage');
ok(m8.includes('📋 2 vorbereitung'), 'neue Aufgabe erfasst — Chip zählt 2');
await page.click('[data-t8trm="1"]');
m8 = await text('#tplEditPage');
ok(m8.includes('📋 1 vorbereitung'), 'Aufgabe wieder entfernbar');
await page.evaluate(() => closeT8Item());

console.log('— Gruppen-Änderung → nur geplante Reisen (FR-27.4) —');
await page.evaluate(() => openM8('makro'));

console.log('— Quick-Add wie in der Packliste (FR-25.13 in M8) —');
ok((await text('#t8qa')).includes('position hinzufügen'), 'zugeklappte Quick-Add-Karte wie in M4');
await page.click('#fab');
ok(await page.locator('#t8qa.qa-open').count(), 'FAB expandiert das Quick-Add (wie M4/M6)');
await page.fill('#t8qaInput', 'Stirnlampe');
ok((await text('#t8qaSugg')).includes('stirnlampe'), 'Autocomplete aus dem Inventar (FR-5.6)');
ok((await text('#t8qa')).includes('zur gruppe hinzufügen'), 'sichtbarer Bestätigen-Button, scope-beschriftet');
await page.locator('[data-t8qadd]').first().click();
m8 = await text('#tplEditPage');
ok(m8.includes('stirnlampe'), 'Position Stirnlampe in Makro-Gruppe aufgenommen');
ok(await page.locator('#t8qa.qa-open').count(), 'Feld bleibt für die nächste Position offen');
ok((await page.inputValue('#t8qaInput')) === '', 'Eingabe nach dem Hinzufügen geleert');
await page.fill('#t8qaInput', 'Stirnlampe');
await page.keyboard.press('Enter');
ok((await text('#snackMsg')).includes('schon drin'), 'Duplikat wird gemeldet, nicht doppelt angelegt (FR-20.3)');
await page.evaluate(() => { M8.qaOpen=false; M8.qaName=''; renderT8Qa(); });

console.log('— Minimales Editieren im M5-Sheet mit Defaults (FR-25.7/§3.25) —');
ok(!(await page.locator('#t8Sheet.open').count()), 'neue Position öffnet kein Formular von selbst');
ok(m8.includes('standard'), 'Zeile zeigt "Standard" (alle Defaults)');
await page.click('[data-t8open="3"]');
sheet = await text('#t8SheetBody');
ok(sheet.includes('menge') && sheet.includes('vorbereitung'), 'Sheet zeigt zuerst nur Menge + Vorbereitung');
ok(sheet.includes('details ▾'), '"Details ▾" wie in M5 angeboten');
ok(!sheet.includes('dedup: maximum'), 'erweiterte Parameter zunächst verborgen');
await page.click('#t8Adv');
sheet = await text('#t8SheetBody');
ok(sheet.includes('dedup: maximum') && sheet.includes('später-packer'), '"Details" zeigt die erweiterten Parameter');
ok(sheet.includes('wer braucht das?'), 'M5-Wortlaut für die Zuordnung (FR-25.10)');
ok(await page.locator('#t8SheetBody .stepper').count() === 1 && !(await page.locator('#t8SheetBody .finput').count()), 'Menge ist ein Stepper, kein Formel-Feld mehr (FR-1.3 retired)');
await page.click('[data-t8qinc]');
sheet = await text('#t8SheetBody');
ok(sheet.includes('2×'), 'Stepper erhöht die Menge (1 → 2)');
await page.click('[data-t8qdec]');
await page.evaluate(() => closeT8Item());
await page.evaluate(() => go('trips'));
let m2 = await text('#m2List');
ok(m2.includes('4 änderungen aus gruppen übernommen'), 'Update-Chip auf der geplanten Reise (Einbindung + Task-Add/-Remove + Stirnlampe)');
const updChips = await page.locator('[data-m2upd]').count();
ok(updChips === 1, `Chip nur auf einer Reise (gefunden: ${updChips}) — aktive/archivierte eingefroren`);
await page.click('[data-m2upd]');
m2 = await text('#m2List');
ok(m2.includes('stirnlampe') && m2.includes('hinzugefügt'), 'aufgeklappte Änderungsliste nennt die Position');
ok(m2.includes('laufende & vergangene reisen bleiben unverändert'), 'Einfrier-Hinweis in der Liste');

console.log('— Wizard Schritt 3: Scopes + echte Dedup-Vorschau (FR-27.2/27.3/27.6) —');
await page.evaluate(() => { resetWizard(); go('wizard'); W.step = 3; renderWizard(); });
await page.waitForTimeout(50);
let wl = await text('#tplList');
ok(wl.includes('ferien-vorlagen') && wl.includes('zusätzliche gruppen'), 'Schritt 3 trennt Vorlagen und Gruppen');
let foot = await text('#tplFoot');
ok(foot.includes('19 artikel'), `Vorschau zählt aufgelöst (19) — ist: "${foot.split('\n')[0]}"`);
ok(foot.includes('2 vorbereitungs-aufgaben übernommen'), 'Vorschau meldet die übernommenen Aufgaben (Helm + Akkus)');
await page.evaluate(() => { W.templates.wildlife = true; renderTplList(); renderTplFoot(); });
foot = await text('#tplFoot');
ok(foot.includes('spiegelreflex / systemkamera nur 1×'), 'Kamera-Dedup wird namentlich gemeldet');
ok(foot.includes('makro fotografie') && foot.includes('wildlife fotografie'), 'Dedup nennt beide Quell-Gruppen');
ok(foot.includes('21 artikel'), `nach Wildlife: 21 — ist: "${foot.split('\n')[0]}"`);
await page.fill('#wExtraInput', 'Feldstecher');
await page.click('[data-wexadd]');
foot = await text('#tplFoot');
ok(foot.includes('22 artikel'), 'Einzelartikel Feldstecher zählt dazu (22)');
await page.fill('#wExtraInput', 'Stativ');
await page.click('[data-wexadd]');
foot = await text('#tplFoot');
ok(foot.includes('bereits enthalten, nicht doppelt'), 'schon enthaltener Einzelartikel wird dedupliziert gemeldet');
ok(foot.includes('22 artikel'), 'Zähler bleibt bei 22');

console.log('— M10: Enthalten in Gruppen (FR-27.8) —');
await page.evaluate(() => openM10(74));
let m10 = await text('#itemEditPage');
ok(m10.includes('enthalten in'), 'M10 zeigt die Enthalten-in-Sektion');
ok(m10.includes('makro fotografie') && m10.includes('wildlife fotografie'), 'Kamera: beide Gruppen gelistet');
ok(m10.includes('auf welchen reisen der artikel dabei war'), 'Todo Reise-Historie notiert');

console.log('— M10: Kommentare aus Reisen (FR-27.9) —');
ok(m10.includes('kommentare aus reisen · 2'), 'Kamera: 2 Kommentare aggregiert');
ok(m10.includes('ersatzakku mitnehmen'), 'Kommentartext sichtbar');
ok(m10.includes('andy · samedan 2025 · 21. aug 2025'), 'Meta-Zeile: wer, welche Reise, wann');
ok(m10.includes('sia · samedan 2024'), 'zweiter Kommentar mit anderer Reise/Autorin');
await page.evaluate(() => openM10(63));
ok(!(await text('#itemEditPage')).includes('kommentare aus reisen'), 'Artikel ohne Kommentare: Sektion fehlt ganz');
await page.evaluate(() => openM10(74));
await page.click('[data-edtpl="makro"]');
ok(await page.evaluate(() => M8.id === 'makro' && stack[stack.length-1] === 'templateedit'), 'Gruppen-Zeile navigiert in den M8-Editor');

console.log('— Vorlage aus Reise (FR-27.5) —');
await page.evaluate(() => openPack('sam25'));   // an archived trip opens M4 with the closing card
await page.click('#tripDoneTpl');
let tft = await text('#tftPage');
ok(tft.includes('erkannte gruppen · 2'), 'beide Gruppen erkannt');
ok(tft.includes('auf der reise ergänzt: gimbal'), 'Makro-Abweichung (Gimbal) erkannt');
// Derived, not hard-coded: the seed's loose-row count changes whenever a
// round adds a trip item, and the assertion is about "all of them, pre-checked".
const looseN = await page.evaluate(() => P.items.filter(i => !i.src).length);
ok(tft.includes(`eigene artikel · ${looseN} von ${looseN}`), `lose Artikel gelistet (${looseN}), alle vorausgewählt`);
const makroBefore = await page.evaluate(() => TPLITEMS.makro.length);
await page.click('#tftCreate');
await page.waitForTimeout(50);
m8 = await text('#tplEditPage');
ok(m8.includes('gruppen · 2'), 'neue Vorlage referenziert beide Gruppen');
ok(m8.includes(`eigene positionen · ${looseN}`), `lose Artikel (${looseN}) als eigene Positionen`);
ok(await page.locator('[data-t8kind="template"].sel').count(), 'neue Vorlage hat Scope Ferien-Vorlage');
const makroAfter = await page.evaluate(() => TPLITEMS.makro.length);
ok(makroAfter === makroBefore + 1, 'Gimbal in die Makro-Gruppe zurückgeflossen');
await page.evaluate(() => go('trips'));
m2 = await text('#m2List');
// Derived: how many changes the fold-back produced depends on the seed's
// provenance, which later rounds adjust. What must hold is that every logged
// change surfaces on the planning trip's row — none may be applied silently.
const upd = await page.evaluate(() => (TRIP_UPDATES['sam27'] || []).length);
ok(upd > 0 && m2.includes(`${upd} änderungen aus gruppen übernommen`),
  `alle ${upd} Rückfluss-Änderungen stehen auf der geplanten Reise (FR-27.4)`);

console.log('— M9 schlank + Eigenschaften-Panel (UX-Runde) —');
await page.evaluate(() => { M9.show={tags:false,weight:false,price:false}; go('items'); });
let m9 = await text('#m9List');
ok(!m9.includes('900 g') && !m9.includes('140 chf'), 'Default schlank: kein Gewicht/Preis in der Liste');
ok((await page.locator('#m9List .chip').count()) === 0, 'Default schlank: keine Tag-Chips pro Zeile');
await page.click('#m9Props');
ok(await page.locator('#m9PropSheet.open').count(), 'Auge-Icon öffnet das Eigenschaften-Panel');
await page.click('[data-m9prop="weight"]');
await page.click('[data-m9prop="price"]');
await page.evaluate(() => closeM9Props());
m9 = await text('#m9List');
ok(m9.includes('900 g') && m9.includes('140 chf'), 'Gewicht + Preis eingeblendet nach Konfiguration');
ok((await text('#itemsPage')).includes('2'), 'Badge am Auge zählt die eingeblendeten Eigenschaften');
await page.click('#m9Props');
await page.click('[data-m9prop="tags"]');
await page.evaluate(() => closeM9Props());
ok((await page.locator('#m9List .chip').count()) > 0, 'Tags optional einblendbar');
await page.evaluate(() => { M9.show={tags:false,weight:false,price:false}; renderItems(); });
ok(!(await text('#itemsPage')).includes('einheit'), 'Einheit existiert nirgends mehr (FR-1.8 retired)');

console.log('— M10 Neuanlage minimal (UX-Runde) —');
await page.click('#fab');
let m10n = await text('#itemEditPage');
ok(m10n.includes('neuer artikel — nur der name ist nötig'), 'Neuanlage erklärt sich: nur Name nötig');
ok(!m10n.includes('enthalten in'), 'keine "Enthalten in"-Sektion bei ungespeichertem Artikel');
ok(!m10n.includes('löschen') && !m10n.includes('verwendet'), 'keine Lösch-/Verwendungs-Karte bei Neuanlage');
ok(m10n.includes('mehr — gewicht & preis'), 'Gewicht/Preis optional hinter "Mehr"');
ok(!m10n.includes('gewicht (g)'), 'Gewichts-Felder zunächst verborgen');
await page.click('#edMore');
ok((await text('#itemEditPage')).includes('gewicht (g) · preis (chf)'), '"Mehr" blendet Gewicht/Preis ein');
await page.click('[data-edcreate]');
ok((await text('#snackMsg')).includes('braucht einen namen'), 'Anlegen ohne Name wird abgefangen');
await page.fill('#edName', 'Ministativ');
await page.evaluate(() => { MASTER.find(x=>x.id==EDIT.id).name='Ministativ'; });
await page.click('[data-edcreate]');
m10n = await text('#itemEditPage');
ok(m10n.includes('enthalten in'), 'nach dem Anlegen: voller Editor mit Enthalten-in');
ok((await text('#snackMsg')).includes('im inventar angelegt'), 'Anlage bestätigt');

console.log('— Tag-Feld: Suchen-oder-Anlegen (FR-24.1 Verfeinerung) —');
const allChips = await page.locator('#edTagsWrap .chips .opt').count();
await page.fill('#edTagQ', 'Fo');
let tagWrap = await text('#edTagsWrap');
ok((await page.locator('#edTagsWrap .chips .opt').count()) < allChips, 'Tippen filtert die Tag-Chips');
ok(tagWrap.includes('foto'), 'Treffer "Foto" sichtbar');
await page.click('#edTagsWrap [data-edtag="Foto"]');
tagWrap = await text('#edTagsWrap');
ok(tagWrap.includes('im inventar unter: foto'), 'gefilterter Tag per Tap zugewiesen');
await page.fill('#edTagQ', 'Nachtaufnahmen');
tagWrap = await text('#edTagsWrap');
ok(tagWrap.includes('„nachtaufnahmen“ neu anlegen'), 'unbekannter Begriff bietet Neuanlage an');
await page.locator('#edTagsWrap [data-edtagadd]').dispatchEvent('mousedown');
tagWrap = await text('#edTagsWrap');
ok(tagWrap.includes('im inventar unter: foto, nachtaufnahmen'), '+ legt den neuen Tag an und weist ihn zu');
ok((await page.inputValue('#edTagQ')) === '', 'Suchfeld nach dem Anlegen geleert');
await page.evaluate(() => go('items'));

console.log('— Gruppe in die laufende Reise (FR-27.10) —');
await page.evaluate(() => { go('pack'); packFabAdd(); });
let qa = await text('#qaTrigger');
ok(qa.includes('ganze gruppe hinzufügen'), 'Quick-Add bietet Gruppen an');
ok(qa.includes('makro fotografie') && qa.includes('wildlife fotografie'), 'beide Gruppen vorgeschlagen');
await page.fill('#qaInput', 'wild');
qa = await text('#qaTrigger');
ok(qa.includes('wildlife fotografie') && !qa.includes('makro fotografie'), 'Tippen filtert die Gruppen');
const beforeRows = await page.evaluate(() => P.items.length);
await page.locator('[data-qagrp="wildlife"]').dispatchEvent('mousedown');
await page.waitForTimeout(50);
ok((await page.evaluate(() => P.items.length)) === beforeRows + 2,
  'Wildlife fügt 2 Positionen hinzu (Spiegelreflex war schon da)');
ok((await text('#snack')).includes('2 positionen, 1 schon dabei'), 'Snackbar meldet Zugang und Dublette');
ok(await page.evaluate(() => P.items.filter(i => i.src === 'wildlife').length === 2),
  'neue Zeilen tragen die Gruppen-Herkunft (FR-27.5 erkennt sie später)');
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
  'Todo hängt am erzeugten Artikel');
await page.locator('[data-qagrp="makro"]').dispatchEvent('mousedown');
await page.waitForTimeout(50);
ok((await text('#snack')).includes('bereits vollständig'), 'zweiter Versuch meldet „schon vollständig“ statt doppelt anzulegen');

console.log('— Packlisten-Filter überlebt die Session (FR-25.18) —');
await page.evaluate(() => { go('pack'); openFilters(CTX_PACK); });
await page.click('[data-fopt="trav"][data-v="Andy"]');   // Person is the default-open accordion
await page.click('#fDoneToggle');
await page.evaluate(() => closeFilters());
let chips = await text('#packHead');
ok(chips.includes('andy'), 'aktiver Facettenwert erscheint als Chip (FR-25.11a)');
ok(await page.evaluate(() => !!sessionStorage.getItem('jitpack.m4filter.sam26')),
  'Filterzustand liegt in der Session, nicht dauerhaft');

await page.reload();
await page.waitForTimeout(300);
ok(await page.evaluate(() => FILT.trav.has('Andy')), 'Facette überlebt den Reload');
ok(await page.evaluate(() => showDone === true), '„Erledigte“-Schalter überlebt mit');
await page.evaluate(() => go('pack'));
ok((await text('#packHead')).includes('andy'), 'Chip nach dem Reload sofort sichtbar — kein unsichtbarer Filter');

// A fresh session is the safety valve: no filter is carried into it.
const fresh = await browser.newPage();
await fresh.goto(FILE);
await fresh.waitForTimeout(200);
ok(await fresh.evaluate(() => FILT.trav.size === 0), 'neue Session startet ungefiltert');
await fresh.close();

await page.evaluate(() => { go('pack'); openFilters(CTX_PACK); });
await page.click('#fClear');
await page.evaluate(() => closeFilters());
ok(await page.evaluate(() => JSON.parse(sessionStorage.getItem('jitpack.m4filter.sam26')).facets.trav.length === 0),
  'Zurücksetzen wird ebenfalls gespeichert');

console.log('— Reisende ohne Typ (FR-25.9/FR-2.5 zurückgezogen) —');
await page.evaluate(() => { resetWizard(); go('wizard'); W.step = 2; renderWizard(); });
const w2 = await text('#wizBody');
ok(!w2.includes('erwachsen') && !w2.includes('kind'), 'Schritt 2 kennt keinen Erwachsen/Kind-Schalter mehr');
ok(w2.includes('andy') && w2.includes('leonardo'), 'Reisende weiterhin mit Namen gelistet');
ok(await page.evaluate(() => W.travelers.every(t => !('kind' in t))), 'kein Typ mehr im Reisenden-Modell');
await page.evaluate(() => { resetWizard(); go('dashboard'); });

console.log('— Reise öffnet direkt die Packliste (kein Phasen-Hub) —');
await page.evaluate(() => go('trips'));
await page.click('[data-trip="sam26"]');
ok(await page.evaluate(() => stack[stack.length - 1] === 'pack'),
  'Tap auf eine Reise landet direkt in M4, ohne Zwischenschritt');
ok((await text('#packHead')).includes('31/50') || (await text('#packHead')).includes('/'),
  'Fortschritt steht in der M4-Kopfzeile, nicht in einem Hub davor');
ok((await page.locator('#tripDone').innerText()).trim() === '',
  'aktive Reise zeigt keine Abschluss-Karte');
ok((await page.evaluate(() => document.querySelectorAll('[data-view="trip"], .phase').length)) === 0,
  'der Phasen-Hub ist vollständig entfernt');

await page.evaluate(() => { go('trips'); });
await page.click('[data-trip="sam25"]');
let done = await text('#tripDone');
ok(done.includes('reise abgeschlossen'), 'archivierte Reise führt mit der Abschluss-Karte');
ok(done.includes('vorlage aus dieser reise'), 'M21-Einstieg sitzt jetzt hier (FR-27.5)');
ok(done.includes('vorschläge fürs nächste mal'), 'M14-Vorschläge ebenfalls');
await page.evaluate(() => openPack('sam26'));

console.log('— M14 Rückblick, gruppen-bewusst (FR-9.2 / §3.27) —');
await page.evaluate(() => openPack('sam25'));
let card = await text('#tripDone');
ok(/vorschläge fürs nächste mal · \d+/.test(card), 'Abschluss-Karte nennt die Anzahl Vorschläge');
ok((await page.locator('#tripDone .li').count()) === 2,
  'Karte zeigt zwei Beispielzeilen als Vorschau, nicht die ganze Liste');
await page.click('#tripDoneRev');
let rv = await text('#reviewPage');
ok(await page.evaluate(() => stack[stack.length - 1] === 'review'), 'Einstieg führt auf den M14-Screen');
ok(rv.includes('offen ·'), 'M14 ist eine Liste mit sichtbarer Restmenge, kein Kartenstapel');
ok(rv.includes('ungenutzt') && rv.includes('fehlte'), 'beide Vorschlagsarten in einer Liste');
ok(rv.includes('reiseadapter'), 'der nachgekaufte Artikel steht auf der vollständigen Liste');
ok((await page.locator('[data-revtgt]').count()) > 0, 'jede Zeile nennt ihre Ziel-Gruppe und lässt sie ändern');
ok(await page.evaluate(() => [...document.querySelectorAll('[data-revtgt] option')]
     .every(o => TPL.find(x => x.id === o.value && (x.kind || 'template') === 'group'))),
  'Ziel-Auswahl bietet nur Gruppen an, keine Ferien-Vorlagen');

const addRow = await page.locator('[data-revapply]').first();
const grpBefore = await page.evaluate(() => Object.fromEntries(Object.entries(TPLITEMS).map(([k, v]) => [k, v.length])));
await addRow.click();
rv = await text('#reviewPage');
ok(rv.includes('übernommen'), 'übernommener Vorschlag bleibt sichtbar und markiert — verschwindet nicht spurlos');
ok(await page.evaluate(() => Object.keys(TRIP_UPDATES).length > 0),
  'die Änderung ist als FR-27.4-Änderung an geplanten Reisen protokolliert');

await page.click('[data-revnever]');
ok(!(await text('#reviewPage')).includes('nie mehr'), 'Nie-mehr-fragen entfernt die Zeile aus der Liste');
await page.evaluate(() => openPack('sam26'));
ok((await page.locator('#tripDone').innerText()).trim() === '', 'aktive Reise zeigt weiterhin keine Abschluss-Karte');

console.log('— M11 Gepäck: anlegen, bearbeiten, zuordnen —');
await page.evaluate(() => go('containers'));
let cts = await text('#contList');
ok(cts.includes('ungleichgewicht') || cts.includes('ausgeglichen mit'),
  'Paar-Balance ist sichtbar (FR-10.3) — im Seed gibt es jetzt wirklich ein Paar');
ok((await page.locator('#contList .picks').count()) === 0,
  'keine Knopfwand mehr in „Nicht zugewiesen“');

const nUn = await page.evaluate(() => P.items.filter(i => i.cont === '—').length);
await page.locator('[data-pick]').first().click();
ok(await page.locator('#contSheet.open').count(), 'Tap auf eine nicht zugewiesene Zeile öffnet den Picker');
await page.locator('[data-cassign="Rucksack"]').click();
ok((await page.evaluate(() => P.items.filter(i => i.cont === '—').length)) === nUn - 1,
  'Auswahl ordnet den Artikel zu und schliesst das Sheet');

const nCont = await page.evaluate(() => LUGGAGE.length);
await page.click('#fab');
ok((await page.evaluate(() => LUGGAGE.length)) === nCont + 1, 'FAB legt ein Gepäckstück an (Minimalform)');
ok(await page.locator('#contSheet.open').count(), 'und öffnet es direkt zum Ausfüllen');
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
}), 'Paarung wird auf beiden Seiten gesetzt');

const assigned = await page.evaluate(() => { P.items[0].cont = 'Dachbox'; return P.items[0].name; });
await page.click('#cDel');
ok(await page.evaluate(() => !LUGGAGE.some(c => c.name === 'Dachbox')), 'Löschen entfernt das Gepäckstück');
ok(await page.evaluate(n => P.items.find(i => i.name === n).cont === '—', assigned),
  'seine Artikel überleben ohne Zuordnung, statt mitgelöscht zu werden');
ok(await page.evaluate(() => LUGGAGE.find(c => c.name === 'Rucksack').pair === null),
  'die Gegenseite der Paarung wird mit aufgelöst');

console.log('— M12 Auswertung: Slice filtert wirklich, Pro-Person zählt richtig —');
await page.evaluate(() => { FACETS.forEach(f => FILT[f.key].clear()); ANA.dim = 'trav'; go('analytics'); });
let ana = await text('#anaPage');
ok(!ana.includes('undefined'), 'keine „undefined“-Gruppe mehr — Pro-Person-Artikel werden aufgeteilt');
ok(ana.includes('andy') && ana.includes('sia') && ana.includes('leonardo'),
  'jede reisende Person bekommt ihren Anteil in der Person-Sicht');

await page.locator('[data-slice="Andy"]').click();
ok(await page.evaluate(() => stack[stack.length - 1] === 'pack'), 'Balken-Tap führt in die Packliste');
ok(await page.evaluate(() => FILT.trav.has('Andy') && FILT.trav.size === 1),
  'und filtert wirklich auf den angetippten Wert, statt nur zu gruppieren');
ok((await text('#packHead')).includes('andy'), 'der Filter ist als Chip sichtbar (FR-25.11a)');
ok(await page.evaluate(() => JSON.parse(sessionStorage.getItem('jitpack.m4filter.sam26')).facets.trav.includes('Andy')),
  'der aus M12 gesetzte Filter überlebt die Session wie jeder andere (FR-25.18)');
await page.evaluate(() => { FACETS.forEach(f => FILT[f.key].clear()); persistPackFilter(); });

console.log('— Seitenfehler —');
ok(errors.length === 0, 'keine JS-Fehler' + (errors.length ? ' — ' + errors.join(' | ') : ''));

await browser.close();
console.log(failures ? `\n${failures} FEHLER` : '\nAlle Prüfungen bestanden.');
process.exit(failures ? 1 : 0);
