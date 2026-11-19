import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStore, type WoodpeckerItem } from '../app/store';
import { sanToUci } from '../core/chess';
import type { Arrow } from '../core/explain';
import {
  canStartCycle,
  currentCycle,
  cycleStats,
  formatDuration,
  lastFinishedCycle,
  targetMs,
  WOODPECKER_MAX_CYCLES,
  WOODPECKER_MIN_SET,
  type WoodpeckerSet,
} from '../core/woodpecker';
import { Board } from './Board';
import { useBlindfold } from './Blindfold';

const SIZES = [25, 50, 100];

/** The target time, when it is long enough to mean something. */
const shownTarget = (set: WoodpeckerSet) => {
  const t = targetMs(set);
  return t !== undefined && t >= 1000 ? t : undefined;
};

/** The Woodpecker method: the same positions, solved again in faster and faster cycles. */
export function WoodpeckerView() {
  const { woodpecker } = useStore();
  const { openWoodpecker } = useStore.getState();

  useEffect(() => {
    if (!woodpecker) void openWoodpecker();
  }, [woodpecker, openWoodpecker]);

  if (!woodpecker) return <p className="muted">Loading…</p>;
  if (woodpecker.item && woodpecker.set) return <Solving set={woodpecker.set} item={woodpecker.item} />;
  if (woodpecker.set) return <Overview set={woodpecker.set} available={woodpecker.available} />;
  return <NewSet available={woodpecker.available} />;
}

function Intro() {
  return (
    <p>
      Solve the same set of positions from your own games again and again. Each cycle, try to go about twice as fast
      as the last one, with as few errors as possible, so that the patterns become automatic. One try per position;
      only the time spent on the positions counts.
    </p>
  );
}

function SizeButtons({ available, label }: { available: number; label: (n: number) => string }) {
  const { newWoodpeckerSet } = useStore.getState();
  const sizes = [...SIZES.filter((n) => n < available), available];
  return (
    <div className="coach-actions">
      {sizes.map((n, i) => (
        <button key={n} className={i === 0 ? 'primary' : ''} onClick={() => void newWoodpeckerSet(n)}>
          {label(n)}
        </button>
      ))}
    </div>
  );
}

function NewSet({ available }: { available: number }) {
  const { setView } = useStore.getState();
  return (
    <div className="card narrow">
      <h1>Woodpecker</h1>
      <Intro />
      {available >= WOODPECKER_MIN_SET ? (
        <>
          <p className="muted small">Choose the size of the set (your most recent training positions).</p>
          <SizeButtons available={available} label={(n) => (n === available ? `All ${n} positions` : `${n} positions`)} />
        </>
      ) : (
        <>
          <p className="muted">
            You need at least {WOODPECKER_MIN_SET} training positions; you have {available}. Review more of your games: each
            mistake becomes a position.
          </p>
          <button onClick={() => setView('home')}>Review games</button>
        </>
      )}
    </div>
  );
}

function Overview({ set, available }: { set: WoodpeckerSet; available: number }) {
  const { startWoodpeckerCycle, continueWoodpecker, setView } = useStore.getState();
  const [replacing, setReplacing] = useState(false);
  const cycle = currentCycle(set);
  const target = shownTarget(set);
  const last = lastFinishedCycle(set);
  const finishedAll = !cycle && set.cycles.length >= WOODPECKER_MAX_CYCLES;
  const hoursSinceLast = last?.finishedAt ? (Date.now() - last.finishedAt) / 3_600_000 : undefined;

  return (
    <div className="card narrow woodpecker">
      <h1>Woodpecker</h1>
      <p className="muted">
        {set.exerciseIds.length} positions · cycle {Math.min(set.cycles.length + (cycle ? 0 : 1), WOODPECKER_MAX_CYCLES)} of up to{' '}
        {WOODPECKER_MAX_CYCLES}
      </p>
      {set.cycles.length > 0 && (
        <table className="table">
          <thead>
            <tr>
              <th>Cycle</th>
              <th>Solved</th>
              <th>Time</th>
              <th>Finished</th>
            </tr>
          </thead>
          <tbody>
            {set.cycles.map((c) => {
              const st = cycleStats(set, c);
              return (
                <tr key={c.number}>
                  <td>{c.number}</td>
                  <td>
                    {st.solved}/{st.done}
                    {st.accuracy !== undefined ? ` (${Math.round(st.accuracy)}%)` : ''}
                  </td>
                  <td>{formatDuration(st.ms)}</td>
                  <td>{c.finishedAt ? new Date(c.finishedAt).toLocaleDateString() : `${st.done}/${st.total} so far`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {cycle && (
        <div className="coach-actions">
          <button className="primary" onClick={() => void continueWoodpecker()}>
            Continue cycle {cycle.number} ({cycle.results.length + 1} of {set.exerciseIds.length})
          </button>
        </div>
      )}
      {!cycle && canStartCycle(set) && (
        <>
          {set.cycles.length === 0 ? (
            <Intro />
          ) : (
            <p>
              Cycle {set.cycles.length} done.{' '}
              {target !== undefined && <>Aim for about {formatDuration(target)} in the next one, about half the time. </>}
              {hoursSinceLast !== undefined && hoursSinceLast < 20 && 'A day of rest between cycles helps the patterns settle.'}
            </p>
          )}
          <div className="coach-actions">
            <button className="primary" onClick={() => void startWoodpeckerCycle()}>
              Start cycle {set.cycles.length + 1}
            </button>
          </div>
        </>
      )}
      {finishedAll && (
        <p className="coach-summary verdict-good">
          All {WOODPECKER_MAX_CYCLES} cycles done. Start a new set with your latest positions.
        </p>
      )}

      <div className="woodpecker-footer">
        {replacing ? (
          <>
            <p className="muted small">The current set is kept in your history; the new one starts from cycle 1.</p>
            <SizeButtons available={available} label={(n) => (n === available ? `New set: all ${n}` : `New set: ${n}`)} />
            <button className="link" onClick={() => setReplacing(false)}>Cancel</button>
          </>
        ) : (
          <>
            <button className="link" onClick={() => setReplacing(true)}>Start a new set</button>
            {' · '}
            <button className="link" onClick={() => setView('training')}>Back to training</button>
          </>
        )}
      </div>
    </div>
  );
}

function Solving({ set, item }: { set: WoodpeckerSet; item: WoodpeckerItem }) {
  const { woodpeckerAttempt, woodpeckerNext, pauseWoodpecker } = useStore.getState();
  const { ex, move, game } = item;
  const isThreat = ex.kind === 'threat';
  const playerColor = isThreat ? (ex.color === 'white' ? 'black' : 'white') : ex.color;
  const cycle = currentCycle(set) ?? set.cycles[set.cycles.length - 1]!;
  const stats = cycleStats(set, cycle);
  const position = cycle.results.some((r) => r.exerciseId === ex.id) ? stats.done : stats.done + 1;
  const target = shownTarget(set);

  // A live clock: the cycle's time so far plus the current position.
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (item.status !== 'solving') return;
    const t = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(t);
  }, [item.status]);
  const elapsed = stats.ms + (item.status === 'solving' ? Math.max(0, now - item.shownAt) : 0);

  // A right answer moves on by itself; a wrong one waits so the answer can be studied.
  useEffect(() => {
    if (item.status !== 'right') return;
    const t = setTimeout(() => void woodpeckerNext(), 700);
    return () => clearTimeout(t);
  }, [item.status, woodpeckerNext]);

  const arrows = useMemo<Arrow[]>(() => {
    if (item.status !== 'wrong') return [];
    const uci = sanToUci(ex.fen, ex.bestSan);
    return uci ? [{ from: uci.slice(0, 2), to: uci.slice(2, 4), brush: isThreat ? 'threat' : 'best' }] : [];
  }, [item.status, ex, isThreat]);

  const onMove = useCallback((uci: string) => void woodpeckerAttempt(uci), [woodpeckerAttempt]);
  const blindfold = useBlindfold(item.status === 'solving' || item.status === 'judging' ? ex.id : undefined);
  const opponent = playerColor === 'white' ? game.black.name : game.white.name;
  const cycleOver = !currentCycle(set);

  return (
    <div className="training">
      <div className="training-board">
        <p className="muted small">
          Cycle {cycle.number} · position {position} of {set.exerciseIds.length}
        </p>
        <Board
          key={ex.id}
          fen={ex.fen}
          orientation={playerColor}
          {...(isThreat ? { lastMove: move.uci } : {})}
          arrows={arrows}
          blind={blindfold.hidden && item.status === 'solving'}
          {...(item.status === 'solving' ? { onMove } : {})}
        />
      </div>
      <aside className="training-side">
        <section className="coach" aria-live="polite">
          <p className="coach-kicker woodpecker-clock">
            <span className="clock" aria-label="Cycle time">{formatDuration(elapsed)}</span>
            {target !== undefined && <span className="muted small"> target {formatDuration(target)}</span>}
          </p>
          <h2 className="coach-title">
            {isThreat
              ? `You played ${ex.playedSan}. How does your opponent punish it?`
              : `${ex.color === 'white' ? 'White' : 'Black'} to play. Find the best move.`}
          </h2>
          <p className="muted small">From your game against {opponent}. One try.</p>
          {item.status === 'judging' && <p className="coach-summary">Checking {item.san}…</p>}
          {item.status === 'right' && <p className="coach-summary verdict-good">Right: {item.san}.</p>}
          {item.status === 'wrong' && (
            <>
              <p className="coach-summary verdict-bad">
                {item.san} is not it. The answer was {ex.bestSan}.
              </p>
              <p className="coach-detail">
                In the game you played {ex.playedSan}. {move.explanation.summary}
              </p>
            </>
          )}
          {item.status === 'solving' && blindfold.controls}
          <div className="coach-actions">
            {item.status === 'wrong' && (
              <button className="primary" onClick={() => void woodpeckerNext()}>
                {cycleOver ? 'Finish the cycle' : 'Next position'}
              </button>
            )}
            <button onClick={pauseWoodpecker}>Pause</button>
          </div>
        </section>
      </aside>
    </div>
  );
}
