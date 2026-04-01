/**
 * Culture Style Presets — Prompt prefixes for Gemini image generation.
 *
 * 12 world-culture style presets, each with a structured prompt prefix,
 * palette colours, and an era description for grounding the output.
 */

export interface CultureStyle {
  id: string;
  name: string;
  prompt_prefix: string;
  palette_colors: string[];
  era_description: string;
}

export const CULTURE_STYLES: Record<string, CultureStyle> = {
  japanese_ukiyoe: {
    id: 'japanese_ukiyoe',
    name: 'Ukiyo-e',
    prompt_prefix: 'Traditional Japanese ukiyo-e woodblock print style, bold flat outlines, vivid mineral pigments, asymmetric composition, decorative patterns',
    palette_colors: ['indigo', 'vermillion', 'ochre', 'ivory'],
    era_description: 'Edo period 1603-1868, the floating world of Kabuki and geisha districts',
  },

  chinese_inkwash: {
    id: 'chinese_inkwash',
    name: 'Ink Wash',
    prompt_prefix: 'Classical Chinese ink wash painting, Shan Shui landscape tradition, flowing brush strokes, graded ink washes on silk, negative space as mist',
    palette_colors: ['ink black', 'rice paper white', 'jade green', 'cinnabar red'],
    era_description: 'Tang-Song dynasty 618-1279, scholar-official literati tradition',
  },

  korean_folk: {
    id: 'korean_folk',
    name: 'Korean Folk',
    prompt_prefix: 'Korean minhwa folk painting, vibrant opaque colours, stylized mythical creatures, dancheong decorative patterns, naive perspective',
    palette_colors: ['dancheong red', 'celadon green', 'indigo blue', 'gold leaf'],
    era_description: 'Joseon dynasty 1392-1897, tiger and magpie folk symbolism',
  },

  indian_miniature: {
    id: 'indian_miniature',
    name: 'Persian',
    prompt_prefix: 'Mughal miniature painting tradition, intricate jewelled detail, rich opaque pigments, gold leaf borders, flattened perspective',
    palette_colors: ['saffron gold', 'turmeric yellow', 'lotus pink', 'peacock blue'],
    era_description: 'Mughal Empire 1526-1857, court painting workshops of Rajasthan',
  },

  arabian_persian: {
    id: 'arabian_persian',
    name: 'Persian',
    prompt_prefix: 'Persian miniature illumination style, arabesque borders, geometric tile patterns, jewel-tone lapis and gold, ornate calligraphy frames',
    palette_colors: ['lapis blue', 'emerald green', 'saffron gold', 'ruby red'],
    era_description: 'Islamic Golden Age 8th-14th century, Baghdad and Isfahan schools',
  },

  african_ancestor: {
    id: 'african_ancestor',
    name: 'African',
    prompt_prefix: 'West African art tradition, bold geometric Ndebele patterns, Benin bronze aesthetic, earth pigments on carved wood, stylized ancestral figures',
    palette_colors: ['kente gold', 'laterite red', 'obsidian black', 'sahara sand'],
    era_description: 'Pre-colonial West Africa, Benin Kingdom and Ashanti Empire',
  },

  norse_viking: {
    id: 'norse_viking',
    name: 'Norse',
    prompt_prefix: 'Viking Age wood carving style, intricate interlace knotwork, runic borders, Mammen-style animal motifs, bold silhouette forms',
    palette_colors: ['iron grey', 'blood red', 'yew brown', 'frost white'],
    era_description: 'Viking Age 793-1066, Scandinavian animal-style metalwork and runestones',
  },

  celtic_druid: {
    id: 'celtic_druid',
    name: 'Celtic',
    prompt_prefix: 'Celtic La Tene art style, spiralling knotwork, illuminated manuscript aesthetic, bronze-age metalwork motifs, entwined animal forms',
    palette_colors: ['emerald green', 'ochre gold', 'wode blue', 'parchment white'],
    era_description: 'La Tene period 450-1 BCE, Gaulish and Insular Celtic traditions',
  },

  aztec_mayan: {
    id: 'aztec_mayan',
    name: 'Mayan',
    prompt_prefix: 'Mesoamerican codex painting style, bold geometric forms, jade and obsidian tones, featherwork mosaic detail, stepped-fret borders',
    palette_colors: ['jade green', 'obsidian black', 'cacao brown', 'quetzal gold'],
    era_description: 'Aztec Empire 1428-1521 and Maya Classic period 250-900 CE',
  },

  native_spiritwalker: {
    id: 'native_spiritwalker',
    name: 'Spirit Walker',
    prompt_prefix: 'Native American pictograph and ledger art style, earth pigment brushwork, spiritual animal symbolism, parfleche geometric borders',
    palette_colors: ['red ochre', 'white clay', 'charcoal black', 'turquoise blue'],
    era_description: 'Pre-contact Americas, Plains and Pueblo artistic traditions',
  },

  se_asian_golden: {
    id: 'se_asian_golden',
    name: 'SE Asian',
    prompt_prefix: 'Southeast Asian temple mural tradition, gold leaf on dark lacquer, Naga serpent motifs, Khmer bas-relief carving style, lotus scrollwork',
    palette_colors: ['gold leaf', 'lapis lazuli', 'lotus white', 'sandalwood brown'],
    era_description: 'Sukhothai-Ayutthaya 1238-1767 and Khmer Empire 802-1431',
  },

  eastern_european_gothic: {
    id: 'eastern_european_gothic',
    name: 'Gothic',
    prompt_prefix: 'Eastern European Orthodox iconography and Slavic lubok print style, gilded halos, deep earth tones, birch forest settings, dark fairy tale atmosphere',
    palette_colors: ['birch white', 'onion dome gold', 'blood berry', 'forest dark green'],
    era_description: 'Kievan Rus 882-1240, Orthodox icon and folk lubok traditions',
  },
};

export function getCultureStyle(id: string): CultureStyle | undefined {
  return CULTURE_STYLES[id];
}

export function getAllCultureStyles(): CultureStyle[] {
  return Object.values(CULTURE_STYLES);
}

/**
 * Build a Gemini-ready image generation prompt from a user prompt + style preset.
 */
export function buildImagePrompt(userPrompt: string, styleId: string): string {
  const style = CULTURE_STYLES[styleId];
  if (!style) return userPrompt;
  return `${style.prompt_prefix}. ${userPrompt}. Palette: ${style.palette_colors.join(', ')}. Era: ${style.era_description}. High detail, evocative fantasy art, no text or watermarks.`;
}
