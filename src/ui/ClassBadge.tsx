import type { Classification } from '../core/classify';
import { CLASS_META } from './classMeta';

export function ClassBadge({ c, size = 'sm' }: { c: Classification; size?: 'sm' | 'md' }) {
  const meta = CLASS_META[c];
  return (
    <span className={`badge badge-${size}`} data-class={c} title={meta.label} aria-label={meta.label}>
      {meta.glyph}
    </span>
  );
}
