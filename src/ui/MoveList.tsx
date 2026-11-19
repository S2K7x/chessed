import { useEffect, useRef } from 'react';
import type { Game } from '../core/game';
import type { MoveReview } from '../core/review';
import { ClassBadge } from './ClassBadge';
import { Icon } from './icons';
import { San } from './San';

interface Props {
  game: Game;
  moves?: MoveReview[];
  cursor: number;
  onSelect: (cursor: number) => void;
  /** Shown after the last move with the result. */
  onExport?: () => void;
}

const formatSeconds = (ms: number) => (ms < 60_000 ? `${Math.round(ms / 1000)}s` : `${Math.floor(ms / 60_000)}m${String(Math.round((ms % 60_000) / 1000)).padStart(2, '0')}`);

export function MoveList({ game, moves, cursor, onSelect, onExport }: Props) {
  const active = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    active.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [cursor]);

  const rows: { number: number; cells: (number | undefined)[] }[] = [];
  game.moves.forEach((m, i) => {
    const number = Math.ceil(m.ply / 2);
    let row = rows[rows.length - 1];
    if (!row || row.number !== number) {
      row = { number, cells: [undefined, undefined] };
      rows.push(row);
    }
    row.cells[m.color === 'white' ? 0 : 1] = i;
  });

  return (
    <ol className="movelist" aria-label="Moves">
      {rows.map((row) => (
        <li key={row.number} className="movelist-row">
          <span className="movelist-num">{row.number}</span>
          {row.cells.map((i, col) => {
            if (i === undefined) return <span key={col} className="movelist-cell is-empty" />;
            const m = game.moves[i]!;
            const r = moves?.[i];
            const isActive = cursor === i + 1;
            return (
              <button
                key={col}
                ref={isActive ? active : undefined}
                className={`movelist-cell${isActive ? ' is-active' : ''}`}
                onClick={() => onSelect(i + 1)}
                aria-current={isActive ? 'step' : undefined}
              >
                <span className="movelist-san">
                  <San san={m.san} color={m.color} />
                </span>
                {r?.timeSpentMs !== undefined && (
                  <span className={`movelist-time${r.fast ? ' is-fast' : ''}`} title={r.fast ? 'Played much faster than your usual pace' : 'Time spent'}>
                    {formatSeconds(r.timeSpentMs)}
                  </span>
                )}
                {r ? <ClassBadge c={r.assessment.classification} /> : null}
              </button>
            );
          })}
        </li>
      ))}
      {game.result !== '*' && (
        <li className="movelist-end">
          <span>{game.result.replace('-', '–')}</span>
          {onExport && (
            <button onClick={onExport} title="Download the annotated PGN">
              <Icon name="download" /> PGN
            </button>
          )}
        </li>
      )}
    </ol>
  );
}
