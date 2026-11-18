/**
 * Chess Coach — Chess.com callback proxy (Cloudflare Worker).
 *
 * Chess.com's game pages load their data from an undocumented endpoint
 * (https://www.chess.com/callback/{live|daily}/game/{id}) that sends no CORS
 * headers, so the browser app cannot call it directly. This stateless worker
 * forwards exactly that endpoint and adds CORS headers. It stores nothing.
 *
 * Deploy: `npx wrangler deploy` from this folder, then build the app with
 * VITE_CHESSCOM_PROXY=https://<your-worker>.workers.dev
 */

interface Env {
  /** Optional comma-separated list of origins allowed to call the proxy. */
  ALLOWED_ORIGINS?: string;
}

function cors(origin: string | null, env: Env): Record<string, string> {
  const allowed = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()) : ['*'];
  const value = allowed.includes('*') ? '*' : origin && allowed.includes(origin) ? origin : allowed[0] ?? '*';
  return {
    'Access-Control-Allow-Origin': value,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin, env) });
    if (request.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors(origin, env) });

    const url = new URL(request.url);
    const m = /^\/(live|daily)\/game\/(\d{1,20})$/.exec(url.pathname);
    if (!m) return new Response('Not found', { status: 404, headers: cors(origin, env) });

    const upstream = await fetch(`https://www.chess.com/callback/${m[1]}/game/${m[2]}`, {
      headers: { Accept: 'application/json', 'User-Agent': 'chess-coach-proxy' },
      cf: { cacheTtl: 300 },
    } as RequestInit);
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=300', ...cors(origin, env) },
    });
  },
};
