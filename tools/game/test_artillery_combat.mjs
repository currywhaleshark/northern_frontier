import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-artillery-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const artillery = await import(pathToFileURL(join(compiledDir, 'artillery.mjs')).href);
const battles = await import(pathToFileURL(join(compiledDir, 'battles.mjs')).href);
const tactical = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function addEmplacement(state, type, built = true) {
  state.buildings.push({
    id: state.nextBuildingId++,
    type,
    x: 0,
    y: 0,
    progress: built ? 6 : 0,
    built,
    fieldGrowth: 0,
  });
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);
}

function createDirectBattle(seed, types, gunpowder, power = 180) {
  const state = simulation.newGame(seed);
  for (const type of types) addEmplacement(state, type);
  state.resources.gunpowder = gunpowder;
  const battle = tactical.createTacticalBattle(state, {
    factionName: '포병 시험대',
    power,
    warned: true,
    siege: true,
    mode: 'garrison',
  });
  battle.prepPoints = 8;
  return { state, battle };
}

// 불랑기만 있을 때는 포대 수와 무관하게 기존 1.2 배율이며, 문당 6%가 곱연산으로 누적된다.
{
  const state = simulation.newGame(1301);
  addEmplacement(state, 'cannonEmplacement');
  addEmplacement(state, 'cannonEmplacement');
  addEmplacement(state, 'cannonEmplacement');
  const summary = artillery.activeArtillery(state, 99);
  assert.equal(summary.cannonCount, 3);
  assert.equal(summary.chongtongCount, 0);
  assert.equal(summary.powderCost, 6);
  assert.equal(summary.defenseMultiplier, CONFIG.raid.cannonBattleMult);
  close(summary.bombardmentStrength, 1 - 0.94 ** 3, '불랑기 3문 사전포격');
}

// 총통은 낮은 1.1 배율과 문당 3% 손실률을 쓴다.
{
  const state = simulation.newGame(1302);
  addEmplacement(state, 'chongtongEmplacement');
  const summary = artillery.activeArtillery(state, 2);
  assert.equal(summary.cannonCount, 0);
  assert.equal(summary.chongtongCount, 1);
  assert.equal(summary.powderCost, 2);
  assert.equal(summary.defenseMultiplier, CONFIG.raid.chongtongBattleMult);
  close(summary.bombardmentStrength, 0.03, '총통 1문 사전포격');
}

// 혼합 포병은 종류별 배율을 곱하고, 화약 부족 시 강한 불랑기를 항상 먼저 가동한다.
{
  const state = simulation.newGame(1303);
  addEmplacement(state, 'cannonEmplacement');
  addEmplacement(state, 'cannonEmplacement');
  addEmplacement(state, 'chongtongEmplacement');
  assert.deepEqual(
    artillery.activeArtillery(state, 1.999),
    { cannonCount: 0, chongtongCount: 0, powderCost: 0, defenseMultiplier: 1, bombardmentStrength: 0 },
  );
  assert.deepEqual(
    artillery.activeArtillery(state, 2),
    {
      cannonCount: 1,
      chongtongCount: 0,
      powderCost: 2,
      defenseMultiplier: 1.2,
      bombardmentStrength: 0.06000000000000005,
    },
  );
  const twoPieces = artillery.activeArtillery(state, 4);
  assert.equal(twoPieces.cannonCount, 2);
  assert.equal(twoPieces.chongtongCount, 0);
  const mixed = artillery.activeArtillery(state, 6);
  assert.equal(mixed.cannonCount, 2);
  assert.equal(mixed.chongtongCount, 1);
  close(mixed.defenseMultiplier, 1.2 * 1.1, '혼합 포병 방어 배율');
  close(mixed.bombardmentStrength, 1 - 0.94 ** 2 * 0.97, '혼합 포병 사전포격');
}

// 미완공 포대는 자동전과 직접전 어느 쪽에도 효과가 없다.
{
  const state = simulation.newGame(1304);
  addEmplacement(state, 'cannonEmplacement', false);
  addEmplacement(state, 'chongtongEmplacement', false);
  state.resources.gunpowder = 20;
  assert.equal(artillery.artilleryPieceCount(artillery.activeArtillery(state)), 0);
  assert.equal(battles.cannonBattleMult(state), 1);
  const before = state.resources.gunpowder;
  battles.consumeBattlePowder(state);
  assert.equal(state.resources.gunpowder, before);
}

// 자동전은 조총 화약을 먼저 소비한 뒤 불랑기, 총통 순으로 남은 화약을 한 번만 소비한다.
{
  const state = simulation.newGame(1305);
  const resident = state.residents[0];
  resident.job = 'militia';
  state.resources.muskets = 1;
  state.weaponAllocationMode = 'manual';
  state.weaponAssignments = { [resident.id]: 'musket' };
  addEmplacement(state, 'cannonEmplacement');
  addEmplacement(state, 'chongtongEmplacement');

  state.resources.gunpowder = CONFIG.raid.powderPerMusket + CONFIG.raid.powderPerCannon;
  assert.equal(battles.activeBattleArtillery(state).cannonCount, 1);
  assert.equal(battles.activeBattleArtillery(state).chongtongCount, 0);
  battles.consumeBattlePowder(state);
  close(state.resources.gunpowder, 0, '조총과 불랑기 화약 소비');

  state.resources.gunpowder =
    CONFIG.raid.powderPerMusket + CONFIG.raid.powderPerCannon * 2;
  assert.equal(battles.cannonBattleMult(state), 1.2 * 1.1);
  battles.consumeBattlePowder(state);
  close(state.resources.gunpowder, 0, '조총과 혼합 포병 화약 단일 소비');
}

// 총통만으로 직접 지휘 사전포격을 선택할 수 있고, 정확히 3%의 전력 손실과 화약 2를 적용한다.
{
  const { state, battle } = createDirectBattle(1306, ['chongtongEmplacement'], 2);
  const powers = battle.raiderGroups.map(group => group.power);
  assert.equal(tactical.tacticalPreparationUnavailableReason(state, 'preliminaryBombardment'), null);
  assert.equal(tactical.spendPreparationAction(state, 'preliminaryBombardment'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.preliminaryBombardmentCannons, 0);
  assert.equal(battle.preliminaryBombardmentChongtongs, 1);
  assert.equal(state.resources.gunpowder, 0);
  battle.raiderGroups.forEach((group, index) =>
    close(group.power, powers[index] * 0.97, `총통 직접전 적 ${index} 전력`));
  assert.ok((battle.preliminaryBombardmentCasualties ?? 0) > 0);
  assert.match(state.log.at(-1)?.text ?? '', /지자총통 1문/);
}

// 혼합 사전포격도 같은 우선순위·비용을 쓰고, 보고서/연출에 두 종류를 함께 남긴다.
{
  const { state, battle } = createDirectBattle(
    1307,
    ['cannonEmplacement', 'chongtongEmplacement'],
    4,
  );
  assert.equal(tactical.spendPreparationAction(state, 'preliminaryBombardment'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.preliminaryBombardmentCannons, 1);
  assert.equal(battle.preliminaryBombardmentChongtongs, 1);
  assert.equal(state.resources.gunpowder, 0);
  const event = battle.preparationEvents.find(candidate => candidate.kind === 'bombardment');
  assert.match(event?.text ?? '', /불랑기포 1문과 지자총통 1문/);
  assert.equal(event?.shots?.cannons, 2);
}

// 직접 지휘에서도 한 문분 화약만 있으면 불랑기만 쏘고 총통은 대기한다.
{
  const { state, battle } = createDirectBattle(
    13071,
    ['cannonEmplacement', 'chongtongEmplacement'],
    2,
  );
  assert.equal(tactical.spendPreparationAction(state, 'preliminaryBombardment'), null);
  assert.equal(tactical.advanceTacticalPhase(state), null);
  assert.equal(battle.preliminaryBombardmentCannons, 1);
  assert.equal(battle.preliminaryBombardmentChongtongs, 0);
  assert.equal(state.resources.gunpowder, 0);
}

// 같은 입력의 사전포격은 외부 RNG를 소비하지 않고 완전히 같은 결과를 낸다.
{
  function run(seed) {
    const { state, battle } = createDirectBattle(seed, ['chongtongEmplacement'], 2, 240);
    tactical.spendPreparationAction(state, 'preliminaryBombardment');
    tactical.advanceTacticalPhase(state);
    return {
      powder: state.resources.gunpowder,
      casualties: battle.preliminaryBombardmentCasualties,
      powers: battle.raiderGroups.map(group => group.power),
      killed: battle.raiderGroups.map(group => group.killed),
    };
  }
  assert.deepEqual(run(1308), run(1308));
}

console.log('artillery combat tests passed');
