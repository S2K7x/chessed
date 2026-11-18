import { ERROR_CLASSES } from '../core/classify';
import { formatLine } from '../core/explain';
import { classificationCounts, formatClock, type GameReview, type MoveReview } from '../core/review';
import type { Color } from '../core/eval';
import type { Game } from '../core/game';
import { useStore } from '../app/store';
import { ClassBadge } from './ClassBadge';
import { CLASS_META, SUMMARY_ORDER } from './classMeta';

const sideName = (c: Color) => (c === 'white' ? 'White' : 'Black');

function canRetry(m: MoveReview, myColor: Color | undefined): boolean {
  return ERROR_CLASSES.has(m.assessment.classification) && m.assessment.classification !== 'inaccuracy' && (!myColor || m.color === myColor);
}

function keyMoments(review: GameReview, myColor: Color | undefined): MoveReview[] {
  return review.moves.filter((m) => m.isKeyMoment && (!myColor || m.color === myColor || !ERROR_CLASSES.has(m.assessment.classification)));
}

export function CoachPanel({ game, review }: { game: Game; review?: GameReview }) {
  const { cursor, progress, myColor, lineView, retry } = useStore();
  const { goTo, showLine, stepLine, closeLine, startRetry, endRetry, toggleAutoplay, openGame } = useStore.getState();
  const { settings } = useStore();

  if (lineView) {
    const { line, index } = lineView;
    return (
      <section className="coach" aria-live="polite">
        <p className="coach-kicker">Exploring a line</p>
        <h2 className="coach-title">{line.label}</h2>
        <p className="coach-line">
          {line.moves.map((m, i) => (
            <span key={i} className={i < index ? 'is-played' : ''}>
              {i === 0 || m.fenBefore.split(' ')[1] === 'w' ? formatLine([m], 1) : m.san}{' '}
            </span>
          ))}
        </p>
        <div className="coach-actions">
          <button onClick={() => stepLine(-1)} disabled={index === 0}>Back</button>
          <button className="primary" onClick={() => stepLine(1)} disabled={index >= line.moves.length}>Next move</button>
          <button onClick={toggleAutoplay} aria-pressed={lineView.playing}>
            {lineView.playing ? 'Pause' : index >= line.moves.length ? 'Replay' : 'Play'}
          </button>
          <button onClick={closeLine}>Return to the game</button>
        </div>
      </section>
    );
  }

  if (retry && review) {
    const m = review.moves[retry.moveIndex]!;
    const v = retry.verdict;
    const best = m.bestLine[0];
    return (
      <section className="coach coach-retry" aria-live="polite">
        <p className="coach-kicker">Find a better move</p>
        <h2 className="coach-title">
          {sideName(m.color)} to play. {myColor === m.color ? 'You' : sideName(m.color)} played {m.san}; can you find better?
        </h2>
        {retry.status === 'judging' && <p className="coach-summary">Checking your move…</p>}
        {v && v.result === 'solved' && (
          <p className="coach-summary verdict-good">
            {v.san} works. Your winning chances stay at {Math.round(v.winAfter)}% instead of {Math.round(m.assessment.winAfter)}% after {m.san}.
          </p>
        )}
        {v && v.result === 'close' && retry.status === 'solving' && (
          <p className="coach-summary verdict-close">
            {v.san} is close (−{Math.round(v.winLoss)}%), but there is something stronger. Try again.
          </p>
        )}
        {v && v.result === 'wrong' && retry.status === 'solving' && (
          <p className="coach-summary verdict-bad">
            {v.san} does not work: {v.refutation.length > 0 ? `${formatLine(v.refutation, 4)}` : 'the position gets worse'} (winning chances {Math.round(v.winAfter)}%). Try again.
          </p>
        )}
        {retry.status === 'solving' && !v && <p className="coach-summary">Play a move on the board.</p>}
        <div className="coach-actions">
          {retry.status !== 'done' && best && (
            <button onClick={() => showLine({ label: `Solution: ${best.san}`, fen: m.bestLine[0]!.fenBefore, moves: m.bestLine.slice(0, 8) })}>
              Show the solution
            </button>
          )}
          {retry.status === 'done' && best && (
            <button className="primary" onClick={() => showLine({ label: `Best line: ${best.san}`, fen: best.fenBefore, moves: m.bestLine.slice(0, 8) })}>
              Play the best line
            </button>
          )}
          <button onClick={endRetry}>Back to the review</button>
        </div>
      </section>
    );
  }

  if (!review) {
    const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <section className="coach" aria-live="polite">
        <p className="coach-kicker">Analysing</p>
        <h2 className="coach-title">Stockfish is reviewing every move…</h2>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="coach-summary muted">{progress ? `${progress.done} of ${progress.total} positions` : 'Starting the engine…'}</p>
      </section>
    );
  }

  const refining =
    progress?.phase === 'refining' ? (
      <p className="refining" role="status">
        Checking the critical moments more deeply… {progress.done}/{progress.total}
      </p>
    ) : null;
  const moments = keyMoments(review, myColor);
  const indexOf = (m: MoveReview) => review.moves.indexOf(m);
  const nextMoment = moments.find((m) => indexOf(m) + 1 > cursor);
  const prevMoment = [...moments].reverse().find((m) => indexOf(m) + 1 < cursor);

  if (cursor === 0) {
    return (
      <section className="coach">
        {refining}
        <p className="coach-kicker">Game summary</p>
        <h2 className="coach-title">{review.opening ? review.opening.name : 'Review ready'}</h2>
        {review.summary?.opening && <p className="coach-detail">{review.summary.opening}</p>}
        {(myColor ? [myColor] : (['white', 'black'] as const)).map((c) => (
          <div key={c} className="coach-summary-text">
            {!myColor && <p className="coach-detail"><strong>{c === 'white' ? game.white.name : game.black.name}</strong></p>}
            {review.summary?.[c]?.map((line, i) => (
              <p key={i} className="coach-detail">{line}</p>
            ))}
          </div>
        ))}
        <div className="summary-grid">
          {(['white', 'black'] as const).map((c) => {
            const counts = classificationCounts(review, c);
            const acc = review.accuracy[c];
            return (
              <div key={c} className={`summary-side${myColor === c ? ' is-me' : ''}`}>
                <div className="summary-name">{c === 'white' ? game.white.name : game.black.name}</div>
                <div className="summary-acc">{acc !== undefined ? acc.toFixed(1) : '–'}<small>accuracy</small></div>
                <ul className="summary-counts">
                  {SUMMARY_ORDER.filter((k) => counts[k] > 0).map((k) => (
                    <li key={k}>
                      <ClassBadge c={k} /> <span>{counts[k]}</span> <span className="muted">{CLASS_META[k].label}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        <div className="coach-actions">
          {moments[0] && (
            <button className="primary" onClick={() => goTo(indexOf(moments[0]!) + 1)}>
              Start with the key moments ({moments.length})
            </button>
          )}
          <button onClick={() => goTo(1)}>Go through every move</button>
          {review.settings.multiPv < 3 && !progress && (
            <button onClick={() => void openGame(game, { force: true, profile: 'deep' })}>Deep analysis</button>
          )}
        </div>
        <p className="coach-meta muted">
          Stockfish depth {review.settings.depth}
          {review.evals.some((e) => e.source === 'tablebase') ? ' · tablebase endgame' : ''}
          {review.evals.some((e) => e.source === 'cloud') ? ' · Lichess cloud for the opening' : ''}
          {settings.profile === 'deep' || review.settings.multiPv >= 3 ? ' · deep profile' : ''}
        </p>
      </section>
    );
  }

  const m = review.moves[cursor - 1]!;
  const ex = m.explanation;
  return (
    <section className="coach" aria-live="polite">
      {refining}
      <p className="coach-kicker">
        <ClassBadge c={m.assessment.classification} size="md" /> {CLASS_META[m.assessment.classification].label}
        {m.isKeyMoment ? <span className="tag">Key moment</span> : null}
        {m.errorKind ? <span className="tag">{m.errorKind}</span> : null}
        {m.timeTrouble ? <span className="tag tag-warn">time trouble</span> : null}
      </p>
      <h2 className="coach-title">{ex.title}</h2>
      <p className="coach-summary">{ex.summary}</p>
      {ex.details.map((d, i) => (
        <p key={i} className="coach-detail">{d}</p>
      ))}
      {ex.better && (
        <p className="coach-better">
          <strong>Better: {ex.better.san}.</strong> {ex.better.text}
        </p>
      )}
      {ex.lesson && (
        <p className="coach-lesson">
          <strong>Lesson.</strong> {ex.lesson}
        </p>
      )}
      <div className="coach-actions">
        {canRetry(m, myColor) && (
          <button className="primary" onClick={() => startRetry(cursor - 1)}>Retry this move</button>
        )}
        {ex.lines.map((l, i) => (
          <button key={i} onClick={() => showLine(l)}>{l.label}</button>
        ))}
      </div>
      <div className="coach-nav">
        <button onClick={() => prevMoment && goTo(indexOf(prevMoment) + 1)} disabled={!prevMoment}>← Previous key moment</button>
        <button onClick={() => nextMoment && goTo(indexOf(nextMoment) + 1)} disabled={!nextMoment}>Next key moment →</button>
      </div>
      <p className="coach-meta muted">
        Winning chances {Math.round(m.assessment.winBefore)}% → {Math.round(m.assessment.winAfter)}% for {sideName(m.color)}
        {m.assessment.confidence === 'low' ? ' · low engine confidence' : ''}
        {m.timeSpentMs !== undefined ? ` · ${formatClock(m.timeSpentMs)} spent` : ''}
        {m.clockMs !== undefined ? `, ${formatClock(m.clockMs)} left` : ''}
      </p>
    </section>
  );
}
