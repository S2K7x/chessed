import type { Classification } from '../core/classify';
import { classLabel } from '../core/explain';
import { CLASS_GLYPH } from './classMeta';

export function ClassBadge({ c, size = 'sm' }: { c: Classification; size?: 'sm' | 'md' }) {
  const label = classLabel(c);
  return (
    <span className={`badge badge-${size}`} data-class={c} title={label} aria-label={label}>
      {CLASS_GLYPH[c]}
    </span>
  );
}
