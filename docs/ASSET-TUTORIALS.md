# DMLog Asset Generation Tutorials

A guide to generating game art using DMLog's culturally-grounded asset pipeline.

---

## 1. Generating Character Portraits

Portraits bring your NPCs and PCs to life. Use the `portrait` asset type for upper-body character art.

### Via API

```bash
curl -X POST https://your-domain/api/generate/asset \
  -H 'Content-Type: application/json' \
  -d '{
    "type": "portrait",
    "subject": "elderly half-elf wizard with silver beard and starry robes",
    "style": "chinese_inkwash",
    "resolution": "oil",
    "extras": ["glowing staff", "ancient library background"]
  }'
```

### Via UI

1. Open the **Assets** tab in the right sidebar
2. Set **Type** to "Portrait"
3. Describe your character in **Subject**
4. Pick an art style and resolution
5. Click **Generate**

### Tips for Good Portraits

- Include race, class, distinctive features, and mood
- Specify clothing or armor details
- Add environment context in extras (e.g., "candlelit chamber")
- Use `watercolor` resolution for softer, ethereal characters

---

## 2. Creating Custom Art Styles

DMLog ships with 12 built-in world styles. To add your own, extend `WORLD_STYLES` in `src/game/world-styles.ts`:

```typescript
WORLD_STYLES.my_custom_style = {
  id: 'my_custom_style',
  name: 'My Custom Style',
  prompt: 'description of the art style for AI image generation',
  era: 'Historical period or "Fantasy"',
  palette: ['color1', 'color2', 'color3', 'color4'],
  locations: ['signature location 1', 'location 2', ...],
  monsters: ['iconic creature 1', 'creature 2', ...],
  artifacts: ['named item 1', 'item 2', ...],
  effects: ['ambient effect 1', 'effect 2', ...],
};
```

### Style Prompt Guidelines

- Reference specific art movements or techniques (e.g., "woodblock print", "ink wash")
- Include line quality, color treatment, and composition hints
- Mention cultural identifiers the AI model recognizes
- Keep the prompt under 200 characters for best results

### Palette Selection

Choose 4 colors that define the visual identity:

| Color Role | Example |
|-----------|---------|
| Primary | The dominant hue (backgrounds, large areas) |
| Secondary | Complement or contrast color |
| Accent | Highlights, magical effects, focal points |
| Neutral | Base tone, shadows, borders |

---

## 3. Mixing Styles

Create unique visual blends by combining two art traditions. The mixer interpolates between style prompts and palettes.

### Via API

The style mixing is handled by the `mixStyles()` function. In the UI:

1. Open the **Assets** tab
2. Set up your subject and resolution as normal
3. In the **Style Mixer** row, pick Style A and Style B
4. Drag the slider to set the blend ratio (50/50 is default)
5. Click **Mix & Generate**

### Blend Ratios

- **75/25**: One dominant culture with accent elements from the other
- **50/50**: Even fusion — use for "crossroads" or "trade route" settings
- **25/75**: Reverse the primary/secondary relationship

### Named Blend Ideas

| Blend Name | Style A | Style B | Ratio |
|-----------|---------|---------|-------|
| Silk Road Fusion | Arabian Nights | Chinese Ink Wash | 60/40 |
| Viking Samurai | Norse Viking | Ukiyo-e Woodblock | 50/50 |
| Afro-Celtic | African Ancestral | Celtic Druidic | 70/30 |
| Mughal Aztec | Mughal Miniature | Aztec Sun Stone | 50/50 |

---

## 4. Setting Up Auto-Research

The auto-research system studies a culture and generates a complete style recipe.

### Start Research

```bash
curl -X POST https://your-domain/api/research/start \
  -H 'Content-Type: application/json' \
  -d '{"culture": "Polynesian", "era": "Pre-colonial"}'
```

Returns a job ID. Research runs in the background.

### Check Status

```bash
curl https://your-domain/api/research/status
```

Returns:
```json
{
  "completed": [...],
  "inProgress": [...],
  "queued": [...],
  "stylesAvailable": 12
}
```

### Research Pipeline

1. **Seed gathering**: Collects cultural identifiers and mythology
2. **Style deconstruction**: Extracts visual parameters (palette, line quality, composition)
3. **Prompt generation**: Creates optimized AI image prompts
4. **Recipe assembly**: Builds a complete `StyleRecipe` with locations, monsters, artifacts

---

## 5. Sprite Generation for Game Assets

Generate retro-style pixel art sprites for characters, items, and effects.

### Via API

```bash
curl -X POST https://your-domain/api/generate/sprite \
  -H 'Content-Type: application/json' \
  -d '{
    "character": "dwarven fighter with warhammer",
    "palette": ["steel grey", "gold", "brown", "ivory"],
    "action": "attack"
  }'
```

### Sprite Resolutions

| Resolution | Size | Colors | Best For |
|-----------|------|--------|----------|
| `sprite-16` | 16x16 | 4 | Items, icons, minimap tokens |
| `sprite-32` | 32x32 | 8 | Characters, SNES-style (default) |
| `sprite-64` | 64x64 | 16 | Detailed character portraits, bosses |

### Action Poses

- `idle` — Default standing pose
- `attack` — Mid-swing or casting pose
- `walk` — Mid-stride animation frame
- `hurt` — Recoiling from damage
- `cast` — Channeling magic with hands raised

---

## 6. Resolution Pipeline Explained

Each resolution maps to a specific prompt addendum that controls output quality.

### Pipeline Flow

```
User Request
    |
    v
[Asset Type Template]  -- location/monster/item/portrait/map/effect
    |
    v
[Style Prompt]         -- cultural art style from registry
    |
    v
[Resolution Layer]     -- quality/size modifier
    |
    v
[Extras]               -- additional keywords
    |
    v
Final Prompt → Image API → Asset in Gallery
```

### Resolution Tiers

| Tier | Resolutions | Use Case |
|------|------------|----------|
| Sprite | `sprite-16`, `sprite-32`, `sprite-64` | Game tokens, character sheets, UI elements |
| Art | `sketch`, `watercolor`, `oil` | Scene illustrations, concept art, campaign materials |
| Premium | `photorealistic` | Cover art, promotional materials, key scenes |

### When to Use Which

- **Sketch**: Quick concept exploration, iteration phase
- **Watercolor**: Ethereal, dreamlike scenes; magical effects
- **Oil**: Default choice — rich, dramatic, versatile
- **Photorealistic**: Showcase pieces; use sparingly (higher generation time)

---

## 7. Creating Your Own Culture Pack

A culture pack is a complete set of themed assets for a specific tradition. To create one:

### Step 1: Define the Style

Add a new entry to `WORLD_STYLES` following the structure in Tutorial 2.

### Step 2: Populate Content

For each category, provide 5 entries:

- **Locations**: Distinctive architectural or landscape features
- **Monsters**: Mythological creatures from the tradition
- **Artifacts**: Named items with cultural significance
- **Effects**: Ambient visual effects (weather, light, particles)

### Step 3: Test Prompts

Use the API to test your style with various subjects:

```bash
# Test location
curl -X POST /api/generate/asset -d '{"type":"location","subject":"temple gate","style":"your_style"}'

# Test monster
curl -X POST /api/generate/asset -d '{"type":"monster","subject":"river dragon","style":"your_style"}'

# Test portrait
curl -X POST /api/generate/asset -d '{"type":"portrait","subject":"warrior queen","style":"your_style"}'
```

### Step 4: Create Pre-built Recipes

Add entries to `ASSET_RECIPES` in `src/game/asset-recipes.ts`:

```typescript
{ name: 'Your Recipe Name', type: 'location', subject: '...', style: 'your_style', resolution: 'oil', extras: ['...'] },
```

### Step 5: Document Cultural Sources

Always include:
- Historical period and region
- Art movement or technique referenced
- Living vs. historical tradition
- Any sensitivity notes for cultural consultants

---

## Available Art Styles

| ID | Name | Culture |
|----|------|---------|
| `japanese_ukiyoe` | Ukiyo-e Woodblock | Japan |
| `chinese_inkwash` | Chinese Ink Wash | China |
| `korean_minhwa` | Korean Minhwa Folk Art | Korea |
| `indian_miniature` | Mughal Miniature | India |
| `thai_golden` | Thai Golden Temple Art | Thailand |
| `arabian_nights` | Arabian Nights Illumination | Middle East |
| `african_ancestor` | African Ancestral Art | West Africa |
| `norse_viking` | Norse Viking Carving | Scandinavia |
| `celtic_druid` | Celtic Druidic Art | Celtic |
| `slavic_dark` | Slavic Dark Fairy Tale | Eastern Europe |
| `aztec_sun` | Aztec Sun Stone | Mesoamerica |
| `native_spiritwalker` | Native Spirit Walker | Native American |
