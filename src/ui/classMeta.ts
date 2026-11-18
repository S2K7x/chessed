import type { Classification } from '../core/classify';
import { CLASS_LABELS } from '../core/explain';

/** Original glyphs (classic annotation symbols) and colour tokens per class. */
export const CLASS_META: Record<Classification, { glyph: string; label: string }> = {
  brilliant: { glyph: '!!', label: CLASS_LABELS.brilliant },
  great: { glyph: '!', label: CLASS_LABELS.great },
  best: { glyph: '✓', label: CLASS_LABELS.best },
  excellent: { glyph: '+', label: CLASS_LABELS.excellent },
  good: { glyph: '=', label: CLASS_LABELS.good },
  book: { glyph: '≡', label: CLASS_LABELS.book },
  forced: { glyph: '→', label: CLASS_LABELS.forced },
  inaccuracy: { glyph: '?!', label: CLASS_LABELS.inaccuracy },
  mistake: { glyph: '?', label: CLASS_LABELS.mistake },
  miss: { glyph: '×', label: CLASS_LABELS.miss },
  blunder: { glyph: '??', label: CLASS_LABELS.blunder },
};

export const SUMMARY_ORDER: Classification[] = [
  'brilliant', 'great', 'best', 'excellent', 'good', 'book', 'inaccuracy', 'mistake', 'miss', 'blunder',
];
