import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-fishing-grounds-'));
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
const groundsApi = await load('fishingGrounds');
const buildings = await load('buildings');
const saveLoad = await load('saveLoad');
const simulation = await load('simulation');

function plainMap(width, height) {
  return Array.from({ length: height }, (_row, y) => Array.from({ length: width }, (_cell, x) => ({
    x, y, terrain: 'plain', hasIron: false, buildingId: null,
  })));
}

// 호수 권역은 같은 수역으로 절삭되고, 연안 반경 1보다 중·심수 권역이 크게 생성된다.
{
  const map = plainMap(15, 15);
  for (let y = 1; y <= 13; y++) for (let x = 1; x <= 13; x++) map[y][x].terrain = 'lake';
  map[7][7].terrain = 'plain';
  const first = groundsApi.spawnFishingGrounds(structuredClone(map));
  const second = groundsApi.spawnFishingGrounds(structuredClone(map));
  assert.deepEqual(first, second, '같은 수역은 결정적으로 같은 어장을 만든다');
  assert.ok(first.some(ground => ground.depthBand === 'shore'));
  assert.ok(first.some(ground => ground.depthBand === 'mid'));
  assert.ok(first.some(ground => ground.depthBand === 'deep'));
  for (const ground of first) {
    assert.ok(ground.tiles.length > 0);
    assert.equal(ground.radius, ground.depthBand === 'shore' ? 1 : ground.depthBand === 'mid' ? 3 : 5);
    for (const tile of ground.tiles) {
      assert.equal(map[tile.y][tile.x].terrain, ground.kind, '어장은 같은 종류 수역만 포함한다');
      assert.ok((tile.x - ground.x) ** 2 + (tile.y - ground.y) ** 2 <= ground.radius ** 2,
        '실제 어장 타일은 명목 반경 안이다');
    }
  }
  assert.equal(first.some(ground => ground.tiles.some(tile => tile.x === 7 && tile.y === 7)), false,
    '호수 안 육지 섬은 어장에 들어가지 않는다');
  const largestShore = Math.max(...first.filter(ground => ground.depthBand === 'shore').map(ground => ground.tiles.length));
  const largestDeep = Math.max(...first.filter(ground => ground.depthBand === 'deep').map(ground => ground.tiles.length));
  assert.ok(largestDeep > largestShore, '심수 어장은 반경 1 연안 어장보다 넓다');
}

// 수역 종류가 닿아 있어도 권역과 비축은 섞이지 않는다.
{
  const map = plainMap(9, 5);
  for (let y = 1; y <= 3; y++) {
    for (let x = 1; x <= 3; x++) map[y][x].terrain = 'lake';
    for (let x = 4; x <= 7; x++) map[y][x].terrain = 'sea';
  }
  const grounds = groundsApi.spawnFishingGrounds(map);
  assert.ok(grounds.some(ground => ground.kind === 'lake'));
  assert.ok(grounds.some(ground => ground.kind === 'sea'));
  assert.ok(grounds.every(ground => ground.tiles.every(tile => map[tile.y][tile.x].terrain === ground.kind)));
}

// 구 갯벌 타일 비축률은 반경 1 공유 어장으로 한 번만 환산된다.
{
  const map = plainMap(5, 5);
  for (let y = 1; y <= 3; y++) for (let x = 1; x <= 3; x++) {
    Object.assign(map[y][x], { terrain: 'mudflat', tidalCapacity: 3, tidalStock: 1.5 });
  }
  const state = { map, fishingGrounds: [] };
  groundsApi.ensureFishingGrounds(state);
  const mudflat = state.fishingGrounds.filter(ground => ground.kind === 'mudflat');
  assert.ok(mudflat.length > 1, '갯벌은 하나의 거대 권역이 아니라 반경 1 어장들로 나뉜다');
  assert.ok(mudflat.every(ground => ground.depthBand === 'shore' && ground.radius === 1));
  assert.ok(mudflat.every(ground => Math.abs(ground.stock / ground.capacity - 0.5) < 1e-9),
    '구 저장의 50% 비축률을 새 어장마다 보존한다');
  assert.ok(map.flat().every(tile => tile.tidalStock == null && tile.tidalCapacity == null),
    '마이그레이션 뒤 타일 비축은 제거되어 이중 원본이 되지 않는다');
  const target = mudflat[0];
  const point = target.tiles[0];
  const before = target.stock;
  assert.equal(groundsApi.takeFishingGroundStock(state.fishingGrounds, point.x, point.y, 1), 1);
  assert.equal(target.stock, before - 1, '같은 어장 객체의 공유 비축을 소비한다');
  groundsApi.advanceFishingGrounds(state.fishingGrounds);
  assert.ok(target.stock > before - 1 && target.stock <= target.capacity, '소모된 공유 비축은 일일 회복한다');
}

// 배 조업용 API가 명시적으로 수심대를 주지 않으면 연안만 소비한다.
{
  const map = plainMap(11, 11);
  for (let y = 1; y <= 9; y++) for (let x = 1; x <= 9; x++) map[y][x].terrain = 'lake';
  const grounds = groundsApi.spawnFishingGrounds(map);
  const deep = grounds.find(ground => ground.depthBand === 'deep');
  assert.ok(deep);
  const point = deep.tiles[0];
  assert.equal(groundsApi.takeFishingGroundStock(grounds, point.x, point.y, 1), 0,
    '도보 기본 조업은 심수 비축을 소비하지 않는다');
  assert.equal(groundsApi.takeFishingGroundStock(grounds, point.x, point.y, 1, 'deep'), 1,
    '심수는 명시적인 선박 조업 경로에서만 소비된다');
}

assert.equal(buildings.BUILDING_DEFS.ferry.id, 'ferry', '구 저장 호환 내부 ID는 ferry다');
assert.equal(buildings.BUILDING_DEFS.ferry.name, '낚시터', '사용자 노출 명칭은 낚시터다');
assert.equal(saveLoad.migrateV57ToV58({ schemaVersion: 57 }).schemaVersion, 58);
assert.deepEqual(saveLoad.migrateV57ToV58({ schemaVersion: 57 }).fishingGrounds, []);

const coast = simulation.newGameFromOptions({ region: 'coast', seed: 20260891 });
assert.ok(coast.fishingGrounds.some(ground => ground.kind === 'mudflat'));
assert.ok(coast.fishingGrounds.some(ground => ground.kind === 'sea' && ground.depthBand !== 'shore'));

// 기본 자원 밀도는 모든 후보를 표시하던 초기 구현의 약 1/3만 남긴다.
{
  const map = plainMap(40, 40);
  for (let y = 1; y < 40; y++) for (let x = 0; x < 40; x++) map[y][x].terrain = 'sea';
  const all = groundsApi.spawnFishingGrounds(structuredClone(map), 3);
  const normal = groundsApi.spawnFishingGrounds(structuredClone(map), 1);
  assert.ok(normal.length / all.length >= 0.2 && normal.length / all.length <= 0.45,
    `기본 어장 수 ${normal.length}/${all.length}는 전체 후보의 약 1/3이다`);
  const omittedShore = all.find(candidate => candidate.depthBand === 'shore'
    && !normal.some(ground => ground.tiles.some(tile => tile.x === candidate.x && tile.y === candidate.y)));
  assert.ok(omittedShore, '기본 밀도 표본에서 빠진 연안 어장이 있다');
  const loaded = {
    map: structuredClone(map),
    fishingGrounds: structuredClone(normal),
    buildings: [{ type: 'ferry', x: omittedShore.x, y: omittedShore.y, built: true }],
    worldSetup: { effective: { resourceDensityMultiplier: 1 } },
  };
  groundsApi.ensureFishingGrounds(loaded);
  assert.ok(groundsApi.fishingGroundAt(loaded.fishingGrounds, omittedShore.x, omittedShore.y, 'shore'),
    '구 저장에서 이미 지어진 낚시터를 받치는 어장은 밀도 표본에서 빠져도 보존한다');
  const marker = normal[0];
  assert.equal(groundsApi.findFishingGroundIconAtTile(normal, marker.x, marker.y)?.id, marker.id,
    '어장 중심 타일에서 지도 표식을 찾는다');
  assert.equal(groundsApi.findFishingGroundIconAtTile(normal, marker.x + 1, marker.y)?.id === marker.id, false,
    '어장 표식은 중심 타일 하나에만 뜬다');
}

// 지도 표식은 일반 수역과 갯벌을 서로 다른 생성 아이콘으로 표시한다.
{
  const manifest = JSON.parse(readFileSync(
    new URL('../../src/render/fishingGroundIconManifest.json', import.meta.url),
    'utf8',
  ));
  const iconPng = readFileSync(new URL('../../public/assets/fishing-ground-icons-v1.png', import.meta.url));
  assert.equal(iconPng.toString('ascii', 1, 4), 'PNG');
  assert.equal(iconPng.readUInt32BE(16), manifest.frame_layout.sheetWidth);
  assert.equal(iconPng.readUInt32BE(20), manifest.frame_layout.sheetHeight);
  assert.equal(manifest.engine, 'component-row');
  assert.equal(manifest.degraded_static_fallback, false);
  assert.deepEqual(Object.keys(manifest.frame_layout.rows), ['water', 'mudflat']);
  assert.notDeepEqual(manifest.frame_layout.rows.water[0], manifest.frame_layout.rows.mudflat[0]);

  const assetSource = readFileSync(
    new URL('../../src/render/fishingGroundIconAssets.ts', import.meta.url), 'utf8',
  );
  const atlasSource = readFileSync(new URL('../../src/render/atlas.ts', import.meta.url), 'utf8');
  const rendererSource = readFileSync(new URL('../../src/render/renderer.ts', import.meta.url), 'utf8');
  assert.match(assetSource, /kind === 'mudflat' \? 'mudflat' : 'water'/,
    '강·호수·바다는 물고기, 갯벌은 별도 게 아이콘을 선택한다');
  assert.match(atlasSource, /drawFishingGroundIconAtlas/);
  assert.match(rendererSource, /drawFishingGroundIconAtlas\(/);
  assert.match(rendererSource, /ground\.depthBand === 'shore' \? 1[^\n]+\? 2 : 3/,
    '생성 아이콘으로 바꿔도 수심 물결 1·2·3개 구분을 유지한다');
  assert.match(rendererSource, /stockRatio <= 0\.08[^\n]+grayscale/,
    '고갈된 생성 아이콘은 회색으로 표시한다');
}

console.log('fishing grounds F0/F1 tests passed');
