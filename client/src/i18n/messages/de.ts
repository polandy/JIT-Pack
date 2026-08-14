/**
 * German catalogue (NFR-4.12) — fully supported alongside English, not a stub.
 *
 * Must define exactly the key set of en.ts; the catalogue-integrity test
 * enforces that, so a new English string cannot ship untranslated.
 *
 * Wording follows the concept prototype (dev-docs/UI_Concept_Prototype.html),
 * which was written and tested in German — the informal "du" address it uses
 * is deliberate for a household app.
 */
import type { en } from './en'

export const de: Record<keyof typeof en, string> = {
  'common.cancel': 'Abbrechen',
  'common.save': 'Speichern',
  'common.delete': 'Löschen',
  'common.add': 'Hinzufügen',
  'common.done': 'Fertig',
  'common.close': 'Schliessen',
  'common.back': 'Zurück',
  'common.edit': 'Bearbeiten',
  'common.remove': 'Entfernen',
  'common.confirm': 'Bestätigen',
  'common.search': 'Suchen',
  'common.retry': 'Erneut versuchen',
  'common.nobody': 'Niemand',
  'common.all': 'Alle',
  'common.none': 'Keine',

  'sync.synced': 'Synchronisiert',
  'sync.syncing': 'Synchronisiert…',
  'sync.offline': 'Offline',
  'sync.local': 'Auf diesem Gerät',

  'trip.daysUntil': 'noch {n} Tage',
  'trip.departsToday': 'Heute geht es los',
  'trip.until': 'bis {date}',
  'trip.from': 'ab {date}',
  'trip.status.planning': 'In Planung',
  'trip.status.active': 'Aktiv',
  'trip.status.archived': 'Archiviert',

  'packing.title': 'Packliste',
  'packing.itemsLeft': '{n} Sache offen | {n} Sachen offen',
  'packing.showPacked': '{n} gepackte anzeigen',
  'packing.hidePacked': '{n} gepackte ausblenden',
  'packing.allDone': 'Alles gepackt 🎉',
  'packing.allDoneHint': 'Nichts mehr offen für diese Reise.',
  'packing.skipped': 'Bewusst weggelassen',
  'packing.undo': 'Rückgängig',
  'packing.packedToast': '„{name}“ gepackt ✓',
  'packing.openPrep': '{n} Vorbereitung offen | {n} Vorbereitungen offen',
  'packing.prepSection': 'Vorbereitung',
  'packing.empty': 'Noch nichts auf dieser Liste',
  'packing.emptyHint': 'Mit ＋ die erste Sache hinzufügen.',

  // M4-Kopfzeile und Icon-Cluster in der App-Bar (G-12).
  'packing.progress': '{packed}/{total}',
  'packing.searchPlaceholder': 'Packliste durchsuchen…',
  'packing.closeSearch': 'Suche schliessen',
  'packing.foldAll': 'Alle zuklappen',
  'packing.unfoldAll': 'Alle aufklappen',
  'packing.groupOpen': '{n} offen',
  'packing.shopping': 'Einkauf',
  'packing.luggage': 'Gepäck',
  'packing.analytics': 'Auswertung',
  'packing.archive': 'Reise abschliessen',

  // FR-25.20 — Sachen, für die jemand anderes zuständig ist.
  'packing.othersHidden':
    '{n} Sache liegt bei {who} · anzeigen | {n} Sachen liegen bei {who} · anzeigen',
  'packing.othersShown': '{n} von {who} ausblenden',

  // FR-25.17 — wer eine Zeile gepackt hat, und wann.
  'packing.packedBy': 'gepackt von {who} · {when}',
  'packing.packedByUnknown': 'gepackt · {when}',
  'packing.responsibleWas': 'zuständig war {who}',
  'stamp.today': 'heute',
  'stamp.yesterday': 'gestern',

  // FR-25.11e — eine leere Liste bedeutet zweierlei sehr Verschiedenes.
  'packing.noMatches': 'Keine Treffer',
  'packing.noMatchesSearch': 'Nichts passt zu „{term}“.',
  'packing.noMatchesFilter':
    '{n} offene Sache liegt hinter dem Filter. | {n} offene Sachen liegen hinter dem Filter.',
  'packing.noMatchesBoth': 'Nichts passt zu „{term}“ und dem Filter.',
  'packing.resetSearch': 'Suche löschen',
  'packing.resetAll': 'Suche und Filter zurücksetzen',

  // FR-27.5 — die Abschlusskarte auf einer archivierten Reise.
  'packing.tripFinished': '🧩 Reise abgeschlossen',
  'packing.reviewSuggestions': 'Vorschläge ansehen →',

  // Die Lupe in der App-Bar, pro Screen (G-12, FR-25.11k).
  'trips.searchPlaceholder': 'Reisen durchsuchen…',
  'templates.searchPlaceholder': 'Vorlagen durchsuchen…',
  'items.searchPlaceholder': 'Sachen durchsuchen…',

  // M5 Artikel-Detail.
  'item.details': 'Details',
  'item.detailsHint': 'Wer · Beschaffung · Gepäck · Flags',
  'item.notes': 'Notizen',
  'item.addNote': 'Notiz schreiben…',
  'item.addPrep': 'Vorbereitung hinzufügen…',
  'item.flagAsTask': 'Als Vorbereitung markieren',
  'item.companions': 'Gehört dazu',
  'item.usedBy': 'Wer braucht das?',
  'item.luggageOptional': 'Gepäck · optional',
  'item.latePackerHint': 'Erst am Abreisetag packen',
  'item.flags': 'Markierungen',
  'item.noFlags': 'keine',
  'item.notFound': 'Diese Sache ist nicht auf der Liste.',
  'item.stateOpen': 'offen',
  'item.statePartial': 'teilweise',
  'item.statePacked': 'gepackt',
  'item.stateSkipped': 'weggelassen',
  'item.statePackingNow': 'wird gepackt',
  'item.statePackedOpenPrep': 'gepackt · Prep offen',

  // Schnell-Hinzufügen (FR-5.6, FR-25.13a).
  'quickAdd.trigger': 'Sache hinzufügen…',
  'quickAdd.placeholder': 'Name der Sache…',
  'quickAdd.missingHint': 'Neue Sachen werden als „fehlt“ markiert',
  'quickAdd.newItem': '„{name}“ als neue Sache hinzufügen',

  // Facetten-Filter (FR-25.11), geteilt von M4 und M6.
  'filter.title': 'Filter',
  'filter.open': 'Filter',
  'filter.groupBy': 'Gruppieren nach',
  'filter.reset': 'Zurücksetzen',
  'filter.showing': 'zeigt {n} Sache | zeigt {n} Sachen',
  'filter.allValues': 'alle',
  'filter.groupedBy': 'Gruppiert nach {axis}',
  'filter.doneLabel': 'Erledigte',
  'filter.doneHint': 'Gepackte anzeigen',
  'filter.othersLabel': 'Anderen zugewiesen',
  'filter.othersHint': 'Sachen anderer anzeigen',

  'facet.person': 'Person',
  'facet.category': 'Kategorie',
  'facet.mode': 'Beschaffung',
  'facet.container': 'Gepäck',
  'facet.flag': 'Merkmale',
  'facet.shared': 'Gemeinsam',
  'facet.noCategory': 'Ohne Kategorie',
  'facet.noLuggage': 'Ohne Gepäck',
  'facet.flagLate': '⏰ Spätpacker',
  'facet.flagMissing': 'fehlt',
  'facet.flagPrep': 'Hat Vorbereitung',

  'group.category': 'Kategorie',
  'group.person': 'Person',
  'group.container': 'Gepäck',
  'group.status': 'Status',

  'mode.pack': 'Packen',
  'mode.buyBefore': 'Vorher kaufen',
  'mode.buyLocal': 'Vor Ort kaufen',
  'mode.latePacker': 'Spätpacker',

  'settings.title': 'Einstellungen',
  'settings.appearance': 'Darstellung',
  'settings.lightTheme': 'Helles Design',
  'settings.defaultTravelers': 'Standard-Reisende',
  'settings.defaultTravelersHint':
    'Eine neue Reise startet mit diesen Personen. Nur auf diesem Gerät; pro Reise änderbar.',
  'settings.addTraveler': 'Reisende:n hinzufügen',
  'settings.language': 'Sprache',
  'settings.languageHint': 'Nur auf diesem Gerät.',
  'settings.languageEnglish': 'Englisch',
  'settings.languageGerman': 'Deutsch',
}
