/** German messages for the sync indicator, its detail sheet, the outbox and the conflict log; exactly the key set of ./en.ts. */
import type { syncEn } from './en'

export const syncDe: Record<keyof typeof syncEn, string> = {
  'sync.synced': 'Synchronisiert',
  'sync.syncing': 'Synchronisiert…',
  'sync.offline': 'Offline',
  'sync.local': 'Auf diesem Gerät',
  'sync.offlineQueued': 'Offline ({n} in der Warteschlange)',

  'sync.detail.explain.synced': 'Alle Änderungen von diesem Gerät sind beim Server angekommen.',
  'sync.detail.explain.syncing': 'Eine Änderung ist unterwegs zum Server und noch nicht bestätigt.',
  'sync.detail.explain.offline':
    'Der Server ist nicht erreichbar. Deine Änderungen bleiben auf diesem Gerät und gehen raus, sobald er wieder da ist.',
  'sync.detail.explain.local':
    'Local Mode: Es gibt keinen Server. Alles, was du erfasst, bleibt in diesem Browser auf diesem Gerät.',
  'sync.detail.lastSynced': 'Zuletzt synchronisiert: {when}',
  'sync.detail.online': 'Packen gerade',
  'sync.detail.onlineNobody': 'Gerade packt sonst niemand.',
  'sync.detail.live': 'Live-Updates sind verbunden — Änderungen anderer Geräte kommen sofort an.',
  'sync.detail.liveGap':
    'Live-Updates sind gerade nicht verbunden. Verbindung wird wiederhergestellt — bis dahin kommen Änderungen anderer Geräte mit der nächsten Synchronisation.',
  'sync.detail.lastFailure': 'Letzte fehlgeschlagene Anfrage, {when}: {status} bei {method} {path}',
  'sync.detail.lastFailureUnreachable':
    'Letzte fehlgeschlagene Anfrage, {when}: keine Antwort von {method} {path}',
  'sync.detail.lastFailureHint':
    'Diese Zeile bei einer Problemmeldung mitschicken — sie sagt, was fehlgeschlagen ist, nicht nur dass etwas fehlgeschlagen ist.',
  'sync.detail.pending':
    '{n} Änderung wartet auf den Versand | {n} Änderungen warten auf den Versand',
  'sync.detail.conflicts': 'Konflikte in dieser Reise',
  'sync.detail.conflictsMaster': 'Konflikte in Inventar, Gruppen und Reisedaten',
  'sync.detail.storage': 'Speicher auf diesem Gerät',
  'sync.detail.storageUsage': '{used} MB von {quota} MB belegt',
  'sync.detail.storageUnknown': 'Dieser Browser meldet nicht, wie viel Platz er belegt.',
  'sync.detail.persistent':
    'Als dauerhaft markiert — der Browser löscht die Daten nicht von selbst.',
  'sync.detail.eviction':
    'Nicht als dauerhaft markiert: Der Browser darf diese Daten löschen, wenn der Platz knapp wird.',
  'sync.detail.backup': 'Sicherung',
  'sync.detail.backupNever': 'Noch nie gesichert',
  'sync.detail.backupToday': 'Zuletzt gesichert: heute',
  'sync.detail.backupAge': 'Zuletzt gesichert: vor {n} Tag | Zuletzt gesichert: vor {n} Tagen',
  'sync.detail.backupNow': 'Jetzt sichern',
  'sync.detail.backupEmpty':
    'Noch nichts zu sichern — keine Reisen und keine Vorlagen auf diesem Gerät.',
  'sync.detail.backupHint':
    'Eine YAML-Datei mit allen Reisen und Vorlagen. Zurückspielen geht über den Import.',
  'sync.detail.backupSaved': 'Sicherung gespeichert: {file}',
  'sync.detail.updateReady':
    'Eine neue Version von JIT-Pack ist bereit. Sie übernimmt beim nächsten Öffnen der App — oder jetzt.',

  // B2/NFR-4.1 — der dauerhafte Ausgangskorb.
  'sync.detail.pendingDurable':
    'Sie sind auf diesem Gerät gespeichert und gehen raus, sobald es wieder online ist.',
  'sync.detail.pendingFragile':
    'Dieses Gerät konnte sie nicht speichern — die App jetzt zu schließen würde sie verlieren.',
  'sync.conflictToast':
    'Ein anderes Gerät hat {n} Feld deiner Änderung überschrieben | Ein anderes Gerät hat {n} Felder deiner Änderungen überschrieben',
  'sync.conflictToastOpen': 'Ansehen',
  'sync.detail.conflicted':
    '{n} Feld deiner Änderungen wurde von einem anderen Gerät überschrieben | {n} Felder deiner Änderungen wurden von einem anderen Gerät überschrieben',
  'sync.detail.parked':
    'Der Server hat {n} Änderung abgelehnt | Der Server hat {n} Änderungen abgelehnt',
  'sync.detail.parkedHint':
    'Sie wurden aus der Warteschlange genommen, damit der Rest rausgeht, und bleiben auf diesem Gerät. Erneut versucht werden sie nicht.',
  'sync.rejectionToast':
    'Der Server hat {n} Änderung abgelehnt — sie wurde zurückgenommen | Der Server hat {n} Änderungen abgelehnt — sie wurden zurückgenommen',
  'sync.detail.rejected.notAuthorized': 'Du darfst diese Änderung nicht machen.',
  'sync.detail.rejected.outOfScope':
    'Sie nannte eine andere Reise als die, für die sie gesendet wurde.',
  'sync.detail.rejected.stillReferenced':
    'Andere Daten verweisen noch darauf — mit dem Löschen ginge das mit verloren, deshalb hat der Server es behalten.',
  'sync.detail.rejected.templateScope':
    'Das würde die Regel brechen, dass eine Vorlage Gruppen enthält und eine Gruppe Artikel.',
  'sync.detail.rejected.constraintViolated':
    'Etwas, worauf sie sich bezieht, gibt es auf dem Server nicht mehr.',
  'sync.detail.rejected.malformedHlc':
    'Der Zeitstempel dieser Änderung war unbrauchbar — dieses Gerät hat sie fehlerhaft erzeugt.',
  'sync.detail.rejected.rowDeleted':
    'Jemand hat den Eintrag gelöscht, nachdem Sie diese Änderung gemacht haben — der Server hat ihn nicht wieder angelegt.',
  'sync.detail.rejected.notATripMember':
    'Diese Person ist kein Mitglied dieser Reise — laden Sie sie ein, bevor Sie den Account verknüpfen.',

  // G-2 Konfliktprotokoll (NFR-4.2a).
  'conflicts.title': 'Konfliktprotokoll',
  'conflicts.takeoverSection': 'Übernommene Artikel',
  'conflicts.takeoverLine': '{to} hat den Artikel von {from} übernommen',
  'conflicts.titleMaster': 'Konflikte · Stammdaten',
  'conflicts.unavailable': 'Konfliktprotokoll nicht verfügbar — offline?',
  'conflicts.listUnknown': 'Protokoll wird geladen …',
  'conflicts.empty': 'Keine Konflikte — alles sauber zusammengeführt',
  'conflicts.emptyMaster':
    'Keine Konflikte in Inventar, Gruppen oder Reisedaten — alles sauber zusammengeführt',
  'conflicts.emptyValue': '—',
  'conflicts.revert': 'Zurücknehmen',
  'conflicts.reverted': 'Zurückgenommen',
  'conflicts.revertHint':
    'Zurücknehmen schreibt den unterlegenen Wert neu — als normale Änderung, die auf allen Geräten ankommt.',
  'conflicts.entity.trips': 'Reise',
  'conflicts.entity.trip_items': 'Position',
  'conflicts.entity.items': 'Stammartikel',
  'conflicts.entity.templates': 'Liste',
  'conflicts.entity.tags': 'Tag',
  'conflicts.entity.travelers': 'Reisende:r',
  'conflicts.entity.containers': 'Behälter',
  'conflicts.entity.comments': 'Kommentar',
  'conflicts.entity.trip_series': 'Serie',
  'conflicts.entity.shopping_entries': 'Einkauf',
  'conflicts.entity.ideas': 'Idee',
  'conflicts.revertFailed.alreadyReverted': 'Dieser Konflikt wurde bereits zurückgenommen.',
  'conflicts.revertFailed.rowDeleted': 'Der Eintrag wurde inzwischen gelöscht.',
  'conflicts.revertFailed.refused':
    'Zurücknehmen nicht möglich: der Artikel ist inzwischen eingepackt.',
  'conflicts.revertFailed.forbidden': 'Du darfst diesen Eintrag nicht ändern.',
  'conflicts.revertFailed.generic': 'Zurücknehmen fehlgeschlagen — offline?',
}
