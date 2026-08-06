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
const newGameOptions = await import(pathToFileURL(join(compiledDir, 'newGameOptions.mjs')).href);
const foreignSites = await import(pathToFileURL(join(compiledDir, 'foreignSites.mjs')).href);
const claimZones = await import(pathToFileURL(join(compiledDir, 'claimZones.mjs')).href);
const diplomacy = await import(pathToFileURL(join(compiledDir, 'siteDiplomacy.mjs')).href);
const diplomaticEnvoys = await import(pathToFileURL(join(compiledDir, 'diplomacy.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const minimap = await import(pathToFileURL(join(compiledDir, 'minimap.mjs')).href);
const activity = await import(pathToFileURL(join(compiledDir, 'foreignSiteActivity.mjs')).href);
const activitySimulation = await import(pathToFileURL(join(compiledDir, 'foreignSiteSimulation.mjs')).href);
const passage = await import(pathToFileURL(join(compiledDir, 'passage.mjs')).href);
const events = await import(pathToFileURL(join(compiledDir, 'events.mjs')).href);
const tradeValues = await import(pathToFileURL(join(compiledDir, 'tradeValues.mjs')).href);
const agents = await import(pathToFileURL(join(compiledDir, 'agents.mjs')).href);
const selectionActions = await import(pathToFileURL(join(compiledDir, 'selectionActions.mjs')).href);
const territory = await import(pathToFileURL(join(compiledDir, 'territory.mjs')).href);
const saveMigrations = await import(pathToFileURL(join(compiledDir, 'saveMigrations.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);
const { FACTIONS } = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);

{
  const state = simulation.newGame(2026071201);
  assert.ok(state.foreignSites.some(site => site.type === 'village' || site.type === 'fishingVillage'));
  assert.ok(state.foreignSites.some(site => site.type === 'seasonalCamp'));
  assert.ok(state.foreignSites.some(site => site.type === 'banditLair'));
  assert.ok(state.claimZones.length >= 3);
  assert.equal(state.nextForeignSiteId, state.foreignSites.length + 1);
  assert.equal(state.nextClaimZoneId, state.claimZones.length + 1);
  assert.deepEqual(state.foreignSiteParties, []);
  assert.equal(state.nextForeignSitePartyId, 1);
  assert.ok(state.foreignSites.every(site => site.activity), 'every generated site has an activity ledger');
  assert.ok(state.claimZones.every(zone => zone.growth?.baseRadius === zone.radius),
    'every generated claim zone starts with a stable growth ledger');

  const center = state.buildings.find(building => building.type === 'center');
  for (const site of state.foreignSites) {
    const distance = Math.abs(site.x - center.x) + Math.abs(site.y - center.y);
    assert.ok(distance >= CONFIG.foreignSites.minCenterDistance, `${site.name} is too close (${distance})`);
  }
}

{
  const expectedBySize = {
    small: { settlements: 1, seasonalCamps: 1, banditLairs: 1 },
    medium: { settlements: 2, seasonalCamps: 2, banditLairs: 1 },
    large: { settlements: 3, seasonalCamps: 2, banditLairs: 2 },
  };
  for (const [index, mapSize] of ['small', 'medium', 'large'].entries()) {
    const state = simulation.newGameFromOptions({
      ...newGameOptions.optionsForDifficulty('normal', '', 2026080610 + index),
      mapSize,
      seed: 2026080610 + index,
    });
    const expected = expectedBySize[mapSize];
    const settlements = state.foreignSites.filter(site => site.type === 'village' || site.type === 'fishingVillage');
    assert.deepEqual({
      settlements: settlements.length,
      seasonalCamps: state.foreignSites.filter(site => site.type === 'seasonalCamp').length,
      banditLairs: state.foreignSites.filter(site => site.type === 'banditLair').length,
    }, expected, `${mapSize} uses its foreign-site density contract`);

    for (const site of settlements) {
      for (let y = site.y; y < site.y + site.height; y++) {
        for (let x = site.x; x < site.x + site.width; x++) {
          assert.ok(['plain', 'fertile'].includes(state.map[y][x].terrain),
            `${mapSize} settlement footprints stay on cleared ground`);
        }
      }
      for (const prop of activity.foreignSiteProps(state, site)) {
        if (!['field', 'hut', 'storehouse', 'dryingRack'].includes(prop.kind)) continue;
        assert.ok(['plain', 'fertile'].includes(state.map[prop.y][prop.x].terrain),
          `${mapSize} settlement props do not overlap trees`);
      }
    }
    if (mapSize === 'large') {
      assert.ok(settlements.some(site => site.type === 'village' && site.name.includes('들녘')),
        'large maps can place a village away from the riverside');
    }
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
    id: state.nextBuildingId++, type: 'hut',
    x: Math.min(state.map[0].length - 2, Math.max(0, zone.x)),
    y: Math.min(state.map.length - 2, Math.max(0, zone.y)),
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
  assert.equal(activity.foreignSiteProps(state, camp).filter(prop => prop.kind === 'huntLodge').length, 1,
    'seasonal camp has one faction hunting lodge');
  camp.seasonalActive = true;
  camp.goodwill = 80;
  camp.trust = 80;
  state.relations[camp.factionName] = 80;
  state.resources.grain = 100;
  // 사냥권 협정은 발견한 사냥·숲 영유 구역을 대상으로만 열 수 있다.
  state.claimZones
    .filter(zone => zone.siteId === camp.id && (zone.kind === 'hunting' || zone.kind === 'forest'))
    .forEach(zone => { zone.discovered = true; });
  assert.equal(diplomacy.requestHuntingRights(state, camp.id), null);
  assert.equal(state.pendingChoice?.kind, 'claimAccordEnvoy',
    '사냥권 요청은 즉시 허가하지 않고 생활권 협정 사절 준비를 연다');
  const huntingZones = state.claimZones.filter(zone => zone.siteId === camp.id &&
    (zone.kind === 'hunting' || zone.kind === 'forest'));
  assert.ok(huntingZones.length > 0);
  assert.ok(huntingZones.every(zone => zone.permittedUntilDay == null),
    '사절이 답신하기 전에는 작업 허가가 생기지 않는다');
}

{
  const state = simulation.newGame(2026071205);
  const lair = state.foreignSites.find(site => site.type === 'banditLair');
  state.map.flat().forEach(tile => { tile.terrain = 'plain'; tile.buildingId = null; });
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
  const state = simulation.newGame(2026080603);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  state.map.flat().forEach(tile => { tile.terrain = 'plain'; tile.buildingId = null; });
  site.discovered = true;
  state.diplomaticPacts = [];
  assert.equal(foreignSites.findRaidOriginSite(state, site.factionName)?.id, site.id,
    'an operational matching settlement can become a raid origin');
  raids.spawnRaiders(state, () => 0.5, true, site.factionName, 30);
  assert.ok(state.raiders, 'a matching settlement raid still uses the existing RaiderBand');
  assert.equal(state.raiders.originSiteId, site.id);
  const originDistance = Math.max(
    site.x - state.raiders.x,
    state.raiders.x - (site.x + site.width - 1),
    site.y - state.raiders.y,
    state.raiders.y - (site.y + site.height - 1),
  );
  assert.ok(originDistance <= 1, 'the raid starts around its source settlement');
  assert.equal(site.militaryActivityUntilDay, state.day + CONFIG.threat.raidCooldownDays,
    'departure locks the source settlement military slot for recovery');
  assert.equal(foreignSites.findRaidOriginSite(state, site.factionName), null,
    'a recovering source settlement cannot launch another raid');
  state.pendingChoice = {
    kind: 'raid', title: 'test raid', body: 'test', options: [],
    data: { power: 30, faction: site.factionName, warned: true, siege: false },
  };
  raids.resolveRaid(state, 'beacon', () => 0);
  assert.ok(site.memories.some(memory => memory.text.includes('패해 흩어져')),
    'repelled raid result returns to the source settlement memory');
  state.day = site.militaryActivityUntilDay;
  assert.equal(foreignSites.findRaidOriginSite(state, site.factionName)?.id, site.id,
    'the military slot reopens after its deterministic recovery period');
}

{
  const state = simulation.newGame(2026080604);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  state.map.flat().forEach(tile => { tile.terrain = 'plain'; tile.buildingId = null; });
  for (let y = site.y - 1; y <= site.y + site.height; y++) {
    for (let x = site.x - 1; x <= site.x + site.width; x++) {
      if (state.map[y]?.[x]) state.map[y][x].terrain = 'mountain';
    }
  }
  raids.spawnRaiders(state, () => 0.5, false, site.factionName, 30);
  assert.ok(state.raiders, 'a blocked settlement origin falls back to the existing map-edge raid');
  assert.equal(state.raiders.originSiteId, undefined, 'fallback raid does not claim a source route it could not use');
  assert.equal(site.militaryActivityUntilDay, undefined, 'failed local route does not lock the settlement military slot');
  assert.ok(state.raiders.x === 0 || state.raiders.y === 0 || state.raiders.x === state.map[0].length - 1,
    'the fallback raid starts on an existing map edge');
}

{
  const state = simulation.newGame(2026071206);
  delete state.foreignSites;
  delete state.claimZones;
  delete state.nextForeignSiteId;
  delete state.nextClaimZoneId;
  delete state.foreignSiteParties;
  delete state.nextForeignSitePartyId;
  foreignSites.ensureForeignSiteState(state);
  assert.deepEqual(state.foreignSites, []);
  assert.deepEqual(state.claimZones, []);
  assert.equal(state.nextForeignSiteId, 1);
  assert.equal(state.nextClaimZoneId, 1);
  assert.deepEqual(state.foreignSiteParties, []);
  assert.equal(state.nextForeignSitePartyId, 1);

  const migrated = saveMigrations.migrateV62ToV63({
    schemaVersion: 62,
    foreignSites: [{ id: 1, status: 'stable' }],
    foreignSiteParties: [{ id: 99 }],
  });
  assert.equal(migrated.schemaVersion, 63);
  assert.deepEqual(migrated.foreignSiteParties, [], 'old saves do not restore incomplete activity parties');
  assert.equal(migrated.nextForeignSitePartyId, 1);
  const growthMigrated = saveMigrations.migrateV63ToV64({ schemaVersion: 63, claimZones: [{ radius: 5 }] });
  assert.equal(growthMigrated.schemaVersion, 64);
  assert.equal(growthMigrated.claimZones[0].radius, 5, 'v64 migration preserves the old visible claim radius');
  const diplomacyMigrated = saveMigrations.migrateV64ToV65({ schemaVersion: 64, foreignSiteParties: [] });
  assert.equal(diplomacyMigrated.schemaVersion, 65);
  assert.deepEqual(diplomacyMigrated.foreignSiteParties, [], 'v65 preserves safe existing party state for normalization');
  const raidOriginMigrated = saveMigrations.migrateV65ToV66({ schemaVersion: 65, raiders: { faction: 'test' } });
  assert.equal(raidOriginMigrated.schemaVersion, 66);
  assert.equal(raidOriginMigrated.raiders.originSiteId, undefined, 'old active raids keep an unknown origin in v66');
}

{
  const state = simulation.newGame(2026071212);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  site.type = 'village';
  site.discovered = true;
  state.foreignSites.forEach(candidate => { candidate.activity.nextActivityDay = state.day + 99; });
  site.activity.nextActivityDay = state.day;
  const target = { x: Math.min(state.map[0].length - 1, site.x + site.width), y: site.y };
  for (let y = Math.max(0, site.y - 1); y <= Math.min(state.map.length - 1, site.y + site.height); y++) {
    for (let x = Math.max(0, site.x - 1); x <= Math.min(state.map[0].length - 1, site.x + site.width); x++) {
      state.map[y][x].terrain = 'plain';
      state.map[y][x].buildingId = null;
    }
  }
  state.claimZones = state.claimZones.filter(zone => zone.siteId !== site.id);
  state.claimZones.push({
    id: state.nextClaimZoneId++, siteId: site.id, factionName: site.factionName,
    kind: 'field', x: target.x, y: target.y, radius: 2, discovered: true,
  });
  const twin = JSON.parse(JSON.stringify(state));
  const foodBefore = site.foodStock;
  activitySimulation.dailyForeignSiteActivityTick(state);
  activitySimulation.dailyForeignSiteActivityTick(twin);
  assert.deepEqual(twin.foreignSiteParties, state.foreignSiteParties,
    'the same seed, day, site, and activity sequence choose the same party and target');
  const party = state.foreignSiteParties.find(candidate => candidate.siteId === site.id);
  assert.ok(party, 'a due settlement sends a real activity party');
  assert.equal(party.kind, 'farm');
  assert.ok(activity.foreignSitePartyActors(state).every(actor => actor.partyId === party.id),
    'render actors retain their selectable party id');
  assert.deepEqual(minimap.visibleMinimapForeignSiteParties(state).map(candidate => candidate.id), [party.id],
    'a discovered settlement party appears on the minimap');

  for (let tick = 0; tick < 180 && state.foreignSiteParties.some(candidate => candidate.id === party.id); tick++) {
    activitySimulation.foreignSitePartiesTick(state);
    state.subTick++;
    if (state.subTick >= CONFIG.agents.subticksPerDay) {
      state.subTick = 0;
      state.day++;
    }
  }
  assert.equal(state.foreignSiteParties.some(candidate => candidate.id === party.id), false,
    'the activity party completes work and returns home');
  assert.ok(site.foodStock > foodBefore, 'returned farm cargo enters settlement food stock');
  assert.ok((site.activity.pendingProduction.grain ?? 0) > 0, 'trip output is recorded for the next settlement');
}

{
  const state = simulation.newGame(2026071215);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  const zone = state.claimZones.find(candidate => candidate.siteId === site.id);
  state.foreignSites = [site];
  state.claimZones = [zone];
  state.foreignSiteParties = [];
  site.discovered = true;
  site.status = 'prosperous';
  site.activity.condition = 'prosperous';
  site.activity.recentProduction = { grain: 2 };
  zone.discovered = true;
  zone.growth.pressure = 1;
  const oldRadius = zone.radius;
  for (let y = Math.max(0, zone.y - oldRadius - 2); y <= Math.min(state.map.length - 1, zone.y + oldRadius + 2); y++) {
    for (let x = Math.max(0, zone.x - oldRadius - 2); x <= Math.min(state.map[0].length - 1, zone.x + oldRadius + 2); x++) {
      if (state.map[y][x].buildingId == null) state.map[y][x].terrain = 'plain';
    }
  }
  const ringTiles = [
    { x: zone.x + oldRadius + 1, y: zone.y },
    { x: zone.x - oldRadius - 1, y: zone.y },
    { x: zone.x, y: zone.y + oldRadius + 1 },
    { x: zone.x, y: zone.y - oldRadius - 1 },
  ].filter(tile => state.map[tile.y]?.[tile.x] && state.map[tile.y][tile.x].buildingId == null);
  assert.ok(ringTiles.length >= 2, 'the claim has testable outer-ring tiles');
  const addHut = tile => {
    const building = {
      id: state.nextBuildingId++, type: 'hut', x: tile.x, y: tile.y,
      progress: 1, built: true, fieldGrowth: 0,
    };
    state.buildings.push(building);
    state.map[tile.y][tile.x].buildingId = building.id;
    return building;
  };
  const established = addHut(ringTiles[0]);
  activitySimulation.seasonalForeignSiteBoundaryTick(state);
  const patrol = state.foreignSiteParties.find(candidate => candidate.kind === 'patrol');
  assert.ok(patrol, 'prosperity pressure sends a visible boundary patrol before expansion');
  assert.equal(zone.radius, oldRadius, 'the claim does not expand before the patrol returns');

  for (let tick = 0; tick < 360 && state.foreignSiteParties.some(candidate => candidate.id === patrol.id); tick++) {
    activitySimulation.foreignSitePartiesTick(state);
    state.subTick++;
    if (state.subTick >= CONFIG.agents.subticksPerDay) {
      state.subTick = 0;
      state.day++;
    }
  }
  assert.equal(zone.radius, oldRadius + 1, 'a returning patrol confirms one tile of seasonal expansion');
  assert.ok(zone.growth.establishedUseBuildingIds.includes(established.id),
    'buildings already present in the new ring receive established-use grace');

  const tensionDayOffset = (CONFIG.foreignSites.claimDailyInterval -
    ((state.day + zone.id) % CONFIG.foreignSites.claimDailyInterval)) % CONFIG.foreignSites.claimDailyInterval;
  state.day += tensionDayOffset;
  const alarmBeforeGrace = site.alarm;
  claimZones.dailyClaimTensionTick(state);
  assert.equal(site.alarm, alarmBeforeGrace, 'an established building does not create tension during its grace season');
  assert.equal(territory.unauthorizedTerritorySiteIds(state, established.x, established.y, 'work').length, 0,
    'existing work inside the protected footprint remains authorized during grace');

  const newBuilding = addHut(ringTiles[1]);
  assert.ok(!zone.growth.establishedUseBuildingIds.includes(newBuilding.id));
  assert.deepEqual(territory.unauthorizedTerritorySiteIds(state, newBuilding.x, newBuilding.y, 'work'), [site.id],
    'new construction in the expanded ring receives no established-use protection');
  state.day += CONFIG.foreignSites.claimDailyInterval;
  claimZones.dailyClaimTensionTick(state);
  assert.equal(site.alarm, alarmBeforeGrace, 'daily tension schedules a field patrol instead of applying an unseen penalty');
  assert.equal(zone.growth.warningTargetBuildingId, newBuilding.id);
  activitySimulation.dailyForeignSiteActivityTick(state);
  const warningPatrol = state.foreignSiteParties.find(candidate => candidate.patrolPurpose === 'warning');
  assert.ok(warningPatrol, 'the settlement sends a patrol to inspect the unauthorized building');
  for (let tick = 0; tick < 360 && site.alarm === alarmBeforeGrace; tick++) {
    activitySimulation.foreignSitePartiesTick(state);
    state.subTick++;
    if (state.subTick >= CONFIG.agents.subticksPerDay) {
      state.subTick = 0;
      state.day++;
    }
  }
  assert.ok(site.alarm > alarmBeforeGrace, 'tension applies when the patrol reaches and confirms the intrusion');
  assert.equal(zone.growth.warningTargetBuildingId, undefined);
}

{
  const state = simulation.newGame(2026071216);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  const zone = state.claimZones.find(candidate => candidate.siteId === site.id);
  state.foreignSites = [site];
  state.claimZones = [zone];
  state.foreignSiteParties = [];
  site.discovered = true;
  site.status = 'sick';
  site.activity.condition = 'sick';
  zone.discovered = true;
  zone.growth.pressure = 0;
  const oldRadius = zone.radius;
  activitySimulation.seasonalForeignSiteBoundaryTick(state);
  assert.equal(zone.growth.pendingChange, 'contract');
  assert.equal(zone.radius, oldRadius, 'contraction is announced for one season before changing the boundary');

  state.claimAccords = [{ zoneId: zone.id, untilDay: state.day + CONFIG.time.seasonDays * 2 }];
  state.day += CONFIG.time.seasonDays;
  activitySimulation.seasonalForeignSiteBoundaryTick(state);
  assert.equal(zone.radius, oldRadius, 'an active claim accord freezes pending contraction');
  state.day = state.claimAccords[0].untilDay;
  activitySimulation.seasonalForeignSiteBoundaryTick(state);
  assert.equal(zone.radius, oldRadius - 1, 'the pending contraction applies after the accord expires');
}

{
  const state = simulation.newGame(2026071213);
  const camp = state.foreignSites.find(candidate => candidate.type === 'seasonalCamp');
  camp.discovered = true;
  camp.seasonalActive = true;
  state.foreignSites.forEach(candidate => { candidate.activity.nextActivityDay = state.day + 99; });
  camp.activity.nextActivityDay = state.day;
  const target = { x: Math.min(state.map[0].length - 1, camp.x + 1), y: camp.y };
  for (let y = Math.max(0, camp.y - 1); y <= Math.min(state.map.length - 1, camp.y + 1); y++) {
    for (let x = Math.max(0, camp.x - 1); x <= Math.min(state.map[0].length - 1, camp.x + 1); x++) {
      state.map[y][x].terrain = 'forest';
      state.map[y][x].buildingId = null;
    }
  }
  const habitat = state.habitats[0];
  state.habitats.forEach(candidate => { candidate.active = false; });
  habitat.x = target.x;
  habitat.y = target.y;
  habitat.radius = 1;
  habitat.stock = 10;
  habitat.active = true;
  state.claimZones = state.claimZones.filter(zone => zone.siteId !== camp.id);
  state.claimZones.push({
    id: state.nextClaimZoneId++, siteId: camp.id, factionName: camp.factionName,
    kind: 'hunting', x: target.x, y: target.y, radius: 2, discovered: true,
  });
  activitySimulation.dailyForeignSiteActivityTick(state);
  const party = state.foreignSiteParties.find(candidate => candidate.siteId === camp.id);
  assert.ok(party, 'an active seasonal camp sends a hunting party');
  assert.equal(party.kind, 'hunt');
  const stockBefore = habitat.stock;
  for (let tick = 0; tick < 120 && habitat.stock === stockBefore; tick++) {
    activitySimulation.foreignSitePartiesTick(state);
    state.subTick++;
    if (state.subTick >= CONFIG.agents.subticksPerDay) {
      state.subTick = 0;
      state.day++;
    }
  }
  assert.ok(habitat.stock < stockBefore, 'foreign hunting consumes the same habitat reserve as the player');
}

{
  const state = simulation.newGame(2026071214);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  state.foreignSites.forEach(candidate => { candidate.activity.nextActivityDay = state.day + 99; });
  site.status = 'stable';
  site.activity.condition = 'stable';
  site.activity.lastSettlementDay = state.day - 6;
  site.foodStock = 0;
  activitySimulation.dailyForeignSiteActivityTick(state);
  assert.equal(site.status, 'hungry', 'two poor settlements make food shortage visible');

  site.activity.lastSettlementDay = state.day - 3;
  site.activity.hungerDays = CONFIG.foreignSites.activity.sicknessHungerDays;
  site.foodStock = 0;
  state.weather = 'coldSnap';
  activitySimulation.dailyForeignSiteActivityTick(state);
  assert.equal(site.status, 'sick', 'prolonged hunger in severe cold can make the site sick');

  site.activity.lastSettlementDay = state.day - 3;
  site.foodStock = site.population * CONFIG.foreignSites.activity.foodConsumptionPerPersonPerDay * 30;
  state.weather = 'clear';
  activitySimulation.dailyForeignSiteActivityTick(state);
  assert.equal(site.status, 'stable', 'adequate food lets a sick settlement recover');
}

{
  const state = simulation.newGame(2026071207);
  state.foreignSites.forEach(site => { site.discovered = false; });
  state.foreignSites[0].discovered = true;
  assert.deepEqual(minimap.visibleMinimapSites(state).map(site => site.id), [state.foreignSites[0].id]);

  state.raiders = {
    x: 1, y: 1, px: 1, py: 1, path: [], power: 10, size: 3,
    faction: '변경 마적', warned: false, spotted: false, siege: false, speed: 1, trail: [],
  };
  assert.equal(minimap.visibleMinimapRaid(state), null, 'undetected raiders stay hidden');
  state.raiders.warned = true;
  assert.equal(minimap.visibleMinimapRaid(state), state.raiders, 'beacon warning reveals raiders');
  state.raiders.warned = false;
  state.raiders.spotted = true;
  assert.equal(minimap.visibleMinimapRaid(state), state.raiders, 'spotted raiders remain visible');
}

{
  const state = simulation.newGame(2026071208);
  const village = state.foreignSites.find(site => site.type === 'village' || site.type === 'fishingVillage');
  village.discovered = true;
  const props = activity.foreignSiteProps(state, village);
  assert.ok(props.some(prop => prop.kind === 'field'), 'settlement has a working field');
  assert.ok(props.some(prop => prop.kind !== 'field'), 'settlement has outbuildings');
  const villagersAtStart = activity.foreignSiteActors(state, village, 0);
  const villagersLater = activity.foreignSiteActors(state, village, 8);
  assert.ok(villagersAtStart.length >= 2, 'settlement has ambient workers');
  assert.notDeepEqual(
    villagersAtStart.map(actor => [actor.x, actor.y]),
    villagersLater.map(actor => [actor.x, actor.y]),
    'settlement workers move between work sites',
  );

  const camp = state.foreignSites.find(site => site.type === 'seasonalCamp');
  camp.discovered = true;
  camp.seasonalActive = false;
  assert.deepEqual(activity.foreignSiteActors(state, camp, 0), [], 'inactive camp stays empty');
  camp.seasonalTransition = 'entering';
  state.foreignSites.forEach(candidate => {
    candidate.activity.nextActivityDay = state.day + 99;
    candidate.activity.nextDiplomaticDay = state.day + 99;
  });
  activitySimulation.dailyForeignSiteActivityTick(state);
  const migration = state.foreignSiteParties.find(party => party.siteId === camp.id && party.kind === 'seasonalMigration');
  assert.ok(migration, 'an inactive seasonal camp starts a real entry procession');
  assert.equal(migration.migrationDirection, 'entering');
  const mapWidth = state.map[0].length;
  const mapHeight = state.map.length;
  assert.ok(migration.x === 0 || migration.y === 0 || migration.x === mapWidth - 1 || migration.y === mapHeight - 1,
    'the real entry procession starts at a map edge');
  for (let tick = 0; tick < 1000 && state.foreignSiteParties.includes(migration); tick++) {
    activitySimulation.foreignSitePartiesTick(state);
  }
  assert.equal(camp.seasonalActive, true, 'the camp becomes active only after the procession arrives');
  assert.equal(camp.seasonalTransition, undefined);
  assert.ok(activity.foreignSiteActors(state, camp, 8).length >= 3, 'camp life appears after the real arrival');
  camp.seasonalTransition = 'leaving';
  activitySimulation.dailyForeignSiteActivityTick(state);
  const leaving = state.foreignSiteParties.find(party => party.siteId === camp.id && party.kind === 'seasonalMigration');
  assert.ok(leaving, 'an active seasonal camp starts a real departure procession');
  assert.equal(leaving.x, camp.x, 'the departure procession starts at the camp');
  for (let tick = 0; tick < 1000 && state.foreignSiteParties.includes(leaving); tick++) {
    activitySimulation.foreignSitePartiesTick(state);
  }
  assert.equal(camp.seasonalActive, false, 'the camp becomes inactive only after the procession leaves the map');
  assert.equal(camp.seasonalTransition, undefined);
}

{
  const state = simulation.newGame(2026071209);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  site.discovered = true;
  site.goodwill = 90;
  site.trust = 90;
  state.relations[site.factionName] = 90;
  state.resources.grain = 100;
  const resource = FACTIONS.find(faction => faction.name === site.factionName).exports[0];
  const capacityBefore = tradeValues.factionTradeCapacitySummary(state, site.factionName, resource).total;
  const cooldownBefore = events.playerTradeCooldownDays(state, site.factionName);
  state.claimZones
    .filter(zone => zone.siteId === site.id && zone.kind === 'passage')
    .forEach(zone => { zone.discovered = true; });
  assert.equal(diplomacy.requestPassagePermission(state, site.id), null);
  assert.equal(state.pendingChoice?.kind, 'claimAccordEnvoy',
    '통행 허가 요청은 즉시 길을 열지 않고 생활권 협정 사절 준비를 연다');
  assert.equal(passage.hasActivePassageForFaction(state, site.factionName), false);
  assert.equal(tradeValues.factionTradeCapacitySummary(state, site.factionName, resource).total, capacityBefore,
    '사절 답신 전에는 계절 교역 수용량이 바뀌지 않는다');
  assert.equal(events.playerTradeCooldownDays(state, site.factionName), cooldownBefore,
    '사절 답신 전에는 대상단 왕복일이 줄지 않는다');
}

{
  const state = simulation.newGame(2026071210);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  site.discovered = true;
  const zones = state.claimZones.filter(zone => zone.siteId === site.id);
  zones.forEach(zone => { zone.discovered = true; delete zone.permittedUntilDay; });
  const tile = state.map[site.y][site.x];
  tile.terrain = 'grass';
  tile.buildingId = null;
  state.exploration.explored[tile.y][tile.x] = true;
  const resident = state.residents.find(candidate => candidate.alive);

  assert.equal(agents.isPassable(state, tile.x, tile.y), false, 'known foreign territory blocks automatic movement');
  const forcedMove = selectionActions.getPointerAction(state, { kind: 'resident', id: resident.id }, tile);
  assert.equal(forcedMove.kind, 'move');
  assert.deepEqual(forcedMove.unauthorizedSiteIds, [site.id], 'manual movement is offered as a forced trespass');

  territory.openTerritoryOrderConfirmation(state, resident.id, forcedMove);
  assert.equal(state.pendingChoice.kind, 'territory');
  simulation.resolveChoice(state, 'force');
  assert.deepEqual(resident.manualOrder.unauthorizedSiteIds, [site.id], 'confirmed order carries a scoped territory override');

  resident.manualOrder = null;
  site.goodwill = 90;
  site.trust = 90;
  state.relations[site.factionName] = 90;
  state.resources.grain = 100;
  assert.equal(diplomacy.requestPassagePermission(state, site.id), null);
  const passageZone = zones.find(zone => zone.kind === 'passage');
  assert.ok(passageZone, '통행 협정 대상 구역이 있어야 한다');
  assert.equal(state.pendingChoice?.kind, 'claimAccordEnvoy');
  assert.equal(diplomaticEnvoys.sendClaimAccordEnvoy(state, site.factionName, passageZone.id, 'grain', 100), null);
  state.day = state.pendingEnvoys[0].dueDay;
  diplomaticEnvoys.dailyDiplomacyTick(state);
  assert.equal(agents.isPassable(state, tile.x, tile.y), true, 'passage permission opens resident movement');

  resident.x = tile.x;
  resident.y = tile.y;
  resident.px = tile.x;
  resident.py = tile.y;
  resident.phase = 'working';
  resident.workTimer = 10;
  state.subTick = 9;
  agents.agentsTick(state);
  assert.equal(resident.task, '작업 허가 없음', 'passage permission does not let automatic work continue');

  tile.terrain = 'forest';
  resident.job = 'woodcutter';
  const forcedWork = selectionActions.getPointerAction(state, { kind: 'resident', id: resident.id }, tile);
  assert.equal(forcedWork.kind, 'work');
  assert.deepEqual(forcedWork.unauthorizedSiteIds, [site.id], 'passage permission alone does not grant resource work rights');
}

{
  const state = simulation.newGame(2026071211);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  site.discovered = true;
  state.claimZones.filter(zone => zone.siteId === site.id).forEach(zone => {
    zone.discovered = true;
    delete zone.permittedUntilDay;
  });
  const relationBefore = state.relations[site.factionName];
  territory.noteTerritoryViolation(state, [site.id], site.x, site.y, 'passage');
  assert.equal(state.territoryViolations.length, 1);
  const warningDay = state.territoryViolations[0].warningDay;
  assert.ok(warningDay >= state.day + CONFIG.foreignSites.violationWarningDelay[0]);
  state.day = warningDay;
  territory.updateTerritoryWarnings(state);
  assert.equal(state.pendingChoice.kind, 'territory', 'a delayed diplomatic warning opens');
  assert.equal(state.pendingChoice.data.mode, 'warning');
  simulation.resolveChoice(state, 'ignore');
  assert.ok(state.relations[site.factionName] < relationBefore, 'ignoring the warning damages faction relations');
  assert.equal(state.territoryViolations.length, 0, 'resolved warning clears the violation');
}

{
  const state = simulation.newGame(2026080601);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  const center = state.buildings.find(building => building.type === 'center');
  state.map.flat().forEach(tile => { tile.terrain = 'plain'; tile.buildingId = null; });
  state.buildings.push({
    id: state.nextBuildingId++, type: 'market', x: Math.min(state.map[0].length - 3, center.x + 3), y: center.y,
    progress: 99, built: true, fieldGrowth: 0,
  });
  site.discovered = true;
  state.relations[site.factionName] = 90;
  state.claimZones.filter(zone => zone.siteId === site.id && zone.kind === 'passage')
    .forEach(zone => { zone.permittedUntilDay = state.day + 100; });
  state.foreignSites.forEach(candidate => {
    candidate.activity.nextActivityDay = state.day + 99;
    candidate.activity.nextDiplomaticDay = state.day + 99;
  });
  site.activity.nextDiplomaticDay = state.day;
  activitySimulation.dailyForeignSiteActivityTick(state);
  const caravan = state.foreignSiteParties.find(party => party.siteId === site.id && party.kind === 'caravan');
  assert.ok(caravan, 'a friendly site with passage permission sends a physical caravan');
  for (let tick = 0; tick < 1000 && state.pendingChoice?.kind !== 'trade'; tick++) {
    activitySimulation.foreignSitePartiesTick(state);
  }
  assert.equal(state.pendingChoice?.kind, 'trade', 'trade opens only after the caravan reaches the market');
  const negotiation = events.tradeNegotiationOf(state.pendingChoice);
  assert.equal(negotiation.sourceSiteId, site.id);
  assert.equal(negotiation.sourcePartyId, caravan.id);
  const faction = FACTIONS.find(candidate => candidate.name === site.factionName);
  const get = faction.exports.find(resource => resource !== negotiation.give && (site.tradeStock[resource] ?? 0) >= 1);
  assert.ok(get, 'the source settlement has a faction export in its real stock');
  state.resources[negotiation.give] = 500;
  const siteStockBefore = site.tradeStock[get];
  const playerStockBefore = state.resources[get];
  const foodBefore = site.foodStock;
  const incomingBefore = site.tradeStock[negotiation.give] ?? 0;
  assert.equal(events.negotiateTrade(state, get, 1, undefined, negotiation.giveAmt), null);
  assert.ok(negotiation.phase === 'accepted' || negotiation.phase === 'countered');
  const actualGet = negotiation.getAmt;
  const actualGive = negotiation.giveAmt;
  simulation.resolveChoice(state, 'confirm');
  assert.equal(site.tradeStock[get], siteStockBefore - actualGet, 'the source site loses traded export stock once');
  assert.equal(state.resources[get], playerStockBefore + actualGet, 'the player receives caravan stock once');
  if (['grain', 'meat', 'fish'].includes(negotiation.give)) {
    assert.equal(site.foodStock, foodBefore + actualGive, 'food paid to the caravan feeds its source settlement');
  } else {
    assert.equal(site.tradeStock[negotiation.give], incomingBefore + actualGive,
      'non-food payment enters the source settlement trade stock');
  }
  assert.equal(caravan.interactionResolved, true, 'resolved trade releases the caravan to return');
}

{
  const state = simulation.newGame(2026080602);
  const site = state.foreignSites.find(candidate => candidate.type === 'village' || candidate.type === 'fishingVillage');
  state.map.flat().forEach(tile => { tile.terrain = 'plain'; tile.buildingId = null; });
  site.discovered = true;
  site.activity.condition = 'hungry';
  site.status = 'hungry';
  site.foodStock = 0;
  state.relations[site.factionName] = 60;
  state.resources.grain = 100;
  state.foreignSites.forEach(candidate => {
    candidate.activity.nextActivityDay = state.day + 99;
    candidate.activity.nextDiplomaticDay = state.day + 99;
  });
  site.activity.nextDiplomaticDay = state.day;
  activitySimulation.dailyForeignSiteActivityTick(state);
  const messenger = state.foreignSiteParties.find(party => party.siteId === site.id && party.kind === 'messenger');
  assert.ok(messenger, 'a hungry friendly site sends a physical aid messenger');
  for (let tick = 0; tick < 1000 && state.pendingChoice?.kind !== 'foreignSiteAidRequest'; tick++) {
    activitySimulation.foreignSitePartiesTick(state);
  }
  assert.equal(state.pendingChoice?.kind, 'foreignSiteAidRequest', 'aid choice opens only after messenger arrival');
  const relationBefore = state.relations[site.factionName];
  simulation.resolveChoice(state, 'grain');
  assert.equal(state.resources.grain, 100 - CONFIG.foreignSites.activity.aidGrainAmount);
  assert.equal(site.foodStock, CONFIG.foreignSites.activity.aidGrainAmount);
  assert.ok(state.relations[site.factionName] > relationBefore);
  assert.equal(site.favors, 1, 'accepted aid creates one favor owed by the site');
  assert.equal(messenger.interactionResolved, true);
  for (let tick = 0; tick < 1000 && state.foreignSiteParties.includes(messenger); tick++) {
    activitySimulation.foreignSitePartiesTick(state);
  }
  site.activity.condition = 'hungry';
  site.status = 'hungry';
  site.activity.nextDiplomaticDay = state.day;
  activitySimulation.dailyForeignSiteActivityTick(state);
  assert.equal(state.foreignSiteParties.some(party => party.siteId === site.id && party.kind === 'messenger'), false,
    'the same settlement cannot request aid twice in one season');
}

console.log('foreign site tests passed');
