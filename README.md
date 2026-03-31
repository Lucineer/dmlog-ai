# DMLog.ai — Your AI Dungeon Master

> **Every NPC remembers. Every choice matters. The world evolves.**

DMLog.ai is an AI-powered TTRPG platform where the repo IS the Dungeon Master. Built on the [cocapn](https://github.com/Lucineer/cocapn) paradigm — the agent lives in the repository, remembers across sessions, and evolves with your campaign.

## Why Repo-First for TTRPGs?

Traditional VTTs are tools. DMLog.ai is a **living Dungeon Master** that:

- **Remembers everything** — every NPC, location, battle, and choice persists in Git
- **Never contradicts itself** — world state consistency is enforced programmatically
- **Rolls fair dice** — crypto-secure randomness, verifiable and auditable
- **Adapts to you** — learns your play style and adjusts pacing, difficulty, and tone
- **Lives in the repo** — fork it, customize the soul, deploy your own DM

## Features

### Game System
- **Full dice system** — d4, d6, d8, d10, d12, d20, d100 with modifiers
- **Advantage/disadvantage** — roll twice, keep best/worst
- **Critical hits and fumbles** — nat 20 and nat 1 with dramatic effects
- **D&D 5e-inspired combat** — initiative, AC, HP, conditions, death saves
- **Character creation** — races, classes, ability scores, skills, equipment
- **Inventory system** — weapons, armor, potions, scrolls, magical items
- **Quest tracking** — objectives, rewards, quest chains, hidden objectives

### Living World
- **Persistent locations** — connected world map with dynamic descriptions
- **Day/night cycle** — time-aware descriptions and events
- **Weather system** — clear, rain, fog, storm, snow
- **NPC generation** — backstories, personalities, motivations, relationships
- **World history** — append-only log of all events for consistency
- **Campaign memory** — remembers player preferences and past sessions

### DM Personality (Pathos)
- **Configurable voice** — dramatic, humorous, grim, mysterious, casual
- **Dynamic tone** — adjusts based on scene (combat=tense, tavern=relaxed)
- **Narrative pacing** — balances action, roleplay, and exploration
- **Foreshadowing** — plants seeds for future events, callbacks to earlier ones
- **Cliffhangers** — natural session breaks with suspense

### Architecture

DMLog.ai uses a **Tripartite Architecture**:

| Layer | Name | Role |
|-------|------|------|
| **Pathos** | The DM | Personality, narrative voice, story generation |
| **Logos** | The World | State persistence, rules engine, consistency, memory |
| **Ethos** | The Action | Dice rolling, UI rendering, visual/audio effects |

## Quick Start

### 1. Fork and Clone

```bash
git clone https://github.com/YOUR_USERNAME/dmlog-ai.git
cd dmlog-ai
npm install
```

### 2. Configure

```bash
# Set your LLM API key (supports OpenAI, Anthropic, DeepSeek)
echo 'DEEPSEEK_API_KEY=your-key' > .dev.vars
# Or for OpenAI:
# echo 'OPENAI_API_KEY=your-key' > .dev.vars
```

### 3. Play

```bash
# Start local development
npx wrangler dev

# Open in browser
open http://localhost:8787
```

### 4. Deploy

```bash
# Deploy to Cloudflare Workers
npx wrangler deploy
```

## Game System Reference

### Dice Notation

| Input | Result |
|-------|--------|
| `d20` | Roll one 20-sided die |
| `2d6` | Roll two 6-sided dice, sum them |
| `2d6+3` | Roll 2d6 and add 3 |
| `4d6kh3` | Roll 4d6, keep highest 3 |
| `1d20adv` | Roll d20 with advantage |
| `1d20dis` | Roll d20 with disadvantage |

### Combat

- **Initiative**: d20 + DEX modifier
- **Attack**: d20 + proficiency + STR/DEX vs AC
- **Damage**: weapon dice + STR/DEX modifier
- **Critical**: natural 20 → double dice
- **Conditions**: blinded, charmed, deafened, frightened, grappled, incapacitated, invisible, paralyzed, petrified, poisoned, prone, restrained, stunned, unconscious

### Character Creation

**Ability Scores**: STR, DEX, CON, INT, WIS, CHA
- Modifier = floor((score - 10) / 2)
- Generated via standard array (15, 14, 13, 12, 10, 8), point buy, or 4d6 drop lowest

**Races**: Human, Elf, Dwarf, Halfling, Gnome, Half-Orc, Tiefling, Dragonborn

**Classes**: Fighter, Wizard, Rogue, Cleric, Ranger, Paladin, Bard, Sorcerer, Warlock, Monk, Druid, Barbarian

## DM Personality Customization

Edit `cocapn/soul.md` to customize your DM:

```markdown
---
name: your-dm-name
tone: dramatic, humorous, grim, mysterious, casual
avatar: 🎭
---

# I Am Your Dungeon Master

Your personality description here...
```

The soul.md file is the DM's personality. Edit it, commit it, and the DM changes. It's version-controlled personality.

## Campaign Management

### Creating a Campaign

Campaigns are stored in Cloudflare KV and version-controlled in Git.

```bash
# Campaign files live in cocapn/campaigns/
# Create a new campaign:
cocapn campaign create --name "My Campaign" --template starter
```

### Starter Campaign: Thornhaven Mystery

The default campaign set in the village of Thornhaven:
- **Hook**: Villagers disappearing, strange lights in the forest
- **NPCs**: Elder Mara, Finn the Blacksmith, Whisper, The Hooded Figure
- **Locations**: The Cracked Tankard, Elder's Hollow, The Whispering Woods, The Old Watchtower
- **Secrets**: The forest is alive (ancient treant), the lights are fey crossings

## Multi-Channel Play

DMLog.ai supports playing through multiple channels:

### Web (Default)
The full immersive experience at your deployed URL.

### Telegram
```bash
# Set your Telegram bot token
echo 'TELEGRAM_BOT_TOKEN=your-token' >> .dev.vars
# Set webhook: https://your-domain/api/channels/telegram
```

### Discord
```bash
# Set your Discord application credentials
echo 'DISCORD_PUBLIC_KEY=your-key' >> .dev.vars
echo 'DISCORD_BOT_TOKEN=your-token' >> .dev.vars
# Register commands: POST /api/channels/discord/register
```

## Pro DM Features

For professional Dungeon Masters who want to create and manage campaigns:

- **Custom rule sets** — override 5e defaults with homebrew rules
- **Campaign templates** — create reusable campaign structures
- **World building tools** — generate locations, NPCs, and quests
- **Session management** — track sessions, manage players, export summaries
- **A2A Protocol** — coordinate multiple campaigns in a shared world
- **Custom DM personality** — full control over narration style and voice

## API Reference

### Chat
```
POST /api/chat
Body: { campaignId: string, message: string, character?: Character }
Response: { narration: string, dice?: string, character?: Partial<Character>, npcs?: NPC[], quests?: Quest[] }
```

### Campaigns
```
POST /api/campaign          — Create campaign
GET  /api/campaign          — List campaigns
GET  /api/campaign/:id      — Get campaign state
DELETE /api/campaign/:id    — Delete campaign
```

### WebSocket
```
ws://host/ws
Send: { type: 'action', campaignId: string, message: string }
Receive: { type: 'narration'|'dice'|'state'|'system', content: any }
```

## A2A Protocol (Multi-Campaign)

DMLog.ai supports the Agent-to-Agent protocol for multi-campaign coordination:

- **World events** — broadcast events to connected campaigns
- **NPC migration** — NPCs can travel between campaigns
- **Cross-campaign trade** — players can trade items
- **Shared quests** — objectives that span multiple campaigns
- **Campaign health** — monitor session quality and player engagement

## Tech Stack

- **Runtime**: Cloudflare Workers (Edge)
- **Storage**: Cloudflare KV (world state, campaigns, sessions)
- **Language**: TypeScript (strict, ESM)
- **Frontend**: Vanilla HTML/CSS/JS (no build step)
- **Protocol**: cocapn (MCP + A2A)
- **LLM**: Multi-provider (OpenAI, Anthropic, DeepSeek, local)

## Contributing

1. Fork the repo
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'feat: add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

Commits by agentic workers use `Author: Superinstance`.

## License

MIT License — see [LICENSE](./LICENSE)

---

Built with [cocapn](https://github.com/Lucineer/cocapn) — the repo IS the agent.
