# CLAUDE.md — DMLog.ai Onboarding Guide

> **You are an AI coding assistant helping set up DMLog.ai.** Follow this guide step by step. The user has forked this repo and wants to get their AI Dungeon Master running live.

## What is DMLog.ai?

DMLog.ai is an AI-powered Dungeon Master that runs as a Cloudflare Worker. Players create campaigns, build characters, and play D&D-style adventures with an AI narrator. It's a complete TTRPG platform — not a chatbot wrapper.

**You own this.** You forked it, you deploy it, you run it. We just built the hull.

---

## Prerequisites

Before starting, the user needs:
1. **GitHub account** (free) — they already have this if they forked
2. **Cloudflare account** (free) — https://dash.cloudflare.com/sign-up
3. **At least one LLM API key** — see the Keys section below

---

## Step 1: Deploy to Cloudflare Workers

Run these commands in order. If one fails, read the error and fix it before continuing.

```bash
# Install Wrangler (Cloudflare's deploy tool)
npm install -g wrangler

# Log into Cloudflare (opens browser for auth)
npx wrangler login

# Deploy the worker
npx wrangler deploy
```

If deployment succeeds, you'll see a URL like:
```
https://dmlog-ai.your-subdomain.workers.dev
```

Open that URL. You should see the DMLog landing page. **Take a moment to celebrate.**

---

## Step 2: Add API Keys

DMLog.ai needs at least one LLM API key to generate narration. Without keys, it falls back to canned responses — functional but boring.

### How to add keys:

```bash
# DeepInfra (RECOMMENDED — best DM models, cheap)
npx wrangler secret put DEEPINFRA_API_KEY
# Paste your key from https://deepinfra.com/dashboard/keys
# Get a free key with $2 credit at https://deepinfra.com

# SiliconFlow (backup — Seed-OSS-36B is great for narration)
npx wrangler secret put SILICONFLOW_API_KEY
# Paste your key from https://cloud.siliconflow.cn

# DeepSeek (reliable fallback)
npx wrangler secret put DEEPSEEK_API_KEY
# Paste your key from https://platform.deepseek.com/api_keys
```

### Which models are used?

The system automatically picks the best available model:
1. **Seed-2.0-mini** (DeepInfra) — best D&D narration quality
2. **Step-3.5-Flash** (DeepInfra) — strong backup
3. **Seed-OSS-36B** (SiliconFlow) — third option
4. **Nemotron-120B** (DeepInfra) — creative tier
5. **DeepSeek-Chat** — reliable fallback
6. And 4 more fallbacks...

You don't need to configure which model. Just add keys and it figures out the rest.

### Verify keys are working:

```bash
curl https://dmlog-ai.your-subdomain.workers.dev/api/models
```

You should see `"active": "Seed-2.0-mini"` (or whichever model has a key).

### Free tier costs:

A typical D&D session uses ~50-100 messages. With Seed-2.0-mini on DeepInfra:
- Cost per message: ~$0.0001
- **A full session costs about $0.01**
- **A month of daily sessions costs about $0.30**
- DeepInfra gives $2 free credit — that's ~6 months of play

---

## Step 3: Configure Settings (Optional)

Edit `wrangler.toml` to customize:

```toml
# Change the worker name (affects URL)
name = "dmlog-ai"

# Add a custom domain (requires Cloudflare domain)
# routes = [{ pattern = "dmlog.yourdomain.com", custom_domain = true }]
```

After changing `wrangler.toml`, run `npx wrangler deploy` again.

---

## Step 4: Play!

Open your deployed URL and:

1. **Click "Start a Campaign"**
2. Choose a world theme (Fantasy, Sci-Fi, Horror, etc.)
3. Pick a class (Fighter, Wizard, Rogue, Cleric, Ranger)
4. Name your character
5. **Play!** The AI DM narrates, tracks HP, rolls dice, and responds to your choices

### For Dungeon Masters (your players):

Share your URL with players. Each player creates their own character in the same campaign. The DM (you) can:
- Set the world and NPCs
- Control narrative pacing
- Override AI decisions
- Use the `/api/chat` endpoint for programmatic control

---

## Step 5: Customize Your DM (Advanced)

### Change the DM's personality:

Edit the system prompt in `src/worker.ts`. Search for `DM_SYSTEM_PROMPT` or look in the `/api/chat` handler where messages are built. The first message to the LLM sets the DM's tone.

### Add your own content:

- **Worlds**: Edit `src/game/worlds.ts` or add world templates
- **NPCs**: Use the campaign API to create persistent NPCs
- **Homebrew rules**: Modify the dice roller and stat system
- **Images**: Configure FLUX.1-schnell for scene illustrations (needs SiliconFlow key)

### Connect to fleet events:

DMLog emits events to the fleet orchestrator. To enable:
```bash
npx wrangler secret put FLEET_ORCHESTRATOR_URL
# Value: https://fleet-orchestrator.your-subdomain.workers.dev
```

---

## Architecture Overview

```
dmlog-ai/
├── src/
│   ├── worker.ts          # Main entry — all routes, HTML, chat handler
│   ├── lib/
│   │   ├── model-router.ts # Multi-provider model selection with fallback
│   │   ├── knowledge-graph.ts # Crystal graph for session memory
│   │   ├── evaporation-pipeline.ts # Self-evaporation engine
│   │   ├── confidence-tracker.ts # Model confidence scoring
│   │   ├── structural-memory.ts # Cross-session pattern memory
│   │   └── cross-cocapn-bridge.ts # Fleet knowledge transfer
│   └── game/
│       ├── emotions.ts    # NPC relationship engine
│       ├── worlds.ts      # World templates
│       └── dice.ts        # Dice roller
├── wrangler.toml          # Cloudflare Workers config
├── CLAUDE.md              # THIS FILE — onboarding guide
└── README.md              # Project overview
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "A disturbance in the arcane weave" | No API keys set. Run Step 2. |
| `npx wrangler login` fails | Install wrangler first: `npm i -g wrangler` |
| Deployment succeeds but 404 | Check `wrangler.toml` has correct `main = "src/worker.ts"` |
| Models return empty | Some models need longer prompts to work. Check `/api/models` for active model. |
| Rate limited (429) | Free tier limits. Upgrade Cloudflare Workers plan or add cooldown. |
| Images not generating | Need `SILICONFLOW_API_KEY` for FLUX.1-schnell image generation |

---

## Costs

| Resource | Free Tier | Paid ($5/mo) |
|---|---|---|
| Workers requests | 100K/day | 10M/day |
| KV reads | 100K/day | 10M/day |
| KV writes | 1K/day | 1M/day |
| LLM API calls | Pay per model | Pay per model |

**Most DMs will never exceed free Cloudflare tier.** The cost is almost entirely LLM API usage (~$0.30/month).

---

## Getting Help

- **Docs**: https://docs.cocapn.ai
- **Fleet**: https://the-fleet.casey-digennaro.workers.dev
- **Issues**: Open a GitHub issue on this repo
- **Architecture papers**: https://github.com/Lucineer/capitaine/tree/master/docs

---

*DMLog.ai is part of The Fleet — a collection of AI-powered vessels built on the Cocapn platform.*

*Superinstance & Lucineer (DiGennaro et al.)*
