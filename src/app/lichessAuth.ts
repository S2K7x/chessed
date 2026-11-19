/**
 * Lichess login with OAuth 2 (authorization code + PKCE). Lichess accepts any
 * client id without registration; no scope is requested: the token only
 * proves who you are, which the opening explorer requires.
 */
const CLIENT_ID = 'chess-coach';
const VERIFIER_KEY = 'chess-coach.lichess.verifier';
const STATE_KEY = 'chess-coach.lichess.state';

const redirectUri = () => `${location.origin}${import.meta.env.BASE_URL}`;

function base64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const random = (n: number) => base64url(crypto.getRandomValues(new Uint8Array(n)));

export async function startLichessLogin(): Promise<void> {
  const verifier = random(48);
  const state = random(16);
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  sessionStorage.setItem(STATE_KEY, state);
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: redirectUri(),
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });
  location.assign(`https://lichess.org/oauth?${params}`);
}

/** Completes the login when Lichess redirects back with a code. Returns the token, if any. */
export async function finishLichessLogin(): Promise<{ token: string; username?: string } | undefined> {
  const url = new URL(location.href);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  if (!code || !state) return undefined;
  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  const expected = sessionStorage.getItem(STATE_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  sessionStorage.removeItem(STATE_KEY);
  history.replaceState(null, '', redirectUri());
  if (!verifier || state !== expected) throw new Error('The Lichess login could not be verified. Try again.');
  const res = await fetch('https://lichess.org/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, code_verifier: verifier, redirect_uri: redirectUri(), client_id: CLIENT_ID }),
  });
  if (!res.ok) throw new Error(`Lichess refused the login (${res.status}).`);
  const { access_token: token } = (await res.json()) as { access_token: string };
  const me = await fetch('https://lichess.org/api/account', { headers: { Authorization: `Bearer ${token}` } });
  const username = me.ok ? ((await me.json()) as { username?: string }).username : undefined;
  return { token, ...(username ? { username } : {}) };
}

export async function lichessLogout(token: string): Promise<void> {
  try {
    await fetch('https://lichess.org/api/token', { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  } catch {
    // Offline: the token stays valid on Lichess until it expires.
  }
}
