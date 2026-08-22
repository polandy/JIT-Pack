/**
 * The item mark: a curated emoji index, its search and its suggestion
 * (§3.28, FR-28.2/28.3). Pure, no I/O.
 *
 * **One index, two consumers.** `searchMarks` and `suggestMarks` read the same
 * entries on purpose: two lists drift, and the drift is invisible until a user
 * searches for the thing the suggester just proposed.
 *
 * **Curated, not the full table.** The ~3,700-emoji CLDR set answers „Reise"
 * with a cruise ship and „Bau" with a classical building, which is how a picker
 * teaches people it does not understand them. Roughly a hundred packing-relevant
 * entries, each with German *and* English keywords, is the requirement rather
 * than a shortcut — and it is also what FR-28.6's font subset is cut to, so an
 * entry added here without a re-subset renders as tofu (the gate in
 * `scripts/mark-font-gate.mjs` fails the build for exactly that).
 */

/** The coarse facets the picker's chip row offers, in the order it shows them. */
export const MARK_FACETS = [
  'clothing',
  'travel',
  'documents',
  'hygiene',
  'health',
  'tech',
  'camping',
  'sport',
  'food',
  'other',
] as const

export type MarkFacet = (typeof MARK_FACETS)[number]

/** One entry of the curated index. */
export interface MarkEntry {
  /** The emoji itself — the value stored in `items.icon` / `templates.icon`. */
  emoji: string
  facet: MarkFacet
  /**
   * Match words in both languages, lower-case and unaccented. These are what
   * the search and the suggester see; the Unicode name is deliberately *not*
   * among them, because „regen" must reach 🧥 and ☂️, neither of which is
   * called that in any catalogue.
   */
  keywords: string[]
}

/**
 * The curated index. Order within a facet is the picker's grid order and is
 * therefore stable rather than incidental.
 */
export const MARK_INDEX: readonly MarkEntry[] = [
  // --- Kleidung ---
  { emoji: '👕', facet: 'clothing', keywords: ['shirt', 'tshirt', 't-shirt', 'oberteil', 'top'] },
  { emoji: '👖', facet: 'clothing', keywords: ['hose', 'jeans', 'trousers', 'pants'] },
  { emoji: '🩳', facet: 'clothing', keywords: ['shorts', 'kurze hose'] },
  { emoji: '👗', facet: 'clothing', keywords: ['kleid', 'dress'] },
  { emoji: '🧥', facet: 'clothing', keywords: ['jacke', 'mantel', 'regenjacke', 'jacket', 'coat'] },
  { emoji: '🧣', facet: 'clothing', keywords: ['schal', 'scarf'] },
  { emoji: '🧤', facet: 'clothing', keywords: ['handschuh', 'handschuhe', 'gloves'] },
  { emoji: '🧢', facet: 'clothing', keywords: ['mütze', 'kappe', 'cap', 'hat'] },
  { emoji: '🧦', facet: 'clothing', keywords: ['socke', 'socken', 'strumpf', 'socks'] },
  {
    emoji: '👟',
    facet: 'clothing',
    keywords: ['schuh', 'schuhe', 'turnschuh', 'sneaker', 'shoes'],
  },
  { emoji: '🥾', facet: 'clothing', keywords: ['wanderschuh', 'stiefel', 'boot', 'boots'] },
  { emoji: '🩴', facet: 'clothing', keywords: ['badeschuh', 'flip flop', 'sandale', 'sandals'] },
  { emoji: '🩱', facet: 'clothing', keywords: ['badeanzug', 'swimsuit'] },
  { emoji: '👙', facet: 'clothing', keywords: ['bikini', 'badehose', 'swimwear'] },
  { emoji: '👔', facet: 'clothing', keywords: ['hemd', 'krawatte', 'shirt', 'tie'] },
  { emoji: '🕶️', facet: 'clothing', keywords: ['sonnenbrille', 'sunglasses'] },
  { emoji: '👓', facet: 'clothing', keywords: ['brille', 'glasses'] },

  // --- Reise ---
  { emoji: '🧳', facet: 'travel', keywords: ['koffer', 'gepäck', 'luggage', 'suitcase'] },
  { emoji: '🎒', facet: 'travel', keywords: ['rucksack', 'backpack'] },
  { emoji: '👜', facet: 'travel', keywords: ['tasche', 'handtasche', 'bag'] },
  { emoji: '💼', facet: 'travel', keywords: ['aktentasche', 'briefcase'] },
  { emoji: '🗺️', facet: 'travel', keywords: ['karte', 'landkarte', 'map'] },
  { emoji: '🧭', facet: 'travel', keywords: ['kompass', 'compass'] },
  { emoji: '✈️', facet: 'travel', keywords: ['flug', 'flugzeug', 'flight', 'plane'] },
  { emoji: '🚗', facet: 'travel', keywords: ['auto', 'car'] },
  { emoji: '🚲', facet: 'travel', keywords: ['velo', 'fahrrad', 'bike', 'bicycle'] },
  { emoji: '🏨', facet: 'travel', keywords: ['hotel', 'unterkunft'] },
  { emoji: '🎫', facet: 'travel', keywords: ['ticket', 'billett', 'fahrkarte'] },
  { emoji: '🌂', facet: 'travel', keywords: ['schirm', 'regenschirm', 'umbrella'] },

  // --- Dokumente ---
  {
    emoji: '🪪',
    facet: 'documents',
    keywords: ['ausweis', 'identitätskarte', 'führerschein', 'licence'],
  },
  { emoji: '🛂', facet: 'documents', keywords: ['pass', 'reisepass', 'passport'] },
  { emoji: '📄', facet: 'documents', keywords: ['dokument', 'papier', 'document', 'paper'] },
  { emoji: '📋', facet: 'documents', keywords: ['liste', 'checkliste', 'list', 'checklist'] },
  { emoji: '💳', facet: 'documents', keywords: ['karte', 'kreditkarte', 'card'] },
  { emoji: '💶', facet: 'documents', keywords: ['geld', 'bargeld', 'cash', 'money'] },
  { emoji: '🔑', facet: 'documents', keywords: ['schlüssel', 'key', 'keys'] },
  { emoji: '📔', facet: 'documents', keywords: ['notizbuch', 'heft', 'notebook'] },
  { emoji: '✏️', facet: 'documents', keywords: ['stift', 'bleistift', 'pen', 'pencil'] },

  // --- Hygiene ---
  { emoji: '🪥', facet: 'hygiene', keywords: ['zahnbürste', 'bürste', 'toothbrush'] },
  { emoji: '🧴', facet: 'hygiene', keywords: ['creme', 'sonnencreme', 'lotion', 'shampoo'] },
  { emoji: '🧼', facet: 'hygiene', keywords: ['seife', 'soap'] },
  { emoji: '🪒', facet: 'hygiene', keywords: ['rasierer', 'razor', 'shaver'] },
  { emoji: '🧻', facet: 'hygiene', keywords: ['papier', 'toilettenpapier', 'tissue'] },
  { emoji: '🚿', facet: 'hygiene', keywords: ['dusche', 'shower'] },
  { emoji: '🧽', facet: 'hygiene', keywords: ['schwamm', 'sponge'] },
  { emoji: '💈', facet: 'hygiene', keywords: ['friseur', 'haare', 'hair'] },

  // --- Gesundheit ---
  { emoji: '💊', facet: 'health', keywords: ['medikament', 'tablette', 'pille', 'medicine'] },
  { emoji: '🩹', facet: 'health', keywords: ['pflaster', 'blasenpflaster', 'plaster', 'bandage'] },
  { emoji: '🩺', facet: 'health', keywords: ['apotheke', 'arzt', 'doctor', 'medical'] },
  { emoji: '🌡️', facet: 'health', keywords: ['thermometer', 'fieber', 'temperature'] },
  { emoji: '😷', facet: 'health', keywords: ['maske', 'mask'] },
  { emoji: '🧯', facet: 'health', keywords: ['löscher', 'notfall', 'emergency'] },

  // --- Technik ---
  { emoji: '📱', facet: 'tech', keywords: ['handy', 'telefon', 'phone', 'mobile'] },
  { emoji: '💻', facet: 'tech', keywords: ['laptop', 'computer', 'notebook'] },
  { emoji: '⌚', facet: 'tech', keywords: ['uhr', 'armbanduhr', 'watch'] },
  { emoji: '📷', facet: 'tech', keywords: ['kamera', 'foto', 'camera', 'photo'] },
  { emoji: '🎥', facet: 'tech', keywords: ['video', 'filmkamera', 'camcorder'] },
  { emoji: '🔋', facet: 'tech', keywords: ['akku', 'batterie', 'powerbank', 'battery'] },
  { emoji: '🔌', facet: 'tech', keywords: ['kabel', 'ladegerät', 'stecker', 'charger', 'cable'] },
  { emoji: '🎧', facet: 'tech', keywords: ['kopfhörer', 'headphones', 'earphones'] },
  { emoji: '💡', facet: 'tech', keywords: ['lampe', 'licht', 'lamp', 'light'] },
  { emoji: '🔦', facet: 'tech', keywords: ['taschenlampe', 'stirnlampe', 'torch', 'flashlight'] },
  { emoji: '🕹️', facet: 'tech', keywords: ['spiel', 'konsole', 'game', 'console'] },
  { emoji: '📻', facet: 'tech', keywords: ['radio', 'funk', 'empfänger'] },

  // --- Camping ---
  { emoji: '⛺', facet: 'camping', keywords: ['zelt', 'camping', 'tent'] },
  { emoji: '🛏️', facet: 'camping', keywords: ['bett', 'schlafsack', 'matte', 'bed', 'sleeping'] },
  { emoji: '🔥', facet: 'camping', keywords: ['feuer', 'grill', 'fire'] },
  { emoji: '🍳', facet: 'camping', keywords: ['pfanne', 'kochen', 'pan', 'cooking'] },
  { emoji: '🔪', facet: 'camping', keywords: ['messer', 'knife'] },
  { emoji: '🪓', facet: 'camping', keywords: ['axt', 'beil', 'axe'] },
  { emoji: '🔨', facet: 'camping', keywords: ['hammer', 'werkzeug', 'tool'] },
  { emoji: '🧰', facet: 'camping', keywords: ['werkzeugkasten', 'toolbox'] },
  { emoji: '🪢', facet: 'camping', keywords: ['seil', 'schnur', 'rope', 'cord'] },
  { emoji: '🕯️', facet: 'camping', keywords: ['kerze', 'candle'] },
  { emoji: '🧊', facet: 'camping', keywords: ['kühl', 'eis', 'cooler', 'ice'] },

  // --- Sport ---
  { emoji: '⚽', facet: 'sport', keywords: ['ball', 'fussball', 'football', 'soccer'] },
  { emoji: '🏀', facet: 'sport', keywords: ['basketball', 'korbball', 'ball'] },
  { emoji: '🎾', facet: 'sport', keywords: ['tennis', 'tennisschläger', 'racket'] },
  { emoji: '🏊', facet: 'sport', keywords: ['schwimmen', 'swimming'] },
  { emoji: '🚴', facet: 'sport', keywords: ['radfahren', 'cycling'] },
  { emoji: '🎿', facet: 'sport', keywords: ['ski', 'skifahren', 'skiing'] },
  { emoji: '🏂', facet: 'sport', keywords: ['snowboard', 'snowboarden', 'board'] },
  { emoji: '🧗', facet: 'sport', keywords: ['klettern', 'climbing'] },
  { emoji: '🏄', facet: 'sport', keywords: ['surfen', 'surfing'] },
  { emoji: '🪁', facet: 'sport', keywords: ['drachen', 'kite'] },

  // --- Essen ---
  { emoji: '🍎', facet: 'food', keywords: ['obst', 'apfel', 'fruit', 'apple'] },
  { emoji: '🥖', facet: 'food', keywords: ['brot', 'bread'] },
  { emoji: '🧃', facet: 'food', keywords: ['saft', 'juice', 'drink'] },
  { emoji: '☕', facet: 'food', keywords: ['kaffee', 'tee', 'coffee', 'tea'] },
  { emoji: '🥤', facet: 'food', keywords: ['flasche', 'wasserflasche', 'bottle', 'water'] },
  { emoji: '🍫', facet: 'food', keywords: ['schokolade', 'chocolate', 'snack'] },
  { emoji: '🥫', facet: 'food', keywords: ['konserve', 'dose', 'can', 'tin'] },
  { emoji: '🍪', facet: 'food', keywords: ['keks', 'guetzli', 'biscuit', 'cookie'] },
  { emoji: '🧂', facet: 'food', keywords: ['salz', 'gewürz', 'salt', 'spice'] },
  { emoji: '🍽️', facet: 'food', keywords: ['geschirr', 'teller', 'besteck', 'cutlery', 'plate'] },

  // --- Sonstiges ---
  { emoji: '📦', facet: 'other', keywords: ['kiste', 'schachtel', 'box'] },
  { emoji: '🧺', facet: 'other', keywords: ['korb', 'wäsche', 'basket', 'laundry'] },
  { emoji: '🪣', facet: 'other', keywords: ['eimer', 'kübel', 'bucket'] },
  { emoji: '🧹', facet: 'other', keywords: ['besen', 'putzen', 'broom', 'cleaning'] },
  { emoji: '🎁', facet: 'other', keywords: ['geschenk', 'gift', 'present'] },
  { emoji: '🧸', facet: 'other', keywords: ['spielzeug', 'kuscheltier', 'toy', 'teddy'] },
  { emoji: '🔒', facet: 'other', keywords: ['schloss', 'lock'] },
]

/**
 * Below this length a keyword must match a **whole word** of the name rather
 * than sitting anywhere inside it. Without the rule „Kleid" reaches an ID card
 * through the letters *id*, and the picker starts offering noise beside the
 * right answer (FR-28.3).
 */
const KEYWORD_SUBSTRING_MIN = 4

/** A one-character query would return half the index, so it returns nothing. */
const SEARCH_QUERY_MIN = 2

/** The suggestion band is a band, not a second grid (FR-28.3). */
export const MARK_SUGGESTION_LIMIT = 4

/**
 * The app's one matching fold — case- and diacritics-insensitive, the same
 * rule as the FR-27.13 group search and the M4 quick-add.
 */
function fold(text: string): string {
  return text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Word boundaries for the short-keyword rule: anything that is not a letter or digit. */
function words(folded: string): string[] {
  return folded.split(/[^\p{L}\p{N}]+/u).filter(Boolean)
}

/**
 * Whether `keyword` is present in the already-folded `haystack`. A long keyword
 * may sit inside a compound („zelt" in „tarnzelt"); a short one may not.
 */
function keywordHits(keyword: string, haystack: string, haystackWords: string[]): boolean {
  return keyword.length >= KEYWORD_SUBSTRING_MIN
    ? haystack.includes(keyword)
    : haystackWords.includes(keyword)
}

/** markFacetOf answers which facet an emoji belongs to, or null if it is not curated. */
export function markFacetOf(emoji: string): MarkFacet | null {
  return MARK_INDEX.find((entry) => entry.emoji === emoji)?.facet ?? null
}

/**
 * searchMarks answers the picker's search field and its facet chips (FR-28.2).
 *
 * An **empty query browses**: the facet's entries in index order, which is why
 * the grid is usable without typing at all. A query matches against the
 * curated keywords in both languages — never against Unicode names, because
 * „regen" must reach 🧥 and 🌂 and neither is called that anywhere.
 *
 * Ranking is derived rather than incidental: a keyword the query *starts*
 * beats one it merely sits inside, shorter keywords beat longer ones at the
 * same rank (they are the closer answer), and index order breaks the remaining
 * ties — so two devices offer the same search the same order.
 */
export function searchMarks(query: string, facet: MarkFacet | null): MarkEntry[] {
  const pool = facet === null ? MARK_INDEX : MARK_INDEX.filter((entry) => entry.facet === facet)
  const needle = fold(query.trim())
  if (!needle) return [...pool]
  if (needle.length < SEARCH_QUERY_MIN) return []

  const scored: { entry: MarkEntry; rank: number; length: number; order: number }[] = []
  pool.forEach((entry, order) => {
    let best: { rank: number; length: number } | null = null
    for (const raw of entry.keywords) {
      const keyword = fold(raw)
      if (!keyword.includes(needle)) continue
      const rank = keyword.startsWith(needle) ? 0 : 1
      if (!best || rank < best.rank || (rank === best.rank && keyword.length < best.length)) {
        best = { rank, length: keyword.length }
      }
    }
    if (best) scored.push({ entry, rank: best.rank, length: best.length, order })
  })

  return scored
    .sort((a, b) => a.rank - b.rank || a.length - b.length || a.order - b.order)
    .map((hit) => hit.entry)
}

/**
 * suggestMarks proposes marks derived from an item's or template's name
 * (FR-28.3) — the reason the feature is worth building, because the common
 * case must not require typing the name twice.
 *
 * It reads the **same index** the search reads: a suggester with its own list
 * drifts, and the drift only shows when a user searches for what it just
 * proposed. Compounds resolve through the index's own vocabulary — „Tarnzelt"
 * reaches ⛺ because *zelt* is a keyword, while „Zahnbürste" never decays into
 * *ürste*, because that is not.
 *
 * The result is always an **offer**, never a pre-fill: a longer keyword is the
 * more specific claim and therefore leads, but „Stirnlampe" proposing a torch
 * is close enough to scan by and wrong as a statement. An empty array is a
 * first-class answer — the picker names it rather than rendering a gap.
 */
export function suggestMarks(name: string): MarkEntry[] {
  const haystack = fold(name.trim())
  if (!haystack) return []
  const haystackWords = words(haystack)

  const scored: { entry: MarkEntry; length: number; order: number }[] = []
  MARK_INDEX.forEach((entry, order) => {
    let longest = 0
    for (const raw of entry.keywords) {
      const keyword = fold(raw)
      if (keywordHits(keyword, haystack, haystackWords)) longest = Math.max(longest, keyword.length)
    }
    if (longest > 0) scored.push({ entry, length: longest, order })
  })

  return scored
    .sort((a, b) => b.length - a.length || a.order - b.order)
    .slice(0, MARK_SUGGESTION_LIMIT)
    .map((hit) => hit.entry)
}
