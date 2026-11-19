import { endgameDrills } from '../core/endgame';
import { ERROR_CLASSES } from '../core/classify';
import { formatLine } from '../core/explain';
import { classificationCounts, formatClock, type GameReview, type MoveReview } from '../core/review';
import type { Color } from '../core/eval';
import type { Game } from '../core/game';
import { useStore } from '../app/store';
import { ClassBadge } from './ClassBadge';
import { HumanMoves } from './HumanMoves';
import { LlmCoach } from './LlmCoach';
import { PlayoutPanel } from './PlayoutPanel';
import { OpeningPanel } from './OpeningPanel';
import { coachAvailable, coachLevel } from '../app/coach';
import { hintsFor } from '../core/hints';
import { glossaryFor } from '../core/explain';
import { SUMMARY_ORDER } from './classMeta';
import { classLabel } from '../core/explain';
import { num, t } from '../i18n';
import { sideName } from './names';


function canRetry(m: MoveReview, myColor: Color | undefined): boolean {
  return ERROR_CLASSES.has(m.assessment.classification) && m.assessment.classification !== 'inaccuracy' && (!myColor || m.color === myColor);
}

function keyMoments(review: GameReview, myColor: Color | undefined): MoveReview[] {
  return review.moves.filter((m) => m.isKeyMoment && (!myColor || m.color === myColor || !ERROR_CLASSES.has(m.assessment.classification)));
}

export function CoachPanel({ game, review }: { game: Game; review?: GameReview }) {
  const { cursor, progress, myColor, lineView, retry, playout, hintsShown, settings } = useStore();
  const { goTo, showLine, stepLine, closeLine, startRetry, endRetry, toggleAutoplay, openGame, showHint, startPlayout, practiseEndgame } = useStore.getState();
  // No hooks below this point: the early returns must not change the hook order.
  if (playout) return <PlayoutPanel />;

  if (lineView) {
    const { line, index } = lineView;
    return (
      <section className="coach" aria-live="polite">
        <p className="coach-kicker">{t('coach.exploringLine')}</p>
        <h2 className="coach-title">{line.label}</h2>
        <p className="coach-line">
          {line.moves.map((m, i) => (
            <span key={i} className={i < index ? 'is-played' : ''}>
              {i === 0 || m.fenBefore.split(' ')[1] === 'w' ? formatLine([m], 1) : m.san}{' '}
            </span>
          ))}
        </p>
        <div className="coach-actions">
          <button onClick={() => stepLine(-1)} disabled={index === 0}>{t('coach.back')}</button>
          <button className="primary" onClick={() => stepLine(1)} disabled={index >= line.moves.length}>{t('common.nextMove')}</button>
          <button onClick={toggleAutoplay} aria-pressed={lineView.playing}>
            {lineView.playing ? t('common.pause') : index >= line.moves.length ? t('coach.replay') : t('coach.play')}
          </button>
          <button onClick={closeLine}>{t('coach.returnToGame')}</button>
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
        <p className="coach-kicker">{t('coach.retry.kicker')}</p>
        <h2 className="coach-title">
          {myColor === m.color ? t('coach.retry.titleYou', { side: sideName(m.color), san: m.san }) : t('coach.retry.title', { side: sideName(m.color), san: m.san })}
        </h2>
        {retry.status === 'judging' && <p className="coach-summary">{t('common.checking')}</p>}
        {v && v.result === 'solved' && (
          <p className="coach-summary verdict-good">
            {t('coach.retry.solved', { san: v.san, after: Math.round(v.winAfter), played: Math.round(m.assessment.winAfter), playedSan: m.san })}
          </p>
        )}
        {v && v.result === 'close' && retry.status === 'solving' && (
          <p className="coach-summary verdict-close">
            {t('coach.retry.close', { san: v.san, loss: Math.round(v.winLoss) })}
          </p>
        )}
        {v && v.result === 'wrong' && retry.status === 'solving' && (
          <p className="coach-summary verdict-bad">
            {t('coach.retry.wrong', { san: v.san, why: v.refutation.length > 0 ? formatLine(v.refutation, 4) : t('coach.retry.worse'), after: Math.round(v.winAfter) })}
          </p>
        )}
        {v && v.result !== 'solved' && retry.status === 'solving' && v.explanation && (
          <p className="coach-detail">{v.explanation.summary}</p>
        )}
        {retry.status !== 'done' &&
          hintsFor(m)
            .slice(0, hintsShown)
            .map((h, i) => (
              <p key={i} className="hint-line">
                <strong>{t('common.hintN', { n: i + 1 })}</strong> {h.text}
              </p>
            ))}
        {retry.status === 'solving' && !v && <p className="coach-summary">{t('coach.retry.play')}</p>}
        <div className="coach-actions">
          {retry.status === 'solving' && hintsShown < 3 && <button onClick={showHint}>{t('common.hint')}</button>}
          {retry.status !== 'done' && best && (
            <button onClick={() => showLine({ label: t('coach.retry.solutionLabel', { san: best.san }), fen: m.bestLine[0]!.fenBefore, moves: m.bestLine.slice(0, 8) })}>
              {t('coach.retry.showSolution')}
            </button>
          )}
          {retry.status === 'done' && best && (
            <button onClick={() => void startPlayout(retry.moveIndex)}>{t('coach.retry.playOn')}</button>
          )}
          {retry.status === 'done' && best && (
            <button className="primary" onClick={() => showLine({ label: t('explain.line.best', { san: best.san }), fen: best.fenBefore, moves: m.bestLine.slice(0, 8) })}>
              {t('coach.retry.playBest')}
            </button>
          )}
          <button onClick={endRetry}>{t('common.backToReview')}</button>
        </div>
      </section>
    );
  }

  if (!review) {
    const pct = progress ? Math.round((progress.done / progress.total) * 100) : 0;
    return (
      <section className="coach" aria-live="polite">
        <p className="coach-kicker">{t('coach.analysing')}</p>
        <h2 className="coach-title">{t('coach.analysingTitle')}</h2>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <p className="coach-summary muted">{progress ? t('coach.analysingProgress', { done: progress.done, total: progress.total }) : t('coach.starting')}</p>
      </section>
    );
  }

  const refining =
    progress?.phase === 'refining' ? (
      <p className="refining" role="status">
        {t('coach.refining', { done: progress.done, total: progress.total })}
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
        <p className="coach-kicker">{t('coach.summary')}</p>
        <h2 className="coach-title">{review.opening ? review.opening.name : t('coach.ready')}</h2>
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
                <div className="summary-acc">{acc !== undefined ? num(acc, 1) : '–'}<small>{t('common.accuracy')}</small></div>
                <ul className="summary-counts">
                  {SUMMARY_ORDER.filter((k) => counts[k] > 0).map((k) => (
                    <li key={k}>
                      <ClassBadge c={k} /> <span>{counts[k]}</span> <span className="muted">{classLabel(k)}</span>
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
              {t('coach.keyMoments', { n: moments.length })}
            </button>
          )}
          <button onClick={() => goTo(1)}>{t('coach.everyMove')}</button>
          {review.settings.multiPv < 3 && !progress && (
            <button onClick={() => void openGame(game, { force: true, profile: 'deep' })}>{t('coach.deep')}</button>
          )}
        </div>
        <p className="coach-meta muted">
          {t('coach.meta.depth', { depth: review.settings.depth })}
          {review.evals.some((e) => e.source === 'tablebase') ? ` · ${t('coach.meta.tablebase')}` : ''}
          {review.evals.some((e) => e.source === 'cloud') ? ` · ${t('coach.meta.cloud')}` : ''}
          {settings.profile === 'deep' || review.settings.multiPv >= 3 ? ` · ${t('coach.meta.deep')}` : ''}
        </p>
      </section>
    );
  }

  const m = review.moves[cursor - 1]!;
  const ex = m.explanation;
  const important = ERROR_CLASSES.has(m.assessment.classification) || m.assessment.classification === 'great' || m.assessment.classification === 'brilliant';
  const llm = important && coachAvailable(settings);
  const drillHere = review && myColor ? endgameDrills(game, review, myColor).find((d) => d.moveIndex === cursor - 1) : undefined;
  const beginner = coachLevel(settings, game, myColor) === 'beginner';
  return (
    <section className="coach" aria-live="polite">
      {refining}
      <p className="coach-kicker">
        <ClassBadge c={m.assessment.classification} size="md" /> {classLabel(m.assessment.classification)}
        {m.isKeyMoment ? <span className="tag">{t('coach.tag.key')}</span> : null}
        {m.errorKind ? <span className="tag">{t(`coach.tag.${m.errorKind}`)}</span> : null}
        {m.timeTrouble ? <span className="tag tag-warn">{t('coach.tag.timeTrouble')}</span> : null}
      </p>
      <h2 className="coach-title">{ex.title}</h2>
      {llm && <LlmCoach moveIndex={cursor - 1} />}
      {llm && <p className="coach-kicker small-kicker">{t('coach.engineFacts')}</p>}
      <p className="coach-summary">{ex.summary}</p>
      {ex.details.map((d, i) => (
        <p key={i} className="coach-detail">{d}</p>
      ))}
      {ex.better && (
        <p className="coach-better">
          <strong>{t('pgn.better', { san: ex.better.san })}</strong> {ex.better.text}
        </p>
      )}
      {ex.lesson && !llm && (
        <p className="coach-lesson">
          <strong>{t('common.lesson')}</strong> {ex.lesson}
        </p>
      )}
      {beginner && glossaryFor(m.facts).map((g) => (
        <p key={g} className="glossary small">{g}</p>
      ))}
      {m.phase === 'opening' && game.moves[cursor - 1] && (
        <OpeningPanel fen={game.moves[cursor - 1]!.fenBefore} playedUci={m.uci} isMine={!myColor || myColor === m.color} gameId={game.id} />
      )}
      {ERROR_CLASSES.has(m.assessment.classification) && (
        <HumanMoves moveIndex={cursor - 1} playedUci={m.uci} {...(m.bestLine[0] ? { bestUci: m.bestLine[0].uci } : {})} />
      )}
      <div className="coach-actions">
        {canRetry(m, myColor) && (
          <button className="primary" onClick={() => startRetry(cursor - 1)}>{t('coach.retryMove')}</button>
        )}
        {drillHere && (
          <button onClick={() => void practiseEndgame(drillHere.id)}>
            {drillHere.goal === 'win' ? t('coach.drill.win') : t('coach.drill.draw')}
          </button>
        )}
        {ex.lines.map((l, i) => (
          <button key={i} onClick={() => showLine(l)}>{l.label}</button>
        ))}
      </div>
      <div className="coach-nav">
        <button onClick={() => prevMoment && goTo(indexOf(prevMoment) + 1)} disabled={!prevMoment}>{t('coach.prevKey')}</button>
        <button onClick={() => nextMoment && goTo(indexOf(nextMoment) + 1)} disabled={!nextMoment}>{t('coach.nextKey')}</button>
      </div>
      <p className="coach-meta muted">
        {t('coach.meta.chances', { before: Math.round(m.assessment.winBefore), after: Math.round(m.assessment.winAfter), side: sideName(m.color) })}
        {m.assessment.confidence === 'low' ? ` · ${t('coach.meta.lowConfidence')}` : ''}
        {m.timeSpentMs !== undefined ? ` · ${t('coach.meta.spent', { clock: formatClock(m.timeSpentMs) })}` : ''}
        {m.clockMs !== undefined ? `, ${t('coach.meta.left', { clock: formatClock(m.clockMs) })}` : ''}
      </p>
    </section>
  );
}
