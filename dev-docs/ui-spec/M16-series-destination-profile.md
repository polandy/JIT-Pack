# M16 — Series & Destination Profile

* **Purpose:** Manage recurring-trip context (3.13).
* **Elements:** Series name; the three default attribute **selects** — season, transport, accommodation (FR-15.1), which
  are what M3 prefills from; destination notes; destination checklist editor (FR-13.3), each entry carrying one of the
  three FR-25.13 procurement modes; trip history list of the series with per-trip stats; shortcut to series trends
  (M12). **The destination profile is created lazily** — nothing writes one until a note or a checklist entry is.
* **Actions:** Edit profile; create new trip in series (→ M3 prefilled, carrying the series *and* its defaults); copy
  the series' most recent archived trip (*„„…" kopieren"*, FR-12.1, offered only when there is one); detach/attach
  trips. Renaming onto a name another series holds is refused (FR-13.1): a toast names the holder and the field goes
  back to the stored name.
* **Navigation:** From M2 series headers.
