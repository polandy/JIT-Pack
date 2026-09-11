# ADR-058: A linked traveler notifies through membership — require it vs. grant it vs. skip it

**Status:** Accepted
**Related:** FR-2.5 (Traveler vs. User Separation), FR-6.2/FR-25.19 (delegation notifications), FR-4.5 (roles), the
2026-09-01 „keep, do not build" decision this supersedes, `internal/api/notificationrules.go`,
`internal/store/travelers.go`, `internal/store/partition.go`

**Decision Drivers (in priority order):**
1. **A notification must point somewhere the recipient can open.** FR-6.3's payload is a deep link into the trip; a
   notification the recipient's device cannot pull is worse than none, because it reads as a bug rather than as
   nothing happening.
2. **The notification pipeline already has exactly one trust boundary, and every rule already assumes it.**
   `planNotifications` receives `members []store.MemberName` — the trip's `trip_members` — and `planDelegation` and
   `planComment` both resolve recipients against it with no further check. A third rule that trusted something else
   would be a second, unstated boundary.
3. **FR-2.5's own precedent.** The 2026-09-01 decision on this same column ruled out building machinery the column
   did not yet need. The membership check is the smallest rule that makes the notification safe to send at all —
   anything larger repeats the mistake the precedent warns against.

---

## Considered Options

### Option A — require `linked_user_id` to already be a trip member; reject the write otherwise *(recommended, accepted)*

`validTravelerLink` (`internal/store/travelers.go`) runs in the trip partition's scope check for the `travelers`
table: a non-empty `linked_user_id` must name a current `trip_members` row of the same trip, or the mutation is
rejected with `not_a_trip_member`. The CLI (`jitpack traveler --user`) checks the same rule before sending, so the
common path fails fast with a sentence instead of a round trip.

**Pros**
- No new access concept: linking reuses the access boundary that already exists and that every other notification
  rule already trusts.
- The rejection is one new `RejectReason`, symmetrical with the six the push path already has.
- The failure mode when the rule is skipped — link before invite — is a clear, correctable operator mistake, not a
  silent gap.

**Cons**
- Linking a not-yet-invited person is two steps (invite, then link) instead of one.

### Option B — linking silently grants `trip_members`

The traveler write path inserts a `trip_members` row as a side effect of a non-empty `linked_user_id`, if one does
not already exist.

**Pros**
- One step for the operator: link and invite happen together.

**Cons**
- Invents a role decision this feature does not otherwise need — owner, admin or editor for a row an operator wrote
  for an entirely different reason (recording who someone is), not to grant trip access.
- Access becomes a side effect of a field with no UI and no reader before this ADR (FR-2.5) — a change nobody
  reviewing "who can see this trip" would think to look for.
- `trip_members` already has its own FR-4.5 rules (one immutable Owner row, role transitions); a second insertion
  path for it is a second place those rules must hold.

### Option C — leave membership unchecked; notify regardless

`planRosterAssignment` fires for any non-empty `linked_user_id`, member or not.

**Pros**
- No new validation code anywhere.

**Cons**
- Reintroduces exactly the broken case driver 1 names: the recipient's device pulls the trip partition scoped to
  its own membership (`internal/store/tables.go`'s `trip_members m ON m.trip_id = t.id WHERE m.user_id = ?` joins),
  so a non-member's device 403s or simply never receives the row the notification's deep link names.

---

## Decision Matrix

| Driver | Weight | A: require membership | B: auto-grant membership | C: unchecked |
|---|---|---|---|---|
| Deep link always resolves | 5 | 5 — recipient can always open it | 5 — access is granted first | 1 — often cannot |
| One trust boundary, not two | 4 | 5 — reuses `trip_members` | 1 — access granted from an unrelated field | 5 — but the pipeline's own assumption breaks |
| Matches FR-2.5's minimalism precedent | 3 | 5 — smallest sufficient rule | 2 — adds a role decision nobody asked for | 3 — smallest of all, but broken |
| **Total** | | **60** | **32** | **37** |

---

## Decision

**Option A.** `travelers.linked_user_id` may only ever name a current `trip_members` row of the same trip.
`internal/store/travelers.go`'s `validTravelerLink` enforces it server-side, hooked into the trip partition's scope
check (`internal/store/partition.go`) alongside the existing `belongsToTrip` guard; `client/cli/travelerCommand.ts`
checks the same rule before sending, so the common failure is a sentence, not a server round trip. Unlinking (a
nil/empty `linked_user_id`) needs no membership check at all — clearing a link can never point anywhere invalid.

`planRosterAssignment` (`internal/api/notificationrules.go`) then notifies the linked account when a `trip_items`
row's `assigned_traveler_id` names that traveler, reusing `store.NotifyDelegation` rather than adding a fifth
notification kind — "you were assigned this item" and "you're the linked account of its traveler" read as the same
sentence to the recipient. It dedupes against an explicit `packer_user_id` delegation for the same person and item.

## Consequences

**Positive**
- `travelers.linked_user_id` (FR-2.5) is no longer inert: it feeds exactly the trigger the 2026-09-01 decision named
  as its revisit condition.
- Every notification the pipeline sends still has the one guarantee it always had — the recipient is a trip member —
  with no branch that has to remember an exception.
- The rejection is diagnosable: `not_a_trip_member` names the exact condition, in both the push result and the CLI's
  own pre-check.

**Negative / accepted costs**
- Linking requires the target to already be a trip member: the operator sequence is invite, then link, never the
  reverse. A `--user` naming someone not yet on the trip fails with a sentence rather than queuing a link that would
  resolve once they join.
- The CLI's pre-check and the server's validator are two copies of the same rule (a client-side fast-fail and the
  authoritative check), which is the same duplication every other push-time validation in this codebase already
  accepts as the cost of failing fast.

**Neutral**
- `trip_members` itself gains no new writer and no new column; only `travelers.linked_user_id`'s write path changed.
- No new notification preference: the roster-assignment case is invisible in `notification_prefs`, which stays the
  existing three-key struct, because it rides the existing `delegation` preference.

## Revisit Trigger

If operators routinely try to link before inviting and the rejection becomes a support burden, reconsider an
auto-invite-on-link affordance (queue an invitation alongside the link) — still not Option B's auto-*access*-grant,
which this ADR rejects on the role question alone, not on the one-step convenience it would buy.
