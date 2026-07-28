import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-immigration-tests-'));
  for (const file of readdirSync(srcDir).filter(name => name.endsWith('.ts'))) {
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
const immigration = await import(pathToFileURL(join(compiledDir, 'immigration.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function sequenceRng(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function eventState(seed = 2026071101) {
  const state = simulation.newGame(seed, 'normal');
  state.day = 2;
  state.lastImmigrationDay = -999;
  state.resources.grain = 0;
  state.resources.meat = 0;
  state.resources.fish = 0;
  state.resources.vegetables = 0;
  return state;
}

{
  const state = eventState();
  const populationBefore = state.residents.filter(resident => resident.alive).length;
  assert.equal(immigration.maybeOfferImmigration(state, sequenceRng([0, 0, 0])), true);
  assert.equal(state.pendingChoice.kind, 'immigration');
  assert.equal(state.pendingChoice.illustration.src, '/assets/events/immigration-arrival-v2.png');
  assert.ok(state.pendingChoice.illustration.alt.includes('유민'));
  assert.ok(state.pendingChoice.body.includes(`현재 주거: ${populationBefore}명 / ${populationBefore}명 수용`));
  assert.ok(state.pendingChoice.body.includes(`노숙 ${CONFIG.immigration.groupMin}명 예상`));
  assert.ok(state.pendingChoice.body.includes('현재 인구 기준 약 0.0일분'));
  assert.equal(state.pendingChoice.options[0].id, 'accept');
  assert.equal(state.pendingChoice.options[1].id, 'reject');

  simulation.resolveChoice(state, 'accept');
  const populationAfter = state.residents.filter(resident => resident.alive).length;
  assert.equal(populationAfter, populationBefore + CONFIG.immigration.groupMin);
  assert.equal(state.residents.filter(resident => resident.alive && resident.homeBuildingId == null).length,
    CONFIG.immigration.groupMin);
  assert.equal(state.pendingChoice, null);
}

{
  const state = eventState(2026071102);
  const populationBefore = state.residents.filter(resident => resident.alive).length;
  const reputationBefore = state.resources.reputation;
  assert.equal(immigration.maybeOfferImmigration(state, sequenceRng([0, 0.99, 0.3])), true);
  simulation.resolveChoice(state, 'reject');
  assert.equal(state.residents.filter(resident => resident.alive).length, populationBefore);
  assert.equal(state.resources.reputation, reputationBefore - CONFIG.immigration.rejectReputation);
  assert.equal(state.pendingChoice, null);
}

{
  const state = eventState(2026071103);
  state.lastImmigrationDay = state.day;
  assert.equal(immigration.maybeOfferImmigration(state, () => 0), false);
  assert.equal(state.pendingChoice, null);
}

{
  const state = eventState(2026071104);
  for (const resident of state.residents) resident.alive = false;
  let rngCalls = 0;
  assert.equal(immigration.maybeOfferImmigration(state, () => {
    rngCalls += 1;
    return 0;
  }), false);
  assert.equal(rngCalls, 1, '주민이 없으면 기존처럼 확률 확인 뒤 가족 구성 RNG를 소비하지 않는다');
  assert.equal(state.pendingChoice, null);
}

{
  const titles = new Set();
  for (let index = 0; index < immigration.IMMIGRATION_STORIES.length; index++) {
    const state = eventState(2026071110 + index);
    const storyRoll = (index + 0.1) / immigration.IMMIGRATION_STORIES.length;
    assert.equal(immigration.maybeOfferImmigration(state, sequenceRng([0, 0, storyRoll])), true);
    titles.add(state.pendingChoice.title);
  }
  assert.equal(titles.size, immigration.IMMIGRATION_STORIES.length);
}

console.log('immigration event tests passed');
