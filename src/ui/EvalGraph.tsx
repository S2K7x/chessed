import { useMemo } from 'react';
import type { MoveReview } from '../core/review';

interface Props {
  /** White win % per position (undefined while not analysed yet). */
  wins: (number | undefined)[];
  total: number;
  moves?: MoveReview[];
  cursor: number;
  onSelect: (cursor: number) => void;
}

const W = 600;
const H = 110;
const MARKED = new Set(['mistake', 'blunder', 'miss', 'great', 'brilliant']);

/** White's winning chances over the game; click to jump to a position. */
export function EvalGraph({ wins, total, moves, cursor, onSelect }: Props) {
  const n = Math.max(1, total - 1);
  const x = (i: number) => (i / n) * W;
  const y = (w: number) => H - (w / 100) * H;

  const area = useMemo(() => {
    const pts: string[] = [];
    let last = -1;
    wins.forEach((w, i) => {
      if (w === undefined) return;
      pts.push(`${x(i).toFixed(1)},${y(w).toFixed(1)}`);
      last = i;
    });
    if (pts.length === 0) return '';
    return `M0,${H} L${pts.join(' L')} L${x(last).toFixed(1)},${H} Z`;
  }, [wins, n]);

  const pick = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const i = Math.round(((e.clientX - r.left) / r.width) * n);
    onSelect(Math.max(0, Math.min(n, i)));
  };

  return (
    <svg className="evalgraph" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onClick={pick} role="img" aria-label="Evaluation graph: White's winning chances over the game">
      <rect className="evalgraph-bg" x="0" y="0" width={W} height={H} />
      <path className="evalgraph-area" d={area} />
      <line className="evalgraph-mid" x1="0" x2={W} y1={H / 2} y2={H / 2} />
      {moves?.map((m, i) =>
        MARKED.has(m.assessment.classification) && wins[i + 1] !== undefined ? (
          <circle key={m.ply} className="evalgraph-dot" data-class={m.assessment.classification} cx={x(i + 1)} cy={y(wins[i + 1]!)} r="4" vectorEffect="non-scaling-stroke" />
        ) : null,
      )}
      <line className="evalgraph-cursor" x1={x(cursor)} x2={x(cursor)} y1="0" y2={H} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
