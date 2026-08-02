import { lazy, useEffect, useState } from 'react';
import { MainMenu } from './components/MainMenu';
import { NewGameSetup } from './components/NewGameSetup';
import { SettingsDialog } from './components/SettingsDialog';
import { LazyUiBoundary } from './components/LazyUiBoundary';
import { hasAnyStoredSave } from './game/saveStorage';
import { initAudio, setSfxSettings } from './sound/sfx';
import { initMusic, setMusicScene, setMusicSettings } from './sound/music';
import {
  loadUiPrefs,
  saveUiPrefs,
  setAudioPrefs,
  setAutoFastForwardSleepingNight,
  setResidentMarkerPrefs,
} from './ui/uiPrefs';
import type { GameSessionLaunch, GameSessionReturnTarget } from './sessionLaunch';

const GameSession = lazy(() => import('./GameSession'));
const SaveSlotDialog = lazy(() => import('./components/SaveSlotDialog')
  .then(module => ({ default: module.SaveSlotDialog })));
const BattleSimulationSetup = lazy(() => import('./components/BattleSimulationSetup')
  .then(module => ({ default: module.BattleSimulationSetup })));

export default function App() {
  const [launch, setLaunch] = useState<GameSessionLaunch | null>(null);
  const [menuView, setMenuView] = useState<'main' | 'newGameSetup' | 'battleSim'>('main');
  const [loadDialogOpen, setLoadDialogOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [canLoad, setCanLoad] = useState(hasAnyStoredSave);
  const [uiPrefs, setUiPrefs] = useState(loadUiPrefs);

  useEffect(() => {
    saveUiPrefs(uiPrefs);
    setSfxSettings({ enabled: uiPrefs.audio.sfxEnabled, volume: uiPrefs.audio.sfxVolume });
    setMusicSettings({ enabled: uiPrefs.audio.musicEnabled, volume: uiPrefs.audio.musicVolume });
  }, [uiPrefs]);

  useEffect(() => {
    if (!launch) setMusicScene('title');
  }, [launch]);

  useEffect(() => {
    const boot = () => {
      initAudio();
      initMusic();
    };
    window.addEventListener('pointerdown', boot, { once: true });
    window.addEventListener('keydown', boot, { once: true });
    return () => {
      window.removeEventListener('pointerdown', boot);
      window.removeEventListener('keydown', boot);
    };
  }, []);

  useEffect(() => {
    if (!settingsOpen && !loadDialogOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setSettingsOpen(false);
      setLoadDialogOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [loadDialogOpen, settingsOpen]);

  const returnToMenu = (target: GameSessionReturnTarget) => {
    setLaunch(null);
    setMenuView(target);
    setCanLoad(hasAnyStoredSave());
    setUiPrefs(loadUiPrefs());
  };

  const loadSlot = async (slot: number) => {
    const { loadGame } = await import('./game/saveLoad');
    const state = loadGame(slot);
    if (!state) {
      window.alert(`${slot}번 슬롯의 저장 데이터를 불러오지 못했습니다.`);
      return;
    }
    setLoadDialogOpen(false);
    setLaunch({ kind: 'loaded', state });
  };

  if (launch) {
    return (
      <LazyUiBoundary label="게임" mode="overlay">
        <GameSession launch={launch} onReturnToMenu={returnToMenu} />
      </LazyUiBoundary>
    );
  }

  if (menuView === 'battleSim') {
    return (
      <LazyUiBoundary label="전투 시뮬레이션" mode="overlay">
        <BattleSimulationSetup
          onStart={options => setLaunch({ kind: 'battleSimulation', options })}
          onBack={() => setMenuView('main')}
        />
      </LazyUiBoundary>
    );
  }

  if (menuView === 'newGameSetup') {
    return <NewGameSetup onStart={options => setLaunch({ kind: 'new', options })} onBack={() => setMenuView('main')} />;
  }

  return (
    <>
      <MainMenu
        canContinue={canLoad}
        onStart={() => setMenuView('newGameSetup')}
        onStartTutorial={() => setLaunch({ kind: 'tutorial' })}
        onContinue={() => setLoadDialogOpen(true)}
        onOpenBattleSim={() => setMenuView('battleSim')}
        onOpenSettings={() => setSettingsOpen(true)}
      />
      {loadDialogOpen && (
        <LazyUiBoundary label="저장 슬롯" mode="overlay">
          <SaveSlotDialog
            mode="load"
            onSelect={loadSlot}
            onClose={() => setLoadDialogOpen(false)}
            onChanged={() => setCanLoad(hasAnyStoredSave())}
          />
        </LazyUiBoundary>
      )}
      {settingsOpen && (
        <SettingsDialog
          audio={uiPrefs.audio}
          residentMarkers={uiPrefs}
          autoFastForwardSleepingNight={uiPrefs.autoFastForwardSleepingNight}
          onChange={update => setUiPrefs(current => setAudioPrefs(current, update))}
          onResidentMarkersChange={update => setUiPrefs(current => setResidentMarkerPrefs(current, update))}
          onAutoFastForwardSleepingNightChange={enabled =>
            setUiPrefs(current => setAutoFastForwardSleepingNight(current, enabled))}
          onClose={() => setSettingsOpen(false)}
          backLabel="메인 메뉴로"
        />
      )}
    </>
  );
}
