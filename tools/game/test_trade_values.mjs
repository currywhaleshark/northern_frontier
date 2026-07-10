import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-game-tests-'));
  for (const file of readdirSync(srcDir).filter(file => file.endsWith('.ts'))) {
    const source = readFileSync(new URL(file, srcDir), 'utf8');
    let output = ts.transpileModule(source, {
      compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    output = output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_m, start, spec, end) =>
      /\.[cm]?js$/.test(spec) ? `${start}${spec}${end}` : `${start}${spec}.mjs${end}`);
    writeFileSync(join(outDir, file.replace(/\.ts$/, '.mjs')), output, 'utf8');
  }
  return outDir;
}

const compiledDir = compileGameModules();
const simulation = await import(pathToFileURL(join(compiledDir, 'simulation.mjs')).href);
const tradeValues = await import(pathToFileURL(join(compiledDir, 'tradeValues.mjs')).href);
const { FACTIONS } = await import(pathToFileURL(join(compiledDir, 'constants.mjs')).href);

const faction = FACTIONS.find(candidate => candidate.imports.includes('tools') && candidate.exports.includes('grain'));
assert.ok(faction);

{
  const state = simulation.newGame(2026071015);
  state.resources.tools = 10;
  state.relations[faction.name] = 80;
  const quote = tradeValues.quoteTrade(state, faction.name, { give: 'tools', giveAmt: 10, get: 'grain' });
  assert.equal(quote.ok, true);
  assert.equal(quote.margin, 1);
  assert.ok(quote.getAmt > 0);
}

{
  const state = simulation.newGame(2026071016);
  state.resources.tools = 10;
  state.relations[faction.name] = 36;
  const quote = tradeValues.quoteTrade(state, faction.name, { give: 'tools', giveAmt: 10, get: 'grain' });
  assert.equal(quote.ok, true);
  assert.equal(quote.margin, 1.5);
}

{
  const state = simulation.newGame(2026071017);
  state.resources.tools = 10;
  const before = { tools: state.resources.tools, grain: state.resources.grain };
  for (const giveAmt of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 1.5]) {
    const quote = tradeValues.quoteTrade(state, faction.name, { give: 'tools', giveAmt, get: 'grain' });
    assert.equal(quote.ok, false, `invalid amount ${giveAmt}`);
  }
  assert.equal(state.resources.tools, before.tools);
  assert.equal(state.resources.grain, before.grain);
}

{
  const state = simulation.newGame(2026071018);
  state.resources.tools = 10;
  assert.equal(
    tradeValues.quoteTrade(state, faction.name, { give: 'grain', giveAmt: 1, get: 'hide' }).ok,
    false,
    'faction import/export lists are enforced',
  );
  assert.equal(
    tradeValues.quoteTrade(state, faction.name, { give: 'reputation', giveAmt: 1, get: 'grain' }).ok,
    false,
    'abstract resources cannot be traded',
  );
}

{
  const state = simulation.newGame(2026071019);
  state.resources.tools = 10;
  state.relations[faction.name] = 80;
  const quote = tradeValues.quoteTrade(state, faction.name, { give: 'tools', giveAmt: 10, get: 'grain' });
  const grainBefore = state.resources.grain;
  assert.equal(tradeValues.applyQuotedTrade(state, quote), null);
  assert.equal(state.resources.tools, 0);
  assert.equal(state.resources.grain, grainBefore + quote.getAmt);
}

{
  const state = simulation.newGame(2026071020);
  state.resources.tools = 10;
  state.relations[faction.name] = 80;
  const quote = tradeValues.quoteTrade(state, faction.name, { give: 'tools', giveAmt: 10, get: 'grain' });
  state.relations[faction.name] = 30;
  assert.ok(tradeValues.applyQuotedTrade(state, quote)?.includes('다시'));
  assert.equal(state.resources.tools, 10);
}

{
  const state = simulation.newGame(2026071021);
  state.resources.tools = 100;
  state.resources.hideClothes = 0;
  state.relations[faction.name] = 60;
  const demand = tradeValues.quoteFactionDemand(state, faction.name, 'grain', 12);
  assert.equal(demand.ok, true);
  assert.equal(demand.give, 'tools');
  assert.equal(demand.get, 'grain');
  assert.equal(demand.getAmt, 12);
  assert.ok(demand.giveAmt > 0);
}

{
  const state = simulation.newGame(2026071022);
  state.relations[faction.name] = 60;
  const accepted = tradeValues.evaluateFactionProposal(state, faction.name, {
    give: 'tools', giveAmt: 3, get: 'grain', getAmt: 1,
  });
  assert.equal(accepted.outcome, 'accepted');

  const countered = tradeValues.evaluateFactionProposal(state, faction.name, {
    give: 'tools', giveAmt: 3, get: 'grain', getAmt: accepted.maxGetAmt + 1,
  });
  assert.equal(countered.outcome, 'countered');
  assert.equal(countered.offer.getAmt, countered.maxGetAmt);

  const rejected = tradeValues.evaluateFactionProposal(state, faction.name, {
    give: 'tools', giveAmt: 3, get: 'grain', getAmt: 999,
  });
  assert.equal(rejected.outcome, 'rejected');
}

console.log('trade value tests passed');
