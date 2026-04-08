# dmlog-ai 🎲

A quiet table assistant that remembers your campaign details, so you don’t have to. It does not run your game—it just takes notes and answers when asked.

**Live Demo:** [dmlog-ai.casey-digennaro.workers.dev](https://dmlog-ai.casey-digennaro.workers.dev)

---

## Why It Exists

Many TTRPG tools either lock your data, lose context, or try to take over. This one sits quietly: it takes notes during sessions and lets you query them later, nothing more.

---

## How It Is Different

1.  **Fork-first, no central server.** You deploy your own copy. You own every part.
2.  **Zero lock‑in.** All campaign history is stored as plain text in Cloudflare KV. Export or delete it anytime.
3.  **Zero runtime dependencies.** Runs entirely on Cloudflare Workers. No hidden servers, databases, or personal‑use bills.

---

## Quick Start

Deploy your own private copy in about two minutes:

1.  Fork this repository.
2.  Clone your fork, then run:
    ```bash
    cd dmlog-ai
    npx wrangler login
    npx wrangler secret put GITHUB_TOKEN
    npx wrangler secret put DEEPSEEK_API_KEY
    npx wrangler deploy
    ```
3.  Visit the URL shown after deployment. That’s your instance.

---

## Features

-   Session memory that persists across your campaign
-   Compatible with DeepSeek, OpenAI, and any OpenAI‑compatible LLM endpoint
-   Cryptographically fair dice roller (standard notation like `2d20+4`)
-   Optional public sharing with per‑IP rate limiting
-   Works for in‑person or remote tables; no accounts required
-   Simple `/health` endpoint for uptime checks

---

## Limitations

Cloudflare KV is used for storage. Each namespace is limited to 10MB, which holds roughly 200–300 pages of typical campaign notes. If you exceed this, you will need to archive or export older sessions.

---

## Usage

Designed for personal or small‑group use. Cloudflare’s free tier covers typical home campaigns. No tracking, no telemetry. Open source under the MIT license.

<div style="text-align:center;padding:16px;color:#64748b;font-size:.8rem"><a href="https://the-fleet.casey-digennaro.workers.dev" style="color:#64748b">The Fleet</a> &middot; <a href="https://cocapn.ai" style="color:#64748b">Cocapn</a></div>

---

<i>Built with [Cocapn](https://github.com/Lucineer/cocapn-ai) — the open-source agent runtime.</i>
<i>Part of the [Lucineer fleet](https://github.com/Lucineer)</i>

