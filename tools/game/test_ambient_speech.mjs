import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

function transpile(source) {
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  return output.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, start, spec, end) => {
    if (/\.[cm]?js$/.test(spec)) return `${start}${spec}${end}`;
    return `${start}${spec}.mjs${end}`;
  });
}

function transpileDirectory(sourceUrl, targetDir) {
  mkdirSync(targetDir, { recursive: true });
  for (const file of readdirSync(sourceUrl).filter(file => file.endsWith('.ts'))) {
    writeFileSync(
      join(targetDir, file.replace(/\.ts$/, '.mjs')),
      transpile(readFileSync(new URL(file, sourceUrl), 'utf8')),
      'utf8',
    );
  }
}

const rootDir = mkdtempSync(join(tmpdir(), 'northern-ambient-speech-'));
transpileDirectory(new URL('../../src/game/', import.meta.url), join(rootDir, 'game'));
transpileDirectory(new URL('../../src/ui/', import.meta.url), join(rootDir, 'ui'));

const gameUrl = file => pathToFileURL(join(rootDir, 'game', `${file}.mjs`)).href;
const { newGame } = await import(gameUrl('simulation'));
const speech = await import(gameUrl('ambientSpeech'));
const migrations = await import(gameUrl('saveMigrations'));
const { CONFIG } = await import(gameUrl('config'));
const { warParticipationSchedule } = await import(gameUrl('militaryAid'));

function visibleState(seed) {
  const state = newGame(seed, 'normal');
  speech.setAmbientSpeechVisibleResidents(state, state.residents.map(resident => resident.id));
  return state;
}

{
  const state = visibleState(4814);
  state.day = CONFIG.time.yearDays + 1;
  const schedule = warParticipationSchedule(state);
  assert.ok(schedule, 'year two must have a deterministic war participation schedule');
  state.day = CONFIG.time.yearDays + schedule.offerDay - 5;
  state.subTick = 20;
  speech.ambientSpeechTick(state);
  const rumor = speech.activeAmbientSpeech(state);
  assert.match(rumor?.text ?? '', /사이가 심상치|전령들이/, 'the faction war must circulate as a rumor before its envoy arrives');
  assert.equal(state.ambientSpeech.deliveredRumorIds.includes(`war-rumor-${schedule.year}`), true);
  assert.equal(state.log.at(-1)?.important, true, 'important diplomatic rumors must also be written to the log');
}

{
  const state = visibleState(4815);
  state.day = CONFIG.time.yearDays * 2 - 4;
  state.subTick = 20;
  speech.ambientSpeechTick(state);
  const rumor = speech.activeAmbientSpeech(state);
  assert.match(rumor?.text ?? '', /병마절도사|새 .*온다더군/, 'the incoming border commander must be rumored before the term changes');
  assert.equal(state.ambientSpeech.deliveredRumorIds.includes('border-commander-rumor-1'), true);
}

{
  const state = visibleState(4811);
  speech.setAmbientSpeechFrequency(state, 'normal');
  state.subTick = 20;
  speech.ambientSpeechTick(state);
  const active = speech.activeAmbientSpeech(state);
  assert.ok(active, 'the first normal daily slot should show one visible resident bubble');
  assert.ok(state.residents.some(resident => resident.id === active.speakerResidentId),
    'the active bubble must belong to a current resident');
  assert.deepEqual(state.ambientSpeech.consumedSlotIds, [`${state.day}:20`]);
  speech.ambientSpeechTick(state);
  assert.equal(speech.activeAmbientSpeech(state)?.id, active.id,
    'the same daily slot must not replace or duplicate its bubble');
}

{
  const state = visibleState(4816);
  state.buildings = [];
  state.ambientSpeech.lastDietVarietyScore = 0.2;
  state.ambientSpeech.lastDominantFood = 'meat';
  state.subTick = 20;
  speech.ambientSpeechTick(state);
  assert.match(speech.activeAmbientSpeech(state)?.text ?? '', /고기.*물리는군/,
    'actual low diet variety must produce a complaint naming the dominant food');
  speech.activeAmbientSpeech(state, Date.now() + 10_000);
  state.day += 1;
  state.subTick = 20;
  state.ambientSpeech.lastDietVarietyScore = 1;
  delete state.ambientSpeech.lastDominantFood;
  speech.ambientSpeechTick(state);
  assert.doesNotMatch(speech.activeAmbientSpeech(state)?.text ?? '', /물리는군/,
    'the diet complaint must disappear as soon as actual variety recovers');
}

{
  const state = visibleState(4817);
  state.buildings = [];
  state.corpses = [{ id: 91, name: '아무개', x: 3, y: 3, deathDay: state.day, cause: 'test' }];
  state.subTick = 20;
  speech.ambientSpeechTick(state);
  assert.match(speech.activeAmbientSpeech(state)?.text ?? '', /시신.*언제까지/,
    'an unburied corpse must produce a settlement-state complaint');
  speech.activeAmbientSpeech(state, Date.now() + 10_000);
  state.day += 1;
  state.subTick = 20;
  state.corpses = [];
  speech.ambientSpeechTick(state);
  assert.doesNotMatch(speech.activeAmbientSpeech(state)?.text ?? '', /시신.*언제까지/,
    'the corpse complaint must disappear after the corpse is removed');
}

{
  const state = visibleState(4812);
  speech.setAmbientSpeechFrequency(state, 'off');
  state.subTick = 48;
  speech.ambientSpeechTick(state);
  assert.equal(speech.activeAmbientSpeech(state), null, 'off must suppress ordinary resident chatter');

  const band = {
    x: 0, y: 0, px: 0, py: 0, path: [], power: 20, size: 3,
    faction: '니마차', warned: false, spotted: false, siege: false,
    speed: 1, trail: [], proximityAlerted: false,
  };
  speech.announceRaidProximitySpeech(state, band);
  const urgent = speech.activeAmbientSpeech(state);
  assert.equal(urgent?.tone, 'surprise', 'surprise discovery must use the urgent red tone even when chatter is off');
  assert.match(urgent?.text ?? '', /코앞|적이다/, 'surprise wording must be terse and immediate');
  assert.equal(band.proximityAlerted, true, 'the physical detection shout must be one-shot');
}

{
  const state = visibleState(4813);
  const band = {
    x: 0, y: 0, px: 0, py: 0, path: [], power: 20, size: 3,
    faction: '니마차', warned: true, spotted: true, siege: false,
    speed: 1, trail: [], warningSource: 'diplomatic', proximityAlerted: false,
  };
  speech.announceRaidSpawnSpeech(state, band);
  const warning = speech.activeAmbientSpeech(state);
  assert.equal(warning?.tone, 'warning');
  assert.match(warning?.text ?? '', /귀띔|오가는 이/, 'diplomatic warning must name hearsay rather than sentry sighting');
  assert.doesNotMatch(warning?.text ?? '', /봉수 신호/, 'diplomatic intelligence must not be attributed to a beacon');
}

{
  const migrated = migrations.migrateV66ToV67({ schemaVersion: 66, day: 12 });
  assert.equal(migrated.schemaVersion, 67);
  assert.deepEqual(migrated.ambientSpeech, {
    lastProcessedDay: 0,
    consumedSlotIds: [],
    deliveredRumorIds: [],
    recentLines: [],
    recentFacts: [],
    lastDietVarietyScore: 1,
  });
}

{
  const canvasSource = readFileSync(new URL('../../src/components/GameCanvas.tsx', import.meta.url), 'utf8');
  assert.match(canvasSource, /speechPositionAt\(frameAlpha\)/,
    'the speech bubble must reuse the canvas frame interpolation alpha');
  assert.match(canvasSource, /speechBubble\.style\.left/,
    'the RAF draw loop must update the live speech bubble position without waiting for React');
}

console.log('ambient speech tests passed');
