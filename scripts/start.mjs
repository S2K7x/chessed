// `npm start`: builds the app and serves it at a fixed address, then opens the
// browser. The address never changes, because the browser keeps the games of
// each address (origin) separately.
import { spawn } from 'node:child_process';
import { build, preview } from 'vite';

const PORT = 4321;
const URL = `http://localhost:${PORT}/`;

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'win32'
      ? ['cmd', ['/c', 'start', '""', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  try {
    const child = spawn(cmd, args, { stdio: 'ignore', detached: true });
    child.on('error', () => console.log(`  Open ${url} in your browser.`));
    child.unref();
  } catch {
    console.log(`  Open ${url} in your browser.`);
  }
}

/** Whether Chess Coach already answers at the address (a second `npm start`). */
async function alreadyRunning() {
  try {
    const res = await fetch(URL);
    return (await res.text()).includes('<title>Chess Coach</title>');
  } catch {
    return false;
  }
}

// Chess.com game links need a proxy (no CORS headers): the preview server has
// the same one as the development server (vite.config.ts, server.proxy).
process.env.VITE_CHESSCOM_PROXY ??= '/proxy/chesscom';

console.log('Building Chess Coach…');
await build({ logLevel: 'warn' });
try {
  await preview({ preview: { port: PORT, strictPort: true, open: false } });
} catch (err) {
  if (await alreadyRunning()) {
    console.log(`\nChess Coach is already running at ${URL} (in another terminal window). Opening it.\n`);
    if (!process.argv.includes('--no-open')) openBrowser(URL);
    process.exit(0);
  }
  console.error(`\nPort ${PORT} is used by another program, so Chess Coach cannot start (${err instanceof Error ? err.message : err}).\n`);
  process.exit(1);
}
console.log(`\n  Chess Coach is running at ${URL}`);
console.log('  Keep this window open while you use it; press Ctrl+C to stop.');
console.log('  Your games are saved in this browser, for this address.\n');
if (!process.argv.includes('--no-open')) openBrowser(URL);
