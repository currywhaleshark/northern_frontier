import assert from 'node:assert/strict';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRootSpriteAssets } from '../sprite-studio/asset-audit.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const report = auditRootSpriteAssets(ROOT);
const byName = new Map(report.assets.map(asset => [asset.name, asset]));

assert.equal(report.scope, 'public/assets/*.png');
assert.ok(report.summary.total >= 180, '루트 PNG 인벤토리가 지나치게 작다');
assert.equal(byName.get('resident-fisher-mudflat-work-v1.png')?.status, 'used');
assert.equal(byName.get('resident-hauler-jige-walk-v1.png')?.status, 'dynamic');
assert.equal(byName.get('folk-warm-plain-winter-seamless-v3-hd-896px.png')?.status, 'dynamic');
assert.equal(byName.get('resident-builder-work-v1.png')?.status, 'unused');
assert.equal(byName.get('resident-builder-work-v1.png')?.replacement, 'resident-builder-work-v2.png');
assert.equal(byName.get('resident-miner-load-v1.png')?.status, 'unused');
assert.ok(report.summary.unused >= 19, '알려진 레거시 후보가 감사에서 빠졌다');

console.log(`sprite studio asset audit passed: ${report.summary.unused}/${report.summary.total} unused`);
