// 지도 위 습격 전투: 수비병/파수꾼(요격) 또는 주민 전체(징집) 집결, 교전, 전투 종료 처리
//
// 승패는 교전이 시작되는 순간 기존 즉시 판정과 똑같은 확률
// defense/(defense+power)로 한 번 굴려 정한다. 이후의 소모전(전력 감소·부상)은
// 그 결과를 향해 수렴하는 연출이다 — 밸런스가 기존 공식과 정확히 일치한다.
import { CONFIG } from './config';
import { armedMusketeers, computeDefense, countBuilt } from './buildings';
import { addLog } from './events';
import { changeRelation } from './relations';
import { resetAgent } from './agents';
import { livingResidents } from './residents';
import { damageBuildings, injure, killResidents, loot, moraleShock } from './raidDamage';
import type { Battle, BattleLocation, BattleMode, BattleOutcome, GameState, RaiderBand, Resident, WeatherId } from './types';

export const BATTLE_MUSTER_DEADLINE = 5;
export const BATTLE_CLASH_TICK_LIMIT = 8;
const MUSTER_RADIUS = 2;
export const COLLAPSE_RATIO = 0.35; // 무리 전력이 이 비율 밑으로 떨어지면 붕괴(승리 연출 종료)
const BATTLE_SCAR_DAYS = 4; // 전투 자국이 남는 기간

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

// 포대 가동 여부 — 완공 포대가 있고 화약이 있으면 전투 방어 배율이 붙는다
export function cannonBattleMult(state: GameState): number {
  return countBuilt(state, 'cannonEmplacement') > 0 && state.resources.gunpowder > 0
    ? CONFIG.raid.cannonBattleMult
    : 1;
}

// 교전 개시 시 화약 소모: 조총 무장 수비병 + 가동 포대. 비축분이 모자라면 있는 만큼만 쓴다.
export function consumeBattlePowder(state: GameState): void {
  const need =
    armedMusketeers(state) * CONFIG.raid.powderPerMusket +
    (state.resources.gunpowder > 0 ? countBuilt(state, 'cannonEmplacement') * CONFIG.raid.powderPerCannon : 0);
  if (need <= 0) return;
  const used = Math.min(state.resources.gunpowder, need);
  if (used <= 0) return;
  state.resources.gunpowder = Math.max(0, state.resources.gunpowder - used);
  addLog(state, `전선에 총성과 포성이 울립니다! (화약 -${used.toFixed(1)})`, 'raid');
}

// 징집(levy) 시 일반 주민(수비병/파수꾼 제외)이 보태는 방어도.
// 직업을 바꾸는 방식은 금지 — computeDefense가 주민 전원을 수비병(12)으로 세어 폭증한다.
export function levyDefenseBonus(state: GameState): number {
  const civilians = livingResidents(state)
    .filter(r => !r.sick && r.health >= 20 && r.job !== 'militia' && r.job !== 'watchman')
    .length;
  return civilians * CONFIG.raid.levyDefensePerResident;
}

function battleSideName(mode: BattleMode): string {
  return mode === 'levy' ? '징집된 주민들' : '수비병';
}

function battleLocation(battle: Pick<Battle, 'mode' | 'location'>): BattleLocation {
  return battle.location ?? (battle.mode === 'levy' ? 'village' : 'outskirts');
}

function villageBattleFront(state: GameState, band: RaiderBand): { x: number; y: number } {
  const center = state.buildings.find(building => building.type === 'center' && building.built);
  if (!center) return { x: band.x, y: band.y };

  const candidates: { x: number; y: number; approach: number; centerDistance: number }[] = [];
  for (let y = Math.max(0, center.y - 4); y <= Math.min(state.map.length - 1, center.y + 4); y++) {
    for (let x = Math.max(0, center.x - 4); x <= Math.min(state.map[y].length - 1, center.x + 4); x++) {
      const tile = state.map[y][x];
      const centerDistance = Math.abs(x - center.x) + Math.abs(y - center.y);
      if (centerDistance < 2 || centerDistance > 4) continue;
      if (tile.buildingId != null || tile.terrain === 'mountain' || tile.terrain === 'river') continue;
      candidates.push({
        x,
        y,
        approach: Math.abs(x - band.x) + Math.abs(y - band.y),
        centerDistance,
      });
    }
  }
  candidates.sort((a, b) => a.approach - b.approach || a.centerDistance - b.centerDistance || a.y - b.y || a.x - b.x);
  return candidates[0] ?? { x: band.x, y: band.y };
}

// 지도에 무리가 있을 때만 전투를 연다. 무리 없이 열린 폴백 습격(접근 경로 없음)은
// false를 반환해 resolveRaid의 즉시 판정으로 처리하게 한다.
export function startBattle(state: GameState, mode: BattleMode): boolean {
  const choice = state.pendingChoice;
  if (!choice || choice.kind !== 'raid') return false;
  const band = state.raiders;
  if (!band) return false;

  // 요격: 훈련된 수비병+파수꾼만 / 징집: 앓지 않는 성한 주민 전체
  const defenders = livingResidents(state).filter(r =>
    !r.sick && r.health >= 20 &&
    (mode === 'levy' || r.job === 'militia' || r.job === 'watchman'));
  for (const defender of defenders) {
    resetAgent(state, defender);
    defender.task = '출전 준비';
  }

  const location: BattleLocation = mode === 'garrison' ? 'outskirts' : 'village';
  const front = location === 'village' ? villageBattleFront(state, band) : { x: band.x, y: band.y };
  if (location === 'village') {
    band.x = front.x;
    band.y = front.y;
    band.px = front.x;
    band.py = front.y;
    band.path = [];
  }

  state.battle = {
    phase: 'muster',
    mode,
    location,
    frontX: front.x,
    frontY: front.y,
    initialPower: band.power,
    defenderIds: defenders.map(r => r.id),
    levyBonus: mode === 'levy' ? levyDefenseBonus(state) : 0,
    ticks: 0,
    musterDeadline: BATTLE_MUSTER_DEADLINE,
    faction: String(choice.data.faction ?? band.faction),
    warned: Boolean(choice.data.warned ?? band.warned),
    siege: Boolean(choice.data.siege ?? band.siege),
    outcome: null,
  };
  state.pendingChoice = null;
  addLog(state, mode === 'levy'
    ? `온 마을이 낫과 도끼를 들었습니다. ${state.battle.faction}이(가) 마을 안으로 밀고 들어와 방어전이 벌어집니다.`
    : `수비병이 마을 밖으로 요격에 나섭니다. ${state.battle.faction}과(와) 외곽에서 맞붙습니다.`, 'raid');
  return true;
}

export function battleTick(state: GameState, rng: () => number): void {
  const battle = state.battle;
  const band = state.raiders;
  if (!battle || !band || state.gameOver) return;

  pruneBattleDefenders(state, battle);
  const defense = applyBattleDefenseMultipliers(
    (computeDefense(state) + (battle.levyBonus ?? 0)) * cannonBattleMult(state),
    battle, state.weather);

  if (battle.phase === 'muster') {
    battle.ticks += 1;
    if (isMusterReady(state, battle)) {
      battle.phase = 'clash';
      battle.ticks = 0;
      // 승패는 화약이 마르기 전(조총·포대 보정 포함) 방어도로 굴리고, 그 교전에서 화약을 태운다
      battle.outcome = rollBattleOutcome(defense, band.power, rng);
      addLog(state, '전선에서 함성이 터집니다. 전투가 벌어졌습니다!', 'raid');
      consumeBattlePowder(state);
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
  // 징집전은 훈련 안 된 주민이 앞줄에 서므로 부상이 더 넓게 퍼진다 (틱당 최대 2명)
  const attempts = (battle.mode ?? 'garrison') === 'levy' ? 2 : 1;
  const candidates = battleDefenders(state, battle)
    .sort((a, b) => distanceToFront(a, battle) - distanceToFront(b, battle));
  let next = 0;
  for (let i = 0; i < attempts; i++) {
    if (rng() >= chance) continue;
    const target = candidates[next++];
    if (!target) return;
    target.health = Math.max(5, target.health - (12 + rng() * 12));
    target.task = '전투 부상';
    if (target.health < 20) {
      battle.defenderIds = battle.defenderIds.filter(id => id !== target.id);
    }
  }
}

function finishBattle(state: GameState, outcome: BattleOutcome, rng: () => number): void {
  const battle = state.battle;
  if (!battle) return;
  const mode = battle.mode ?? 'garrison';
  const location = battleLocation(battle);
  const side = battleSideName(mode);
  const activeDefenderIds = [...battle.defenderIds];
  const draftedJobs = battle.draftedJobs ?? [];
  const resetIds = new Set([...activeDefenderIds, ...draftedJobs.map(d => d.id)]);

  if (outcome === 'victory') {
    const injuryAttempts = mode === 'levy' ? 2 : 1;
    let injured = 0;
    for (let i = 0; i < injuryAttempts; i++) {
      if (activeDefenderIds.length > 0 && rng() < CONFIG.raid.victoryInjuryChance[mode]) {
        injured += injure(state, rng, 1, mode === 'levy' ? 24 : 18, activeDefenderIds);
      }
    }
    const damaged = location === 'village'
      ? damageBuildings(state, rng, CONFIG.raid.buildingDamage.villageVictory)
      : [];
    state.resources.reputation = Math.min(100, state.resources.reputation + 5);
    moraleShock(state, -8);
    changeRelation(state, battle.faction, CONFIG.relations.militiaWin);
    addLog(
      state,
      location === 'outskirts'
        ? `${side}이(가) ${battle.faction}을(를) 외곽에서 몰아냈습니다! 부상자 ${injured}명, 건물 피해는 없습니다.`
        : `${side}이(가) ${battle.faction}을(를) 마을 안에서 물리쳤습니다! 부상자 ${injured}명, 건물 ${damaged.length}채가 파손되었습니다.`,
      'good',
      true,
    );
  } else {
    const killed = killResidents(
      state,
      rng,
      activeDefenderIds.length,
      CONFIG.raid.defeatDeathRate[mode],
      activeDefenderIds,
    );
    // 징집전 패배는 훈련 안 된 주민이 흩어지며 부상이 더 넓게 퍼진다.
    const injuredCount = mode === 'levy' ? 2 + Math.floor(rng() * 3) : 1 + Math.floor(rng() * 2);
    const injured = injure(state, rng, injuredCount, 30, activeDefenderIds);
    const lootMsg = loot(state, 0.2 + rng() * 0.1);
    const damageCount = location === 'village'
      ? CONFIG.raid.buildingDamage.villageDefeat
      : CONFIG.raid.buildingDamage.interceptDefeat;
    const damaged = damageBuildings(state, rng, damageCount);
    moraleShock(state, 15);
    changeRelation(state, battle.faction, CONFIG.relations.militiaLoss);
    addLog(
      state,
      location === 'outskirts'
        ? `외곽 요격선이 무너져 적이 마을로 들이닥쳤습니다. 전사 ${killed}명, 부상 ${injured}명, ${lootMsg}. 건물 ${damaged.length}채가 파손되었습니다.`
        : `${side}이(가) 마을 안에서 밀려났습니다. 전사 ${killed}명, 부상 ${injured}명, ${lootMsg}. 건물 ${damaged.length}채가 파손되었습니다.`,
      'raid',
    );
  }

  state.threat = CONFIG.threat.afterRaidThreat;
  state.raidCooldown = CONFIG.threat.raidCooldownDays;
  // 전투가 벌어졌던 자리에 며칠간 교란 자국을 남긴다 (만료분은 이때 정리)
  state.battleScars = [
    ...(state.battleScars ?? []).filter(scar => scar.until >= state.day),
    { x: battle.frontX, y: battle.frontY, until: state.day + BATTLE_SCAR_DAYS },
  ];
  state.raiders = null;
  state.battle = null;

  for (const draft of draftedJobs) {
    const resident = state.residents.find(r => r.id === draft.id);
    if (resident) resident.job = draft.job;
  }
  for (const id of resetIds) {
    const resident = state.residents.find(r => r.id === id);
    if (resident?.alive) resetAgent(state, resident);
  }
}
