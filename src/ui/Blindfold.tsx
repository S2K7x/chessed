import { useCallback, useEffect, useState, type ReactElement } from 'react';
import { useStore } from '../app/store';
import { t } from '../i18n';

const SHOW_MS = 5000;
const PEEK_MS = 2000;

/**
 * Visualization training: with the option on, each new position is shown for
 * five seconds, then its pieces are hidden; the answer is typed (or played)
 * from memory, with a short peek allowed.
 */
export function useBlindfold(positionKey: string | undefined): { hidden: boolean; controls: ReactElement } {
  const { settings } = useStore();
  const { updateSettings } = useStore.getState();
  const on = settings.blindfold;
  const [hiddenFor, setHiddenFor] = useState<string>();
  const [peeking, setPeeking] = useState(false);

  useEffect(() => {
    setHiddenFor(undefined);
    if (!on || !positionKey) return;
    const t = setTimeout(() => setHiddenFor(positionKey), SHOW_MS);
    return () => clearTimeout(t);
  }, [on, positionKey]);

  const peek = useCallback(() => {
    setPeeking(true);
    setTimeout(() => setPeeking(false), PEEK_MS);
  }, []);

  const hidden = on && !!positionKey && hiddenFor === positionKey && !peeking;
  const controls = (
    <div className="blindfold">
      <label className="radio">
        <input type="checkbox" checked={on} onChange={(e) => void updateSettings({ blindfold: e.target.checked })} />
        {t('blindfold.toggle')}
      </label>
      {hidden && (
        <>
          <span className="muted small" role="status">
            {t('blindfold.hidden')}
          </span>
          <button className="small-button" onClick={peek}>
            {t('blindfold.peek')}
          </button>
        </>
      )}
    </div>
  );
  return { hidden, controls };
}
