// 스프라이트 추상화 계층
//
// 나중에 실제 그래픽(스프라이트 아틀라스, 타일셋)을 붙일 때는
// SpriteAPI를 구현한 객체 하나만 새로 만들어 renderer에 넘기면 된다.
// 게임 로직과 렌더러는 "무엇을 그릴지"만 알고, "어떻게 그릴지"는 여기서 결정한다.
// 현재 구현(placeholderSprites)은 이미지가 준비되기 전 단색 도형을 표시한다.
import { FACTIONS, JOB_COLORS } from '../game/constants';
import type { BuildingTypeId, ForeignSiteStatus, ForeignSiteType, Gender, JobId, LifeStage, LivestockId, Rank, ReligiousVocation, Season, SpecialResidentId, Terrain } from '../game/types';
import type { TreeStage } from '../game/forestGrowth';
import type { MineralResource, MineralVisualTier } from '../game/minerals';
import type { MilitiaWeaponSpriteId } from './militiaWeaponAssets';
import type { MountainProfile, TreeSpecies } from './terrainGrowthVisuals';
import type { WaterworksOrientation } from './waterworksBuildingAssets';
import type { CoastalGroundKind } from '../game/tidalFlats';

export type GroundBlendKind = Terrain | CoastalGroundKind;

// 계절별 지형 팔레트 (임시 그래픽용)
const TERRAIN_PALETTES: Record<Season, Record<Terrain, string>> = {
  spring: {
    forest: '#2f5d3a', plain: '#7c8b58', mudflat: '#74664f', river: '#3e6f9e', lake: '#477c9b', sea: '#285f82', mountain: '#6d6a63',
    fertile: '#8a7a45', rock: '#7d7468', center: '#a08858',
  },
  summer: {
    forest: '#2a6b3a', plain: '#84955c', mudflat: '#716149', river: '#3a6fa8', lake: '#4785ae', sea: '#275f88', mountain: '#6d6a63',
    fertile: '#96833f', rock: '#7d7468', center: '#a08858',
  },
  autumn: {
    forest: '#6b5a2e', plain: '#8f7f4e', mudflat: '#695b47', river: '#3e6a92', lake: '#4a7695', sea: '#315f7c', mountain: '#69655e',
    fertile: '#7d6a3a', rock: '#78706a', center: '#a08858',
  },
  winter: {
    forest: '#46564e', plain: '#c3ccd3', mudflat: '#8d867c', river: '#a8cbdd', lake: '#b2cbd8', sea: '#376b91', mountain: '#8d949c',
    fertile: '#bcc6cd', rock: '#828a92', center: '#b0a890',
  },
};

// 같은 타일 위 주민 점이 겹치지 않게 하는 결정적 지터 (히트 판정과 공유)
export function jitterOf(id: number): [number, number] {
  return [((id * 7) % 5 - 2) * 1.6, ((id * 13) % 5 - 2) * 1.6];
}

export interface TerrainDrawParams {
  terrain: Terrain;
  season: Season;
  winter: boolean;
  frozenRiver: boolean; // 겨울 언 강 (해빙기 홍수면 false)
  hasIron: boolean;
  hasSilver?: boolean;
  treeStage?: TreeStage;
  treeSpecies?: TreeSpecies;
  mineralResource?: MineralResource;
  mineralTier?: MineralVisualTier;
  mountainProfile?: MountainProfile;
  highDefinition?: boolean;
  tileX: number; // 타일 좌표 (변형 패턴용)
  tileY: number;
  x: number;     // 픽셀 좌표
  y: number;
  size: number;
  coastalGround?: CoastalGroundKind | null;
  // 강 타일 전용: 각 방향(대각선 포함)이 뭍인지 (물가 경계 표현용)
  banks?: {
    n: boolean; e: boolean; s: boolean; w: boolean;
    ne: boolean; se: boolean; sw: boolean; nw: boolean;
  };
  // 지면 계열이 다른 우세 이웃 지형(숲>암반>갯벌·자갈>모래>풀)이 이 타일 가장자리로 번진다.
  // 타일 경계가 직선으로 잘리는 것을 감추는 용도.
  blendEdges?: { n?: GroundBlendKind; e?: GroundBlendKind; s?: GroundBlendKind; w?: GroundBlendKind };
}

export interface BuildingDrawParams {
  type: BuildingTypeId;
  rank?: Rank;
  built: boolean;
  progress01: number; // 0~1 공정률
  ghost: boolean;     // 배치 미리보기
  season: Season;
  growth01?: number;  // 밭 전용: 작물 성장 0~1
  graveCount?: number; // 묘역 타일 전용: 이 칸의 2×2 소구획에 놓인 묘 수 0~4
  highDefinition?: boolean; // 2배 backing canvas에서는 HD 원본을 선택
  connections?: { n: boolean; e: boolean; s: boolean; w: boolean }; // 성벽 계열 연결 렌더링
  canalFlowing?: boolean; // 강과 이어진 농수로만 물빛으로 그린다
  canalRiverEdges?: { n: boolean; e: boolean; s: boolean; w: boolean }; // 강 접속부는 강 타일 물 표면까지 연장
  waterworksOrientation?: WaterworksOrientation; // 보·제방의 가로/세로 전용 셀
  waterworksEdge?: 'n' | 'e' | 's' | 'w'; // 제방이 걸리는 강 쪽 타일 변
  tint?: { color: string; alpha: number }; // 정보 레이어에서 스프라이트 알파에만 입히는 상태색
  x: number;
  y: number;
  size: number;
}

export interface ResidentDrawParams {
  job: JobId;
  gender: Gender;
  x: number; // 보간·지터가 적용된 픽셀 중심
  y: number;
  sick: boolean;
  carrying: boolean;
  carryingWood?: boolean;
  carryingGame?: boolean;
  carryingMinerals?: boolean;
  showJobMarker?: boolean;
  showCargoMarker?: boolean;
  cartEquipped?: boolean;
  farmerAction?: 'till' | 'harvest' | 'oxPlow';
  saltMakerAction?: 'seaIntake' | 'kilnWork';
  selected: boolean;
  moving?: boolean;   // 이번 서브틱에 이동 중 (걷기 연출)
  working?: boolean;  // 작업 타이머가 진행 중인 제자리 작업 연출
  facing?: 1 | -1;    // 1 오른쪽, -1 왼쪽
  militiaWeapon?: MilitiaWeaponSpriteId;
  foreignFaction?: string;
  stage?: LifeStage | null;
  religiousVocation?: ReligiousVocation;
  sizeScale?: number; // 아이 축소 표시 (전용 시트가 나오기 전 폴백)
  special?: SpecialResidentId;
  animationTimeMs?: number; // 한 캔버스 프레임에서 공유하는 애니메이션 시간
}

export interface ForeignStructureDrawParams {
  factionName: string | null;
  siteType: ForeignSiteType;
  status: ForeignSiteStatus;
  variant: 'core' | 'prop';
  season: Season;
  x: number;
  y: number;
  size: number;
}

export interface RaiderDrawParams {
  x: number; // 픽셀 중심
  y: number;
  count: number;
  spotted: boolean;
  moving?: boolean;
  facing?: 1 | -1;
  faction?: string;
}

export interface ExpeditionDrawParams {
  x: number;
  y: number;
  members: Array<{
    job: JobId;
    gender: Gender;
    militiaWeapon?: MilitiaWeaponSpriteId;
    special?: SpecialResidentId;
  }>;
  total: number;
  moving?: boolean;
  facing?: 1 | -1;
}

export interface BuildingDamageDrawParams {
  season: Season;
  x: number;
  y: number;
  size: number;
}

export interface LivestockDrawParams {
  species: LivestockId;
  x: number;
  y: number;
  facing?: 1 | -1;
  highDefinition?: boolean;
}

export interface CorpseDrawParams {
  x: number;
  y: number;
  size: number;
  highDefinition?: boolean;
}

export interface SpriteAPI {
  id: string; // 지형 레이어 캐시 키에 들어간다 — 스프라이트 세트가 바뀌면 다시 그린다
  drawTerrain(ctx: CanvasRenderingContext2D, p: TerrainDrawParams): void;
  drawTerrainProp?(ctx: CanvasRenderingContext2D, p: TerrainDrawParams): void;
  drawTerrainOverlay?(ctx: CanvasRenderingContext2D, p: TerrainDrawParams): void;
  drawBuilding(ctx: CanvasRenderingContext2D, p: BuildingDrawParams): void;
  drawBuildingDamage(ctx: CanvasRenderingContext2D, p: BuildingDamageDrawParams): void;
  drawLivestock(ctx: CanvasRenderingContext2D, p: LivestockDrawParams): void;
  drawCorpse(ctx: CanvasRenderingContext2D, p: CorpseDrawParams): void;
  drawForeignStructure(ctx: CanvasRenderingContext2D, p: ForeignStructureDrawParams): boolean;
  drawResident(ctx: CanvasRenderingContext2D, p: ResidentDrawParams): void;
  drawExpedition(ctx: CanvasRenderingContext2D, p: ExpeditionDrawParams): void;
  drawRaiders(ctx: CanvasRenderingContext2D, p: RaiderDrawParams): void;
}

// ── 임시 그래픽 구현 ──
export const placeholderSprites: SpriteAPI = {
  id: 'placeholder',
  drawTerrain(ctx, p) {
    let color = TERRAIN_PALETTES[p.season][p.terrain];
    if ((p.terrain === 'river' || p.terrain === 'lake') && p.winter && !p.frozenRiver) color = '#3e6f9e'; // 해빙기: 다시 물
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, p.size, p.size);

    // 겨울 언 강: 얼음 균열
    if ((p.terrain === 'river' || p.terrain === 'lake') && p.frozenRiver) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(p.x + 3, p.y + p.size - 4);
      ctx.lineTo(p.x + p.size - 3, p.y + 4);
      ctx.stroke();
    }
    // 눈 얼룩 (결정적 패턴)
    if (p.winter && p.terrain !== 'river' && p.terrain !== 'lake' && p.terrain !== 'sea' && (p.tileX * 7 + p.tileY * 13) % 5 === 0) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.fillRect(
        p.x + ((p.tileX * 3 + p.tileY) % (p.size - 4)),
        p.y + ((p.tileY * 5 + p.tileX) % (p.size - 4)), 3, 2);
    }
    // 숲 나무 기둥
    if (p.terrain === 'forest') {
      ctx.fillStyle = p.winter ? 'rgba(230,240,245,0.5)' : 'rgba(0,0,0,0.25)';
      ctx.fillRect(p.x + p.size / 2 - 1, p.y + 3, 2, p.size - 6);
    }
    // 철맥 반짝임
    if (p.terrain === 'rock' && p.hasIron) {
      ctx.fillStyle = '#c8a24a';
      ctx.fillRect(p.x + p.size / 2 - 2, p.y + p.size / 2 - 2, 4, 4);
    }
  },

  drawBuilding(ctx, p) {
    const alpha = p.ghost ? 0.8 : p.built ? 1 : 0.5;
    ctx.save();
    ctx.globalAlpha = alpha;
    if (p.type === 'canal') {
      const half = p.size / 2;
      const width = Math.max(2, p.size * 0.2);
      const connections = p.connections ?? { n: false, e: false, s: false, w: false };
      const river = p.canalRiverEdges ?? { n: false, e: false, s: false, w: false };
      const riverReach = p.size * 0.36;
      const activeEdges = (['n', 'e', 's', 'w'] as const).filter(edge => connections[edge]);
      const edgePoint = (edge: 'n' | 'e' | 's' | 'w'): readonly [number, number] => {
        if (edge === 'n') return [p.x + half, p.y];
        if (edge === 'e') return [p.x + p.size, p.y + half];
        if (edge === 's') return [p.x + half, p.y + p.size];
        return [p.x, p.y + half];
      };
      const traceCanal = () => {
        if (activeEdges.length === 0) {
          ctx.moveTo(p.x + p.size * 0.22, p.y + half);
          ctx.lineTo(p.x + p.size * 0.78, p.y + half);
          return;
        }
        if (activeEdges.length === 1) {
          const [ex, ey] = edgePoint(activeEdges[0]);
          ctx.moveTo(ex, ey);
          ctx.lineTo(p.x + half, p.y + half);
          return;
        }
        if (activeEdges.length === 2) {
          const [ax, ay] = edgePoint(activeEdges[0]);
          const [bx, by] = edgePoint(activeEdges[1]);
          ctx.moveTo(ax, ay);
          if (activeEdges[0] !== 'n' || activeEdges[1] !== 's') {
            if (activeEdges[0] !== 'e' || activeEdges[1] !== 'w') {
              ctx.lineTo(p.x + half, p.y + half);
            }
          }
          ctx.lineTo(bx, by);
          return;
        }
        if (connections.n && connections.s) {
          ctx.moveTo(p.x + half, p.y);
          ctx.lineTo(p.x + half, p.y + p.size);
        } else {
          if (connections.n) { ctx.moveTo(p.x + half, p.y); ctx.lineTo(p.x + half, p.y + half); }
          if (connections.s) { ctx.moveTo(p.x + half, p.y + p.size); ctx.lineTo(p.x + half, p.y + half); }
        }
        if (connections.e && connections.w) {
          ctx.moveTo(p.x, p.y + half);
          ctx.lineTo(p.x + p.size, p.y + half);
        } else {
          if (connections.e) { ctx.moveTo(p.x + p.size, p.y + half); ctx.lineTo(p.x + half, p.y + half); }
          if (connections.w) { ctx.moveTo(p.x, p.y + half); ctx.lineTo(p.x + half, p.y + half); }
        }
      };
      const strokeCanal = (color: string, lineWidth: number) => {
        ctx.strokeStyle = color;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = activeEdges.length === 0 ? 'round' : 'butt';
        ctx.beginPath();
        traceCanal();
        ctx.stroke();
        if (activeEdges.length === 1) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(p.x + half, p.y + half, lineWidth / 2, 0, Math.PI * 2);
          ctx.fill();
        }
      };
      ctx.lineJoin = 'round';
      strokeCanal(p.canalFlowing ? '#3b728b' : '#8c7351', width + 2);
      strokeCanal(p.canalFlowing ? '#498aa8' : '#b09668', width);
      if (p.canalFlowing && (river.n || river.e || river.s || river.w)) {
        const overlap = p.size * 0.08;
        const startHalf = width * 0.65;
        const endHalf = width * 0.9;
        const drawMouth = (edge: 'n' | 'e' | 's' | 'w') => {
          const horizontal = edge === 'e' || edge === 'w';
          const startX = edge === 'e' ? p.x + p.size - overlap : edge === 'w' ? p.x + overlap : p.x + half;
          const startY = edge === 's' ? p.y + p.size - overlap : edge === 'n' ? p.y + overlap : p.y + half;
          const endX = edge === 'e' ? p.x + p.size + riverReach : edge === 'w' ? p.x - riverReach : startX;
          const endY = edge === 's' ? p.y + p.size + riverReach : edge === 'n' ? p.y - riverReach : startY;
          const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
          gradient.addColorStop(0, 'rgba(73,138,168,1)');
          gradient.addColorStop(0.58, 'rgba(73,138,168,0.88)');
          gradient.addColorStop(1, 'rgba(73,138,168,0.12)');
          ctx.fillStyle = gradient;
          ctx.beginPath();
          if (horizontal) {
            ctx.moveTo(startX, startY - startHalf);
            ctx.lineTo(endX, endY - endHalf);
            ctx.lineTo(endX, endY + endHalf);
            ctx.lineTo(startX, startY + startHalf);
          } else {
            ctx.moveTo(startX - startHalf, startY);
            ctx.lineTo(endX - endHalf, endY);
            ctx.lineTo(endX + endHalf, endY);
            ctx.lineTo(startX + startHalf, startY);
          }
          ctx.closePath();
          ctx.fill();
        };
        if (river.n) drawMouth('n');
        if (river.e) drawMouth('e');
        if (river.s) drawMouth('s');
        if (river.w) drawMouth('w');
      }
      ctx.restore();
      if (!p.built && !p.ghost) {
        ctx.fillStyle = '#10141a';
        ctx.fillRect(p.x + 2, p.y + p.size - 4, p.size - 4, 3);
        ctx.fillStyle = '#d9a441';
        ctx.fillRect(p.x + 2, p.y + p.size - 4, (p.size - 4) * p.progress01, 3);
      }
      return;
    }
    ctx.fillStyle = '#6f4b32';
    ctx.fillRect(p.x + p.size * 0.18, p.y + p.size * 0.42, p.size * 0.64, p.size * 0.42);
    ctx.fillStyle = '#b06f3c';
    ctx.beginPath();
    ctx.moveTo(p.x + p.size * 0.08, p.y + p.size * 0.45);
    ctx.lineTo(p.x + p.size * 0.5, p.y + p.size * 0.12);
    ctx.lineTo(p.x + p.size * 0.92, p.y + p.size * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    if (p.ghost) {
      return;
    }
    if (!p.built) {
      // 공정률 막대
      ctx.fillStyle = '#10141a';
      ctx.fillRect(p.x + 2, p.y + p.size - 4, p.size - 4, 3);
      ctx.fillStyle = '#d9a441';
      ctx.fillRect(p.x + 2, p.y + p.size - 4, (p.size - 4) * p.progress01, 3);
    }
  },

  drawBuildingDamage(ctx, p) {
    ctx.save();
    ctx.strokeStyle = 'rgba(116,42,34,0.9)';
    ctx.lineWidth = Math.max(1.5, p.size / 18);
    ctx.beginPath();
    ctx.moveTo(p.x + p.size * 0.28, p.y + p.size * 0.2);
    ctx.lineTo(p.x + p.size * 0.48, p.y + p.size * 0.42);
    ctx.lineTo(p.x + p.size * 0.38, p.y + p.size * 0.62);
    ctx.moveTo(p.x + p.size * 0.7, p.y + p.size * 0.25);
    ctx.lineTo(p.x + p.size * 0.58, p.y + p.size * 0.48);
    ctx.lineTo(p.x + p.size * 0.73, p.y + p.size * 0.7);
    ctx.stroke();
    ctx.restore();
  },

  drawLivestock(ctx, p) {
    const colors: Record<LivestockId, string> = {
      chicken: '#e5dfc7',
      goat: '#9c8062',
      sheep: '#d8d2bd',
      pig: '#c88e7a',
      cattle: '#72543d',
      horse: '#8a5d3d',
    };
    const radius = p.species === 'chicken' ? 2.5 : p.species === 'cattle' || p.species === 'horse' ? 4.5 : 3.5;
    ctx.fillStyle = colors[p.species];
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, radius * 1.35, radius, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillRect(p.x + radius * 0.75, p.y - radius * 0.8, radius * 0.65, radius * 0.65);
  },

  drawCorpse(ctx, p) {
    ctx.save();
    ctx.fillStyle = '#5e3d2c';
    ctx.strokeStyle = '#291c17';
    ctx.lineWidth = 1;
    ctx.fillRect(p.x + p.size * 0.12, p.y + p.size * 0.28, p.size * 0.76, p.size * 0.44);
    ctx.strokeRect(p.x + p.size * 0.12, p.y + p.size * 0.28, p.size * 0.76, p.size * 0.44);
    ctx.restore();
  },

  drawForeignStructure() {
    return false;
  },

  drawResident(ctx, p) {
    if (p.selected) {
      ctx.strokeStyle = '#d9a441';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
    }
    ctx.fillStyle = p.foreignFaction
      ? FACTIONS.find(faction => faction.name === p.foreignFaction)?.color ?? '#d2a958'
      : JOB_COLORS[p.job];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.sick ? '#e06c5c' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (p.carrying && p.showCargoMarker !== false) {
      ctx.fillStyle = '#f0e6c8';
      ctx.fillRect(p.x - 1.5, p.y - 6, 3, 3);
    }
  },

  drawExpedition(ctx, p) {
    const visible = Math.min(p.members.length, 5);
    for (let i = 0; i < visible; i++) {
      const member = p.members[i];
      const ox = ((i * 17) % 11 - 5) * 1.25;
      const oy = ((i * 29) % 9 - 4) * 1.1;
      ctx.fillStyle = JOB_COLORS[member.job];
      ctx.beginPath();
      ctx.arc(p.x + ox, p.y + oy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1f3f5d';
      ctx.stroke();
    }
    ctx.strokeStyle = '#324c62';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(p.x + 7, p.y + 4);
    ctx.lineTo(p.x + 7, p.y - 13);
    ctx.stroke();
    ctx.fillStyle = '#4f83a8';
    ctx.fillRect(p.x + 8, p.y - 13, 9, 6);
    if (p.total > visible) {
      ctx.fillStyle = '#dfeaf2';
      ctx.font = 'bold 8px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(p.total), p.x, p.y - 11);
    }
  },

  drawRaiders(ctx, p) {
    for (let i = 0; i < p.count; i++) {
      const ox = ((i * 17) % 9 - 4) * 1.4;
      const oy = ((i * 29) % 9 - 4) * 1.4;
      ctx.fillStyle = '#8a2020';
      ctx.beginPath();
      ctx.arc(p.x + ox, p.y + oy, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    if (p.spotted) {
      ctx.fillStyle = '#e05f5f';
      ctx.font = 'bold 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', p.x, p.y - 10);
    }
  },
};
