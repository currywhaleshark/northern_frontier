import { useEffect, useMemo, useState } from 'react';
import { archiveUnusedAssets, loadAssetAudit, type AssetAudit, type AssetAuditEntry } from './api';

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function AssetCard({ asset, selected, onToggle }: {
  asset: AssetAuditEntry;
  selected: boolean;
  onToggle(): void;
}) {
  const removable = asset.status === 'unused';
  return (
    <article className={`asset-card ${asset.status}${selected ? ' selected' : ''}`}>
      <div className="asset-preview"><img src={asset.src} alt="" /></div>
      <div className="asset-card-head">
        <span className={`asset-status ${asset.status}`}>
          {asset.status === 'unused' ? '미사용' : asset.status === 'dynamic' ? '동적 참조' : '사용 중'}
        </span>
        {removable && (
          <label className="asset-check">
            <input type="checkbox" checked={selected} onChange={onToggle} /> 정리 선택
          </label>
        )}
      </div>
      <strong className="asset-name">{asset.name}</strong>
      <span className="muted">
        {asset.dimensions ? `${asset.dimensions.width}×${asset.dimensions.height} · ` : ''}{formatBytes(asset.bytes)}
      </span>
      <span className="asset-reason">{asset.reason}</span>
      {asset.replacement && <span className="asset-replacement">대체: {asset.replacement}</span>}
    </article>
  );
}

export function AssetCleanup() {
  const [audit, setAudit] = useState<AssetAudit | null>(null);
  const [filter, setFilter] = useState<'unused' | 'all'>('unused');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState('감사 중…');

  const refresh = async () => {
    setStatus('감사 중…');
    try {
      const next = await loadAssetAudit();
      setAudit(next);
      setSelected(current => new Set([...current].filter(name =>
        next.assets.some(asset => asset.name === name && asset.status === 'unused'))));
      setStatus('');
    } catch (error) {
      setStatus(`감사 실패: ${(error as Error).message}`);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const assets = useMemo(() => audit?.assets.filter(asset => filter === 'all' || asset.status === 'unused') ?? [],
    [audit, filter]);
  const unusedNames = audit?.assets.filter(asset => asset.status === 'unused').map(asset => asset.name) ?? [];

  const toggle = (name: string) => setSelected(current => {
    const next = new Set(current);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });

  const archive = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`${selected.size}개 자산을 public/assets 밖 보관함으로 이동할까요?`)) return;
    setStatus('보관함으로 이동 중…');
    try {
      const result = await archiveUnusedAssets([...selected]);
      setSelected(new Set());
      await refresh();
      setStatus(`${result.moved.length}개 이동 완료 · ${result.archiveDir}`);
    } catch (error) {
      setStatus(`정리 실패: ${(error as Error).message}`);
    }
  };

  return (
    <section className="asset-cleanup">
      <div className="asset-toolbar">
        <div>
          <strong>런타임 스프라이트 감사</strong>
          <p className="muted">범위: public/assets/*.png · 생성 원본과 하위 UI/이벤트/전술 폴더는 건드리지 않습니다.</p>
        </div>
        <div className="seg asset-filter">
          <button type="button" className={`seg-btn${filter === 'unused' ? ' on' : ''}`} onClick={() => setFilter('unused')}>미사용</button>
          <button type="button" className={`seg-btn${filter === 'all' ? ' on' : ''}`} onClick={() => setFilter('all')}>전체</button>
        </div>
        <button type="button" className="btn" onClick={() => void refresh()}>다시 감사</button>
      </div>

      {audit && (
        <div className="asset-summary">
          <span>전체 {audit.summary.total}</span>
          <span>직접 참조 {audit.summary.used}</span>
          <span>동적 참조 {audit.summary.dynamic}</span>
          <strong>미사용 {audit.summary.unused} · {formatBytes(audit.summary.unusedBytes)}</strong>
          <span className="spacer" />
          <button type="button" className="btn" onClick={() => setSelected(new Set(unusedNames))}>미사용 전체 선택</button>
          <button type="button" className="btn danger" disabled={selected.size === 0} onClick={() => void archive()}>
            선택 {selected.size}개 보관함으로
          </button>
        </div>
      )}

      {status && <div className={`asset-message${status.includes('실패') ? ' error' : ''}`}>{status}</div>}
      <div className="asset-grid">
        {assets.map(asset => <AssetCard key={asset.name} asset={asset} selected={selected.has(asset.name)} onToggle={() => toggle(asset.name)} />)}
      </div>
    </section>
  );
}
