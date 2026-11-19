import { useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import type { Color } from '../core/eval';
import type { OpponentLine, OpponentSide } from '../core/opponent';

const pct = (x: number) => `${Math.round(100 * x)}%`;

/** Preparing for an opponent: their openings, how they score, and training against them. */
export function OpponentView() {
  const { opponent, settings } = useStore();
  const { scoutOpponent, setView } = useStore.getState();
  const [platform, setPlatform] = useState<'lichess' | 'chesscom'>(opponent?.platform ?? 'lichess');
  const [username, setUsername] = useState(opponent?.username ?? '');
  const [max, setMax] = useState(100);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void scoutOpponent(platform, username, max);
  };
  const report = opponent?.report;
  const hasMe = !!(settings.lichessUsername || settings.chesscomUsername);

  return (
    <div className="card opponent">
      <h1>Prepare for an opponent</h1>
      <p className="muted">
        Their recent games show what they play with each colour, and where they do well or badly. Then train your openings against their
        actual moves.
      </p>
      <form className="opponent-form" onSubmit={submit}>
        <select aria-label="Site" value={platform} onChange={(e) => setPlatform(e.target.value as 'lichess' | 'chesscom')}>
          <option value="lichess">Lichess</option>
          <option value="chesscom">Chess.com</option>
        </select>
        <input aria-label="Opponent's username" placeholder="Their username" value={username} onChange={(e) => setUsername(e.target.value)} />
        <select aria-label="Games to look at" value={max} onChange={(e) => setMax(Number(e.target.value))}>
          {[50, 100, 200].map((n) => (
            <option key={n} value={n}>
              Last {n} games
            </option>
          ))}
        </select>
        <button className="primary" type="submit" disabled={!username.trim() || opponent?.loading}>
          {opponent?.loading ? 'Loading their games…' : 'Scout'}
        </button>
      </form>

      {report && report.games === 0 && <p className="muted">No finished game of {report.username} found.</p>}
      {report && report.games > 0 && (
        <>
          <p className="opponent-summary">
            <strong>{report.username}</strong> · {report.games} games · scores {pct((report.white.score * report.white.games + report.black.score * report.black.games) / report.games)}
          </p>
          <div className="opponent-sides">
            <Side title="When they play White" side={report.white} you="black" hasMe={hasMe} />
            <Side title="When they play Black" side={report.black} you="white" hasMe={hasMe} />
          </div>
        </>
      )}
      <p>
        <button className="link" onClick={() => setView('training')}>Back to training</button>
      </p>
    </div>
  );
}

function Lines({ lines }: { lines: OpponentLine[] }) {
  return (
    <ul className="opponent-lines">
      {lines.map((l) => (
        <li key={l.moves}>
          <span className="opponent-line">
            {l.opening && <strong>{l.opening}</strong>}
            <span className="muted small">{l.moves}</span>
          </span>
          <span className="opponent-score" title={`${l.games} games, they score ${pct(l.score)}`}>
            <span className="score-bar" aria-hidden="true">
              <span style={{ width: pct(l.score) }} />
            </span>
            {pct(l.score)} · {l.games}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Side({ title, side, you, hasMe }: { title: string; side: OpponentSide; you: Color; hasMe: boolean }) {
  const { practiseAgainst } = useStore.getState();
  if (side.games === 0) {
    return (
      <section className="opponent-side">
        <h2>{title}</h2>
        <p className="muted">No game.</p>
      </section>
    );
  }
  return (
    <section className="opponent-side">
      <h2>{title}</h2>
      <p className="muted small">
        {side.games} games · they score {pct(side.score)}
      </p>
      <Lines lines={side.lines.slice(0, 6)} />
      {side.strong.length > 0 && (
        <>
          <h3>Their best lines: avoid them</h3>
          <Lines lines={side.strong.slice(0, 3)} />
        </>
      )}
      {side.weak.length > 0 && (
        <>
          <h3>Their weakest lines: aim for them</h3>
          <Lines lines={side.weak.slice(0, 3)} />
        </>
      )}
      {hasMe ? (
        <button onClick={() => void practiseAgainst(you)}>Train your openings as {you} against their moves</button>
      ) : (
        <p className="muted small">Set your username in Settings to train your openings against theirs.</p>
      )}
    </section>
  );
}
