# Family setup

You have a multi-user instance running behind HTTPS ([Installation](installation.md)) with an OIDC provider wired up ([Authentication](authentication.md)). This page takes it the rest of the way: from "the server is up" to "everyone in the household has an account, one of you is the admin, and you are packing the same trip".

## 1. Create the people at the identity provider

JIT-Pack has **no sign-up form and no user-creation endpoint** — identity belongs entirely to your OIDC provider. So the family roster is created there, not in JIT-Pack: one account per person, in Authelia's user file, Keycloak's realm, or wherever your IdP keeps its users.

Two claims matter beyond the credentials:

- **A display name** (the `name` claim, or `preferred_username`). It is what everyone else sees on packed items, comments and the presence row — "Mama" beats `user2`.
- **A verified e-mail address** for whoever will administrate the instance — the admin role match requires it (next step).

## 2. Name the admin

Put the admin's address in the server's environment **before** first logins:

```bash
JITPACK_ADMIN_EMAILS=you@example.com
```

The semantics are worth knowing precisely (the full detail is in [Configuration](configuration.md#instance-admins)):

- The match is against the e-mail the IdP reports **and asserts as verified** (`email_verified`). On an IdP where people can edit their own profile, an unverified address must not be able to claim the admin role — so it can't.
- The role is stamped **at login and refresh**, not continuously: adding or removing an address takes effect the next time that person logs in or their session refreshes, not the moment you restart the server.
- The list cuts both ways — removing an address revokes the role the same way.
- **An admin cannot be deactivated** while the role is stamped; the server refuses with `409 admin_undeactivatable`. To off-board an admin: remove their address from the list, wait for their next login or refresh to clear the role, then deactivate. [User Management](user-management.md#deactivating-an-instance-admin) walks through it.

## 3. Everyone logs in once

Accounts appear by **just-in-time provisioning**: the first completed login creates the account, keyed to the OIDC subject, with the name and e-mail the IdP reports ([the exact rules](user-management.md#how-accounts-come-into-existence)). There is nothing to pre-create in JIT-Pack and no invitation to send — hand each person the URL and their IdP credentials.

So the rollout is literally: everyone opens `https://jitpack.example.com` on their own phone, taps sign in, and logs in at the IdP once. Worth doing in the same sitting:

- **Install it to the home screen.** On iOS this is also what makes [push notifications](notifications.md) possible at all.
- **Enable push in Settings** on each device that should be notified.
- **Check the display name** that arrived. With an OIDC session the profile is read-only in the app — Settings says *Profile is managed by your identity provider* — so a wrong name is fixed at the IdP and catches up at the next login or refresh. The name matters most for `@mentions` in comments.

## 4. Check the roster on the admin page

As the admin, open **Settings → User administration** (the `/admin` page). It lists every provisioned account with its identity source and role — after step 3 it should show the whole family. This page is also where you later [deactivate an account](user-management.md#deactivate-and-reactivate) or [reset a display name or avatar](user-management.md#reset-a-display-name-or-an-avatar).

If your own row does not show the admin role, log out and back in (the stamp happens at login), then see [the troubleshooting entry](troubleshooting.md#an-admin-gets-403-forbidden-on-apiv1admin) for the remaining causes — the usual one is an e-mail the IdP has not marked verified.

## 5. Share a trip

Master data — items, tags, templates — is **instance-wide**: everyone sees and extends the same inventory, so whoever curates the packing templates does it once for the whole family. Trips, by contrast, are **membership-scoped**: a trip is visible only to its members, and the creator adds the others on the trip's **Members** screen. Once everyone is a member, packing is live for all of them — a checkmark on one phone lands on the others as it happens.

From here it is normal operation: [Backup](backup.md) for keeping the database safe, [Upgrades](upgrades.md) for moving versions without losing the family's history.
