// src/game/loot-system.ts

/**
 * D&D 5e item and inventory management for DMLog.ai
 */

export interface Item {
  id: string; // Catalog ID, e.g., 'longsword'
  instanceId: string; // Unique ID for this specific item instance in an inventory
  name: string;
  type: 'weapon' | 'armor' | 'potion' | 'scroll' | 'wondrous' | 'gem' | 'tool' | 'equipment';
  rarity: 'common' | 'uncommon' | 'rare' | 'very-rare' | 'legendary';
  weight: number; // in lbs
  value: number; // in copper pieces
  description: string;
  attuned: boolean;
  equipped: boolean;
  effects?: string[];
  damage?: { dice: string; type: string };
  ac?: number;
  maxCharges?: number;
  charges?: number;
}

export interface Inventory {
  ownerId: string;
  gold: number;
  silver: number;
  copper: number;
  items: Item[];
  maxWeight: number;
  currentWeight: number;
}

export class LootSystem {
  private inventories = new Map<string, Inventory>();
  private itemCatalog = new Map<string, Omit<Item, 'instanceId'>>();
  private lootTables: Record<Item['rarity'], string[]> = {
    common: [], uncommon: [], rare: [], 'very-rare': [], legendary: []
  };

  constructor() {
    this._initializeCatalog();
  }

  // 1. createInventory
  createInventory(ownerId: string, maxWeight: number): Inventory {
    if (this.inventories.has(ownerId)) {
      throw new Error(`Inventory for owner ${ownerId} already exists.`);
    }
    const newInventory: Inventory = {
      ownerId,
      maxWeight,
      gold: 0,
      silver: 0,
      copper: 0,
      items: [],
      currentWeight: 0,
    };
    this.inventories.set(ownerId, newInventory);
    return newInventory;
  }

  // 2. getInventory
  getInventory(id: string): Inventory | undefined {
    return this.inventories.get(id);
  }

  // 3. addItem
  addItem(invId: string, catalogId: string): Item | null {
    const inventory = this.getInventory(invId);
    const itemTemplate = this.itemCatalog.get(catalogId);

    if (!inventory || !itemTemplate) return null;

    if (inventory.currentWeight + itemTemplate.weight > inventory.maxWeight) {
      return null; // Overweight
    }

    const newItem: Item = {
      ...JSON.parse(JSON.stringify(itemTemplate)),
      instanceId: this._generateInstanceId(),
      equipped: false,
      attuned: false,
      charges: itemTemplate.maxCharges ?? undefined,
    };

    inventory.items.push(newItem);
    this._recalculateWeight(invId);
    return newItem;
  }

  // 4. removeItem
  removeItem(invId: string, instanceId: string): Item | undefined {
    const inventory = this.getInventory(invId);
    if (!inventory) return undefined;

    const itemIndex = inventory.items.findIndex(i => i.instanceId === instanceId);
    if (itemIndex === -1) return undefined;

    const [removedItem] = inventory.items.splice(itemIndex, 1);
    this._recalculateWeight(invId);
    return removedItem;
  }

  // 5. equipItem
  equipItem(invId: string, instanceId: string): void {
    const item = this._findItemInInventory(invId, instanceId);
    if (item) item.equipped = true;
  }

  // 6. unequipItem
  unequipItem(invId: string, instanceId: string): void {
    const item = this._findItemInInventory(invId, instanceId);
    if (item) item.equipped = false;
  }

  // 7. useItem
  useItem(invId: string, instanceId: string): { success: boolean; effect: string } {
    const item = this._findItemInInventory(invId, instanceId);
    if (!item) return { success: false, effect: 'Item not found.' };

    switch (item.type) {
      case 'potion':
      case 'scroll':
        this.removeItem(invId, instanceId);
        return { success: true, effect: `${item.name} is consumed. ${item.effects?.[0] ?? ''}`.trim() };
      case 'wondrous':
        if (item.charges !== undefined && item.maxCharges !== undefined) {
          if (item.charges > 0) {
            item.charges--;
            return { success: true, effect: `Used 1 charge of ${item.name}. ${item.charges} remaining.` };
          } else {
            return { success: false, effect: `${item.name} has no charges left.` };
          }
        }
        return { success: true, effect: `You use the ${item.name}.` };
      default:
        return { success: false, effect: `Cannot 'use' a ${item.type} in this way.` };
    }
  }

  // 8. dropItem
  dropItem(invId: string, instanceId: string): Item | undefined {
    return this.removeItem(invId, instanceId);
  }

  // 9. transferItem
  transferItem(fromInvId: string, toInvId: string, instanceId: string): boolean {
    const toInventory = this.getInventory(toInvId);
    if (!toInventory) return false;

    const item = this._findItemInInventory(fromInvId, instanceId);
    if (!item) return false;

    if (toInventory.currentWeight + item.weight > toInventory.maxWeight) {
      return false; // Destination is overweight
    }

    const removedItem = this.removeItem(fromInvId, instanceId);
    if (removedItem) {
      toInventory.items.push(removedItem);
      this._recalculateWeight(toInvId);
      return true;
    }
    return false;
  }

  // 10. addGold (generalized to addCurrency)
  addGold(invId: string, amount: number, currency: 'gp' | 'sp' | 'cp'): void {
    const inventory = this.getInventory(invId);
    if (!inventory) return;

    switch (currency) {
      case 'gp': inventory.gold += amount; break;
      case 'sp': inventory.silver += amount; break;
      case 'cp': inventory.copper += amount; break;
    }
  }

  // 11. spendGold (generalized to spendCurrency)
  spendGold(invId: string, amount: number, currency: 'gp' | 'sp' | 'cp'): boolean {
    const inventory = this.getInventory(invId);
    if (!inventory) return false;

    switch (currency) {
      case 'gp':
        if (inventory.gold < amount) return false;
        inventory.gold -= amount;
        break;
      case 'sp':
        if (inventory.silver < amount) return false;
        inventory.silver -= amount;
        break;
      case 'cp':
        if (inventory.copper < amount) return false;
        inventory.copper -= amount;
        break;
    }
    return true;
  }

  // 12. getCarriedWeight
  getCarriedWeight(invId: string): number {
    return this.getInventory(invId)?.currentWeight ?? 0;
  }

  // 13. getEncumbered
  getEncumbered(invId: string): 'none' | 'light' | 'heavy' | 'over' {
    const inv = this.getInventory(invId);
    if (!inv || inv.maxWeight === 0) return 'none';

    const { currentWeight, maxWeight } = inv;
    if (currentWeight >= maxWeight) return 'over';
    if (currentWeight > maxWeight * 2 / 3) return 'heavy';
    if (currentWeight > maxWeight / 3) return 'light';
    return 'none';
  }

  // 14. getEquippedItems
  getEquippedItems(invId: string): Item[] {
    return this.getInventory(invId)?.items.filter(i => i.equipped) ?? [];
  }

  // 15. getInventoryValue
  getInventoryValue(invId: string): number {
    const inv = this.getInventory(invId);
    if (!inv) return 0;

    const itemValue = inv.items.reduce((sum, item) => sum + item.value, 0);
    const currencyValue = (inv.gold * 100) + (inv.silver * 10) + inv.copper;
    return (itemValue + currencyValue) / 100; // Return total in GP
  }

  // 16. generateLoot
  generateLoot(cr: number): Item[] {
    const numItems = 1 + Math.floor(Math.random() * 2); // 1-2 items
    const loot: Item[] = [];

    for (let i = 0; i < numItems; i++) {
      const rarity = this._getLootRarity(cr);
      const itemIds = this.lootTables[rarity];
      if (itemIds.length > 0) {
        const randomId = itemIds[Math.floor(Math.random() * itemIds.length)];
        const template = this.itemCatalog.get(randomId);
        if (template) {
            loot.push({
                ...JSON.parse(JSON.stringify(template)),
                instanceId: this._generateInstanceId(),
                equipped: false,
                attuned: false,
                charges: template.maxCharges ?? undefined,
            });
        }
      }
    }
    return loot;
  }

  // 17. generateTreasureHoard
  generateTreasureHoard(cr: number): { items: Item[]; gp: number; sp: number; cp: number } {
    const numItems = 2 + Math.floor(Math.random() * 4); // 2-5 items
    const items = Array.from({ length: numItems }).flatMap(() => this.generateLoot(cr));
    
    // Simple currency generation based on CR
    const gp = Math.floor(Math.random() * 100 * cr);
    const sp = Math.floor(Math.random() * 500 * cr);
    const cp = Math.floor(Math.random() * 1000 * cr);

    return { items, gp, sp, cp };
  }

  // 18. searchCatalog
  searchCatalog(query: string): Omit<Item, 'instanceId'>[] {
    const lowerQuery = query.toLowerCase();
    const results: Omit<Item, 'instanceId'>[] = [];
    for (const item of this.itemCatalog.values()) {
      if (item.name.toLowerCase().includes(lowerQuery) || item.description.toLowerCase().includes(lowerQuery)) {
        results.push(item);
      }
    }
    return results;
  }

  // 19. getItemById
  getItemById(id: string): Omit<Item, 'instanceId'> | undefined {
    return this.itemCatalog.get(id);
  }

  // 20. serialize / deserialize
  serialize(): string {
    const data = {
      inventories: Array.from(this.inventories.entries()),
    };
    return JSON.stringify(data, null, 2);
  }

  deserialize(jsonString: string): void {
    const data = JSON.parse(jsonString);
    this.inventories = new Map(data.inventories);
  }

  // --- Private Helper Methods ---

  private _recalculateWeight(invId: string): void {
    const inventory = this.getInventory(invId);
    if (inventory) {
      inventory.currentWeight = inventory.items.reduce((sum, item) => sum + item.weight, 0);
    }
  }

  private _findItemInInventory(invId: string, instanceId: string): Item | undefined {
    return this.getInventory(invId)?.items.find(i => i.instanceId === instanceId);
  }

  private _generateInstanceId(): string {
    // A simple, dependency-free unique ID generator
    return `item-${Date.now().toString(36)}-${Math.random().toString(36).substring(2)}`;
  }
  
  private _getLootRarity(cr: number): Item['rarity'] {
    const roll = Math.random() * 100;
    if (cr <= 4) {
      return roll < 80 ? 'common' : 'uncommon';
    } else if (cr <= 10) {
      if (roll < 60) return 'uncommon';
      if (roll < 90) return 'rare';
      return 'common';
    } else if (cr <= 16) {
      if (roll < 60) return 'rare';
      if (roll < 90) return 'very-rare';
      return 'uncommon';
    } else {
      if (roll < 50) return 'very-rare';
      if (roll < 90) return 'legendary';
      return 'rare';
    }
  }

  private _addItemToCatalog(item: Omit<Item, 'instanceId' | 'equipped' | 'attuned'> & { attuned?: boolean }) {
    const fullItem: Omit<Item, 'instanceId'> = {
        ...item,
        equipped: false,
        attuned: item.attuned ?? false,
    };
    this.itemCatalog.set(fullItem.id, fullItem);
    this.lootTables[fullItem.rarity].push(fullItem.id);
  }

  private _initializeCatalog(): void {
    // Pre-populate 40 iconic D&D items
    const items: Parameters<typeof this._addItemToCatalog>[0][] = [
      // Weapons (8)
      { id: 'longsword', name: 'Longsword', type: 'weapon', rarity: 'common', weight: 3, value: 1500, description: 'A versatile martial weapon.', damage: { dice: '1d8', type: 'slashing' } },
      { id: 'dagger', name: 'Dagger', type: 'weapon', rarity: 'common', weight: 1, value: 200, description: 'A simple light weapon.', damage: { dice: '1d4', type: 'piercing' } },
      { id: 'greatsword', name: 'Greatsword', type: 'weapon', rarity: 'common', weight: 6, value: 5000, description: 'A heavy two-handed sword.', damage: { dice: '2d6', type: 'slashing' } },
      { id: 'longbow', name: 'Longbow', type: 'weapon', rarity: 'common', weight: 2, value: 5000, description: 'A martial ranged weapon.', damage: { dice: '1d8', type: 'piercing' } },
      { id: 'crossbow-light', name: 'Light Crossbow', type: 'weapon', rarity: 'common', weight: 5, value: 2500, description: 'A simple ranged weapon.', damage: { dice: '1d8', type: 'piercing' } },
      { id: 'warhammer', name: 'Warhammer', type: 'weapon', rarity: 'common', weight: 2, value: 1500, description: 'A versatile martial weapon.', damage: { dice: '1d8', type: 'bludgeoning' } },
      { id: 'rapier', name: 'Rapier', type: 'weapon', rarity: 'common', weight: 2, value: 2500, description: 'A martial finesse weapon.', damage: { dice: '1d8', type: 'piercing' } },
      { id: 'scimitar', name: 'Scimitar', type: 'weapon', rarity: 'common', weight: 3, value: 2500, description: 'A light martial weapon.', damage: { dice: '1d6', type: 'slashing' } },
      // Magic Weapons (5)
      { id: 'flame-tongue', name: 'Flame Tongue', type: 'weapon', rarity: 'rare', weight: 3, value: 50000, description: 'A sword that burns with fire.', attuned: true, effects: ['Deals +2d6 fire damage on hit.', 'Sheds bright light in 40ft radius.'], damage: { dice: '1d8', type: 'slashing' } },
      { id: 'frost-brand', name: 'Frost Brand', type: '