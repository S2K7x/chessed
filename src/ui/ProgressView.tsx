import { useEffect, useState } from 'react';
import { useStore } from '../app/store';
import type { Profile, ThemeStat } from '../core/profile';
import { inconsistencies } from '../core/repertoire';
import { calendar, dayKey, streaks, type ActivityDay } from '../core/activity';
import { cap, num, t } from '../i18n';
import { themeName } from '../core/summary';
import { sideName } from './names';

const pct = (x: number | undefined, digits = 0) => (x === undefined ? '–' : num(x, digits));

export function ProgressView() {
  const { profile, settings, reanalysis, dueCount, repertoire, activity, today } = useStore();
  const { loadProfile, reanalyseOutdated, startTraining, setView } = useStore.getState();
  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  if (!settings.lichessUsername && !settings.chesscomUsername) {
    return (
      <div className="card narrow">
        <h1>{t('progress.title')}</h1>
        <p>{t('progress.needUser')}</p>
        <button className="primary" onClick={() => setView('settings')}>{t('progress.openSettings')}</button>
      </div>
    );
  }
  if (!profile || profile === 'loading') return <p className="muted">{t('progress.loading')}</p>;
  const { data: p, outdated } = profile;
  if (p.games === 0) {
    return (
      <div className="card narrow">
        <h1>{t('progress.title')}</h1>
        <p>{t('progress.noGames')}</p>
        <button className="primary" onClick={() => setView('home')}>{t('home.title')}</button>
      </div>
    );
  }

  return (
    <div className="progress-page">
      <header className="progress-head">
        <h1>{t('progress.title')}</h1>
        <p className="muted">
          {t('progress.head', { count: p.games, wins: p.results.wins, draws: p.results.draws, losses: p.results.losses })}
        </p>
      </header>

      {outdated > 0 && (
        <p className="notice">
          {reanalysis
            ? t('progress.reanalysing', { done: reanalysis.done, total: reanalysis.total })
            : t('progress.outdated', { count: outdated })}{' '}
          {!reanalysis && <button className="link" onClick={() => void reanalyseOutdated()}>{t('progress.reanalyse')}</button>}
        </p>
      )}

      <section className="tiles">
        <Tile label={t('progress.tile.accuracy')} value={pct(p.accuracy, 1)} />
        <Tile label={t('progress.tile.errors')} value={pct(p.errorsPer100, 1)} />
        <Tile
          label={t('progress.tile.timeTrouble')}
          value={p.timeTrouble.withClock ? `${Math.round((100 * p.timeTrouble.errors) / p.timeTrouble.withClock)}%` : '–'}
        />
        <Tile
          label={t('progress.tile.fast')}
          value={p.fastErrors.withClock ? `${Math.round((100 * p.fastErrors.errors) / p.fastErrors.withClock)}%` : '–'}
        />
        <Tile label={t('progress.tile.due')} value={String(dueCount)} action={dueCount > 0 ? { label: t('progress.trainNow'), run: () => void startTraining() } : undefined} />
      </section>

      <ActivityCard days={activity ?? []} todayPositions={today?.positions ?? 0} goal={settings.dailyGoal} />

      <section className="card">
        <h2>{t('progress.priorities')}</h2>
        {p.priorities.length === 0 ? (
          <p className="muted">{t('progress.noPriority')}</p>
        ) : (
          <div className="priorities">
            {p.priorities.map((th, i) => (
              <article key={`${th.kind}|${th.theme}`} className="priority">
                <p className="priority-rank">{i + 1}</p>
                <h3>{cap(themeName(th.theme))}</h3>
                <p className="muted small">{describe(th)}</p>
                {th.lesson && <p className="small">{th.lesson}</p>}
                <button onClick={() => void startTraining(th.theme)}>{t('progress.trainTheme')}</button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>{t('progress.trend')}</h2>
        <AccuracyChart points={p.accuracyTrend} />
        <div className="phase-row">
          {(['opening', 'middlegame', 'endgame'] as const).map((ph) => (
            <div key={ph} className="phase">
              <span className="muted small">{t(`phase.${ph}`)}</span>
              <strong>{pct(p.accuracyByPhase[ph], 1)}</strong>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h2>{t('progress.themes')}</h2>
        <p className="muted small">
          {t('progress.themesHelp')}
          {p.windows ? ` ${t('progress.windows', { recent: p.windows.recent, previous: p.windows.previous })}` : ''}
        </p>
        <ThemeBars themes={p.themes} />
        {p.improved.length > 0 && (
          <p className="improved">
            <strong>{t('progress.improved')}</strong> {p.improved.map((th) => themeName(th.theme)).join(', ')}.
          </p>
        )}
      </section>

      <section className="card">
        <h2>{t('progress.openings')}</h2>
        <OpeningTable openings={p.openings} />
        {repertoire && inconsistencies(repertoire).length > 0 && (
          <>
            <h3 className="subhead">{t('progress.settle')}</h3>
            <p className="muted small">{t('progress.settleHelp')}</p>
            <ul className="settle">
              {inconsistencies(repertoire)
                .slice(0, 5)
                .map((p) => (
                  <li key={p.epd}>
                    <span className="settle-line">{p.line || t('progress.start')}</span>
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


function describe(th: ThemeStat): string {
  const what =
    th.kind === 'missed'
      ? t('progress.describe.missed', { errors: th.errors, count: th.opportunities })
      : t('progress.describe.errors', { errors: th.errors, count: th.opportunities });
  return t('progress.describe', { what, cost: Math.round(th.avgCost) });
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
  if (points.length < 2) return <p className="muted small">{t('progress.curveLater')}</p>;
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
        aria-label={t('progress.curveLabel', { count: points.length })}
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
          <strong>{num(h.accuracy, 1)}</strong> · {h.date}
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
  if (shown.length === 0) return <p className="muted small">{t('progress.noThemes')}</p>;
  const max = Math.max(...shown.map((t) => t.rate), 1);
  return (
    <ul className="bars">
      {shown.map((th) => {
        const trend =
          th.previousRate !== undefined && th.recentRate !== undefined
            ? th.recentRate < th.previousRate * 0.8
              ? { id: 'improving', label: t('progress.trend.improving'), glyph: '↓' }
              : th.recentRate > th.previousRate * 1.2
                ? { id: 'worse', label: t('progress.trend.worse'), glyph: '↑' }
                : { id: 'stable', label: t('progress.trend.stable'), glyph: '→' }
            : undefined;
        return (
          <li key={`${th.kind}|${th.theme}`} title={describe(th)}>
            <span className="bar-label">
              {cap(themeName(th.theme))} <span className="muted small">({t(`progress.kind.${th.kind}`)})</span>
            </span>
            <span className="bar-track">
              <span className="bar-fill" style={{ width: `${(th.rate / max) * 100}%` }} />
            </span>
            <span className="bar-value">{num(th.rate, 1)}</span>
            <span className={`bar-trend ${trend?.id === 'improving' ? 'is-good' : trend?.id === 'worse' ? 'is-bad' : ''}`} title={trend?.label}>
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
          <th>{t('progress.col.opening')}</th>
          <th>{t('progress.col.side')}</th>
          <th className="num">{t('explorer.col.games')}</th>
          <th className="num">{t('progress.col.score')}</th>
          <th className="num">{t('progress.col.loss')}</th>
        </tr>
      </thead>
      <tbody>
        {openings.slice(0, 12).map((o) => (
          <tr key={`${o.color}|${o.name}`}>
            <td>{o.name}</td>
            <td>{sideName(o.color)}</td>
            <td className="num">{o.games}</td>
            <td className="num">{Math.round(o.score * 100)}%</td>
            <td className="num">{o.avgLossAfterBook !== undefined ? `${num(o.avgLossAfterBook, 1)}${t('common.percent')}` : '–'}</td>
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
          <h2>{t('progress.activity')}</h2>
          <p className="muted small">{t('progress.activityHelp')}</p>
        </div>
        <div className="activity-stats">
          <p>
            <strong>{current}</strong>
            <small>{t('progress.streak', { best })}</small>
          </p>
          <p>
            <strong>
              {Math.min(todayPositions, goal)}/{goal}
            </strong>
            <small>{t('progress.today')}</small>
          </p>
        </div>
      </div>
      <div className="calendar" role="img" aria-label={t('progress.calendar', { weeks: weeks.length, days: merged.filter((d) => d.positions + d.games > 0).length })}>
        {weeks.map((w, i) => (
          <div key={i} className="calendar-week">
            {w.map((c) => (
              <span
                key={c.day}
                className={`calendar-day level-${c.level}${c.future ? ' is-future' : ''}${c.day === today ? ' is-today' : ''}`}
                title={`${c.day}: ${t('common.positions', { count: c.positions })}, ${t('progress.gamesAnalysed', { count: c.games })}`}
              />
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}
