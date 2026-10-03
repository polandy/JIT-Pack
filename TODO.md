# Todo / roadmap

One line per item, newest at the end. A finished item is deleted.

## Open

- [ ] Create a meal plan that also appears on the day plan — with the shopping list integrated (2026-10-03)
- [ ] **HIGH** Fix the flaky E2E-M28-23 at its cause — in `client/e2e/planner/bridge.spec.ts` the Tasks pill click is lost after the idea is removed and `openTripView` times out on `aria-current` (5 of 8 local Chromium runs red on `origin/main`, red once in CI on #665); give the page a settled signal after the removal, no wait (2026-10-03)
