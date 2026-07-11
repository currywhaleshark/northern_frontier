import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-trade-autoplay-'));
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

function optionNumber(name, fallback) {
  const prefix = `--${name}=`;
  const raw = process.argv.find(arg => arg.startsWith(prefix))?.slice(prefix.length);
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const runs = optionNumber('runs', 80);
const maxYears = optionNumber('years', 10);
const seedBase = optionNumber('seed', 2026071100);
const trace = process.argv.includes('--trace');
const requestedModes = process.argv.find(arg => arg.startsWith('--modes='))
  ?.slice('--modes='.length)
  .split(',')
  .filter(mode => ['none', 'passive', 'active'].includes(mode));
const compiledDir = compileGameModules();
const load = name => import(pathToFileURL(join(compiledDir, `${name}.mjs`)).href);

const simulation = await load('simulation');
const buildings = await load('buildings');
const events = await load('events');
const tradeValues = await load('tradeValues');
const consumption = await load('consumption');
const residents = await load('residents');
const workerSlots = await load('workerSlots');
const tributeReserve = await load('tributeReserve');
const relations = await load('relations');
const { CONFIG } = await load('config');
const { FACTIONS } = await load('constants');

const ordinaryFactions = FACTIONS.filter(faction => faction.trades.length > 0);
const maxDay = CONFIG.time.yearDays * maxYears + 1;

function builtCount(state, type) {
  return state.buildings.filter(building => building.type === type && building.built).length;
}

function plannedCount(state, type) {
  return state.buildings.filter(building => building.type === type).length;
}

function living(state) {
  return residents.livingResidents(state);
}

function housingCapacity(state) {
  return state.buildings
    .filter(building => building.built)
    .reduce((sum, building) => sum + buildings.BUILDING_DEFS[building.type].capacity, 0);
}

function foodDays(state) {
  const pop = living(state).length;
  return pop > 0 ? consumption.foodTotal(state) / (pop * CONFIG.needs.foodPerDay) : 0;
}

function fuelDays(state) {
  const pop = living(state).length;
  return pop > 0 ? consumption.fuelHeatTotal(state) / (pop * CONFIG.needs.firewoodPerPerson) : 0;
}

function clothingTotal(state) {
  return consumption.clothingCoverageTotal(state);
}

function activeConstructionCount(state) {
  return state.buildings.filter(building => !building.built).length;
}

function placementCandidates(state) {
  const center = state.buildings.find(building => building.type === 'center');
  const cx = center?.x ?? Math.floor(state.map[0].length / 2);
  const cy = center?.y ?? Math.floor(state.map.length / 2);
  const candidates = [];
  for (let y = 0; y < state.map.length; y++) {
    for (let x = 0; x < state.map[y].length; x++) {
      candidates.push({ x, y, distance: Math.abs(x - cx) + Math.abs(y - cy) });
    }
  }
  candidates.sort((a, b) => a.distance - b.distance || a.y - b.y || a.x - b.x);
  return candidates;
}

function tryQueueBuilding(state, type, desired, candidates) {
  if (plannedCount(state, type) >= desired) return false;
  const def = buildings.BUILDING_DEFS[type];
  if (!buildings.canAfford(state, def)) return false;
  const coreBuilding = ['field', 'woodShed', 'market', 'lumberCamp', 'huntLodge', 'herbHut'].includes(type);
  const woodCost = def.cost.wood ?? 0;
  const fuelReserveWood = Math.max(24, living(state).length * 2.5);
  if (!coreBuilding && fuelDays(state) < 50 && state.resources.wood - woodCost < fuelReserveWood) return false;
  for (const { x, y } of candidates) {
    if (simulation.tryPlaceBuilding(state, type, x, y) == null) return true;
  }
  return false;
}

function constructionPlan(state) {
  const pop = living(state).length;
  const capacity = housingCapacity(state);
  const fields = Math.min(8, Math.max(3, Math.ceil(pop / 4)));
  const huts = Math.max(2, Math.ceil((pop + 6 - buildings.BUILDING_DEFS.center.capacity) /
    buildings.BUILDING_DEFS.hut.capacity));
  const targets = [
    ['field', fields],
    ['woodShed', 1],
    ['market', 1],
    ['lumberCamp', 1],
    ['huntLodge', 1],
    ['herbHut', 1],
    ['hut', capacity < pop + 6 ? huts : plannedCount(state, 'hut')],
    ['storehouse', 1],
    ['smithy', 1],
    ['tannery', 1],
    ['beacon', 1],
    ['watchtower', 4],
    ['garrison', 1],
    ['palisade', 14],
  ];

  if (state.rank !== 'settlement') {
    targets.push(
      ['paddy', Math.min(4, Math.max(2, Math.ceil(pop / 14)))],
      ['mine', 1],
      ['ferry', 1],
      ['watermill', 1],
      ['weavingHouse', 1],
      ['ondol', Math.max(2, Math.ceil(pop / 15))],
    );
  }
  if (state.rank === 'jin' || state.rank === 'bu') {
    targets.push(['charcoalKiln', 1], ['stable', 1], ['earthFort', 8]);
  }
  if (state.rank === 'bu') {
    targets.push(['dock', 1], ['office', 1], ['stoneWall', 8]);
  }
  return targets;
}

function manageConstruction(state, candidates) {
  let freeSlots = Math.max(0, 2 - activeConstructionCount(state));
  if (freeSlots === 0) return;
  for (const [type, desired] of constructionPlan(state)) {
    if (freeSlots === 0) break;
    if (tryQueueBuilding(state, type, desired, candidates)) freeSlots--;
  }
}

function jobTargets(state) {
  const pop = living(state).length;
  const season = simulation.getSeason(state.day);
  const sites = activeConstructionCount(state);
  const fields = builtCount(state, 'field') + builtCount(state, 'paddy');
  const targets = [];
  const add = (job, count) => {
    for (let i = 0; i < Math.max(0, count); i++) targets.push(job);
  };

  add('farmer', Math.min(fields, Math.max(2, Math.ceil(pop * 0.2))));
  add('woodSplitter', builtCount(state, 'woodShed') > 0
    ? Math.min(2, fuelDays(state) < (season === 'winter' ? 28 : 45) ? 2 : 1)
    : 0);
  add('smith', builtCount(state, 'smithy') > 0 && state.resources.tools < Math.max(8, pop / 2) ? 1 : 0);
  add('builder', sites > 0 ? (pop >= 16 ? 2 : 1) : 0);
  add('hunter', Math.max(foodDays(state) < 20 ? 2 : 1, Math.floor(pop * 0.12)));
  add('woodcutter', Math.max(2, Math.floor(pop * 0.15)));
  add('hauler', Math.max(1, Math.floor(pop / 10)));
  add('herbalist', builtCount(state, 'herbHut') > 0 ? Math.max(1, Math.floor(pop / 22)) : 1);
  add('watchman', Math.max(1, Math.floor(pop / 12)));
  add('tanner', builtCount(state, 'tannery') > 0 && clothingTotal(state) < pop * 1.1 ? 1 : 0);
  add('fisher', builtCount(state, 'ferry') > 0 ? Math.max(1, Math.floor(pop / 20)) : 0);
  add('miner', builtCount(state, 'mine') > 0 ? Math.max(1, Math.floor(pop / 18)) : 0);
  add('miller', builtCount(state, 'watermill') > 0 && state.resources.rice > 2 ? 1 : 0);
  add('charcoalBurner', builtCount(state, 'charcoalKiln') > 0 && fuelDays(state) < 45 ? 1 : 0);
  add('herder', builtCount(state, 'stable') > 0 ? 1 : 0);
  add('weaver', builtCount(state, 'weavingHouse') > 0 && state.resources.cotton > 1 ? 1 : 0);

  while (targets.length < pop) {
    const index = targets.length % 4;
    targets.push(index === 0 ? 'woodcutter' : index < 3 ? 'hunter' : 'watchman');
  }
  return targets.slice(0, pop);
}

function rebalanceJobs(state) {
  const people = living(state).sort((a, b) => a.id - b.id);
  const targets = jobTargets(state);
  for (let i = 0; i < people.length; i++) {
    if (people[i].job !== targets[i]) simulation.setResidentJob(state, people[i].id, targets[i]);
  }
  for (const building of state.buildings.filter(candidate => candidate.built)) {
    workerSlots.autoAssignWorkersToBuilding(state, building.id);
  }
}

function resourceFloor(state, resource) {
  const pop = living(state).length;
  if (['grain', 'rice', 'meat', 'fish', 'vegetables'].includes(resource)) return pop * 10;
  if (['brushwood', 'firewood', 'charcoal'].includes(resource)) return pop * 7;
  const defenseIncomplete = builtCount(state, 'beacon') === 0 || builtCount(state, 'garrison') === 0;
  const economyIncomplete = builtCount(state, 'smithy') === 0 || builtCount(state, 'tannery') === 0;
  if (resource === 'wood') return defenseIncomplete || economyIncomplete ? 40 : 24;
  if (resource === 'stone') return defenseIncomplete ? 26 : economyIncomplete ? 10 : 6;
  if (resource === 'iron') return builtCount(state, 'garrison') === 0 ? 6 : 3;
  if (resource === 'tools') return plannedCount(state, 'field') < Math.max(3, Math.ceil(pop / 4)) ? 8 : 5;
  if (resource === 'hide') return builtCount(state, 'tannery') === 0 ? 10 : 6;
  if (resource === 'herbs') return 5;
  if (resource === 'hideClothes' || resource === 'cottonClothes') return pop;
  return 0;
}

function canGive(state, resource, amount) {
  if ((state.resources[resource] ?? 0) < amount) return false;
  if (['grain', 'rice', 'meat', 'fish', 'vegetables'].includes(resource)) {
    return consumption.foodTotal(state) - amount >= resourceFloor(state, resource);
  }
  if (['brushwood', 'firewood', 'charcoal'].includes(resource)) {
    const heat = resource === 'brushwood' ? 0.6 : resource === 'charcoal' ? 1.5 : 1;
    return consumption.fuelHeatTotal(state) - amount * heat >= resourceFloor(state, resource);
  }
  if (resource === 'hideClothes' || resource === 'cottonClothes') {
    return clothingTotal(state) - amount >= living(state).length;
  }
  return (state.resources[resource] ?? 0) - amount >= resourceFloor(state, resource);
}

function tributeNeed(state) {
  const tribute = state.courtTribute;
  if (!tribute || tribute.resolved) return null;
  const season = simulation.getSeason(state.day);
  if (season !== 'autumn' && season !== 'summer') return null;
  for (const [resource, required] of Object.entries(tribute.items)) {
    const reserved = tributeReserve.tributeReserved(state, resource);
    if (reserved < required) return { resource, amount: Math.max(1, Math.ceil(required - reserved)) };
  }
  return null;
}

function chooseTradeTarget(state, excluded = null) {
  const pop = living(state).length;
  const season = simulation.getSeason(state.day);
  const tribute = tributeNeed(state);
  const targets = [];
  if (tribute) targets.push(tribute);
  if (fuelDays(state) < 18) targets.push({ resource: 'firewood', amount: Math.ceil(pop * 1.2) });
  if (foodDays(state) < 18) targets.push({ resource: 'grain', amount: Math.ceil(pop * 0.8) });
  if ((season === 'autumn' || season === 'winter') && fuelDays(state) < 32) {
    targets.push({ resource: 'firewood', amount: Math.ceil(pop * 0.8) });
  }
  if (state.resources.tools < 5) targets.push({ resource: 'tools', amount: 3 });
  if (clothingTotal(state) < pop) targets.push({ resource: 'hideClothes', amount: Math.max(2, Math.ceil(pop * 0.2)) });
  if (state.resources.stone < 8) targets.push({ resource: 'stone', amount: 6 });
  if (state.resources.iron < 4) targets.push({ resource: 'iron', amount: 3 });
  if (foodDays(state) < 30 && state.resources.vegetables < pop * 2) {
    targets.push({ resource: 'vegetables', amount: Math.max(4, Math.ceil(pop * 0.5)) });
  }
  if (fuelDays(state) < 50) targets.push({ resource: 'brushwood', amount: Math.ceil(pop * 0.7) });
  return targets.find(target => target.resource !== excluded) ?? null;
}

function recordTrade(metrics, negotiation) {
  metrics.trades++;
  if (negotiation.initiatedBy === 'player') metrics.proactiveTrades++;
  else metrics.incomingTrades++;
  metrics.received[negotiation.get] = (metrics.received[negotiation.get] ?? 0) + negotiation.getAmt;
  metrics.given[negotiation.give] = (metrics.given[negotiation.give] ?? 0) + negotiation.giveAmt;
}

function tryProactiveTrade(state, metrics) {
  const target = chooseTradeTarget(state);
  if (!target) return false;
  let best = null;
  for (const faction of ordinaryFactions) {
    if (events.canRequestTrade(state, faction.name)) continue;
    const capacity = tradeValues.factionTradeCapacity(state, faction.name, target.resource);
    for (let amount = Math.min(target.amount, capacity); amount >= 1; amount--) {
      const quote = tradeValues.quoteFactionDemand(state, faction.name, target.resource, amount);
      if (!quote.ok || !canGive(state, quote.give, quote.giveAmt)) continue;
      const burden = quote.giveAmt / Math.max(1, state.resources[quote.give]);
      if (!best || burden < best.burden) best = { faction: faction.name, amount, burden };
      break;
    }
  }
  if (!best || events.requestTrade(state, best.faction)) return false;
  events.negotiateTrade(state, target.resource, best.amount);
  events.negotiateTrade(state, target.resource, best.amount);
  const negotiation = events.tradeNegotiationOf(state.pendingChoice);
  if (!negotiation || !negotiation.give || !negotiation.get || !canGive(state, negotiation.give, negotiation.giveAmt)) {
    simulation.resolveChoice(state, 'break');
    return false;
  }
  recordTrade(metrics, negotiation);
  simulation.resolveChoice(state, 'confirm');
  return true;
}

function handleIncomingTrade(state, metrics) {
  const negotiation = events.tradeNegotiationOf(state.pendingChoice);
  if (!negotiation || negotiation.initiatedBy !== 'faction' || !negotiation.give) return false;
  if (!canGive(state, negotiation.give, negotiation.giveAmt)) {
    simulation.resolveChoice(state, 'break');
    return true;
  }
  const target = chooseTradeTarget(state, negotiation.give) ?? { resource: 'grain', amount: 4 };
  const capacity = tradeValues.factionTradeCapacity(state, negotiation.faction, target.resource);
  const giveValue = tradeValues.factionValue(negotiation.faction, negotiation.give);
  const getValue = tradeValues.factionValue(negotiation.faction, target.resource);
  const margin = tradeValues.relationMargin(relations.getRelation(state, negotiation.faction));
  const fairAmount = Math.floor((negotiation.giveAmt * giveValue) / Math.max(0.01, getValue * margin));
  const amount = Math.min(target.amount, capacity, fairAmount);
  if (amount < 1) {
    simulation.resolveChoice(state, 'break');
    return true;
  }
  events.negotiateTrade(state, target.resource, amount);
  const updated = events.tradeNegotiationOf(state.pendingChoice);
  if (!updated || !updated.give || !updated.get || updated.phase === 'rejected' || !canGive(state, updated.give, updated.giveAmt)) {
    simulation.resolveChoice(state, 'break');
    return true;
  }
  recordTrade(metrics, updated);
  simulation.resolveChoice(state, 'confirm');
  return true;
}

function reserveForTribute(state) {
  const tribute = state.courtTribute;
  if (!tribute || tribute.resolved) return;
  for (const [resource, required] of Object.entries(tribute.items)) {
    const current = tributeReserve.tributeReserved(state, resource);
    if (current >= required) continue;
    let spare;
    if (['grain', 'rice', 'meat', 'fish', 'vegetables'].includes(resource)) {
      spare = Math.max(0, Math.floor(consumption.foodTotal(state) - living(state).length * 12));
    } else {
      spare = Math.max(0, Math.floor((state.resources[resource] ?? 0) - resourceFloor(state, resource)));
    }
    if (spare > 0) tributeReserve.setTributeReserve(state, resource, Math.min(required, current + spare));
  }
}

function firstEnabledOption(choice, preferred) {
  for (const id of preferred) {
    const option = choice.options.find(candidate => candidate.id === id);
    if (option && !option.disabled) return id;
  }
  return choice.options.find(option => !option.disabled)?.id;
}

function handleChoice(state, mode, metrics) {
  const choice = state.pendingChoice;
  if (!choice) return;
  if (choice.kind === 'trade') {
    if (mode !== 'none' && handleIncomingTrade(state, metrics)) return;
    simulation.resolveChoice(state, 'break');
    return;
  }
  if (choice.kind === 'immigration') {
    const count = Number(choice.data.count) || 0;
    const canHouse = housingCapacity(state) >= living(state).length + count;
    const canFeed = consumption.foodTotal(state) >= (living(state).length + count) * 7;
    const accept = canHouse && canFeed;
    metrics[accept ? 'immigrantsAccepted' : 'immigrantsRejected'] += count;
    simulation.resolveChoice(state, accept ? 'accept' : 'reject');
    return;
  }
  if (choice.kind === 'extortion') {
    const negotiation = events.tradeNegotiationOf(choice);
    const pay = negotiation?.give && (state.resources[negotiation.give] ?? 0) >= negotiation.giveAmt;
    metrics.extortions++;
    simulation.resolveChoice(state, pay ? 'pay' : 'refuse');
    return;
  }
  if (choice.kind === 'raid') {
    metrics.raids++;
    const power = Number(choice.data.power) || 0;
    const defense = state.resources.defense + living(state).length * CONFIG.raid.levyDefensePerResident;
    const preferred = builtCount(state, 'beacon') > 0 && consumption.fuelHeatTotal(state) > living(state).length * 8
      ? ['beacon', 'militia', 'levy', 'shelter']
      : defense >= power * 1.2
        ? ['militia', 'levy', 'tribute', 'shelter']
        : ['tribute', 'shelter', 'levy'];
    simulation.resolveChoice(state, firstEnabledOption(choice, preferred));
    return;
  }
  if (choice.kind === 'tribute') {
    const option = firstEnabledOption(choice, ['pay-full', 'pay-partial', 'refuse']);
    metrics.tributes[option] = (metrics.tributes[option] ?? 0) + 1;
    simulation.resolveChoice(state, option);
    return;
  }
  if (choice.kind === 'inspection') {
    simulation.resolveChoice(state, firstEnabledOption(choice, ['honest', 'hide', 'bribe']));
    return;
  }
  if (choice.kind === 'crackdown') {
    simulation.resolveChoice(state, firstEnabledOption(choice, ['surrender', 'fight']));
    return;
  }
  simulation.resolveChoice(state, firstEnabledOption(choice, ['cancel']));
}

function emptyMetrics() {
  return {
    trades: 0,
    proactiveTrades: 0,
    incomingTrades: 0,
    received: {},
    given: {},
    raids: 0,
    extortions: 0,
    immigrantsAccepted: 0,
    immigrantsRejected: 0,
    tributes: {},
    minFoodDays: Infinity,
    minFuelDays: Infinity,
    victoryDay: null,
  };
}

function runOne(seed, mode) {
  const state = simulation.newGame(seed, 'normal');
  const metrics = emptyMetrics();
  const candidates = placementCandidates(state);
  let lastPopulation = living(state).length;
  let lastBuilt = state.buildings.filter(building => building.built).length;
  const snapshots = [];

  while (state.day < maxDay) {
    if (state.gameOver) {
      if (!state.gameOver.won) break;
      metrics.victoryDay ??= state.day;
      simulation.continueAfterVictory(state);
    }
    let guard = 0;
    while (state.pendingChoice && guard++ < 4) handleChoice(state, mode, metrics);
    reserveForTribute(state);
    manageConstruction(state, candidates);

    const currentPopulation = living(state).length;
    const currentBuilt = state.buildings.filter(building => building.built).length;
    if (state.day % 3 === 1 || currentPopulation !== lastPopulation || currentBuilt !== lastBuilt) {
      rebalanceJobs(state);
      lastPopulation = currentPopulation;
      lastBuilt = currentBuilt;
    }

    if (mode === 'active' && !state.pendingChoice && !state.battle && state.day % 2 === 0) {
      tryProactiveTrade(state, metrics);
    }
    while (state.pendingChoice && guard++ < 8) handleChoice(state, mode, metrics);

    metrics.minFoodDays = Math.min(metrics.minFoodDays, foodDays(state));
    metrics.minFuelDays = Math.min(metrics.minFuelDays, fuelDays(state));
    if (trace && seed === seedBase && (state.day === 1 || simulation.getDayOfSeason(state.day) === 1)) {
      snapshots.push({
        day: state.day,
        year: simulation.getYear(state.day),
        season: simulation.getSeason(state.day),
        population: living(state).length,
        food: Math.floor(consumption.foodTotal(state)),
        foodDays: Number(foodDays(state).toFixed(1)),
        fuel: Math.floor(consumption.fuelHeatTotal(state)),
        fuelDays: Number(fuelDays(state).toFixed(1)),
        wood: Math.floor(state.resources.wood),
        tools: Math.floor(state.resources.tools),
        clothing: Math.floor(clothingTotal(state)),
        defense: Math.floor(state.resources.defense),
        trades: metrics.trades,
        jobs: Object.fromEntries(Object.entries(living(state).reduce((bag, resident) => {
          bag[resident.job] = (bag[resident.job] ?? 0) + 1;
          return bag;
        }, {})).sort()),
        buildings: Object.fromEntries(Object.entries(state.buildings.reduce((bag, building) => {
          if (building.built) bag[building.type] = (bag[building.type] ?? 0) + 1;
          return bag;
        }, {})).sort()),
      });
    }
    simulation.advanceDay(state);
  }

  return {
    seed,
    mode,
    survivedDays: Math.min(state.day - 1, maxDay - 1),
    years: Math.min(state.day - 1, maxDay - 1) / CONFIG.time.yearDays,
    censored: !state.gameOver || Boolean(state.gameOver?.won),
    won: metrics.victoryDay != null,
    reason: state.gameOver?.reason ?? '기간 종료까지 생존',
    population: living(state).length,
    deaths: state.totalDeaths,
    rank: state.rank,
    food: Math.floor(consumption.foodTotal(state)),
    fuel: Math.floor(consumption.fuelHeatTotal(state)),
    defense: Math.floor(state.resources.defense),
    reputation: Math.floor(state.resources.reputation),
    ...metrics,
    snapshots,
    minFoodDays: Number.isFinite(metrics.minFoodDays) ? metrics.minFoodDays : 0,
    minFuelDays: Number.isFinite(metrics.minFuelDays) ? metrics.minFuelDays : 0,
  };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p))];
}

function sumBags(results, key) {
  const total = {};
  for (const result of results) {
    for (const [resource, amount] of Object.entries(result[key])) {
      total[resource] = (total[resource] ?? 0) + amount;
    }
  }
  return Object.fromEntries(Object.entries(total).sort((a, b) => b[1] - a[1]));
}

function summarize(mode, results) {
  const failures = results.filter(result => !result.censored);
  const years = results.map(result => result.years);
  const reasons = {};
  const ranks = {};
  for (const result of results) {
    ranks[result.rank] = (ranks[result.rank] ?? 0) + 1;
    if (!result.censored) reasons[result.reason] = (reasons[result.reason] ?? 0) + 1;
  }
  return {
    mode,
    runs: results.length,
    maxYears,
    survivalRate: 1 - failures.length / results.length,
    winRate: results.filter(result => result.won).length / results.length,
    meanObservedYears: years.reduce((sum, value) => sum + value, 0) / years.length,
    p10Years: percentile(years, 0.1),
    medianYears: percentile(years, 0.5),
    p90Years: percentile(years, 0.9),
    meanPopulation: results.reduce((sum, result) => sum + result.population, 0) / results.length,
    meanDeaths: results.reduce((sum, result) => sum + result.deaths, 0) / results.length,
    meanTrades: results.reduce((sum, result) => sum + result.trades, 0) / results.length,
    meanProactiveTrades: results.reduce((sum, result) => sum + result.proactiveTrades, 0) / results.length,
    meanRaids: results.reduce((sum, result) => sum + result.raids, 0) / results.length,
    meanExtortions: results.reduce((sum, result) => sum + result.extortions, 0) / results.length,
    meanImmigrantsAccepted: results.reduce((sum, result) => sum + result.immigrantsAccepted, 0) / results.length,
    meanImmigrantsRejected: results.reduce((sum, result) => sum + result.immigrantsRejected, 0) / results.length,
    meanMinFoodDays: results.reduce((sum, result) => sum + result.minFoodDays, 0) / results.length,
    meanMinFuelDays: results.reduce((sum, result) => sum + result.minFuelDays, 0) / results.length,
    ranks,
    failureReasons: reasons,
    censoredSeeds: results.filter(result => result.censored).map(result => result.seed),
    received: sumBags(results, 'received'),
    given: sumBags(results, 'given'),
  };
}

const modes = requestedModes?.length ? requestedModes : ['passive', 'active'];
const allResults = {};
for (const mode of modes) {
  const results = [];
  for (let i = 0; i < runs; i++) results.push(runOne(seedBase + i, mode));
  allResults[mode] = results;
  console.log(JSON.stringify(summarize(mode, results), null, 2));
}

const interesting = (allResults.active ?? [])
  .filter(result => !result.censored)
  .sort((a, b) => a.survivedDays - b.survivedDays)
  .slice(0, 5)
  .map(result => ({
    seed: result.seed,
    years: result.years,
    reason: result.reason,
    population: result.population,
    deaths: result.deaths,
    trades: result.trades,
    raids: result.raids,
    minFoodDays: result.minFoodDays,
    minFuelDays: result.minFuelDays,
  }));
console.log(JSON.stringify({ activeEarlyFailures: interesting }, null, 2));
if (trace) {
  console.log(JSON.stringify({
    passiveTrace: allResults.passive?.[0],
    activeTrace: allResults.active?.[0],
  }, null, 2));
}
