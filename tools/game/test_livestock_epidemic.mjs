import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-livestock-epidemic-tests-'));
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
const specialEvents = await import(pathToFileURL(join(compiledDir, 'specialEvents.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

function sequenceRng(values, fallback = values.at(-1) ?? 0.5) {
  let index = 0;
  return () => values[index++] ?? fallback;
}

function stable(id, species, headcount) {
  return {
    id,
    type: 'stable',
    x: id % 10,
    y: 2,
    built: true,
    progress: 20,
    fieldGrowth: 0,
    livestock: { species, headcount, growth: 0, feedShortageDays: 0 },
    inventory: {},
  };
}

function onlyLivestockEpidemic(state) {
  const ids = [
    'wolf', 'tiger', 'boar', 'wildGinseng', 'plagueSuspicion', 'grainRequisition', 'shipwreck',
    'earlyFrost', 'lateFrost', 'locust', 'drought', 'gyrfalcon', 'horseDefectors',
  ];
  state.incidents.cooldownUntil = Object.fromEntries(ids.map(id => [id, 9999]));
  state.incidents.scheduledDays = [state.day];
}

function startLivestockEpidemic(state, group, stableId) {
  state.incidents.livestockEpidemic = {
    group,
    infectedStableIds: [stableId],
    mode: 'isolated',
    startedDay: state.day,
    quietDays: 0,
    newInfectedStableIds: [],
    totalDeaths: 0,
    totalCulled: 0,
    recoveredStableIds: [],
    infectedSince: { [stableId]: state.day },
  };
  state.incidents.scheduledDays = [state.day + 20];
}

{
  const ruminantState = simulation.newGame(2026072908, 'normal', '우역촌');
  ruminantState.buildings = [stable(101, 'cattle', 8), stable(102, 'pig', 1)];
  onlyLivestockEpidemic(ruminantState);
  assert.equal(specialEvents.maybeOpenSpecialEvent(ruminantState, sequenceRng([0, 0, 0])), true);
  assert.equal(ruminantState.incidents.livestockEpidemic.group, 'ruminant',
    'the larger ruminant herd must win the low-roll weighted group draw');

  const pigState = simulation.newGame(2026072909, 'normal', '저역촌');
  pigState.buildings = [stable(101, 'cattle', 8), stable(102, 'pig', 1)];
  onlyLivestockEpidemic(pigState);
  assert.equal(specialEvents.maybeOpenSpecialEvent(pigState, sequenceRng([0, 0.99, 0])), true);
  assert.equal(pigState.incidents.livestockEpidemic.group, 'pig',
    'the smaller group remains reachable rather than being excluded outright');
}

{
  const state = simulation.newGame(2026072910, 'normal', '처분촌');
  const cattleStable = stable(101, 'cattle', 2);
  const field = { id: 102, type: 'field', x: 6, y: 4, built: true, progress: 10, fieldGrowth: 0, plowOxen: 2 };
  state.buildings = [cattleStable, field];
  startLivestockEpidemic(state, 'ruminant', cattleStable.id);
  state.incidents.livestockEpidemic.mode = 'pending';
  state.pendingChoice = { kind: 'incident', title: '우역', body: '', options: [], data: { eventId: 'livestockEpidemic' } };

  specialEvents.resolveSpecialEvent(state, 'cull-livestock', () => 0.5);
  assert.equal(state.incidents.livestockEpidemic, null, 'culling must immediately end the epidemic');
  assert.equal(cattleStable.livestock.headcount, 1, 'culling uses the configured half-herd ratio');
  assert.equal(cattleStable.inventory.meat, CONFIG.livestock.cattle.slaughterMeatPerHead,
    'culling must reuse normal slaughter meat output');
  assert.equal(cattleStable.inventory.hide, CONFIG.livestock.cattle.slaughterHidePerHead,
    'culling must reuse normal slaughter hide output');
  assert.equal(field.plowOxen, 1, 'lost cattle must release excess plow-ox assignments');
}

{
  const state = simulation.newGame(2026072911, 'normal', '전염촌');
  const cattleStable = stable(101, 'cattle', 3);
  const sheepStable = stable(102, 'sheep', 3);
  const pigStable = stable(103, 'pig', 3);
  state.buildings = [cattleStable, sheepStable, pigStable];
  startLivestockEpidemic(state, 'ruminant', cattleStable.id);
  const oldDeath = CONFIG.disasters.livestockEpidemic.dailyDeathChance;
  const oldSpread = CONFIG.disasters.livestockEpidemic.spreadChance;
  const oldRecovery = CONFIG.disasters.livestockEpidemic.recoveryChance;
  const oldMinimum = CONFIG.disasters.livestockEpidemic.minimumRecoveryDays;
  CONFIG.disasters.livestockEpidemic.dailyDeathChance = 0;
  CONFIG.disasters.livestockEpidemic.spreadChance = 1;
  CONFIG.disasters.livestockEpidemic.recoveryChance = 0;
  CONFIG.disasters.livestockEpidemic.minimumRecoveryDays = 99;

  specialEvents.updateSpecialEvents(state, sequenceRng([1, 1, 1, 0, 0], 1));
  CONFIG.disasters.livestockEpidemic.dailyDeathChance = oldDeath;
  CONFIG.disasters.livestockEpidemic.spreadChance = oldSpread;
  CONFIG.disasters.livestockEpidemic.recoveryChance = oldRecovery;
  CONFIG.disasters.livestockEpidemic.minimumRecoveryDays = oldMinimum;
  assert.ok(state.incidents.livestockEpidemic.infectedStableIds.includes(sheepStable.id),
    'rinderpest must spread to another ruminant stable');
  assert.ok(!state.incidents.livestockEpidemic.infectedStableIds.includes(pigStable.id),
    'rinderpest must not spread to a pig stable');
}

{
  const state = simulation.newGame(2026072912, 'normal', '목동촌');
  const firstStable = stable(101, 'pig', 3);
  const secondStable = stable(102, 'pig', 3);
  state.buildings = [firstStable, secondStable];
  const herder = state.residents[0];
  Object.assign(herder, { alive: true, sick: false, job: 'herder', assignedBuildingId: firstStable.id, quarantinedUntil: 0 });
  startLivestockEpidemic(state, 'pig', firstStable.id);
  const oldDeath = CONFIG.disasters.livestockEpidemic.dailyDeathChance;
  const oldSpread = CONFIG.disasters.livestockEpidemic.spreadChance;
  const oldHerderSpread = CONFIG.disasters.livestockEpidemic.herderSpreadMultiplier;
  const oldRecovery = CONFIG.disasters.livestockEpidemic.recoveryChance;
  const oldMinimum = CONFIG.disasters.livestockEpidemic.minimumRecoveryDays;
  CONFIG.disasters.livestockEpidemic.dailyDeathChance = 0;
  CONFIG.disasters.livestockEpidemic.spreadChance = 1;
  CONFIG.disasters.livestockEpidemic.herderSpreadMultiplier = 0;
  CONFIG.disasters.livestockEpidemic.recoveryChance = 0;
  CONFIG.disasters.livestockEpidemic.minimumRecoveryDays = 99;

  specialEvents.updateSpecialEvents(state, () => 0);
  CONFIG.disasters.livestockEpidemic.dailyDeathChance = oldDeath;
  CONFIG.disasters.livestockEpidemic.spreadChance = oldSpread;
  CONFIG.disasters.livestockEpidemic.herderSpreadMultiplier = oldHerderSpread;
  CONFIG.disasters.livestockEpidemic.recoveryChance = oldRecovery;
  CONFIG.disasters.livestockEpidemic.minimumRecoveryDays = oldMinimum;
  assert.equal(state.incidents.livestockEpidemic.infectedStableIds.includes(secondStable.id), false,
    'an assigned herder must apply the isolation spread reduction');
}

{
  const state = simulation.newGame(2026072913, 'normal', '구저장축사');
  delete state.incidents.livestockEpidemic;
  specialEvents.ensureIncidentState(state);
  assert.equal(state.incidents.livestockEpidemic, null, 'older saves must receive an empty livestock epidemic state');
}

console.log('livestock epidemic checks passed');
