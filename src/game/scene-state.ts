// ═══════════════════════════════════════════════════════════════════
// Scene State Tracker — Dynamic Visual Generation
// Tracks what happened in the scene so visuals evolve accordingly
// ═══════════════════════════════════════════════════════════════════

export interface SceneElement {
  id: string;
  type: 'character' | 'npc' | 'environment' | 'item' | 'effect' | 'weather';
  name: string;
  state: Record<string, string>; // current visual state
  basePrompt: string; // consistent visual description
  modified: boolean; // has been changed by player actions
}

export interface SceneState {
  id: string;
  location: string;
  locationPrompt: string; // base environment description
  timeOfDay: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'evening' | 'night' | 'midnight';
  weather: 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog' | 'snow' | 'wind';
  mood: 'peaceful' | 'tense' | 'mysterious' | 'horror' | 'epic' | 'sad' | 'joyful' | 'neutral';
  elements: SceneElement[];
  history: string[]; // narrative descriptions of what happened
  lastAction: string;
  ts: number;
}

export class SceneManager {
  private scenes: Map<string, SceneState> = new Map();
  private currentSceneId: string | null = null;

  createScene(location: string, locationPrompt: string): SceneState {
    const scene: SceneState = {
      id: crypto.randomUUID(), location, locationPrompt,
      timeOfDay: 'evening', weather: 'clear', mood: 'neutral',
      elements: [], history: [], lastAction: '', ts: Date.now()
    };
    this.scenes.set(scene.id, scene);
    this.currentSceneId = scene.id;
    return scene;
  }

  getCurrentScene(): SceneState | undefined {
    return this.currentSceneId ? this.scenes.get(this.currentSceneId) : undefined;
  }

  // Add persistent element (NPC, item) with consistent appearance
  addElement(type: SceneElement['type'], name: string, basePrompt: string, initialState: Record<string, string> = {}): SceneElement {
    const scene = this.getCurrentScene();
    if (!scene) throw new Error('No active scene');
    const element: SceneElement = { id: crypto.randomUUID(), type, name, basePrompt, state: initialState, modified: false };
    scene.elements.push(element);
    return element;
  }

  // Modify element based on player action
  modifyElement(elementId: string, changes: Record<string, string>): void {
    const scene = this.getCurrentScene();
    if (!scene) return;
    const el = scene.elements.find(e => e.id === elementId);
    if (el) { Object.assign(el.state, changes); el.modified = true; }
  }

  // Record action and update scene state
  recordAction(narrative: string, effects?: { timeOfDay?: SceneState['timeOfDay']; weather?: SceneState['weather']; mood?: SceneState['mood'] }): void {
    const scene = this.getCurrentScene();
    if (!scene) return;
    scene.history.push(narrative);
    scene.lastAction = narrative;
    if (effects) {
      if (effects.timeOfDay) scene.timeOfDay = effects.timeOfDay;
      if (effects.weather) scene.weather = effects.weather;
      if (effects.mood) scene.mood = effects.mood;
    }
  }

  // Generate visual prompt for current scene
  generateVisualPrompt(): string {
    const scene = this.getCurrentScene();
    if (!scene) return '';
    const parts = [
      `TTRPG scene, ${scene.location}, ${scene.timeOfDay}, ${scene.weather}`,
      `mood: ${scene.mood}`,
      scene.locationPrompt,
    ];
    if (scene.lastAction) parts.push(`recent action: ${scene.lastAction}`);
    for (const el of scene.elements) {
      const stateStr = Object.entries(el.state).map(([k, v]) => `${k}: ${v}`).join(', ');
      parts.push(`${el.type} ${el.name}${stateStr ? ` (${stateStr})` : ''}, ${el.basePrompt}`);
    }
    if (scene.history.length > 0) {
      parts.push(`scene history: ${scene.history.slice(-3).join('; ')}`);
    }
    return parts.join('. ');
  }

  // Pre-rendered asset prompt (for speed)
  generateAssetPrompt(elementType: string, name: string, style: string): string {
    return `TTRPG asset, ${elementType}, ${name}, ${style}, dark background, consistent style, game sprite quality`;
  }

  getScene(id: string): SceneState | undefined { return this.scenes.get(id); }
}
