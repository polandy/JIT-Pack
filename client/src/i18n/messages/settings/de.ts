/** German messages for settings (M17), admin, login, first run, import, sync, updates, conflicts, notifications, activity; exactly the key set of ./en.ts. */
import type { settingsEn } from './en'

export const settingsDe: Record<keyof typeof settingsEn, string> = {
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
  // FR-19.7 — eine wartende Version anwenden, ohne auf den nächsten Start zu warten.
  'update.banner.title': 'Neue Version bereit',
  'update.banner.note': 'Ungesendete Änderungen bleiben erhalten.',
  'update.apply': 'Aktualisieren',
  'update.applyLong': 'Jetzt aktualisieren',
  'update.applying': 'Wird aktualisiert…',
  'update.later': 'Später',
  'migration.banner.title': 'Umzug abschliessen',
  'migration.banner.note':
    'Stelle die Sicherung wieder her, die du vor dem Wechsel heruntergeladen hast.',
  'migration.banner.restore': 'Wiederherstellen',
  'migration.banner.skip': 'Überspringen',
  'migration.skipConfirm.title': 'Ohne Wiederherstellung fortfahren?',
  'migration.skipConfirm.body': 'Die Daten bleiben dann nur in der Sicherungsdatei.',
  'migration.skipConfirm.confirm': 'Neu beginnen',
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

  'settings.title': 'Einstellungen',
  'settings.appearance': 'Darstellung',
  'settings.lightTheme': 'Helles Design',
  'settings.defaultTravelers': 'Standard-Reisende',
  'settings.defaultTravelersHint':
    'Eine neue Reise startet mit diesen Personen. Nur auf diesem Gerät; pro Reise änderbar.',
  'settings.addTraveler': 'Reisende:n hinzufügen',
  'settings.addTravelerAccount': 'Bestehenden User hinzufügen',
  'settings.travelerLinked': 'Verknüpfter Account',
  // M17's remaining sections (NFR-4.12) — see the English file.
  'settings.profile': 'Profil',
  'settings.profileLocalNote': 'Der lokale Modus kennt kein Konto — alles bleibt auf diesem Gerät.',
  'settings.avatarAlt': 'Profilbild',
  'settings.changePicture': 'Bild ändern',
  'settings.displayName': 'Anzeigename',
  'settings.saved': 'Gespeichert',
  'settings.nameRule': '1–50 Zeichen, ohne Leerzeichen am Anfang oder Ende.',
  'settings.nameManaged':
    'Dein Anzeigename kommt von deinem Identitätsanbieter. Das Bild wählst du selbst.',
  'settings.profileUnavailable': 'Profil nicht verfügbar — Server nicht erreichbar.',
  'settings.lightThemeHint':
    'Tag statt Nacht — dunkel ist die Voreinstellung. Nur auf diesem Gerät.',
  'settings.notifications': 'Benachrichtigungen',
  'settings.prefDelegation': 'Übergaben',
  'settings.prefDelegationHint': 'Ein Packelement wurde dir zum Packen übergeben',
  'settings.prefMention': 'Erwähnungen',
  'settings.prefMentionHint': 'Jemand hat @dich in einem Kommentar erwähnt',
  'settings.prefTask': 'Aufgaben',
  'settings.prefTaskHint': 'Zu deinem Packelement wurde eine Aufgabe eröffnet',
  'settings.prefLockTaken': 'Übernommene Artikel',
  'settings.prefLockTakenHint': 'Jemand hat einen Artikel übernommen, den du gerade gepackt hast',
  'settings.prefNote': 'Reisenotizen',
  'settings.prefNoteHint': 'Ein Mitreisender hat eine neue Notiz geschrieben',
  'settings.prefNoteReply': 'Antworten auf Notizen',
  'settings.prefNoteReplyHint':
    'Jemand hat in einer Notiz geantwortet, in der du mitgeschrieben hast',
  'settings.prefTaskDue': 'Fällige Aufgaben',
  'settings.prefTaskDueHint': 'Eine Aufgabe für dich ist morgen oder heute fällig',
  'settings.prefShoppingDue': 'Fällige Einkäufe',
  'settings.prefShoppingDueHint':
    'Etwas auf der Einkaufsliste einer Reise ist morgen oder heute fällig',
  'settings.prefIdea': 'Neue Ideen',
  'settings.prefIdeaHint': 'Ein Mitreisender hat eine Idee vorgeschlagen',
  'settings.prefIdeaComment': 'Kommentare zu Ideen',
  'settings.prefIdeaCommentHint':
    'Jemand schreibt zu einer Idee, die du vorgeschlagen oder kommentiert hast',
  'settings.prefIdeaShortlisted': 'Ideen auf der Shortlist',
  'settings.prefIdeaShortlistedHint': 'Eine Idee kam auf die Shortlist',
  'settings.prefExcursionDue': 'Ausflüge',
  'settings.prefExcursionDueHint':
    'Ein Ausflug ist morgen oder heute, und es ist noch nicht alles gepackt',
  'settings.push': 'Push auf diesem Gerät',
  'settings.pushHint': 'Systemmeldungen, während die App geschlossen ist',
  'settings.pushUnsupported': 'Von diesem Browser nicht unterstützt',
  'settings.notificationsUnavailable':
    'Benachrichtigungseinstellungen nicht verfügbar — Server nicht erreichbar.',
  'settings.data': 'Daten',
  'settings.backupNever':
    'Du hast noch keine Sicherung gemacht — lade eine Kopie herunter, damit deine Daten diesen Browser überleben.',
  'settings.backupStale':
    'Letzte Sicherung vor {n} Tag. Lade eine frische Kopie herunter (alle {every} Tage ist eine gute Gewohnheit). | Letzte Sicherung vor {n} Tagen. Lade eine frische Kopie herunter (alle {every} Tage ist eine gute Gewohnheit).',
  'settings.localBackupNote':
    'Die Sicherung im lokalen Modus ist der portable YAML-Export — es gibt keine Serverkopie deiner Daten. Dateien kommen über den Reise-/Vorlagen-Import zurück.',
  'settings.tripYaml': 'Reise (YAML)',
  'settings.templateYaml': 'Vorlage (YAML)',
  'settings.tripCsv': 'Packliste der Reise (CSV)',
  'settings.fullExport': 'Vollständiger Export (JSON)',
  'settings.fullExportHint': 'Alles, was du sehen kannst, als versionierte Sicherungsdatei',
  'settings.storageDetails': 'Speicherdetails',
  'settings.storageDetailsHint': 'Belegung auf dem Gerät',
  'settings.move.title': 'Auf einen Server umziehen',
  'settings.move.intro': 'Die Daten bleiben auf diesem Gerät, bis Schritt 3 erledigt ist.',
  'settings.move.step1': 'Sicherung herunterladen',
  'settings.move.backupNever': 'Noch keine Sicherung.',
  'settings.move.backupLast': 'Letzte Sicherung: {when}',
  'settings.move.backupAction': 'Sicherung herunterladen',
  'settings.move.step2': 'Server verbinden',
  'settings.move.serverUrl': 'Server-URL',
  'settings.move.switchAction': 'Zu diesem Server wechseln',
  'settings.move.guard': 'Zuerst sichern — seit der letzten Sicherung wurde etwas geändert.',
  'settings.move.step3': 'Sicherung wiederherstellen',
  'settings.move.step3Body':
    'Nach dem Wechsel bittet dich die App, die eben heruntergeladene Datei wiederherzustellen.',
  'settings.move.secondCopy':
    'Dieses Gerät behält eine zweite Kopie der Daten, die die App nicht mehr liest.',
  'settings.storageTitle': 'Speicher auf diesem Gerät',
  'settings.storageUnavailable': 'Speicherdetails sind in diesem Browser nicht verfügbar.',
  'settings.storageUsed': '{used} MB von {quota} MB auf diesem Gerät belegt.',
  'settings.storagePersistent':
    'Der Speicher ist dauerhaft — der Browser räumt ihn nicht von selbst weg.',
  'settings.storageNotPersistent':
    'Der Speicher ist nicht als dauerhaft markiert, der Browser kann ihn bei Platzmangel verwerfen. Halte einen aktuellen Export bereit.',
  'settings.administration': 'Verwaltung',
  'settings.userAdmin': 'Benutzerverwaltung',
  'settings.userAdminHint': 'Angelegte Konten, Deaktivierung, Profilmoderation',
  'settings.conflictLog': 'Konfliktprotokoll',
  'settings.conflictLogNote':
    'Automatisch aufgelöste Zusammenführungen werden je Reise protokolliert — öffne eine Reise und tippe auf die Synchronisationsanzeige in der Kopfzeile.',
  'settings.connection': 'Verbindung',
  'settings.connectionServer': 'Dieses Gerät ist verbunden mit',
  'settings.logout': 'Abmelden',
  'settings.logoutHint':
    'Beendet die Sitzung auf diesem Gerät. Noch nicht gesendete Änderungen bleiben auf dem Gerät.',
  'settings.logoutConfirmTitle': 'Abmelden?',
  'settings.logoutConfirmBody':
    'Dieses Gerät kehrt zur Anmeldung zurück. Es wird nichts gelöscht, und noch nicht gesendete Änderungen bleiben bis zur nächsten Anmeldung auf dem Gerät.',
  'settings.resetConnection': 'Verbindung zurücksetzen',
  'settings.resetConnectionHint':
    'Vergisst die Sitzung und die Serveradresse und fragt beim nächsten Start erneut. Dafür gedacht, wenn die App ihre Instanz nicht erreicht.',
  'settings.resetConnectionConfirmTitle': 'Diese Verbindung vergessen?',
  'settings.resetConnectionConfirmBody':
    'Beim nächsten Start fragt die App erneut, welche Instanz verwendet werden soll. Auf dem Gerät wird nichts gelöscht.',
  'settings.about': 'Über',
  'settings.aboutVersion': 'Version {version} · {commit}',
  // FR-23.8 — die Instanz gegenüber den Releases auf GitHub.
  'settings.updateBadge': 'Neu',
  'settings.updateAvailable': '{version} verfügbar',
  'settings.updateReleaseNotes': 'Release Notes',
  'settings.updateCurrent': 'Aktuell · geprüft {when}',
  'settings.updateUnreachable': 'Update-Prüfung nicht erreichbar',
  'settings.updateUnreachableSince': 'Update-Prüfung nicht erreichbar · zuletzt geprüft {when}',
  'settings.apiTokens': 'API-Token',
  'settings.apiTokensHint':
    'Mit einem Token handelt ein Skript oder ein anderes Werkzeug in deinem Namen. Es wird einmal angezeigt und lässt sich nicht einzeln zurücknehmen.',
  'settings.tokenName': 'Wofür ist es?',
  'settings.tokenNamePlaceholder': 'Aufräumskript',
  'settings.tokenExpiry': 'Läuft ab nach',
  'settings.tokenExpiry1h': 'einer Stunde',
  'settings.tokenExpiry1d': 'einem Tag',
  'settings.tokenExpiry7d': 'einer Woche',
  'settings.tokenExpiry30d': '30 Tagen',
  'settings.tokenExpiry90d': '90 Tagen',
  'settings.tokenExpiry365d': 'einem Jahr',
  'settings.tokenExpiryNever': 'nie',
  'settings.tokenCreate': 'Token erstellen',
  'settings.tokenFailed': 'Das Token konnte nicht erstellt werden.',
  'settings.tokenRevealTitle': 'Dein neues Token',
  'settings.tokenShownOnce': 'Jetzt kopieren — es wird kein zweites Mal angezeigt.',
  'settings.tokenExpiresAt': 'Läuft am {date} ab.',
  'settings.tokenNeverExpires': 'Es läuft nicht ab.',
  'settings.tokenNoRevoke':
    'Einzelne Token lassen sich nicht zurücknehmen. Ein Wechsel des Session-Secrets der Instanz entwertet alle auf einmal.',
  'settings.retired': 'Ausgeblendete Stammdaten',
  'settings.retiredRow': 'Ausgeblendete Artikel und Vorlagen zurückholen',
  'settings.retiredHint': 'Zurückholen, was ein Löschen nur ausgeblendet hat.',
  'settings.retiredCount': '{n} ausgeblendete Zeile | {n} ausgeblendete Zeilen',
  'settings.modeLocal': 'Modus: Lokal (nur dieses Gerät)',
  'settings.modeServer': 'Modus: Server ({url})',

  'settings.language': 'Sprache',
  'settings.languageHint': 'Nur auf diesem Gerät.',
  'settings.languageEnglish': 'Englisch',
  'settings.languageGerman': 'Deutsch',

  // M18 — portabler Import und die Wiederherstellung nach ADR-015 (FR-18.4/18.5).
  'import.portable.fileTitle': 'Portable YAML-Datei',
  'import.portable.fileHint': 'Eine Vorlage oder Reise aus einer beliebigen JIT-Pack-Instanz.',
  'import.portable.paste': '… oder YAML hier einfügen',
  'import.portable.preview': 'Vorschau',
  'import.portable.template': 'Vorlage',
  'import.portable.trip': 'Reise',
  'import.portable.items': '{n} Artikel | {n} Artikel',
  'import.portable.schema': 'Schema v{n}',
  'import.portable.newerSchema':
    'Diese Datei stammt aus einer neueren App-Version — unbekannte Felder werden ignoriert.',
  'import.portable.stateNew': 'neu',
  'import.portable.stateMatched': 'zugeordnet',
  'import.portable.similar': 'ähnlich wie: {name}',
  'import.portable.merge': 'Zusammenführen',
  'import.portable.keepSeparate': 'Getrennt lassen',
  'import.portable.importTemplate': 'Vorlage importieren',
  'import.portable.importTrip': 'Reise importieren',
  'import.portable.backupTitle': 'Sicherung',
  'import.portable.backupHint':
    '{n} Dokument in dieser Datei. Der Import ergänzt, was schon auf diesem Gerät ist; vorhandene Artikel werden über den Namen zugeordnet. | {n} Dokumente in dieser Datei. Der Import ergänzt, was schon auf diesem Gerät ist; vorhandene Artikel werden über den Namen zugeordnet.',
  'import.portable.unreadable': 'Unlesbares Dokument',
  'import.portable.skipped': 'übersprungen',
  // ADR-030: Eine Reise ist über Jahr und Name identifiziert.
  'import.portable.alreadyHere': 'Schon vorhanden',
  'import.portable.alreadyHereHint':
    'Das ist auf diesem Gerät schon vorhanden — es wird nicht ein zweites Mal angelegt.',
  'import.portable.restoreAlreadyHere':
    '{n} Reise oder Vorlage war schon vorhanden und wurde nicht neu angelegt. | {n} Reisen und Vorlagen waren schon vorhanden und wurden nicht neu angelegt.',
  'import.portable.importAll': 'Alle importieren',
  // FR-27.4: Eine wiederhergestellte Reise folgt ihren Gruppen weiter.
  'import.portable.follows': 'folgt {n} Gruppe | folgt {n} Gruppen',

  // M15 — Import-Assistent für Tabellen (FR-16.1–16.3).
  'import.wizard.step': 'Schritt {step} von 4',
  'import.wizard.next': 'Weiter',
  'import.wizard.csvTitle': 'Tabelle (CSV)',
  'import.wizard.csvHint':
    'Zeilen sind Artikel (mit Kategoriezeilen), Spalten sind Reisen mit Mengen. XLSX? Vorher als CSV exportieren.',
  'import.wizard.paste': '… oder CSV hier einfügen',
  'import.wizard.analyze': 'Analysieren',
  'import.wizard.tripsTitle': 'Zu importierende Reisen',
  'import.wizard.tripName': 'Reisename',
  'import.wizard.tripDate': 'Jahr oder Datum',
  'import.wizard.series': 'Serie',
  'import.wizard.noSeries': 'Keine Serie',
  'import.wizard.seriesLabel': 'Zielserie',
  'import.wizard.mappingInvalid':
    'Jede ausgewählte Reise braucht einen Namen und ein Jahr (z. B. 2024) oder Datum.',
  'import.wizard.nothingToImport':
    'Keine Zeilen zum Importieren — wähle die Spalte mit den Artikelnamen.',
  'import.wizard.itemColumn': 'Artikelspalte',
  'import.wizard.column': 'Sp. {n}',
  'import.wizard.categoryRows': 'Kategoriezeilen',
  'import.wizard.categoryColumn': 'Kategoriespalte',
  'import.wizard.categoryColumnHint':
    'Manche Tabellen führen die Kategorie in einer eigenen Spalte neben dem Artikel, fortgeschrieben bis sie wechselt.',
  'import.wizard.noCategoryColumn': 'Keine',
  'import.wizard.duplicates': 'Mögliche Dubletten',
  'import.wizard.duplicatesHint': 'Diese importierten Namen ähneln Artikeln, die es schon gibt.',
  'import.wizard.existing': 'vorhanden: {name}',
  'import.wizard.existingExact': 'vorhanden: {name} (exakte Übereinstimmung)',
  'import.wizard.summary': 'Zusammenfassung',
  'import.wizard.summaryTrips': '{n} archivierte Reise | {n} archivierte Reisen',
  'import.wizard.summaryItems': '{n} neuer Artikel | {n} neue Artikel',
  'import.wizard.summaryMerged': '{n} zusammengeführt',
  'import.wizard.summaryCategories': '{n} Kategorie | {n} Kategorien',
  'import.wizard.gridMore': '…und {n} weitere Zeile | …und {n} weitere Zeilen',
  'import.wizard.noiseNote':
    '{n} Eintrag ist im Blatt als unsicher markiert ({names}) und wird zu einer offenen Aufgabe auf seiner Zeile. | {n} Einträge sind im Blatt als unsicher markiert ({names}) und werden zu offenen Aufgaben auf ihren Zeilen.',
  'import.wizard.summaryTasks': '{n} offene Aufgabe | {n} offene Aufgaben',
  'import.wizard.noiseTodo': "Mit '?' importiert — klären: {name}",
  'import.wizard.commit': 'Importieren',

  // M19 Moduswahl beim ersten Start (FR-19.1).
  'firstRun.welcome': 'Willkommen bei JIT-Pack',
  'firstRun.intro': 'Wo sollen deine Packdaten liegen? Diese Wahl triffst du pro Gerät einmal.',
  'firstRun.localTitle': 'Lokal — nur dieses Gerät',
  'firstRun.localBody':
    'Alles bleibt in diesem Browser bzw. dieser App. Kein Server, kein Konto. Teilen und Sync über mehrere Geräte gibt es nicht; regelmässige Exporte sind deine Sicherung.',
  'firstRun.localAction': 'Lokal arbeiten',
  'firstRun.serverTitle': 'Server — synchron und gemeinsam',
  'firstRun.serverBody':
    'Verbinde dich mit einem selbst gehosteten JIT-Pack-Server: mehrere Geräte, gemeinsame Reisen.',
  'firstRun.serverUrl': 'Server-URL',
  'firstRun.serverUrlInvalid': 'Bitte eine vollständige http(s)-Adresse eingeben.',
  'firstRun.serverAction': 'Mit Server verbinden',

  // OIDC-Anmeldung und ihr Rücksprungziel (Sync-API §2).
  'login.title': 'Anmelden',
  'login.notRequired': 'Dieser Server verlangt keine Anmeldung — du kannst zurück in die App.',
  'login.hint':
    'Die Anmeldung läuft über deinen Identity Provider; JIT-Pack sieht dein Passwort nie.',
  'login.action': 'Mit SSO anmelden',
  'login.serverUnreachable': 'Server nicht erreichbar',
  'login.noOidc': 'Dieser Server bietet keine OIDC-Anmeldung an',
  'login.checkFailed': 'Der Server hat nicht beantwortet, ob eine Anmeldung nötig ist.',
  'login.startFailed': 'Die Anmeldung liess sich nicht starten',
  'login.completing': 'Anmeldung wird abgeschlossen…',
  'login.interrupted': 'Die Anmeldung wurde unterbrochen — bitte noch einmal versuchen.',
  'login.rejected': 'Der Server hat die Anmeldung abgelehnt.',
  'login.deactivated':
    'Dieses Konto ist deaktiviert. Eine erneute Anmeldung stellt den Zugang nicht wieder her — das muss eine Instanz-Administration tun.',
  'login.failed': 'Anmeldung fehlgeschlagen — Server nicht erreichbar.',
  'login.backToLogin': 'Zurück zur Anmeldung',

  // M30 Aktivität (FR-32.2).
  'activity.title': 'Aktivität',
  'activity.titleInventory': 'Aktivität · Inventar',
  'activity.menu': 'Aktivität',
  'activity.loading': 'Aktivität wird geladen …',
  'activity.empty': 'Noch keine Änderungen aufgezeichnet',
  'activity.emptyHint':
    'Hier steht, wer was geändert hat — jede Änderung, sobald sie beim Server angekommen ist.',
  'activity.unavailable': 'Aktivität nicht verfügbar — offline?',
  'activity.more': 'Ältere laden',
  'activity.today': 'Heute',
  'activity.yesterday': 'Gestern',
  'activity.times': '{n}×',
  'activity.andMore': '+{n}',
  'activity.in': 'in „{subject}“',
  'activity.unnamed': '(ohne Namen)',
  'activity.someone': 'Jemand',
  'activity.area.trip': 'Reise',
  'activity.area.travellers': 'Reisende',
  'activity.area.tags': 'Tags',
  'activity.kind.added': 'hinzugefügt',
  'activity.kind.removed': 'gelöscht',
  'activity.kind.changed': 'geändert',
  'activity.kind.reordered': 'umsortiert',
  'activity.kind.packed': 'eingepackt',
  'activity.kind.unpacked': 'wieder ausgepackt',
  'activity.kind.skipped': 'bewusst nicht eingepackt',
  'activity.kind.bought': 'gekauft',
  'activity.kind.unbought': 'Kauf zurückgenommen',
  'activity.kind.done': 'erledigt',
  'activity.kind.reopened': 'wieder geöffnet',
  'activity.kind.read': 'abgehakt',
  'activity.kind.unread': 'Haken entfernt',
  'activity.kind.voted': 'abgestimmt',
  'activity.kind.unvoted': 'Stimme zurückgenommen',
  'activity.kind.retired': 'ausgeblendet',
  'activity.kind.restored': 'wieder eingeblendet',

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

  // M20 Benutzerverwaltung (Addendum 3.23).
  'admin.title': 'Benutzerverwaltung',

  // M20 Benutzerverwaltung (Addendum 3.23, FR-23.2–23.5).
  'admin.actionDeactivate': 'Deaktivieren',
  'admin.actionReactivate': 'Wieder aktivieren',
  'admin.actionResetAvatar': 'Bild entfernen',
  'admin.actionResetName': 'Anzeigenamen zurücksetzen',
  'admin.deactivateTitle': '{name} deaktivieren?',
  'admin.deactivateMessage':
    'Das Konto verliert sofort jeden Zugriff. Reisen, Vorlagen und Zuschreibungen bleiben unangetastet und für andere sichtbar. Ein erneutes Anmelden hilft nicht — nur „Wieder aktivieren“.',
  'admin.unavailable':
    'Übersicht nicht verfügbar — nur für Instanz-Admins, und der Server muss erreichbar sein.',
  'admin.self': '(du)',
  'admin.provisioned': 'Angelegt am {date}',
  'admin.tripCount': '{n} Reise | {n} Reisen',
  'admin.templateCount': '{n} Vorlage | {n} Vorlagen',
  'admin.deactivated': 'Deaktiviert',
  'notify.body.delegation': '{actor} hat dir „{item}“ zugewiesen',
  'notify.body.delegationPlain': '{actor} hat dir einen Artikel zugewiesen',
  'notify.body.mention': '{actor} hat dich erwähnt: {preview}',
  'notify.body.mentionPlain': '{actor} hat dich erwähnt',
  'notify.body.task': '{actor} hat eine Aufgabe zu „{item}“ eröffnet',
  'notify.body.taskPlain': '{actor} hat eine Aufgabe für dich eröffnet',
  'notify.body.lock_taken': '{actor} hat „{item}“ von dir übernommen',
  'notify.body.lock_takenPlain': '{actor} hat einen Artikel von dir übernommen',
  'notify.body.note': '{actor} hat eine Notiz geschrieben: {preview}',
  'notify.body.notePlain': '{actor} hat eine neue Notiz geschrieben',
  'notify.body.note_reply': '{actor} hat auf „{thread}“ geantwortet: {preview}',
  'notify.body.note_replyPlain': '{actor} hat auf eine Notiz geantwortet',
  'notify.body.task_due': '„{item}“ ist heute fällig',
  'notify.body.task_duePlain': 'Eine Aufgabe ist heute fällig',
  'notify.body.task_dueTomorrow': '„{item}“ ist morgen fällig',
  'notify.body.task_dueTomorrowPlain': 'Eine Aufgabe ist morgen fällig',
  'notify.body.shopping_due': '„{item}“ heute kaufen',
  'notify.body.shopping_duePlain': 'Ein Einkauf ist heute fällig',
  'notify.body.shopping_dueTomorrow': '„{item}“ bis morgen kaufen',
  'notify.body.shopping_dueTomorrowPlain': 'Ein Einkauf ist morgen fällig',
  'notify.body.excursion_due': '„{item}“ ist heute — noch nicht alles gepackt',
  'notify.body.excursion_duePlain': 'Heute ist ein Ausflug',
  'notify.body.excursion_dueTomorrow': '„{item}“ ist morgen — noch nicht alles gepackt',
  'notify.body.excursion_dueTomorrowPlain': 'Morgen ist ein Ausflug',
  'notify.body.idea': '{actor} hat „{item}“ vorgeschlagen',
  'notify.body.ideaPlain': '{actor} hat eine Idee vorgeschlagen',
  'notify.body.idea_comment': '{actor} zu „{item}“: {preview}',
  'notify.body.idea_commentPlain': '{actor} hat eine Idee kommentiert',
  'notify.body.idea_shortlisted': '{actor} hat „{item}“ auf die Shortlist gesetzt',
  'notify.body.idea_shortlistedPlain': '{actor} hat eine Idee auf die Shortlist gesetzt',
  'notify.body.generic': '{actor} hat dir eine Benachrichtigung geschickt',
  'notify.toastOpen': 'Öffnen',
  'notify.actorUnknown': 'Jemand',
}
