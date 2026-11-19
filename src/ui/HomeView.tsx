import { useEffect, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { db } from '../db/db';
import type { Game } from '../core/game';
import { isFiltering, LIBRARY_PAGE, matchesFilter, NO_FILTER, type LibraryFilter } from '../core/library';

export function HomeView() {
  const { library, busy, settings, recent, batch } = useStore();
  const { importInput, importFile, openGame, deleteGame, setView, loadRecent, analyseRecent, analyseBatch, showMoreGames, searchGames } = useStore.getState();
  // Which games of the library have a review, and how many games there are (refreshed with the library).
  const [analysedIds, setAnalysedIds] = useState<Set<string>>();
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let live = true;
    void Promise.all([db.reviews.toCollection().primaryKeys(), db.games.count()]).then(([ids, n]) => {
      if (!live) return;
      setAnalysedIds(new Set(ids as string[]));
      setTotal(n);
    });
    return () => {
      live = false;
    };
  }, [library]);
  const unanalysed = analysedIds ? library.filter((g) => !analysedIds.has(g.id)) : [];
  const analysedRecent = new Set(recent?.analysed ?? []);
  const toAnalyse = recent ? recent.games.filter((g) => !analysedRecent.has(g.id)).length : 0;
  const [text, setText] = useState('');
  const [filter, setFilter] = useState<LibraryFilter>(NO_FILTER);
  // With filters, every game is searched, not only the loaded ones.
  const filtering = isFiltering(filter);
  const [found, setFound] = useState<Game[]>();
  useEffect(() => {
    if (!filtering) {
      setFound(undefined);
      return;
    }
    let live = true;
    const t = setTimeout(() => void searchGames(filter).then((games) => live && setFound(games)), 150);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [filter, filtering, searchGames, library]);
  const shown = filtering ? (found ?? library.filter((g) => matchesFilter(g, filter))) : library;
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
          <div className="batch" aria-live="polite">
            {batch ? (
              <BatchStatus />
            ) : toAnalyse > 0 ? (
              <>
                <p className="muted small">The dashboard and your training get better with each analysed game. You can keep reviewing meanwhile.</p>
                <button className="primary" onClick={() => void analyseRecent()}>
                  Analyse all {toAnalyse} new game{toAnalyse > 1 ? 's' : ''}
                </button>
              </>
            ) : (
              <p className="muted small">All these games are analysed.</p>
            )}
          </div>
        )}
        {recent && recent.games.length > 0 && (
          <ul className="library-list">
            {recent.games.map((g) => (
              <li key={g.id} className="library-item">
                <button className="library-open" onClick={() => void openGame(g)}>
                  <span className="library-players">
                    {g.white.name} <span className="muted">vs</span> {g.black.name}
                    {analysedRecent.has(g.id) && <span className="tag">analysed</span>}
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
        {batch && !recent && <BatchStatus />}
        {!batch && unanalysed.length > 0 && (
          <div className="batch">
            <p className="muted small">
              {unanalysed.length} game{unanalysed.length > 1 ? 's are' : ' is'} not analysed yet (imported from a file, or an analysis was
              interrupted).
            </p>
            <button className="primary" onClick={() => void analyseBatch(unanalysed)}>
              Analyse {unanalysed.length > 1 ? `these ${unanalysed.length} games` : 'it'}
            </button>
          </div>
        )}
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
                    {analysedIds && !analysedIds.has(g.id) && <span className="tag">not analysed</span>}
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
        {!filtering && total > library.length && (
          <button className="show-more" onClick={() => void showMoreGames()}>
            Show {Math.min(LIBRARY_PAGE, total - library.length)} older games ({total - library.length} more)
          </button>
        )}
        {filtering && found && found.length >= LIBRARY_PAGE && (
          <p className="muted small">Showing the {LIBRARY_PAGE} most recent matches: narrow the search to see others.</p>
        )}
      </section>
    </div>
  );
}

/** Progress of the games being analysed in the background. */
function BatchStatus() {
  const { batch } = useStore();
  const { stopBatch } = useStore.getState();
  if (!batch) return null;
  return (
    <div className="batch" aria-live="polite">
      <p className="batch-status">
        Analysing game {Math.min(batch.done + 1, batch.total)} of {batch.total}
        {batch.current ? <span className="muted"> · {batch.current}</span> : null}
      </p>
      <div className="progress" role="progressbar" aria-label="Games analysed" aria-valuemin={0} aria-valuemax={batch.total} aria-valuenow={batch.done}>
        <div className="progress-fill" style={{ width: `${(100 * batch.done) / batch.total}%` }} />
      </div>
      <button onClick={stopBatch}>Stop</button>
    </div>
  );
}
