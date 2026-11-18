import { useEffect, useRef } from 'react';
import type { Game } from '../core/game';
import type { MoveReview } from '../core/review';
import { ClassBadge } from './ClassBadge';

interface Props {
  game: Game;
  moves?: MoveReview[];
  cursor: number;
  onSelect: (cursor: number) => void;
}

export function MoveList({ game, moves, cursor, onSelect }: Props) {
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
          <span className="movelist-num">{row.number}.</span>
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
                <span className="movelist-san">{m.san}</span>
                {r ? <ClassBadge c={r.assessment.classification} /> : null}
              </button>
            );
          })}
        </li>
      ))}
    </ol>
  );
}
