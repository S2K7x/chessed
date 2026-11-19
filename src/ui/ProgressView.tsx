import { useEffect, useState } from 'react';
import { useStore } from '../app/store';
import type { Profile, ThemeStat } from '../core/profile';
import { inconsistencies } from '../core/repertoire';
import { calendar, dayKey, streaks, type ActivityDay } from '../core/activity';

const pct = (x: number | undefined, digits = 0) => (x === undefined ? '–' : x.toFixed(digits));

export function ProgressView() {
  const { profile, settings, reanalysis, dueCount, repertoire, activity, today } = useStore();
  const { loadProfile, reanalyseOutdated, startTraining, setView } = useStore.getState();
  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (!settings.lichessUsername && !settings.chesscomUsername) {
    return (
      <div className="card narrow">
        <h1>Your progress</h1>
        <p>Add your Lichess or Chess.com username in Settings: the dashboard follows the games you played.</p>
        <button className="primary" onClick={() => setView('settings')}>Open Settings</button>
      </div>
    );
  }
  if (!profile || profile === 'loading') return <p className="muted">Loading your games…</p>;
  const { data: p, outdated } = profile;
  if (p.games === 0) {
    return (
      <div className="card narrow">
        <h1>Your progress</h1>
        <p>No analysed game of yours yet. Review a few games and come back: the dashboard needs about ten to say something useful.</p>
        <button className="primary" onClick={() => setView('home')}>Review a game</button>
      </div>
    );
  }

  return (
    <div className="progress-page">
      <header className="progress-head">
        <h1>Your progress</h1>
        <p className="muted">
          {p.games} analysed game{p.games > 1 ? 's' : ''} · {p.results.wins} won, {p.results.draws} drawn, {p.results.losses} lost
        </p>
      </header>

      {outdated > 0 && (
        <p className="notice">
          {reanalysis
            ? `Re-analysing older reviews… ${reanalysis.done}/${reanalysis.total}`
            : `${outdated} game${outdated > 1 ? 's were' : ' was'} analysed with older rules.`}{' '}
          {!reanalysis && <button className="link" onClick={() => void reanalyseOutdated()}>Re-analyse now</button>}
        </p>
      )}

      <section className="tiles">
        <Tile label="Average accuracy" value={pct(p.accuracy, 1)} />
        <Tile label="Serious errors per 100 moves" value={pct(p.errorsPer100, 1)} />
        <Tile
          label="Errors in time trouble"
          value={p.timeTrouble.withClock ? `${Math.round((100 * p.timeTrouble.errors) / p.timeTrouble.withClock)}%` : '–'}
        />
        <Tile
          label="Serious errors played fast"
          value={p.fastErrors.withClock ? `${Math.round((100 * p.fastErrors.errors) / p.fastErrors.withClock)}%` : '–'}
        />
        <Tile label="Positions to review today" value={String(dueCount)} action={dueCount > 0 ? { label: 'Train now', run: () => void startTraining() } : undefined} />
      </section>

      <ActivityCard days={activity ?? []} todayPositions={today?.positions ?? 0} goal={settings.dailyGoal} />

      <section className="card">
        <h2>Work on these first</h2>
        {p.priorities.length === 0 ? (
          <p className="muted">Not enough repeated errors yet to name a priority. Keep reviewing your games.</p>
        ) : (
          <div className="priorities">
            {p.priorities.map((t, i) => (
              <article key={`${t.kind}|${t.theme}`} className="priority">
                <p className="priority-rank">{i + 1}</p>
                <h3>{capitalize(t.theme)}</h3>
                <p className="muted small">{describe(t)}</p>
                {t.lesson && <p className="small">{t.lesson}</p>}
                <button onClick={() => void startTraining(t.theme)}>Train this theme</button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Accuracy, game by game</h2>
        <AccuracyChart points={p.accuracyTrend} />
        <div className="phase-row">
          {(['opening', 'middlegame', 'endgame'] as const).map((ph) => (
            <div key={ph} className="phase">
              <span className="muted small">{capitalize(ph)}</span>
              <strong>{pct(p.accuracyByPhase[ph], 1)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>Your errors by theme</h2>
        <p className="muted small">
          Per 100 opportunities: for missed tactics, positions where the tactic existed; for the rest, moves you played.
          {p.windows ? ` Trend: your last ${p.windows.recent} games against the ${p.windows.previous} before.` : ''}
        </p>
        <ThemeBars themes={p.themes} />
        {p.improved.length > 0 && (
          <p className="improved">
            <strong>Errors you no longer make:</strong> {p.improved.map((t) => t.theme).join(', ')}.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Openings</h2>
        <OpeningTable openings={p.openings} />
        {repertoire && inconsistencies(repertoire).length > 0 && (
          <>
            <h3 className="subhead">Choices to settle</h3>
            <p className="muted small">Positions where you have played different moves. Pick one and learn it well.</p>
            <ul className="settle">
              {inconsistencies(repertoire)
                .slice(0, 5)
                .map((p) => (
                  <li key={p.epd}>
                    <span className="settle-line">{p.line || 'Start'}</span>
                    {p.moves.map((m) => (
                      <span key={m.san} className="settle-move">
                        {m.san} ×{m.count} ({Math.round((100 * m.points) / m.count)}%)
                      </span>
                    ))}
                  </li>
                ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function describe(t: ThemeStat): string {
  const what = t.kind === 'missed' ? `missed ${t.errors} of ${t.opportunities} chances` : `${t.errors} errors in ${t.opportunities} moves`;
  return `${what} · costs ${Math.round(t.avgCost)}% of winning chances on average`;
}

function Tile({ label, value, action }: { label: string; value: string; action?: { label: string; run: () => void } | undefined }) {
  return (
    <div className="tile">
      <span className="tile-value">{value}</span>
      <span className="tile-label">{label}</span>
      {action && (
        <button className="primary tile-action" onClick={action.run}>
          {action.label}
        </button>
      )}
    </div>
  );
}

const CW = 640;
const CH = 180;
const PAD = { l: 34, r: 12, t: 12, b: 22 };

/** One series (the player's accuracy per game): a line with a hover tooltip. */
function AccuracyChart({ points }: { points: Profile['accuracyTrend'] }) {
  const [hover, setHover] = useState<number | undefined>();
  if (points.length < 2) return <p className="muted small">The curve appears after two games.</p>;
  const lo = Math.max(0, Math.floor(Math.min(...points.map((p) => p.accuracy)) / 10) * 10 - 10);
  const x = (i: number) => PAD.l + (i / (points.length - 1)) * (CW - PAD.l - PAD.r);
  const y = (a: number) => PAD.t + (1 - (a - lo) / (100 - lo)) * (CH - PAD.t - PAD.b);
  const ticks = [lo, Math.round((lo + 100) / 2), 100];
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.accuracy).toFixed(1)}`).join(' ');
  const h = hover !== undefined ? points[hover] : undefined;
  return (
    <div className="chart">
      <svg
        viewBox={`0 0 ${CW} ${CH}`}
        role="img"
        aria-label={`Accuracy over your last ${points.length} games`}
        onMouseMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const rel = ((e.clientX - r.left) / r.width) * CW;
          const i = Math.round(((rel - PAD.l) / (CW - PAD.l - PAD.r)) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, i)));
        }}
        onMouseLeave={() => setHover(undefined)}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-grid" x1={PAD.l} x2={CW - PAD.r} y1={y(t)} y2={y(t)} />
            <text className="chart-axis" x={PAD.l - 6} y={y(t) + 4} textAnchor="end">
              {t}
            </text>
          </g>
        ))}
        <path className="chart-line" d={path} />
        {h && hover !== undefined && (
          <g>
            <line className="chart-cross" x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={CH - PAD.b} />
            <circle className="chart-dot" cx={x(hover)} cy={y(h.accuracy)} r="5" />
          </g>
        )}
      </svg>
      {h && hover !== undefined && (
        <div className="chart-tip" style={{ left: `${(x(hover) / CW) * 100}%` }}>
          <strong>{h.accuracy.toFixed(1)}</strong> · {h.date}
          <br />
          <span className="muted">{h.label}</span>
        </div>
      )}
    </div>
  );
}

/** One measure across themes: horizontal bars, sorted, one colour. */
function ThemeBars({ themes }: { themes: ThemeStat[] }) {
  const shown = themes.filter((t) => t.errors > 0).sort((a, b) => b.rate - a.rate).slice(0, 10);
  if (shown.length === 0) return <p className="muted small">No errors to group yet.</p>;
  const max = Math.max(...shown.map((t) => t.rate), 1);
  return (
    <ul className="bars">
      {shown.map((t) => {
        const trend =
          t.previousRate !== undefined && t.recentRate !== undefined
            ? t.recentRate < t.previousRate * 0.8
              ? { label: 'improving', glyph: '↓' }
              : t.recentRate > t.previousRate * 1.2
                ? { label: 'worse lately', glyph: '↑' }
                : { label: 'stable', glyph: '→' }
            : undefined;
        return (
          <li key={`${t.kind}|${t.theme}`} title={describe(t)}>
            <span className="bar-label">
              {capitalize(t.theme)} <span className="muted small">({t.kind})</span>
            </span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(t.rate / max) * 100}%` }} />
            </span>
            <span className="bar-value">{t.rate.toFixed(1)}</span>
            <span className={`bar-trend ${trend?.label === 'improving' ? 'is-good' : trend?.label === 'worse lately' ? 'is-bad' : ''}`} title={trend?.label}>
              {trend ? `${trend.glyph} ${trend.label}` : ''}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function OpeningTable({ openings }: { openings: Profile['openings'] }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th>Opening</th>
          <th>Side</th>
          <th className="num">Games</th>
          <th className="num">Score</th>
          <th className="num">Loss after theory</th>
        </tr>
      </thead>
      <tbody>
        {openings.slice(0, 12).map((o) => (
          <tr key={`${o.color}|${o.name}`}>
            <td>{o.name}</td>
            <td>{o.color === 'white' ? 'White' : 'Black'}</td>
            <td className="num">{o.games}</td>
            <td className="num">{Math.round(o.score * 100)}%</td>
            <td className="num">{o.avgLossAfterBook !== undefined ? `${o.avgLossAfterBook.toFixed(1)}%` : '–'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Streak, today's goal and a twelve-week calendar of training. */
function ActivityCard({ days, todayPositions, goal }: { days: ActivityDay[]; todayPositions: number; goal: number }) {
  const today = dayKey(new Date());
  // Today's count may be more recent than the loaded days.
  const merged = [...days.filter((d) => d.day !== today), { day: today, positions: todayPositions, games: days.find((d) => d.day === today)?.games ?? 0 }];
  const { current, best } = streaks(merged, today);
  const weeks = calendar(merged, today, goal);
  return (
    <section className="card activity">
      <div className="activity-head">
        <div>
          <h2>Regular practice</h2>
          <p className="muted small">A little every day beats long sessions now and then.</p>
        </div>
        <div className="activity-stats">
          <p>
            <strong>{current}</strong>
            <small>day streak · best {best}</small>
          </p>
          <p>
            <strong>
              {Math.min(todayPositions, goal)}/{goal}
            </strong>
            <small>positions today</small>
          </p>
        </div>
      </div>
      <div className="calendar" role="img" aria-label={`Training over the last ${weeks.length} weeks: ${merged.filter((d) => d.positions + d.games > 0).length} active days`}>
        {weeks.map((w, i) => (
          <div key={i} className="calendar-week">
            {w.map((c) => (
              <span
                key={c.day}
                className={`calendar-day level-${c.level}${c.future ? ' is-future' : ''}${c.day === today ? ' is-today' : ''}`}
                title={`${c.day}: ${c.positions} position${c.positions === 1 ? '' : 's'}, ${c.games} game${c.games === 1 ? '' : 's'} analysed`}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
