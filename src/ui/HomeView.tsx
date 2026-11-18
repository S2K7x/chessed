import { useRef, useState } from 'react';
import { useStore } from '../app/store';

export function HomeView() {
  const { library, busy, settings } = useStore();
  const { importInput, importFile, openGame, deleteGame, setView } = useStore.getState();
  const [text, setText] = useState('');
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

      <section className="library">
        <h2>Your games</h2>
        {library.length === 0 ? (
          <p className="muted">Games you analyse are kept on this device.</p>
        ) : (
          <ul className="library-list">
            {library.map((g) => (
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
