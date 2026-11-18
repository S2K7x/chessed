/**
 * Chess Coach — small Cloudflare Worker, stateless.
 *
 * GET  /{live|daily}/game/{id}  Chess.com callback proxy. Chess.com's game pages
 *      load their data from an undocumented endpoint that sends no CORS
 *      headers; this forwards exactly that endpoint and adds them.
 * POST /coach                   Writes a move explanation from a fact sheet
 *      with Claude (needs the ANTHROPIC_API_KEY secret; requests must carry
 *      the COACH_TOKEN secret as a bearer token, so the key is not usable by
 *      anyone who finds the URL).
 *
 * Deploy: `npx wrangler deploy` from this folder, then
 *   npx wrangler secret put ANTHROPIC_API_KEY
 *   npx wrangler secret put COACH_TOKEN
 * and build the app with VITE_CHESSCOM_PROXY / VITE_COACH_URL pointing here.
 */
import Anthropic from '@anthropic-ai/sdk';
import { CoachError, DEFAULT_COACH_MODEL, writeExplanation, type CoachRequest } from './coach';

interface Env {
  /** Optional comma-separated list of origins allowed to call the proxy. */
  ALLOWED_ORIGINS?: string;
  ANTHROPIC_API_KEY?: string;
  COACH_TOKEN?: string;
  /** Model used by /coach (default claude-opus-5-5). */
  COACH_MODEL?: string;
}

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()) : ['*'];
  const value = allowed.includes('*') ? '*' : origin && allowed.includes(origin) ? origin : allowed[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    Vary: 'Origin',
  };
}

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

async function coach(request: Request, env: Env, headers: Record<string, string>): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY || !env.COACH_TOKEN) return json({ error: 'The coach is not configured on this server.' }, 503, headers);
  if (request.headers.get('Authorization') !== `Bearer ${env.COACH_TOKEN}`) return json({ error: 'Invalid coach token.' }, 401, headers);
  let body: CoachRequest;
  try {
    body = (await request.json()) as CoachRequest;
  } catch {
    return json({ error: 'Invalid JSON.' }, 400, headers);
  }
  if (!body || typeof body.sheet !== 'object' || JSON.stringify(body).length > 20_000) {
    return json({ error: 'Invalid fact sheet.' }, 400, headers);
  }
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  try {
    const text = await writeExplanation(client, env.COACH_MODEL || DEFAULT_COACH_MODEL, body);
    return json(text, 200, headers);
  } catch (err) {
    if (err instanceof CoachError) return json({ error: err.message }, err.status, headers);
    if (err instanceof Anthropic.RateLimitError) return json({ error: 'The coach is busy. Try again in a minute.' }, 429, headers);
    if (err instanceof Anthropic.APIError) return json({ error: `Model API error ${err.status}.` }, 502, headers);
    return json({ error: 'Unexpected error.' }, 500, headers);
  }
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    const headers = cors(origin, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    const url = new URL(request.url);

    if (url.pathname === '/coach') {
      if (request.method !== 'POST') return new Response('Method not allowed', { status: 405, headers });
      return coach(request, env, headers);
    }

    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers });
    const m = /^\/(live|daily)\/game\/(\d{1,20})$/.exec(url.pathname);
    if (!m) return new Response('Not found', { status: 404, headers });

    const upstream = await fetch(`https://www.chess.com/callback/${m[1]}/game/${m[2]}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'chess-coach-proxy' },
      cf: { cacheTtl: 300 },
    } as RequestInit);
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...headers },
    });
  },
};
