/**
 * World Styles — Global art style registry for DMLog asset generation.
 *
 * Culturally-grounded style definitions with prompt templates, palettes,
 * location/monster/artifact seeds, and ambient effects. Based on research
 * from docs/GAME-ART-TRADITIONS.md.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WorldStyle {
  id: string;
  name: string;
  prompt: string;
  era: string;
  palette: string[];
  locations: string[];
  monsters: string[];
  artifacts: string[];
  effects: string[];
}

// ---------------------------------------------------------------------------
// Style Registry
// ---------------------------------------------------------------------------

const WORLD_STYLES: Record<string, WorldStyle> = {
  // ── East Asia ──────────────────────────────────────────────────────────

  japanese_ukiyoe: {
    id: 'japanese_ukiyoe',
    name: 'Ukiyo-e Woodblock',
    prompt: 'ukiyo-e woodblock print style, bold outlines, flat colors, traditional Japanese',
    era: 'Edo period 1603–1868',
    palette: ['indigo', 'vermillion', 'ochre', 'ivory'],
    locations: ['cherry blossom temple', 'bamboo forest path', 'floating world teahouse', 'mountain onsen village', 'samurai castle gate'],
    monsters: ['yokai kitsune', 'tengu warrior', 'kappa river spirit', 'oni demon', 'ryu dragon'],
    artifacts: ['katana of the fox spirit', 'tengu feather fan', 'jade magistrate seal', 'paper lantern of souls', 'dragon scale armor'],
    effects: ['cherry blossom petals falling', 'lantern light through paper screens', 'mist across rice paddies'],
  },

  chinese_inkwash: {
    id: 'chinese_inkwash',
    name: 'Chinese Ink Wash',
    prompt: 'Chinese ink wash painting, flowing brush strokes, misty mountains, Shan Shui style',
    era: 'Tang–Song dynasty 618–1279',
    palette: ['ink black', 'rice paper white', 'jade green', 'cinnabar red'],
    locations: ['jade emperor palace', 'wuxia mountain monastery', 'silk road caravanserai', 'terracotta warrior tomb', 'dragon boat river festival'],
    monsters: ['jiangshi hopping vampire', 'nian beast', 'qilin', 'huli jing fox spirit', 'ao giant turtle'],
    artifacts: ['monkey king staff', 'jade emperor decree', 'ink brush of creation', 'phoenix feather fan', 'dragon pearl'],
    effects: ['ink spreading through water', 'mist rolling through mountain valleys', 'fireworks over forbidden city'],
  },

  korean_minhwa: {
    id: 'korean_minhwa',
    name: 'Korean Minhwa Folk Art',
    prompt: 'Korean minhwa folk painting, vibrant colors, stylized forms, Joseon dynasty',
    era: 'Joseon dynasty 1392–1897',
    palette: ['dancheong red', 'celadon green', 'indigo blue', 'gold leaf'],
    locations: ['hanok village with ondol heating', 'seonangdang shrine posts', 'jeju lava tube cave', 'pungsu-jiri sacred mountain', 'royal palace with dancheong colors'],
    monsters: ['dokkaebi goblin', 'gumiho nine-tailed fox', 'bulgasari metal-eater', 'haetae justice beast', 'cheonyeo gwishin virgin ghost'],
    artifacts: ['bangsangsi exorcist mask', 'samjoko three-legged crow emblem', 'hwarang warrior hairpin', 'celadon incense burner', 'tiger and magpie scroll'],
    effects: ['autumn leaves on palace rooftops', 'celadon glimmer in moonlight', 'cherry blossom rain at temple gate'],
  },

  // ── South & Southeast Asia ─────────────────────────────────────────────

  indian_miniature: {
    id: 'indian_miniature',
    name: 'Mughal Miniature',
    prompt: 'Mughal miniature painting, intricate detail, rich jewel tones, gold leaf borders',
    era: 'Mughal Empire 1526–1857',
    palette: ['saffron gold', 'turmeric yellow', 'lotus pink', 'peacock blue'],
    locations: ['stepwell oasis', 'floating palace on Ganges', 'ancient university ruins', 'spice market canopy', 'cave temple carvings'],
    monsters: ['rakshasa shape-shifter', 'vetala corpse demon', 'nagini cobra woman', 'garuda bird-human', 'asura anti-god'],
    artifacts: ['vimana blueprint', 'sudarshana chakra disc', 'soma ritual vessel', 'kaustubha gem', 'brahmastra arrow'],
    effects: ['marigold petals scattered on water', 'diya lamps floating at dusk', 'monsoon clouds over palace domes'],
  },

  thai_golden: {
    id: 'thai_golden',
    name: 'Thai Golden Temple Art',
    prompt: 'Thai temple mural style, gold leaf on dark backgrounds, Naga serpents, Sukhothai art',
    era: 'Sukhothai–Ayutthaya 1238–1767',
    palette: ['gold leaf', 'lapis lazuli', 'lotus white', 'sandalwood brown'],
    locations: ['rice terrace temple', 'khmer canal city', 'stilt house village', 'volcano temple summit', 'cave shrine with buddha statues'],
    monsters: ['naga water serpent', 'garuda sky lord', 'phi pop spirit', 'kinnari celestial dancer', 'yaksha giant guardian'],
    artifacts: ['kris wavy dagger', 'barong protective mask', 'spirit house miniature', 'golden parasol of state', 'naga scepter'],
    effects: ['gold leaf catching temple candlelight', 'lotus flowers blooming at dawn', 'incense smoke curling through shrine'],
  },

  // ── Middle East ────────────────────────────────────────────────────────

  arabian_nights: {
    id: 'arabian_nights',
    name: 'Arabian Nights Illumination',
    prompt: 'Persian miniature and Islamic geometric style, arabesque borders, jewel tones, gold accents',
    era: 'Islamic Golden Age 8th–14th century',
    palette: ['lapis blue', 'emerald green', 'saffron gold', 'ruby red'],
    locations: ['desert caravanserai', 'hanging gardens of Babylon', 'star observatory tower', 'underground qanat waterway', 'iwan courtyard mosque'],
    monsters: ['ifrit fire djinn', 'nasnas half-human', 'bahamut cosmic fish', 'roc giant eagle', 'ghoul grave eater'],
    artifacts: ['flying carpet', 'alchemist alembic', 'solomon seal ring', 'jinni lamp', 'scimitar of the desert winds'],
    effects: ['sand swirling through carved arches', 'starlight through geometric screens', 'oil lamp glow in desert night'],
  },

  // ── Africa ─────────────────────────────────────────────────────────────

  african_ancestor: {
    id: 'african_ancestor',
    name: 'African Ancestral Art',
    prompt: 'West African art style, Ndebele geometric patterns, bold earth tones, Benin bronze aesthetic',
    era: 'Pre-colonial West Africa',
    palette: ['kente gold', 'laterite red', 'obsidian black', 'sahara sand'],
    locations: ['great Zimbabwe stone city', 'baobab tree village', 'Sahara salt mine', 'river delta stilt houses', 'sacred drum circle clearing'],
    monsters: ['adze firefly vampire', 'mokele-mbembe river beast', 'anansi spider trickster', 'grootslang elephant-snake', 'sphinx desert guardian'],
    artifacts: ['talking drum', 'nganga healer basket', 'san rock art shard', 'kente ceremonial cloth', 'benin bronze mask'],
    effects: ['firelight on carved wooden masks', 'dust devils across savanna', 'golden sunset through acacia trees'],
  },

  // ── Northern Europe ────────────────────────────────────────────────────

  norse_viking: {
    id: 'norse_viking',
    name: 'Norse Viking Carving',
    prompt: 'Viking Age wood carving style, interlace knotwork, runic borders, Scandinavian folk art',
    era: 'Viking Age 793–1066',
    palette: ['iron grey', 'blood red', 'yew brown', 'frost white'],
    locations: ['stave church in fjord', 'frost giant ice hall', 'volcanic forge cavern', 'rune stone circle', 'longship dock at dawn'],
    monsters: ['draugr undead sailor', 'huldra forest woman', 'kraken sea beast', 'nidhogg root gnawer', 'lindworm wingless dragon'],
    artifacts: ['Mjolnir amulet', 'Gjallarhorn', 'volva staff', 'ring of Andvaranaut', 'draupnir gold ring'],
    effects: ['northern lights over frozen fjord', 'runic glow on carved stones', 'blizzard through pine forest'],
  },

  celtic_druid: {
    id: 'celtic_druid',
    name: 'Celtic Druidic Art',
    prompt: 'Celtic knotwork and La Tène metalwork style, spirals, illuminated manuscript aesthetic',
    era: 'La Tène period 450–1 BCE',
    palette: ['emerald green', 'ochre gold', 'wode blue', 'parchment white'],
    locations: ['crannog lake dwelling', 'hill fort with triple ramparts', 'ogham stone grove', 'fairy ring mushroom circle', 'cliffside monastic cell'],
    monsters: ['banshee wailing spirit', 'kelpie water horse', 'fachan one-eyed monster', 'cu sidhe fairy hound', 'púca shape-shifter'],
    artifacts: ['cauldron of rebirth', 'bard harp of enchantment', 'four treasures talisman', 'torc of kingship', 'ogham divination sticks'],
    effects: ['mist rising from sacred wells', 'fireflies in ancient groves', 'moonlight on standing stones'],
  },

  // ── Eastern Europe ─────────────────────────────────────────────────────

  slavic_dark: {
    id: 'slavic_dark',
    name: 'Slavic Dark Fairy Tale',
    prompt: 'Slavic lubok print and Orthodox iconography style, deep earth tones, gilded halos, birch forests',
    era: 'Kievan Rus 882–1240',
    palette: ['birch white', 'onion dome gold', 'blood berry', 'forest dark green'],
    locations: ['birch forest chapel', 'ice palace of the snow queen', 'baba yaga hut on chicken legs', 'mountain salt mine', 'fortified wooden kremlin'],
    monsters: ['baba yaga crone', 'vila forest nymph', 'zmey three-headed dragon', 'domovoi house spirit', 'rusalka water maiden'],
    artifacts: ['firebird feather', 'self-setting tablecloth', 'koschei soul needle', 'bogatyr sword', 'golden apple of youth'],
    effects: ['snow drifting through birch trees', 'candle glow before icon corner', 'thunder rolling over steppe'],
  },

  // ── Americas ───────────────────────────────────────────────────────────

  aztec_sun: {
    id: 'aztec_sun',
    name: 'Aztec Sun Stone',
    prompt: 'Mesoamerican codex painting style, bold geometric forms, jade and obsidian tones, featherwork mosaic',
    era: 'Aztec Empire 1428–1521',
    palette: ['jade green', 'obsidian black', 'cacao brown', 'quetzal gold'],
    locations: ['step pyramid with cenote', 'floating chinampa gardens', 'obsidian mine tunnel', 'ball court arena', 'eclipse observatory tower'],
    monsters: ['cipactli primordial crocodile', 'ahuizotl water dog', 'tzitzimitl star demon', 'nagual shape-shifter', 'chaneque garden spirit'],
    artifacts: ['tezcatlipoca obsidian mirror', 'calendar stone fragment', 'cacao ritual vessel', 'quetzal feather headdress', 'jade death mask'],
    effects: ['volcanic smoke over pyramid steps', 'jade reflections in cenote water', 'blood moon over sacrificial altar'],
  },

  native_spiritwalker: {
    id: 'native_spiritwalker',
    name: 'Native Spirit Walker',
    prompt: 'Native American pictograph and quillwork style, earth pigments, spiritual symbolism, ledger art',
    era: 'Pre-contact Americas',
    palette: ['red ochre', 'white clay', 'charcoal black', 'turquoise blue'],
    locations: ['cliff palace dwellings', 'totem pole forest clearing', 'buffalo jump site', 'sweat lodge hot springs', 'mound builder earthworks'],
    monsters: ['wendigo ice cannibal', 'thunderbird storm bringer', 'skinwalker shapeshifter', 'piasa bird', 'uktena horned serpent'],
    artifacts: ['medicine bundle', 'dream catcher web', 'peace pipe with carvings', 'eagle feather bonnet', 'wampum belt treaty'],
    effects: ['eagle soaring over canyon rim', 'aurora borealis over plains', 'sage smoke at sunrise ceremony'],
  },
};

// ---------------------------------------------------------------------------
// Resolution presets
// ---------------------------------------------------------------------------

export type Resolution =
  | 'sprite-16' | 'sprite-32' | 'sprite-64'
  | 'sketch' | 'watercolor' | 'oil'
  | 'photorealistic';

const RESOLUTION_PROMPTS: Record<Resolution, string> = {
  'sprite-16':     '16x16 pixel art, 4-color palette, clean outlines, readable at small scale, game sprite icon',
  'sprite-32':     '32x32 pixel art, 8-color palette, SNES style, clean outlines, game sprite',
  'sprite-64':     '64x64 pixel art, 16-color palette, detailed sprite, smooth outlines, game character',
  'sketch':        'pencil sketch style, rough lines, cross-hatching, concept art, monochrome',
  'watercolor':    'watercolor painting, soft edges, color bleeding, ethereal atmosphere, artistic',
  'oil':           'oil painting, rich colors, dramatic lighting, detailed, epic composition',
  'photorealistic': 'photorealistic render, cinematic lighting, detailed textures, octane render, 8K',
};

// ---------------------------------------------------------------------------
// Query helpers
// ---------------------------------------------------------------------------

export function getStyle(id: string): WorldStyle | undefined {
  return WORLD_STYLES[id];
}

export function getAllStyles(): WorldStyle[] {
  return Object.values(WORLD_STYLES);
}

export function searchStyles(query: string): WorldStyle[] {
  const q = query.toLowerCase();
  return Object.values(WORLD_STYLES).filter(s =>
    s.name.toLowerCase().includes(q)
    || s.era.toLowerCase().includes(q)
    || s.prompt.toLowerCase().includes(q)
    || s.palette.some(c => c.toLowerCase().includes(q))
    || s.id.includes(q),
  );
}

export function mixStyles(
  styleA: string,
  styleB: string,
  ratio: number = 0.5,
): { prompt: string; palette: string[] } | null {
  const a = WORLD_STYLES[styleA];
  const b = WORLD_STYLES[styleB];
  if (!a || !b) return null;

  const pctA = Math.round(Math.max(0, Math.min(1, ratio)) * 100);
  const pctB = 100 - pctA;
  const mixedPalette = [...a.palette.slice(0, 2), ...b.palette.slice(0, 2)];

  return {
    prompt: `${a.prompt} (${pctA}%) blended with ${b.prompt} (${pctB}%), harmonious fusion, ${mixedPalette.join(' and ')} palette`,
    palette: mixedPalette,
  };
}

export function generateStylePrompt(
  style: string,
  subject: string,
  resolution: Resolution = 'oil',
): string {
  const s = WORLD_STYLES[style];
  if (!s) return subject;

  const resPrompt = RESOLUTION_PROMPTS[resolution] ?? '';
  return `${resPrompt} of ${subject}, ${s.prompt}, ${s.era} aesthetic, ${s.palette.slice(0, 3).join(' and ')} color palette`;
}

export { WORLD_STYLES, RESOLUTION_PROMPTS };
