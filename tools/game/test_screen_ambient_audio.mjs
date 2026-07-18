import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const appSource = readFileSync(new URL('../../src/App.tsx', import.meta.url), 'utf8');
const sfxSource = readFileSync(new URL('../../src/sound/sfx.ts', import.meta.url), 'utf8');

assert.match(appSource,
  /import \{[^}]*stopWeatherAmbient[^}]*setWeatherAmbient[^}]*\} from ['"]\.\/sound\/sfx['"]/,
  'App must import an explicit weather stop operation alongside weather updates');

const generalSoundEffect = appSource.slice(
  appSource.indexOf('// 게임 상태 변화 → 효과음'),
  appSource.indexOf('const state = stateRef.current;'),
);
assert.doesNotMatch(generalSoundEffect, /setWeatherAmbient|stopWeatherAmbient/,
  'log and battle SFX inspection must not update weather ambient on every render');

const ambientEffect = appSource.slice(
  appSource.indexOf('// 화면 수명주기 → 날씨 앰비언트'),
  appSource.indexOf('// 직접 지휘를 시작하면'),
);
assert.match(ambientEffect,
  /if \(screen === 'game'\) setWeatherAmbient\(state\.weather\);[\s\S]*else stopWeatherAmbient\(\);/,
  'only the game screen may own the current weather ambient');
assert.match(ambientEffect, /\}, \[screen, state\.weather\]\);/,
  'weather ambient updates must be driven only by screen or actual weather changes');

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
