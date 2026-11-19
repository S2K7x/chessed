import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore, type GuessSession, type GuessState } from '../app/store';
import type { Color } from '../core/eval';
import type { Arrow } from '../core/explain';
import { guessScore, guessText, shortPlayerName } from '../core/guess';
import masterGames from '../data/masterGames.json';
import { Board } from './Board';
import { San } from './San';
import { t } from '../i18n';
import { sideLower, sideName } from './names';

/** Header fields of a bundled game, read from its PGN. */
function headers(pgn: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of pgn.matchAll(/^\[(\w+) "(.*)"\]$/gm)) out[m[1]!] = m[2]!;
  return out;
}

const GAMES = masterGames.map((g) => {
  const h = headers(g.pgn);
  return {
    id: g.id,
    opening: g.opening,
    white: shortPlayerName(h.White ?? 'White'),
    black: shortPlayerName(h.Black ?? 'Black'),
    year: (h.Date ?? '').slice(0, 4),
    event: h.Event ?? '',
    result: h.Result ?? '*',
  };
});

/** "Guess the move" through master games. */
export function GuessView() {
  const { guess } = useStore();
  const { openGuess } = useStore.getState();
  useEffect(() => {
    if (!guess) void openGuess();
  }, [guess, openGuess]);
  if (!guess) return <p className="muted">{t('common.loading')}</p>;
  if (guess.session) return <Session state={guess} session={guess.session} />;
  return <GameList state={guess} />;
}

function GameList({ state }: { state: GuessState }) {
  const { startGuess, setView } = useStore.getState();
  const [pgn, setPgn] = useState('');
  const best = (id: string, side: Color) => state.best[`${id}:${side}`];
  return (
    <div className="card narrow guess">
      <h1>{t('guess.title')}</h1>
      <p>{t('guess.intro')}</p>
      <ul className="guess-list">
        {GAMES.map((g) => (
          <li key={g.id}>
            <span className="guess-game">
              <strong>
                {g.white} – {g.black}
              </strong>
              <span className="muted small">
                {g.opening}
                {g.year ? ` · ${g.year}` : ''} · {g.result.replace('-', '–')}
              </span>
            </span>
            <span className="guess-best">
              {(['white', 'black'] as const)
                .map((side) => best(g.id, side))
                .filter(Boolean)
                .map((r) => `${t(r!.side === 'white' ? 'guess.w' : 'guess.b')} ${Math.round(r!.percent)}${t('common.percent')}`)
                .join(' · ')}
            </span>
            <span className="guess-sides">
              <button className={g.result === '1-0' ? 'primary' : ''} onClick={() => void startGuess({ id: g.id }, 'white')} aria-label={t('guess.playAs', { side: sideName('white'), me: g.white, them: g.black })}>
                {sideName('white')}
              </button>
              <button className={g.result === '0-1' ? 'primary' : ''} onClick={() => void startGuess({ id: g.id }, 'black')} aria-label={t('guess.playAs', { side: sideName('black'), me: g.black, them: g.white })}>
                {sideName('black')}
              </button>
            </span>
          </li>
        ))}
      </ul>
      <details className="guess-paste">
        <summary>{t('guess.other')}</summary>
        <textarea rows={5} value={pgn} onChange={(e) => setPgn(e.target.value)} aria-label={t('guess.pgnLabel')} placeholder="[White &quot;…&quot;] 1. e4 e5 …" />
        <button onClick={() => void startGuess({ pgn })} disabled={!pgn.trim()}>
          {t('guess.this')}
        </button>
      </details>
      <p>
        <button className="link" onClick={() => setView('training')}>{t('common.backToTraining')}</button>
      </p>
    </div>
  );
}

function Session({ state, session: s }: { state: GuessState; session: GuessSession }) {
  const { guessMove, guessNext, leaveGuess, startGuess } = useStore.getState();
  const { game, side } = s;
  const index = s.indices[Math.min(s.step, s.indices.length - 1)]!;
  const master = game.moves[index]!;
  const last = s.results[s.results.length - 1];
  const revealed = s.status === 'revealed' || s.status === 'finished';
  const fen = revealed ? master.fenAfter : master.fenBefore;
  const lastMove = revealed ? master.uci : game.moves[index - 1]?.uci;
  const score = guessScore(s.results);
  const me = shortPlayerName(side === 'white' ? game.white.name : game.black.name);
  const them = shortPlayerName(side === 'white' ? game.black.name : game.white.name);
  const previous = game.moves[index - 1];

  const arrows = useMemo<Arrow[]>(() => {
    if (!revealed || !s.guessUci || s.guessUci === master.uci) return [];
    return [{ from: s.guessUci.slice(0, 2), to: s.guessUci.slice(2, 4), brush: 'played' }];
  }, [revealed, s.guessUci, master.uci]);

  const onMove = useCallback((uci: string) => void guessMove(uci), [guessMove]);
  useEffect(() => {
    if (s.status !== 'revealed') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'ArrowRight') void guessNext();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [s.status, guessNext]);

  return (
    <div className="training">
      <div className="training-board">
        <p className="muted small">
          {shortPlayerName(game.white.name)} – {shortPlayerName(game.black.name)}
          {game.date ? ` · ${game.date.slice(0, 4)}` : ''}
        </p>
        <Board fen={fen} orientation={side} {...(lastMove ? { lastMove } : {})} arrows={arrows} {...(s.status === 'guessing' ? { onMove } : {})} />
      </div>
      <aside className="training-side">
        <section className="coach" aria-live="polite">
          <p className="coach-kicker">
            {t('guess.youAre', { me, side: sideLower(side), n: Math.ceil(master.ply / 2) })}
          </p>
          <p className="score-big" aria-label={t('guess.score')}>
            {score.points}
            <small>{t('guess.max', { max: score.max })}</small>
          </p>
          <ul className="guess-trail" aria-hidden="true">
            {s.results.map((r) => (
              <li key={r.index} className={`is-${r.verdict}`} />
            ))}
            {s.indices.slice(s.results.length).map((i) => (
              <li key={i} />
            ))}
          </ul>

          {s.status === 'guessing' && (
            <>
              <h2 className="coach-title">{t('guess.question', { me })}</h2>
              {previous && (
                <p className="muted">
                  {t('guess.justPlayed', { them })} <San san={previous.san} color={previous.color} />.
                </p>
              )}
            </>
          )}
          {s.status === 'judging' && <p className="coach-summary">{t('common.checking')}</p>}
          {revealed && last && (
            <>
              <p className={`guess-verdict display is-${last.verdict}`}>
                {guessText(last.verdict)} {last.points > 0 ? `+${last.points}` : ''}
              </p>
              <p>
                {last.verdict === 'master' ? (
                  <>
                    {t('guess.too.before', { me })} <San san={last.masterSan} color={side} />{t('guess.too.after')}
                  </>
                ) : (
                  <>
                    {t('guess.you')} <San san={last.guessSan} color={side} />{t('guess.semicolon', { me })} <San san={last.masterSan} color={side} />.
                  </>
                )}
              </p>
            </>
          )}
          {s.status === 'finished' && (
            <p className="coach-summary verdict-good">
              {t('guess.over', { points: score.points, max: score.max, pct: Math.round(score.percent), matched: score.matched, guessed: score.guessed, me })}
            </p>
          )}
          <div className="coach-actions">
            {s.status === 'revealed' && (
              <button className="primary" onClick={() => void guessNext()}>
                {s.step + 1 < s.indices.length ? t('common.nextMove') : t('guess.result')}
              </button>
            )}
            {s.status === 'finished' && (
              <button className="primary" onClick={() => void startGuess(s.sourceId.startsWith('pasted:') ? { pgn: game.pgn } : { id: s.sourceId }, side)}>
                {t('guess.again')}
              </button>
            )}
            <button onClick={leaveGuess}>{s.status === 'finished' ? t('guess.others') : t('common.stop')}</button>
          </div>
        </section>
      </aside>
    </div>
  );
}
