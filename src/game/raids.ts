// 습격 시스템 — 위협도 누적, 지도 위 습격 무리 접근, 위기 선택지와 결과 판정
import { CONFIG } from './config';
import { FACTIONS, type Faction } from './constants';
import { countBuilt } from './buildings';
import { addLog } from './events';
import {
  applyBattleDefenseMultipliers, cannonBattleMult, consumeBattlePowder, levyDefenseBonus, startBattle,
} from './battles';
import { findPath } from './agents';
import { damageBuildings, injure, loot, moraleShock } from './raidDamage';
import { rankEffects } from './promotion';
import { changeRelation, getRelation, hostileRelationsAvg } from './relations';
import { countJob } from './residents';
import { getSeason, getYear } from './seasons';
import type { GameState, PendingChoice } from './types';

// 위협도 일일 갱신
export function updateThreat(state: GameState): void {
  const t = CONFIG.threat;
  let delta = t.basePerDay;
  const season = getSeason(state.day);
  if (season === 'autumn' || season === 'winter') delta += t.coldSeasonExtra;
  if (state.resources.food + state.resources.hide > t.wealthThreshold) delta += t.wealthExtra;
  if (state.resources.reputation < 35) delta += t.lowRepExtra;
  if (state.tradeRefusedDays > 0) delta += t.tradeRefusedExtra;
  delta -= countJob(state, 'watchman') * t.perWatchman;
  delta -= state.resources.defense / t.defenseFactor;
  // 적대 세력들과의 관계가 나쁠수록 국경이 험악해진다
  const avgRel = hostileRelationsAvg(state);
  if (avgRel < CONFIG.relations.lowRelThreatBelow) {
    delta += (CONFIG.relations.lowRelThreatBelow - avgRel) * CONFIG.relations.lowRelThreatScale;
  }
  // 난이도·승격 단계: 위협이 오를 때만 배율 적용 (내릴 때는 그대로) — 부유해질수록 노려진다
  if (delta > 0) {
    delta *= CONFIG.difficulty[state.difficulty ?? 'normal'].threatGain * rankEffects(state.rank).threatGain;
  }
  state.threat = Math.max(0, Math.min(100, state.threat + delta));
  if (state.tradeRefusedDays > 0) state.tradeRefusedDays--;
  if (state.raidCooldown > 0) state.raidCooldown--;
}

function raidPower(state: GameState, rng: () => number): number {
  const r = CONFIG.raid;
  const wealth = state.resources.food + state.resources.hide + state.resources.tools * 2;
  // 연차 스케일은 상한을 둔다 — 승격 후 장기전에서 습격이 무한정 세지지 않게
  const scaledYears = Math.min(getYear(state.day), r.powerYearCap) - 1;
  const base =
    r.basePower + scaledYears * r.powerPerYear +
    rng() * r.powerRandom + wealth / r.wealthPowerDiv;
  return Math.round(base * CONFIG.difficulty[state.difficulty ?? 'normal'].raidPower);
}

function pickFaction(state: GameState, rng: () => number): Faction {
  // 관계가 나쁜 세력일수록 습격에 나설 확률이 높다.
  // 위협도가 아주 높으면 평화 성향 씨족도 굶주림에 몰려 내려올 수 있다 (절반 가중).
  const cands: { f: Faction; w: number }[] = [];
  for (const f of FACTIONS) {
    const rel = getRelation(state, f.name);
    if (f.hostile) cands.push({ f, w: Math.max(5, 110 - rel) });
    else if (state.threat > 85) cands.push({ f, w: Math.max(2, (90 - rel) * 0.5) });
  }
  let r = rng() * cands.reduce((s, c) => s + c.w, 0);
  for (const c of cands) {
    r -= c.w;
    if (r <= 0) return c.f;
  }
  return cands[cands.length - 1].f;
}

function isRaidBarrier(type: string): boolean {
  return type === 'palisade' || type === 'earthFort';
}

// 습격자 통행 규칙: 산과 완공된 방책은 못 지난다 (강은 여울과 뗏목으로 건넌다)
function raiderPassable(state: GameState, x: number, y: number): boolean {
  const t = state.map[y]?.[x];
  if (!t || t.terrain === 'mountain') return false;
  if (t.buildingId != null) {
    const b = state.buildings.find(bb => bb.id === t.buildingId);
    if (b && b.built && isRaidBarrier(b.type)) return false;
  }
  return true;
}

// 습격 발생 판정: 성사되면 지도 가장자리에 습격 무리가 나타나 마을로 접근한다
export function checkRaidTrigger(state: GameState, rng: () => number): void {
  const t = CONFIG.threat;
  if (state.pendingChoice || state.raidCooldown > 0 || state.raiders || state.battle) return;
  if (state.threat < t.raidThreshold) return;
  let chance = (state.threat - t.raidThreshold) / t.raidChanceDiv;
  const season = getSeason(state.day);
  if (season === 'autumn' || season === 'winter') chance *= 1.5;
  if (rng() >= chance) return;

  const hasWarning = countBuilt(state, 'beacon') > 0 || countBuilt(state, 'watchtower') > 0;
  const warned = hasWarning && rng() < t.earlyWarnChance;
  spawnRaiders(state, rng, warned);
}

// 지도 가장자리(주로 북쪽)에서 습격 무리를 스폰
export function spawnRaiders(state: GameState, rng: () => number, warned: boolean): void {
  const center = state.buildings.find(b => b.type === 'center');
  if (!center) return;
  const power = raidPower(state, rng);
  const faction = pickFaction(state, rng);
  const h = state.map.length, w = state.map[0]?.length ?? 0;
  if (w <= 0 || h <= 0) return;

  // 방책이 마을을 완전히 두르고 있으면 중심지까지의 길이 없다 → 방책 앞 공성
  const barrierTiles = new Set(
    state.buildings.filter(b => b.built && isRaidBarrier(b.type)).map(b => b.y * w + b.x));
  const nearBarrier = (tx: number, ty: number) =>
    [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
      .some(([dx, dy]) => barrierTiles.has((ty + dy) * w + (tx + dx)));

  let spawn: { x: number; y: number } | null = null;
  let path: { x: number; y: number }[] | null = null;
  let siege = false;
  for (let tryI = 0; tryI < 12 && !path; tryI++) {
    let sx: number, sy: number;
    if (tryI < 6) { sx = 2 + Math.floor(rng() * (w - 4)); sy = 0; }          // 북쪽 우선
    else if (rng() < 0.5) { sx = 0; sy = Math.floor(rng() * h * 0.5); }      // 서쪽 상단
    else { sx = w - 1; sy = Math.floor(rng() * h * 0.5); }                   // 동쪽 상단
    if (!raiderPassable(state, sx, sy)) continue;
    const pass = (x: number, y: number) => raiderPassable(state, x, y);
    // 1순위: 중심지까지 직접 (방책에 틈이 있으면 돌아 들어온다)
    path = findPath(state, sx, sy, tile => tile.buildingId === center.id, pass);
    // 2순위: 길이 막혔으면 방책에 붙은 타일까지 가서 공성
    if (!path && barrierTiles.size > 0) {
      path = findPath(state, sx, sy, tile => nearBarrier(tile.x, tile.y), pass);
      siege = !!path;
    }
    if (path) spawn = { x: sx, y: sy };
  }
  if (!spawn || !path) {
    // 지형상 접근 경로가 없으면 안전망으로 즉시 위기 이벤트 처리
    openRaidChoice(state, rng, warned, power, faction.name);
    return;
  }

  state.raiders = {
    x: spawn.x, y: spawn.y, px: spawn.x, py: spawn.y, path,
    power,
    size: Math.min(6, 3 + Math.floor(power / 25)),
    faction: faction.name,
    warned,
    spotted: warned,
    siege,
    speed: warned ? CONFIG.raid.raiderSpeedWarned : CONFIG.raid.raiderSpeedSurprise,
    trail: [],
  };
  if (warned) {
    addLog(state, `봉수와 망루에서 경보! ${faction.name}이(가) 북쪽에서 접근하고 있습니다. 들이닥치기 전에 대비하십시오.`, 'raid');
  }
}

// 서브틱마다 습격 무리를 이동시키고, 마을에 닿으면 위기 선택지를 연다
export function raidersTick(state: GameState, rng: () => number): void {
  const band = state.raiders;
  if (!band || state.pendingChoice || state.gameOver) return;
  // 보간 기준점을 매 틱 현재 위치로 맞춘다 — 전투로 묶여 있어도 갱신해야
  // 렌더러가 직전 타일에서 미끄러져 들어오는 이동을 반복 재생하지 않는다
  band.px = band.x;
  band.py = band.y;
  if (state.battle) return; // 전투 중엔 무리가 전선에 묶인다
  let steps = Math.floor(band.speed) + (rng() < band.speed % 1 ? 1 : 0);
  while (steps-- > 0 && band.path.length > 0) {
    const next = band.path.shift()!;
    // 지나온 자취를 남긴다 (겨울 눈밭 발자국)
    if (!band.trail) band.trail = [];
    band.trail.push({ x: band.x, y: band.y });
    if (band.trail.length > 26) band.trail.shift();
    band.x = next.x;
    band.y = next.y;
  }
  const center = state.buildings.find(b => b.type === 'center');
  const dist = center ? Math.abs(band.x - center.x) + Math.abs(band.y - center.y) : 0;
  if (!band.spotted && dist <= CONFIG.raid.spotDistance) {
    band.spotted = true;
    addLog(state, `경계병이 접근하는 무장 무리를 발견했습니다! ${band.faction}(으)로 보입니다.`, 'raid');
  }
  if (band.path.length === 0 || dist <= CONFIG.raid.arriveDistance) {
    if (band.siege) {
      addLog(state, `${band.faction}이(가) 방책 앞에서 멈춰 섰습니다. 목책과 토성이 그들을 가로막고 있습니다.`, 'raid');
    }
    openRaidChoice(state, rng, band.warned, band.power, band.faction, band.siege);
  }
}

// 무리 없는 폴백 습격의 즉시 전투 판정 (요격/징집 공용) — 승패 확률만 다르고 결과 처리는 같다
function resolveFightFallback(
  state: GameState, rng: () => number, faction: string, successP: number, side: string,
): void {
  if (rng() < successP) {
    const injured = injure(state, rng, 1 + Math.floor(rng() * 2), 20);
    state.resources.reputation = Math.min(100, state.resources.reputation + 5);
    moraleShock(state, -8); // 사기 상승
    changeRelation(state, faction, CONFIG.relations.militiaWin); // 물리치면 원한이 남는다
    addLog(state, `${side}이(가) ${faction}을(를) 물리쳤습니다! 부상자 ${injured}명. 마을의 사기와 명성이 올랐습니다.`, 'good');
  } else {
    const injured = injure(state, rng, 2 + Math.floor(rng() * 3), 30);
    const lootMsg = loot(state, 0.2 + rng() * 0.1);
    const destroyed = damageBuildings(state, rng, rng() < 0.5 ? 1 : 0);
    moraleShock(state, 15);
    changeRelation(state, faction, CONFIG.relations.militiaLoss);
    addLog(state, `${side}이(가) 밀려났습니다. 부상자 ${injured}명, ${lootMsg}.${destroyed.length > 0 ? ' 건물이 파손되었습니다.' : ''}`, 'raid');
  }
}

// 습격 선택지 모달 생성
export function openRaidChoice(
  state: GameState, rng: () => number, warned: boolean,
  powerIn?: number, factionName?: string, siege = false,
): void {
  const faction = FACTIONS.find(f => f.name === factionName) ?? pickFaction(state, rng);
  const power = powerIn ?? raidPower(state, rng);
  const hasBeacon = countBuilt(state, 'beacon') > 0;
  const hasMarket = countBuilt(state, 'market') > 0;
  const tributeCost = { food: 20, hide: 8, tools: 2 };
  const canTribute = state.resources.food >= tributeCost.food;

  const choice: PendingChoice = {
    kind: 'raid',
    title: `습격! — ${faction.name}`,
    body:
      `${faction.name}이 마을로 몰려오고 있습니다.` +
      (warned ? ' 경보 덕분에 미리 대비할 시간이 있었습니다.' : ' 아무런 경보도 없이 들이닥쳤습니다!') +
      (siege ? '\n방책이 무리를 가로막고 있어 방어에 유리합니다.' : '') +
      (getRelation(state, faction.name) >= 60 ? '\n낯익은 얼굴들입니다. 말이 통할지도 모릅니다.'
        : getRelation(state, faction.name) <= 35 ? '\n그들의 눈빛에 해묵은 원한이 서려 있습니다.' : '') +
      `\n추정 규모: ${power < 30 ? '소규모' : power < 50 ? '중간 규모' : '대규모'} / 현재 방어도: ${state.resources.defense}`,
    options: [
      {
        id: 'shelter', label: '목책 안으로 피난한다',
        desc: '인명 피해는 거의 없지만 창고 자원의 일부를 약탈당합니다.',
      },
      {
        id: 'militia', label: '수비병으로 요격한다',
        desc: '수비병과 파수꾼이 전선으로 출전합니다. 훈련된 소수의 싸움입니다.',
      },
      {
        id: 'levy', label: '민병을 징집한다',
        desc: '성한 주민 모두가 무기를 듭니다. 방어도가 오르지만 부상이 널리 퍼지고, 며칠간 일손이 흔들립니다.',
      },
      {
        id: 'tribute', label: '공물을 내어보낸다',
        desc: `식량 ${tributeCost.food}, 가죽 ${tributeCost.hide}, 도구 ${tributeCost.tools}을(를) 내주고 싸움을 피합니다.`,
        disabled: !canTribute,
        disabledReason: '내어줄 식량이 부족합니다',
      },
      {
        id: 'negotiate', label: '장터를 통해 협상한다',
        desc: '명성이 높으면 교역으로 돌릴 수 있습니다. 실패하면 피해가 커집니다.',
        disabled: !hasMarket,
        disabledReason: '장터가 필요합니다',
      },
      {
        id: 'beacon', label: '봉수대 경보를 올린다',
        desc: '인근 진보의 지원 신호를 올려 적을 물러나게 합니다. 다음 습격까지 위협도가 크게 줄어듭니다.',
        disabled: !hasBeacon,
        disabledReason: '봉수대가 필요합니다',
      },
    ],
    data: { power, faction: faction.name, warned, siege },
  };
  state.pendingChoice = choice;
  addLog(state, `${faction.name}의 습격이 시작되었습니다!`, 'raid');
}

// 선택지 결과 판정
export function resolveRaid(state: GameState, optionId: string, rng: () => number): void {
  const c = state.pendingChoice;
  if (!c || c.kind !== 'raid') return;
  const power = c.data.power as number;
  const faction = c.data.faction as string;
  const warned = c.data.warned as boolean;

  // 경보/공성/궂은 날씨 보정 — 지도 전투와 같은 배율 (눈보라·혹한은 침입자에게 더 가혹하다)
  const battleMods = { warned, siege: Boolean(c.data.siege) };

  switch (optionId) {
    case 'shelter': {
      const lootMsg = loot(state, 0.22 + rng() * 0.1);
      const injured = rng() < 0.25 ? injure(state, rng, 1, 15) : 0;
      moraleShock(state, 8);
      changeRelation(state, faction, CONFIG.relations.shelter);
      addLog(state, `주민들이 목책 안으로 피했습니다. ${lootMsg}.${injured > 0 ? ` 미처 피하지 못한 ${injured}명이 다쳤습니다.` : ''}`, 'raid');
      break;
    }
    // 요격/징집: 지도에 무리가 있으면 실제 전투를 연다 (승패·후처리는 battleTick이 맡는다).
    // 무리 없이 열린 폴백 습격(접근 경로 없음)만 즉시 판정으로 처리한다.
    case 'militia': {
      if (startBattle(state, 'garrison')) return;
      const fightDefense = applyBattleDefenseMultipliers(
        state.resources.defense * cannonBattleMult(state), battleMods, state.weather);
      consumeBattlePowder(state);
      resolveFightFallback(state, rng, faction, fightDefense / (fightDefense + power), '수비병');
      break;
    }
    case 'levy': {
      if (startBattle(state, 'levy')) return;
      const levyDefense = applyBattleDefenseMultipliers(
        (state.resources.defense + levyDefenseBonus(state)) * cannonBattleMult(state),
        battleMods, state.weather);
      consumeBattlePowder(state);
      resolveFightFallback(state, rng, faction, levyDefense / (levyDefense + power), '징집된 주민들');
      break;
    }
    case 'tribute': {
      state.resources.food = Math.max(0, state.resources.food - 20);
      state.resources.hide = Math.max(0, state.resources.hide - 8);
      state.resources.tools = Math.max(0, state.resources.tools - 2);
      state.resources.reputation = Math.max(0, state.resources.reputation - 2);
      state.threat = Math.max(0, state.threat - 25);
      moraleShock(state, 4);
      changeRelation(state, faction, CONFIG.relations.tribute);
      addLog(state, `${faction}에게 공물을 내어보냈습니다. 싸움은 피했지만 그들과의 사이는 눅어졌습니다.`, 'raid');
      break;
    }
    case 'negotiate': {
      // 조정에서의 명성과 그 세력과의 관계가 함께 작용한다
      const negotiateP = (state.resources.reputation * 0.6 + getRelation(state, faction) * 0.4) / 100 + 0.1;
      if (rng() < negotiateP) {
        // 협상 성공: 소규모 교환으로 마무리
        const give = Math.min(10, state.resources.food);
        state.resources.food -= give;
        state.resources.hide += 4;
        state.resources.reputation = Math.min(100, state.resources.reputation + 5);
        state.threat = Math.max(0, state.threat - 30);
        changeRelation(state, faction, CONFIG.relations.negotiateSuccess);
        addLog(state, `장터에서의 협상이 통했습니다. ${faction}이(가) 식량 ${give}을(를) 받고 가죽 4를 남기고 물러갑니다. 명성이 올랐습니다.`, 'good');
      } else {
        const injured = injure(state, rng, 2, 25);
        const lootMsg = loot(state, 0.3 + rng() * 0.1);
        moraleShock(state, 12);
        changeRelation(state, faction, CONFIG.relations.negotiateFail);
        addLog(state, `협상이 결렬되었습니다. 격분한 ${faction}이(가) 마을을 휩쓸었습니다. 부상자 ${injured}명, ${lootMsg}.`, 'raid');
      }
      break;
    }
    case 'beacon': {
      state.resources.firewood = Math.max(0, state.resources.firewood - 5);
      state.threat = Math.max(0, state.threat - 35);
      const lootMsg = loot(state, 0.1);
      changeRelation(state, faction, CONFIG.relations.beacon);
      addLog(state, `봉수대에 불길이 올랐습니다. 인근 진보의 응원 신호에 ${faction}이(가) 서둘러 물러갑니다. ${lootMsg}.`, 'good');
      break;
    }
  }

  state.threat = Math.min(state.threat, CONFIG.threat.afterRaidThreat + 20);
  if (optionId !== 'tribute' && optionId !== 'beacon' && optionId !== 'negotiate') {
    state.threat = CONFIG.threat.afterRaidThreat;
  }
  state.raidCooldown = CONFIG.threat.raidCooldownDays;
  state.raiders = null; // 무리는 물러간다
  state.pendingChoice = null;
}
