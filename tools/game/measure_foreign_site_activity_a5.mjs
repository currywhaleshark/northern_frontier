// A5 외부 거주지 활동 성능 관측 도구.
// 중형·대형 지도를 실제 1년간 진행하며 활동대 상한과 외부 거주지 틱 비용을 함께 기록한다.
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-foreign-site-a5-measure-'));
  for (const file of readdirSync(srcDir).filter(candidate => candidate.endsWith('.ts'))) {
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

function resolvePendingChoices(state, simulation) {
  let guard = 0;
  while (state.pendingChoice && guard++ < 24) {
    const choice = state.pendingChoice;
    const preferredIds = ['decline', 'refuse', 'dismiss', 'shelter', 'wait', 'close'];
    const option = preferredIds
      .map(id => choice.options.find(candidate => candidate.id === id && !candidate.disabled))
      .find(Boolean) ?? choice.options.find(candidate => !candidate.disabled);
    simulation.resolveChoice(state, option?.id ?? '');
    if (state.pendingChoice === choice) break;
  }
  assert.equal(state.pendingChoice, null, `day ${state.day}: pending choice must resolve during measurement`);
}

function activePartyStats(state) {
  const perSite = new Map();
  for (const party of state.foreignSiteParties) {
    perSite.set(party.siteId, (perSite.get(party.siteId) ?? 0) + 1);
  }
  return {
    total: state.foreignSiteParties.length,
    maxPerSite: Math.max(0, ...perSite.values()),
  };
}

const outDir = compileGameModules();
try {
  const load = name => import(pathToFileURL(join(outDir, `${name}.mjs`)).href);
  const simulation = await load('simulation');
  const foreignSiteSimulation = await load('foreignSiteSimulation');
  const options = await load('newGameOptions');
  const weather = await load('weather');
  const { CONFIG } = await load('config');
  const cases = [
    { mapSize: 'medium', region: 'plains', seed: 2026080601 },
    { mapSize: 'large', region: 'mountain', seed: 2026080602 },
  ];
  const results = [];

  for (const testCase of cases) {
    const state = simulation.newGameFromOptions({
      ...options.optionsForDifficulty('normal', '', testCase.seed),
      mapSize: testCase.mapSize,
      region: testCase.region,
      seed: testCase.seed,
    });
    let tickCount = 0;
    let maxParties = 0;
    let maxPartiesPerSite = 0;
    let partyTickMs = 0;
    let dailyDispatchMs = 0;
    const started = performance.now();

    for (let dayIndex = 0; dayIndex < CONFIG.time.yearDays; dayIndex++) {
      for (let subTick = 0; subTick < simulation.SUBTICKS; subTick++) {
        state.subTick = subTick;
        const partyTickStarted = performance.now();
        foreignSiteSimulation.foreignSitePartiesTick(state);
        partyTickMs += performance.now() - partyTickStarted;
        resolvePendingChoices(state, simulation);
        tickCount++;
        const active = activePartyStats(state);
        maxParties = Math.max(maxParties, active.total);
        maxPartiesPerSite = Math.max(maxPartiesPerSite, active.maxPerSite);
      }
      state.subTick = 0;
      state.day++;
      state.weather = weather.weatherForDay(
        state.seed,
        state.day,
        state.worldSetup?.effective.climateSeverityMultiplier,
      );
      const dailyStarted = performance.now();
      foreignSiteSimulation.dailyForeignSiteActivityTick(state);
      dailyDispatchMs += performance.now() - dailyStarted;
      resolvePendingChoices(state, simulation);
    }

    const elapsedMs = performance.now() - started;
    const siteCount = state.foreignSites.length;
    assert.ok(maxParties <= siteCount * 2,
      `${testCase.mapSize}: ${maxParties} parties exceeded the ${siteCount * 2} global cap`);
    assert.ok(maxPartiesPerSite <= 2,
      `${testCase.mapSize}: a site exceeded the two-party contract`);
    assert.ok(state.foreignSites.every(site => Number.isFinite(site.activity?.activitySequence ?? 0)),
      `${testCase.mapSize}: activity sequence must remain finite`);

    results.push({
      mapSize: testCase.mapSize,
      region: testCase.region,
      dimensions: `${state.map[0].length}×${state.map.length}`,
      days: CONFIG.time.yearDays,
      ticks: tickCount,
      elapsedMs: Number(elapsedMs.toFixed(3)),
      meanTickMs: Number((elapsedMs / tickCount).toFixed(3)),
      foreignSiteTickMs: Number(partyTickMs.toFixed(3)),
      foreignSiteMeanTickMs: Number((partyTickMs / tickCount).toFixed(4)),
      dailyDispatchMs: Number(dailyDispatchMs.toFixed(3)),
      sites: siteCount,
      maxParties,
      maxPartiesPerSite,
      partiesCreated: state.nextForeignSitePartyId - 1,
    });
  }

  console.table(results);
  console.log(JSON.stringify({ yearDays: CONFIG.time.yearDays, results }));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
