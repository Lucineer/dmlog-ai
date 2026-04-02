// src/game/asset-serve.ts

import { ASSET_TEMPLATES } from './asset-library.js'; // Assuming this file exists and exports ASSET_TEMPLATES

// --- Type Definitions ---

/**
 * Defines the Cloudflare Workers environment interface.
 * WORLD_STATE is a KVNamespace binding.
 */
interface Env {
  WORLD_STATE: KVNamespace;
  // Add other environment variables if needed, e.g., for authentication tokens
}

/**
 * Valid categories for TTRPG assets.
 */
export type AssetCategory = 'environment' | 'monster' | 'item' | 'effect' | 'npc' | 'ui';

/**
 * Metadata for an asset.
 */
export interface AssetMeta {
  id: string;
  category: AssetCategory;
  name: string;
  tags: string[];
  generated: boolean; // True if the image has been generated, false if it's a placeholder
  prompt?: string; // The prompt used to generate this asset, if applicable
}

/**
 * Full asset data, including metadata and base64 image data.
 */
interface AssetData {
  meta: AssetMeta;
  data: string; // Base64 encoded PNG image data
}

/**
 * Status of the batch generation process.
 */
interface BatchStatus {
  total: number; // Total number of prompts in the queue
  completed: number; // Number of prompts successfully processed
  status: 'idle' | 'processing' | 'completed' | 'error'; // Current status of the batch
  queue: string[]; // The actual prompts currently in the queue
}

// --- KV Keys ---
const ASSET_INDEX_KEY = 'asset:index';
const ASSET_GENERATION_QUEUE_KEY = 'asset:generation-queue';
const ASSET_BATCH_STATUS_KEY = 'asset:batch-status';

// --- Helper Functions ---

/**
 * Adds standard CORS headers to a Response.
 * @param response The response to modify.
 * @returns The response with CORS headers.
 */
function withCors(response: Response): Response {
  response.headers.set('Access-Control-Allow-Origin', '*');
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Max-Age', '86400'); // Cache preflight for 24 hours
  return response;
}

/**
 * Creates a JSON response with CORS headers.
 * @param data The data to serialize to JSON.
 * @param status The HTTP status code.
 * @returns A Response object.
 */
function jsonResponse(data: any, status: number = 200): Response {
  const response = new Response(JSON.stringify(data), {
    headers: { 'Content-Type': 'application/json' },
    status,
  });
  return withCors(response);
}

/**
 * Creates an image/png response with CORS and cache headers.
 * @param data The ArrayBuffer of the PNG image.
 * @param status The HTTP status code.
 * @returns A Response object.
 */
function imageResponse(data: ArrayBuffer, status: number = 200): Response {
  const response = new Response(data, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=86400', // Cache for 24 hours
    },
    status,
  });
  return withCors(response);
}

/**
 * Handles OPTIONS requests for CORS preflight.
 * @returns An empty 204 Response with CORS headers.
 */
function handleOptions(): Response {
  const response = new Response(null, { status: 204 });
  return withCors(response);
}

/**
 * Retrieves the asset index from KV.
 * @param env The Cloudflare Workers environment.
 * @returns An array of AssetMeta, or an empty array if not found.
 */
async function getAssetIndex(env: Env): Promise<AssetMeta[]> {
  const index = await env.WORLD_STATE.get<AssetMeta[]>(ASSET_INDEX_KEY, 'json');
  return index || [];
}

/**
 * Updates the asset index in KV.
 * @param env The Cloudflare Workers environment.
 * @param index The array of AssetMeta to store.
 */
async function updateAssetIndex(env: Env, index: AssetMeta[]): Promise<void> {
  await env.WORLD_STATE.put(ASSET_INDEX_KEY, JSON.stringify(index));
}

/**
 * Retrieves the batch generation queue from KV.
 * @param env The Cloudflare Workers environment.
 * @returns An array of prompts, or an empty array if not found.
 */
async function getGenerationQueue(env: Env): Promise<string[]> {
  const queue = await env.WORLD_STATE.get<string[]>(ASSET_GENERATION_QUEUE_KEY, 'json');
  return queue || [];
}

/**
 * Updates the batch generation queue in KV.
 * @param env The Cloudflare Workers environment.
 * @param queue The array of prompts to store.
 */
async function updateGenerationQueue(env: Env, queue: string[]): Promise<void> {
  await env.WORLD_STATE.put(ASSET_GENERATION_QUEUE_KEY, JSON.stringify(queue));
}

/**
 * Retrieves the batch generation status from KV.
 * @param env The Cloudflare Workers environment.
 * @returns The BatchStatus object, or a default one if not found.
 */
async function getBatchStatus(env: Env): Promise<BatchStatus> {
  const status = await env.WORLD_STATE.get<BatchStatus>(ASSET_BATCH_STATUS_KEY, 'json');
  return status || { total: 0, completed: 0, status: 'idle', queue: [] };
}

/**
 * Updates the batch generation status in KV.
 * @param env The Cloudflare Workers environment.
 * @param status The BatchStatus object to store.
 */
async function updateBatchStatus(env: Env, status: BatchStatus): Promise<void> {
  await env.WORLD_STATE.put(ASSET_BATCH_STATUS_KEY, JSON.stringify(status));
}

// --- Route Handlers ---

/**
 * Handles GET /api/assets — List all available assets.
 */
async function handleListAssets(env: Env): Promise<Response> {
  const assets = await getAssetIndex(env);
  return jsonResponse({ assets });
}

/**
 * Handles GET /api/assets/:id — Get asset image as PNG.
 */
async function handleGetAssetById(id: string, env: Env): Promise<Response> {
  const assetData = await env.WORLD_STATE.get<AssetData>(`asset:${id}`, 'json');

  if (!assetData) {
    return jsonResponse({ error: 'Asset not found' }, 404);
  }

  try {
    // Decode base64 to ArrayBuffer
    const binaryString = atob(assetData.data);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return imageResponse(bytes.buffer);
  } catch (e) {
    console.error(`Error decoding base64 for asset ${id}:`, e);
    return jsonResponse({ error: 'Failed to decode asset image' }, 500);
  }
}

/**
 * Handles GET /api/assets/category/:category — Filter by category.
 */
async function handleGetAssetsByCategory(category: string, env: Env): Promise<Response> {
  const allAssets = await getAssetIndex(env);
  const filteredAssets = allAssets.filter(asset => asset.category === category);
  return jsonResponse({ assets: filteredAssets });
}

/**
 * Handles GET /api/assets/search?tag=forest — Search by tag.
 */
async function handleSearchAssetsByTag(tag: string, env: Env): Promise<Response> {
  const allAssets = await getAssetIndex(env);
  const filteredAssets = allAssets.filter(asset => asset.tags.includes(tag));
  return jsonResponse({ assets: filteredAssets });
}

/**
 * Handles POST /api/assets/generate — Queue asset generation.
 */
async function handleQueueAssetGeneration(request: Request, env: Env): Promise<Response> {
  if (request.headers.get('Content-Type') !== 'application/json') {
    return jsonResponse({ error: 'Invalid Content-Type, expected application/json' }, 400);
  }

  let body: { prompt: string };
  try {
    body = await request.json();
  } catch (e) {
    return jsonResponse({ error: 'Invalid JSON body' }, 400);
  }

  const { prompt } = body;
  if (!prompt || typeof prompt !== 'string' || prompt.trim() === '') {
    return jsonResponse({ error: 'Missing or invalid "prompt" in request body' }, 400);
  }

  const currentQueue = await getGenerationQueue(env);
  currentQueue.push(prompt);
  await updateGenerationQueue(env, currentQueue);

  const batchStatus = await getBatchStatus(env);
  batchStatus.total = currentQueue.length;
  // If there are items in the queue, set status to processing, otherwise idle
  batchStatus.status = batchStatus.total > batchStatus.completed ? 'processing' : 'idle';
  batchStatus.queue = currentQueue; // Keep the queue in status for easier monitoring
  await updateBatchStatus(env, batchStatus);

  return jsonResponse({ message: 'Asset generation queued', prompt, queueLength: currentQueue.length }, 202);
}

/**
 * Handles GET /api/assets/batch-status — Check batch generation progress.
 */
async function handleGetBatchGenerationStatus(env: Env): Promise<Response> {
  const status = await getBatchStatus(env);
  // Ensure the queue in the status is up-to-date with the actual queue in KV
  status.queue = await getGenerationQueue(env);
  return jsonResponse(status);
}

// --- Main Handler ---
export async function handleAssetServeRoutes(path: string, request: Request, env: Env): Promise<Response | null> {
  const cors = corsHeaders();

  // GET /api/assets — list all
  if (path === '/api/assets' && request.method === 'GET') {
    const index = await env.WORLD_STATE.get('asset:index');
    const assets = index ? JSON.parse(index) : [];
    return new Response(JSON.stringify({ assets }), { headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // GET /api/assets/category/:category
  const catMatch = path.match(/^\/api\/assets\/category\/([a-z]+)$/);
  if (catMatch && request.method === 'GET') {
    const index = await env.WORLD_STATE.get('asset:index');
    const assets: any[] = index ? JSON.parse(index) : [];
    const filtered = assets.filter((a: any) => a.category === catMatch[1]);
    return new Response(JSON.stringify({ assets: filtered }), { headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // GET /api/assets/search?tag=X
  if (path === '/api/assets/search' && request.method === 'GET') {
    const url = new URL(request.url);
    const tag = url.searchParams.get('tag');
    const index = await env.WORLD_STATE.get('asset:index');
    const assets: any[] = index ? JSON.parse(index) : [];
    const filtered = tag ? assets.filter((a: any) => a.tags?.includes(tag)) : assets;
    return new Response(JSON.stringify({ assets: filtered }), { headers: { 'Content-Type': 'application/json', ...cors } });
  }

  // GET /api/assets/:id — serve image
  const idMatch = path.match(/^\/api\/assets\/([a-z0-9-]+)$/);
  if (idMatch && request.method === 'GET') {
    const raw = await env.WORLD_STATE.get(`asset:${idMatch[1]}`);
    if (!raw) return errorResponse(404, 'not_found');
    const asset = JSON.parse(raw);
    if (!asset.data) return errorResponse(404, 'not_found');
    const binary = Uint8Array.from(atob(asset.data), c => c.charCodeAt(0));
    return new Response(binary, {
      headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=86400', ...cors },
    });
  }

  // POST /api/assets/generate — queue generation
  if (path === '/api/assets/generate' && request.method === 'POST') {
    try {
      const body = await request.json() as { category: string; name: string; prompt: string; style: string; tags: string[] };
      const id = `asset-${Date.now()}-${body.name}`;
      const job = { id, ...body, status: 'queued', createdAt: Date.now() };
      await env.WORLD_STATE.put(`asset:job:${id}`, JSON.stringify(job));
      return new Response(JSON.stringify({ job }), { status: 201, headers: { 'Content-Type': 'application/json', ...cors } });
    } catch { return errorResponse(400, 'bad_request'); }
  }

  // GET /api/assets/batch-status
  if (path === '/api/assets/batch-status' && request.method === 'GET') {
    return new Response(JSON.stringify({ status: 'ready', totalAssets: ASSET_TEMPLATES.length }), {
      headers: { 'Content-Type': 'application/json', ...cors },
    });
  }

  return null;
}

export async function initializeAssetIndex(env: Env): Promise<void> {
  const existing = await env.WORLD_STATE.get('asset:index');
  if (existing) return;
  const index = ASSET_TEMPLATES.map(t => ({
    id: `asset-${t.category}-${t.name}`,
    category: t.category,
    name: t.name,
    tags: t.tags,
    generated: false,
  }));
  await env.WORLD_STATE.put('asset:index', JSON.stringify(index));
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };
}

function errorResponse(status: number, key: string): Response {
  const messages: Record<string, string> = {
    not_found: 'The ancient scrolls reveal no such asset.',
    bad_request: 'The spell fizzles. Your request lacks the proper incantation.',
    internal: 'A disturbance in the arcane weave!',
  };
  return new Response(JSON.stringify({ error: messages[key] ?? key, code: key }), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
