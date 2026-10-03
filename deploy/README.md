# Deployment examples

Ready-to-adapt compose stacks for running JIT-Pack. The files themselves
carry no explanation on purpose — the manual explains every choice they
make, so start there:

- **[Installation](https://polandy.github.io/JIT-Pack/installation/)** — what
  to change before the first start, what a TLS terminator in front of it must
  forward (the `Host` header in particular), and reverse-proxy variants beyond
  the one used here.
- **[Multi-user setup](https://polandy.github.io/JIT-Pack/multi-user-setup/)** —
  from a running multi-user instance to a household actually using it.
- **[Easy Setup](https://polandy.github.io/JIT-Pack/easy-setup/)** — the
  walkthrough for the stack that brings its own identity provider.

| Directory | What it is |
|---|---|
| [`multi-user-pocket-id/`](multi-user-pocket-id/) | The same shape with its own login: Pocket ID beside JIT-Pack, passkeys instead of passwords, for a household without an identity provider. |
| [`multi-user/`](multi-user/) | The production shape: the published image behind your own reverse proxy (Traefik labels included), OIDC login, instance admins. |

The repository root's `docker-compose.yml` is the single-user test stack
(no auth, no TLS) — good for a look around, not for the open internet.
