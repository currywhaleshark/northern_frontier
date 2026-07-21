import type { AudioPrefs } from '../ui/uiPrefs';

interface Props {
  audio: AudioPrefs;
  onChange: (update: Partial<AudioPrefs>) => void;
  onClose: () => void;
  backLabel?: string;
}

function VolumeControl({
  label,
  enabled,
  volume,
  onEnabledChange,
  onVolumeChange,
}: {
  label: string;
  enabled: boolean;
  volume: number;
  onEnabledChange: (enabled: boolean) => void;
  onVolumeChange: (volume: number) => void;
}) {
  return (
    <div className="settings-audio-row">
      <label className="settings-toggle">
        <input type="checkbox" checked={enabled} onChange={event => onEnabledChange(event.target.checked)} />
        <strong>{label}</strong>
      </label>
      <input
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        disabled={!enabled}
        aria-label={`${label} 음량`}
        onChange={event => onVolumeChange(Number(event.target.value))}
      />
      <span>{Math.round(volume * 100)}%</span>
    </div>
  );
}

export function SettingsDialog({ audio, onChange, onClose, backLabel = '뒤로' }: Props) {
  return (
    <div className="modal-overlay game-menu-overlay" role="presentation">
      <section className="modal game-menu-modal settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="game-menu-heading">
          <div>
            <span className="muted small">환경 설정</span>
            <h2 id="settings-title">소리 설정</h2>
          </div>
          <button type="button" className="icon-btn" aria-label={backLabel} onClick={onClose}>×</button>
        </header>
        <VolumeControl
          label="효과음 (SE)"
          enabled={audio.sfxEnabled}
          volume={audio.sfxVolume}
          onEnabledChange={sfxEnabled => onChange({ sfxEnabled })}
          onVolumeChange={sfxVolume => onChange({ sfxVolume })}
        />
        <VolumeControl
          label="배경 음악 (BGM)"
          enabled={audio.musicEnabled}
          volume={audio.musicVolume}
          onEnabledChange={musicEnabled => onChange({ musicEnabled })}
          onVolumeChange={musicVolume => onChange({ musicVolume })}
        />
        <p className="muted small settings-note">설정은 브라우저에 자동 저장됩니다.</p>
        <button type="button" className="btn primary game-menu-wide" onClick={onClose}>{backLabel}</button>
      </section>
    </div>
  );
}
