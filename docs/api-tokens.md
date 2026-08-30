# API Tokens

A browser session lasts fifteen minutes. That is fine for using the app and useless for a script
that syncs overnight or a one-off cleanup you drive from a terminal. An **API token** is a
credential you create once and hand to a tool, and it acts as you.

!!! warning "Read this before you create one"
    A token cannot be listed and cannot be taken back on its own. You will see it exactly once. The
    only way to revoke one is to [invalidate every token at once](#revoking-tokens).

## Creating one in the app

Open **Settings**. Under **API tokens**:

1. Say what the token is for. The name travels inside the token, so keep it short and put nothing
   private in it — anyone holding the token can read it.
2. Choose how long it should live: an hour, a day, a week, 30 days, 90 days, a year, or never. **90 days is
   preselected.** For a job that runs once, pick the short end — the credential then dies with the
   task instead of outliving it in a shell history.
   Because a single token cannot be revoked, this expiry is the only thing that ever ends it by
   itself — "never" is a real answer, but make it a deliberate one.
3. Press **Create token**, then copy the value. It is not shown again.

The section only appears on a multi-user instance where you are signed in. In single-user mode every
request is already you, so a token would prove nothing; in local mode there is no server at all.

## Creating one on the server

Useful for automation, for the very first token, and when your identity provider is the thing that
is broken — this path does not log in at all. Run it where `jitpackd` runs, with the same
environment the server has:

```bash
jitpackd token create --user you@example.com --name "nightly export"
```

| Flag | Meaning |
|---|---|
| `--user` | The account's id or e-mail address. If two accounts share an address, the command refuses rather than guessing. |
| `--name` | What the token is for. |
| `--expires` | `1h`, `1d`, `7d`, `30d`, `90d`, `365d` or `never`. Defaults to `90d`. |
| `--print-secret` | Required when output is not a terminal. |

That last flag is on purpose: the token is printed to standard output, which is exactly where a
shell history or a CI log would capture it. Redirecting it somewhere has to be a decision.

## Using one

Send it as a bearer token:

```bash
TOKEN='paste-the-token-here'
curl -H "Authorization: Bearer $TOKEN" https://jitpack.example.com/api/v1/me
```

A token can do anything you can do in the app, with one exception: **it cannot create another
token.** That keeps a leaked token from renewing itself indefinitely and outliving the expiry you
chose. To make a new one, sign in.

If a token stops working, it has expired, the account was deactivated, or the instance's session
secret was changed.

## Revoking tokens

There is no list and no per-token switch. To invalidate **every** API token on the instance, change
`JITPACK_SESSION_SECRET` and restart:

```bash
JITPACK_SESSION_SECRET=$(openssl rand -hex 32)
```

See [Configuration](configuration.md#generating-the-session-secret) for where that value lives in
your deployment.

**What this costs your users depends on how you authenticate them:**

- **With OIDC** — nothing. Their browsers hold a refresh token that is not affected, so they get a
  new session within fifteen minutes without noticing. This is the ordinary case.
- **Without OIDC**, on an instance using externally minted session tokens — everyone is signed out
  and has to obtain a session again. There is no refresh path to recover through.

After the restart, create replacements for the tokens you still need.

## If a token leaks

Treat it as your own account being compromised, because that is what it is. Rotate the secret as
above — that is immediate and total — and then create replacements. There is nothing narrower
available, which is worth knowing *before* you paste a token somewhere shared.
