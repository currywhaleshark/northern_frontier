import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-weather-schedule-tests-'));
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

function countWeather(schedule, ids) {
  const wanted = new Set(ids);
  return schedule.filter(weather => wanted.has(weather)).length;
}

function assertRunCaps(schedule, runMax) {
  let runWeather = null;
  let runLength = 0;
  for (const weather of schedule) {
    if (weather === runWeather) {
      runLength += 1;
    } else {
      runWeather = weather;
      runLength = 1;
    }
    assert.ok(runLength <= runMax[weather],
      `${weather} exceeded run cap ${runMax[weather]} in ${schedule.join(',')}`);
  }
}

const compiledDir = compileGameModules();
const weather = await import(pathToFileURL(join(compiledDir, 'weather.mjs')).href);
const climateModule = await import(pathToFileURL(join(compiledDir, 'climate.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

const seasons = ['spring', 'summer', 'autumn', 'winter'];
const precipitationIds = ['rain', 'heavySnow', 'blizzard'];
const snowIds = ['heavySnow', 'blizzard'];

for (let seed = 1; seed <= 400; seed++) {
  for (let year = 1; year <= 8; year++) {
    for (const season of seasons) {
      const schedule = weather.seasonWeatherSchedule(seed, year, season);
      const repeated = weather.seasonWeatherSchedule(seed, year, season);
      assert.deepEqual(repeated, schedule, 'same seed/year/season must be deterministic');
      assert.equal(schedule.length, CONFIG.time.seasonDays, 'schedule must fill the whole season');

      const table = CONFIG.weather.table[season];
      for (const weatherId of schedule) {
        assert.equal(typeof weatherId, 'string');
        assert.ok(Number.isFinite(table[weatherId]) && table[weatherId] > 0,
          `${season} generated zero-weight weather ${weatherId}`);
      }
      assertRunCaps(schedule, CONFIG.weather.schedule.runMax);

      const fixedClimateSchedule = weather.seasonWeatherScheduleForClimate(
        seed,
        year,
        season,
        climateModule.annualClimate(seed, year),
      );
      assert.deepEqual(schedule, fixedClimateSchedule,
        'public schedule must use the annualClimate result without hidden state');
    }
  }
}

// 동일 RNG 표본을 결합해 기후 축만 바꾸면 총 강수일과 눈 몫이 역행하지 않는다.
const dry = { temperatureAnomaly: 0, precipitationAnomaly: -1, storminess: 0 };
const normal = { temperatureAnomaly: 0, precipitationAnomaly: 0, storminess: 0 };
const wet = { temperatureAnomaly: 0, precipitationAnomaly: 1, storminess: 0 };
const cold = { temperatureAnomaly: -1, precipitationAnomaly: 0.35, storminess: 0.2 };
const warm = { temperatureAnomaly: 1, precipitationAnomaly: 0.35, storminess: 0.2 };

for (let seed = 1; seed <= 1000; seed++) {
  for (const season of seasons) {
    const drySchedule = weather.seasonWeatherScheduleForClimate(seed, 6, season, dry);
    const normalSchedule = weather.seasonWeatherScheduleForClimate(seed, 6, season, normal);
    const wetSchedule = weather.seasonWeatherScheduleForClimate(seed, 6, season, wet);
    const dryDays = countWeather(drySchedule, precipitationIds);
    const normalDays = countWeather(normalSchedule, precipitationIds);
    const wetDays = countWeather(wetSchedule, precipitationIds);
    assert.ok(dryDays <= normalDays && normalDays <= wetDays,
      `${season} precipitation must be monotone for a fixed RNG sample`);

    const coldSchedule = weather.seasonWeatherScheduleForClimate(seed, 6, season, cold);
    const warmSchedule = weather.seasonWeatherScheduleForClimate(seed, 6, season, warm);
    const coldSnowDays = countWeather(coldSchedule, snowIds);
    const warmSnowDays = countWeather(warmSchedule, snowIds);
    assert.ok(coldSnowDays >= warmSnowDays,
      `${season} snow share must not decrease as temperature falls`);
    for (const schedule of [drySchedule, normalSchedule, wetSchedule, coldSchedule, warmSchedule]) {
      assertRunCaps(schedule, CONFIG.weather.schedule.runMax);
    }
  }
}

// P4: 해빙 홍수는 오직 봄에 나타난다. 직전 겨울 적설과 현재 봄 기온이 높을수록
// 같은 RNG 표본에서 줄지 않으며, 1년차는 CONFIG의 평년 적설로 시작한다.
for (let seed = 1; seed <= 1000; seed++) {
  const firstYearCold = weather.seasonWeatherScheduleForClimate(seed, 1, 'spring', cold);
  const firstYearWarm = weather.seasonWeatherScheduleForClimate(seed, 1, 'spring', warm);
  assert.ok(
    countWeather(firstYearCold, ['thawFlood']) <= countWeather(firstYearWarm, ['thawFlood']),
    'a warmer first spring must not reduce flood days from the normal winter baseline',
  );

  const lowSnow = weather.seasonWeatherScheduleForClimate(seed, 2, 'spring', normal, 0);
  const highSnow = weather.seasonWeatherScheduleForClimate(
    seed,
    2,
    'spring',
    normal,
    CONFIG.time.seasonDays,
  );
  assert.ok(
    countWeather(lowSnow, ['thawFlood']) <= countWeather(highSnow, ['thawFlood']),
    'a snowier prior winter must not reduce flood days',
  );

  for (const season of ['summer', 'autumn', 'winter']) {
    assert.equal(
      countWeather(weather.seasonWeatherScheduleForClimate(seed, 2, season, wet), ['thawFlood']),
      0,
    );
  }
}

// override를 생략한 실제 공개 경로가 1년차에는 평년 적설 기본값을, 이후에는
// 직전 연도의 겨울 일정을 재생성해 얻은 적설일을 사용하는지 독립적으로 대조한다.
for (let seed = 1; seed <= 200; seed++) {
  const firstYearImplicit = weather.seasonWeatherScheduleForClimate(seed, 1, 'spring', normal);
  const firstYearExplicit = weather.seasonWeatherScheduleForClimate(
    seed,
    1,
    'spring',
    normal,
    CONFIG.weather.schedule.thawFlood.normalWinterSnowDays,
  );
  assert.deepEqual(
    firstYearImplicit,
    firstYearExplicit,
    'the first spring must use the configured normal-winter fallback',
  );

  for (let year = 2; year <= 6; year++) {
    const priorWinter = weather.seasonWeatherSchedule(seed, year - 1, 'winter');
    const priorSnowDays = countWeather(priorWinter, snowIds);
    const currentClimate = climateModule.annualClimate(seed, year);
    assert.deepEqual(
      weather.seasonWeatherSchedule(seed, year, 'spring'),
      weather.seasonWeatherScheduleForClimate(
        seed,
        year,
        'spring',
        currentClimate,
        priorSnowDays,
      ),
      'spring must derive thaw-flood input from the previous winter schedule',
    );
  }
}

// 홍수는 강수일을 건드리지 않고 clear부터, clear가 모자라면 frost를 순서대로 대체한다.
const originalSpringClear = CONFIG.weather.table.spring.clear;
try {
  CONFIG.weather.table.spring.clear = 0.05;
  const lowSnow = weather.seasonWeatherScheduleForClimate(20260728, 2, 'spring', warm, 0);
  const highSnow = weather.seasonWeatherScheduleForClimate(
    20260728,
    2,
    'spring',
    warm,
    CONFIG.time.seasonDays,
  );
  const floodDifference = countWeather(highSnow, ['thawFlood']) - countWeather(lowSnow, ['thawFlood']);
  assert.ok(floodDifference > 0, 'the controlled snow contrast must add flood days');
  assert.equal(
    countWeather(lowSnow, precipitationIds),
    countWeather(highSnow, precipitationIds),
    'flood days must not replace precipitation',
  );
  const clearDifference = countWeather(lowSnow, ['clear']) - countWeather(highSnow, ['clear']);
  const frostDifference = countWeather(lowSnow, ['frost']) - countWeather(highSnow, ['frost']);
  assert.equal(clearDifference, Math.min(floodDifference, countWeather(lowSnow, ['clear'])));
  assert.equal(frostDifference, Math.max(0, floodDifference - countWeather(lowSnow, ['clear'])));
} finally {
  CONFIG.weather.table.spring.clear = originalSpringClear;
}

// weatherForDay는 1 기반 날짜를 정확한 계절표 인덱스로 연결한다.
for (let day = 1; day <= CONFIG.time.yearDays * 3; day++) {
  const year = Math.floor((day - 1) / CONFIG.time.yearDays) + 1;
  const dayOfYear = ((day - 1) % CONFIG.time.yearDays) + 1;
  const seasonIndex = Math.floor((dayOfYear - 1) / CONFIG.time.seasonDays);
  const season = seasons[seasonIndex];
  const dayOfSeason = ((dayOfYear - 1) % CONFIG.time.seasonDays);
  assert.equal(
    weather.weatherForDay(20260728, day),
    weather.seasonWeatherSchedule(20260728, year, season)[dayOfSeason],
  );
}

console.log('weather schedule tests passed');
