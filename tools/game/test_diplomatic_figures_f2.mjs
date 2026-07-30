import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-diplomatic-figures-f2-tests-'));
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

function approx(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} !== ${expected}`);
}

const compiledDir = compileGameModules();
const grants = await import(pathToFileURL(join(compiledDir, 'courtGrants.mjs')).href);
const tribute = await import(pathToFileURL(join(compiledDir, 'courtTribute.mjs')).href);
const figures = await import(pathToFileURL(join(compiledDir, 'diplomaticFigures.mjs')).href);
const petition = await import(pathToFileURL(join(compiledDir, 'petition.mjs')).href);
const raids = await import(pathToFileURL(join(compiledDir, 'raids.mjs')).href);
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const suspicion = await import(pathToFileURL(join(compiledDir, 'suspicion.mjs')).href);
const { CONFIG } = await import(pathToFileURL(join(compiledDir, 'config.mjs')).href);

{
  const state = simulation.newGame(73050);
  state.borderCommander.temper = 'strict';
  const strict = figures.borderCommanderEffects(state);
  assert.equal(strict.suspicionRiseMultiplier, 1.15);
  assert.equal(strict.courtGrantRankShift, 1);

  state.borderCommander.temper = 'greedy';
  const greedy = figures.borderCommanderEffects(state);
  assert.equal(greedy.petitionReputationMultiplier, 1.25);
  assert.equal(greedy.courtGrantRankShift, -1);

  state.borderCommander.temper = 'lenient';
  assert.equal(figures.borderCommanderEffects(state).suspicionNaturalDecayMultiplier, 1.25);

  state.borderCommander.temper = 'tactician';
  const tactician = figures.borderCommanderEffects(state);
  assert.equal(tactician.petitionResourceMultiplier, 1.25);
  assert.equal(tactician.threatDecayMultiplier, 1.15);
}

{
  const strict = simulation.newGame(73051);
  strict.borderCommander.temper = 'strict';
  strict.buildings.push({
    id: strict.nextBuildingId++, type: 'nitreYard', x: 0, y: 0,
    progress: 1, built: true, fieldGrowth: 0,
  });
  const strictNitre = suspicion.suspicionBreakdown(strict).find(factor => factor.id === 'nitre');
  const strictDecay = suspicion.suspicionBreakdown(strict).find(factor => factor.id === 'decay');
  approx(
    strictNitre.delta,
    CONFIG.suspicion.perNitreYard * CONFIG.borderCommanderEffects.strictSuspicionRiseMultiplier,
    '엄격 북병사는 일일 의심 상승 요인을 키운다',
  );
  approx(strictDecay.delta, -CONFIG.suspicion.baseDecay, '엄격 북병사는 자연 감소를 바꾸지 않는다');

  const lenient = simulation.newGame(73052);
  lenient.borderCommander.temper = 'lenient';
  const lenientDecay = suspicion.suspicionBreakdown(lenient).find(factor => factor.id === 'decay');
  approx(
    lenientDecay.delta,
    -CONFIG.suspicion.baseDecay * CONFIG.borderCommanderEffects.lenientSuspicionDecayMultiplier,
    '온건 북병사는 의심 자연 감소를 키운다',
  );
}

{
  const greedy = simulation.newGame(73053);
  greedy.rank = 'bo';
  greedy.borderCommander.temper = 'greedy';
  greedy.resources.reputation = 100;
  const grainOffer = petition.PETITION_OFFERS.find(offer => offer.id === 'grain');
  assert.equal(petition.petitionReputationCost(greedy, grainOffer), 6);
  const greedyGrain = greedy.resources.grain;
  assert.equal(petition.requestPetition(greedy), null);
  assert.match(greedy.pendingChoice.options.find(option => option.id === 'grain').desc, /명성 -6/);
  petition.resolvePetition(greedy, 'grain');
  assert.equal(greedy.resources.reputation, 94);
  assert.equal(greedy.resources.grain, greedyGrain + 30);

  const tactician = simulation.newGame(73054);
  tactician.rank = 'bo';
  tactician.borderCommander.temper = 'tactician';
  tactician.resources.reputation = 100;
  const tacticianGrain = tactician.resources.grain;
  assert.equal(petition.petitionResourceAmount(tactician, 30), 38);
  assert.equal(petition.requestPetition(tactician), null);
  assert.match(tactician.pendingChoice.options.find(option => option.id === 'grain').desc, /곡물 \+38/);
  petition.resolvePetition(tactician, 'grain');
  assert.equal(tactician.resources.reputation, 95);
  assert.equal(tactician.resources.grain, tacticianGrain + 38);
}

{
  const state = simulation.newGame(73055);
  state.rank = 'bo';
  state.borderCommander.temper = 'strict';
  assert.equal(grants.courtGrantEffectiveRank(state), 'jin');
  state.borderCommander.temper = 'greedy';
  assert.equal(grants.courtGrantEffectiveRank(state), 'settlement');

  let sawDifferentPoolResult = false;
  for (let seed = 1; seed <= 100 && !sawDifferentPoolResult; seed++) {
    state.seed = seed;
    state.borderCommander.temper = 'strict';
    const generous = grants.rollCourtGrantRewards(state, 2);
    state.borderCommander.temper = 'greedy';
    const stingy = grants.rollCourtGrantRewards(state, 2);
    sawDifferentPoolResult = JSON.stringify(generous) !== JSON.stringify(stingy);
  }
  assert.equal(sawDifferentPoolResult, true, '엄격·탐욕 북병사의 하사 후보 단계가 실제 추첨에 반영되어야 한다');
}

{
  const state = simulation.newGame(73056);
  state.borderCommander.temper = 'lenient';
  state.borderCommander.tributeLeniencyUsed = false;
  state.tributeFailStreak = 1;
  state.tributePaidStreak = 2;
  state.resources.reputation = 50;
  state.threat = 40;
  const repBefore = state.resources.reputation;
  const threatBefore = state.threat;

  tribute.openCourtTributeChoice(state);
  assert.match(state.pendingChoice.options.find(option => option.id === 'refuse').desc, /문책을 유예/);
  tribute.resolveCourtTribute(state, 'refuse');
  assert.equal(state.borderCommander.tributeLeniencyUsed, true);
  assert.equal(state.courtTribute.resolved, true);
  assert.equal(state.courtTribute.paid, false);
  assert.equal(state.tributePaidStreak, 0, '유예는 완납으로 인정되지 않는다');
  assert.equal(state.tributeFailStreak, 0, '유예된 해는 연속 미납을 끊는다');
  assert.equal(state.resources.reputation, repBefore);
  assert.equal(state.threat, threatBefore);

  state.courtTribute = tribute.rollCourtTribute(state.seed, 2, state.residents.length, state.rank);
  tribute.openCourtTributeChoice(state);
  tribute.resolveCourtTribute(state, 'refuse');
  assert.equal(state.tributeFailStreak, 1, '같은 임기의 두 번째 미납에는 유예가 없다');
  assert.equal(state.resources.reputation, repBefore - CONFIG.tribute.repFail);
  assert.equal(state.threat, threatBefore + CONFIG.tribute.threatFail);
}

{
  const ordinary = simulation.newGame(73057);
  const tactician = simulation.newGame(73057);
  ordinary.borderCommander.temper = 'strict';
  tactician.borderCommander.temper = 'tactician';
  for (const state of [ordinary, tactician]) {
    state.day = 1;
    state.threat = 50;
    state.resources.reputation = 100;
    state.resources.defense = 1000;
    state.tradeRefusedDays = 0;
    for (const factionName of Object.keys(state.relations)) state.relations[factionName] = 100;
    for (const resident of state.residents) resident.job = 'watchman';
  }
  raids.updateThreat(ordinary);
  raids.updateThreat(tactician);
  assert.ok(
    tactician.threat < ordinary.threat,
    `지장 북병사는 순감소 중인 위협도를 더 빨리 낮춰야 한다 (${tactician.threat} < ${ordinary.threat})`,
  );
}

console.log('diplomatic figures F2 tests passed');
