# Changelog

## 0.2.0 (2026-09-12)


### ⚠ BREAKING CHANGES

* `items.category_id` is dropped and `UNIQUE (name, category_id)` becomes `UNIQUE (name)`, so an item's name is now its identity. Migration 022 renames colliding rows rather than deleting them — archived trips reach their master items through `trip_items.source_item_id` — which means an upgraded instance may show item names it did not write, of the form "Adapter (Technik)". The sync push also rejects `category_id` outright, so a client that has not been updated will have its item mutations refused rather than silently ignored.
* multi-user deployments now require JITPACK_SESSION_SECRET and the IdP client registered as confidential (client_secret_basic); externally minted HS256 tokens remain valid only without OIDC configured.
* clients may no longer push templates.is_published — the column is rejected as not syncable. Quantity formulas, the unit column, the consumable flag and the traveler profile type are removed from the schema and the wire format; legacy portable files still import, unknown fields being ignored.

### ci+docs

* publish both images on release, a deploy example, and the operator manual for a multi-user instance ([26fa814](https://github.com/polandy/JIT-Pack/commit/26fa8144144466e9b8997a864106a9e88a547dd3))


### Features

* a packing claim ends by decision, not on a clock (FR-5.7, ADR-028) ([4ce78ba](https://github.com/polandy/JIT-Pack/commit/4ce78bac3e660911664d65b8e77549b3f0405477))
* a purchase records the list it was bought from (FR-25.11j) ([ba26270](https://github.com/polandy/JIT-Pack/commit/ba262705e8af3dbbd66eea19aff671cd638da2df))
* a retired master row has a way back (FR-24.3, ADR-033) ([a9d4a9c](https://github.com/polandy/JIT-Pack/commit/a9d4a9cc6c4b0bb29d6f545446cded5aa6c848af))
* agent-CLI tooling parity (hooks, docs) ([11a9579](https://github.com/polandy/JIT-Pack/commit/11a95791df74548feac1586ebc8b894a63ae9ae4))
* align WS wire protocol with spec §7, add presence facepile (G-10) ([0bba7a0](https://github.com/polandy/JIT-Pack/commit/0bba7a0c86e2952e95d52b815a335af430b88797))
* an item and a template can carry one emoji as its mark (§3.28) ([c27e2a0](https://github.com/polandy/JIT-Pack/commit/c27e2a0dbd107470454c79cb2f2211bfe5be49af))
* **api,client:** the instance names the currency its amounts are in (FR-21.9) ([8f6c190](https://github.com/polandy/JIT-Pack/commit/8f6c1900c3c114efa243d84b1bea20df98e3ded6))
* **api:** a master row has a delete endpoint (FR-24.4, ADR-038) ([3605b18](https://github.com/polandy/JIT-Pack/commit/3605b18911cbae29bb4e128ef160e5c2c1fb0e85))
* **api:** a path is declared once, in the contract (NFR-4.14) ([ea26436](https://github.com/polandy/JIT-Pack/commit/ea26436448a518e0a1ea4914b19fc87bb60bce5e))
* **api:** API tokens, created in the app and on the CLI (FR-23.7, ADR-039) ([e897696](https://github.com/polandy/JIT-Pack/commit/e897696eb3453e089127af9028b56adf5dc05567))
* **api:** every response body is a declared type (NFR-4.14) ([667a0dd](https://github.com/polandy/JIT-Pack/commit/667a0ddf6e46f217fa2078e276e2e8be271fc4d1))
* **api:** in-app notification system (FR-6.2) ([8b5e651](https://github.com/polandy/JIT-Pack/commit/8b5e651034539814bf00e76b3f41d57c77edf1ea))
* **api:** instance user management (Addendum 3.23, FR-23.1-23.4) ([3a9bb1e](https://github.com/polandy/JIT-Pack/commit/3a9bb1eee0e84e4ed131a14cae0e4643f7ce9a0d))
* **api:** NFR-4.5 backup endpoints and GET /me ([1069916](https://github.com/polandy/JIT-Pack/commit/106991663fb88cd2d4d8bc12af574e4da198fd07))
* **api:** notify a linked traveler's account on roster assignment (FR-2.5, ADR-058) ([7cdc193](https://github.com/polandy/JIT-Pack/commit/7cdc1936be684403f584400a59383c5e858032df))
* **api:** one checked contract between client and server (NFR-4.14, ADR-026) ([aa172f8](https://github.com/polandy/JIT-Pack/commit/aa172f8735fab4679e3a404274a2c9aa8a635791))
* **api:** sync trip_members through the master partition (FR-4.5/4.7) ([8840eac](https://github.com/polandy/JIT-Pack/commit/8840eacefdfcaacc35ba0e998d2095451bcb7aa7))
* **api:** Web Push delivery with self-generated VAPID keys (NFR-4.6) ([73a42ce](https://github.com/polandy/JIT-Pack/commit/73a42ce2341c8fadb904de66aeceae04ca785874))
* brand logo + item reference photos (FR-22) ([#14](https://github.com/polandy/JIT-Pack/issues/14)) ([3629546](https://github.com/polandy/JIT-Pack/commit/36295461586c97bbd0f914e3d9c921bdbf6db87c))
* broker first-party sessions from the IdP (ADR-007) ([d4eb150](https://github.com/polandy/JIT-Pack/commit/d4eb1507dbe4a2b2b653682f5303809612f5af8d))
* **cli:** a trip's roster from the shell, and the CLI grows subcommands (FR-18.8, ADR-042) ([3b3894f](https://github.com/polandy/JIT-Pack/commit/3b3894faa4c92f05bdb1ae3af27d6ba098231646))
* **client:** a group change is asked about, not applied to a trip (FR-27.4) ([885e96a](https://github.com/polandy/JIT-Pack/commit/885e96a531af50fc61cc67cbd2d72b753f10aeb5))
* **client:** a merged push says so, instead of passing for an applied one ([f00b9e4](https://github.com/polandy/JIT-Pack/commit/f00b9e45ce32b773c448c58438c6db2f408144e1))
* **client:** a packing claim can be given back, and an expired one says so (G-3) ([efd1d95](https://github.com/polandy/JIT-Pack/commit/efd1d95a9b5ac3f4a9e6a056cfca9bd05807c936))
* **client:** a per-person cluster folds, and starts shut (FR-25.23) ([#442](https://github.com/polandy/JIT-Pack/issues/442)) ([6d5e344](https://github.com/polandy/JIT-Pack/commit/6d5e344a4a8e7e390ac781b02b241ddeb6b4b990))
* **client:** a per-person item is one buy row in M6 (FR-25.6) ([45d77cf](https://github.com/polandy/JIT-Pack/commit/45d77cf31fe6637fa3d699832d50fcc9b5cb20bc))
* **client:** a planning trip follows the groups it was generated from (FR-27.4) ([c4076f5](https://github.com/polandy/JIT-Pack/commit/c4076f57396a806d328d35bebfb2a863f3cad8cd))
* **client:** a row can be handed to somebody (FR-25.19, E2E-FLOW-02) ([30a6c19](https://github.com/polandy/JIT-Pack/commit/30a6c19a1a0935aaa6486496dbce14bbf2925814))
* **client:** a section head names its block, and its count sits beside it (FR-21.11) ([cd5a294](https://github.com/polandy/JIT-Pack/commit/cd5a29445801ffbf71fd4212e476ca728a3b6bc0))
* **client:** a sheet's head is a component, and every sheet leaves the same way (FR-21.12) ([3bd15ba](https://github.com/polandy/JIT-Pack/commit/3bd15bae3dd32bf0ef2815fa5c4bc1258fcf6fae))
* **client:** a taken template or series name is caught before the push (FR-1.6, FR-13.1) ([2ae74d2](https://github.com/polandy/JIT-Pack/commit/2ae74d2b7ad33533f489d39d8bde4e1a49836302))
* **client:** a trip can be edited after it is created (FR-2.7, M22) ([15a001d](https://github.com/polandy/JIT-Pack/commit/15a001de7909a48c3d5994521f0b1318fe92121a))
* **client:** a trip is judged from the list, and once at the end (FR-9.3, FR-9.4) ([1d02f4a](https://github.com/polandy/JIT-Pack/commit/1d02f4a8cfcde48831f6156276daba1458f45817))
* **client:** a trip's year can be corrected, and an archived one says why not ([3dd2e40](https://github.com/polandy/JIT-Pack/commit/3dd2e400130f45e69b58b472c36ea1a620869044))
* **client:** a Vorlage shows its resulting items, and the ＋ answers where it is (FR-27.14, FR-27.6) ([519e364](https://github.com/polandy/JIT-Pack/commit/519e3649730eef3833b680eed8348ab50a6dd4f5))
* **client:** add a whole group to a running trip (FR-27.10) ([15ca127](https://github.com/polandy/JIT-Pack/commit/15ca1272c3d52352d64c0ceca43f573548640cfa))
* **client:** an installable PWA that starts without a network (NFR-4.13) ([c6b9eb4](https://github.com/polandy/JIT-Pack/commit/c6b9eb409a77e1ebd452ebfd09035ddc7c8f15c2))
* **client:** an item can name several people, each with their own amount (FR-25.21) ([6316df3](https://github.com/polandy/JIT-Pack/commit/6316df3f8624ebf42597e43617f36f51a8e9e8c0))
* **client:** assign one or more travelers from the inventory browse-sheet (FR-25.13h) ([7a75a79](https://github.com/polandy/JIT-Pack/commit/7a75a792507c94a6a3456ee682db3a9256602b7f))
* **client:** Catppuccin theming, dark default (FR-21.1-21.4) ([d5c91b6](https://github.com/polandy/JIT-Pack/commit/d5c91b658902094c684bce9613b1b0057039478b))
* **client:** comment thread with flag-as-task in M5 (FR-7.1/7.2) ([09ff1f0](https://github.com/polandy/JIT-Pack/commit/09ff1f0fcc6f5a4efe845fb55ebbf16bc91fc79e))
* **client:** companion-item UI in M10/M3/M5/M4 (FR-20.1-20.4) ([52db616](https://github.com/polandy/JIT-Pack/commit/52db6163be6230b982657da7dbf48e1937c1ab69))
* **client:** composed templates reach the packing list (§3.27) ([deabe97](https://github.com/polandy/JIT-Pack/commit/deabe97df72cadfed2c451ae1a5f667f19a00f25))
* **client:** dependency resolution domain logic (FR-20.2-20.4) ([6b7a3ec](https://github.com/polandy/JIT-Pack/commit/6b7a3ecd164dd12199eabc9d128d9e97e7aac6b6))
* **client:** Enter fires a wizard step's default action (G-16) ([0fb82af](https://github.com/polandy/JIT-Pack/commit/0fb82af1484faf62a8124be852b4af8b7b768c37))
* **client:** every fraction on M4 counts the same thing (FR-25.22, FR-21.16) ([d5d69a0](https://github.com/polandy/JIT-Pack/commit/d5d69a08c19d30c28747e5437c854b1301a3c1ed))
* **client:** finish the i18n migration — every screen but M17 speaks German (NFR-4.12) ([a1d43ea](https://github.com/polandy/JIT-Pack/commit/a1d43eae6a8a108cd93aa132689cded3654f3894))
* **client:** give colour three roles instead of one palette (FR-21.7) ([c452d02](https://github.com/polandy/JIT-Pack/commit/c452d0283b110bbe99e6089fc014eca4e4e30b7d))
* **client:** give depth, radius and elevation one token table (FR-21.8) ([cb8341f](https://github.com/polandy/JIT-Pack/commit/cb8341f9ff467335962d1a080d9b88df9866de4d))
* **client:** give the app its own two faces and one type scale (FR-21.5/21.6) ([adcf0b5](https://github.com/polandy/JIT-Pack/commit/adcf0b5c863a899660df3d39f9211049a8f6e528))
* **client:** in-app notification toasts, M17 prefs, Web Push registration (FR-6.2/NFR-4.6) ([5be6e89](https://github.com/polandy/JIT-Pack/commit/5be6e89766550984cb854d4e0c66e556acb952de))
* **client:** item-dependency sync wiring and runtime cascades (FR-20.2-20.4) ([3c3f4b1](https://github.com/polandy/JIT-Pack/commit/3c3f4b194a4ee604842db41d56c97f3ea979f8f7))
* **client:** Local Mode — IndexedDB persistence, M19 mode selection ([af9db9a](https://github.com/polandy/JIT-Pack/commit/af9db9a911c68ac88c5da9288c71d07519d2cb7c))
* **client:** look inside a group before taking it (FR-27.12) ([4f1be71](https://github.com/polandy/JIT-Pack/commit/4f1be71d68a4231f01b80522e72af221a4ddd33d))
* **client:** M11 Container Management (FR-10.1–10.3) ([34ebeeb](https://github.com/polandy/JIT-Pack/commit/34ebeeb53171b0712a6c4eb4887f7917e2fa8c58))
* **client:** M12 Analytics (FR-8.2/10.4/14.3) ([13704cf](https://github.com/polandy/JIT-Pack/commit/13704cffdc90cf6a8bcd66c4e217775f299892d6))
* **client:** M13 Repack Mode (FR-11.1–11.3) + outbox push chunking ([43d4508](https://github.com/polandy/JIT-Pack/commit/43d4508b5e72f31be526bc74346337b7b83bcd52))
* **client:** M14 Post-Trip Review Assistant (FR-9.1/9.2) ([215d739](https://github.com/polandy/JIT-Pack/commit/215d73909e73a184d868840f3617f276f37199e9))
* **client:** M15 says what it read, what it flagged and where it lands ([eb952fb](https://github.com/polandy/JIT-Pack/commit/eb952fb7f087d1a2688162d99542eaa577bf5dc1))
* **client:** M15 spreadsheet import wizard (FR-16.1-16.3, NFR-4.7) ([b81b5d3](https://github.com/polandy/JIT-Pack/commit/b81b5d30e919687b515db2ad6c943a44d66be9bb))
* **client:** M16 Series & Destination Profiles (FR-13.1-13.3) ([87d29b7](https://github.com/polandy/JIT-Pack/commit/87d29b71cb499c1ee589b07daa9247fc33cac417))
* **client:** M17 Settings joins the catalogue, closing the i18n migration (NFR-4.12) ([c34a69a](https://github.com/polandy/JIT-Pack/commit/c34a69a137ebf01d267693de782730a108064ab8))
* **client:** M17 Settings page (FR-17.13, NFR-4.5 data section) ([31ccc4a](https://github.com/polandy/JIT-Pack/commit/31ccc4a0d3b7c0e32c5605508ecbcc39c7833c3a))
* **client:** M18 portable import preview (FR-18.4/18.5) ([3cd9d92](https://github.com/polandy/JIT-Pack/commit/3cd9d92a61cfef842680e2d3d1eaa055393b2122))
* **client:** M2 opens where the trips are, and each segment states its count (FR-2.8) ([80cdf02](https://github.com/polandy/JIT-Pack/commit/80cdf02d499f355c81a0035f1f44a6f8422c4998))
* **client:** M2 Share menu + member management page (FR-4.5/4.7) ([bcd71ad](https://github.com/polandy/JIT-Pack/commit/bcd71ad0c04ef8d57aae80d025f5ff46342b384d))
* **client:** M20 user administration + M17 entry (Addendum 3.23) ([0ce6f0b](https://github.com/polandy/JIT-Pack/commit/0ce6f0b66bc38f2488379093c4d4dc1de3edd822))
* **client:** M21 folds a finished trip back into templates (FR-27.5) ([a816c97](https://github.com/polandy/JIT-Pack/commit/a816c9735b9dd100483cc345aca189483a15adde))
* **client:** M3 takes single items beside templates (FR-27.3) ([6c23950](https://github.com/polandy/JIT-Pack/commit/6c2395071929441450eccb87e6cae9ab27516850))
* **client:** M4 and M5 can say a thing is deliberately not coming (FR-5.5) ([fdb5ba0](https://github.com/polandy/JIT-Pack/commit/fdb5ba055b58838b98c02407c2d3fd1c04c61d96))
* **client:** M4 gives its space back, and every line that names an item stands in one column (FR-21.17 … 21.20) ([497e7ab](https://github.com/polandy/JIT-Pack/commit/497e7ab1df2c2a7ef9c23325d4177fc8ff7750df))
* **client:** M4 names its trip once, and the width decides where ([016e015](https://github.com/polandy/JIT-Pack/commit/016e015217e4673867ade96fb47bc3f5b3bdf8a1))
* **client:** M4's row is mark, name and a control at the thumb, and a done row sinks ([7197806](https://github.com/polandy/JIT-Pack/commit/71978062f8f5e02f3686bf05ce2c9931edaeea66))
* **client:** M5 can mark an item unused, and M14 is tested through the app (FR-9.1) ([7dbfb2c](https://github.com/polandy/JIT-Pack/commit/7dbfb2c36dcd07d309a9070a8f9be16e0c0eb254))
* **client:** M6 Shopping Views with FR-3.3 purchase transition ([d3dcbfb](https://github.com/polandy/JIT-Pack/commit/d3dcbfb5abb2f317170b082888551feb60cd445e))
* **client:** M8 recognises a Gruppe hiding in the loose positions (FR-27.15) ([1c13236](https://github.com/polandy/JIT-Pack/commit/1c132362f8c9573c5727d3e7f1f4d59dfd7be14c))
* **client:** make "looks right" assertable (ADR-013) ([fa278f1](https://github.com/polandy/JIT-Pack/commit/fa278f1b97603c58e1e39e5aed81781995d61486))
* **client:** make a pack register, and give it one undo (FR-25.2) ([8ab547a](https://github.com/polandy/JIT-Pack/commit/8ab547a566905f337a2c2fe0dfdf7bec077c9e05))
* **client:** move every screen onto the type scale (FR-21.5) ([0416e9e](https://github.com/polandy/JIT-Pack/commit/0416e9edaeef36c512d8647b2a33e594edcf591c))
* **client:** OIDC token auto-refresh on expiry and 401 ([2b0ec11](https://github.com/polandy/JIT-Pack/commit/2b0ec119b132a7643d7475960228e53fa9bafe37))
* **client:** one header bar with a working back target (ADR-011) ([b4c29b2](https://github.com/polandy/JIT-Pack/commit/b4c29b2f03a93e59a592bae3b741451fdb775a5d))
* **client:** one Ionic mode, and the controls Material shaped are told once (ADR-049) ([e500e8d](https://github.com/polandy/JIT-Pack/commit/e500e8db1b8cba88c4948960ebdd2e20e0c96801))
* **client:** portable YAML export UI (FR-18.2/18.3), closing FR-19.5 ([554f1a3](https://github.com/polandy/JIT-Pack/commit/554f1a3c157bf1ee1410355e6e35dad1f2050769))
* **client:** pre-fill the M19 server URL with the page origin (FR-19.1) ([01ce4d0](https://github.com/polandy/JIT-Pack/commit/01ce4d060fe45f41786d7f040ed23050d4836266))
* **client:** rebuild M11 container management (FR-10.1–10.3, FR-24.5, FR-25.5) ([41d27dd](https://github.com/polandy/JIT-Pack/commit/41d27dd536c318ff590fe8c9ec809cc3b9673b4d))
* **client:** rebuild M12 analytics — slice taps filter M4 (FR-8.2, FR-25.11) ([8aa8d6a](https://github.com/polandy/JIT-Pack/commit/8aa8d6a32f4ec1b0a6593b079e846aec3b0a7489))
* **client:** rebuild M14 as the group-aware review list (FR-9.2, FR-27.11) ([4b26a67](https://github.com/polandy/JIT-Pack/commit/4b26a672dddf9775fb321fed1b3ecf2412b38f14))
* **client:** rebuild M7 around the two template scopes (§3.27, FR-27.1/27.6) ([e41ca02](https://github.com/polandy/JIT-Pack/commit/e41ca02b74bb31d2c869b224be575a9a20b39afd))
* **client:** rebuild M8 as the scope-shaped template editor (§3.27, FR-27.2/27.6/27.7) ([994ec51](https://github.com/polandy/JIT-Pack/commit/994ec5122fd8840f79c9ff6bb28646d96b77d348))
* **client:** rebuild the packing list and item detail from the concept (§3.25) ([e6ff479](https://github.com/polandy/JIT-Pack/commit/e6ff479406fa09d66a6a9968b0acd63e501bf47a))
* **client:** replace the Check-Latch brand mark with the Packed Backpack ([de11f1d](https://github.com/polandy/JIT-Pack/commit/de11f1dd12ee16886233ff5aba9c27c050c94068))
* **client:** show app version + commit hash in header and Settings About ([8dd970e](https://github.com/polandy/JIT-Pack/commit/8dd970e2077de722c471d557d4c2cdd34317a6ce))
* **client:** the app paints its own palette, Bergluft, over Catppuccin (ADR-048, FR-21.2) ([741a61b](https://github.com/polandy/JIT-Pack/commit/741a61b971d369d6ed9a1d603406a50302b008f5))
* **client:** the browse-sheet puts an item on every traveller in one tap (FR-25.13g) ([e319904](https://github.com/polandy/JIT-Pack/commit/e319904c65d3c564ed6b624d2e2da85a69611d0f))
* **client:** the composer's second posture — the inventory browse-sheet (FR-25.13d) ([6b0a43f](https://github.com/polandy/JIT-Pack/commit/6b0a43feca3fd9567a7eec0dd3df9dd94d966cde))
* **client:** the content stops at a column, and M4's rare actions move behind a menu (UX-17, UX-13) ([27f6218](https://github.com/polandy/JIT-Pack/commit/27f621853dff7c83efececf8cddef15704b302cb))
* **client:** the dashboard delegates, warns late and leads into a row ([0169417](https://github.com/polandy/JIT-Pack/commit/016941768f4344d6b64aed9d747355dc165fdb2f))
* **client:** the device backup carries how a trip follows its groups (FR-27.4) ([0cdb430](https://github.com/polandy/JIT-Pack/commit/0cdb430de5c2808d4ad7d7383b692c379f56976c))
* **client:** the inventory sheet can put away what is already in (FR-25.13e) ([19b73e3](https://github.com/polandy/JIT-Pack/commit/19b73e3d6ee98fb10be48b2d0525aabc0b072100))
* **client:** the inventory sheet decides as well as adds (FR-25.13f) ([df6c8f9](https://github.com/polandy/JIT-Pack/commit/df6c8f982d6b510ed9c9aef5b737001384240225))
* **client:** the item gets its rear-view (FR-27.8, FR-27.9) ([7516d71](https://github.com/polandy/JIT-Pack/commit/7516d710518c82ac4b2d2bd59930959278d90175))
* **client:** the M3 review step reviews, not only counts (FR-2.6) ([614bc18](https://github.com/polandy/JIT-Pack/commit/614bc18c89b3fc3c915bbfe0f9f8b1cd9c3b2abc))
* **client:** the M8 group picker can be searched (FR-27.13) ([4c03a89](https://github.com/polandy/JIT-Pack/commit/4c03a89d423b93c1234232bdbb65917fabc078c7))
* **client:** the membership roster gets an "Alle Reisenden" head row (FR-25.21c) ([427ade5](https://github.com/polandy/JIT-Pack/commit/427ade5713777ac7fbb54f7b556286d3fd589bdc))
* **client:** the notification speaks the recipient's language (NFR-4.12, ADR-037) ([711da4a](https://github.com/polandy/JIT-Pack/commit/711da4acbaefe86d86949aedc517c74d27f7aa92))
* **client:** the packing list draws its own progress, and one door opens the quick-add (FR-21.23, FR-21.24, FR-21.25) ([23bf978](https://github.com/polandy/JIT-Pack/commit/23bf97855382b24a89833761b87cbfb32740b63e))
* **client:** the page names itself, and the bar carries at most three glyphs (ADR-050) ([9ff258f](https://github.com/polandy/JIT-Pack/commit/9ff258f64cb672f67e92c799d26c8bdc7a537217))
* **client:** the profile picture is the user's, in every mode with a server (FR-17.13) ([53795f6](https://github.com/polandy/JIT-Pack/commit/53795f68ddb5e73a9bd0f75c15ed38fd0e63a2c2))
* **client:** the quick-add can add an item pro Person (FR-25.8) ([da3570c](https://github.com/polandy/JIT-Pack/commit/da3570c8bd40866cdd2fb591d646984057979a63))
* **client:** the quick-add names its companions, and the card reads its own offer ([38be7bd](https://github.com/polandy/JIT-Pack/commit/38be7bd3ca130d1f8acc2e118acb8f6d7c9bb99b))
* **client:** the quick-add offers chips before it asks for typing (FR-25.13c) ([78a509e](https://github.com/polandy/JIT-Pack/commit/78a509ec069467e925cbfccb7d394b388cf49115))
* **client:** the sync glyph explains itself and backs the device up (G-2, FR-19.6) ([#101](https://github.com/polandy/JIT-Pack/issues/101)) ([6d4ff6a](https://github.com/polandy/JIT-Pack/commit/6d4ff6a8232a9841151852c5465ac0b5ec424d46))
* **client:** the sync outbox survives a reload (B2, NFR-4.1a) ([fb28300](https://github.com/polandy/JIT-Pack/commit/fb283006a5fa88ab275df3ee53526f7b3a4dcbd9))
* **client:** the trip row says who it is for, and where it came from ([0b4a8a4](https://github.com/polandy/JIT-Pack/commit/0b4a8a4bfd69b4589ae360d76c0e3c4a39c1e35c))
* **client:** the trip you are on is a card, not a row (FR-21.13) ([92733e0](https://github.com/polandy/JIT-Pack/commit/92733e083c3e9c882f7c86d72b61f2c869e1da75))
* **client:** the trip you are packing is a card on M2 too (FR-21.15) ([989514a](https://github.com/polandy/JIT-Pack/commit/989514aea8589278d01de334c1f4cb736008e903))
* **client:** the trip's four views are a switcher in the page head (FR-21.21, FR-21.22) ([6e5ff36](https://github.com/polandy/JIT-Pack/commit/6e5ff361ff850e7b30139c8ba682da5bdeb9b456))
* **client:** the type scale carries the body text, not Ionic (FR-21.14) ([b8a1ece](https://github.com/polandy/JIT-Pack/commit/b8a1ece578ccaecd902cf477c2847f2fd9788233))
* **client:** trip cloning (FR-12.1/12.2) ([2e0abce](https://github.com/polandy/JIT-Pack/commit/2e0abce33e20af9210d74b555791cf0b55fc4958))
* **client:** trip presence says who is behind, and M20 gets its first tests ([47002be](https://github.com/polandy/JIT-Pack/commit/47002be91400f2818503ce9d20747ff96b42618f))
* **client:** trip_members sync + M3 sharing step (FR-4.5/4.7) ([ab41ae0](https://github.com/polandy/JIT-Pack/commit/ab41ae0512be6ec68b76661db02dd5e7bfe0e759))
* **client:** what is already here is not imported twice (FR-18.4, ADR-030) ([60d4dc6](https://github.com/polandy/JIT-Pack/commit/60d4dc659532adad5119a54036c15a340ba387f5))
* close the packing concept — groups, assignment vs. record, shared templates ([b6a9094](https://github.com/polandy/JIT-Pack/commit/b6a909411a6cffa36432e0f7fb728605cb981117))
* deletion is lifecycle-aware, for master items and templates (FR-24.3, ADR-032) ([632c807](https://github.com/polandy/JIT-Pack/commit/632c8075e17f11c1755222f4d3e0e037a0eabf59))
* **deploy:** one container serves the client and the API (ADR-043) ([bf1a3bb](https://github.com/polandy/JIT-Pack/commit/bf1a3bb68c35f385ee6ca84f1ef59ff347644ed8))
* export reminder, avatar crop, history suggestions (NFR-4.11 / FR-17.13 / FR-14.2) ([#17](https://github.com/polandy/JIT-Pack/issues/17)) ([2c8d9b5](https://github.com/polandy/JIT-Pack/commit/2c8d9b5d4c4af0aed26ccc6abbf6e5f42e88d4a0))
* items carry a set of tags instead of one category (§3.24) ([31a012d](https://github.com/polandy/JIT-Pack/commit/31a012d32233032d6614e7e8744fb83d7701689e))
* **m17:** leave Local Mode on the same device through the backup file (FR-19.8, ADR-045) ([b72cee4](https://github.com/polandy/JIT-Pack/commit/b72cee4763d63d9caedc7095b83752c42b58937c))
* **m1:** the dashboard shows the trips that have not started yet (FR-6.1) ([2277e90](https://github.com/polandy/JIT-Pack/commit/2277e901258668f31b8d540ea55837d56123c484))
* OIDC code-exchange broker + client login flow (spec §2) ([f3278ae](https://github.com/polandy/JIT-Pack/commit/f3278aee01128af72eb9b3567f067bdf1b469dc8))
* Packing Now with collision locking (FR-5.2/5.3, G-3) ([d991df7](https://github.com/polandy/JIT-Pack/commit/d991df73e183d92227856eb3d2a71af7b21abbe7))
* per-trip conflict log endpoint + G-2 conflict view ([3f7efe0](https://github.com/polandy/JIT-Pack/commit/3f7efe0ec5930bdf1f4731359bde02fc7c0fa37e))
* portable YAML carries a Vorlage's groups and their tasks (FR-27.1/27.7) ([35d8186](https://github.com/polandy/JIT-Pack/commit/35d81867d66a59c7949ed1892b6aeb2d36c73940))
* **portable:** a backup gives back what it saved — status, marks and tags (ADR-024) ([91ccd05](https://github.com/polandy/JIT-Pack/commit/91ccd05c8fdb4afd94e11e99aac1600c24b797c0))
* **pwa:** a waiting version can be applied on a press (FR-19.7, ADR-044) ([0506aec](https://github.com/polandy/JIT-Pack/commit/0506aec96c845285c92add40ac803aad92d35a4b))
* retire the traveler type and split the packing record (FR-25.9, FR-25.19) ([d0b18d5](https://github.com/polandy/JIT-Pack/commit/d0b18d53e62adf8df50d2e9d92b6b4f6a5d3d711))
* small client gaps — M2 delete, M7/M9 creation, G-4 highlight ([#16](https://github.com/polandy/JIT-Pack/issues/16)) ([30a59e9](https://github.com/polandy/JIT-Pack/commit/30a59e9137f358914bada026989ed22f76a353af))
* **store:** item_dependencies master-partition sync (FR-20.1) ([0ce3be0](https://github.com/polandy/JIT-Pack/commit/0ce3be067d3250f90e7551dab2fd496d182bba50))
* **store:** one always-current schema.sql instead of a migration chain ([121c57a](https://github.com/polandy/JIT-Pack/commit/121c57a6d79c9a4ae6a106022b46f06292be0e7e))
* **store:** sync trip_series and destination_* via the master partition (FR-13.1/13.2) ([d0fc380](https://github.com/polandy/JIT-Pack/commit/d0fc3805e0a20dec8e8f3edd256ffb8bf072cd27))
* **sync:** a recorded conflict can be taken back (NFR-4.2a, ADR-023) ([76f6e8d](https://github.com/polandy/JIT-Pack/commit/76f6e8de422cb5f586c0bee6d94809d17ed7b4c2))


### Bug Fixes

* a refused mutation repairs the row it refused (Sync-API §5, ADR-031) ([f17d26b](https://github.com/polandy/JIT-Pack/commit/f17d26b763bdbdc80f83893543b1d4c31b7b86da))
* a rejected mutation says why, and G-2 shows it (Sync-API §5, FR-9.2) ([7478696](https://github.com/polandy/JIT-Pack/commit/7478696988083b1c07aaf5bd81631455cad48198))
* **api:** a broadcast waits for no peer, and an error stops reading as a 404 (ADR-057) ([fce3744](https://github.com/polandy/JIT-Pack/commit/fce37441247cd3eca6004719c56061d09cab8713))
* **api:** a failure that changes nothing for the caller still says so ([2f9a46c](https://github.com/polandy/JIT-Pack/commit/2f9a46cef0b2ba2b9b865a977874456fe521d603))
* **api:** a request body is bounded before it is decoded ([93ecf5f](https://github.com/polandy/JIT-Pack/commit/93ecf5f92067e2564368dbd202554d4bb25a8411))
* **api:** a Web Push delivery is no longer discarded by shutdown (NFR-4.6, ADR-055) ([ab7e19d](https://github.com/polandy/JIT-Pack/commit/ab7e19d9e05835354bdf38a2ce18d4222a7e3b65))
* **api:** a WebSocket subscription is authorised on every send (ADR-056) ([064aae7](https://github.com/polandy/JIT-Pack/commit/064aae71ebb910bfaad42fb253b65d1acf14bf9e))
* **api:** the server stamps every actor column, on every op (invariant 3) ([d7a5433](https://github.com/polandy/JIT-Pack/commit/d7a54336fd1b5c4963294dc6d2d230d5bc4101c0))
* **cli:** a command calls the action, not the mutation (FR-18.8) ([ef83de1](https://github.com/polandy/JIT-Pack/commit/ef83de1720b26905a7d825dc3ebfaa580539741d))
* **client:** a backup can be read back, and lands where its trips are (NFR-4.11, FR-18.4) ([ad0026e](https://github.com/polandy/JIT-Pack/commit/ad0026e4fc2b21eb844dbb6afaec7f0d86134d78))
* **client:** a bottom toast is presented above the tab bar, not onto it (FR-9.4) ([453ba02](https://github.com/polandy/JIT-Pack/commit/453ba02672ade1d12b2b938738e7dcbfb75f43b0))
* **client:** a clone of an unopened trip carries its items, not an absence (FR-12.1, ADR-033) ([6c908bc](https://github.com/polandy/JIT-Pack/commit/6c908bcbe10ac104af19338be2ae83f80f08a300))
* **client:** a generated row is filed under the item's tag (FR-24.2) ([ccb8321](https://github.com/polandy/JIT-Pack/commit/ccb8321c5935a20388ba4128d405403ec7dfbf38))
* **client:** a partition drains once at a time (Sync-API §4) ([d713ea7](https://github.com/polandy/JIT-Pack/commit/d713ea7069d24d9e2f836500201f12c588aa48b6))
* **client:** a per-person position an empty roster cannot place is reported (FR-2.5b) ([ea0b150](https://github.com/polandy/JIT-Pack/commit/ea0b150f307eeec9558b119e77910d1d554c2f7e))
* **client:** a rewritten row's state follows its numbers (FR-25.21/FR-5.5) ([447b58e](https://github.com/polandy/JIT-Pack/commit/447b58e3887c3cc3af6a0f062ccbcf1de2f06bc9))
* **client:** a screen reachable from anywhere gives back the screen it came from ([bee8f8a](https://github.com/polandy/JIT-Pack/commit/bee8f8a1dc5e63439681cef7b9cbd9e146997ce7))
* **client:** a trip screen loads its own partition, not M4's (U-10) ([7a3f66a](https://github.com/polandy/JIT-Pack/commit/7a3f66ac7cde7ae07dce091a9815b36acadaa954))
* **client:** a trip's two dates bound each other (FR-2.1d) ([33df2e6](https://github.com/polandy/JIT-Pack/commit/33df2e62b12e19735125d9dedae287aacb089491))
* **client:** an anchor switch is a root navigation, not a push (ADR-012) ([39c6553](https://github.com/polandy/JIT-Pack/commit/39c655323e2610142c6b9d4f62a47558ae8b5fd3))
* **client:** an inventory is not a matrix — M15 imports one without a trip column (FR-16.1) ([6f11bcf](https://github.com/polandy/JIT-Pack/commit/6f11bcfb64fda88fab6684114f0e89fdb68a5fd8))
* **client:** an optimistic row is a whole row, not the fields the form changed ([985874e](https://github.com/polandy/JIT-Pack/commit/985874e0c51051e3b65d1352e984d83b6ab61132))
* **client:** browser back with the M5 sheet open closes it, not the trip ([8af83ef](https://github.com/polandy/JIT-Pack/commit/8af83ef77975be8e2da37f6c66d68d9997f1b6dd))
* **client:** date and file controls wear the theme and the locale (UX-6, ADR-035) ([4e49350](https://github.com/polandy/JIT-Pack/commit/4e49350079b3126a6f0af89b3001e3b3e5fbe9f1))
* **client:** dates, value and the greeting learn the locale (UX-5, UX-11, UX-15) ([d8ff9e4](https://github.com/polandy/JIT-Pack/commit/d8ff9e476e9302a4eca3b3764ca1b179e71e48f5))
* **client:** drop the pop action from back, and cover the list round trip ([d76961c](https://github.com/polandy/JIT-Pack/commit/d76961ce0ff8921e476f9f84e3c425042487e346))
* **client:** G-3's lock reaches the sheet, names its holder, and takes its window from the instance (§7) ([3c902c3](https://github.com/polandy/JIT-Pack/commit/3c902c3d494938570e182d22934700776c70fb26))
* **client:** let the tablet-width content measure grow on M4 (FR-21.26) ([534b1d4](https://github.com/polandy/JIT-Pack/commit/534b1d46015ae6fe9456e9a911ad79c9b97d55c1))
* **client:** M1's cards are the app's card (FR-21.28) ([8db34a7](https://github.com/polandy/JIT-Pack/commit/8db34a7eb767d8ef4b97b3179f1b56bc79429861))
* **client:** M1's greeting is M1's page head (FR-21.27) ([09be2b2](https://github.com/polandy/JIT-Pack/commit/09be2b209f62d1956c140fc83da88a2344181beb))
* **client:** M10's saved-item sections speak the catalogue (NFR-4.12) ([b4682e7](https://github.com/polandy/JIT-Pack/commit/b4682e7abc7f6123045b0a683580a254d2a63d35))
* **client:** M15 imports the spreadsheet people actually keep (FR-16.1/16.2) ([ee05711](https://github.com/polandy/JIT-Pack/commit/ee057111800ef3c7d1119071002cec9e2d5529be))
* **client:** M22 drops the traveller remove control instead of disabling it (FR-2.7) ([6a55ad0](https://github.com/polandy/JIT-Pack/commit/6a55ad0bfc507971da37ce9b6a3a5192420c8bf3))
* **client:** M3 review overrides follow the item, not the slot ([2c13c7a](https://github.com/polandy/JIT-Pack/commit/2c13c7a87fa89a7bd3a4061c54bd679981f73b94))
* **client:** M4 comes back where it was left, and M12's trend has its positive case ([34d8b6d](https://github.com/polandy/JIT-Pack/commit/34d8b6d5b7b2c9ed33bfb1a51e215ecec1b14317))
* **client:** M4's control column holds one width, so item names line up (UX-9) ([b392af2](https://github.com/polandy/JIT-Pack/commit/b392af271bfde5471ca2b6aa6275b5d76a3b915f))
* **client:** make type-check pass so npm run build works ([faeb5e4](https://github.com/polandy/JIT-Pack/commit/faeb5e468beca8c614c073a28c4e01ea3975e945))
* **client:** one content measure, kept by every screen (FR-21.26) ([276e69b](https://github.com/polandy/JIT-Pack/commit/276e69bdf306e5a98cc283652c5ec800c0583339))
* **client:** persist editor mutations through the orchestrator ([df9d71e](https://github.com/polandy/JIT-Pack/commit/df9d71e028059db624a4528b3b7e819402d05a5b))
* **client:** plain-HTTP instances can write again (NFR-4.2a) ([99acd3d](https://github.com/polandy/JIT-Pack/commit/99acd3d760745e0aceb2ba52db1a6aa2d6979da1))
* **client:** replace multi-statement inline handler broken by prettier ([249ec8e](https://github.com/polandy/JIT-Pack/commit/249ec8e1a91f3a25af75c875b6e18795cdfe2b61))
* **client:** settings accepts human names, and the gear stops pointing at itself (FR-17.13, G-9) ([0a1325c](https://github.com/polandy/JIT-Pack/commit/0a1325ca750bb3d694460f99be8fbc0f098a717b))
* **client:** six minors on four screens (G-18, FR-21.9, FR-20.4, FR-16.2) ([179d30d](https://github.com/polandy/JIT-Pack/commit/179d30dabd102a83e3476e459856967d2e769830))
* **client:** stop a failed local write from silencing the session (FR-19.2) ([c20ffdb](https://github.com/polandy/JIT-Pack/commit/c20ffdb65718bc759a408d32bc1435f349807b20))
* **client:** the backup reminder is about the whole device (NFR-4.11) ([c988ab8](https://github.com/polandy/JIT-Pack/commit/c988ab8a4b0093c97a0864f6d04eef3f34f7609b))
* **client:** the conflict log is read by a person, not by the wire (NFR-4.2a) ([bd0f701](https://github.com/polandy/JIT-Pack/commit/bd0f70172c682c41aeea7ffe410f4346c360e3b1))
* **client:** the date sheet's calendar is ready when the sheet has landed, and the walk to a month is a key, not a scroll ([0bb49c5](https://github.com/polandy/JIT-Pack/commit/0bb49c5277a0dd5d769849243f406fc29e31a7dd))
* **client:** the import sends an item before the tag that points at it, and folds a name the sheet lists twice (FR-16.3/24.2) ([cb99db2](https://github.com/polandy/JIT-Pack/commit/cb99db2aa816e2336152e858bc222388b45dc4e4))
* **client:** the luggage empty state stops contradicting itself, and M5's pack box names itself (UX-8, UX-10) ([1820249](https://github.com/polandy/JIT-Pack/commit/18202499f2cf3db6c8317a399e095a9da9d05922))
* **client:** the M9 tag axis stands clear of the first group heading (UX-4) ([8999518](https://github.com/polandy/JIT-Pack/commit/899951846cdefd3889c3c01863a4541cf77d8d3d))
* **client:** the membership lock covers the cluster, not one row (FR-25.21) ([17e87cf](https://github.com/polandy/JIT-Pack/commit/17e87cf97ac79a6ce426c05970c0832c3a5821a2))
* **client:** the pull takes every page, not only the first (Sync-API §4) ([3c29487](https://github.com/polandy/JIT-Pack/commit/3c294879a99ee5dad0e866149a50d1a0726b51ff))
* **client:** the sheet header's ✓ and ✕ are one cluster (G-14/FR-25.15) ([51455b0](https://github.com/polandy/JIT-Pack/commit/51455b0deaf6aec3df3422ca5c6fcc92176bd9fb))
* **client:** the sync sheet's glyph sits on its title, and the empty log is inset ([986d3ea](https://github.com/polandy/JIT-Pack/commit/986d3ea576107646e0d2dc7f464e42da5363ae39))
* **client:** the tag offers become a shelf, and icon-only buttons name themselves (UX-13, UX-14) ([dd06d9c](https://github.com/polandy/JIT-Pack/commit/dd06d9ce1d721cba8e949ea37f0957d2ff0673a8))
* **client:** the token gate reads a colour in every notation (invariant 9b) ([1e159ea](https://github.com/polandy/JIT-Pack/commit/1e159ea24353336ec42fc420c3cdf8d0df519d57))
* **client:** the trip list stops reporting a packed trip as untouched (FR-2.3, ADR-033) ([5a13a80](https://github.com/polandy/JIT-Pack/commit/5a13a807d146b5e59caad8223a7b2e825de23ce6))
* **client:** three screens that treated an interruption as an answer ([3c9fd84](https://github.com/polandy/JIT-Pack/commit/3c9fd8431f1c0bafe1fa6fe408e625c7503d9aea))
* close TODO-minors-pr3 items 1-3 (devcode rebuild, E2E-M3-15, E2E-M5-10) ([b95b5b0](https://github.com/polandy/JIT-Pack/commit/b95b5b01c79e667601a8f0fa8620fc79c005aa8d))
* **domain:** four rules that were right about the ordinary case ([1727f21](https://github.com/polandy/JIT-Pack/commit/1727f21aef4045e3e3718ba79ecef170c575e2cf))
* **e2e-server:** a session's end is a state, and an administered account belongs to one file ([d09c6ba](https://github.com/polandy/JIT-Pack/commit/d09c6ba02952ab1e7378258936ce06e6b11a6570))
* **e2e:** a write helper returns when the write is on the device ([e135c15](https://github.com/polandy/JIT-Pack/commit/e135c159a737d6775383ef1a6532ba8d427e5226))
* **e2e:** two helpers waited for hydrated and needed ready ([7cce5df](https://github.com/polandy/JIT-Pack/commit/7cce5dfb64472cfdf9423a73b3540211d0bd1227))
* harden the session broker and authorize the routes that only authenticated ([e285861](https://github.com/polandy/JIT-Pack/commit/e2858611884907e0d65d4c21ad2728708c60d202))
* **m17:** the avatar crop stage never zoomed (FR-17.13) ([f2be5c9](https://github.com/polandy/JIT-Pack/commit/f2be5c9bf6ea90af925f18fa4f7687d6fddd35ce))
* **ops:** forward the browser's Host with its port, or /ws is refused ([f4728f6](https://github.com/polandy/JIT-Pack/commit/f4728f6a0891db8a3b70ee9b89198db207f5dab2))
* **portable:** the Local Mode backup carries where a row was bought from (FR-25.11j) ([9e66b51](https://github.com/polandy/JIT-Pack/commit/9e66b51f3f94932ada5df549fae11c1ee8f5281b))
* require email_verified before granting the instance-admin role ([5516b88](https://github.com/polandy/JIT-Pack/commit/5516b886571c4972249c8009b3c0ad8f02c91dbd))
* **router:** the item over the packing list is a query, not a second page (ADR-046) ([609b384](https://github.com/polandy/JIT-Pack/commit/609b3844e728d9e950dca3940c06816bbc402492))
* **store:** a conflict entry stops outliving the row it audits (NFR-4.2a) ([c36b070](https://github.com/polandy/JIT-Pack/commit/c36b0708360170964728193115ef49cf5f65e009))
* **store:** the schema enforces its own rules, and declines the ones that would cost a change (FR-27.1, FR-4.5, FR-1.6) ([5ec15ff](https://github.com/polandy/JIT-Pack/commit/5ec15ffc1c6df675e25caf327bbf39a9a4c85da9))
* **sync:** a clock outside the format is refused, not stored ([f80e0ad](https://github.com/polandy/JIT-Pack/commit/f80e0adfcc1ba001b8cf59f79313b6b6c300bf84))
* **sync:** a delete takes its children off the device, not just off the screen ([37da3a0](https://github.com/polandy/JIT-Pack/commit/37da3a0f91c740aef238b4838d861fc9c1ca2085))
* **sync:** a field carried along unchanged is not a conflict (NFR-4.2a) ([b80fad8](https://github.com/polandy/JIT-Pack/commit/b80fad8cba9a43f7bdb82123ebf87db7bc934f2f))
* **sync:** a field is compared against its own clock, and packed beats only packing_now (NFR-4.2a) ([9fb3ea4](https://github.com/polandy/JIT-Pack/commit/9fb3ea48f62321eb21adf794fab0224396354064))
* **sync:** a refused mutation is answered as a refusal, and the client hears it ([916f900](https://github.com/polandy/JIT-Pack/commit/916f9008f2e2fbf6bd0e5b82fc0b8623bfbe3c9b))
* **sync:** a socket that died is dialled again, and the gap is pulled over (Sync-API P-1, §9) ([9c2eef8](https://github.com/polandy/JIT-Pack/commit/9c2eef8d60b3545218e4fe566984fad9c3a19a59))
* **sync:** a trip mutation is confined to the trip its endpoint names ([b360d74](https://github.com/polandy/JIT-Pack/commit/b360d74160dbec435e71b97f9e8b36accb0a2965))
* **sync:** a write older than the delete does not bring the row back (ADR-052) ([b3f02da](https://github.com/polandy/JIT-Pack/commit/b3f02dae547088405e2e06bf013631b84dbae38e))
* **sync:** the master partition's conflict log is readable ([8b45f29](https://github.com/polandy/JIT-Pack/commit/8b45f2954be149d225931b4f8285e005e1ccc595))
* **sync:** the pull cursor comes from a pull, never from a push ([3bfd20d](https://github.com/polandy/JIT-Pack/commit/3bfd20df00509c1572829fb256ac2938971bf107))
* **sync:** the pull snapshot carries its clock, and every cascade is tombstoned (NFR-4.2a) ([4f4c20a](https://github.com/polandy/JIT-Pack/commit/4f4c20a12e57139cc238392337a38db8cbaf257a))


### Miscellaneous Chores

* restart versioning at 0.1.0 ([ff33ee1](https://github.com/polandy/JIT-Pack/commit/ff33ee1e8654a1b55aa47e3c562ce792fd4831f8))

## [0.9.0](https://github.com/polandy/JIT-Pack/compare/v0.8.0...v0.9.0) (2026-09-12)


### Features

* **api:** notify a linked traveler's account on roster assignment (FR-2.5, ADR-058) ([51ba4ec](https://github.com/polandy/JIT-Pack/commit/51ba4ec4cb3d99fb540faac607a31f8a1339f451))
* **client:** a per-person cluster folds, and starts shut (FR-25.23) ([#442](https://github.com/polandy/JIT-Pack/issues/442)) ([c9a9749](https://github.com/polandy/JIT-Pack/commit/c9a9749ff6beffa59fe74e2bfc2e31c21b0c848a))
* **client:** assign one or more travelers from the inventory browse-sheet (FR-25.13h) ([3b14038](https://github.com/polandy/JIT-Pack/commit/3b14038f0ae122cd219a41b70a1476df6bc0fba7))
* **client:** show app version + commit hash in header and Settings About ([c409b32](https://github.com/polandy/JIT-Pack/commit/c409b32e748c69e63830ccca27532f5b6503f1c4))


### Bug Fixes

* **client:** let the tablet-width content measure grow on M4 (FR-21.26) ([1ceca8b](https://github.com/polandy/JIT-Pack/commit/1ceca8beb65ebd2337c34d00b36f23217eec571c))

## [0.8.0](https://github.com/polandy/JIT-Pack/compare/v0.7.2...v0.8.0) (2026-09-11)


### Features

* **client:** the browse-sheet puts an item on every traveller in one tap (FR-25.13g) ([bcfadb0](https://github.com/polandy/JIT-Pack/commit/bcfadb034f013c25352d017c62ffaee994ce3444))
* **client:** the membership roster gets an "Alle Reisenden" head row (FR-25.21c) ([7768753](https://github.com/polandy/JIT-Pack/commit/776875303c7cb515f4bad986ae024b7f8115fcb5))


### Bug Fixes

* **api:** a broadcast waits for no peer, and an error stops reading as a 404 (ADR-057) ([90facd1](https://github.com/polandy/JIT-Pack/commit/90facd15b7955c0af0749634b1d58293b9a96123))
* **api:** a request body is bounded before it is decoded ([b59f4fd](https://github.com/polandy/JIT-Pack/commit/b59f4fdb1d6e3f7f17520ca41877756ded360c69))
* **api:** a Web Push delivery is no longer discarded by shutdown (NFR-4.6, ADR-055) ([b5657b6](https://github.com/polandy/JIT-Pack/commit/b5657b6166ffd3d0cf59c30f9596cd263e2681be))
* **api:** a WebSocket subscription is authorised on every send (ADR-056) ([798f740](https://github.com/polandy/JIT-Pack/commit/798f740c4da2c7feec580ee5adbc126b4e6fa2cb))
* **client:** a per-person position an empty roster cannot place is reported (FR-2.5b) ([ecc5452](https://github.com/polandy/JIT-Pack/commit/ecc5452851d471d033d5242402b2289acc49bb8f))
* **client:** six minors on four screens (G-18, FR-21.9, FR-20.4, FR-16.2) ([cbca88e](https://github.com/polandy/JIT-Pack/commit/cbca88eacd4927e0b8d6931c40d1ed9fc4466e03))
* **client:** three screens that treated an interruption as an answer ([2333362](https://github.com/polandy/JIT-Pack/commit/2333362be9ff8368fcaf043f01728d2a4165901e))
* **domain:** four rules that were right about the ordinary case ([51f96dd](https://github.com/polandy/JIT-Pack/commit/51f96dd45a233f32cdf8194503e3677c6668df2c))
* **store:** a conflict entry stops outliving the row it audits (NFR-4.2a) ([864591e](https://github.com/polandy/JIT-Pack/commit/864591eb94ef400b92e65fbe81781a8c07d88e66))
* **sync:** a write older than the delete does not bring the row back (ADR-052) ([f1ed411](https://github.com/polandy/JIT-Pack/commit/f1ed411eae903d82583d452583492ca8f82fd993))

## [0.7.2](https://github.com/polandy/JIT-Pack/compare/v0.7.1...v0.7.2) (2026-09-09)


### Bug Fixes

* **client:** M1's cards are the app's card (FR-21.28) ([bf4a4db](https://github.com/polandy/JIT-Pack/commit/bf4a4db3801e1bbc21b4ffb1936662d6912f7013))

## [0.7.1](https://github.com/polandy/JIT-Pack/compare/v0.7.0...v0.7.1) (2026-09-09)


### Bug Fixes

* **client:** M1's greeting is M1's page head (FR-21.27) ([89d2814](https://github.com/polandy/JIT-Pack/commit/89d2814f8e7528258a441fb22cff3c30b21d9b57))

## [0.7.0](https://github.com/polandy/JIT-Pack/compare/v0.6.0...v0.7.0) (2026-09-08)


### Features

* **client:** every fraction on M4 counts the same thing (FR-25.22, FR-21.16) ([8c8052d](https://github.com/polandy/JIT-Pack/commit/8c8052d93996a2915f1eee8feffdcd82176aee77))
* **client:** M4 gives its space back, and every line that names an item stands in one column (FR-21.17 … 21.20) ([27bfb89](https://github.com/polandy/JIT-Pack/commit/27bfb89bc5d7c31027d652c1d2c6fd9b238ec4c1))
* **client:** the packing list draws its own progress, and one door opens the quick-add (FR-21.23, FR-21.24, FR-21.25) ([49d8575](https://github.com/polandy/JIT-Pack/commit/49d8575aa387e9ef8e4d6ff717474d23b51c86ec))
* **client:** the trip's four views are a switcher in the page head (FR-21.21, FR-21.22) ([5856fd9](https://github.com/polandy/JIT-Pack/commit/5856fd927960d51bc65e7479c53caf4e546dd315))


### Bug Fixes

* **client:** a generated row is filed under the item's tag (FR-24.2) ([e187736](https://github.com/polandy/JIT-Pack/commit/e187736ca8b131e0aa9dcbc007863715c497a8d9))
* **client:** one content measure, kept by every screen (FR-21.26) ([aecabba](https://github.com/polandy/JIT-Pack/commit/aecabba363cddf025b1a99424fca16af80b0bb94))
* **client:** the token gate reads a colour in every notation (invariant 9b) ([ae888f5](https://github.com/polandy/JIT-Pack/commit/ae888f5938989c0a690dbd13da5412dcd16eb006))
* **sync:** a clock outside the format is refused, not stored ([8055493](https://github.com/polandy/JIT-Pack/commit/8055493c60ad99a1c73f6bb08d1f5168a2de68e3))

## [0.6.0](https://github.com/polandy/JIT-Pack/compare/v0.5.0...v0.6.0) (2026-09-07)


### Features

* **client:** a section head names its block, and its count sits beside it (FR-21.11) ([0e51838](https://github.com/polandy/JIT-Pack/commit/0e5183822b8a119dc637b088f5cddedba345e59b))
* **client:** a sheet's head is a component, and every sheet leaves the same way (FR-21.12) ([cecd786](https://github.com/polandy/JIT-Pack/commit/cecd7862e5a11d8a2e0e895651b98758a69752ef))
* **client:** M4's row is mark, name and a control at the thumb, and a done row sinks ([769e658](https://github.com/polandy/JIT-Pack/commit/769e65894f659bd6317fedaa6f4bce174bf6ecae))
* **client:** one Ionic mode, and the controls Material shaped are told once (ADR-049) ([4691bcc](https://github.com/polandy/JIT-Pack/commit/4691bccf8ecca99b7ab2c8ed30d9076d8d1b65a2))
* **client:** the app paints its own palette, Bergluft, over Catppuccin (ADR-048, FR-21.2) ([2ad3f82](https://github.com/polandy/JIT-Pack/commit/2ad3f828b5a0f733cad69bd3488f55bc9f872e96))
* **client:** the page names itself, and the bar carries at most three glyphs (ADR-050) ([262954c](https://github.com/polandy/JIT-Pack/commit/262954c989b9fad05f84aad217f96fdce58d7b58))
* **client:** the trip you are on is a card, not a row (FR-21.13) ([dfeae6c](https://github.com/polandy/JIT-Pack/commit/dfeae6ccfe443caef8eaf0fd90e155accbe50bae))
* **client:** the trip you are packing is a card on M2 too (FR-21.15) ([d625c04](https://github.com/polandy/JIT-Pack/commit/d625c04448e96efefe66d903cf44c33bba71e80a))
* **client:** the type scale carries the body text, not Ionic (FR-21.14) ([f9e6cf9](https://github.com/polandy/JIT-Pack/commit/f9e6cf968040a1f34510e0ef67268398f76e9a9c))


### Bug Fixes

* **client:** a trip screen loads its own partition, not M4's (U-10) ([b6d2f0d](https://github.com/polandy/JIT-Pack/commit/b6d2f0d5adb3f7c5bd94e3d78c87b2e2aacd8955))
* **client:** the date sheet's calendar is ready when the sheet has landed, and the walk to a month is a key, not a scroll ([54e784a](https://github.com/polandy/JIT-Pack/commit/54e784aa162aef4716471c5de6441ba5fbf4d09c))
* **e2e:** a write helper returns when the write is on the device ([03209e6](https://github.com/polandy/JIT-Pack/commit/03209e6d59992aa0c5ee68ea18aee93f5d4cd421))
* **e2e:** two helpers waited for hydrated and needed ready ([99285a3](https://github.com/polandy/JIT-Pack/commit/99285a3e7435979f54f8d8e332de6ccbd555d24e))
* **router:** the item over the packing list is a query, not a second page (ADR-046) ([869254b](https://github.com/polandy/JIT-Pack/commit/869254b153c6d8cad96d3873c1164f7371c415a1))

## [0.5.0](https://github.com/polandy/JIT-Pack/compare/v0.4.0...v0.5.0) (2026-09-02)


### Features

* **m17:** leave Local Mode on the same device through the backup file (FR-19.8, ADR-045) ([1af066c](https://github.com/polandy/JIT-Pack/commit/1af066cb59da8f6d7d3627640afa4b55f9fafc52))
* **m1:** the dashboard shows the trips that have not started yet (FR-6.1) ([2da8593](https://github.com/polandy/JIT-Pack/commit/2da8593135ee5f83adc06bcb768e54c6775afee5))
* **pwa:** a waiting version can be applied on a press (FR-19.7, ADR-044) ([bdf9bb9](https://github.com/polandy/JIT-Pack/commit/bdf9bb902945a31be21ef92e5db82892857d2d04))


### Bug Fixes

* **e2e-server:** a session's end is a state, and an administered account belongs to one file ([85d0d10](https://github.com/polandy/JIT-Pack/commit/85d0d10b80cec0673316b5000a226bdcaa78ff45))
* **portable:** the Local Mode backup carries where a row was bought from (FR-25.11j) ([3d60367](https://github.com/polandy/JIT-Pack/commit/3d60367fc8e72de5734fb7bbf6170ed0a3b72f2a))
* **sync:** a delete takes its children off the device, not just off the screen ([e9b2636](https://github.com/polandy/JIT-Pack/commit/e9b26369aefeb278c797c4d85030db16bfae7a24))

## [0.4.0](https://github.com/polandy/JIT-Pack/compare/v0.3.3...v0.4.0) (2026-09-01)


### Features

* **deploy:** one container serves the client and the API (ADR-043) ([fced346](https://github.com/polandy/JIT-Pack/commit/fced3468d9351ab37a2f11acc68aec9dc1b345ae))

## [0.3.3](https://github.com/polandy/JIT-Pack/compare/v0.3.2...v0.3.3) (2026-09-01)


### Bug Fixes

* **sync:** a socket that died is dialled again, and the gap is pulled over (Sync-API P-1, §9) ([3402656](https://github.com/polandy/JIT-Pack/commit/34026566b05bd5af079491e509ebe61da97304cf))

## [0.3.2](https://github.com/polandy/JIT-Pack/compare/v0.3.1...v0.3.2) (2026-09-01)


### Bug Fixes

* **m17:** the avatar crop stage never zoomed (FR-17.13) ([b15f794](https://github.com/polandy/JIT-Pack/commit/b15f794976a757120ace8e11e9f04a77ef39fa3c))

## [0.3.1](https://github.com/polandy/JIT-Pack/compare/v0.3.0...v0.3.1) (2026-09-01)


### Bug Fixes

* **cli:** a command calls the action, not the mutation (FR-18.8) ([d781bc9](https://github.com/polandy/JIT-Pack/commit/d781bc9c2edb00a40a92f574e4801a5ccd953427))

## [0.3.0](https://github.com/polandy/JIT-Pack/compare/v0.2.0...v0.3.0) (2026-09-01)


### Features

* **api,client:** the instance names the currency its amounts are in (FR-21.9) ([626e4eb](https://github.com/polandy/JIT-Pack/commit/626e4eb7f3b3b2c10c1263a921a956f871388370))
* **api:** a master row has a delete endpoint (FR-24.4, ADR-038) ([2a1d0e5](https://github.com/polandy/JIT-Pack/commit/2a1d0e5b5e40ecc026550ada999f8e75019046d5))
* **api:** API tokens, created in the app and on the CLI (FR-23.7, ADR-039) ([14fe2e1](https://github.com/polandy/JIT-Pack/commit/14fe2e1c39f1b1faeeabf091d92b718d12534721))
* **cli:** a trip's roster from the shell, and the CLI grows subcommands (FR-18.8, ADR-042) ([1ba43ca](https://github.com/polandy/JIT-Pack/commit/1ba43caa4cad82d6234bfb8aaca9db433b83d8c7))
* **client:** a per-person item is one buy row in M6 (FR-25.6) ([424dca0](https://github.com/polandy/JIT-Pack/commit/424dca0772095f82e88d16f21a3313dc5b2e58c3))
* **client:** a trip's year can be corrected, and an archived one says why not ([c4acb91](https://github.com/polandy/JIT-Pack/commit/c4acb917b7d1c662f00f0f869a7d36704c87a58c))
* **client:** an item can name several people, each with their own amount (FR-25.21) ([1059c9f](https://github.com/polandy/JIT-Pack/commit/1059c9fbfa208bc00fd232da97614a2ea6d899f6))
* **client:** M15 says what it read, what it flagged and where it lands ([f290f72](https://github.com/polandy/JIT-Pack/commit/f290f724a7cb4b9db18f2f12d98ee57005eca978))
* **client:** M2 opens where the trips are, and each segment states its count (FR-2.8) ([7fcbfde](https://github.com/polandy/JIT-Pack/commit/7fcbfded295f4e304624368225fb0853095bc441))
* **client:** the dashboard delegates, warns late and leads into a row ([669a626](https://github.com/polandy/JIT-Pack/commit/669a626f984dbf34b9453c9df336067210455294))
* **client:** the inventory sheet can put away what is already in (FR-25.13e) ([90ca358](https://github.com/polandy/JIT-Pack/commit/90ca3580ac8f3fa76ba0db1ce3c2ce87d9f1344d))
* **client:** the inventory sheet decides as well as adds (FR-25.13f) ([8ed3f61](https://github.com/polandy/JIT-Pack/commit/8ed3f615e2a4bc38ec0bc76e30ea5fc98cb36692))
* **client:** the item gets its rear-view (FR-27.8, FR-27.9) ([ebe9d07](https://github.com/polandy/JIT-Pack/commit/ebe9d073465162a8342edde4e2a9954bf024553a))
* **client:** the notification speaks the recipient's language (NFR-4.12, ADR-037) ([eaea850](https://github.com/polandy/JIT-Pack/commit/eaea8503d24aa778016b6b4cd9fb110abf81ba1d))
* **client:** the profile picture is the user's, in every mode with a server (FR-17.13) ([4a4b321](https://github.com/polandy/JIT-Pack/commit/4a4b321b307bea601cbeda2d98f98faefbb63dc5))
* **client:** the quick-add can add an item pro Person (FR-25.8) ([040d366](https://github.com/polandy/JIT-Pack/commit/040d366b8be4f3cf58b3ae527cbd41e1254651d4))
* **client:** the quick-add names its companions, and the card reads its own offer ([32e2339](https://github.com/polandy/JIT-Pack/commit/32e233955249c1ce4dfee8f8ca43d928dc2791af))
* **client:** the trip row says who it is for, and where it came from ([30cc758](https://github.com/polandy/JIT-Pack/commit/30cc7583e44c1fb009f0a930011a5aad58e549a5))


### Bug Fixes

* **client:** a rewritten row's state follows its numbers (FR-25.21/FR-5.5) ([4fb1401](https://github.com/polandy/JIT-Pack/commit/4fb14019c4364a6ccc40a6b7cd2841b01af81a8d))
* **client:** an anchor switch is a root navigation, not a push (ADR-012) ([7431340](https://github.com/polandy/JIT-Pack/commit/74313402c38e0ea433ae769db3d28b4c185bc5a5))
* **client:** the backup reminder is about the whole device (NFR-4.11) ([7a76501](https://github.com/polandy/JIT-Pack/commit/7a7650174c62cf8a309adc5a64ae6ff8609cf055))
* **client:** the membership lock covers the cluster, not one row (FR-25.21) ([42730de](https://github.com/polandy/JIT-Pack/commit/42730de09114e2512450f58d51835c7ee926e4d3))

## 0.2.0 (2026-08-28)


### ⚠ BREAKING CHANGES

* `items.category_id` is dropped and `UNIQUE (name, category_id)` becomes `UNIQUE (name)`, so an item's name is now its identity. Migration 022 renames colliding rows rather than deleting them — archived trips reach their master items through `trip_items.source_item_id` — which means an upgraded instance may show item names it did not write, of the form "Adapter (Technik)". The sync push also rejects `category_id` outright, so a client that has not been updated will have its item mutations refused rather than silently ignored.
* multi-user deployments now require JITPACK_SESSION_SECRET and the IdP client registered as confidential (client_secret_basic); externally minted HS256 tokens remain valid only without OIDC configured.
* clients may no longer push templates.is_published — the column is rejected as not syncable. Quantity formulas, the unit column, the consumable flag and the traveler profile type are removed from the schema and the wire format; legacy portable files still import, unknown fields being ignored.

### ci+docs

* publish both images on release, a deploy example, and the operator manual for a multi-user instance ([980ba1b](https://github.com/polandy/JIT-Pack/commit/980ba1b02d4f3bd1e1b7ed9f0c7bcbc5a33e3257))


### Features

* a packing claim ends by decision, not on a clock (FR-5.7, ADR-028) ([8c57a19](https://github.com/polandy/JIT-Pack/commit/8c57a193d442d11fc30ab89cca00dc5d3d576d2b))
* a purchase records the list it was bought from (FR-25.11j) ([d8ec0bc](https://github.com/polandy/JIT-Pack/commit/d8ec0bc4ec851ed29dd0d448ada203af6c885665))
* a retired master row has a way back (FR-24.3, ADR-033) ([e5785d9](https://github.com/polandy/JIT-Pack/commit/e5785d9b2ec969fdac5fc73765fc12bcaa0375ea))
* add cmd/jitpackd main wiring with env-based config ([a6fd726](https://github.com/polandy/JIT-Pack/commit/a6fd7266e4cb76bec158f8d60501f1e5aa7f687c))
* add Dockerfile and docker-compose.yml ([5ae0a7a](https://github.com/polandy/JIT-Pack/commit/5ae0a7a2771172987b04423248c3bde615bfd726))
* add global UI patterns (G-2, G-9) and M1/M2 screens ([952c01b](https://github.com/polandy/JIT-Pack/commit/952c01bd3117b52fabff67bc433088bffe95c691))
* add master store, M5/M7/M9 screens, inline quick-add and skip ([233c082](https://github.com/polandy/JIT-Pack/commit/233c082f8680d6a239a5a759813c7aa453d68306))
* add portable YAML export/import for templates and trips ([74521f5](https://github.com/polandy/JIT-Pack/commit/74521f56c737c94a6f839dbe36812fbeff039eb3))
* add preparation todos (FR-7.3), multi-table sync, and trip roles (FR-4.5/4.7) ([1a20c0a](https://github.com/polandy/JIT-Pack/commit/1a20c0ae784af92108f2aa89c7a544e86afac026))
* add RS256/JWKS authentication for multi-user mode ([001bf4d](https://github.com/polandy/JIT-Pack/commit/001bf4d44c817a0db5c2ab1a9980f87cba1e5843))
* add sync orchestrator, mutation helpers, M8/M10 editors ([57953a8](https://github.com/polandy/JIT-Pack/commit/57953a805c9e20289b1acf4b11d2e6b53f4b69fa))
* add trip store, quantity stepper, and M4 packing list ([39e5165](https://github.com/polandy/JIT-Pack/commit/39e51657b56a8962a9daedfecfc59062af838162))
* add WebSocket hub with presence and trip.changed notifications ([2648f1c](https://github.com/polandy/JIT-Pack/commit/2648f1cd4147c9dd1ce1b799567fe484d69ed229))
* align WS wire protocol with spec §7, add presence facepile (G-10) ([0bba7a0](https://github.com/polandy/JIT-Pack/commit/0bba7a0c86e2952e95d52b815a335af430b88797))
* an item and a template can carry one emoji as its mark (§3.28) ([54882e6](https://github.com/polandy/JIT-Pack/commit/54882e6bcda7bf07d0a7d9a295716427101f706a))
* **api:** a path is declared once, in the contract (NFR-4.14) ([efcb593](https://github.com/polandy/JIT-Pack/commit/efcb5936c632a2bfb863d16247751d67232f9c2a))
* **api:** every response body is a declared type (NFR-4.14) ([146b798](https://github.com/polandy/JIT-Pack/commit/146b7989b224f8c6dfb27e8f8a7c989e0c982f36))
* **api:** in-app notification system (FR-6.2) ([8b5e651](https://github.com/polandy/JIT-Pack/commit/8b5e651034539814bf00e76b3f41d57c77edf1ea))
* **api:** instance user management (Addendum 3.23, FR-23.1-23.4) ([3a9bb1e](https://github.com/polandy/JIT-Pack/commit/3a9bb1eee0e84e4ed131a14cae0e4643f7ce9a0d))
* **api:** master-partition sync endpoints + master.changed WS event ([773ded6](https://github.com/polandy/JIT-Pack/commit/773ded6425bb041fffa0203f5031a8983d66f81e))
* **api:** NFR-4.5 backup endpoints and GET /me ([1069916](https://github.com/polandy/JIT-Pack/commit/106991663fb88cd2d4d8bc12af574e4da198fd07))
* **api:** one checked contract between client and server (NFR-4.14, ADR-026) ([2939a32](https://github.com/polandy/JIT-Pack/commit/2939a32f132d4625f47b4822789da1b3516f6378))
* **api:** sync trip_members through the master partition (FR-4.5/4.7) ([8840eac](https://github.com/polandy/JIT-Pack/commit/8840eacefdfcaacc35ba0e998d2095451bcb7aa7))
* **api:** Web Push delivery with self-generated VAPID keys (NFR-4.6) ([73a42ce](https://github.com/polandy/JIT-Pack/commit/73a42ce2341c8fadb904de66aeceae04ca785874))
* brand logo + item reference photos (FR-22) ([#14](https://github.com/polandy/JIT-Pack/issues/14)) ([3629546](https://github.com/polandy/JIT-Pack/commit/36295461586c97bbd0f914e3d9c921bdbf6db87c))
* broker first-party sessions from the IdP (ADR-007) ([44b7e1e](https://github.com/polandy/JIT-Pack/commit/44b7e1e88bd3288096ae0d145cebb742080cd4ab))
* **client:** a group change is asked about, not applied to a trip (FR-27.4) ([ab00da7](https://github.com/polandy/JIT-Pack/commit/ab00da70d673c655360aad44ffd71670d49c6b90))
* **client:** a merged push says so, instead of passing for an applied one ([bb6d3f7](https://github.com/polandy/JIT-Pack/commit/bb6d3f7296fa8a33ce9e9e42ec6a5e6e1fdab299))
* **client:** a packing claim can be given back, and an expired one says so (G-3) ([2da785f](https://github.com/polandy/JIT-Pack/commit/2da785febea15340dba3fd647c8d9c5307973296))
* **client:** a planning trip follows the groups it was generated from (FR-27.4) ([8b3160c](https://github.com/polandy/JIT-Pack/commit/8b3160ca879fe1fd11023312099a385d9cc6e544))
* **client:** a row can be handed to somebody (FR-25.19, E2E-FLOW-02) ([2690ffd](https://github.com/polandy/JIT-Pack/commit/2690ffdc78324dd2cf0f507a25e0f88f2fbec1e3))
* **client:** a taken template or series name is caught before the push (FR-1.6, FR-13.1) ([1bc69e5](https://github.com/polandy/JIT-Pack/commit/1bc69e54d13ecf59dab2b23a0b6e7e347eb4a973))
* **client:** a trip can be edited after it is created (FR-2.7, M22) ([443327d](https://github.com/polandy/JIT-Pack/commit/443327dc45180f6c5c4ddc43c9f1955dfa647ef4))
* **client:** a trip is judged from the list, and once at the end (FR-9.3, FR-9.4) ([b2cf7c0](https://github.com/polandy/JIT-Pack/commit/b2cf7c044f958627ae870c33c75d32cf219c5b04))
* **client:** a Vorlage shows its resulting items, and the ＋ answers where it is (FR-27.14, FR-27.6) ([3a46f47](https://github.com/polandy/JIT-Pack/commit/3a46f47771493995b82feb12ebe22bbb7b582b10))
* **client:** add a whole group to a running trip (FR-27.10) ([33ee96c](https://github.com/polandy/JIT-Pack/commit/33ee96ce9454729f1879dda72e99ab8a076b0208))
* **client:** an installable PWA that starts without a network (NFR-4.13) ([56f15a3](https://github.com/polandy/JIT-Pack/commit/56f15a3f9f456a6d79faf494b3d9284bf11d6a0f))
* **client:** Catppuccin theming, dark default (FR-21.1-21.4) ([d5c91b6](https://github.com/polandy/JIT-Pack/commit/d5c91b658902094c684bce9613b1b0057039478b))
* **client:** comment thread with flag-as-task in M5 (FR-7.1/7.2) ([09ff1f0](https://github.com/polandy/JIT-Pack/commit/09ff1f0fcc6f5a4efe845fb55ebbf16bc91fc79e))
* **client:** companion-item UI in M10/M3/M5/M4 (FR-20.1-20.4) ([52db616](https://github.com/polandy/JIT-Pack/commit/52db6163be6230b982657da7dbf48e1937c1ab69))
* **client:** composed templates reach the packing list (§3.27) ([caec7d1](https://github.com/polandy/JIT-Pack/commit/caec7d193bc6d05d1a3a8633440d11dd278a055f))
* **client:** dependency resolution domain logic (FR-20.2-20.4) ([6b7a3ec](https://github.com/polandy/JIT-Pack/commit/6b7a3ecd164dd12199eabc9d128d9e97e7aac6b6))
* **client:** Enter fires a wizard step's default action (G-16) ([690ce7c](https://github.com/polandy/JIT-Pack/commit/690ce7c1a46e82befca069a493f356aa9f77974d))
* **client:** finish the i18n migration — every screen but M17 speaks German (NFR-4.12) ([5f46e2c](https://github.com/polandy/JIT-Pack/commit/5f46e2cfd8859012511d853edccae185b7102b54))
* **client:** formula engine + template instantiation domain layer ([f43a82f](https://github.com/polandy/JIT-Pack/commit/f43a82f95b70f46804d9b9eea97aa644cd16857e))
* **client:** give colour three roles instead of one palette (FR-21.7) ([c9137b9](https://github.com/polandy/JIT-Pack/commit/c9137b9456f441de32e594d786533a88a024ce51))
* **client:** give depth, radius and elevation one token table (FR-21.8) ([39ed8ba](https://github.com/polandy/JIT-Pack/commit/39ed8ba3ba964c7744bba731be9ae11e83510a0a))
* **client:** give the app its own two faces and one type scale (FR-21.5/21.6) ([3d6693f](https://github.com/polandy/JIT-Pack/commit/3d6693f69d9a1719ffeb5dda26ce350041bff88a))
* **client:** in-app notification toasts, M17 prefs, Web Push registration (FR-6.2/NFR-4.6) ([5be6e89](https://github.com/polandy/JIT-Pack/commit/5be6e89766550984cb854d4e0c66e556acb952de))
* **client:** item-dependency sync wiring and runtime cascades (FR-20.2-20.4) ([3c3f4b1](https://github.com/polandy/JIT-Pack/commit/3c3f4b194a4ee604842db41d56c97f3ea979f8f7))
* **client:** Local Mode — IndexedDB persistence, M19 mode selection ([af9db9a](https://github.com/polandy/JIT-Pack/commit/af9db9a911c68ac88c5da9288c71d07519d2cb7c))
* **client:** look inside a group before taking it (FR-27.12) ([c077a91](https://github.com/polandy/JIT-Pack/commit/c077a91d0b0fc928f768e2c0067b04cbf29e5dea))
* **client:** M11 Container Management (FR-10.1–10.3) ([34ebeeb](https://github.com/polandy/JIT-Pack/commit/34ebeeb53171b0712a6c4eb4887f7917e2fa8c58))
* **client:** M12 Analytics (FR-8.2/10.4/14.3) ([13704cf](https://github.com/polandy/JIT-Pack/commit/13704cffdc90cf6a8bcd66c4e217775f299892d6))
* **client:** M13 Repack Mode (FR-11.1–11.3) + outbox push chunking ([43d4508](https://github.com/polandy/JIT-Pack/commit/43d4508b5e72f31be526bc74346337b7b83bcd52))
* **client:** M14 Post-Trip Review Assistant (FR-9.1/9.2) ([215d739](https://github.com/polandy/JIT-Pack/commit/215d73909e73a184d868840f3617f276f37199e9))
* **client:** M15 spreadsheet import wizard (FR-16.1-16.3, NFR-4.7) ([b81b5d3](https://github.com/polandy/JIT-Pack/commit/b81b5d30e919687b515db2ad6c943a44d66be9bb))
* **client:** M16 Series & Destination Profiles (FR-13.1-13.3) ([87d29b7](https://github.com/polandy/JIT-Pack/commit/87d29b71cb499c1ee589b07daa9247fc33cac417))
* **client:** M17 Settings joins the catalogue, closing the i18n migration (NFR-4.12) ([d273575](https://github.com/polandy/JIT-Pack/commit/d2735752db3d97ca91d2ae91281c88c87ebe4c95))
* **client:** M17 Settings page (FR-17.13, NFR-4.5 data section) ([31ccc4a](https://github.com/polandy/JIT-Pack/commit/31ccc4a0d3b7c0e32c5605508ecbcc39c7833c3a))
* **client:** M18 portable import preview (FR-18.4/18.5) ([3cd9d92](https://github.com/polandy/JIT-Pack/commit/3cd9d92a61cfef842680e2d3d1eaa055393b2122))
* **client:** M2 Share menu + member management page (FR-4.5/4.7) ([bcd71ad](https://github.com/polandy/JIT-Pack/commit/bcd71ad0c04ef8d57aae80d025f5ff46342b384d))
* **client:** M20 user administration + M17 entry (Addendum 3.23) ([0ce6f0b](https://github.com/polandy/JIT-Pack/commit/0ce6f0b66bc38f2488379093c4d4dc1de3edd822))
* **client:** M21 folds a finished trip back into templates (FR-27.5) ([feabd61](https://github.com/polandy/JIT-Pack/commit/feabd6180a0c73ebb23eb4275cc79a9a84af3482))
* **client:** M3 takes single items beside templates (FR-27.3) ([6e91936](https://github.com/polandy/JIT-Pack/commit/6e9193696ffbe3cfb6c2395f4acbb44103b6cfc5))
* **client:** M3 Trip Creation Wizard ([2ad15fc](https://github.com/polandy/JIT-Pack/commit/2ad15fc83c68586509ea8b73b515823e89bc6d2f))
* **client:** M4 and M5 can say a thing is deliberately not coming (FR-5.5) ([d472830](https://github.com/polandy/JIT-Pack/commit/d472830ed001fe0a9e8a5eb41ac1171d49742f95))
* **client:** M4 names its trip once, and the width decides where ([80791a9](https://github.com/polandy/JIT-Pack/commit/80791a93b3fb960888f89a12e699e250eb9ed829))
* **client:** M5 can mark an item unused, and M14 is tested through the app (FR-9.1) ([ee79465](https://github.com/polandy/JIT-Pack/commit/ee79465db35bd8a2ca1d2d21f84930aeb84f7a0d))
* **client:** M6 Shopping Views with FR-3.3 purchase transition ([d3dcbfb](https://github.com/polandy/JIT-Pack/commit/d3dcbfb5abb2f317170b082888551feb60cd445e))
* **client:** M8 recognises a Gruppe hiding in the loose positions (FR-27.15) ([04d96fe](https://github.com/polandy/JIT-Pack/commit/04d96fef42bac18cc606705578aeaa87697a09f8))
* **client:** make "looks right" assertable (ADR-013) ([97bd7c4](https://github.com/polandy/JIT-Pack/commit/97bd7c4b9cd11f4bad8c6f17f033e5e646d5ccb7))
* **client:** make a pack register, and give it one undo (FR-25.2) ([d19d744](https://github.com/polandy/JIT-Pack/commit/d19d744d3bf2a706226e9bfb4dd8c66f60ddba74))
* **client:** move every screen onto the type scale (FR-21.5) ([d5a7ce9](https://github.com/polandy/JIT-Pack/commit/d5a7ce9abc7061f0ea401d43938d7b958cebc797))
* **client:** OIDC token auto-refresh on expiry and 401 ([2b0ec11](https://github.com/polandy/JIT-Pack/commit/2b0ec119b132a7643d7475960228e53fa9bafe37))
* **client:** one header bar with a working back target (ADR-011) ([1722f99](https://github.com/polandy/JIT-Pack/commit/1722f991102784ca9181fb57d32da2a6c04a8add))
* **client:** portable YAML export UI (FR-18.2/18.3), closing FR-19.5 ([554f1a3](https://github.com/polandy/JIT-Pack/commit/554f1a3c157bf1ee1410355e6e35dad1f2050769))
* **client:** pre-fill the M19 server URL with the page origin (FR-19.1) ([019a158](https://github.com/polandy/JIT-Pack/commit/019a1584f3e86583f973a420ca27485554926f1a))
* **client:** rebuild M11 container management (FR-10.1–10.3, FR-24.5, FR-25.5) ([eff7d88](https://github.com/polandy/JIT-Pack/commit/eff7d888d2567e33eba98f42cc54824411111726))
* **client:** rebuild M12 analytics — slice taps filter M4 (FR-8.2, FR-25.11) ([1df7cc7](https://github.com/polandy/JIT-Pack/commit/1df7cc77b60295a67244226ba5b0bb55650dc8c6))
* **client:** rebuild M14 as the group-aware review list (FR-9.2, FR-27.11) ([af76138](https://github.com/polandy/JIT-Pack/commit/af7613836d1f5cbfd8fbccb11fb3895e9195c9fe))
* **client:** rebuild M7 around the two template scopes (§3.27, FR-27.1/27.6) ([e091f98](https://github.com/polandy/JIT-Pack/commit/e091f98cf92796727326ec638001dcfd1e85001c))
* **client:** rebuild M8 as the scope-shaped template editor (§3.27, FR-27.2/27.6/27.7) ([8dc89d8](https://github.com/polandy/JIT-Pack/commit/8dc89d8ac4ff47c4cbea8f2542765c88ba2c4a3a))
* **client:** rebuild the packing list and item detail from the concept (§3.25) ([dd560d4](https://github.com/polandy/JIT-Pack/commit/dd560d44981ae4bb83591f41a2708e6993352a25))
* **client:** replace the Check-Latch brand mark with the Packed Backpack ([77ef416](https://github.com/polandy/JIT-Pack/commit/77ef416541331e9f5ad6083a95993a618db9faeb))
* **client:** the composer's second posture — the inventory browse-sheet (FR-25.13d) ([75e3e40](https://github.com/polandy/JIT-Pack/commit/75e3e40664979a73a06683bf87e729cd5ecb3298))
* **client:** the content stops at a column, and M4's rare actions move behind a menu (UX-17, UX-13) ([1c2ab06](https://github.com/polandy/JIT-Pack/commit/1c2ab06893f9d399cdc77e1a8ad9a5516d945494))
* **client:** the device backup carries how a trip follows its groups (FR-27.4) ([46c1690](https://github.com/polandy/JIT-Pack/commit/46c1690de3df6b135413945a69ad0ffde275b5c8))
* **client:** the M3 review step reviews, not only counts (FR-2.6) ([8a518fb](https://github.com/polandy/JIT-Pack/commit/8a518fb094c3666c775e42f9ea1ba63d0ed19929))
* **client:** the M8 group picker can be searched (FR-27.13) ([5365973](https://github.com/polandy/JIT-Pack/commit/5365973474d09f6bc8f276cc848a19d6e50d91be))
* **client:** the quick-add offers chips before it asks for typing (FR-25.13c) ([8d5e4a3](https://github.com/polandy/JIT-Pack/commit/8d5e4a36226076c44400eab0ff5b71520a1ca9ce))
* **client:** the sync glyph explains itself and backs the device up (G-2, FR-19.6) ([#101](https://github.com/polandy/JIT-Pack/issues/101)) ([dab4317](https://github.com/polandy/JIT-Pack/commit/dab4317d81d873aa2b111dcd02a00ce328b1725a))
* **client:** the sync outbox survives a reload (B2, NFR-4.1a) ([61a790b](https://github.com/polandy/JIT-Pack/commit/61a790b02b40c3323022d903722e40e15a0e6c95))
* **client:** trip cloning (FR-12.1/12.2) ([2e0abce](https://github.com/polandy/JIT-Pack/commit/2e0abce33e20af9210d74b555791cf0b55fc4958))
* **client:** trip presence says who is behind, and M20 gets its first tests ([7a385df](https://github.com/polandy/JIT-Pack/commit/7a385df2934b1f20100ea33f10e6aaffdfeda462))
* **client:** trip_members sync + M3 sharing step (FR-4.5/4.7) ([ab41ae0](https://github.com/polandy/JIT-Pack/commit/ab41ae0512be6ec68b76661db02dd5e7bfe0e759))
* **client:** what is already here is not imported twice (FR-18.4, ADR-030) ([ae55882](https://github.com/polandy/JIT-Pack/commit/ae558827db0e0bc4bb462f298bef51b893b26c1b))
* close the packing concept — groups, assignment vs. record, shared templates ([259fdac](https://github.com/polandy/JIT-Pack/commit/259fdaca4808e331c9ec9072e4786bb2a7d02199))
* deletion is lifecycle-aware, for master items and templates (FR-24.3, ADR-032) ([01d974a](https://github.com/polandy/JIT-Pack/commit/01d974ab422c365ef4bca070c7cdd6aeb88c278b))
* export reminder, avatar crop, history suggestions (NFR-4.11 / FR-17.13 / FR-14.2) ([#17](https://github.com/polandy/JIT-Pack/issues/17)) ([2c8d9b5](https://github.com/polandy/JIT-Pack/commit/2c8d9b5d4c4af0aed26ccc6abbf6e5f42e88d4a0))
* items carry a set of tags instead of one category (§3.24) ([6ea6577](https://github.com/polandy/JIT-Pack/commit/6ea65779eb1f845b14e843266fb56a180ed9c592))
* make trip start_date optional (FR-2.1a) ([b849ebd](https://github.com/polandy/JIT-Pack/commit/b849ebde4bc39e30fde932e37c79e913fdd4f012))
* OIDC code-exchange broker + client login flow (spec §2) ([f3278ae](https://github.com/polandy/JIT-Pack/commit/f3278aee01128af72eb9b3567f067bdf1b469dc8))
* Packing Now with collision locking (FR-5.2/5.3, G-3) ([d991df7](https://github.com/polandy/JIT-Pack/commit/d991df73e183d92227856eb3d2a71af7b21abbe7))
* per-trip conflict log endpoint + G-2 conflict view ([3f7efe0](https://github.com/polandy/JIT-Pack/commit/3f7efe0ec5930bdf1f4731359bde02fc7c0fa37e))
* portable YAML carries a Vorlage's groups and their tasks (FR-27.1/27.7) ([762cdbb](https://github.com/polandy/JIT-Pack/commit/762cdbb36d425cd39b5180da7ff39bd1c7c3fbb4))
* **portable:** a backup gives back what it saved — status, marks and tags (ADR-024) ([277c8bd](https://github.com/polandy/JIT-Pack/commit/277c8bd5c98aa32ad22f518198fbc9707a641e59))
* retire the traveler type and split the packing record (FR-25.9, FR-25.19) ([935e1f1](https://github.com/polandy/JIT-Pack/commit/935e1f177ab1d3faa463404c9cadfd42d601c3be))
* scaffold Vue 3 + Capacitor client with core sync composables ([b2873a2](https://github.com/polandy/JIT-Pack/commit/b2873a25372154fcc7d37bc66cc90f9109e5b78a))
* small client gaps — M2 delete, M7/M9 creation, G-4 highlight ([#16](https://github.com/polandy/JIT-Pack/issues/16)) ([30a59e9](https://github.com/polandy/JIT-Pack/commit/30a59e9137f358914bada026989ed22f76a353af))
* **store:** item_dependencies master-partition sync (FR-20.1) ([0ce3be0](https://github.com/polandy/JIT-Pack/commit/0ce3be067d3250f90e7551dab2fd496d182bba50))
* **store:** master-partition sync — ApplyMasterMutation, PullMaster, migration 005 ([7e9e84f](https://github.com/polandy/JIT-Pack/commit/7e9e84fffa7558e9b5bdcf52f2ff0ab5d1184e1f))
* **store:** one always-current schema.sql instead of a migration chain ([39b4534](https://github.com/polandy/JIT-Pack/commit/39b4534e86106b495fcf75c8118aa14ddaa95bc9))
* **store:** sync trip_series and destination_* via the master partition (FR-13.1/13.2) ([d0fc380](https://github.com/polandy/JIT-Pack/commit/d0fc3805e0a20dec8e8f3edd256ffb8bf072cd27))
* **sync:** a recorded conflict can be taken back (NFR-4.2a, ADR-023) ([afea2d3](https://github.com/polandy/JIT-Pack/commit/afea2d3e9ff9400b8e47fcfbd3a4cb34d565e218))


### Bug Fixes

* a refused mutation repairs the row it refused (Sync-API §5, ADR-031) ([0d6f9d7](https://github.com/polandy/JIT-Pack/commit/0d6f9d7c7afb8195568c349f565763744a44d85e))
* a rejected mutation says why, and G-2 shows it (Sync-API §5, FR-9.2) ([7e96106](https://github.com/polandy/JIT-Pack/commit/7e96106e225871b8f39d968e66c688573cdf2bd4))
* **api:** a failure that changes nothing for the caller still says so ([4fb4c6d](https://github.com/polandy/JIT-Pack/commit/4fb4c6d6b667552b2f0c6661cf943a20696dcc20))
* **api:** the server stamps every actor column, on every op (invariant 3) ([e6dc0fd](https://github.com/polandy/JIT-Pack/commit/e6dc0fdf1239754d8f935f63c60af667e982a04b))
* **client:** a backup can be read back, and lands where its trips are (NFR-4.11, FR-18.4) ([35f73ae](https://github.com/polandy/JIT-Pack/commit/35f73aec56d94457553c71939d3c3601a2ebda12))
* **client:** a bottom toast is presented above the tab bar, not onto it (FR-9.4) ([9acbfe3](https://github.com/polandy/JIT-Pack/commit/9acbfe3ebd7bf817f5645c6afa0252a2af22df73))
* **client:** a clone of an unopened trip carries its items, not an absence (FR-12.1, ADR-033) ([8fb9351](https://github.com/polandy/JIT-Pack/commit/8fb9351f3c6da9dfb13d84a0140a3dc629accb6b))
* **client:** a partition drains once at a time (Sync-API §4) ([0f2f12f](https://github.com/polandy/JIT-Pack/commit/0f2f12f5ba9327950ef14b6870e4f24eed8a60e8))
* **client:** a screen reachable from anywhere gives back the screen it came from ([968aaaf](https://github.com/polandy/JIT-Pack/commit/968aaafb2738b87b2e3f0aa2699f50a094855cbf))
* **client:** a trip's two dates bound each other (FR-2.1d) ([8cf09e6](https://github.com/polandy/JIT-Pack/commit/8cf09e63d1e8000a29f71b6a0b2226ae666a3ff0))
* **client:** an inventory is not a matrix — M15 imports one without a trip column (FR-16.1) ([ce3c037](https://github.com/polandy/JIT-Pack/commit/ce3c037463e791d6519a523146effb9be3481b16))
* **client:** an optimistic row is a whole row, not the fields the form changed ([b56331c](https://github.com/polandy/JIT-Pack/commit/b56331c18ecffc6d5864ecedf400e1b9834a2c3f))
* **client:** browser back with the M5 sheet open closes it, not the trip ([2e44956](https://github.com/polandy/JIT-Pack/commit/2e44956230be3134e9a8f6658881f654cbe9db0a))
* **client:** date and file controls wear the theme and the locale (UX-6, ADR-035) ([d054e4d](https://github.com/polandy/JIT-Pack/commit/d054e4df050858c46f89b4d10812c1c761f7bbd5))
* **client:** dates, value and the greeting learn the locale (UX-5, UX-11, UX-15) ([bd26ac0](https://github.com/polandy/JIT-Pack/commit/bd26ac00a62d6df143b17a80e65ba8dfd230482a))
* **client:** drop the pop action from back, and cover the list round trip ([6b95a6d](https://github.com/polandy/JIT-Pack/commit/6b95a6de42f1454a1837a3ab01eef7d18ab965f2))
* **client:** G-3's lock reaches the sheet, names its holder, and takes its window from the instance (§7) ([2a1225a](https://github.com/polandy/JIT-Pack/commit/2a1225a3634c1f2dd66c42875334f266835b12df))
* **client:** M10's saved-item sections speak the catalogue (NFR-4.12) ([638402f](https://github.com/polandy/JIT-Pack/commit/638402f1164ddf6d489dd7fca9e3c4b32b2188e0))
* **client:** M15 imports the spreadsheet people actually keep (FR-16.1/16.2) ([fd1d5f8](https://github.com/polandy/JIT-Pack/commit/fd1d5f8a2047c1c1d7e70b9bb243f64bafd3bd30))
* **client:** M22 drops the traveller remove control instead of disabling it (FR-2.7) ([be54072](https://github.com/polandy/JIT-Pack/commit/be54072de004220e9644ab6337159a2ad0c70038))
* **client:** M4 comes back where it was left, and M12's trend has its positive case ([2607317](https://github.com/polandy/JIT-Pack/commit/26073179d926ebe105f41e2d71cffc5c1f811909))
* **client:** M4's control column holds one width, so item names line up (UX-9) ([a94d440](https://github.com/polandy/JIT-Pack/commit/a94d4403f4753736ce939e8b1b213b1db1312212))
* **client:** make type-check pass so npm run build works ([faeb5e4](https://github.com/polandy/JIT-Pack/commit/faeb5e468beca8c614c073a28c4e01ea3975e945))
* **client:** persist editor mutations through the orchestrator ([df9d71e](https://github.com/polandy/JIT-Pack/commit/df9d71e028059db624a4528b3b7e819402d05a5b))
* **client:** plain-HTTP instances can write again (NFR-4.2a) ([87c3532](https://github.com/polandy/JIT-Pack/commit/87c353252446f64334160f8b941660eb636b111d))
* **client:** replace multi-statement inline handler broken by prettier ([249ec8e](https://github.com/polandy/JIT-Pack/commit/249ec8e1a91f3a25af75c875b6e18795cdfe2b61))
* **client:** settings accepts human names, and the gear stops pointing at itself (FR-17.13, G-9) ([cb6317b](https://github.com/polandy/JIT-Pack/commit/cb6317b3f5d72f6003c0d7ddade7c8620d546c06))
* **client:** stop a failed local write from silencing the session (FR-19.2) ([51ef807](https://github.com/polandy/JIT-Pack/commit/51ef8071921faf347785c0fc2e87b6a14f9c2159))
* **client:** the conflict log is read by a person, not by the wire (NFR-4.2a) ([f717ef2](https://github.com/polandy/JIT-Pack/commit/f717ef2f67c3bf934db8006f79b9e77aa57f144a))
* **client:** the import sends an item before the tag that points at it, and folds a name the sheet lists twice (FR-16.3/24.2) ([aba931b](https://github.com/polandy/JIT-Pack/commit/aba931b450d96f18dc06754684a90e46b0106cf5))
* **client:** the luggage empty state stops contradicting itself, and M5's pack box names itself (UX-8, UX-10) ([e8d3570](https://github.com/polandy/JIT-Pack/commit/e8d357083310cbb26d544dc68836f9104217b228))
* **client:** the M9 tag axis stands clear of the first group heading (UX-4) ([f0e9e63](https://github.com/polandy/JIT-Pack/commit/f0e9e63f8e141e08c69cc6d2ff5bfd9ffaa7943e))
* **client:** the pull takes every page, not only the first (Sync-API §4) ([abe88a5](https://github.com/polandy/JIT-Pack/commit/abe88a5e4e2459086f7b6319b8ae74d37cdf83cb))
* **client:** the sheet header's ✓ and ✕ are one cluster (G-14/FR-25.15) ([b3ae7bc](https://github.com/polandy/JIT-Pack/commit/b3ae7bc6e99f667d3340ecda6a097b18e7d2534d))
* **client:** the sync sheet's glyph sits on its title, and the empty log is inset ([2c53eb5](https://github.com/polandy/JIT-Pack/commit/2c53eb55e553f9c31d7757646965e6a0796577a6))
* **client:** the tag offers become a shelf, and icon-only buttons name themselves (UX-13, UX-14) ([cdb8eab](https://github.com/polandy/JIT-Pack/commit/cdb8eabe6c2d9157b91da1a6dfa1ae92f4a06902))
* **client:** the trip list stops reporting a packed trip as untouched (FR-2.3, ADR-033) ([8929e22](https://github.com/polandy/JIT-Pack/commit/8929e22e356ee129c27ee68686f7b3f7a89ddebb))
* harden the session broker and authorize the routes that only authenticated ([19d9826](https://github.com/polandy/JIT-Pack/commit/19d9826a3f8ca9b990c4cb46adc69f41cec42366))
* **ops:** forward the browser's Host with its port, or /ws is refused ([51f1f96](https://github.com/polandy/JIT-Pack/commit/51f1f96b1bd563c8cfb91b710bab607bcdf0a837))
* require email_verified before granting the instance-admin role ([517c340](https://github.com/polandy/JIT-Pack/commit/517c34090312bcd7a14cd71daad5253f645174c2))
* **store:** the schema enforces its own rules, and declines the ones that would cost a change (FR-27.1, FR-4.5, FR-1.6) ([e292153](https://github.com/polandy/JIT-Pack/commit/e2921537ad2ffe57877aa267b7bc494387f0a5e0))
* **sync:** a field carried along unchanged is not a conflict (NFR-4.2a) ([4d3f0ab](https://github.com/polandy/JIT-Pack/commit/4d3f0ab3e1ee9c5bc6394496eb838a5c677077de))
* **sync:** a field is compared against its own clock, and packed beats only packing_now (NFR-4.2a) ([918d68c](https://github.com/polandy/JIT-Pack/commit/918d68cdf9f2559a8c7360dcff2fca86943a3f87))
* **sync:** a refused mutation is answered as a refusal, and the client hears it ([4253692](https://github.com/polandy/JIT-Pack/commit/4253692a46881c4ab3c0ad8af0da3decf0a83eee))
* **sync:** a trip mutation is confined to the trip its endpoint names ([8143cea](https://github.com/polandy/JIT-Pack/commit/8143ceaa31042627633de0148bdeace989fbaa2f))
* **sync:** the master partition's conflict log is readable ([aa6cd75](https://github.com/polandy/JIT-Pack/commit/aa6cd756b850055b0290cf78d284423f39f1dc43))
* **sync:** the pull cursor comes from a pull, never from a push ([cc9a195](https://github.com/polandy/JIT-Pack/commit/cc9a195ba6ce3cd94ddaf4fd80667bb20dfc19f6))
* **sync:** the pull snapshot carries its clock, and every cascade is tombstoned (NFR-4.2a) ([bbdc736](https://github.com/polandy/JIT-Pack/commit/bbdc73667c3a0d65aecec7ae800781a5c08043af))


### Miscellaneous Chores

* restart versioning at 0.1.0 ([ff33ee1](https://github.com/polandy/JIT-Pack/commit/ff33ee1e8654a1b55aa47e3c562ce792fd4831f8))

## 0.1.0 (2026-07-10)


### Features

* add cmd/jitpackd main wiring with env-based config ([5ed5d03](https://github.com/polandy/JIT-Pack/commit/5ed5d03f998b9bbb756b59834d963b9eb6fe45d1))
* add Dockerfile and docker-compose.yml ([9dc4b88](https://github.com/polandy/JIT-Pack/commit/9dc4b886557d8e3ab40cf1ff82a92b9f42dc4635))
* add global UI patterns (G-2, G-9) and M1/M2 screens ([ffd278e](https://github.com/polandy/JIT-Pack/commit/ffd278e89ea4991a39229db546dbcea3b8d3e0fe))
* add master store, M5/M7/M9 screens, inline quick-add and skip ([c3f001b](https://github.com/polandy/JIT-Pack/commit/c3f001bb7a24e5463541f08086b9e6ed8261dc78))
* add portable YAML export/import for templates and trips ([b4b4aff](https://github.com/polandy/JIT-Pack/commit/b4b4aff375cfdc50e10c02ca99b7d8b72ba4b1f0))
* add preparation todos (FR-7.3), multi-table sync, and trip roles (FR-4.5/4.7) ([26b7fdd](https://github.com/polandy/JIT-Pack/commit/26b7fddcc315c953e2776e65a9925cf592b9d8ca))
* add RS256/JWKS authentication for multi-user mode ([f188151](https://github.com/polandy/JIT-Pack/commit/f188151a7f0fff8dda2d486f712324db755f506a))
* add sync orchestrator, mutation helpers, M8/M10 editors ([431dffc](https://github.com/polandy/JIT-Pack/commit/431dffcb9805b28ef9fc62335543070f50eb5f72))
* add trip store, quantity stepper, and M4 packing list ([08fb737](https://github.com/polandy/JIT-Pack/commit/08fb737ecd87e8db5cb2fe0cd334a71b9bac9429))
* add WebSocket hub with presence and trip.changed notifications ([ad62091](https://github.com/polandy/JIT-Pack/commit/ad62091bcbbeaa748b551f7ed159ec5a9d827820))
* align WS wire protocol with spec §7, add presence facepile (G-10) ([7c1b284](https://github.com/polandy/JIT-Pack/commit/7c1b28469d6bb43661298466f30cd857c0f8eb1b))
* **api:** in-app notification system (FR-6.2) ([cfd8ed2](https://github.com/polandy/JIT-Pack/commit/cfd8ed29afec28a67e3d5aaa397196cf20a3bae9))
* **api:** instance user management (Addendum 3.23, FR-23.1-23.4) ([456bc56](https://github.com/polandy/JIT-Pack/commit/456bc56daa0dd377bc1858ecb4aaffab2542152a))
* **api:** master-partition sync endpoints + master.changed WS event ([1cba79e](https://github.com/polandy/JIT-Pack/commit/1cba79e7f4e922566064017c16a87d67c37563d0))
* **api:** NFR-4.5 backup endpoints and GET /me ([1548dcf](https://github.com/polandy/JIT-Pack/commit/1548dcff2ee196a2bc69bcf6c8913ce805aa64ea))
* **api:** sync trip_members through the master partition (FR-4.5/4.7) ([3e873a1](https://github.com/polandy/JIT-Pack/commit/3e873a10c5e7382dc2feaa9dc254be614096f440))
* **api:** Web Push delivery with self-generated VAPID keys (NFR-4.6) ([58d4346](https://github.com/polandy/JIT-Pack/commit/58d434636e497e3b4ece7c7972255b5e6083a00a))
* **client:** Catppuccin theming, dark default (FR-21.1-21.4) ([531391a](https://github.com/polandy/JIT-Pack/commit/531391a2bfcd4c10a36e462e2f2cee351c427913))
* **client:** comment thread with flag-as-task in M5 (FR-7.1/7.2) ([105ee6e](https://github.com/polandy/JIT-Pack/commit/105ee6ef1406e0922752a370e85614f960dc1910))
* **client:** companion-item UI in M10/M3/M5/M4 (FR-20.1-20.4) ([c279689](https://github.com/polandy/JIT-Pack/commit/c279689c82933681124650b821079a66e70a5723))
* **client:** dependency resolution domain logic (FR-20.2-20.4) ([304b38f](https://github.com/polandy/JIT-Pack/commit/304b38f7aa1ca5e34a629e37c35aceea11c1732f))
* **client:** formula engine + template instantiation domain layer ([836fe8e](https://github.com/polandy/JIT-Pack/commit/836fe8ecfe5cadb89f1ccd79e50a60deae8f0640))
* **client:** in-app notification toasts, M17 prefs, Web Push registration (FR-6.2/NFR-4.6) ([5055df2](https://github.com/polandy/JIT-Pack/commit/5055df2bd373de8f6886597367187424042c182b))
* **client:** item-dependency sync wiring and runtime cascades (FR-20.2-20.4) ([c362389](https://github.com/polandy/JIT-Pack/commit/c36238976b22a50b98e2c5ded5eaed6b2446b25a))
* **client:** Local Mode — IndexedDB persistence, M19 mode selection ([bb8c0ce](https://github.com/polandy/JIT-Pack/commit/bb8c0ce12746edd94408b0f59a35b8d7bc1efa8f))
* **client:** M11 Container Management (FR-10.1–10.3) ([418a0c3](https://github.com/polandy/JIT-Pack/commit/418a0c31137fb99be5f577303301cd7ab6d9a020))
* **client:** M12 Analytics (FR-8.2/10.4/14.3) ([cdb84ae](https://github.com/polandy/JIT-Pack/commit/cdb84ae0d5db13c45224ddc1d17e3c133ab44189))
* **client:** M13 Repack Mode (FR-11.1–11.3) + outbox push chunking ([e2c11e1](https://github.com/polandy/JIT-Pack/commit/e2c11e184780a01962f9c2734dea8242319675fb))
* **client:** M14 Post-Trip Review Assistant (FR-9.1/9.2) ([4527403](https://github.com/polandy/JIT-Pack/commit/45274036072ae0ed73bf9ecdfdb078b5b8a402ce))
* **client:** M15 spreadsheet import wizard (FR-16.1-16.3, NFR-4.7) ([3282edd](https://github.com/polandy/JIT-Pack/commit/3282eddc6fb5207315c533e5adf45b8b4c4b30e5))
* **client:** M16 Series & Destination Profiles (FR-13.1-13.3) ([1a44a2c](https://github.com/polandy/JIT-Pack/commit/1a44a2cf9b9fdafd83c95f45800eaaa4d5aeb77b))
* **client:** M17 Settings page (FR-17.13, NFR-4.5 data section) ([a93e033](https://github.com/polandy/JIT-Pack/commit/a93e03342ce1279bd170d87cd6ce8ba7f8102b3f))
* **client:** M18 portable import preview (FR-18.4/18.5) ([065e388](https://github.com/polandy/JIT-Pack/commit/065e388467ab742bcf03f978b8319d7a73603020))
* **client:** M2 Share menu + member management page (FR-4.5/4.7) ([13949d4](https://github.com/polandy/JIT-Pack/commit/13949d444cf3e9017975308436a4b475f0908741))
* **client:** M20 user administration + M17 entry (Addendum 3.23) ([35d737b](https://github.com/polandy/JIT-Pack/commit/35d737bba601e8d48e2e8b74cf1cb5ee081f9ba4))
* **client:** M3 Trip Creation Wizard ([4de8071](https://github.com/polandy/JIT-Pack/commit/4de8071bfe44c3b012e839d5874956d9722b813e))
* **client:** M6 Shopping Views with FR-3.3 purchase transition ([39891d3](https://github.com/polandy/JIT-Pack/commit/39891d32b5a3238eeb1dafec860268692c64b061))
* **client:** OIDC token auto-refresh on expiry and 401 ([d91e4d4](https://github.com/polandy/JIT-Pack/commit/d91e4d413d51b12e674d6ea0177a8e7ff4f913f7))
* **client:** portable YAML export UI (FR-18.2/18.3), closing FR-19.5 ([1cb8e9e](https://github.com/polandy/JIT-Pack/commit/1cb8e9e9f7b780f12719e346279330d19e203ee2))
* **client:** trip cloning (FR-12.1/12.2) ([c26b8ce](https://github.com/polandy/JIT-Pack/commit/c26b8ceeef59373939611cb9ef30edfecfc8412a))
* **client:** trip_members sync + M3 sharing step (FR-4.5/4.7) ([4d01c4a](https://github.com/polandy/JIT-Pack/commit/4d01c4aa75bb52add33b70147ad5597f14a0f8bd))
* make trip start_date optional (FR-2.1a) ([cab8506](https://github.com/polandy/JIT-Pack/commit/cab850696fe296ef258adc78a27b3ba91f8784c4))
* OIDC code-exchange broker + client login flow (spec §2) ([7d22788](https://github.com/polandy/JIT-Pack/commit/7d227881f720a5cfb07066db72cabbac7598f354))
* Packing Now with collision locking (FR-5.2/5.3, G-3) ([d9d849d](https://github.com/polandy/JIT-Pack/commit/d9d849d24754358c10713b20cb0e2dea4d94c736))
* per-trip conflict log endpoint + G-2 conflict view ([deb09fd](https://github.com/polandy/JIT-Pack/commit/deb09fd40fa6217731bebeb558e497c4ce1cab6c))
* scaffold Vue 3 + Capacitor client with core sync composables ([cf0d558](https://github.com/polandy/JIT-Pack/commit/cf0d558497a3f9ce923bef3b949ff4c90cc70482))
* **store:** item_dependencies master-partition sync (FR-20.1) ([7866648](https://github.com/polandy/JIT-Pack/commit/7866648bb04e477bfd02940f4043fda7be8ef467))
* **store:** master-partition sync — ApplyMasterMutation, PullMaster, migration 005 ([c73c83b](https://github.com/polandy/JIT-Pack/commit/c73c83bc459ee7d37eba7b3ee1789997e56cfc69))
* **store:** sync trip_series and destination_* via the master partition (FR-13.1/13.2) ([4d3380e](https://github.com/polandy/JIT-Pack/commit/4d3380e4c52308d1ebebb882bbc92ecd595ee97b))


### Bug Fixes

* **client:** make type-check pass so npm run build works ([23ce745](https://github.com/polandy/JIT-Pack/commit/23ce745066a6746f5ae8cc7ed0de57e17fad6ce3))
* **client:** persist editor mutations through the orchestrator ([f1c4898](https://github.com/polandy/JIT-Pack/commit/f1c489833672642e21ceea386496f3a714213c6a))
* **client:** replace multi-statement inline handler broken by prettier ([9bf97a8](https://github.com/polandy/JIT-Pack/commit/9bf97a87e051295472129b762a03ae9900a3142f))


### Miscellaneous Chores

* restart versioning at 0.1.0 ([fea2ce8](https://github.com/polandy/JIT-Pack/commit/fea2ce84baf268f3081b70ab1d8e07ff1ccba19a))
