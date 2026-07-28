import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-tool-wear-'));
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
const { CONFIG } = await load('config');

function prepareWorkers() {
  const state = simulation.newGame(2026072801);
  for (const resident of state.residents) resident.alive = false;
  const jobs = [
    ['woodcutter', null],
    ['hunter', null],
    ['hauler', null],
    ['woodcutter', 'youth'],
    ['farmer', null],
    ['builder', null],
  ];
  jobs.forEach(([job, stage], index) => {
    Object.assign(state.residents[index], {
      alive: true,
      sick: false,
      quarantinedUntil: 0,
      job,
      stage,
    });
  });
  return state;
}

const state = prepareWorkers();
state.day = CONFIG.time.seasonDays * 3 + 1;
assert.equal(simulation.getSeason(state.day), 'winter');
assert.ok(Math.abs(simulation.dailyToolWear(state) - 0.021) < 1e-9,
  'winter farmers, idle builders, and haulers do not wear communal tools');

state.day = 1;
state.buildings.push({
  id: state.nextBuildingId++,
  type: 'hut',
  x: 0,
  y: 0,
  progress: 0,
  built: false,
  fieldGrowth: 0,
  inventory: {},
});
assert.ok(Math.abs(simulation.dailyToolWear(state) - 0.041) < 1e-9,
  'active farmers and builders add full heavy-work wear outside winter');

assert.equal(CONFIG.production.toolWearPerWorker, 0.01);
assert.ok(40 * CONFIG.production.toolWearPerWorker <= CONFIG.production.toolsPerDay * 0.4,
  'even forty simultaneous heavy workers leave most of one smith output available for stockpiling or weapons');

console.log('tool wear balance tests passed');
