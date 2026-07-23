import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const NORMAL_40 = { frameSize: 40, footBaselineTolerance: 6, minTopPadding: 1, minSidePadding: 1 };
const RAISED_TOOL_40 = { ...NORMAL_40, minTopPadding: 0 };
const LARGE_64 = { frameSize: 64, footBaselineTolerance: 9, minTopPadding: 1, minSidePadding: 1 };
const OX_72 = { frameSize: 72, footBaselineTolerance: 11, minTopPadding: 1, minSidePadding: 1 };

const sheets = [
  ['resident-woodcutter-work-v1.png', 3, NORMAL_40],
  ['resident-woodcutter-locomotion-v1.png', 4, NORMAL_40],
  ['resident-woodcutter-load-v1.png', 4, NORMAL_40],
  ['resident-hunter-hunt-v1.png', 2, NORMAL_40],
  ['resident-hunter-locomotion-v1.png', 4, NORMAL_40],
  ['resident-hunter-load-v1.png', 4, NORMAL_40],
  ['resident-hauler-locomotion-v1.png', 3, NORMAL_40],
  ['resident-hauler-cart-locomotion-v1.png', 3, LARGE_64],
  ['resident-farmer-till-v1.png', 3, NORMAL_40],
  ['resident-farmer-harvest-v1.png', 3, NORMAL_40],
  ['resident-farmer-ox-plow-v1.png', 3, OX_72],
  ['resident-builder-locomotion-v1.png', 3, NORMAL_40],
  ['resident-builder-work-v1.png', 4, RAISED_TOOL_40],
  ['resident-miner-locomotion-v1.png', 3, NORMAL_40],
  ['resident-miner-work-v1.png', 3, NORMAL_40],
  ['resident-miner-load-v1.png', 3, NORMAL_40],
  ['resident-herbalist-locomotion-v1.png', 3, NORMAL_40],
  ['resident-herbalist-gather-v1.png', 4, NORMAL_40],
];

function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

function decodeRgbaPng(buffer, filename) {
  assert.equal(buffer.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', `${filename} PNG signature`);
  let offset = 8;
  let width = 0, height = 0, bitDepth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') idat.push(data);
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  assert.equal(bitDepth, 8, `${filename} uses 8-bit channels`);
  assert.equal(colorType, 6, `${filename} uses RGBA pixels`);
  assert.equal(interlace, 0, `${filename} uses non-interlaced scanlines`);

  const bytesPerPixel = 4;
  const stride = width * bytesPerPixel;
  const inflated = inflateSync(Buffer.concat(idat));
  assert.equal(inflated.length, (stride + 1) * height, `${filename} scanline length`);
  const rgba = Buffer.alloc(stride * height);
  let sourceOffset = 0;
  for (let y = 0; y < height; y++) {
    const filter = inflated[sourceOffset++];
    for (let x = 0; x < stride; x++) {
      const raw = inflated[sourceOffset++];
      const target = y * stride + x;
      const left = x >= bytesPerPixel ? rgba[target - bytesPerPixel] : 0;
      const up = y > 0 ? rgba[target - stride] : 0;
      const upperLeft = y > 0 && x >= bytesPerPixel ? rgba[target - stride - bytesPerPixel] : 0;
      if (filter === 0) rgba[target] = raw;
      else if (filter === 1) rgba[target] = (raw + left) & 0xff;
      else if (filter === 2) rgba[target] = (raw + up) & 0xff;
      else if (filter === 3) rgba[target] = (raw + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) rgba[target] = (raw + paeth(left, up, upperLeft)) & 0xff;
      else assert.fail(`${filename} unsupported PNG filter ${filter}`);
    }
  }
  return { width, height, rgba };
}

function analyzeCell(image, cellX, cellY, frameSize) {
  let minX = frameSize, minY = frameSize, maxX = -1, maxY = -1, alphaPixels = 0;
  const normalized = Buffer.alloc(frameSize * frameSize * 4);
  for (let y = 0; y < frameSize; y++) {
    for (let x = 0; x < frameSize; x++) {
      const source = ((cellY * frameSize + y) * image.width + cellX * frameSize + x) * 4;
      const target = (y * frameSize + x) * 4;
      const alpha = image.rgba[source + 3];
      normalized[target] = alpha === 0 ? 0 : image.rgba[source];
      normalized[target + 1] = alpha === 0 ? 0 : image.rgba[source + 1];
      normalized[target + 2] = alpha === 0 ? 0 : image.rgba[source + 2];
      normalized[target + 3] = alpha;
      if (alpha === 0) continue;
      alphaPixels++;
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
  }
  return {
    minX, minY, maxX, maxY, alphaPixels,
    hash: createHash('sha256').update(normalized).digest('hex'),
  };
}

const metrics = [];
for (const [filename, columns, config] of sheets) {
  const url = new URL(`../../public/assets/${filename}`, import.meta.url);
  assert.equal(existsSync(url), true, `${filename} exists`);
  const image = decodeRgbaPng(readFileSync(url), filename);
  assert.equal(image.width, columns * config.frameSize, `${filename} expected width`);
  assert.equal(image.height, 2 * config.frameSize, `${filename} has male and female rows`);

  const rowCells = [[], []];
  for (let row = 0; row < 2; row++) {
    for (let column = 0; column < columns; column++) {
      const cell = analyzeCell(image, column, row, config.frameSize);
      assert.ok(cell.alphaPixels > 0, `${filename} row ${row} frame ${column} is not empty`);
      assert.ok(cell.minX >= config.minSidePadding, `${filename} row ${row} frame ${column} does not bleed left`);
      assert.ok(cell.maxX <= config.frameSize - 1 - config.minSidePadding,
        `${filename} row ${row} frame ${column} does not bleed right`);
      assert.ok(cell.minY >= config.minTopPadding, `${filename} row ${row} frame ${column} head is not clipped`);
      rowCells[row].push(cell);
    }
    assert.ok(rowCells[row].some(cell => cell.alphaPixels > 0), `${filename} gender row ${row} is populated`);
    assert.equal(new Set(rowCells[row].map(cell => cell.hash)).size, columns,
      `${filename} gender row ${row} has no unintended identical animation cells`);
    const baselines = rowCells[row].map(cell => cell.maxY);
    assert.ok(Math.max(...baselines) - Math.min(...baselines) <= config.footBaselineTolerance,
      `${filename} gender row ${row} foot baseline stays within ${config.footBaselineTolerance}px`);
  }
  metrics.push({
    filename,
    frameSize: config.frameSize,
    maleBaselineRange: Math.max(...rowCells[0].map(cell => cell.maxY)) - Math.min(...rowCells[0].map(cell => cell.maxY)),
    femaleBaselineRange: Math.max(...rowCells[1].map(cell => cell.maxY)) - Math.min(...rowCells[1].map(cell => cell.maxY)),
  });
}

console.table(metrics);
console.log('resident sprite integrity tests passed');
