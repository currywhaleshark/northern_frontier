import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-diplomatic-action-e4-tests-'));
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
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const proximity = await import(pathToFileURL(join(compiledDir, 'proximityWarnings.mjs')).href);
const diplomacy = await import(pathToFileURL(join(compiledDir, 'diplomacy.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function factionZone(state) {
  const zone = state.claimZones.find(candidate => {
    const site = state.foreignSites.find(foreign => foreign.id === candidate.siteId);
    return site?.factionName && site.type !== 'banditLair';
  });
  assert.ok(zone, '여진 생활권이 하나 있어야 한다');
  const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
  assert.ok(site?.factionName);
  site.discovered = true;
  zone.discovered = true;
  return { zone, site };
}

function bufferTile(state, zone) {
  const outer = zone.radius + CONFIG.foreignSites.proximityClaimBufferTiles;
  const tile = state.map.flat().find(candidate => {
    const dx = candidate.x - zone.x;
    const dy = candidate.y - zone.y;
    const d2 = dx * dx + dy * dy;
    return d2 > zone.radius * zone.radius && d2 <= outer * outer &&
      !state.claimZones.some(other => {
        const ox = candidate.x - other.x;
        const oy = candidate.y - other.y;
        return ox * ox + oy * oy <= other.radius * other.radius;
      });
  });
  assert.ok(tile, '생활권 밖 완충 타일을 찾아야 한다');
  return tile;
}

function siteEdgeTile(state, site) {
  const tile = state.map.flat().find(candidate => {
    const dx = candidate.x < site.x ? site.x - candidate.x : candidate.x >= site.x + site.width
      ? candidate.x - (site.x + site.width - 1) : 0;
    const dy = candidate.y < site.y ? site.y - candidate.y : candidate.y >= site.y + site.height
      ? candidate.y - (site.y + site.height - 1) : 0;
    return Math.max(dx, dy) === CONFIG.foreignSites.proximitySiteRadius;
  });
  assert.ok(tile, '거점 외곽 감시 타일을 찾아야 한다');
  return tile;
}

{
  const state = simulation.newGame(73051);
  const { zone, site } = factionZone(state);
  const tile = bufferTile(state, zone);
  const building = {
    id: state.nextBuildingId++, type: 'hut', x: tile.x, y: tile.y,
    progress: 1, built: true, fieldGrowth: 0,
  };
  const relationBefore = state.relations[site.factionName];
  state.buildings.push(building);
  proximity.noteProximityBuildingCompletion(state, building);
  assert.ok(state.proximityWarnings.includes(`E4:claimBuffer:${site.factionName}`), '완충 건물은 즉시 한 번 경고한다');
  assert.equal(state.log.at(-1)?.notice, true, '근접 경고는 중앙 플로트 대상 중요 로그다');
  proximity.noteProximityBuildingCompletion(state, building);
  assert.equal(state.proximityWarnings.filter(key => key === `E4:claimBuffer:${site.factionName}`).length, 1, '세력×사유 경고는 중복하지 않는다');
  for (let day = 2; day <= 12; day += 1) {
    state.day = day;
    proximity.dailyProximityWarningTick(state);
  }
  assert.ok(state.relations[site.factionName] < relationBefore, '경고 뒤에도 완충 건물이 남으면 약한 압박이 누적된다');
}

{
  const state = simulation.newGame(73052);
  const { zone, site } = factionZone(state);
  const tile = bufferTile(state, zone);
  const resident = state.residents.find(candidate => candidate.alive);
  resident.x = resident.px = tile.x;
  resident.y = resident.py = tile.y;
  resident.phase = 'working';
  for (let day = 1; day <= CONFIG.foreignSites.proximityWorkDays; day += 1) {
    state.day = day;
    proximity.dailyProximityWarningTick(state);
  }
  assert.ok(state.proximityWarnings.includes(`E4:claimBuffer:${site.factionName}`), '같은 완충 칸의 반복 작업도 경고한다');
}

{
  const state = simulation.newGame(73053);
  const { site } = factionZone(state);
  const tile = siteEdgeTile(state, site);
  for (const resident of state.residents) resident.alive = false;
  const resident = state.residents[0];
  resident.alive = true;
  resident.x = resident.px = tile.x;
  resident.y = resident.py = tile.y;
  const relationBefore = state.relations[site.factionName];
  const threatBefore = state.threat;
  for (let day = 1; day <= CONFIG.foreignSites.proximityLoiterDays + 12; day += 1) {
    state.day = day;
    proximity.dailyProximityWarningTick(state);
  }
  assert.ok(state.proximityWarnings.includes(`E4:siteLoiter:${site.factionName}`), '발견한 거점 주변 배회는 별도 사유로 한 번 경고한다');
  assert.ok(state.relations[site.factionName] < relationBefore, '배회를 멈추지 않으면 관계가 떨어진다');
  assert.ok(state.threat > threatBefore, '배회를 멈추지 않으면 위협도도 조금 오른다');
}

{
  const state = simulation.newGame(73054);
  state.foreignSites = [{
    id: 999, type: 'ruin', name: '이름 없는 폐영', x: 8, y: 8, width: 1, height: 1,
    discovered: true, status: 'stable', population: 0, militaryPower: 0, foodStock: 0,
    tradeStock: {}, influenceRadius: 0, goodwill: 0, trust: 0, alarm: 0, favors: 0, memories: [], lastInteractionDay: -999,
  }];
  state.claimZones = [];
  state.day = 1;
  proximity.dailyProximityWarningTick(state);
  assert.deepEqual(state.proximityWarnings, [], '세력명이 없는 외국 장소에는 근접 외교 경고가 생기지 않는다');
}

{
  const state = simulation.newGame(73055);
  state.proximityWarningProgress = { valid: 2, invalid: Number.NaN, ['x'.repeat(121)]: 3 };
  diplomacy.normalizeDiplomacyState(state);
  assert.deepEqual(state.proximityWarningProgress, { valid: 2 }, '저장 정규화는 안전한 근접 경고 진행값만 보존한다');
  const migrated = saveLoad.migrateV49ToV50({ schemaVersion: 49, proximityWarnings: ['E4:claimBuffer:오도리 씨족'] });
  assert.equal(migrated.schemaVersion, 50);
  assert.deepEqual(migrated.proximityWarningProgress, {}, 'v49 저장은 빈 E4 누적 진행값으로 이행한다');
}

const sessionSource = readFileSync(new URL('../../src/GameSession.tsx', import.meta.url), 'utf8');
assert.match(sessionSource, /e\.notice[\s\S]*actionNoticeStore\.push/, 'notice 로그는 중앙 액션 플로트로 전달해야 한다');

console.log('diplomatic action E4 tests passed');
