# Changelog

## 0.1.0 (2026-07-11)


### Features

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
* **api:** in-app notification system (FR-6.2) ([8b5e651](https://github.com/polandy/JIT-Pack/commit/8b5e651034539814bf00e76b3f41d57c77edf1ea))
* **api:** instance user management (Addendum 3.23, FR-23.1-23.4) ([3a9bb1e](https://github.com/polandy/JIT-Pack/commit/3a9bb1eee0e84e4ed131a14cae0e4643f7ce9a0d))
* **api:** master-partition sync endpoints + master.changed WS event ([773ded6](https://github.com/polandy/JIT-Pack/commit/773ded6425bb041fffa0203f5031a8983d66f81e))
* **api:** NFR-4.5 backup endpoints and GET /me ([1069916](https://github.com/polandy/JIT-Pack/commit/106991663fb88cd2d4d8bc12af574e4da198fd07))
* **api:** sync trip_members through the master partition (FR-4.5/4.7) ([8840eac](https://github.com/polandy/JIT-Pack/commit/8840eacefdfcaacc35ba0e998d2095451bcb7aa7))
* **api:** Web Push delivery with self-generated VAPID keys (NFR-4.6) ([73a42ce](https://github.com/polandy/JIT-Pack/commit/73a42ce2341c8fadb904de66aeceae04ca785874))
* brand logo + item reference photos (FR-22) ([#14](https://github.com/polandy/JIT-Pack/issues/14)) ([3629546](https://github.com/polandy/JIT-Pack/commit/36295461586c97bbd0f914e3d9c921bdbf6db87c))
* **client:** Catppuccin theming, dark default (FR-21.1-21.4) ([d5c91b6](https://github.com/polandy/JIT-Pack/commit/d5c91b658902094c684bce9613b1b0057039478b))
* **client:** comment thread with flag-as-task in M5 (FR-7.1/7.2) ([09ff1f0](https://github.com/polandy/JIT-Pack/commit/09ff1f0fcc6f5a4efe845fb55ebbf16bc91fc79e))
* **client:** companion-item UI in M10/M3/M5/M4 (FR-20.1-20.4) ([52db616](https://github.com/polandy/JIT-Pack/commit/52db6163be6230b982657da7dbf48e1937c1ab69))
* **client:** dependency resolution domain logic (FR-20.2-20.4) ([6b7a3ec](https://github.com/polandy/JIT-Pack/commit/6b7a3ecd164dd12199eabc9d128d9e97e7aac6b6))
* **client:** formula engine + template instantiation domain layer ([f43a82f](https://github.com/polandy/JIT-Pack/commit/f43a82f95b70f46804d9b9eea97aa644cd16857e))
* **client:** in-app notification toasts, M17 prefs, Web Push registration (FR-6.2/NFR-4.6) ([5be6e89](https://github.com/polandy/JIT-Pack/commit/5be6e89766550984cb854d4e0c66e556acb952de))
* **client:** item-dependency sync wiring and runtime cascades (FR-20.2-20.4) ([3c3f4b1](https://github.com/polandy/JIT-Pack/commit/3c3f4b194a4ee604842db41d56c97f3ea979f8f7))
* **client:** Local Mode — IndexedDB persistence, M19 mode selection ([af9db9a](https://github.com/polandy/JIT-Pack/commit/af9db9a911c68ac88c5da9288c71d07519d2cb7c))
* **client:** M11 Container Management (FR-10.1–10.3) ([34ebeeb](https://github.com/polandy/JIT-Pack/commit/34ebeeb53171b0712a6c4eb4887f7917e2fa8c58))
* **client:** M12 Analytics (FR-8.2/10.4/14.3) ([13704cf](https://github.com/polandy/JIT-Pack/commit/13704cffdc90cf6a8bcd66c4e217775f299892d6))
* **client:** M13 Repack Mode (FR-11.1–11.3) + outbox push chunking ([43d4508](https://github.com/polandy/JIT-Pack/commit/43d4508b5e72f31be526bc74346337b7b83bcd52))
* **client:** M14 Post-Trip Review Assistant (FR-9.1/9.2) ([215d739](https://github.com/polandy/JIT-Pack/commit/215d73909e73a184d868840f3617f276f37199e9))
* **client:** M15 spreadsheet import wizard (FR-16.1-16.3, NFR-4.7) ([b81b5d3](https://github.com/polandy/JIT-Pack/commit/b81b5d30e919687b515db2ad6c943a44d66be9bb))
* **client:** M16 Series & Destination Profiles (FR-13.1-13.3) ([87d29b7](https://github.com/polandy/JIT-Pack/commit/87d29b71cb499c1ee589b07daa9247fc33cac417))
* **client:** M17 Settings page (FR-17.13, NFR-4.5 data section) ([31ccc4a](https://github.com/polandy/JIT-Pack/commit/31ccc4a0d3b7c0e32c5605508ecbcc39c7833c3a))
* **client:** M18 portable import preview (FR-18.4/18.5) ([3cd9d92](https://github.com/polandy/JIT-Pack/commit/3cd9d92a61cfef842680e2d3d1eaa055393b2122))
* **client:** M2 Share menu + member management page (FR-4.5/4.7) ([bcd71ad](https://github.com/polandy/JIT-Pack/commit/bcd71ad0c04ef8d57aae80d025f5ff46342b384d))
* **client:** M20 user administration + M17 entry (Addendum 3.23) ([0ce6f0b](https://github.com/polandy/JIT-Pack/commit/0ce6f0b66bc38f2488379093c4d4dc1de3edd822))
* **client:** M3 Trip Creation Wizard ([2ad15fc](https://github.com/polandy/JIT-Pack/commit/2ad15fc83c68586509ea8b73b515823e89bc6d2f))
* **client:** M6 Shopping Views with FR-3.3 purchase transition ([d3dcbfb](https://github.com/polandy/JIT-Pack/commit/d3dcbfb5abb2f317170b082888551feb60cd445e))
* **client:** OIDC token auto-refresh on expiry and 401 ([2b0ec11](https://github.com/polandy/JIT-Pack/commit/2b0ec119b132a7643d7475960228e53fa9bafe37))
* **client:** portable YAML export UI (FR-18.2/18.3), closing FR-19.5 ([554f1a3](https://github.com/polandy/JIT-Pack/commit/554f1a3c157bf1ee1410355e6e35dad1f2050769))
* **client:** trip cloning (FR-12.1/12.2) ([2e0abce](https://github.com/polandy/JIT-Pack/commit/2e0abce33e20af9210d74b555791cf0b55fc4958))
* **client:** trip_members sync + M3 sharing step (FR-4.5/4.7) ([ab41ae0](https://github.com/polandy/JIT-Pack/commit/ab41ae0512be6ec68b76661db02dd5e7bfe0e759))
* export reminder, avatar crop, history suggestions (NFR-4.11 / FR-17.13 / FR-14.2) ([#17](https://github.com/polandy/JIT-Pack/issues/17)) ([2c8d9b5](https://github.com/polandy/JIT-Pack/commit/2c8d9b5d4c4af0aed26ccc6abbf6e5f42e88d4a0))
* make trip start_date optional (FR-2.1a) ([b849ebd](https://github.com/polandy/JIT-Pack/commit/b849ebde4bc39e30fde932e37c79e913fdd4f012))
* OIDC code-exchange broker + client login flow (spec §2) ([f3278ae](https://github.com/polandy/JIT-Pack/commit/f3278aee01128af72eb9b3567f067bdf1b469dc8))
* Packing Now with collision locking (FR-5.2/5.3, G-3) ([d991df7](https://github.com/polandy/JIT-Pack/commit/d991df73e183d92227856eb3d2a71af7b21abbe7))
* per-trip conflict log endpoint + G-2 conflict view ([3f7efe0](https://github.com/polandy/JIT-Pack/commit/3f7efe0ec5930bdf1f4731359bde02fc7c0fa37e))
* scaffold Vue 3 + Capacitor client with core sync composables ([b2873a2](https://github.com/polandy/JIT-Pack/commit/b2873a25372154fcc7d37bc66cc90f9109e5b78a))
* small client gaps — M2 delete, M7/M9 creation, G-4 highlight ([#16](https://github.com/polandy/JIT-Pack/issues/16)) ([30a59e9](https://github.com/polandy/JIT-Pack/commit/30a59e9137f358914bada026989ed22f76a353af))
* **store:** item_dependencies master-partition sync (FR-20.1) ([0ce3be0](https://github.com/polandy/JIT-Pack/commit/0ce3be067d3250f90e7551dab2fd496d182bba50))
* **store:** master-partition sync — ApplyMasterMutation, PullMaster, migration 005 ([7e9e84f](https://github.com/polandy/JIT-Pack/commit/7e9e84fffa7558e9b5bdcf52f2ff0ab5d1184e1f))
* **store:** sync trip_series and destination_* via the master partition (FR-13.1/13.2) ([d0fc380](https://github.com/polandy/JIT-Pack/commit/d0fc3805e0a20dec8e8f3edd256ffb8bf072cd27))


### Bug Fixes

* **client:** make type-check pass so npm run build works ([faeb5e4](https://github.com/polandy/JIT-Pack/commit/faeb5e468beca8c614c073a28c4e01ea3975e945))
* **client:** persist editor mutations through the orchestrator ([df9d71e](https://github.com/polandy/JIT-Pack/commit/df9d71e028059db624a4528b3b7e819402d05a5b))
* **client:** replace multi-statement inline handler broken by prettier ([249ec8e](https://github.com/polandy/JIT-Pack/commit/249ec8e1a91f3a25af75c875b6e18795cdfe2b61))


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
