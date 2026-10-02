# Plain-HTTP instances (NFR-4.2a) — `e2e/insecure-context.spec.ts`

* **E2E-NFR-SEC-01** `local` (NFR-4.2a): with `crypto.randomUUID` removed before boot — the state a self-hosted instance
  served over plain HTTP is actually in — the id source still works, and the case asserts its own premise so it cannot
  pass vacuously.
* **E2E-NFR-SEC-02** `local` (FR-24.5): a new inventory item is created and appears in M9.
* **E2E-NFR-SEC-03** `local` (FR-2.1b): a trip is created through M3 — landing on M4 proves the whole cascade (trip,
  travelers, items) got ids, not only the first insert.
* **E2E-NFR-SEC-04** `local` (FR-27.1): a group is created in M7 and takes a position in M8.
* **E2E-NFR-SEC-05** `local` (FR-22.1, FR-29.5): with `crypto.subtle` removed too, an item photo lands in M10 — the
  Local Mode image hash does not need SHA-256 (`composables/sync/__tests__/hashBlob.spec.ts`).

*Why these are their own unit:* the suite serves from `localhost`, which **is** a secure context, so no ordinary case
can reach the broken state — the defect was invisible to a green suite on principle rather than by accident.
