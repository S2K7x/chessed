import { useRef, useState } from 'react';
import { useStore } from '../app/store';

export function HomeView() {
  const { library, busy, settings, recent } = useStore();
  const { importInput, importFile, openGame, deleteGame, setView, loadRecent } = useStore.getState();
  const [text, setText] = useState('');
  const [filter, setFilter] = useState({ query: '', speed: '', result: '' });
  const shown = library.filter((g) => {
    const q = filter.query.trim().toLowerCase();
    if (q && ![g.white.name, g.black.name, g.openingName ?? '', g.eco ?? ''].some((v) => v.toLowerCase().includes(q))) return false;
    if (filter.speed && g.timeControl?.speed !== filter.speed) return false;
    if (filter.result && g.result !== filter.result) return false;
    return true;
  });
  const file = useRef<HTMLInputElement>(null);

  return (
    <div className="home">
      <section className="import card">
        <h1 className="home-title">Review a game</h1>
        <p className="muted">Paste a Lichess or Chess.com game link, or the game's PGN. The analysis runs on your device.</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void importInput(text);
          }}
        >
          <label className="sr-only" htmlFor="game-input">Game link or PGN</label>
          <textarea
            id="game-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'https://lichess.org/abcd1234\nhttps://www.chess.com/game/live/123456789\n\nor 1. e4 e5 2. Nf3 …'}
            rows={6}
            spellCheck={false}
          />
          <div className="import-actions">
            <button className="primary" type="submit" disabled={busy || !text.trim()}>
              {busy ? 'Importing…' : 'Analyse'}
            </button>
            <button type="button" onClick={() => file.current?.click()} disabled={busy}>Open a PGN file</button>
            <input
              ref={file}
              type="file"
              accept=".pgn,text/plain"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = '';
              }}
            />
          </div>
        </form>
        {!settings.lichessUsername && !settings.chesscomUsername && (
          <p className="hint">
            Tip: add your usernames in <button className="link" onClick={() => setView('settings')}>Settings</button> so the coach knows which side you played.
          </p>
        )}
      </section>

      <section className="recent card">
        <h2>Your latest games</h2>
        <div className="import-actions">
          <button onClick={() => void loadRecent('lichess')} disabled={!settings.lichessUsername || recent?.loading}>
            From Lichess{settings.lichessUsername ? ` (${settings.lichessUsername})` : ''}
          </button>
          <button onClick={() => void loadRecent('chesscom')} disabled={!settings.chesscomUsername || recent?.loading}>
            From Chess.com{settings.chesscomUsername ? ` (${settings.chesscomUsername})` : ''}
          </button>
        </div>
        {!settings.lichessUsername && !settings.chesscomUsername && (
          <p className="muted small">Add your usernames in Settings to list your latest games here.</p>
        )}
        {recent?.loading && <p className="muted">Loading…</p>}
        {recent && !recent.loading && recent.games.length === 0 && <p className="muted">No recent games found.</p>}
        {recent && recent.games.length > 0 && (
          <ul className="library-list">
            {recent.games.map((g) => (
              <li key={g.id} className="library-item">
                <button className="library-open" onClick={() => void openGame(g)}>
                  <span className="library-players">
                    {g.white.name} <span className="muted">vs</span> {g.black.name}
                  </span>
                  <span className="muted">{[g.result, g.timeControl?.speed, g.date, g.openingName].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="library">
        <h2>Analysed games</h2>
        {library.length > 0 && (
          <div className="filters" role="search">
            <input aria-label="Search players or openings" placeholder="Player or opening" value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
            <select aria-label="Speed" value={filter.speed} onChange={(e) => setFilter({ ...filter, speed: e.target.value })}>
              <option value="">All speeds</option>
              {['bullet', 'blitz', 'rapid', 'classical', 'correspondence'].map((s) => (
                <option key={s} value={s}>{s[0]!.toUpperCase() + s.slice(1)}</option>
              ))}
            </select>
            <select aria-label="Result" value={filter.result} onChange={(e) => setFilter({ ...filter, result: e.target.value })}>
              <option value="">All results</option>
              <option value="1-0">1-0</option>
              <option value="0-1">0-1</option>
              <option value="1/2-1/2">½-½</option>
            </select>
          </div>
        )}
        {library.length === 0 ? (
          <p className="muted">Games you analyse are kept on this device.</p>
        ) : shown.length === 0 ? (
          <p className="muted">No game matches these filters.</p>
        ) : (
          <ul className="library-list">
            {shown.map((g) => (
              <li key={g.id} className="library-item">
                <button className="library-open" onClick={() => void openGame(g)}>
                  <span className="library-players">
                    {g.white.name} <span className="muted">vs</span> {g.black.name}
                  </span>
                  <span className="muted">
                    {[g.result, g.timeControl?.speed, g.date, g.openingName].filter(Boolean).join(' · ')}
                  </span>
                </button>
                <button className="icon" aria-label={`Delete ${g.white.name} vs ${g.black.name}`} onClick={() => void deleteGame(g.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
