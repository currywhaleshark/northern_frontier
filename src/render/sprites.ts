// 스프라이트 추상화 계층
//
// 나중에 실제 그래픽(스프라이트 아틀라스, 타일셋)을 붙일 때는
// SpriteAPI를 구현한 객체 하나만 새로 만들어 renderer에 넘기면 된다.
// 게임 로직과 렌더러는 "무엇을 그릴지"만 알고, "어떻게 그릴지"는 여기서 결정한다.
// 현재 구현(placeholderSprites)은 단색 사각형 + 이모지 임시 그래픽이다.
import { BUILDING_DEFS } from '../game/buildings';
import { FACTIONS, JOB_COLORS } from '../game/constants';
import type { BuildingTypeId, ForeignSiteStatus, ForeignSiteType, Gender, JobId, LifeStage, LivestockId, Rank, Season, SpecialResidentId, Terrain } from '../game/types';
import type { TreeStage } from '../game/forestGrowth';
import type { MineralResource, MineralVisualTier } from '../game/minerals';
import type { MilitiaWeaponSpriteId } from './militiaWeaponAssets';
import type { MountainProfile, TreeSpecies } from './terrainGrowthVisuals';

// 계절별 지형 팔레트 (임시 그래픽용)
const TERRAIN_PALETTES: Record<Season, Record<Terrain, string>> = {
  spring: {
    forest: '#2f5d3a', plain: '#7c8b58', river: '#3e6f9e', mountain: '#6d6a63',
    fertile: '#8a7a45', rock: '#7d7468', center: '#a08858',
  },
  summer: {
    forest: '#2a6b3a', plain: '#84955c', river: '#3a6fa8', mountain: '#6d6a63',
    fertile: '#96833f', rock: '#7d7468', center: '#a08858',
  },
  autumn: {
    forest: '#6b5a2e', plain: '#8f7f4e', river: '#3e6a92', mountain: '#69655e',
    fertile: '#7d6a3a', rock: '#78706a', center: '#a08858',
  },
  winter: {
    forest: '#46564e', plain: '#c3ccd3', river: '#a8cbdd', mountain: '#8d949c',
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
  // 강 타일 전용: 각 방향(대각선 포함)이 뭍인지 (물가 경계 표현용)
  banks?: {
    n: boolean; e: boolean; s: boolean; w: boolean;
    ne: boolean; se: boolean; sw: boolean; nw: boolean;
  };
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
  cartEquipped?: boolean;
  farmerAction?: 'till' | 'harvest' | 'oxPlow';
  selected: boolean;
  moving?: boolean;   // 이번 서브틱에 이동 중 (걷기 연출)
  working?: boolean;  // 작업 타이머가 진행 중인 제자리 작업 연출
  facing?: 1 | -1;    // 1 오른쪽, -1 왼쪽
  militiaWeapon?: MilitiaWeaponSpriteId;
  foreignFaction?: string;
  stage?: LifeStage | null;
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

export interface SpriteAPI {
  id: string; // 지형 레이어 캐시 키에 들어간다 — 스프라이트 세트가 바뀌면 다시 그린다
  drawTerrain(ctx: CanvasRenderingContext2D, p: TerrainDrawParams): void;
  drawTerrainProp?(ctx: CanvasRenderingContext2D, p: TerrainDrawParams): void;
  drawTerrainOverlay?(ctx: CanvasRenderingContext2D, p: TerrainDrawParams): void;
  drawBuilding(ctx: CanvasRenderingContext2D, p: BuildingDrawParams): void;
  drawBuildingDamage(ctx: CanvasRenderingContext2D, p: BuildingDamageDrawParams): void;
  drawLivestock(ctx: CanvasRenderingContext2D, p: LivestockDrawParams): void;
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
    if (p.terrain === 'river' && p.winter && !p.frozenRiver) color = '#3e6f9e'; // 해빙기: 다시 물
    ctx.fillStyle = color;
    ctx.fillRect(p.x, p.y, p.size, p.size);

    // 겨울 언 강: 얼음 균열
    if (p.terrain === 'river' && p.frozenRiver) {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.beginPath();
      ctx.moveTo(p.x + 3, p.y + p.size - 4);
      ctx.lineTo(p.x + p.size - 3, p.y + 4);
      ctx.stroke();
    }
    // 눈 얼룩 (결정적 패턴)
    if (p.winter && p.terrain !== 'river' && (p.tileX * 7 + p.tileY * 13) % 5 === 0) {
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
    const def = BUILDING_DEFS[p.type];
    const cx = p.x + p.size / 2, cy = p.y + p.size / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${p.size - 2}px serif`;
    if (p.ghost) {
      ctx.globalAlpha = 0.8;
      ctx.fillText(def.emoji, cx, cy);
      ctx.globalAlpha = 1;
      return;
    }
    if (!p.built) {
      ctx.globalAlpha = 0.5;
      ctx.fillText(def.emoji, cx, cy);
      ctx.globalAlpha = 1;
      // 공정률 막대
      ctx.fillStyle = '#10141a';
      ctx.fillRect(p.x + 2, p.y + p.size - 4, p.size - 4, 3);
      ctx.fillStyle = '#d9a441';
      ctx.fillRect(p.x + 2, p.y + p.size - 4, (p.size - 4) * p.progress01, 3);
    } else {
      ctx.fillText(def.emoji, cx, cy);
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
    const icons: Record<LivestockId, string> = {
      chicken: '🐔',
      goat: '🐐',
      sheep: '🐑',
      pig: '🐖',
      cattle: '🐄',
      horse: '🐎',
    };
    ctx.font = '16px serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icons[p.species], p.x, p.y);
  },

  drawForeignStructure() {
    return false;
  },

  drawResident(ctx, p) {
    ctx.fillStyle = p.foreignFaction
      ? FACTIONS.find(faction => faction.name === p.foreignFaction)?.color ?? '#d2a958'
      : JOB_COLORS[p.job];
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = p.sick ? '#e06c5c' : 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.stroke();
    if (p.carrying) {
      ctx.fillStyle = '#f0e6c8';
      ctx.fillRect(p.x - 1.5, p.y - 6, 3, 3);
    }
    if (p.selected) {
      ctx.strokeStyle = '#d9a441';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 5.5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.lineWidth = 1;
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
