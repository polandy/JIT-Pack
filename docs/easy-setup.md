# Easy Setup

JIT-Pack's own login is brokered from an OIDC identity provider. If you do not run one yet, this page gives you one: [`deploy/multi-user-pocket-id/`](https://github.com/polandy/JIT-Pack/tree/main/deploy/multi-user-pocket-id) puts **[Pocket ID](https://pocket-id.org/)** beside JIT-Pack, so everyone in the household gets an account and signs in with a passkey — the phone's fingerprint or face unlock, no password anywhere.

## Which setup fits

| Who packs, and from where | Setup | What you run |
|---|---|---|
| Just you, in one browser or on one phone | **Local Mode** | Nothing. Open any JIT-Pack instance once and choose *Local*; your data stays on that device. |
| Just you, at home | **Single-User** | The one `docker run` from the [front page](index.md). |
| A household, each with their own account, no identity provider yet | **Multi-user with Pocket ID** | This page. |
| You already run an identity provider | **Multi-user, your own provider** | [`deploy/multi-user/`](https://github.com/polandy/JIT-Pack/tree/main/deploy/multi-user) with [Authentication](authentication.md) |

If others are going to join, start with accounts. A Local Mode device can [move to a server](backup.md#moving-to-a-server) later, but the move carries the inventory, templates and trips — not tasks, notes or the planner.

## What you need

- **Traefik**, already running on the machine, with an entrypoint `websecure` on port 443, a certificate resolver `letsencrypt`, and its containers on an external Docker network called `proxy` — the same shape [Installation](installation.md#the-example-stack) describes for `deploy/multi-user/`. Rename those three in the compose file if yours are called differently.
- **Two DNS names** pointing at the machine, e.g. `jitpack.example.com` and `auth.example.com`.
- **The stack's files:**

  ```bash
  git clone https://github.com/polandy/JIT-Pack.git
  cd JIT-Pack/deploy/multi-user-pocket-id
  cp .env.example .env
  ```

The stack is two containers on top of your Traefik: **JIT-Pack** and **Pocket ID**, where the accounts live. Both keep their data in Docker volumes; back them up as described in [Backup](backup.md), `pocket-id-data` included (see [below](#back-up-pocket-id-too)).

## Step by step

**1. Fill in `.env`.**

- `JITPACK_HOST` and `AUTH_HOST` — the two DNS names.
- `JITPACK_SESSION_SECRET` — generate it with `openssl rand -hex 32`.
- `POCKET_ID_ENCRYPTION_KEY` — generate it with `openssl rand -base64 32`.
- `JITPACK_ADMIN_EMAILS` — your own e-mail address. It makes you the instance admin in JIT-Pack.
- `TZ` — your time zone, e.g. `Europe/Zurich`, so [task reminders](configuration.md#task-reminders) arrive in the morning.

Leave `JITPACK_OIDC_CLIENT_ID` and `JITPACK_OIDC_CLIENT_SECRET` empty for now; step 5 fills them.

**2. Start it.**

```bash
docker compose up -d
```

Pocket ID comes up, and Traefik obtains its certificates. JIT-Pack does not start yet: until step 5 it restarts every few seconds with `config: JITPACK_OIDC_ISSUER, JITPACK_OIDC_CLIENT_ID, and JITPACK_OIDC_CLIENT_SECRET must be set together` in `docker compose logs app`. That is expected.

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

### Why JIT-Pack is pointed at the host for Pocket ID

At startup JIT-Pack fetches `https://<AUTH_HOST>/.well-known/openid-configuration`, and the address must be the very one your browser uses. From inside a container, that name would normally lead out to the internet and back in through your router — which many home routers refuse. The compose file maps the name to the Docker host instead (`extra_hosts: <AUTH_HOST>:host-gateway`), so the request reaches your Traefik on this machine and gets the same certificate the browser sees. This needs Traefik to publish port 443 on the host, as it does in the usual setup.
