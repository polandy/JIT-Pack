# Deployment examples

Ready-to-adapt compose stacks for running JIT-Pack. The files themselves
carry no explanation on purpose — the manual explains every choice they
make, so start there:

- **[Installation](https://polandy.github.io/JIT-Pack/installation/)** — what
  to change before the first start, the same-origin routing rules (`/api`,
  `/ws`, `/health`) every deployment must respect, and reverse-proxy variants
  beyond the one used here.
- **[Multi-user setup](https://polandy.github.io/JIT-Pack/multi-user-setup/)** —
  from a running multi-user instance to a household actually using it.

| Directory | What it is |
|---|---|
| [`multi-user/`](multi-user/) | The production shape: backend + published client image behind your own reverse proxy (Traefik labels included), OIDC login, instance admins. |

The repository root's `docker-compose.yml` is the single-user test stack
(no auth, no TLS) — good for a look around, not for the open internet.
