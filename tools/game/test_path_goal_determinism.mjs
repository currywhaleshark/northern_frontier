import assert from 'node:assert/strict';
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-path-determinism-'));
  for (const file of readdirSync(srcDir).filter(candidate => candidate.endsWith('.ts'))) {
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

const outDir = compileGameModules();
const simulation = await import(pathToFileURL(join(outDir, 'simulation.mjs')).href);

function snapshotAfterThirtyDays() {
  const state = simulation.newGame(2026071801);
  const jobs = ['woodcutter', 'herbalist', 'hunter', 'miner'];
  for (const [index, resident] of state.residents.entries()) resident.job = jobs[index % jobs.length];
  for (let day = 0; day < 30; day++) simulation.advanceDay(state);
  return {
    day: state.day,
    subTick: state.subTick,
    resources: state.resources,
    residents: state.residents.map(resident => ({
      id: resident.id,
      alive: resident.alive,
      job: resident.job,
      x: resident.x,
      y: resident.y,
      phase: resident.phase,
      task: resident.task,
      carrying: resident.carrying,
      workTimer: resident.workTimer,
      path: resident.path,
    })),
    terrain: state.map.map(row => row.map(tile => [tile.terrain, tile.hasIron, tile.mineralRemaining])),
  };
}

assert.deepEqual(
  snapshotAfterThirtyDays(),
  snapshotAfterThirtyDays(),
  'the same version produces an identical 30-day snapshot for the same seed and job mix',
);

console.log('path goal determinism tests passed');
