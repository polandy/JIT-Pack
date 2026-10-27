# Todo / roadmap

One line per item, newest at the end. A finished item is deleted.

## Open

- [ ] Correct `trip.changed` in the Sync API spec §7 — it says the frame carries `{trip_id, seq}` and the client pulls "if seq > local_cursor"; the server sends `head_seq` and the client pulls unconditionally (found in ARCH-05) (2026-10-11)
- [ ] Preparation steps on a day-plan entry — FR-29.21 gives an idea its steps with a lead before its day (ADR-104); a day-plan entry (M29) may want the same; that is the ADR's revisit trigger, a third copy of the derivation (2026-10-22)
- [ ] Set the repo variable `AWS_ECR_PUBLIC_ROLE_ARN` so docker-build stops hitting the ECR limit — without it the job pulls base images from public ECR anonymously and fails on "429 Data limit exceeded" (main since #841, PR #844 merged by toggling enforce-admins); the authenticated pull path from #838 (ADR-102) stays inert until the IAM role exists and the variable names it (2026-10-22)
- [ ] Stop offering the browse sheet's ✓ on a set with nothing left to pack — on M4, a per-person set whose rows are all packed or skipped (none open) is summarised as `open` by `browseRowStates` (rule 3, `client/src/domain/browseRows.ts`), so the line still shows ✓, and since `onPack` leaves skipped rows alone that tap writes nothing (M4, FR-25.13f) (2026-10-26)
- [ ] Fix E2E-M28-11's stacked-toast flake at its cause — Bob's *Open* on the notice toast is intercepted by another `ion-toast` that a parallel `server` case signed in as the same account puts on his screen, so the click retries until the 180 s timeout (`client/e2e/planner/server/notifications.spec.ts:57`, red on #857, run 40415032465) (2026-10-27)
- [ ] Test M9's bulk no-op toast in e2e — no case checks that a batch writing nothing says `items.bulkNothingToChange` (`client/src/views/items/inventory/useBulkActions.ts`); only `ItemInventoryPage.spec.ts` does; read the toast in one evaluate, never `toHaveCount(0)` (see E2E-M25-24) (2026-10-27)
- [ ] Test M6's bulk no-op toast in e2e — no case checks that a batch writing nothing says `shopping.bulkNothingToChange` (`client/src/shopping/useShoppingBatch.ts`); only `ShoppingPage.spec.ts` does; same caution as M9's (2026-10-27)
