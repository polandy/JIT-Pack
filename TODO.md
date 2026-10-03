# Todo / roadmap

One line per item, newest at the end. A finished item is deleted.

## Open

- [ ] Create a meal plan that also appears on the day plan — with the shopping list integrated (2026-10-03)
- [ ] Search the Swiss timetable in the shared connection sheet — M29's "Add connection" and the excursion's *Hin*/*Zurück* slots alike (FR-29.18): the app calls transport.opendata.ch directly (CORS open, works in every mode incl. Local with network) — search first (from/to/time with stop suggestions, tap a result), SBB link and hand entry stay below; on an excursion *Nach* is prefilled with the stop nearest the track's start, the return reversed from arrival + route, each result showing its slack; no stop found (abroad) says so and opens the hand fields; `JITPACK_TIMETABLE=false` turns it off (on by default, named in `docs/`); amends ADR-086 (focus Switzerland). Mockup `.claude/mockups/mockup-excursion-connections.html` (2026-10-03)
- [ ] Geocaching integration, GPX import and links first — import Pocket Query / single-cache GPX as waypoints (extend the existing GPX path) and show `coord.info/GCxxxx` link previews on planner ideas and excursions (§3.29); the official Groundspeak API needs approval, restricts caching and is server-only (absent in Local Mode), Opencaching OKAPI (open, DE/PL/NL, CC BY-NC-ND) only if in-app cache search is wanted, unofficial scrapers are out (ToS) (2026-10-03)
