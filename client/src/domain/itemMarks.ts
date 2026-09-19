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
 * teaches people it does not understand them. Roughly 350 packing-relevant
 * entries, each with German *and* English keywords, is the requirement rather
 * than a shortcut — and it is also what FR-28.6's font subset is cut to, so an
 * entry added here without a re-subset renders as tofu (the gate in
 * `scripts/mark-font-gate.mjs` fails the build for exactly that).
 */

import { foldSearch as fold, searchWords as words } from './search'

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
  { emoji: '🩲', facet: 'clothing', keywords: ['unterhose', 'slip', 'boxershorts', 'underwear'] },
  { emoji: '👚', facet: 'clothing', keywords: ['bluse', 'damenshirt', 'blouse'] },
  {
    emoji: '👘',
    facet: 'clothing',
    keywords: ['bademantel', 'kimono', 'morgenmantel', 'bathrobe'],
  },
  { emoji: '👛', facet: 'clothing', keywords: ['portemonnaie', 'geldbeutel', 'purse', 'wallet'] },
  { emoji: '🎩', facet: 'clothing', keywords: ['zylinder', 'festhut', 'top hat'] },
  { emoji: '👒', facet: 'clothing', keywords: ['sonnenhut', 'strohhut', 'sunhat'] },
  {
    emoji: '👞',
    facet: 'clothing',
    keywords: ['halbschuh', 'lederschuh', 'businessschuh', 'dress shoe'],
  },
  { emoji: '👠', facet: 'clothing', keywords: ['absatzschuh', 'highheels', 'pumps'] },
  { emoji: '🥿', facet: 'clothing', keywords: ['ballerina', 'flache schuhe', 'flats'] },
  { emoji: '👢', facet: 'clothing', keywords: ['gummistiefel', 'regenstiefel', 'rain boots'] },
  { emoji: '🩰', facet: 'clothing', keywords: ['ballettschuhe', 'tanzschuhe', 'ballet'] },
  { emoji: '🎽', facet: 'clothing', keywords: ['laufshirt', 'trikot', 'running shirt'] },

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
  { emoji: '🚆', facet: 'travel', keywords: ['zug', 'bahn', 'train'] },
  { emoji: '🚌', facet: 'travel', keywords: ['bus', 'linienbus'] },
  { emoji: '🚕', facet: 'travel', keywords: ['taxi', 'cab'] },
  { emoji: '🚐', facet: 'travel', keywords: ['kleinbus', 'campervan', 'minibus', 'van'] },
  { emoji: '🚙', facet: 'travel', keywords: ['geländewagen', 'suv', 'jeep'] },
  { emoji: '🛻', facet: 'travel', keywords: ['pickup', 'pritsche'] },
  { emoji: '🏍️', facet: 'travel', keywords: ['motorrad', 'töff', 'motorcycle'] },
  { emoji: '🛵', facet: 'travel', keywords: ['roller', 'vespa', 'scooter'] },
  { emoji: '🛴', facet: 'travel', keywords: ['trottinett', 'kickboard', 'kick scooter'] },
  { emoji: '🚂', facet: 'travel', keywords: ['dampflok', 'lokomotive', 'steam train'] },
  { emoji: '🚢', facet: 'travel', keywords: ['schiff', 'dampfer', 'ship'] },
  { emoji: '⛴️', facet: 'travel', keywords: ['fähre', 'faehre', 'ferry'] },
  { emoji: '🛥️', facet: 'travel', keywords: ['motorboot', 'yacht', 'motorboat'] },
  { emoji: '⛵', facet: 'travel', keywords: ['segelboot', 'segeln', 'sailboat'] },
  { emoji: '🛶', facet: 'travel', keywords: ['kanu', 'paddelboot', 'canoe'] },
  { emoji: '🚁', facet: 'travel', keywords: ['helikopter', 'hubschrauber', 'helicopter'] },
  { emoji: '🚉', facet: 'travel', keywords: ['bahnhof', 'train station'] },
  { emoji: '🚏', facet: 'travel', keywords: ['haltestelle', 'bushaltestelle', 'bus stop'] },
  { emoji: '⛽', facet: 'travel', keywords: ['tanken', 'benzin', 'diesel', 'fuel'] },
  { emoji: '🅿️', facet: 'travel', keywords: ['parkplatz', 'parking'] },
  { emoji: '🛣️', facet: 'travel', keywords: ['autobahn', 'highway', 'motorway'] },
  { emoji: '🌍', facet: 'travel', keywords: ['welt', 'ausland', 'globe', 'abroad'] },
  { emoji: '🏖️', facet: 'travel', keywords: ['strand', 'beach'] },
  { emoji: '🏝️', facet: 'travel', keywords: ['insel', 'island'] },
  { emoji: '🏔️', facet: 'travel', keywords: ['berg', 'gebirge', 'alpen', 'mountain'] },
  { emoji: '🏕️', facet: 'travel', keywords: ['campingplatz', 'zeltplatz', 'campsite'] },
  {
    emoji: '🌅',
    facet: 'travel',
    keywords: ['sonnenaufgang', 'sonnenuntergang', 'sunrise', 'sunset'],
  },
  { emoji: '🗽', facet: 'travel', keywords: ['freiheitsstatue', 'new york', 'statue of liberty'] },
  { emoji: '🗼', facet: 'travel', keywords: ['eiffelturm', 'tokyo tower', 'paris'] },
  { emoji: '🏰', facet: 'travel', keywords: ['burg', 'festung', 'castle'] },

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
  { emoji: '📑', facet: 'documents', keywords: ['unterlagen', 'dokumente'] },
  { emoji: '📁', facet: 'documents', keywords: ['ordner', 'folder'] },
  { emoji: '📂', facet: 'documents', keywords: ['dossier', 'mappe', 'open folder'] },
  { emoji: '🗂️', facet: 'documents', keywords: ['register', 'ablage', 'index'] },
  { emoji: '📎', facet: 'documents', keywords: ['büroklammer', 'klammer', 'paperclip'] },
  { emoji: '📌', facet: 'documents', keywords: ['reissnagel', 'pinnwand', 'pin'] },
  { emoji: '✉️', facet: 'documents', keywords: ['brief', 'umschlag', 'couvert', 'envelope'] },
  { emoji: '📧', facet: 'documents', keywords: ['email', 'mail'] },
  { emoji: '📮', facet: 'documents', keywords: ['briefkasten', 'postbox', 'post'] },
  { emoji: '📚', facet: 'documents', keywords: ['bücher', 'books'] },
  { emoji: '📖', facet: 'documents', keywords: ['buch', 'lektüre', 'reiseführer', 'book'] },
  { emoji: '📕', facet: 'documents', keywords: ['roman', 'taschenbuch', 'novel'] },
  { emoji: '🖊️', facet: 'documents', keywords: ['kugelschreiber', 'kuli', 'ballpoint'] },
  { emoji: '🖋️', facet: 'documents', keywords: ['füller', 'fountain pen'] },
  { emoji: '🖍️', facet: 'documents', keywords: ['malstift', 'wachsmalstift', 'crayon'] },
  { emoji: '📝', facet: 'documents', keywords: ['notiz', 'memo', 'note'] },
  { emoji: '📅', facet: 'documents', keywords: ['kalender', 'termin', 'calendar'] },
  { emoji: '📆', facet: 'documents', keywords: ['terminkalender', 'datum', 'date'] },
  { emoji: '💰', facet: 'documents', keywords: ['geldsack', 'ersparnisse', 'savings'] },
  { emoji: '💵', facet: 'documents', keywords: ['dollar', 'banknote', 'bills'] },
  { emoji: '💷', facet: 'documents', keywords: ['pfund', 'pound'] },
  { emoji: '🪙', facet: 'documents', keywords: ['münze', 'münzen', 'coin'] },

  // --- Hygiene ---
  { emoji: '🪥', facet: 'hygiene', keywords: ['zahnbürste', 'bürste', 'toothbrush'] },
  { emoji: '🧴', facet: 'hygiene', keywords: ['creme', 'sonnencreme', 'lotion', 'shampoo'] },
  { emoji: '🧼', facet: 'hygiene', keywords: ['seife', 'soap'] },
  { emoji: '🪒', facet: 'hygiene', keywords: ['rasierer', 'razor', 'shaver'] },
  { emoji: '🧻', facet: 'hygiene', keywords: ['papier', 'toilettenpapier', 'tissue'] },
  { emoji: '🚿', facet: 'hygiene', keywords: ['dusche', 'shower'] },
  { emoji: '🧽', facet: 'hygiene', keywords: ['schwamm', 'sponge'] },
  { emoji: '💈', facet: 'hygiene', keywords: ['friseur', 'haare', 'hair'] },
  { emoji: '🛁', facet: 'hygiene', keywords: ['badewanne', 'baden', 'bath'] },
  { emoji: '🚽', facet: 'hygiene', keywords: ['toilette', 'wc', 'klo', 'toilet'] },
  { emoji: '🪠', facet: 'hygiene', keywords: ['pömpel', 'saugglocke', 'plunger'] },
  { emoji: '🪮', facet: 'hygiene', keywords: ['kamm', 'haarkamm', 'comb'] },
  { emoji: '🧖', facet: 'hygiene', keywords: ['sauna', 'dampfbad', 'spa'] },
  { emoji: '💅', facet: 'hygiene', keywords: ['nagellack', 'maniküre', 'nails', 'manicure'] },
  { emoji: '💄', facet: 'hygiene', keywords: ['lippenstift', 'lipstick'] },
  { emoji: '🪞', facet: 'hygiene', keywords: ['spiegel', 'mirror'] },
  { emoji: '🫧', facet: 'hygiene', keywords: ['seifenblasen', 'schaum', 'bubbles', 'foam'] },
  { emoji: '💆', facet: 'hygiene', keywords: ['massage', 'massieren', 'rücken massage'] },
  { emoji: '💇', facet: 'hygiene', keywords: ['haarschnitt', 'coiffeur', 'haircut'] },
  { emoji: '🦷', facet: 'hygiene', keywords: ['zahn', 'zahnseide', 'zahnpasta', 'tooth', 'floss'] },

  // --- Gesundheit ---
  { emoji: '💊', facet: 'health', keywords: ['medikament', 'tablette', 'pille', 'medicine'] },
  { emoji: '🩹', facet: 'health', keywords: ['pflaster', 'blasenpflaster', 'plaster', 'bandage'] },
  { emoji: '🩺', facet: 'health', keywords: ['apotheke', 'arzt', 'doctor', 'medical'] },
  { emoji: '🌡️', facet: 'health', keywords: ['thermometer', 'fieber', 'temperature'] },
  { emoji: '😷', facet: 'health', keywords: ['maske', 'mask'] },
  { emoji: '🧯', facet: 'health', keywords: ['löscher', 'notfall', 'emergency'] },
  {
    emoji: '💉',
    facet: 'health',
    keywords: ['spritze', 'impfung', 'impfausweis', 'syringe', 'vaccine'],
  },
  { emoji: '🩸', facet: 'health', keywords: ['blut', 'blutzucker', 'blood'] },
  { emoji: '🩼', facet: 'health', keywords: ['krücke', 'krücken', 'crutch'] },
  { emoji: '🦽', facet: 'health', keywords: ['rollstuhl', 'wheelchair'] },
  { emoji: '🦯', facet: 'health', keywords: ['blindenstock', 'gehstock', 'cane'] },
  { emoji: '🧪', facet: 'health', keywords: ['reagenzglas', 'test', 'schnelltest', 'test tube'] },
  { emoji: '🔬', facet: 'health', keywords: ['mikroskop', 'microscope'] },
  { emoji: '🏥', facet: 'health', keywords: ['spital', 'krankenhaus', 'hospital'] },
  { emoji: '🚑', facet: 'health', keywords: ['ambulanz', 'rettung', 'ambulance'] },
  { emoji: '⚕️', facet: 'health', keywords: ['apotheker', 'pharmacy', 'medizin'] },
  { emoji: '🫀', facet: 'health', keywords: ['herz', 'kreislauf', 'heart'] },
  { emoji: '🫁', facet: 'health', keywords: ['lunge', 'asthma', 'inhalator', 'lung'] },
  { emoji: '🦴', facet: 'health', keywords: ['knochen', 'bone'] },
  { emoji: '🦠', facet: 'health', keywords: ['virus', 'keime', 'germ'] },
  { emoji: '😴', facet: 'health', keywords: ['schlaf', 'schlafen', 'sleep', 'nap'] },
  { emoji: '🧘', facet: 'health', keywords: ['yoga', 'meditation', 'entspannung', 'relax'] },
  {
    emoji: '🦟',
    facet: 'health',
    keywords: ['mücke', 'mückenschutz', 'insektenschutz', 'mosquito', 'repellent'],
  },
  { emoji: '🐝', facet: 'health', keywords: ['wespe', 'biene', 'bee', 'wasp'] },

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
  { emoji: '🖥️', facet: 'tech', keywords: ['desktop', 'pc', 'bildschirm', 'monitor'] },
  { emoji: '⌨️', facet: 'tech', keywords: ['tastatur', 'keyboard'] },
  { emoji: '🖱️', facet: 'tech', keywords: ['maus', 'mouse'] },
  { emoji: '💾', facet: 'tech', keywords: ['diskette', 'speicher', 'floppy'] },
  { emoji: '💿', facet: 'tech', keywords: ['cd', 'disc'] },
  { emoji: '📀', facet: 'tech', keywords: ['dvd', 'film disc', 'video disc'] },
  { emoji: '📼', facet: 'tech', keywords: ['kassette', 'videokassette', 'tape'] },
  { emoji: '📺', facet: 'tech', keywords: ['fernseher', 'tv', 'television'] },
  { emoji: '📡', facet: 'tech', keywords: ['antenne', 'satellitenschüssel', 'antenna'] },
  { emoji: '🛰️', facet: 'tech', keywords: ['satellit', 'gps', 'satellite'] },
  { emoji: '📞', facet: 'tech', keywords: ['hörer', 'telefonhörer', 'receiver'] },
  { emoji: '☎️', facet: 'tech', keywords: ['festnetz', 'landline'] },
  { emoji: '📲', facet: 'tech', keywords: ['smartphone', 'handy laden'] },
  { emoji: '🔍', facet: 'tech', keywords: ['lupe', 'suchen', 'magnifier'] },
  { emoji: '🔭', facet: 'tech', keywords: ['fernglas', 'teleskop', 'telescope', 'binoculars'] },
  { emoji: '🎙️', facet: 'tech', keywords: ['mikrofon', 'podcast', 'microphone'] },
  { emoji: '🎤', facet: 'tech', keywords: ['karaoke', 'singen', 'mic'] },
  { emoji: '🎵', facet: 'tech', keywords: ['musik', 'music'] },
  { emoji: '🎸', facet: 'tech', keywords: ['gitarre', 'guitar'] },
  { emoji: '🎹', facet: 'tech', keywords: ['klavier', 'piano'] },
  { emoji: '🥁', facet: 'tech', keywords: ['trommel', 'schlagzeug', 'drum'] },
  { emoji: '🎺', facet: 'tech', keywords: ['trompete', 'trumpet'] },
  { emoji: '🎻', facet: 'tech', keywords: ['geige', 'violine', 'violin'] },
  { emoji: '🪗', facet: 'tech', keywords: ['akkordeon', 'handorgel', 'accordion'] },
  { emoji: '📢', facet: 'tech', keywords: ['megafon', 'lautsprecher', 'megaphone', 'speaker'] },

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
  { emoji: '🌲', facet: 'camping', keywords: ['baum', 'wald', 'tanne', 'tree', 'forest'] },
  { emoji: '🌳', facet: 'camping', keywords: ['laubbaum', 'park', 'deciduous'] },
  { emoji: '🪵', facet: 'camping', keywords: ['holz', 'brennholz', 'firewood', 'log'] },
  { emoji: '🪨', facet: 'camping', keywords: ['stein', 'fels', 'rock', 'stone'] },
  { emoji: '🎣', facet: 'camping', keywords: ['angel', 'angeln', 'angelrute', 'fishing'] },
  { emoji: '🐟', facet: 'camping', keywords: ['fisch', 'fish'] },
  { emoji: '🌙', facet: 'camping', keywords: ['mond', 'nacht', 'moon', 'night'] },
  { emoji: '⭐', facet: 'camping', keywords: ['stern', 'sterne', 'star'] },
  { emoji: '🌌', facet: 'camping', keywords: ['milchstrasse', 'sternenhimmel', 'galaxy'] },
  { emoji: '🌧️', facet: 'camping', keywords: ['regenwetter', 'rainy'] },
  { emoji: '⛈️', facet: 'camping', keywords: ['gewitter', 'thunderstorm'] },
  { emoji: '🌈', facet: 'camping', keywords: ['regenbogen', 'rainbow'] },
  { emoji: '❄️', facet: 'camping', keywords: ['schnee', 'schneeflocke', 'snow'] },
  { emoji: '☃️', facet: 'camping', keywords: ['schneemann', 'snowman'] },
  { emoji: '🌊', facet: 'camping', keywords: ['welle', 'meer', 'see', 'wave', 'sea'] },
  { emoji: '💧', facet: 'camping', keywords: ['tropfen', 'wasser', 'drop'] },
  { emoji: '🏞️', facet: 'camping', keywords: ['nationalpark', 'landschaft'] },
  { emoji: '🌄', facet: 'camping', keywords: ['gipfel', 'morgenrot', 'sunrise mountain'] },
  { emoji: '🤿', facet: 'camping', keywords: ['tauchen', 'schnorchel', 'diving', 'snorkel'] },
  { emoji: '🛟', facet: 'camping', keywords: ['rettungsring', 'schwimmweste', 'lifebuoy'] },
  {
    emoji: '🪂',
    facet: 'camping',
    keywords: ['fallschirm', 'gleitschirm', 'parachute', 'paraglider'],
  },
  { emoji: '⛱️', facet: 'camping', keywords: ['sonnenschirm', 'strandschirm', 'beach umbrella'] },

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
  { emoji: '🏈', facet: 'sport', keywords: ['american football', 'rugbyball'] },
  { emoji: '⚾', facet: 'sport', keywords: ['baseball', 'baseballschläger'] },
  { emoji: '🥎', facet: 'sport', keywords: ['softball', 'softballspiel'] },
  { emoji: '🏐', facet: 'sport', keywords: ['volleyball', 'beachvolleyball'] },
  { emoji: '🏉', facet: 'sport', keywords: ['rugby', 'rugbyball'] },
  { emoji: '🎱', facet: 'sport', keywords: ['billard', 'pool'] },
  { emoji: '🏓', facet: 'sport', keywords: ['tischtennis', 'pingpong', 'table tennis'] },
  { emoji: '🏸', facet: 'sport', keywords: ['badminton', 'federball'] },
  { emoji: '🏒', facet: 'sport', keywords: ['eishockey', 'ice hockey'] },
  { emoji: '🏑', facet: 'sport', keywords: ['feldhockey', 'hockey'] },
  { emoji: '🥍', facet: 'sport', keywords: ['lacrosse', 'lacrosseschläger'] },
  { emoji: '🏏', facet: 'sport', keywords: ['cricket', 'kricket'] },
  { emoji: '⛳', facet: 'sport', keywords: ['golf', 'golfen'] },
  { emoji: '🏌️', facet: 'sport', keywords: ['golfer', 'golfschläger', 'golf club'] },
  { emoji: '🥊', facet: 'sport', keywords: ['boxen', 'boxhandschuhe', 'boxing'] },
  { emoji: '🥋', facet: 'sport', keywords: ['judo', 'karate', 'kampfsport', 'martial arts'] },
  { emoji: '🤺', facet: 'sport', keywords: ['fechten', 'fencing'] },
  { emoji: '🏹', facet: 'sport', keywords: ['bogen', 'bogenschiessen', 'archery'] },
  { emoji: '🛹', facet: 'sport', keywords: ['skateboard', 'skaten'] },
  { emoji: '🛼', facet: 'sport', keywords: ['rollschuhe', 'inline', 'roller skates'] },
  { emoji: '⛸️', facet: 'sport', keywords: ['schlittschuhe', 'eislaufen', 'ice skates'] },
  { emoji: '🥌', facet: 'sport', keywords: ['curling', 'eisstock'] },
  { emoji: '🛷', facet: 'sport', keywords: ['schlitten', 'bob', 'sled'] },
  { emoji: '🏃', facet: 'sport', keywords: ['joggen', 'laufen', 'rennen', 'running', 'jogging'] },

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
  { emoji: '🍌', facet: 'food', keywords: ['banane', 'banana'] },
  { emoji: '🍊', facet: 'food', keywords: ['orange', 'mandarine', 'clementine'] },
  { emoji: '🍋', facet: 'food', keywords: ['zitrone', 'lemon'] },
  { emoji: '🍇', facet: 'food', keywords: ['trauben', 'grapes'] },
  { emoji: '🍓', facet: 'food', keywords: ['erdbeere', 'strawberry'] },
  { emoji: '🍒', facet: 'food', keywords: ['kirschen', 'cherries'] },
  { emoji: '🍑', facet: 'food', keywords: ['pfirsich', 'peach'] },
  { emoji: '🥝', facet: 'food', keywords: ['kiwi', 'kiwifrucht'] },
  { emoji: '🍍', facet: 'food', keywords: ['ananas', 'pineapple'] },
  { emoji: '🥭', facet: 'food', keywords: ['mango', 'mangofrucht'] },
  { emoji: '🍉', facet: 'food', keywords: ['wassermelone', 'melone', 'watermelon'] },
  { emoji: '🍐', facet: 'food', keywords: ['birne', 'pear'] },
  { emoji: '🥕', facet: 'food', keywords: ['karotte', 'rüebli', 'carrot'] },
  { emoji: '🥒', facet: 'food', keywords: ['gurke', 'cucumber'] },
  { emoji: '🍅', facet: 'food', keywords: ['tomate', 'tomato'] },
  { emoji: '🥔', facet: 'food', keywords: ['kartoffel', 'potato'] },
  { emoji: '🌽', facet: 'food', keywords: ['mais', 'corn'] },
  { emoji: '🥦', facet: 'food', keywords: ['brokkoli', 'broccoli'] },
  { emoji: '🥬', facet: 'food', keywords: ['salatkopf', 'blattgemüse', 'lettuce'] },
  { emoji: '🧅', facet: 'food', keywords: ['zwiebel', 'onion'] },
  { emoji: '🧄', facet: 'food', keywords: ['knoblauch', 'garlic'] },
  { emoji: '🥜', facet: 'food', keywords: ['nüsse', 'erdnüsse', 'peanuts', 'nuts'] },
  { emoji: '🌰', facet: 'food', keywords: ['kastanie', 'marroni', 'chestnut'] },
  { emoji: '🥐', facet: 'food', keywords: ['gipfeli', 'croissant'] },
  { emoji: '🥨', facet: 'food', keywords: ['brezel', 'pretzel'] },
  { emoji: '🧀', facet: 'food', keywords: ['käse', 'cheese'] },
  { emoji: '🥚', facet: 'food', keywords: ['ei', 'eier', 'egg'] },
  { emoji: '🥓', facet: 'food', keywords: ['speck', 'bacon'] },
  { emoji: '🍖', facet: 'food', keywords: ['fleisch', 'meat'] },
  { emoji: '🌭', facet: 'food', keywords: ['wurst', 'würstchen', 'hotdog', 'sausage'] },
  { emoji: '🍔', facet: 'food', keywords: ['burger', 'hamburger'] },
  { emoji: '🍕', facet: 'food', keywords: ['pizza', 'pizzateig'] },
  { emoji: '🌮', facet: 'food', keywords: ['taco', 'wrap'] },
  { emoji: '🥪', facet: 'food', keywords: ['sandwich', 'belegtes brot'] },
  { emoji: '🥗', facet: 'food', keywords: ['salat', 'salad'] },
  { emoji: '🍝', facet: 'food', keywords: ['pasta', 'spaghetti', 'nudeln', 'noodles'] },
  { emoji: '🍜', facet: 'food', keywords: ['ramen', 'nudelsuppe', 'instant noodles'] },
  { emoji: '🍲', facet: 'food', keywords: ['eintopf', 'suppe', 'stew', 'soup'] },
  { emoji: '🍚', facet: 'food', keywords: ['reis', 'rice'] },
  { emoji: '🍞', facet: 'food', keywords: ['toast', 'toastbrot'] },
  { emoji: '🥞', facet: 'food', keywords: ['pancakes', 'pfannkuchen'] },
  { emoji: '🧇', facet: 'food', keywords: ['waffel', 'waffle'] },
  { emoji: '🍯', facet: 'food', keywords: ['honig', 'honey'] },
  { emoji: '🥛', facet: 'food', keywords: ['milch', 'milk'] },
  { emoji: '🍺', facet: 'food', keywords: ['bier', 'beer'] },

  // --- Sonstiges ---
  { emoji: '📦', facet: 'other', keywords: ['kiste', 'schachtel', 'box'] },
  { emoji: '🧺', facet: 'other', keywords: ['korb', 'wäsche', 'basket', 'laundry'] },
  { emoji: '🪣', facet: 'other', keywords: ['eimer', 'kübel', 'bucket'] },
  { emoji: '🧹', facet: 'other', keywords: ['besen', 'putzen', 'broom', 'cleaning'] },
  { emoji: '🎁', facet: 'other', keywords: ['geschenk', 'gift', 'present'] },
  { emoji: '🧸', facet: 'other', keywords: ['spielzeug', 'kuscheltier', 'toy', 'teddy'] },
  { emoji: '🔒', facet: 'other', keywords: ['schloss', 'lock'] },
  { emoji: '🎲', facet: 'other', keywords: ['würfel', 'würfelspiel', 'dice'] },
  { emoji: '🧩', facet: 'other', keywords: ['puzzle', 'legespiel'] },
  { emoji: '♟️', facet: 'other', keywords: ['schach', 'chess'] },
  { emoji: '🃏', facet: 'other', keywords: ['spielkarten', 'karten', 'jass', 'cards'] },
  { emoji: '🎮', facet: 'other', keywords: ['gamepad', 'videospiel', 'controller'] },
  { emoji: '🎯', facet: 'other', keywords: ['dart', 'zielscheibe', 'darts'] },
  { emoji: '🐶', facet: 'other', keywords: ['hund', 'dog'] },
  { emoji: '🐱', facet: 'other', keywords: ['katze', 'cat'] },
  { emoji: '🐴', facet: 'other', keywords: ['pferd', 'horse'] },
  { emoji: '🐾', facet: 'other', keywords: ['pfoten', 'haustier', 'pet', 'paws'] },
  { emoji: '🦮', facet: 'other', keywords: ['blindenhund', 'assistance dog'] },
  { emoji: '🐈', facet: 'other', keywords: ['kater', 'kitten'] },
  { emoji: '🐇', facet: 'other', keywords: ['hase', 'kaninchen', 'rabbit'] },
  { emoji: '🐹', facet: 'other', keywords: ['hamster', 'nager'] },
  { emoji: '🐦', facet: 'other', keywords: ['wellensittich', 'bird'] },
  { emoji: '🐠', facet: 'other', keywords: ['aquarium', 'zierfisch'] },
  { emoji: '👶', facet: 'other', keywords: ['baby', 'säugling'] },
  { emoji: '🧒', facet: 'other', keywords: ['kind', 'child'] },
  { emoji: '👪', facet: 'other', keywords: ['familie', 'family'] },
  { emoji: '🚼', facet: 'other', keywords: ['wickeln', 'wickeltisch', 'changing'] },
  { emoji: '🛒', facet: 'other', keywords: ['einkaufswagen', 'einkaufen', 'cart', 'shopping'] },
  { emoji: '🛍️', facet: 'other', keywords: ['einkaufstasche', 'shopping bag'] },
  { emoji: '🌱', facet: 'other', keywords: ['pflanze', 'sprössling', 'plant', 'sprout'] },
  { emoji: '🌻', facet: 'other', keywords: ['blume', 'sonnenblume', 'flower'] },
  { emoji: '🌷', facet: 'other', keywords: ['tulpe', 'tulip'] },
  { emoji: '🪴', facet: 'other', keywords: ['topfpflanze', 'zimmerpflanze', 'houseplant'] },
  { emoji: '💐', facet: 'other', keywords: ['blumenstrauss', 'bouquet'] },
  { emoji: '🗑️', facet: 'other', keywords: ['abfall', 'müll', 'kehricht', 'trash'] },
  { emoji: '♻️', facet: 'other', keywords: ['recycling', 'wertstoff'] },
  { emoji: '🪧', facet: 'other', keywords: ['schild', 'sign'] },
  { emoji: '🚪', facet: 'other', keywords: ['tür', 'door'] },
  { emoji: '🪟', facet: 'other', keywords: ['fenster', 'window'] },
  { emoji: '🛋️', facet: 'other', keywords: ['sofa', 'couch'] },
  { emoji: '🪑', facet: 'other', keywords: ['stuhl', 'campingstuhl', 'chair'] },
  { emoji: '🪆', facet: 'other', keywords: ['matroschka', 'puppe', 'doll'] },
  { emoji: '🎈', facet: 'other', keywords: ['ballon', 'luftballon', 'balloon'] },
  { emoji: '🎉', facet: 'other', keywords: ['party', 'fest', 'feier'] },
  { emoji: '🎂', facet: 'other', keywords: ['geburtstag', 'birthday'] },
  { emoji: '🎄', facet: 'other', keywords: ['weihnachten', 'christbaum', 'christmas'] },
  { emoji: '🎃', facet: 'other', keywords: ['halloween', 'kürbis'] },
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
