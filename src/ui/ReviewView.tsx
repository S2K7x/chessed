import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../app/store';
import type { Arrow } from '../core/explain';
import { Board } from './Board';
import { CoachPanel } from './CoachPanel';
import { EvalBar } from './EvalBar';
import { EvalGraph } from './EvalGraph';
import { MoveList } from './MoveList';
import { hintsFor } from '../core/hints';
import { describeThreat } from '../core/threat';

export function ReviewView() {
  const { game, review, cursor, orientation, lineView, retry, liveWins, myColor, playout, hintsShown, showThreats, threats } = useStore();
  const { goTo, step, flip, closeLine, endRetry, submitAttempt, toggleAutoplay, stepLine, playoutMove, endPlayout, toggleThreats, loadThreat } = useStore.getState();

  // Autoplay of a line: one move every 900 ms.
  const playing = lineView?.playing ?? false;
  useEffect(() => {
    if (!playing) return;
    const id = window.setInterval(() => stepLine(1), 900);
    return () => window.clearInterval(id);
  }, [playing, stepLine]);

  const onKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === 'ArrowLeft') step(-1);
      else if (e.key === 'ArrowRight') step(1);
      else if (e.key === 'Home') goTo(0);
      else if (e.key === 'End') goTo(Number.MAX_SAFE_INTEGER);
      else if (e.key === 'f') flip();
      else if (e.key === 'x') toggleThreats();
      else if (e.key === ' ' && lineView) toggleAutoplay();
      else if (e.key === 'Escape') {
        if (lineView) closeLine();
        else if (playout) endPlayout();
        else if (retry) endRetry();
      } else return;
      e.preventDefault();
    },
    [lineView, retry, playout, step, goTo, flip, closeLine, endRetry, endPlayout, toggleAutoplay, toggleThreats],
  );
  useEffect(() => {
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onKey]);

  // On narrow screens the board sits above the coach panel: bring it into view
  // when an exercise or a line starts, since the user must look at (or play on) it.
  const boardArea = useRef<HTMLDivElement>(null);
  const focusKey = retry ? `retry-${retry.moveIndex}` : lineView ? `line-${lineView.line.label}` : undefined;
  useEffect(() => {
    const el = boardArea.current;
    if (!focusKey || !el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 0 || r.bottom > window.innerHeight) {
      el.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    }
  }, [focusKey]);

  const board = useMemo(() => {
    if (!game) return undefined;
    if (playout) {
      const last = playout.history[playout.history.length - 1];
      return { fen: playout.fen, lastMove: last, arrows: [] as Arrow[], evalIndex: undefined, interactive: playout.status === 'user', playout: true };
    }
    if (lineView) {
      const { line, index } = lineView;
      const played = line.moves[index - 1];
      const next = line.moves[index];
      const arrows: Arrow[] = next ? [{ from: next.uci.slice(0, 2), to: next.uci.slice(2, 4), brush: 'best' }] : [];
      return { fen: played ? played.fenAfter : line.fen, lastMove: played?.uci, arrows, evalIndex: undefined };
    }
    if (retry) {
      const m = game.moves[retry.moveIndex]!;
      const prev = game.moves[retry.moveIndex - 1];
      const arrows: Arrow[] = [];
      const v = retry.verdict;
      if (v && v.result !== 'solved' && v.refutation[0]) {
        const r = v.refutation[0];
        arrows.push({ from: r.uci.slice(0, 2), to: r.uci.slice(2, 4), brush: 'threat' });
      }
      if (review && retry.status !== 'done') {
        const hints = hintsFor(review.moves[retry.moveIndex]!).slice(0, hintsShown);
        for (const h of hints) {
          if (h.arrow) arrows.push({ ...h.arrow, brush: 'best' });
          else if (h.circle) arrows.push({ from: h.circle, to: h.circle, brush: 'best' });
        }
      }
      return { fen: m.fenBefore, lastMove: prev?.uci, arrows, evalIndex: retry.moveIndex, interactive: retry.status === 'solving' };
    }
    const m = game.moves[cursor - 1];
    const arrows = cursor > 0 ? review?.moves[cursor - 1]?.explanation.arrows.filter((a) => a.brush !== 'played') ?? [] : [];
    return { fen: m ? m.fenAfter : game.startFen, lastMove: m?.uci, arrows, evalIndex: cursor };
  }, [game, review, cursor, lineView, retry, playout, hintsShown]);

  // The opponent's threat in the position shown (null-move search), on demand.
  const threatFen = showThreats && board && !retry && !playout ? board.fen : undefined;
  useEffect(() => {
    if (threatFen) void loadThreat(threatFen);
  }, [threatFen, loadThreat]);
  const threat = threatFen ? threats[threatFen] : undefined;
  const threatArrows: Arrow[] =
    threat && typeof threat === 'object' && 'kind' in threat && threat.kind !== 'none' && threat.line[0]
      ? [{ from: threat.line[0].uci.slice(0, 2), to: threat.line[0].uci.slice(2, 4), brush: 'threat' }]
      : [];

  const onMove = useCallback(
    (uci: string) => void (useStore.getState().playout ? playoutMove(uci) : submitAttempt(uci)),
    [submitAttempt, playoutMove],
  );

  if (!game || !board) return null;
  const evaluation = board.evalIndex !== undefined ? review?.evals[board.evalIndex] : undefined;
  const top = orientation === 'white' ? game.black : game.white;
  const bottom = orientation === 'white' ? game.white : game.black;
  const topColor = orientation === 'white' ? 'black' : 'white';
  const bottomColor = orientation;

  return (
    <div className="review">
      <div className="review-board" ref={boardArea}>
        <PlayerStrip name={top.name} elo={top.elo} color={topColor} accuracy={review?.accuracy[topColor]} isMe={myColor === topColor} />
        <div className="board-row">
          <EvalBar evaluation={evaluation} orientation={orientation} />
          <Board fen={board.fen} orientation={orientation} lastMove={board.lastMove} arrows={threatArrows.length ? [...board.arrows.filter((a) => a.brush !== 'threat'), ...threatArrows] : board.arrows} onMove={'interactive' in board && board.interactive ? onMove : undefined} />
        </div>
        <PlayerStrip name={bottom.name} elo={bottom.elo} color={bottomColor} accuracy={review?.accuracy[bottomColor]} isMe={myColor === bottomColor} />
        <div className="board-controls" role="toolbar" aria-label="Navigation">
          <button onClick={() => goTo(0)} aria-label="First position">⏮</button>
          <button onClick={() => step(-1)} aria-label="Previous move">◀</button>
          <button onClick={() => step(1)} aria-label="Next move">▶</button>
          <button onClick={() => goTo(Number.MAX_SAFE_INTEGER)} aria-label="Last position">⏭</button>
          <button onClick={flip} aria-label="Flip board">⇅</button>
          <button onClick={toggleThreats} aria-pressed={showThreats} title="What does the opponent threaten? (x)">
            Threat
          </button>
        </div>
        {threatFen && (
          <p className="threat-line" role="status">
            {!threat || threat === 'loading'
              ? 'Looking for threats…'
              : threat === 'none-in-check'
                ? 'The side to move is in check: deal with it first.'
                : 'error' in threat
                  ? threat.error
                  : describeThreat(threat)}
          </p>
        )}
        <EvalGraph wins={review?.whiteWins ?? liveWins} total={game.moves.length + 1} moves={review?.moves} cursor={retry ? retry.moveIndex : cursor} onSelect={goTo} />
      </div>
      <aside className="review-side">
        <GameHeader />
        <CoachPanel game={game} review={review} />
        <MoveList game={game} moves={review?.moves} cursor={cursor} onSelect={goTo} />
      </aside>
    </div>
  );
}

function PlayerStrip({ name, elo, color, accuracy, isMe }: { name: string; elo?: number; color: 'white' | 'black'; accuracy?: number; isMe: boolean }) {
  return (
    <div className="player">
      <span className={`player-dot is-${color}`} aria-hidden />
      <span className="player-name">{name}</span>
      {elo ? <span className="muted">({elo})</span> : null}
      {isMe ? <span className="tag">you</span> : null}
      {accuracy !== undefined ? <span className="player-acc">{accuracy.toFixed(1)}</span> : null}
    </div>
  );
}

function GameHeader() {
  const { game, review } = useStore();
  const { exportAnnotatedPgn } = useStore.getState();
  if (!game) return null;
  const bits = [game.result, game.timeControl?.speed, game.date, game.source !== 'pgn' ? game.source === 'lichess' ? 'Lichess' : 'Chess.com' : undefined].filter(Boolean);
  const opening = review?.opening?.name ?? game.openingName;
  return (
    <header className="game-header">
      <h1 className="game-title">
        {game.white.name} <span className="muted">vs</span> {game.black.name}
      </h1>
      <p className="muted">
        {bits.join(' · ')}
        {opening ? ` · ${opening}` : ''}
        {game.sourceUrl ? (
          <>
            {' · '}
            <a href={game.sourceUrl} target="_blank" rel="noreferrer">source</a>
          </>
        ) : null}
        {review ? (
          <>
            {' · '}
            <button className="link" onClick={exportAnnotatedPgn}>Export annotated PGN</button>
          </>
        ) : null}
      </p>
    </header>
  );
}
