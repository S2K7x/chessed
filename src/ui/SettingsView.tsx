import { useStore } from '../app/store';

export function SettingsView() {
  const { settings } = useStore();
  const { updateSettings } = useStore.getState();
  return (
    <div className="settings card">
      <h1>Settings</h1>
      <label>
        Lichess username
        <input value={settings.lichessUsername} onChange={(e) => void updateSettings({ lichessUsername: e.target.value })} autoComplete="off" spellCheck={false} />
      </label>
      <label>
        Chess.com username
        <input value={settings.chesscomUsername} onChange={(e) => void updateSettings({ chesscomUsername: e.target.value })} autoComplete="off" spellCheck={false} />
      </label>
      <p className="muted">Used to know which side you played, and to find your Chess.com games by link.</p>
      <label>
        Analysis depth: {settings.depth}
        <input type="range" min={10} max={22} value={settings.depth} onChange={(e) => void updateSettings({ depth: Number(e.target.value) })} />
      </label>
      <p className="muted">Higher is more precise and slower. 14 reviews a 40-move game in about a minute on a recent laptop.</p>
      <fieldset>
        <legend>Theme</legend>
        {(['system', 'light', 'dark'] as const).map((t) => (
          <label key={t} className="radio">
            <input type="radio" name="theme" checked={settings.theme === t} onChange={() => void updateSettings({ theme: t })} />
            {t[0]!.toUpperCase() + t.slice(1)}
          </label>
        ))}
      </fieldset>
      <p className="muted small">
        Chess Coach is free software (GPL-3.0-or-later), powered by Stockfish 19. See the <a href="https://github.com/S2K7x/chessed">source code</a>.
      </p>
    </div>
  );
}
