# M20 — User Administration

**Built (Addendum 3.23).**

* **Purpose:** The small instance-level user management of Addendum 3.23 — see who is provisioned, revoke access,
  moderate profiles. Application-data administration only; who *holds* the admin role stays declarative
  (`JITPACK_ADMIN_EMAILS`, FR-23.1) and is deliberately not editable here.
* **Elements:** List of all provisioned accounts: avatar, display name, e-mail, provisioning date, status chip,
  lightweight usage indicators (trips as member, owned templates) per FR-23.2. Instance admins are marked with a chip;
  the own account's row carries a "you" marker. **The status chip is one chip and an absence** (FR-23.2's *„active /
  deactivated"*): a deactivated row carries the chip and the dimming
  below, an active one carries neither — there is no *„active"* chip, and adding one would put a label on every row to
  say that nothing is wrong. **The avatar is the FR-23.4a circle with a cache-busting query:** the row is
  keyed by account id, so without one *Remove avatar* leaves the same `<img>` on the same `src` and the moderator
  watches nothing happen.
* **Actions:** Per-account ActionSheet: *Deactivate* (confirmation dialog spelling out the FR-23.3 consequences: access
  revoked, data and attributions untouched, JIT login does not restore access) / *Reactivate*; *Remove avatar* and
  *Reset display name* (FR-23.4). The own row and rows of instance admins offer no *Deactivate* (FR-23.3); there is no
  delete action anywhere (FR-23.5) and no role toggle (FR-23.1).
* **States:** Deactivated rows render dimmed with the status chip; empty state cannot occur (the viewing admin is always
  listed).
* **Visibility:** Rendered and routable only for instance admins with an OIDC session; hidden entirely in Single-User
  and Local Mode (FR-17.3/FR-19.3, G-8). Non-admin API access is rejected with 403 — the screen is access-controlled,
  not merely unlinked.
* **Navigation:** Administration row in M17 (only visible under the same conditions).
