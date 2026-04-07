<p align="center">
  <img src="https://raw.githubusercontent.com/Lucineer/capitaine/master/docs/capitaine-logo.jpg" alt="Capitaine" width="120">
</p>

<h1 align="center">dmlog-ai</h1>

<p align="center">An AI assistant for TTRPG campaigns that retains session context. Handles character tracking, dice rolls, and campaign notes.</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> ·
  <a href="#features">Features</a> ·
  <a href="#limitations">Limitations</a> ·
  <a href="https://github.com/Lucineer/dmlog-ai/issues">Issues</a>
</p>

---

**Live Example:** [dmlog-ai.casey-digennaro.workers.dev](https://dmlog-ai.casey-digennaro.workers.dev)

You run a session. Next week, you can't recall what the bard promised the lighthouse keeper. This tool helps with that. It stores campaign details and session history, so you can pause and resume.

dmlog-ai retains campaign context across sessions by storing notes and history in your own Cloudflare Worker. It handles dice rolls and basic character stat management. It is not a full AI game engine, but a persistent assistant for your table.

### What This Is
This is an open-source, self-hosted agent you fork and deploy. Your campaign data stays in your Cloudflare account. You can modify the code or stop using it at any time without losing access.

### How It Works
- You fork this repository and deploy it as a Cloudflare Worker.
- Campaign state is stored in your Worker's KV storage.
- The assistant uses your provided LLM API key (like DeepSeek) to generate responses.
- Dice rolls use a cryptographically secure random function.

---

## Quick Start

```bash
# Fork this repository first, then clone your fork.
git clone https://github.com/YOUR_USERNAME/dmlog-ai
cd dmlog-ai
npx wrangler login
npx wrangler secret put GITHUB_TOKEN # Your GitHub token
npx wrangler secret put DEEPSEEK_API_KEY # Or another supported key
npx wrangler deploy
```

Visit your deployed Worker URL. Your instance is running.

## Features

- **Self-hosted Memory:** Session history and campaign notes are stored in your Cloudflare KV.
- **Multi-Model Support:** Works with DeepSeek, SiliconFlow, and other OpenAI-compatible endpoints.
- **Dice Rolling:** Handles standard dice notation (e.g., 1d20+5) with fair randomization.
- **Basic Rate Limiting:** Configurable request limits per IP for public sharing.
- **Health Endpoint:** Includes a standard `/health` endpoint for monitoring.

## Limitations

Campaign memory is stored in Cloudflare KV, which has a 1GB limit per namespace and eventual consistency. For extremely long campaigns with vast logs, you may need to implement archival.

---

<div align="center">
  <p>
    <a href="https://the-fleet.casey-digennaro.workers.dev">The Fleet</a> ·
    <a href="https://cocapn.ai">Cocapn.ai</a>
  </p>
  <p>Attribution: Superinstance & Lucineer (DiGennaro et al.). MIT Licensed.</p>
</div>