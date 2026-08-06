import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-diplomatic-action-e5-tests-'));
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
const diplomacy = await import(pathToFileURL(join(compiledDir, 'diplomacy.mjs')).href);
const claimZones = await import(pathToFileURL(join(compiledDir, 'claimZones.mjs')).href);
const territory = await import(pathToFileURL(join(compiledDir, 'territory.mjs')).href);
const passage = await import(pathToFileURL(join(compiledDir, 'passage.mjs')).href);
const proximity = await import(pathToFileURL(join(compiledDir, 'proximityWarnings.mjs')).href);
const saveLoad = await import(pathToFileURL(join(compiledDir, 'saveLoad.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function factionZone(state) {
  const zone = state.claimZones
    .filter(candidate => {
      const site = state.foreignSites.find(foreign => foreign.id === candidate.siteId);
      return candidate.kind !== 'passage' && site?.factionName && state.factionLeaders[site.factionName];
    })
    .sort((left, right) => right.radius - left.radius || left.id - right.id)[0];
  assert.ok(zone, '지도자 있는 여진 생활권이 하나 있어야 한다');
  const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
  assert.ok(site?.factionName);
  zone.discovered = true;
  site.discovered = true;
  return { zone, site, faction: site.factionName };
}

function bufferTile(state, zone) {
  const outer = zone.radius + CONFIG.foreignSites.proximityClaimBufferTiles;
  const tile = state.map.flat().find(candidate => {
    const dx = candidate.x - zone.x;
    const dy = candidate.y - zone.y;
    const distanceSquared = dx * dx + dy * dy;
    return distanceSquared > zone.radius * zone.radius && distanceSquared <= outer * outer &&
      !state.claimZones.some(other => {
        const ox = candidate.x - other.x;
        const oy = candidate.y - other.y;
        return ox * ox + oy * oy <= other.radius * other.radius;
      }) && !state.claimZones.some(other => {
        if (other.id === zone.id) return false;
        const otherOuter = other.radius + CONFIG.foreignSites.proximityClaimBufferTiles;
        const ox = candidate.x - other.x;
        const oy = candidate.y - other.y;
        return ox * ox + oy * oy <= otherOuter * otherOuter;
      });
  });
  assert.ok(tile, '생활권 완충 타일이 하나 있어야 한다');
  return tile;
}

{
  const state = simulation.newGame(73060);
  const { zone, faction } = factionZone(state);
  const first = diplomacy.claimAccordPreview(state, faction, zone.id, 'silver', 1).requiredValue;
  const again = diplomacy.claimAccordPreview(state, faction, zone.id, 'silver', 1).requiredValue;
  assert.equal(first, again, '같은 생활권 가격은 호출 시점에 흔들리지 않는다');
  state.relations[faction] = 100;
  const friendly = diplomacy.claimAccordPreview(state, faction, zone.id, 'silver', 1).requiredValue;
  assert.ok(friendly < first, '관계가 높으면 협정 가격이 낮아진다');
  zone.radius += 3;
  const larger = diplomacy.claimAccordPreview(state, faction, zone.id, 'silver', 1).requiredValue;
  assert.ok(larger > friendly, '반경이 큰 생활권은 더 비싸다');
}

{
  const state = simulation.newGame(73061);
  const { zone, faction } = factionZone(state);
  state.resources.silver = 99;
  const preview = diplomacy.claimAccordPreview(state, faction, zone.id, 'silver', 99);
  assert.ok(preview.meetsValue, '은은 모든 생활권 협정의 유효한 대가다');
  assert.equal(diplomacy.openClaimAccordEnvoy(state, faction, zone.id), null);
  assert.equal(state.pendingChoice?.kind, 'claimAccordEnvoy');
  assert.equal(diplomacy.sendClaimAccordEnvoy(state, faction, zone.id, 'silver', 99), null);
  assert.equal(state.pendingEnvoys[0].kind, 'claimAccord');
  assert.equal(state.pendingEnvoys[0].claimZoneId, zone.id, '사절은 실제 대상 생활권을 저장한다');
  state.day = 7;
  diplomacy.dailyDiplomacyTick(state);
  assert.equal(diplomacy.claimAccordRemainingDays(state, zone.id), CONFIG.time.yearDays);
  assert.equal(claimZones.isClaimPermissionActive(state, zone), true, '연간 협정은 기존 권리 판정에 바로 반영된다');
  assert.equal(diplomacy.canOpenClaimAccordEnvoy(state, faction, zone.id), '이미 이 생활권 협정이 유효합니다');

  state.day += CONFIG.time.yearDays;
  diplomacy.dailyDiplomacyTick(state);
  assert.equal(state.pendingChoice?.kind, 'claimAccordRenewal', '만료일에는 갱신 제안을 연다');
  simulation.resolveChoice(state, 'decline');
  assert.equal(diplomacy.activeClaimAccord(state, zone.id), null, '갱신을 거절하면 만료 기록을 정리한다');
}

{
  const state = simulation.newGame(73062);
  const { zone, site, faction } = factionZone(state);
  const passageZone = state.claimZones.find(candidate => candidate.siteId === site.id && candidate.kind === 'passage');
  if (passageZone) {
    passageZone.discovered = true;
    state.claimAccords = [{ zoneId: passageZone.id, untilDay: state.day + 12 }];
    assert.equal(passage.hasActivePassageForFaction(state, faction), true, '통행 생활권 협정은 산길 교역 보너스에도 반영된다');
  }
  state.claimAccords = [{ zoneId: zone.id, untilDay: state.day + 12 }];
  assert.equal(territory.canWorkForeignTerritory(state, zone.x, zone.y), true, '협정 중인 생활권에서는 작업이 막히지 않는다');
}

{
  const state = simulation.newGame(730621);
  const { zone, site, faction } = factionZone(state);
  state.claimAccords = [{ zoneId: zone.id, untilDay: state.day + CONFIG.time.yearDays }];
  const buffer = bufferTile(state, zone);
  const relationBefore = state.relations[faction];
  const alarmBefore = site.alarm;
  const building = { id: state.nextBuildingId++, type: 'hut', x: zone.x, y: zone.y, progress: 1, built: true, fieldGrowth: 0 };
  state.buildings.push(building);
  state.day = CONFIG.foreignSites.claimDailyInterval - (zone.id % CONFIG.foreignSites.claimDailyInterval);
  claimZones.dailyClaimTensionTick(state);
  proximity.noteProximityBuildingCompletion(state, { id: state.nextBuildingId++, type: 'well', x: buffer.x, y: buffer.y, progress: 1, built: true, fieldGrowth: 0 });
  assert.equal(state.relations[faction], relationBefore, '협정 중 점유는 일일 생활권 긴장을 만들지 않는다');
  assert.equal(site.alarm, alarmBefore, '협정 중 점유는 경계심을 올리지 않는다');
  assert.equal(state.proximityWarnings.includes(`E4:claimBuffer:${faction}`), false, '협정 중 완충 건물은 E4 경고를 만들지 않는다');
}

{
  const state = simulation.newGame(73063);
  const { zone, site, faction } = factionZone(state);
  const relationBefore = state.relations[faction];
  for (const resource of Object.keys(state.resources)) state.resources[resource] = 0;
  territory.noteTerritoryViolation(state, [site.id], zone.x, zone.y, 'work');
  const violation = state.territoryViolations.find(candidate => candidate.siteId === site.id);
  assert.deepEqual(violation?.zoneIds, [zone.id], '항의는 실제 침범 생활권을 보존한다');
  violation.warningDay = state.day;
  territory.updateTerritoryWarnings(state);
  assert.equal(state.pendingChoice?.kind, 'territory');
  simulation.resolveChoice(state, 'accord');
  assert.equal(state.pendingChoice?.kind, 'claimAccordOffer');
  simulation.resolveChoice(state, 'propose');
  assert.equal(state.pendingChoice, null, '대가가 없어 제안에 실패해도 모달은 닫힌다');
  assert.equal(state.territoryViolations.some(candidate => candidate.siteId === site.id), false, '실패는 항의를 공짜로 지우지 않고 사과로 수습한다');
  assert.ok(state.relations[faction] < relationBefore, '제안 실패의 사과 비용이 관계에 남는다');
}

{
  const migrated = saveLoad.migrateV50ToV51({ schemaVersion: 50, territoryViolations: [{ siteId: 3 }] });
  assert.equal(migrated.schemaVersion, 51);
  assert.deepEqual(migrated.territoryViolations[0].zoneIds, [], 'v50 항의에는 안전한 빈 실제-구역 목록을 채운다');
  const state = simulation.newGame(73064);
  state.pendingEnvoys = [{ factionName: '오도리 씨족', kind: 'claimAccord', payload: { silver: 5 }, dueDay: 9, claimZoneId: 7, claimAccordUntilDay: 57 }];
  diplomacy.normalizeDiplomacyState(state);
  assert.equal(state.pendingEnvoys[0].claimZoneId, 7, '협정 사절의 대상 구역과 만료일은 저장 정규화 뒤에도 보존한다');
}

const panelSource = readFileSync(new URL('../../src/components/ForeignSitePanel.tsx', import.meta.url), 'utf8');
const dialogSource = readFileSync(new URL('../../src/components/ClaimAccordDialog.tsx', import.meta.url), 'utf8');
assert.match(panelSource, /zones\.map\(zone/);
assert.match(panelSource, /onOpenClaimAccord\(site\.factionName!, zone\.id\)/);
assert.match(dialogSource, /claimAccordPreview/);

console.log('diplomatic action E5 tests passed');
