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

const rootDir = mkdtempSync(join(tmpdir(), 'northern-command-presentation-'));
const gameDir = join(rootDir, 'game');
const componentDir = join(rootDir, 'components', 'tactical');
mkdirSync(gameDir, { recursive: true });
mkdirSync(componentDir, { recursive: true });
const gameSourceDir = new URL('../../src/game/', import.meta.url);
for (const file of readdirSync(gameSourceDir).filter(file => file.endsWith('.ts'))) {
  const source = readFileSync(new URL(file, gameSourceDir), 'utf8');
  writeFileSync(join(gameDir, file.replace(/\.ts$/, '.mjs')), transpile(source), 'utf8');
}
const presentationSource = readFileSync(
  new URL('../../src/components/tactical/commandPresentation.ts', import.meta.url),
  'utf8',
);
writeFileSync(join(componentDir, 'commandPresentation.mjs'), transpile(presentationSource), 'utf8');

const {
  TACTICAL_QUICK_COMMAND_LIMIT,
  tacticalAvailableCommands,
  tacticalCommandPresentation,
  tacticalQuickCommands,
} = await import(pathToFileURL(join(componentDir, 'commandPresentation.mjs')).href);

const zones = [
  { id: 'approach', order: 0 },
  { id: 'wall', order: 1 },
  { id: 'storehouse', order: 2 },
  { id: 'center', order: 3 },
];

function defender(overrides = {}) {
  return {
    id: 'spears',
    kind: 'militia-spear',
    role: 'militia',
    weapon: 'spear',
    label: '창 수비대',
    residentIds: [1, 2, 3, 4],
    count: 4,
    zoneId: 'wall',
    command: 'hold',
    commandSource: 'recommended',
    power: 10,
    wounded: 0,
    killed: 0,
    line: 'middle',
    ...overrides,
  };
}

function raider(overrides = {}) {
  return {
    id: 'flankers',
    kind: 'flankers',
    label: '우회대',
    zoneId: 'wall',
    line: 'front',
    targetZoneId: 'center',
    power: 8,
    count: 4,
    killed: 0,
    intent: 'advance',
    ...overrides,
  };
}

function defenseBattle(groups, raiders = []) {
  return {
    orientation: 'defense',
    zones,
    defenderGroups: groups,
    raiderGroups: raiders,
  };
}

function assertPartition(battle, group) {
  const available = tacticalAvailableCommands(battle, group);
  const { quick, more } = tacticalCommandPresentation(battle, group);
  assert.ok(quick.length <= TACTICAL_QUICK_COMMAND_LIMIT, 'quick commands must never exceed four');
  assert.equal(new Set(quick).size, quick.length, 'quick commands must not contain duplicates');
  assert.equal(new Set(more).size, more.length, 'more commands must not contain duplicates');
  assert.equal(quick.some(command => more.includes(command)), false,
    'quick and more command lists must not overlap');
  assert.deepEqual([...quick, ...more].sort(), [...available].sort(),
    'quick and more commands together must contain every available command');
  return { available, quick, more };
}

{
  const group = defender({ command: 'advance', commandSource: 'player' });
  const battle = defenseBattle([group], [raider({ rearAssault: true, engagementsInZone: 1 })]);
  const { quick, more } = assertPartition(battle, group);
  assert.equal(quick[0], 'reinforceRear', 'urgent rear reinforcement must precede ordinary commands');
  assert.ok(quick.includes('advance'), 'a valid current player command must remain in the quick list');
  assert.ok(!quick.includes('volley') && !more.includes('volley'),
    'an unavailable command must be absent from both presentation lists');
}

{
  const group = defender({ zoneId: 'storehouse' });
  const civilian = defender({
    id: 'civilians',
    kind: 'civilian',
    role: 'civilian',
    weapon: null,
    label: '피난 주민',
    zoneId: 'storehouse',
    command: null,
    commandSource: undefined,
    commandable: false,
  });
  const battle = defenseBattle([group, civilian]);
  const { quick } = assertPartition(battle, group);
  assert.deepEqual(quick.slice(0, 2), ['guardStorehouse', 'protectCivilians'],
    'storehouse guard and civilian protection must lead in their shared context');
}

{
  const group = defender();
  const battle = {
    orientation: 'assault',
    assaultKind: 'banditLair',
    zones,
    defenderGroups: [group],
    raiderGroups: [],
    prepActions: [],
  };
  const { quick, more } = assertPartition(battle, group);
  assert.ok(!quick.includes('openRetreat'), 'voluntary withdrawal belongs in More by default');
  assert.ok(more.includes('openRetreat'), 'More must retain the available voluntary withdrawal action');
}

{
  const group = defender({
    id: 'bows',
    kind: 'militia-bow',
    weapon: 'hornBow',
    command: null,
    commandSource: undefined,
  });
  const battle = {
    orientation: 'assault',
    assaultKind: 'predatorHunt',
    huntPredatorState: 'hidden',
    zones,
    defenderGroups: [group],
    raiderGroups: [],
  };
  assert.equal(tacticalQuickCommands(battle, group)[0], 'volley',
    'a ranged hunting group must surface volley as its representative action');
  assertPartition(battle, group);
}

console.log('tactical command presentation tests passed');
