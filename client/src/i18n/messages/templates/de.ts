/** German messages for the templates (M7/M8) and a template made from a trip (M21); exactly the key set of ./en.ts. */
import type { templatesEn } from './en'

export const templatesDe: Record<keyof typeof templatesEn, string> = {
  'templates.searchPlaceholder': 'Vorlagen durchsuchen…',

  // M7 Vorlagen-Liste — die zwei Scopes aus §3.27 (FR-27.6).
  'templates.title': 'Vorlagen',
  'templates.sectionTemplates': 'Ferien-Vorlagen',
  'templates.scopeTemplatesShort': 'Ferien',
  'templates.sectionGroups': 'Gruppen',
  'templates.sectionTemplate': 'Ferien-Vorlage',
  'templates.sectionGroup': 'Gruppe',
  'templates.groupChip': 'Gruppe',
  'templates.itemCount': '{n} Artikel | {n} Artikel',
  'templates.groupCount': '{n} Gruppe | {n} Gruppen',
  'templates.contains': 'enthält:',
  'templates.listUnknown': 'Vorlagen werden geladen …',
  'templates.empty': 'Noch keine Vorlagen',
  'templates.emptyHint':
    'Fang mit einer Gruppe an — einem wiederverwendbaren Baustein — oder mit einer Ferien-Vorlage, die Gruppen einbindet.',
  'templates.noMatch': 'Keine Vorlage gefunden',
  'templates.new': 'Neu anlegen',
  'templates.newQuestion': 'Was soll es werden?',
  'templates.templateHint':
    'Startpunkt für eine Reise — bindet Gruppen ein und kann eigene Positionen haben.',
  'templates.groupHint':
    'Wiederverwendbarer Baustein aus Artikeln (z. B. „Makro Fotografie“) — wird in Ferien-Vorlagen eingebunden.',
  'templates.namePlaceholder': 'Name',
  'templates.create': 'Anlegen',
  'templates.export': 'Vorlage exportieren',
  'templates.share': 'Vorlage teilen…',
  'templates.shareFailed': 'Teilen ging nicht – die Vorlage ist stattdessen als Datei gespeichert.',
  'templates.rename': 'Umbenennen',
  'templates.deleteConfirm': '„{name}“ löschen? Bereits erzeugte Reisen behalten ihre Einträge.',
  'templates.deleteRetire':
    'Sie wird ausgeblendet, nicht entfernt: die daraus erzeugten Reisen zeigen weiter, woher ihre Sachen kommen.',
  'templates.deleteRemove': 'Keine Reise hat sie verwendet — sie wird endgültig entfernt.',
  'templates.deleteRemoveMaybe':
    'Auf diesem Gerät hat keine Reise sie verwendet, sie wird also endgültig entfernt. Wurde eine Reise daraus erzeugt, die dieses Gerät noch nicht geöffnet hat, wird sie stattdessen nur ausgeblendet.',
  'templates.includedBlocked': 'Wird in „{name}“ verwendet — dort zuerst entfernen.',

  // M8 Vorlagen-Editor (§3.27, FR-27.6/27.7).
  'templates.notFound': 'Vorlage nicht gefunden',
  'templates.scopeLabel': 'Art',
  'templates.includedIn': 'Eingebunden in: {names}',
  'templates.blastRadius':
    '⟳ Änderungen hier werden {n} Reise ({names}) vorgeschlagen, die beim nächsten Öffnen entscheidet — vergangene Reisen werden nie geändert. | ⟳ Änderungen hier werden {n} Reisen ({names}) vorgeschlagen, die beim nächsten Öffnen entscheiden — vergangene Reisen werden nie geändert.',
  'templates.demoteBlocked':
    'Erst die eingebundenen Gruppen entfernen — eine Gruppe enthält nur Positionen.',
  'templates.ownPositions': 'Eigene Positionen',
  'templates.positions': 'Positionen',
  'templates.noGroups': 'Noch keine Gruppen eingebunden.',
  'templates.noPositions': 'Noch keine Positionen.',
  'templates.includeGroup': 'Gruppe einbinden…',
  'templates.allGroupsIncluded': 'Alle Gruppen sind schon eingebunden.',
  'templates.pickerSearchPlaceholder': 'Gruppe oder Artikel suchen…',
  'templates.matchedVia': 'über {name}',
  'templates.alreadyIncluded': 'Bereits eingebunden',
  'templates.searchNoMatch': 'Keine Gruppe passt zu «{query}».',
  'templates.foldSuggestion':
    '{n} Position entspricht der Gruppe «{name}» | {n} Positionen entsprechen der Gruppe «{name}»',
  'templates.foldDeviation':
    'Bei {n} Position weichen die Angaben ab — nach dem Zusammenfassen gilt die Gruppe. | Bei {n} Positionen weichen die Angaben ab — nach dem Zusammenfassen gilt die Gruppe.',
  'templates.foldAccept': 'Zusammenfassen',
  'templates.foldDismiss': 'Ignorieren',
  'templates.foldDone':
    '«{name}» eingebunden, {n} Position ersetzt | «{name}» eingebunden, {n} Positionen ersetzt',
  'templates.foldUndo': 'Rückgängig',
  'templates.foldUndone': '{n} Position wiederhergestellt | {n} Positionen wiederhergestellt',
  'templates.newGroupInline': 'Neue Gruppe anlegen…',
  'templates.groupCreated': '„{name}“ angelegt und eingebunden',
  'templates.removeGroup': 'Gruppe entfernen',
  'templates.removePosition': 'Position entfernen',
  'templates.standardChip': 'Standard',
  'templates.prepChip': '📋 {n} Vorbereitung | 📋 {n} Vorbereitungen',
  'templates.addPosition': 'Position hinzufügen',
  'templates.addToGroup': 'Zur Gruppe hinzufügen',
  'templates.addToTemplate': 'Zur Vorlage hinzufügen',
  'templates.duplicate': '„{name}“ ist schon drin — nicht doppelt',
  'templates.added': '„{name}“ hinzugefügt',
  // FR-1.6/FR-13.1: templates and series are keyed by their name across the
  // whole instance, so the sentence names what holds it and in which scope.
  'templates.nameTakenTemplate': 'Die Vorlage „{name}“ gibt es schon.',
  'templates.nameTakenGroup': 'Die Gruppe „{name}“ gibt es schon.',
  'templates.nameTakenOpen': 'Öffnen',
  'templates.renameTaken': 'Der Name „{name}“ ist schon vergeben.',
  'templates.groupExists': '„{name}“ gibt es schon — eingebunden',
  'templates.groupNameIsTemplate':
    'Diesen Namen trägt schon eine Vorlage — Vorlagen und Gruppen teilen sich die Namen.',
  'templates.resolvedCount': '{n} Artikel aufgelöst | {n} Artikel aufgelöst',
  'templates.ownPositionCount': '{n} eigene Position | {n} eigene Positionen',
  'templates.mergeMax': '{name} nur {n}× — in {groups}',
  'templates.mergeSum': '{name} {n}× — Summe aus {groups}',
  'templates.positionOf': '{scope} „{name}“ · Position',
  'templates.qtySection': 'Menge',
  'templates.qtyPerPersonSuffix': ' — pro Person',
  'templates.qtyZeroHint': '0 = bewusst nicht dabei',
  'templates.prepSection': 'Vorbereitung',
  'templates.prepBlockingRule': 'Offene Aufgaben blockieren „erledigt“ auf der Packliste',
  'templates.addTask': 'Aufgabe hinzufügen — z. B. „Akkus laden“…',
  'templates.removeTask': 'Aufgabe entfernen',
  'templates.tripTasks': 'Aufgaben für die Reise',
  'templates.tripTasksHint':
    'Jede neue Reise aus dieser Vorlage bekommt sie als Aufgabe — sie halten keine Packliste auf.',
  'templates.addTripTask': 'z. B. „Pflanzen giessen“',
  'templates.detailsHint': 'Pro Person · Kaufen · Dedup · Bedingungen · Später-Packer',
  'templates.whoNeeds': 'Wer braucht das?',
  'templates.tripGlobal': 'Reise-global',
  'templates.perPerson': 'Pro Person',
  'templates.procurement': 'Beschaffung',
  'templates.dedupSection': 'Bei Überschneidung',
  'templates.dedupMax': 'Maximum',
  'templates.dedupSum': 'Summe',
  'templates.conditions': 'Nur wenn …',

  // FR-27.12 — in eine Gruppe hineinschauen.
  'templates.peekOpen': 'Zeigen, was in „{name}“ ist',
  'templates.peekSubtitle':
    '{n} Artikel · so, wie er auf die Packliste käme | {n} Artikel · so, wie sie auf die Packliste kämen',
  'templates.previewMore': '+{n}',
  'templates.resolvedOpen': 'Alle {n} Artikel ansehen ›',
  'templates.peekFrom': 'aus {names}',
  'templates.peekOwnPosition': 'eigene Position',
  'templates.peekMerged': 'nur 1×',
  'templates.peekPerPerson': 'pro Person',
  'templates.peekConditional': 'mit Bedingung',

  // M21 — Vorlage aus Reise (FR-27.5). Der Vertrag steht in der ersten Zeile:
  // erkannte Gruppen werden referenziert, nicht kopiert.
  'templateFromTrip.title': 'Vorlage aus Reise',
  'templateFromTrip.intro':
    'Aus „{trip}“ wird eine wiederverwendbare Vorlage. Erkannte Gruppen werden referenziert, nicht kopiert — sie bleiben eigenständig pflegbar.',
  'templateFromTrip.name': 'Name der Vorlage',
  'templateFromTrip.groups': 'Erkannte Gruppen',
  'templateFromTrip.fromGroup':
    '{n} Artikel dieser Reise stammt daraus | {n} Artikel dieser Reise stammen daraus',
  'templateFromTrip.reused': 'wird wiederverwendet ✓',
  'templateFromTrip.added': 'Während der Reise ergänzt:',
  'templateFromTrip.choiceUpdate': 'Gruppe aktualisieren',
  'templateFromTrip.choiceOwn': 'Nur in diese Vorlage',
  'templateFromTrip.blast':
    'Wirkt überall, wo die Gruppe eingebunden ist — {n} Reise wird gefragt. | Wirkt überall, wo die Gruppe eingebunden ist — {n} Reisen werden gefragt.',
  'templateFromTrip.blastNone':
    'Wirkt überall, wo die Gruppe eingebunden ist — zurzeit folgt ihr keine Reise.',
  'templateFromTrip.absent':
    '{items} war auf dieser Reise nicht dabei — die Gruppe bleibt unverändert. | {items} waren auf dieser Reise nicht dabei — die Gruppe bleibt unverändert.',
  'templateFromTrip.loose': 'Eigene Artikel',
  'templateFromTrip.looseCount': '{n} von {total}',
  'templateFromTrip.looseCaption': 'Ohne Gruppe hinzugefügt — wähle, was in die Vorlage kommt.',
  'templateFromTrip.perPerson': 'pro Person · {names}',
  'templateFromTrip.forTraveler': 'für {name}',
  'templateFromTrip.looseFromTemplate': 'aus „{template}“ — als eigene Position übernommen',
  'templateFromTrip.looseEmpty': 'Keine losen Artikel.',
  'templateFromTrip.bundle': 'Als neue Gruppe speichern',
  'templateFromTrip.bundleHint': 'statt als lose Positionen der Vorlage',
  'templateFromTrip.bundleName': 'Name der neuen Gruppe',
  'templateFromTrip.bundleDefault': '{trip} Extras',
  'templateFromTrip.create': 'Vorlage erstellen ✓',
  'templateFromTrip.created': 'Vorlage „{name}“ erstellt — Gruppen wiederverwendet ✓',
  'templateFromTrip.notLoaded': 'Die Artikel dieser Reise sind noch nicht geladen.',
  'templateFromTrip.nameTaken': 'Der Name „{name}“ ist schon vergeben.',
  'templateFromTrip.bundleSameName': 'Gruppe und Vorlage brauchen verschiedene Namen.',
}
