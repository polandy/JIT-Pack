/** German messages for the packing list (M4), its containers, review and the kernel side of shopping; exactly the key set of ./en.ts. */
import type { packingEn } from './en'

export const packingDe: Record<keyof typeof packingEn, string> = {
  'packing.title': 'Packliste',
  'packing.itemsLeft': '{n} Packelement offen | {n} Packelemente offen',
  'packing.showDone': '{n} Erledigtes anzeigen | {n} Erledigte anzeigen',
  'packing.hideDone': '{n} Erledigtes ausblenden | {n} Erledigte ausblenden',
  'packing.allDone': 'Alles erledigt 🎉',
  'packing.allDoneHint': 'Nichts mehr offen für diese Reise.',
  'packing.skipped': 'Bewusst weggelassen',
  'packing.forgotten': 'Vergessen einzupacken',
  'packing.undo': 'Rückgängig',
  'packing.skippedVia': 'weggelassen: „{name}“ ist nicht dabei',
  'packing.passTitle': 'Reise abschliessen',
  'packing.passHint':
    'Tippe an, was du mitgenommen und nicht gebraucht hast. Du kannst auch direkt abschliessen.',
  'packing.passFinish': 'Fertig',
  'packing.flagUnusedAction': 'Als ungenutzt markieren',
  'packing.unflagUnusedAction': 'Ungenutzt aufheben',
  'packing.flagUnusedToast': '„{item}“ als ungenutzt markiert',
  'packing.unflagUnusedToast': '„{item}“ ist nicht mehr als ungenutzt markiert',
  'packing.skipAction': 'Nicht einpacken',
  // FR-25.25/25.26 — siehe en.ts.
  'packing.latePackerOn': 'Spätpacker ein',
  'packing.latePackerOff': 'Spätpacker aus',
  'packing.clusterLatePackerOn': 'Spätpacker für alle ein',
  'packing.clusterLatePackerOff': 'Spätpacker für alle aus',
  'packing.clusterAssignAll': 'Alle zuweisen an …',
  'packing.clusterScope': '{n} Zeile | {n} Zeilen',
  'packing.forWhomAction': 'Für wen …',
  'packing.clusterPeople': '{n} Person | {n} Personen',
  'packing.clusterPartialName': '{name} ({n} von {total})',
  'packing.fanOutApplied': '{n} Zeile geändert | {n} Zeilen geändert',
  'packing.fanOutPartial': '{n} von {total} geändert · {who} packt gerade',
  'packing.unskipAction': 'Doch einpacken',
  'packing.packInsteadAction': 'Doch mitnehmen',
  'packing.skippedToast': '„{name}“ bleibt zu Hause',
  'packing.companionsAdded':
    '„{names}“ kam mit — es gehört zwingend dazu | „{names}“ kamen mit — sie gehören zwingend dazu',
  'packing.forAllRefused':
    'Nicht verteilt: Dafür müsste eine Zeile gelöscht werden. Das entscheidest du im Blatt „Wer braucht das?“.',
  'packing.skippedToastWith': '„{name}“ bleibt zu Hause — mit {companions}',
  'packing.packedToast': '„{name}“ gepackt ✓',
  // FR-5.8 — siehe en.ts.
  'packing.removeAction': 'Von der Liste entfernen',
  'packing.taskDoneToast': '„{body}“ erledigt ✓',
  'packing.removedToast': '„{name}“ von der Liste entfernt',
  'packing.removedToastInventory': '„{name}“ entfernt – auch aus dem Inventar',
  // FR-25.31: every other act on the list, each behind the pack snackbar's undo.
  'packing.unpackedToast': '„{name}“ wieder ausgepackt',
  'packing.countToast': '„{name}“: {packed} von {quantity} gepackt',
  'packing.quantityToast': '„{name}“: Menge {n}',
  'packing.unskippedToast': '„{name}“ kommt doch mit',
  'packing.latePackerOnToast': '„{name}“ wird spät gepackt',
  'packing.latePackerOffToast': '„{name}“ wird nicht mehr spät gepackt',
  'packing.buyLocalToast': '„{name}“ wird vor Ort gekauft',
  'packing.packInsteadToast': '„{name}“ wird doch mitgenommen',
  'packing.assignedToast': '„{name}“ → {who}',
  'packing.unassignedToast': '„{name}“: niemand zuständig',
  'packing.claimedToast': 'Du packst „{name}“',
  'packing.releasedToast': '„{name}“ freigegeben',
  'packing.taskReopenedToast': '„{body}“ wieder offen',
  'packing.taskDeletedToast': '„{body}“ gelöscht',
  'packing.taskAddedToast': '„{body}“ hinzugefügt',
  'packing.removeConfirmTitle': '„{name}“ entfernen?',
  'packing.removeConfirmLead':
    'Die Zeile verschwindet von der Packliste. Wenn du es bewusst zu Hause lässt, wähle „Nicht einpacken“.',
  'packing.removeConfirmPacked': 'Bereits {n} gepackt.',
  'packing.removeConfirmNotes': '{n} Notiz wird mitgelöscht. | {n} Notizen werden mitgelöscht.',
  'packing.removeConfirmCompanions': 'Ebenfalls nicht eingepackt: {names}.',
  'packing.removeConfirmInventory':
    'Der Artikel kommt sonst nirgends vor und wird auch aus dem Inventar gelöscht.',
  'packing.openPrep': '{n} Vorbereitung offen | {n} Vorbereitungen offen',

  'packing.packSection': 'Einpacken',
  'packing.prepSection': 'Vorbereitung',
  'packing.listUnknown': 'Packliste wird geladen …',
  'packing.empty': 'Noch nichts auf dieser Liste',
  'packing.emptyHint': 'Mit ＋ das erste Packelement hinzufügen.',

  // M4-Kopfzeile und Icon-Cluster in der App-Bar (G-12).
  'packing.progress': '{packed}/{total}',
  'packing.searchPlaceholder': 'Packliste durchsuchen…',
  'packing.closeSearch': 'Suche schliessen',
  'packing.foldAll': 'Alle zuklappen',
  'packing.unfoldAll': 'Alle aufklappen',
  'packing.openCount': '{n} offen',
  'packing.shopping': 'Einkauf',
  'packing.shoppingCount': 'Einkaufen ({n})',
  // FR-7.7 — die dritte Ansicht, in der an einer Reise gearbeitet wird.
  'packing.tasks': 'Aufgaben',
  'packing.tasksCount': 'Aufgaben ({n})',
  'packing.luggage': 'Gepäck',
  'packing.analytics': 'Auswertung',
  'packing.tripViews': 'Ansichten dieser Reise',

  // FR-5.10 — Packen abschliessen: was offen bleibt, ist entschieden.
  'packing.closeAction': 'Packen abschliessen',
  'packing.closeConfirmTitle': 'Packen abschliessen?',
  'packing.closeConfirmMeta': 'Was offen bleibt, ist danach eine Entscheidung.',
  'packing.closePromptMeta': 'Das war das letzte offene Packelement.',
  'packing.startConfirmTitle': 'Reise starten',
  'packing.startConfirmMeta': 'Das Packen ist noch offen. Zuerst abschliessen?',
  'packing.startConfirmVerb': 'Abschliessen und starten',
  'packing.startOnly': 'Nur starten',
  'packing.startedToastShort': 'Reise gestartet',
  'packing.closeLater': 'Später',
  'packing.closeConfirmBody':
    '{n} offenes Packelement wird als bewusst nicht mitgenommen vermerkt. | {n} offene Packelemente werden als bewusst nicht mitgenommen vermerkt.',
  'packing.closeConfirmStarted':
    'Bei {n} angefangenen bleibt, was schon eingepackt ist. | Bei {n} angefangenen bleibt, was schon eingepackt ist.',
  'packing.closeConfirmLate':
    '{n} davon ist erst am Abreisetag fällig. | {n} davon sind erst am Abreisetag fällig.',
  'packing.closeConfirmHeld':
    '{n} hat gerade jemand anderes in der Hand. | {n} haben gerade andere in der Hand.',
  'packing.closeConfirmNothing':
    'Nichts ist mehr offen — die Packliste wird als abgeschlossen vermerkt.',
  'packing.closeConfirmVerb': 'Abschliessen · {n}',
  'packing.closeConfirmVerbNothing': 'Abschliessen',
  'packing.closedToast':
    'Packen abgeschlossen · {n} nicht mitgenommen | Packen abgeschlossen · {n} nicht mitgenommen',
  'packing.closedToastNone': 'Packen abgeschlossen',
  // FR-7.7 — was mit den offenen Aufgaben passiert, wenn das Packen endet.
  'packing.closeConfirmTasks':
    '{n} offene Aufgabe wandert zu den Aufgaben für unterwegs. | {n} offene Aufgaben wandern zu den Aufgaben für unterwegs.',
  'packing.closedToastTasks':
    '{n} Aufgabe ist jetzt für unterwegs | {n} Aufgaben sind jetzt für unterwegs',
  // FR-7.12 — was auf der Einkaufsliste „Vor der Reise" offen ist, wandert
  // mit dem Abschluss zu „Vor Ort".
  'packing.closeConfirmShopping':
    '{n} offener Einkauf wandert von „Vor der Reise" zu „Vor Ort". | {n} offene Einkäufe wandern von „Vor der Reise" zu „Vor Ort".',
  'packing.closedToastShopping': '{n} Einkauf jetzt vor Ort | {n} Einkäufe jetzt vor Ort',
  'packing.closedTitle': 'Packen abgeschlossen',
  'packing.closedStamp': '{when} · {n} nicht mitgenommen | {when} · {n} nicht mitgenommen',
  'packing.closedStampNone': '{when}',
  'packing.reopen': 'Wieder öffnen',

  // FR-25.20 — Packelemente, für die jemand anderes zuständig ist.
  'packing.othersHidden':
    '{n} Packelement liegt bei {who} · anzeigen | {n} Packelemente liegen bei {who} · anzeigen',
  'packing.othersShown': '{n} von {who} ausblenden',

  // FR-25.27 — was erst am Abreisetag gepackt wird.
  'packing.lateHidden': '{n} Spätpacker anzeigen | {n} Spätpacker anzeigen',
  'packing.lateShown': '{n} Spätpacker ausblenden | {n} Spätpacker ausblenden',

  // FR-25.17 — wer eine Zeile gepackt hat, und wann.
  'packing.packedBy': 'gepackt von {who} · {when}',
  'packing.packedByUnknown': 'gepackt · {when}',
  'packing.responsibleWas': 'zuständig war {who}',
  'packing.claimedByMe': 'Du packst das — die anderen können es gerade nicht ändern',
  'packing.releaseAction': 'Artikel wieder freigeben',
  'packing.takeoverAction': 'Übernehmen',
  'packing.takeoverConfirmTitle': 'Artikel übernehmen?',
  'packing.takeoverConfirmBody':
    '{who} packt „{item}" gerade. Wenn du übernimmst, gehört der Artikel dir — und {who} wird benachrichtigt.',
  'packing.takeoverConfirmBodyUnknown':
    'Jemand packt „{item}" gerade. Wenn du übernimmst, gehört der Artikel dir — und die Person wird benachrichtigt.',
  'packing.takeoverDone': 'Von {who} übernommen',
  'packing.takeoverDoneUnknown': 'Übernommen',
  'packing.takeoverFailed':
    'Nicht übernommen — der Artikel wird gerade nicht mehr von jemandem gepackt.',
  'packing.lockedBy': '{who} packt das gerade',
  'packing.lockedByUnknown': 'Jemand packt das gerade',
  'packing.lockedHint': 'Bis dahin nur zum Anschauen.',

  // FR-25.11e — eine leere Liste bedeutet zweierlei sehr Verschiedenes.
  'packing.emptyOthersHead': 'Alles ist bei jemand anderem',
  'packing.emptyOthers': '{n} Position liegt bei {who}. | {n} Positionen liegen bei {who}.',
  'packing.emptyOthersAction': 'Alle anzeigen',
  'packing.noMatches': 'Keine Treffer',
  'packing.noMatchesSearch': 'Nichts passt zu „{term}“.',
  'packing.noMatchesFilter':
    '{n} offenes Packelement liegt hinter dem Filter. | {n} offene Packelemente liegen hinter dem Filter.',
  'packing.noMatchesBoth': 'Nichts passt zu „{term}“ und dem Filter.',
  'packing.resetSearch': 'Suche löschen',
  'packing.resetAll': 'Suche und Filter zurücksetzen',

  'packing.startedToast':
    'Reise läuft — Artikel, die jetzt dazukommen, gelten als vorher vergessen (FR-9.1).',
  // FR-27.5 — die Abschlusskarte auf einer archivierten Reise.
  'packing.tripFinished': 'Reise abgeschlossen',
  'packing.reviewTeaser': 'Zum Beispiel: {names}',
  'packing.reviewTeaserNone': 'Nichts zu prüfen — alle Markierungen sind erledigt.',
  'packing.reviewSuggestions': 'Vorschläge ansehen →',
  'packing.tripFinishedHint':
    'Das Gelernte dieser Reise gehört in die Vorlagen — nicht ins Archiv.',
  'packing.templateFromTrip': 'Vorlage aus dieser Reise erstellen →',
  // M11 — Gepäckverwaltung (FR-10.1–10.3, FR-25.5).
  'container.title': 'Gepäck',
  'container.loadOf': '{weight} von {max}',
  'container.overLimit': 'Über dem Gewichtslimit',
  'container.imbalance': '{n} % Ungleichgewicht',
  'container.carriedBy': 'Getragen von {name}',
  'container.new': 'Neues Gepäckstück',
  'container.namePlaceholder': 'z. B. Linke Packtasche',
  'container.carrier': 'Getragen von',
  'container.maxWeight': 'Gewichtslimit',
  'container.maxWeightUnit': 'kg',
  'container.noLimit': 'Kein Limit',
  'container.pairing': 'Gepaart mit',
  'container.pairingHint': 'Links/rechts-Paare werden ab {n} % Ungleichgewicht markiert.',
  'container.delete': 'Gepäckstück löschen',
  'container.deleteNote': 'Seine Positionen bleiben auf der Liste, ohne Zuordnung.',
  'container.listUnknown': 'Gepäck wird geladen …',
  'container.empty': 'Noch kein Gepäck. Mit ＋ ein Gepäckstück anlegen und Gewicht verteilen.',
  'container.unassigned': 'Nicht zugeordnet',
  'container.unassignedNone': 'Alles ist einem Gepäckstück zugeordnet.',
  'container.assignTitle': 'In welche Tasche?',
  'container.assignNone': 'Zuerst ein Gepäckstück anlegen, dann Positionen zuordnen.',
  'container.notFound': 'Dieses Gepäckstück gibt es nicht.',
  'container.bulkAssign': 'In Gepäckstück …',
  'container.assignCount': 'Eine Position | {n} Positionen',

  // M14 — Rückblick (FR-9.2, gruppen-orientiert per FR-27.11).
  'review.title': 'Rückblick',
  'review.intro':
    'Was diese Reise über deine Gruppen gelernt hat. Änderungen gehen in die Gruppe, aus der der Artikel stammt — nicht in die Ferien-Vorlage, sonst lernt nur diese eine Reise dazu.',
  'review.open': 'Offen',
  'review.kindUnused': 'ungenutzt',
  'review.kindMissing': 'fehlte',
  'review.whyUnused': 'auf dieser Reise nicht gebraucht | auf {n} Reisen nicht gebraucht',
  'review.whyMissing': 'unterwegs nachgekauft — fehlte auf der Liste | fehlte auf {n} Reisen',
  'review.targetFrom': 'Aus Gruppe',
  'review.targetTo': 'In Gruppe',
  'review.blast':
    'Wird {n} Reise vorgeschlagen, die „{group}“ einbindet. | Wird {n} Reisen vorgeschlagen, die „{group}“ einbinden.',
  'review.apply': 'Übernehmen',
  'review.skip': 'Überspringen',
  'review.never': 'Nie mehr fragen',
  'review.stateApplied': 'übernommen ✓',
  'review.stateSkipped': 'übersprungen',
  'review.handledHead': 'Erledigt',
  'review.appliedSummary':
    '{n} Änderung in die Gruppen geschrieben. Reisen, die den Gruppen folgen, werden beim nächsten Öffnen gefragt. | {n} Änderungen in die Gruppen geschrieben. Reisen, die den Gruppen folgen, werden beim nächsten Öffnen gefragt.',
  'review.empty': 'Nichts zu prüfen — keine Merkmale gesetzt.',
  'review.done': 'Durchgesehen — alle Vorschläge erledigt.',
  'review.snackUnused': 'Menge von „{item}“ in Gruppe „{group}“ auf 0 gesetzt',
  'review.snackMissing': '„{item}“ in Gruppe „{group}“ aufgenommen',
  'review.snackNever': 'Wird für diesen Artikel und diese Gruppe nicht mehr vorgeschlagen',
  'review.nothingToast': 'Nichts zu prüfen — keine Merkmale gesetzt.',

  // FR-27.16 — Namen aus dem Inventar übernehmen.
  'inventoryNames.menu': 'Namen aus dem Inventar ({n})',
  'inventoryNames.title': 'Namen aus dem Inventar',
  'inventoryNames.lead':
    'Diese Sachen heissen im Inventar inzwischen anders. Menge, Packstand und Zuweisung bleiben, wie sie sind.',
  'inventoryNames.all': 'Alle',
  'inventoryNames.selected': '{n} von {total} ausgewählt',
  'inventoryNames.for': 'für {names}',
  'inventoryNames.packed': 'gepackt {packed}/{quantity}',
  'inventoryNames.skipped': 'nicht dabei',
  'inventoryNames.deliberate': 'bewusst so benannt',
  'inventoryNames.deliberateNote':
    'Diese Reise hat den Namen bewusst behalten, deshalb ist er nicht vorausgewählt.',
  'inventoryNames.apply': 'Namen übernehmen | {n} Namen übernehmen',
  'inventoryNames.applyAll': 'Namen übernehmen | Alle {n} übernehmen',
  'inventoryNames.none': 'Nichts ausgewählt',
  'inventoryNames.adopted': 'Name übernommen | {n} Namen übernommen',
  'inventoryNames.detail': 'Im Inventar heisst es jetzt „{name}“.',
  'inventoryNames.adoptOne': 'Übernehmen',
  'packing.decrease': 'Weniger gepackt',
  'packing.increase': 'Mehr gepackt',
  'travelerProgress.title': 'Pro Person',
  'travelerProgress.count': '{done} von {total}',
  'travelerProgress.done': 'fertig ✓',
  'travelerProgress.nothing': 'nichts zu packen',
  'travelerProgress.face': '{name}: {count}',
  'travelerProgress.shared': 'Gemeinsam',
  'travelerProgress.sharedLabel': 'Gemeinsam: {count}',
  'travelerProgress.more': 'weitere',
  'travelerProgress.moreLabel': '1 weitere Person zeigen | {n} weitere Personen zeigen',
  'travelerProgress.moreOpen': '{n} noch offen',
  'travelerProgress.moreAllDone': 'alle fertig',
  'travelerProgress.less': 'Weniger zeigen',

  // Die Einkaufsliste, wie die Packseite und M1 von ihr sprechen; die Texte der
  // Liste selbst stehen in shopping/i18n/.
  'shopping.wentToPacking': 'auf der Packliste',
  'shopping.wentPacked': 'eingepackt',
  'shopping.dueCount': '{n} Einkauf | {n} Einkäufe',
  'shopping.dueHint': '{n} Einkauf fällig | {n} Einkäufe fällig',
  'shopping.boughtBy': 'gekauft von {who} · {when}',
  'shopping.boughtByUnknown': 'gekauft · {when}',
}
