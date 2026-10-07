# M14 — Post-Trip Review Assistant

* **Purpose:** Close the feedback loop into master templates (FR-9.2).
* **A list, aimed at groups (FR-27.11).** The assistant is **a list, not a card stack**, and its proposals target
  **groups**, not the composed vacation template.
* **Elements:** One row per proposal: a kind chip (*ungenutzt* / *fehlte*), the item name, why it is being proposed
  ("auf dieser Reise nicht gebraucht", "unterwegs nachgekauft — fehlte auf der Liste"), and the **target group named in
  a picker that offers groups only** (FR-27.11), beside which a chevron opens the FR-27.12 peek sheet on the chosen
  target — the row carries no summary line, because the proposal and its blast radius already own that space — for an
  *ungenutzt* row only groups that actually carry the item (zeroing a position that does not exist would apply as
  nothing, and a silent no-op is worse than a shorter picker). When the target group
  reaches trips that still follow it, the row states the blast radius ("Wird N Reisen vorgeschlagen …", FR-27.4). Per
  row: *Übernehmen · Überspringen · Nie mehr fragen*, all three worded (FR-9.4: an unlabelled ✕ carrying only an
  `aria-label` is no label at all on a phone, and the third is the one action here that is permanent, device-local and
  has no undo; the wording follows FR-27.15's *Ignorieren* rather than inventing a second grammar for
  the same dismissal).
* **Two blocks, and a handled proposal moves between them (FR-9.4).** *Offen · n* holds what is
  still open; *Erledigt · n* holds what was applied or skipped, as a record line naming the item, its target group and
  its outcome — visible and marked as FR-27.11 requires, and never under a heading that does not count it (a finished
  pass must not read „Offen · 0" above two cards). The footer sentence counting what was *written* stays, under
  *Erledigt*, and appears only when something was applied. **The finished state is reachable by finishing:** the empty
  block renders whenever nothing is open, saying „durchgesehen" where a pass was made and „nichts zu prüfen" where the
  trip produced no proposal at all — applying or skipping empties the list, so a finished review never needs every
  proposal dismissed permanently.
* **Actions:** Single-tap apply writes directly to the target group (shared instance-wide, FR-1.6 MVP simplification —
  no fork prompt) and logs an FR-27.4 applied change on every planning trip using it. **The harvested item becomes a
  trip-global position (E2E-FLOW-04):** one row for the trip, the way M21's fold writes back a row the trip carried for
  one traveller or for everybody, not one per traveler — the mutation's `per_person` default decides how many rows
  generation makes, so it would bring a shared item back once per head and, on a trip with no travelers, not at all.
  It is the position's *quantity* that the review pass moves; who it is for is not something a finished trip has an
  opinion about. **Decided: "Never ask again" scopes to the
  specific item–group pair**, not the item globally — the same item can still surface a proposal for a different group.
* **States:** No flags recorded → assistant skipped with a brief "nothing to review" toast; assistant is resumable if
  interrupted.
* **Navigation:** Auto-launch on archive from M4/M2 — and only when something was flagged; with no flags the archive
  stops on M4 with the *„nichts zu prüfen"* toast. Afterwards from the **closing card at the top of M4 on the archived
  trip**, which links to the full list **and teases the first two proposals**: a card that read no proposal would say
  the same thing whether eleven suggestions were waiting or none, which is the one question the tap answers. It calls
  the **same** rule M14 calls (invariant 4): a cheaper approximation on the card would be the review implemented twice,
  and the copy that drifts is always the summary. With nothing to propose it says so rather than listing nothing, which
  reads as *not loaded yet*. Sits beside the M21 entry there — M21 folds back structure, M14 folds back individual
  items.
