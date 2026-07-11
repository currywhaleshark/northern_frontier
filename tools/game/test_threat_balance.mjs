import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-threat-tests-'));
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
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function sequenceRng(values) {
  let index = 0;
  return () => values[Math.min(index++, values.length - 1)];
}

function setWatchmen(state, count) {
  for (const resident of state.residents) resident.job = 'idle';
  for (let i = 0; i < count && i < state.residents.length; i++) {
    state.residents[i].job = 'watchman';
  }
}

function makeHighDefenseBuState() {
  const state = simulation.newGame(2026070901);
  state.rank = 'bu';
  state.threat = 25;
  state.raidCooldown = 0;
  state.tradeRefusedDays = 0;
  state.resources.defense = 400;
  state.resources.food = 190;
  state.resources.hide = 20;
  state.resources.reputation = 50;
  setWatchmen(state, 4);
  return state;
}

{
  const state = makeHighDefenseBuState();
  for (let i = 0; i < CONFIG.time.yearDays * 2; i++) {
    raids.updateThreat(state);
    state.day++;
  }

  assert.ok(
    state.threat >= CONFIG.threat.raidThreshold,
    `high-defense bu settlements should still re-enter raid danger over time (${state.threat})`,
  );
}

{
  const state = simulation.newGame(2026070902);
  state.day = 20;
  state.threat = 75;
  state.raidCooldown = 0;
  state.pendingChoice = null;
  state.raiders = null;

  raids.checkRaidTrigger(state, sequenceRng([
    0.09,
    0.4, 0.4, 0.4, 0.4, 0.4,
    0.4, 0.4, 0.4, 0.4, 0.4,
  ]));

  assert.ok(
    state.raiders || state.pendingChoice?.kind === 'raid' || state.pendingChoice?.kind === 'extortion',
    'threat 75 should have a meaningful daily raid trigger chance',
  );
}

console.log('threat balance tests passed');
