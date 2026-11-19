import { useCallback, useEffect, useMemo } from 'react';
import { useStore, type EndgamesState } from '../app/store';
import { materialText, type EndgameDrill } from '../core/endgame';
import { formatLine, type Arrow } from '../core/explain';
import { Board } from './Board';
import { t } from '../i18n';
import { sideLower } from './names';


/** Endgames from your games that you were winning (or drawing) and let slip, to play again against Stockfish. */
export function EndgamesView() {
  const { endgames } = useStore();
  const { openEndgames } = useStore.getState();

  useEffect(() => {
    if (!endgames) void openEndgames();
  }, [endgames, openEndgames]);

  if (!endgames) return <p className="muted">{t('common.loading')}</p>;
  if (endgames.session || endgames.thinking) return <Drill state={endgames} />;
  return <DrillList state={endgames} />;
}

function bestResult(d: EndgameDrill): { text: string; cls: string } {
  if (d.attempts.some((a) => a.result === 'success')) return { text: d.goal === 'win' ? t('endgames.converted') : t('endgames.held'), cls: 'verdict-good' };
  const tries = d.attempts.filter((a) => a.result !== 'stopped').length;
  if (tries) return { text: t('endgames.tries', { count: tries }), cls: 'verdict-bad' };
  return { text: t('endgames.new'), cls: 'muted' };
}

function DrillList({ state }: { state: EndgamesState }) {
  const { startEndgameDrill, setView } = useStore.getState();
  return (
    <div className="card narrow endgames">
      <h1>{t('endgames.title')}</h1>
      <p>{t('endgames.intro')}</p>
      {state.drills.length === 0 ? (
        <p className="muted">
          {t('endgames.none')}
        </p>
      ) : (
        <ul className="drill-list">
          {state.drills.map((d) => {
            const g = state.games[d.gameId];
            const r = bestResult(d);
            return (
              <li key={d.id}>
                <button className="drill" onClick={() => void startEndgameDrill(d.id)}>
                  <span className="drill-goal">{t(d.goal === 'win' ? 'endgames.goal.win' : 'endgames.goal.draw')}</span>
                  <span className="drill-material">{materialText(d.fen, d.color)}</span>
                  <span className="muted small">
                    {t('endgames.against', { name: g?.opponent ?? '?' })}
                    {g?.date ? ` · ${g.date}` : ''} · {t('endgames.forYou', { pct: Math.round(d.winBefore) })}
                  </span>
                  <span className={`drill-result small ${r.cls}`}>{r.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="link" onClick={() => setView('training')}>{t('common.backToTraining')}</button>
    </div>
  );
}

function Drill({ state }: { state: EndgamesState }) {
  const { endgameMove, endgameHint, startEndgameDrill, leaveEndgame } = useStore.getState();
  const s = state.session;
  const onMove = useCallback((uci: string) => void endgameMove(uci), [endgameMove]);
  const last = s?.line[s.line.length - 1];
  const arrows = useMemo<Arrow[]>(() => {
    const out: Arrow[] = [];
    if (state.hintUci) out.push({ from: state.hintUci.slice(0, 2), to: state.hintUci.slice(2, 4), brush: 'best' });
    if (s?.status === 'failed' && s.better) out.push({ from: s.better.uci.slice(0, 2), to: s.better.uci.slice(2, 4), brush: 'best' });
    return out;
  }, [state.hintUci, s]);

  if (!s) return <p className="muted">{t('endgames.setup')}</p>;
  const { drill } = s;
  const g = state.games[drill.gameId];
  const playing = s.status === 'your-move' && !state.thinking;

  return (
    <div className="training">
      <div className="training-board">
        <p className="muted small">
          {materialText(s.fen, drill.color)} · {t('endgames.against', { name: g?.opponent ?? '?' })}
          {g?.date ? ` (${g.date})` : ''}
        </p>
        <Board
          fen={s.fen}
          orientation={drill.color}
          {...(last ? { lastMove: last.uci } : {})}
          arrows={arrows}
          {...(playing ? { onMove } : {})}
        />
      </div>
      <aside className="training-side">
        <section className="coach" aria-live="polite">
          <h2 className="coach-title">{drill.goal === 'win' ? t('endgames.winTitle') : t('endgames.goal.draw')}</h2>
          <p className="muted small">
            {t(drill.goal === 'win' ? 'endgames.story.win' : 'endgames.story.draw', { san: drill.playedSan })}{' '}
            {t('endgames.youPlay', { side: sideLower(drill.color) })}
          </p>
          {s.line.length > 0 && <p className="coach-detail endgame-moves">{formatLine(s.line, 200)}</p>}
          {state.thinking && <p className="coach-summary">{t('common.stockfishThinking')}</p>}
          {playing && (
            <p className="coach-summary">
              {t('common.yourMove')}{' '}
              {drill.goal === 'draw' && s.playerMoves > 0 && <span className="muted small">{t('endgames.toHold', { count: 25 - s.playerMoves })}</span>}
            </p>
          )}
          {s.status === 'success' && <p className="coach-summary verdict-good">{s.message}</p>}
          {s.status === 'failed' && (
            <>
              <p className="coach-summary verdict-bad">{s.message}</p>
              {s.winBefore !== undefined && s.winAfter !== undefined && (
                <p className="coach-detail">
                  {s.reply ? `${t('endgames.answers', { san: s.reply.san })} ` : ''}
                  {t('explain.winText', { before: `${Math.round(s.winBefore)}${t('common.percent')}`, after: `${Math.round(s.winAfter)}${t('common.percent')}` })}
                  {s.better ? ` ${t('endgames.better', { san: s.better.san })}` : ''}
                </p>
              )}
            </>
          )}
          <div className="coach-actions">
            {playing && <button onClick={endgameHint}>{t('common.hint')}</button>}
            {s.status !== 'your-move' && (
              <button className="primary" onClick={() => void startEndgameDrill(drill.id)}>
                {t('endgames.again')}
              </button>
            )}
            <button onClick={() => void leaveEndgame()}>{s.status === 'your-move' ? t('common.stop') : t('endgames.backToList')}</button>
          </div>
        </section>
      </aside>
    </div>
  );
}
