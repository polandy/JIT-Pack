# M28 — Ideen (A Trip's Ideas, §3.29) — *built*

* **What it is:** the planner's board — what the travellers might do on the trip, discussed, voted on and decided by
  hand (Addendum §3.29, ADR-078). Reasoning and the navigation variants, B chosen: `dev-docs/planner-concept.md`,
  `UI_Concept_PlannerNav_variants.html` (`node dev-docs/build-planner-nav-variants.mjs`). The screen is the planner
  module's (`client/src/planner/`, FR-29.9).
* **Where it lives:** the first pill of the G-9 switcher, before *Packliste*, glyph `bulbOutline` (`/trips/:id/ideas`,
  `meta.tripView: 'ideas'`). Its badge counts the ideas in *Ideen* — nobody has decided on them yet — grey. Back is M4.
* **The board:** four segments, each with its count — *Ideen · Shortlist · Gemacht · Verworfen* (`m28-segment-<state>`,
  the count `m28-count-<state>`), *Ideen* first. Under them a chip row (`m28-chips`), drawn only where the segment
  carries a tag or a rain-proof idea: *Alle*, a chip per tag the segment carries in the set's order (*Wandern · Baden ·
  Kultur · Essen · Ausflug*, `m28-chip-tag-<key>`), and ☂ (`m28-chip-rain`, named *„Geht auch bei Regen"*); a tag and ☂
  combine by *and*, *Alle* clears both, and a chip left chosen from another segment is not in force. Then the segment's
  ideas as rows of one card (`m28-list`, a row `idea-card-<id>`): the cover picture as a flat 21:9 banner where the idea
  has pictures (`idea-card-cover-<id>`), with *„3 Bilder"* over its corner where there is more than one
  (`idea-card-pictures-<id>`) — and where it has none but a track (FR-29.17), the first track's line on the sunken
  surface in its place (`idea-card-trace-<id>`); the title in the heading weight; the tag, *☂ auch bei Regen*, the
  link's site (*segantini-museum.ch*) and the first track's distance and ascent with its kind's glyph and *„+1"* for
  each further track (*„🥾 7,4 km · ↑ 520 m · +1"*, `idea-card-track-<id>`) as chips; a foot with 👍 and 👎, each with its
  count and its voters' avatars, and 💬 with the discussion's size where there is one. **Order:** by votes (👍 minus 👎),
  the newest first among equals, or newest first — the bar's ⋮ offers the other (*„Neueste zuerst"* / *„Nach Stimmen
  sortieren"*), and only where votes are shown; a new idea switches the board to *Ideen*, newest first, with the chips
  cleared. **Empty,** each segment says what belongs in it (`m28-empty-<state>`): *„Noch keine Ideen für diese Reise."*
  with *„Ein Link, ein Ort, ein Gedanke – mit ＋ notierst du, was ihr machen könntet."*, *„Noch nichts auf der Shortlist.
  Was ihr vorhabt, kommt hierher."*, *„Noch nichts gemacht."*, *„Nichts verworfen."*; chips that match nothing say
  *„Keine Idee passt zu dieser Auswahl."* (`m28-empty-filtered`). **Before the trip partition has arrived** the counts
  and the list are not drawn (ADR-033).
* **Writing an idea** (the FAB ＋, `m28-fab`, `FAB_ANCHOR.m28`; *Bearbeiten* in the detail): the sheet *„Neue Idee"* /
  *„Idee bearbeiten"* (`idea-edit`) — the title (*„Was könnten wir machen?"*), *Link (optional)*, *Notiz (optional)*,
  the five tags as chips (one or none), and *☂ Geht auch bei Regen*. A link that is not a web link says *„Das ist kein
  Web-Link – nur http:// oder https://."* (`idea-edit-link-invalid`) and keeps *Hinzufügen* off, as a blank title does;
  a bare address is kept as `https://…`. **A link read (FR-29.16):** a web link brings a suggestion shown at each field,
  changing nothing until confirmed there: the suggested title grey as the blank title field's placeholder, the suggested
  description as the blank note's, each with *Übernehmen* in the field's end slot (`idea-edit-name-accept`,
  `idea-edit-note-accept`) that fills that field alone; over a field holding text, a line under it, *„Vorschlag: …"*
  (`idea-edit-name-suggestion`, `idea-edit-note-suggestion`), with the same *Übernehmen*. At once the title suggestion
  is the link's site (*oeschinensee.ch*), where the title is blank — so a pasted link is one tap from *Hinzufügen*.
  Where a read can be had — never in Local Mode or on an instance with previews off, where the sheet stays
  `data-preview="idle"` — once the link has rested 0.6 s the sheet reads its page, *„Link wird gelesen …"* with dots
  under the field (`idea-edit-preview-loading`, `data-preview` going `loading` → `done`), and the page's own title and
  description replace the suggestion. The page's picture is fetched in the background: under the link a small tile with
  dots and *„Bild aus dem Link wird geladen …"*, then its thumbnail with *„Bild aus dem Link wird hinzugefügt"*
  (`idea-edit-link-picture`, `data-coming`), neither where the idea has pictures already. After the save the idea's card
  carries a sunken 21:9 banner with dots and *„Bild wird geladen …"* (`idea-card-picture-coming-<id>`), and its detail
  the same in the mosaic's place (`idea-detail-picture-coming`), until the picture is there — added only where the idea
  has none by then. *Hinzufügen* writes it and toasts *„„…" steht bei den Ideen"*; an edit writes only the fields that
  changed.
* **One idea** opens on the route (`?idea=<id>`, `overlayQuery`) — a sheet on a phone (`m28-idea-modal`), the frame's
  side panel on a desktop width ≥ 900 px (`m28-idea-panel`, G-9). The query is **pushed**, so the browser's back closes
  it on the same page and ✕ takes that step back. The detail (`idea-detail`): the title, with the author and when (*„Sia
  · heute 14:32"*; the time alone where authors are not shown), the tag and ☂ beside them; **the pictures** (FR-29.5) as
  a mosaic (`idea-mosaic`) — one fills the width at 16:10, two share it 2 : 1, three and more stand as the cover large
  on the left and two stacked beside it, the third tile dimmed with *„noch 1"* over it (`idea-mosaic-more`) — and under
  it *📷 Bild hinzufügen* with *„2 von 4"* (`idea-picture-add`, `idea-picture-count`; gone at four), *„Wird hochgeladen
  …"* while one goes up, and a failed upload toasts *„Das Bild ließ sich nicht hochladen. Bist du online?"*. A tile
  opens **the viewer** (`idea-viewer`), full screen on the crust surface: *„Bild 2 von 4"* and *Titelbild* on the cover
  at the top, ✕, the picture whole, ‹ › at the sides (and a swipe, and the arrow keys), and at the foot *☆ Als
  Titelbild* (not on the cover; the viewer stays on the picture, now first) and *Bild entfernen* — a destructive
  confirmation (`idea-picture-remove-confirm`) *„Das Bild verschwindet für alle, die an der Reise teilnehmen."*. **The
  tracks** (FR-29.17, ADR-085): beside *Bild hinzufügen* stands *GPX hinzufügen* with *„2 von 5"* (`idea-track-add`,
  `idea-track-count`; gone at five), which opens the device's file picker for `.gpx`; *„Wird gelesen …"* while the file
  is read and sent, and a file that is no track (*„In dieser Datei ist kein Track."*), too large (*„Die Datei ist
  grösser als 5 MB."*) or not sent (*„Der Track ließ sich nicht hochladen. Bist du online?"*) toasts and keeps nothing.
  A new track is chosen. Beside it *Route zeichnen* (`idea-track-draw`) opens the route editor empty (below; off without
  a map). Under the buttons the **track card** (`track-card`, the kernel's `components/global/TrackCard.vue`): a row of
  chips, one per track with its kind's glyph and colour and its name (`track-tab-<id>`, `aria-pressed` on the chosen
  one) — a single track's chip is its name; a map 16 : 7 (`track-map`, `data-tiles` `on`/`off`/`offline`, `data-source`
  `swisstopo`/`osm`) carrying every track of the idea, the chosen one in full colour with a start and an end dot and
  arrows along it that show its direction, the others paler, and the map's source named in its corner (*Landeskarte* or
  *OSM*), the tiles' attribution in the other, and in the top corner the glyph that says the map opens
  (`track-map-open`, the whole map being that button); **without tiles** the lines alone on the sunken surface with a
  faint grid, with *„Karte offline"* in the corner where the device is offline. A tap on the map opens **the full-screen
  map** (`track-viewer`): the idea's title, *Bearbeiten* (`track-viewer-edit`, off without a map) and ✕ at the top,
  the map panning and zooming by touch, a tap on a line choosing its track, a switch *Landeskarte · OSM*
  (`track-source-swisstopo`, `track-source-osm`; *Landeskarte* off where a track lies outside Switzerland), a button
  that fits the chosen track again (`track-fit`), the tiles' attribution, and at its foot the same chips and figures
  as the card. **Where people are (FR-29.19):** under the fit button a 📍 (`track-locate`, *„Meinen Standort zeigen"*,
  pressed while the device's position is followed) asks the browser for the device's position — never on its own —
  draws it as a dot in glacier with its accuracy as a faint circle (`jp-me`), and moves the map to it; refused, a line
  over the map's foot says *„Standort nicht freigegeben – in den Einstellungen des Browsers erlauben."*
  (`track-locate-note`), and without a position at all — no HTTPS — *„Dieses Gerät kann seinen Standort hier nicht
  zeigen."*. Where somebody else is on the trip (G-8: not in Local or Single-User Mode), a row of two switches stands
  between the map and its foot (`track-people`): *Meinen Standort teilen* (`track-share`, off by default) and
  *Mitreisende zeigen* (`track-show-others`, on by default), each kept on the device. Every other traveller who shares
  is a round heather mark with their initials (`map-mark-person`), saying when asked *„Sia · vor 2 min"* or *„Sia ·
  gerade eben"*; a mark quiet for 5 minutes is gone. Without tiles the marks are dots on the lines alone, where they
  fall inside the frame. Under the map the **four figures** of the chosen track — *Distanz*, *Aufstieg*, *Abstieg*,
  *Höchster Punkt* (`track-distance`, `track-ascent`, `track-descent`, `track-highest`; *–* without heights) — and the
  **time**: *Wandern · Velo* as one segmented control (`track-kind-hike`, `track-kind-bike`) and the chip *Mit Kind*
  (`track-kid`, pressed where set), over the sum *„3 h 25 Gehzeit + 1 h 00 Pausen = 4 h 25 Unterwegs"* — *Fahrzeit*
  for a bike tour — whose pauses are a − / + stepper in quarter hours (`track-pause-less`, `track-pause-more`,
  `track-pause`; − off at 0, + off at 8 h), with *Unterwegs* in the action colour (`track-total`). Under it, small,
  what the time assumes: *„Formel der Schweizer Wanderwege"*, or the paces where *Mit Kind* or *Velo* is chosen. Each
  change is written at once. At the card's foot the file's name and its number of points, and ⋮ (`track-more`)
  offering *Route bearbeiten* (`track-edit`, off without a map), *Umbenennen* (`track-rename`, a field in an alert,
  `track-rename-prompt`), *GPX herunterladen* (`track-download`), *Durch andere Datei ersetzen* (`track-replace`;
  name, kind, *Mit Kind* and pauses stay) and *Track entfernen* — a destructive confirmation (`track-remove-confirm`)
  *„Der Track verschwindet für alle, die an der Reise teilnehmen."*. **The route editor** (`route-editor`, FR-29.20,
  ADR-088, the kernel's `TrackEditor.vue`), full screen on the crust surface: ✕ (`route-cancel`; with changes it asks
  first, `route-discard-confirm`, *„Änderungen verwerfen?"*), *Route bearbeiten* or *Neue Route* over the track's
  name, and *Fertig* (`route-done`; off until something changed, and *„Rechnet …"* while a stretch is fetched). The
  map (`route-map`, `data-handles`, `data-settled`) fills the rest: *Landeskarte · OSM* top left; down the right edge
  *Rückgängig*, *Wiederholen*, *Zurück zum Start*, *Richtung umkehren* and *Ganze Route* (`route-undo`, `route-redo`,
  `route-loop`, `route-reverse`, `route-fit`); bottom left *Wegen folgen · Luftlinie* (`route-follow-paths`,
  `route-follow-line`; absent where routing is off). The handles are white dots ringed in the track's colour
  (`route-handle-<n>`), the start green and the end red; the legs are the track's colour, a changed one alpenrose
  (heather on an alpenrose track) over the file's line dotted, a leg being fetched dashed, arrows along all of it, and
  the idea's other tracks faint underneath. A tap on a handle rings it and raises a card (`route-point`): *„Punkt 4 ·
  bei 3,2 km"* (*Startpunkt*, *Endpunkt*) with *Hier starten*, *Hier enden* and *Punkt löschen* (`route-start-here`,
  `route-end-here`, `route-remove-point`). A tap on the line where the route runs more than once raises *„Auf welchem
  Durchgang?"* (`route-passes`): one row per pass (`route-pass-<n>`) with its number, *Hinweg*/*Rückweg* (or *„3.
  Durchgang"*), *„bei 1,7 km"* and an arrow turned the way it runs, while the map highlights each pass's next stretch
  with its number. At the foot the four figures *Distanz*, *Aufstieg*, *Abstieg* and *Gehzeit*/*Fahrzeit*
  (`route-distance`, `route-ascent`, `route-descent`, `route-moving`); where a stretch changed, the legend
  *Unverändert · Geändert · Ursprünglich* (`route-legend`); for an edit *„Vorher 7,4 km · 3 h 25"* with the difference
  in pine or ember (`route-before`, `route-delta`), for a new route *Wandern · Velo* (`route-kind-hike`,
  `route-kind-bike`); the height profile (`route-profile`), its changed stretches coloured and a mark per handle, a
  finger on it naming distance and height (`route-profile-reading`) and showing the place on the map; and a line with
  the hint (`route-hint`: *„Tippe auf den Startpunkt."*, then *„Tippe aufs Ziel – die Route folgt den Wegen."*, then
  *„Tippen verlängert · Punkte lassen sich ziehen"*) and the sources (*„Wege: BRouter · © OpenStreetMap"*, *„Höhen:
  swisstopo"*, or *„Routing ist auf dieser Instanz aus – nur Luftlinie"*). A stretch with no path toasts *„Hier fand
  sich kein Weg – gerade Linie"* at the top. *Fertig* raises a sheet (`route-save`): *Route speichern*, the figures,
  the name (`route-save-name`, *„… (Variante)"* or *Wanderung*/*Velotour*), *Als neuen Track* (`route-save-new`,
  *„Track speichern"* for a new route; off at five tracks, saying so), *„„…" ersetzen"* (`route-save-replace`, edits
  only) and *Weiter bearbeiten*. A replacement toasts *„„…" ersetzt"* with *Rückgängig*; a new track is chosen on the
  card. Where the track's file cannot be read back, *„Der Track ließ sich nicht laden. Bist du online?"*. The link as
  a card that opens the site in a new tab (`noopener noreferrer`); the note; **the four states as one segmented
  control** (`idea-state-<state>`) — a tap moves the idea and toasts *„„…": Shortlist"* with *Rückgängig*, which moves
  it back unless somebody has moved it since; **the votes** — 👍 and 👎 as buttons with their counts and the voters'
  avatars (`idea-vote-up`/`-down`, pressed where the vote is mine; a second tap withdraws it) and *„Andy, Sia dafür"*;
  the **discussion** (*Kommentare* with its count), oldest first, each entry with its avatar, words, and who and when,
  and a field at the foot (*„Kommentar schreiben…"*) with a send button; a tap on one of my entries offers
  *Bearbeiten* — its words edited in place, *Speichern* / *Abbrechen*, and the entry marked *bearbeitet* after — and
  *Kommentar löschen*. At the foot *Bearbeiten* and *Idee löschen* — a destructive confirmation
  (`idea-remove-confirm`) *„„…" löschen?"* / *„Die Idee verschwindet mit ihren Stimmen, Kommentaren, Bildern und
  Tracks für alle. Verwerfen behält sie."*.
* **Who is shown (FR-29.3, G-8):** votes, the vote order and author names appear only where somebody else reads them —
  an identity and another account on the trip, M26's rule for its share hint. In Local and Single-User Mode, and on a
  trip nobody shares, the board is a list of one's own plans: no vote buttons or tallies, no ⋮, no names.
* **Modes:** all three; votes only where there is another account. A picture is uploaded at once in Server and
  Single-User Mode and kept on the device in Local Mode (ADR-081), and so is a track (ADR-085). The tiles are on
  in Local Mode and wherever the operator left `JITPACK_MAP_TILES` on; the router likewise, under `JITPACK_ROUTING`
  (ADR-088).
* **Notifications (FR-29.8):** a new idea (*„Alice hat „Tiscali" vorgeschlagen"*) and a move to the Shortlist
  (*„Alice hat „Tiscali" auf die Shortlist gesetzt"*) tell every co-traveller but the actor; a comment
  (*„Bob zu „Tiscali": Nur mit Guide"*) tells the idea's author and its earlier commenters. Votes tell nobody. A tap
  opens the idea over the board (`?idea=`). M17 carries three switches, *Neue Ideen*, *Kommentare zu Ideen* and
  *Ideen auf der Shortlist*, hidden in Single-User Mode with every other second-party row.
* **A day (FR-29.14):** on the Shortlist, while the trip has both dates, the card says its day and the detail sets it —
  M29's way in from the board (see M29).
* **Not built yet** (§3.29): *Daraus gemacht* — an excursion, task or shopping entry made from an idea (FR-29.13).
* (E2E-M28-01…05, E2E-M28-07, E2E-M28-10, E2E-M28-12 `local`, E2E-M28-06, E2E-M28-08, E2E-M28-09, E2E-M28-11,
  E2E-M28-13 `server`,
  E2E-G12-07)
