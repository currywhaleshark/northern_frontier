import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadBalance, saveOverrides, type KeyComment, type OverrideValue } from './api';
import {
  buildFields, categoryLabel, fieldComment, groupLabel, searchText,
  type BalanceField,
} from './fields';
import { BALANCE_TIMINGS, balanceValueWarning } from '../balance-meta.mjs';

type Overrides = Record<string, OverrideValue>;

const ALL_FIELDS = buildFields();

function sameOverrides(a: Overrides, b: Overrides): boolean {
  const keysA = Object.keys(a);
  const keysB = Object.keys(b);
  if (keysA.length !== keysB.length) return false;
  return keysA.every(key => a[key] === b[key]);
}

/** 기본값 대비 배율. 0으로 나눌 수 없는 경우는 표시하지 않는다. */
function ratioText(defaultValue: OverrideValue, value: OverrideValue): string | null {
  if (typeof defaultValue !== 'number' || typeof value !== 'number') return null;
  if (defaultValue === 0) return null;
  const ratio = value / defaultValue;
  if (!Number.isFinite(ratio)) return null;
  return `${ratio.toFixed(2).replace(/\.00$/, '')}×`;
}

function absorptionDiff(overrides: Overrides, fields: BalanceField[]): string {
  const byPath = new Map(fields.map(field => [field.path, field]));
  const keys = Object.keys(overrides).sort((a, b) => a.localeCompare(b));
  if (keys.length === 0) return '# 오버레이 없음 — 흡수할 것이 없다.\n';
  const lines = [
    '# 밸런스 오버레이 흡수용 diff',
    '# 기본값(src/game/config.ts · src/game/buildings.ts)에 아래 값을 반영하고,',
    '# 반영한 키는 tools/balance-studio/data/balance-overrides.json에서 지운다.',
    '',
  ];
  for (const key of keys) {
    const field = byPath.get(key);
    const from = field ? String(field.defaultValue) : '?';
    lines.push(`${key}: ${from} -> ${String(overrides[key])}`);
  }
  return `${lines.join('\n')}\n`;
}

export default function App() {
  const [overrides, setOverrides] = useState<Overrides>({});
  const [saved, setSaved] = useState<Overrides>({});
  const [comments, setComments] = useState<Record<string, KeyComment>>({});
  const [category, setCategory] = useState<string>('');
  const [query, setQuery] = useState('');
  const [changedOnly, setChangedOnly] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [status, setStatus] = useState('불러오는 중…');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [diff, setDiff] = useState<string | null>(null);

  useEffect(() => {
    loadBalance()
      .then(payload => {
        setOverrides(payload.overrides);
        setSaved(payload.overrides);
        setComments(payload.comments);
        setStatus(`오버레이 ${Object.keys(payload.overrides).length}개 · 편집 가능 항목 ${ALL_FIELDS.length}개`);
      })
      .catch(loadError => setError(String(loadError.message ?? loadError)));
  }, []);

  const searchIndex = useMemo(() => {
    const index = new Map<string, string>();
    for (const field of ALL_FIELDS) index.set(field.path, searchText(field, comments));
    return index;
  }, [comments]);

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const field of ALL_FIELDS) counts.set(field.category, (counts.get(field.category) ?? 0) + 1);
    return [...counts.entries()].map(([id, fieldCount]) => ({
      id, fieldCount, label: categoryLabel(id, comments),
    }));
  }, [comments]);

  const changedByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const key of Object.keys(overrides)) {
      const head = key.includes('.') ? key.slice(0, key.indexOf('.')) : key;
      counts.set(head, (counts.get(head) ?? 0) + 1);
    }
    return counts;
  }, [overrides]);

  const needle = query.trim().toLowerCase();
  // 검색과 "변경분만 보기"는 카테고리를 가로지른다 — 바꾼 값이 어느 칸에 있었는지 기억할 필요가 없다.
  const visible = useMemo(() => ALL_FIELDS.filter(field => {
    if (changedOnly && !(field.path in overrides)) return false;
    if (needle && !(searchIndex.get(field.path) ?? '').includes(needle)) return false;
    if (needle || changedOnly) return true;
    return field.category === category;
  }), [category, needle, changedOnly, overrides, searchIndex]);

  const groups = useMemo(() => {
    const map = new Map<string, BalanceField[]>();
    for (const field of visible) {
      const bucket = map.get(field.group);
      if (bucket) bucket.push(field);
      else map.set(field.group, [field]);
    }
    return [...map.entries()];
  }, [visible]);

  useEffect(() => {
    if (category === '' && categories.length > 0) setCategory(categories[0].id);
  }, [categories, category]);

  const setValue = useCallback((field: BalanceField, value: OverrideValue) => {
    setOverrides(previous => {
      const next = { ...previous };
      // 기본값과 같아지면 키를 지운다 — 오버레이는 "벗어난 값"만 담는다.
      if (value === field.defaultValue) delete next[field.path];
      else next[field.path] = value;
      return next;
    });
  }, []);

  const resetField = useCallback((field: BalanceField) => {
    setDrafts(previous => {
      const next = { ...previous };
      delete next[field.path];
      return next;
    });
    setOverrides(previous => {
      const next = { ...previous };
      delete next[field.path];
      return next;
    });
  }, []);

  const dirty = !sameOverrides(overrides, saved);

  const save = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      await saveOverrides(overrides);
      setSaved(overrides);
      setStatus(`저장·코드젠 완료 — 오버레이 ${Object.keys(overrides).length}개 (게임 dev 서버가 HMR로 집어 간다)`);
    } catch (saveError) {
      setError(String((saveError as Error).message ?? saveError));
    } finally {
      setBusy(false);
    }
  }, [overrides]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key === 's') {
        event.preventDefault();
        if (dirty && !busy) void save();
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [dirty, busy, save]);

  return (
    <div className="shell">
      <aside className="side">
        <h1>밸런스 편집기</h1>
        <input
          className="search"
          placeholder="키·주석 검색 (예: 매장량, nearbyStone)"
          value={query}
          onChange={event => setQuery(event.target.value)}
        />
        <label className="toggle">
          <input type="checkbox" checked={changedOnly} onChange={event => setChangedOnly(event.target.checked)} />
          변경분만 보기 ({Object.keys(overrides).length})
        </label>
        <nav className={needle || changedOnly ? 'cats muted' : 'cats'}>
          {categories.map(item => {
            const changed = changedByCategory.get(item.id) ?? 0;
            return (
              <button
                key={item.id}
                className={item.id === category ? 'cat on' : 'cat'}
                onClick={() => { setQuery(''); setChangedOnly(false); setCategory(item.id); }}
                title={item.label}
              >
                <span className="cat-name">{item.label}</span>
                <span className="cat-count">{changed > 0 ? `${changed}/${item.fieldCount}` : item.fieldCount}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        <header className="bar">
          <button className="primary" disabled={!dirty || busy} onClick={() => void save()}>
            {busy ? '저장 중…' : dirty ? '저장 (Ctrl+S)' : '저장됨'}
          </button>
          <button
            disabled={Object.keys(overrides).length === 0}
            onClick={() => { if (window.confirm('오버레이 전체를 지웁니다. 계속할까요?')) { setOverrides({}); setDrafts({}); } }}
          >전체 리셋</button>
          <button onClick={() => setDiff(diff === null ? absorptionDiff(overrides, ALL_FIELDS) : null)}>
            흡수용 diff
          </button>
          <span className={error ? 'status bad' : 'status'}>{error ?? status}</span>
        </header>

        {diff !== null && (
          <section className="diff">
            <textarea readOnly value={diff} rows={Math.min(20, diff.split('\n').length + 1)} />
            <button onClick={() => void navigator.clipboard.writeText(diff)}>복사</button>
          </section>
        )}

        <div className="fields">
          {groups.length === 0 && <p className="empty">해당하는 항목이 없습니다.</p>}
          {groups.map(([groupPath, fields]) => {
            const label = groupLabel(groupPath, comments);
            return (
              <section className="group" key={groupPath || '(root)'}>
                <h2>{label.title} <code>{groupPath}</code></h2>
                {label.note && <p className="group-note">{label.note}</p>}
                {fields.map(field => (
                  <FieldRow
                    key={field.path}
                    field={field}
                    comments={comments}
                    override={overrides[field.path]}
                    draft={drafts[field.path]}
                    onDraft={text => setDrafts(previous => ({ ...previous, [field.path]: text }))}
                    onDraftEnd={() => setDrafts(previous => {
                      const next = { ...previous };
                      delete next[field.path];
                      return next;
                    })}
                    onChange={value => setValue(field, value)}
                    onReset={() => resetField(field)}
                  />
                ))}
              </section>
            );
          })}
        </div>
      </main>
    </div>
  );
}

interface RowProps {
  field: BalanceField;
  comments: Record<string, KeyComment>;
  override: OverrideValue | undefined;
  draft: string | undefined;
  onDraft: (text: string) => void;
  onDraftEnd: () => void;
  onChange: (value: OverrideValue) => void;
  onReset: () => void;
}

function FieldRow({ field, comments, override, draft, onDraft, onDraftEnd, onChange, onReset }: RowProps) {
  const changed = override !== undefined;
  const value = changed ? override : field.defaultValue;
  const note = fieldComment(field, comments);
  const timing = BALANCE_TIMINGS[field.timing];
  const ratio = changed ? ratioText(field.defaultValue, value) : null;
  const warning = changed ? balanceValueWarning(field.defaultValue, value) : null;

  return (
    <div className={changed ? 'row changed' : 'row'}>
      <div className="row-head">
        <span className="leaf">{field.leaf}</span>
        <span className={`badge ${field.timing}`} title={timing.hint}>{timing.label}</span>
        {changed && <span className="mark">변경됨</span>}
      </div>
      {note && <p className="note">{note}</p>}
      <div className="row-edit">
        {field.kind === 'boolean' ? (
          <label className="bool">
            <input
              type="checkbox"
              checked={value === true}
              onChange={event => onChange(event.target.checked)}
            />
            {value === true ? 'true' : 'false'}
          </label>
        ) : (
          <input
            type="number"
            step="any"
            value={draft ?? String(value)}
            onChange={event => {
              onDraft(event.target.value);
              const parsed = Number(event.target.value);
              if (event.target.value.trim() !== '' && Number.isFinite(parsed)) onChange(parsed);
            }}
            onBlur={onDraftEnd}
          />
        )}
        <span className="default">기본값 {String(field.defaultValue)}</span>
        {ratio && <span className="ratio">{ratio}</span>}
        <button className="reset" disabled={!changed} onClick={onReset}>되돌리기</button>
      </div>
      {warning && <p className="warn">{warning}</p>}
      <code className="path">{field.path}</code>
    </div>
  );
}
