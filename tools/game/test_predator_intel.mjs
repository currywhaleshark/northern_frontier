import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-predator-intel-tests-'));
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
const specialEvents = await import(pathToFileURL(join(compiledDir, 'specialEvents.mjs')).href);
const intel = await import(pathToFileURL(join(compiledDir, 'expeditionIntel.mjs')).href);
const targets = await import(pathToFileURL(join(compiledDir, 'expeditionTargets.mjs')).href);
const trade = await import(pathToFileURL(join(compiledDir, 'predatorIntelTrade.mjs')).href);

function prepareThreat(seed = 90210) {
  const state = simulation.newGame(seed);
  const hunter = state.residents[0];
  hunter.job = 'hunter';
  hunter.skills.hunter = 0.8;
  hunter.sick = false;
  hunter.health = 100;
  hunter.quarantinedUntil = 0;
  const untilDay = state.day + 12;
  state.incidents.predatorThreats.wolf = intel.materializePredatorThreat(state, 'wolf', untilDay);
  return { state, hunter };
}

{
  const { state, hunter } = prepareThreat();
  const before = intel.expeditionEnemyIntel(state, { kind: 'predatorHunt', predatorKind: 'wolf' });
  assert.equal(before.precision, 'unknown', '즉시 토벌 편성에서는 규모를 몰라야 한다');

  assert.equal(specialEvents.startPredatorScout(state, 'wolf', hunter.id), null);
  const scouting = state.incidents.predatorThreats.wolf.scouting;
  assert.ok(scouting, '사냥꾼 파견 상태가 위협에 기록되어야 한다');
  assert.ok(intel.activePredatorScoutIds(state).has(hunter.id), '추적 중 사냥꾼은 부재 명단에 포함되어야 한다');
  assert.ok(!intel.availablePredatorScouts(state).some(candidate => candidate.id === hunter.id));

  state.day = scouting.completesOnDay;
  state.incidents.scheduledDays = [];
  specialEvents.updateSpecialEvents(state, () => 1);
  assert.equal(state.incidents.predatorThreats.wolf.scouting, undefined);
  assert.equal(state.incidents.predatorThreats.wolf.intel.precision, 'exact');
  assert.equal(intel.expeditionEnemyIntel(state, { kind: 'predatorHunt', predatorKind: 'wolf' }).precision, 'exact');
}

{
  const { state, hunter } = prepareThreat(90211);
  const marker = targets.activeExpeditionTargetMarkers(state).find(candidate => candidate.kind === 'wolf');
  assert.ok(marker, '활성 맹수 위협은 지도 토벌 표식을 만들어야 한다');
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  assert.ok(site?.factionName, '정보를 팔 현지 정착지가 있어야 한다');
  site.discovered = true;
  site.status = 'stable';
  site.x = marker.x;
  site.y = marker.y;
  state.relations[site.factionName] = 80;
  state.resources.grain = 100;

  assert.equal(specialEvents.startPredatorScout(state, 'wolf', hunter.id), null);
  const offer = trade.predatorIntelOffers(state, site.factionName).find(candidate => candidate.kind === 'wolf');
  assert.ok(offer, '가까운 정착지는 활성 토벌 목표 정보를 거래 목록에 올려야 한다');
  assert.equal(offer.precision, 'exact');
  assert.ok(offer.priceAmount <= 6, '높은 관계에서는 정보값이 크게 내려가야 한다');
  const grainBefore = state.resources.grain;
  assert.equal(trade.purchasePredatorIntel(state, site.factionName, 'wolf'), null);
  assert.equal(state.resources.grain, grainBefore - offer.priceAmount);
  assert.equal(state.incidents.predatorThreats.wolf.scouting, undefined, '정확한 정보를 사면 추적 사냥꾼을 귀환시켜야 한다');
  assert.equal(state.incidents.predatorThreats.wolf.intel.precision, 'exact');
  assert.equal(state.incidents.predatorThreats.wolf.intel.sourceFaction, site.factionName);
}

console.log('predator intel tests passed');
