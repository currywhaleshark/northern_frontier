// 절목(節目) — 중심지에서 반포하는 시행 세칙. 개별 항목은 「~령(令)」.
// 첨사가 영을 내리면 관아 앞에 방(榜)이 붙고, 효과와 대가는 민심 내역과 같은 문법으로 노출된다.
// 평시(기본값)는 기존 거동과 완전히 동일해야 한다 — 절목을 한 번도 열지 않은 고을은 지금과 같은 게임이다.
// 계획: docs/DESIGN-2026-07-23-edict-system.md
import { countBuilt } from './buildings';
import { CONFIG } from './config';
import { addLog } from './events';
import { withJosa } from './josa';
import type { EdictId, EdictLevel, EdictState, GameState, JobId, MoraleFactor, Resident } from './types';

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

export const EDICT_ORDER: readonly EdictId[] = [
  'ration', 'fuelRation', 'immigration', 'fireCode', 'curfew', 'elderCare', 'corvee',
];

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
  immigration: {
    id: 'immigration',
    name: '모민령',
    hanja: '募民令',
    desc: '떠도는 백성을 얼마나 적극적으로 불러들일지 정한다. 널리 받으면 일손은 빨리 늘지만 식량과 집이 빠듯해진다.',
    levels: [
      { level: 'generous', name: '널리 받음', summary: `무작위 이주 제안 +${Math.round((EDICT_CFG.immigration.generous.chanceMult - 1) * 100)}%, 민심 ${EDICT_CFG.immigration.generous.morale}` },
      { level: 'normal', name: '평시', summary: '평소대로 유민을 맞는다' },
      { level: 'tight', name: '엄히 가림', summary: `무작위 이주 제안 ${Math.round((EDICT_CFG.immigration.tight.chanceMult - 1) * 100)}%, 민심 ${EDICT_CFG.immigration.tight.morale}` },
    ],
  },
  fireCode: {
    id: 'fireCode',
    name: '방화령',
    hanja: '防火令',
    desc: '불씨와 화기 작업을 엄히 단속한다. 큰불은 줄지만 가마와 대장간 같은 작업장이 더디게 돈다.',
    levels: [
      { level: 'normal', name: '평시', summary: '평소대로 불씨를 다룬다' },
      { level: 'tight', name: '방화', summary: `발화 ${Math.round((EDICT_CFG.fireCode.tight.ignitionMult - 1) * 100)}% · 확산 ${Math.round((EDICT_CFG.fireCode.tight.spreadMult - 1) * 100)}% · 화기 작업장 생산 ${Math.round((EDICT_CFG.fireCode.tight.fireWorkMult - 1) * 100)}%` },
    ],
  },
  curfew: {
    id: 'curfew',
    name: '야금령',
    hanja: '夜禁令',
    desc: '해가 지면 마실을 금하고 귀가시킨다. 여가는 줄지만 집에서 삼는 수공업품은 늘어난다.',
    levels: [
      { level: 'normal', name: '평시', summary: '저녁 마실을 허용한다' },
      { level: 'tight', name: '야금', summary: `저녁 마실 금지 · 가내수공업 +${Math.round((EDICT_CFG.curfew.tight.homeCraftMult - 1) * 100)}% · 민심 ${EDICT_CFG.curfew.tight.morale}` },
    ],
  },
  elderCare: {
    id: 'elderCare',
    name: '휼로령',
    hanja: '恤老令',
    desc: '예순이 넘은 노인의 일을 덜고 돌봄을 명한다. 숙련 일손은 줄지만 노환과 질병을 덜 겪는다.',
    levels: [
      { level: 'normal', name: '평시', summary: '평소대로 노년의 일을 맡긴다' },
      { level: 'generous', name: '휼로', summary: `노년 노동 ${Math.round((EDICT_CFG.elderCare.generous.elderLaborMult - 1) * 100)}% · 노환 ${Math.round((EDICT_CFG.elderCare.generous.oldAgeDeathMult - 1) * 100)}% · 민심 +${EDICT_CFG.elderCare.generous.morale}` },
    ],
  },
  corvee: {
    id: 'corvee',
    name: '부역령',
    hanja: '賦役令',
    desc: '토목 공사가 급할 때 건축가와 운반꾼을 저녁 초반까지 붙든다. 공사는 빨라지지만 몸과 민심이 상한다.',
    levels: [
      { level: 'normal', name: '평시', summary: '해가 지면 일을 마친다' },
      { level: 'tight', name: '부역', summary: `건축가·운반꾼 저녁 ${EDICT_CFG.corvee.tight.eveningSubticks}틱 연장 · 민심 ${EDICT_CFG.corvee.tight.morale}` },
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

  // 조령모개(朝令暮改) — 최소 유지 기간 안의 강제 변경은 민심과 명성을 깎는다
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

export function edictImmigrationChanceMultiplier(state: GameState): number {
  const level = edictLevel(state, 'immigration');
  if (level === 'generous') return EDICT_CFG.immigration.generous.chanceMult;
  if (level === 'tight') return EDICT_CFG.immigration.tight.chanceMult;
  return 1;
}

export function edictImmigrationRejectionReputationMultiplier(state: GameState): number {
  return edictLevel(state, 'immigration') === 'generous'
    ? EDICT_CFG.immigration.generous.rejectionReputationMult
    : 1;
}

export function edictFireIgnitionMultiplier(state: Pick<GameState, 'edicts'>): number {
  return edictLevel(state as GameState, 'fireCode') === 'tight' ? EDICT_CFG.fireCode.tight.ignitionMult : 1;
}

export function edictFireSpreadMultiplier(state: GameState): number {
  return edictLevel(state, 'fireCode') === 'tight' ? EDICT_CFG.fireCode.tight.spreadMult : 1;
}

const FIRE_USING_JOBS = new Set<JobId>(['potter', 'saltMaker', 'smith', 'charcoalBurner', 'powderMaker']);

export function edictFireWorkMultiplier(state: GameState, job: JobId): number {
  return edictLevel(state, 'fireCode') === 'tight' && FIRE_USING_JOBS.has(job)
    ? EDICT_CFG.fireCode.tight.fireWorkMult
    : 1;
}

export function edictCurfewActive(state: GameState): boolean {
  return edictLevel(state, 'curfew') === 'tight';
}

export function edictHomeCraftMultiplier(state: GameState): number {
  return edictCurfewActive(state) ? EDICT_CFG.curfew.tight.homeCraftMult : 1;
}

export function edictHomeCraftStockBuffer(state: GameState): number {
  if (!edictCurfewActive(state)) return 0;
  return state.residents.filter(resident => resident.alive && resident.stage !== 'infant').length *
    EDICT_CFG.curfew.tight.stockBufferPerResident;
}

export function edictElderLaborMultiplier(state: GameState, resident: Pick<Resident, 'age' | 'stage'>): number {
  if (resident.stage || resident.age < CONFIG.lifecycle.elderLaborAge || edictLevel(state, 'elderCare') !== 'generous') return 1;
  return EDICT_CFG.elderCare.generous.elderLaborMult / CONFIG.lifecycle.elderLaborMult;
}

export function edictElderDeathMultiplier(state: GameState, resident: Pick<Resident, 'age' | 'stage'>): number {
  if (resident.stage || resident.age < CONFIG.lifecycle.elderDeathCheckAge || edictLevel(state, 'elderCare') !== 'generous') return 1;
  return EDICT_CFG.elderCare.generous.oldAgeDeathMult;
}

export function edictElderSicknessMultiplier(state: GameState, resident: Pick<Resident, 'age' | 'stage'>): number {
  if (resident.stage || resident.age < CONFIG.lifecycle.elderLaborAge || edictLevel(state, 'elderCare') !== 'generous') return 1;
  return EDICT_CFG.elderCare.generous.sicknessMult;
}

export function edictCorveeActive(state: GameState): boolean {
  return edictLevel(state, 'corvee') === 'tight';
}

export function edictCorveeEligible(state: GameState, resident: Resident): boolean {
  if (!edictCorveeActive(state) || (resident.job !== 'builder' && resident.job !== 'hauler')) return false;
  if (!resident.alive || resident.stage || resident.sick || resident.health < 20 ||
      state.day < (resident.quarantinedUntil ?? 0) || state.day < (resident.birthRecoveryUntil ?? 0)) return false;
  return !(edictLevel(state, 'elderCare') === 'generous' && resident.age >= CONFIG.lifecycle.elderLaborAge);
}

export function edictCorveeEveningSubticks(state: GameState): number {
  return edictCorveeActive(state) ? EDICT_CFG.corvee.tight.eveningSubticks : 0;
}

export function applyEdictCorveeStrain(state: GameState, resident: Resident): void {
  if (!edictCorveeEligible(state, resident)) return;
  resident.health = Math.max(1, resident.health - EDICT_CFG.corvee.tight.healthLossPerSubtick);
}

// ── 민심 내역 ──

export function edictMoraleFactors(state: GameState): MoraleFactor[] {
  const factors: MoraleFactor[] = [];
  for (const active of activeEdicts(state)) {
    const def = EDICT_DEFS[active.id];
    const levelDef = edictLevelDef(active.id, active.level);
    const delta = edictMoraleDelta(active.id, active.level);
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

function edictMoraleDelta(id: EdictId, level: EdictLevel): number {
  switch (id) {
    case 'ration': return level === 'tight' ? EDICT_CFG.ration.tight.morale : EDICT_CFG.ration.generous.morale;
    case 'fuelRation': return EDICT_CFG.fuelRation.tight.morale;
    case 'immigration': return level === 'tight' ? EDICT_CFG.immigration.tight.morale : EDICT_CFG.immigration.generous.morale;
    case 'fireCode': return EDICT_CFG.fireCode.tight.morale;
    case 'curfew': return EDICT_CFG.curfew.tight.morale;
    case 'elderCare': return EDICT_CFG.elderCare.generous.morale;
    case 'corvee': return EDICT_CFG.corvee.tight.morale;
  }
}
