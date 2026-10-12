/** German messages for M1, the dashboard; exactly the key set of ./en.ts. */
import type { dashboardEn } from './en'

export const dashboardDe: Record<keyof typeof dashboardEn, string> = {
  // M1 Übersicht — „was ist jetzt dran?“
  'dashboard.greetingMorning': 'Guten Morgen',
  'dashboard.greetingAfternoon': 'Guten Tag',
  'dashboard.greetingEvening': 'Guten Abend',
  // Nachts absichtlich neutral (UX-15): jede Tageszeit-Behauptung um 00:14 ist falsch.
  'dashboard.greetingNight': 'Hallo',
  'dashboard.subtitle': 'Was beim Packen ansteht',
  // FR-7.11/FR-30.10: M1's due line — „2 Aufgaben (1 überfällig) · 3 Einkäufe fällig“.
  'dashboard.dueWord': 'fällig',
  'dashboard.overdueWord': 'überfällig',
  'dashboard.overdueOf': '({n} überfällig)',
  'dashboard.planTrip': 'Reise planen',
  'dashboard.delegated': '{n} Sache für dich | {n} Sachen für dich',
  'dashboard.delegatedNewRow': '{name} — neu',
  'dashboard.delegatedNew': '{n} neu',
  'dashboard.latePackers': '{n} letzte Sache | {n} letzte Sachen',
  // FR-7.9, Entscheid 1/2 — M1s Notizen-Karte: die neusten Notizen anderer,
  // die ich noch nicht abgehakt habe, je mit Reise-Chip und eigenem Haken.
  'dashboard.newNotes': 'Neue Notizen',
  'dashboard.newNotesTick': 'Als gesehen markieren',
  'dashboard.planned': 'Geplant',
  'dashboard.tripTasks': 'Aufgaben',

  'dashboard.taskLineOpen': 'Aufgaben: {n} offen',
  'dashboard.taskLineDone': 'Aufgaben: alle erledigt',
  'dashboard.openWord': 'offen',
  'dashboard.blockAdd': 'Hinzufügen',
  'dashboard.tasksTitle': 'Aufgaben',
  'dashboard.tasksTitleMine': 'Aufgaben · meine zuerst',
  'dashboard.tasksMore': '+ {n} weitere · alle Aufgaben',
  'dashboard.tasksAll': 'Alle Aufgaben',
  'dashboard.tasksAdded': '„{body}“ zu Aufgaben hinzugefügt',
  'dashboard.taskCheck': '{body} erledigt',
  'dashboard.phasePacking': 'Packen',
  'dashboard.phaseOnSite': 'Vor Ort',
  'dashboard.dayBefore': 'in {n} Tag | in {n} Tagen',
  'dashboard.dayFirst': 'Abreise heute',
  'dashboard.dayLast': 'Letzter Tag',
  'dashboard.dayOf': 'Tag {day} von {total}',
  'dashboard.dayOpenEnded': 'Tag {day}',
  'dashboard.dayRemaining': 'noch {n} Tag | noch {n} Tage',
  'dashboard.openPackingList': 'Packliste öffnen',
  'dashboard.openCount': '{n} offen',
  'dashboard.packingList': 'Packliste',
  'dashboard.moreItems': '+{n} weitere',
}
