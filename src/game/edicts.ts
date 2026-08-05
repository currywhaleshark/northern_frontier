// 절목(節目) — 중심지에서 반포하는 시행 세칙. 개별 항목은 「~령(令)」.
// 첨사가 영을 내리면 관아 앞에 방(榜)이 붙고, 효과와 대가는 민심 내역과 같은 문법으로 노출된다.
// 평시(기본값)는 기존 거동과 완전히 동일해야 한다 — 절목을 한 번도 열지 않은 고을은 지금과 같은 게임이다.
// 계획: docs/DESIGN-2026-07-23-edict-system.md
import { countBuilt } from './buildings';
import { CONFIG } from './config';
import { addLog } from './events';
import { withJosa } from './josa';
import type { EdictId, EdictLevel, EdictState, GameState, MoraleFactor } from './types';

interface EdictLevelDef {
  level: EdictLevel;
  name: string;     // 절미 / 평시 / 후히
  summary: string;  // 효과와 대가 한 줄
}

interface EdictDef {
  id: EdictId;
  name: string;     // 절미령
  hanja: string;
  desc: string;
  levels: readonly EdictLevelDef[]; // 완화 → 평시 → 강화 순
}

const EDICT_CFG = CONFIG.edicts;

export const EDICT_ORDER: readonly EdictId[] = ['ration', 'fuelRation'];

export const EDICT_DEFS: Record<EdictId, EdictDef> = {
  ration: {
    id: 'ration',
    name: '절미령',
    hanja: '節米令',
    desc: '창고에서 내주는 하루 배급을 정한다. 아껴 먹으면 곳간은 버티지만 주민의 배와 몸이 먼저 상한다.',
    levels: [
      {
        level: 'generous',
        name: '후히',
        summary: `식량 소모 +${Math.round((EDICT_CFG.ration.generous.foodMult - 1) * 100)}%, `
          + `민심 +${EDICT_CFG.ration.generous.morale}`,
      },
      { level: 'normal', name: '평시', summary: '평소대로 먹인다' },
      {
        level: 'tight',
        name: '절미',
        summary: `식량 소모 ${Math.round((EDICT_CFG.ration.tight.foodMult - 1) * 100)}%, `
          + `민심 ${EDICT_CFG.ration.tight.morale} · 끼니를 거른 이가 생겨 배고픔과 건강이 서서히 무너진다`,
      },
    ],
  },
  fuelRation: {
    id: 'fuelRation',
    name: '절탄령',
    hanja: '節炭令',
    desc: '아궁이에 넣는 장작·숯을 제한한다. 연료는 남지만 체온이 떨어져 질병 위험이 커지고, '
      + '혹한·눈보라에는 배급이 더 야박해진다.',
    levels: [
      { level: 'normal', name: '평시', summary: '평소대로 지핀다' },
      {
        level: 'tight',
        name: '절탄',
        summary: `연료 소모 ${Math.round((EDICT_CFG.fuelRation.tight.fuelMult - 1) * 100)}%, `
          + `민심 ${EDICT_CFG.fuelRation.tight.morale} · 체온 하락과 질병 위험 증가`,
      },
    ],
  },
};

export function edictLevelDef(id: EdictId, level: EdictLevel): EdictLevelDef | undefined {
  return EDICT_DEFS[id].levels.find(candidate => candidate.level === level);
}

export function edictLevel(state: GameState, id: EdictId): EdictLevel {
  const level = state.edicts?.[id]?.level;
  return level && edictLevelDef(id, level) ? level : 'normal';
}

// 반포·변경일. 한 번도 손대지 않은 령은 null (첫 반포는 조령모개가 아니다)
export function edictSinceDay(state: GameState, id: EdictId): number | null {
  const since = state.edicts?.[id]?.sinceDay;
  return typeof since === 'number' && Number.isFinite(since) ? since : null;
}

// "12일째 시행 중" 표기용 — 반포일이 1일째
export function edictDaysInEffect(state: GameState, id: EdictId): number {
  const since = edictSinceDay(state, id);
  return since == null ? 0 : Math.max(1, state.day - since + 1);
}

interface ActiveEdict {
  id: EdictId;
  level: EdictLevel;
  days: number;
}

// 시행 중인 령 — 평시는 슬롯을 차지하지 않으므로 목록에서도 빠진다
export function activeEdicts(state: GameState): ActiveEdict[] {
  return EDICT_ORDER
    .map(id => ({ id, level: edictLevel(state, id), days: edictDaysInEffect(state, id) }))
    .filter(entry => entry.level !== 'normal');
}

// 관청 + 아전 — 아전의 실무 능력이 곧 행정력이다 (officeEfficiencyMultiplier와 같은 문법)
export function hasEdictClerk(state: GameState): boolean {
  if (countBuilt(state, 'office') === 0) return false;
  return state.residents.some(resident =>
    resident.alive && !resident.sick && resident.health >= 20 && resident.job === 'clerk');
}

export function edictSlotCapacity(state: GameState): number {
  const base = EDICT_CFG.slotsByRank[state.rank ?? 'settlement'] ?? 1;
  return base + (hasEdictClerk(state) ? EDICT_CFG.officeSlotBonus : 0);
}

export function edictSlotsUsed(state: GameState): number {
  return activeEdicts(state).length;
}

// 조령모개 방지 — 반포한 령은 한 계절을 지켜야 한다. 아전이 있으면 그 기간이 짧아진다.
export function edictHoldDays(state: GameState): number {
  const base = CONFIG.time.seasonDays;
  return Math.max(1, Math.round(base * (hasEdictClerk(state) ? EDICT_CFG.clerkHoldDaysMult : 1)));
}

export function edictHoldRemainingDays(state: GameState, id: EdictId): number {
  const since = edictSinceDay(state, id);
  if (since == null) return 0;
  return Math.max(0, edictHoldDays(state) - (state.day - since));
}

// 강제 변경은 허용한다 (대가는 조령모개 페널티). 막는 것은 슬롯 상한뿐.
export function edictChangeBlockReason(state: GameState, id: EdictId, level: EdictLevel): string | null {
  if (!edictLevelDef(id, level)) return '이 령에 없는 단계입니다';
  if (level === edictLevel(state, id)) return '이미 그대로 시행 중입니다';
  if (level === 'normal') return null; // 거두는 것은 언제나 가능
  // 이미 시행 중인 령의 단계만 바꾸는 것은 슬롯을 새로 쓰지 않는다
  const held = edictLevel(state, id) === 'normal' ? 0 : 1;
  if (edictSlotsUsed(state) - held + 1 > edictSlotCapacity(state)) {
    return `동시에 시행할 수 있는 령은 ${edictSlotCapacity(state)}개입니다. 다른 령을 먼저 거두십시오`;
  }
  return null;
}

// 반포·변경. 성공하면 null, 막혔으면 이유를 돌려준다.
export function setEdictLevel(state: GameState, id: EdictId, level: EdictLevel): string | null {
  const blocked = edictChangeBlockReason(state, id, level);
  if (blocked) return blocked;

  const def = EDICT_DEFS[id];
  const levelDef = edictLevelDef(id, level);
  const previousLevel = edictLevel(state, id);
  const whiplashDays = edictHoldRemainingDays(state, id);

  const edicts: Partial<Record<EdictId, EdictState>> = state.edicts ?? {};
  edicts[id] = { level, sinceDay: state.day };
  state.edicts = edicts;

  if (level === 'normal') {
    addLog(state, `관아 앞에 새 방이 붙었습니다 — ${withJosa(def.name, '을/를')} 거두었습니다.`, 'info', true);
  } else {
    addLog(
      state,
      `관아 앞에 방이 붙었습니다 — ${withJosa(def.name, '을/를')} 내렸습니다. (${levelDef?.name})`,
      'info',
      true,
    );
  }

  // 조령모개(朝令暮改) — 최소 유지 기간 안의 강제 변경은 사기와 명성을 깎는다
  if (whiplashDays > 0 && previousLevel !== level) {
    state.edictWhiplashUntil = state.day + EDICT_CFG.whiplashDays;
    state.resources.reputation = Math.max(0, state.resources.reputation + EDICT_CFG.whiplashReputation);
    addLog(
      state,
      '아침에 내린 영을 저녁에 바꾸니 주민들이 관아의 말을 믿지 않습니다. (조령모개)',
      'bad',
      true,
    );
  }
  return null;
}

// ── 일일 틱에서 조회하는 배율 ──

export function edictFoodRationMultiplier(state: GameState): number {
  const level = edictLevel(state, 'ration');
  if (level === 'tight') return EDICT_CFG.ration.tight.foodMult;
  if (level === 'generous') return EDICT_CFG.ration.generous.foodMult;
  return 1;
}

export function edictFuelRationMultiplier(state: GameState): number {
  if (edictLevel(state, 'fuelRation') !== 'tight') return 1;
  const tight = EDICT_CFG.fuelRation.tight;
  const harshWeather = state.weather === 'coldSnap' || state.weather === 'blizzard';
  return tight.fuelMult * (harshWeather ? tight.harshWeatherMult : 1);
}

// ── 민심 내역 ──

export function edictMoraleFactors(state: GameState): MoraleFactor[] {
  const factors: MoraleFactor[] = [];
  for (const active of activeEdicts(state)) {
    const def = EDICT_DEFS[active.id];
    const levelDef = edictLevelDef(active.id, active.level);
    const delta = active.id === 'ration'
      ? (active.level === 'tight' ? EDICT_CFG.ration.tight.morale : EDICT_CFG.ration.generous.morale)
      : EDICT_CFG.fuelRation.tight.morale;
    factors.push({
      id: `edict:${active.id}`,
      label: `${def.name}${levelDef && levelDef.level !== 'normal' ? ` (${levelDef.name})` : ''} · ${active.days}일째 시행`,
      unlocked: true,
      delta,
    });
  }
  if (state.day < (state.edictWhiplashUntil ?? 0)) {
    factors.push({
      id: 'edict:whiplash',
      label: '조령모개 (영을 자주 바꿈)',
      unlocked: true,
      delta: EDICT_CFG.whiplashMoralePenalty,
    });
  }
  return factors;
}
