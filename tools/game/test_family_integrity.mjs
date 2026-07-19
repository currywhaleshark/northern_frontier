import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const lifecycle = await load('lifecycle');
const residents = await load('residents');
const specialResidents = await load('specialResidents');
const family = await load('family');
const saveLoad = await load('saveLoad');
const { CONFIG } = await load('config');

const SAVE_KEY = 'buksae-save-v3';
const selectionSource = readFileSync(new URL('../../src/components/SelectionContextBar.tsx', import.meta.url), 'utf8');

function appointScholar(seed) {
  const state = simulation.newGame(seed);
  state.buildings.push({
    id: state.nextBuildingId++, type: 'office', x: 1, y: 1,
    progress: 99, built: true, fieldGrowth: 0,
  });
  state.rank = 'bu';
  assert.equal(specialResidents.maybeOfferExiledScholar(state, () => 0), true);
  specialResidents.resolveSpecialResidentChoice(state, 'appoint', () => 0.25);
  return state;
}

// 실제 특수 주민 압송은 배우자 연결을 풀고, 자녀에게 부모 이름을 남기며 명부는 departed다.
{
  const state = appointScholar(2026071820);
  const scholar = state.residents.find(resident => resident.special === 'exiledScholar');
  const spouse = state.residents.find(resident => resident.id !== scholar.id && resident.gender !== scholar.gender);
  const child = state.residents.find(resident => resident.id !== scholar.id && resident.id !== spouse.id);
  assert.ok(scholar && spouse && child);
  scholar.spouseId = spouse.id;
  spouse.spouseId = scholar.id;
  if (scholar.gender === 'male') {
    child.fatherId = scholar.id;
    child.motherId = spouse.id;
  } else {
    child.motherId = scholar.id;
    child.fatherId = spouse.id;
  }
  delete child.motherName;
  delete child.fatherName;
  const scholarName = scholar.name;
  const populationBefore = residents.livingResidents(state).length;

  state.suspicion = CONFIG.specialResidents.exiledScholarCourtDemandSuspicion;
  assert.equal(specialResidents.maybeOpenExiledScholarFollowup(state, () => 0), true);
  specialResidents.resolveSpecialResidentChoice(state, 'surrender', () => 0.3);

  assert.equal(state.specialResidentRecords.exiledScholar.status, 'departed');
  assert.equal(state.residents.some(resident => resident.id === scholar.id), false);
  assert.equal(residents.livingResidents(state).length, populationBefore - 1);
  assert.equal(spouse.spouseId, null);
  if (scholar.gender === 'male') {
    assert.equal(child.fatherId, undefined);
    assert.equal(child.fatherName, scholarName);
  } else {
    assert.equal(child.motherId, undefined);
    assert.equal(child.motherName, scholarName);
  }

  // 남은 배우자는 다음 혼인 판정에서 다시 짝을 맺을 수 있다.
  const candidate = state.residents.find(resident =>
    resident.id !== spouse.id && resident.id !== child.id && resident.gender !== spouse.gender);
  assert.ok(candidate);
  for (const resident of state.residents) {
    resident.alive = resident.id === spouse.id || resident.id === candidate.id;
    resident.stage = null;
    resident.age = 25;
    resident.spouseId = null;
    resident.hunger = 100;
    resident.warmth = 100;
  }
  state.pendingChoice = null;
  lifecycle.lifecycleDailyTick(state, () => 0);
  assert.equal(spouse.spouseId, candidate.id, 'departed resident spouse can remarry');
}

// 사망자는 배열에 남으므로 부모·배우자 ID를 정리하지 않는다.
{
  const state = simulation.newGame(2026071821);
  const parent = state.residents[0];
  const spouse = state.residents[1];
  const child = state.residents[2];
  parent.spouseId = spouse.id;
  spouse.spouseId = parent.id;
  child.fatherId = parent.id;
  residents.killResident(state, parent, '병');
  family.normalizeResidentFamilyReferences(state);
  assert.equal(child.fatherId, parent.id);
  assert.equal(child.fatherName, parent.name);
  assert.equal(state.residents.some(resident => resident.id === parent.id), true);
}

// 표시 순서: 유효 ID의 현재 이름 → 저장된 이름 → 미상.
{
  const state = simulation.newGame(2026071822);
  const parent = state.residents[0];
  assert.equal(family.familyReferenceName(state, parent.id, '옛 이름'), parent.name);
  assert.equal(family.familyReferenceName(state, undefined, '떠난 부모'), '떠난 부모');
  assert.equal(family.familyReferenceName(state, undefined, undefined), '미상');
}

// v23 저장은 유효 부모 이름을 채우고, 유실 ID는 지우되 기존 스냅샷을 덮어쓰지 않는다.
{
  const legacy = simulation.newGame(2026071823);
  const mother = legacy.residents[0];
  const child = legacy.residents[1];
  const orphan = legacy.residents[2];
  child.motherId = mother.id;
  delete child.motherName;
  orphan.fatherId = 999999;
  orphan.fatherName = '떠난 아버지';
  orphan.spouseId = 888888;
  store.set(SAVE_KEY, JSON.stringify({ ...legacy, schemaVersion: 23 }));

  const loaded = saveLoad.loadGame();
  assert.ok(loaded);
  const loadedChild = loaded.residents.find(resident => resident.id === child.id);
  const loadedOrphan = loaded.residents.find(resident => resident.id === orphan.id);
  assert.equal(loadedChild.motherId, mother.id);
  assert.equal(loadedChild.motherName, mother.name);
  assert.equal(loadedOrphan.fatherId, undefined);
  assert.equal(loadedOrphan.fatherName, '떠난 아버지');
  assert.equal(loadedOrphan.spouseId, null);

  assert.equal(saveLoad.saveGame(loaded), true);
  const roundTrip = saveLoad.loadGame();
  const roundTripOrphan = roundTrip.residents.find(resident => resident.id === orphan.id);
  assert.equal(roundTripOrphan.fatherName, '떠난 아버지');
  assert.equal(family.familyReferenceName(roundTrip, roundTripOrphan.fatherId, roundTripOrphan.fatherName), '떠난 아버지');
}

assert.match(selectionSource, /familyReferenceName/);
assert.match(selectionSource, /어머니/);
assert.match(selectionSource, /아버지/);

console.log('family integrity tests passed');
