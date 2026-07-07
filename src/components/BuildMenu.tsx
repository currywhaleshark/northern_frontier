// 건설 메뉴: 카테고리별 접이식. 건물을 고르고 지도를 클릭해 배치한다.
import { useEffect, useRef, useState } from 'react';
import { BUILDING_DEFS, canAfford, cannonPlacementsUsed, isBuildingUnlocked } from '../game/buildings';
import { RESOURCE_NAMES } from '../game/constants';
import { getSeason } from '../game/seasons';
import { getActiveSprites } from '../render/atlas';
import type { BuildingTypeId, GameState, ResourceId } from '../game/types';

// 접이식 카테고리 구성
const CATEGORIES: { name: string; types: BuildingTypeId[] }[] = [
  { name: '주거·기반', types: ['hut', 'ondol', 'tileHouse', 'storehouse', 'bridge'] },
  {
    name: '생산',
    types: [
      'field', 'lumberCamp', 'huntLodge', 'herbHut', 'smithy', 'mine', 'ferry',
      'charcoalKiln', 'stable', 'nitreYard', 'dock', 'tannery', 'market', 'office',
    ],
  },
  { name: '방어·군사', types: ['palisade', 'earthFort', 'stoneWall', 'watchtower', 'beacon', 'garrison', 'cannonEmplacement'] },
];

const OPEN_KEY = 'buksae-buildmenu-open';

function loadOpenState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(OPEN_KEY);
    if (raw) return JSON.parse(raw) as Record<string, boolean>;
  } catch { /* ignore */ }
  return { '주거·기반': true }; // 처음엔 주거만 펼침
}

interface Props {
  state: GameState;
  placingType: BuildingTypeId | null;
  setPlacingType: (t: BuildingTypeId | null) => void;
}

function costText(type: BuildingTypeId): string {
  const def = BUILDING_DEFS[type];
  const parts = Object.entries(def.cost).map(
    ([res, amt]) => `${RESOURCE_NAMES[res as ResourceId]} ${amt}`,
  );
  return parts.length > 0 ? parts.join(', ') : '무료';
}

// 스프라이트 썸네일 (아틀라스 로드 전엔 임시 그래픽이 대신 그려진다)
function BuildingThumb({ type, state }: { type: BuildingTypeId; state: GameState }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, cv.width, cv.height);
    getActiveSprites().drawBuilding(ctx, {
      type, built: true, ghost: false, progress01: 1,
      season: getSeason(state.day),
      growth01: type === 'field' ? 0.8 : undefined,
      x: 3, y: 17, size: 22,
    });
  });
  return <canvas ref={ref} width={28} height={40} style={{ flexShrink: 0 }} />;
}

export function BuildMenu({ state, placingType, setPlacingType }: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>(loadOpenState);

  const toggle = (name: string) => {
    const next = { ...open, [name]: !open[name] };
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, JSON.stringify(next)); } catch { /* ignore */ }
  };

  return (
    <div className="section">
      <div className="panel-title">건설</div>
      {placingType && (
        <div className="small muted" style={{ marginBottom: 6 }}>
          지도를 클릭해 배치하세요. (우클릭 취소)
        </div>
      )}
      {CATEGORIES.map(cat => {
        const isOpen = !!open[cat.name];
        const hasPlacing = placingType != null && cat.types.includes(placingType);
        // 불랑기포대는 조정 하사(청원) 전엔 목록에 보이지 않는다
        const visibleTypes = cat.types.filter(
          type => isBuildingUnlocked(state.rank, type) &&
            (type !== 'cannonEmplacement' || state.cannonsGranted > 0),
        );
        return (
          <div key={cat.name}>
            <button className="cat-header" onClick={() => toggle(cat.name)}>
              <span>{isOpen ? '▾' : '▸'} {cat.name}{hasPlacing && !isOpen ? ' ●' : ''}</span>
              <span className="muted small">{visibleTypes.length}</span>
            </button>
            {isOpen && visibleTypes.map(type => {
              const def = BUILDING_DEFS[type];
              const uniqueBuilt = def.unique && state.buildings.some(b => b.type === type);
              const grantSpent = type === 'cannonEmplacement' && cannonPlacementsUsed(state) >= state.cannonsGranted;
              const affordable = canAfford(state, def);
              return (
                <button
                  key={type}
                  className={`build-item${placingType === type ? ' selected' : ''}`}
                  disabled={uniqueBuilt || grantSpent || !affordable}
                  title={grantSpent ? '조정의 하사가 있어야 더 놓을 수 있습니다 (조정 탭에서 청원)' : def.desc}
                  onClick={() => setPlacingType(placingType === type ? null : type)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <BuildingThumb type={type} state={state} />
                  <span>
                    <div>{def.name}{uniqueBuilt ? ' (완료)' : ''}{grantSpent ? ' (하사 대기)' : ''}</div>
                    <div className="cost">{costText(type)} · 공기 {def.buildDays}일</div>
                  </span>
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
}
