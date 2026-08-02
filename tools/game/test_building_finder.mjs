import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileModule(sourcePath, outputPath) {
  const source = readFileSync(sourcePath, 'utf8');
  let output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) =>
    /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, output, 'utf8');
}

const root = new URL('../../', import.meta.url);
const outDir = mkdtempSync(join(tmpdir(), 'northern-building-finder-'));
const gameDir = new URL('src/game/', root);
for (const file of readdirSync(gameDir).filter(file => file.endsWith('.ts'))) {
  compileModule(new URL(file, gameDir), join(outDir, 'game', file.replace(/\.ts$/, '.mjs')));
}
compileModule(new URL('src/ui/buildingFinder.ts', root), join(outDir, 'ui', 'buildingFinder.mjs'));

const finder = await import(pathToFileURL(join(outDir, 'ui', 'buildingFinder.mjs')).href);
const simulation = await import(pathToFileURL(join(outDir, 'game', 'simulation.mjs')).href);
const saveLoad = await import(pathToFileURL(join(outDir, 'game', 'saveLoad.mjs')).href);
const saveStorage = await import(pathToFileURL(join(outDir, 'game', 'saveStorage.mjs')).href);

function building(id, type, x, y, extra = {}) {
  return { id, type, x, y, progress: 1, built: true, fieldGrowth: 0, ...extra };
}

const buildings = [
  building(31, 'lumberCamp', 16, 9),
  building(12, 'lumberCamp', 4, 3, { built: false, progress: 0.4 }),
  building(19, 'lumberCamp', 8, 5, { built: false, repairing: true }),
  building(44, 'stable', 20, 2),
  building(50, 'smithy', 11, 7),
  building(51, 'smithy', 12, 7, {
    workOrder: { kind: 'demolish', phase: 'dismantling', progress: 0.5, required: 2 },
  }),
  building(60, 'gate', 14, 8, {
    gateWallType: 'palisade',
    structureRepair: { progress: 1, required: 3, paidCost: { wood: 1 } },
    breached: true,
  }),
];

const snapshot = JSON.stringify(buildings);
assert.deepEqual(
  finder.filteredBuildingResults(buildings, { query: '  벌목장  ', type: null, status: 'all' }).map(entry => entry.id),
  [12, 19, 31],
  '한국어 이름 검색은 지도 순서(y/x/id)로 같은 종류를 안정 정렬한다',
);
assert.deepEqual(
  finder.filteredBuildingResults(buildings, { query: '', type: 'lumberCamp', status: 'operational' }).map(entry => entry.id),
  [31],
);
assert.deepEqual(
  finder.filteredBuildingResults(buildings, { query: '', type: 'lumberCamp', status: 'construction' }).map(entry => entry.id),
  [12],
);
assert.deepEqual(
  finder.filteredBuildingResults(buildings, { query: '', type: null, status: 'repairing' }).map(entry => entry.id),
  [19, 60],
);
assert.deepEqual(
  finder.filteredBuildingResults(buildings, { query: '축', type: null, status: 'all' }).map(entry => entry.id),
  [44],
);
assert.equal(JSON.stringify(buildings), snapshot, '검색은 저장 건물 배열을 변경하지 않는다');

const lumber = finder.filteredBuildingResults(buildings, { query: '', type: 'lumberCamp', status: 'all' });
assert.equal(finder.nextBuildingResult(lumber, null, 1).id, 12);
assert.equal(finder.nextBuildingResult(lumber, 12, 1).id, 19);
assert.equal(finder.nextBuildingResult(lumber, 31, 1).id, 12, '마지막 다음은 첫 결과로 순환한다');
assert.equal(finder.nextBuildingResult(lumber, 12, -1).id, 31, '첫 결과 이전은 마지막으로 순환한다');
assert.equal(finder.nextBuildingResult([], null, 1), null);

// 구 v55 저장의 완공·건설·수리 중 벌목장도 로드 뒤 같은 필터에서 모두 찾을 수 있다.
{
  const backing = new Map();
  globalThis.localStorage = {
    get length() { return backing.size; },
    getItem: key => backing.get(key) ?? null,
    setItem: (key, value) => backing.set(key, String(value)),
    removeItem: key => backing.delete(key),
    key: index => [...backing.keys()][index] ?? null,
  };
  const legacy = simulation.newGame(2026080212);
  legacy.schemaVersion = 55;
  legacy.rank = 'bu';
  legacy.buildings = buildings.slice(0, 5).map(entry => ({ ...entry }));
  backing.set(saveStorage.saveSlotStorageKey(1), JSON.stringify(legacy));
  const loaded = saveLoad.loadGame(1);
  assert.ok(loaded);
  assert.deepEqual(
    finder.filteredBuildingResults(loaded.buildings, { query: '벌목', type: null, status: 'all' }).map(entry => entry.id),
    [12, 19, 31],
  );
}

const gameSessionSource = readFileSync(new URL('src/GameSession.tsx', root), 'utf8');
const minimapSource = readFileSync(new URL('src/components/Minimap.tsx', root), 'utf8');
assert.match(gameSessionSource, /handleFocusBuilding/);
assert.match(gameSessionSource, /centerViewportOnTile\(/);
assert.match(gameSessionSource, /setSelectedEntity\(\{ kind: 'building'/);
assert.match(minimapSource, /<BuildingFinder/);
assert.match(minimapSource, /onFocusBuilding/);

console.log('building finder tests passed');
