import { useStore } from '../app/store';

export function PlayoutPanel() {
  const { playout } = useStore();
  const { endPlayout } = useStore.getState();
  if (!playout) return null;
  return (
    <section className="coach" aria-live="polite">
      <p className="coach-kicker">Play it out</p>
      <h2 className="coach-title">Now convert it: play on against Maia ({playout.maiaElo}).</h2>
      <p className="coach-line">{playout.sans.join(' ')}</p>
      <p className="coach-summary">
        {playout.status === 'thinking' ? 'Maia is thinking…' : playout.status === 'over' ? playout.result : 'Your move.'}
      </p>
      <p className="muted small">Maia plays like a human of that rating, mistakes included.</p>
      <div className="coach-actions">
        <button onClick={endPlayout}>Back to the review</button>
      </div>
    </section>
  );
}
