import { epdOf } from './chess';

/**
 * Opening book built from lichess-org/chess-openings (CC0-1.0) by
 * scripts/build-openings.mjs. Keys are EPDs (board, turn, castling, en passant);
 * values are [eco, name] for named positions and 0 for positions met on the
 * way to a named line.
 */
export type OpeningBook = Readonly<Record<string, readonly [string, string] | 0>>;

export interface Opening {
  eco: string;
  name: string;
}

let cached: Promise<OpeningBook> | undefined;

export function loadOpeningBook(): Promise<OpeningBook> {
  cached ??= import('../data/openings.json').then((m) => m.default as unknown as OpeningBook);
  return cached;
}

export function isBookPosition(book: OpeningBook, fen: string): boolean {
  return epdOf(fen) in book;
}

export function openingAt(book: OpeningBook, fen: string): Opening | undefined {
  const v = book[epdOf(fen)];
  return v ? { eco: v[0], name: v[1] } : undefined;
}
