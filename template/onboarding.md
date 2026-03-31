# DMLog.ai -- New DM Setup Guide

Welcome to DMLog.ai, your AI-powered Dungeon Master. This guide walks you through setting up your first campaign from scratch. No prior TTRPG experience required.

---

## Step 1: Create Your Account

1. Visit dmlog.ai and sign up with your email or Discord account.
2. Choose a username. This is your DM identity across all campaigns.
3. You will receive a private brain repo. This stores your DM personality, campaign data, and session history. It is yours alone.

## Step 2: Choose a Platform

DMLog.ai works wherever your players are:

- **Web** -- Play directly in the browser at dmlog.ai/play. Best for new groups.
- **Discord** -- Add the DMLog bot to your server. Slash commands drive the game. Thread-based sessions keep things organized.
- **Telegram** -- Start a private chat with the DMLog bot. Great for solo play or small groups on mobile.

Pick one to start. You can connect all three later.

## Step 3: Pick a Campaign

You have two options:

**A. Use the starter campaign.** "The Shadows of Thornhaven" is a complete adventure for 3-5 players, levels 1-4. It includes pre-built NPCs, locations, encounters, and multiple endings. Recommended for your first session.

**B. Create your own.** If you have a world in mind, skip to the Campaign Creation Guide. You can start from scratch or use a template (high fantasy, sci-fi, horror, modern supernatural).

## Step 4: Invite Your Players

Share the campaign link with your group. Each player:

1. Creates a free account (or joins as a guest for web play).
2. Creates a character using the guided builder or imports a D&D Beyond sheet.
3. Joins the campaign session.

For Discord/Telegram, players simply type in the channel or chat.

## Step 5: Run Your First Session

1. Open the campaign and click **Start Session**.
2. The AI DM narrates the opening scene.
3. Players describe their actions in natural language.
4. The DM responds with narrative, skill checks, and consequences.
5. Combat is handled with dice rolls (type `/roll 1d20` or click the roll button).

Tips for your first session:
- Let the DM lead. It will pace the story and call for rolls.
- Encourage players to describe what they want to do, not what dice to roll.
- Use the quick action buttons (Attack, Search, Talk, Move) for common actions.
- The DM remembers everything. If you mention a detail, it stays in the world.

## Step 6: Between Sessions

After each session, the DM automatically:

- Updates the campaign journal with key events.
- Adjusts encounter difficulty based on party performance.
- Develops NPCs based on player interactions.
- Tracks quest progress and suggests next steps.

You can review and edit any of this in the Campaign Dashboard.

## Step 7: Customize Your DM

Edit `cocapn/soul.md` to change your DM's personality:

```yaml
---
name: YourDMName
tone: your preferred tone
avatar: your chosen emoji
---
```

Write new sections for what your DM knows, promises, and their style. The DM reads this file every session and adapts accordingly.

---

## Getting Help

- Type `/help` in any channel for available commands.
- Visit dmlog.ai/docs for the full reference.
- Join the community Discord for tips from other DMs and players.

Now go tell a story. Your players are waiting.
