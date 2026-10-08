# M17 — Settings & Notifications

**App info/version.** The About block's version line names the running build: `git describe` (the release-please tag
plus a commit count once ahead of it) and the short commit hash, e.g. `v0.8.0-4-g3b14038f`. **This is the one place
the build names itself** — the app bar carries the mark and the wordmark only (G-9, UX-21: a git-describe string on
every tab root meant nothing to the family, and a bug report starts here anyway). It names the build rather than
anything server-side, so it needs no per-mode variant. **The string is verbatim**: it already carries the tag's own `v`
from both sources (`git describe --tags`, and the release workflow's `APP_VERSION=${{ github.ref_name }}`), so nothing
prepends another — a prepended `v` would read `vv0.10.0-…` (E2E-G9-21). A Docker-built image gets it from the
build args the release workflow passes in, since that build stage has no `.git` to read.

**The release line (FR-23.8, ADR-062).** One line under the version, in the About block, saying
whether a **newer release exists upstream**. Present only where the instance makes that check: it is off unless the
operator set `JITPACK_UPDATE_CHECK`, and Local Mode has no server to ask, so in both cases nothing is rendered — not
a disabled row, not a placeholder (G-8). Where it does render it takes one of three shapes. **A newer release:** a
small *Neu* chip in the brand hue (`--jp-brand`, G-11 — a release is not a fault, so it is never the warning
colour), the tag as upstream writes it (*„v0.10.0 verfügbar"* — the string carries its own `v`, see the version line
above), and a link to that release's notes, because *what changed* is the question a new version always raises.
**Up to date:** the done hue, with the moment the answer was obtained — *„Aktuell · geprüft 14.09.26, 04:12"* —
since a claim of currency with no age cannot be judged. **No answer:** recessive ink, never the danger hue, because
an instance that cannot reach GitHub is the ordinary case for an offline-first deployment; it names the last
successful check where there was one. **It is a line and never a bar**, which is what separates it from FR-19.7's
update banner two blocks up: that one is applied by the device that sees it, and this one only by whoever pulls the
image.

**Leaving Local Mode (FR-19.8, ADR-045).** A card *„Auf einen Server umziehen"* at the end of the
**Local Mode** data section, absent in every other mode (G-8). It carries three numbered steps and states, above them,
the one sentence that matters: the data stays on this device until step 3 has been done. **Step 1 — *„Sicherung
herunterladen"*:** the whole-device backup, the same export the G-2 sheet offers (FR-19.6), one function behind both.
The step shows when the last backup was taken, or that none was. **Step 2 — *„Server verbinden"*:** a URL field
pre-filled with the page's own origin, M19's own field (`ServerUrlField`, UX-21), validated for syntax exactly like
M19's (an invalid URL disables the button and
says so inline; no reachability check, for M19's reason), and the confirm. **The confirm is disabled while the backup is
older than the last change on this device**, and the disabled state says so in words (*„Zuerst sichern — seit der
letzten Sicherung wurde etwas geändert."*), because a button that is grey for a reason it does not name is the FR-25.15
shape. Taking the backup in step 1 enables it; any further write disables it again. Confirming writes the mode, the
server URL and the *migration pending* flag, then reloads — the app comes back up in Server Mode (login for an OIDC
instance, M1 for a Single-User one, as M19 describes) and M19 is **not** shown. **Step 3 — *„Sicherung
wiederherstellen"*:** is described on the card as what happens next, and performed by the **migration bar** (below)
after the reload; the card itself is gone by then, with the mode. The Local Mode data in the browser is left in place —
the card says so, in the sentence about a second copy that this device keeps and the app will not read again. ADR-045
records the shape chosen over a second device and over a native replay.

**The migration bar (FR-19.8), the FR-19.7 bar's sibling.** While the *migration pending* flag is
set, a bar under the app bar on every screen of the app shell says *„Umzug abschliessen: Sicherung wiederherstellen"*
with the action *„Wiederherstellen"*, which opens M18, and a *„Überspringen"*, which asks once (*„Ohne Wiederherstellung
fortfahren? Die Daten bleiben nur in der Sicherungsdatei."*) and then clears the flag. The flag also clears when a
restore commits on M18 in Server Mode. It is the same component shape as the FR-19.7 bar and stacks below it if both are
up. It is never shown in Local Mode — nothing there can set the flag — and not on the login screen, which has no app
shell.

**Connection (FR-19.9).** A block before *About*, in **Server Mode only** (G-8: Local Mode has no connection to name).
It states the instance this device is connected to — the stored URL, which is what actually wins over the page's origin
— and carries the two ways off it. ***Log out*** (*„Abmelden"*) ends the session and leaves the device on the login
screen; it is offered only where there is a session, so not in Single-User Mode, where the button could do nothing.
***Reset connection*** (*„Verbindung zurücksetzen"*) forgets the session, the mode and the server URL and reloads, so
**M19 asks again** — which is the point: M19 renders only while no mode is stored, so without it a device that had
answered once could never see it again, and a token the instance refuses, a mode chosen by mistake or a server URL that
stopped answering would have no repair inside the app at all. Both ask once; the reset's confirmation says that nothing
on the device is deleted, because that is the question a person about to press it has. It is worded as the destructive
one of the two all the same — it throws a decision away, and a Local Mode device's data is reachable afterwards only
through the file it exported.

**API tokens (FR-23.7, ADR-039).** A block between *Administration* and *Hidden master data*: a name
field, an expiry select (an hour / a day / a week / 30 days / 90 days / a year / never, **90 preselected**), and a
create button. It is a **form, not a list**, because there is nothing to list — tokens are stored nowhere. On success a
sheet reveals the token **as text** and then offers to copy it: a value shown exactly once has to be shown to the
person, and the clipboard can be refused. The sheet says the three things nothing else will — that it will not be shown
again, that a single token cannot be taken back, and that changing the instance's session secret revokes them all.
Closing it is what ends the token's only readable moment. The whole block is **absent** in Single-User Mode and Local
Mode (G-8): the first bypasses authentication and configures no signing secret, the second has no server, so in both a
token would prove nothing there is anything to prove.

* **Default travellers (FR-2.5a):** a named list, added and removed inline, shown in every mode and stored on the
  device. Its hint says both things that matter: this device only, and changeable per trip. In a session an *Add an
  existing user* select beside the free-text field offers the accounts not yet listed; a picked one is named like the
  account and marked *Linked account*. Absent without a session (G-8).

* **Purpose:** Personal preferences within the declarative-infrastructure constraint (Section 2: no administrative
  *infrastructure* changes via the UI; application-level user administration lives in M20, proposed per Addendum 3.23).
* **Elements:** Profile — the **display name** is read-only and OIDC-sourced, the **picture is editable** (FR-17.13: no
  identity provider supplies a picture, so gating it on Single-User Mode would leave a multi-user instance without one).
  The picture control is the same one M17 offers in Single-User Mode, described in the variant below. The note under the
  name names the display name specifically rather than claiming the whole profile is managed elsewhere; notification
  preferences per event type: delegation, mention, task assigned, **items taken over** (FR-6.2, FR-5.7), **trip notes**
  (FR-7.9), **tasks due** (FR-7.11 — the server's morning reminder), **purchases due** (FR-30.10, *Fällige Einkäufe*,
  the same run for the shopping list) and **excursions** (FR-31.9, *Ausflüge*, the same run again) with channel status
  (push registered via VAPID/UnifiedPush, NFR-4.6). **A preference turned off here reaches the server's own suppression
  rule and silences that kind alone** (E2E-M17-01 covers the wire between the two ends); data section: JSON full export,
  per-trip CSV export (NFR-4.5) — **this is the section a *server* account sees; Local Mode's data section is a
  different one**, per-trip and per-template YAML written client-side because there is no server to ask, plus the
  NFR-4.11 storage details (E2E-M17-03 covers both); conflict log viewer (G-2 target); app info/version. Appearance
  section with a dark (default, Nacht) / light (Tag) toggle (G-11, Addendum 3.21, ADR-048) and a *Start animation*
  toggle, on by default, taking effect on the next cold start (FR-21.29, G-22) — both shown in every mode,
  device-local. An Administration row → M20, rendered only for instance admins with an OIDC session (FR-23.1).
* **Single-User Mode variant (Addendum 3.17):** The Profile section makes the *display name* editable too (the picture
  already is, see above), so it carries two editable controls: a display-name text field (1–50 printable characters, no
  edge whitespace per FR-17.13; the rule note appears only after the field was touched) and an avatar picture control
  (Addendum FR-17.13) — the user picks a source photo, positions a circular crop overlay on it via pan/zoom, and
  confirms; the app renders the selected region to a 256×256 px JPEG on-device and uploads only that, with no separate
  resize/format step exposed to the user. Both controls save immediately (G-5) and are reflected wherever an avatar/name
  appears — the M17 profile row itself, the "Packed by" tag, the presence facepile per G-10 (**not** the dashboard
  greeting, a time-of-day sentence that carries neither) — always rendered as a circle via a display-time mask, never
  stored as one. The *notification preferences* section **carries only what can happen to one person alone (FR-7.11):**
  the *Fällige Aufgaben*, *Fällige Einkäufe* and *Ausflüge* rows (FR-30.10, FR-31.9) — a reminder is nobody's act, so
  FR-17.3's silence does not cover it — and the *Push auf diesem Gerät* toggle they need to reach a closed app; every
  row that needs a second party stays hidden (Addendum FR-17.3). All other elements (data export, conflict log, app
  info) remain, unchanged from normal mode.
* **Explicitly absent:** instance configuration, OIDC settings, admin-role assignment — all declarative (Section 2).
  User administration (deactivate, profile moderation) is application data, not infrastructure, and lives in M20
  (Addendum 3.23).
* **Language (NFR-4.12):** the Language row is device-local like the theme, and **the whole screen follows it** — this
  is the worst place for a half-translated page: the user changes the language here and would watch half the page ignore
  them. Labels are catalogue keys and `t()` runs during render; a label held in a module-level constant, evaluated once
  at import, is out of reach of any language switch.
* **Navigation:** Avatar in top bar.
