import { useStore } from '../app/store';
import { replayUci } from '../core/chess';
import { formatScore, type Color } from '../core/eval';
import { San } from './San';
import { t } from '../i18n';

/** The exploration of moves played on the review board, with the engine's view of the position. */
export function ExplorePanel({ fen }: { fen: string }) {
  const { explore, game, explorations } = useStore();
  const { endExplore, step, exploreMove } = useStore.getState();
  if (!explore || !game) return null;
  const e = explorations[fen];
  const evaluation = e && typeof e === 'object' && 'lines' in e ? e : undefined;
  const best = evaluation?.lines[0];
  const bestLine = best ? replayUci(fen, best.pv, 6) : [];
  const from = explore.fromCursor > 0 ? game.moves[explore.fromCursor - 1] : undefined;
  const moverOf = (fenBefore: string): Color => (fenBefore.split(' ')[1] === 'w' ? 'white' : 'black');
  const numbered = (moves: typeof explore.moves, highlight?: number) =>
    moves.map((m, i) => {
      const [, turn, , , , full] = m.fenBefore.split(' ');
      return (
        <span key={i} className={i === highlight ? 'is-current' : undefined}>
          {turn === 'w' ? `${full}. ` : i === 0 ? `${full}… ` : ''}
          <San san={m.san} color={moverOf(m.fenBefore)} />{' '}
        </span>
      );
    });

  return (
    <section className="coach explore" aria-live="polite">
      <p className="coach-kicker">{t('explore.kicker')}</p>
      <p className="muted small">
        {t('explore.from', { from: from ? `${Math.ceil(from.ply / 2)}${from.color === 'white' ? '.' : '…'} ${from.san}` : t('explore.start') })}
      </p>
      <p className="explore-line">{explore.moves.length ? numbered(explore.moves, explore.index - 1) : <span className="muted">{t('explore.none')}</span>}</p>
      {evaluation?.terminal ? (
        <p className="coach-summary">{evaluation.terminal === 'checkmate' ? t('endgame.checkmate') : t('playout.draw')}</p>
      ) : best ? (
        <>
          <p className="explore-eval">
            <strong>{formatScore(best.score)}</strong> <span className="muted small">{t('explore.depth', { depth: best.depth })}</span>
          </p>
          <p className="coach-detail">
            {t('explore.best')} {numbered(bestLine)}
          </p>
        </>
      ) : e && typeof e === 'object' && 'error' in e ? (
        <p className="coach-detail">{e.error}</p>
      ) : (
        <p className="muted">{t('common.stockfishThinking')}</p>
      )}
      <div className="coach-actions">
        {best?.pv[0] && (
          <button className="primary" onClick={() => exploreMove(best.pv[0]!)}>
            {t('explore.playBest')}
          </button>
        )}
        <button onClick={() => step(-1)} disabled={explore.index === 0}>
          {t('explore.takeBack')}
        </button>
        <button onClick={endExplore}>{t('explore.back')}</button>
      </div>
    </section>
  );
}
