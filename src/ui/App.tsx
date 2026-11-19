import { lazy, Suspense, useEffect } from 'react';
import { useStore } from '../app/store';
import { requestPersistence } from '../db/db';
import { preloadScheduler } from '../core/training';
import { loadOpeningBook } from '../core/openings';
import { HomeView } from './HomeView';
import { LanguageSwitch } from './LanguageSwitch';
import { LOCALES, loadLocale, t } from '../i18n';
import { ReviewView } from './ReviewView';

// Screens other than the game list and the review load on first use, and are
// fetched while the browser is idle so that the service worker caches them for
// offline use.
const loaders = {
  settings: () => import('./SettingsView'),
  progress: () => import('./ProgressView'),
  training: () => import('./TrainingView'),
  woodpecker: () => import('./WoodpeckerView'),
  endgames: () => import('./EndgamesView'),
  guess: () => import('./GuessView'),
  openings: () => import('./OpeningsView'),
  opponent: () => import('./OpponentView'),
};
const SettingsView = lazy(() => loaders.settings().then((m) => ({ default: m.SettingsView })));
const ProgressView = lazy(() => loaders.progress().then((m) => ({ default: m.ProgressView })));
const TrainingView = lazy(() => loaders.training().then((m) => ({ default: m.TrainingView })));
const WoodpeckerView = lazy(() => loaders.woodpecker().then((m) => ({ default: m.WoodpeckerView })));
const EndgamesView = lazy(() => loaders.endgames().then((m) => ({ default: m.EndgamesView })));
const GuessView = lazy(() => loaders.guess().then((m) => ({ default: m.GuessView })));
const OpeningsView = lazy(() => loaders.openings().then((m) => ({ default: m.OpeningsView })));
const OpponentView = lazy(() => loaders.opponent().then((m) => ({ default: m.OpponentView })));

function prefetchWhenIdle() {
  const run = () => {
    for (const load of Object.values(loaders)) void load().catch(() => undefined);
    void import('../data/masterGames.json').catch(() => undefined);
    // Every analysis needs the opening book: cache it before the first one.
    void loadOpeningBook().catch(() => undefined);
    void preloadScheduler().catch(() => undefined);
    // The other language, so that switching works offline too.
    for (const l of LOCALES) void loadLocale(l).catch(() => undefined);
  };
  if ('requestIdleCallback' in window) window.requestIdleCallback(run, { timeout: 5000 });
  else setTimeout(run, 2000);
}

export function App() {
  const { view, error, settings, game, dueCount, locale } = useStore();
  const { init, setView, dismissError } = useStore.getState();

  useEffect(() => {
    void init();
    void requestPersistence();
    prefetchWhenIdle();
  }, [init]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView('home')} aria-label={t('nav.home')}>
          <span className="brand-mark" aria-hidden>♞</span> Chess Coach
        </button>
        <nav className="nav">
          <button className={view === 'home' ? 'is-current' : ''} onClick={() => setView('home')}>{t('nav.games')}</button>
          {game && (
            <button className={view === 'review' ? 'is-current' : ''} onClick={() => setView('review')}>{t('nav.review')}</button>
          )}
          <button className={view === 'progress' ? 'is-current' : ''} onClick={() => setView('progress')}>{t('nav.progress')}</button>
          <button className={['training', 'woodpecker', 'endgames', 'guess', 'openings', 'opponent'].includes(view) ? 'is-current' : ''} onClick={() => setView('training')}>
            {t('nav.training')}{dueCount > 0 ? <span className="count" aria-label={t('nav.due', { count: dueCount })}>{dueCount}</span> : null}
          </button>
          <button className={view === 'settings' ? 'is-current' : ''} onClick={() => setView('settings')}>{t('nav.settings')}</button>
        </nav>
        <LanguageSwitch compact />
      </header>
      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button className="icon" onClick={dismissError} aria-label={t('common.dismiss')}>✕</button>
        </div>
      )}
      {/* Remounted on a language change, so that every screen is written again in it. */}
      <main className="main" key={locale}>
        <Suspense fallback={<p className="muted">{t('common.loading')}</p>}>
        {view === 'home' && <HomeView />}
        {view === 'review' && <ReviewView />}
        {view === 'progress' && <ProgressView />}
        {view === 'training' && <TrainingView />}
        {view === 'woodpecker' && <WoodpeckerView />}
        {view === 'endgames' && <EndgamesView />}
        {view === 'guess' && <GuessView />}
        {view === 'openings' && <OpeningsView />}
        {view === 'opponent' && <OpponentView />}
        {view === 'settings' && <SettingsView />}
        </Suspense>
      </main>
    </div>
  );
}
