import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Chessground } from '@lichess-org/chessground';
import type { Api } from '@lichess-org/chessground/api';
import type { DrawShape } from '@lichess-org/chessground/draw';
import type { Key } from '@lichess-org/chessground/types';
import { chessgroundDests } from 'chessops/compat';
import { positionFromFen, typedMove } from '../core/chess';
import type { Color } from '../core/eval';
import type { Arrow } from '../core/explain';

export interface BoardProps {
  fen: string;
  orientation: Color;
  lastMove?: string;
  arrows?: Arrow[];
  /** When set, the side to move can play and this receives the UCI move. */
  onMove?: (uci: string) => void;
  /** Show the typed-move field under the board when it accepts a move (default true). */
  moveInput?: boolean;
}

const BRUSH: Record<Arrow['brush'], string> = { best: 'green', threat: 'red', played: 'blue' };

export function Board({ fen, orientation, lastMove, arrows = [], onMove, moveInput = true }: BoardProps) {
  const el = useRef<HTMLDivElement>(null);
  const api = useRef<Api | null>(null);
  const onMoveRef = useRef(onMove);
  onMoveRef.current = onMove;

  useEffect(() => {
    if (!el.current) return;
    // Start on the right position: no animation from the initial setup.
    api.current = Chessground(el.current, {
      fen,
      orientation,
      coordinates: true,
      animation: { enabled: true, duration: 180 },
      drawable: { enabled: true, visible: true },
      highlight: { lastMove: true, check: true },
    });
    // Pieces are positioned from the board's size: redraw when it changes
    // (layout settling, window resize, mobile rotation).
    const observer = new ResizeObserver(() => api.current?.redrawAll());
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      api.current?.destroy();
      api.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- later changes go through cg.set below
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

  // The position and orientation are exposed for end-to-end tests.
  return (
    <div className="board-wrap">
      <div className="board" ref={el} data-fen={fen} data-orientation={orientation} />
      {onMove && moveInput && <MoveInput fen={fen} onMove={onMove} />}
    </div>
  );
}

/** Keyboard move entry, for players who prefer typing, or cannot drag pieces. */
export function MoveInput({ fen, onMove }: { fen: string; onMove: (uci: string) => void }) {
  const [text, setText] = useState('');
  const [invalid, setInvalid] = useState(false);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const uci = typedMove(fen, text);
    if (!uci) {
      setInvalid(true);
      return;
    }
    setText('');
    setInvalid(false);
    onMove(uci);
  };
  return (
    <form className="move-input" onSubmit={submit}>
      <input
        aria-label="Type a move"
        placeholder="Type a move (Nf3, e2e4)…"
        value={text}
        aria-invalid={invalid}
        onChange={(e) => {
          setText(e.target.value);
          setInvalid(false);
        }}
        onKeyDown={(e) => e.stopPropagation()}
        autoComplete="off"
        spellCheck={false}
      />
      {invalid && (
        <span className="move-input-error" role="alert">
          Not a legal move here.
        </span>
      )}
    </form>
  );
}
