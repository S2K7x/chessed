import { useStore } from '../app/store';
import { epdOf } from '../core/chess';
import type { ExplorerResult } from '../core/explorer';
import { myChoicesAt } from '../core/repertoire';

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
    const title = source === 'masters' ? 'Masters' : 'Players at your level';
    if (!r) return null;
    if (r === 'loading') return <p className="muted small">Loading {title.toLowerCase()}…</p>;
    if ('error' in r) {
      return r.auth ? (
        <p className="small">
          The opening explorer needs a Lichess login. <button className="link" onClick={() => void connectLichess()}>Connect Lichess</button>
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
          <strong>In your other games here</strong> you played{' '}
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
            <button className="small-button" onClick={() => void loadExplorer(fen, 'masters')}>Masters</button>
            <button className="small-button" onClick={() => void loadExplorer(fen, 'lichess')}>Players at your level</button>
          </>
        ) : (
          <button className="link small" onClick={() => void connectLichess()}>
            Connect Lichess to see what masters and players at your level play here
          </button>
        )}
      </div>
      {block('masters')}
      {block('lichess')}
    </div>
  );
}

function ExplorerTable({ title, result, playedUci }: { title: string; result: ExplorerResult; playedUci: string }) {
  if (result.total === 0) return <p className="muted small">{title}: no games from this position.</p>;
  return (
    <table className="table explorer">
      <caption className="small">
        {title} · {result.total.toLocaleString('en')} games{result.opening ? ` · ${result.opening.name}` : ''}
      </caption>
      <thead>
        <tr>
          <th>Move</th>
          <th className="num">Games</th>
          <th>White / draw / Black</th>
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
                <span className="wdl" title={`White ${Math.round(w)}% · draws ${Math.round(d)}% · Black ${Math.round(100 - w - d)}%`}>
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
