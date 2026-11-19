import pieceCss from '@lichess-org/chessground/assets/chessground.cburnett.css?raw';
import type { Color } from '../core/eval';

const ROLES: Readonly<Record<string, string>> = { K: 'king', Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' };

// Figurines use the board's own piece drawings: the board's piece CSS, re-targeted.
if (typeof document !== 'undefined' && !document.getElementById('figurine-css')) {
  const style = document.createElement('style');
  style.id = 'figurine-css';
  style.textContent = pieceCss.replaceAll('.cg-wrap piece.', '.fig.');
  document.head.append(style);
}

/**
 * A move in figurine notation (♞f3). The piece letter stays in the text for
 * screen readers, copy and search; the figurine is decorative.
 */
export function San({ san, color }: { san: string; color: Color }) {
  const role = ROLES[san[0] ?? ''];
  if (!role) return <>{san}</>;
  return (
    <>
      <span className={`fig ${role} ${color}`} aria-hidden="true" />
      <span className="sr-only">{san[0]}</span>
      {san.slice(1)}
    </>
  );
}
