// 최상위 컴포넌트: 게임 상태 보관, 게임 루프, 플레이어 입력 연결
import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from './game/config';
import {
  assignNearestWorkerToBuilding, assignResidentToBuilding,
  advanceDay, advanceTick, autoAssignWorkersToBuildingTypes, cancelBuildingConstruction, continueAfterVictory, demolishBuilding, newGame, reassignJob, resolveChoice, setResidentJob,
  setBuildingCrop, setDryingProduct, setSmithyProduct, issueResidentMoveOrder, issueResidentWorkOrder, upgradeHousingBuilding,
  assignPlotPlowOxen, setLivestockSpecies, slaughterLivestock,
  convertFieldToPaddy, toggleResidentCart,
  unassignResidentFromBuilding, useLuxuryGood, SUBTICKS, tryPlaceBuilding,
} from './game/simulation';
import { clearSave, hasSave, loadGame, saveGame } from './game/saveLoad';
import { addLog, negotiateTrade, requestTrade, tradeNegotiationOf } from './game/events';
import { initAudio, isMuted, playSfx, setMuted, setWeatherAmbient } from './sound/sfx';
import { AlertsPanel } from './components/AlertsPanel';
import { BuildDrawer } from './components/BuildDrawer';
import { DockFrame, type DockOverlayItem } from './components/dock/DockFrame';
import { CourtWindow } from './components/dock/CourtWindow';
import { FactionsWindow } from './components/dock/FactionsWindow';
import { ResidentsWindow } from './components/dock/ResidentsWindow';
import { EventModal } from './components/EventModal';
import { TradeDialog } from './components/TradeDialog';
import { GameCanvas } from './components/GameCanvas';
import { InspectorPanel } from './components/InspectorPanel';
import { JobPanel } from './components/JobPanel';
import { MainMenu } from './components/MainMenu';
import { BattleSimulationSetup } from './components/BattleSimulationSetup';
import { createBattleSimulation, type BattleSimulationOptions } from './game/battleSimulation';
import { centerViewportOnSettlement, centerViewportOnTile, Minimap } from './components/Minimap';
import { ProcessingPanel } from './components/ProcessingPanel';
import { SelectionContextBar } from './components/SelectionContextBar';
import { TopBar } from './components/TopBar';
import { UnifiedLog } from './components/UnifiedLog';
import { TacticalBattleScreen } from './components/TacticalBattleScreen';
import { TacticalBattleReportModal } from './components/TacticalBattleReportModal';
import { WeaponAllocationDialog } from './components/WeaponAllocationDialog';
import {
  ExpeditionMusterDialog, type ExpeditionMusterRequest,
} from './components/ExpeditionMusterDialog';
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
  BuildingTypeId, CombatWeaponId, CropId, Difficulty, DryingProductId, JobId, LivestockId, MountId, ProcessingInputId, ResourceId, SelectedEntity, SmithyProductId,
  PreparationActionId, PredatorKind, SpecialItemId, TacticalCommandId, TacticalFormationLine, WildlifeKind,
} from './game/types';
import {
  loadUiPrefs,
  resetDockWindowLayout,
  saveUiPrefs,
  setDockWindowLayout,
  togglePinnedDockWindow,
  type UiPrefs,
} from './ui/uiPrefs';
import { bringDockWindowToFront } from './ui/dockLayout';
import { advanceGameClock } from './ui/gameClock';
import type { DockWindowId, FloatingWindowId } from './ui/dockPresentation';
import type { AutoAssignBuildingType } from './game/workerSlots';

export default function App() {
  // 게임 상태는 ref에 두고, version 증가로 리렌더를 트리거한다
  const stateRef = useRef(newGame());
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [menuView, setMenuView] = useState<'main' | 'battleSim'>('main');
  // 전투 시뮬레이션 모드: 샌드박스 상태에서 전술 전투만 테스트, 끝나면 메뉴로 복귀
  const [simMode, setSimMode] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [placingType, setPlacingType] = useState<BuildingTypeId | null>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [canLoad, setCanLoad] = useState(hasSave());
  const [inspResidentId, setInspResidentId] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(!isMuted());
  const [uiPrefs, setUiPrefs] = useState<UiPrefs>(() => loadUiPrefs());
  const [openDockWindowIds, setOpenDockWindowIds] = useState<readonly DockWindowId[]>(
    () => [...uiPrefs.pinnedDockWindows],
  );
  const [floatingWindowOrder, setFloatingWindowOrder] = useState<readonly FloatingWindowId[]>(
    () => ['minimap', ...uiPrefs.pinnedDockWindows],
  );
  const [weaponDialogOpen, setWeaponDialogOpen] = useState(false);
  const [expeditionMusterRequest, setExpeditionMusterRequest] = useState<ExpeditionMusterRequest | null>(null);
  // 이동 보간용: 마지막 서브틱 처리 시각과 서브틱 간격
  const animRef = useRef({ at: performance.now(), ms: 175 });
  // 사운드 트리거 추적 (로그 증가분/모달 전환/게임 종료/지도 전투)
  const sndRef = useRef({
    logLen: 0,
    pending: null as string | null,
    over: false,
    battleActive: false,
    battleOutcome: null as 'victory' | 'defeat' | null,
  });

  useEffect(() => {
    saveUiPrefs(uiPrefs);
  }, [uiPrefs]);

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

  const selectionContextVisible = selectedEntity !== null;
  useEffect(() => {
    setFloatingWindowOrder(current => selectionContextVisible
      ? bringDockWindowToFront(current, 'selection')
      : current.filter(id => id !== 'selection'));
  }, [selectionContextVisible]);

  // 브라우저 자동재생 정책: 첫 입력 때 오디오 시작
  useEffect(() => {
    const boot = () => initAudio();
    window.addEventListener('pointerdown', boot, { once: true });
    window.addEventListener('keydown', boot, { once: true });
    return () => {
      window.removeEventListener('pointerdown', boot);
      window.removeEventListener('keydown', boot);
    };
  }, []);

  // 게임 상태 변화 → 효과음/앰비언트 (렌더마다 증가분만 검사)
  useEffect(() => {
    const s = stateRef.current;
    const m = sndRef.current;
    if (s.log.length < m.logLen) m.logLen = s.log.length; // 새 게임/로그 절삭
    if (s.log.length > m.logLen) {
      for (const e of s.log.slice(m.logLen).slice(-3)) {
        if (e.kind === 'good') {
          // 가장 잦은 good 로그들을 소리로 구분한다
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
      m.logLen = s.log.length;
    }
    const pk = s.pendingChoice?.kind ?? null;
    if (pk && pk !== m.pending) {
      playSfx(pk === 'raid' || pk === 'crackdown' ? 'raidHorn' : pk === 'immigration' ? 'welcome' : 'tradeBell');
    }
    m.pending = pk;
    if (s.gameOver && !m.over) playSfx(s.gameOver.won ? 'win' : 'lose');
    m.over = !!s.gameOver;
    // 지도 위 습격 전투: 집결 개시에 북, 종료 시 승리면 뿔나팔·패배면 저음 조종
    if (s.battle && !m.battleActive) playSfx('raidDrum');
    if (!s.battle && m.battleActive && m.battleOutcome) {
      playSfx(m.battleOutcome === 'victory' ? 'raidHorn' : 'death');
    }
    m.battleActive = !!s.battle;
    m.battleOutcome = s.battle?.outcome ?? (s.battle ? m.battleOutcome : null);
    setWeatherAmbient(s.weather);
  });

  const state = stateRef.current;

  // 직접 지휘를 시작하면 기존 배속을 버린다. 전투 종료 뒤 10배속이
  // 갑자기 재개되어 장작 고갈이나 동사 판정이 연달아 진행되는 일을 막는다.
  useEffect(() => {
    if (state.tacticalBattle) setSpeed(0);
  }, [state.tacticalBattle?.id]);

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
          if (s.pendingChoice || s.tacticalBattle || s.tacticalBattleReport) break;
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
      reset: () => { stateRef.current = newGame(); bump(); },
    };
  }, [bump]);

  // ── 게임 루프: 서브틱 단위로 진행해 주민 이동이 보이게 한다 (메뉴 화면에선 정지) ──
  useEffect(() => {
    if (speed === 0 || screen !== 'game') return;
    const msPerDay = CONFIG.time.msPerDay[speed] ?? 1400;
    const msPerTick = msPerDay / SUBTICKS;
    let last = performance.now();
    let acc = 0;
    const timer = setInterval(() => {
      const now = performance.now();
      if (stateRef.current.tacticalBattle || stateRef.current.tacticalBattleReport) {
        last = now;
        acc = 0;
        return;
      }
      const clock = advanceGameClock(acc, now - last, msPerTick, 24); // 탭 복귀 시 폭주 방지
      acc = clock.accumulator;
      last = now;
      let n = clock.ticksToAdvance;
      if (n > 0) {
        const s = stateRef.current;
        const perf = window.__renderPerf;
        const tickStart = perf ? performance.now() : 0;
        let ticksProcessed = 0;
        while (n-- > 0) {
          if (s.pendingChoice || s.tacticalBattle || s.tacticalBattleReport || s.gameOver) break; // 이벤트/전술전/장계/종료 시 자동 정지
          advanceTick(s);
          ticksProcessed++;
        }
        if (perf) {
          const bucket = perf['0-advanceTicks'] ?? (perf['0-advanceTicks'] = { total: 0, count: 0 });
          bucket.total += performance.now() - tickStart;
          bucket.count++;
        }
        if (ticksProcessed > 0) {
          animRef.current = { at: now, ms: msPerTick };
          bump();
        }
      }
    }, 33);
    return () => clearInterval(timer);
  }, [speed, screen, bump]);

  // Esc로 건설 배치 취소
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented) setPlacingType(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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

  const handleToggleSound = () => {
    initAudio();
    const next = !soundOn;
    setSoundOn(next);
    setMuted(!next);
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

  const handleTacticalAction = (action: () => string | null) => {
    const error = action();
    if (error) addLog(stateRef.current, error, 'info');
    bump();
  };

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

  const handleSave = () => {
    if (saveGame(stateRef.current)) {
      addLog(stateRef.current, '진행 상황을 저장했습니다.', 'info');
      setCanLoad(true);
    } else {
      addLog(stateRef.current, '저장에 실패했습니다.', 'bad');
    }
    bump();
  };

  const handleLoad = () => {
    const loaded = loadGame();
    if (loaded) {
      setSimMode(false);
      stateRef.current = loaded;
      addLog(stateRef.current, '저장된 진행 상황을 불러왔습니다.', 'info');
      setSelected(null);
      setSelectedEntity(null);
      setPlacingType(null);
      setInspResidentId(null);
      setWeaponDialogOpen(false);
      setExpeditionMusterRequest(null);
      setScreen('game');
      bump();
    }
  };

  const handleResidentClick = (id: number) => {
    setSelected(null);
    setSelectedEntity({ kind: 'resident', id });
    setInspResidentId(id);
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
  const startNewGame = (difficulty: Difficulty) => {
    setSimMode(false);
    stateRef.current = newGame(undefined, difficulty);
    setSelected(null);
    setSelectedEntity(null);
    setPlacingType(null);
    setInspResidentId(null);
    setWeaponDialogOpen(false);
    setExpeditionMusterRequest(null);
    setSpeed(1);
    setScreen('game');
    bump();
  };

  // 상단 바의 "새 게임" → 메인 메뉴로
  const handleNewGame = () => {
    if (!window.confirm('메인 메뉴로 돌아갈까요? 저장하지 않은 진행은 사라집니다.')) return;
    setScreen('menu');
  };

  const handleClearSave = () => {
    if (!window.confirm('저장 데이터를 삭제할까요?')) return;
    clearSave();
    setCanLoad(false);
  };

  if (screen === 'menu') {
    if (menuView === 'battleSim') {
      return (
        <BattleSimulationSetup
          onStart={startBattleSimulation}
          onBack={() => setMenuView('main')}
        />
      );
    }
    return (
      <MainMenu
        canContinue={canLoad}
        onStart={startNewGame}
        onContinue={handleLoad}
        onOpenBattleSim={() => setMenuView('battleSim')}
      />
    );
  }

  const overlayItems: DockOverlayItem[] = [
    {
      id: 'minimap',
      label: '미니맵',
      className: 'hud-minimap-window',
      content: (
        <div className="minimap-overlay">
          <Minimap state={state} version={version} viewportRef={mapViewportRef} selected={selected} />
        </div>
      ),
    },
    ...(selectedEntity ? [{
      id: 'selection' as const,
      label: '선택 정보',
      className: 'hud-selection-window',
      content: (
        <SelectionContextBar
          state={state}
          selected={selected}
          selectedEntity={selectedEntity}
          onClear={handleClearSelection}
          onSetResidentJob={handleSetResidentJob}
          onToggleResidentCart={handleToggleResidentCart}
          onUpgradeHousing={handleUpgradeHousing}
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
      ),
    }] : []),
  ];

  return (
    <div className="app">
      <TopBar
        state={state}
        speed={speed}
        setSpeed={setSpeed}
        onSave={handleSave}
        onLoad={handleLoad}
        onNewGame={handleNewGame}
        onClearSave={handleClearSave}
        canLoad={canLoad}
        soundOn={soundOn}
        onToggleSound={handleToggleSound}
        uiPrefs={uiPrefs}
        onUiPrefsChange={setUiPrefs}
        onOpenCourt={() => openDockWindow('court')}
      />
      <div className="main">
        <div className="canvas-stage">
          <div className="right-overlay-stack">
            <AlertsPanel state={state} />
          </div>
          <UnifiedLog state={state} />
          <div className="canvas-wrap" ref={mapViewportRef}>
            <GameCanvas
              state={state}
              version={version}
              animationActive={speed > 0 && !state.pendingChoice && !state.tacticalBattle && !state.tacticalBattleReport && !state.gameOver}
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
            />
          </div>
          <BuildDrawer
            state={state}
            placingType={placingType}
            setPlacingType={setPlacingType}
            onClearSelection={handleClearSelection}
            uiPrefs={uiPrefs}
            onUiPrefsChange={setUiPrefs}
          />
          <DockFrame
            overlayItems={overlayItems}
            items={[
              {
                id: 'jobs',
                label: '직업 배정',
                icon: '人',
                content: (
                  <JobPanel
                    state={state}
                    onReassign={handleReassign}
                    uiPrefs={uiPrefs}
                    onUiPrefsChange={setUiPrefs}
                    onAutoAssign={handleAutoAssignBuildings}
                  />
                ),
              },
              {
                id: 'processing',
                label: '가공·비축',
                icon: '⚙',
                content: <ProcessingPanel state={state} onSetReserve={handleSetProcessingReserve} />,
              },
              {
                id: 'residents',
                label: '주민',
                icon: '民',
                content: (
                  <ResidentsWindow
                    state={state}
                    selectedResidentId={inspResidentId}
                    onSelectResident={handleSelectResidentFromDock}
                    onOpenWeaponAllocation={() => {
                      setSpeed(0);
                      setWeaponDialogOpen(true);
                    }}
                  />
                ),
              },
              {
                id: 'factions',
                label: '세력',
                icon: '交',
                content: <FactionsWindow state={state} onRequestTrade={handleRequestTrade} />,
              },
              {
                id: 'court',
                label: '조정',
                icon: '廷',
                content: (
                  <CourtWindow
                    state={state}
                    onPetition={handlePetition}
                    onToggleNitre={handleToggleNitre}
                    onSetTributeReserve={handleSetTributeReserve}
                    onUseLuxuryGood={handleUseLuxuryGood}
                  />
                ),
              },
              {
                id: 'incidents',
                label: '사건 · 기물함',
                icon: '警',
                content: (
                  <InspectorPanel
                    state={state}
                    onOrganizeHunt={handleOrganizeHunt}
                    onScoutPredator={handleScoutPredator}
                  />
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
        </div>
      </div>

      {expeditionMusterRequest ? (
        <ExpeditionMusterDialog
          state={state}
          request={expeditionMusterRequest}
          onAssignWeapon={handleSetResidentWeapon}
          onConfirm={handleConfirmExpedition}
          onClose={() => setExpeditionMusterRequest(null)}
        />
      ) : weaponDialogOpen ? (
        <WeaponAllocationDialog
          state={state}
          onAssign={handleSetResidentWeapon}
          onAssignMount={handleSetResidentMount}
          onAutoAssign={handleAutoAssignWeapons}
          onClear={handleClearWeaponAssignments}
          onClose={() => setWeaponDialogOpen(false)}
        />
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
        <TacticalBattleScreen
          state={state}
          onSpendPreparation={handleSpendPreparation}
          onAdvancePhase={handleAdvanceTacticalPhase}
          onAssignGroup={handleAssignTacticalGroup}
          onSplitHuntGroup={handleSplitHuntGroup}
          onMergeHuntGroups={handleMergeHuntGroups}
          onSetHuntPreparationZone={handleSetHuntPreparationZone}
          onSetFormationLine={handleSetTacticalFormationLine}
          onSetCommand={handleSetTacticalCommand}
          onSetGroupTarget={handleSetTacticalGroupTarget}
          onResolveRound={handleResolveTacticalRound}
          onCompleteSimulation={handleCompleteTacticalSimulation}
          onAcknowledgeReport={handleAcknowledgeTacticalReport}
          onFinishBattle={handleFinishTacticalBattle}
        />
      )}
      {state.tacticalBattleReport && (
        <TacticalBattleReportModal report={state.tacticalBattleReport} onClose={handleDismissTacticalBattleReport} />
      )}
      {simMode && (
        <button className="sim-exit-button" onClick={exitBattleSimulation}>
          시뮬레이션 종료
        </button>
      )}
    </div>
  );
}
