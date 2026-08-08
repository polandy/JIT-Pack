# dev-docs

Documentation for people **working on** JIT-Pack. What the product *is* lives in [`../docs/`](../docs/); this directory is how we build it and why it looks the way it does.

| File | What it's for |
|---|---|
| [`CODING_PRINCIPLES.md`](CODING_PRINCIPLES.md) | **Binding.** Test-first, package layout, Go conventions, dependency policy, workflow. Read before writing code. |
| [`adr/`](adr/) | Architecture Decision Records — one per real tradeoff, with the options that lost. Start at [`adr/README.md`](adr/README.md) for the index and the rules for adding one. |
| [`UI_Test_Spec_v1.0.md`](UI_Test_Spec_v1.0.md) | What the Playwright suite must cover: per-screen cases, cross-screen flows, FR/NFR traceability matrix. |
| [`implementation-log.md`](implementation-log.md) | Append-only history of what was built and why that way. Not a rule source — a binding rule belongs in `CLAUDE.md`'s invariants or an ADR. |

## Which file do I touch?

- Changing **what the product does** → `../docs/` (PRD Addendum, UI spec, sync API spec).
- Changing **how we build it** → `CODING_PRINCIPLES.md`.
- Deciding **between real alternatives** → a new ADR, in the same PR as the code.
- Adding **UI behaviour** → the UI spec *and* `UI_Test_Spec_v1.0.md`.
- Finishing a feature → append to `implementation-log.md`.
