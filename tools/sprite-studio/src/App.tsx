// 스프라이트 스튜디오 셸. 지금은 탭 A(비율 정렬대)만 있고, 작업 자세·건물 탭이 뒤따른다.
import { useCallback, useEffect, useState } from 'react';
import { loadStudioData, saveRegistry, type SpriteDisplayMetric, type StudioData } from './api';
import { ScaleBench } from './ScaleBench';

type TabId = 'scale';

const TABS: readonly { id: TabId; label: string }[] = [
  { id: 'scale', label: '비율 정렬대' },
];

export function App() {
  const [data, setData] = useState<StudioData | null>(null);
  const [metrics, setMetrics] = useState<Record<string, SpriteDisplayMetric>>({});
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
        setStatus('');
      })
      .catch(error => setStatus(`불러오기 실패: ${error.message}`));
  }, []);

  const savedMetrics = data?.['display-metrics'] ?? {};
  const dirty = data != null && JSON.stringify(metrics) !== JSON.stringify(savedMetrics);

  const change = useCallback((key: string, metric: SpriteDisplayMetric) => {
    setMetrics(current => {
      const next = { ...current };
      // 기본값이면 항목 자체를 지운다 — 편집한 것만 파일에 남는다.
      if (metric.scale === 1 && metric.dy === 0) delete next[key];
      else next[key] = metric;
      return next;
    });
  }, []);

  const save = useCallback(async () => {
    setStatus('저장 중…');
    try {
      await saveRegistry('display-metrics', metrics);
      setData(current => (current ? { ...current, 'display-metrics': metrics } : current));
      setStatus('저장 완료 — 게임 dev 서버가 HMR로 반영합니다');
    } catch (error) {
      setStatus(`저장 실패: ${(error as Error).message}`);
    }
  }, [metrics]);

  const revert = useCallback(() => {
    setMetrics(savedMetrics);
    setStatus('되돌렸습니다');
  }, [savedMetrics]);

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
        <label className="toggle">
          <input type="checkbox" checked={showReference} onChange={event => setShowReference(event.target.checked)} />
          기준 실루엣
        </label>
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
          onChange={change}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          animate={animate}
          showReference={showReference}
        />
      ) : null}
    </div>
  );
}
