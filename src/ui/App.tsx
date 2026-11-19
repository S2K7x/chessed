import { useEffect } from 'react';
import { useStore } from '../app/store';
import { requestPersistence } from '../db/db';
import { HomeView } from './HomeView';
import { ReviewView } from './ReviewView';
import { SettingsView } from './SettingsView';
import { ProgressView } from './ProgressView';
import { TrainingView } from './TrainingView';
import { WoodpeckerView } from './WoodpeckerView';
import { EndgamesView } from './EndgamesView';
import { GuessView } from './GuessView';

export function App() {
  const { view, error, settings, game, dueCount } = useStore();
  const { init, setView, dismissError } = useStore.getState();

  useEffect(() => {
    void init();
    void requestPersistence();
  }, [init]);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [settings.theme]);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => setView('home')} aria-label="Chess Coach home">
          <span className="brand-mark" aria-hidden>♞</span> Chess Coach
        </button>
        <nav className="nav">
          <button className={view === 'home' ? 'is-current' : ''} onClick={() => setView('home')}>Games</button>
          {game && (
            <button className={view === 'review' ? 'is-current' : ''} onClick={() => setView('review')}>Review</button>
          )}
          <button className={view === 'progress' ? 'is-current' : ''} onClick={() => setView('progress')}>Progress</button>
          <button className={['training', 'woodpecker', 'endgames', 'guess'].includes(view) ? 'is-current' : ''} onClick={() => setView('training')}>
            Training{dueCount > 0 ? <span className="count" aria-label={`${dueCount} due`}>{dueCount}</span> : null}
          </button>
          <button className={view === 'settings' ? 'is-current' : ''} onClick={() => setView('settings')}>Settings</button>
        </nav>
      </header>
      {error && (
        <div className="error" role="alert">
          <span>{error}</span>
          <button className="icon" onClick={dismissError} aria-label="Dismiss">✕</button>
        </div>
      )}
      <main className="main">
        {view === 'home' && <HomeView />}
        {view === 'review' && <ReviewView />}
        {view === 'progress' && <ProgressView />}
        {view === 'training' && <TrainingView />}
        {view === 'woodpecker' && <WoodpeckerView />}
        {view === 'endgames' && <EndgamesView />}
        {view === 'guess' && <GuessView />}
        {view === 'settings' && <SettingsView />}
      </main>
    </div>
  );
}
