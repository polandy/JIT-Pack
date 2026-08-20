# Notifications & Push

JIT-Pack notifies people when someone else's action concerns them. Three things trigger a notification, and only these:

- **Delegation** — someone hands you the responsibility for packing an item.
- **Mention** — a comment names you with `@display-name`.
- **Task** — a comment on an item is flagged as a task; the item's packer is notified.

Notifications exist **only in multi-user mode**. In Single-User Mode there is no second person to notify, so the whole system is inert; Local Mode has no server at all.

Every notification arrives in-app (a toast while the app is open, and the notification list). **Web Push** additionally delivers it to a device while the app is closed — that is the part with operational requirements, and the rest of this page.

## What the server needs: nothing

Web Push is zero-configuration on the server. The VAPID keypair that authenticates your instance to the browser vendors' push services is **generated on first use and persisted in the database** — there is no key to create, mount, or rotate.

The one optional knob is `JITPACK_PUSH_CONTACT` (e.g. `mailto:ops@example.com`). It becomes the VAPID `sub` claim — the contact a push service's operator sees if your instance misbehaves. It is purely informational: delivery works identically with or without it, and an unset value falls back to a built-in placeholder. Set it if the instance serves more than your own household; nothing breaks if you don't.

Two things *around* the server do matter:

- **HTTPS is a hard requirement.** Service workers and the Push API only exist in a secure context, so an instance served over plain HTTP can never register for push (`localhost` is the sole exception, for development). If you followed [Installation](installation.md), your reverse proxy already terminates TLS.
- **The service worker must be served.** Push lands in `sw.js`, which ships in the SPA build at the site root. Any static host that serves the built client serves it too — this only goes wrong with a proxy rule that catches `/sw.js` and sends it somewhere else.

## What each person does: opt in per device

Push is off until someone turns it on, and the choice is **per device** — a phone and a laptop register separately.

1. Open **Settings** in the app on that device.
2. Turn on the push toggle and accept the browser's permission prompt.

Where the browser cannot do push, the toggle is disabled and says *Not supported by this browser*. The case that surprises people is the iPhone: **iOS delivers Web Push only to web apps installed on the home screen** (iOS 16.4 or later), so in a plain Safari tab the toggle stays disabled. Install the app to the home screen via the share sheet first, open it from there, and then enable push in Settings.

Beside the toggle, Settings has per-type switches (delegation / mention / task). Switching a type off stops those notifications at the source — nothing is created, so nothing is pushed to any device either.

## Verifying delivery end to end

The realistic test needs two accounts and one shared trip:

1. On device A, log in as person A, enable push in Settings, then **close the app** (on iOS: actually close the installed app, don't just background the tab).
2. On device B, log in as person B, open the shared trip, and assign an item to person A.
3. Device A should show an OS notification within a few seconds.

If nothing arrives:

- **Was a notification created at all?** Reopen the app on device A — if the notification is in the in-app list, creation works and the problem is confined to the push leg. If not, check that both accounts are members of the same trip, that the notification type is switched on, and that you are not on a single-user instance.
- **Check the server log.** Push delivery is fire-and-forget: failures never surface to any user, but each one is logged. A push service answering `404` or `410` means the browser has dropped the registration — the server deletes such subscriptions automatically, and re-enabling the toggle on the device registers a fresh one.
- **Deactivated accounts get nothing.** [Deactivating a user](user-management.md#deactivate-and-reactivate) drops their push subscriptions.
- **Push registrations do not survive a database reset.** After [an upgrade that started from a fresh database](upgrades.md), every device must re-enable the toggle once.
