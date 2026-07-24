import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-physician-tests-'));
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
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);
const simulation = await load('simulation');
const buildings = await load('buildings');
const agents = await load('agents');
const medicine = await load('medicine');
const dayCycle = await load('dayCycle');
const specialEvents = await load('specialEvents');
const constants = await load('constants');
const workerSlots = await load('workerSlots');
const { CONFIG } = await load('config');

function sequenceRng(values, fallback = 0.5) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

function addActiveClinic(state, physicianIndex = 1) {
  state.rank = 'jin';
  const x = 20;
  const y = 20;
  for (let yy = y - 1; yy <= y + 2; yy++) {
    for (let xx = x - 1; xx <= x + 2; xx++) {
      const tile = state.map[yy][xx];
      tile.terrain = 'plain';
      tile.hasIron = false;
      tile.buildingId = null;
    }
  }
  const clinic = {
    id: state.nextBuildingId++, type: 'clinic', x, y,
    progress: buildings.BUILDING_DEFS.clinic.buildDays, built: true, fieldGrowth: 0,
  };
  state.buildings.push(clinic);
  buildings.occupyBuildingTiles(state, clinic);
  const physician = state.residents[physicianIndex];
  Object.assign(physician, {
    alive: true, sick: false, health: 100, hunger: 100, warmth: 100, morale: 70,
    job: 'physician', assignedBuildingId: clinic.id,
    x: x - 1, y, px: x - 1, py: y, phase: 'rest', path: [], workTimer: 0,
    targetId: null, carrying: {}, manualOrder: null, quarantinedUntil: 0,
  });
  return { clinic, physician };
}

function onlyEvent(state, eventId) {
  const ids = ['wolf', 'tiger', 'boar', 'wildGinseng', 'plagueSuspicion', 'grainRequisition', 'shipwreck', 'earlyFrost', 'gyrfalcon'];
  state.incidents.cooldownUntil = Object.fromEntries(ids.filter(id => id !== eventId).map(id => [id, 9999]));
  state.incidents.scheduledDays = [state.day];
}

{
  const state = simulation.newGame(2026071711);
  assert.equal(buildings.isBuildingUnlocked('bo', 'clinic'), false);
  assert.equal(buildings.isBuildingUnlocked('jin', 'clinic'), true);
  assert.equal(constants.isJobUnlocked('bo', 'physician'), false);
  assert.equal(constants.isJobUnlocked('jin', 'physician'), true);
  assert.deepEqual(workerSlots.workerSlotConfig('clinic'), { job: 'physician', slots: 2 });
}

{
  const state = simulation.newGame(2026071712);
  const { physician } = addActiveClinic(state);
  assert.equal(medicine.activePhysicianCount(state), 1);
  physician.sick = true;
  assert.equal(medicine.activePhysicianCount(state), 0, 'a sick physician provides no treatment or epidemic bonus');
}

{
  const state = simulation.newGame(2026071713);
  const { physician } = addActiveClinic(state);
  const patient = state.residents[0];
  patient.sick = true;
  patient.health = 50;
  state.resources.herbs = 2;
  const herbsBefore = state.resources.herbs;
  const result = medicine.performPhysicianTreatment(state, physician, 1, () => 0);
  assert.equal(result.status, 'recovered');
  assert.equal(patient.sick, false);
  assert.ok(patient.health > 50);
  assert.equal(state.resources.herbs, herbsBefore - CONFIG.medicine.herbsPerPhysicianPerDay / dayCycle.WORK_SUBTICKS);
}

{
  const state = simulation.newGame(2026071714);
  const { physician } = addActiveClinic(state);
  const patient = state.residents[0];
  for (const resident of state.residents) resident.alive = resident === physician || resident === patient;
  Object.assign(patient, { alive: true, sick: true, health: 45, quarantinedUntil: 0 });
  state.resources.herbs = 2;
  state.subTick = 9;
  const healthBefore = patient.health;
  const herbsBefore = state.resources.herbs;
  agents.agentsTick(state);
  assert.ok(patient.health > healthBefore, 'an assigned physician heals the highest-priority patient during the work tick');
  assert.ok(state.resources.herbs < herbsBefore);
  assert.match(physician.task, /진료/);
}

{
  const state = simulation.newGame(2026071715);
  addActiveClinic(state);
  onlyEvent(state, 'plagueSuspicion');
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, () => 0), true);
  assert.ok(state.pendingChoice.options.some(option => option.id === 'physician-diagnose'));
  const patientId = state.pendingChoice.data.residentId;
  specialEvents.resolveSpecialEvent(state, 'physician-diagnose', () => 0);
  assert.equal(state.incidents.plagueCase.resolvesOnDay, state.day + CONFIG.medicine.diagnosisDays);
  assert.equal(state.incidents.plagueCase.isolated, true);
  assert.ok(state.residents.find(resident => resident.id === patientId).quarantinedUntil > state.day);
  state.day = state.incidents.plagueCase.resolvesOnDay;
  specialEvents.updateSpecialEvents(state, () => 1);
  assert.equal(state.incidents.plagueCase, null);
  assert.equal(state.incidents.epidemic, null, 'physician diagnosis safely contains a real first case');
}

{
  const state = simulation.newGame(2026071716);
  addActiveClinic(state);
  const patient = state.residents[0];
  patient.sick = true;
  state.incidents.epidemic = {
    infectedIds: [patient.id], untilDay: state.day + 10, mode: 'uncontained',
  };
  state.incidents.scheduledDays = [state.day + 20];
  const healthBefore = patient.health;
  specialEvents.updateSpecialEvents(state, () => 0.18);
  assert.equal(state.incidents.epidemic.infectedIds.length, 1,
    'an active physician cuts spread chance below a roll that would spread without one');
  assert.equal(patient.health, healthBefore - 2, 'physician care reduces epidemic health damage');
}

{
  const state = simulation.newGame(2026071717);
  const patient = state.residents[0];
  patient.sick = true;
  state.incidents.epidemic = {
    infectedIds: [patient.id], untilDay: state.day + 10, mode: 'uncontained',
  };
  state.incidents.scheduledDays = [state.day + 20];
  specialEvents.updateSpecialEvents(state, () => 0.18);
  assert.equal(state.incidents.epidemic.infectedIds.length, 2,
    'the same roll spreads an uncontained epidemic when no physician is active');
}

{
  const state = simulation.newGame(2026071718);
  addActiveClinic(state);
  const patient = state.residents[0];
  patient.sick = true;
  state.incidents.epidemic = {
    infectedIds: [patient.id], untilDay: state.day + 10, mode: 'uncontained',
  };
  state.incidents.scheduledDays = [state.day + 20];
  specialEvents.updateSpecialEvents(state, sequenceRng([1, 0.01, 0]));
  assert.equal(patient.alive, true, 'physician care lowers a lethal epidemic roll below the death threshold');
}

{
  const state = simulation.newGame(2026071719);
  const patient = state.residents[0];
  patient.sick = true;
  state.incidents.epidemic = {
    infectedIds: [patient.id], untilDay: state.day + 10, mode: 'uncontained',
  };
  state.incidents.scheduledDays = [state.day + 20];
  specialEvents.updateSpecialEvents(state, sequenceRng([1, 0.01, 0]));
  assert.equal(patient.alive, false, 'without a physician the same epidemic roll remains lethal');
}

{
  const state = simulation.newGame(2026071720);
  addActiveClinic(state);
  const patient = state.residents[0];
  patient.sick = true;
  state.incidents.epidemic = { infectedIds: [patient.id], untilDay: state.day, mode: 'pending' };
  state.pendingChoice = {
    kind: 'incident', title: '역병', body: '', options: [], data: { eventId: 'plagueOutbreak' },
  };
  specialEvents.resolveSpecialEvent(state, 'isolate-all', () => 0.5);
  assert.equal(
    state.incidents.epidemic.untilDay,
    state.day + CONFIG.specialEvents.epidemicDays[0] - CONFIG.medicine.isolationDaysReduction,
    'a local physician shortens mass isolation',
  );
}

console.log('physician tests passed');
