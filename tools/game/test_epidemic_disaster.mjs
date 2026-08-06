import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-epidemic-tests-'));
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
const specialEvents = await import(pathToFileURL(join(compiledDir, 'specialEvents.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const residents = await import(pathToFileURL(join(compiledDir, 'residents.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function sequenceRng(values, fallback = values.at(-1) ?? 0.5) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

function building(id, type) {
  return { id, type, x: id % 10, y: 2, built: true, progress: 20, fieldGrowth: 0 };
}

function prepareResidents(state, count) {
  state.residents = state.residents.slice(0, count);
  for (const [index, resident] of state.residents.entries()) {
    Object.assign(resident, {
      alive: true,
      sick: false,
      health: 100,
      hunger: 100,
      warmth: 100,
      homeBuildingId: null,
      assignedBuildingId: null,
      quarantinedUntil: 0,
      job: 'laborer',
    });
    resident.id = index + 1;
  }
  state.pendingChoice = null;
  state.battle = null;
  state.incidents.scheduledDays = [state.day + 20];
  state.resources.herbs = 0;
  return state.residents;
}

function startEpidemicState(state, patient, mode = 'uncontained') {
  patient.sick = true;
  state.incidents.epidemic = {
    infectedIds: [patient.id],
    untilDay: state.day + 10,
    mode,
    startedDay: state.day,
    quietDays: 0,
    newInfectionsToday: 0,
    totalInfected: 1,
    recoveredCount: 0,
    deathCount: 0,
    peakInfected: 1,
    quarantinedResidentIds: [],
    infectedSince: { [patient.id]: state.day },
  };
}

{
  const state = simulation.newGame(2026072901, 'normal', '발생가중');
  prepareResidents(state, 3);
  state.day = 13;
  const summerWeight = specialEvents.epidemicOccurrenceWeight(state);
  state.day = 37;
  const winterWeight = specialEvents.epidemicOccurrenceWeight(state);
  assert.ok(summerWeight > winterWeight, 'summer must raise epidemic occurrence weight');

  state.day = 13;
  state.buildings = [building(101, 'tileHouse')];
  for (const resident of state.residents) resident.homeBuildingId = 101;
  const housedWeight = specialEvents.epidemicOccurrenceWeight(state);
  state.buildings = [];
  for (const resident of state.residents) resident.homeBuildingId = null;
  const homelessWeight = specialEvents.epidemicOccurrenceWeight(state);
  assert.ok(homelessWeight > housedWeight, 'homeless crowding must raise epidemic occurrence weight');
}

{
  const state = simulation.newGame(2026072902, 'normal', '접촉망');
  const [patient, housemate, coworker, unrelated] = prepareResidents(state, 4);
  state.buildings = [
    building(101, 'hut'),
    building(102, 'hut'),
    building(201, 'smithy'),
    building(202, 'workshop'),
  ];
  patient.homeBuildingId = housemate.homeBuildingId = 101;
  coworker.homeBuildingId = unrelated.homeBuildingId = 102;
  patient.assignedBuildingId = coworker.assignedBuildingId = 201;
  housemate.assignedBuildingId = 202;
  unrelated.assignedBuildingId = 202;
  startEpidemicState(state, patient);

  specialEvents.updateSpecialEvents(state, sequenceRng([0, 0, 0, 0, 1, 0], 1));
  assert.deepEqual(
    new Set(state.incidents.epidemic.infectedIds),
    new Set([patient.id, housemate.id, coworker.id]),
    'daily spread must follow the shared home and shared workplace edges',
  );
  assert.equal(unrelated.sick, false, 'a resident with neither contact edge must remain uninfected');
}

{
  const state = simulation.newGame(2026072903, 'normal', '격리망');
  const [patient, housemate, coworker] = prepareResidents(state, 3);
  state.buildings = [building(101, 'hut'), building(102, 'hut'), building(201, 'smithy')];
  patient.homeBuildingId = housemate.homeBuildingId = 101;
  coworker.homeBuildingId = 102;
  patient.assignedBuildingId = coworker.assignedBuildingId = 201;
  startEpidemicState(state, patient, 'pending');
  state.pendingChoice = {
    kind: 'incident',
    title: '역병',
    body: '',
    options: [],
    data: { eventId: 'plagueOutbreak' },
  };

  specialEvents.resolveSpecialEvent(state, 'isolate-all', () => 0.5);
  assert.ok(patient.quarantinedUntil > state.day);
  assert.ok(housemate.quarantinedUntil > state.day, 'the quarantine order must include cohabitants');
  assert.equal(coworker.quarantinedUntil, 0, 'workplace-only contacts are not pre-emptively quarantined');
  specialEvents.updateSpecialEvents(state, () => 0.99);
  assert.equal(coworker.sick, false, 'isolation must block workplace spread');
}

{
  const bare = simulation.newGame(2026072904, 'normal', '무의료');
  const [barePatient, bareContact] = prepareResidents(bare, 2);
  startEpidemicState(bare, barePatient);
  bare.incidents.epidemic.infectedSince[barePatient.id] = bare.day - 1;

  const cared = simulation.newGame(2026072904, 'normal', '의료');
  const [caredPatient, caredContact, physician] = prepareResidents(cared, 3);
  const clinic = building(301, 'clinic');
  cared.buildings = [clinic];
  Object.assign(physician, { job: 'physician', assignedBuildingId: clinic.id });
  cared.resources.herbs = 20;
  startEpidemicState(cared, caredPatient);
  cared.incidents.epidemic.infectedSince[caredPatient.id] = cared.day - 1;

  specialEvents.updateSpecialEvents(bare, () => 0.16);
  specialEvents.updateSpecialEvents(cared, () => 0.16);
  assert.equal(bareContact.sick, true, 'an untreated household contact must be infected by the test roll');
  assert.equal(caredContact.sick, false, 'herbs, a clinic, and an active physician must suppress the same spread roll');
  assert.equal(barePatient.sick, true);
  assert.equal(caredPatient.sick, false, 'medical capacity must raise epidemic recovery above the same roll');
}

{
  const state = simulation.newGame(2026072905, 'normal', '종식');
  const [patient] = prepareResidents(state, 1);
  startEpidemicState(state, patient, 'isolated');
  const originalRecovery = CONFIG.disasters.epidemic.baseRecoveryChance;
  CONFIG.disasters.epidemic.baseRecoveryChance = 0;
  state.day += 1;
  specialEvents.updateSpecialEvents(state, () => 0.99);
  assert.equal(state.incidents.epidemic.quietDays, 1);
  assert.equal(state.incidents.epidemic.infectedIds.length, 1,
    'two quiet-day counting must not end an epidemic while an active patient remains');

  CONFIG.disasters.epidemic.baseRecoveryChance = 1;
  state.day += 1;
  specialEvents.updateSpecialEvents(state, () => 0);
  CONFIG.disasters.epidemic.baseRecoveryChance = originalRecovery;
  assert.equal(state.incidents.epidemic, null,
    'the epidemic ends after the second zero-infection day once no active patient remains');
}

{
  const state = simulation.newGame(2026072906, 'normal', '회복분리');
  const [patient] = prepareResidents(state, 1);
  state.resources.herbs = 10;
  startEpidemicState(state, patient);
  const herbsBefore = state.resources.herbs;
  const healthBefore = patient.health;
  residents.updateResidentNeeds(state, () => 0, 1, 1, 1, 1, 1);
  assert.equal(patient.sick, true, 'ordinary daily recovery must not clear an epidemic patient');
  assert.equal(state.resources.herbs, herbsBefore,
    'epidemic care must consume herbs in the epidemic tick instead of the ordinary disease path');
  assert.equal(patient.health, healthBefore,
    'ordinary sick damage must not stack with the dedicated epidemic damage');
}

{
  const state = simulation.newGame(2026080602, 'normal', '특수주민 중태');
  const [patient] = prepareResidents(state, 1);
  Object.assign(patient, { special: 'uinyeo', health: 100 });
  state.specialResidentRecords = {
    uinyeo: { status: 'active', residentId: patient.id, joinedDay: state.day },
  };
  startEpidemicState(state, patient);

  specialEvents.updateSpecialEvents(state, () => 0);
  assert.equal(patient.alive, true, 'a named resident survives the first random epidemic death');
  assert.equal(patient.health, CONFIG.specialResidents.fatefulEscapeHealth);
  assert.equal(state.incidents.epidemic.deathCount, 0);
  assert.equal(state.specialResidentRecords.uinyeo.fatefulEscapeUsed, true);

  state.day += 1;
  specialEvents.updateSpecialEvents(state, () => 0);
  assert.equal(patient.alive, false, 'the same named resident has no second epidemic escape');
  assert.equal(state.incidents.epidemic, null, 'the epidemic closes after its last patient dies');
}

{
  const state = simulation.newGame(2026072907, 'normal', '구저장');
  const [patient] = prepareResidents(state, 1);
  patient.sick = true;
  state.incidents.epidemic = {
    infectedIds: [patient.id],
    untilDay: state.day + 7,
    mode: 'uncontained',
  };
  specialEvents.ensureIncidentState(state);
  assert.equal(state.incidents.epidemic.totalInfected, 1);
  assert.equal(state.incidents.epidemic.quietDays, 0);
  assert.deepEqual(state.incidents.epidemic.infectedSince, { [patient.id]: state.day });
}

console.log('epidemic disaster checks passed');
