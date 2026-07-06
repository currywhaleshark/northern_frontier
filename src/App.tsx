// 최상위 컴포넌트: 게임 상태 보관, 게임 루프, 플레이어 입력 연결
import { useCallback, useEffect, useRef, useState } from 'react';
import { CONFIG } from './game/config';
import {
  advanceDay, advanceTick, newGame, reassignJob, resolveChoice, setResidentJob,
  SUBTICKS, tryPlaceBuilding,
} from './game/simulation';
import { clearSave, hasSave, loadGame, saveGame } from './game/saveLoad';
import { addLog, requestTrade } from './game/events';
import { initAudio, isMuted, playSfx, setMuted, setWeatherAmbient } from './sound/sfx';
import { AlertsPanel } from './components/AlertsPanel';
import { BuildMenu } from './components/BuildMenu';
import { EventLog } from './components/EventLog';
import { EventModal } from './components/EventModal';
import { GameCanvas } from './components/GameCanvas';
import { InspectorPanel, type InspectorTab } from './components/InspectorPanel';
import { JobPanel } from './components/JobPanel';
import { MainMenu } from './components/MainMenu';
import { TopBar } from './components/TopBar';
import type { BuildingTypeId, Difficulty, JobId } from './game/types';

export default function App() {
  // 게임 상태는 ref에 두고, version 증가로 리렌더를 트리거한다
  const stateRef = useRef(newGame());
  const [version, setVersion] = useState(0);
  const bump = useCallback(() => setVersion(v => v + 1), []);

  const [screen, setScreen] = useState<'menu' | 'game'>('menu');
  const [speed, setSpeed] = useState(1);
  const [placingType, setPlacingType] = useState<BuildingTypeId | null>(null);
  const [selected, setSelected] = useState<{ x: number; y: number } | null>(null);
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
    if (pk && pk !== m.pending) playSfx(pk === 'raid' ? 'raidHorn' : 'tradeBell');
    m.pending = pk;
    if (s.gameOver && !m.over) playSfx(s.gameOver.won ? 'win' : 'lose');
    m.over = !!s.gameOver;
    setWeatherAmbient(s.weather);
  });

  const state = stateRef.current;

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
    setSelected({ x, y });
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

  const handleChoose = (optionId: string) => {
    resolveChoice(stateRef.current, optionId);
    bump();
  };

  // 세력 탭/장터 타일에서 먼저 거래를 청한다 (버튼이 미리 비활성화되지만 안전망으로 사유를 로그에)
  const handleRequestTrade = (factionName: string) => {
    const err = requestTrade(stateRef.current, factionName);
    if (err) addLog(stateRef.current, err, 'info');
    bump();
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
      stateRef.current = loaded;
      addLog(stateRef.current, '저장된 진행 상황을 불러왔습니다.', 'info');
      setSelected(null);
      setPlacingType(null);
      setInspResidentId(null);
      setScreen('game');
      bump();
    }
  };

  const handleResidentClick = (id: number) => {
    setInspTab('people');
    setInspResidentId(id);
  };

  // 선택 상태를 비우고 새 판을 시작
  const startNewGame = (difficulty: Difficulty) => {
    stateRef.current = newGame(undefined, difficulty);
    setSelected(null);
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
      />
      <div className="main">
        <div className="side left">
          <BuildMenu state={state} placingType={placingType} setPlacingType={setPlacingType} />
          <JobPanel state={state} onReassign={handleReassign} />
        </div>
        <div className="canvas-wrap">
          <GameCanvas
            state={state}
            version={version}
            placingType={placingType}
            selected={selected}
            selectedResidentId={inspResidentId}
            anim={animRef.current}
            onTileClick={handleTileClick}
            onResidentClick={handleResidentClick}
            onCancelPlace={() => setPlacingType(null)}
          />
        </div>
        <div className="side right">
          <AlertsPanel state={state} />
          {state.victoryProgressNote && (
            <div className="section">
              <div className="panel-title">승격까지 남은 조건</div>
              <div className="victory-note">{state.victoryProgressNote}</div>
            </div>
          )}
          <InspectorPanel
            state={state}
            selected={selected}
            onSetResidentJob={handleSetResidentJob}
            onRequestTrade={handleRequestTrade}
            tab={inspTab}
            setTab={setInspTab}
            residentId={inspResidentId}
            setResidentId={setInspResidentId}
          />
          <EventLog state={state} />
        </div>
      </div>

      {state.pendingChoice && <EventModal choice={state.pendingChoice} onChoose={handleChoose} />}

      {state.gameOver && (
        <div className="modal-overlay">
          <div className={`modal gameover ${state.gameOver.won ? 'won' : 'lost'}`}>
            <h2>{state.gameOver.won ? '승격 — 개척 성공' : '개척 실패'}</h2>
            <div className="body">{state.gameOver.reason}</div>
            <div className="muted small" style={{ marginBottom: 10 }}>
              생존 {Math.floor((state.day - 1) / CONFIG.time.yearDays)}년 {(state.day - 1) % CONFIG.time.yearDays}일 ·
              누적 사망 {state.totalDeaths}명
            </div>
            <button className="btn primary" onClick={() => setScreen('menu')}>메인 메뉴로</button>
          </div>
        </div>
      )}
    </div>
  );
}
