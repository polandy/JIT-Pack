# Backlog — the closed numbered items

Every numbered item of the original backlog, closed, with the date it closed. **Numbers stay stable** because
the log and the specs refer to them („item 19“ means NFR-4.12); the reasoning behind each is in
[`implementation-log/`](implementation-log/README.md). `CLAUDE.md` names where open work comes from; this file
holds the parked sections and the standing decisions below, and is the reference for a number met elsewhere.

## Parked, specified, do not start

§3.26 calendar feed, the North-Star phases beyond §3.29's planner, FR-27.8's per-trip usage history, FR-1.6's
publish/fork ownership model. Each carries a revisit trigger in its stub.

## Standing decisions

- **The G-3 lock stays advisory** (owner's decision, ADR-022/023): refusal would wedge an offline device's outbox.
- **The portable backup carries master data and trips only.** Not in it: trip todos (FR-7.3/7.4), the shopping list's
  own entries (FR-30), trip notes (FR-7.9/7.13), excursions (FR-31), the planner (§3.29) and the activity log (§3.32).
- **The item merge moves master data only** (FR-24.15, ADR-069): trip history keeps naming the row it was packed from,
  and `items.merged_into_id` makes the two pasts read as one.
- **The task due-day reminder is the one notification Single-User sends** (FR-7.12, ADR-076).

## The closed items

1. Basics first (auth, coverage, pinning, `mise`) — 2026-08-09
2. §3.27 client package — 2026-08-21
3. Design foundation and screen rebuilds (`dev-docs/design-foundation-plan.md`) — 2026-08-24
4. i18n migration (unit: a section) — 2026-08-22
5. Migrations 018/019 — 2026-08-11
6. Playwright suite (ledger: `dev-docs/e2e-ledger/`; FR-19.8/ADR-045) — 2026-09-02
7. FR-27.12 looking inside a group — 2026-08-16
8. FR-27.13 searchable M8 group picker — 2026-08-22
9. FR-27.14 a Vorlage shows its resulting items — 2026-08-17
10. FR-2.6 M3 review step, variant A — 2026-08-17
11. FR-5.5 „bewusst nicht einpacken" control — 2026-08-18
12. §3.28 item mark (ADR-021) — 2026-08-22
13. FR-27.15 M8 recognises loose positions as a group — 2026-08-22
14. Multi-user concept's second half (ADR-022, ADR-023). **The G-3 lock stays advisory by decision** (owner,
    2026-08-30): refusal would wedge an offline device's outbox — 2026-08-30
15. FR-9.3/9.4 trip feedback — 2026-08-24
16. NFR-4.14 wire contract (ADR-026/027) — 2026-08-24
17. FR-5.7 claims broken by a person, not a clock (ADR-028) — 2026-08-24
18. Second identity in e2e (ADR-029) — 2026-08-30
19. NFR-4.12 notifications localised (ADR-037) — 2026-08-29
20. FR-25.19 responsibility writer — 2026-08-25
21. FR-2.8 M2 default segment (ADR-033) — 2026-08-29
22. FR-25.21 per-person model writer (ADR-036) — 2026-08-30
23. FR-24.3 retire/restore of referenced master rows (ADR-032/034) — 2026-08-25
24. FR-7.4 trip todos (PR #490) — 2026-09-18. Not in the portable backup, like FR-7.3's todos.
25. FR-30 the shopping list as a feature module (ADR-066) — 2026-09-19. Own entries are not in the portable backup
    either.
26. FR-24.14/FR-24.15 the inventory's two merges — tags in one act, duplicate items at all (ADR-069) — 2026-09-20. The
    item merge moves master data only: trip history keeps naming the row it was packed from, and `items.merged_into_id`
    is what makes the two pasts read as one.
27. FR-7.9 trip notes, read by every traveller and ticked per person (ADR-073) — 2026-09-22. Not in the portable backup
    either, like the shopping list's own entries.
28. FR-7.11/FR-7.12 a task's due day with the server's own morning reminder, and a finished packing closes *before*
    (ADR-076) — 2026-09-25. The reminder is the one notification Single-User sends.
29. FR-7.13 trip notes as threads — a titled first note, replies one level deep, author-only edits, a tick that reaches
    the newest entry, replies pushed to the participants — on a view of their own, M26 (ADR-073 amendment note) —
    2026-09-25.
30. FR-31 excursions — a small packing list inside a trip, its own lines borrowing from the suitcase, started from and
    saved as a Gruppe (ADR-077) — 2026-09-26; their GPX tracks, as an idea's, in tables of their own (FR-31.15, ADR-089)
    — 2026-10-01. Not in the portable backup either.
31. §3.29 the planner's first slice — a trip's ideas on M28 with four hand-set states, votes with names and a
    discussion, a feature module like the shopping list (ADR-078) — 2026-09-27; its pictures (FR-29.5, ADR-081) and a
    pasted link filling the idea (FR-29.16, ADR-082, on by default) — 2026-09-28. Its notifications (FR-29.8) —
    2026-09-30. GPX tracks on an idea, read on the device, on a Leaflet map with tiles on by default (FR-29.17, ADR-085)
    — 2026-10-01; on that map the device's own position and the others' who share it, passed through the hub live and
    kept nowhere (FR-29.19, ADR-087) — 2026-10-01; their routes edited and drawn like the swisstopo app, paths from
    BRouter asked by the device (FR-29.20, ADR-088) — 2026-10-01. The day plan, M29 (FR-29.14/29.15), the packing side's
    dated rows reaching it through `lib/dayPlanSources.ts` — 2026-10-01; its connections, a pasted SBB link read on the
    device and its short link followed through the page read (FR-29.18, ADR-086) — 2026-10-01. Where a trip opens,
    decided by date, and M1's *Heute* card (FR-29.7) — 2026-10-02. The bridge to the packing side, an idea made an
    excursion, a task or a shopping entry on the screen that makes it (FR-29.13, ADR-078 amendment 1) — 2026-10-02. Not
    in the portable backup either.
32. §3.32 the activity log — who changed what, recorded by the server with each write (ADR-084), read per trip from M4's
    ⋮ and for the inventory from M9's ⋮ on M30 — 2026-09-30. Starts empty; none in Local Mode; not in the portable
    backup.
