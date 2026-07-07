# ADR-002: Avatar Storage — Database BLOB vs. Filesystem

**Status:** Accepted
**Related:** ADR-001 v2 (Go + embedded SQLite), Addendum v2.7 FR-17.13 (avatar customization), Schema v0.3 (`users.avatar_image`)

**Decision Drivers (in priority order):**
1. Preserve the single-file backup story ADR-001 already committed to (NFR-4.5) — backup and Litestream replication must cover avatars automatically, with no separate step.
2. Operational simplicity: no orphaned-file cleanup, no extra Docker volume, no new moving parts (NFR-4.3 footprint goal).
3. Read performance at the specific size bound the product already enforces (≤ 100 KB, JPEG, per FR-17.13).
4. No loss of functionality (caching, correct content type) versus serving from disk.

---

## Considered Options

### Option A — Store as a BLOB column in the existing SQLite database *(recommended, accepted)*

`users.avatar_image BLOB`, capped at 100 KB and restricted to `image/jpeg` via `CHECK` constraints (Schema v0.3) — no application-level validation is the only line of defense.

**Pros**
- **Backup atomicity for free:** the avatar lives in the same file as everything else. A `.db` copy or Litestream snapshot can never end up with a row referencing an avatar that wasn't captured, or vice versa — a failure mode that's structurally possible the moment avatar bytes live outside the database.
- **No orphan cleanup:** replacing or deleting an avatar is an ordinary `UPDATE`/`DELETE` inside a transaction. There is no old file on disk to remember to remove, no cleanup job, no possibility of leaking storage on crash-mid-write.
- **Right-sized for SQLite:** SQLite's own documentation and benchmarking ("35% Faster Than The Filesystem") found blobs under roughly 100 KB read *faster* from the database than from individual files, due to per-file open/seek overhead — the product's own 100 KB cap (chosen independently, for footprint reasons) happens to sit exactly inside that favorable range.
- **Zero new moving parts:** no static file server, no extra volume mount in the Docker Compose file, no path-traversal surface to defend against when resolving a user-supplied filename.

**Cons / accepted trade-offs**
- The `.db` file grows by up to ~100 KB per user with an avatar. At the target deployment scale (a household or small self-hosted instance — a handful of users), this is immaterial; it would only become a real concern at a user count or media size this product is not designed for.
- Serving the avatar over HTTP requires a small dedicated read path (streaming the BLOB with the right `Content-Type` and cache headers) rather than a static-file server handling it for free. This is a few lines of handler code, not a new dependency.

### Option B — Store as files on disk (e.g., `/data/avatars/{user_id}.jpg`), path or hash referenced from the database

**Pros**
- Familiar to operators used to inspecting files directly (`ls`, `scp`).
- Could in principle be served directly by a reverse proxy without touching the Go process.

**Cons**
- **Breaks the single-file backup story** central to ADR-001: an operator (or Litestream) must now keep two things in sync — the database and a directory — reintroducing exactly the operational complexity SQLite was chosen to avoid.
- Requires orphan-file cleanup logic on every replace/delete, and crash-safety handling (e.g., write-to-temp-then-rename) that the database gets for free via transactions.
- Requires an additional Docker volume and a decision about its own backup/retention policy, separate from the database's.
- At ≤ 100 KB per image, gains no measurable performance benefit over the database per the same SQLite documentation cited above — the usual argument for filesystem storage (large media, high request volume) doesn't apply at this size or scale.

---

## Decision

**Option A: store the avatar as a BLOB in `users.avatar_image`**, size- and format-constrained at the database layer (Schema v0.3), served through a small dedicated handler with `ETag`/`Cache-Control` headers so no client-facing capability is lost relative to filesystem serving.

The database was already chosen (ADR-001) specifically to make the entire deployment "one container, one file, trivial backup." Routing avatars around that file for a marginal, scale-inapplicable benefit would undermine the very property that decision was optimizing for.

## Consequences

1. Backup and Litestream replication (ADR-001) require no change and no additional configuration to include avatars — they are already inside the one file being protected.
2. `internal/api` gains one read-only handler (e.g., `GET /api/v1/users/{id}/avatar`) that streams the BLOB with `Content-Type: image/jpeg` and a caching header (e.g., `ETag` derived from a content hash or `updated_at`); `internal/store` gains the corresponding narrow read query. No new package, no new dependency.
3. No orphaned-file cleanup code is ever needed anywhere in the codebase — replacing an avatar is a single-row `UPDATE` inside the existing transactional write path.
4. **Revisit trigger:** if a future requirement moves this product outside its target deployment profile — many more users per instance, or media meaningfully larger than the current 100 KB cap — this decision should be revisited; migrating to filesystem or object storage at that point is a contained, additive change (add a storage-backend interface behind the existing read/write handler) rather than a rearchitecture.
