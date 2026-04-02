/**
 * @file src/game/skill-system.ts
 * @description D&D 5e Skill Check System for DMLog.ai
 * Handles abilities, skills, proficiency, advantage/disadvantage, and roll history.
 */

export interface Skill {
  id: string;
  name: string;
  ability: string;
  proficient: boolean;
  expertise: boolean;
  bonus: number;
  checks: CheckResult[];
}

export interface CheckResult {
  roll: number;
  modifier: number;
  total: number;
  dc: number;
  success: boolean;
  advantage: boolean;
  disadvantage: boolean;
  timestamp: number;
}

export class SkillSystem {
  private skills = new Map<string, Skill>();
  private abilities = new Map<string, number>();
  
  public proficiencyBonus: number = 2;
  private passivePerceptionOverride: number | null = null;

  constructor() {
    this.initializeAbilities();
    this.initializeSkills();
  }

  /**
   * Initializes base ability scores to 10.
   */
  private initializeAbilities(): void {
    const defaultAbilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    for (const ability of defaultAbilities) {
      this.abilities.set(ability, 10);
    }
  }

  /**
   * Initializes the 18 standard D&D 5e skills.
   */
  private initializeSkills(): void {
    const standardSkills = [
      { id: 'acrobatics', name: 'Acrobatics', ability: 'dex' },
      { id: 'animal_handling', name: 'Animal Handling', ability: 'wis' },
      { id: 'arcana', name: 'Arcana', ability: 'int' },
      { id: 'athletics', name: 'Athletics', ability: 'str' },
      { id: 'deception', name: 'Deception', ability: 'cha' },
      { id: 'history', name: 'History', ability: 'int' },
      { id: 'insight', name: 'Insight', ability: 'wis' },
      { id: 'intimidation', name: 'Intimidation', ability: 'cha' },
      { id: 'investigation', name: 'Investigation', ability: 'int' },
      { id: 'medicine', name: 'Medicine', ability: 'wis' },
      { id: 'nature', name: 'Nature', ability: 'int' },
      { id: 'perception', name: 'Perception', ability: 'wis' },
      { id: 'performance', name: 'Performance', ability: 'cha' },
      { id: 'persuasion', name: 'Persuasion', ability: 'cha' },
      { id: 'religion', name: 'Religion', ability: 'int' },
      { id: 'sleight_of_hand', name: 'Sleight of Hand', ability: 'dex' },
      { id: 'stealth', name: 'Stealth', ability: 'dex' },
      { id: 'survival', name: 'Survival', ability: 'wis' }
    ];

    for (const s of standardSkills) {
      this.skills.set(s.id, {
        id: s.id,
        name: s.name,
        ability: s.ability,
        proficient: false,
        expertise: false,
        bonus: 0,
        checks: []
      });
    }
  }

  // 1. setAbility
  public setAbility(name: string, score: number): void {
    const normalized = name.toLowerCase().substring(0, 3);
    this.abilities.set(normalized, score);
  }

  // 2. getModifier
  public getModifier(ability: string): number {
    const normalized = ability.toLowerCase().substring(0, 3);
    const score = this.abilities.get(normalized) || 10;
    return Math.floor((score - 10) / 2);
  }

  // 3. setProficient
  public setProficient(skillId: string, proficient: boolean, expertise: boolean = false): void {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`Skill ${skillId} not found.`);
    skill.proficient = proficient;
    skill.expertise = proficient ? expertise : false;
  }

  // 4. getSkillModifier
  public getSkillModifier(skillId: string): number {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`Skill ${skillId} not found.`);
    
    let mod = this.getModifier(skill.ability);
    if (skill.proficient) mod += this.proficiencyBonus;
    if (skill.expertise) mod += this.proficiencyBonus;
    mod += skill.bonus;
    
    return mod;
  }

  /**
   * Helper to roll a d20 with optional advantage/disadvantage.
   */
  private rollD20(advantage: boolean = false, disadvantage: boolean = false): number {
    const r1 = Math.floor(Math.random() * 20) + 1;
    const r2 = Math.floor(Math.random() * 20) + 1;
    
    if (advantage && !disadvantage) return Math.max(r1, r2);
    if (disadvantage && !advantage) return Math.min(r1, r2);
    return r1;
  }

  // 5. rollCheck
  public rollCheck(skillId: string, dc: number, advantage: boolean = false, disadvantage: boolean = false): CheckResult {
    const skill = this.skills.get(skillId);
    if (!skill) throw new Error(`Skill ${skillId} not found.`);

    const roll = this.rollD20(advantage, disadvantage);
    const modifier = this.getSkillModifier(skillId);
    const total = roll + modifier;
    const success = total >= dc;

    const result: CheckResult = {
      roll, modifier, total, dc, success, advantage, disadvantage, timestamp: Date.now()
    };

    skill.checks.push(result);
    return result;
  }

  // 6. rollAbility
  public rollAbility(ability: string, dc: number): CheckResult {
    const roll = this.rollD20();
    const modifier = this.getModifier(ability);
    const total = roll + modifier;
    
    return {
      roll, modifier, total, dc, success: total >= dc,
      advantage: false, disadvantage: false, timestamp: Date.now()
    };
  }

  // 7. rollSave
  public rollSave(ability: string, dc: number): CheckResult {
    // In a full system, save proficiencies would be tracked. 
    // Here we use the raw ability modifier as a baseline.
    return this.rollAbility(ability, dc);
  }

  // 8. rollContest
  public rollContest(skillId1: string, skillId2: string): { winner: string | null, rolls: CheckResult[] } {
    const roll1 = this.rollCheck(skillId1, 0); // DC 0 to just get the total
    const roll2 = this.rollCheck(skillId2, 0);

    let winner: string | null = null;
    if (roll1.total > roll2.total) winner = skillId1;
    else if (roll2.total > roll1.total) winner = skillId2;

    return { winner, rolls: [roll1, roll2] };
  }

  // 9. getSkillHistory
  public getSkillHistory(skillId: string): CheckResult[] {
    const skill = this.skills.get(skillId);
    return skill ? [...skill.checks] : [];
  }

  // 10. getSuccessRate
  public getSuccessRate(skillId: string): number {
    const skill = this.skills.get(skillId);
    if (!skill || skill.checks.length === 0) return 0;
    
    const successes = skill.checks.filter(c => c.success).length;
    return successes / skill.checks.length;
  }

  // 11. getCriticalStats
  public getCriticalStats(): { crits: number; fumbles: number; total: number } {
    let crits = 0;
    let fumbles = 0;
    let total = 0;

    for (const skill of this.skills.values()) {
      for (const check of skill.checks) {
        if (check.roll === 20) crits++;
        if (check.roll === 1) fumbles++;
        total++;
      }
    }

    return { crits, fumbles, total };
  }

  // 12. getLuckiestSkill
  public getLuckiestSkill(): string {
    let bestSkill = '';
    let highestAvg = -1;

    for (const [id, skill] of this.skills.entries()) {
      if (skill.checks.length === 0) continue;
      const avg = skill.checks.reduce((sum, c) => sum + c.roll, 0) / skill.checks.length;
      if (avg > highestAvg) {
        highestAvg = avg;
        bestSkill = id;
      }
    }

    return bestSkill || 'None';
  }

  // 13. getUnluckiestSkill
  public getUnluckiestSkill(): string {
    let worstSkill = '';
    let lowestAvg = 21;

    for (const [id, skill] of this.skills.entries()) {
      if (skill.checks.length === 0) continue;
      const avg = skill.checks.reduce((sum, c) => sum + c.roll, 0) / skill.checks.length;
      if (avg < lowestAvg) {
        lowestAvg = avg;
        worstSkill = id;
      }
    }

    return worstSkill || 'None';
  }

  // 14. getSkillSummary
  public getSkillSummary(): string {
    const lines: string[] = [];
    for (const skill of this.skills.values()) {
      const mod = this.getSkillModifier(skill.id);
      const sign = mod >= 0 ? '+' : '';
      const profMarker = skill.expertise ? ' [E]' : (skill.proficient ? ' [P]' : '');
      lines.push(`${skill.name} (${skill.ability.toUpperCase()})${profMarker}: ${sign}${mod}`);
    }
    return lines.join('\n');
  }

  // 15. setPassivePerception
  public setPassivePerception(score: number | null): void {
    this.passivePerceptionOverride = score;
  }

  // 16. getPassivePerception
  public getPassivePerception(): number {
    if (this.passivePerceptionOverride !== null) {
      return this.passivePerceptionOverride;
    }
    return 10 + this.getSkillModifier('perception');
  }

  // 17. rollWithBonus
  public rollWithBonus(bonus: number, dc: number): CheckResult {
    const roll = this.rollD20();
    const total = roll + bonus;
    return {
      roll, modifier: bonus, total, dc, success: total >= dc,
      advantage: false, disadvantage: false, timestamp: Date.now()
    };
  }

  // 18. multiSkillCheck
  public multiSkillCheck(skillIds: string[], dc: number): Array<{ skill: string; success: boolean }> {
    return skillIds.map(skillId => {
      const result = this.rollCheck(skillId, dc);
      return { skill: skillId, success: result.success };
    });
  }

  // 19. groupCheck
  public groupCheck(skillId: string, count: number, dc: number): { successes: number; failures: number } {
    let successes = 0;
    let failures = 0;

    for (let i = 0; i < count; i++) {
      const result = this.rollCheck(skillId, dc);
      if (result.success) successes++;
      else failures++;
    }

    return { successes, failures };
  }

  // 20. serialize / deserialize
  public serialize(): string {
    const data = {
      skills: Array.from(this.skills.entries()),
      abilities: Array.from(this.abilities.entries()),
      proficiencyBonus: this.proficiencyBonus,
      passivePerceptionOverride: this.passivePerceptionOverride
    };
    return JSON.stringify(data);
  }

  public deserialize(json: string): void {
    try {
      const data = JSON.parse(json);
      if (data.skills) this.skills = new Map(data.skills);
      if (data.abilities) this.abilities = new Map(data.abilities);
      if (data.proficiencyBonus !== undefined) this.proficiencyBonus = data.proficiencyBonus;
      if (data.passivePerceptionOverride !== undefined) {
        this.passivePerceptionOverride = data.passivePerceptionOverride;
      }
    } catch (e) {
      throw new Error("Failed to deserialize SkillSystem data.");
    }
  }
}