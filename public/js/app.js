// DMLog.ai — Game Client
// Connects to DMLog worker via API and WebSocket

(function () {
  'use strict';

  const API_BASE = window.location.origin;
  const WS_URL = API_BASE.replace('http', 'ws') + '/ws';

  // State
  const state = {
    campaign: null,
    character: null,
    ws: null,
    rollHistory: [],
    activeTab: 'dice',
    sidebarOpen: null,
  };

  // DOM refs
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // ---- Initialization ----
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    setupTabs();
    setupDiceRoller();
    setupActionBar();
    setupMobileToggles();
    setupWebSocket();
    loadOrCreateCampaign();
    addSystemMessage('The world awaits your action...');
  }

  // ---- Campaign ----
  async function loadOrCreateCampaign() {
    try {
      const stored = localStorage.getItem('dmlog-campaign');
      if (stored) {
        const id = JSON.parse(stored).id;
        const res = await fetch(`${API_BASE}/api/campaign/${id}`);
        if (res.ok) {
          state.campaign = await res.json();
          updateUI();
          return;
        }
      }
      await createCampaign();
    } catch {
      // Offline mode — use local state
      state.campaign = createDefaultCampaign();
      updateUI();
    }
  }

  async function createCampaign() {
    const res = await fetch(`${API_BASE}/api/campaign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Thornhaven Mystery',
        template: 'starter',
        character: state.character,
      }),
    });
    if (res.ok) {
      state.campaign = await res.json();
      localStorage.setItem('dmlog-campaign', JSON.stringify({ id: state.campaign.id }));
      updateUI();
    }
  }

  function createDefaultCampaign() {
    return {
      id: crypto.randomUUID(),
      name: 'Thornhaven Mystery',
      character: {
        name: 'Adventurer',
        race: 'Human',
        class: 'Fighter',
        level: 1,
        hp: 10,
        maxHp: 10,
        ac: 16,
        speed: 30,
        str: 16, dex: 14, con: 15, int: 10, wis: 12, cha: 13,
        inventory: ['Longsword', 'Shield', 'Chain Mail', 'Explorer\'s Pack', 'Gold (10)'],
        abilities: ['Second Wind'],
      },
      location: 'Thornhaven Square',
      turn: 0,
    };
  }

  // ---- WebSocket ----
  function setupWebSocket() {
    try {
      const ws = new WebSocket(WS_URL);
      ws.onopen = () => console.info('[dmlog] WebSocket connected');
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data);
          handleWSMessage(msg);
        } catch { /* ignore non-JSON */ }
      };
      ws.onclose = () => {
        console.info('[dmlog] WebSocket closed, reconnecting in 3s...');
        setTimeout(setupWebSocket, 3000);
      };
      ws.onerror = () => ws.close();
      state.ws = ws;
    } catch {
      // WebSocket not available — use HTTP only
    }
  }

  function handleWSMessage(msg) {
    switch (msg.type) {
      case 'narration':
        addDMMessage(msg.content);
        break;
      case 'dice':
        addDiceMessage(msg.content);
        break;
      case 'state':
        if (msg.character) {
          state.campaign.character = { ...state.campaign.character, ...msg.character };
          updateCharacterSheet();
        }
        break;
      case 'system':
        addSystemMessage(msg.content);
        break;
    }
  }

  // ---- Send Action ----
  async function sendAction(text) {
    if (!text.trim()) return;

    addPlayerMessage(text);

    // Show loading
    const loadingEl = addLoading();

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          campaignId: state.campaign?.id,
          message: text,
          character: state.campaign?.character,
        }),
      });

      loadingEl.remove();

      if (res.ok) {
        const data = await res.json();
        if (data.narration) addDMMessage(data.narration);
        if (data.dice) addDiceMessage(data.dice);
        if (data.system) addSystemMessage(data.system);
        if (data.character) {
          state.campaign.character = { ...state.campaign.character, ...data.character };
          updateCharacterSheet();
        }
        if (data.npcs) updateNPCPanel(data.npcs);
        if (data.quests) updateQuestLog(data.quests);
      } else {
        addSystemMessage('The threads of fate tangle... (connection error)');
      }
    } catch {
      loadingEl.remove();
      // Offline fallback — local DM response
      addDMMessage(generateLocalNarration(text));
    }

    state.campaign.turn++;
  }

  function generateLocalNarration(input) {
    const lower = input.toLowerCase();
    if (lower.includes('attack') || lower.includes('fight') || lower.includes('strike')) {
      const roll = rollDie(20);
      return `You steel yourself and strike! The clash of steel rings through the air. ` +
        (roll >= 15 ? 'A solid hit — your foe staggers back!' : roll >= 10 ? 'You connect, drawing a line of crimson.' : 'Your attack goes wide, the enemy dodging at the last moment.') +
        ` (d20: ${roll})`;
    }
    if (lower.includes('look') || lower.includes('search') || lower.includes('examine')) {
      return 'You take a careful look around. The shadows seem to shift at the edges of your vision, and the air carries an unusual chill. Something about this place feels... ancient.';
    }
    if (lower.includes('talk') || lower.includes('speak') || lower.includes('say') || lower.includes('ask')) {
      return '"Ah, another soul brave enough to speak," a voice rasps from the gathering dark. "Tell me, traveler — what brings you to these troubled lands?"';
    }
    if (lower.includes('go') || lower.includes('move') || lower.includes('walk') || lower.includes('enter')) {
      return 'You press onward, your footsteps echoing against ancient stone. The path ahead splits — one way lit by flickering torchlight, the other swallowed by impenetrable shadow.';
    }
    return 'The Dungeon Master considers your action carefully... The world responds to your intent. Around you, the air hums with possibility, as if the very fabric of reality awaits your next move.';
  }

  // ---- Dice Rolling ----
  function setupDiceRoller() {
    const diceButtons = $$('.dice-btn');
    diceButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const sides = parseInt(btn.dataset.sides, 10);
        performRoll(sides);
      });
    });

    const customBtn = $('#custom-roll-btn');
    const customInput = $('#custom-roll-input');
    if (customBtn && customInput) {
      customBtn.addEventListener('click', () => {
        const notation = customInput.value.trim();
        if (notation) performCustomRoll(notation);
      });
      customInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') customBtn.click();
      });
    }

    // Advantage/disadvantage toggles
    $$('.advantage-toggle button').forEach((btn) => {
      btn.addEventListener('click', () => {
        $$('.advantage-toggle button').forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
  }

  function rollDie(sides) {
    const arr = new Uint32Array(1);
    crypto.getRandomValues(arr);
    return (arr[0] % sides) + 1;
  }

  function performRoll(sides) {
    const mode = getRollMode();
    let rolls, result;

    if (mode === 'advantage') {
      rolls = [rollDie(sides), rollDie(sides)];
      result = Math.max(...rolls);
    } else if (mode === 'disadvantage') {
      rolls = [rollDie(sides), rollDie(sides)];
      result = Math.min(...rolls);
    } else {
      rolls = [rollDie(sides)];
      result = rolls[0];
    }

    const isCrit = sides === 20 && result === 20;
    const isFumble = sides === 20 && result === 1;

    displayRollResult(result, rolls, sides, isCrit, isFumble);
    addRollHistory(result, `d${sides}`, rolls);
  }

  function performCustomRoll(notation) {
    const match = notation.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
    if (!match) {
      addSystemMessage('Invalid dice notation. Try: 2d6+3');
      return;
    }

    const count = parseInt(match[1], 10);
    const sides = parseInt(match[2], 10);
    const modifier = match[3] ? parseInt(match[3], 10) : 0;

    const rolls = [];
    for (let i = 0; i < count; i++) {
      rolls.push(rollDie(sides));
    }

    const sum = rolls.reduce((a, b) => a + b, 0) + modifier;
    const isCrit = sides === 20 && count === 1 && rolls[0] === 20;
    const isFumble = sides === 20 && count === 1 && rolls[0] === 1;

    displayRollResult(sum, rolls, sides, isCrit, isFumble, modifier);
    addRollHistory(sum, notation, rolls);
  }

  function getRollMode() {
    const active = document.querySelector('.advantage-toggle button.active');
    if (!active) return 'normal';
    if (active.dataset.mode === 'advantage') return 'advantage';
    if (active.dataset.mode === 'disadvantage') return 'disadvantage';
    return 'normal';
  }

  function displayRollResult(total, rolls, sides, isCrit, isFumble, modifier = 0) {
    const resultEl = $('#roll-result');
    if (!resultEl) return;

    resultEl.className = 'roll-result';
    if (isCrit) resultEl.classList.add('crit');
    if (isFumble) resultEl.classList.add('fumble');

    const detail = rolls.length > 1 || modifier !== 0
      ? `[${rolls.join(', ')}]${modifier !== 0 ? (modifier > 0 ? '+' : '') + modifier : ''} = ${total}`
      : `d${sides}`;

    resultEl.innerHTML = `
      <div class="total">${total}</div>
      <div class="detail">${detail}${isCrit ? ' — CRITICAL HIT!' : ''}${isFumble ? ' — CRITICAL FUMBLE!' : ''}</div>
    `;

    // Effect
    if (isCrit) triggerEffect('glow-gold', resultEl);
    if (isFumble) triggerEffect('shake', resultEl);

    // Also add to narrative
    const label = isCrit ? 'NATURAL 20!' : isFumble ? 'Natural 1...' : `Rolled ${total}`;
    addDiceMessage(`${label} [${rolls.join(', ')}] = ${total}`);
  }

  function addRollHistory(total, notation, rolls) {
    state.rollHistory.unshift({ total, notation, rolls, time: Date.now() });
    if (state.rollHistory.length > 10) state.rollHistory.pop();

    const historyEl = $('#roll-history');
    if (historyEl) {
      historyEl.innerHTML = state.rollHistory
        .map((r) => `<li>${r.notation}: ${r.total} [${r.rolls.join(', ')}]</li>`)
        .join('');
    }
  }

  // ---- Tabs ----
  function setupTabs() {
    $$('.tools-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        const target = tab.dataset.tab;
        $$('.tools-tab').forEach((t) => t.classList.remove('active'));
        $$('.tools-content').forEach((c) => c.classList.remove('active'));
        tab.classList.add('active');
        const content = $(`#tab-${target}`);
        if (content) content.classList.add('active');
        state.activeTab = target;
      });
    });
  }

  // ---- Action Bar ----
  function setupActionBar() {
    const input = $('#action-input');
    const sendBtn = $('#action-send');

    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const text = input.value.trim();
        if (text) {
          sendAction(text);
          input.value = '';
        }
      });
    }

    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendBtn.click();
        }
      });
    }

    $$('.quick-action').forEach((btn) => {
      btn.addEventListener('click', () => {
        const action = btn.dataset.action;
        const prompts = {
          attack: 'I attack ',
          search: 'I search the area carefully.',
          talk: 'I say, "',
          move: 'I move toward ',
          use: 'I use my ',
        };
        if (input) {
          input.value = prompts[action] || '';
          input.focus();
        }
      });
    });
  }

  // ---- Mobile ----
  function setupMobileToggles() {
    const charToggle = $('#toggle-character');
    const toolsToggle = $('#toggle-tools');

    if (charToggle) {
      charToggle.addEventListener('click', () => {
        toggleSidebar('character');
      });
    }

    if (toolsToggle) {
      toolsToggle.addEventListener('click', () => {
        toggleSidebar('tools');
      });
    }
  }

  function toggleSidebar(which) {
    const panel = which === 'character' ? $('.character-panel') : $('.tools-panel');
    if (!panel) return;

    if (state.sidebarOpen === which) {
      panel.classList.remove('open');
      state.sidebarOpen = null;
    } else {
      $$('.character-panel, .tools-panel').forEach((p) => p.classList.remove('open'));
      panel.classList.add('open');
      state.sidebarOpen = which;
    }
  }

  // ---- Message Display ----
  function addDMMessage(text) {
    const scroll = $('#narrative-scroll');
    if (!scroll) return;

    const el = document.createElement('div');
    el.className = 'message message-dm';
    el.innerHTML = `<div class="speaker">Dungeon Master</div>${highlightEntities(text)}`;
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
  }

  function addPlayerMessage(text) {
    const scroll = $('#narrative-scroll');
    if (!scroll) return;

    const el = document.createElement('div');
    el.className = 'message message-player';
    el.textContent = text;
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
  }

  function addSystemMessage(text) {
    const scroll = $('#narrative-scroll');
    if (!scroll) return;

    const el = document.createElement('div');
    el.className = 'message message-system';
    el.textContent = text;
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
  }

  function addDiceMessage(text) {
    const scroll = $('#narrative-scroll');
    if (!scroll) return;

    const el = document.createElement('div');
    el.className = 'message message-dice';
    el.textContent = text;
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
  }

  function addLoading() {
    const scroll = $('#narrative-scroll');
    if (!scroll) return document.createElement('div');

    const el = document.createElement('div');
    el.className = 'message message-system';
    el.innerHTML = '<span class="loading"></span> The Dungeon Master contemplates...';
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
    return el;
  }

  function highlightEntities(text) {
    return text
      .replace(/\*\*([^*]+)\*\*/g, '<span class="entity-npc">$1</span>')
      .replace(/\*([^*]+)\*/g, '<span class="entity-location">$1</span>')
      .replace(/\[([^\]]+)\]/g, '<span class="entity-item">[$1]</span>');
  }

  // ---- Effects ----
  function triggerEffect(type, el) {
    const cls = `effect-${type}`;
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), 1000);
  }

  // ---- UI Updates ----
  function updateUI() {
    updateCharacterSheet();
    if (state.campaign?.location) {
      addSystemMessage(`You find yourself in ${state.campaign.location}.`);
    }
  }

  function updateCharacterSheet() {
    const c = state.campaign?.character;
    if (!c) return;

    const nameEl = $('#char-name');
    if (nameEl) nameEl.textContent = c.name;

    const subtitleEl = $('#char-subtitle');
    if (subtitleEl) subtitleEl.textContent = `Level ${c.level} ${c.race} ${c.class}`;

    // Ability scores
    const abilities = ['str', 'dex', 'con', 'int', 'wis', 'cha'];
    abilities.forEach((ab) => {
      const el = $(`#abil-${ab}`);
      if (el && c[ab] !== undefined) {
        const mod = Math.floor((c[ab] - 10) / 2);
        el.querySelector('.value').textContent = c[ab];
        el.querySelector('.modifier').textContent = mod >= 0 ? `+${mod}` : mod;
      }
    });

    // HP
    const hpFill = $('#hp-fill');
    if (hpFill) {
      const pct = Math.max(0, Math.min(100, (c.hp / c.maxHp) * 100));
      hpFill.style.width = `${pct}%`;
      hpFill.className = 'hp-fill ' + (pct > 60 ? 'high' : pct > 30 ? 'medium' : 'low');
    }
    const hpText = $('#hp-text');
    if (hpText) hpText.textContent = `${c.hp} / ${c.maxHp}`;

    // AC
    const acEl = $('#stat-ac');
    if (acEl) acEl.textContent = c.ac;

    // Inventory
    const invList = $('#inventory-list');
    if (invList && c.inventory) {
      invList.innerHTML = c.inventory.map((item) => `<li class="inventory-item">${item}</li>`).join('');
    }

    // Abilities
    const abilityList = $('#ability-list');
    if (abilityList && c.abilities) {
      abilityList.innerHTML = c.abilities.map((a) => `<li class="inventory-item">${a}</li>`).join('');
    }
  }

  function updateNPCPanel(npcs) {
    const container = $('#npc-list');
    if (!container || !npcs) return;
    container.innerHTML = npcs.map((npc) => `
      <div class="npc-card">
        <span class="npc-relation ${npc.relation}">${npc.relation}</span>
        <div class="npc-name">${npc.name}</div>
        <div class="npc-race">${npc.race}${npc.occupation ? ' — ' + npc.occupation : ''}</div>
      </div>
    `).join('');
  }

  function updateQuestLog(quests) {
    const container = $('#quest-list');
    if (!container || !quests) return;
    container.innerHTML = quests.map((q) => `
      <div class="quest-card ${q.status === 'complete' ? 'completed' : ''}">
        <div class="quest-title">${q.title}</div>
        <div class="quest-desc">${q.description}</div>
        <div class="quest-progress">
          <div class="quest-progress-fill" style="width: ${(q.progress || 0)}%"></div>
        </div>
      </div>
    `).join('');
  }
})();
