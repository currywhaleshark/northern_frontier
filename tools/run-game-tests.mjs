import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const toolsDir = dirname(fileURLToPath(import.meta.url));
const gameDir = join(toolsDir, 'game');
const tests = readdirSync(gameDir)
  .filter(file => file.startsWith('test_') && file.endsWith('.mjs'))
  .sort((a, b) => a.localeCompare(b));

const failures = [];
for (const test of tests) {
  process.stdout.write(`\n[game test] ${test}\n`);
  const result = spawnSync(process.execPath, [join(gameDir, test)], {
    cwd: join(toolsDir, '..'),
    stdio: 'inherit',
  });
  if (result.status !== 0) failures.push(test);
}

if (failures.length > 0) {
  process.stderr.write(`\nFailed game tests (${failures.length}):\n${failures.map(file => `- ${file}`).join('\n')}\n`);
  process.exitCode = 1;
} else {
  process.stdout.write(`\nAll ${tests.length} game tests passed.\n`);
}
