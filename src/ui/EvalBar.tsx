import { formatScore, type PositionEval } from '../core/eval';
import { positionWhiteWinPercent } from '../core/eval';
import type { Color } from '../core/eval';
import { t } from '../i18n';

/** Vertical (desktop) or horizontal (mobile) bar of White's winning chances. */
export function EvalBar({ evaluation, orientation }: { evaluation?: PositionEval; orientation: Color }) {
  const white = evaluation ? positionWhiteWinPercent(evaluation) : 50;
  const best = evaluation?.lines[0]?.score;
  const label = evaluation?.terminal === 'checkmate' ? '#' : evaluation?.terminal ? '½' : best ? formatScore(best) : '';
  const whiteShare = orientation === 'white' ? white : 100 - white;
  return (
    <div className="evalbar" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(white)} aria-label={t('evalbar.label', { pct: Math.round(white) })}>
      <div className={`evalbar-fill ${orientation === 'white' ? 'is-white' : 'is-black'}`} style={{ '--share': `${whiteShare}%` } as React.CSSProperties} />
      <span className={`evalbar-label ${white >= 50 ? 'for-white' : 'for-black'}`}>{label}</span>
    </div>
  );
}
