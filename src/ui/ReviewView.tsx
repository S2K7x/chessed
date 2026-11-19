import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useStore } from '../app/store';
import type { Arrow } from '../core/explain';
import { Board, MoveInput } from './Board';
import { CoachPanel } from './CoachPanel';
import { EvalBar } from './EvalBar';
import { EvalGraph } from './EvalGraph';
import { MoveList } from './MoveList';
import { hintsFor } from '../core/hints';
import { describeThreat } from '../core/threat';
import { positionFromFen, terminalOf } from '../core/chess';
import { formatClock } from '../core/review';
import type { Game } from '../core/game';
import { Icon } from './icons';
import { ExplorePanel } from './ExplorePanel';
import { t } from '../i18n';
import { sideName, speedName } from './names';

export function ReviewView() {
  const { game, review, cursor, orientation, lineView, retry, liveWins, myColor, playout, hintsShown, showThreats, threats, explore, explorations } = useStore();
  const { goTo, step, flip, closeLine, endRetry, submitAttempt, toggleAutoplay, stepLine, playoutMove, endPlayout, toggleThreats, loadThreat, exploreMove, endExplore, loadExploration } =
    useStore.getState();

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
        else if (explore) endExplore();
      } else return;
      e.preventDefault();
    },
    [lineView, retry, playout, explore, step, goTo, flip, closeLine, endRetry, endPlayout, endExplore, toggleAutoplay, toggleThreats],
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
    if (explore) {
      const played = explore.moves[explore.index - 1];
      const start = explore.fromCursor > 0 ? game.moves[explore.fromCursor - 1]!.fenAfter : game.startFen;
      const fen = played ? played.fenAfter : start;
      const e = explorations[fen];
      const best = e && typeof e === 'object' && 'lines' in e ? e.lines[0]?.pv[0] : undefined;
      const arrows: Arrow[] = best ? [{ from: best.slice(0, 2), to: best.slice(2, 4), brush: 'best' }] : [];
      return { fen, lastMove: played?.uci ?? game.moves[explore.fromCursor - 1]?.uci, arrows, evalIndex: undefined, interactive: true, explore: true };
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
    // Any move played on the board starts an exploration from here.
    return { fen: m ? m.fenAfter : game.startFen, lastMove: m?.uci, arrows, evalIndex: cursor, interactive: true };
  }, [game, review, cursor, lineView, retry, playout, hintsShown, explore, explorations]);

  const exploreFen = explore && board ? board.fen : undefined;
  useEffect(() => {
    if (exploreFen) void loadExploration(exploreFen);
  }, [exploreFen, loadExploration]);

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
    (uci: string) => {
      const st = useStore.getState();
      if (st.playout) void playoutMove(uci);
      else if (st.retry) void submitAttempt(uci);
      else exploreMove(uci);
    },
    [submitAttempt, playoutMove, exploreMove],
  );

  if (!game || !board) return null;
  const explored = exploreFen ? explorations[exploreFen] : undefined;
  const evaluation =
    board.evalIndex !== undefined ? review?.evals[board.evalIndex] : explored && typeof explored === 'object' && 'lines' in explored ? explored : undefined;
  const { exportAnnotatedPgn, setView } = useStore.getState();
  const atEnd = !retry && !playout && !lineView && cursor >= game.moves.length;
  const top = orientation === 'white' ? game.black : game.white;
  const bottom = orientation === 'white' ? game.white : game.black;
  const topColor = orientation === 'white' ? 'black' : 'white';
  const bottomColor = orientation;

  return (
    <div className="review">
      <nav className="review-tools" aria-label={t('review.tools')}>
        <button className="tool" onClick={() => setView('home')}>
          <Icon name="plus" />
          {t('review.newGame')}
        </button>
        <button className="tool" onClick={() => setView('settings')}>
          <Icon name="settings" />
          {t('nav.settings')}
        </button>
        <button className="tool" onClick={flip} title={t('review.flipTitle')}>
          <Icon name="flip" />
          <span>
            {t('review.flip')}<kbd aria-hidden="true">F</kbd>
          </span>
        </button>
        <button className="tool" onClick={toggleThreats} aria-pressed={showThreats} title={t('review.threatTitle')}>
          <Icon name="threat" />
          <span>
            {t('review.threat')}<kbd aria-hidden="true">X</kbd>
          </span>
        </button>
        {review && (
          <button className="tool" onClick={exportAnnotatedPgn} aria-label={t('review.shareLabel')}>
            <Icon name="share" />
            {t('review.share')}
          </button>
        )}
      </nav>
      <div className="review-board" ref={boardArea}>
        <PlayerStrip game={game} color={topColor} cursor={cursor} accuracy={review?.accuracy[topColor]} isMe={myColor === topColor} />
        <div className="board-row">
          <EvalBar evaluation={evaluation} orientation={orientation} />
          <Board fen={board.fen} orientation={orientation} lastMove={board.lastMove} arrows={threatArrows.length ? [...board.arrows.filter((a) => a.brush !== 'threat'), ...threatArrows] : board.arrows} onMove={'interactive' in board && board.interactive ? onMove : undefined} moveInput={false} />
        </div>
        {'interactive' in board && board.interactive && <MoveInput fen={board.fen} onMove={onMove} />}
        <PlayerStrip game={game} color={bottomColor} cursor={cursor} accuracy={review?.accuracy[bottomColor]} isMe={myColor === bottomColor} />
        <div className="board-controls" role="toolbar" aria-label={t('review.navigation')}>
          <button onClick={() => goTo(0)} aria-label={t('review.first')}><Icon name="first" /></button>
          <button onClick={() => step(-1)} aria-label={t('review.prev')}><Icon name="prev" /></button>
          <button onClick={() => step(1)} aria-label={t('review.next')}><Icon name="next" /></button>
          <button onClick={() => goTo(Number.MAX_SAFE_INTEGER)} aria-label={t('review.last')}><Icon name="last" /></button>
        </div>
        {atEnd && <ResultBanner game={game} />}
        {threatFen && (
          <p className="threat-line" role="status">
            {!threat || threat === 'loading'
              ? t('review.threatLoading')
              : threat === 'none-in-check'
                ? t('review.inCheck')
                : 'error' in threat
                  ? threat.error
                  : describeThreat(threat)}
          </p>
        )}
        <EvalGraph wins={review?.whiteWins ?? liveWins} total={game.moves.length + 1} moves={review?.moves} cursor={retry ? retry.moveIndex : cursor} onSelect={goTo} />
      </div>
      <aside className="review-side">
        <GameHeader />
        {explore ? <ExplorePanel fen={board.fen} /> : <CoachPanel game={game} review={review} />}
        <MoveList game={game} moves={review?.moves} cursor={cursor} onSelect={goTo} {...(review ? { onExport: exportAnnotatedPgn } : {})} />
      </aside>
    </div>
  );
}

/** The clock of `color` after the moves up to `cursor` (or the starting time), when the game has clocks. */
function clockAt(game: Game, color: 'white' | 'black', cursor: number): number | undefined {
  for (let i = Math.min(cursor, game.moves.length) - 1; i >= 0; i--) {
    const m = game.moves[i]!;
    if (m.color === color && m.clockMs !== undefined) return m.clockMs;
  }
  const initial = game.timeControl?.initialSeconds;
  return initial && game.moves.some((m) => m.clockMs !== undefined) ? initial * 1000 : undefined;
}

function PlayerStrip({ game, color, cursor, accuracy, isMe }: { game: Game; color: 'white' | 'black'; cursor: number; accuracy?: number; isMe: boolean }) {
  const p = color === 'white' ? game.white : game.black;
  const clock = clockAt(game, color, cursor);
  const meta = [p.elo ? String(p.elo) : undefined, isMe ? t('review.you') : undefined].filter(Boolean).join(' · ');
  return (
    <div className="player">
      <span className={`player-avatar is-${color}`} aria-hidden>
        {p.name.trim().charAt(0).toUpperCase() || '?'}
      </span>
      <span className="player-big" aria-label={clock !== undefined ? t('review.clock') : t('review.accuracy')}>
        {clock !== undefined ? formatClock(clock) : accuracy !== undefined ? accuracy.toFixed(1) : '–'}
      </span>
      <span className="player-info">
        <span className="player-name">{p.name}</span>
        <span className="player-meta">{meta || sideName(color)}</span>
      </span>
      {clock !== undefined && accuracy !== undefined && (
        <span className="player-acc">
          <strong>{accuracy.toFixed(1)}</strong>
          <small>{t('common.accuracy')}</small>
        </span>
      )}
    </div>
  );
}

/** The game's end, in words: "Checkmate!", "Stalemate", or who won. */
function ResultBanner({ game }: { game: Game }) {
  const last = game.moves[game.moves.length - 1];
  const terminal = last ? terminalOf(positionFromFen(last.fenAfter)) : undefined;
  const text =
    terminal === 'checkmate'
      ? t('result.checkmate')
      : terminal === 'stalemate'
        ? t('result.stalemate')
        : game.result === '1-0'
          ? t('result.whiteWins')
          : game.result === '0-1'
            ? t('result.blackWins')
            : game.result === '1/2-1/2'
              ? t('result.draw')
              : undefined;
  return text ? <p className="result-banner display">{text}</p> : null;
}

function GameHeader() {
  const { game, review } = useStore();
  const { exportAnnotatedPgn } = useStore.getState();
  if (!game) return null;
  const bits = [game.result, game.timeControl?.speed ? speedName(game.timeControl.speed) : undefined, game.date, game.source !== 'pgn' ? game.source === 'lichess' ? 'Lichess' : 'Chess.com' : undefined].filter(Boolean);
  const opening = review?.opening?.name ?? game.openingName;
  return (
    <header className="game-header">
      <h1 className="game-title">
        {game.white.name} <span className="muted">{t('common.vs')}</span> {game.black.name}
      </h1>
      <p className="muted">
        {bits.join(' · ')}
        {opening ? ` · ${opening}` : ''}
        {game.sourceUrl ? (
          <>
            {' · '}
            <a href={game.sourceUrl} target="_blank" rel="noreferrer">{t('review.source')}</a>
          </>
        ) : null}
        {review ? (
          <>
            {' · '}
            <button className="link" onClick={exportAnnotatedPgn}>{t('review.export')}</button>
          </>
        ) : null}
      </p>
    </header>
  );
}
