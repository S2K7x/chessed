import { useCallback, useMemo } from 'react';
import { useStore } from '../app/store';
import { formatLine, type Arrow } from '../core/explain';
import { hintsFor, threatHintsFor } from '../core/hints';
import { Board } from './Board';
import { ClassBadge } from './ClassBadge';
import type { Classification } from '../core/classify';

const GRADE_TEXT = { easy: 'Easy', good: 'Good', hard: 'Hard', again: 'To review again soon' } as const;

/** Daily review of the player's own mistakes (spaced repetition). */
export function TrainingView() {
  const { training, dueCount, today, settings } = useStore();
  const { startTraining, trainingAttempt, trainingHint, trainingGiveUp, trainingNext, setView, openWoodpecker, openEndgames, openGuess, openOpenings, endTraining } = useStore.getState();
  const ex = training?.queue[training.index];
  const move = training?.move;
  const isThreat = ex?.kind === 'threat';
  const hintsOf = isThreat ? threatHintsFor : hintsFor;

  const arrows = useMemo(() => {
    const out: Arrow[] = [];
    if (!training || !move) return out;
    if (training.status === 'solving' || training.status === 'judging') {
      for (const h of hintsOf(move).slice(0, training.hints)) {
        if (h.arrow) out.push({ ...h.arrow, brush: 'best' });
        else if (h.circle) out.push({ from: h.circle, to: h.circle, brush: 'best' });
      }
      const r = training.verdict?.refutation[0];
      if (r && training.verdict?.result !== 'solved') out.push({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), brush: 'threat' });
    } else if (isThreat) {
      const r = move.facts.find((f) => f.kind === 'material_lost' || f.kind === 'mate_allowed');
      const first = r && 'line' in r ? r.line[0] : undefined;
      if (first) out.push({ from: first.uci.slice(0, 2), to: first.uci.slice(2, 4), brush: 'threat' });
    } else {
      const b = move.bestLine[0];
      if (b) out.push({ from: b.uci.slice(0, 2), to: b.uci.slice(2, 4), brush: 'best' });
    }
    return out;
  }, [training, move, isThreat, hintsOf]);

  const onMove = useCallback((uci: string) => void trainingAttempt(uci), [trainingAttempt]);

  if (!training) {
    return (
      <div className="training-hub">
        <header className="hub-header">
          <h1>Training</h1>
          <p className="muted">Five ways to turn your games into skill. Everything runs on your device.</p>
          <Goal done={today?.positions ?? 0} goal={settings.dailyGoal} />
        </header>
        <section className="mode-card">
          <p className="mode-kicker">Spaced review</p>
          <h2>Your mistakes</h2>
          <p>Your mistakes come back as positions to solve, spaced out over days so that you remember the idea.</p>
          <button className="primary" onClick={() => void startTraining()} disabled={dueCount === 0}>
            {dueCount > 0 ? `Review ${Math.min(10, dueCount)} positions` : 'Nothing due today'}
          </button>
        </section>
        <section className="mode-card">
          <p className="mode-kicker">Speed</p>
          <h2>Woodpecker</h2>
          <p>Solve the same set of your positions in cycles, each one faster than the last, until the patterns are automatic.</p>
          <button onClick={() => void openWoodpecker()}>Open Woodpecker</button>
        </section>
        <section className="mode-card">
          <p className="mode-kicker">Technique</p>
          <h2>Endgames</h2>
          <p>Play again the endgames you were winning and did not win, or the draws you lost, against Stockfish.</p>
          <button onClick={() => void openEndgames()}>Open endgames</button>
        </section>
        <section className="mode-card">
          <p className="mode-kicker">Repertoire</p>
          <h2>Your openings</h2>
          <p>Replay your openings against the replies your opponents actually chose, and learn the better move where yours was an error.</p>
          <button onClick={() => void openOpenings()}>Train your openings</button>
        </section>
        <section className="mode-card">
          <p className="mode-kicker">Understanding</p>
          <h2>Guess the move</h2>
          <p>Follow a master game from one side and guess each move. A different move still scores when the engine finds it as good.</p>
          <button onClick={() => void openGuess()}>Guess the move</button>
        </section>
      </div>
    );
  }

  if (training.status === 'finished' || !ex) {
    const n = training.results.length;
    return (
      <div className="card narrow">
        <h1>{n ? 'Session done' : 'Nothing to review'}</h1>
        {n > 0 && (
          <p>
            {training.results.filter((g) => g !== 'again').length} of {n} positions solved. They will come back when you are about to forget them.
          </p>
        )}
        {n === 0 && <p className="muted">No position is due. Review more games: each mistake of yours becomes a training position.</p>}
        <Goal done={today?.positions ?? 0} goal={settings.dailyGoal} />
        <div className="coach-actions">
          <button className="primary" onClick={() => setView('progress')}>See your progress</button>
          {dueCount > 0 && <button onClick={() => void startTraining()}>Another round</button>}
          <button onClick={endTraining}>Back to training</button>
        </div>
      </div>
    );
  }

  const solving = training.status === 'solving' || training.status === 'judging';
  const v = training.verdict;
  const game = training.game;
  // On a blunder-check card `ex.color` is the opponent's: the player is the other side.
  const playerColor = isThreat ? (ex.color === 'white' ? 'black' : 'white') : ex.color;
  const opponent = game ? (playerColor === 'white' ? game.black.name : game.white.name) : '';
  return (
    <div className="training">
      <div className="training-board">
        <p className="muted small">
          Position {training.index + 1} of {training.queue.length}
          {ex.theme ? ` · ${ex.theme}` : ''}
        </p>
        <Board
          fen={ex.fen}
          orientation={playerColor}
          {...(isThreat && move ? { lastMove: move.uci } : {})}
          arrows={arrows} {...(solving && training.status === 'solving' ? { onMove } : {})} />
      </div>
      <aside className="training-side">
        <section className="coach" aria-live="polite">
          <p className="coach-kicker">
            <ClassBadge c={ex.classification as Classification} /> From your game against {opponent}
            {game?.date ? ` (${game.date})` : ''}
          </p>
          <h2 className="coach-title">
            {isThreat
              ? `You played ${ex.playedSan}. Your opponent to move: how do they punish it?`
              : `${ex.color === 'white' ? 'White' : 'Black'} to play. Find the best move.`}
          </h2>
          {isThreat && <p className="muted small">Blunder check: find your opponent's best reply.</p>}
          {training.status === 'judging' && <p className="coach-summary">Checking your move…</p>}
          {solving && v && v.result !== 'solved' && (
            <p className={`coach-summary ${v.result === 'close' ? 'verdict-close' : 'verdict-bad'}`}>
              {v.san} {v.result === 'close' ? 'is close, but there is better.' : `does not work: ${formatLine(v.refutation, 4)}.`}
              {v.explanation ? ` ${v.explanation.summary}` : ''}
            </p>
          )}
          {solving &&
            move &&
            hintsOf(move)
              .slice(0, training.hints)
              .map((h, i) => (
                <p key={i} className="hint-line">
                  <strong>Hint {i + 1}.</strong> {h.text}
                </p>
              ))}
          {training.status === 'solved' && (
            <>
              <p className="coach-summary verdict-good">
                {isThreat ? `Correct: ${v?.san} punishes ${ex.playedSan}.` : `Correct: ${v?.san}. In the game you played ${ex.playedSan}.`}
              </p>
              <p className="muted small">Recorded as: {GRADE_TEXT[training.results[training.results.length - 1] ?? 'good']}.</p>
            </>
          )}
          {training.status === 'failed' && (
            <p className="coach-summary">
              {isThreat
                ? `Your opponent could play ${ex.bestSan}. This position will come back soon.`
                : `The move was ${ex.bestSan}. In the game you played ${ex.playedSan}. This position will come back soon.`}
            </p>
          )}
          {!solving && move && (
            <>
              <p className="coach-detail">{move.explanation.summary}</p>
              {move.explanation.lesson && (
                <p className="coach-lesson">
                  <strong>Lesson.</strong> {move.explanation.lesson}
                </p>
              )}
            </>
          )}
          <div className="coach-actions">
            {solving && training.hints < 3 && <button onClick={trainingHint}>Hint</button>}
            {solving && <button onClick={() => void trainingGiveUp()}>Show the answer</button>}
            <button onClick={endTraining}>Stop</button>
            {!solving && move && move.bestLine.length > 1 && (
              <p className="muted small">Best line: {formatLine(move.bestLine, 8)}</p>
            )}
            {!solving && (
              <button className="primary" onClick={() => void trainingNext()}>
                {training.index + 1 < training.queue.length ? 'Next position' : 'Finish'}
              </button>
            )}
          </div>
        </section>
      </aside>
    </div>
  );
}

/** Today's progress towards the daily goal. */
function Goal({ done, goal }: { done: number; goal: number }) {
  return (
    <div className="goal" aria-label="Daily goal">
      <span>
        Today: {Math.min(done, goal)} / {goal} positions
        {done >= goal ? ' · goal reached' : ''}
      </span>
      <div className="progress">
        <div className="progress-fill" style={{ width: `${Math.min(100, (100 * done) / goal)}%` }} />
      </div>
    </div>
  );
}
