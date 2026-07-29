// 스프라이트 스튜디오 셸. 탭마다 편집하는 레지스트리가 다르고, 저장·되돌리기는
// **현재 탭의 레지스트리만** 건드린다 — 한 탭에서 만진 값이 다른 탭 저장에 딸려 가면 안 된다.
import { useCallback, useEffect, useState } from 'react';
import {
  loadStudioData, saveRegistry,
  type RegistryName, type SpriteDisplayMetric, type StudioData, type WorkAnchorEdit,
} from './api';
import { ScaleBench } from './ScaleBench';
import { StanceStage } from './StanceStage';

type TabId = 'scale' | 'stance';

const TABS: readonly { id: TabId; label: string; registry: RegistryName }[] = [
  { id: 'scale', label: '비율 정렬대', registry: 'display-metrics' },
  { id: 'stance', label: '작업 자세', registry: 'work-anchors' },
];

export function App() {
  const [data, setData] = useState<StudioData | null>(null);
  const [metrics, setMetrics] = useState<Record<string, SpriteDisplayMetric>>({});
  const [anchors, setAnchors] = useState<Record<string, WorkAnchorEdit>>({});
  const [tab, setTab] = useState<TabId>('scale');
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
        setStatus('');
      })
      .catch(error => setStatus(`불러오기 실패: ${error.message}`));
  }, []);

  const savedMetrics = data?.['display-metrics'] ?? {};
  const savedAnchors = data?.['work-anchors'] ?? {};
  const draft = tab === 'scale' ? metrics : anchors;
  const savedDraft = tab === 'scale' ? savedMetrics : savedAnchors;
  const dirty = data != null && JSON.stringify(draft) !== JSON.stringify(savedDraft);

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

  const save = useCallback(async () => {
    const entry = TABS.find(item => item.id === tab)!;
    setStatus('저장 중…');
    try {
      await saveRegistry(entry.registry, draft);
      setData(current => (current ? { ...current, [entry.registry]: draft } as StudioData : current));
      setStatus('저장 완료 — 게임 dev 서버가 HMR로 반영합니다');
    } catch (error) {
      setStatus(`저장 실패: ${(error as Error).message}`);
    }
  }, [tab, draft]);

  const revert = useCallback(() => {
    if (tab === 'scale') setMetrics(savedMetrics);
    else setAnchors(savedAnchors);
    setStatus('되돌렸습니다');
  }, [tab, savedMetrics, savedAnchors]);

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
      ) : (
        <StanceStage
          anchors={anchors}
          savedAnchors={savedAnchors}
          onChange={changeAnchor}
          animate={animate}
        />
      )}
    </div>
  );
}
