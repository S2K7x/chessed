import { useStore } from '../app/store';
import { epdOf } from '../core/chess';
import type { ExplorerResult } from '../core/explorer';
import { myChoicesAt } from '../core/repertoire';
import { num, t } from '../i18n';

/**
 * Opening context for a move: what you played here in your other games, and
 * what masters and players around your rating play (Lichess opening explorer).
 */
export function OpeningPanel({ fen, playedUci, isMine, gameId }: { fen: string; playedUci: string; isMine: boolean; gameId: string }) {
  const { repertoire, explorer, settings } = useStore();
  const { loadExplorer, connectLichess } = useStore.getState();
  const choices = isMine && repertoire ? myChoicesAt(repertoire, fen, gameId) : [];

  const block = (source: 'masters' | 'lichess') => {
    const r = explorer[`${source}|${epdOf(fen)}`];
    const title = source === 'masters' ? t('explorer.masters') : t('explorer.level');
    if (!r) return null;
    if (r === 'loading') return <p className="muted small">{t('explorer.loading', { title: title.toLowerCase() })}</p>;
    if ('error' in r) {
      return r.auth ? (
        <p className="small">
          {t('explorer.needLogin')} <button className="link" onClick={() => void connectLichess()}>{t('settings.connectLichess')}</button>
        </p>
      ) : (
        <p className="muted small">{r.error}</p>
      );
    }
    return <ExplorerTable title={title} result={r} playedUci={playedUci} />;
  };

  return (
    <div className="opening-panel">
      {choices.length > 0 && (
        <p className="small">
          <strong>{t('explorer.mine')}</strong> {t('explorer.youPlayed')}{' '}
          {choices.slice(0, 3).map((c, i) => (
            <span key={c.san} className={c.uci === playedUci ? 'is-played' : ''}>
              {i ? ', ' : ''}
              {c.san} ×{c.count} ({Math.round(c.score * 100)}%)
            </span>
          ))}
          .
        </p>
      )}
      <div className="coach-actions">
        {settings.lichessToken ? (
          <>
            <button className="small-button" onClick={() => void loadExplorer(fen, 'masters')}>{t('explorer.masters')}</button>
            <button className="small-button" onClick={() => void loadExplorer(fen, 'lichess')}>{t('explorer.level')}</button>
          </>
        ) : (
          <button className="link small" onClick={() => void connectLichess()}>
            {t('explorer.connect')}
          </button>
        )}
      </div>
      {block('masters')}
      {block('lichess')}
    </div>
  );
}

function ExplorerTable({ title, result, playedUci }: { title: string; result: ExplorerResult; playedUci: string }) {
  if (result.total === 0) return <p className="muted small">{t('explorer.empty', { title })}</p>;
  return (
    <table className="table explorer">
      <caption className="small">
        {title} · {t('explorer.games', { count: result.total, n: num(result.total) })}{result.opening ? ` · ${result.opening.name}` : ''}
      </caption>
      <thead>
        <tr>
          <th>{t('explorer.col.move')}</th>
          <th className="num">{t('explorer.col.games')}</th>
          <th>{t('explorer.col.wdl')}</th>
        </tr>
      </thead>
      <tbody>
        {result.moves.map((m) => {
          const w = (100 * m.white) / m.total;
          const d = (100 * m.draws) / m.total;
          return (
            <tr key={m.uci} className={m.uci === playedUci ? 'is-played' : ''}>
              <td>{m.san}</td>
              <td className="num">{Math.round((100 * m.total) / result.total)}%</td>
              <td>
                <span className="wdl" title={t('explorer.wdl', { w: Math.round(w), d: Math.round(d), b: Math.round(100 - w - d) })}>
                  <span className="wdl-w" style={{ width: `${w}%` }} />
                  <span className="wdl-d" style={{ width: `${d}%` }} />
                  <span className="wdl-b" />
                </span>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
