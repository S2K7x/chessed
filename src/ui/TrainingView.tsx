import { useCallback, useMemo } from 'react';
import { useStore } from '../app/store';
import { formatLine, type Arrow } from '../core/explain';
import { hintsFor, threatHintsFor } from '../core/hints';
import { Board } from './Board';
import { useBlindfold } from './Blindfold';
import { ClassBadge } from './ClassBadge';
import type { Classification } from '../core/classify';
import { t } from '../i18n';
import { themeName } from '../core/summary';
import { sideName } from './names';


/** Daily review of the player's own mistakes (spaced repetition). */
export function TrainingView() {
  const { training, dueCount, today, settings } = useStore();
  const { startTraining, trainingAttempt, trainingHint, trainingGiveUp, trainingNext, setView, openWoodpecker, openEndgames, openGuess, openOpenings, openOpponent, endTraining } = useStore.getState();
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
  const solvingNow = training?.status === 'solving' || training?.status === 'judging';
  const blindfold = useBlindfold(solvingNow && ex ? ex.id : undefined);

  if (!training) {
    return (
      <div className="training-hub">
        <header className="hub-header">
          <h1>{t('nav.training')}</h1>
          <p className="muted">{t('training.intro')}</p>
          <Goal done={today?.positions ?? 0} goal={settings.dailyGoal} />
        </header>
        <section className="mode-card">
          <p className="mode-kicker">{t('training.mistakes.kicker')}</p>
          <h2>{t('training.mistakes.title')}</h2>
          <p>{t('training.mistakes.text')}</p>
          <button className="primary" onClick={() => void startTraining()} disabled={dueCount === 0}>
            {dueCount > 0 ? t('training.mistakes.start', { count: Math.min(10, dueCount) }) : t('training.mistakes.none')}
          </button>
        </section>
        <section className="mode-card">
          <p className="mode-kicker">{t('training.woodpecker.kicker')}</p>
          <h2>{t('woodpecker.title')}</h2>
          <p>{t('training.woodpecker.text')}</p>
          <button onClick={() => void openWoodpecker()}>{t('training.woodpecker.open')}</button>
        </section>
        <section className="mode-card">
          <p className="mode-kicker">{t('training.endgames.kicker')}</p>
          <h2>{t('endgames.title')}</h2>
          <p>{t('training.endgames.text')}</p>
          <button onClick={() => void openEndgames()}>{t('training.endgames.open')}</button>
        </section>
        <section className="mode-card">
          <p className="mode-kicker">{t('training.openings.kicker')}</p>
          <h2>{t('openings.title')}</h2>
          <p>{t('training.openings.text')}</p>
          <button onClick={() => void openOpenings()}>{t('training.openings.open')}</button>
        </section>
        <section className="mode-card">
          <p className="mode-kicker">{t('training.opponent.kicker')}</p>
          <h2>{t('training.opponent.title')}</h2>
          <p>{t('training.opponent.text')}</p>
          <button onClick={openOpponent}>{t('opponent.title')}</button>
        </section>
        <section className="mode-card">
          <p className="mode-kicker">{t('training.guess.kicker')}</p>
          <h2>{t('guess.title')}</h2>
          <p>{t('training.guess.text')}</p>
          <button onClick={() => void openGuess()}>{t('guess.title')}</button>
        </section>
      </div>
    );
  }

  if (training.status === 'finished' || !ex) {
    const n = training.results.length;
    return (
      <div className="card narrow">
        <h1>{n ? t('training.done') : t('training.nothing')}</h1>
        {n > 0 && (
          <p>
            {t('training.solved', { solved: training.results.filter((g) => g !== 'again').length, count: n })}
          </p>
        )}
        {n === 0 && <p className="muted">{t('training.noneDue')}</p>}
        <Goal done={today?.positions ?? 0} goal={settings.dailyGoal} />
        <div className="coach-actions">
          <button className="primary" onClick={() => setView('progress')}>{t('training.seeProgress')}</button>
          {dueCount > 0 && <button onClick={() => void startTraining()}>{t('training.again')}</button>}
          <button onClick={endTraining}>{t('common.backToTraining')}</button>
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
          {t('training.position', { n: training.index + 1, total: training.queue.length })}
          {ex.theme ? ` · ${themeName(ex.theme)}` : ''}
        </p>
        <Board
          fen={ex.fen}
          orientation={playerColor}
          {...(isThreat && move ? { lastMove: move.uci } : {})}
          arrows={arrows}
          blind={blindfold.hidden && solving} {...(solving && training.status === 'solving' ? { onMove } : {})} />
      </div>
      <aside className="training-side">
        <section className="coach" aria-live="polite">
          <p className="coach-kicker">
            <ClassBadge c={ex.classification as Classification} /> {t('training.fromGame', { opponent })}
            {game?.date ? ` (${game.date})` : ''}
          </p>
          <h2 className="coach-title">
            {isThreat
              ? t('training.threatTitle', { san: ex.playedSan })
              : t('common.toPlay', { side: sideName(ex.color) })}
          </h2>
          {isThreat && <p className="muted small">{t('training.blunderCheck')}</p>}
          {training.status === 'judging' && <p className="coach-summary">{t('common.checking')}</p>}
          {solving && v && v.result !== 'solved' && (
            <p className={`coach-summary ${v.result === 'close' ? 'verdict-close' : 'verdict-bad'}`}>
              {v.result === 'close' ? t('training.close', { san: v.san }) : t('training.wrong', { san: v.san, line: formatLine(v.refutation, 4) })}
              {v.explanation ? ` ${v.explanation.summary}` : ''}
            </p>
          )}
          {solving &&
            move &&
            hintsOf(move)
              .slice(0, training.hints)
              .map((h, i) => (
                <p key={i} className="hint-line">
                  <strong>{t('common.hintN', { n: i + 1 })}</strong> {h.text}
                </p>
              ))}
          {training.status === 'solved' && (
            <>
              <p className="coach-summary verdict-good">
                {isThreat ? t('training.correctThreat', { san: v?.san ?? '', played: ex.playedSan }) : t('training.correct', { san: v?.san ?? '', played: ex.playedSan })}
              </p>
              <p className="muted small">{t('training.recorded', { grade: t(`grade.${training.results[training.results.length - 1] ?? 'good'}`) })}</p>
            </>
          )}
          {training.status === 'failed' && (
            <p className="coach-summary">
              {isThreat
                ? t('training.failedThreat', { san: ex.bestSan })
                : t('training.failed', { san: ex.bestSan, played: ex.playedSan })}
            </p>
          )}
          {!solving && move && (
            <>
              <p className="coach-detail">{move.explanation.summary}</p>
              {move.explanation.lesson && (
                <p className="coach-lesson">
                  <strong>{t('common.lesson')}</strong> {move.explanation.lesson}
                </p>
              )}
            </>
          )}
          {solving && blindfold.controls}
          <div className="coach-actions">
            {solving && training.hints < 3 && <button onClick={trainingHint}>{t('common.hint')}</button>}
            {solving && <button onClick={() => void trainingGiveUp()}>{t('training.showAnswer')}</button>}
            <button onClick={endTraining}>{t('common.stop')}</button>
            {!solving && move && move.bestLine.length > 1 && (
              <p className="muted small">{t('explain.line.best', { san: formatLine(move.bestLine, 8) })}</p>
            )}
            {!solving && (
              <button className="primary" onClick={() => void trainingNext()}>
                {training.index + 1 < training.queue.length ? t('common.nextPosition') : t('training.finish')}
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
    <div className="goal" aria-label={t('goal.label')}>
      <span>
        {t('goal.today', { done: Math.min(done, goal), goal })}
        {done >= goal ? ` · ${t('goal.reached')}` : ''}
      </span>
      <div className="progress">
        <div className="progress-fill" style={{ width: `${Math.min(100, (100 * done) / goal)}%` }} />
      </div>
    </div>
  );
}
