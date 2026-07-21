// 최상위 컴포넌트: 게임 상태 보관, 게임 루프, 플레이어 입력 연결
import { lazy, Profiler, useCallback, useEffect, useLayoutEffect, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import { CONFIG } from './game/config';
import {
  assignNearestWorkerToBuilding, assignResidentToBuilding,
  advanceDay, advanceTick, autoAssignWorkersToBuildingTypes, cancelBuildingConstruction, continueAfterVictory, demolishBuilding, newGame, reassignJob, resolveChoice, setResidentJob,
  setBuildingCrop, setDryingProduct, setSmithyProduct, issueResidentMoveOrder, issueResidentWorkOrder, upgradeHousingBuilding,
  assignPlotPlowOxen, setLivestockSpecies, slaughterLivestock,
  convertFieldToPaddy, setYouthActivity, toggleResidentCart,
  unassignResidentFromBuilding, useLuxuryGood, SUBTICKS, tryPlaceBuilding,
} from './game/simulation';
import { hasAnySave, loadGame, saveGame } from './game/saveLoad';
import { addLog, negotiateTrade, requestTrade, tradeNegotiationOf } from './game/events';
import { jobWorkforceCounts } from './game/residents';
import { initAudio, playSfx, setSfxSettings, stopWeatherAmbient, setWeatherAmbient } from './sound/sfx';
import { initMusic, setMusicScene, setMusicSettings, type MusicScene } from './sound/music';
import { AlertsPanel } from './components/AlertsPanel';
import { BuildDrawer } from './components/BuildDrawer';
import { DockFrame, type DockOverlayItem } from './components/dock/DockFrame';
import { CourtWindow } from './components/dock/CourtWindow';
import { FactionsWindow } from './components/dock/FactionsWindow';
import { ResidentsWindow } from './components/dock/ResidentsWindow';
import { EventModal } from './components/EventModal';
import { PromotionModal } from './components/PromotionModal';
import { TradeDialog } from './components/TradeDialog';
import { GameCanvas } from './components/GameCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { JobPanel } from './components/JobPanel';
import { MainMenu } from './components/MainMenu';
import { GameMenu } from './components/GameMenu';
import { SettingsDialog } from './components/SettingsDialog';
import { FeedbackDialog } from './components/FeedbackDialog';
import { ManagementDockIcon } from './components/ManagementDockIcon';
import { createBattleSimulation, type BattleSimulationOptions } from './game/battleSimulation';
import { centerViewportOnSettlement, centerViewportOnTile, Minimap } from './components/Minimap';
import { ProcessingPanel } from './components/ProcessingPanel';
import { SelectionContextBar } from './components/SelectionContextBar';
import { TopBar } from './components/TopBar';
import { UnifiedLog } from './components/UnifiedLog';
import type { ExpeditionMusterRequest } from './components/ExpeditionMusterDialog';
import { LazyUiBoundary } from './components/LazyUiBoundary';
import { requestPetition } from './game/petition';
import { breakSilverSeal, reopenBuriedVein } from './game/silver';
import { toggleNitreYards } from './game/suspicion';
import { setProcessingReserve } from './game/processing';
import { setTributeReserve } from './game/tributeReserve';
import { openPredatorHunt, startPredatorScout } from './game/specialEvents';
import { getPointerAction, selectedEntityAfterTileClick } from './game/selectionActions';
import { makeRng } from './game/map';
import { openTerritoryOrderConfirmation } from './game/territory';
import { computeDefense } from './game/buildings';
import { createExpedition, predatorExpeditionTarget } from './game/expedition';
import { purchasePredatorIntel } from './game/predatorIntelTrade';
import { isForeignSiteOperational } from './game/foreignSites';
import {
  clearMountAssignments, clearWeaponAssignments, setAutomaticWeaponAllocation, setResidentMount, setResidentWeapon,
} from './game/weapons';
import {
  requestHuntingRights, requestPassagePermission, requestSiteDefectors, scoutBanditLair, sendGiftToSite,
  type SiteGiftType,
} from './game/siteDiplomacy';
import {
  acknowledgeTacticalReport, advanceTacticalPhase, assignDefenderGroup, completeTacticalSimulation,
  dismissTacticalBattleReport, finishTacticalBattle, resolveTacticalRound, setDefenderFormationLine,
  setTacticalCommand, setTacticalGroupTarget, spendPreparationAction,
} from './game/tacticalBattle';
import { mergeHuntGroups, setHuntPreparationZone, splitHuntGroup } from './game/tacticalHunt';
import type {
  BuildingTypeId, CombatWeaponId, CropId, Difficulty, DryingProductId, GameState, JobId, LivestockId, MountId, ProcessingInputId, ResourceId, SelectedEntity, SmithyProductId, YouthActivity,
  PreparationActionId, PredatorKind, SpecialItemId, SpecialResidentId, TacticalCommandId, TacticalFormationLine, WildlifeKind,
} from './game/types';
import { markScenarioFlag } from './game/scenario';
import { acknowledgePromotionNotice, upgradeSettlementCenter } from './game/promotion';
import { createTutorialGame } from './game/tutorialStart';
import { TutorialCoach } from './components/TutorialCoach';
import {
  loadUiPrefs,
  resetDockWindowLayout,
  saveUiPrefs,
  setAudioPrefs,
  setDockWindowLayout,
  setMapZoom,
  togglePinnedDockWindow,
  type UiPrefs,
} from './ui/uiPrefs';
import { bringDockWindowToFront } from './ui/dockLayout';
import { advanceGameClock } from './ui/gameClock';
import { appointConfinedSpecialResident } from './game/specialResidents';
import type { DockWindowId, FloatingWindowId } from './ui/dockPresentation';
import type { AutoAssignBuildingType } from './game/workerSlots';
import { RuntimeVersionBoundary } from './components/RuntimeVersionBoundary';
import { createRuntimeVersionStore, uiRefreshIntervalMs } from './ui/runtimeVersionStore';
import {
  recordRuntimePerf, recordRuntimePerfSince, runtimePerfSnapshot, runtimePerfStartTime,
  startRuntimePerf, stopRuntimePerf, summarizeRuntimePerf,
} from './perf/runtimePerf';
import { dockWindowForHotkey, isEditableTarget, speedForHotkey } from './ui/gameHotkeys';

let lastAppCommitTime = 0;
const runtimePerfParams = new URLSearchParams(window.location.search);

const recordAppRender: ProfilerOnRenderCallback = (
  id, phase, actualDuration, _baseDuration, startTime, commitTime,
) => {
  lastAppCommitTime = commitTime;
  recordRuntimePerf('react-render', startTime, actualDuration, { id, phase });
  recordRuntimePerf('react-commit', commitTime, Math.max(0, performance.now() - commitTime), { id, phase });
};

const SaveSlotDialog = lazy(() => import('./components/SaveSlotDialog')
  .then(module => ({ default: module.SaveSlotDialog })));
const BattleSimulationSetup = lazy(() => import('./components/BattleSimulationSetup')
  .then(module => ({ default: module.BattleSimulationSetup })));
const TacticalBattleScreen = lazy(() => import('./components/TacticalBattleScreen')
  .then(module => ({ default: module.TacticalBattleScreen })));
const TacticalBattleReportModal = lazy(() => import('./components/TacticalBattleReportModal')
  .then(module => ({ default: module.TacticalBattleReportModal })));
const WeaponAllocationDialog = lazy(() => import('./components/WeaponAllocationDialog')
  .then(module => ({ default: module.WeaponAllocationDialog })));
const ExpeditionMusterDialog = lazy(() => import('./components/ExpeditionMusterDialog')
  .then(module => ({ default: module.ExpeditionMusterDialog })));
const SpecialResidentsWindow = lazy(() => import('./components/dock/SpecialResidentsWindow')
  .then(module => ({ default: module.SpecialResidentsWindow })));

function RuntimeGameEffects({ state, setSpeed }: { state: GameState; setSpeed: (speed: number) => void }) {
  const sndRef = useRef({
    logLen: 0,
    pending: null as string | null,
    over: false,
    battleActive: false,
    battleOutcome: null as 'victory' | 'defeat' | null,
  });

  // 관리 UI snapshot과 같은 cadence로 게임 상태 효과를 동기화한다.
  useEffect(() => {
    const m = sndRef.current;
    if (state.log.length < m.logLen) m.logLen = state.log.length;
    if (state.log.length > m.logLen) {
      for (const e of state.log.slice(m.logLen).slice(-3)) {
        if (e.kind === 'good') {
          if (e.text.includes('노루')) playSfx('hunt');
          else if (e.text.includes('회복')) playSfx('heal');
          else if (e.text.includes('이주민')) playSfx('welcome');
          else playSfx('good');
        } else if (e.kind === 'bad') {
          if (e.text.includes('세상을 떠났')) playSfx('death');
          else if (e.text.includes('부족') || e.text.includes('굶')) playSfx('warn');
          else playSfx('bad');
        } else if (e.kind === 'raid') playSfx('raidDrum');
        else if (e.kind === 'trade') playSfx('tradeBell');
        else if (e.kind === 'weather' && (e.text.includes('눈보라') || e.text.includes('혹한'))) playSfx('gust');
      }
      m.logLen = state.log.length;
    }
    const pendingKind = state.pendingChoice?.kind ?? null;
    if (pendingKind && pendingKind !== m.pending) {
      playSfx(pendingKind === 'raid' || pendingKind === 'crackdown'
        ? 'raidHorn'
        : pendingKind === 'immigration' ? 'welcome' : 'tradeBell');
    }
    m.pending = pendingKind;
    if (state.gameOver && !m.over) playSfx(state.gameOver.won ? 'win' : 'lose');
    m.over = Boolean(state.gameOver);
    if (state.battle && !m.battleActive) playSfx('raidDrum');
    if (!state.battle && m.battleActive && m.battleOutcome) {
      playSfx(m.battleOutcome === 'victory' ? 'raidHorn' : 'death');
    }
    m.battleActive = Boolean(state.battle);
    m.battleOutcome = state.battle?.outcome ?? (state.battle ? m.battleOutcome : null);
  });

  useEffect(() => {
    setWeatherAmbient(state.weather);
  }, [state.weather]);

  useEffect(() => () => stopWeatherAmbient(), []);

  useEffect(() => {
    if (state.tacticalBattle) setSpeed(0);
  }, [state.tacticalBattle?.id, setSpeed]);

  return null;
}

export default function App() {
  const appRenderStartedAt = runtimePerfStartTime();
  // 게임 상태는 ref에 두고, 입력/차단 상태만 App version으로 즉시 반영한다.
  const stateRef = useRef(newGame());
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const [runtimeVersionStore] = useState(createRuntimeVersionStore);
  const [uiVersionStore] = useState(createRuntimeVersionStore);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => {
    runtimeVersionStore.publish();
    uiVersionStore.publish();
    setVersion(v => v + 1);
  }, [runtimeVersionStore, uiVersionStore]);

  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [menuView, setMenuView] = useState<'main' | 'battleSim'>('main');
  // 전투 시뮬레이션 모드: 샌드박스 상태에서 전술 전투만 테스트, 끝나면 메뉴로 복귀
  const [simMode, setSimMode] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [placingType, setPlacingType] = useState<BuildingTypeId | null>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [canLoad, setCanLoad] = useState(hasAnySave());
  // 저장 슬롯 다이얼로그: null이면 닫힘, 아니면 저장/불러오기 모드
  const [slotDialogMode, setSlotDialogMode] = useState<'save' | 'load' | null>(null);
  const [inspResidentId, setInspResidentId] = useState<number | null>(null);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(() => loadUiPrefs());
  const [gameMenuView, setGameMenuView] = useState<'main' | 'settings' | 'feedback' | null>(null);
  const [titleSettingsOpen, setTitleSettingsOpen] = useState(false);
  const lastPlayingSpeedRef = useRef(1);
  const menuRestoreSpeedRef = useRef(1);
  const [openDockWindowIds, setOpenDockWindowIds] = useState<readonly DockWindowId[]>(
    () => [...uiPrefs.pinnedDockWindows],
  );
  const [floatingWindowOrder, setFloatingWindowOrder] = useState<readonly FloatingWindowId[]>(
    () => ['minimap', ...uiPrefs.pinnedDockWindows],
  );
  const [weaponDialogOpen, setWeaponDialogOpen] = useState(false);
  const [expeditionMusterRequest, setExpeditionMusterRequest] = useState<ExpeditionMusterRequest | null>(null);
  const [runtimePerfReport, setRuntimePerfReport] = useState<string | null>(null);
  const [runtimePerfCapturing, setRuntimePerfCapturing] = useState(false);
  const runtimePerfEnabled = runtimePerfParams.get('perf') === '1';
  const runtimePerfDurationMs = Number(runtimePerfParams.get('perfMs') ?? 0);
  const appLayoutCompletedAtRef = useRef(0);
  // 이동 보간용: 마지막 서브틱 처리 시각과 서브틱 간격
  const animRef = useRef({ at: performance.now(), ms: 175 });
  useEffect(() => {
    saveUiPrefs(uiPrefs);
  }, [uiPrefs]);

  useEffect(() => {
    setSfxSettings({ enabled: uiPrefs.audio.sfxEnabled, volume: uiPrefs.audio.sfxVolume });
    setMusicSettings({ enabled: uiPrefs.audio.musicEnabled, volume: uiPrefs.audio.musicVolume });
  }, [uiPrefs.audio]);

  useEffect(() => {
    if (speed > 0) lastPlayingSpeedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    setOpenDockWindowIds(current => {
      const added = uiPrefs.pinnedDockWindows.filter(id => !current.includes(id));
      return added.length > 0 ? [...current, ...added] : current;
    });
    setFloatingWindowOrder(current => {
      const added = uiPrefs.pinnedDockWindows.filter(id => !current.includes(id));
      return added.length > 0 ? [...current, ...added] : current;
    });
  }, [uiPrefs.pinnedDockWindows]);

  useLayoutEffect(() => {
    const probe = window.__runtimePerf;
    if (!probe?.active || appRenderStartedAt == null) {
      appLayoutCompletedAtRef.current = 0;
      return;
    }
    const completedAt = performance.now();
    recordRuntimePerf('react-tree-render-commit', appRenderStartedAt, completedAt - appRenderStartedAt, { screen });
    appLayoutCompletedAtRef.current = completedAt;
  });

  useEffect(() => {
    const layoutCompletedAt = appLayoutCompletedAtRef.current;
    const probe = window.__runtimePerf;
    if (probe?.active && layoutCompletedAt >= probe.startedAt) {
      recordRuntimePerf('react-tree-passive-effects', layoutCompletedAt, performance.now() - layoutCompletedAt, { screen });
    }
  });

  const selectionContextVisible = selectedEntity !== null;
  useEffect(() => {
    setFloatingWindowOrder(current => selectionContextVisible
      ? bringDockWindowToFront(current, 'selection')
      : current.filter(id => id !== 'selection'));
  }, [selectionContextVisible]);

  useEffect(() => {
    if (lastAppCommitTime > 0) {
      recordRuntimePerf('react-post-commit', lastAppCommitTime, Math.max(0, performance.now() - lastAppCommitTime), {
        screen,
      });
    }
  });

  // 브라우저 자동재생 정책: 첫 입력 때 효과음과 BGM 시작
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

  const state = stateRef.current;
  const musicScene: MusicScene = screen === 'menu'
    ? 'title'
    : state.tacticalBattle || state.tacticalBattleReport || state.battle
      ? 'battle'
      : 'simulation';

  useEffect(() => {
    setMusicScene(musicScene);
  }, [musicScene]);

  useEffect(() => {
    if (screen !== 'game') return;
    let secondFrame = 0;
    const firstFrame = requestAnimationFrame(() => {
      secondFrame = requestAnimationFrame(() => {
        const box = mapViewportRef.current;
        if (box) centerViewportOnSettlement(stateRef.current, box);
      });
    });
    return () => {
      cancelAnimationFrame(firstFrame);
      if (secondFrame) cancelAnimationFrame(secondFrame);
    };
  }, [screen]);

  // 개발용 콘솔 훅 (window.__game.run(n)으로 n일 빨리감기)
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__game = {
      state: () => stateRef.current,
      run: (days: number) => {
        for (let i = 0; i < days; i++) {
          const s = stateRef.current;
          if (s.gameOver) break;
          if (s.pendingChoice || s.pendingPromotionNotice || s.tacticalBattle || s.tacticalBattleReport) break;
          advanceDay(s);
        }
        bump();
        return stateRef.current;
      },
      choose: (id: string) => {
        resolveChoice(stateRef.current, id);
        bump();
      },
      build: (type: BuildingTypeId, x: number, y: number) => tryPlaceBuilding(stateRef.current, type, x, y),
      job: (from: JobId, to: JobId) => reassignJob(stateRef.current, from, to),
      smithy: (id: number, product: SmithyProductId) => setSmithyProduct(stateRef.current, id, product),
      drying: (id: number, product: DryingProductId) => setDryingProduct(stateRef.current, id, product),
      livestock: (id: number, species: LivestockId) => setLivestockSpecies(stateRef.current, id, species),
      slaughter: (id: number, amount = 1) => slaughterLivestock(stateRef.current, id, amount),
      crop: (id: number, crop: CropId, mode: 'queue' | 'uproot' = 'uproot') => setBuildingCrop(stateRef.current, id, crop, mode),
      paddy: (id: number) => convertFieldToPaddy(stateRef.current, id),
      assign: (residentId: number, buildingId: number) => assignResidentToBuilding(stateRef.current, residentId, buildingId),
      perf: {
        start: startRuntimePerf,
        stop: stopRuntimePerf,
        snapshot: runtimePerfSnapshot,
      },
      reset: () => { stateRef.current = newGame(); bump(); },
    };
  }, [bump]);

  // ── 게임 루프: 서브틱 단위로 진행해 주민 이동이 보이게 한다 (메뉴 화면에선 정지) ──
  useEffect(() => {
    if (speed === 0 || screen !== 'game') return;
    const msPerDay = CONFIG.time.msPerDay[speed] ?? 1400;
    const msPerTick = msPerDay / SUBTICKS;
    const uiRefreshMs = uiRefreshIntervalMs(speed);
    let last = performance.now();
    let lastUiRefresh = last;
    let acc = 0;
    let uiRefreshTimer: number | null = null;
    const flushUi = (commitApp = false) => {
      if (uiRefreshTimer !== null) window.clearTimeout(uiRefreshTimer);
      uiRefreshTimer = null;
      lastUiRefresh = performance.now();
      uiVersionStore.publish();
      if (commitApp) setVersion(v => v + 1);
    };
    const requestUiRefresh = (immediate: boolean) => {
      if (immediate) {
        flushUi(true);
        return;
      }
      if (performance.now() - lastUiRefresh >= uiRefreshMs) {
        flushUi();
        return;
      }
      if (uiRefreshTimer === null) {
        uiRefreshTimer = window.setTimeout(flushUi, uiRefreshMs - (performance.now() - lastUiRefresh));
      }
    };
    const timer = setInterval(() => {
      const runtimeLoopStart = runtimePerfStartTime();
      const now = performance.now();
      if (stateRef.current.tacticalBattle || stateRef.current.tacticalBattleReport) {
        last = now;
        acc = 0;
        recordRuntimePerfSince('game-loop', runtimeLoopStart, { ticksProcessed: 0, battlePaused: true });
        return;
      }
      const clock = advanceGameClock(acc, now - last, msPerTick, 24); // 탭 복귀 시 폭주 방지
      acc = clock.accumulator;
      last = now;
      let n = clock.ticksToAdvance;
      let runtimeTicksProcessed = 0;
      if (n > 0) {
        const s = stateRef.current;
        const logLengthBefore = s.log.length;
        const perf = window.__renderPerf;
        const tickStart = perf ? performance.now() : 0;
        let ticksProcessed = 0;
        while (n-- > 0) {
          if (s.pendingChoice || s.pendingPromotionNotice || s.tacticalBattle || s.tacticalBattleReport || s.gameOver) break; // 이벤트/승격/전술전/장계/종료 시 자동 정지
          const runtimeTickStart = runtimePerfStartTime();
          advanceTick(s);
          recordRuntimePerfSince('simulation-tick', runtimeTickStart, {
            day: s.day,
            subTick: s.subTick,
            residents: s.residents.length,
            buildings: s.buildings.length,
          });
          ticksProcessed++;
          runtimeTicksProcessed++;
        }
        if (perf) {
          const bucket = perf['0-advanceTicks'] ?? (perf['0-advanceTicks'] = { total: 0, count: 0 });
          bucket.total += performance.now() - tickStart;
          bucket.count++;
        }
        if (ticksProcessed > 0) {
          animRef.current = { at: now, ms: msPerTick };
          runtimeVersionStore.publish();
          const urgentLogAdded = s.log.slice(logLengthBefore).some(entry =>
            entry.important || entry.kind === 'bad' || entry.kind === 'raid',
          );
          requestUiRefresh(
            urgentLogAdded ||
            Boolean(s.pendingChoice || s.pendingPromotionNotice || s.tacticalBattle || s.tacticalBattleReport || s.gameOver),
          );
        }
      }
      recordRuntimePerfSince('game-loop', runtimeLoopStart, { ticksProcessed: runtimeTicksProcessed, battlePaused: false });
    }, 33);
    return () => {
      clearInterval(timer);
      if (uiRefreshTimer !== null) window.clearTimeout(uiRefreshTimer);
    };
  }, [speed, screen, runtimeVersionStore, uiVersionStore]);

  const openGameMenu = useCallback(() => {
    if (screen !== 'game') return;
    if (speed > 0) lastPlayingSpeedRef.current = speed;
    menuRestoreSpeedRef.current = speed;
    setSpeed(0);
    setGameMenuView('main');
  }, [screen, speed]);

  const closeGameMenu = useCallback(() => {
    setGameMenuView(null);
    if (screen === 'game') setSpeed(menuRestoreSpeedRef.current);
  }, [screen]);

  const handlePlacePlot = (x: number, y: number, w: number, h: number) => {
    if (!placingType) return;
    const err = tryPlaceBuilding(stateRef.current, placingType, x, y, w, h);
    if (err) addLog(stateRef.current, err, 'bad');
    else {
      playSfx('hammer');
      setPlacingType(null);
    }
    bump();
  };

  const handleTileClick = (x: number, y: number) => {
    if (placingType) {
      const err = tryPlaceBuilding(stateRef.current, placingType, x, y);
      if (err) addLog(stateRef.current, err, 'bad');
      else {
        playSfx('hammer');
        setPlacingType(null);
      }
      bump();
      return;
    }
    const tile = stateRef.current.map[y]?.[x];
    if (!tile) return;
    const nextSelection = selectedEntityAfterTileClick(stateRef.current, selectedEntity, tile);
    if (!nextSelection) {
      setSelected(null);
      setSelectedEntity(null);
      setInspResidentId(null);
      return;
    }
    setSelected({ x, y });
    setSelectedEntity(nextSelection);
    setInspResidentId(null);
  };

  const handleReassign = (from: JobId, to: JobId) => {
    reassignJob(stateRef.current, from, to);
    bump();
  };

  const handleAutoAssignBuildings = (types: readonly AutoAssignBuildingType[]) => {
    const assigned = autoAssignWorkersToBuildingTypes(stateRef.current, types);
    addLog(
      stateRef.current,
      assigned.length > 0
        ? `선택한 건물의 빈 자리에 주민 ${assigned.length}명을 자동 배정했습니다.`
        : '선택한 건물에 배정할 수 있는 같은 직업의 미배정 주민이나 빈자리가 없습니다.',
      assigned.length > 0 ? 'good' : 'info',
    );
    bump();
  };

  const handleSetResidentJob = (id: number, job: JobId) => {
    setResidentJob(stateRef.current, id, job);
    bump();
  };

  const handleStopRuntimePerf = () => {
    const summary = summarizeRuntimePerf(stopRuntimePerf());
    const s = stateRef.current;
    setRuntimePerfReport(JSON.stringify({
      ...summary,
      state: {
        day: s.day,
        subTick: s.subTick,
        residents: s.residents.length,
        buildings: s.buildings.length,
        pendingChoice: Boolean(s.pendingChoice),
      },
    }, null, 2));
    setRuntimePerfCapturing(false);
  };

  const handleStartRuntimePerf = () => {
    setRuntimePerfReport(null);
    setRuntimePerfCapturing(true);
    requestAnimationFrame(() => {
      startRuntimePerf();
      if (Number.isFinite(runtimePerfDurationMs) && runtimePerfDurationMs >= 250) {
        window.setTimeout(handleStopRuntimePerf, runtimePerfDurationMs);
      }
    });
  };

  const handleSetYouthActivity = (id: number, activity: YouthActivity) => {
    const error = setYouthActivity(stateRef.current, id, activity);
    if (error) addLog(stateRef.current, error, 'info');
    bump();
  };

  const handleAppointConfinedSpecialResident = (id: SpecialResidentId) => {
    appointConfinedSpecialResident(stateRef.current, id);
    bump();
  };

  const handleToggleResidentCart = (id: number) => {
    const err = toggleResidentCart(stateRef.current, id);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const refreshWeaponDefense = () => {
    stateRef.current.resources.defense = computeDefense(stateRef.current);
    bump();
  };

  const handleSetResidentWeapon = (id: number, weapon: CombatWeaponId | null) => {
    const error = setResidentWeapon(stateRef.current, id, weapon);
    if (error) addLog(stateRef.current, error, 'info');
    refreshWeaponDefense();
  };

  const handleSetResidentMount = (id: number, mount: MountId | null) => {
    const error = setResidentMount(stateRef.current, id, mount);
    if (error) addLog(stateRef.current, error, 'info');
    bump();
  };

  const handleAutoAssignWeapons = () => {
    setAutomaticWeaponAllocation(stateRef.current);
    refreshWeaponDefense();
  };

  const handleClearWeaponAssignments = () => {
    clearWeaponAssignments(stateRef.current);
    clearMountAssignments(stateRef.current);
    refreshWeaponDefense();
  };

  const handleSetProcessingReserve = (resource: ProcessingInputId, amount: number) => {
    setProcessingReserve(stateRef.current, resource, amount);
    bump();
  };

  const handleSetSmithyProduct = (buildingId: number, product: SmithyProductId) => {
    const err = setSmithyProduct(stateRef.current, buildingId, product);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleSetDryingProduct = (buildingId: number, product: DryingProductId) => {
    const err = setDryingProduct(stateRef.current, buildingId, product);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleSetLivestockSpecies = (buildingId: number, species: LivestockId) => {
    const err = setLivestockSpecies(stateRef.current, buildingId, species);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleSlaughterLivestock = (buildingId: number, amount: number) => {
    const err = slaughterLivestock(stateRef.current, buildingId, amount);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleSetBuildingCrop = (buildingId: number, cropId: CropId, mode: 'queue' | 'uproot') => {
    const err = setBuildingCrop(stateRef.current, buildingId, cropId, mode);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleConvertFieldToPaddy = (buildingId: number) => {
    const err = convertFieldToPaddy(stateRef.current, buildingId);
    if (err) addLog(stateRef.current, err, 'info');
    else playSfx('hammer');
    bump();
  };

  const handleSetPlotPlowOxen = (buildingId: number, count: number) => {
    const err = assignPlotPlowOxen(stateRef.current, buildingId, count);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleUpgradeHousing = (buildingId: number, targetType: Extract<BuildingTypeId, 'ondol' | 'tileHouse'>) => {
    const err = upgradeHousingBuilding(stateRef.current, buildingId, targetType);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleUpgradeCenter = (buildingId: number) => {
    const err = upgradeSettlementCenter(stateRef.current, buildingId);
    if (err) addLog(stateRef.current, err, 'info');
    else {
      setSpeed(0);
      playSfx('good');
    }
    bump();
  };

  const handleAcknowledgePromotion = () => {
    const completesCampaign = stateRef.current.pendingPromotionNotice === 'bu';
    acknowledgePromotionNotice(stateRef.current);
    if (!completesCampaign) playSfx('good');
    bump();
  };

  const handleAssignNearestWorker = (buildingId: number) => {
    const err = assignNearestWorkerToBuilding(stateRef.current, buildingId);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleUnassignWorker = (residentId: number) => {
    unassignResidentFromBuilding(stateRef.current, residentId);
    bump();
  };

  const handleDemolishBuilding = (x: number, y: number) => {
    const err = demolishBuilding(stateRef.current, x, y);
    if (err) {
      addLog(stateRef.current, err, 'info');
    } else {
      playSfx('hammer');
      setSelected(null);
      setSelectedEntity(null);
    }
    bump();
  };

  const handleChoose = (optionId: string) => {
    const choice = stateRef.current.pendingChoice;
    const predator = choice?.kind === 'incident' && optionId === 'hunt-now' &&
      (choice.data.predator === 'wolf' || choice.data.predator === 'tiger')
      ? choice.data.predator
      : null;
    resolveChoice(stateRef.current, optionId);
    if (predator) {
      if (predatorExpeditionTarget(stateRef.current, predator)) {
        setSpeed(0);
        setWeaponDialogOpen(false);
        setExpeditionMusterRequest({ kind: 'predatorHunt', predatorKind: predator });
      } else {
        addLog(stateRef.current, '토벌대가 향할 활성 짐승 서식지가 없습니다.', 'info', true);
      }
    }
    bump();
  };

  const handleCancelBuildingConstruction = (buildingId: number) => {
    const err = cancelBuildingConstruction(stateRef.current, buildingId);
    if (err) {
      addLog(stateRef.current, err, 'info');
    } else {
      playSfx('hammer');
      setSelected(null);
      setSelectedEntity(null);
    }
    bump();
  };

  const handleTacticalAction = (action: () => string | null): string | null => {
    const error = action();
    if (error) addLog(stateRef.current, error, 'info');
    bump();
    return error;
  };

  // P3 배치 계약 dispatch — 전술 화면이 배치·분할·합류 mutation을 직접 조합해 실행한다.
  const handleTacticalDeploymentAction = (action: (current: GameState) => string | null) =>
    handleTacticalAction(() => action(stateRef.current));

  const handleSpendPreparation = (actionId: PreparationActionId) =>
    handleTacticalAction(() => spendPreparationAction(stateRef.current, actionId));
  const handleAdvanceTacticalPhase = () =>
    handleTacticalAction(() => advanceTacticalPhase(stateRef.current));
  const handleAssignTacticalGroup = (groupId: string, zoneId: string) =>
    handleTacticalAction(() => assignDefenderGroup(stateRef.current, groupId, zoneId));
  const handleSplitHuntGroup = (groupId: string, detachCount: number) =>
    handleTacticalAction(() => splitHuntGroup(stateRef.current, groupId, detachCount));
  const handleMergeHuntGroups = (destinationGroupId: string, sourceGroupId: string) =>
    handleTacticalAction(() => mergeHuntGroups(stateRef.current, destinationGroupId, sourceGroupId));
  const handleSetHuntPreparationZone = (actionId: 'placeBait' | 'setHuntTraps', zoneId: string) =>
    handleTacticalAction(() => setHuntPreparationZone(stateRef.current, actionId, zoneId));
  const handleSetTacticalFormationLine = (groupId: string, line: TacticalFormationLine) =>
    handleTacticalAction(() => setDefenderFormationLine(stateRef.current, groupId, line));
  const handleSetTacticalCommand = (groupId: string, command: TacticalCommandId) =>
    handleTacticalAction(() => setTacticalCommand(stateRef.current, groupId, command));
  const handleSetTacticalGroupTarget = (defenderGroupId: string, enemyGroupId: string | null) =>
    handleTacticalAction(() => setTacticalGroupTarget(stateRef.current, defenderGroupId, enemyGroupId));
  const handleResolveTacticalRound = () =>
    handleTacticalAction(() => resolveTacticalRound(stateRef.current));
  const handleCompleteTacticalSimulation = () =>
    handleTacticalAction(() => completeTacticalSimulation(stateRef.current));
  const handleAcknowledgeTacticalReport = () =>
    handleTacticalAction(() => acknowledgeTacticalReport(stateRef.current));
  const handleFinishTacticalBattle = () => {
    finishTacticalBattle(stateRef.current);
    // 공격전은 별도 장계를 만들지 않고 원정 귀환으로 넘어가므로, 시뮬레이션에서는 즉시 설정 화면으로 복귀한다.
    if (simMode && !stateRef.current.tacticalBattle && !stateRef.current.tacticalBattleReport) {
      exitBattleSimulation();
      return;
    }
    bump();
  };
  const handleDismissTacticalBattleReport = () => {
    dismissTacticalBattleReport(stateRef.current);
    // 시뮬레이션 모드는 장계를 닫으면 샌드박스를 버리고 설정 화면으로 돌아간다
    if (simMode) {
      exitBattleSimulation();
      return;
    }
    bump();
  };

  // 시뮬레이션 샌드박스를 버리고 메뉴(시뮬레이션 설정)로 복귀
  const exitBattleSimulation = () => {
    stateRef.current = newGame();
    setSimMode(false);
    setScreen('menu');
    setMenuView('battleSim');
    bump();
  };

  const startBattleSimulation = (options: BattleSimulationOptions) => {
    stateRef.current = createBattleSimulation(options);
    setSelected(null);
    setSelectedEntity(null);
    setPlacingType(null);
    setInspResidentId(null);
    setExpeditionMusterRequest(null);
    setSpeed(0);
    setSimMode(true);
    setScreen('game');
    bump();
  };

  const handleContinueAfterVictory = () => {
    continueAfterVictory(stateRef.current);
    bump();
  };

  // 세력 탭/장터 타일에서 해당 세력의 전용 협상창을 연다.
  const handleRequestTrade = (factionName: string) => {
    const err = requestTrade(stateRef.current, factionName);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleNegotiateTrade = (
    get: ResourceId,
    getAmt: number,
    specialItem?: SpecialItemId,
    giveAmt?: number,
  ) => {
    negotiateTrade(stateRef.current, get, getAmt, specialItem, giveAmt);
    bump();
  };

  const handleSetTributeReserve = (resource: ResourceId, amount: number) => {
    const message = setTributeReserve(stateRef.current, resource, amount);
    if (message) addLog(stateRef.current, message, 'info');
    bump();
  };

  const handleUseLuxuryGood = (resource: ResourceId) => {
    const error = useLuxuryGood(stateRef.current, resource);
    if (error) addLog(stateRef.current, error, 'info');
    bump();
  };

  // 조정 탭에서 지원 물자를 청원한다
  const handlePetition = () => {
    const err = requestPetition(stateRef.current);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  // 염초장 가동 토글 (모반 의심 관리)
  const handleToggleNitre = () => {
    toggleNitreYards(stateRef.current);
    bump();
  };

  // 은맥 — 봉인 어기기 / 묻어둔 은맥 다시 열기
  const handleSilverVeinAction = (action: 'break-seal' | 'reopen') => {
    const rng = makeRng(stateRef.current.seed + stateRef.current.day * 5417 + 13);
    const err = action === 'break-seal'
      ? breakSilverSeal(stateRef.current, rng)
      : reopenBuriedVein(stateRef.current);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
  };

  const handleOrganizeHunt = (kind: WildlifeKind) => {
    if (kind !== 'boar') {
      if (!stateRef.current.incidents.predatorThreats[kind]) {
        addLog(stateRef.current, '현재 추적 중인 맹수가 없습니다.', 'info');
        bump();
        return;
      }
      if (!predatorExpeditionTarget(stateRef.current, kind)) {
        addLog(stateRef.current, '토벌대가 향할 활성 짐승 서식지가 없습니다.', 'info');
        bump();
        return;
      }
      setSpeed(0);
      setWeaponDialogOpen(false);
      setExpeditionMusterRequest({ kind: 'predatorHunt', predatorKind: kind });
      return;
    }
    const error = openPredatorHunt(stateRef.current, kind);
    if (error) addLog(stateRef.current, error, 'info');
    bump();
  };

  const siteActionRng = (siteId: number) => {
    const state = stateRef.current;
    const site = state.foreignSites.find(candidate => candidate.id === siteId);
    return makeRng(state.seed + state.day * 104729 + siteId * 7919 + (site?.memories.length ?? 0) * 131);
  };

  const handleSiteAction = (action: () => string | null) => {
    const error = action();
    if (error) addLog(stateRef.current, error, 'info', true);
    bump();
  };

  const handleSendSiteGift = (siteId: number, gift: SiteGiftType) =>
    handleSiteAction(() => sendGiftToSite(stateRef.current, siteId, gift));
  const handleRequestSitePassage = (siteId: number) =>
    handleSiteAction(() => requestPassagePermission(stateRef.current, siteId));
  const handleRequestSiteHunting = (siteId: number) =>
    handleSiteAction(() => requestHuntingRights(stateRef.current, siteId));
  const handleRequestSiteDefectors = (siteId: number) =>
    handleSiteAction(() => requestSiteDefectors(stateRef.current, siteId));
  const handleScoutBanditLair = (siteId: number) =>
    handleSiteAction(() => scoutBanditLair(stateRef.current, siteId, siteActionRng(siteId)));
  const handleRaidBanditLair = (siteId: number) => {
    const site = stateRef.current.foreignSites.find(candidate => candidate.id === siteId);
    const error = !site || site.type !== 'banditLair'
      ? '토벌할 산채를 찾을 수 없습니다.'
      : !site.discovered
        ? '위치를 확인한 산채만 토벌할 수 있습니다.'
        : !isForeignSiteOperational(site)
          ? '이미 비어 있거나 불탄 산채입니다.'
          : null;
    if (error) {
      addLog(stateRef.current, error, 'info', true);
      bump();
      return;
    }
    setSpeed(0);
    setWeaponDialogOpen(false);
    setExpeditionMusterRequest({ kind: 'lairAssault', siteId });
  };

  const handleBuyPredatorIntel = (kind: PredatorKind) => {
    const negotiation = tradeNegotiationOf(stateRef.current.pendingChoice);
    const error = negotiation
      ? purchasePredatorIntel(stateRef.current, negotiation.faction, kind)
      : '정보를 살 거래 상대가 없습니다.';
    if (error) addLog(stateRef.current, error, 'info', true);
    bump();
  };

  const handleScoutPredator = (kind: PredatorKind, residentId: number) => {
    const error = startPredatorScout(stateRef.current, kind, residentId);
    if (error) addLog(stateRef.current, error, 'info', true);
    bump();
  };

  const handleConfirmExpedition = (memberIds: number[]): string | null => {
    const request = expeditionMusterRequest;
    if (!request) return '편성할 토벌 목표가 없습니다.';
    let error: string | null;
    if (request.kind === 'lairAssault') {
      const site = stateRef.current.foreignSites.find(candidate => candidate.id === request.siteId);
      if (!site) return '토벌할 산채를 찾을 수 없습니다.';
      error = createExpedition(stateRef.current, {
        kind: 'lairAssault',
        memberIds,
        targetX: site.x,
        targetY: site.y,
        targetSiteId: site.id,
      });
    } else {
      const target = predatorExpeditionTarget(stateRef.current, request.predatorKind);
      if (!target) return '토벌대가 향할 활성 짐승 서식지가 없습니다.';
      error = createExpedition(stateRef.current, {
        kind: 'predatorHunt',
        memberIds,
        targetX: target.x,
        targetY: target.y,
        predatorKind: request.predatorKind as PredatorKind,
      });
    }
    if (error) {
      addLog(stateRef.current, error, 'info', true);
    } else {
      stateRef.current.resources.defense = computeDefense(stateRef.current);
      setExpeditionMusterRequest(null);
    }
    bump();
    return error;
  };

  const handleSaveToSlot = (slot: number) => {
    if (saveGame(stateRef.current, slot)) {
      addLog(stateRef.current, `${slot}번 슬롯에 진행 상황을 저장했습니다.`, 'info');
      setCanLoad(true);
    } else {
      addLog(stateRef.current, '저장에 실패했습니다.', 'bad');
    }
    setSlotDialogMode(null);
    bump();
  };

  const handleLoadFromSlot = (slot: number) => {
    const loaded = loadGame(slot);
    if (!loaded) {
      window.alert(`${slot}번 슬롯의 저장 데이터를 불러오지 못했습니다.`);
      return;
    }
    setSimMode(false);
    stateRef.current = loaded;
    addLog(stateRef.current, `${slot}번 슬롯의 진행 상황을 불러왔습니다.`, 'info');
    setSelected(null);
    setSelectedEntity(null);
    setPlacingType(null);
    setInspResidentId(null);
    setWeaponDialogOpen(false);
    setExpeditionMusterRequest(null);
    setSlotDialogMode(null);
    setGameMenuView(null);
    setSpeed(1);
    lastPlayingSpeedRef.current = 1;
    menuRestoreSpeedRef.current = 1;
    setScreen('game');
    bump();
  };

  const handleResidentClick = (id: number) => {
    setSelected(null);
    setSelectedEntity({ kind: 'resident', id });
    setInspResidentId(id);
    // 튜토리얼 1스텝(주민 선택) 달성 플래그
    if (stateRef.current.scenario) markScenarioFlag(stateRef.current, 'residentSelected');
  };

  const handleClearSelection = useCallback(() => {
    setSelected(null);
    setSelectedEntity(null);
    setInspResidentId(null);
  }, []);

  const handleSelectResidentFromDock = (id: number) => {
    const resident = stateRef.current.residents.find(candidate => candidate.id === id && candidate.alive);
    if (!resident) return;
    handleResidentClick(id);
    const viewport = mapViewportRef.current;
    if (viewport) centerViewportOnTile(viewport, resident.x, resident.y);
  };

  const openDockWindow = useCallback((id: DockWindowId) => {
    setOpenDockWindowIds(current => current.includes(id) ? current : [...current, id]);
    setFloatingWindowOrder(current => bringDockWindowToFront(current, id));
  }, []);

  const focusFloatingWindow = useCallback((id: FloatingWindowId) => {
    setFloatingWindowOrder(current => bringDockWindowToFront(current, id));
  }, []);

  const toggleDockWindow = useCallback((id: DockWindowId) => {
    const open = openDockWindowIds.includes(id);
    setOpenDockWindowIds(current => open
      ? current.filter(openId => openId !== id)
      : [...current, id]);
    setFloatingWindowOrder(current => open
      ? current.filter(openId => openId !== id)
      : bringDockWindowToFront(current, id));
  }, [openDockWindowIds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        if (titleSettingsOpen) {
          setTitleSettingsOpen(false);
        } else if (slotDialogMode) {
          setSlotDialogMode(null);
        } else if (gameMenuView === 'settings' || gameMenuView === 'feedback') {
          setGameMenuView('main');
        } else if (gameMenuView === 'main') {
          closeGameMenu();
        } else if (placingType) {
          setPlacingType(null);
        } else if (weaponDialogOpen) {
          setWeaponDialogOpen(false);
        } else if (expeditionMusterRequest) {
          setExpeditionMusterRequest(null);
        } else {
          openGameMenu();
        }
        return;
      }

      if (screen !== 'game' || isEditableTarget(event.target) || slotDialogMode || gameMenuView ||
          weaponDialogOpen || expeditionMusterRequest) return;
      const runtimeState = stateRef.current;
      if (runtimeState.pendingChoice || runtimeState.pendingPromotionNotice || runtimeState.tacticalBattle || runtimeState.tacticalBattleReport || runtimeState.gameOver) return;

      if (event.code === 'Space') {
        event.preventDefault();
        setSpeed(current => current === 0 ? lastPlayingSpeedRef.current || 1 : 0);
        return;
      }
      const shortcutSpeed = speedForHotkey(event.code);
      if (shortcutSpeed != null) {
        event.preventDefault();
        setSpeed(shortcutSpeed);
        return;
      }
      const dockId = dockWindowForHotkey(event.key);
      if (dockId) {
        event.preventDefault();
        toggleDockWindow(dockId);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    closeGameMenu, expeditionMusterRequest, gameMenuView, openGameMenu, placingType, screen,
    slotDialogMode, titleSettingsOpen, toggleDockWindow, weaponDialogOpen,
  ]);

  const handleContextAction = (x: number, y: number) => {
    const tile = stateRef.current.map[y]?.[x];
    if (!tile) return;
    const action = getPointerAction(stateRef.current, selectedEntity, tile);
    if (selectedEntity?.kind !== 'resident') return;

    if ((action.kind === 'move' || action.kind === 'work') && (action.unauthorizedSiteIds?.length ?? 0) > 0) {
      openTerritoryOrderConfirmation(stateRef.current, selectedEntity.id, action);
      bump();
      return;
    }

    let err: string | null = null;
    if (action.kind === 'move') {
      err = issueResidentMoveOrder(stateRef.current, selectedEntity.id, action.x, action.y);
    } else if (action.kind === 'work') {
      err = issueResidentWorkOrder(stateRef.current, selectedEntity.id, action);
    } else if (action.kind === 'invalid') {
      err = action.label;
    }

    if (err) addLog(stateRef.current, err, action.kind === 'invalid' ? 'info' : 'bad');
    bump();
  };

  // 선택 상태를 비우고 새 판을 시작
  const enterGameWith = (state: GameState) => {
    setSimMode(false);
    stateRef.current = state;
    setSelected(null);
    setSelectedEntity(null);
    setPlacingType(null);
    setInspResidentId(null);
    setWeaponDialogOpen(false);
    setExpeditionMusterRequest(null);
    setGameMenuView(null);
    setTitleSettingsOpen(false);
    setSpeed(1);
    lastPlayingSpeedRef.current = 1;
    menuRestoreSpeedRef.current = 1;
    setScreen('game');
    bump();
  };

  const startNewGame = (difficulty: Difficulty) => {
    enterGameWith(newGame(undefined, difficulty));
  };

  const startTutorial = () => {
    enterGameWith(createTutorialGame());
  };

  // ESC 게임 메뉴의 "새 게임" → 타이틀의 난이도 선택으로
  const handleNewGame = () => {
    if (!window.confirm('메인 메뉴로 돌아갈까요? 저장하지 않은 진행은 사라집니다.')) return;
    setGameMenuView(null);
    setSlotDialogMode(null);
    setMenuView('main');
    setScreen('menu');
  };

  const slotDialog = slotDialogMode && (
    <LazyUiBoundary label="저장 슬롯" mode="overlay">
      <SaveSlotDialog
        mode={slotDialogMode}
        onSelect={slotDialogMode === 'save' ? handleSaveToSlot : handleLoadFromSlot}
        onClose={() => setSlotDialogMode(null)}
        onChanged={() => setCanLoad(hasAnySave())}
      />
    </LazyUiBoundary>
  );

  if (screen === 'menu') {
    if (menuView === 'battleSim') {
      return (
        <LazyUiBoundary label="전투 시뮬레이션" mode="overlay">
          <BattleSimulationSetup
            onStart={startBattleSimulation}
            onBack={() => setMenuView('main')}
          />
        </LazyUiBoundary>
      );
    }
    return (
      <>
        <MainMenu
          canContinue={canLoad}
          onStart={startNewGame}
          onStartTutorial={startTutorial}
          onContinue={() => setSlotDialogMode('load')}
          onOpenBattleSim={() => setMenuView('battleSim')}
          onOpenSettings={() => setTitleSettingsOpen(true)}
        />
        {slotDialog}
        {titleSettingsOpen && (
          <SettingsDialog
            audio={uiPrefs.audio}
            onChange={update => setUiPrefs(current => setAudioPrefs(current, update))}
            onClose={() => setTitleSettingsOpen(false)}
            backLabel="메인 메뉴로"
          />
        )}
      </>
    );
  }

  const overlayItems: DockOverlayItem[] = [
    {
      id: 'minimap',
      label: '미니맵',
      className: 'hud-minimap-window',
      content: (
        <div className="minimap-overlay">
          <Profiler id="minimap-boundary" onRender={recordAppRender}>
            <RuntimeVersionBoundary store={runtimeVersionStore}>
              {runtimeVersion => {
                const runtimeState = stateRef.current;
                return (
                  <Minimap
                    state={runtimeState}
                    version={runtimeVersion}
                    animationActive={speed > 0 && !runtimeState.pendingChoice && !runtimeState.pendingPromotionNotice && !runtimeState.tacticalBattle && !runtimeState.tacticalBattleReport && !runtimeState.gameOver}
                    viewportRef={mapViewportRef}
                    selected={selected}
                  />
                );
              }}
            </RuntimeVersionBoundary>
          </Profiler>
        </div>
      ),
    },
    ...(selectedEntity ? [{
      id: 'selection' as const,
      label: '선택 정보',
      className: 'hud-selection-window',
      content: (
        <RuntimeVersionBoundary store={uiVersionStore}>
          {() => (
            <SelectionContextBar
              state={stateRef.current}
              selected={selected}
              selectedEntity={selectedEntity}
              onClear={handleClearSelection}
              onSetResidentJob={handleSetResidentJob}
              onSetYouthActivity={handleSetYouthActivity}
              onToggleResidentCart={handleToggleResidentCart}
              onUpgradeHousing={handleUpgradeHousing}
              onUpgradeCenter={handleUpgradeCenter}
              onSetSmithyProduct={handleSetSmithyProduct}
              onSetDryingProduct={handleSetDryingProduct}
              onSetLivestockSpecies={handleSetLivestockSpecies}
              onSlaughterLivestock={handleSlaughterLivestock}
              onSetBuildingCrop={handleSetBuildingCrop}
              onConvertFieldToPaddy={handleConvertFieldToPaddy}
              onSetPlotPlowOxen={handleSetPlotPlowOxen}
              onRequestTrade={handleRequestTrade}
              onToggleNitre={handleToggleNitre}
              onSilverVeinAction={handleSilverVeinAction}
              onAssignNearestWorker={handleAssignNearestWorker}
              onUnassignWorker={handleUnassignWorker}
              onSelectResident={handleResidentClick}
              onCancelBuildingConstruction={handleCancelBuildingConstruction}
              onDemolishBuilding={handleDemolishBuilding}
              onSendSiteGift={handleSendSiteGift}
              onRequestSitePassage={handleRequestSitePassage}
              onRequestSiteHunting={handleRequestSiteHunting}
              onRequestSiteDefectors={handleRequestSiteDefectors}
              onScoutBanditLair={handleScoutBanditLair}
              onRaidBanditLair={handleRaidBanditLair}
            />
          )}
        </RuntimeVersionBoundary>
      ),
    }] : []),
  ];

  return (
    <Profiler id="game-app" onRender={recordAppRender}>
    <div className="app">
      <RuntimeVersionBoundary store={uiVersionStore}>
        {() => <RuntimeGameEffects state={stateRef.current} setSpeed={setSpeed} />}
      </RuntimeVersionBoundary>
      <Profiler id="topbar-boundary" onRender={recordAppRender}>
        <RuntimeVersionBoundary store={uiVersionStore}>
          {() => (
            <TopBar
              state={stateRef.current}
              speed={speed}
              setSpeed={setSpeed}
              onOpenMenu={openGameMenu}
              uiPrefs={uiPrefs}
              onUiPrefsChange={setUiPrefs}
              onOpenCourt={() => openDockWindow('court')}
            />
          )}
        </RuntimeVersionBoundary>
      </Profiler>
      <div className="main">
        <div className="canvas-stage">
          <RuntimeVersionBoundary store={uiVersionStore}>
            {() => (
              <div className="right-overlay-stack">
                <AlertsPanel state={stateRef.current} />
              </div>
            )}
          </RuntimeVersionBoundary>
          <Profiler id="log-boundary" onRender={recordAppRender}>
            <RuntimeVersionBoundary store={uiVersionStore}>
              {() => <UnifiedLog state={stateRef.current} />}
            </RuntimeVersionBoundary>
          </Profiler>
          <div className="canvas-wrap" ref={mapViewportRef}>
            <RuntimeVersionBoundary store={runtimeVersionStore}>
              {runtimeVersion => {
                const runtimeState = stateRef.current;
                return (
                  <GameCanvas
                    state={runtimeState}
                    version={runtimeVersion}
                    animationActive={speed > 0 && !runtimeState.pendingChoice && !runtimeState.pendingPromotionNotice && !runtimeState.tacticalBattle && !runtimeState.tacticalBattleReport && !runtimeState.gameOver}
                    zoom={uiPrefs.mapZoom}
                    placingType={placingType}
                    selected={selected}
                    selectedEntity={selectedEntity}
                    selectedResidentId={inspResidentId}
                    anim={animRef}
                    onTileClick={handleTileClick}
                    onPlacePlot={handlePlacePlot}
                    onResidentClick={handleResidentClick}
                    onContextAction={handleContextAction}
                    onCancelPlace={() => setPlacingType(null)}
                    onZoomChange={zoom => setUiPrefs(current => setMapZoom(current, zoom))}
                  />
                );
              }}
            </RuntimeVersionBoundary>
          </div>
          <RuntimeVersionBoundary store={uiVersionStore}>
            {() => (
              <BuildDrawer
                state={stateRef.current}
                placingType={placingType}
                setPlacingType={setPlacingType}
                onClearSelection={handleClearSelection}
                uiPrefs={uiPrefs}
                onUiPrefsChange={setUiPrefs}
                shortcutsEnabled={!gameMenuView && !slotDialogMode && !weaponDialogOpen && !expeditionMusterRequest &&
                  !stateRef.current.pendingChoice && !stateRef.current.pendingPromotionNotice && !stateRef.current.tacticalBattle && !stateRef.current.tacticalBattleReport}
              />
            )}
          </RuntimeVersionBoundary>
          <Profiler id="dock-boundary" onRender={recordAppRender}>
            <DockFrame
            overlayItems={overlayItems}
            items={[
              {
                id: 'jobs',
                label: '직업 배정',
                icon: (
                  <RuntimeVersionBoundary store={uiVersionStore}>
                    {() => {
                      const adultIdle = jobWorkforceCounts(stateRef.current, 'idle').adult;
                      return (
                        <ManagementDockIcon
                          id="jobs"
                          notification={adultIdle > 0 ? `무직 ${adultIdle}명` : undefined}
                        />
                      );
                    }}
                  </RuntimeVersionBoundary>
                ),
                shortcut: 'Q',
                content: (
                  <RuntimeVersionBoundary store={uiVersionStore}>
                    {() => (
                      <JobPanel
                        state={stateRef.current}
                        onReassign={handleReassign}
                        uiPrefs={uiPrefs}
                        onUiPrefsChange={setUiPrefs}
                        onAutoAssign={handleAutoAssignBuildings}
                      />
                    )}
                  </RuntimeVersionBoundary>
                ),
              },
              {
                id: 'processing',
                label: '가공·비축',
                icon: <ManagementDockIcon id="processing" />,
                shortcut: 'W',
                content: (
                  <RuntimeVersionBoundary store={uiVersionStore}>
                    {() => <ProcessingPanel state={stateRef.current} onSetReserve={handleSetProcessingReserve} />}
                  </RuntimeVersionBoundary>
                ),
              },
              {
                id: 'residents',
                label: '주민',
                icon: <ManagementDockIcon id="residents" />,
                shortcut: 'E',
                content: (
                  <RuntimeVersionBoundary store={uiVersionStore}>
                    {() => (
                      <ResidentsWindow
                        state={stateRef.current}
                        selectedResidentId={inspResidentId}
                        onSelectResident={handleSelectResidentFromDock}
                        onOpenWeaponAllocation={() => {
                          setSpeed(0);
                          setWeaponDialogOpen(true);
                        }}
                      />
                    )}
                  </RuntimeVersionBoundary>
                ),
              },
              {
                id: 'specialResidents',
                label: '특수 주민',
                icon: <ManagementDockIcon id="specialResidents" />,
                shortcut: 'R',
                content: (
                  <RuntimeVersionBoundary store={uiVersionStore}>
                    {() => (
                      <LazyUiBoundary label="특수 주민">
                        <SpecialResidentsWindow
                          state={stateRef.current}
                          selectedResidentId={inspResidentId}
                          onSelectResident={handleSelectResidentFromDock}
                          onAppointConfined={handleAppointConfinedSpecialResident}
                        />
                      </LazyUiBoundary>
                    )}
                  </RuntimeVersionBoundary>
                ),
              },
              {
                id: 'factions',
                label: '세력·거래',
                icon: <ManagementDockIcon id="factions" />,
                shortcut: 'T',
                content: (
                  <RuntimeVersionBoundary store={uiVersionStore}>
                    {() => <FactionsWindow state={stateRef.current} onRequestTrade={handleRequestTrade} />}
                  </RuntimeVersionBoundary>
                ),
              },
              {
                id: 'court',
                label: '조정',
                icon: <ManagementDockIcon id="court" />,
                shortcut: 'Y',
                content: (
                  <RuntimeVersionBoundary store={uiVersionStore}>
                    {() => (
                      <CourtWindow
                        state={stateRef.current}
                        onPetition={handlePetition}
                        onToggleNitre={handleToggleNitre}
                        onSetTributeReserve={handleSetTributeReserve}
                        onUseLuxuryGood={handleUseLuxuryGood}
                      />
                    )}
                  </RuntimeVersionBoundary>
                ),
              },
              {
                id: 'incidents',
                label: '사건 · 기물함',
                icon: <ManagementDockIcon id="incidents" />,
                shortcut: 'U',
                content: (
                  <RuntimeVersionBoundary store={uiVersionStore}>
                    {() => (
                      <InspectorPanel
                        state={stateRef.current}
                        onOrganizeHunt={handleOrganizeHunt}
                        onScoutPredator={handleScoutPredator}
                      />
                    )}
                  </RuntimeVersionBoundary>
                ),
              },
            ]}
            openWindowIds={openDockWindowIds}
            windowOrder={floatingWindowOrder}
            pinnedWindowIds={uiPrefs.pinnedDockWindows}
            layouts={uiPrefs.dockWindowLayouts}
            onToggleWindow={toggleDockWindow}
            onTogglePinned={id => setUiPrefs(current => togglePinnedDockWindow(current, id))}
            onFocusWindow={focusFloatingWindow}
            onCommitLayout={(id, layout) => setUiPrefs(current => setDockWindowLayout(current, id, layout))}
            onResetLayout={id => setUiPrefs(current => resetDockWindowLayout(current, id))}
            />
          </Profiler>
        </div>
      </div>

      {expeditionMusterRequest ? (
        <LazyUiBoundary label="원정대 편성" mode="overlay">
          <ExpeditionMusterDialog
            state={state}
            request={expeditionMusterRequest}
            onAssignWeapon={handleSetResidentWeapon}
            onConfirm={handleConfirmExpedition}
            onClose={() => setExpeditionMusterRequest(null)}
          />
        </LazyUiBoundary>
      ) : weaponDialogOpen ? (
        <LazyUiBoundary label="무기 배정" mode="overlay">
          <WeaponAllocationDialog
            state={state}
            onAssign={handleSetResidentWeapon}
            onAssignMount={handleSetResidentMount}
            onAutoAssign={handleAutoAssignWeapons}
            onClear={handleClearWeaponAssignments}
            onClose={() => setWeaponDialogOpen(false)}
          />
        </LazyUiBoundary>
      ) : tradeNegotiationOf(state.pendingChoice) ? (
        <TradeDialog
          state={state}
          onNegotiate={handleNegotiateTrade}
          onBuyPredatorIntel={handleBuyPredatorIntel}
          onChoose={handleChoose}
        />
      ) : state.pendingChoice ? (
        <EventModal choice={state.pendingChoice} onChoose={handleChoose} />
      ) : null}

      {slotDialog}

      {gameMenuView === 'main' && (
        <GameMenu
          canLoad={canLoad}
          onResume={closeGameMenu}
          onSave={() => setSlotDialogMode('save')}
          onLoad={() => setSlotDialogMode('load')}
          onNewGame={handleNewGame}
          onSettings={() => setGameMenuView('settings')}
          onFeedback={() => setGameMenuView('feedback')}
        />
      )}
      {gameMenuView === 'settings' && (
        <SettingsDialog
          audio={uiPrefs.audio}
          onChange={update => setUiPrefs(current => setAudioPrefs(current, update))}
          onClose={() => setGameMenuView('main')}
        />
      )}
      {gameMenuView === 'feedback' && (
        <FeedbackDialog
          state={stateRef.current}
          speed={menuRestoreSpeedRef.current}
          zoom={uiPrefs.mapZoom}
          onClose={() => setGameMenuView('main')}
        />
      )}

      {state.scenario && <TutorialCoach state={state} />}

      {state.pendingPromotionNotice && state.pendingPromotionNotice !== 'settlement' && (
        <PromotionModal rank={state.pendingPromotionNotice} onAcknowledge={handleAcknowledgePromotion} />
      )}

      {state.gameOver && (
        <div className="modal-overlay">
          <div className={`modal gameover ${state.gameOver.won ? 'won' : 'lost'}`}>
            <h2>{state.gameOver.won ? '승격 — 개척 성공' : '개척 실패'}</h2>
            <div className="body">{state.gameOver.reason}</div>
            <div className="muted small" style={{ marginBottom: 10 }}>
              생존 {Math.floor((state.day - 1) / CONFIG.time.yearDays)}년 {(state.day - 1) % CONFIG.time.yearDays}일 ·
              누적 사망 {state.totalDeaths}명
            </div>
            {state.gameOver.won && (
              <button className="btn primary" onClick={handleContinueAfterVictory}>계속 플레이</button>
            )}
            <button className="btn" onClick={() => setScreen('menu')}>
              {state.gameOver.won ? '개척 종료' : '메인 메뉴로'}
            </button>
          </div>
        </div>
      )}

      {state.tacticalBattle && (
        <LazyUiBoundary label="전술전" mode="overlay">
          <TacticalBattleScreen
            state={state}
            onSpendPreparation={handleSpendPreparation}
            onAdvancePhase={handleAdvanceTacticalPhase}
            onAssignGroup={handleAssignTacticalGroup}
            onSplitHuntGroup={handleSplitHuntGroup}
            onMergeHuntGroups={handleMergeHuntGroups}
            onSetHuntPreparationZone={handleSetHuntPreparationZone}
            onSetFormationLine={handleSetTacticalFormationLine}
            onDeploymentAction={handleTacticalDeploymentAction}
            onSetCommand={handleSetTacticalCommand}
            onSetGroupTarget={handleSetTacticalGroupTarget}
            onResolveRound={handleResolveTacticalRound}
            onCompleteSimulation={handleCompleteTacticalSimulation}
            onAcknowledgeReport={handleAcknowledgeTacticalReport}
            onFinishBattle={handleFinishTacticalBattle}
          />
        </LazyUiBoundary>
      )}
      {state.tacticalBattleReport && (
        <LazyUiBoundary label="전투 장계" mode="overlay">
          <TacticalBattleReportModal report={state.tacticalBattleReport} onClose={handleDismissTacticalBattleReport} />
        </LazyUiBoundary>
      )}
      {simMode && (
        <button className="sim-exit-button" onClick={exitBattleSimulation}>
          시뮬레이션 종료
        </button>
      )}
      {runtimePerfEnabled && (
        <aside style={{ position: 'fixed', left: 8, bottom: 8, zIndex: 10000, maxWidth: 'min(720px, 90vw)' }}>
          {runtimePerfCapturing
            ? <button className="btn" onClick={handleStopRuntimePerf}>성능 측정 종료</button>
            : <button className="btn" onClick={handleStartRuntimePerf}>성능 측정 시작</button>}
          {runtimePerfReport && (
            <pre data-testid="runtime-perf-report" style={{ maxHeight: '70vh', overflow: 'auto', background: '#111', color: '#eee', padding: 8 }}>
              {runtimePerfReport}
            </pre>
          )}
        </aside>
      )}
    </div>
    </Profiler>
  );
}
