// 지도 위 습격 전투: 민병/파수꾼 집결, 교전, 전투 종료 처리
//
// 승패는 교전이 시작되는 순간 기존 즉시 판정과 똑같은 확률
// defense/(defense+power)로 한 번 굴려 정한다. 이후의 소모전(전력 감소·부상)은
// 그 결과를 향해 수렴하는 연출이다 — 밸런스가 기존 공식과 정확히 일치한다.
import { CONFIG } from './config';
import { computeDefense } from './buildings';
import { addLog } from './events';
import { changeRelation } from './relations';
import { resetAgent } from './agents';
import { livingResidents } from './residents';
import { damageBuildings, injure, loot, moraleShock } from './raidDamage';
import type { Battle, BattleOutcome, GameState, Resident, WeatherId } from './types';

export const BATTLE_MUSTER_DEADLINE = 5;
export const BATTLE_CLASH_TICK_LIMIT = 8;
const MUSTER_RADIUS = 2;
const COLLAPSE_RATIO = 0.35; // 무리 전력이 이 비율 밑으로 떨어지면 붕괴(승리 연출 종료)

export function rollBattleOutcome(defense: number, power: number, rng: () => number): BattleOutcome {
  const successP = defense + power <= 0 ? 1 : defense / (defense + power);
  return rng() < successP ? 'victory' : 'defeat';
}

// 서브틱당 무리 전력 감소량 — 승리 전투는 틱 상한(8) 안에 반드시 붕괴선(35%)을 넘고
// (0.09×8 = 0.72 ≥ 0.65), 패배 전투는 절대 붕괴선에 닿지 않는다 (0.04×8 = 0.32 < 0.65).
export function battlePowerDrain(outcome: BattleOutcome, initialPower: number, rng: () => number): number {
  return outcome === 'victory'
    ? initialPower * (0.09 + rng() * 0.05)
    : initialPower * (0.01 + rng() * 0.03);
}

export function applyBattleDefenseMultipliers(
  defense: number,
  battle: Pick<Battle, 'warned' | 'siege'>,
  weather: WeatherId,
): number {
  let adjusted = defense;
  if (battle.warned) adjusted *= CONFIG.raid.warnedDefenseMult;
  if (battle.siege) adjusted *= CONFIG.raid.siegeDefenseMult;
  if (weather === 'blizzard' || weather === 'coldSnap') adjusted *= 1.2;
  return adjusted;
}

export function raidBandSize(power: number): number {
  return Math.max(1, Math.min(6, 3 + Math.floor(power / 25)));
}

// 지도에 무리가 있을 때만 전투를 연다. 무리 없이 열린 폴백 습격(접근 경로 없음)은
// false를 반환해 resolveRaid의 즉시 판정으로 처리하게 한다.
export function startBattle(state: GameState): boolean {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'raid') return false;
  const band = state.raiders;
  if (!band) return false;

  const defenders = livingResidents(state)
    .filter(r => !r.sick && r.health >= 20 && (r.job === 'militia' || r.job === 'watchman'));
  const defenderIds = defenders.map(r => r.id);
  const draftedJobs = defenders.map(r => ({ id: r.id, job: r.job }));

  for (const defender of defenders) {
    resetAgent(state, defender);
    defender.job = 'militia';
    defender.task = '출전 준비';
  }

  state.battle = {
    phase: 'muster',
    frontX: band.x,
    frontY: band.y,
    initialPower: band.power,
    defenderIds,
    ticks: 0,
    musterDeadline: BATTLE_MUSTER_DEADLINE,
    faction: String(choice.data.faction ?? band.faction),
    warned: Boolean(choice.data.warned ?? band.warned),
    siege: Boolean(choice.data.siege ?? band.siege),
    outcome: null,
    draftedJobs,
  };
  state.pendingChoice = null;
  addLog(state, `민병대가 소집되었습니다. ${state.battle.faction}이(가) 마을 어귀에서 진을 칩니다.`, 'raid');
  return true;
}

export function battleTick(state: GameState, rng: () => number): void {
  const battle = state.battle;
  const band = state.raiders;
  if (!battle || !band || state.gameOver) return;

  pruneBattleDefenders(state, battle);
  const defense = applyBattleDefenseMultipliers(computeDefense(state), battle, state.weather);

  if (battle.phase === 'muster') {
    battle.ticks += 1;
    if (isMusterReady(state, battle)) {
      battle.phase = 'clash';
      battle.ticks = 0;
      battle.outcome = rollBattleOutcome(defense, band.power, rng);
      addLog(state, '전선에서 함성이 터집니다. 전투가 벌어졌습니다!', 'raid');
    }
    return;
  }

  if (battle.outcome == null) {
    // 승패가 없는 교전 상태(구버전 저장 복원)면 지금 굴린다
    battle.outcome = rollBattleOutcome(defense, band.power, rng);
  }
  band.power = Math.max(0, band.power - battlePowerDrain(battle.outcome, battle.initialPower, rng));
  maybeInjureDefender(state, battle, band.power, defense, rng);
  band.size = raidBandSize(band.power);
  battle.ticks += 1;

  const collapsed = band.power <= battle.initialPower * COLLAPSE_RATIO;
  if ((battle.outcome === 'victory' && collapsed) || battle.ticks >= BATTLE_CLASH_TICK_LIMIT) {
    finishBattle(state, battle.outcome, rng);
  }
}

function isMusterReady(state: GameState, battle: Battle): boolean {
  const defenders = battleDefenders(state, battle);
  if (defenders.length === 0) return true;
  const arrived = defenders.filter(r => distanceToFront(r, battle) <= MUSTER_RADIUS).length;
  return arrived / defenders.length >= 0.6 || battle.ticks >= battle.musterDeadline;
}

function pruneBattleDefenders(state: GameState, battle: Battle): void {
  const ok = new Set(
    state.residents
      .filter(r => r.alive && !r.sick && r.health >= 20)
      .map(r => r.id),
  );
  battle.defenderIds = battle.defenderIds.filter(id => ok.has(id));
}

function battleDefenders(state: GameState, battle: Battle): Resident[] {
  const ids = new Set(battle.defenderIds);
  return state.residents.filter(r => ids.has(r.id) && r.alive && !r.sick && r.health >= 20);
}

function distanceToFront(r: Resident, battle: Battle): number {
  return Math.abs(r.x - battle.frontX) + Math.abs(r.y - battle.frontY);
}

function maybeInjureDefender(
  state: GameState,
  battle: Battle,
  power: number,
  defense: number,
  rng: () => number,
): void {
  const chance = defense <= 0 ? 1 : power / (power + defense);
  if (rng() >= chance) return;
  const candidates = battleDefenders(state, battle)
    .sort((a, b) => distanceToFront(a, battle) - distanceToFront(b, battle));
  const target = candidates[0];
  if (!target) return;
  target.health = Math.max(5, target.health - (12 + rng() * 12));
  target.task = '전투 부상';
  if (target.health < 20) {
    battle.defenderIds = battle.defenderIds.filter(id => id !== target.id);
  }
}

function finishBattle(state: GameState, outcome: BattleOutcome, rng: () => number): void {
  const battle = state.battle;
  if (!battle) return;
  const activeDefenderIds = [...battle.defenderIds];
  const draftedJobs = battle.draftedJobs ?? [];
  const resetIds = new Set([...activeDefenderIds, ...draftedJobs.map(d => d.id)]);

  if (outcome === 'victory') {
    state.resources.reputation = Math.min(100, state.resources.reputation + 5);
    moraleShock(state, -8);
    changeRelation(state, battle.faction, CONFIG.relations.militiaWin);
    addLog(state, `민병대가 ${battle.faction}을(를) 전선에서 몰아냈습니다! 마을의 사기와 명성이 올랐습니다.`, 'good');
  } else {
    const injured = injure(state, rng, 1 + Math.floor(rng() * 2), 30, activeDefenderIds);
    const lootMsg = loot(state, 0.2 + rng() * 0.1);
    const destroyed = damageBuildings(state, rng, rng() < 0.5 ? 1 : 0);
    moraleShock(state, 15);
    changeRelation(state, battle.faction, CONFIG.relations.militiaLoss);
    addLog(state, `민병대가 밀려났습니다. 부상자 ${injured}명, ${lootMsg}.${destroyed.length > 0 ? ' 건물이 파손되었습니다.' : ''}`, 'raid');
  }

  state.threat = CONFIG.threat.afterRaidThreat;
  state.raidCooldown = CONFIG.threat.raidCooldownDays;
  state.raiders = null;
  state.battle = null;

  for (const draft of draftedJobs) {
    const resident = state.residents.find(r => r.id === draft.id);
    if (resident) resident.job = draft.job;
  }
  for (const id of resetIds) {
    const resident = state.residents.find(r => r.id === id);
    if (resident) resetAgent(state, resident);
  }
}