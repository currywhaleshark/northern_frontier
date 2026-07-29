import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-artifact-weapon-tests-'));
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

const store = new Map();
globalThis.localStorage = {
  getItem: key => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, value),
  removeItem: key => store.delete(key),
};

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const weapons = await import(pathToFileURL(join(compiledDir, 'weapons.mjs')).href);
const roster = await import(pathToFileURL(join(compiledDir, 'combatRoster.mjs')).href);
const capabilities = await import(pathToFileURL(join(compiledDir, 'combatCapabilities.mjs')).href);
const battles = await import(pathToFileURL(join(compiledDir, 'battles.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const tacticalBattle = await import(pathToFileURL(join(compiledDir, 'tacticalBattle.mjs')).href);
const tacticalAssault = await import(pathToFileURL(join(compiledDir, 'tacticalAssault.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function fighters(state) {
  const roles = ['militia', 'watchman', 'hunter'];
  const selected = state.residents.slice(0, 4);
  selected.forEach((resident, index) => {
    resident.alive = true;
    resident.stage = undefined;
    resident.sick = false;
    resident.health = 100;
    resident.job = roles[index % roles.length];
  });
  return selected;
}

function grantWeapons(state, ...items) {
  for (const item of items) {
    state.specialItems[item] = 1;
    if (!state.discoveredSpecialItems.includes(item)) state.discoveredSpecialItems.push(item);
  }
}

function snapshotFor(state, context, residentId) {
  const options = context === 'villageDefense'
    ? { context }
    : { context, memberIds: [residentId] };
  return roster.createCombatRoster(state, options).combatants
    .find(combatant => combatant.residentId === residentId);
}

function close(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);
}

// 세 고유 무기는 독립 배정되며 한 주민은 하나만 장착한다.
// 장착 순간 일반 배정이 빠지고, 고유 무기 보유 중 일반 무기 재배정은 차단된다.
{
  const state = simulation.newGame(1401);
  const [militia, watchman, hunter] = fighters(state);
  state.weaponAllocationMode = 'manual';
  state.resources.spears = 1;
  state.weaponAssignments = { [militia.id]: 'spear' };
  grantWeapons(state, 'royalSpear', 'royalHornBow', 'royalMusket');

  assert.equal(weapons.setResidentArtifactWeapon(state, militia.id, 'royalSpear'), null);
  assert.equal(state.weaponAssignments[militia.id], undefined, '고유 무기 장착자는 일반 재고를 점유하지 않는다');
  assert.equal(weapons.setResidentArtifactWeapon(state, watchman.id, 'royalHornBow'), null);
  assert.equal(weapons.setResidentArtifactWeapon(state, hunter.id, 'royalMusket'), null);
  assert.deepEqual(weapons.resolvedArtifactWeaponAssignments(state), {
    royalSpear: militia.id,
    royalHornBow: watchman.id,
    royalMusket: hunter.id,
  });
  assert.match(
    weapons.setResidentArtifactWeapon(state, militia.id, 'royalHornBow'),
    /다른 주민/,
    '이미 배정된 고유 무기는 다른 주민에게 중복 배정되지 않는다',
  );
  assert.match(
    weapons.setResidentWeapon(state, militia.id, 'spear'),
    /고유무기|고유 무기|어사창/,
    '고유 무기 장착 중에는 일반 무기 API를 차단한다',
  );
  assert.equal(state.weaponAssignments[militia.id], undefined);
  assert.equal(weapons.setResidentWeapon(state, state.residents[3].id, 'spear'), null,
    '고유 무기가 비운 일반 재고는 다른 주민이 쓸 수 있다');
}

// 자동 배정은 특수 주민을 먼저, 그 안과 일반 주민 안에서는 militia→watchman→hunter와 ID 순으로 고정한다.
{
  const state = simulation.newGame(1402);
  const [commonMilitia, specialWatchman, specialHunter, commonMilitia2] = fighters(state);
  commonMilitia.job = 'militia';
  specialWatchman.job = 'watchman';
  specialHunter.job = 'hunter';
  commonMilitia2.job = 'militia';
  specialWatchman.special = 'hangwae';
  specialHunter.special = 'tigerHunter';
  grantWeapons(state, 'royalSpear', 'royalHornBow', 'royalMusket');
  state.weaponAllocationMode = 'auto';
  state.artifactWeaponAssignments = {};
  const auto = weapons.automaticArtifactWeaponAssignments(state);
  assert.deepEqual(auto, {
    royalSpear: specialWatchman.id,
    royalHornBow: specialHunter.id,
    royalMusket: commonMilitia.id,
  });

  state.specialItems.royalHornBow = 0;
  state.specialItems.royalMusket = 0;
  state.artifactWeaponAssignments = {};
  weapons.reconcileArtifactWeaponAssignments(state);
  const preserved = state.artifactWeaponAssignments.royalSpear;
  state.specialItems.royalHornBow = 1;
  weapons.reconcileArtifactWeaponAssignments(state);
  assert.equal(state.artifactWeaponAssignments.royalSpear, preserved,
    '자동 모드의 기존 유효 배정은 새 하사 뒤에도 유지된다');
  assert.equal(typeof state.artifactWeaponAssignments.royalHornBow, 'number',
    '자동 모드에서 새로 하사된 빈 고유 무기는 다음 정규화 때 자동 배정된다');
}

// 적격 주민이 없는 상태에서 자동 배분을 눌러도 null을 고정하지 않고,
// 이후 전투 직업 주민이 생기면 다음 정규화에서 다시 배정한다.
{
  const state = simulation.newGame(14021);
  state.residents.forEach(resident => {
    resident.job = 'idle';
    resident.special = undefined;
  });
  grantWeapons(state, 'royalSpear');
  weapons.setAutomaticWeaponAllocation(state);
  assert.equal(Object.prototype.hasOwnProperty.call(state.artifactWeaponAssignments, 'royalSpear'), false,
    '적격 주민이 없으면 자동 배분이 null key를 남기지 않는다');

  const laterMilitia = state.residents[0];
  laterMilitia.alive = true;
  laterMilitia.stage = undefined;
  laterMilitia.job = 'militia';
  weapons.reconcileWeaponAssignments(state);
  assert.equal(state.artifactWeaponAssignments.royalSpear, laterMilitia.id,
    '후속 적격 주민은 다음 자동 정규화에서 미배정 고유 무기를 받는다');
}

// 각 고유 무기의 스냅숏 총 전투력은 같은 역할·출신·특수 상태의 일반 동급 무기 정확히 1.25배다.
{
  const state = simulation.newGame(1403);
  const [militia, watchman, hunter] = fighters(state);
  state.weaponAllocationMode = 'manual';
  grantWeapons(state, 'royalSpear', 'royalHornBow', 'royalMusket');
  weapons.setResidentArtifactWeapon(state, militia.id, 'royalSpear');
  weapons.setResidentArtifactWeapon(state, watchman.id, 'royalHornBow');
  weapons.setResidentArtifactWeapon(state, hunter.id, 'royalMusket');
  state.resources.gunpowder = 10;

  for (const [resident, item, baseWeapon] of [
    [militia, 'royalSpear', 'spear'],
    [watchman, 'royalHornBow', 'hornBow'],
    [hunter, 'royalMusket', 'musket'],
  ]) {
    const defenseSnapshot = snapshotFor(state, 'villageDefense', resident.id);
    const expeditionSnapshot = snapshotFor(state, 'expedition', resident.id);
    for (const [label, combatant] of [['정착지', defenseSnapshot], ['원정·사냥', expeditionSnapshot]]) {
      assert.equal(combatant.artifactWeapon, item);
      assert.equal(combatant.assignedWeapon, baseWeapon);
      const normal = capabilities.combatWeaponTotalPower(
        combatant.role, baseWeapon, combatant.origin, combatant.special,
      );
      close(
        combatant.basePower + combatant.weaponPower,
        normal * CONFIG.courtGrants.artifactWeaponPowerMultiplier,
        `${label} ${item} 총 전투력`,
      );
    }
  }
}

// 정착지 직접전과 사냥·토벌 공용 원정 전술조에서도 고유 무기 장착자는 단독 조로 보존된다.
{
  const defense = simulation.newGame(14031);
  const [militia] = fighters(defense);
  defense.weaponAllocationMode = 'manual';
  grantWeapons(defense, 'royalSpear');
  weapons.setResidentArtifactWeapon(defense, militia.id, 'royalSpear');
  const normalSpearPower = capabilities.combatWeaponTotalPower(
    'militia', 'spear', militia.origin, militia.special,
  );
  const battle = tacticalBattle.createTacticalBattle(defense, {
    factionName: '고유무기 시험대',
    power: 50,
    warned: true,
    siege: false,
    mode: 'garrison',
  });
  const royalGroup = battle.defenderGroups.find(group => group.artifactWeapon === 'royalSpear');
  assert.deepEqual(royalGroup?.residentIds, [militia.id], '정착지 고유 무기 장착자는 단독 전술조다');
  close(royalGroup.power, normalSpearPower * 1.25, '정착지 고유 무기 조 초기 전력');
  close(capabilities.tacticalGroupPower(royalGroup, 1), normalSpearPower * 1.25,
    '정착지 교전 재계산도 고유 무기 배율을 유지한다');

  const hunt = simulation.newGame(14032);
  const [, , hunter] = fighters(hunt);
  hunter.skills.hunter = 0;
  hunter.special = 'tigerHunter';
  hunt.weaponAllocationMode = 'manual';
  grantWeapons(hunt, 'royalHornBow');
  weapons.setResidentArtifactWeapon(hunt, hunter.id, 'royalHornBow');
  const huntGroups = tacticalAssault.createExpeditionTacticalGroups(hunt, [hunter.id]);
  const huntGroup = huntGroups.find(group => group.artifactWeapon === 'royalHornBow');
  const normalBowPower = capabilities.combatWeaponTotalPower(
    'hunter', 'hornBow', hunter.origin, hunter.special,
  );
  assert.deepEqual(huntGroup?.residentIds, [hunter.id], '사냥·토벌 고유 무기 장착자는 단독 전술조다');
  close(huntGroup.power, normalBowPower * 1.25 * 0.75, '사냥·토벌 고유 무기 조 전력');
  close(capabilities.tacticalGroupPower(huntGroup, 1), normalBowPower * 1.25,
    '특수 주민 사냥·토벌 교전 재계산도 본인 기준 총 전투력 ×1.25다');
}

// 어사조총은 일반 조총 재고 없이 배정되지만 화약이 없으면 basePower만 남고, 있으면 기존 소비 경로를 쓴다.
{
  const state = simulation.newGame(1404);
  const [militia] = fighters(state);
  state.weaponAllocationMode = 'manual';
  state.resources.muskets = 0;
  grantWeapons(state, 'royalMusket');
  assert.equal(weapons.setResidentArtifactWeapon(state, militia.id, 'royalMusket'), null);
  state.resources.gunpowder = 0;
  const dry = snapshotFor(state, 'villageDefense', militia.id);
  assert.equal(dry.assignedWeapon, 'musket');
  assert.equal(dry.readyWeapon, null);
  assert.equal(dry.weaponPower, 0);

  state.resources.gunpowder = CONFIG.raid.powderPerMusket;
  const ready = snapshotFor(state, 'villageDefense', militia.id);
  assert.equal(ready.readyWeapon, 'musket');
  const normal = capabilities.combatWeaponTotalPower(ready.role, 'musket', ready.origin, ready.special);
  close(ready.basePower + ready.weaponPower, normal * 1.25, '장전된 어사조총 전투력');
  battles.consumeBattlePowder(state);
  close(state.resources.gunpowder, 0, '어사조총 화약 소비');
  assert.equal(state.resources.muskets, 0, '어사조총은 일반 조총 재고를 요구하거나 소비하지 않는다');
}

// 전사하면 고유 무기는 소실되고, 비전투 사망이면 장착만 풀려 기물함으로 회수된다.
{
  const combat = simulation.newGame(1405);
  const [fallen] = fighters(combat);
  combat.weaponAllocationMode = 'manual';
  grantWeapons(combat, 'royalSpear');
  weapons.setResidentArtifactWeapon(combat, fallen.id, 'royalSpear');
  residents.killResident(combat, fallen, '시험 교전', false, true);
  assert.equal(combat.specialItems.royalSpear, 0);
  assert.equal(combat.artifactWeaponAssignments.royalSpear, null);
  assert.ok(combat.discoveredSpecialItems.includes('royalSpear'), '전사 소실 뒤에도 도감은 남는다');

  const peaceful = simulation.newGame(1406);
  const [deceased] = fighters(peaceful);
  peaceful.weaponAllocationMode = 'manual';
  grantWeapons(peaceful, 'royalHornBow');
  weapons.setResidentArtifactWeapon(peaceful, deceased.id, 'royalHornBow');
  residents.killResident(peaceful, deceased, '노환');
  assert.equal(peaceful.specialItems.royalHornBow, 1);
  assert.equal(peaceful.artifactWeaponAssignments.royalHornBow, null);
}

// 자동 모드여도 비전투 사망의 명시적 null 회수는 다음 정규화에서 다른 주민에게 넘어가지 않는다.
// 자동 배분 버튼을 다시 누른 경우에만 새 적격 주민에게 재배정한다.
{
  const state = simulation.newGame(14061);
  const [deceased] = fighters(state);
  deceased.job = 'militia';
  state.weaponAllocationMode = 'auto';
  grantWeapons(state, 'royalSpear');
  weapons.reconcileArtifactWeaponAssignments(state);
  assert.equal(state.artifactWeaponAssignments.royalSpear, deceased.id);
  residents.killResident(state, deceased, '노환');
  assert.equal(state.specialItems.royalSpear, 1);
  assert.equal(state.artifactWeaponAssignments.royalSpear, null);
  weapons.reconcileWeaponAssignments(state);
  assert.equal(state.artifactWeaponAssignments.royalSpear, null,
    '비전투 회수 null은 자동 정규화 후에도 미배정으로 남는다');
  weapons.setAutomaticWeaponAllocation(state);
  const reassigned = state.artifactWeaponAssignments.royalSpear;
  assert.equal(typeof reassigned, 'number');
  assert.notEqual(reassigned, deceased.id,
    '명시적으로 자동 배분을 다시 누르면 회수된 고유 무기를 새 적격 주민에게 재배정한다');
}

// 저장 왕복은 유효한 독립 배정을 보존하고, 중복 주민·비보유·부적격 배정을 null로 정규화한다.
{
  const state = simulation.newGame(1407);
  const [militia, watchman] = fighters(state);
  state.weaponAllocationMode = 'manual';
  grantWeapons(state, 'royalSpear', 'royalHornBow');
  state.artifactWeaponAssignments = {
    royalSpear: militia.id,
    royalHornBow: watchman.id,
    royalMusket: null,
  };
  assert.equal(saveLoad.saveGame(state), true);
  const loaded = saveLoad.loadGame();
  assert.deepEqual(loaded?.artifactWeaponAssignments, state.artifactWeaponAssignments);

  state.artifactWeaponAssignments = {
    royalSpear: militia.id,
    royalHornBow: militia.id,
    royalMusket: watchman.id,
  };
  assert.equal(saveLoad.saveGame(state, 2), true);
  const normalized = saveLoad.loadGame(2);
  assert.equal(normalized?.artifactWeaponAssignments.royalSpear, militia.id);
  assert.equal(normalized?.artifactWeaponAssignments.royalHornBow, null, '한 주민의 두 번째 고유 무기는 해제된다');
  assert.equal(normalized?.artifactWeaponAssignments.royalMusket, null, '비보유 고유 무기는 해제된다');
}

console.log('artifact weapon tests passed');
