# M17 — Settings & Notifications

* **E2E-M17-01** `server` (FR-6.2) — **implemented**, in `e2e/server/multi-user.spec.ts`. Of the five kinds
  (delegation, mention, task, `lock_taken` with FR-5.7, `note` with FR-7.9) this case drives delegation and mention. Bob
  turns *Delegations* off in his own M17, the choice survives his reload, and Alice's next hand-over produces no toast
  on his screen — while the same
  pair of pages produced one before he touched it, and a **mention** afterwards still arrives. The two positives are
  what make the absence assertable: a toast that has not come yet looks exactly like one that never will, and the
  mention rides the same connection the suppressed delegation would have. It also proves the switch is *per kind* rather
  than a mute. The ends are unit-covered — Go's `TestNotificationPrefs_DisabledKindSuppressesCreation` for the rule,
  `composables/__tests__/settings.spec.ts` for the PUT — and this case is what says the switch the user flips is the
  value the server reads.
* **E2E-M17-02** ~~`server` (NFR-4.6): "Push on this device" registers via the Push API/VAPID (permission mocked);
  support detection hides it where unsupported.~~ — **retired as an e2e case, and covered where it can be.** The browser
  dance is unit-owned end to end in `notifications/__tests__/push.spec.ts`: the VAPID key is fetched and the
  subscription registered, an existing subscription is reused rather than resubscribed, a denied permission
  returns false, an unsupported browser returns false, and the unregister drops it on both sides. The half a rendered
  case would add is *„hides it where unsupported"*, and that branch cannot be produced in either browser the suite runs:
  Chromium and WebKit both carry `PushManager`, so `pushAvailable` is true in every project that exists. The control is
  disabled rather than hidden, and asserting `disabled` on an Ionic toggle is the E2E-M17-05b trap — a bound boolean
  reflects onto no DOM attribute — so the case would be green against the branch being gone. The **round-trip** — the
  subscription the browser dance produces actually reaching the instance — is E2E-NFR-06's. M17-02 stays retired; the
  clause it was retired *for* is
  unreachable.
* **E2E-M17-03** `server` (NFR-4.5) — **implemented**, in `e2e/server/data-export.spec.ts`. `server` rather than `all`,
  for two reasons: in Local Mode this is a
  **different section** — per-trip and per-template YAML written client-side, because there is no server to ask — and in
  `single` there is no token, so the auth header the promise is about is never sent. Both files are read back rather
  than counted: the JSON is parsed and asked for the trip, the CSV for the row. An export is one half of a pair, and the
  half that matters is the one that has to be readable when it is the only copy left.
* **E2E-M17-04** `single` (FR-17.13) — **implemented**, in `e2e/single/settings-profile.spec.ts`: editable
  display name against a real jitpackd. The untouched field shows no rule note whatever name the server handed out;
  emptying it is the first touch and the note appears; a name with a space and a diacritic — which a
  `[A-Za-z0-9._-]` rule would refuse — saves and survives a reload, proving the server accepts it too.
* **E2E-M17-12** `single` (FR-17.13) — **implemented**, in `e2e/single/settings-profile.spec.ts`: the picked
  file opens the crop stage, the stage covers it, the slider scales it, and *Use photo* writes a 256×256 JPEG that the
  profile row then shows where initials were. The size is read back off the endpoint that serves it rather than trusted
  from the canvas call. `setInputFiles` fills a hidden `<input type=file>` with no browser dialog involved; the modal
  carries four ids because a class name is not a seam; and the settled signal is the uploaded picture appearing on the
  row, so nothing here waits on a timeout. The dashboard greeting is not asserted: it is a time-of-day line carrying
  neither a name nor a picture (UI-Spec M17). `server` is not claimed: the branch that project owns is whether the
  control is *offered* to an OIDC account, which is E2E-M17-05; the crop itself is the same component in both. It
  red-proves the
  crop-stage fix — see the log.
* **E2E-M17-05/05b** `server` (FR-17.13) — **implemented**, in `e2e/server/settings-profile.spec.ts`. The profile
  splits: **E2E-M17-05** asserts the picture control
  is offered to an OIDC account — a branch only a project with a real login can reach; **E2E-M17-05b** asserts the
  other half, that the name is the provider's. The name half asserts the *absence
  of the save button* rather than a `readonly` attribute: Ionic reflects a bound boolean onto no DOM attribute, so
  asserting the attribute would pass against an editable field too.
* **E2E-M17-13** `server` (FR-23.7) — **implemented**, in `e2e/server/api-token.spec.ts`: a token created in
  M17 is read out of the reveal and then sent as `Authorization: Bearer` against `/api/v1/me`, which answers with
  **Alice's own display name**. It is the only case in the suite that sends that header, and the only project that could
  carry it — `local` has no server and `single` bypasses authentication, so neither can tell a working credential from
  an ignored one. Two negative halves keep the 200 honest: the same request with **no** header, and one with the last
  character of the token changed, both 401. The token is read from the rendered value rather than from the clipboard on
  purpose — `navigator.clipboard` needs a permission grant under Playwright, and asserting on it would make the case
  about the browser instead of about the promise, which is that the value is shown *to the person*.
* **E2E-M17-13b** `server` (FR-23.7): closing the reveal removes the value from the screen. "Shown exactly once" is a
  promise about the second look, so it needs a case that takes one.
* **E2E-M17-14** `single` (FR-19.8, ADR-045): the whole move on one device. A Local Mode device with a trip that has
  rows opens M17, finds the card, takes the backup from step 1 (the download is captured and kept as the file), confirms
  step 2 with the Single-User instance's URL, and comes back up in Server Mode with **M19 not shown** and the migration
  bar on screen; *Wiederherstellen* opens M18, the captured file goes into the restore branch, the commit lands, the bar
  is **gone** and stays gone across a reload, and the trip **with its rows** is read back from the server through the
  API — the third-device assertion FLOW-07 established, taken here from the server itself. `single` because `local` has
  nothing to switch to and `server` would put a login between step 2 and step 3, which is E2E-M19-02's clause, not this
  one's.
* **E2E-M17-14b** `local` (FR-19.8): the guard. On a device with a write newer than its last backup the switch is
  **disabled and says why**; the card's own backup enables it; one more write (a quick-add on any trip) disables it
  again. Both directions are asserted, because a guard that only ever enables is a delay, not a rule. Its URL field is
  M19's, a value in a box (UX-21). The card's absence
  in Server Mode is unit-owned (G-8, the `SettingsApiTokens.spec.ts` shape), since `local` cannot render a Server Mode
  M17.
* **E2E-M17-14c** `single` (FR-19.8): *Überspringen* is its own outcome. After the switch, the bar's skip asks once, and
  confirming clears the flag: the bar is gone, it does not return on reload, and **nothing was restored** — the server
  has no trip, asserted through the API, which is the positive signal for the absence. Without this the skip could be
  wired to the restore action and every other assertion would stay green.
* **E2E-M17-15** `single` (FR-19.9) — **implemented**, in `e2e/single/connection-repair.spec.ts`: the
  Connection block names the instance, offers **no** logout where there is no session to end (the reset beside it is the
  positive signal that the block rendered), and its reset — confirmed once — reloads the device onto **M19**. That last
  assertion is the whole case: M19 renders only while no mode is stored, so a screen nobody could reach for the life of
  a device is reachable again, which is what makes a stale mode or a stale server URL repairable at all.
* **E2E-M17-16** `server` (FR-19.9) — **implemented**, in `e2e/server/logout.spec.ts`: an OIDC session is
  ended from M17 and the device lands on the login — and is **still** there after a reload, which is what separates
  tokens dropped from the device from a page that merely navigated. `local` has no server and `single` has no session,
  so this is the only project that can carry it.
* **E2E-M17-17** `single` (FR-23.8, ADR-062) — **implemented**, in `e2e/single/instance-update.spec.ts`:
  an instance nobody asked to check says nothing about releases. `single` rather than `local`, because the **default**
  is what is under test and only a real backend holds it — this project's jitpackd runs without
  `JITPACK_UPDATE_CHECK`, so the endpoint answers `off`. The version line is asserted visible first, as the positive
  signal: without it the three absences below would also pass on a screen that never rendered. The other three states
  need an upstream feed that answers on demand, which no project has; they are covered against the component in
  `views/settings/__tests__/SettingsUpdateCheck.spec.ts` — including the Local Mode case, where the assertion is that
  **no request is made**, read off the recorded fetch calls — and against the endpoint in `internal/api/update_test.go`.
* **E2E-M17-18** `server` (FR-2.5a) — **implemented**, in `e2e/server/multi-user.spec.ts`: an account picked
  from the instance's users as a default traveller comes back in M3's step 2 as that account — the row carries the
  account's name and the role selector a member has. The pick and the wizard share one browser context, because the
  setting is device-local. Bob signs in first: the directory lists only accounts that have, so without him the picker
  would offer nobody and the case would fail on its setup, not on the feature.
* **Not covered here, and deliberately:** that the block is **absent** in Single-User and Local Mode. Neither project
  can render it — `single` has no session and `local` no server — so the two absence cases live in
  `views/settings/__tests__/SettingsApiTokens.spec.ts`, mutation-proved against the removed gate, because a surface that
  must not appear is exactly the kind that ships appearing.
* **E2E-M17-06** `local` (G-11/FR-21.3) — **implemented**, in `e2e/settings.spec.ts`: the Appearance toggle
  switches the flavour, and Tag survives a reload. It exists because **every other theme assertion in the suite seeds
  `jitpack_theme` into `localStorage`** — `colour-anchors`, `surfaces` and `visual` all prove the *palette* and none of
  them the switch. The last click is what proves the reloaded control came back *on*: against a toggle rendering
  stale-off it would turn Tag on a second time and the assertion would fail.
* **E2E-M17-07/07b** `local` (NFR-4.11) — **implemented**, in `e2e/settings.spec.ts`. The clause is **not** *cleared
  after a YAML download*: NFR-4.11 says in as many words that the export the reminder is about is the *whole device* in
  one file —
  the G-2 sheet's one-tap backup (ADR-015). M17's two YAML downloads are a single trip and a single template, and
  stamping the key from them would silence the warning about everything the file does not contain. The case asserts
  that one trip downloads and the warning stays; the device backup clears it. **E2E-M17-07b** covers the age: a stamp
  forty days old is read back and worded, plural included, off a seeded value rather than a mocked clock, because the
  decision itself
  (`reminderState`) is pure and unit-owned. The banner refreshes on entering the screen, because the backup is taken in
  another component.
* **E2E-M17-08** `local` (G-8/FR-17.3) — **implemented**, in `e2e/settings.spec.ts`: a device with no session
  carries no notification section at all, asserted against the sections that *are* there so a screen that failed to
  render cannot satisfy the absence. `local` alone rather than `single/local`: the gate is `mode === 'server' &&
  tokens`, and both halves of that are false in either, so one of them says it.
* **E2E-M17-09** `server` (FR-23.1): Administration row visible only for an instance admin with an OIDC session.
* **E2E-M17-10** `all` (NFR-4.12): the Language row switches the app to German and back — the chrome as well as the
  screen. Asserted on the four anchors in **both** presentations (tab bar and desktop rail — one list, two widths), the
  header bar's route title and M2's own segment labels, because those three must be catalogue keys rather than *stored
  English text* (a nav anchor's `name`, a route's `meta.title`), which no language choice could reach. It
  asserts the English words first, so „the German word is there“ cannot pass on a build that rendered neither, and
  re-asserts after a reload (device-local, FR-21.3's pattern).
* **E2E-M17-11** `all` (NFR-4.12): **M17 itself** follows the switch — profile, appearance, data, conflict log and
  about, each asserted in English first so the German cannot pass vacuously. It is the screen the language setting
  *lives on*, which is where a half-translated section is most visible: the user changes the setting and half the page
  ignores them. **Not covered here, and deliberately:** the notification section exists only on a multi-user instance
  (`server` mode *and* a session), which neither Playwright project reaches — `local` has no server, `single` has no
  tokens. It is covered by `views/settings/__tests__/SettingsPage.spec.ts`, which mounts the screen with a session and
  asserts the row labels in both languages. A module-level constant holding its labels would escape the switch,
  so that half needs the test most.
