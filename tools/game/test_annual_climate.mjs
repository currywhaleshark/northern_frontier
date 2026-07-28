import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-annual-climate-tests-'));
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
const climate = await import(pathToFileURL(join(compiledDir, 'climate.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const axes = ['temperatureAnomaly', 'precipitationAnomaly', 'storminess'];
const first = climate.annualClimate(20260728, 1);

assert.deepEqual(climate.annualClimate(20260728, 1), first, 'same seed and year must be deterministic');
assert.ok(axes.some(axis => first[axis] !== climate.annualClimate(20260728, 2)[axis]),
  'different years must change at least one climate axis');

for (let seed = 1; seed <= 500; seed++) {
  for (let year = 1; year <= 20; year++) {
    const result = climate.annualClimate(seed, year);
    for (const axis of axes) {
      assert.ok(result[axis] >= -1 && result[axis] <= 1, `${axis} is outside [-1, 1]`);
    }
  }
}

// 축별 RNG를 분리했으므로 온도 축 salt만 바꿔도 다른 두 축은 변하지 않는다.
const baseline = climate.annualClimate(90125, 7);
const originalTemperatureSalt = CONFIG.climate.annualSalts.temperature;
CONFIG.climate.annualSalts.temperature += 1;
const alteredTemperature = climate.annualClimate(90125, 7);
CONFIG.climate.annualSalts.temperature = originalTemperatureSalt;
assert.notEqual(alteredTemperature.temperatureAnomaly, baseline.temperatureAnomaly,
  'temperature salt must affect the temperature axis');
assert.equal(alteredTemperature.precipitationAnomaly, baseline.precipitationAnomaly,
  'temperature salt must not affect precipitation');
assert.equal(alteredTemperature.storminess, baseline.storminess,
  'temperature salt must not affect storminess');

for (const axis of axes) {
  const values = [];
  for (let seed = 1; seed <= 4000; seed++) values.push(climate.annualClimate(seed, 3)[axis]);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const central = values.filter(value => Math.abs(value) < 0.25).length;
  const extreme = values.filter(value => Math.abs(value) >= 0.75).length;
  assert.ok(Math.abs(mean) < 0.05, `${axis} mean should remain near zero, got ${mean}`);
  assert.ok(central > extreme * 4, `${axis} should have more central than extreme values`);
}

const labels = climate;
assert.equal(labels.climateTemperatureLabel({ temperatureAnomaly: -0.6 }), '매우 추움');
assert.equal(labels.climateTemperatureLabel({ temperatureAnomaly: -0.2 }), '추움');
assert.equal(labels.climateTemperatureLabel({ temperatureAnomaly: 0.2 }), '온화함');
assert.equal(labels.climateTemperatureLabel({ temperatureAnomaly: 0.6 }), '매우 온화함');
assert.equal(labels.climateTemperatureLabel({ temperatureAnomaly: NaN }), '평년');
assert.equal(labels.climateTemperatureLabel({ temperatureAnomaly: Infinity }), '평년');

assert.equal(labels.climatePrecipitationLabel({ precipitationAnomaly: -0.6 }), '매우 건조');
assert.equal(labels.climatePrecipitationLabel({ precipitationAnomaly: -0.2 }), '건조');
assert.equal(labels.climatePrecipitationLabel({ precipitationAnomaly: 0.2 }), '습윤');
assert.equal(labels.climatePrecipitationLabel({ precipitationAnomaly: 0.6 }), '매우 습윤');
assert.equal(labels.climatePrecipitationLabel({ precipitationAnomaly: -Infinity }), '예년과 비슷');

assert.equal(labels.climateStorminessLabel({ storminess: -0.2 }), '잔잔함');
assert.equal(labels.climateStorminessLabel({ storminess: 0.2 }), '궂은 날이 잦음');
assert.equal(labels.climateStorminessLabel({ storminess: NaN }), '평년');

const describedClimate = {
  temperatureAnomaly: -0.2,
  precipitationAnomaly: -0.2,
  storminess: 0.2,
};
assert.equal(labels.annualClimateSummary(describedClimate), '금년 관측: 건조 · 추움 · 궂은 날이 잦음');
assert.equal(labels.annualClimateSummary({
  temperatureAnomaly: NaN,
  precipitationAnomaly: Infinity,
  storminess: -Infinity,
}), '금년 관측: 예년과 비슷 · 평년 · 평년');

console.log('annual climate tests passed');
