// 스프라이트 스튜디오 셸. 탭마다 편집하는 레지스트리가 다르고, 저장·되돌리기는
// **현재 탭의 레지스트리만** 건드린다 — 한 탭에서 만진 값이 다른 탭 저장에 딸려 가면 안 된다.
import { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_SHADOW, loadStudioData, saveRegistry,
  type EffectEmitterEdit, type RegistryName, type ShadowSettingsEdit,
  type SpriteDisplayMetric, type StudioData, type WorkAnchorEdit, type WorkerSlotEdit,
} from './api';
import { ScaleBench } from './ScaleBench';
import { StanceStage } from './StanceStage';
import { BuildingStage, type BuildingLayer } from './BuildingStage';

type TabId = 'scale' | 'stance' | 'building';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'scale', label: '비율 정렬대' },
  { id: 'stance', label: '작업 자세' },
  { id: 'building', label: '건물' },
];

export function App() {
  const [data, setData] = useState<StudioData | null>(null);
  const [metrics, setMetrics] = useState<Record<string, SpriteDisplayMetric>>({});
  const [anchors, setAnchors] = useState<Record<string, WorkAnchorEdit>>({});
  const [effects, setEffects] = useState<Record<string, EffectEmitterEdit[]>>({});
  const [shadows, setShadows] = useState<Record<string, ShadowSettingsEdit>>({});
  const [slots, setSlots] = useState<Record<string, WorkerSlotEdit[]>>({});
  const [tab, setTab] = useState<TabId>('scale');
  const [buildingLayer, setBuildingLayer] = useState<BuildingLayer>('effects');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [animate, setAnimate] = useState(true);
  const [showReference, setShowReference] = useState(true);
  const [status, setStatus] = useState('불러오는 중…');

  useEffect(() => {
    loadStudioData()
      .then(loaded => {
        setData(loaded);
        setMetrics(loaded['display-metrics']);
        setAnchors(loaded['work-anchors']);
        setEffects(loaded['building-effects']);
        setShadows(loaded['building-shadows']);
        setSlots(loaded['worker-slots']);
        setStatus('');
      })
      .catch(error => setStatus(`불러오기 실패: ${error.message}`));
  }, []);

  const savedMetrics = data?.['display-metrics'] ?? {};
  const savedAnchors = data?.['work-anchors'] ?? {};
  const savedEffects = data?.['building-effects'] ?? {};
  const savedShadows = data?.['building-shadows'] ?? {};
  const savedSlots = data?.['worker-slots'] ?? {};

  // 저장·되돌리기는 현재 보고 있는 레지스트리 하나만 다룬다.
  const registry: RegistryName = tab === 'scale' ? 'display-metrics'
    : tab === 'stance' ? 'work-anchors'
      : buildingLayer === 'effects' ? 'building-effects'
        : buildingLayer === 'slots' ? 'worker-slots' : 'building-shadows';
  const drafts: Record<RegistryName, unknown> = {
    'display-metrics': metrics,
    'work-anchors': anchors,
    'building-effects': effects,
    'building-shadows': shadows,
    'worker-slots': slots,
  };
  const savedDrafts: Record<RegistryName, unknown> = {
    'display-metrics': savedMetrics,
    'work-anchors': savedAnchors,
    'building-effects': savedEffects,
    'building-shadows': savedShadows,
    'worker-slots': savedSlots,
  };
  const draft = drafts[registry];
  const dirty = data != null && JSON.stringify(draft) !== JSON.stringify(savedDrafts[registry]);

  const changeMetric = useCallback((key: string, metric: SpriteDisplayMetric) => {
    setMetrics(current => {
      const next = { ...current };
      // 기본값이면 항목 자체를 지운다 — 편집한 것만 파일에 남는다.
      if (metric.scale === 1 && metric.dy === 0) delete next[key];
      else next[key] = metric;
      return next;
    });
  }, []);

  const changeAnchor = useCallback((key: string, anchor: WorkAnchorEdit) => {
    setAnchors(current => {
      const next = { ...current };
      const untouched = anchor.offsetX === 0 && anchor.offsetY === 0 && anchor.facing === 0 &&
        !anchor.toolTipX && !anchor.toolTipY;
      if (untouched) delete next[key];
      else next[key] = anchor;
      return next;
    });
  }, []);

  const changeEffects = useCallback((type: string, emitters: EffectEmitterEdit[]) => {
    setEffects(current => {
      const next = { ...current };
      if (emitters.length === 0) delete next[type];
      else next[type] = emitters;
      return next;
    });
  }, []);

  const changeShadow = useCallback((type: string, settings: ShadowSettingsEdit) => {
    setShadows(current => {
      const next = { ...current };
      // 기본값이면 항목을 지운다 — 등록하지 않은 건물은 standard로 도는 게 기본이다.
      const untouched = settings.mode === DEFAULT_SHADOW.mode && settings.groundFrac === 0 &&
        settings.anchorDepthFrac === 0 && settings.lengthScale === 1;
      if (untouched) delete next[type];
      else next[type] = settings;
      return next;
    });
  }, []);

  const changeSlots = useCallback((type: string, next: WorkerSlotEdit[]) => {
    setSlots(current => {
      const updated = { ...current };
      if (next.length === 0) delete updated[type];
      else updated[type] = next;
      return updated;
    });
  }, []);

  const save = useCallback(async () => {
    setStatus('저장 중…');
    try {
      await saveRegistry(registry, draft);
      setData(current => (current ? { ...current, [registry]: draft } as StudioData : current));
      setStatus('저장 완료 — 게임 dev 서버가 HMR로 반영합니다');
    } catch (error) {
      setStatus(`저장 실패: ${(error as Error).message}`);
    }
  }, [registry, draft]);

  const revert = useCallback(() => {
    if (registry === 'display-metrics') setMetrics(savedMetrics);
    else if (registry === 'work-anchors') setAnchors(savedAnchors);
    else if (registry === 'building-effects') setEffects(savedEffects);
    else if (registry === 'worker-slots') setSlots(savedSlots);
    else setShadows(savedShadows);
    setStatus('되돌렸습니다');
  }, [registry, savedMetrics, savedAnchors, savedEffects, savedShadows, savedSlots]);

  return (
    <div className="studio">
      <header className="topbar">
        <strong>스프라이트 스튜디오</strong>
        <nav className="tabs">
          {TABS.map(entry => (
            <button
              type="button"
              key={entry.id}
              className={`tab${tab === entry.id ? ' active' : ''}`}
              onClick={() => setTab(entry.id)}
            >
              {entry.label}
            </button>
          ))}
        </nav>
        <label className="toggle">
          <input type="checkbox" checked={animate} onChange={event => setAnimate(event.target.checked)} />
          애니메이션
        </label>
        {tab === 'scale' && (
          <label className="toggle">
            <input type="checkbox" checked={showReference} onChange={event => setShowReference(event.target.checked)} />
            기준 실루엣
          </label>
        )}
        <span className="spacer" />
        <span className={`status${status.includes('실패') ? ' error' : ''}`}>{status}</span>
        <button type="button" className="btn" onClick={revert} disabled={!dirty}>되돌리기</button>
        <button type="button" className="btn primary" onClick={save} disabled={!dirty}>저장</button>
      </header>

      {data == null ? (
        <div className="empty">{status || '준비 중…'}</div>
      ) : tab === 'scale' ? (
        <ScaleBench
          metrics={metrics}
          savedMetrics={savedMetrics}
          onChange={changeMetric}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          animate={animate}
          showReference={showReference}
        />
      ) : tab === 'stance' ? (
        <StanceStage
          anchors={anchors}
          savedAnchors={savedAnchors}
          onChange={changeAnchor}
          animate={animate}
        />
      ) : (
        <BuildingStage
          layer={buildingLayer}
          onLayerChange={setBuildingLayer}
          effects={effects}
          shadows={shadows}
          slots={slots}
          onEffectsChange={changeEffects}
          onShadowChange={changeShadow}
          onSlotsChange={changeSlots}
          animate={animate}
        />
      )}
    </div>
  );
}
