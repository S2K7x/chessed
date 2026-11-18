/**
 * Decoder for Chess.com's compact "TCN" move list (two characters per move).
 * Algorithm as documented by the MIT-licensed `chess-tcn` package
 * (https://www.npmjs.com/package/chess-tcn); re-implemented without its
 * chess.js dependency.
 */
const ALPHABET = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?{~}(^)[_]@#$,./&-*++=';
const PROMOTION_PIECES = 'qnrbkp';

const square = (index: number): string => `${'abcdefgh'[index % 8]}${Math.floor(index / 8) + 1}`;

/** Returns UCI moves (e.g. "e2e4", "e7e8q"). Drops (variants) are rejected. */
export function decodeTcn(tcn: string): string[] {
  const moves: string[] = [];
  for (let i = 0; i + 1 < tcn.length; i += 2) {
    const from = ALPHABET.indexOf(tcn[i]!);
    let to = ALPHABET.indexOf(tcn[i + 1]!);
    if (from < 0 || to < 0) throw new Error(`invalid TCN at ${i}`);
    if (from > 63) throw new Error('drop moves are not supported');
    let promotion = '';
    if (to > 63) {
      promotion = PROMOTION_PIECES[Math.floor((to - 64) / 3)] ?? '';
      to = from + (from < 16 ? -8 : 8) + (((to - 1) % 3) - 1);
    }
    moves.push(`${square(from)}${square(to)}${promotion}`);
  }
  return moves;
}
