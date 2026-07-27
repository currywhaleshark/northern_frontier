import type { AudioPrefs, ResidentMarkerPrefs } from '../ui/uiPrefs';

interface Props {
  audio: AudioPrefs;
  residentMarkers: ResidentMarkerPrefs;
  autoFastForwardSleepingNight: boolean;
  onChange: (update: Partial<AudioPrefs>) => void;
  onResidentMarkersChange: (update: Partial<ResidentMarkerPrefs>) => void;
  onAutoFastForwardSleepingNightChange: (enabled: boolean) => void;
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

export function SettingsDialog({
  audio,
  residentMarkers,
  autoFastForwardSleepingNight,
  onChange,
  onResidentMarkersChange,
  onAutoFastForwardSleepingNightChange,
  onClose,
  backLabel = '뒤로',
}: Props) {
  return (
    <div className="modal-overlay game-menu-overlay" role="presentation">
      <section className="modal game-menu-modal settings-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="game-menu-heading">
          <div>
            <span className="muted small">게임 진행·표시·소리</span>
            <h2 id="settings-title">환경 설정</h2>
          </div>
          <button type="button" className="icon-btn" aria-label={backLabel} onClick={onClose}>×</button>
        </header>
        <div className="settings-section">
          <h3>지도 표시</h3>
          <div className="settings-display-options">
            <label className="settings-display-option">
              <input
                type="checkbox"
                checked={residentMarkers.showResidentJobMarkers}
                onChange={event => onResidentMarkersChange({ showResidentJobMarkers: event.target.checked })}
              />
              <span>
                <strong>주민 직업 색상표</strong>
                <small>주민 머리 위의 직업별 색상 사각형</small>
              </span>
            </label>
            <label className="settings-display-option">
              <input
                type="checkbox"
                checked={residentMarkers.showResidentCargoMarkers}
                onChange={event => onResidentMarkersChange({ showResidentCargoMarkers: event.target.checked })}
              />
              <span>
                <strong>적재 흰색 표식</strong>
                <small>짐을 운반 중인 주민 옆의 흰색 사각형</small>
              </span>
            </label>
          </div>
        </div>
        <div className="settings-section">
          <h3>게임 진행</h3>
          <div className="settings-display-options single">
            <label className="settings-display-option">
              <input
                type="checkbox"
                checked={autoFastForwardSleepingNight}
                onChange={event => onAutoFastForwardSleepingNightChange(event.target.checked)}
              />
              <span>
                <strong>취침 후 밤 자동 10배속</strong>
                <small>모든 주민이 잠들면 아침까지 빠르게 진행합니다. 밤중에 직접 배속을 바꾸면 그날은 다시 올리지 않습니다.</small>
              </span>
            </label>
          </div>
        </div>
        <div className="settings-section">
          <h3>소리</h3>
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
        </div>
        <p className="muted small settings-note">설정은 브라우저에 자동 저장됩니다.</p>
        <button type="button" className="btn primary game-menu-wide" onClick={onClose}>{backLabel}</button>
      </section>
    </div>
  );
}
