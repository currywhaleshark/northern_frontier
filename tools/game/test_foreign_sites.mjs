import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-foreign-site-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
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
const foreignSites = await import(pathToFileURL(join(compiledDir, 'foreignSites.mjs')).href);
const claimZones = await import(pathToFileURL(join(compiledDir, 'claimZones.mjs')).href);
const diplomacy = await import(pathToFileURL(join(compiledDir, 'siteDiplomacy.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

{
  const state = simulation.newGame(2026071201);
  assert.ok(state.foreignSites.some(site => site.type === 'village' || site.type === 'fishingVillage'));
  assert.ok(state.foreignSites.some(site => site.type === 'seasonalCamp'));
  assert.ok(state.foreignSites.some(site => site.type === 'banditLair'));
  assert.ok(state.claimZones.length >= 3);
  assert.equal(state.nextForeignSiteId, state.foreignSites.length + 1);
  assert.equal(state.nextClaimZoneId, state.claimZones.length + 1);

  const center = state.buildings.find(building => building.type === 'center');
  for (const site of state.foreignSites) {
    const distance = Math.abs(site.x - center.x) + Math.abs(site.y - center.y);
    assert.ok(distance >= CONFIG.foreignSites.minCenterDistance, `${site.name} is too close (${distance})`);
  }
}

{
  const state = simulation.newGame(2026071202);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  assert.equal(site.discovered, false);
  state.exploration.explored[site.y][site.x] = true;
  foreignSites.revealForeignSitesFromExploration(state);
  assert.equal(site.discovered, true);
  assert.equal(foreignSites.foreignSiteAt(state, site.x, site.y)?.id, site.id);
  assert.ok(state.log.some(entry => entry.text.includes(site.name)));
}

{
  const state = simulation.newGame(2026071203);
  const zone = state.claimZones.find(candidate => candidate.factionName !== '변경 마적');
  const site = state.foreignSites.find(candidate => candidate.id === zone.siteId);
  const relationBefore = state.relations[zone.factionName];
  const alarmBefore = site.alarm;
  const building = {
    id: state.nextBuildingId++, type: 'hut', x: zone.x + Math.max(0, zone.radius - 1), y: zone.y,
    progress: 0, built: false, fieldGrowth: 0,
  };
  state.buildings.push(building);
  claimZones.noteBuildingClaimIntrusions(state, building);
  assert.ok(site.alarm > alarmBefore);
  assert.ok(state.relations[zone.factionName] < relationBefore);
  assert.ok(state.log.some(entry => entry.text.includes('항의')));
}

{
  const state = simulation.newGame(2026071204);
  const camp = state.foreignSites.find(site => site.type === 'seasonalCamp');
  camp.discovered = true;
  camp.seasonalActive = true;
  camp.goodwill = 80;
  camp.trust = 80;
  state.relations[camp.factionName] = 80;
  state.resources.grain = 100;
  assert.equal(diplomacy.requestHuntingRights(state, camp.id), null);
  const huntingZones = state.claimZones.filter(zone => zone.siteId === camp.id &&
    (zone.kind === 'hunting' || zone.kind === 'forest'));
  assert.ok(huntingZones.length > 0);
  assert.ok(huntingZones.every(zone => zone.permittedUntilDay > state.day));
}

{
  const state = simulation.newGame(2026071205);
  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  assert.equal(foreignSites.findRaidOriginSite(state, '변경 마적')?.id, lair.id);
  raids.spawnRaiders(state, () => 0.5, false, '변경 마적', 30);
  assert.ok(state.raiders, 'bandit raid spawns a moving band');
  const originDistance = Math.max(
    lair.x - state.raiders.x,
    state.raiders.x - (lair.x + lair.width - 1),
    lair.y - state.raiders.y,
    state.raiders.y - (lair.y + lair.height - 1),
  );
  assert.ok(originDistance <= 1, `bandit raid starts near its lair (${originDistance})`);
  state.raiders = null;
  lair.status = 'burned';
  assert.equal(foreignSites.findRaidOriginSite(state, '변경 마적'), null);
}

{
  const state = simulation.newGame(2026071206);
  delete state.foreignSites;
  delete state.claimZones;
  delete state.nextForeignSiteId;
  delete state.nextClaimZoneId;
  foreignSites.ensureForeignSiteState(state);
  assert.deepEqual(state.foreignSites, []);
  assert.deepEqual(state.claimZones, []);
  assert.equal(state.nextForeignSiteId, 1);
  assert.equal(state.nextClaimZoneId, 1);
}

console.log('foreign site tests passed');
