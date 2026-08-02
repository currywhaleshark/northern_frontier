import { spawn } from 'node:child_process';
import { availableParallelism } from 'node:os';
import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { GAME_TEST_SUITE_NAMES, resolveGameTestSuites } from './game-test-suites.mjs';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const gameDir = join(toolsDir, 'game');
const allTests = readdirSync(gameDir)
  .filter(file => file.startsWith('test_') && file.endsWith('.mjs'))
  .sort((a, b) => a.localeCompare(b));
const suites = resolveGameTestSuites(allTests);

let requestedSuite = null;
let listSuites = false;
const filters = [];
for (let index = 0; index < process.argv.slice(2).length; index++) {
  const argument = process.argv.slice(2)[index];
  if (argument === '--list-suites') {
    listSuites = true;
  } else if (argument === '--suite') {
    requestedSuite = process.argv.slice(2)[++index] ?? '';
  } else if (argument.startsWith('--suite=')) {
    requestedSuite = argument.slice('--suite='.length);
  } else {
    filters.push(argument.toLowerCase());
  }
}

if (listSuites) {
  for (const suite of GAME_TEST_SUITE_NAMES) process.stdout.write(`${suite}: ${suites[suite].length}\n`);
  process.exit(0);
}

const suiteName = requestedSuite ?? (filters.length > 0 ? 'full' : 'core');
if (!GAME_TEST_SUITE_NAMES.includes(suiteName)) {
  process.stderr.write(`Unknown game test suite: ${suiteName}\nAvailable: ${GAME_TEST_SUITE_NAMES.join(', ')}\n`);
  process.exit(1);
}

const tests = suites[suiteName]
  .filter(file => filters.length === 0 || filters.some(filter => file.toLowerCase().includes(filter)));

if (tests.length === 0) {
  process.stderr.write(`No game tests matched: ${filters.join(', ')}\n`);
  process.exit(1);
}

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

const workerCount = Math.min(
  tests.length,
  positiveInteger(process.env.GAME_TEST_WORKERS, Math.min(4, availableParallelism())),
);
const timeoutMs = positiveInteger(process.env.GAME_TEST_TIMEOUT_MS, 60_000);
const results = new Array(tests.length);
let nextTestIndex = 0;

function runTest(test) {
  return new Promise(resolve => {
    const startedAt = performance.now();
    const child = spawn(process.execPath, [join(gameDir, test)], {
      cwd: join(toolsDir, '..'),
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    let spawnError = null;

    child.stdout.on('data', chunk => stdout.push(chunk));
    child.stderr.on('data', chunk => stderr.push(chunk));
    child.on('error', error => {
      spawnError = error;
    });

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.on('close', (status, signal) => {
      clearTimeout(timeout);
      resolve({
        test,
        status,
        signal,
        timedOut,
        spawnError,
        stdout: Buffer.concat(stdout).toString('utf8'),
        stderr: Buffer.concat(stderr).toString('utf8'),
        durationMs: performance.now() - startedAt,
      });
    });
  });
}

function printResult(result, completedCount) {
  const duration = (result.durationMs / 1000).toFixed(1);
  const prefix = `[${completedCount}/${tests.length}]`;
  if (result.status === 0 && !result.timedOut) {
    process.stdout.write(`${prefix} PASS ${result.test} (${duration}s)\n`);
    return;
  }

  const outcome = result.timedOut ? `TIMEOUT after ${duration}s` : `FAIL (${duration}s)`;
  process.stderr.write(`\n${prefix} ${outcome} ${result.test}\n`);
  if (result.stdout) process.stderr.write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
  if (result.stderr) process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
  if (result.spawnError) process.stderr.write(`${result.spawnError.stack ?? result.spawnError}\n`);
  if (result.signal && !result.timedOut) process.stderr.write(`Terminated by signal ${result.signal}\n`);
}

async function worker() {
  while (nextTestIndex < tests.length) {
    const testIndex = nextTestIndex;
    nextTestIndex += 1;
    const result = await runTest(tests[testIndex]);
    results[testIndex] = result;
    const completedCount = results.filter(Boolean).length;
    printResult(result, completedCount);
  }
}

process.stdout.write(
  `Running ${tests.length} ${suiteName} game tests with ${workerCount} workers and a ${timeoutMs}ms per-test timeout.\n`,
);
await Promise.all(Array.from({ length: workerCount }, () => worker()));

const failures = results.filter(result => result.status !== 0 || result.timedOut);
if (failures.length > 0) {
  process.stderr.write(
    `\nFailed game tests (${failures.length}):\n${failures
      .map(result => `- ${result.test}${result.timedOut ? ' (timeout)' : ''}`)
      .join('\n')}\n`,
  );
  process.exitCode = 1;
} else {
  process.stdout.write(`\nAll ${tests.length} game tests passed.\n`);
}
