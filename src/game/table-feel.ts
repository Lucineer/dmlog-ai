/**
 * Table Feel — replicates sitting at a table with a great DM.
 *
 * Provides sensory narration templates, dice roll narrative weight,
 * pacing control, DM aside generation, and NPC reaction hooks.
 * Used by worker.ts to enrich the DM personality and responses.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PacingMode = "combat" | "exploration" | "roleplay" | "rest" | "transition";
export type DiceDrama = "critical_hit" | "critical_miss" | "high_success" | "narrow_success" | "failure" | "catastrophe" | "normal";

export interface SensoryDetails {
  sights: string[];
  sounds: string[];
  smells: string[];
  textures: string[];
  tastes: string[];
  atmosphere: string;
}

// ---------------------------------------------------------------------------
// Sensory Detail Tables
// ---------------------------------------------------------------------------

const TAVERN_DETAILS: SensoryDetails = {
  sights: ["candlelight flickering on worn wood", "a crackling hearth casting dancing shadows", "a bard tuning a lute in the corner", "steam rising from bowls of stew", "a wanted poster curling on the wall"],
  sounds: ["the crackle of a fire", "muffled laughter from a back room", "tankards clinking together", "a floorboard creaking overhead", "the bard's fingers running an arpeggio"],
  smells: ["roasting meat and ale", "wood smoke and old leather", "the faint tang of spilled wine", "pipe tobacco drifting from a corner", "fresh bread from the kitchen"],
  textures: ["rough-hewn oak tables", "sticky patches of dried mead", "a warm ceramic mug", "the worn smoothness of a bar rail", "coarse wool blankets on the benches"],
  tastes: ["hoppy ale with a bitter finish", "rich beef stew with root vegetables", "dark bread with a smear of butter", "sharp cheese aged in a cellar", "honeyed mead warming your throat"],
  atmosphere: "warm and lived-in, a refuge from the road",
};

const DUNGEON_DETAILS: SensoryDetails = {
  sights: ["stalactites dripping in the darkness", "ancient runes pulsing with faint light", "a skeleton slumped against the wall", "glowing fungi in the cracks", "shadows moving against the torchlight"],
  sounds: ["water dripping in the distance", "your own echoing footsteps", "a low rumble from somewhere deep", "stone grinding against stone", "the skittering of small claws"],
  smells: ["dust and mold", "the metallic tang of old blood", "sulfur drifting from a vent", "damp stone and mildew", "the faint sweetness of decay"],
  textures: ["cold, damp stone walls", "slick moss underfoot", "rough iron of a gate latch", "crumbling mortar between bricks", "the dry scrape of bone"],
  tastes: ["the metallic tang of cave water", "dust on your lips", "the acrid bite of torch smoke", "nothing — the air is stale and dead"],
  atmosphere: "claustrophobic and ancient, full of secrets",
};

const FOREST_DETAILS: SensoryDetails = {
  sights: ["shafts of golden light through the canopy", "a deer freezing mid-step before bounding away", "moss covering fallen logs like green velvet", "spider webs jeweled with morning dew", "a hawk circling overhead"],
  sounds: ["birds calling to each other", "leaves rustling in a breeze", "a stream babbling nearby", "twigs snapping underfoot", "the wind sighing through branches"],
  smells: ["pine needles and damp earth", "wildflowers on the breeze", "the clean smell of rain approaching", "mushrooms and decaying leaves", "wood smoke from a distant campfire"],
  textures: ["soft moss underfoot", "rough bark of an ancient oak", "cool morning mist on your skin", "the scratch of brambles", "a smooth river stone"],
  tastes: ["the clean taste of spring water", "a wild berry bursting on your tongue", "the green freshness of the air"],
  atmosphere: "alive and watchful, indifferent to your passage",
};

const MOUNTAIN_DETAILS: SensoryDetails = {
  sights: ["clouds drifting below you", "snow gleaming on distant peaks", "an eagle riding a thermal", "a narrow path carved into the cliff face", "a frozen waterfall suspended in time"],
  sounds: ["wind howling through the pass", "stones clattering down the slope", "the thin whistle of air at altitude", "an eagle's cry echoing", "your own labored breathing"],
  smells: ["thin, cold air", "stone and snow", "the sharp scent of pine from below", "ozone before a storm", "the mineral smell of fresh rock"],
  textures: ["freezing stone under your grip", "crunch of snow underfoot", "the bite of wind on exposed skin", "rough granite", "icy metal of your gear"],
  tastes: ["the cold metallic taste of mountain air", "water from a snowmelt stream"],
  atmosphere: "vast and indifferent, beautiful and lethal",
};

const ROAD_DETAILS: SensoryDetails = {
  sights: ["dust swirling in your wake", "a waymarker weathered by years", "a distant plume of smoke", "cart tracks pressed deep into mud", "the sun hanging low on the horizon"],
  sounds: ["your boots crunching on gravel", "birds in the hedgerows", "the creak of a distant cart", "a dog barking from a farmhouse", "the wind through the grass"],
  smells: ["sun-warmed earth", "grass and wild herbs", "horse dung on the road", "rain approaching", "distant wood smoke"],
  textures: ["packed earth underfoot", "the grit of road dust", "warm sun on your shoulders", "the weight of your pack", "a cool breeze on your face"],
  tastes: ["road dust on your lips", "water from your waterskin"],
  atmosphere: "open and transitional, the world between destinations",
};

const LOCATION_DETAILS: Record<string, SensoryDetails> = {
  tavern:   TAVERN_DETAILS,
  inn:      TAVERN_DETAILS,
  dungeon:  DUNGEON_DETAILS,
  cave:     DUNGEON_DETAILS,
  temple:   DUNGEON_DETAILS,
  forest:   FOREST_DETAILS,
  wilderness: FOREST_DETAILS,
  mountain: MOUNTAIN_DETAILS,
  road:     ROAD_DETAILS,
  town:     ROAD_DETAILS,
  city:     ROAD_DETAILS,
  market:   ROAD_DETAILS,
};

// ---------------------------------------------------------------------------
// Dice Narration Templates
// ---------------------------------------------------------------------------

const DICE_NARRATION: Record<DiceDrama, string[]> = {
  critical_hit: [
    "Time seems to slow. Every muscle, every ounce of training converges into this single, perfect moment. Your strike lands with devastating precision — the kind of blow that bards write epics about. (Natural 20!)",
    "The dice tumbled, and fate itself held its breath. What follows is legend: a strike so clean, so powerful, that even the gods lean forward to watch. Critical hit!",
    "You feel it before you see it — the perfect alignment of angle, force, and destiny. Your weapon sings through the air and connects with earth-shaking force. NATURAL 20!",
  ],
  critical_miss: [
    "Sometimes the dice are cruel. Your foot catches on a loose stone, your grip slips, and what should have been a decisive moment becomes... deeply unfortunate. You stumble forward, entirely open. (Natural 1)",
    "In a performance that would be hilarious if it weren't so dangerous, you manage to trip over your own shadow. Your weapon clatters away, and for one terrible moment, you're defenseless. Natural 1!",
    "The universe, in its infinite comedy, decides this is the moment everything goes wrong. You swing — and miss so spectacularly that you nearly take out your own ally. The enemy actually pauses, confused. Natural 1.",
  ],
  high_success: [
    "Confidence flows through you. You don't just succeed — you make it look effortless. Whatever you attempted, you nailed it.",
    "A grin crosses your face as everything clicks into place. Success, and not just barely — you handle this with skill and style.",
  ],
  narrow_success: [
    "It's close. Too close. But somehow, some way, you pull it off. Just barely. By the skin of your teeth. Success... for now.",
    "You feel the strain, the near-miss, the razor-thin margin. But you did it. Don't count on being this lucky twice.",
  ],
  failure: [
    "It doesn't work. You gave it your best shot, but the dice — or fate, or the DM's cruel heart — say no. Time for plan B.",
    "Despite your best efforts, things don't go your way. The lock stays locked, the guard notices, the jump is just too far. Failure.",
  ],
  catastrophe: [
    "Not only did you fail — you made things worse. Significantly worse. The kind of worse that everyone at the table winces at.",
    "The DM leans back, taps their notes, and asks: 'Are you sure about that?' Too late. The consequences cascade. This is going to be a problem.",
  ],
  normal: [
    "The dice land. A middling result — neither triumph nor disaster. You proceed, as adventurers must.",
  ],
};

// ---------------------------------------------------------------------------
// DM Aside Templates
// ---------------------------------------------------------------------------

const DM_ASIDES: string[] = [
  "\n\n*[DM Aside: Rules note — you can use your bonus action for this, which means you still have your main action free.]*",
  "\n\n*[DM Aside: Quick reminder — you have a potion of healing in your inventory that you haven't used.]*",
  "\n\n*[DM Aside: For new players — a 'natural 20' on a skill check isn't technically an automatic success in 5e rules, but I'll make it awesome anyway.]*",
  "\n\n*[DM Aside: Your character would know that trolls regenerate. You've heard the stories. Fire or acid.]*",
  "\n\n*[DM Aside: You're currently in dim light, which gives you disadvantage on Perception checks. Just so you know.]*",
  "\n\n*[DM Aside: I'm ruling that this counts as a surprise round. You get advantage on your first attack.]*",
  "\n\n*[DM Aside: This NPC has a secret. You could try Insight to get a read on them.]*",
  "\n\n*[DM Aside: Fun fact — this dungeon was originally designed for a party one level higher than you. Good luck.]*",
];

// ---------------------------------------------------------------------------
// Pacing descriptions
// ---------------------------------------------------------------------------

const PACING_PROMPTS: Record<PacingMode, string> = {
  combat: "The action is fast and brutal. Keep descriptions punchy — quick sentences, visceral imagery. Every moment counts. Focus on the clash of steel, the spray of blood, the thunder of spells.",
  exploration: "Take your time. Paint the environment in rich detail. Let the player breathe and look around. Atmosphere is everything. Describe what they see, hear, smell, and feel.",
  roleplay: "This is the slow scene. Let the NPCs have depth. Give them opinions, body language, secrets. Let the dialogue breathe. Don't rush to the next plot point.",
  rest: "The tension releases. Describe the comfort — or the uneasy calm. A moment for reflection, for the characters to be people rather than adventurers. What do they think about in the quiet?",
  transition: "Bridge the gap between scenes. Describe the journey, the passage of time, the changing landscape. Let the world feel big and connected.",
};

// ---------------------------------------------------------------------------
// NPC Reaction Templates (other "players" at the table)
// ---------------------------------------------------------------------------

const NPC_REACTIONS: Record<string, string[]> = {
  critical_hit: [
    "\n\n@Grimjaw the fighter pounds the table. 'THAT'S how it's DONE!'",
    "\n\n@Elara the wizard peers over her spectacles. 'Adequate.' (She's impressed. She'd never admit it.)",
    "\n\n@Thistle the halfling leaps to his feet, cheering. 'I KNEW hiring them was a good idea!'",
  ],
  critical_miss: [
    "\n\n@Grimjaw the fighter winces visibly. '...I'm going to pretend I didn't see that.'",
    "\n\n@Elara the wizard sighs and starts preparing a shield spell. 'Don't worry. I anticipated... this.'",
    "\n\n@Thistle the halfling covers his eyes. 'Oh gods. Oh gods, that was bad.'",
  ],
  big_choice: [
    "\n\n@Grimjaw the fighter grunts. 'Your call. I'll follow either way.'",
    "\n\n@Elara the wizard looks thoughtful. 'There are... implications either way. Choose carefully.'",
    "\n\n@Thistle the halfling fidgets nervously. 'Whatever you decide, maybe decide fast?'",
  ],
  mystery: [
    "\n\n@Grimjaw the fighter scowls. 'I don't like this. I don't like any of this.'",
    "\n\n@Elara the wizard's eyes light up. 'Interesting. Very interesting. This changes everything.'",
    "\n\n@Thistle the halfling creeps closer to the group. 'Can we maybe investigate from a safe distance?'",
  ],
};

// ---------------------------------------------------------------------------
// TableFeel — exported functions
// ---------------------------------------------------------------------------

/** Get sensory details for a location type. */
export function getSensoryDetails(locationType: string): SensoryDetails {
  const normalized = locationType.toLowerCase();
  for (const [key, details] of Object.entries(LOCATION_DETAILS)) {
    if (normalized.includes(key)) return details;
  }
  return FOREST_DETAILS; // default
}

/** Build a sensory narration snippet (1-2 sentences) for a location. */
export function buildSensoryNarration(locationType: string): string {
  const details = getSensoryDetails(locationType);

  const sensePool: string[] = [];
  const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

  if (details.sights.length > 0) sensePool.push(`You notice ${pick(details.sights)}.`);
  if (details.sounds.length > 0) sensePool.push(`You hear ${pick(details.sounds)}.`);
  if (details.smells.length > 0) sensePool.push(`The air carries the scent of ${pick(details.smells)}.`);
  if (details.textures.length > 0) sensePool.push(`You feel ${pick(details.textures)}.`);

  // Pick 2-3 senses
  const count = 2 + Math.floor(Math.random() * 2);
  const selected = sensePool.sort(() => Math.random() - 0.5).slice(0, count);
  return selected.join(" ") + ` The atmosphere is ${details.atmosphere}.`;
}

/** Get a dice narration for a specific roll outcome. */
export function getDiceNarration(drama: DiceDrama): string {
  const templates = DICE_NARRATION[drama] ?? DICE_NARRATION.normal;
  return templates[Math.floor(Math.random() * templates.length)];
}

/** Classify a d20 roll into a drama level. */
export function classifyRoll(roll: number, dc: number): DiceDrama {
  if (roll === 20) return "critical_hit";
  if (roll === 1) return "critical_miss";
  if (roll >= dc + 10) return "high_success";
  if (roll >= dc && roll <= dc + 2) return "narrow_success";
  if (roll < dc && roll <= dc - 10) return "catastrophe";
  if (roll < dc) return "failure";
  return "normal";
}

/** Get a random DM aside. */
export function getDMAside(): string {
  return DM_ASIDES[Math.floor(Math.random() * DM_ASIDES.length)];
}

/** Maybe insert a DM aside (30% chance). */
export function maybeDMAside(): string {
  return Math.random() < 0.3 ? getDMAside() : "";
}

/** Get a pacing prompt for the DM personality. */
export function getPacingPrompt(mode: PacingMode): string {
  return PACING_PROMPTS[mode] ?? PACING_PROMPTS.exploration;
}

/** Determine pacing mode from player intent. */
export function inferPacingMode(intent: string): PacingMode {
  const lower = intent.toLowerCase();
  if (["attack", "cast_spell", "combat"].includes(lower)) return "combat";
  if (["rest", "sleep", "camp"].includes(lower)) return "rest";
  if (["talk", "speak", "ask", "persuade", "intimidate"].includes(lower)) return "roleplay";
  if (["move", "travel", "go"].includes(lower)) return "transition";
  return "exploration";
}

/** Get an NPC reaction for a dramatic moment. */
export function getNPCReaction(momentType: string): string {
  const reactions = NPC_REACTIONS[momentType];
  if (!reactions || reactions.length === 0) return "";
  return reactions[Math.floor(Math.random() * reactions.length)];
}

/** Build the full table-feel system prompt addition. */
export function buildTableFeelPrompt(pacingMode: PacingMode): string {
  return [
    "",
    "## Table Feel — Sensory DM",
    PACING_PROMPTS[pacingMode],
    "",
    "Always include at least one sensory detail beyond sight (smell, sound, texture, or taste).",
    "When dice are rolled: make the result narratively weighty. Natural 20s get epic descriptions. Natural 1s get humorous failures.",
    "Occasionally break the fourth wall with a 'DM aside' — a brief out-of-character note about rules, strategy, or table banter.",
    "Other characters at the table react to big moments. Give them brief, personality-driven reactions.",
    "",
  ].join("\n");
}
