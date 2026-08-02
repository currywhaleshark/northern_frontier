// S2 지도 크기별 생성·초기화·대표 경로 비용 관측 도구. 시간은 보고만 하며 판정하지 않는다.
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import ts from 'typescript';

function compileGameModules() {
  const srcDir = new URL('../../src/game/', import.meta.url);
  const outDir = mkdtempSync(join(tmpdir(), 'northern-map-size-measure-'));
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

function measured(fn) {
  const started = performance.now();
  const value = fn();
  return { value, ms: Number((performance.now() - started).toFixed(3)) };
}

const outDir = compileGameModules();
try {
  const load = name => import(pathToFileURL(join(outDir, `${name}.mjs`)).href);
  const options = await load('newGameOptions');
  const map = await load('map');
  const simulation = await load('simulation');
  const agents = await load('agents');
  const seed = 20260802;
  const results = [];

  for (const mapSize of ['small', 'medium', 'large']) {
    const dimensions = options.mapDimensionsForSize(mapSize);
    const generated = measured(() => map.generateMap(seed, dimensions));
    const initialized = measured(() => simulation.newGameFromOptions({
      ...options.optionsForDifficulty('normal', '', seed), mapSize, seed,
    }));
    const state = initialized.value;
    const resident = state.residents.find(candidate => candidate.alive);
    const path = measured(() => agents.findPath(
      state,
      resident.x,
      resident.y,
      tile => tile.terrain === 'forest',
    ));
    results.push({
      mapSize,
      dimensions: `${dimensions.width}×${dimensions.height}`,
      tiles: dimensions.width * dimensions.height,
      generateMs: generated.ms,
      initializeMs: initialized.ms,
      pathMs: path.ms,
      pathLength: path.value?.length ?? 0,
    });
  }

  console.table(results);
  console.log(JSON.stringify({ seed, results }));
} finally {
  rmSync(outDir, { recursive: true, force: true });
}
