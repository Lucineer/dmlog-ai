/**
 * DMSoul: parses cocapn/soul.md into a DM personality configuration
 * Reads: name, tone, avatar from frontmatter
 * Compiles: full system prompt for LLM calls
 * Exports: DMSoul class with load(), compile(), getSystemPrompt()
 */

// --- Types ---

interface SoulFrontmatter {
  name: string;
  tone: string;
  avatar: string;
}

interface SoulSections {
  whatIKnow: string;
  myPromises: string;
  myStyle: string;
}

interface SoulConfig {
  frontmatter: SoulFrontmatter;
  sections: SoulSections;
  raw: string;
}

interface CampaignContext {
  campaignName: string;
  setting: string;
  playerNames: string[];
  currentScene: string;
  sessionNumber: number;
}

// --- Parser ---

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---/;
const SECTION_REGEX = /^## (.+)$/gm;

function parseFrontmatter(raw: string): SoulFrontmatter {
  const match = raw.match(FRONTMATTER_REGEX);
  if (!match) {
    return { name: 'DungeonMaster', tone: 'immersive, fair', avatar: '\u{1F3AD}' };
  }
  const body = match[1];
  const get = (key: string): string => {
    const line = body.split('\n').find((l) => l.startsWith(`${key}:`));
    return line ? line.slice(key.length + 1).trim() : '';
  };
  return {
    name: get('name') || 'DungeonMaster',
    tone: get('tone') || 'immersive, fair',
    avatar: get('avatar') || '\u{1F3AD}',
  };
}

function parseSections(raw: string): SoulSections {
  // Strip frontmatter
  const body = raw.replace(FRONTMATTER_REGEX, '').trim();

  const sections: Record<string, string> = {};
  const headingIndices: Array<{ title: string; index: number }> = [];

  let m: RegExpExecArray | null;
  while ((m = SECTION_REGEX.exec(body)) !== null) {
    headingIndices.push({ title: m[1].trim(), index: m.index });
  }

  for (let i = 0; i < headingIndices.length; i++) {
    const start = headingIndices[i].index + body.slice(headingIndices[i].index).indexOf('\n') + 1;
    const end = i + 1 < headingIndices.length ? headingIndices[i + 1].index : body.length;
    const title = headingIndices[i].title.toLowerCase().replace(/\s+/g, '_');
    sections[title] = body.slice(start, end).trim();
  }

  return {
    whatIKnow: sections['what_i_know'] ?? '',
    myPromises: sections['my_promises'] ?? '',
    myStyle: sections['my_style'] ?? '',
  };
}

// --- DMSoul ---

export class DMSoul {
  private config: SoulConfig | null = null;
  private systemPrompt: string | null = null;

  /**
   * Load and parse a soul.md file contents.
   */
  load(soulMd: string): void {
    const frontmatter = parseFrontmatter(soulMd);
    const sections = parseSections(soulMd);
    this.config = { frontmatter, sections, raw: soulMd };
    this.systemPrompt = null; // reset cached prompt
  }

  /**
   * Compile the soul into a full system prompt, optionally injecting campaign context.
   */
  compile(campaignContext?: CampaignContext): string {
    if (!this.config) {
      throw new Error('Soul not loaded. Call load() first.');
    }

    const { frontmatter, sections } = this.config;

    const parts: string[] = [];

    parts.push(`You are ${frontmatter.name}, a Dungeon Master for a tabletop roleplaying game.`);
    parts.push(`Your tone is: ${frontmatter.tone}.`);
    parts.push('');

    if (sections.whatIKnow) {
      parts.push('## What You Know');
      parts.push(sections.whatIKnow);
      parts.push('');
    }

    if (sections.myPromises) {
      parts.push('## Your Promises');
      parts.push(sections.myPromises);
      parts.push('');
    }

    if (sections.myStyle) {
      parts.push('## Your Style');
      parts.push(sections.myStyle);
      parts.push('');
    }

    if (campaignContext) {
      parts.push('## Current Campaign');
      parts.push(`Campaign: ${campaignContext.campaignName}`);
      parts.push(`Setting: ${campaignContext.setting}`);
      parts.push(`Players: ${campaignContext.playerNames.join(', ')}`);
      parts.push(`Current Scene: ${campaignContext.currentScene}`);
      parts.push(`Session: ${campaignContext.sessionNumber}`);
      parts.push('');
    }

    parts.push('Respond in character at all times. Stay consistent with established lore.');

    this.systemPrompt = parts.join('\n');
    return this.systemPrompt;
  }

  /**
   * Get the compiled system prompt. Compiles with no context if not yet compiled.
   */
  getSystemPrompt(campaignContext?: CampaignContext): string {
    if (!this.systemPrompt) {
      return this.compile(campaignContext);
    }
    return this.systemPrompt;
  }

  /** Get the parsed frontmatter. */
  getFrontmatter(): SoulFrontmatter | null {
    return this.config?.frontmatter ?? null;
  }

  /** Get the parsed sections. */
  getSections(): SoulSections | null {
    return this.config?.sections ?? null;
  }
}

// --- Re-export types ---
export type { SoulFrontmatter, SoulSections, SoulConfig, CampaignContext };
