# Install on Your Phone

JIT-Pack is a web app that installs to the home screen — no app store involved. Installed, it opens full-screen with its own icon, and once it has been opened online once, it keeps starting even without a connection: the app itself is cached on the device, while your data lives where your run mode puts it (on the device in Local Mode, on your server otherwise).

## HTTPS is required

Browsers only offer installation on a **secure address**: `https://`, or `http://localhost`. A plain-HTTP instance on your LAN (`http://192.168.1.x:3000`) still works fully as a website in the browser tab, but it cannot be installed as an app and does not get offline startup or push notifications.

If your instance is HTTP-only today, put it behind a reverse proxy with a certificate first — see [Installation](installation.md#putting-a-reverse-proxy-in-front).

## Android (Chrome)

1. Open your JIT-Pack address in Chrome.
2. Open the **⋮** menu → **Add to Home screen** (on recent versions: **Install app**). Chrome may also offer an install banner on its own.
3. Confirm. The JIT-Pack icon appears on the home screen; opening it launches full-screen, without the browser chrome.

## iPhone and iPad (Safari)

1. Open your JIT-Pack address in Safari — the share flow below is Safari's; other iOS browsers do not offer it.
2. Tap the **Share** button (the square with the arrow).
3. Scroll to **Add to Home Screen** and confirm.

### Push notifications on iOS need the installed app

On iOS, web push only works for web apps that have been added to the home screen — Safari in the browser tab never receives push. So if you want notifications (delegations, mentions, tasks) on an iPhone or iPad:

1. Install JIT-Pack to the home screen as above.
2. Open it **from the home screen icon**.
3. Enable **Push on this device** under **Settings → Notifications** inside the app, and grant the permission prompt.

On Android and desktop browsers, push works with or without installing.

Notifications exist on multi-user instances. In Single-User and Local Mode there is nobody to notify, so the app hides the section entirely.

## Packing without a connection

Changes you make while the connection is gone are kept **on the phone**, not
just in the open tab. The sync indicator in the app bar carries a number: how
many changes are still waiting. Its detail view — tap the indicator — spells
the same thing out and tells you they are saved on this device.

That survives closing the app or reloading the page. When the app is next
opened with a connection, the waiting changes are sent before anything is
fetched, so your offline packing is never overwritten by an older copy from
the server.

Two things worth knowing:

- The changes go out when the app **does something** with a network again:
  when it starts, when you open the trip, or when you make the next change.
  It does not send them the instant the wifi returns while the app sits idle.
- Very rarely the browser refuses to store anything more (no space left). The
  detail view then says so instead of promising your changes are safe — back
  out of the packing screen and reconnect before you close the app.

## When a change is refused

Some changes cannot be kept. Deleting a Vorlage a finished trip still refers
to is the common one — the trip would lose the record of where its things came
from, so the server keeps the Vorlage instead. It can also happen because
somebody else changed the same thing first, or because you are not allowed to
change it.

You do not have to look for those. The change is **undone on your device**, and
a short message says how many changes were refused and, where it can, why. The
sync indicator's detail view keeps the last reason, so you can read it again
after the message is gone.

The refused change is not tried again — trying forever would hold up everything
behind it. If you still want it, make it again once the reason no longer
applies.

## Updates

The app updates itself: whenever it is opened with a connection, it fetches the current version in the background. A newly downloaded version never interrupts you — nothing reloads on its own.

Once one is ready, the app says so in two places and lets you decide when to switch:

- A bar appears under the app bar: **New version ready**, with **Update** beside it. **Later** hides the bar; the offer stays where the second place is.
- The sync indicator in the app bar carries a small dot. Tap it, and the detail view says a new version is ready and offers **Update now**.

Either button switches immediately: the app reloads onto the new version, which takes a moment. **Changes you have made are kept** — anything not yet sent to the server is stored on this device and goes out afterwards. What is not kept is text you were still typing into a form you had not saved, so finish that first.

If you press neither, the new version takes over the next time you open the app — a real launch, not a page reload: close the app fully and open it again.

## Troubleshooting

| Symptom | Cause |
|---|---|
| No "Add to Home screen" / "Install" offer | The origin is not secure (see [HTTPS is required](#https-is-required)), or on iOS you are not in Safari. |
| Installed app shows an error when opened offline | It has to be opened online once after installation so the current version gets cached. |
| No push on iPhone despite granted permission | The app was opened in the Safari tab rather than from the home-screen icon. |
