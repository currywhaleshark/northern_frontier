// 절목(節目) — 배율 적용, 슬롯 상한, 최소 유지 기간, 조령모개 페널티, 저장 마이그레이션 검증
// 계획: docs/DESIGN-2026-07-23-edict-system.md
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const store = new Map();
globalThis.localStorage = {
  getItem: key => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);

try {
  const edicts = await load('edicts');
  const agents = await load('agents');
  const buildings = await load('buildings');
  const simulation = await load('simulation');
  const morale = await load('morale');
  const consumption = await load('consumption');
  const agentCore = await load('agentCore');
  const fire = await load('fire');
  const lifecycle = await load('lifecycle');
  const residents = await load('residents');
  const wearables = await load('wearables');
  const { DAY_BANDS } = await load('dayCycle');
  const saveLoad = await load('saveLoad');
  const { CURRENT_SCHEMA_VERSION } = await load('saveSchema');
  const { CONFIG } = await load('config');

  const E = CONFIG.edicts;
  const GOOD_INPUTS = { foodOk: true, warmthAvg: 80, dietVarietyScore: 1, clothesCoverage: 1 };
  const edictFactors = state => morale.moraleBreakdown(state, GOOD_INPUTS)
    .filter(factor => factor.id.startsWith('edict:'));

  function addBuilt(state, type) {
    const building = { id: state.nextBuildingId++, type, x: 8, y: 8, progress: 9, built: true, fieldGrowth: 0 };
    state.buildings.push(building);
    return building;
  }

  function addClerk(state) {
    addBuilt(state, 'office');
    const clerk = state.residents.find(resident => resident.alive);
    Object.assign(clerk, { job: 'clerk', alive: true, sick: false, health: 100 });
    return clerk;
  }

  // ── 기본값(평시) = 지금까지와 같은 게임: 절목을 한 번도 열지 않은 고을 ──
  {
    const state = simulation.newGame(2026072501);
    assert.deepEqual(state.edicts, {}, 'a new settlement has no edict in force');
    assert.deepEqual(
      edicts.EDICT_ORDER,
      ['ration', 'fuelRation', 'immigration', 'fireCode', 'curfew', 'elderCare', 'corvee'],
      'the full confirmed edict set is exposed in a stable order',
    );
    for (const id of edicts.EDICT_ORDER) {
      assert.equal(edicts.edictLevel(state, id), 'normal');
      assert.equal(edicts.edictSinceDay(state, id), null, 'an untouched edict has no proclamation day');
      assert.equal(edicts.edictHoldRemainingDays(state, id), 0);
    }
    assert.equal(edicts.edictFoodRationMultiplier(state), 1);
    assert.equal(edicts.edictFuelRationMultiplier(state), 1);
    assert.equal(edicts.edictSlotsUsed(state), 0);
    assert.equal(edicts.edictSlotCapacity(state), E.slotsByRank.settlement);
    assert.equal(edicts.edictHoldDays(state), CONFIG.time.seasonDays, 'a proclaimed edict must hold one season');
    assert.deepEqual(edictFactors(state), [], 'peacetime edicts add no morale factor');
  }

  // ── 확장 절목: 평시 1배, 시행 중에는 각 시스템이 같은 설정값을 읽는다 ──
  {
    const state = simulation.newGame(2026080501);
    const elder = state.residents.find(resident => resident.alive);
    Object.assign(elder, { age: 60, stage: undefined, job: 'smith', sick: false, health: 100 });
    elder.skills.smith = 0;

    assert.equal(edicts.edictImmigrationChanceMultiplier(state), 1);
    assert.equal(edicts.edictFireIgnitionMultiplier(state), 1);
    assert.equal(edicts.edictFireSpreadMultiplier(state), 1);
    assert.equal(edicts.edictFireWorkMultiplier(state, 'smith'), 1);
    assert.equal(edicts.edictElderLaborMultiplier(state, elder), 1);
    assert.equal(edicts.edictElderDeathMultiplier(state, elder), 1);
    assert.equal(edicts.edictElderSicknessMultiplier(state, elder), 1);
    assert.equal(edicts.edictCurfewActive(state), false);
    assert.equal(edicts.edictCorveeActive(state), false);

    state.edicts = {
      immigration: { level: 'generous', sinceDay: state.day },
      fireCode: { level: 'tight', sinceDay: state.day },
      curfew: { level: 'tight', sinceDay: state.day },
      elderCare: { level: 'generous', sinceDay: state.day },
      corvee: { level: 'tight', sinceDay: state.day },
    };
    assert.equal(edicts.edictImmigrationChanceMultiplier(state), E.immigration.generous.chanceMult);
    assert.equal(edicts.edictImmigrationRejectionReputationMultiplier(state), E.immigration.generous.rejectionReputationMult);
    assert.equal(edicts.edictFireIgnitionMultiplier(state), E.fireCode.tight.ignitionMult);
    assert.equal(edicts.edictFireSpreadMultiplier(state), E.fireCode.tight.spreadMult);
    assert.equal(edicts.edictFireWorkMultiplier(state, 'smith'), E.fireCode.tight.fireWorkMult);
    assert.equal(edicts.edictFireWorkMultiplier(state, 'farmer'), 1, 'non-fire work is not penalized');
    assert.equal(
      agentCore.effOf(state, elder),
      E.elderCare.generous.elderLaborMult * E.fireCode.tight.fireWorkMult,
      'elder care and fire-work restrictions compose once in the common labor multiplier',
    );
    assert.equal(edicts.edictElderDeathMultiplier(state, elder), E.elderCare.generous.oldAgeDeathMult);
    assert.equal(edicts.edictElderSicknessMultiplier(state, elder), E.elderCare.generous.sicknessMult);
    assert.equal(edicts.edictCurfewActive(state), true);
    assert.equal(edicts.edictCorveeEveningSubticks(state), E.corvee.tight.eveningSubticks);
  }

  // ── 방화령은 같은 날씨의 발화 확률을 낮춘다 ──
  {
    const normal = simulation.newGame(2026080502);
    normal.weather = 'clear';
    const guarded = structuredClone(normal);
    guarded.edicts = { fireCode: { level: 'tight', sinceDay: guarded.day } };
    const baseChance = fire.fireDailyIgnitionChance(normal);
    assert.ok(baseChance > 0);
    assert.equal(
      fire.fireDailyIgnitionChance(guarded),
      baseChance * E.fireCode.tight.ignitionMult,
    );
  }

  // ── 야금령은 귀가 수공업 산출과 비축 목표를 함께 늘린다 ──
  {
    const normal = simulation.newGame(2026080503);
    normal.resources.hay = 1000;
    normal.resources.strawShoes = 0;
    normal.resources.leatherShoes = 0;
    const curfew = structuredClone(normal);
    curfew.edicts = { curfew: { level: 'tight', sinceDay: curfew.day } };
    const normalResident = normal.residents.find(resident => resident.alive && resident.stage !== 'infant');
    const curfewResident = curfew.residents.find(resident => resident.id === normalResident.id);
    normalResident.lastStrawShoeCraftDay = undefined;
    curfewResident.lastStrawShoeCraftDay = undefined;
    const normalOutput = wearables.craftStrawShoesAtHome(normal, normalResident);
    const curfewOutput = wearables.craftStrawShoesAtHome(curfew, curfewResident);
    assert.ok(normalOutput > 0);
    assert.equal(curfewOutput, normalOutput * E.curfew.tight.homeCraftMult);
    assert.ok(edicts.edictHomeCraftStockBuffer(curfew) > 0);
  }

  // ── 부역은 성인 건축가·운반꾼만, 휼로 중인 노인은 제외한다 ──
  {
    const state = simulation.newGame(2026080504);
    state.edicts = { corvee: { level: 'tight', sinceDay: state.day } };
    const worker = state.residents.find(resident => resident.alive);
    Object.assign(worker, { stage: undefined, age: 40, job: 'builder', sick: false, health: 100, quarantinedUntil: 0 });
    assert.equal(edicts.edictCorveeEligible(state, worker), true);
    worker.job = 'farmer';
    assert.equal(edicts.edictCorveeEligible(state, worker), false);
    worker.job = 'hauler';
    worker.age = 65;
    assert.equal(edicts.edictCorveeEligible(state, worker), true, 'ordinary elders may still join corvee');
    state.edicts.elderCare = { level: 'generous', sinceDay: state.day };
    assert.equal(edicts.edictCorveeEligible(state, worker), false, 'elder care explicitly exempts elders');
  }

  // ── 저녁 일과 통합: 부역 대상은 먼저 일하고, 야금 대상은 마실 대신 귀가한다 ──
  {
    const corveeState = simulation.newGame(2026080505);
    const worker = corveeState.residents.find(resident => resident.alive);
    for (const resident of corveeState.residents) resident.alive = resident.id === worker.id;
    Object.assign(worker, {
      alive: true, stage: undefined, age: 40, job: 'builder', sick: false, health: 100,
      quarantinedUntil: 0, birthRecoveryUntil: 0, carrying: {}, haulTask: null, manualOrder: null,
      x: 19, y: 20, px: 19, py: 20, phase: 'rest', path: [], targetId: null,
    });
    for (let y = 19; y <= 22; y++) {
      for (let x = 18; x <= 22; x++) {
        Object.assign(corveeState.map[y][x], { terrain: 'plain', buildingId: null });
        corveeState.exploration.explored[y][x] = true;
      }
    }
    const construction = {
      id: corveeState.nextBuildingId++, type: 'hut', x: 20, y: 20,
      progress: 0, built: false, fieldGrowth: 0,
    };
    corveeState.buildings.push(construction);
    buildings.occupyBuildingTiles(corveeState, construction);
    corveeState.weather = 'clear';
    corveeState.edicts = { corvee: { level: 'tight', sinceDay: corveeState.day } };
    corveeState.subTick = DAY_BANDS.evening.start;
    agents.agentsTick(corveeState);
    assert.ok(construction.progress > 0, 'the builder advances construction during the first corvee tick');
    assert.equal(worker.health, 100 - E.corvee.tight.healthLossPerSubtick,
      'the first evening corvee tick exacts its health cost');
    const healthAfterWindow = worker.health;
    corveeState.subTick = DAY_BANDS.evening.start + E.corvee.tight.eveningSubticks;
    agents.agentsTick(corveeState);
    assert.equal(worker.health, healthAfterWindow, 'corvee strain stops after the configured evening window');

    const curfewState = simulation.newGame(2026080506);
    const resident = curfewState.residents.find(candidate => candidate.alive && candidate.stage !== 'infant');
    for (const candidate of curfewState.residents) candidate.alive = candidate.id === resident.id;
    Object.assign(resident, {
      alive: true, job: 'idle', sick: false, health: 100, phase: 'rest', path: [], targetId: null,
      carrying: {}, haulTask: null, manualOrder: null,
    });
    curfewState.weather = 'clear';
    curfewState.edicts = { curfew: { level: 'tight', sinceDay: curfewState.day } };
    curfewState.subTick = DAY_BANDS.evening.start + 2;
    agents.agentsTick(curfewState);
    assert.ok(resident.phase === 'toHome' || resident.phase === 'sleeping');
    assert.notEqual(resident.task, '마실 나감', 'curfew sends an eligible resident home instead of to leisure');
  }

  // ── 반포: 관아 앞에 방이 붙고 배율·민심 내역이 함께 선다 ──
  {
    const state = simulation.newGame(2026072502);
    assert.equal(edicts.setEdictLevel(state, 'ration', 'tight'), null);
    assert.equal(edicts.edictLevel(state, 'ration'), 'tight');
    assert.equal(state.edicts.ration.sinceDay, state.day);
    assert.equal(edicts.edictDaysInEffect(state, 'ration'), 1, 'the day of proclamation counts as day one');
    assert.equal(edicts.edictFoodRationMultiplier(state), E.ration.tight.foodMult);
    assert.equal(edicts.edictSlotsUsed(state), 1);
    assert.ok(
      state.log.some(entry => entry.text.includes('방이 붙었습니다') && entry.text.includes('절미령')),
      'proclaiming an edict posts a notice at the government office',
    );

    const factors = edictFactors(state);
    assert.equal(factors.length, 1);
    assert.equal(factors[0].id, 'edict:ration');
    assert.equal(factors[0].delta, E.ration.tight.morale);
    assert.ok(factors[0].unlocked && factors[0].label.includes('1일째 시행'),
      'the morale breakdown shows how long the edict has been in force');

    // 후히 배급은 민심을 올린다 (같은 슬롯 안에서의 단계 변경)
    state.day += CONFIG.time.seasonDays;
    assert.equal(edicts.setEdictLevel(state, 'ration', 'generous'), null);
    assert.equal(edicts.edictFoodRationMultiplier(state), E.ration.generous.foodMult);
    assert.equal(edictFactors(state)[0].delta, E.ration.generous.morale);

    // 평시로 거두면 슬롯이 비고 민심 내역에서도 사라진다
    state.day += CONFIG.time.seasonDays;
    assert.equal(edicts.setEdictLevel(state, 'ration', 'normal'), null);
    assert.equal(edicts.edictSlotsUsed(state), 0, 'peacetime does not occupy a slot');
    assert.deepEqual(edictFactors(state), []);
    assert.equal(edicts.edictFoodRationMultiplier(state), 1);
    assert.ok(state.log.some(entry => entry.text.includes('거두었습니다')));
  }

  // ── 혹한·눈보라에는 절탄령의 배급이 더 야박해진다 ──
  {
    const state = simulation.newGame(2026072503);
    edicts.setEdictLevel(state, 'fuelRation', 'tight');
    state.weather = 'clear';
    assert.equal(edicts.edictFuelRationMultiplier(state), E.fuelRation.tight.fuelMult);
    state.weather = 'blizzard';
    assert.ok(edicts.edictFuelRationMultiplier(state) < E.fuelRation.tight.fuelMult);
    state.weather = 'coldSnap';
    assert.equal(
      edicts.edictFuelRationMultiplier(state),
      E.fuelRation.tight.fuelMult * E.fuelRation.tight.harshWeatherMult,
    );
  }

  // ── 슬롯 상한: 무엇을 포기할 것인가 ──
  {
    const state = simulation.newGame(2026072504);
    assert.equal(edicts.setEdictLevel(state, 'ration', 'tight'), null);
    const blocked = edicts.setEdictLevel(state, 'fuelRation', 'tight');
    assert.ok(blocked && blocked.includes(`${E.slotsByRank.settlement}개`),
      'a settlement may keep only one edict in force at a time');
    assert.equal(edicts.edictLevel(state, 'fuelRation'), 'normal', 'a blocked edict is not applied');

    state.rank = 'bo';
    assert.equal(edicts.edictSlotCapacity(state), E.slotsByRank.bo);
    assert.equal(edicts.setEdictLevel(state, 'fuelRation', 'tight'), null);
    assert.equal(edicts.edictSlotsUsed(state), 2);

    // 관청 + 아전은 행정력이 되어 슬롯 하나와 유지 기간 절반을 돌려준다
    const clerkState = simulation.newGame(2026072505);
    assert.equal(edicts.hasEdictClerk(clerkState), false);
    addClerk(clerkState);
    assert.equal(edicts.hasEdictClerk(clerkState), true);
    assert.equal(edicts.edictSlotCapacity(clerkState), E.slotsByRank.settlement + E.officeSlotBonus);
    assert.equal(
      edicts.edictHoldDays(clerkState),
      Math.max(1, Math.round(CONFIG.time.seasonDays * E.clerkHoldDaysMult)),
    );
    assert.equal(edicts.setEdictLevel(clerkState, 'ration', 'tight'), null);
    assert.equal(edicts.setEdictLevel(clerkState, 'fuelRation', 'tight'), null,
      'the extra clerk slot lets a settlement run two edicts');
  }

  // ── 조령모개(朝令暮改): 첫 반포는 자유, 한 계절 안의 뒤집기는 대가를 치른다 ──
  {
    const state = simulation.newGame(2026072506);
    const reputationBefore = state.resources.reputation;
    assert.equal(edicts.setEdictLevel(state, 'ration', 'tight'), null);
    assert.equal(state.edictWhiplashUntil, 0, 'the first proclamation is never whiplash');
    assert.equal(state.resources.reputation, reputationBefore);
    assert.equal(edicts.edictHoldRemainingDays(state, 'ration'), CONFIG.time.seasonDays);

    state.day += 3;
    assert.equal(edicts.edictHoldRemainingDays(state, 'ration'), CONFIG.time.seasonDays - 3);
    assert.equal(edicts.setEdictLevel(state, 'ration', 'normal'), null,
      'forcing a change inside the hold period is allowed — it just costs');
    assert.equal(state.edictWhiplashUntil, state.day + E.whiplashDays);
    assert.equal(state.resources.reputation, reputationBefore + E.whiplashReputation);
    const whiplash = edictFactors(state).find(factor => factor.id === 'edict:whiplash');
    assert.ok(whiplash && whiplash.delta === E.whiplashMoralePenalty,
      'whiplash is exposed in the morale breakdown like any other factor');
    assert.ok(state.log.some(entry => entry.text.includes('조령모개')));

    // 페널티는 며칠 뒤 가라앉는다
    state.day = state.edictWhiplashUntil;
    assert.equal(edictFactors(state).length, 0);

    // 한 계절을 지킨 뒤의 변경은 조령모개가 아니다
    const patient = simulation.newGame(2026072507);
    edicts.setEdictLevel(patient, 'ration', 'tight');
    patient.day += CONFIG.time.seasonDays;
    assert.equal(edicts.edictHoldRemainingDays(patient, 'ration'), 0);
    const patientReputation = patient.resources.reputation;
    assert.equal(edicts.setEdictLevel(patient, 'ration', 'normal'), null);
    assert.equal(patient.edictWhiplashUntil, 0);
    assert.equal(patient.resources.reputation, patientReputation);

    // 같은 단계를 다시 누르는 것은 변경이 아니다
    assert.ok(edicts.setEdictLevel(patient, 'ration', 'normal'));
  }

  // ── 절미령이 실제 하루에 반영된다: 곳간은 버티고 주민은 배를 곯는다 ──
  {
    const normalDay = simulation.newGame(2026072508);
    normalDay.resources.grain = 400;
    normalDay.resources.firewood = 400;
    const rationDay = structuredClone(normalDay);
    assert.equal(edicts.setEdictLevel(rationDay, 'ration', 'tight'), null);

    const foodNeed = lifecycle.consumptionWeight(normalDay) * CONFIG.needs.foodPerDay;
    const startDay = normalDay.day;
    simulation.advanceDay(normalDay);
    simulation.advanceDay(rationDay);
    assert.equal(normalDay.day, startDay + 1, 'the plain day ran to its end');
    assert.equal(rationDay.day, startDay + 1, 'the rationed day ran to its end');

    const saved = consumption.foodTotal(rationDay) - consumption.foodTotal(normalDay);
    const expected = foodNeed * (1 - E.ration.tight.foodMult);
    assert.ok(Math.abs(saved - expected) < 0.05,
      `절미령 saves the rationed share of the day's food (saved ${saved.toFixed(2)}, expected ${expected.toFixed(2)})`);
    assert.ok(residents.avg(rationDay, 'hunger') < residents.avg(normalDay, 'hunger'),
      'the saved grain is paid for in hunger — some folk went without a meal');
    assert.ok(!rationDay.log.some(entry => entry.text.includes('식량이 모자라')),
      'a deliberate ration is not reported as a shortage');
  }

  // ── 절탄령이 실제 하루에 반영된다: 연료는 남고 체온이 떨어진다 ──
  {
    const normalDay = simulation.newGame(2026072509);
    normalDay.day = CONFIG.time.seasonDays * 3 + 2; // 겨울
    normalDay.weather = 'clear';
    normalDay.resources.grain = 400;
    normalDay.resources.firewood = 400;
    for (const resident of normalDay.residents) resident.warmth = 70;
    const rationDay = structuredClone(normalDay);
    assert.equal(edicts.setEdictLevel(rationDay, 'fuelRation', 'tight'), null);

    simulation.advanceDay(normalDay);
    simulation.advanceDay(rationDay);
    assert.ok(consumption.fuelHeatTotal(rationDay) > consumption.fuelHeatTotal(normalDay),
      '절탄령 leaves fuel in the woodshed');
    assert.ok(residents.avg(rationDay, 'warmth') < residents.avg(normalDay, 'warmth'),
      'the saved fuel is paid for in body warmth');
    assert.ok(!rationDay.log.some(entry => entry.text.includes('장작이 부족해')),
      'a deliberate fuel ration is not reported as a shortage');
  }

  // ── 저장: 반포한 령은 그대로 돌아오고, 구버전 저장은 전부 평시가 된다 ──
  {
    const state = simulation.newGame(2026072510);
    edicts.setEdictLevel(state, 'ration', 'tight');
    state.edictWhiplashUntil = state.day + 2;
    assert.ok(saveLoad.saveGame(state, 1));
    const loaded = saveLoad.loadGame(1);
    assert.equal(loaded.edicts.ration.level, 'tight');
    assert.equal(loaded.edicts.ration.sinceDay, state.edicts.ration.sinceDay);
    assert.equal(loaded.edictWhiplashUntil, state.day + 2);

    // 절목 없는 구버전
    const legacy = saveLoad.migrateToCurrent({ ...structuredClone(state), edicts: undefined, schemaVersion: 36 });
    assert.equal(legacy.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.deepEqual(legacy.edicts, {}, 'a save from before 절목 starts with every edict at peacetime');
    assert.equal(legacy.edictWhiplashUntil, 0);

    // 모르는 령·단계는 버린다
    const broken = saveLoad.migrateToCurrent({
      ...structuredClone(state),
      schemaVersion: 36,
      edicts: {
        ration: { level: 'tight' },
        curfew: { level: 'tight', sinceDay: 3 },
        fuelRation: { level: 'generous', sinceDay: 3 },
        imaginary: { level: 'tight', sinceDay: 3 },
      },
    });
    assert.deepEqual(Object.keys(broken.edicts), ['ration', 'curfew'],
      'known new edicts survive while unknown ids and invalid levels are dropped');
    assert.equal(broken.edicts.ration.sinceDay, state.day, 'a missing proclamation day falls back to today');
  }

  console.log('edict (절목) tests passed');
} finally {
  rmSync(compiledDir, { recursive: true, force: true });
}
