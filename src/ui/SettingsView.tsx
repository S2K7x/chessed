import { useStore } from '../app/store';
import { engineThreads } from '../engine/browserEngine';

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
        <legend>Analysis profile</legend>
        <label className="radio">
          <input type="radio" name="profile" checked={settings.profile === 'quick'} onChange={() => void updateSettings({ profile: 'quick' })} />
          Quick (the depth above, 2 lines)
        </label>
        <label className="radio">
          <input type="radio" name="profile" checked={settings.profile === 'deep'} onChange={() => void updateSettings({ profile: 'deep' })} />
          Deep (depth 20 or more, 3 lines)
        </label>
      </fieldset>
      <p className="muted">Both profiles look again, 4 plies deeper, at every critical moment. Engine: {engineThreads() > 1 ? `${engineThreads()} threads` : 'single thread'}.</p>
      <label className="radio">
        <input type="checkbox" checked={settings.useLichess} onChange={(e) => void updateSettings({ useLichess: e.target.checked })} />
        Use Lichess tablebases and cloud evaluations
      </label>
      <p className="muted">Exact endgame results (7 pieces or fewer) and deep opening evaluations. Those positions are sent to lichess.org.</p>
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
