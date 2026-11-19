import { useEffect, useRef, useState } from 'react';
import { useStore } from '../app/store';
import { db } from '../db/db';
import type { Game } from '../core/game';
import { isFiltering, LIBRARY_PAGE, matchesFilter, NO_FILTER, type LibraryFilter } from '../core/library';
import { EXAMPLE_PGN } from '../core/exampleGame';
import { cap, t } from '../i18n';
import { speedName } from './names';

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
  const hasAccount = Boolean(settings.lichessUsername.trim() || settings.chesscomUsername.trim());

  return (
    <div className="home">
      <section className="import card">
        <h1 className="home-title">{t('home.title')}</h1>
        <p className="muted">{t('home.intro')}</p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void importInput(text);
          }}
        >
          <label className="sr-only" htmlFor="game-input">{t('home.inputLabel')}</label>
          <textarea
            id="game-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={`https://lichess.org/abcd1234\nhttps://www.chess.com/game/live/123456789\n\n${t('home.placeholderOr')} 1. e4 e5 2. Nf3 …`}
            rows={6}
            spellCheck={false}
          />
          <div className="import-actions">
            <button className="primary" type="submit" disabled={busy || !text.trim()}>
              {busy ? t('home.importing') : t('home.analyse')}
            </button>
            <button type="button" onClick={() => file.current?.click()} disabled={busy}>{t('home.openFile')}</button>
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
      </section>

      <section className="recent card">
        <h2>{t('home.latest')}</h2>
        {hasAccount ? (
          <div className="import-actions">
            {settings.lichessUsername.trim() && (
              <button onClick={() => void loadRecent('lichess')} disabled={recent?.loading}>
                {t('home.fromLichess', { name: settings.lichessUsername.trim() })}
              </button>
            )}
            {settings.chesscomUsername.trim() && (
              <button onClick={() => void loadRecent('chesscom')} disabled={recent?.loading}>
                {t('home.fromChesscom', { name: settings.chesscomUsername.trim() })}
              </button>
            )}
            <button className="link" onClick={() => setView('settings')}>
              {settings.lichessUsername.trim() && settings.chesscomUsername.trim() ? t('home.changeAccounts') : t('home.addAccount')}
            </button>
          </div>
        ) : (
          <AccountForm />
        )}
        {recent?.loading && <p className="muted">{t('common.loading')}</p>}
        {recent && !recent.loading && recent.games.length === 0 && <p className="muted">{t('home.noRecent')}</p>}
        {recent && recent.games.length > 0 && (
          <div className="batch" aria-live="polite">
            {batch ? (
              <BatchStatus />
            ) : toAnalyse > 0 ? (
              <>
                <p className="muted small">{t('home.batchHelp')}</p>
                <button className="primary" onClick={() => void analyseRecent()}>
                  {t('home.analyseNew', { count: toAnalyse })}
                </button>
              </>
            ) : (
              <p className="muted small">{t('home.allAnalysed')}</p>
            )}
          </div>
        )}
        {recent && recent.games.length > 0 && (
          <ul className="library-list">
            {recent.games.map((g) => (
              <li key={g.id} className="library-item">
                <button className="library-open" onClick={() => void openGame(g)}>
                  <span className="library-players">
                    {g.white.name} <span className="muted">{t('common.vs')}</span> {g.black.name}
                    {analysedRecent.has(g.id) && <span className="tag">{t('home.tag.analysed')}</span>}
                  </span>
                  <span className="muted">{[g.result, g.timeControl?.speed ? speedName(g.timeControl.speed) : undefined, g.date, g.openingName].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="library">
        <h2>{library.length === 0 && !batch ? t('home.howItWorks') : t('home.analysedGames')}</h2>
        {batch && !recent && <BatchStatus />}
        {!batch && unanalysed.length > 0 && (
          <div className="batch">
            <p className="muted small">
              {t('home.unanalysed', { count: unanalysed.length })}
            </p>
            <button className="primary" onClick={() => void analyseBatch(unanalysed)}>
              {t('home.analyseThese', { count: unanalysed.length })}
            </button>
          </div>
        )}
        {library.length > 0 && (
          <div className="filters" role="search">
            <input aria-label={t('home.search')} placeholder={t('home.searchPlaceholder')} value={filter.query} onChange={(e) => setFilter({ ...filter, query: e.target.value })} />
            <select aria-label={t('home.speed')} value={filter.speed} onChange={(e) => setFilter({ ...filter, speed: e.target.value })}>
              <option value="">{t('home.allSpeeds')}</option>
              {['bullet', 'blitz', 'rapid', 'classical', 'correspondence'].map((s) => (
                <option key={s} value={s}>{cap(speedName(s))}</option>
              ))}
            </select>
            <select aria-label={t('home.result')} value={filter.result} onChange={(e) => setFilter({ ...filter, result: e.target.value })}>
              <option value="">{t('home.allResults')}</option>
              <option value="1-0">1-0</option>
              <option value="0-1">0-1</option>
              <option value="1/2-1/2">½-½</option>
            </select>
          </div>
        )}
        {library.length === 0 ? (
          <FirstSteps onExample={() => void importInput(EXAMPLE_PGN)} busy={busy} />
        ) : shown.length === 0 ? (
          <p className="muted">{t('home.noMatch')}</p>
        ) : (
          <ul className="library-list">
            {shown.map((g) => (
              <li key={g.id} className="library-item">
                <button className="library-open" onClick={() => void openGame(g)}>
                  <span className="library-players">
                    {g.white.name} <span className="muted">{t('common.vs')}</span> {g.black.name}
                    {analysedIds && !analysedIds.has(g.id) && <span className="tag">{t('home.tag.notAnalysed')}</span>}
                  </span>
                  <span className="muted">
                    {[g.result, g.timeControl?.speed ? speedName(g.timeControl.speed) : undefined, g.date, g.openingName].filter(Boolean).join(' · ')}
                  </span>
                </button>
                <button className="icon" aria-label={t('home.delete', { white: g.white.name, black: g.black.name })} onClick={() => void deleteGame(g.id)}>
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
        {!filtering && total > library.length && (
          <button className="show-more" onClick={() => void showMoreGames()}>
            {t('home.showMore', { n: Math.min(LIBRARY_PAGE, total - library.length), count: total - library.length })}
          </button>
        )}
        {filtering && found && found.length >= LIBRARY_PAGE && (
          <p className="muted small">{t('home.truncated', { n: LIBRARY_PAGE })}</p>
        )}
      </section>
    </div>
  );
}

/**
 * First visit: the player's usernames, asked where their games are listed
 * (not in Settings), then their latest games at once.
 */
function AccountForm() {
  const { recent } = useStore();
  const { updateSettings, loadRecent } = useStore.getState();
  const [lichess, setLichess] = useState('');
  const [chesscom, setChesscom] = useState('');
  const ready = Boolean(lichess.trim() || chesscom.trim());
  return (
    <form
      className="account-form"
      onSubmit={(e) => {
        e.preventDefault();
        if (!ready) return;
        void updateSettings({ lichessUsername: lichess.trim(), chesscomUsername: chesscom.trim() }).then(() =>
          loadRecent(lichess.trim() ? 'lichess' : 'chesscom'),
        );
      }}
    >
      <p className="muted small">
        {t('home.account.help')}
      </p>
      <div className="account-fields">
        <label>
          {t('settings.lichessUser')}
          <input value={lichess} onChange={(e) => setLichess(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </label>
        <label>
          {t('settings.chesscomUser')}
          <input value={chesscom} onChange={(e) => setChesscom(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </label>
      </div>
      <button className="primary" type="submit" disabled={!ready || recent?.loading}>
        {t('home.account.show')}
      </button>
    </form>
  );
}

/** Empty library: what the app does, and a game to try it on. */
function FirstSteps({ onExample, busy }: { onExample: () => void; busy: boolean }) {
  return (
    <div className="first-steps">
      <ol className="steps">
        <li>
          <strong>{t('home.step1.title')}</strong> {t('home.step1')}
        </li>
        <li>
          <strong>{t('home.step2.title')}</strong> {t('home.step2')}
        </li>
        <li>
          <strong>{t('home.step3.title')}</strong> {t('home.step3')}
        </li>
      </ol>
      <div className="import-actions">
        <button className="primary" onClick={onExample} disabled={busy}>
          {t('home.example')}
        </button>
        <span className="muted small">{t('home.exampleTitle')}</span>
      </div>
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
        {t('home.batch.status', { n: Math.min(batch.done + 1, batch.total), total: batch.total })}
        {batch.current ? <span className="muted"> · {batch.current}</span> : null}
      </p>
      <div className="progress" role="progressbar" aria-label={t('home.batch.progress')} aria-valuemin={0} aria-valuemax={batch.total} aria-valuenow={batch.done}>
        <div className="progress-fill" style={{ width: `${(100 * batch.done) / batch.total}%` }} />
      </div>
      <button onClick={stopBatch}>{t('common.stop')}</button>
    </div>
  );
}
