# M28 — Ideen (a trip's ideas, §3.29)

* **E2E-M28-01** `local` (FR-29.1/29.6/29.7/29.10/29.12) — **implemented** (`planner/ideas.spec.ts`): the empty board
  says what belongs on it. A link that is not a web link shows its message and keeps *Add* off. An idea written with a
  bare address, a tag and the rain mark shows all three on its card — the address as its site — counts in *Ideas* and on
  the switcher's pill, and its detail's link is `https://…` in a new tab with `noopener noreferrer`.
* **E2E-M28-02** `local` (FR-29.2/29.6) — **implemented** (`planner/ideas.spec.ts`): the detail stands on `?idea=`; a
  state set in it moves the idea between the segments, both counts follow, the snackbar's undo moves it back; the
  browser's back closes the detail and leaves the board.
* **E2E-M28-03** `local` (FR-29.4/29.1) — **implemented** (`planner/ideas.spec.ts`): a word written in the detail is
  counted on the card, edited in place through its menu and marked *edited*, and taken back through its menu; *Edit*
  opens the sheet filled with the idea and the card shows the new title.
* **E2E-M28-04** `local` (FR-29.10/29.12) — **implemented** (`planner/ideas.spec.ts`): the chips offer only the
  segment's tags, in the set's order; a tag narrows the board to its ideas, ☂ to the rain-proof ones, *All* shows the
  segment whole.
* **E2E-M28-05** `local` (FR-29.2/29.3 G-8) — **implemented** (`planner/ideas.spec.ts`): deleting asks first — declined,
  the idea stays; confirmed, it is gone and the empty state is back. Alone on the device the detail offers no votes and
  names no author, and the card carries no tallies.
* **E2E-M28-06** `server` (FR-29.3, FR-29.6) — **implemented** (`planner/server/votes.spec.ts`): Bob sees Alice named as
  the idea's author and votes for it; Alice sees his vote on the card and his name behind it in the detail, her own
  button unpressed, and her ⋮ offers *Newest first*; Bob's second tap withdraws it and Alice's count is back to nothing.
  That nobody votes in another's name is the server's (`TestStampActor_VoteUpsertCannotTakeOverAnotherUsersVote_FR29_3`,
  `TestApplyMutation_OnlyTheVoterMayChangeAVote_FR29_3`).
* **E2E-M28-07** `local` (FR-29.5) — **implemented** (`planner/ideas.spec.ts`): a first picture becomes the card's
  banner and fills the mosaic (*1 of 4*); a second shares it and the card says *2 pictures*. The viewer opens on the
  cover, pages to the second and makes it the cover — the viewer goes with it, the mosaic and the banner follow.
  Removing asks first — declined, both stay; confirmed, one is left. After a reload the banner still shows it. Every
  picture is asserted by its `naturalWidth`, since the two sources differ in shape.
* **E2E-M28-08** `server` (FR-29.5, ADR-081) — **implemented** (`planner/server/pictures.spec.ts`): a picture Alice adds
  is on Bob's card as its banner and in his mosaic — the bytes fetched with his own session. That a stranger can
  neither add nor read one is the server's (`TestIdeaImage_AStrangerNeitherUploadsNorReads_FR29_5`).
* **E2E-M28-10** `local` (FR-29.16) — **implemented** (`planner/ideas.spec.ts`): a link pasted into a new idea suggests
  its site grey in the blank title field — which stays blank and *Add* off until *Use it* beside it — and the idea is
  saved under the site's name; Local Mode has no preview, so the sheet stays `idle` and shows no read starting.
* **E2E-M28-09** `server` (FR-29.16, ADR-082) — **implemented** (`planner/server/link-preview.spec.ts`): a link pasted
  into a new idea's sheet is read and its page's title and description are suggested grey in the blank title and note,
  which stay blank and *Add* off until each field's *Use it* fills that field alone. The picture, held back, shows
  itself coming in the sheet; the idea is saved, its card shows the picture coming, and the picture reaches the card
  once released. Over a typed title the suggestion is a line under the field — *Suggested: …* — that changes nothing
  left alone, and the picture still comes. That a link's picture never replaces one the idea has, and that a failed one
  is quiet, is `planner/__tests__/sync.spec.ts`; the routes' answers are planted, since a test page would be on
  loopback, which the server's fence refuses — the fetch and the fence are `internal/linkpreview`'s (`TestFetch_*`,
  `TestFetchImage_*`, `TestPublicOnly_FR29_16`).
* **E2E-M28-11** `server` (FR-29.8) — **implemented** (`planner/server/notifications.spec.ts`): an idea Alice puts up
  tells Bob, whose notice opens it; Bob's comment tells Alice, the idea's author, who is never told of her own idea;
  Alice's move to the Shortlist tells Bob. Each sentence is asserted whole. Who each kind reaches — the participants
  for a comment, nobody for a vote, another state or an edit — is
  `TestPlanNotifications_Ideas_FR29_8`'s; the three over HTTP are
  `TestNotifications_Ideas_NewCommentedAndShortlisted_FR29_8`'s.
* **E2E-M28-12** `local` (FR-29.17) — **implemented** (`planner/tracks.spec.ts`): a GPX file of 3.3 km and 300 m of
  climb becomes a track named after the file's own track — its four figures, *1 h 25* hiked by the Swiss formula, a
  child's pace (*2 h 05*), a quarter hour of breaks added (*2 h 20*) and the same by bike (*1 h 10*), each asserted as
  the card shows it. The board's card shows the line and *3.3 km · ↑ 300 m*; after a reload every setting is there.
  The paces themselves are `domain/__tests__/track.spec.ts`.
* **E2E-M28-13** `server` (FR-29.17, ADR-085) — **implemented** (`planner/server/tracks.spec.ts`): a track Alice adds
  is on Bob's card and in his detail with its figures, read from the row; ⋮ hands Bob the file byte for byte under its
  name, with his own session. On an instance answering `map_tiles: false` his map is the lines alone (`data-tiles`
  `off`, no *Map offline*) and asks no tile server. That a stranger can neither add nor download one is the server's
  (`TestIdeaTrack_AStrangerNeitherUploadsNorDownloads_FR29_17`); the switch itself is
  `TestLoadConfig_MapTiles_FR29_17` and `TestInstanceConfig_MapTilesOnUnlessTurnedOff_FR29_17`.
* **E2E-M28-14** `local` (FR-29.17) — **implemented** (`planner/tracks.spec.ts`): a Swiss track draws Landeskarte
  tiles; a second one in Tuscany — a bike tour by its `<type>`, without heights — is chosen at once and puts the map on
  OpenStreetMap. The full-screen map opens on OSM with the Landeskarte off, and its chips choose for the card too.
  Without the Italian track the map is the Landeskarte again, and the full-screen switch draws OSM tiles in its place.
  Offline the map is the lines alone with *Map offline*, and online again it draws tiles. Every tile is answered on the
  device; a drawn tile from a source is the signal, since a cached one makes no request.
* **E2E-M28-15** `local` (FR-29.17) — **implemented** (`planner/tracks.spec.ts`): a file with waypoints only is refused
  with *There is no track in this file.* and nothing kept. A track is renamed through ⋮ (its chip says so), downloaded
  byte for byte under its file name, and replaced through the file chooser by a shorter climb — new figures and file,
  the name and the breaks kept. Removing asks first: declined, it stays; confirmed, the card, the count and the
  board's line are gone.
* **E2E-M28-16** `local` (FR-29.19) — **implemented** (`planner/location.spec.ts`): alone on the device the full-screen
  map offers no sharing. Refused by the browser, the 📍 says *Location not allowed* and draws nothing; allowed — after
  a reload, as a person granting it does — it draws the device's own mark and stays pressed.
* **E2E-M28-17** `server` (FR-29.19) — **implemented** (`planner/server/location.spec.ts`): with both switches as they
  start — sharing off, others shown — Bob's map carries no mark while Alice only locates herself. Once she switches
  sharing on, his map carries her mark with her initials and *Alice · …* when asked; his *Show fellow travellers* hides
  it and brings it back; her stop takes it off. It went red with the hub's forwarding removed. That a stranger's
  position is not passed on, the sender's own devices and a refused member are not told, a fix off the Earth or too
  soon is dropped, a late subscriber is given what is shared, and a stop, an unsubscribe or a disconnect end it —
  unless another device still shares — is the server's (`TestLiveLocation_*`,
  `TestWS_ALocationReachesTheTripsOtherMemberAndNoStrangersDoes_FR29_19`); the device's rules — asked only on a tap,
  sent by the interval rule, the watch ended with the last map, both choices kept — are `useLiveLocation.spec.ts` and
  `lib/__tests__/liveLocation.spec.ts`.
* **E2E-M28-18** `local` (FR-29.20, ADR-088) — **implemented** (`planner/routeEdit.spec.ts`): arrows lie on the
  card's map. ⋮ → *Edit route* opens the editor on the file's four points with its figures (*3.3 km*, *↑ 300 m*,
  *Before 3.3 km · 2 h 05* with the child's pace), no legend, *Done* off and arrows on the line; nothing is asked of
  the router. A handle dragged aside asks it for two paths with the hiking profile, both drawn in the changed colour
  over the original's dotted line, with the legend, other figures and a *+* difference. *Done* offers the name
  *Aufstieg zur Alp (variant)*; *As a new track* adds a second chip under it, its file named after it, with the
  original's *With a child* and quarter hour of breaks. Every request is answered on the device.
* **E2E-M28-19** `local` (FR-29.20) — **implemented** (`planner/routeEdit.spec.ts`): on a track walked out and back,
  a tap on the line between the first two handles asks *Which pass?* — *Way out at 0.6 km* and *Way back at 3.x km*.
  Choosing the way back sets point 5 there, selected, and the distance stays. *End here* shortens the route with a
  *−0.x km* difference. *Replace* keeps the track's name and puts the new file under it; the toast's *Undo* puts the
  old file back, figures and name included.
* **E2E-M28-20** `local` (FR-29.20, ADR-088) — **implemented** (`planner/routeEdit.spec.ts`): *Draw route* opens an
  empty editor saying *Tap the starting point.*, *Done* off. As a bike tour, two taps ask the router once with the
  `trekking` profile, the path's *↑ 150 m* and *↓ 50 m* counted. A tap the router finds no path for is drawn straight
  with swisstopo's heights and toasts *No path found here – straight line*; with *Straight line* chosen the next tap
  asks swisstopo too. Undo and redo step back and forth without asking again, and *Back to the start* closes the loop
  and then is off. A pointer on the height profile names distance and height and marks the place on the map, gone again
  when it leaves; *OSM* draws OpenStreetMap's tiles. Leaving asks first and *Cancel* keeps the route. *Done* names it
  *Bike tour* without a replace option, and saving adds a bike tour with heights.
* **E2E-M28-21** `local` (FR-29.20) — **implemented** (`planner/routeEdit.spec.ts`): offline, *Draw route*, ⋮'s
  *Edit route* and the full-screen map's *Edit* are off. Online again, *Edit* closes the full-screen map and opens the
  editor. A reversed route then asks before it is left, and *Discard* keeps the track as it was. The pure rules —
  handles from a file, splits, passes, arrows, LV95, the written GPX — are `domain/__tests__/route.spec.ts`; the
  requests and the history `lib/__tests__/routing.spec.ts` and `routeEditor.spec.ts`; the switch
  `TestLoadConfig_Routing_FR29_20` and `TestInstanceConfig_HandsOnTheRoutingURL_FR29_20`.
* **E2E-M28-22** `local` (FR-29.13) — **implemented** (`planner/bridge.spec.ts`): an undecided idea offers nothing; on
  the Shortlist, planned on the trip's third day, it offers *Ausflug*, *Aufgabe* and *Einkauf*. *Ausflug* opens M27's
  sheet with the title and a day; the excursion's list names the idea, `‹` returns to it, the result chip stands and
  *Ausflug* is no longer offered. *Aufgabe* opens M25's composer with *„Book …"*; the task is written due and naming the
  idea, and *Aufgabe* is still offered after it. *Einkauf* opens M6's composer with the title on *Vor Ort*; the entry
  written names the idea, and its 💡 line opens the idea with three results.
* **E2E-M28-23** `local` (FR-29.13) — **implemented** (`planner/bridge.spec.ts`): a task made from an idea outlives the
  idea's deletion, without its 💡 line. The pure rules are `planner/domain/__tests__/bridge.spec.ts` (what is offered),
  `domain/__tests__/ideaResults.spec.ts` (the due day, the phase), `composables/__tests__/ideaResultSource.spec.ts`; the
  seeds `ShoppingPage.spec.ts` and `TripTasksPage.spec.ts`; the way back `router/__tests__/backTarget.spec.ts`; the
  server `internal/store/ideabridge_test.go`.
