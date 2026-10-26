# Todo / roadmap

One line per item, newest at the end. A finished item is deleted.

## Open

- [ ] Give the planner's `dayPlanEmpty` a direct unit test — the rule that a trip under way does not open on an empty plan day (`client/src/planner/index.ts`) is reached only through the router's `tripOpening` spec and e2e (FR-29.7, found in the review of #758, ARCH-15b) (2026-10-09)
- [ ] Add visual baselines for M10 and M17 — `make visual` has no shot of the item editor (hint lines, delete card) or of Settings, so a style change there passes unchecked (G-13, found in ARCH-23b, #768) (2026-10-10)
- [ ] Test M25's bulk no-op toast — no case checks that a batch writing nothing announces `tasks.bulkNothingToChange` (`client/src/views/trips/TripTasksPage.vue:328`), unlike `items.` and `shopping.`; M25 (2026-10-10)
- [ ] Correct the healthy-start line count in `docs/getting-started.md` — it says a healthy start logs "exactly two lines", but the default feature banners add several more, now in `slog` key=value form (found in the review of #779, ARCH-08) (2026-10-10)
- [ ] Read the caller through `callerID` in `internal/api/identity_test.go:123,143` — both still read `ctx.Value(userIDKey)` directly (found in the review of #779, ARCH-07) (2026-10-10)
- [ ] Correct `trip.changed` in the Sync API spec §7 — it says the frame carries `{trip_id, seq}` and the client pulls "if seq > local_cursor"; the server sends `head_seq` and the client pulls unconditionally (found in ARCH-05) (2026-10-11)
- [ ] Preparation steps on a day-plan entry — FR-29.21 gives an idea its steps with a lead before its day (ADR-104); a day-plan entry (M29) may want the same; that is the ADR's revisit trigger, a third copy of the derivation (2026-10-22)
- [ ] Set the repo variable `AWS_ECR_PUBLIC_ROLE_ARN` so docker-build stops hitting the ECR limit — without it the job pulls base images from public ECR anonymously and fails on "429 Data limit exceeded" (main since #841, PR #844 merged by toggling enforce-admins); the authenticated pull path from #838 (ADR-102) stays inert until the IAM role exists and the variable names it (2026-10-22)
- [ ] Stop offering the browse sheet's ✓ on a set with nothing left to pack — on M4, a per-person set whose rows are all packed or skipped (none open) is summarised as `open` by `browseRowStates` (rule 3, `client/src/domain/browseRows.ts`), so the line still shows ✓, and since `onPack` leaves skipped rows alone that tap writes nothing (M4, FR-25.13f) (2026-10-26)
- [ ] Fix E2E-M28-11's stacked-toast flake at its cause — Bob's *Open* on the notice toast is intercepted by another `ion-toast` that a parallel `server` case signed in as the same account puts on his screen, so the click retries until the 180 s timeout (`client/e2e/planner/server/notifications.spec.ts:57`, red on #857, run 40415032465) (2026-10-27)
