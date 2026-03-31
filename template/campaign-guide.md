# DMLog.ai -- Campaign Creation Guide

This guide teaches you how to create custom campaigns for DMLog.ai. A well-structured campaign gives the AI DM everything it needs to run immersive, consistent sessions.

---

## Campaign File Structure

Every campaign lives in `cocapn/campaigns/` as a Markdown file. The DM reads this file at session start to understand the world.

```
cocapn/campaigns/
  your-campaign.md
```

## Required Sections

Your campaign file must include these sections:

### 1. Overview

A short paragraph describing the setting, tone, and player level range. This is the first thing the DM reads.

```markdown
## Overview
Your description here. Include the setting, tone (serious, humorous, dark),
and the intended character level range (e.g., levels 1-5).
```

### 2. NPCs

Each NPC needs a name, role, personality, secret, and motivation. The DM uses these to roleplay consistently.

```markdown
### NPC Name
- **Role:** Their function in the story (merchant, villain, ally)
- **Personality:** 2-3 adjectives plus a notable behavior
- **Secret:** Something they hide (this drives plot twists)
- **Motivation:** What they want and why
```

Write at least 3 NPCs. More is better. Give each one a secret that connects to the main plot or a side quest.

### 3. Locations

Each location needs a name, description, points of interest, and atmosphere.

```markdown
### Location Name
A 2-3 sentence description of what the players see, hear, and smell.

- **Points of interest:** Specific things to interact with (a locked chest, a faded mural)
- **Atmosphere:** The emotional tone (tense, peaceful, eerie)
```

Write at least 3 locations. Include one safe haven (tavern, camp) and one dangerous area.

### 4. Quests

Each quest needs an objective, a lead (how players discover it), a complication, and at least two resolution options.

```markdown
### Quest Name (Levels X-Y)
**Objective:** What the players need to accomplish
- **Lead:** How the quest is introduced
- **Complication:** What makes it harder than expected
- **Resolution A:** One way to solve it
- **Resolution B:** An alternative path
```

Multiple resolution paths are key. The DM uses these to adapt to player choices without railroading.

## Optional Sections

### Secrets and Plot Twists

Numbered list of hidden truths that the DM reveals over time. Each secret should connect to an NPC, location, or quest.

```markdown
## Secrets and Plot Twists
1. The kindly shopkeeper is the villain's informant.
2. The ancient ruins are not ruins at all -- they are still occupied.
```

### Random Encounter Tables

Tables for different areas, using dice notation. The DM rolls these during travel or exploration.

```markdown
### In the Forest (d6)
| Roll | Encounter |
|------|-----------|
| 1-2 | A pack of wolves tracks the party. |
| 3   | A lost traveler asks for help. |
```

### Starting Hook

The opening scene. Write it as narrative prose -- the DM reads this to start the first session.

```markdown
## Starting Hook
"You arrive at the village gates as dusk falls. The guards eye you with..."
```

### Possible Endings

Describe 2-4 ways the campaign could conclude based on player choices. Label them (good, bittersweet, dark, ambiguous).

## Tips for Great Campaigns

1. **Write for the DM, not the players.** The campaign file is the DM's reference manual. Use clear, factual language. The DM will transform your notes into vivid narration.

2. **Connect everything.** NPCs should reference locations. Quests should involve NPCs. Secrets should link to quests. A tightly woven campaign is easier for the DM to run consistently.

3. **Embrace ambiguity.** Leave room for player agency. Instead of "the players go to the tower," write "the tower awaits on the mountain." Let the DM adapt to how players approach it.

4. **Provide alternatives.** Every quest should have at least two resolution paths. Every encounter should have a non-combat option. The DM is better at adaptation when you give it choices.

5. **Start small.** A focused campaign with 3 locations, 4 NPCs, and 2 quests is better than a sprawling one that lacks detail. You can always expand later.

6. **Test the hook.** Read your starting hook out loud. If it makes you want to know what happens next, it will work for players too.

## Example Campaign Template

Copy this structure and fill it in:

```markdown
# Campaign Title

## Overview
[Setting, tone, level range, 3-5 sentences]

## NPCs
### NPC 1
- **Role:**
- **Personality:**
- **Secret:**
- **Motivation:**

### NPC 2
[same structure]

## Locations
### Location 1
[Description, points of interest, atmosphere]

## Quests
### Quest 1 (Levels X-Y)
**Objective:**
- **Lead:**
- **Complication:**
- **Resolution A:**
- **Resolution B:**

## Secrets and Plot Twists
1. [Secret]

## Random Encounter Tables
### [Area Name] (dX)
| Roll | Encounter |
|------|-----------|
| 1    | ...       |

## Starting Hook
[Narrative opening, 2-3 paragraphs]

## Possible Endings
### Ending A: [Label]
[Description]
```

Save your campaign, start a session, and watch your world come alive.
