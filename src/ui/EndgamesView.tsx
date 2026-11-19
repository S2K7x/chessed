import { useCallback, useEffect, useMemo } from 'react';
import { useStore, type EndgamesState } from '../app/store';
import { materialText, type EndgameDrill } from '../core/endgame';
import { formatLine, type Arrow } from '../core/explain';
import { Board } from './Board';

const GOAL_TEXT = { win: 'Win it', draw: 'Hold the draw' } as const;

/** Endgames from your games that you were winning (or drawing) and let slip, to play again against Stockfish. */
export function EndgamesView() {
  const { endgames } = useStore();
  const { openEndgames } = useStore.getState();

  useEffect(() => {
    if (!endgames) void openEndgames();
  }, [endgames, openEndgames]);

  if (!endgames) return <p className="muted">Loading…</p>;
  if (endgames.session || endgames.thinking) return <Drill state={endgames} />;
  return <DrillList state={endgames} />;
}

function bestResult(d: EndgameDrill): { text: string; cls: string } {
  if (d.attempts.some((a) => a.result === 'success')) return { text: d.goal === 'win' ? 'Converted' : 'Held', cls: 'verdict-good' };
  const tries = d.attempts.filter((a) => a.result !== 'stopped').length;
  if (tries) return { text: `${tries} ${tries === 1 ? 'try' : 'tries'}`, cls: 'verdict-bad' };
  return { text: 'New', cls: 'muted' };
}

function DrillList({ state }: { state: EndgamesState }) {
  const { startEndgameDrill, setView } = useStore.getState();
  return (
    <div className="card narrow endgames">
      <h1>Endgames</h1>
      <p>
        Endgames from your games that you were winning and did not win, or drawn endgames you lost. Play them again
        against Stockfish: convert the win (to mate, or to a queen or rook against a bare king), or hold the draw for{' '}
        25 moves.
      </p>
      {state.drills.length === 0 ? (
        <p className="muted">
          No such endgame yet. They come from your reviewed games where your username is set in Settings.
        </p>
      ) : (
        <ul className="drill-list">
          {state.drills.map((d) => {
            const g = state.games[d.gameId];
            const r = bestResult(d);
            return (
              <li key={d.id}>
                <button className="drill" onClick={() => void startEndgameDrill(d.id)}>
                  <span className="drill-goal">{GOAL_TEXT[d.goal]}</span>
                  <span className="drill-material">{materialText(d.fen, d.color)}</span>
                  <span className="muted small">
                    against {g?.opponent ?? '?'}
                    {g?.date ? ` · ${g.date}` : ''} · {Math.round(d.winBefore)}% for you
                  </span>
                  <span className={`drill-result small ${r.cls}`}>{r.text}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="link" onClick={() => setView('training')}>Back to training</button>
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

  if (!s) return <p className="muted">Setting up the position…</p>;
  const { drill } = s;
  const g = state.games[drill.gameId];
  const playing = s.status === 'your-move' && !state.thinking;

  return (
    <div className="training">
      <div className="training-board">
        <p className="muted small">
          {materialText(s.fen, drill.color)} · against {g?.opponent ?? '?'}
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
          <h2 className="coach-title">{drill.goal === 'win' ? 'Win this endgame' : 'Hold the draw'}</h2>
          <p className="muted small">
            In the game you played {drill.playedSan} here and the {drill.goal === 'win' ? 'win slipped away' : 'draw was lost'}.
            You play {drill.color}; Stockfish plays the other side.
          </p>
          {s.line.length > 0 && <p className="coach-detail endgame-moves">{formatLine(s.line, 200)}</p>}
          {state.thinking && <p className="coach-summary">Stockfish is thinking…</p>}
          {playing && (
            <p className="coach-summary">
              Your move.{' '}
              {drill.goal === 'draw' && s.playerMoves > 0 && <span className="muted small">{25 - s.playerMoves} moves to hold.</span>}
            </p>
          )}
          {s.status === 'success' && <p className="coach-summary verdict-good">{s.message}</p>}
          {s.status === 'failed' && (
            <>
              <p className="coach-summary verdict-bad">{s.message}</p>
              {s.winBefore !== undefined && s.winAfter !== undefined && (
                <p className="coach-detail">
                  {s.reply ? `Stockfish answers ${s.reply.san}. ` : ''}
                  Your winning chances went from {Math.round(s.winBefore)}% to {Math.round(s.winAfter)}%.
                  {s.better ? ` ${s.better.san} was better.` : ''}
                </p>
              )}
            </>
          )}
          <div className="coach-actions">
            {playing && <button onClick={endgameHint}>Hint</button>}
            {s.status !== 'your-move' && (
              <button className="primary" onClick={() => void startEndgameDrill(drill.id)}>
                Try again
              </button>
            )}
            <button onClick={() => void leaveEndgame()}>{s.status === 'your-move' ? 'Stop' : 'Back to the list'}</button>
          </div>
        </section>
      </aside>
    </div>
  );
}
