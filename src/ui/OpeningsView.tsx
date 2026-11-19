import { useCallback, useEffect, useMemo } from 'react';
import { useStore, type OpeningsState } from '../app/store';
import type { Color } from '../core/eval';
import type { Arrow } from '../core/explain';
import { Board } from './Board';
import { San } from './San';
import { t } from '../i18n';
import { sideLower } from './names';

/** The opening trainer: your repertoire, from your own games. */
export function OpeningsView() {
  const { openings } = useStore();
  const { openOpenings } = useStore.getState();
  useEffect(() => {
    if (!openings) void openOpenings();
  }, [openings, openOpenings]);
  if (!openings) return <p className="muted">{t('common.loading')}</p>;
  if (openings.session) return <Session state={openings} />;
  return <Start state={openings} />;
}

function Start({ state }: { state: OpeningsState }) {
  const { startOpeningLine, setView } = useStore.getState();
  const sides = (['white', 'black'] as const).filter((c) => state.games[c] > 0);
  return (
    <div className="card narrow">
      <h1>{t('openings.title')}</h1>
      <p>{t('openings.intro')}</p>
      {sides.length === 0 && (
        <p className="muted">{t('openings.none')}</p>
      )}
      <div className="opening-sides">
        {sides.map((c) => (
          <section key={c} className="mode-card">
            <p className="mode-kicker">{t('openings.as', { side: sideLower(c) })}</p>
            <h2>{state.coverage[c].known} / {state.coverage[c].positions}</h2>
            <p className="muted small">
              {t('openings.known', { count: state.games[c] })}
            </p>
            <button className="primary" onClick={() => void startOpeningLine(c)}>
              {t('openings.trainAs', { side: sideLower(c) })}
            </button>
          </section>
        ))}
      </div>
      <button className="link" onClick={() => setView('training')}>{t('common.backToTraining')}</button>
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
          {t('openings.as', { side: sideLower(s.color) })} · {t('openings.score', { right: s.right, wrong: s.wrong })}
        </p>
        <Board fen={s.fen} orientation={s.color} {...(last ? { lastMove: last.uci } : {})} arrows={arrows} {...(s.status === 'your-move' ? { onMove } : {})} />
      </div>
      <aside className="training-side">
        <section className="coach" aria-live="polite">
          <p className="coach-kicker">{s.against ? t('openings.against', { name: s.against }) : t('openings.title')}</p>
          <p className="opening-line">{s.line.length ? lineText(s.line, s.color) : <span className="muted">{t('openings.start')}</span>}</p>
          {s.status === 'your-move' && (
            <>
              {s.last?.right && <p className="coach-summary verdict-good">{t('woodpecker.right', { san: s.last.san })}</p>}
              <h2 className="coach-title">{t('openings.question')}</h2>
            </>
          )}
          {s.status === 'wrong' && s.expected && (
            <>
              <p className="coach-summary verdict-bad">
                {t('openings.wrong', { san: s.last?.san ?? '', expected: s.expected.san })}
              </p>
              {s.expected.usualError && (
                <p className="coach-detail">
                  {t('openings.usualError', { usual: s.expected.usualError, better: s.expected.san })}
                </p>
              )}
            </>
          )}
          {s.status === 'end' && (
            <p className="coach-summary">
              {s.endReason} {t('openings.score', { right: s.right, wrong: s.wrong })}.
            </p>
          )}
          <div className="coach-actions">
            {s.status === 'wrong' && (
              <button className="primary" onClick={openingContinue}>
                {t('openings.continue', { san: s.expected?.san ?? '' })}
              </button>
            )}
            {s.status === 'end' && (
              <button className="primary" onClick={() => void startOpeningLine(s.color)}>
                {t('openings.another')}
              </button>
            )}
            <button onClick={leaveOpening}>{s.status === 'end' ? t('openings.done') : t('common.stop')}</button>
          </div>
        </section>
      </aside>
    </div>
  );
}
