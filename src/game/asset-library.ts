// ═══════════════════════════════════════════════════════════════════
// Pre-Rendered Asset Library
// Common TTRPG elements pre-generated for speed. Custom elements generated on demand.
// ═══════════════════════════════════════════════════════════════════

export interface Asset {
  id: string;
  category: 'environment' | 'character' | 'monster' | 'item' | 'effect' | 'npc' | 'ui';
  name: string;
  prompt: string;           // generation prompt
  style: string;            // art style tag
  generated: boolean;       // has been rendered
  dataUrl?: string;         // base64 encoded image
  generatedAt?: number;
  tags: string[];
}

// Pre-rendered asset templates — common TTRPG elements
export const ASSET_TEMPLATES: Omit<Asset, 'id' | 'generated' | 'dataUrl' | 'generatedAt'>[] = [
  // Environments
  { category: 'environment', name: 'tavern-interior', prompt: 'medieval tavern interior, warm fireplace, wooden tables, mugs, dim candlelight', style: 'fantasy-illustration', tags: ['indoor', 'social', 'rest'] },
  { category: 'environment', name: 'forest-path', prompt: 'dense forest path, towering trees, dappled sunlight, undergrowth, mysterious atmosphere', style: 'fantasy-illustration', tags: ['outdoor', 'nature', 'travel'] },
  { category: 'environment', name: 'dungeon-corridor', prompt: 'stone dungeon corridor, torch sconces, cobwebs, damp walls, shadows', style: 'fantasy-illustration', tags: ['indoor', 'dungeon', 'danger'] },
  { category: 'environment', name: 'mountain-pass', prompt: 'narrow mountain pass, snow-capped peaks, strong wind, rocky terrain, clouds below', style: 'fantasy-illustration', tags: ['outdoor', 'wilderness', 'travel'] },
  { category: 'environment', name: 'castle-throne', prompt: 'grand castle throne room, banners, stone pillars, throne on dais, guards, ceremonial', style: 'fantasy-illustration', tags: ['indoor', 'royalty', 'social'] },
  { category: 'environment', name: 'village-square', prompt: 'bustling village square, market stalls, fountain, townspeople, merchant wagons', style: 'fantasy-illustration', tags: ['outdoor', 'social', 'civilization'] },
  { category: 'environment', name: 'cave-entrance', prompt: 'dark cave entrance, stalactites, dripping water, mysterious depths, faint glow inside', style: 'fantasy-illustration', tags: ['outdoor', 'dungeon', 'mystery'] },
  { category: 'environment', name: 'campsite', prompt: 'wilderness campsite, crackling campfire, bedrolls, tents, stars above, watchful forest', style: 'fantasy-illustration', tags: ['outdoor', 'rest', 'wilderness'] },
  { category: 'environment', name: 'temple-ruins', prompt: 'ancient temple ruins, crumbling columns, overgrown vines, sacred symbols, eerie silence', style: 'fantasy-illustration', tags: ['outdoor', 'ruins', 'mystery'] },
  { category: 'environment', name: 'coastal-cliff', prompt: 'dramatic coastal cliff, crashing waves below, seabirds, windy, lighthouse in distance', style: 'fantasy-illustration', tags: ['outdoor', 'travel', 'coastal'] },

  // Monsters (common low-level)
  { category: 'monster', name: 'goblin', prompt: 'scrawny goblin, green skin, crude weapons, feral grin, crouching stance, dark fantasy', style: 'fantasy-illustration', tags: ['humanoid', 'low-level', 'evil'] },
  { category: 'monster', name: 'skeleton', prompt: 'animated skeleton warrior, rusted armor, glowing eye sockets, sword and shield, undead', style: 'fantasy-illustration', tags: ['undead', 'low-level', 'evil'] },
  { category: 'monster', name: 'wolf', prompt: 'dire wolf, large predatory canine, glowing eyes, snarling, pack animal', style: 'fantasy-illustration', tags: ['beast', 'low-level', 'neutral'] },
  { category: 'monster', name: 'bandit', prompt: 'human bandit, leather armor, crossbow, hooded, scarred face, highwayman', style: 'fantasy-illustration', tags: ['humanoid', 'low-level', 'evil'] },
  { category: 'monster', name: 'slime', prompt: 'gelatinous cube/slime, translucent green, absorbing debris, dungeon hazard, acidic', style: 'fantasy-illustration', tags: ['aberration', 'low-level', 'neutral'] },
  { category: 'monster', name: 'dragon-young', prompt: 'young dragon, small wings, red scales, breathing smoke, territorial, lair', style: 'fantasy-illustration', tags: ['dragon', 'mid-level', 'evil'] },
  { category: 'monster', name: 'lich', prompt: 'lich wizard, skeletal with glowing robes, phylactery, dark magic aura, undead master', style: 'fantasy-illustration', tags: ['undead', 'high-level', 'evil'] },

  // Items
  { category: 'item', name: 'magic-sword', prompt: 'enchanted sword, glowing runes on blade, ornate hilt, magical aura, fantasy weapon', style: 'fantasy-illustration', tags: ['weapon', 'magic', 'common'] },
  { category: 'item', name: 'healing-potion', prompt: 'healing potion, glowing red liquid, glass vial, cork stopper, magical shimmer', style: 'fantasy-illustration', tags: ['consumable', 'magic', 'common'] },
  { category: 'item', name: 'ancient-map', prompt: 'aged parchment map, faded ink, mysterious markings, treasure location, worn edges', style: 'fantasy-illustration', tags: ['quest', 'information', 'common'] },
  { category: 'item', name: 'enchanted-ring', prompt: 'magic ring, glowing gemstone, ornate gold band, inscription, magical aura', style: 'fantasy-illustration', tags: ['accessory', 'magic', 'common'] },

  // Effects
  { category: 'effect', name: 'fireball', prompt: 'explosive fireball, orange and red flames, smoke, destruction, magical fire', style: 'fantasy-illustration', tags: ['combat', 'magic', 'damage'] },
  { category: 'effect', name: 'healing-glow', prompt: 'soft golden healing light, divine magic, warm glow, restoration', style: 'fantasy-illustration', tags: ['healing', 'magic', 'positive'] },
  { category: 'effect', name: 'lightning', prompt: 'blue lightning bolt, crackling energy, electrical damage, storm magic', style: 'fantasy-illustration', tags: ['combat', 'magic', 'damage'] },
  { category: 'effect', name: 'poison-cloud', prompt: 'green poisonous gas cloud, noxious fumes, area effect, danger', style: 'fantasy-illustration', tags: ['combat', 'hazard', 'negative'] },
];

export class AssetLibrary {
  private assets: Map<string, Asset> = new Map();
  private customAssets: Map<string, Asset> = new Map();

  constructor() {
    // Load templates
    for (const template of ASSET_TEMPLATES) {
      const asset: Asset = { ...template, id: `asset-${template.category}-${template.name}`, generated: false };
      this.assets.set(asset.id, asset);
    }
  }

  getAsset(id: string): Asset | undefined { return this.assets.get(id) || this.customAssets.get(id); }
  getByCategory(category: string): Asset[] { return [...this.assets.values(), ...this.customAssets.values()].filter(a => a.category === category); }
  getByTag(tag: string): Asset[] { return [...this.assets.values(), ...this.customAssets.values()].filter(a => a.tags.includes(tag)); }
  getAllTemplates(): Asset[] { return [...this.assets.values()]; }

  // Mark asset as generated with data
  markGenerated(id: string, dataUrl: string): void {
    const asset = this.assets.get(id) || this.customAssets.get(id);
    if (asset) { asset.generated = true; asset.dataUrl = dataUrl; asset.generatedAt = Date.now(); }
  }

  // Create custom asset (for unique NPCs, locations, etc)
  createCustomAsset(category: Asset['category'], name: string, prompt: string, style: string, tags: string[]): Asset {
    const asset: Asset = { id: `custom-${Date.now()}-${name}`, category, name, prompt, style, generated: false, tags };
    this.customAssets.set(asset.id, asset);
    return asset;
  }

  // Generate visual prompt for scene composition
  composeScenePrompt(sceneAssets: string[]): string {
    const parts = ['TTRPG scene composition, dark fantasy style'];
    for (const id of sceneAssets) {
      const asset = this.getAsset(id);
      if (asset) parts.push(`${asset.category}: ${asset.prompt}`);
    }
    return parts.join(', ');
  }
}
