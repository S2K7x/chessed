import { useStore } from '../app/store';
import { engineThreads } from '../engine/browserEngine';
import { t } from '../i18n';
import { LanguageSwitch } from './LanguageSwitch';

export function SettingsView() {
  const { settings } = useStore();
  const { updateSettings, exportBackup, importBackup, connectLichess, disconnectLichess } = useStore.getState();
  const threads = engineThreads();
  return (
    <div className="settings card">
      <h1>{t('settings.title')}</h1>
      <LanguageSwitch />
      <label>
        {t('settings.lichessUser')}
        <input value={settings.lichessUsername} onChange={(e) => void updateSettings({ lichessUsername: e.target.value })} autoComplete="off" spellCheck={false} />
      </label>
      <label>
        {t('settings.chesscomUser')}
        <input value={settings.chesscomUsername} onChange={(e) => void updateSettings({ chesscomUsername: e.target.value })} autoComplete="off" spellCheck={false} />
      </label>
      <p className="muted">{t('settings.usernamesHelp')}</p>
      <div className="lichess-account">
        {settings.lichessToken ? (
          <>
            <span>{t('settings.lichessConnected')}</span>
            <button onClick={() => void disconnectLichess()}>{t('settings.disconnect')}</button>
          </>
        ) : (
          <>
            <span className="muted small">{t('settings.lichessConnectHelp')}</span>
            <button onClick={() => void connectLichess()}>{t('settings.connectLichess')}</button>
          </>
        )}
      </div>
      <label>
        {t('settings.depth', { depth: settings.depth })}
        <input type="range" min={10} max={22} value={settings.depth} onChange={(e) => void updateSettings({ depth: Number(e.target.value) })} />
      </label>
      <p className="muted">{t('settings.depthHelp')}</p>
      <fieldset>
        <legend>{t('settings.profile')}</legend>
        <label className="radio">
          <input type="radio" name="profile" checked={settings.profile === 'quick'} onChange={() => void updateSettings({ profile: 'quick' })} />
          {t('settings.profile.quick')}
        </label>
        <label className="radio">
          <input type="radio" name="profile" checked={settings.profile === 'deep'} onChange={() => void updateSettings({ profile: 'deep' })} />
          {t('settings.profile.deep')}
        </label>
      </fieldset>
      <p className="muted">
        {t('settings.profileHelp', { engine: threads > 1 ? t('settings.threads', { count: threads }) : t('settings.singleThread') })}
      </p>
      <label className="radio">
        <input type="checkbox" checked={settings.useLichess} onChange={(e) => void updateSettings({ useLichess: e.target.checked })} />
        {t('settings.useLichess')}
      </label>
      <p className="muted">{t('settings.useLichessHelp')}</p>
      <fieldset>
        <legend>{t('settings.level')}</legend>
        {(['auto', 'beginner', 'intermediate', 'advanced'] as const).map((l) => (
          <label key={l} className="radio">
            <input type="radio" name="level" checked={settings.level === l} onChange={() => void updateSettings({ level: l })} />
            {t(`settings.level.${l}`)}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{t('settings.llm')}</legend>
        <label className="radio">
          <input type="checkbox" checked={settings.llmCoach} onChange={(e) => void updateSettings({ llmCoach: e.target.checked })} />
          {t('settings.llm.enable')}
        </label>
        <label>
          {t('settings.llm.url')}
          <input value={settings.coachUrl} placeholder="https://your-worker.workers.dev/coach" onChange={(e) => void updateSettings({ coachUrl: e.target.value })} spellCheck={false} />
        </label>
        <label>
          {t('settings.llm.token')}
          <input type="password" value={settings.coachToken} onChange={(e) => void updateSettings({ coachToken: e.target.value })} autoComplete="off" />
        </label>
        <p className="muted small">{t('settings.llm.help')}</p>
      </fieldset>
      <label>
        {t('settings.dailyGoal')}
        <select value={settings.dailyGoal} onChange={(e) => void updateSettings({ dailyGoal: Number(e.target.value) })}>
          {[5, 10, 20, 30, 50].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>{t('settings.theme')}</legend>
        {(['system', 'light', 'dark'] as const).map((th) => (
          <label key={th} className="radio">
            <input type="radio" name="theme" checked={settings.theme === th} onChange={() => void updateSettings({ theme: th })} />
            {t(`settings.theme.${th}`)}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>{t('settings.data')}</legend>
        <p className="muted small">{t('settings.dataHelp')}</p>
        <div className="import-actions">
          <button onClick={() => void exportBackup()}>{t('settings.export')}</button>
          <label className="button-like">
            {t('settings.import')}
            <input type="file" accept="application/json,.json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void importBackup(f); e.target.value = ''; }} />
          </label>
        </div>
      </fieldset>
      <p className="muted small">
        {t('settings.licence')} <a href="https://github.com/S2K7x/chessed">{t('settings.source')}</a>.
      </p>
    </div>
  );
}
