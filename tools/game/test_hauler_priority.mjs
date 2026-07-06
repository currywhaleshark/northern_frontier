import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
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
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function setupSingleHauler(seed = 9001) {
  const state = simulation.newGame(seed);
  const center = state.buildings.find(b => b.type === 'center');
  assert.ok(center, 'center exists');

  const hauler = state.residents.find(r => r.job === 'hauler') ?? state.residents[0];
  for (const resident of state.residents) resident.alive = resident.id === hauler.id;
  hauler.alive = true;
  hauler.sick = false;
  hauler.health = 100;
  hauler.morale = 50;
  hauler.job = 'hauler';
  hauler.x = center.x;
  hauler.y = center.y;
  hauler.px = center.x;
  hauler.py = center.y;
  hauler.phase = 'rest';
  hauler.path = [];
  hauler.workTimer = 0;
  hauler.targetId = null;
  hauler.carrying = {};

  const rock = state.map[center.y]?.[Math.min(center.x + 1, CONFIG.map.width - 1)];
  assert.ok(rock, 'nearby rock tile exists');
  rock.terrain = 'rock';
  rock.hasIron = false;

  state.weather = 'clear';
  state.resources.food = 0;
  state.resources.game = 1;
  state.resources.grain = 0;
  state.resources.wood = CONFIG.production.woodReserve;
  state.resources.firewood = 0;
  state.resources.stone = 0;
  state.resources.tools = 10;
  return { state, hauler };
}

{
  const { state, hauler } = setupSingleHauler();
  simulation.advanceTick(state);

  assert.equal(hauler.task, '사냥감 손질');
  assert.ok(state.resources.game < 1, 'game was processed before urgent stone quarrying');
  assert.ok(state.resources.food > 0, 'processed game became food');
  assert.equal(Object.keys(hauler.carrying).length, 0);
}

{
  const { state, hauler } = setupSingleHauler();
  hauler.phase = 'toWork';
  hauler.path = [{ x: Math.min(hauler.x + 1, CONFIG.map.width - 1), y: hauler.y }];

  simulation.advanceTick(state);

  assert.equal(hauler.task, '사냥감 손질');
  assert.equal(hauler.phase, 'rest');
  assert.deepEqual(hauler.path, []);
  assert.ok(state.resources.food > 0, 'empty-handed quarry travel was interrupted for food processing');
}

console.log('hauler priority tests passed');