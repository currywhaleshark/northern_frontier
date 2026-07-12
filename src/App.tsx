// 최상위 컴포넌트: 게임 상태 보관, 게임 루프, 플레이어 입력 연결
import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from './game/config';
import {
  assignNearestWorkerToBuilding, assignResidentToBuilding,
  advanceDay, advanceTick, continueAfterVictory, demolishBuilding, newGame, reassignJob, resolveChoice, setResidentJob,
  setBuildingCrop, setSmithyProduct, issueResidentMoveOrder, issueResidentWorkOrder, upgradeHousingBuilding,
  convertFieldToPaddy, toggleResidentCart,
  unassignResidentFromBuilding, useLuxuryGood, SUBTICKS, tryPlaceBuilding,
} from './game/simulation';
import { clearSave, hasSave, loadGame, saveGame } from './game/saveLoad';
import { addLog, negotiateTrade, requestTrade, tradeNegotiationOf } from './game/events';
import { initAudio, isMuted, playSfx, setMuted, setWeatherAmbient } from './sound/sfx';
import { AlertsPanel } from './components/AlertsPanel';
import { BuildMenu } from './components/BuildMenu';
import { EventLog } from './components/EventLog';
import { EventModal } from './components/EventModal';
import { TradeDialog } from './components/TradeDialog';
import { GameCanvas } from './components/GameCanvas';
import { InspectorPanel, type InspectorTab } from './components/InspectorPanel';
import { ImportantLogOverlay } from './components/ImportantLogOverlay';
import { JobPanel } from './components/JobPanel';
import { MainMenu } from './components/MainMenu';
import { centerViewportOnSettlement, Minimap } from './components/Minimap';
import { ProcessingPanel } from './components/ProcessingPanel';
import { TopBar } from './components/TopBar';
import { RANK_NAMES } from './game/constants';
import { requestPetition } from './game/petition';
import { toggleNitreYards } from './game/suspicion';
import { setProcessingReserve } from './game/processing';
import { setTributeReserve } from './game/tributeReserve';
import { nextRank } from './game/promotion';
import { openPredatorHunt } from './game/specialEvents';
import { getPointerAction, selectedEntityFromTile } from './game/selectionActions';
import { isExplored } from './game/exploration';
import { makeRng } from './game/map';
import { openTerritoryOrderConfirmation } from './game/territory';
import {
  raidBanditLair, requestHuntingRights, requestPassagePermission, scoutBanditLair, sendGiftToSite,
  type SiteGiftType,
} from './game/siteDiplomacy';
import type {
  BuildingTypeId, CropId, Difficulty, JobId, ProcessingInputId, ResourceId, SelectedEntity, SmithyProductId,
  SpecialItemId, WildlifeKind,
} from './game/types';

export default function App() {
  // 게임 상태는 ref에 두고, version 증가로 리렌더를 트리거한다
  const stateRef = useRef(newGame());
  const mapViewportRef = useRef<HTMLDivElement>(null);
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [speed, setSpeed] = useState(1);
  const [placingType, setPlacingType] = useState<BuildingTypeId | null>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null);
  const [canLoad, setCanLoad] = useState(hasSave());
  const [inspTab, setInspTab] = useState<InspectorTab>('tile');
  const [inspResidentId, setInspResidentId] = useState<number | null>(null);
  const [soundOn, setSoundOn] = useState(!isMuted());
  // 이동 보간용: 마지막 서브틱 처리 시각과 서브틱 간격
  const animRef = useRef({ at: performance.now(), ms: 175 });
  // 사운드 트리거 추적 (로그 증가분/모달 전환/게임 종료)
  const sndRef = useRef({ logLen: 0, pending: null as string | null, over: false });

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
    setWeatherAmbient(s.weather);
  });

  const state = stateRef.current;

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
          if (s.pendingChoice) break;
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
      acc = Math.min(acc + (now - last), msPerTick * 24); // 탭 복귀 시 폭주 방지
      last = now;
      let n = Math.floor(acc / msPerTick);
      if (n > 0) {
        acc -= n * msPerTick;
        const s = stateRef.current;
        while (n-- > 0) {
          if (s.pendingChoice || s.gameOver) break; // 이벤트/종료 시 자동 정지
          advanceTick(s);
        }
        animRef.current = { at: now, ms: msPerTick };
      }
      bump(); // 서브틱 사이에도 리렌더해 이동을 부드럽게 보간
    }, 33);
    return () => clearInterval(timer);
  }, [speed, screen, bump]);

  // Esc로 건설 배치 취소
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacingType(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleTileClick = (x: number, y: number) => {
    if (placingType) {
      const err = tryPlaceBuilding(stateRef.current, placingType, x, y);
      if (err) addLog(stateRef.current, err, 'bad');
      else {
        playSfx('hammer');
        if (stateRef.current.resources.wood < 4) setPlacingType(null);
      }
      bump();
      return;
    }
    const tile = stateRef.current.map[y]?.[x];
    setSelected({ x, y });
    setSelectedEntity(tile && isExplored(stateRef.current, x, y)
      ? selectedEntityFromTile(stateRef.current, tile)
      : tile ? { kind: 'tile', x, y } : null);
    setInspResidentId(null);
    setInspTab('tile');
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

  const handleSetResidentJob = (id: number, job: JobId) => {
    setResidentJob(stateRef.current, id, job);
    bump();
  };

  const handleToggleResidentCart = (id: number) => {
    const err = toggleResidentCart(stateRef.current, id);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
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
    resolveChoice(stateRef.current, optionId);
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

  const handleOrganizeHunt = (kind: WildlifeKind) => {
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
  const handleScoutBanditLair = (siteId: number) =>
    handleSiteAction(() => scoutBanditLair(stateRef.current, siteId, siteActionRng(siteId)));
  const handleRaidBanditLair = (siteId: number) =>
    handleSiteAction(() => raidBanditLair(stateRef.current, siteId, siteActionRng(siteId)));

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
      stateRef.current = loaded;
      addLog(stateRef.current, '저장된 진행 상황을 불러왔습니다.', 'info');
      setSelected(null);
      setSelectedEntity(null);
      setPlacingType(null);
      setInspResidentId(null);
      setScreen('game');
      bump();
    }
  };

  const handleResidentClick = (id: number) => {
    setSelected(null);
    setSelectedEntity({ kind: 'resident', id });
    setInspTab('people');
    setInspResidentId(id);
  };

  const handleSetInspectorResidentId = (id: number | null) => {
    setInspResidentId(id);
    if (id != null) {
      setSelected(null);
      setSelectedEntity({ kind: 'resident', id });
    } else {
      setSelectedEntity(prev => prev?.kind === 'resident' ? null : prev);
    }
  };

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

  const handleCloseBuildingActions = () => {
    setSelectedEntity(prev => prev?.kind === 'building' ? null : prev);
    setSelected(prev => {
      if (!prev) return prev;
      const tile = stateRef.current.map[prev.y]?.[prev.x];
      return tile?.buildingId != null ? null : prev;
    });
  };

  // 선택 상태를 비우고 새 판을 시작
  const startNewGame = (difficulty: Difficulty) => {
    stateRef.current = newGame(undefined, difficulty);
    setSelected(null);
    setSelectedEntity(null);
    setPlacingType(null);
    setInspResidentId(null);
    setInspTab('tile');
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
    return (
      <MainMenu
        canContinue={canLoad}
        onStart={startNewGame}
        onContinue={handleLoad}
      />
    );
  }

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
        onOpenCourt={() => {
          setInspResidentId(null);
          setInspTab('court');
        }}
      />
      <div className="main">
        <div className="side left">
          <BuildMenu state={state} placingType={placingType} setPlacingType={setPlacingType} />
          <JobPanel state={state} onReassign={handleReassign} />
          <ProcessingPanel state={state} onSetReserve={handleSetProcessingReserve} />
        </div>
        <div className="canvas-stage">
          <div className="minimap-overlay">
            <Minimap state={state} version={version} viewportRef={mapViewportRef} selected={selected} />
          </div>
          <div className="canvas-wrap" ref={mapViewportRef}>
            <ImportantLogOverlay state={state} />
            <GameCanvas
              state={state}
              version={version}
              placingType={placingType}
              selected={selected}
              selectedEntity={selectedEntity}
              selectedResidentId={inspResidentId}
              anim={animRef.current}
              onTileClick={handleTileClick}
              onResidentClick={handleResidentClick}
              onContextAction={handleContextAction}
              onUpgradeHousing={handleUpgradeHousing}
              onSetSmithyProduct={handleSetSmithyProduct}
              onSetBuildingCrop={handleSetBuildingCrop}
              onConvertFieldToPaddy={handleConvertFieldToPaddy}
              onRequestTrade={handleRequestTrade}
              onToggleNitre={handleToggleNitre}
              onAssignNearestWorker={handleAssignNearestWorker}
              onUnassignWorker={handleUnassignWorker}
              onCloseBuildingActions={handleCloseBuildingActions}
              onCancelPlace={() => setPlacingType(null)}
            />
          </div>
        </div>
        <div className="side right">
          <AlertsPanel state={state} />
          {state.victoryProgressNote && nextRank(state.rank) && (
            <div className="section">
              <div className="panel-title">다음 승격 — {RANK_NAMES[nextRank(state.rank)!]}</div>
              <div className="muted small" style={{ marginBottom: 4 }}>현재: {RANK_NAMES[state.rank]}</div>
              <div className="victory-note">{state.victoryProgressNote}</div>
            </div>
          )}

          <InspectorPanel
            state={state}
            selected={selected}
            onSetResidentJob={handleSetResidentJob}
            onToggleResidentCart={handleToggleResidentCart}
            onRequestTrade={handleRequestTrade}
            onPetition={handlePetition}
            onSetTributeReserve={handleSetTributeReserve}
            onUseLuxuryGood={handleUseLuxuryGood}
            onToggleNitre={handleToggleNitre}
            onSetSmithyProduct={handleSetSmithyProduct}
            onDemolishBuilding={handleDemolishBuilding}
            onOrganizeHunt={handleOrganizeHunt}
            onSendSiteGift={handleSendSiteGift}
            onRequestSitePassage={handleRequestSitePassage}
            onRequestSiteHunting={handleRequestSiteHunting}
            onScoutBanditLair={handleScoutBanditLair}
            onRaidBanditLair={handleRaidBanditLair}
            tab={inspTab}
            setTab={setInspTab}
            residentId={inspResidentId}
            setResidentId={handleSetInspectorResidentId}
          />
          <EventLog state={state} />
        </div>
      </div>

      {tradeNegotiationOf(state.pendingChoice) ? (
        <TradeDialog state={state} onNegotiate={handleNegotiateTrade} onChoose={handleChoose} />
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
    </div>
  );
}
