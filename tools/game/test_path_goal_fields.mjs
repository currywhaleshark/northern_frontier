import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const source = readFileSync(new URL('../../src/game/pathGoals.ts', import.meta.url), 'utf8');
const outDir = mkdtempSync(join(tmpdir(), 'northern-path-goals-'));
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const outputPath = join(outDir, 'pathGoals.mjs');
writeFileSync(outputPath, output, 'utf8');
const { buildGoalField, goalFromField } = await import(pathToFileURL(outputPath).href);

const map = Array.from({ length: 5 }, (_, y) =>
  Array.from({ length: 6 }, (_, x) => ({ x, y, terrain: 'plain', hasIron: false, buildingId: null })));
map[1][1].terrain = 'forest';
map[3][4].terrain = 'forest';

const first = buildGoalField(map, tile => tile.terrain === 'forest');
const second = buildGoalField(map, tile => tile.terrain === 'forest');
assert.deepEqual(first.goals, [{ x: 1, y: 1 }, { x: 4, y: 3 }], 'goals keep deterministic map order');
assert.deepEqual([...first.heuristic], [...second.heuristic], 'multi-source field is deterministic');
assert.equal(first.heuristic[1 * first.width + 1], 0);
assert.equal(first.heuristic[0], 14, 'diagonal octile cost is 14');
assert.equal(first.heuristic[4 * first.width + 5], 14, 'nearest of multiple goals supplies the heuristic');
assert.equal(first.heuristic[2 * first.width + 2], 14);

const goal = goalFromField(first);
assert.equal(goal(map[1][1]), true);
assert.equal(goal(map[0][0]), false);
assert.equal(goal.goalPoints, first.goals);
assert.equal(goal.goalHeuristic, first.heuristic);

console.log('path goal field tests passed');
