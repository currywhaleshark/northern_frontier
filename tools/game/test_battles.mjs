import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  const files = readdirSync(srcDir).filter(file => file.endsWith('.ts'));
  for (const file of files) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.ES2022,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
      if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
      return `${start}${spec}.mjs${end}`;
    });
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const battles = await import(pathToFileURL(join(compiledDir, 'battles.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const { makeRng } = await import(pathToFileURL(join(compiledDir, 'map.mjs')).href);
const { computeDefense } = await import(pathToFileURL(join(compiledDir, 'buildings.mjs')).href);

// 승패 주사위는 기존 즉시 판정 공식 defense/(defense+power)를 그대로 쓴다
assert.equal(battles.rollBattleOutcome(50, 50, () => 0.49), 'victory');
assert.equal(battles.rollBattleOutcome(50, 50, () => 0.51), 'defeat');
assert.equal(battles.rollBattleOutcome(0, 100, () => 0.001), 'defeat'); // P=0
assert.equal(battles.rollBattleOutcome(0, 0, () => 0.99), 'victory');   // 빈 무리

// 연출 보장: 승리 전투는 틱 상한 안에 반드시 붕괴선(35%)을 넘고, 패배 전투는 닿지 않는다
assert.ok(battles.battlePowerDrain('victory', 100, () => 0) * battles.BATTLE_CLASH_TICK_LIMIT >= 65);
assert.ok(battles.battlePowerDrain('defeat', 100, () => 1) * battles.BATTLE_CLASH_TICK_LIMIT < 65);

assert.equal(
  battles.applyBattleDefenseMultipliers(100, { warned: true, siege: true }, 'coldSnap'),
  172.5,
);
assert.equal(
  battles.applyBattleDefenseMultipliers(100, { warned: false, siege: false }, 'clear'),
  100,
);

{
  const state = simulation.newGame(123);
  for (const resident of state.residents) resident.job = 'idle';
  state.pendingChoice = {
    kind: 'raid',
    title: 'test',
    body: 'test',
    options: [],
    data: { power: 80, faction: 'test faction', warned: false, siege: false },
  };
  state.raiders = {
    x: 10, y: 8, px: 10, py: 8, path: [], power: 80, size: 5,
    faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
  };

  assert.equal(battles.startBattle(state, 'garrison'), true);
  assert.equal(state.pendingChoice, null);
  assert.equal(state.raiders.power, 80);
  assert.equal(state.battle.phase, 'muster');
  assert.equal(state.battle.mode, 'garrison');
  assert.equal(state.battle.outcome, null); // 승패는 교전 시작 때 굴린다
  assert.deepEqual(state.battle.defenderIds, []);
}

// 지도에 무리가 없는 폴백 습격(접근 경로 없음)은 전투를 열지 않고 즉시 판정으로 넘긴다
{
  const state = simulation.newGame(321);
  state.pendingChoice = {
    kind: 'raid',
    title: 'test',
    body: 'test',
    options: [],
    data: { power: 80, faction: 'test faction', warned: false, siege: false },
  };
  state.raiders = null;

  assert.equal(battles.startBattle(state, 'garrison'), false);
  assert.equal(state.battle, null);
  assert.ok(state.pendingChoice); // 선택지는 resolveRaid가 마저 처리한다

  simulation.resolveChoice(state, 'militia');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.battle, null); // 즉시 판정으로 끝났다
  assert.equal(state.raidCooldown, CONFIG.threat.raidCooldownDays);
}

// 민병 징집(levy)도 무리가 없으면 즉시 판정으로 넘어간다
{
  const state = simulation.newGame(322);
  state.pendingChoice = {
    kind: 'raid',
    title: 'test',
    body: 'test',
    options: [],
    data: { power: 80, faction: 'test faction', warned: false, siege: false },
  };
  state.raiders = null;

  simulation.resolveChoice(state, 'levy');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.battle, null);
  assert.equal(state.raidCooldown, CONFIG.threat.raidCooldownDays);
}

{
  const state = simulation.newGame(456);
  state.pendingChoice = {
    kind: 'raid',
    title: 'test',
    body: 'test',
    options: [],
    data: { power: 90, faction: 'test faction', warned: true, siege: true },
  };
  state.raiders = {
    x: 7, y: 7, px: 7, py: 7, path: [], power: 90, size: 6,
    faction: 'test faction', warned: true, spotted: true, siege: true, speed: 1, trail: [],
  };

  simulation.resolveChoice(state, 'militia');
  assert.equal(state.pendingChoice, null);
  assert.equal(state.raiders.power, 90);
  assert.equal(state.battle.phase, 'muster');
  assert.equal(state.battle.warned, true);
  assert.equal(state.battle.siege, true);
}

{
  const state = simulation.newGame(789);
  // 전투 직전 이동으로 보간 기준점(px/py)이 한 타일 뒤에 남아 있는 상황
  state.raiders = {
    x: 1, y: 1, px: 0, py: 1, path: [{ x: 2, y: 1 }, { x: 3, y: 1 }], power: 60, size: 5,
    faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
  };
  state.battle = {
    phase: 'muster', frontX: 1, frontY: 1, initialPower: 60, defenderIds: [], ticks: 0,
    musterDeadline: battles.BATTLE_MUSTER_DEADLINE, faction: 'test faction', warned: false, siege: false,
    outcome: null,
  };

  raids.raidersTick(state, () => 0);
  assert.equal(state.raiders.x, 1);            // 전투 중엔 전진하지 않는다
  assert.equal(state.raiders.path.length, 2);
  assert.equal(state.raiders.px, 1);           // 보간 기준점은 현재 위치로 고정 — 뒤로 미끄러지는 반복 연출 방지
  assert.equal(state.raiders.py, 1);
}

{
  const state = simulation.newGame(987);
  state.raiders = {
    x: 10, y: 10, px: 10, py: 10, path: [], power: 100, size: 6,
    faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
  };
  state.battle = {
    phase: 'clash', frontX: 10, frontY: 10, initialPower: 100, defenderIds: [], ticks: 0,
    musterDeadline: battles.BATTLE_MUSTER_DEADLINE, faction: 'test faction', warned: false, siege: false,
  };
  state.resources.defense = 100;

  simulation.advanceTick(state);
  assert.ok(state.raiders.power < 100);
}

{
  const state = simulation.newGame(2468);
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.buildingId = null;
    }
  }
  const defender = state.residents[0];
  defender.job = 'militia';
  defender.x = 0;
  defender.y = 0;
  defender.px = 0;
  defender.py = 0;
  defender.path = [];
  state.raiders = {
    x: 6, y: 0, px: 6, py: 0, path: [], power: 200, size: 6,
    faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
  };
  state.battle = {
    phase: 'muster', frontX: 6, frontY: 0, initialPower: 200, defenderIds: [defender.id], ticks: 0,
    musterDeadline: battles.BATTLE_MUSTER_DEADLINE, faction: 'test faction', warned: false, siege: false,
  };

  simulation.advanceTick(state);
  assert.equal(defender.task, '출전 중');
  assert.ok(Math.abs(defender.x - 6) + Math.abs(defender.y) < 6);
}

{
  const state = simulation.newGame(1357);
  const prevReputation = state.resources.reputation;
  state.threat = 95;
  state.raiders = {
    x: 10, y: 10, px: 10, py: 10, path: [], power: 34, size: 4,
    faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
  };
  state.battle = {
    phase: 'clash', frontX: 10, frontY: 10, initialPower: 100, defenderIds: [], ticks: 0,
    musterDeadline: battles.BATTLE_MUSTER_DEADLINE, faction: 'test faction', warned: false, siege: false,
  };

  battles.battleTick(state, () => 0);
  assert.equal(state.battle, null);
  assert.equal(state.raiders, null);
  assert.equal(state.raidCooldown, CONFIG.threat.raidCooldownDays);
  assert.equal(state.threat, CONFIG.threat.afterRaidThreat);
  assert.equal(state.resources.reputation, prevReputation + 5);
}

{
  const state = simulation.newGame(9753);
  state.buildings = [];
  for (const resident of state.residents) resident.job = 'idle';
  state.threat = 95;
  const prevMorale = state.residents[0].morale;
  state.raiders = {
    x: 10, y: 10, px: 10, py: 10, path: [], power: 100, size: 6,
    faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
  };
  state.battle = {
    phase: 'clash', frontX: 10, frontY: 10, initialPower: 100, defenderIds: [], ticks: battles.BATTLE_CLASH_TICK_LIMIT - 1,
    musterDeadline: battles.BATTLE_MUSTER_DEADLINE, faction: 'test faction', warned: false, siege: false,
  };

  battles.battleTick(state, () => 0.99);
  assert.equal(state.battle, null);
  assert.equal(state.raiders, null);
  assert.equal(state.raidCooldown, CONFIG.threat.raidCooldownDays);
  assert.equal(state.threat, CONFIG.threat.afterRaidThreat);
  assert.ok(state.residents[0].morale < prevMorale);
}

// 요격/징집 징집 규칙: 대상 필터, 징집 보너스, 그리고 방어도 부풀림 없음(직업 불변) 회귀
{
  const state = simulation.newGame(555);
  for (const resident of state.residents) resident.job = 'idle';
  state.residents[0].job = 'watchman';
  state.residents[1].job = 'militia';
  const defenseBefore = computeDefense(state);
  const raidChoice = () => ({
    kind: 'raid', title: 'test', body: 'test', options: [],
    data: { power: 80, faction: 'test faction', warned: false, siege: false },
  });
  const raidBand = () => ({
    x: 10, y: 8, px: 10, py: 8, path: [], power: 80, size: 5,
    faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
  });

  // 요격: 수비병+파수꾼만, 직업은 바뀌지 않는다 (computeDefense 부풀림 방지)
  state.pendingChoice = raidChoice();
  state.raiders = raidBand();
  assert.equal(battles.startBattle(state, 'garrison'), true);
  assert.equal(state.residents[0].job, 'watchman');
  assert.equal(state.residents[1].job, 'militia');
  assert.equal(computeDefense(state), defenseBefore);
  assert.equal(state.battle.levyBonus, 0);
  assert.deepEqual(
    [...state.battle.defenderIds].sort((a, b) => a - b),
    [state.residents[0].id, state.residents[1].id].sort((a, b) => a - b),
  );

  // 징집: 성한 주민 전체 + 일반 주민 수 × levyDefensePerResident 보너스, 직업 불변
  state.battle = null;
  state.pendingChoice = raidChoice();
  state.raiders = raidBand();
  const able = state.residents.filter(r => r.alive && !r.sick && r.health >= 20);
  const civilians = able.filter(r => r.job !== 'militia' && r.job !== 'watchman').length;
  assert.equal(battles.startBattle(state, 'levy'), true);
  assert.equal(state.battle.mode, 'levy');
  assert.equal(state.battle.defenderIds.length, able.length);
  assert.equal(state.battle.levyBonus, civilians * CONFIG.raid.levyDefensePerResident);
  assert.equal(computeDefense(state), defenseBefore);
  assert.ok(state.residents.every(r => r.job !== 'militia' || r === state.residents[1]));
}

// 밸런스: 전투 전체 루프의 승률이 기존 즉시 판정 공식 defense/(defense+power)와 일치해야 한다
{
  const state = simulation.newGame(4242);
  for (const resident of state.residents) resident.job = 'idle';
  for (const resident of state.residents.slice(0, 3)) resident.job = 'militia';
  state.weather = 'clear';

  const power = 60;
  const defense = computeDefense(state); // 중심지 5 + 수비병 3×12 = 41
  const expected = defense / (defense + power);

  const TRIALS = 300;
  let wins = 0;
  for (let i = 0; i < TRIALS; i++) {
    state.weather = 'clear';
    state.resources.reputation = 50;
    state.raiders = {
      x: 10, y: 10, px: 10, py: 10, path: [], power, size: 5,
      faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
    };
    state.battle = {
      phase: 'clash', frontX: 10, frontY: 10, initialPower: power, defenderIds: [], ticks: 0,
      musterDeadline: battles.BATTLE_MUSTER_DEADLINE, faction: 'test faction',
      warned: false, siege: false, outcome: null,
    };
    const rng = makeRng(70000 + i * 13);
    for (let guard = 0; state.battle && guard < 20; guard++) battles.battleTick(state, rng);
    assert.equal(state.battle, null, '전투는 틱 상한 안에 끝나야 한다');
    if (state.resources.reputation === 55) wins++;
  }
  const winRate = wins / TRIALS;
  assert.ok(
    Math.abs(winRate - expected) <= 0.09,
    `승률 ${(winRate * 100).toFixed(1)}%가 기존 공식 ${(expected * 100).toFixed(1)}%에서 벗어남`,
  );
}

// 밸런스(징집): 승률이 (defense+levyBonus)/(defense+levyBonus+power)를 따라야 한다
{
  const state = simulation.newGame(5252);
  for (const resident of state.residents) resident.job = 'idle';
  for (const resident of state.residents.slice(0, 3)) resident.job = 'militia';
  state.weather = 'clear';

  const power = 60;
  const levyBonus = 40;
  const defense = computeDefense(state) + levyBonus;
  const expected = defense / (defense + power);

  const TRIALS = 300;
  let wins = 0;
  for (let i = 0; i < TRIALS; i++) {
    state.weather = 'clear';
    state.resources.reputation = 50;
    state.raiders = {
      x: 10, y: 10, px: 10, py: 10, path: [], power, size: 5,
      faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
    };
    state.battle = {
      phase: 'clash', mode: 'levy', frontX: 10, frontY: 10, initialPower: power,
      defenderIds: [], levyBonus, ticks: 0,
      musterDeadline: battles.BATTLE_MUSTER_DEADLINE, faction: 'test faction',
      warned: false, siege: false, outcome: null,
    };
    const rng = makeRng(80000 + i * 17);
    for (let guard = 0; state.battle && guard < 20; guard++) battles.battleTick(state, rng);
    assert.equal(state.battle, null, '전투는 틱 상한 안에 끝나야 한다');
    if (state.resources.reputation === 55) wins++;
  }
  const winRate = wins / TRIALS;
  assert.ok(
    Math.abs(winRate - expected) <= 0.09,
    `징집 승률 ${(winRate * 100).toFixed(1)}%가 공식 ${(expected * 100).toFixed(1)}%에서 벗어남`,
  );
}

// 징집 즉시 기존 작업 경로를 버리고 전선으로 향해야 한다 (직업은 그대로)
{
  const state = simulation.newGame(8642);
  for (const row of state.map) {
    for (const tile of row) {
      tile.terrain = 'plain';
      tile.buildingId = null;
    }
  }
  for (const resident of state.residents) resident.job = 'idle';
  const defender = state.residents[0];
  defender.job = 'watchman';
  defender.x = 0;
  defender.y = 0;
  defender.px = 0;
  defender.py = 0;
  defender.path = [{ x: 0, y: 1 }, { x: 0, y: 2 }, { x: 0, y: 3 }];
  defender.targetId = 999;
  state.pendingChoice = {
    kind: 'raid',
    title: 'test',
    body: 'test',
    options: [],
    data: { power: 120, faction: 'test faction', warned: false, siege: false },
  };
  state.raiders = {
    x: 6, y: 0, px: 6, py: 0, path: [], power: 120, size: 6,
    faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
  };

  assert.equal(battles.startBattle(state, 'garrison'), true);
  assert.equal(defender.job, 'watchman'); // 직업 스왑 없음 (방어도 부풀림 회귀 방지)
  assert.equal(defender.path.length, 0);
  assert.equal(defender.targetId, null);
  assert.equal(state.battle.draftedJobs, undefined);

  simulation.advanceTick(state);
  assert.equal(defender.task, '출전 중');
  assert.ok(defender.x > 0, '기존 아래쪽 경로가 아니라 전선 쪽 동쪽으로 움직여야 한다');
}

// 구버전 저장 호환: 예전 코드가 바꿔 둔 직업(draftedJobs)은 전투 종료 때 복원된다
{
  const state = simulation.newGame(97531);
  const defender = state.residents[0];
  defender.job = 'militia';
  state.raiders = {
    x: 10, y: 10, px: 10, py: 10, path: [], power: 34, size: 4,
    faction: 'test faction', warned: false, spotted: true, siege: false, speed: 1, trail: [],
  };
  state.battle = {
    phase: 'clash', frontX: 10, frontY: 10, initialPower: 100, defenderIds: [defender.id], ticks: 0,
    musterDeadline: battles.BATTLE_MUSTER_DEADLINE, faction: 'test faction', warned: false, siege: false,
    outcome: 'victory', draftedJobs: [{ id: defender.id, job: 'watchman' }],
  };

  battles.battleTick(state, () => 0);
  assert.equal(state.battle, null);
  assert.equal(defender.job, 'watchman');
}

// 습격 모달 본문은 세력 설명을 괄호로 붙이지 않고 UI 툴팁에 맡긴다
{
  const state = simulation.newGame(6161);
  const { FACTIONS } = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);
  const faction = FACTIONS.find(f => f.hostile);
  raids.openRaidChoice(state, () => 0, true, 42, faction.name);
  assert.ok(state.pendingChoice.body.includes(faction.name));
  assert.equal(state.pendingChoice.body.includes(`(${faction.desc})`), false);
}

console.log('battle tests passed');
