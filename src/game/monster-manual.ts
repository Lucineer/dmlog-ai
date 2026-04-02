/**
 * DMLog.ai - Monster Manual
 * Comprehensive monster encyclopedia with stats, abilities, and encounter scaling.
 */

export interface Monster {
    id: string;
    name: string;
    type: string;
    size: string;
    alignment: string;
    ac: number;
    hp: { average: number; die: string };
    speed: string;
    str: number;
    dex: number;
    con: number;
    int: number;
    wis: number;
    cha: number;
    skills: string[];
    senses: string;
    languages: string[];
    cr: number;
    xp: number;
    traits: Ability[];
    actions: Ability[];
    legendary?: Array<{ name: string; description: string }>;
    description: string;
    tactics: string;
    loot: string;
}

export interface Ability {
    name: string;
    description: string;
    type: 'trait' | 'action' | 'reaction' | 'legendary' | 'lair';
}

export class MonsterManual {
    private monsters = new Map<string, Monster>();

    constructor() {
        this.initializeMonsters();
    }

    // ==========================================
    // 1-6: Retrieval and Filtering Methods
    // ==========================================

    public getMonster(id: string): Monster | undefined {
        return this.monsters.get(id);
    }

    public search(query: string): Monster[] {
        const q = query.toLowerCase();
        return this.getAll().filter(m => 
            m.name.toLowerCase().includes(q) || 
            m.type.toLowerCase().includes(q) ||
            m.description.toLowerCase().includes(q)
        );
    }

    public getByCR(cr: number): Monster[] {
        return this.getAll().filter(m => m.cr === cr);
    }

    public getByType(type: string): Monster[] {
        const t = type.toLowerCase();
        return this.getAll().filter(m => m.type.toLowerCase() === t);
    }

    public getBySize(size: string): Monster[] {
        const s = size.toLowerCase();
        return this.getAll().filter(m => m.size.toLowerCase() === s);
    }

    public getCRRange(min: number, max: number): Monster[] {
        return this.getAll().filter(m => m.cr >= min && m.cr <= max);
    }

    // ==========================================
    // 7-9: Encounter & XP Methods
    // ==========================================

    public getMonsterXP(cr: number): number {
        const xpMap: Record<number, number> = {
            0: 10, 0.125: 25, 0.25: 50, 0.5: 100, 1: 200, 2: 450, 3: 700, 4: 1100,
            5: 1800, 6: 2300, 7: 2900, 8: 3900, 9: 5000, 10: 5900, 11: 7200, 12: 8400,
            13: 10000, 14: 11500, 15: 13000, 16: 15000, 17: 18000, 18: 20000, 
            19: 22000, 20: 25000, 21: 33000, 22: 41000, 23: 50000, 24: 62000, 30: 155000
        };
        return xpMap[cr] || 0;
    }

    public getEncounterBudget(partyLevel: number, partySize: number, difficulty: 'easy' | 'medium' | 'hard' | 'deadly'): number {
        const thresholds: Record<number, { easy: number, medium: number, hard: number, deadly: number }> = {
            1: { easy: 25, medium: 50, hard: 75, deadly: 100 },
            2: { easy: 50, medium: 100, hard: 150, deadly: 200 },
            3: { easy: 75, medium: 150, hard: 225, deadly: 400 },
            4: { easy: 125, medium: 250, hard: 375, deadly: 500 },
            5: { easy: 250, medium: 500, hard: 750, deadly: 1100 },
            6: { easy: 300, medium: 600, hard: 900, deadly: 1400 },
            7: { easy: 350, medium: 750, hard: 1100, deadly: 1700 },
            8: { easy: 450, medium: 900, hard: 1400, deadly: 2100 },
            9: { easy: 500, medium: 1100, hard: 1600, deadly: 2400 },
            10: { easy: 600, medium: 1200, hard: 1900, deadly: 2800 },
            11: { easy: 800, medium: 1600, hard: 2400, deadly: 3600 },
            12: { easy: 1000, medium: 2000, hard: 3000, deadly: 4500 },
            13: { easy: 1100, medium: 2200, hard: 3400, deadly: 5100 },
            14: { easy: 1250, medium: 2500, hard: 3800, deadly: 5700 },
            15: { easy: 1400, medium: 2800, hard: 4300, deadly: 6400 },
            16: { easy: 1600, medium: 3200, hard: 4800, deadly: 7200 },
            17: { easy: 2000, medium: 3900, hard: 5900, deadly: 8800 },
            18: { easy: 2100, medium: 4200, hard: 6300, deadly: 9500 },
            19: { easy: 2400, medium: 4900, hard: 7300, deadly: 10900 },
            20: { easy: 2800, medium: 5700, hard: 8500, deadly: 12700 }
        };
        const levelData = thresholds[partyLevel] || thresholds[1];
        return levelData[difficulty] * partySize;
    }

    public generateEncounter(partyLevel: number, partySize: number, difficulty: 'easy' | 'medium' | 'hard' | 'deadly'): Monster[] {
        let budget = this.getEncounterBudget(partyLevel, partySize, difficulty);
        const encounter: Monster[] = [];
        const available = this.getAll().sort((a, b) => b.xp - a.xp);

        let attempts = 0;
        while (budget > 0 && attempts < 100) {
            const affordable = available.filter(m => m.xp <= budget && m.xp > 0);
            if (affordable.length === 0) break;

            const pick = affordable[Math.floor(Math.random() * affordable.length)];
            encounter.push(pick);
            budget -= pick.xp;
            attempts++;
        }
        return encounter;
    }

    // ==========================================
    // 10-14: Formatting and Utility Methods
    // ==========================================

    public getMonsterStatBlock(id: string): string {
        const m = this.getMonster(id);
        if (!m) return 'Monster not found.';

        const mod = (score: number) => {
            const m = Math.floor((score - 10) / 2);
            return m >= 0 ? `+${m}` : `${m}`;
        };

        let block = `
==================================================
${m.name.toUpperCase()}
*${m.size} ${m.type}, ${m.alignment}*
--------------------------------------------------
Armor Class: ${m.ac}
Hit Points: ${m.hp.average} (${m.hp.die})
Speed: ${m.speed}
--------------------------------------------------
STR: ${m.str} (${mod(m.str)}) | DEX: ${m.dex} (${mod(m.dex)}) | CON: ${m.con} (${mod(m.con)})
INT: ${m.int} (${mod(m.int)}) | WIS: ${m.wis} (${mod(m.wis)}) | CHA: ${m.cha} (${mod(m.cha)})
--------------------------------------------------
Skills: ${m.skills.join(', ') || 'None'}
Senses: ${m.senses}
Languages: ${m.languages.join(', ') || 'None'}
Challenge: ${m.cr} (${m.xp} XP)
--------------------------------------------------`;

        if (m.traits.length) {
            block += `\nTRAITS\n`;
            m.traits.forEach(t => block += `> ${t.name}: ${t.description}\n`);
        }
        if (m.actions.length) {
            block += `\nACTIONS\n`;
            m.actions.forEach(a => block += `> ${a.name}: ${a.description}\n`);
        }
        if (m.legendary && m.legendary.length) {
            block += `\nLEGENDARY ACTIONS\n`;
            m.legendary.forEach(l => block += `> ${l.name}: ${l.description}\n`);
        }
        block += `==================================================`;
        return block;
    }

    public getMonsterTactics(id: string): string {
        return this.getMonster(id)?.tactics || 'No tactics available.';
    }

    public getMonsterLoot(id: string): string {
        return this.getMonster(id)?.loot || 'No loot available.';
    }

    public getRandomMonster(cr?: number): Monster | undefined {
        const pool = cr !== undefined ? this.getByCR(cr) : this.getAll();
        if (pool.length === 0) return undefined;
        return pool[Math.floor(Math.random() * pool.length)];
    }

    public compareMonsters(id1: string, id2: string): string {
        const m1 = this.getMonster(id1);
        const m2 = this.getMonster(id2);
        if (!m1 || !m2) return "Invalid monster IDs for comparison.";

        return `
Comparison: ${m1.name} vs ${m2.name}
-----------------------------------------
CR:  ${m1.cr} vs ${m2.cr}
AC:  ${m1.ac} vs ${m2.ac}
HP:  ${m1.hp.average} vs ${m2.hp.average}
STR: ${m1.str} vs ${m2.str}
DEX: ${m1.dex} vs ${m2.dex}
CON: ${m1.con} vs ${m2.con}
INT: ${m1.int} vs ${m2.int}
WIS: ${m1.wis} vs ${m2.wis}
CHA: ${m1.cha} vs ${m2.cha}
`;
    }

    // ==========================================
    // 15-19: Advanced & State Methods
    // ==========================================

    public getMonsterCount(): number {
        return this.monsters.size;
    }

    public getLegendaryMonsters(): Monster[] {
        return this.getAll().filter(m => m.legendary && m.legendary.length > 0);
    }

    public scaleMonster(id: string, newCr: number): Monster | undefined {
        const base = this.getMonster(id);
        if (!base) return undefined;

        const diff = newCr - base.cr;
        const scaled: Monster = JSON.parse(JSON.stringify(base)); // Deep copy

        scaled.id = `${base.id}-cr${newCr}`;
        scaled.name = `${base.name} (Scaled CR ${newCr})`;
        scaled.cr = newCr;
        scaled.xp = this.getMonsterXP(newCr);
        
        // Scale stats roughly based on CR difference
        scaled.ac += Math.floor(diff / 2);
        scaled.hp.average = Math.max(1, scaled.hp.average + (diff * 15));
        scaled.str = Math.max(1, scaled.str + Math.floor(diff / 2));
        scaled.dex = Math.max(1, scaled.dex + Math.floor(diff / 2));
        scaled.con = Math.max(1, scaled.con + Math.floor(diff / 2));

        return scaled;
    }

    public getAll(): Monster[] {
        return Array.from(this.monsters.values());
    }

    public serialize(): string {
        return JSON.stringify(Array.from(this.monsters.entries()));
    }

    public deserialize(data: string): void {
        try {
            const parsed = JSON.parse(data);
            this.monsters = new Map(parsed);
        } catch (e) {
            console.error("Failed to deserialize Monster Manual data.");
        }
    }

    // ==========================================
    // Pre-population Seeder
    // ==========================================

    private seed(id: string, name: string, cr: number, type: string, size: string, ac: number, hpAvg: number, hpDie: string, stats: number[], traits: Ability[], actions: Ability[], legendary?: {name:string, description:string}[]) {
        this.monsters.set(id, {
            id, name, type, size, alignment: 'Neutral Evil', ac, hp: { average: hpAvg, die: hpDie },
            speed: '30 ft.', str: stats[0], dex: stats[1], con: stats[2], int: stats[3], wis: stats[4], cha: stats[5],
            skills: ['Perception +3'], senses: 'Darkvision 60 ft., passive Perception 13', languages: ['Common'],
            cr, xp: this.getMonsterXP(cr), traits, actions, legendary,
            description: `A formidable ${name} that strikes fear into adventurers.`,
            tactics: 'Targets the weakest looking enemy first.', loot: 'Assorted coins and mundane items.'
        });
    }

    private initializeMonsters() {
        const t = (name: string, desc: string): Ability => ({ name, description: desc, type: 'trait' });
        const a = (name: string, desc: string): Ability => ({ name, description: desc, type: 'action' });
        const l = (name: string, desc: string) => ({ name, description: desc });

        // CR 0
        this.seed('giant-rat', 'Giant Rat', 0, 'Beast', 'Small', 12, 7, '2d6', [7, 15, 11, 2, 10, 4], [t('Keen Smell', 'Advantage on smell.')], [a('Bite', 'Melee: +4 to hit, 1d4+2 piercing.')]);
        this.seed('goblin', 'Goblin', 0, 'Humanoid', 'Small', 15, 7, '2d6', [8, 14, 10, 10, 8, 8], [t('Nimble Escape', 'Disengage/Hide as bonus action.')], [a('Scimitar', 'Melee: +4 to hit, 1d6+2 slashing.')]);
        this.seed('skeleton', 'Skeleton', 0, 'Undead', 'Medium', 13, 13, '2d8+4', [10, 14, 15, 6, 8, 5], [t('Undead Nature', 'Doesn\'t require air.')], [a('Shortsword', 'Melee: +4 to hit, 1d6+2 piercing.')]);

        // CR 1/4
        this.seed('bandit', 'Bandit', 0.25, 'Humanoid', 'Medium', 12, 11, '2d8+2', [11, 12, 12, 10, 10, 10], [], [a('Light Crossbow', 'Ranged: +3 to hit, 1d8+1 piercing.')]);
        this.seed('kobold', 'Kobold', 0.25, 'Humanoid', 'Small', 12, 5, '2d6-2', [7, 15, 9, 8, 7, 8], [t('Pack Tactics', 'Advantage if ally is within 5ft.')], [a('Dagger', 'Melee: +4 to hit, 1d4+2 piercing.')]);
        this.seed('zombie', 'Zombie', 0.25, 'Undead', 'Medium', 8, 22, '3d8+9', [13, 6, 16, 3, 6, 5], [t('Undead Fortitude', 'Con save to drop to 1 HP instead of 0.')], [a('Slam', 'Melee: +3 to hit, 1d6+1 bludgeoning.')]);

        // CR 1/2
        this.seed('guard', 'Guard', 0.5, 'Humanoid', 'Medium', 16, 11, '2d8+2', [13, 12, 12, 10, 11, 10], [], [a('Spear', 'Melee: +3 to hit, 1d6+1 piercing.')]);
        this.seed('wolf', 'Wolf', 0.5, 'Beast', 'Medium', 13, 11, '2d8+2', [12, 15, 12, 3, 12, 6], [t('Pack Tactics', 'Advantage if ally is within 5ft.')], [a('Bite', 'Melee: +4 to hit, 1d6+2 piercing. Target must succeed DC 11 Str save or be prone.')]);
        this.seed('skeleton-knight', 'Skeleton Knight', 0.5, 'Undead', 'Medium', 16, 22, '4d8+4', [14, 12, 12, 8, 9, 5], [t('Martial Advantage', 'Extra 1d6 damage once per turn.')], [a('Longsword', 'Melee: +4 to hit, 1d8+2 slashing.')]);

        // CR 1
        this.seed('bugbear', 'Bugbear', 1, 'Humanoid', 'Medium', 16, 27, '5d8+5', [15, 14, 13, 8, 11, 9], [t('Brute', 'Extra die of damage on melee.')], [a('Morningstar', 'Melee: +4 to hit, 2d8+2 piercing.')]);
        this.seed('ghoul', 'Ghoul', 1, 'Undead', 'Medium', 12, 22, '5d8', [13, 15, 10, 7, 10, 6], [], [a('Claws', 'Melee: +4 to hit, 2d4+2 slashing. DC 10 Con save or paralyzed.')]);
        this.seed('shadow', 'Shadow', 1, 'Undead', 'Medium', 12, 16, '3d8+3', [6, 14, 13, 6, 10, 8], [t('Amorphous', 'Can move through 1-inch spaces.')], [a('Strength Drain', 'Melee: +4 to hit, 2d6+2 necrotic. Target loses 1d4 Str.')]);

        // CR 2
        this.seed('owlbear', 'Owlbear', 2, 'Monstrosity', 'Large', 13, 59, '7d10+21', [20, 12, 17, 3, 12, 7], [t('Keen Sight and Smell', 'Advantage on Perception.')], [a('Multiattack', 'One beak, one claws.'), a('Claws', 'Melee: +7 to hit, 2d8+5 slashing.')]);
        this.seed('wight', 'Wight', 2, 'Undead', 'Medium', 14, 45, '6d8+18', [15, 14, 16, 10, 13,