import type { Classification } from '../core/classify';

/** Original glyphs (classic annotation symbols) per class; names come from classLabel(). */
export const CLASS_GLYPH: Record<Classification, string> = {
  brilliant: '!!',
  great: '!',
  best: '✓',
  excellent: '+',
  good: '=',
  book: '≡',
  forced: '→',
  inaccuracy: '?!',
  mistake: '?',
  miss: '×',
  blunder: '??',
};

export const SUMMARY_ORDER: Classification[] = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder',
];
