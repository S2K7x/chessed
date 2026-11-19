import { useEffect } from 'react';
import { coachAvailable } from '../app/coach';
import { useStore } from '../app/store';
import { t } from '../i18n';

/** Language-model explanation of a move, shown only once it passed verification. */
export function LlmCoach({ moveIndex }: { moveIndex: number }) {
  const { settings, coachTexts } = useStore();
  const { requestCoach } = useStore.getState();
  const enabled = coachAvailable(settings);
  useEffect(() => {
    if (enabled) void requestCoach(moveIndex);
  }, [enabled, moveIndex, requestCoach]);
  if (!enabled) return null;
  const r = coachTexts[moveIndex];
  if (!r || r === 'loading') return <p className="coach-detail muted">{t('llm.writing')}</p>;
  if (r.status === 'error') return <p className="coach-detail muted small">{t('llm.unavailable', { reason: r.message })}</p>;
  if (r.status === 'rejected') {
    return <p className="coach-detail muted small">{t('llm.rejected')}</p>;
  }
  const text = r.text;
  return (
    <div className="llm">
      <p className="llm-headline">{text.headline}</p>
      <p className="coach-detail">{text.explanation}</p>
      {text.why_better && <p className="coach-better">{text.why_better}</p>}
      <p className="coach-lesson">
        <strong>{t('common.lesson')}</strong> {text.lesson}
      </p>
      <p className="muted small">{t('llm.checked')}</p>
    </div>
  );
}
