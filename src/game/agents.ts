// 주민 에이전트 시뮬레이션 — 서브틱 단위의 이동, 작업, 운반
// 자원은 창고/거점에 짐을 부려야 마을 비축량에 더해진다.
import { CONFIG } from './config';
import { BUILDING_DEFS } from './buildings';
import { addLog } from './events';
import { collectHuntableTiles } from './habitats';
import { makeRng } from './map';
import { getSeason } from './seasons';
import { outdoorMult } from './weather';
import { processableAmount } from './processing';
import type {
  BuildingTypeId, GameState, Resident, ResourceId, Season, Tile,
} from './types';

export const SUBTICKS = CONFIG.agents.subticksPerDay;

interface Ctx {
  season: Season;
  outdoor: number;
  tMod: number;   // 도구 보정
  mMod: number;   // 사기 보정
  rng: () => number;
  centerId: number;
  huntable: Map<string, number>; // 사냥 가능 타일 ("x,y") → 수확 배율 — 서식지 범위/크기와 연동
}

const PRODUCING_JOBS = [
  'woodcutter', 'hunter', 'farmer', 'builder', 'smith', 'miner', 'fisher',
  'charcoalBurner', 'herder', 'herbalist', 'hauler',
];
const OUTDOOR_JOBS = [
  'woodcutter', 'hunter', 'herbalist', 'farmer', 'builder', 'miner', 'fisher',
  'charcoalBurner', 'herder',
];

// ─────────────────────────── 공통 헬퍼 ───────────────────────────

function effOf(r: Resident): number {
  return 1 + (r.skills[r.job] ?? 0) * CONFIG.production.skillEffect;
}

function gainSkillTick(r: Resident): void {
  const cur = r.skills[r.job] ?? 0;
  r.skills[r.job] = Math.min(1, cur + CONFIG.production.skillGainPerDay / 5);
}

function carryTotal(r: Resident): number {
  return Object.values(r.carrying).reduce((s: number, v) => s + (v ?? 0), 0);
}

function addCarry(r: Resident, res: ResourceId, amt: number): void {
  r.carrying[res] = (r.carrying[res] ?? 0) + amt;
}

function depositAll(state: GameState, r: Resident): void {
  for (const [res, amt] of Object.entries(r.carrying)) {
    state.resources[res as ResourceId] += amt ?? 0;
  }
  r.carrying = {};
}

// 직업 변경/사망 등으로 에이전트 상태를 정리 (짐은 마을 몫으로 귀속)
export function resetAgent(state: GameState, r: Resident): void {
  depositAll(state, r);
  r.path = [];
  r.phase = 'rest';
  r.workTimer = 0;
  r.targetId = null;
}

// ─────────────────────────── 이동/경로 ───────────────────────────

export function isPassable(state: GameState, x: number, y: number): boolean {
  const t = state.map[y]?.[x];
  if (!t) return false;
  if (t.terrain === 'mountain') return false;
  if (t.terrain === 'river') {
    const hasRiverWorksite = t.buildingId != null && state.buildings.some(b =>
      b.id === t.buildingId && b.built && (b.type === 'bridge' || b.type === 'ferry'));
    if (hasRiverWorksite) return true;
    // 겨울 언 강 위는 걸어서 건널 수 있다 (해빙기 홍수 제외)
    return getSeason(state.day) === 'winter' && state.weather !== 'thawFlood';
  }
  return true;
}

const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// BFS: 조건을 만족하는 가장 가까운 타일까지의 경로 (시작 타일 제외)
// passable을 넘기면 통행 규칙을 바꿀 수 있다 (습격자는 강을 건넌다)
export function findPath(
  state: GameState,
  sx: number,
  sy: number,
  isGoal: (t: Tile) => boolean,
  passable?: (x: number, y: number) => boolean,
): { x: number; y: number }[] | null {
  const canPass = passable ?? ((x: number, y: number) => isPassable(state, x, y));
  const w = CONFIG.map.width, h = CONFIG.map.height;
  const start = sy * w + sx;
  const prev = new Int32Array(w * h).fill(-2);
  prev[start] = -1;
  const queue: number[] = [start];
  let head = 0;
  while (head < queue.length) {
    const cur = queue[head++];
    const cx = cur % w, cy = (cur - cx) / w;
    if (cur !== start && isGoal(state.map[cy][cx])) {
      const path: { x: number; y: number }[] = [];
      let node = cur;
      while (node !== start) {
        path.push({ x: node % w, y: (node - (node % w)) / w });
        node = prev[node];
      }
      path.reverse();
      return path;
    }
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const ni = ny * w + nx;
      if (prev[ni] !== -2) continue;
      if (!canPass(nx, ny)) continue;
      prev[ni] = cur;
      queue.push(ni);
    }
  }
  return null;
}

const bfs = findPath;

function moveSteps(state: GameState, ctx: Ctx): number {
  let sp: number = CONFIG.agents.moveSpeed;
  if (ctx.season === 'winter') sp = CONFIG.agents.moveSpeedWinter;
  if (state.weather === 'blizzard' || state.weather === 'heavySnow') {
    sp = Math.min(sp, CONFIG.agents.moveSpeedSnow);
  }
  const n = Math.floor(sp);
  return n + (ctx.rng() < sp - n ? 1 : 0);
}

type GoResult = 'arrived' | 'moving' | 'stuck';

// 목표 조건을 향해 이동. 이미 목표 위면 arrived.
function goTo(state: GameState, r: Resident, ctx: Ctx, isGoal: (t: Tile) => boolean): GoResult {
  if (isGoal(state.map[r.y][r.x])) { r.path = []; return 'arrived'; }
  if (r.path.length === 0) {
    const p = bfs(state, r.x, r.y, isGoal);
    if (!p) return 'stuck';
    r.path = p;
  }
  const steps = moveSteps(state, ctx);
  for (let i = 0; i < steps && r.path.length > 0; i++) {
    const next = r.path[0];
    if (!isPassable(state, next.x, next.y)) { r.path = []; return 'moving'; } // 다음 틱에 재탐색
    r.path.shift();
    r.x = next.x; r.y = next.y;
  }
  return isGoal(state.map[r.y][r.x]) ? 'arrived' : 'moving';
}

// 하역 거점: 중심지 + 창고 (+직업별 거점 건물)
function depositGoal(state: GameState, extra: BuildingTypeId[]): (t: Tile) => boolean {
  const ids = new Set<number>();
  for (const b of state.buildings) {
    if (!b.built) continue;
    if (b.type === 'center' || b.type === 'storehouse' || extra.includes(b.type)) ids.add(b.id);
  }
  return t => t.buildingId != null && ids.has(t.buildingId);
}

function buildingGoal(id: number): (t: Tile) => boolean {
  return t => t.buildingId === id;
}

function goToCenter(state: GameState, r: Resident, ctx: Ctx): GoResult {
  return goTo(state, r, ctx, buildingGoal(ctx.centerId));
}

// ─────────────────────────── 채집형 작업 공통 루틴 ───────────────────────────

interface GatherOpts {
  goal: (t: Tile) => boolean;
  workTicks: number;
  yieldRes: ResourceId;
  yieldAmt: number | ((tile: Tile) => number); // 보정 전 1회 채집량 (타일에 따라 달라질 수 있다)
  cap: number;            // 이만큼 지면 하역하러 간다
  depositExtra: BuildingTypeId[];
  taskWork: string;
  taskMove: string;
  taskHaul: string;
  onHarvest?: (tile: Tile, r: Resident) => void;
}

function gatherJob(state: GameState, r: Resident, ctx: Ctx, o: GatherOpts): void {
  // 짐이 찼거나 하역 중이면 거점으로
  if (carryTotal(r) >= o.cap || (r.phase === 'toDeposit' && carryTotal(r) > 0)) {
    r.phase = 'toDeposit';
    r.task = o.taskHaul;
    const st = goTo(state, r, ctx, depositGoal(state, o.depositExtra));
    if (st === 'arrived' || st === 'stuck') {
      depositAll(state, r); // 고립되면 그 자리에서 부린다
      r.phase = 'rest';
    }
    return;
  }
  // 작업 중
  if (r.phase === 'working') {
    if (!o.goal(state.map[r.y][r.x])) { r.phase = 'rest'; return; } // 서 있던 타일이 변함(벌목 소진 등)
    r.task = o.taskWork;
    r.workTimer -= ctx.outdoor; // 궂은 날씨엔 일이 더디다
    gainSkillTick(r);
    if (r.workTimer <= 0) {
      const base = typeof o.yieldAmt === 'function' ? o.yieldAmt(state.map[r.y][r.x]) : o.yieldAmt;
      const amt = base * ctx.tMod * ctx.mMod * effOf(r);
      addCarry(r, o.yieldRes, amt);
      o.onHarvest?.(state.map[r.y][r.x], r);
      r.phase = 'rest';
    }
    return;
  }
  // 작업지 탐색/이동
  const st = goTo(state, r, ctx, o.goal);
  if (st === 'arrived') {
    r.phase = 'working';
    r.workTimer = o.workTicks;
    r.task = o.taskWork;
  } else if (st === 'stuck') {
    r.phase = 'rest';
    r.task = '갈 곳 없음';
    if (carryTotal(r) > 0) r.phase = 'toDeposit';
  } else {
    r.phase = 'toWork';
    r.task = o.taskMove;
  }
}

// ─────────────────────────── 직업별 행동 ───────────────────────────

function woodcutterTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  gatherJob(state, r, ctx, {
    goal: t => t.terrain === 'forest',
    workTicks: a.work.chop,
    yieldRes: 'wood',
    yieldAmt: a.yields.wood * CONFIG.seasons.woodMult[ctx.season],
    cap: a.carryCap.wood,
    depositExtra: ['lumberCamp'],
    taskWork: '벌목 중', taskMove: '숲으로 이동', taskHaul: '목재 운반',
    onHarvest: (tile) => {
      // 벌목한 숲은 이따금 개활지가 된다
      if (ctx.rng() < a.forestDepleteChance && tile.buildingId == null) tile.terrain = 'plain';
    },
  });
}

function hunterTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  gatherJob(state, r, ctx, {
    // 짐승이 사는 서식지 범위 안에서만 사냥이 된다 (렌더러의 서식지 원과 동일 판정)
    goal: t => ctx.huntable.has(`${t.x},${t.y}`),
    workTicks: a.work.hunt,
    yieldRes: 'game',
    // 서식지가 클수록 사냥감이 풍부하다
    yieldAmt: t => a.yields.game * CONFIG.seasons.gameMult[ctx.season] * (ctx.huntable.get(`${t.x},${t.y}`) ?? 0),
    cap: a.carryCap.game,
    depositExtra: ['huntLodge'],
    taskWork: '사냥 중', taskMove: '서식지로 이동', taskHaul: '사냥감 운반',
    onHarvest: (_tile, res) => {
      if (ctx.rng() < 0.06) {
        addLog(state, `사냥꾼 ${res.name}이(가) 노루를 잡아 식량과 가죽을 가져옵니다.`, 'good');
      }
    },
  });
}

function herbalistTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  if (ctx.season === 'winter') {
    r.task = '마른 약초 손질';
    if (carryTotal(r) > 0) { r.phase = 'toDeposit'; }
    goToCenter(state, r, ctx);
    if (carryTotal(r) > 0 && state.map[r.y][r.x].buildingId === ctx.centerId) depositAll(state, r);
    return;
  }
  gatherJob(state, r, ctx, {
    goal: t => t.terrain === 'forest',
    workTicks: a.work.herb,
    yieldRes: 'herbs',
    yieldAmt: a.yields.herbs,
    cap: a.carryCap.herbs,
    depositExtra: ['herbHut'],
    taskWork: '약초 채집 중', taskMove: '산기슭으로 이동', taskHaul: '약초 운반',
  });
}

function farmerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const p = CONFIG.production;
  const fields = state.buildings.filter(b => b.type === 'field' && b.built);

  if (ctx.season === 'winter' || fields.length === 0) {
    r.task = ctx.season === 'winter' ? '겨울 채비' : '밭 없음';
    if (carryTotal(r) > 0) {
      const st = goTo(state, r, ctx, depositGoal(state, []));
      if (st === 'arrived' || st === 'stuck') depositAll(state, r);
      return;
    }
    goToCenter(state, r, ctx);
    return;
  }

  // 곡물을 지고 있으면 하역
  if (carryTotal(r) >= a.carryCap.grain || (r.phase === 'toDeposit' && carryTotal(r) > 0)) {
    r.phase = 'toDeposit';
    r.task = '곡물 운반';
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (st === 'arrived' || st === 'stuck') { depositAll(state, r); r.phase = 'rest'; }
    return;
  }

  if (ctx.season === 'autumn') {
    // 수확: 성장도가 남은 밭에서 곡물을 거둔다
    const target = nearestBuilding(r, fields.filter(f => f.fieldGrowth > 0.5));
    if (!target) {
      if (carryTotal(r) > 0) { r.phase = 'toDeposit'; return; }
      r.task = '수확 마무리';
      goToCenter(state, r, ctx);
      return;
    }
    const st = goTo(state, r, ctx, buildingGoal(target.id));
    if (st === 'arrived') {
      r.task = '수확 중';
      const take = Math.min(target.fieldGrowth, a.work.harvestPerSubtick * ctx.outdoor * effOf(r));
      target.fieldGrowth -= take;
      const tile = state.map[target.y][target.x];
      const fertile = tile.terrain === 'fertile' ? p.fertileBonus : 1;
      addCarry(r, 'grain', (take / 100) * p.fieldGrainYield * fertile * ctx.mMod);
      gainSkillTick(r);
    } else {
      r.task = st === 'stuck' ? '길이 막힘' : '밭으로 이동';
    }
    return;
  }

  // 봄/여름: 아직 안 자란 밭을 돌본다
  const target = nearestBuilding(r, fields.filter(f => f.fieldGrowth < 100));
  if (!target) { r.task = '김매기'; goToCenter(state, r, ctx); return; }
  const st = goTo(state, r, ctx, buildingGoal(target.id));
  if (st === 'arrived') {
    r.task = '농사 중';
    const weatherGrow = state.weather === 'rain' ? 1.2 : state.weather === 'frost' ? 0.7 : 1;
    target.fieldGrowth = Math.min(100, target.fieldGrowth + a.work.growPerSubtick * weatherGrow * effOf(r));
    gainSkillTick(r);
  } else {
    r.task = st === 'stuck' ? '길이 막힘' : '밭으로 이동';
  }
}

function builderTick(state: GameState, r: Resident, ctx: Ctx): void {
  const sites = state.buildings.filter(b => !b.built);
  const target = nearestBuilding(r, sites);
  if (!target) { r.task = '지을 것 없음'; goToCenter(state, r, ctx); return; }
  const st = goTo(state, r, ctx, buildingGoal(target.id));
  if (st === 'arrived') {
    r.task = '건설 중';
    const def = BUILDING_DEFS[target.type];
    target.progress += CONFIG.agents.work.buildPerSubtick * effOf(r) * ctx.tMod * Math.max(0.5, ctx.outdoor);
    gainSkillTick(r);
    if (target.progress >= def.buildDays) {
      target.built = true;
      addLog(state, `${def.name}이(가) 완공되었습니다.`, 'good');
      if (def.winterBonus) {
        addLog(state, '온돌집 덕분에 주민들의 체온 손실이 줄어들 것입니다.', 'good');
      }
    }
  } else {
    r.task = st === 'stuck' ? '길이 막힘' : '공사장으로 이동';
  }
}

function haulerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const a = CONFIG.agents;

  // 채석해 온 돌 하역
  if (carryTotal(r) > 0) {
    r.phase = 'toDeposit';
    r.task = '돌 운반';
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (st === 'arrived' || st === 'stuck') { depositAll(state, r); r.phase = 'rest'; }
    return;
  }

  const processableGame = processableAmount(state, 'game');
  const processableGrain = processableAmount(state, 'grain');
  const processableWood = processableAmount(state, 'wood');
  const hasProcessing = processableGame > 0.2 || processableGrain > 0.2 || processableWood > 0.5;
  if (hasProcessing) {
    // 창고/중심지에서 가공 작업. 채석 이동/작업 중 새 가공물이 생기면 생존 자원 처리를 우선한다.
    if (r.phase === 'toWork' || r.phase === 'working' || r.phase === 'toDeposit') {
      r.path = [];
      r.workTimer = 0;
    }
    const st = goTo(state, r, ctx, depositGoal(state, []));
    if (st !== 'arrived') {
      r.phase = st === 'stuck' ? 'rest' : 'toWork';
      r.task = st === 'stuck' ? '길이 막힘' : '창고로 이동';
      return;
    }
    r.phase = 'rest';
    const eff = effOf(r) * ctx.mMod;
    let label = '창고 정리';
    const g = Math.min(processableAmount(state, 'game'), (p.haulerGamePerDay / 5) * eff);
    if (g > 0) {
      state.resources.game -= g;
      state.resources.food += g * p.foodPerGame;
      state.resources.hide += g * p.hidePerGame;
      label = '사냥감 손질';
    }
    const q = Math.min(processableAmount(state, 'grain'), (p.haulerGrainPerDay / 5) * eff);
    if (q > 0) {
      state.resources.grain -= q;
      state.resources.food += q;
      label = '곡물 도정';
    }
    const w = Math.min(processableAmount(state, 'wood'), (p.haulerWoodToFirewood / 5) * eff);
    if (w > 0) {
      state.resources.wood -= w;
      state.resources.firewood += w * p.firewoodPerWood;
      label = '장작 패기';
    }
    r.task = label;
    gainSkillTick(r);
    return;
  }

  // 가공할 것이 없으면 채석
  if (state.resources.stone < p.stoneReserveTarget) {
    gatherJob(state, r, ctx, {
      goal: t => t.terrain === 'rock',
      workTicks: a.work.quarry,
      yieldRes: 'stone',
      yieldAmt: a.yields.stone,
      cap: a.carryCap.stone,
      depositExtra: [],
      taskWork: '채석 중', taskMove: '바위 지대로 이동', taskHaul: '돌 운반',
    });
    return;
  }
  r.task = '대기';
  goToCenter(state, r, ctx);
}

function smithTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const a = CONFIG.agents;
  const smithy = state.buildings.find(b => b.type === 'smithy' && b.built);
  const pop = state.residents.filter(x => x.alive).length;
  const hasMinerSupply = state.buildings.some(b => b.type === 'mine' && b.built) &&
    state.residents.some(x => x.alive && !x.sick && x.health >= 20 && x.job === 'miner');
  // 도구는 생산직 수(대략 인구의 70%)만큼 있으면 충분 — 그 이상이면 철을 비축한다
  const needTools = state.resources.tools < pop * 0.7;

  // 캐 온 철 하역 (대장간도 하역 거점). 채광꾼이 있으면 들고 있던 철은 바로 내려놓고 대장간으로 복귀한다.
  if (carryTotal(r) > 0 && (r.phase === 'toDeposit' || hasMinerSupply)) {
    r.task = '철 운반';
    const st = goTo(state, r, ctx, depositGoal(state, ['smithy']));
    if (st === 'arrived' || st === 'stuck') { depositAll(state, r); r.phase = 'rest'; }
    return;
  }

  const rate = (p.toolsPerDay / 5) * effOf(r) * ctx.mMod;
  if (smithy && needTools && processableAmount(state, 'iron') >= rate && processableAmount(state, 'wood') >= rate) {
    const st = goTo(state, r, ctx, buildingGoal(smithy.id));
    if (st === 'arrived') {
      r.task = '도구 제작 중';
      state.resources.iron -= rate;
      state.resources.wood -= rate;
      state.resources.tools += rate;
      gainSkillTick(r);
    } else {
      r.task = st === 'stuck' ? '길이 막힘' : '대장간으로 이동';
    }
    return;
  }

  if (smithy && hasMinerSupply) {
    r.path = [];
    r.workTimer = 0;
    const st = goTo(state, r, ctx, buildingGoal(smithy.id));
    if (st === 'arrived') {
      r.phase = 'rest';
      r.task = needTools
        ? (processableAmount(state, 'iron') < rate ? '철 대기' : '재료 대기')
        : '도구 충분';
    } else {
      r.phase = st === 'stuck' ? 'rest' : 'toWork';
      r.task = st === 'stuck' ? '길이 막힘' : '대장간으로 이동';
    }
    return;
  }

  // 재료가 없거나 도구가 충분하면 철광 채굴
  const hasIron = state.map.some(row => row.some(t => t.terrain === 'rock' && t.hasIron));
  if (hasIron) {
    gatherJob(state, r, ctx, {
      goal: t => t.terrain === 'rock' && t.hasIron,
      workTicks: a.work.mine,
      yieldRes: 'iron',
      yieldAmt: a.yields.iron,
      cap: a.carryCap.iron,
      depositExtra: ['smithy'],
      taskWork: '철광 채굴 중', taskMove: '철광으로 이동', taskHaul: '철 운반',
      onHarvest: (_t, res) => addCarry(res, 'stone', a.yields.mineStone),
    });
    return;
  }
  r.task = '재료 없음';
  goToCenter(state, r, ctx);
}

function minerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  gatherJob(state, r, ctx, {
    goal: t => t.buildingId != null && state.buildings.some(b =>
      b.id === t.buildingId && b.built && b.type === 'mine'),
    workTicks: a.work.mine,
    yieldRes: state.map[r.y]?.[r.x]?.hasIron ? 'iron' : 'stone',
    yieldAmt: tile => tile.hasIron ? a.yields.iron : a.yields.stone,
    cap: state.map[r.y]?.[r.x]?.hasIron ? a.carryCap.iron : a.carryCap.stone,
    depositExtra: ['mine'],
    taskWork: '채광 중',
    taskMove: '채광장으로 이동',
    taskHaul: '광물 운반',
    onHarvest: (tile, worker) => {
      if (tile.hasIron) addCarry(worker, 'stone', a.yields.mineStone);
    },
  });
}

function fisherTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  const floodMult = state.weather === 'thawFlood' ? 0.25 : 1;
  gatherJob(state, r, ctx, {
    goal: t => t.buildingId != null && state.buildings.some(b =>
      b.id === t.buildingId && b.built && b.type === 'ferry'),
    workTicks: a.work.fish,
    yieldRes: 'food',
    yieldAmt: a.yields.fish * CONFIG.seasons.fishMult[ctx.season] * floodMult,
    cap: a.carryCap.food,
    depositExtra: ['ferry'],
    taskWork: '고기잡이 중',
    taskMove: '나루터로 이동',
    taskHaul: '물고기 운반',
  });
}

function charcoalBurnerTick(state: GameState, r: Resident, ctx: Ctx): void {
  const p = CONFIG.production;
  const kiln = nearestBuilding(r, state.buildings.filter(b => b.type === 'charcoalKiln' && b.built));
  if (!kiln) {
    r.task = '숯가마 없음';
    goToCenter(state, r, ctx);
    return;
  }

  const st = goTo(state, r, ctx, buildingGoal(kiln.id));
  if (st !== 'arrived') {
    r.phase = st === 'stuck' ? 'rest' : 'toWork';
    r.task = st === 'stuck' ? '길이 막힘' : '숯가마로 이동';
    return;
  }

  const wood = Math.min(
    processableAmount(state, 'wood'),
    (p.charcoalWoodPerDay / 5) * effOf(r) * ctx.mMod,
  );
  if (wood <= 0.05) {
    r.phase = 'rest';
    r.task = '목재 대기';
    return;
  }

  state.resources.wood -= wood;
  state.resources.firewood += wood * p.charcoalFirewoodPerWood;
  r.phase = 'working';
  r.task = '숯 굽기';
  gainSkillTick(r);
}

function herderTick(state: GameState, r: Resident, ctx: Ctx): void {
  const a = CONFIG.agents;
  gatherJob(state, r, ctx, {
    goal: t => t.buildingId != null && state.buildings.some(b =>
      b.id === t.buildingId && b.built && b.type === 'stable'),
    workTicks: a.work.herd,
    yieldRes: 'food',
    yieldAmt: a.yields.herdFood,
    cap: a.carryCap.food,
    depositExtra: ['stable'],
    taskWork: '가축 돌보기',
    taskMove: '축사로 이동',
    taskHaul: '축산물 운반',
    onHarvest: (_tile, worker) => addCarry(worker, 'hide', a.yields.herdHide),
  });
}

function watchmanTick(state: GameState, r: Resident, ctx: Ctx): void {
  r.task = '경계 근무';
  // 방어 시설 사이를 순찰한다
  const posts = state.buildings.filter(b =>
    b.built && (BUILDING_DEFS[b.type].defense > 0 || b.type === 'center'));
  if (posts.length === 0) { goToCenter(state, r, ctx); return; }
  let target = posts.find(b => b.id === r.targetId);
  if (!target || (r.workTimer <= 0 && state.map[r.y][r.x].buildingId === target.id)) {
    target = posts[Math.floor(ctx.rng() * posts.length)];
    r.targetId = target.id;
    r.path = [];
    r.workTimer = 3; // 도착 후 머무는 시간
  }
  const st = goTo(state, r, ctx, buildingGoal(target.id));
  if (st === 'arrived') r.workTimer -= 1;
  else if (st === 'stuck') r.targetId = null;
}

function militiaTick(state: GameState, r: Resident, ctx: Ctx): void {
  r.task = '조련 중';
  const garrison = state.buildings.find(b => b.type === 'garrison' && b.built);
  if (garrison) goTo(state, r, ctx, buildingGoal(garrison.id));
  else goToCenter(state, r, ctx);
}


function battleAgentTick(state: GameState, r: Resident, ctx: Ctx): void {
  const battle = state.battle;
  if (!battle) return;
  if (battle.phase === 'muster') {
    r.task = '출전 중';
    const st = goTo(state, r, ctx, tile =>
      Math.abs(tile.x - battle.frontX) + Math.abs(tile.y - battle.frontY) <= 2);
    if (st === 'stuck') {
      r.path = [];
      r.task = '전선 대기';
    }
    return;
  }
  r.path = [];
  r.phase = 'working';
  r.task = '전투 중';
}

function idleTick(state: GameState, r: Resident, ctx: Ctx): void {
  r.task = '대기';
  const center = state.buildings.find(b => b.id === ctx.centerId);
  if (center && Math.abs(r.x - center.x) + Math.abs(r.y - center.y) > 6) {
    goToCenter(state, r, ctx);
    return;
  }
  // 마을 언저리를 어슬렁거린다
  if (ctx.rng() < 0.35) {
    const [dx, dy] = DIRS[Math.floor(ctx.rng() * DIRS.length)];
    if (isPassable(state, r.x + dx, r.y + dy)) { r.x += dx; r.y += dy; }
  }
}

function nearestBuilding<T extends { x: number; y: number }>(r: Resident, list: T[]): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const b of list) {
    const d = Math.abs(b.x - r.x) + Math.abs(b.y - r.y);
    if (d < bestD) { bestD = d; best = b; }
  }
  return best;
}

// ─────────────────────────── 틱 진입점 ───────────────────────────

export function agentsTick(state: GameState): void {
  const rng = makeRng(state.seed + state.day * 7919 + state.subTick * 101 + 7);
  const season = getSeason(state.day);
  const living = state.residents.filter(r => r.alive);
  if (living.length === 0) return;

  const producers = living.filter(r => PRODUCING_JOBS.includes(r.job) && !r.sick && r.health >= 20).length;
  const t = state.resources.tools;
  const tMod = producers <= 0 || t >= producers ? 1 : 0.6 + 0.4 * (t / producers);
  const mAvg = living.reduce((s, r) => s + r.morale, 0) / living.length;
  const center = state.buildings.find(b => b.type === 'center');

  const ctx: Ctx = {
    season,
    outdoor: outdoorMult(state.weather),
    tMod,
    mMod: 0.8 + (mAvg / 100) * 0.4,
    rng,
    centerId: center ? center.id : -1,
    huntable: collectHuntableTiles(state.map, state.habitats, CONFIG.agents.hunting),
  };

  for (const r of living) {
    // 보간용 직전 위치 기록
    r.px = r.x;
    r.py = r.y;
    // 병자/중상자는 마을 중심에서 앓는다
    if (r.sick || r.health < 20) {
      r.task = '앓아누움';
      if (carryTotal(r) > 0) depositAll(state, r); // 짐은 이웃이 거둬 간다
      goToCenter(state, r, ctx);
      continue;
    }
    // 전투에 징집된 주민은 직업 행동보다 전선 행동을 우선한다.
    if (state.battle?.defenderIds.includes(r.id)) {
      battleAgentTick(state, r, ctx);
      continue;
    }
    // 심한 악천후엔 실외 작업자는 대피한다
    if (OUTDOOR_JOBS.includes(r.job) && ctx.outdoor < CONFIG.agents.shelterThreshold) {
      r.task = '악천후 대피';
      goToCenter(state, r, ctx);
      continue;
    }
    switch (r.job) {
      case 'woodcutter': woodcutterTick(state, r, ctx); break;
      case 'hunter': hunterTick(state, r, ctx); break;
      case 'herbalist': herbalistTick(state, r, ctx); break;
      case 'farmer': farmerTick(state, r, ctx); break;
      case 'builder': builderTick(state, r, ctx); break;
      case 'hauler': haulerTick(state, r, ctx); break;
      case 'smith': smithTick(state, r, ctx); break;
      case 'miner': minerTick(state, r, ctx); break;
      case 'fisher': fisherTick(state, r, ctx); break;
      case 'charcoalBurner': charcoalBurnerTick(state, r, ctx); break;
      case 'herder': herderTick(state, r, ctx); break;
      case 'watchman': watchmanTick(state, r, ctx); break;
      case 'militia': militiaTick(state, r, ctx); break;
      default: idleTick(state, r, ctx); break;
    }
  }
}
