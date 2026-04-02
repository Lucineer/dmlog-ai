// DMLog.ai API Client
class DMLogAPI {
    constructor(baseURL = '') {
        this.baseURL = baseURL;
        this.headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    // Campaigns
    async listCampaigns() {
        return this._fetch('/api/campaigns');
    }

    async createCampaign(name, system = 'custom') {
        return this._fetch('/api/campaigns', 'POST', { name, system });
    }

    async getCampaign(id) {
        return this._fetch(`/api/campaigns/${id}`);
    }

    async deleteCampaign(id) {
        return this._fetch(`/api/campaigns/${id}`, 'DELETE');
    }

    async setPhase(campaignId, phase) {
        return this._fetch(`/api/campaigns/${campaignId}/phase`, 'POST', { phase });
    }

    async getPhase(campaignId) {
        return this._fetch(`/api/campaigns/${campaignId}/phase`);
    }

    // Notes
    async addNote(campaignId, content, type = 'general') {
        return this._fetch(`/api/campaigns/${campaignId}/notes`, 'POST', { content, type });
    }

    async listNotes(campaignId) {
        return this._fetch(`/api/campaigns/${campaignId}/notes`);
    }

    // World Ideas
    async addWorldIdea(campaignId, idea, category = 'lore') {
        return this._fetch(`/api/campaigns/${campaignId}/world-ideas`, 'POST', { idea, category });
    }

    async listWorldIdeas(campaignId) {
        return this._fetch(`/api/campaigns/${campaignId}/world-ideas`);
    }

    async canonizeIdea(campaignId, ideaId) {
        return this._fetch(`/api/campaigns/${campaignId}/world-ideas/${ideaId}/canonize`, 'POST');
    }

    // Sessions
    async startSession(campaignId, title) {
        return this._fetch(`/api/campaigns/${campaignId}/sessions`, 'POST', { title });
    }

    async endSession(campaignId, sessionId) {
        return this._fetch(`/api/campaigns/${campaignId}/sessions/${sessionId}/end`, 'POST');
    }

    async addTranscript(campaignId, sessionId, transcript) {
        return this._fetch(`/api/campaigns/${campaignId}/sessions/${sessionId}/transcript`, 'POST', { transcript });
    }

    async addHighlight(campaignId, sessionId, highlight) {
        return this._fetch(`/api/campaigns/${campaignId}/sessions/${sessionId}/highlights`, 'POST', { highlight });
    }

    async addCombat(campaignId, sessionId, combatData) {
        return this._fetch(`/api/campaigns/${campaignId}/sessions/${sessionId}/combat`, 'POST', combatData);
    }

    // Player Twins
    async createPlayerTwin(campaignId, playerData) {
        return this._fetch(`/api/campaigns/${campaignId}/player-twins`, 'POST', playerData);
    }

    async listPlayerTwins(campaignId) {
        return this._fetch(`/api/campaigns/${campaignId}/player-twins`);
    }

    // Simulations
    async runSimulation(campaignId, scenario) {
        return this._fetch(`/api/campaigns/${campaignId}/simulations`, 'POST', { scenario });
    }

    async listSimulations(campaignId) {
        return this._fetch(`/api/campaigns/${campaignId}/simulations`);
    }

    // World Build
    async startWorldBuild(campaignId, concept) {
        return this._fetch(`/api/campaigns/${campaignId}/world-build`, 'POST', { concept });
    }

    async siftWorldBuild(campaignId, buildId, feedback) {
        return this._fetch(`/api/campaigns/${campaignId}/world-build/${buildId}/sift`, 'POST', { feedback });
    }

    // Scene
    async getScene(campaignId) {
        return this._fetch(`/api/campaigns/${campaignId}/scene`);
    }

    async createScene(campaignId, sceneData) {
        return this._fetch(`/api/campaigns/${campaignId}/scene`, 'POST', sceneData);
    }

    async addSceneElement(campaignId, element) {
        return this._fetch(`/api/campaigns/${campaignId}/scene/elements`, 'POST', element);
    }

    async recordSceneAction(campaignId, action) {
        return this._fetch(`/api/campaigns/${campaignId}/scene/actions`, 'POST', action);
    }

    async getVisualPrompt(campaignId) {
        return this._fetch(`/api/campaigns/${campaignId}/scene/visual-prompt`);
    }

    // Assets
    async listAssets(campaignId) {
        return this._fetch(`/api/campaigns/${campaignId}/assets`);
    }

    async getAsset(campaignId, assetId) {
        return this._fetch(`/api/campaigns/${campaignId}/assets/${assetId}`);
    }

    async searchAssets(campaignId, query) {
        return this._fetch(`/api/campaigns/${campaignId}/assets/search?q=${encodeURIComponent(query)}`);
    }

    async generateAsset(campaignId, prompt) {
        return this._fetch(`/api/campaigns/${campaignId}/assets/generate`, 'POST', { prompt });
    }

    // Image Generation
    async generateImage(prompt, style = 'fantasy') {
        return this._fetch('/api/images/generate', 'POST', { prompt, style });
    }

    // Streaming Chat
    async sendChat(campaignId, message, characterId = null, onChunk = null, onDone = null, onError = null) {
        const response = await fetch(`${this.baseURL}/api/campaigns/${campaignId}/chat`, {
            method: 'POST',
            headers: this.headers,
            body: JSON.stringify({ message, characterId })
        });

        if (!response.ok) {
            onError?.(new Error(`HTTP ${response.status}`));
            return;
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        try {
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop() || '';

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const data = line.slice(6);
                        if (data === '[DONE]') {
                            onDone?.();
                            return;
                        }
                        try {
                            const parsed = JSON.parse(data);
                            onChunk?.(parsed);
                        } catch (e) {
                            console.warn('Failed to parse SSE data:', data);
                        }
                    }
                }
            }
        } catch (error) {
            onError?.(error);
        }
    }

    // Internal fetch helper
    async _fetch(endpoint, method = 'GET', data = null) {
        const options = {
            method,
            headers: this.headers
        };

        if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(data);
        }

        const response = await fetch(`${this.baseURL}${endpoint}`, options);
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }

        return response.json();
    }
}

// State Management
class DMLogState {
    constructor() {
        this.currentCampaign = null;
        this.campaigns = [];
        this.phase = null;
        this.sessions = [];
        this.worldIdeas = [];
        this.playerTwins = [];
        this.simulations = [];
        this.scene = null;
        this.assets = [];
        this._events = {};
        this.api = new DMLogAPI();
    }

    // Event System
    on(event, callback) {
        if (!this._events[event]) this._events[event] = [];
        this._events[event].push(callback);
    }

    off(event, callback) {
        if (!this._events[event]) return;
        this._events[event] = this._events[event].filter(cb => cb !== callback);
    }

    _emit(event, data) {
        if (!this._events[event]) return;
        this._events[event].forEach(callback => callback(data));
    }

    // Load Methods
    async loadCampaigns() {
        this.campaigns = await this.api.listCampaigns();
        this._save();
        return this.campaigns;
    }

    async loadWorldIdeas(campaignId) {
        this.worldIdeas = await this.api.listWorldIdeas(campaignId);
        this._save();
        return this.worldIdeas;
    }

    async loadSessions(campaignId) {
        this.sessions = await this.api.listSessions?.(campaignId) || [];
        this._save();
        return this.sessions;
    }

    async loadTwins(campaignId) {
        this.playerTwins = await this.api.listPlayerTwins(campaignId);
        this._save();
        return this.playerTwins;
    }

    async loadSimulations(campaignId) {
        this.simulations = await this.api.listSimulations(campaignId);
        this._save();
        return this.simulations;
    }

    async loadScene(campaignId) {
        this.scene = await this.api.getScene(campaignId);
        this._save();
        return this.scene;
    }

    async loadAssets(campaignId) {
        this.assets = await this.api.listAssets(campaignId);
        this._save();
        return this.assets;
    }

    // Campaign Selection
    async selectCampaign(campaignId) {
        const campaign = this.campaigns.find(c => c.id === campaignId);
        if (!campaign) throw new Error('Campaign not found');
        
        this.currentCampaign = campaign;
        this._emit('campaign-selected', campaign);
        
        // Load related data
        await Promise.all([
            this.loadWorldIdeas(campaignId),
            this.loadSessions(campaignId),
            this.loadTwins(campaignId),
            this.loadSimulations(campaignId),
            this.loadScene(campaignId),
            this.loadAssets(campaignId)
        ]);
        
        this._save();
    }

    // Auto-save to localStorage
    _save() {
        try {
            localStorage.setItem('dmlog_state', JSON.stringify({
                currentCampaign: this.currentCampaign,
                campaigns: this.campaigns
            }));
        } catch (e) {
            console.warn('Failed to save state to localStorage:', e);
        }
    }

    load() {
        try {
            const saved = localStorage.getItem('dmlog_state');
            if (saved) {
                const data = JSON.parse(saved);
                this.currentCampaign = data.currentCampaign;
                this.campaigns = data.campaigns || [];
            }
        } catch (e) {
            console.warn('Failed to load state from localStorage:', e);
        }
    }
}

// Utility Functions
const DMLogUtils = {
    formatTimestamp(ts) {
        const date = new Date(ts);
        return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    },

    diceRoll(sides = 20) {
        const roll = Math.floor(Math.random() * sides) + 1;
        
        // Animation suggestion
        setTimeout(() => {
            const event = new CustomEvent('dice-rolled', { 
                detail: { roll, sides, critical: roll === sides, fumble: roll === 1 }
            });
            document.dispatchEvent(event);
        }, 100);
        
        return roll;
    },

    async createCampaign(name, system = 'custom') {
        const state = window.dmlogState || new DMLogState();
        const campaign = await state.api.createCampaign(name, system);
        
        state.campaigns.push(campaign);
        await state.selectCampaign(campaign.id);
        
        // Navigate to dashboard
        window.location.hash = `#/campaign/${campaign.id}/dashboard`;
        
        return campaign;
    }
};

// Global instance
window.dmlogAPI = new DMLogAPI();
window.dmlogState = new DMLogState();
window.dmlogUtils = DMLogUtils;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    window.dmlogState.load();
});