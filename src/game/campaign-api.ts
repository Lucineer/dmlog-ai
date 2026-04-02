import {
    CampaignManager,
    CampaignPhase,
    type WorldIdea,
    type PlayerTwin,
    type SimulationResult,
    type SessionRecord,
    type CombatRecord,
    type CampaignNote
} from './campaign';
import { SceneManager, type SceneState, type SceneElement } from './scene-state';
import { WorldBuilder, type WorldBuildConfig, type WorldBuildSession } from './world-builder';

// --- Environment and KV Namespace Types ---

export interface Env {
    /**
     * KV Namespace for campaign lifecycle and state.
     */
    WORLD_STATE: KVNamespace;
    CAMPAIGNS: KVNamespace;
    SESSIONS: KVNamespace;
    /**
     * KV Namespace for world-building sessions.
     * Note: The prompt uses WORLD_STATE and SESSIONS, but the key structure
     * `campaign:{id}:worldbuild:{sessionId}` suggests a single campaign-focused
     * namespace is sufficient. We'll use CAMPAIGNS for all campaign data.
     */
    // WORLD_STATE: KVNamespace;
    // SESSIONS: KVNamespace;
}

// --- Helper Functions ---

/**
 * Generates standard CORS headers for API responses.
 */
function corsHeaders(): HeadersInit {
    return {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Content-Type': 'application/json',
    };
}

const FANTASY_ERRORS: Record<string, { message: string }> = {
    'no_campaign': { message: "The ancient scrolls of this campaign could not be found." },
    'bad_request': { message: "A mischievous sprite has scrambled your request." },
    'not_found': { message: "You search the archives, but the requested tome is missing." },
    'internal': { message: "A powerful curse has befallen the server's inner workings." },
    'bad_phase': { message: "The stars are not aligned for such an action in this phase." },
    'bad_session': { message: "The session you speak of is but a fleeting memory or has not yet begun." },
};

/**
 * Creates a JSON error response with fantasy-themed messaging.
 * @param status - The HTTP status code.
 * @param key - The key for the error message.
 */
function errorResponse(status: number, key: string): Response {
    const error = FANTASY_ERRORS[key] || FANTASY_ERRORS['internal'];
    return new Response(JSON.stringify({ error: error.message }), {
        status,
        headers: corsHeaders(),
    });
}

/**
 * Generates a new unique identifier.
 */
function generateId(): string {
    return crypto.randomUUID() || "id-" + Math.random().toString(36).slice(2);
}

// --- Route Handling Logic ---

type RouteHandler = (
    request: Request,
    env: Env,
    params: Record<string, string>
) => Promise<Response>;

const routes: { method: string; pattern: URLPattern; handler: RouteHandler }[] = [
    // Campaign Lifecycle
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/phase' }), handler: setCampaignPhase },
    { method: 'GET', pattern: new URLPattern({ pathname: '/api/campaign/:id/phase' }), handler: getCampaignPhase },
    
    // Conception & Notes
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/notes' }), handler: addConceptionNote },
    { method: 'GET', pattern: new URLPattern({ pathname: '/api/campaign/:id/notes' }), handler: getConceptionNotes },
    
    // World Building Ideas
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/world-ideas' }), handler: addWorldIdea },
    { method: 'GET', pattern: new URLPattern({ pathname: '/api/campaign/:id/world-ideas' }), handler: getWorldIdeas },
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/world-ideas/:ideaId/canonize' }), handler: canonizeWorldIdea },
    
    // Game Sessions
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/session/start' }), handler: startSession },
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/session/:sessionId/end' }), handler: endSession },
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/session/:sessionId/transcript' }), handler: addSessionTranscript },
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/session/:sessionId/highlight' }), handler: addSessionHighlight },
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/session/:sessionId/combat' }), handler: addSessionCombatRecord },

    // Player Twins & Simulation
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/twins/create' }), handler: createPlayerTwin },
    { method: 'GET', pattern: new URLPattern({ pathname: '/api/campaign/:id/twins' }), handler: getPlayerTwins },
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/simulate' }), handler: runSimulation },
    { method: 'GET', pattern: new URLPattern({ pathname: '/api/campaign/:id/simulations' }), handler: getSimulations },

    // Automated World Building
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/world-build' }), handler: startWorldBuild },
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/world-build/:sessionId/sift' }), handler: siftWorldBuild },

    // Scene Management
    { method: 'GET', pattern: new URLPattern({ pathname: '/api/campaign/:id/scene' }), handler: getScene },
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/scene' }), handler: createScene },
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/scene/element' }), handler: addSceneElement },
    { method: 'POST', pattern: new URLPattern({ pathname: '/api/campaign/:id/scene/action' }), handler: recordSceneAction },
    { method: 'GET', pattern: new URLPattern({ pathname: '/api/campaign/:id/scene/visual-prompt' }), handler: getSceneVisualPrompt },
];

/**
 * Main entry point for handling all campaign API routes.
 * @param path - The request path.
 * @param request - The incoming request object.
 * @param env - The Cloudflare Worker environment.
 * @returns A Response object or null if no route matches.
 */
export async function handleCampaignRoutes(path: string, request: Request, env: Env): Promise<Response | null> {
    const url = new URL(request.url);
    for (const route of routes) {
        if (request.method === route.method) {
            const match = route.pattern.exec(url);
            if (match) {
                const params = match.pathname.groups;
                return await route.handler(request, env, params);
            }
        }
    }
    return null;
}

// --- KV Interaction Helpers ---

async function getCampaignManager(id: string, env: Env): Promise<CampaignManager | null> {
    const key = `campaign:${id}:lifecycle`;
    const data = await env.WORLD_STATE.get(key);
    if (!data) return null;
    return CampaignManager.fromJSON(data);
}

async function saveCampaignManager(id: string, manager: CampaignManager, env: Env): Promise<void> {
    const key = `campaign:${id}:lifecycle`;
    await env.WORLD_STATE.put(key, manager.toJSON());
}

async function getSceneManager(id: string, env: Env): Promise<SceneManager> {
    const key = `campaign:${id}:scene`;
    const data = await env.WORLD_STATE.get(key);
    return data ? JSON.parse(data) : new SceneManager();
}

async function saveSceneManager(id: string, manager: SceneManager, env: Env): Promise<void> {
    const key = `campaign:${id}:scene`;
    await env.WORLD_STATE.put(key, manager.toJSON());
}

// --- Route Handler Implementations ---

// 1. POST /api/campaign/:id/phase
async function setCampaignPhase(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    try {
        const body = await request.json<{ phase: CampaignPhase }>();
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        manager.setPhase(body.phase);
        await saveCampaignManager(id, manager, env);

        return new Response(JSON.stringify(manager.getSummary()), { headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 2. GET /api/campaign/:id/phase
async function getCampaignPhase(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    const manager = await getCampaignManager(id, env);
    if (!manager) return errorResponse(404, 'no_campaign');

    return new Response(JSON.stringify(manager.getSummary()), { headers: corsHeaders() });
}

// 3. POST /api/campaign/:id/notes
async function addConceptionNote(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    try {
        const body = await request.json<{ text: string; tags?: string[] }>();
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        const note = manager.addNote(body.text, body.tags);
        await saveCampaignManager(id, manager, env);

        return new Response(JSON.stringify(note), { status: 201, headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 4. GET /api/campaign/:id/notes
async function getConceptionNotes(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    const url = new URL(request.url);
    const canonized = url.searchParams.get('canonized');

    const manager = await getCampaignManager(id, env);
    if (!manager) return errorResponse(404, 'no_campaign');

    const filter = canonized ? { canonized: canonized === 'true' } : {};
    const notes = manager.getNotes(filter);

    return new Response(JSON.stringify(notes), { headers: corsHeaders() });
}

// 5. POST /api/campaign/:id/world-ideas
async function addWorldIdea(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    try {
        const body = await request.json<Omit<WorldIdea, 'id' | 'canonized'>>();
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        const newIdea: WorldIdea = { ...body, id: generateId(), canonized: false };
        manager.addWorldIdea(newIdea);
        await saveCampaignManager(id, manager, env);

        return new Response(JSON.stringify(newIdea), { status: 201, headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 6. GET /api/campaign/:id/world-ideas
async function getWorldIdeas(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    const url = new URL(request.url);
    const category = url.searchParams.get('category') || undefined;

    const manager = await getCampaignManager(id, env);
    if (!manager) return errorResponse(404, 'no_campaign');

    const ideas = manager.getWorldIdeas({ category });
    return new Response(JSON.stringify(ideas), { headers: corsHeaders() });
}

// 7. POST /api/campaign/:id/world-ideas/:ideaId/canonize
async function canonizeWorldIdea(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id, ideaId } = params;
    const manager = await getCampaignManager(id, env);
    if (!manager) return errorResponse(404, 'no_campaign');

    const idea = manager.canonizeWorldIdea(ideaId);
    if (!idea) return errorResponse(404, 'not_found');

    await saveCampaignManager(id, manager, env);
    return new Response(JSON.stringify(idea), { headers: corsHeaders() });
}

// 8. POST /api/campaign/:id/session/start
async function startSession(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    const manager = await getCampaignManager(id, env);
    if (!manager) return errorResponse(404, 'no_campaign');

    const sessionId = manager.startNewSession();
    await saveCampaignManager(id, manager, env);

    return new Response(JSON.stringify({ sessionId }), { status: 201, headers: corsHeaders() });
}

// 9. POST /api/campaign/:id/session/:sessionId/end
async function endSession(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id, sessionId } = params;
    try {
        const body = await request.json<{ rating: number; duration: number }>();
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        manager.endSession(sessionId, body);
        await saveCampaignManager(id, manager, env);

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 10. POST /api/campaign/:id/session/:sessionId/transcript
async function addSessionTranscript(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id, sessionId } = params;
    try {
        const body = await request.json<{ text: string }>();
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        manager.addTranscriptToSession(sessionId, body.text);
        await saveCampaignManager(id, manager, env);

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 11. POST /api/campaign/:id/session/:sessionId/highlight
async function addSessionHighlight(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id, sessionId } = params;
    try {
        const body = await request.json<{ text: string }>();
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        manager.addHighlightToSession(sessionId, body.text);
        await saveCampaignManager(id, manager, env);

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 12. POST /api/campaign/:id/session/:sessionId/combat
async function addSessionCombatRecord(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id, sessionId } = params;
    try {
        const body = await request.json<CombatRecord>();
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        manager.addCombatRecordToSession(sessionId, body);
        await saveCampaignManager(id, manager, env);

        return new Response(JSON.stringify({ success: true }), { headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 13. POST /api/campaign/:id/twins/create
async function createPlayerTwin(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    try {
        const body = await request.json<{ playerName: string; characterName: string; sessionId: string }>();
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        const twin = await manager.createPlayerTwin(body.playerName, body.characterName, body.sessionId);
        await saveCampaignManager(id, manager, env);

        return new Response(JSON.stringify(twin), { status: 201, headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 14. GET /api/campaign/:id/twins
async function getPlayerTwins(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    const manager = await getCampaignManager(id, env);
    if (!manager) return errorResponse(404, 'no_campaign');

    return new Response(JSON.stringify(manager.playerTwins), { headers: corsHeaders() });
}

// 15. POST /api/campaign/:id/simulate
async function runSimulation(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    try {
        const body = await request.json<{ type: string; scenario: string; playerTwinActions: any }>();
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        const result = await manager.runSimulation(body.type, body.scenario, body.playerTwinActions);
        await saveCampaignManager(id, manager, env);

        return new Response(JSON.stringify(result), { headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 16. GET /api/campaign/:id/simulations
async function getSimulations(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    const manager = await getCampaignManager(id, env);
    if (!manager) return errorResponse(404, 'no_campaign');

    return new Response(JSON.stringify(manager.simulationResults), { headers: corsHeaders() });
}

// 17. POST /api/campaign/:id/world-build
async function startWorldBuild(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    try {
        const config = await request.json<WorldBuildConfig>();
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        const worldBuilder = new WorldBuilder(env);
        const session = await worldBuilder.startSession(manager, config);

        const key = `campaign:${id}:worldbuild:${session.id}`;
        await env.WORLD_STATE.put(key, JSON.stringify(session));

        return new Response(JSON.stringify(session), { status: 201, headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 18. POST /api/campaign/:id/world-build/:sessionId/sift
async function siftWorldBuild(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id, sessionId } = params;
    try {
        const body = await request.json<{ campaignContext: string }>();
        const key = `campaign:${id}:worldbuild:${sessionId}`;
        const sessionData = await env.WORLD_STATE.get(key);
        if (!sessionData) return errorResponse(404, 'not_found');

        const session: WorldBuildSession = JSON.parse(sessionData);
        const manager = await getCampaignManager(id, env);
        if (!manager) return errorResponse(404, 'no_campaign');

        const worldBuilder = new WorldBuilder(env);
        const newIdeas = await worldBuilder.siftForGold(session, body.campaignContext);

        newIdeas.forEach(idea => manager.addWorldIdea(idea));
        await saveCampaignManager(id, manager, env);

        return new Response(JSON.stringify(newIdeas), { headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 19. GET /api/campaign/:id/scene
async function getScene(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    const sceneManager = await getSceneManager(id, env);
    return new Response(JSON.stringify(sceneManager.getCurrentScene()), { headers: corsHeaders() });
}

// 20. POST /api/campaign/:id/scene
async function createScene(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    try {
        const body = await request.json<{ location: string; locationPrompt: string }>();
        const sceneManager = new SceneManager();
        sceneManager.startNewScene(body.location, body.locationPrompt);
        await saveSceneManager(id, sceneManager, env);

        return new Response(JSON.stringify(sceneManager.getCurrentScene()), { status: 201, headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 21. POST /api/campaign/:id/scene/element
async function addSceneElement(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    try {
        const body = await request.json<Omit<SceneElement, 'id'>>();
        const sceneManager = await getSceneManager(id, env);
        sceneManager.addElement(body.type, body.name, body.basePrompt, body.initialState);
        await saveSceneManager(id, sceneManager, env);

        return new Response(JSON.stringify(sceneManager.getCurrentScene()), { headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 22. POST /api/campaign/:id/scene/action
async function recordSceneAction(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    try {
        const body = await request.json();
        const sceneManager = await getSceneManager(id, env);
        sceneManager.recordAction(body.narrative, body.effects);
        await saveSceneManager(id, sceneManager, env);

        return new Response(JSON.stringify(sceneManager.getCurrentScene()), { headers: corsHeaders() });
    } catch (e) {
        return errorResponse(400, 'bad_request');
    }
}

// 23. GET /api/campaign/:id/scene/visual-prompt
async function getSceneVisualPrompt(request: Request, env: Env, params: Record<string, string>): Promise<Response> {
    const { id } = params;
    const sceneManager = await getSceneManager(id, env);
    const prompt = await sceneManager.generateVisualPrompt();
    return new Response(JSON.stringify({ prompt }), { headers: corsHeaders() });
}
