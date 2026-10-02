# M12 — Analytics

* **Purpose:** Weight/value insight (3.8) and long-term trends (FR-14.3).
* **Elements (per the prototype):** Dimension switcher *Person / Kategorie / Gepäck* (FR-8.2); one packed-in-planned
  weight bar per dimension value, heaviest first; two KPI boxes below — weight packed/planned and **total value for the
  whole trip** (a per-slice value reads as noise); series trend section (archived trips of the series), **headed with
  the series' own name**, never the trip's: **packed** weight per year as columns, and one merged *Häufig markiert* list
  of the series' Missing/Unused items. The KPI numbers are the first use of G-13's **headline figure** role
  (`.jp-figure`).
* **Slices** are keyed by exactly what M4's facets filter on (traveler id,
  `category_name`, container id, `''` for the absence bucket), so a tapped bar becomes a facet without translation;
  absence buckets carry the facet wording (*Gemeinsam* / *Ohne Kategorie* / *Ohne Gepäck*, FR-25.11f/g). A bar lands
  on M4 *filtered*, never only regrouped, so the number that was tapped is on screen.
* **Actions:** Tapping a bar **picks** it (marked, `aria-pressed`); a second tap takes the pick back, and any number of
  bars of the current dimension can be picked. While at least one is, *„In der Packliste zeigen (n)"* stands under the
  bar card; it **sets the FR-25.11 facet** to the picked values — OR'd, as the sheet's chips are, and clearing every
  other facet, since the reader picked these numbers — and opens M4, where the chip row names the filter (FR-25.11a) and
  the session keeps it (FR-25.18); the grouping follows the dimension so the slices sit together. Switching the
  dimension drops the picks: a person and a bag are two facets, AND'd in M4, so a pick carried across would name nothing
  in the new view. ADR-012 leaves M4 mounted behind M12, so both writes move the live view state as well as the stored
  one. A bar is a quick filter rather than a link, so *„mine and the shared ones"* is put together here rather than by
  hand in the filter sheet; the cost is one more tap for the single-bar case.
* **Per-person items** (FR-25.1) need no expansion step in the client's data model: each traveler's instance is its own
  row with its own quantity and packed count, so by *Person* the rows are one contribution each and by *Kategorie* or
  *Gepäck* they sum back into a single bucket by construction. Rows with no traveler count as *Gemeinsam* (FR-25.11f's
  term).
* **States:** Items without weight metadata never enter a bar — a zero-width bar would read as "weighs nothing" — and
  are counted honestly beside the chart ("＋ n Artikel ohne Gewichtsangabe"); their value still counts. No weighted rows
  at all → an empty-state line in the bar card, **and no KPI tiles under it** (UX-11: „0 g / 0 g" and a unit-less „0.00"
  would restate the empty state as numbers). Each tile stands only when it has something to total: the weight tile with
  weighted rows, the value tile with a non-zero value — rendered through `formatValue` in the locale's number format,
  **which carries the instance's currency where one is named** (FR-21.9, `JITPACK_CURRENCY`) and stays unit-less where
  none is — as it does in Local Mode, which has no server to ask. No series, or a series with no archived trips → the
  trend section is absent, not empty.
* **Navigation:** From *Auswertung* in the bar's ⋮ on packing's views (G-12, FR-21.21, ADR-051 amendments 1 and 2 —
  a switcher pill while you are standing here); trend section also from M16.
