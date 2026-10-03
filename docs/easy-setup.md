# Easy Setup

JIT-Pack does not need a homelab. This page picks the smallest setup that does what you want, and for the two that reach beyond your own network it gives you a ready stack: one `docker compose up -d` and a handful of clicks, with TLS certificates obtained for you.

## Which setup fits

| Who packs, and from where | Setup | What you run |
|---|---|---|
| Just you, in one browser or on one phone | **Local Mode** | Nothing. Open any JIT-Pack instance once and choose *Local*; your data stays on that device. |
| Just you, at home | **Single-User**, plain | The one `docker run` from the [front page](index.md). |
| Just you, on every device and from anywhere | **Single-User behind a password** | [`deploy/single-user-caddy/`](#just-you-from-anywhere) |
| A household, each with their own account | **Multi-user with Pocket ID** | [`deploy/multi-user-pocket-id/`](#a-household) |
| You already run an identity provider and a reverse proxy | **Multi-user, your own stack** | [`deploy/multi-user/`](https://github.com/polandy/JIT-Pack/tree/main/deploy/multi-user) with [Authentication](authentication.md) |

If others are going to join, start with the household stack. A Local Mode device can [move to a server](backup.md#moving-to-a-server) later, but the move carries the inventory, templates and trips — not tasks, notes or the planner.

## What both stacks need

- **A machine with Docker and the Compose plugin** that stays on — a small VPS, a Raspberry Pi, an old laptop.
- **Ports 80 and 443 reachable from the internet.** The stacks bring [Caddy](https://caddyserver.com/), which fetches a Let's Encrypt certificate on its own, and Let's Encrypt has to reach it to hand one out. At home that means forwarding both ports on your router to the machine.
- **A DNS name pointing at the machine** — two for the household stack. Any name works, including a free dynamic-DNS one.
- **The stack's files.** Clone the repository, or copy the three files of the stack's directory:

  ```bash
  git clone https://github.com/polandy/JIT-Pack.git
  cd JIT-Pack/deploy/single-user-caddy        # or deploy/multi-user-pocket-id
  cp .env.example .env
  ```

Everything else lives in Docker volumes. Back them up as described in [Backup](backup.md) — for the household stack that includes `pocket-id-data` (see [below](#back-up-pocket-id-too)).

---

## Just you, from anywhere

`deploy/single-user-caddy/` runs JIT-Pack in [Single-User Mode](authentication.md#single-user-mode) behind Caddy, which adds HTTPS and asks for a user name and password before anything reaches the app.

**1. Fill in `.env`.** Set `JITPACK_HOST` to your DNS name and `BASIC_AUTH_USER` to a user name. The password goes in as a hash, which Caddy computes for you:

```bash
docker run --rm caddy:2.11.6-alpine caddy hash-password --plaintext 'your password'
```

Put the result in `BASIC_AUTH_HASH`, inside single quotes — the hash contains `$` signs, and without the quotes Compose would read them as variables.

**2. Start it.**

```bash
docker compose up -d
```

**3. Open `https://<your name>`.** The browser asks for the user name and password and remembers them. On the first-run screen choose **Server**: the address is already filled in. There is no further login — you are the instance's one user.

Things to know:

- **The password is the only lock.** Single-User Mode itself checks nothing, so whoever knows the password is you. Choose a long one.
- **Two things are reachable without it:** the web-app manifest and the app icons. Browsers fetch those without credentials when installing the app to a home screen, and they say nothing about your data.

---

## A household

`deploy/multi-user-pocket-id/` gives everyone their own account, without a password anywhere: people sign in with a passkey — the phone's fingerprint or face unlock. Three containers:

- **JIT-Pack** itself.
- **[Pocket ID](https://pocket-id.org/)**, a small identity provider, where the accounts live.
- **Caddy**, which serves both under their own names with HTTPS.

**1. Fill in `.env`.**

- `JITPACK_HOST` and `AUTH_HOST` — two DNS names, both pointing at the machine, e.g. `jitpack.example.com` and `auth.example.com`.
- `JITPACK_SESSION_SECRET` — generate it with `openssl rand -hex 32`.
- `POCKET_ID_ENCRYPTION_KEY` — generate it with `openssl rand -base64 32`.
- `JITPACK_ADMIN_EMAILS` — your own e-mail address. It makes you the instance admin in JIT-Pack.
- `TZ` — your time zone, e.g. `Europe/Zurich`, so [task reminders](configuration.md#task-reminders) arrive in the morning.

Leave `JITPACK_OIDC_CLIENT_ID` and `JITPACK_OIDC_CLIENT_SECRET` empty for now; step 5 fills them.

**2. Start it.**

```bash
docker compose up -d
```

Pocket ID and Caddy come up. JIT-Pack does not, yet: until step 5 it restarts every few seconds with `config: JITPACK_OIDC_ISSUER, JITPACK_OIDC_CLIENT_ID, and JITPACK_OIDC_CLIENT_SECRET must be set together` in `docker compose logs app`. That is expected.

**3. Create your Pocket ID account.** Open `https://<AUTH_HOST>/setup`, fill in your name and user name, and for the e-mail **enter a placeholder** such as `you@setup.invalid` — step 4 explains why. Then add a passkey when asked.

**4. Turn on verified addresses, then enter your real one.**

- In Pocket ID, open **Application Configuration → Email**, switch on **Emails verified by default** and save.
- Open **My Account**, replace the placeholder with your real address — the one in `JITPACK_ADMIN_EMAILS` — and save.

The reason: JIT-Pack grants the admin role only to an address the identity provider vouches for ([why](configuration.md#instance-admins)). Pocket ID never marks the account created at `/setup` as verified, but with the setting on it does mark every address entered from then on, including your own changed one. Skip this and everything works except the [User administration](user-management.md) page, which you would not be allowed to open.

**5. Register JIT-Pack with Pocket ID.**

- Open **OIDC Clients → Add OIDC Client**. Name: `JIT-Pack`. Client type: **Confidential Client**. Under **Add callback URL** enter `https://<JITPACK_HOST>/auth/callback`. Click **Create**.
- Copy the **Client ID** and the **Client secret** into `.env` as `JITPACK_OIDC_CLIENT_ID` and `JITPACK_OIDC_CLIENT_SECRET`. The secret is shown only now.
- On the client's **Access** tab choose **All Users** and confirm **Unrestrict**. A new client admits nobody until you do — signing in would end on *You are not allowed to access this service*.
- Back on the **General** tab, set **Refresh token inactivity timeout** to `90` days and save. JIT-Pack keeps a device signed in for 90 days without use; with Pocket ID's default of 30, a phone left alone for a month would have to sign in again.

Then start JIT-Pack with the new values:

```bash
docker compose up -d
```

`docker compose logs app` now says `starting in multi-user mode (OIDC broker: https://<AUTH_HOST>)`.

**6. Sign in.** Open `https://<JITPACK_HOST>`, choose **Server** on the first-run screen, then **Sign in with SSO**. Pocket ID asks for your passkey and, the first time, whether JIT-Pack may see your name and e-mail. You land in the app as its admin.

**7. Add the household.** For each person:

- In Pocket ID, **Users → Add User** with their name and e-mail address.
- In the user's row menu choose **Login Code** and **Show Code**. It gives a one-time link, valid for an hour.
- Send them the link. Opened on their phone, it signs them in to Pocket ID and asks them to add a passkey. From then on they open `https://<JITPACK_HOST>` and sign in like you did.

Their JIT-Pack account appears with their first sign-in. From here, [Multi-user Setup](multi-user-setup.md#3-everyone-logs-in-once) continues with installing the app on phones, push notifications and sharing a trip.

### Back up Pocket ID too

JIT-Pack knows each person by the identity Pocket ID gave them. If the `pocket-id-data` volume is lost and the accounts are created again, Pocket ID hands out new identities, and JIT-Pack sees new people — the old accounts, with their trips and memberships, are no longer anyone's. Back up `pocket-id-data` alongside `data`.

### Why the stack resolves its own names

At startup JIT-Pack fetches `https://<AUTH_HOST>/.well-known/openid-configuration`, and the address must be the very one your browser uses. From inside a container, that name would normally lead out to the internet and back in through your router — which many home routers refuse. The compose file gives Caddy both names inside the stack, so the request stays on the machine and Caddy answers it with the same certificate the browser sees.
