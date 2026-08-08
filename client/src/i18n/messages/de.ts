/**
 * German catalogue (NFR-4.12) — fully supported alongside English, not a stub.
 *
 * Must define exactly the key set of en.ts; the catalogue-integrity test
 * enforces that, so a new English string cannot ship untranslated.
 *
 * Wording follows the concept prototype (docs/UI_Concept_Prototype.html),
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
  'trip.status.planning': 'In Planung',
  'trip.status.active': 'Aktiv',
  'trip.status.archived': 'Archiviert',

  'packing.title': 'Packliste',
  'packing.itemsLeft': '{n} Sache offen | {n} Sachen offen',
  'packing.showPacked': '{n} gepackte anzeigen',
  'packing.hidePacked': 'Gepackte ausblenden',
  'packing.allDone': 'Alles gepackt 🎉',
  'packing.skipped': 'Bewusst weggelassen',
  'packing.undo': 'Rückgängig',
  'packing.packedToast': '„{name}“ gepackt ✓',
  'packing.openPrep': '{n} Vorbereitung offen | {n} Vorbereitungen offen',

  'mode.pack': 'Packen',
  'mode.buyBefore': 'Vorher kaufen',
  'mode.buyLocal': 'Vor Ort kaufen',
  'mode.latePacker': 'Spätpacker',

  'settings.title': 'Einstellungen',
  'settings.appearance': 'Darstellung',
  'settings.lightTheme': 'Helles Design',
  'settings.language': 'Sprache',
  'settings.languageHint': 'Nur auf diesem Gerät.',
  'settings.languageEnglish': 'Englisch',
  'settings.languageGerman': 'Deutsch',
}
