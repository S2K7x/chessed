import { useEffect, useRef } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { chessgroundDests } from 'chessops/compat';
import { positionFromFen } from '../core/chess';
import type { Color } from '../core/eval';
import type { Arrow } from '../core/explain';

export interface BoardProps {
  fen: string;
  orientation: Color;
  lastMove?: string;
  arrows?: Arrow[];
  /** When set, the side to move can play and this receives the UCI move. */
  onMove?: (uci: string) => void;
}

const BRUSH: Record<Arrow['brush'], string> = { best: 'green', threat: 'red', played: 'blue' };

export function Board({ fen, orientation, lastMove, arrows = [], onMove }: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!el.current) return;
    api.current = Chessground(el.current, {
      coordinates: true,
      animation: { enabled: true, duration: 180 },
      drawable: { enabled: true, visible: true },
      highlight: { lastMove: true, check: true },
    });
    return () => {
      api.current?.destroy();
      api.current = null;
    };
  }, []);

  useEffect(() => {
    const cg = api.current;
    if (!cg) return;
    const pos = positionFromFen(fen);
    const turn = pos.turn;
    const shapes: DrawShape[] = arrows
      .filter((a) => a.from)
      // An arrow from a square to itself is drawn as a circle.
      .map((a) => (a.to && a.to !== a.from ? { orig: a.from as Key, dest: a.to as Key, brush: BRUSH[a.brush] } : { orig: a.from as Key, brush: BRUSH[a.brush] }));
    cg.set({
      fen,
      orientation,
      turnColor: turn,
      check: pos.isCheck() ? turn : false,
      lastMove: lastMove ? [lastMove.slice(0, 2) as Key, lastMove.slice(2, 4) as Key] : [],
      viewOnly: false,
      movable: onMove
        ? {
            free: false,
            color: turn,
            showDests: true,
            dests: chessgroundDests(pos) as Map<Key, Key[]>,
            events: {
              after: (orig, dest) => {
                // Auto-promote to a queen; under-promotions are rare in practice positions.
                const moving = cg.state.pieces.get(dest);
                const promo = moving?.role === 'pawn' && (dest[1] === '8' || dest[1] === '1') ? 'q' : '';
                onMoveRef.current?.(`${orig}${dest}${promo}`);
              },
            },
          }
        : { color: undefined, dests: new Map() },
      drawable: { autoShapes: shapes },
    });
  }, [fen, orientation, lastMove, arrows, onMove]);

  return <div className="board" ref={el} />;
}
