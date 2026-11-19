import { useState, type FormEvent } from 'react';
import { useStore } from '../app/store';
import type { Color } from '../core/eval';
import type { OpponentLine, OpponentSide } from '../core/opponent';
import { t } from '../i18n';
import { sideLower } from './names';

const pct = (x: number) => `${Math.round(100 * x)}${t('common.percent')}`;

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
      <h1>{t('opponent.title')}</h1>
      <p className="muted">{t('opponent.intro')}</p>
      <form className="opponent-form" onSubmit={submit}>
        <select aria-label={t('opponent.site')} value={platform} onChange={(e) => setPlatform(e.target.value as 'lichess' | 'chesscom')}>
          <option value="lichess">Lichess</option>
          <option value="chesscom">Chess.com</option>
        </select>
        <input aria-label={t('opponent.username')} placeholder={t('opponent.placeholder')} value={username} onChange={(e) => setUsername(e.target.value)} />
        <select aria-label={t('opponent.max')} value={max} onChange={(e) => setMax(Number(e.target.value))}>
          {[50, 100, 200].map((n) => (
            <option key={n} value={n}>
              {t('opponent.last', { n })}
            </option>
          ))}
        </select>
        <button className="primary" type="submit" disabled={!username.trim() || opponent?.loading}>
          {opponent?.loading ? t('opponent.loading') : t('opponent.scout')}
        </button>
      </form>

      {report && report.games === 0 && <p className="muted">{t('opponent.noGame', { name: report.username })}</p>}
      {report && report.games > 0 && (
        <>
          <p className="opponent-summary">
            <strong>{report.username}</strong> · {t('common.games', { count: report.games })} · {t('opponent.scores')} {pct((report.white.score * report.white.games + report.black.score * report.black.games) / report.games)}
          </p>
          <div className="opponent-sides">
            <Side title={t('opponent.asWhite')} side={report.white} you="black" hasMe={hasMe} />
            <Side title={t('opponent.asBlack')} side={report.black} you="white" hasMe={hasMe} />
          </div>
        </>
      )}
      <p>
        <button className="link" onClick={() => setView('training')}>{t('common.backToTraining')}</button>
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
          <span className="opponent-score" title={t('opponent.lineTitle', { count: l.games, pct: pct(l.score) })}>
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
        <p className="muted">{t('opponent.noGameSide')}</p>
      </section>
    );
  }
  return (
    <section className="opponent-side">
      <h2>{title}</h2>
      <p className="muted small">
        {t('opponent.sideSummary', { count: side.games, pct: pct(side.score) })}
      </p>
      <Lines lines={side.lines.slice(0, 6)} />
      {side.strong.length > 0 && (
        <>
          <h3>{t('opponent.strong')}</h3>
          <Lines lines={side.strong.slice(0, 3)} />
        </>
      )}
      {side.weak.length > 0 && (
        <>
          <h3>{t('opponent.weak')}</h3>
          <Lines lines={side.weak.slice(0, 3)} />
        </>
      )}
      {hasMe ? (
        <button onClick={() => void practiseAgainst(you)}>{t('opponent.train', { side: sideLower(you) })}</button>
      ) : (
        <p className="muted small">{t('opponent.needMe')}</p>
      )}
    </section>
  );
}
