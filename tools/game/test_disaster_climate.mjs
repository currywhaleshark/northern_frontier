import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-disaster-climate-tests-'));
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

function sequenceRng(values, fallback = 0.5) {
  let index = 0;
  const rng = () => {
    rng.calls += 1;
    return values[index++] ?? fallback;
  };
  rng.calls = 0;
  return rng;
}

const compiledDir = compileGameModules();
const climate = await import(pathToFileURL(join(compiledDir, 'climate.mjs')).href);
const disasters = await import(pathToFileURL(join(compiledDir, 'disasterClimate.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const specialEvents = await import(pathToFileURL(join(compiledDir, 'specialEvents.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const normal = { temperatureAnomaly: 0, precipitationAnomaly: 0, storminess: 0 };
const veryCold = { ...normal, temperatureAnomaly: -1 };
const veryWarm = { ...normal, temperatureAnomaly: 1 };

assert.equal(
  disasters.disasterOccurrenceWeightForClimate(normal, 'earlyFrost'),
  CONFIG.disasters.earlyFrost.occurrenceBaseWeight,
);
assert.equal(
  disasters.disasterChoiceChanceForClimate(normal, 'earlyFrost', 'wait-harvest'),
  CONFIG.disasters.earlyFrost.waitHarvestBaseClearChance,
);
assert.ok(
  disasters.disasterOccurrenceWeightForClimate(veryCold, 'earlyFrost') >
    disasters.disasterOccurrenceWeightForClimate(veryWarm, 'earlyFrost'),
  'early frost must be more likely in colder years',
);
assert.ok(
  disasters.disasterChoiceChanceForClimate(veryCold, 'earlyFrost', 'wait-harvest') <
    disasters.disasterChoiceChanceForClimate(veryWarm, 'earlyFrost', 'wait-harvest'),
  'early frost must be less likely to clear in colder years',
);

const extremeCold = { temperatureAnomaly: -100, precipitationAnomaly: 0, storminess: 0 };
const extremeWarm = { temperatureAnomaly: 100, precipitationAnomaly: 0, storminess: 0 };
assert.equal(
  disasters.disasterChoiceChanceForClimate(extremeCold, 'earlyFrost', 'wait-harvest'),
  CONFIG.disasters.earlyFrost.waitHarvestMinClearChance,
);
assert.equal(
  disasters.disasterChoiceChanceForClimate(extremeWarm, 'earlyFrost', 'wait-harvest'),
  CONFIG.disasters.earlyFrost.waitHarvestMaxClearChance,
);
assert.equal(
  disasters.disasterOccurrenceWeightForClimate(extremeCold, 'earlyFrost'),
  CONFIG.disasters.earlyFrost.occurrenceBaseWeight *
    CONFIG.disasters.earlyFrost.occurrenceMaxMultiplier,
);
assert.equal(
  disasters.disasterOccurrenceWeightForClimate(extremeWarm, 'earlyFrost'),
  CONFIG.disasters.earlyFrost.occurrenceBaseWeight *
    CONFIG.disasters.earlyFrost.occurrenceMinMultiplier,
);

for (const axis of ['temperatureAnomaly', 'precipitationAnomaly', 'storminess']) {
  const low = { ...normal, [axis]: -1 };
  const high = { ...normal, [axis]: 1 };
  assert.ok(
    disasters.disasterOccurrenceWeightForClimate(low, 'plagueSuspicion') <
      disasters.disasterOccurrenceWeightForClimate(high, 'plagueSuspicion'),
    `plague occurrence must rise with ${axis}`,
  );
  assert.ok(
    disasters.disasterChoiceChanceForClimate(low, 'plagueSuspicion', 'real-case') <
      disasters.disasterChoiceChanceForClimate(high, 'plagueSuspicion', 'real-case'),
    `real plague chance must rise with ${axis}`,
  );
}

const plagueExtremeLow = { temperatureAnomaly: -100, precipitationAnomaly: -100, storminess: -100 };
const plagueExtremeHigh = { temperatureAnomaly: 100, precipitationAnomaly: 100, storminess: 100 };
assert.equal(
  disasters.disasterChoiceChanceForClimate(plagueExtremeLow, 'plagueSuspicion', 'real-case'),
  CONFIG.disasters.plagueSuspicion.realMinChance,
);
assert.equal(
  disasters.disasterChoiceChanceForClimate(plagueExtremeHigh, 'plagueSuspicion', 'real-case'),
  CONFIG.disasters.plagueSuspicion.realMaxChance,
);
assert.equal(
  disasters.disasterOccurrenceWeightForClimate(plagueExtremeLow, 'plagueSuspicion'),
  CONFIG.disasters.plagueSuspicion.occurrenceBaseWeight *
    CONFIG.disasters.plagueSuspicion.occurrenceMinMultiplier,
);
assert.equal(
  disasters.disasterOccurrenceWeightForClimate(plagueExtremeHigh, 'plagueSuspicion'),
  CONFIG.disasters.plagueSuspicion.occurrenceBaseWeight *
    CONFIG.disasters.plagueSuspicion.occurrenceMaxMultiplier,
);

const deterministicState = simulation.newGame(20260728);
deterministicState.day = 15;
const firstFrostWeight = disasters.disasterOccurrenceWeight(deterministicState, 'earlyFrost');
assert.equal(disasters.disasterOccurrenceWeight(deterministicState, 'earlyFrost'), firstFrostWeight);
assert.equal(
  disasters.disasterChoiceChance(deterministicState, 'earlyFrost', 'wait-harvest'),
  disasters.disasterChoiceChance(deterministicState, 'earlyFrost', 'wait-harvest'),
);
deterministicState.day += CONFIG.time.yearDays;
assert.ok(
  firstFrostWeight !== disasters.disasterOccurrenceWeight(deterministicState, 'earlyFrost') ||
    disasters.disasterChoiceChance(
      { ...deterministicState, day: deterministicState.day - CONFIG.time.yearDays },
      'plagueSuspicion',
      'real-case',
    ) !== disasters.disasterChoiceChance(deterministicState, 'plagueSuspicion', 'real-case'),
  'a new year must vary at least one disaster probability',
);

let earlyFrostChanceTotal = 0;
const sampleCount = 5000;
for (let seed = 1; seed <= sampleCount; seed++) {
  const state = { seed, day: 15 };
  const chance = disasters.disasterChoiceChance(state, 'earlyFrost', 'wait-harvest');
  assert.ok(chance >= 0.42 && chance <= 0.72);
  earlyFrostChanceTotal += chance;
}
assert.ok(
  Math.abs(earlyFrostChanceTotal / sampleCount - 0.57) < 0.005,
  'mean early-frost clear chance must remain approximately 57%',
);

function addStandingFarm(state) {
  const farm = {
    id: state.nextBuildingId++,
    type: 'field',
    x: 1,
    y: 1,
    built: true,
    progress: 1,
    fieldGrowth: 80,
    sownArea: 1,
    cropId: 'millet',
    inventory: {},
  };
  state.buildings.push(farm);
  return farm;
}

const selectableEventIds = [
  'wolf', 'tiger', 'boar', 'wildGinseng', 'plagueSuspicion',
  'grainRequisition', 'shipwreck', 'earlyFrost', 'gyrfalcon',
];

function prepareEvents(state, allowed) {
  state.day = 15;
  state.incidents.year = 1;
  state.incidents.scheduledDays = [state.day];
  state.incidents.cooldownUntil = Object.fromEntries(
    selectableEventIds.filter(id => !allowed.includes(id)).map(id => [id, 9999]),
  );
}

// 후보 통합: grainRequisition(가중치 2) 다음에 earlyFrost가 오므로 경계 양쪽을 확인한다.
{
  const state = simulation.newGame(31001);
  addStandingFarm(state);
  prepareEvents(state, ['grainRequisition', 'earlyFrost']);
  const frostWeight = disasters.disasterOccurrenceWeight(state, 'earlyFrost');
  const boundary = CONFIG.specialEvents.grainRequisitionWeight /
    (CONFIG.specialEvents.grainRequisitionWeight + frostWeight);
  const rng = sequenceRng([boundary + 1e-6, 0]);
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, rng), true);
  assert.equal(state.pendingChoice?.data.eventId, 'earlyFrost');
  assert.equal(rng.calls, 2, 'selection and farm choice must keep the existing two RNG calls');
}

{
  const state = simulation.newGame(31001);
  addStandingFarm(state);
  prepareEvents(state, ['grainRequisition', 'earlyFrost']);
  const frostWeight = disasters.disasterOccurrenceWeight(state, 'earlyFrost');
  const boundary = CONFIG.specialEvents.grainRequisitionWeight /
    (CONFIG.specialEvents.grainRequisitionWeight + frostWeight);
  const rng = sequenceRng([boundary - 1e-6]);
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, rng), true);
  assert.equal(state.pendingChoice?.data.eventId, 'grainRequisition');
  assert.equal(rng.calls, 1, 'candidate weight calculation must not consume RNG');
}

function openOnlyEarlyFrost(state) {
  addStandingFarm(state);
  prepareEvents(state, ['earlyFrost']);
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, sequenceRng([0, 0])), true);
  assert.equal(state.pendingChoice?.data.eventId, 'earlyFrost');
}

// 측우기는 정보만 공개한다. 미보유 상태에는 수치가 새지 않고, 보유 시 실제 함수의 값이 표시된다.
{
  const state = simulation.newGame(41001);
  openOnlyEarlyFrost(state);
  const description = state.pendingChoice.options.find(option => option.id === 'wait-harvest').desc;
  assert.ok(!description.includes('%'));
  assert.equal(disasters.disasterChoiceForecast(state, 'earlyFrost', 'wait-harvest'), null);
  assert.equal(disasters.rainGaugeClimateSummary(state), null);
}

{
  const state = simulation.newGame(41001);
  state.specialItems.rainGauge = 1;
  openOnlyEarlyFrost(state);
  const chance = disasters.disasterChoiceChance(state, 'earlyFrost', 'wait-harvest');
  const description = state.pendingChoice.options.find(option => option.id === 'wait-harvest').desc;
  assert.equal(description, disasters.disasterChoiceForecast(state, 'earlyFrost', 'wait-harvest'));
  assert.ok(description.includes(`${Math.round(chance * 100)}%`));
  assert.equal(
    disasters.rainGaugeClimateSummary(state),
    climate.annualClimateSummary(climate.annualClimate(state.seed, 1)),
  );
}

// 표시와 실제 해결은 같은 공개 확률을 쓰며 임계값 비교는 기존의 엄격한 `<`를 유지한다.
{
  const state = simulation.newGame(51001);
  state.specialItems.rainGauge = 1;
  openOnlyEarlyFrost(state);
  const farm = state.buildings.at(-1);
  const chance = disasters.disasterChoiceChance(state, 'earlyFrost', 'wait-harvest');
  const rng = sequenceRng([Math.max(0, chance - 1e-9)]);
  specialEvents.resolveSpecialEvent(state, 'wait-harvest', rng);
  assert.equal(farm.fieldGrowth, 80);
  assert.equal(rng.calls, 1);
}

{
  const state = simulation.newGame(51001);
  state.specialItems.rainGauge = 1;
  openOnlyEarlyFrost(state);
  const farm = state.buildings.at(-1);
  const chance = disasters.disasterChoiceChance(state, 'earlyFrost', 'wait-harvest');
  const rng = sequenceRng([chance]);
  specialEvents.resolveSpecialEvent(state, 'wait-harvest', rng);
  assert.equal(farm.fieldGrowth, 20);
  assert.equal(rng.calls, 1);
}

// 역병 사건도 선택 1회 + 환자 1회 + 실제 역병 1회의 기존 RNG 순서를 보존한다.
for (const offset of [-1e-9, 0]) {
  const state = simulation.newGame(61001);
  prepareEvents(state, ['plagueSuspicion']);
  const chance = disasters.disasterChoiceChance(state, 'plagueSuspicion', 'real-case');
  const rng = sequenceRng([0, 0, chance + offset]);
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, rng), true);
  assert.equal(state.pendingChoice?.data.eventId, 'plagueSuspicion');
  assert.equal(state.pendingChoice?.data.real, offset < 0);
  assert.equal(rng.calls, 3);
}

const inspectorSource = readFileSync(new URL('../../src/components/InspectorPanel.tsx', import.meta.url), 'utf8');
assert.ok(inspectorSource.includes('rainGaugeClimateSummary(state)'));
assert.ok(inspectorSource.includes('{climateSummary && ('));

console.log('disaster climate tests passed');
