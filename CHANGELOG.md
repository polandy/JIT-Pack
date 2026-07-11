# Changelog

## [0.2.0](https://github.com/polandy/JIT-Pack/compare/v0.1.0...v0.2.0) (2026-07-11)


### Features

* brand logo + item reference photos (FR-22) ([#14](https://github.com/polandy/JIT-Pack/issues/14)) ([106f2fa](https://github.com/polandy/JIT-Pack/commit/106f2fad287d04853b12aa6c9560615c273116f3))
* export reminder, avatar crop, history suggestions (NFR-4.11 / FR-17.13 / FR-14.2) ([#17](https://github.com/polandy/JIT-Pack/issues/17)) ([34e8fca](https://github.com/polandy/JIT-Pack/commit/34e8fca4b3b7be40a7265c5a6fd180ccbf232053))
* small client gaps — M2 delete, M7/M9 creation, G-4 highlight ([#16](https://github.com/polandy/JIT-Pack/issues/16)) ([d26a2bf](https://github.com/polandy/JIT-Pack/commit/d26a2bf52e7608b9a170a6535abb128b531b3f76))

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
