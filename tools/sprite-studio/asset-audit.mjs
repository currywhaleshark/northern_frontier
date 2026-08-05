import { readFileSync, readdirSync, statSync } from 'node:fs';
import { extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const TEXT_EXTENSIONS = new Set(['.css', '.html', '.js', '.json', '.mjs', '.ts', '.tsx']);
const SPRITE_EXTENSION = '.png';

const REPLACEMENTS = new Map([
  ['folk-terrain-objects-generated-v1.png', 'folk-terrain-objects-generated-v3.png'],
  ['folk-terrain-objects-generated-v2.png', 'folk-terrain-objects-generated-v3.png'],
  ['new-content-buildings-v1.png', 'new-content-buildings-v2.png'],
  ['new-content-buildings-large-v1.png', 'new-content-buildings-large-v2.png'],
  ['new-content-residents-v1.png', 'new-content-residents-v2.png'],
  ['oblique-buildings-1x1-v1.png', 'oblique-buildings-1x1-v2.png'],
  ['oblique-buildings-1x1-v1-hd.png', 'oblique-buildings-1x1-v2-hd.png'],
  ['oblique-buildings-2x2-v1.png', 'oblique-buildings-2x2-v2.png'],
  ['oblique-buildings-2x2-v1-hd.png', 'oblique-buildings-2x2-v2-hd.png'],
  ['resident-builder-work-v1.png', 'resident-builder-work-v2.png'],
  ['resident-farmer-video-walk-hd-v1.png', 'resident-approved-i2v-locomotion-hd-v1.png'],
  ['resident-hauler-cart-locomotion-v1.png', 'resident-hauler-cart-walk-v2.png'],
  ['resident-herbalist-gather-v1.png', 'resident-herbalist-gather-v2.png'],
  ['resident-hunter-load-v1.png', 'resident-hunter-load-v2.png'],
  ['resident-salt-maker-female-v1.png', 'resident-salt-maker-female-v2.png'],
  ['resident-salt-maker-female-hd-v1.png', 'resident-salt-maker-female-hd-v2.png'],
  ['resident-salt-maker-male-v1.png', 'resident-salt-maker-male-v2.png'],
  ['resident-salt-maker-male-hd-v1.png', 'resident-salt-maker-male-hd-v2.png'],
]);

function walkFiles(root) {
  const files = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(path));
    else files.push(path);
  }
  return files;
}

function pngDimensions(path) {
  const header = readFileSync(path).subarray(0, 24);
  if (header.length < 24 || header.subarray(1, 4).toString('ascii') !== 'PNG') return null;
  return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
}

function dynamicAssetNames(srcDir) {
  const names = new Map();
  const jigeSource = readFileSync(join(srcDir, 'render', 'residentJigeCargoAssets.ts'), 'utf8');
  for (const [, slug] of jigeSource.matchAll(/sheetPair\('([^']+)'\)/g)) {
    names.set(`resident-${slug}-jige-walk-v1.png`, 'residentJigeCargoAssets.ts 동적 지게 경로');
    names.set(`resident-${slug}-jige-walk-hd-v1.png`, 'residentJigeCargoAssets.ts 동적 HD 지게 경로');
  }

  const atlasSource = readFileSync(join(srcDir, 'render', 'atlas.ts'), 'utf8');
  const versionBlock = atlasSource.match(/SEAMLESS_GROUND_VERSIONS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? '';
  const versions = new Map([...versionBlock.matchAll(/(plain|forest|rock):\s*'([^']+)'/g)]
    .map(([, family, version]) => [family, version]));
  for (const [family, version] of versions) {
    for (const season of ['spring', 'summer', 'autumn', 'winter']) {
      names.set(`folk-warm-${family}-${season}-seamless-${version}-standard-448px.png`,
        'atlas.ts 동적 계절 지형 경로');
      names.set(`folk-warm-${family}-${season}-seamless-${version}-hd-896px.png`,
        'atlas.ts 동적 계절 HD 지형 경로');
    }
  }
  return names;
}

export function auditRootSpriteAssets(root) {
  const projectRoot = resolve(root);
  const srcDir = join(projectRoot, 'src');
  const assetDir = join(projectRoot, 'public', 'assets');
  const sourceFiles = walkFiles(srcDir).filter(path => TEXT_EXTENSIONS.has(extname(path).toLowerCase()));
  const sourceTexts = sourceFiles.map(path => ({
    path: relative(projectRoot, path).replaceAll('\\', '/'),
    text: readFileSync(path, 'utf8'),
  }));
  const dynamic = dynamicAssetNames(srcDir);
  const assets = readdirSync(assetDir, { withFileTypes: true })
    .filter(entry => entry.isFile() && extname(entry.name).toLowerCase() === SPRITE_EXTENSION)
    .map(entry => {
      const path = join(assetDir, entry.name);
      const references = sourceTexts.filter(source => source.text.includes(entry.name)).map(source => source.path);
      const dynamicReason = dynamic.get(entry.name);
      const status = references.length > 0 ? 'used' : dynamicReason ? 'dynamic' : 'unused';
      return {
        name: entry.name,
        src: `/assets/${entry.name}`,
        bytes: statSync(path).size,
        dimensions: pngDimensions(path),
        status,
        reason: references.length > 0
          ? `${references.length}개 src 파일에서 직접 참조`
          : dynamicReason ?? 'src 런타임 코드·매니페스트 참조 없음',
        references,
        replacement: REPLACEMENTS.get(entry.name) ?? null,
      };
    })
    .sort((a, b) => a.status.localeCompare(b.status) || a.name.localeCompare(b.name));

  return {
    generatedAt: new Date().toISOString(),
    scope: 'public/assets/*.png',
    assets,
    summary: {
      total: assets.length,
      used: assets.filter(asset => asset.status === 'used').length,
      dynamic: assets.filter(asset => asset.status === 'dynamic').length,
      unused: assets.filter(asset => asset.status === 'unused').length,
      unusedBytes: assets.filter(asset => asset.status === 'unused').reduce((sum, asset) => sum + asset.bytes, 0),
    },
  };
}

if (process.argv[1] && resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  const root = resolve(process.argv[2] ?? '.');
  const report = auditRootSpriteAssets(root);
  console.log(JSON.stringify(report, null, 2));
}
