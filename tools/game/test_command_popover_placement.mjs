import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const sourceUrl = new URL('../../src/components/tactical/popoverPlacement.ts', import.meta.url);
const source = readFileSync(sourceUrl, 'utf8');
const outDir = mkdtempSync(join(tmpdir(), 'northern-command-popover-'));
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 },
}).outputText;
const outputPath = join(outDir, 'popoverPlacement.mjs');
writeFileSync(outputPath, output, 'utf8');
const { computeCommandPopoverPlacement } = await import(pathToFileURL(outputPath).href);

{
  const placed = computeCommandPopoverPlacement(
    { left: 250, top: 250, width: 100, height: 100 },
    { width: 600, height: 400 },
  );
  assert.deepEqual(placed, {
    x: 300, y: 240, placement: 'above', caretShift: 0, maxHeight: 232,
  }, 'a central unit uses all real space above it without caret shifting');
}

{
  const placed = computeCommandPopoverPlacement(
    { left: 0, top: 250, width: 40, height: 100 },
    { width: 600, height: 400 },
  );
  assert.equal(placed.x, 124, 'the popover stays eight pixels inside the left edge');
  assert.equal(placed.caretShift, -96, 'the caret is clamped inside the left rounded corner');
}

{
  const placed = computeCommandPopoverPlacement(
    { left: 580, top: 250, width: 40, height: 100 },
    { width: 600, height: 400 },
  );
  assert.equal(placed.x, 476, 'the popover stays eight pixels inside the right edge');
  assert.equal(placed.caretShift, 96, 'the right caret clamp mirrors the left edge');
}

{
  const placed = computeCommandPopoverPlacement(
    { left: 250, top: 90, width: 100, height: 40 },
    { width: 600, height: 400 },
  );
  assert.equal(placed.placement, 'below');
  assert.equal(placed.y, 140, 'below placement starts ten pixels after the unit bottom');
  assert.equal(placed.maxHeight, 252, 'below max height is the actual remaining shell space');
}

{
  const placed = computeCommandPopoverPlacement(
    { left: 150, top: 25, width: 100, height: 35 },
    { width: 400, height: 100 },
  );
  assert.equal(placed.placement, 'below', 'when both sides are constrained, the larger side wins');
  assert.equal(placed.maxHeight, 22, 'constrained placement never invents the 120px preferred minimum');
}

console.log('command popover placement tests passed');
