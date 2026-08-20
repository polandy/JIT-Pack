# Deployment examples

Ready-to-adapt compose stacks for running JIT-Pack. The manual explains
every choice these files make — start there:

- **[Installation](https://polandy.github.io/JIT-Pack/installation/)** — the
  same-origin routing rules (`/api`, `/ws`, `/health`) every deployment must
  respect, and reverse-proxy variants beyond the one used here.
- **[Family setup](https://polandy.github.io/JIT-Pack/family-setup/)** — from
  a running multi-user instance to a family actually using it.

| Directory | What it is |
|---|---|
| [`multi-user/`](multi-user/) | The production shape: backend + published client image + Caddy for TLS, OIDC login, instance admins. |

The repository root's `docker-compose.yml` is the single-user test stack
(no auth, no TLS) — good for a look around, not for the open internet.
