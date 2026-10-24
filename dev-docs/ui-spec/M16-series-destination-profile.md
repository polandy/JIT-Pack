# M16 — Series & Destination Profile

* **Purpose:** Manage recurring-trip context (3.13).
* **Elements:** Series name; the three default attribute **selects** — season, transport, accommodation (FR-15.1), which
  are what M3 prefills from; destination notes; destination checklist editor (FR-13.3), each entry carrying one of the
  three FR-25.13 procurement modes; **series tasks** (FR-13.4) under *„Aufgaben für jede Reise"*, between the
  checklist and the trips: a line per task naming its lead (*„4 Wochen vor Abreise"*, *„Kein Termin"*) and, in Server
  Mode, its default assignee's seat (an empty seat for nobody; G-8 hides it elsewhere); a tap on a line, or *„+
  Aufgabe"* under the last, opens the task's sheet — the text, the lead as chips (*Kein Termin · Am Vortag · 3 Tage · 1
  Woche · 2 Wochen · 4 Wochen · 8 Wochen*) with a line saying the day it gives the series' next trip, and *„Wer
  macht's?"* (*Niemand* and the instance's users) — and a quiet note under the list, *„Jede neue Reise dieser Serie
  bekommt diese Aufgaben. Fällig rechnet von der Abreise aus."*; trip history list of the series with per-trip stats;
  shortcut to series trends (M12). **The destination profile is created lazily** — nothing writes one until a note, a
  checklist entry or a series task is.
* **Actions:** Edit profile; create new trip in series (→ M3 prefilled, carrying the series *and*
  its defaults); copy the series' most recent archived trip (*„„…" kopieren"*, FR-12.1, offered only when there is
  one); detach/attach trips — attaching raises M22's series-task offer (FR-13.4). Renaming onto a name another series
  holds is refused (FR-13.1): a toast names the holder and the field goes back to the stored name.
* **Navigation:** From M2 series headers.
