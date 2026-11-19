import { useStore } from '../app/store';
import { t } from '../i18n';

export function PlayoutPanel() {
  const { playout } = useStore();
  const { endPlayout } = useStore.getState();
  if (!playout) return null;
  return (
    <section className="coach" aria-live="polite">
      <p className="coach-kicker">{t('playout.kicker')}</p>
      <h2 className="coach-title">{t('playout.title', { elo: playout.maiaElo })}</h2>
      <p className="coach-line">{playout.sans.join(' ')}</p>
      <p className="coach-summary">
        {playout.status === 'thinking' ? t('playout.thinking') : playout.status === 'over' ? playout.result : t('common.yourMove')}
      </p>
      <p className="muted small">{t('playout.help')}</p>
      <div className="coach-actions">
        <button onClick={endPlayout}>{t('common.backToReview')}</button>
      </div>
    </section>
  );
}
