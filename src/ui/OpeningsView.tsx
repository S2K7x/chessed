import { useCallback, useEffect, useMemo } from 'react';
import { useStore, type OpeningsState } from '../app/store';
import type { Color } from '../core/eval';
import type { Arrow } from '../core/explain';
import { Board } from './Board';
import { San } from './San';

/** The opening trainer: your repertoire, from your own games. */
export function OpeningsView() {
  const { openings } = useStore();
  const { openOpenings } = useStore.getState();
  useEffect(() => {
    if (!openings) void openOpenings();
  }, [openings, openOpenings]);
  if (!openings) return <p className="muted">Loading…</p>;
  if (openings.session) return <Session state={openings} />;
  return <Start state={openings} />;
}

function Start({ state }: { state: OpeningsState }) {
  const { startOpeningLine, setView } = useStore.getState();
  const sides = (['white', 'black'] as const).filter((c) => state.games[c] > 0);
  return (
    <div className="card narrow">
      <h1>Your openings</h1>
      <p>
        The app plays the replies your opponents actually chose; you play the move you usually play. When your usual move was
        judged an error, the better move is the one to learn. Positions you get wrong come back more often.
      </p>
      {sides.length === 0 && (
        <p className="muted">No game of yours yet. Set your username in Settings and review a few games: the trainer is built from them.</p>
      )}
      <div className="opening-sides">
        {sides.map((c) => (
          <section key={c} className="mode-card">
            <p className="mode-kicker">As {c}</p>
            <h2>{state.coverage[c].known} / {state.coverage[c].positions}</h2>
            <p className="muted small">
              positions known · from {state.games[c]} game{state.games[c] > 1 ? 's' : ''}
            </p>
            <button className="primary" onClick={() => void startOpeningLine(c)}>
              Train as {c}
            </button>
          </section>
        ))}
      </div>
      <button className="link" onClick={() => setView('training')}>Back to training</button>
    </div>
  );
}

function lineText(line: { san: string; fenBefore: string }[], color: Color) {
  return line.map((m, i) => {
    const [, turn, , , , full] = m.fenBefore.split(' ');
    const mover: Color = turn === 'w' ? 'white' : 'black';
    return (
      <span key={i} className={mover === color ? 'line-mine' : 'line-theirs'}>
        {turn === 'w' ? `${full}. ` : i === 0 ? `${full}… ` : ''}
        <San san={m.san} color={mover} />{' '}
      </span>
    );
  });
}

function Session({ state }: { state: OpeningsState }) {
  const s = state.session!;
  const { openingMove, openingContinue, startOpeningLine, leaveOpening } = useStore.getState();
  const onMove = useCallback((uci: string) => void openingMove(uci), [openingMove]);
  const last = s.line[s.line.length - 1];
  const arrows = useMemo<Arrow[]>(
    () => (s.status === 'wrong' && s.expected ? [{ from: s.expected.uci.slice(0, 2), to: s.expected.uci.slice(2, 4), brush: 'best' }] : []),
    [s.status, s.expected],
  );
  return (
    <div className="training">
      <div className="training-board">
        <p className="muted small">
          As {s.color} · {s.right} right, {s.wrong} wrong
        </p>
        <Board fen={s.fen} orientation={s.color} {...(last ? { lastMove: last.uci } : {})} arrows={arrows} {...(s.status === 'your-move' ? { onMove } : {})} />
      </div>
      <aside className="training-side">
        <section className="coach" aria-live="polite">
          <p className="coach-kicker">Your openings</p>
          <p className="opening-line">{s.line.length ? lineText(s.line, s.color) : <span className="muted">Starting position</span>}</p>
          {s.status === 'your-move' && (
            <>
              {s.last?.right && <p className="coach-summary verdict-good">Right: {s.last.san}.</p>}
              <h2 className="coach-title">Your move: what do you play here?</h2>
            </>
          )}
          {s.status === 'wrong' && s.expected && (
            <>
              <p className="coach-summary verdict-bad">
                {s.last?.san} is not your repertoire move. Play {s.expected.san}.
              </p>
              {s.expected.usualError && (
                <p className="coach-detail">
                  You usually play {s.expected.usualError} here, and it was judged an error in your games: {s.expected.san} is the better
                  move to learn.
                </p>
              )}
            </>
          )}
          {s.status === 'end' && (
            <p className="coach-summary">
              {s.endReason} {s.right} right, {s.wrong} wrong.
            </p>
          )}
          <div className="coach-actions">
            {s.status === 'wrong' && (
              <button className="primary" onClick={openingContinue}>
                Continue with {s.expected?.san}
              </button>
            )}
            {s.status === 'end' && (
              <button className="primary" onClick={() => void startOpeningLine(s.color)}>
                Another line
              </button>
            )}
            <button onClick={leaveOpening}>{s.status === 'end' ? 'Done' : 'Stop'}</button>
          </div>
        </section>
      </aside>
    </div>
  );
}
