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
assert.equal(
  disasters.disasterOccurrenceWeightForClimate(normal, 'lateFrost'),
  CONFIG.disasters.lateFrost.occurrenceBaseWeight,
);
assert.equal(
  disasters.disasterChoiceChanceForClimate(normal, 'lateFrost', 'wait-replant'),
  CONFIG.disasters.lateFrost.waitReplantBaseClearChance,
);
assert.ok(
  disasters.disasterOccurrenceWeightForClimate(veryCold, 'lateFrost') >
    disasters.disasterOccurrenceWeightForClimate(veryWarm, 'lateFrost'),
  'late frost must be more likely in colder years',
);
assert.ok(
  disasters.disasterChoiceChanceForClimate(veryCold, 'lateFrost', 'wait-replant') <
    disasters.disasterChoiceChanceForClimate(veryWarm, 'lateFrost', 'wait-replant'),
  'late frost must be less likely to clear in colder years',
);
assert.equal(
  disasters.disasterOccurrenceWeightForClimate(normal, 'locust'),
  CONFIG.disasters.locust.occurrenceBaseWeight,
);
assert.ok(
  disasters.disasterOccurrenceWeightForClimate(
    { ...normal, temperatureAnomaly: 1, precipitationAnomaly: -1 },
    'locust',
  ) > disasters.disasterOccurrenceWeightForClimate(
    { ...normal, temperatureAnomaly: -1, precipitationAnomaly: 1 },
    'locust',
  ),
  'locust occurrence must rise in warm, dry years',
);
const locustVariationState = { seed: 72008, day: 15 };
assert.equal(
  disasters.locustAnnualMultiplier(locustVariationState),
  disasters.locustAnnualMultiplier(locustVariationState),
  'locust annual variation must be deterministic',
);
assert.ok(
  disasters.locustAnnualMultiplier(locustVariationState) >= CONFIG.disasters.locust.annualVarianceMinMultiplier &&
    disasters.locustAnnualMultiplier(locustVariationState) <= CONFIG.disasters.locust.annualVarianceMaxMultiplier,
  'locust annual variation stays within its configured range',
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
  'grainRequisition', 'shipwreck', 'earlyFrost', 'lateFrost', 'locust', 'gyrfalcon',
];

function prepareEvents(state, allowed) {
  state.day = 25;
  state.weather = 'frost';
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

function prepareLateFrostEvents(state, allowed = ['lateFrost']) {
  state.day = 8;
  state.weather = 'frost';
  state.incidents.year = 1;
  state.incidents.scheduledDays = [state.day];
  state.incidents.cooldownUntil = Object.fromEntries(
    selectableEventIds.filter(id => !allowed.includes(id)).map(id => [id, 9999]),
  );
}

function openOnlyLateFrost(state) {
  addStandingFarm(state);
  prepareLateFrostEvents(state);
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, sequenceRng([0, 0])), true);
  assert.equal(state.pendingChoice?.data.eventId, 'lateFrost');
}

function prepareLocustEvents(state) {
  state.day = 15;
  state.weather = 'clear';
  state.incidents.year = 1;
  state.incidents.scheduledDays = [state.day];
  state.incidents.cooldownUntil = Object.fromEntries(
    selectableEventIds.filter(id => id !== 'locust').map(id => [id, 9999]),
  );
}

function openOnlyLocust(state, durationRoll = 0) {
  addStandingFarm(state);
  prepareLocustEvents(state);
  const rng = sequenceRng([0, durationRoll]);
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, rng), true);
  assert.equal(state.pendingChoice?.data.eventId, 'locust');
  assert.equal(rng.calls, 2, 'locust selection and hidden duration each consume one RNG call');
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

// 측우기 수치는 기후 기반 근사 예보다. 기다리기는 즉시 주사위를 굴리지 않고
// 실제 날씨 추적 상태를 만든다.
{
  const state = simulation.newGame(51001);
  state.specialItems.rainGauge = 1;
  openOnlyEarlyFrost(state);
  const farm = state.buildings.at(-1);
  const rng = sequenceRng([0]);
  specialEvents.resolveSpecialEvent(state, 'wait-harvest', rng);
  assert.equal(farm.fieldGrowth, 80);
  assert.equal(rng.calls, 0, 'waiting for frost consumes no simulation RNG');
  assert.equal(state.pendingDisasters.length, 1);
  assert.equal(state.pendingDisasters[0].resolveDay, state.day + 4);
}

{
  const state = simulation.newGame(51001);
  addStandingFarm(state);
  prepareEvents(state, ['earlyFrost']);
  state.weather = 'clear';
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, sequenceRng([0, 0])), false);
  assert.equal(state.incidents.scheduledDays.length, 1, 'a clear autumn day does not consume the scheduled incident');
}

// 늦서리는 봄의 실제 서리일에만 열리고, 재파종은 주사위 없이 여름 작물 예약으로 바꾼다.
{
  const state = simulation.newGame(52001);
  openOnlyLateFrost(state);
  const farm = state.buildings.at(-1);
  specialEvents.resolveSpecialEvent(state, 'replant-summer', sequenceRng([0]));
  assert.equal(farm.fieldGrowth, 0);
  assert.equal(farm.sownArea, 0);
  assert.equal(farm.cropId, 'buckwheat');
  assert.equal(farm.queuedCropId, null);
  assert.deepEqual(state.pendingDisasters, []);
}

{
  const state = simulation.newGame(52002);
  state.specialItems.rainGauge = 1;
  openOnlyLateFrost(state);
  const farm = state.buildings.at(-1);
  const option = state.pendingChoice.options.find(choice => choice.id === 'wait-replant');
  assert.ok(option.desc.includes('%'));
  const rng = sequenceRng([0]);
  specialEvents.resolveSpecialEvent(state, 'wait-replant', rng);
  assert.equal(rng.calls, 0, 'late-frost observation consumes no simulation RNG');
  assert.equal(farm.cropId, 'millet');
  assert.equal(state.pendingDisasters[0].resolveDay, state.day + 3);
}

{
  const state = simulation.newGame(52003);
  addStandingFarm(state);
  prepareLateFrostEvents(state);
  state.weather = 'clear';
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, sequenceRng([0, 0])), false);
  assert.equal(state.incidents.scheduledDays.length, 1, 'a clear spring day does not consume the scheduled incident');
}

// 황충은 여름에만 발생하며, 버티기는 추가 RNG 없이 비공개 체류 상태를 만든다.
{
  const state = simulation.newGame(53001);
  openOnlyLocust(state, 0.99);
  const field = state.buildings.at(-1);
  assert.equal(state.pendingChoice.data.durationDays, 5);
  const rng = sequenceRng([0]);
  specialEvents.resolveSpecialEvent(state, 'endure', rng);
  assert.equal(rng.calls, 0, 'enduring locusts consumes no simulation RNG after the event opens');
  assert.equal(state.pendingDisasters[0].resolveDay, state.day + 5);
  assert.deepEqual(state.pendingDisasters[0].targetBuildingIds, [field.id]);
}

// 정착지 단위 조기 수확은 황충 대기열을 만들지 않고 대상 밭의 남은 소출을 확보한다.
{
  const state = simulation.newGame(53002);
  openOnlyLocust(state);
  const field = state.buildings.at(-1);
  specialEvents.resolveSpecialEvent(state, 'harvest-early', sequenceRng([0]));
  assert.equal(field.fieldGrowth, 0);
  assert.equal(field.sownArea, 0);
  assert.ok(field.inventory.grain > 0);
  assert.deepEqual(state.pendingDisasters, []);
}

{
  const state = simulation.newGame(53003);
  addStandingFarm(state);
  prepareLocustEvents(state);
  state.day = 29; // 가을 다섯째 날: 초가을 범위를 벗어난다.
  state.incidents.scheduledDays = [state.day];
  assert.equal(specialEvents.maybeOpenSpecialEvent(state, sequenceRng([0, 0])), false);
  assert.equal(state.incidents.scheduledDays.length, 1, 'late autumn does not consume a locust incident');
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
