# ADR-001 (v2): Tech Stack & Offline-Sync Strategy — „JIT-Pack"

**Status:** Accepted (revises v1: adds Option A2, changes recommendation)
**Decision Drivers (in priority order):**
1. **Minimal footprint** (NFR-4.3): NAS/mini-PC; the smaller, the better.
2. Offline-first with multi-user conflict handling (NFR-4.1/4.2/4.2a).
3. Capacitor iOS/Android + web from one codebase (Section 2, PKCE).
4. Self-hosted, no mandatory cloud dependencies (NFR-4.6 spirit).
5. Maintainability by a small (hobby) team.

---

## Considered Options

### Option A2 — Go single binary + **embedded SQLite** + SQLite clients  *(recommended)*

| Layer | Choice |
|---|---|
| Backend | Go single static binary, **one** Docker container total |
| Database | SQLite (embedded, WAL mode), schema v0.2 |
| Sync | Custom pull/push protocol (HTTPS + WebSocket); field-level LWW with HLC; per-trip `change_log` sequence as pull cursor |
| Client | Vue 3 + Capacitor; SQLite on device, wa-sqlite/OPFS on web |
| Auth | OIDC Code Flow + PKCE (Authelia); stateless JWT validation (NFR-4.4) |
| Push | Web Push (VAPID) + UnifiedPush; WebSocket in-app fallback (NFR-4.6) |
| Backup | File copy of the `.db` (or Litestream for continuous streaming replication) |

**Footprint: 1 container, ~20–50 MB RAM, single-file database.**

**Why SQLite fits this workload:** a self-hosted family instance means a handful of users, hundreds of rows per trip, and write bursts of "checkbox ticks". WAL mode gives concurrent readers plus one serialized writer — at these write rates never a bottleneck. Server and client share the same database technology, so schema knowledge and test fixtures carry over.

**Pros**
- Smallest achievable footprint; the entire stack is one process.
- Backup collapses to one file (NFR-4.5 becomes trivial); Litestream adds point-in-time recovery for ~10 MB RAM if desired.
- Zero DB administration (no roles, no connection pools, no vacuum tuning).
- Sync protocol is DB-agnostic (HLC in a TEXT column, change_log table) — identical logic to A1.

**Cons / accepted trade-offs**
- **No ElectricSQL fallback:** Electric requires Postgres logical replication. Choosing SQLite is a full commitment to the custom sync protocol. Accepted, because the write path was custom in every variant anyway.
- Spec change required: NFR-4.2 currently mandates a "central PostgreSQL backend" → reword to "embedded SQLite database".
- Single-writer model: horizontal scaling is off the table — irrelevant for the target deployment, but documented as a conscious boundary.
- Postgres-specific features ported: ENUMs → CHECK constraints, JSONB → TEXT + json_valid(), UUIDs via `randomblob(16)` default (validated in schema v0.2).

### Option A1 — Go + PostgreSQL (v1 recommendation)
Two containers, ~200–300 MB RAM. Keeps the Electric fallback and multi-writer headroom. Now the **fallback option**: schema v0.1 stays maintained conceptually; migrating A2 → A1 later is mechanical (same logical model, CHECKs → ENUMs).

### Option B — ElectricSQL read-path + custom write API
Three containers, ~350–500 MB + shape-log disk. Solves only the read path; requires Postgres. Rejected under driver #1; no longer available as fallback once A2 is chosen.

### Option C — PowerSync (self-hosted)
Four components, 600 MB–1 GB+; separate bucket-state store; engine-shaped conflict handling conflicting with NFR-4.2a. Rejected.

---

## Decision Matrix (revised)

| Criterion (weight) | A2: SQLite | A1: Postgres | B: Electric | C: PowerSync |
|---|---|---|---|---|
| Footprint (×3) | ●●● | ●●○ | ●●○ | ●○○ |
| Sync effort saved (×2) | ●○○ | ●○○ | ●●○ | ●●● |
| NFR-4.2a fit (×2) | ●●● | ●●● | ●●○ | ●○○ |
| Ops simplicity (×2) | ●●● | ●●○ | ●○○ | ●○○ |
| Capacitor/SQLite fit (×1) | ●●● | ●●● | ●●○ | ●●● |
| **Weighted total** | **28/30** | **25/30** | **20/30** | **17/30** |

## Decision

**Option A2: Go single-binary backend with embedded SQLite (WAL), custom HLC sync protocol, Vue 3 + Capacitor clients with on-device SQLite.**

The entire self-hosted deployment is one container and one database file. The price — no ready-made sync fallback — is acceptable because the sync logic is custom in every realistic option and the domain (trip-partitioned, low-volume, well-specified conflict rules) keeps it bounded.

## Consequences

1. **Spec update:** NFR-4.2 reworded from "central PostgreSQL backend" to "embedded SQLite database (WAL mode)"; NFR-4.5 backup reference from `pg_dump` to file-copy/Litestream.
2. **Schema v0.2 (SQLite) is authoritative** — validated end-to-end incl. generated `duration_days`, partial index, CHECK constraints, and the new `change_log` table (per-trip pull cursor + tombstones).
3. Next artifact: **Sync-Protocol & API Spec** on top of `change_log`/HLC.
4. Walking skeleton unchanged in scope, now even simpler to deploy: one container + one volume.
5. Revisit trigger: if a future requirement demands concurrent server-side writers or >⁠~20 active users per instance, migrate A2 → A1 (mechanical port, same logical model).
