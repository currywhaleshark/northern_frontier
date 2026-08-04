// 최상위 컴포넌트: 게임 상태 보관, 게임 루프, 플레이어 입력 연결
import { withJosa } from './game/josa';
import { lazy, Profiler, useCallback, useEffect, useLayoutEffect, useRef, useState, type ProfilerOnRenderCallback } from 'react';
import { CONFIG } from './game/config';
import {
  assignNearestWorkerToBuilding, assignResidentToBuilding,
  advanceDay, advanceTick, autoAssignWorkersToBuildingTypes, cancelBuildingConstruction, continueAfterVictory, newGame, newGameFromOptions, reassignJob, resolveChoice, setResidentJob,
  setBuildingCrop, setDryingProduct, setSmithyProduct, setTanneryProduct, issueResidentMoveOrder, issueResidentWorkOrder, upgradeHousingBuilding,
  assignPlotPlowOxen, defineStablePasture, expandAreaBuilding, setLivestockSpecies, slaughterLivestock,
  buildingHasActiveWork, convertFieldToPaddy, setYouthActivity, startBreachedWallRepair, startBuildingDemolition,
  startBuildingRelocation, togglePriorityBuilding, toggleResidentCart,
  startGateConversion, tryPlaceWallLine, unassignResidentFromBuilding, useLuxuryGood, SUBTICKS, tryPlaceBuilding,
  CLEARING_APPROVAL_REQUIRED,
} from './game/simulation';
import { forestTilesInArea, forestTilesInFootprint } from './game/landClearing';
import { adjustGatheringWorkArea } from './game/gatheringZones';
import {
  assignNearestFisherToFishingBoat, fishingBoatConstructionSlots, startFishingBoatConstruction,
  startFishingBoatRepair, unassignFisherFromFishingBoat,
} from './game/fishingBoats';
import { isSolidWallBuilding } from './game/walls';
import { ClearingConfirmDialog } from './components/ClearingConfirmDialog';
import { RoyalPlaqueConfirmDialog } from './components/RoyalPlaqueConfirmDialog';
import { hasAnySave, loadGame, saveGame } from './game/saveLoad';
import { addLog, negotiateTrade, requestTrade, tradeNegotiationOf } from './game/events';
import { requestSettlementRename } from './game/settlementName';
import { jobWorkforceCounts } from './game/residents';
import { playSfx, setSfxSettings, stopWeatherAmbient, setWeatherAmbient, setDayBandAmbient, stopDayBandAmbient } from './sound/sfx';
import { getSeason } from './game/seasons';
import { uiDayBand } from './ui/dayBand';
import { setMusicScene, setMusicSettings } from './sound/music';
import { AlertsPanel } from './components/AlertsPanel';
import { SiegePanel } from './components/SiegePanel';
import { BuildDrawer } from './components/BuildDrawer';
import { DockFrame, type DockOverlayItem } from './components/dock/DockFrame';
import { CourtWindow } from './components/dock/CourtWindow';
import { FactionsWindow } from './components/dock/FactionsWindow';
import { ResidentsWindow } from './components/dock/ResidentsWindow';
import { EventModal } from './components/EventModal';
import { PromotionModal } from './components/PromotionModal';
import { TradeDialog } from './components/TradeDialog';
import { GiftEnvoyDialog } from './components/GiftEnvoyDialog';
import { ClaimAccordDialog } from './components/ClaimAccordDialog';
import { GameCanvas } from './components/GameCanvas';
import { MapLayerTabs } from './components/MapLayerTabs';
import { InspectorPanel } from './components/InspectorPanel';
import { JobPanel } from './components/JobPanel';
import { GameMenu } from './components/GameMenu';
import { SettingsDialog } from './components/SettingsDialog';
import { FeedbackDialog } from './components/FeedbackDialog';
import { ManagementDockIcon } from './components/ManagementDockIcon';
import { createBattleSimulation } from './game/battleSimulation';
import { centerViewportOnSettlement, centerViewportOnTile, Minimap } from './components/Minimap';
import { ProcessingPanel } from './components/ProcessingPanel';
import { SelectionContextBar } from './components/SelectionContextBar';
import { TopBar } from './components/TopBar';
import { UnifiedLog } from './components/UnifiedLog';
import type { ExpeditionMusterRequest } from './components/ExpeditionMusterDialog';
import { LazyUiBoundary } from './components/LazyUiBoundary';
import { EdictDialog } from './components/EdictDialog';
import { ChronicleScreen } from './components/ChronicleScreen';
import { SettlementRenameDialog } from './components/SettlementRenameDialog';
import { setEdictLevel } from './game/edicts';
import { requestPetition } from './game/petition';
import { breakSilverSeal, reopenBuriedVein } from './game/silver';
import { toggleNitreYards } from './game/suspicion';
import { setProcessingReserve } from './game/processing';
import { setTributeReserve } from './game/tributeReserve';
import { cancelTradeContract, signTradeContract } from './game/tradeContracts';
import {
  cancelClaimAccordEnvoy, cancelGiftEnvoy, cancelPactEnvoy, openClaimAccordEnvoy, openGiftEnvoy, openPactEnvoy,
  sendClaimAccordEnvoy, sendGiftEnvoy, sendPactEnvoy,
} from './game/diplomacy';
import { openAidRequest } from './game/militaryAid';
import { setTradeContractReserve } from './game/tradeContractReserve';
import { openPredatorHunt, startPredatorScout } from './game/specialEvents';
import { useSpecialItem } from './game/specialItemActions';
import { installRoyalPlaque, royalPlaqueInstallError } from './game/royalPlaque';
import { getPointerAction, selectedEntityAfterTileClick } from './game/selectionActions';
import { makeRng } from './game/map';
import { changeSiegeStance } from './game/siege';
import { openTerritoryOrderConfirmation } from './game/territory';
import {
  BUILDING_DEFS, buildingFootprintDims, computeDefense, preferredLeveeEdgeAt,
} from './game/buildings';
import { createExpedition, predatorExpeditionTarget } from './game/expedition';
import { purchasePredatorIntel } from './game/predatorIntelTrade';
import { isForeignSiteOperational } from './game/foreignSites';
import {
  clearMountAssignments, clearWeaponAssignments, setAutomaticWeaponAllocation, setResidentArtifactWeapon,
  setResidentMount, setResidentWeapon,
} from './game/weapons';
import {
  requestSiteDefectors, scoutBanditLair, sendGiftToSite,
  type SiteGiftType,
} from './game/siteDiplomacy';
import {
  acknowledgeTacticalReport, advanceTacticalPhase, assignDefenderGroup, completeTacticalSimulation,
  dismissTacticalBattleReport, finishTacticalBattle, resolveTacticalRound, setDefenderFormationLine,
  setTacticalCommand, setTacticalGroupTarget, spendPreparationAction,
} from './game/tacticalBattle';
import { mergeHuntGroups, setHuntPreparationZone, splitHuntGroup } from './game/tacticalHunt';
import type {
  ArtifactWeaponId, BuildingTypeId, CombatWeaponId, CropId, DryingProductId, EdictId, EdictLevel, GameState, JobId, LivestockId, LogEntry, MountId, ProcessingInputId, ResourceId, SelectedEntity, SmithyProductId, TanneryProductId, TradeContract, YouthActivity,
  PreparationActionId, PredatorKind, SpecialItemId, SpecialResidentId, TacticalCommandId, TacticalFormationLine, WildlifeKind,
} from './game/types';
import { markScenarioFlag } from './game/scenario';
import { acknowledgePromotionNotice, upgradeSettlementCenter } from './game/promotion';
import { createTutorialGame } from './game/tutorialStart';
import { TutorialCoach } from './components/TutorialCoach';
import { GuideCardLayer } from './components/GuideCard';
import { WinterChecklistPanel } from './components/WinterChecklistPanel';
import { dismissGuideCard, guideCards, guidesEnabled, openGuideOnce, setGuidesEnabled } from './game/guides';
import {
  loadUiPrefs,
  resetDockWindowLayout,
  saveUiPrefs,
  setAudioPrefs,
  setAutoFastForwardSleepingNight,
  setResidentMarkerPrefs,
  setDockWindowLayout,
  setMapZoom,
  setMapLayerVisibility,
  togglePinnedDockWindow,
  type UiPrefs,
} from './ui/uiPrefs';
import {
  createNightAutoSpeedState,
  markNightSpeedOverride,
  nightAutoSpeedTarget,
  type NightAutoSpeedState,
} from './ui/nightAutoSpeed';
import { bringDockWindowToFront } from './ui/dockLayout';
import { advanceGameClock } from './ui/gameClock';
import { appointConfinedSpecialResident } from './game/specialResidents';
import type { DockWindowId, FloatingWindowId } from './ui/dockPresentation';
import type { AutoAssignBuildingType } from './game/workerSlots';
import { RuntimeVersionBoundary } from './components/RuntimeVersionBoundary';
import { createRuntimeVersionStore, uiRefreshIntervalMs } from './ui/runtimeVersionStore';
import { ActionNoticeLayer } from './components/ActionNotice';
import { createActionNoticeStore, type ActionNoticeStore } from './ui/actionNotices';
import {
  recordRuntimePerf, recordRuntimePerfSince, runtimePerfSnapshot, runtimePerfStartTime,
  startRuntimePerf, stopRuntimePerf, summarizeRuntimePerf,
} from './perf/runtimePerf';
import { dockWindowForHotkey, isEditableTarget, speedForHotkey } from './ui/gameHotkeys';
import type { GameSessionLaunch, GameSessionReturnTarget } from './sessionLaunch';

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

// 개발용 치트 패널 — DEV 게이트 + 지연 import. 프로덕션 빌드에서는 이 삼항이 false 가지로
// 접혀 청크와 game/debugActions 전체가 번들에서 빠진다 (docs/DESIGN-2026-08-03-debug-cheat-panel.md §2).
const DebugCheatPanel = import.meta.env.DEV
  ? lazy(() => import('./components/DebugCheatPanel').then(module => ({ default: module.DebugCheatPanel })))
  : null;

function RuntimeGameEffects({
  state,
  speed,
  setSpeed,
  autoFastForwardSleepingNight,
  nightAutoSpeedState,
  suspended,
  actionNoticeStore,
}: {
  state: GameState;
  speed: number;
  setSpeed: (speed: number) => void;
  autoFastForwardSleepingNight: boolean;
  nightAutoSpeedState: { current: NightAutoSpeedState };
  suspended: boolean;
  actionNoticeStore: ActionNoticeStore;
}) {
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
      const newEntries = state.log.slice(m.logLen);
      for (const e of newEntries.slice(-3)) {
        if (e.kind === 'good') {
          if (['토끼', '꿩', '노루', '멧돼지'].some(prey => e.text.includes(prey))) playSfx('hunt');
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
      // 게임 진행 중에도 반드시 놓치지 말아야 하는 외교 경고만 중앙 플로트로 보낸다.
      // 불러온 저장의 과거 로그는 다시 띄우지 않는다.
      for (const e of newEntries) {
        if (!e.notice || e.day !== state.day) continue;
        actionNoticeStore.push(e.text, e.kind === 'bad' || e.kind === 'raid' ? 'bad' : e.kind === 'good' ? 'good' : 'info');
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

  // 저녁·밤 풀벌레 — 겨울엔 울지 않는다
  const dayBand = uiDayBand(state.subTick);
  const allLivingResidentsSleeping = state.residents.some(resident => resident.alive) &&
    state.residents.every(resident => !resident.alive || resident.phase === 'sleeping');
  const cricketWinter = getSeason(state.day) === 'winter';
  useEffect(() => {
    setDayBandAmbient(dayBand, cricketWinter);
  }, [dayBand, cricketWinter]);

  useEffect(() => () => stopDayBandAmbient(), []);

  useEffect(() => {
    if (suspended) return;
    const target = nightAutoSpeedTarget(
      nightAutoSpeedState.current,
      state,
      speed,
      autoFastForwardSleepingNight,
    );
    if (target != null && target !== speed) setSpeed(target);
  }, [
    allLivingResidentsSleeping,
    autoFastForwardSleepingNight,
    dayBand,
    nightAutoSpeedState,
    setSpeed,
    speed,
    state.day,
    suspended,
  ]);

  useEffect(() => {
    if (state.tacticalBattle) setSpeed(0);
  }, [state.tacticalBattle?.id, setSpeed]);

  // 길잡이 안내가 새로 열릴 때마다 시간을 멈춘다. 모달을 닫아도 멈춘 채로 남으므로
  // 플레이어가 스스로 ▶를 눌러야 다음 하루가 흐른다 — "시간을 흘리십시오"라는 말이 헛돌지 않게.
  const scenarioModal = state.pendingChoice?.kind === 'scenario' ? state.pendingChoice : null;
  const scenarioModalKey = scenarioModal
    ? `${String(scenarioModal.data.phase ?? '')}:${String(scenarioModal.data.stepId ?? '')}`
    : null;
  useEffect(() => {
    if (scenarioModalKey) setSpeed(0);
  }, [scenarioModalKey, setSpeed]);

  return null;
}

interface GameSessionProps {
  launch: GameSessionLaunch;
  onReturnToMenu: (target: GameSessionReturnTarget) => void;
}

function initialSessionState(launch: GameSessionLaunch): GameState {
  if (launch.kind === 'loaded') return launch.state;
  if (launch.kind === 'tutorial') return createTutorialGame();
  if (launch.kind === 'battleSimulation') return createBattleSimulation(launch.options);
  return newGameFromOptions(launch.options);
}

export default function GameSession({ launch, onReturnToMenu }: GameSessionProps) {
  const appRenderStartedAt = runtimePerfStartTime();
  // 게임 상태는 ref에 두고, 입력/차단 상태만 App version으로 즉시 반영한다.
  const [initialState] = useState(() => initialSessionState(launch));
  const stateRef = useRef(initialState);
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const [runtimeVersionStore] = useState(createRuntimeVersionStore);
  const [uiVersionStore] = useState(createRuntimeVersionStore);
  const [actionNoticeStore] = useState(createActionNoticeStore);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => {
    runtimeVersionStore.publish();
    uiVersionStore.publish();
    setVersion(v => v + 1);
  }, [runtimeVersionStore, uiVersionStore]);

  // 조작 결과 안내: 로그에 남기고 화면 가운데에도 띄운다. 거절 사유를 로그에서
  // 찾아 읽어야 했던 탓에 "왜 안 되는지 모르겠다"가 되기 때문이다.
  const notify = useCallback((
    message: string | null | undefined,
    kind: LogEntry['kind'] = 'info',
    important = kind === 'raid',
  ) => {
    if (!message) return;
    addLog(stateRef.current, message, kind, important);
    actionNoticeStore.push(
      message,
      kind === 'bad' || kind === 'raid' ? 'bad' : kind === 'good' ? 'good' : 'info',
    );
  }, [actionNoticeStore]);

  useEffect(() => () => actionNoticeStore.clear(), [actionNoticeStore]);

  // 전투 시뮬레이션 모드: 샌드박스 상태에서 전술 전투만 테스트, 끝나면 메뉴로 복귀
  const [simMode, setSimMode] = useState(launch.kind === 'battleSimulation');
  // 새로 여는 마을(일반·길잡이 모두)은 멈춘 채로 시작한다 — 첫 화면을 둘러보고
  // 사람에게 일을 맡긴 뒤에 스스로 ▶를 눌러 시간을 흐르게 한다. 불러온 저장은 종전대로 1배속.
  const [speed, setSpeed] = useState(launch.kind === 'loaded' ? 1 : 0);
  const speedRef = useRef(speed);
  speedRef.current = speed;
  const nightAutoSpeedStateRef = useRef(createNightAutoSpeedState());
  const [placingType, setPlacingType] = useState<BuildingTypeId | null>(null);
  const [pastureStableId, setPastureStableId] = useState<number | null>(null);
  const [expandingBuildingId, setExpandingBuildingId] = useState<number | null>(null);
  const [relocatingBuildingId, setRelocatingBuildingId] = useState<number | null>(null);
  const [placingFishingBoatFromBoatyardId, setPlacingFishingBoatFromBoatyardId] = useState<number | null>(null);
  // 개간 동의를 기다리는 공사 지정 — 수락하면 confirm이 같은 배치를 다시 실행한다
  const [clearingRequest, setClearingRequest] = useState<
    { title: string; trees: number; detail: string; confirm: () => void } | null
  >(null);
  const [royalPlaqueRequest, setRoyalPlaqueRequest] = useState<
    { buildingId: number; buildingName: string } | null
  >(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [canLoad, setCanLoad] = useState(hasAnySave());
  // 저장 슬롯 다이얼로그: null이면 닫힘, 아니면 저장/불러오기 모드
  const [slotDialogMode, setSlotDialogMode] = useState<'save' | 'load' | null>(null);
  const [inspResidentId, setInspResidentId] = useState<number | null>(null);
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(() => loadUiPrefs());
  const [gameMenuView, setGameMenuView] = useState<'main' | 'settings' | 'feedback' | null>(null);
  const lastPlayingSpeedRef = useRef(1);
  const menuRestoreSpeedRef = useRef(1);
  const [openDockWindowIds, setOpenDockWindowIds] = useState<readonly DockWindowId[]>(
    () => [...uiPrefs.pinnedDockWindows],
  );
  const [floatingWindowOrder, setFloatingWindowOrder] = useState<readonly FloatingWindowId[]>(
    () => ['minimap', ...uiPrefs.pinnedDockWindows],
  );
  const [weaponDialogOpen, setWeaponDialogOpen] = useState(false);
  const [edictDialogOpen, setEdictDialogOpen] = useState(false);
  const [chronicleOpen, setChronicleOpen] = useState(false);
  const [winterChecklistOpen, setWinterChecklistOpen] = useState(false);
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  // 개발용 치트 패널 (백틱 토글). 프로덕션 빌드에서는 DebugCheatPanel 자체가 null이라 열리지 않는다.
  const [debugPanelOpen, setDebugPanelOpen] = useState(false);
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

  const setUserSpeed = useCallback((nextSpeed: number) => {
    // 튜토리얼 0단계(배속 조작) 달성 플래그 — 이미 그 배속이어도 누른 것은 누른 것이다.
    // 이제 게임이 정지 상태로 시작하므로 ▶ 누르기가 첫 자연 동작이지만,
    // 멈춘 채로 ⏸을 다시 누르는 손도 배속을 다룬 것이라 조기 반환 앞에서 표시한다.
    // 야간 자동 가속은 setSpeed를 직접 쓰므로 이 경로를 타지 않는다.
    markScenarioFlag(stateRef.current, 'speedChanged');
    if (nextSpeed === speedRef.current) return;
    markNightSpeedOverride(nightAutoSpeedStateRef.current, stateRef.current);
    setSpeed(nextSpeed);
  }, []);

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
    recordRuntimePerf('react-tree-render-commit', appRenderStartedAt, completedAt - appRenderStartedAt, { screen: 'game' });
    appLayoutCompletedAtRef.current = completedAt;
  });

  useEffect(() => {
    const layoutCompletedAt = appLayoutCompletedAtRef.current;
    const probe = window.__runtimePerf;
    if (probe?.active && layoutCompletedAt >= probe.startedAt) {
      recordRuntimePerf('react-tree-passive-effects', layoutCompletedAt, performance.now() - layoutCompletedAt, { screen: 'game' });
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
        screen: 'game',
      });
    }
  });

  const state = stateRef.current;
  const royalPlaqueModalConflict = Boolean(
    clearingRequest || gameMenuView != null || slotDialogMode != null ||
    weaponDialogOpen || edictDialogOpen || expeditionMusterRequest != null ||
    state.pendingChoice || state.pendingPromotionNotice || state.battle || state.tacticalBattle ||
    state.tacticalBattleReport || state.gameOver,
  );
  useEffect(() => {
    if (royalPlaqueRequest && royalPlaqueModalConflict) setRoyalPlaqueRequest(null);
  }, [royalPlaqueRequest, royalPlaqueModalConflict]);
  const musicScene = state.tacticalBattle || state.tacticalBattleReport || state.battle
    ? 'battle'
    : 'simulation';

  useEffect(() => {
    setMusicScene(musicScene);
  }, [musicScene]);

  useEffect(() => {
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
  }, []);

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
      tannery: (id: number, product: TanneryProductId) => setTanneryProduct(stateRef.current, id, product),
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

  // ── 게임 루프: 서브틱 단위로 진행해 주민 이동이 보이게 한다 ──
  useEffect(() => {
    if (speed === 0) return;
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
  }, [speed, runtimeVersionStore, uiVersionStore]);

  const openGameMenu = useCallback(() => {
    if (speed > 0) lastPlayingSpeedRef.current = speed;
    menuRestoreSpeedRef.current = speed;
    setSpeed(0);
    setGameMenuView('main');
  }, [speed]);

  const closeGameMenu = useCallback(() => {
    setGameMenuView(null);
    setSpeed(menuRestoreSpeedRef.current);
  }, []);

  // 나무를 낀 자리는 곧바로 짓지 않고 개간 동의를 먼저 받는다. attempt는 다른 검사를
  // 모두 통과했을 때만 개간 표식을 돌려주므로, 모달은 "짓기는 가능한 자리"에만 뜬다.
  const commitPlacement = (
    attempt: (approveClearing: boolean) => string | null,
    describe: () => { title: string; trees: number; detail: string },
    onPlaced: () => void,
  ) => {
    const err = attempt(false);
    if (err === CLEARING_APPROVAL_REQUIRED) {
      setClearingRequest({
        ...describe(),
        confirm: () => {
          const retryError = attempt(true);
          if (retryError) notify(retryError, 'bad');
          else {
            playSfx('hammer');
            onPlaced();
          }
          bump();
        },
      });
      return;
    }
    if (err) notify(err, 'bad');
    else {
      playSfx('hammer');
      onPlaced();
    }
    bump();
  };

  const handlePlacePlot = (x: number, y: number, w: number, h: number) => {
    if (expandingBuildingId != null) {
      const buildingId = expandingBuildingId;
      const building = stateRef.current.buildings.find(candidate => candidate.id === buildingId);
      commitPlacement(
        approveClearing =>
          expandAreaBuilding(stateRef.current, buildingId, x, y, w, h, { approveClearing }),
        () => ({
          title: `${building ? BUILDING_DEFS[building.type].name : '건물'} 영역 확장`,
          trees: building
            ? forestTilesInArea(stateRef.current, building.type, { x, y, w, h }).length
            : 0,
          detail: '벌목 우선도는 건설 우선도를 따릅니다.',
        }),
        () => setExpandingBuildingId(null),
      );
      return;
    }
    if (!placingType) return;
    const type = placingType;
    if (isSolidWallBuilding(type)) {
      const endX = x + w - 1;
      const endY = y + h - 1;
      const lineTiles = Array.from({ length: h }, (_, dy) =>
        Array.from({ length: w }, (__, dx) => stateRef.current.map[y + dy]?.[x + dx]).filter(Boolean),
      ).flat();
      commitPlacement(
        approveClearing => tryPlaceWallLine(stateRef.current, type, x, y, endX, endY, { approveClearing }),
        () => ({
          title: `${BUILDING_DEFS[type].name} ${w * h}구간 건설`,
          trees: lineTiles.filter(tile => tile?.terrain === 'forest').length,
          detail: '전체 구간을 함께 승인하며, 공사터 벌목은 벌목장 작업영역과 관계없이 먼저 처리됩니다.',
        }),
        // 성벽은 구간을 이어 두르는 경우가 많으므로 성공 뒤에도 배치 모드를 유지한다.
        // 우클릭/ESC 또는 건설 목록에서 다른 항목을 고를 때만 기존 취소 경로로 빠진다.
        () => undefined,
      );
      return;
    }
    commitPlacement(
      approveClearing => tryPlaceBuilding(stateRef.current, type, x, y, w, h, { approveClearing }),
      () => ({
        title: `${BUILDING_DEFS[type].name} 건설`,
        trees: forestTilesInFootprint(stateRef.current, type, x, y, w, h).length,
        detail: '벌목 우선도는 건설 우선도를 따릅니다.',
      }),
      () => setPlacingType(null),
    );
  };

  const handlePlacePasture = (x: number, y: number, w: number, h: number) => {
    if (pastureStableId == null) return;
    const stable = stateRef.current.buildings.find(building => building.id === pastureStableId);
    const err = stable?.pasture
      ? expandAreaBuilding(stateRef.current, pastureStableId, x, y, w, h)
      : defineStablePasture(stateRef.current, pastureStableId, x, y, w, h);
    if (err) notify(err, 'bad');
    else setPastureStableId(null);
    bump();
  };

  const handleTileClick = (x: number, y: number, localX: number, localY: number) => {
    if (pastureStableId != null || expandingBuildingId != null || relocatingBuildingId != null) return;
    if (placingType) {
      const type = placingType;
      if (type === 'gate') {
        const buildingId = stateRef.current.map[y]?.[x]?.buildingId;
        const err = startGateConversion(stateRef.current, buildingId ?? -1);
        if (err) notify(err, 'bad');
        else {
          playSfx('hammer');
          setPlacingType(null);
        }
        bump();
        return;
      }
      const leveeEdge = type === 'levee'
        ? preferredLeveeEdgeAt(stateRef.current, x, y, localX, localY) ?? undefined
        : undefined;
      commitPlacement(
        approveClearing => tryPlaceBuilding(
          stateRef.current,
          type,
          x,
          y,
          undefined,
          undefined,
          { approveClearing, leveeEdge },
        ),
        () => ({
          title: `${BUILDING_DEFS[type].name} 건설`,
          trees: forestTilesInFootprint(stateRef.current, type, x, y).length,
          detail: '벌목 우선도는 건설 우선도를 따릅니다.',
        }),
        () => setPlacingType(null),
      );
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

  const handleSetResidentJobs = (residentIds: readonly number[], job: JobId) => {
    for (const residentId of residentIds) setResidentJob(stateRef.current, residentId, job);
    bump();
  };

  const handleReassignJob = (from: JobId, to: JobId) => {
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
    if (error) notify(error, 'info');
    bump();
  };

  const handleAppointConfinedSpecialResident = (id: SpecialResidentId) => {
    appointConfinedSpecialResident(stateRef.current, id);
    bump();
  };

  const handleToggleResidentCart = (id: number) => {
    const err = toggleResidentCart(stateRef.current, id);
    if (err) notify(err, 'info');
    bump();
  };

  const refreshWeaponDefense = () => {
    stateRef.current.resources.defense = computeDefense(stateRef.current);
    bump();
  };

  const handleSetResidentWeapon = (id: number, weapon: CombatWeaponId | null) => {
    const error = setResidentWeapon(stateRef.current, id, weapon);
    if (error) notify(error, 'info');
    refreshWeaponDefense();
  };

  const handleSetResidentMount = (id: number, mount: MountId | null) => {
    const error = setResidentMount(stateRef.current, id, mount);
    if (error) notify(error, 'info');
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
    if (err) notify(err, 'info');
    bump();
  };

  const handleSetTanneryProduct = (buildingId: number, product: TanneryProductId) => {
    const err = setTanneryProduct(stateRef.current, buildingId, product);
    if (err) notify(err, 'info');
    bump();
  };

  const handleSetDryingProduct = (buildingId: number, product: DryingProductId) => {
    const err = setDryingProduct(stateRef.current, buildingId, product);
    if (err) notify(err, 'info');
    bump();
  };

  const handleSetLivestockSpecies = (buildingId: number, species: LivestockId) => {
    const err = setLivestockSpecies(stateRef.current, buildingId, species);
    if (err) notify(err, 'info');
    bump();
  };

  const handleSlaughterLivestock = (buildingId: number, amount: number) => {
    const err = slaughterLivestock(stateRef.current, buildingId, amount);
    if (err) notify(err, 'info');
    bump();
  };

  const handleDefinePasture = (buildingId: number) => {
    const stable = stateRef.current.buildings.find(building =>
      building.id === buildingId && building.type === 'stable' && building.built);
    if (!stable) {
      notify('완공된 축사를 선택해야 합니다.', 'info');
      bump();
      return;
    }
    setPlacingType(null);
    setExpandingBuildingId(null);
    setRelocatingBuildingId(null);
    setPastureStableId(buildingId);
  };

  const handleExpandArea = (buildingId: number) => {
    const building = stateRef.current.buildings.find(candidate => candidate.id === buildingId && candidate.built);
    if (!building || (!['field', 'paddy', 'cemetery', 'stable'].includes(building.type))) {
      notify('확장할 수 있는 완공 건물을 선택해야 합니다.', 'info');
      bump();
      return;
    }
    if (building.expansion) {
      notify('이미 확장 공사 중입니다.', 'info');
      bump();
      return;
    }
    setPlacingType(null);
    setRelocatingBuildingId(null);
    if (building.type === 'stable') {
      if (!building.pasture) {
        handleDefinePasture(buildingId);
        return;
      }
      setExpandingBuildingId(null);
      setPastureStableId(buildingId);
    } else {
      setPastureStableId(null);
      setExpandingBuildingId(buildingId);
    }
  };

  const handleAdjustGatheringArea = (
    buildingId: number,
    deltaX: number,
    deltaY: number,
    deltaRadius: number,
  ) => {
    const err = adjustGatheringWorkArea(stateRef.current, buildingId, deltaX, deltaY, deltaRadius);
    if (err) notify(err, 'info');
    bump();
  };

  const handleStartBuildingDemolition = (buildingId: number) => {
    const building = stateRef.current.buildings.find(candidate => candidate.id === buildingId);
    if (!building) return;
    if (stateRef.current.royalPlaqueBuildingId === buildingId) {
      notify('왕이 내린 사액 현판이 걸린 건물은 해체할 수 없습니다.', 'bad');
      bump();
      return;
    }
    if (!window.confirm(`${withJosa(BUILDING_DEFS[building.type].name, '을/를')} 해체할까요? 건축가가 작업을 마치면 자재 일부만 돌아옵니다.`)) return;
    const err = startBuildingDemolition(stateRef.current, buildingId);
    if (err) notify(err, 'bad');
    else playSfx('hammer');
    bump();
  };

  const handleStartBreachedWallRepair = (buildingId: number) => {
    const err = startBreachedWallRepair(stateRef.current, buildingId);
    if (err) notify(err, 'bad');
    else playSfx('hammer');
    bump();
  };

  const handleBeginBuildingRelocation = (buildingId: number) => {
    const building = stateRef.current.buildings.find(candidate =>
      candidate.id === buildingId && candidate.built && candidate.type !== 'center');
    if (!building) {
      notify('이전할 수 있는 완공 건물을 선택해야 합니다.', 'bad');
      bump();
      return;
    }
    if (stateRef.current.royalPlaqueBuildingId === buildingId) {
      notify('왕이 내린 사액 현판이 걸린 건물은 이전할 수 없습니다.', 'bad');
      bump();
      return;
    }
    setPlacingType(null);
    setPastureStableId(null);
    setExpandingBuildingId(null);
    setRelocatingBuildingId(buildingId);
  };

  const handleRequestRoyalPlaqueInstallation = (buildingId: number) => {
    const current = stateRef.current;
    if (
      clearingRequest || royalPlaqueRequest || gameMenuView != null || slotDialogMode != null ||
      weaponDialogOpen || edictDialogOpen || expeditionMusterRequest != null ||
      current.pendingChoice || current.pendingPromotionNotice || current.battle || current.tacticalBattle ||
      current.tacticalBattleReport || current.gameOver
    ) {
      notify('다른 선택이나 확인을 마친 뒤 사액 현판을 설치하십시오.', 'info');
      return;
    }
    const error = royalPlaqueInstallError(current, buildingId);
    if (error) {
      notify(error, 'bad');
      bump();
      return;
    }
    const building = current.buildings.find(candidate => candidate.id === buildingId);
    if (!building) return;
    setRoyalPlaqueRequest({
      buildingId,
      buildingName: BUILDING_DEFS[building.type].name,
    });
  };

  const handleConfirmRoyalPlaqueInstallation = () => {
    const request = royalPlaqueRequest;
    setRoyalPlaqueRequest(null);
    if (!request) return;
    const error = installRoyalPlaque(stateRef.current, request.buildingId);
    if (error) {
      notify(error, 'bad');
    } else {
      addLog(
        stateRef.current,
        `${request.buildingName}에 사액 현판을 걸었습니다. 이제 이 건물은 이전하거나 해체할 수 없습니다.`,
        'good',
        true,
      );
      notify(`${request.buildingName}에 사액 현판을 영구 귀속했습니다.`, 'good');
    }
    bump();
  };

  const handleSetResidentArtifactWeapon = (id: number, item: ArtifactWeaponId | null) => {
    const error = setResidentArtifactWeapon(stateRef.current, id, item);
    if (error) notify(error, 'info');
    refreshWeaponDefense();
  };

  const handlePlaceBuildingRelocation = (x: number, y: number) => {
    if (relocatingBuildingId == null) return;
    const buildingId = relocatingBuildingId;
    const building = stateRef.current.buildings.find(candidate => candidate.id === buildingId);
    commitPlacement(
      approveClearing => startBuildingRelocation(stateRef.current, buildingId, x, y, { approveClearing }),
      () => {
        const dims = building ? buildingFootprintDims(building) : { w: 1, h: 1 };
        return {
          title: `${building ? BUILDING_DEFS[building.type].name : '건물'} 이전`,
          trees: building
            ? forestTilesInFootprint(stateRef.current, building.type, x, y, dims.w, dims.h).length
            : 0,
          detail: '건축가가 해체하는 동안 벌목꾼이 새 자리를 먼저 치웁니다.',
        };
      },
      () => setRelocatingBuildingId(null),
    );
  };

  const handleTogglePriorityBuilding = (buildingId: number) => {
    const building = stateRef.current.buildings.find(candidate => candidate.id === buildingId);
    if (!building || !buildingHasActiveWork(building)) return;
    const err = togglePriorityBuilding(stateRef.current, buildingId);
    if (err) notify(err, 'bad');
    bump();
  };

  const handleSetBuildingCrop = (buildingId: number, cropId: CropId, mode: 'queue' | 'uproot') => {
    const err = setBuildingCrop(stateRef.current, buildingId, cropId, mode);
    if (err) notify(err, 'info');
    bump();
  };

  const handleConvertFieldToPaddy = (buildingId: number) => {
    const err = convertFieldToPaddy(stateRef.current, buildingId);
    if (err) notify(err, 'info');
    else playSfx('hammer');
    bump();
  };

  const handleSetPlotPlowOxen = (buildingId: number, count: number) => {
    const err = assignPlotPlowOxen(stateRef.current, buildingId, count);
    if (err) notify(err, 'info');
    bump();
  };

  const handleUpgradeHousing = (buildingId: number, targetType: Extract<BuildingTypeId, 'ondol' | 'tileHouse'>) => {
    const err = upgradeHousingBuilding(stateRef.current, buildingId, targetType);
    if (err) notify(err, 'info');
    bump();
  };

  const handleUpgradeCenter = (buildingId: number) => {
    const err = upgradeSettlementCenter(stateRef.current, buildingId);
    if (err) notify(err, 'info');
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
    if (err) notify(err, 'info');
    bump();
  };

  const handleUnassignWorker = (residentId: number) => {
    unassignResidentFromBuilding(stateRef.current, residentId);
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
        notify('토벌대가 향할 활성 짐승 서식지가 없습니다.', 'info', true);
      }
    }
    bump();
  };

  const handleStartFishingBoatConstruction = (boatyardId: number) => {
    const slots = fishingBoatConstructionSlots(stateRef.current, boatyardId);
    if (slots.length === 0) {
      notify('같은 수역의 포구에 빈 계류 자리가 없거나 배무이터가 다른 작업 중입니다.', 'bad');
      return;
    }
    setPlacingType(null);
    setPastureStableId(null);
    setExpandingBuildingId(null);
    setRelocatingBuildingId(null);
    setPlacingFishingBoatFromBoatyardId(boatyardId);
    notify('포구 계류장 양옆의 빈 자리 중 하나를 선택하십시오.', 'info');
  };

  const handlePlaceFishingBoat = (portId: number, slot: 0 | 1) => {
    if (placingFishingBoatFromBoatyardId == null) return;
    const boatyardId = placingFishingBoatFromBoatyardId;
    const nextBoatId = stateRef.current.nextFishingBoatId;
    const err = startFishingBoatConstruction(stateRef.current, boatyardId, portId, slot);
    notify(err ?? '어선 건조를 등록했습니다. 건축가가 배무이터에서 작업합니다.', err ? 'bad' : 'info');
    if (!err) {
      playSfx('hammer');
      setPlacingFishingBoatFromBoatyardId(null);
      setSelected(null);
      setSelectedEntity({ kind: 'fishingBoat', id: nextBoatId });
      setInspResidentId(null);
    }
    bump();
  };

  const handleAssignNearestFishingBoatCrew = (boatId: number) => {
    const err = assignNearestFisherToFishingBoat(stateRef.current, boatId);
    notify(err ?? '어선에 가장 가까운 어부를 배정했습니다.', err ? 'bad' : 'info');
    bump();
  };

  const handleUnassignFishingBoatCrew = (boatId: number, residentId: number) => {
    const err = unassignFisherFromFishingBoat(stateRef.current, boatId, residentId);
    if (err) notify(err, 'bad');
    bump();
  };

  const handleStartFishingBoatRepair = (boatyardId: number, boatId: number) => {
    const err = startFishingBoatRepair(stateRef.current, boatyardId, boatId);
    notify(err ?? `어선 #${boatId} 본수리를 시작했습니다.`, err ? 'bad' : 'info');
    if (!err) playSfx('hammer');
    bump();
  };

  const handleSiegeStance = (stance: import('./game/types').SiegeStance) => {
    const error = changeSiegeStance(stateRef.current, stance);
    if (error) notify(error, 'info', true);
    else if (stance === 'field') setSpeed(1);
    bump();
  };

  const handleUseSpecialItem = (item: SpecialItemId) => {
    if (item !== 'reliefGrainVoucher' && item !== 'tributeWaiverDecree' && item !== 'recruitmentNotice') return;
    const error = useSpecialItem(stateRef.current, item);
    if (error) notify(error, 'info');
    else playSfx('good');
    bump();
  };

  const handleCancelBuildingConstruction = (buildingId: number) => {
    const err = cancelBuildingConstruction(stateRef.current, buildingId);
    if (err) {
      notify(err, 'info');
    } else {
      playSfx('hammer');
      setSelected(null);
      setSelectedEntity(null);
    }
    bump();
  };

  const handleTacticalAction = (action: () => string | null): string | null => {
    const error = action();
    if (error) notify(error, 'info');
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
    setSimMode(false);
    onReturnToMenu('battleSim');
  };

  const handleContinueAfterVictory = () => {
    continueAfterVictory(stateRef.current);
    bump();
  };

  // 세력 탭/장터 타일에서 해당 세력의 전용 협상창을 연다.
  const handleRequestTrade = (factionName: string) => {
    const err = requestTrade(stateRef.current, factionName);
    if (err) notify(err, 'info');
    bump();
  };

  const handleOpenGiftEnvoy = (factionName: string) => {
    const err = openGiftEnvoy(stateRef.current, factionName);
    if (err) notify(err, 'info');
    bump();
  };

  const handleOpenPactEnvoy = (factionName: string) => {
    const err = openPactEnvoy(stateRef.current, factionName);
    if (err) notify(err, 'info');
    bump();
  };

  const handleSendGiftEnvoy = (resource: ResourceId, amount: number) => {
    const factionName = stateRef.current.pendingChoice?.kind === 'giftEnvoy'
      ? stateRef.current.pendingChoice.data.factionName as string
      : '';
    const err = sendGiftEnvoy(stateRef.current, factionName, resource, amount);
    if (err) notify(err, 'info');
    else playSfx('good');
    bump();
  };

  const handleCancelGiftEnvoy = () => {
    cancelGiftEnvoy(stateRef.current);
    bump();
  };

  const handleSendPactEnvoy = (resource: ResourceId, amount: number) => {
    const factionName = stateRef.current.pendingChoice?.kind === 'pactEnvoy'
      ? stateRef.current.pendingChoice.data.factionName as string
      : '';
    const err = sendPactEnvoy(stateRef.current, factionName, resource, amount);
    if (err) notify(err, 'info');
    else playSfx('good');
    bump();
  };

  const handleCancelPactEnvoy = () => {
    cancelPactEnvoy(stateRef.current);
    bump();
  };

  const handleOpenClaimAccord = (factionName: string, zoneId: number) => {
    const err = openClaimAccordEnvoy(stateRef.current, factionName, zoneId);
    if (err) notify(err, 'info');
    bump();
  };

  const handleOpenAidRequest = (factionName: string) => {
    const err = openAidRequest(stateRef.current, factionName);
    if (err) notify(err, 'info');
    bump();
  };

  const handleSendClaimAccordEnvoy = (resource: ResourceId, amount: number) => {
    const choice = stateRef.current.pendingChoice;
    const factionName = choice?.kind === 'claimAccordEnvoy' ? choice.data.factionName as string : '';
    const zoneId = choice?.kind === 'claimAccordEnvoy' ? choice.data.zoneId as number : -1;
    const err = sendClaimAccordEnvoy(stateRef.current, factionName, zoneId, resource, amount);
    if (err) notify(err, 'info');
    else playSfx('good');
    bump();
  };

  const handleCancelClaimAccordEnvoy = () => {
    cancelClaimAccordEnvoy(stateRef.current);
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

  // 협상 성사 조건을 그대로 연 단위로 잠근다 — 첫 해분은 그 자리에서 오간다
  const handleSignTradeContract = () => {
    const negotiation = tradeNegotiationOf(stateRef.current.pendingChoice);
    if (!negotiation) return;
    const error = signTradeContract(stateRef.current, negotiation);
    if (error) {
      notify(error, 'info');
      bump();
      return;
    }
    stateRef.current.pendingChoice = null;
    bump();
  };

  const handleSetTributeReserve = (resource: ResourceId, amount: number) => {
    const message = setTributeReserve(stateRef.current, resource, amount);
    if (message) notify(message, 'info');
    bump();
  };

  // 세력 창에서 계약을 중도 해지한다 — 위약으로 우호도가 떨어진다
  const handleCancelTradeContract = (contract: TradeContract) => {
    cancelTradeContract(stateRef.current, contract);
    bump();
  };

  // 장터·부두의 계약고 — 일반 재고 ↔ 계약 이행분
  const handleSetTradeContractReserve = (resource: ResourceId, amount: number) => {
    const message = setTradeContractReserve(stateRef.current, resource, amount);
    if (message) notify(message, 'info');
    bump();
  };

  const handleUseLuxuryGood = (resource: ResourceId) => {
    const error = useLuxuryGood(stateRef.current, resource);
    if (error) notify(error, 'info');
    bump();
  };

  // 조정 탭에서 지원 물자를 청원한다
  const handlePetition = () => {
    const err = requestPetition(stateRef.current);
    if (err) notify(err, 'info');
    bump();
  };

  // 절목 창 — 중심지에서 여는 관리 창. 다른 관리 모달과 같이 시간을 멈춘다.
  const handleOpenEdicts = () => {
    setSpeed(0);
    setEdictDialogOpen(true);
  };

  // 연대기 — 회고 화면. 열람 전용이라 시간만 멈춘다.
  const handleOpenChronicle = () => {
    setSpeed(0);
    setChronicleOpen(true);
  };

  const handleOpenRenameDialog = () => {
    setSpeed(0);
    setRenameDialogOpen(true);
  };

  // 겨울 점검 — 길잡이 9단계의 완료 조건(checklistOpened)이 여기서 서명된다.
  // 이 한 줄이 없으면 9단계가 영영 끝나지 않는다.
  const handleOpenWinterChecklist = () => {
    markScenarioFlag(stateRef.current, 'checklistOpened');
    setSpeed(0);
    setWinterChecklistOpen(true);
    bump();
  };

  const handleDismissGuideCard = (moduleId: string) => {
    dismissGuideCard(stateRef.current, moduleId);
    bump();
  };

  const handleSubmitRename = (name: string) => {
    const error = requestSettlementRename(stateRef.current, name);
    if (error) {
      notify(error, 'bad');
      return;
    }
    setRenameDialogOpen(false);
    bump();
  };

  // 절목 — 중심지에서 령을 반포·변경한다 (막힌 경우 이유를 로그로 알린다)
  const handleSetEdictLevel = (id: EdictId, level: EdictLevel) => {
    const err = setEdictLevel(stateRef.current, id, level);
    if (err) notify(err, 'info');
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
    if (err) notify(err, 'info');
    bump();
  };

  const handleOrganizeHunt = (kind: WildlifeKind) => {
    if (kind !== 'boar') {
      if (!stateRef.current.incidents.predatorThreats[kind]) {
        notify('현재 추적 중인 맹수가 없습니다.', 'info');
        bump();
        return;
      }
      if (!predatorExpeditionTarget(stateRef.current, kind)) {
        notify('토벌대가 향할 활성 짐승 서식지가 없습니다.', 'info');
        bump();
        return;
      }
      setSpeed(0);
      setWeaponDialogOpen(false);
      setExpeditionMusterRequest({ kind: 'predatorHunt', predatorKind: kind });
      return;
    }
    const error = openPredatorHunt(stateRef.current, kind);
    if (error) notify(error, 'info');
    bump();
  };

  const siteActionRng = (siteId: number) => {
    const state = stateRef.current;
    const site = state.foreignSites.find(candidate => candidate.id === siteId);
    return makeRng(state.seed + state.day * 104729 + siteId * 7919 + (site?.memories.length ?? 0) * 131);
  };

  const handleSiteAction = (action: () => string | null) => {
    const error = action();
    if (error) notify(error, 'info', true);
    bump();
  };

  const handleSendSiteGift = (siteId: number, gift: SiteGiftType) =>
    handleSiteAction(() => sendGiftToSite(stateRef.current, siteId, gift));
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
      notify(error, 'info', true);
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
    if (error) notify(error, 'info', true);
    bump();
  };

  const handleScoutPredator = (kind: PredatorKind, residentId: number) => {
    const error = startPredatorScout(stateRef.current, kind, residentId);
    if (error) notify(error, 'info', true);
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
      notify(error, 'info', true);
    } else {
      stateRef.current.resources.defense = computeDefense(stateRef.current);
      setExpeditionMusterRequest(null);
    }
    bump();
    return error;
  };

  const handleSaveToSlot = (slot: number) => {
    if (saveGame(stateRef.current, slot)) {
      notify(`${slot}번 슬롯에 진행 상황을 저장했습니다.`, 'info');
      setCanLoad(true);
    } else {
      notify('저장에 실패했습니다.', 'bad');
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
    notify(`${slot}번 슬롯의 진행 상황을 불러왔습니다.`, 'info');
    setSelected(null);
    setSelectedEntity(null);
    setPlacingType(null);
    setPastureStableId(null);
    setInspResidentId(null);
    setWeaponDialogOpen(false);
    setExpeditionMusterRequest(null);
    setSlotDialogMode(null);
    setGameMenuView(null);
    setSpeed(1);
    lastPlayingSpeedRef.current = 1;
    menuRestoreSpeedRef.current = 1;
    bump();
  };

  const handleResidentClick = (id: number) => {
    setSelected(null);
    setSelectedEntity({ kind: 'resident', id });
    setInspResidentId(id);
    // 튜토리얼 1스텝(주민 선택) 달성 플래그
    if (stateRef.current.scenario) markScenarioFlag(stateRef.current, 'residentSelected');
  };

  const handleFishingBoatClick = (id: number) => {
    setSelected(null);
    setSelectedEntity({ kind: 'fishingBoat', id });
    setInspResidentId(null);
  };

  const handleClearSelection = useCallback(() => {
    setSelected(null);
    setSelectedEntity(null);
    setInspResidentId(null);
    setPastureStableId(null);
    setPlacingFishingBoatFromBoatyardId(null);
  }, []);

  const handleSelectResidentFromDock = (id: number) => {
    const resident = stateRef.current.residents.find(candidate => candidate.id === id && candidate.alive);
    if (!resident) return;
    handleResidentClick(id);
    const viewport = mapViewportRef.current;
    if (viewport) centerViewportOnTile(viewport, resident.x, resident.y);
  };

  const handleFocusBuilding = useCallback((buildingId: number) => {
    const building = stateRef.current.buildings.find(candidate => candidate.id === buildingId);
    if (!building) return;
    setPlacingType(null);
    setPastureStableId(null);
    setExpandingBuildingId(null);
    setRelocatingBuildingId(null);
    setSelected({ x: building.x, y: building.y });
    setSelectedEntity({ kind: 'building', id: building.id });
    setInspResidentId(null);
    const viewport = mapViewportRef.current;
    if (viewport) {
      const dims = buildingFootprintDims(building);
      centerViewportOnTile(
        viewport,
        building.x + (dims.w - 1) / 2,
        building.y + (dims.h - 1) / 2,
      );
    }
  }, []);

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

  // 튜토리얼 1단계·10단계 — 직업 배정 창과 조정 창을 실제로 연 순간을 기록한다.
  // 여는 길이 여럿(독 아이콘·단축키·세공 칩·고정 창 복원)이라 열린 목록 자체를 본다.
  // (courtWindowOpened는 R4에서 잠시 걷었다가, R5에서 세공 파발이 스텝으로 돌아오며 되살렸다)
  useEffect(() => {
    const runtimeState = stateRef.current;
    if (openDockWindowIds.includes('jobs')) markScenarioFlag(runtimeState, 'jobPanelOpened');
    if (openDockWindowIds.includes('court')) markScenarioFlag(runtimeState, 'courtWindowOpened');
    // 세력 창 첫 열람 — 초회 도움말(카드). 시나리오 중에는 guides가 스스로 물러난다.
    if (openDockWindowIds.includes('factions') && openGuideOnce(runtimeState, 'diplomacy')) bump();
  }, [bump, openDockWindowIds]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;

      if (event.key === 'Escape') {
        event.preventDefault();
        if (slotDialogMode) {
          setSlotDialogMode(null);
        } else if (gameMenuView === 'settings' || gameMenuView === 'feedback') {
          setGameMenuView('main');
        } else if (gameMenuView === 'main') {
          closeGameMenu();
        } else if (placingFishingBoatFromBoatyardId != null) {
          setPlacingFishingBoatFromBoatyardId(null);
        } else if (placingType) {
          setPlacingType(null);
        } else if (weaponDialogOpen) {
          setWeaponDialogOpen(false);
        } else if (edictDialogOpen) {
          setEdictDialogOpen(false);
        } else if (expeditionMusterRequest) {
          setExpeditionMusterRequest(null);
        } else {
          openGameMenu();
        }
        return;
      }

      if (isEditableTarget(event.target)) return;

      // 백틱 — 개발용 치트 패널 토글. 모달·전투 중에도 열 수 있게 다른 게이트보다 앞에 둔다
      // (파괴적 조작은 패널 안에서 잠기고 사유가 표시된다).
      if (DebugCheatPanel && event.code === 'Backquote') {
        event.preventDefault();
        setDebugPanelOpen(open => !open);
        return;
      }

      if (slotDialogMode || gameMenuView ||
          weaponDialogOpen || edictDialogOpen || expeditionMusterRequest) return;
      const runtimeState = stateRef.current;
      if (runtimeState.pendingChoice || runtimeState.pendingPromotionNotice || runtimeState.tacticalBattle || runtimeState.tacticalBattleReport || runtimeState.gameOver) return;

      if (event.code === 'Space') {
        event.preventDefault();
        setUserSpeed(speedRef.current === 0 ? lastPlayingSpeedRef.current || 1 : 0);
        return;
      }
      const shortcutSpeed = speedForHotkey(event.code);
      if (shortcutSpeed != null) {
        event.preventDefault();
        setUserSpeed(shortcutSpeed);
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
    closeGameMenu, edictDialogOpen, expeditionMusterRequest, gameMenuView, openGameMenu, placingFishingBoatFromBoatyardId, placingType,
    setUserSpeed, slotDialogMode, toggleDockWindow, weaponDialogOpen,
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

    if (err) notify(err, action.kind === 'invalid' ? 'info' : 'bad');
    bump();
  };

  // ESC 게임 메뉴의 "새 게임" → 타이틀의 난이도 선택으로
  const handleNewGame = () => {
    if (!window.confirm('메인 메뉴로 돌아갈까요? 저장하지 않은 진행은 사라집니다.')) return;
    setGameMenuView(null);
    setSlotDialogMode(null);
    onReturnToMenu('main');
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

  const overlayItems: DockOverlayItem[] = [
    {
      id: 'minimap',
      label: '미니맵',
      className: 'hud-minimap-window',
      content: (
        <div className="minimap-with-layers">
          <MapLayerTabs
            attachedToMinimap
            showAquifer={uiPrefs.showAquiferLayer || placingType === 'well'}
            showOre={uiPrefs.showOreLayer || placingType === 'deepMine'}
            aquiferAutomatic={placingType === 'well'}
            oreAutomatic={placingType === 'deepMine'}
            onToggleAquifer={() => {
              // 튜토리얼 4단계(수맥 탭) 달성 플래그 — 우물 배치 중 자동 표시는 해당하지 않는다
              markScenarioFlag(stateRef.current, 'aquiferToggled');
              setUiPrefs(current => setMapLayerVisibility(current, 'aquifer', !current.showAquiferLayer));
            }}
            onToggleOre={() => {
              // 튜토리얼 13단계(광맥 탭) 달성 플래그 — 갱도 배치 중 자동 표시는 해당하지 않는다
              markScenarioFlag(stateRef.current, 'oreToggled');
              setUiPrefs(current => setMapLayerVisibility(current, 'ore', !current.showOreLayer));
            }}
          />
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
                      selectedBuildingId={selectedEntity?.kind === 'building' ? selectedEntity.id : null}
                      onFocusBuilding={handleFocusBuilding}
                      // 튜토리얼 0단계(미니맵으로 시점 옮기기) 달성 플래그
                      onNavigate={() => markScenarioFlag(stateRef.current, 'minimapClicked')}
                    />
                  );
                }}
              </RuntimeVersionBoundary>
            </Profiler>
          </div>
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
              onSetTanneryProduct={handleSetTanneryProduct}
              onSetDryingProduct={handleSetDryingProduct}
              onSetLivestockSpecies={handleSetLivestockSpecies}
              onSlaughterLivestock={handleSlaughterLivestock}
              onStartFishingBoatConstruction={handleStartFishingBoatConstruction}
              onStartFishingBoatRepair={handleStartFishingBoatRepair}
              onAssignNearestFishingBoatCrew={handleAssignNearestFishingBoatCrew}
              onUnassignFishingBoatCrew={handleUnassignFishingBoatCrew}
              onDefinePasture={handleDefinePasture}
              onExpandArea={handleExpandArea}
              onStartBuildingDemolition={handleStartBuildingDemolition}
              onStartBreachedWallRepair={handleStartBreachedWallRepair}
              onBeginBuildingRelocation={handleBeginBuildingRelocation}
              onRequestRoyalPlaqueInstallation={handleRequestRoyalPlaqueInstallation}
              onTogglePriorityBuilding={handleTogglePriorityBuilding}
              onSetBuildingCrop={handleSetBuildingCrop}
              onConvertFieldToPaddy={handleConvertFieldToPaddy}
              onSetPlotPlowOxen={handleSetPlotPlowOxen}
              onRequestTrade={handleRequestTrade}
              onSetTradeContractReserve={handleSetTradeContractReserve}
              onOpenEdicts={handleOpenEdicts}
              onOpenChronicle={handleOpenChronicle}
              onRequestSettlementRename={handleOpenRenameDialog}
              onToggleNitre={handleToggleNitre}
              onSilverVeinAction={handleSilverVeinAction}
              onAssignNearestWorker={handleAssignNearestWorker}
              onUnassignWorker={handleUnassignWorker}
              onSelectResident={handleResidentClick}
              onCancelBuildingConstruction={handleCancelBuildingConstruction}
              onAdjustGatheringArea={handleAdjustGatheringArea}
              onSendSiteGift={handleSendSiteGift}
              onOpenClaimAccord={handleOpenClaimAccord}
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
        {() => (
          <RuntimeGameEffects
            state={stateRef.current}
            speed={speed}
            setSpeed={setSpeed}
            autoFastForwardSleepingNight={uiPrefs.autoFastForwardSleepingNight}
            nightAutoSpeedState={nightAutoSpeedStateRef}
            suspended={gameMenuView != null || slotDialogMode != null}
            actionNoticeStore={actionNoticeStore}
          />
        )}
      </RuntimeVersionBoundary>
      <Profiler id="topbar-boundary" onRender={recordAppRender}>
        <RuntimeVersionBoundary store={uiVersionStore}>
          {() => (
            <TopBar
              state={stateRef.current}
              speed={speed}
              setSpeed={setUserSpeed}
              onOpenMenu={openGameMenu}
              uiPrefs={uiPrefs}
              onUiPrefsChange={setUiPrefs}
              onOpenCourt={() => openDockWindow('court')}
              onOpenFactions={() => openDockWindow('factions')}
              onOpenWinterChecklist={handleOpenWinterChecklist}
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
                <SiegePanel state={stateRef.current} onChangeStance={handleSiegeStance} />
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
                    showResidentJobMarkers={uiPrefs.showResidentJobMarkers}
                    showResidentCargoMarkers={uiPrefs.showResidentCargoMarkers}
                    showAquiferLayer={uiPrefs.showAquiferLayer || placingType === 'well'}
                    showOreLayer={uiPrefs.showOreLayer || placingType === 'deepMine'}
                    placingType={placingType}
                    pastureStableId={pastureStableId}
                    expandingBuildingId={expandingBuildingId}
                    relocatingBuildingId={relocatingBuildingId}
                    placingFishingBoatFromBoatyardId={placingFishingBoatFromBoatyardId}
                    selected={selected}
                    selectedEntity={selectedEntity}
                    selectedResidentId={inspResidentId}
                    anim={animRef}
                    onTileClick={handleTileClick}
                    onPlacePlot={handlePlacePlot}
                    onPlacePasture={handlePlacePasture}
                    onPlaceRelocation={handlePlaceBuildingRelocation}
                    onResidentClick={handleResidentClick}
                    onFishingBoatClick={handleFishingBoatClick}
                    onPlaceFishingBoat={handlePlaceFishingBoat}
                    onContextAction={handleContextAction}
                    onCancelPlace={() => {
                      setPlacingType(null);
                      setPastureStableId(null);
                      setExpandingBuildingId(null);
                      setRelocatingBuildingId(null);
                      setPlacingFishingBoatFromBoatyardId(null);
                    }}
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
                setPlacingType={type => {
                  setPastureStableId(null);
                  setExpandingBuildingId(null);
                  setRelocatingBuildingId(null);
                  setPlacingFishingBoatFromBoatyardId(null);
                  setPlacingType(type);
                }}
                onClearSelection={handleClearSelection}
                uiPrefs={uiPrefs}
                onUiPrefsChange={setUiPrefs}
                shortcutsEnabled={!gameMenuView && !slotDialogMode && !weaponDialogOpen && !edictDialogOpen && !expeditionMusterRequest &&
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
                        onReassign={handleReassignJob}
                        onSetResidentJobs={handleSetResidentJobs}
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
                    {() => (
                      <FactionsWindow
                        state={stateRef.current}
                        onRequestTrade={handleRequestTrade}
                        onOpenGiftEnvoy={handleOpenGiftEnvoy}
                        onOpenPactEnvoy={handleOpenPactEnvoy}
                        onOpenClaimAccord={handleOpenClaimAccord}
                        onOpenAidRequest={handleOpenAidRequest}
                        onCancelTradeContract={handleCancelTradeContract}
                      />
                    )}
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
                        onUseSpecialItem={handleUseSpecialItem}
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
            onAssignArtifact={handleSetResidentArtifactWeapon}
            onAssignMount={handleSetResidentMount}
            onAutoAssign={handleAutoAssignWeapons}
            onClear={handleClearWeaponAssignments}
            onClose={() => setWeaponDialogOpen(false)}
          />
        </LazyUiBoundary>
      ) : edictDialogOpen ? (
        <EdictDialog
          state={state}
          onSetEdictLevel={handleSetEdictLevel}
          onClose={() => setEdictDialogOpen(false)}
        />
      ) : state.pendingChoice?.kind === 'giftEnvoy' || state.pendingChoice?.kind === 'pactEnvoy' ? (
        <GiftEnvoyDialog
          state={state}
          onSend={state.pendingChoice.kind === 'pactEnvoy' ? handleSendPactEnvoy : handleSendGiftEnvoy}
          onClose={state.pendingChoice.kind === 'pactEnvoy' ? handleCancelPactEnvoy : handleCancelGiftEnvoy}
        />
      ) : state.pendingChoice?.kind === 'claimAccordEnvoy' ? (
        <ClaimAccordDialog state={state} onSend={handleSendClaimAccordEnvoy} onClose={handleCancelClaimAccordEnvoy} />
      ) : tradeNegotiationOf(state.pendingChoice) ? (
        <TradeDialog
          state={state}
          onNegotiate={handleNegotiateTrade}
          onBuyPredatorIntel={handleBuyPredatorIntel}
          onSignContract={handleSignTradeContract}
          onContractBlocked={reason => notify(reason, 'info')}
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
          residentMarkers={uiPrefs}
          autoFastForwardSleepingNight={uiPrefs.autoFastForwardSleepingNight}
          onChange={update => setUiPrefs(current => setAudioPrefs(current, update))}
          onResidentMarkersChange={update => setUiPrefs(current => setResidentMarkerPrefs(current, update))}
          onAutoFastForwardSleepingNightChange={enabled =>
            setUiPrefs(current => setAutoFastForwardSleepingNight(current, enabled))}
          guidesEnabled={guidesEnabled(stateRef.current)}
          onGuidesEnabledChange={enabled => {
            setGuidesEnabled(stateRef.current, enabled);
            bump();
          }}
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

      {chronicleOpen && (
        <ChronicleScreen state={state} onClose={() => setChronicleOpen(false)} />
      )}
      {renameDialogOpen && (
        <SettlementRenameDialog
          currentName={state.settlementName}
          rank={state.rank}
          onSubmit={handleSubmitRename}
          onClose={() => setRenameDialogOpen(false)}
        />
      )}

      {winterChecklistOpen && (
        <WinterChecklistPanel state={state} onClose={() => setWinterChecklistOpen(false)} />
      )}

      {state.scenario && <TutorialCoach state={state} />}
      <GuideCardLayer cards={guideCards(state)} onDismiss={handleDismissGuideCard} />

      {state.pendingPromotionNotice && state.pendingPromotionNotice !== 'settlement' && (
        <PromotionModal rank={state.pendingPromotionNotice} onAcknowledge={handleAcknowledgePromotion} />
      )}

      {state.gameOver && !chronicleOpen && (
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
            <button className="btn" onClick={() => setChronicleOpen(true)}>연대기 보기</button>
            <button className="btn" onClick={() => onReturnToMenu('main')}>
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
      {royalPlaqueRequest && !royalPlaqueModalConflict && (
        <RoyalPlaqueConfirmDialog
          buildingName={royalPlaqueRequest.buildingName}
          onConfirm={handleConfirmRoyalPlaqueInstallation}
          onCancel={() => setRoyalPlaqueRequest(null)}
        />
      )}
      {clearingRequest && (
        <ClearingConfirmDialog
          title={clearingRequest.title}
          trees={clearingRequest.trees}
          detail={clearingRequest.detail}
          onConfirm={() => {
            const request = clearingRequest;
            setClearingRequest(null);
            request.confirm();
          }}
          onCancel={() => setClearingRequest(null)}
        />
      )}
      {/* 조작 거절 알림은 모달 위에도 보여야 하므로 앱 최상단에 둔다 (클릭은 통과) */}
      <ActionNoticeLayer store={actionNoticeStore} />
      {DebugCheatPanel && debugPanelOpen && (
        <LazyUiBoundary label="디버그 치트" mode="overlay">
          <DebugCheatPanel
            state={state}
            onChanged={bump}
            onClose={() => setDebugPanelOpen(false)}
            aquiferLayer={uiPrefs.showAquiferLayer}
            oreLayer={uiPrefs.showOreLayer}
            onToggleMapLayer={layer => setUiPrefs(current => setMapLayerVisibility(
              current, layer, layer === 'aquifer' ? !current.showAquiferLayer : !current.showOreLayer,
            ))}
          />
        </LazyUiBoundary>
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
