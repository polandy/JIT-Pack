# Install on Your Phone

JIT-Pack is a web app that installs to the home screen — no app store involved. Installed, it opens full-screen with its own icon, and once it has been opened online once, it keeps starting even without a connection: the app itself is cached on the device, while your data lives where your run mode puts it (on the device in Local Mode, on your server otherwise).

## HTTPS is required

Browsers only offer installation on a **secure address**: `https://`, or `http://localhost`. A plain-HTTP instance on your LAN (`http://192.168.1.x:3000`) still works fully as a website in the browser tab, but it cannot be installed as an app and does not get offline startup or push notifications.

If your instance is HTTP-only today, put it behind a reverse proxy with a certificate first — see [Installation](installation.md#serving-the-spa-behind-a-reverse-proxy).

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

## Updates

The app updates itself: whenever it is opened with a connection, it fetches the current version in the background. A newly downloaded version does not interrupt you — the sync indicator in the app bar shows a small dot, and its detail view says a new version is ready. It takes over the next time you open the app.

## Troubleshooting

| Symptom | Cause |
|---|---|
| No "Add to Home screen" / "Install" offer | The origin is not secure (see [HTTPS is required](#https-is-required)), or on iOS you are not in Safari. |
| Installed app shows an error when opened offline | It has to be opened online once after installation so the current version gets cached. |
| No push on iPhone despite granted permission | The app was opened in the Safari tab rather than from the home-screen icon. |
