import { useEffect } from 'react';
import { coachAvailable } from '../app/coach';
import { useStore } from '../app/store';

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
  if (!r || r === 'loading') return <p className="coach-detail muted">The coach is writing an explanation…</p>;
  if (r.status === 'error') return <p className="coach-detail muted small">Coach unavailable: {r.message}</p>;
  if (r.status === 'rejected') {
    return <p className="coach-detail muted small">The coach's text did not match the board, so only the verified facts are shown.</p>;
  }
  const t = r.text;
  return (
    <div className="llm">
      <p className="llm-headline">{t.headline}</p>
      <p className="coach-detail">{t.explanation}</p>
      {t.why_better && <p className="coach-better">{t.why_better}</p>}
      <p className="coach-lesson">
        <strong>Lesson.</strong> {t.lesson}
      </p>
      <p className="muted small">✓ Checked against the board and the engine</p>
    </div>
  );
}
