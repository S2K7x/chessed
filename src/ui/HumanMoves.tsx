import { useStore } from '../app/store';
import { t } from '../i18n';

/** What players of this rating play here (Maia-3), with the played move highlighted. */
export function HumanMoves({ moveIndex, playedUci, bestUci }: { moveIndex: number; playedUci: string; bestUci?: string }) {
  const { human } = useStore();
  const { loadHumanMoves } = useStore.getState();
  const state = human?.moveIndex === moveIndex ? human : undefined;
  if (!state) {
    return (
      <button className="link small" onClick={() => void loadHumanMoves(moveIndex)}>
        {t('human.ask')}
      </button>
    );
  }
  if (state.status === 'loading') return <p className="muted small">{t('human.loading')}</p>;
  if (state.status === 'error') return <p className="muted small">{t('human.error', { reason: state.error ?? '' })}</p>;
  const moves = state.moves ?? [];
  const played = moves.find((m) => m.uci === playedUci);
  const top = moves[0];
  return (
    <div className="human">
      <p className="small muted">{t('human.title', { elo: state.elo })}</p>
      <ul className="human-list">
        {moves.slice(0, 3).map((m) => (
          <li key={m.uci} className={m.uci === playedUci ? 'is-played' : m.uci === bestUci ? 'is-best' : ''}>
            <span className="human-san">{m.san}</span>
            <span className="human-bar" style={{ width: `${Math.round(m.probability * 100)}%` }} />
            <span className="human-pct">{Math.round(m.probability * 100)}%</span>
          </li>
        ))}
      </ul>
      {top?.uci === playedUci && (
        <p className="small">{t('human.natural')}</p>
      )}
      {played && top?.uci !== playedUci && <p className="small muted">{t('human.share', { pct: Math.round(played.probability * 100) })}</p>}
    </div>
  );
}
