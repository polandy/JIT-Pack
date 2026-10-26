# Todo / roadmap

One line per item, newest at the end. A finished item is deleted.

## Open

- [ ] Decide whether the browse sheet's pack verb leaves skipped rows alone — on M4, *Einpacken* (FR-25.13f) on a per-person set mixing a skipped and an open row also packs the skipped one: `useBrowseVerbs.onPack` filters only `state !== 'packed'`, and `completePacked` on a skipped row (amount 0) writes packed 0/0, so a deliberate "not coming" turns into "packed"; M27's port already leaves a skipped line alone, and `onSkip` skips only unskipped rows (found in ARCH-18) (2026-10-09)
- [ ] Cover M27's excursion facts on a per-person child row with an e2e case — a traveler leaves the excursion while their row is packed: *left behind* and *take out* appear under the child row, and *take out* removes the line; the `#facts` slot path with `child=true` in `PackingGroupList` is held only by the type checker (M27, FR-31.6, found in ARCH-18b) (2026-10-09)
- [ ] Cover M28's idea side panel at desktop width with an e2e case — no case opens an idea on `IdeasPage` at ≥ 900 px, where `useDesktopLayout` teleports the panel beside the board (M28, G-9, found in ARCH-18b) (2026-10-09)
- [ ] Give the planner's `dayPlanEmpty` a direct unit test — the rule that a trip under way does not open on an empty plan day (`client/src/planner/index.ts`) is reached only through the router's `tripOpening` spec and e2e (FR-29.7, found in the review of #758, ARCH-15b) (2026-10-09)
- [ ] Add visual baselines for M10 and M17 — `make visual` has no shot of the item editor (hint lines, delete card) or of Settings, so a style change there passes unchecked (G-13, found in ARCH-23b, #768) (2026-10-10)
- [ ] Test M25's bulk no-op toast — no case checks that a batch writing nothing announces `tasks.bulkNothingToChange` (`client/src/views/trips/TripTasksPage.vue:328`), unlike `items.` and `shopping.`; M25 (2026-10-10)
- [ ] Correct the healthy-start line count in `docs/getting-started.md` — it says a healthy start logs "exactly two lines", but the default feature banners add several more, now in `slog` key=value form (found in the review of #779, ARCH-08) (2026-10-10)
- [ ] Read the caller through `callerID` in `internal/api/identity_test.go:123,143` — both still read `ctx.Value(userIDKey)` directly (found in the review of #779, ARCH-07) (2026-10-10)
- [ ] Correct `trip.changed` in the Sync API spec §7 — it says the frame carries `{trip_id, seq}` and the client pulls "if seq > local_cursor"; the server sends `head_seq` and the client pulls unconditionally (found in ARCH-05) (2026-10-11)
- [ ] Preparation steps on a day-plan entry — FR-29.21 gives an idea its steps with a lead before its day (ADR-104); a day-plan entry (M29) may want the same; that is the ADR's revisit trigger, a third copy of the derivation (2026-10-22)
- [ ] Set the repo variable `AWS_ECR_PUBLIC_ROLE_ARN` so docker-build stops hitting the ECR limit — without it the job pulls base images from public ECR anonymously and fails on "429 Data limit exceeded" (main since #841, PR #844 merged by toggling enforce-admins); the authenticated pull path from #838 (ADR-102) stays inert until the IAM role exists and the variable names it (2026-10-22)
