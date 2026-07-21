import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const sfxSource = readFileSync(new URL('../../src/sound/sfx.ts', import.meta.url), 'utf8');

assert.match(appSource,
  /import \{[^}]*stopWeatherAmbient[^}]*setWeatherAmbient[^}]*\} from ['"]\.\/sound\/sfx['"]/,
  'App must import an explicit weather stop operation alongside weather updates');

const generalSoundEffect = appSource.slice(
  appSource.indexOf('// 관리 UI snapshot과 같은 cadence로 게임 상태 효과를 동기화한다.'),
  appSource.indexOf('setWeatherAmbient(state.weather);'),
);
assert.doesNotMatch(generalSoundEffect, /setWeatherAmbient|stopWeatherAmbient/,
  'log and battle SFX inspection must not update weather ambient on every snapshot');

const ambientEffect = appSource.slice(
  Math.max(0, appSource.indexOf('setWeatherAmbient(state.weather);') - 40),
  appSource.indexOf('  return null;\n}', appSource.indexOf('function RuntimeGameEffects')),
);
assert.match(ambientEffect,
  /setWeatherAmbient\(state\.weather\);[\s\S]*\}, \[state\.weather\]\);/,
  'the mounted game runtime boundary owns weather updates');
assert.match(ambientEffect, /useEffect\(\(\) => \(\) => stopWeatherAmbient\(\), \[\]\);/,
  'leaving the game screen must stop ambient when the runtime boundary unmounts');
assert.ok(appSource.indexOf("if (screen === 'menu')") < appSource.indexOf('<RuntimeGameEffects'),
  'the runtime effects boundary must only mount after the menu early return');

assert.match(sfxSource, /export function stopWeatherAmbient\(\): void \{/,
  'the sound layer must expose an explicit menu-transition stop');
const stopSource = sfxSource.slice(
  sfxSource.indexOf('export function stopWeatherAmbient'),
  sfxSource.indexOf('export function setWeatherAmbient'),
);
assert.match(stopSource,
  /windTarget = 0;[\s\S]*cancelScheduledValues\(now\);[\s\S]*setValueAtTime\(0, now\);/,
  'menu transition must cancel the old envelope and silence it immediately');
assert.doesNotMatch(stopSource, /initAudio|new AudioContext|startWindLoop|createGain/,
  'stopping ambient must reuse the existing context and nodes');

assert.match(appSource,
  /const enterGameWith = \(state: GameState\)[\s\S]*stateRef\.current = state;[\s\S]*setScreen\('game'\);/,
  'new games must install their state before the game screen requests ambient');
assert.match(appSource,
  /const handleLoadFromSlot[\s\S]*stateRef\.current = loaded;[\s\S]*setScreen\('game'\);/,
  'loaded games must install their weather before the game screen requests ambient');
assert.match(sfxSource, /export function setMuted[\s\S]*localStorage\.setItem\('buksae-muted'/,
  'screen transitions must leave the persisted mute policy intact');

console.log('screen ambient audio lifecycle tests passed');
