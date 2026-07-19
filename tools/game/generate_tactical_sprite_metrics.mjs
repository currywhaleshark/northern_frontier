// 전술 전투 스프라이트 시트를 분석해 셀별 표시 배율(머리 크기 기준)과
// 발끝 기준선 보정값을 산출한다. 결과는 src/render/tacticalSpriteMetrics.ts로 생성된다.
//
// 사용법:
//   node tools/game/generate_tactical_sprite_metrics.mjs [--debug <출력 디렉터리>]
//
// --debug를 주면 머리(빨강)·전신(초록) 검출 박스를 그린 오버레이 PNG를 함께 저장한다.
//
// 머리 검출은 기본적으로 내장 휴리스틱을 쓰지만, tools/game/head-boxes/<시트키>.json이
// 있으면 그 좌표(비전 모델이 출력한 box_2d, 이미지 전체 기준 0~1000 정규화)를 우선 사용한다.
// 프롬프트와 파일 형식은 tools/game/head-boxes/PROMPT.md 참고.
import { deflateSync, inflateSync } from 'node:zlib';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

// columnGroups: 열별 체형 그룹. 여성(f)은 남성(m, 기본값)보다 머리가 작게
// 그려져 있어, 전체를 한 기준으로 맞추면 남성이 작아진다. 그룹별 중앙값을
// 각자의 기준으로 써서 시트에 그려진 체형 비례를 유지한다.
const SHEETS = [
  {
    key: 'defenderRoles',
    src: 'public/assets/tactical/defender-roles-poses-v2.png',
    cellWidth: 84, cellHeight: 120, columns: 8, rows: 4,
    columnGroups: { 1: 'f', 3: 'f', 5: 'f', 7: 'f' },
  },
  {
    key: 'defenderWeapons',
    src: 'public/assets/tactical/defender-weapons-poses-v2.png',
    cellWidth: 84, cellHeight: 120, columns: 6, rows: 4,
    columnGroups: { 1: 'f', 3: 'f', 5: 'f' },
  },
  {
    key: 'healers',
    src: 'public/assets/tactical/defender-healers-poses-v1.png',
    cellWidth: 84, cellHeight: 120, columns: 2, rows: 4,
    columnGroups: { 1: 'f' },
  },
  {
    key: 'specialResidents',
    src: 'public/assets/tactical/special-resident-combat-poses-v1.png',
    cellWidth: 84, cellHeight: 120, columns: 4, rows: 4,
    columnGroups: { 2: 'f' },
  },
  {
    key: 'defenderDefaultWeapons',
    src: 'public/assets/tactical/defender-default-weapons-poses-v1.png',
    cellWidth: 84, cellHeight: 120, columns: 6, rows: 4,
    columnGroups: { 1: 'f', 3: 'f', 5: 'f' },
  },
  {
    key: 'raiders',
    src: 'public/assets/tactical/faction-raiders-poses-v2.png',
    cellWidth: 168, cellHeight: 120, columns: 6, rows: 4,
  },
  {
    key: 'court',
    src: 'public/assets/tactical/court-army-poses-v2.png',
    cellWidth: 168, cellHeight: 120, columns: 5, rows: 4,
  },
];

const ALPHA_THRESHOLD = 50;
// 머리로 인정할 최소 가로폭(px). 치켜든 창대·활 끝 같은 가는 형체를 걸러낸다.
const MIN_HEAD_RUN_WIDTH = 9;
// 머리(모자·투구 포함)로 볼 수 있는 최대 가로폭. 이보다 넓은 런은 수평 무기·팔이다.
const MAX_HEAD_RUN_WIDTH = 40;
// 머리 중심에서 이 이상 벗어난 픽셀은 머리가 아니라 이어진 무기·어깨로 본다.
const HEAD_SPAN_HALF = 23;
// 머리 탐색 시 몸통 중심에서 허용하는 가로 오프셋.
const HEAD_CENTER_WINDOW = { narrow: 16, wide: 30 };
// max 1.9: 공격(창 내지르기) 포즈처럼 가로로 길게 그려져 원본이 작은 셀을
// 대기 포즈 크기까지 끌어올리는 데 최대 1.89가 필요하다.
const SCALE_CLAMP = { min: 0.72, max: 1.9 };
// 내장 휴리스틱은 비전 박스보다 오차가 커서 배율을 보수적으로 제한한다.
// (비전 박스가 준비되면 SCALE_CLAMP 범위까지 허용된다.)
const HEURISTIC_SCALE_CLAMP = { min: 0.82, max: 1.15 };
// 표시 시 발끝을 셀 바닥에서 이만큼 띄운다.
const BASELINE_INSET = 2;
// 비전 모델이 출력한 머리 박스 JSON을 두는 곳.
const HEAD_BOXES_DIR = 'tools/game/head-boxes';
// 아군 3개 시트는 같은 화풍이라 공통 기준으로 정규화한다. 적 시트(마적·관군)는
// 화풍(신체 비례)이 달라 아군 머리 크기에 맞추면 전체가 거대해지므로,
// 각 시트 자신의 중앙값을 기준으로 포즈·캐릭터 간 편차만 고르게 잡는다.
const DEFENDER_REFERENCE_SHEET_KEYS = ['defenderRoles', 'defenderWeapons', 'defenderDefaultWeapons'];
const DEFENDER_SHEET_KEYS = [...DEFENDER_REFERENCE_SHEET_KEYS, 'healers', 'specialResidents'];

// ---------------------------------------------------------------- PNG 디코딩

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  return pb <= pc ? b : c;
}

function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('PNG 시그니처가 아닙니다');
  let offset = 8;
  let header = null;
  let palette = null;
  let transparency = null;
  const idatParts = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      header = {
        width: data.readUInt32BE(0),
        height: data.readUInt32BE(4),
        bitDepth: data[8],
        colorType: data[9],
        interlace: data[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(data);
    else if (type === 'tRNS') transparency = Buffer.from(data);
    else if (type === 'IDAT') idatParts.push(Buffer.from(data));
    else if (type === 'IEND') break;
    offset += 12 + length;
  }
  if (!header) throw new Error('IHDR 없음');
  if (header.bitDepth !== 8 || header.interlace !== 0) {
    throw new Error(`지원하지 않는 PNG 형식 (bitDepth=${header.bitDepth}, interlace=${header.interlace})`);
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[header.colorType];
  if (channels == null) throw new Error(`지원하지 않는 colorType=${header.colorType}`);
  const raw = inflateSync(Buffer.concat(idatParts));
  const stride = header.width * channels;
  const out = Buffer.alloc(header.height * stride);
  for (let y = 0; y < header.height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const rowStart = y * (stride + 1) + 1;
    for (let x = 0; x < stride; x += 1) {
      const rawByte = raw[rowStart + x];
      const left = x >= channels ? out[y * stride + x - channels] : 0;
      const up = y > 0 ? out[(y - 1) * stride + x] : 0;
      const upLeft = y > 0 && x >= channels ? out[(y - 1) * stride + x - channels] : 0;
      let value;
      if (filter === 0) value = rawByte;
      else if (filter === 1) value = rawByte + left;
      else if (filter === 2) value = rawByte + up;
      else if (filter === 3) value = rawByte + ((left + up) >> 1);
      else if (filter === 4) value = rawByte + paethPredictor(left, up, upLeft);
      else throw new Error(`알 수 없는 필터 ${filter}`);
      out[y * stride + x] = value & 0xff;
    }
  }
  // RGBA로 정규화
  const rgba = Buffer.alloc(header.width * header.height * 4);
  for (let index = 0; index < header.width * header.height; index += 1) {
    const src = index * channels;
    if (header.colorType === 6) {
      rgba[index * 4] = out[src];
      rgba[index * 4 + 1] = out[src + 1];
      rgba[index * 4 + 2] = out[src + 2];
      rgba[index * 4 + 3] = out[src + 3];
    } else if (header.colorType === 2) {
      rgba[index * 4] = out[src];
      rgba[index * 4 + 1] = out[src + 1];
      rgba[index * 4 + 2] = out[src + 2];
      rgba[index * 4 + 3] = 255;
    } else if (header.colorType === 3) {
      const paletteIndex = out[src];
      rgba[index * 4] = palette[paletteIndex * 3];
      rgba[index * 4 + 1] = palette[paletteIndex * 3 + 1];
      rgba[index * 4 + 2] = palette[paletteIndex * 3 + 2];
      rgba[index * 4 + 3] = transparency && paletteIndex < transparency.length ? transparency[paletteIndex] : 255;
    } else if (header.colorType === 4) {
      rgba[index * 4] = rgba[index * 4 + 1] = rgba[index * 4 + 2] = out[src];
      rgba[index * 4 + 3] = out[src + 1];
    } else {
      rgba[index * 4] = rgba[index * 4 + 1] = rgba[index * 4 + 2] = out[src];
      rgba[index * 4 + 3] = 255;
    }
  }
  return { width: header.width, height: header.height, data: rgba };
}

// ---------------------------------------------------------------- PNG 인코딩(디버그용)

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let crc = -1;
  for (let index = 0; index < buffer.length; index += 1) {
    crc = CRC_TABLE[(crc ^ buffer[index]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ -1) >>> 0;
}

function pngChunk(type, data) {
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  chunk.write(type, 4, 'ascii');
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(chunk.subarray(4, 8 + data.length)), 8 + data.length);
  return chunk;
}

function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y += 1) {
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------- 셀 분석

function cellAlpha(image, sheet, column, row) {
  const { cellWidth, cellHeight } = sheet;
  const alpha = new Uint8Array(cellWidth * cellHeight);
  const baseX = column * cellWidth;
  const baseY = row * cellHeight;
  for (let y = 0; y < cellHeight; y += 1) {
    for (let x = 0; x < cellWidth; x += 1) {
      alpha[y * cellWidth + x] = image.data[((baseY + y) * image.width + baseX + x) * 4 + 3];
    }
  }
  return alpha;
}

function opaqueRuns(alpha, width, y) {
  const runs = [];
  let start = -1;
  for (let x = 0; x <= width; x += 1) {
    const opaque = x < width && alpha[y * width + x] >= ALPHA_THRESHOLD;
    if (opaque && start < 0) start = x;
    if (!opaque && start >= 0) {
      runs.push({ start, end: x });
      start = -1;
    }
  }
  return runs;
}

function analyzeCell(alpha, width, height) {
  let top = -1;
  let bottom = -1;
  let left = width;
  let right = -1;
  let weightSum = 0;
  let weightedX = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const value = alpha[y * width + x];
      if (value < ALPHA_THRESHOLD) continue;
      if (top < 0) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
      weightSum += value;
      weightedX += value * x;
    }
  }
  if (top < 0) return null;
  const centerX = weightedX / weightSum;

  // 몸통 중심 부근에서 일정 폭 이상 이어지는 첫 가로 구간을 머리 시작으로 본다.
  // (투구·모자는 포함되고, 치켜든 창대나 깃대는 가늘거나 중심을 벗어나 걸러진다.)
  const headRowRun = y => {
    let best = null;
    for (const run of opaqueRuns(alpha, width, y)) {
      const runWidth = run.end - run.start;
      if (runWidth < MIN_HEAD_RUN_WIDTH) continue;
      if (run.end <= centerX - currentWindow || run.start >= centerX + currentWindow) continue;
      if (!best || runWidth > best.end - best.start) best = run;
    }
    return best;
  };
  const headRowWidth = y => {
    const run = headRowRun(y);
    return run ? run.end - run.start : 0;
  };

  let currentWindow = HEAD_CENTER_WINDOW.narrow;
  const searchLimit = top + Math.floor((bottom - top) * 0.55);
  const findHeadTop = () => {
    for (let y = top; y <= searchLimit; y += 1) {
      const width0 = headRowWidth(y);
      // 폭 상한: 수평으로 든 창·총이 지나가는 줄을 머리 시작으로 잡지 않는다.
      if (width0 < MIN_HEAD_RUN_WIDTH || width0 > MAX_HEAD_RUN_WIDTH) continue;
      if (headRowWidth(y + 1) < MIN_HEAD_RUN_WIDTH || headRowWidth(y + 2) < MIN_HEAD_RUN_WIDTH) continue;
      // 활 가지·깃대 등 가늘고 긴 형체를 배제: 몇 줄 안에 두상 폭으로 커져야 한다.
      let grows = false;
      for (let probe = y; probe <= y + 8; probe += 1) {
        const probeWidth = headRowWidth(probe);
        if (probeWidth >= 15 && probeWidth <= MAX_HEAD_RUN_WIDTH) { grows = true; break; }
      }
      if (grows) return y;
    }
    return -1;
  };
  let headTop = findHeadTop();
  if (headTop < 0) {
    // 포신 옆에 선 포병처럼 인물이 중심에서 벗어난 셀은 창을 넓혀 재시도.
    currentWindow = HEAD_CENTER_WINDOW.wide;
    headTop = findHeadTop();
  }
  if (headTop < 0) {
    return { top, bottom, left, right, centerX, headTop: null, headBottom: null, headWidth: null };
  }

  // 머리 중심: 머리 시작 줄 런의 중앙. 이후 줄은 이 중심을 포함하는 런만 따라간다.
  const topRun = headRowRun(headTop);
  const headCenter = (topRun.start + topRun.end) / 2;

  // 두상 돔을 따라 내려가며 줄별 폭(모자·투구 포함)을 수집한다.
  // 수평으로 든 무기·팔이 몇 줄 병합되어도 중앙값이라 크게 흔들리지 않는다.
  const rowWidths = [Math.min(topRun.end, headCenter + HEAD_SPAN_HALF) - Math.max(topRun.start, headCenter - HEAD_SPAN_HALF)];
  let headBottom = headTop;
  let headLeft = topRun.start;
  let headRight = topRun.end;
  for (let y = headTop + 1; y <= Math.min(bottom, headTop + 22); y += 1) {
    let run = null;
    for (const candidate of opaqueRuns(alpha, width, y)) {
      if (candidate.start <= headCenter && candidate.end >= headCenter) { run = candidate; break; }
    }
    if (!run) break;
    // 중심 좌우 허용 범위로 잘라낸 폭만 머리로 계산 (창·총 merge 방지)
    const clippedStart = Math.max(run.start, Math.ceil(headCenter - HEAD_SPAN_HALF));
    const clippedEnd = Math.min(run.end, Math.floor(headCenter + HEAD_SPAN_HALF));
    const rowWidth = clippedEnd - clippedStart;
    if (rowWidth < MIN_HEAD_RUN_WIDTH) break;
    // 양쪽 모두 허용 범위를 넘겨 뻗으면 어깨/팔 시작으로 보고 끝낸다.
    if (run.start < headCenter - HEAD_SPAN_HALF && run.end > headCenter + HEAD_SPAN_HALF) break;
    rowWidths.push(rowWidth);
    if (clippedStart < headLeft) headLeft = clippedStart;
    if (clippedEnd > headRight) headRight = clippedEnd;
    headBottom = y;
  }
  const sortedWidths = [...rowWidths].sort((a, b) => a - b);
  const headWidth = sortedWidths[Math.floor(sortedWidths.length / 2)];
  return { top, bottom, left, right, centerX, headTop, headBottom, headLeft, headRight, headWidth };
}

// ---------------------------------------------------------------- 메트릭 계산

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

// 비전 모델이 출력한 머리 박스 JSON을 읽어 셀별 머리 높이(px) 행렬로 변환한다.
// 형식: [{"label":"r0c0","box_2d":[ymin,xmin,ymax,xmax]}, ...] (이미지 전체 기준 0~1000)
function loadHeadBoxes(sheet) {
  const path = join(ROOT, HEAD_BOXES_DIR, `${sheet.key}.json`);
  if (!existsSync(path)) return null;
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  const entries = Array.isArray(parsed) ? parsed : parsed.boxes;
  if (!Array.isArray(entries)) throw new Error(`${path}: 배열 형식이 아닙니다`);
  const imageWidth = sheet.cellWidth * sheet.columns;
  const imageHeight = sheet.cellHeight * sheet.rows;
  const heights = Array.from({ length: sheet.rows }, () => new Array(sheet.columns).fill(null));
  const rects = Array.from({ length: sheet.rows }, () => new Array(sheet.columns).fill(null));
  for (const entry of entries) {
    if (!entry?.box_2d) continue;
    const [yMin, xMin, yMax, xMax] = entry.box_2d;
    const centerX = (xMin + xMax) / 2 / 1000 * imageWidth;
    const centerY = (yMin + yMax) / 2 / 1000 * imageHeight;
    const column = Math.min(sheet.columns - 1, Math.max(0, Math.floor(centerX / sheet.cellWidth)));
    const row = Math.min(sheet.rows - 1, Math.max(0, Math.floor(centerY / sheet.cellHeight)));
    const labelMatch = /^r(\d+)c(\d+)$/.exec(entry.label ?? '');
    if (labelMatch && (Number(labelMatch[1]) !== row || Number(labelMatch[2]) !== column)) {
      console.warn(`경고: ${sheet.key} ${entry.label} 라벨과 박스 위치(r${row}c${column})가 다릅니다. 위치를 우선합니다.`);
    }
    if (heights[row][column] != null) continue;
    heights[row][column] = (yMax - yMin) / 1000 * imageHeight;
    rects[row][column] = {
      left: Math.round(xMin / 1000 * imageWidth) - column * sheet.cellWidth,
      top: Math.round(yMin / 1000 * imageHeight) - row * sheet.cellHeight,
      right: Math.round(xMax / 1000 * imageWidth) - column * sheet.cellWidth,
      bottom: Math.round(yMax / 1000 * imageHeight) - row * sheet.cellHeight,
    };
  }
  let missing = 0;
  for (let row = 0; row < sheet.rows; row += 1) {
    for (let column = 0; column < sheet.columns; column += 1) {
      if (heights[row][column] == null) missing += 1;
    }
  }
  if (missing > 0) console.warn(`경고: ${sheet.key} 머리 박스 ${missing}개 칸 누락 — 해당 칸은 휴리스틱으로 대체합니다.`);
  return { heights, rects };
}

function main() {
  const debugFlagIndex = process.argv.indexOf('--debug');
  const debugDir = debugFlagIndex >= 0 ? process.argv[debugFlagIndex + 1] : null;

  const analyses = new Map();
  for (const sheet of SHEETS) {
    const image = decodePng(readFileSync(join(ROOT, sheet.src)));
    const cells = [];
    for (let row = 0; row < sheet.rows; row += 1) {
      const rowCells = [];
      for (let column = 0; column < sheet.columns; column += 1) {
        const alpha = cellAlpha(image, sheet, column, row);
        rowCells.push(analyzeCell(alpha, sheet.cellWidth, sheet.cellHeight));
      }
      cells.push(rowCells);
    }
    analyses.set(sheet.key, { sheet, image, cells });
  }

  // 시트별 머리 크기 행렬. 비전 박스가 있으면 머리 높이(px), 없으면 휴리스틱 머리 폭(px).
  const headSizes = new Map();
  const headSources = new Map();
  const headRects = new Map();
  for (const { sheet, cells } of analyses.values()) {
    const boxes = loadHeadBoxes(sheet);
    headSources.set(sheet.key, boxes ? 'boxes' : 'heuristic');
    headRects.set(sheet.key, boxes?.rects ?? null);
    headSizes.set(sheet.key, cells.map((rowCells, row) => rowCells.map((cell, column) => {
      const boxHeight = boxes?.heights[row]?.[column];
      if (boxHeight != null) return boxHeight;
      return cell?.headWidth ?? null;
    })));
  }
  const sheetSizes = key => headSizes.get(key).flat().filter(value => value != null);

  // 기준 머리 크기: 아군 3개 시트는 공통 기준(전부 같은 소스일 때), 적 시트는 자기 시트 중앙값.
  // 아군 공통 기준은 체형 그룹(columnGroups)별 중앙값으로 나눠 잡는다.
  const groupOf = (sheet, column) => sheet.columnGroups?.[column] ?? 'm';
  const defenderSources = new Set(DEFENDER_REFERENCE_SHEET_KEYS.map(key => headSources.get(key)));
  const sharedDefenderGroupReference = new Map();
  if (defenderSources.size === 1) {
    const groupSizes = new Map();
    for (const key of DEFENDER_REFERENCE_SHEET_KEYS) {
      const { sheet } = analyses.get(key);
      headSizes.get(key).forEach(rowSizes => rowSizes.forEach((size, column) => {
        if (size == null) return;
        const group = groupOf(sheet, column);
        if (!groupSizes.has(group)) groupSizes.set(group, []);
        groupSizes.get(group).push(size);
      }));
    }
    for (const [group, sizes] of groupSizes) sharedDefenderGroupReference.set(group, median(sizes));
  } else {
    console.warn('경고: 기존 아군 기준 시트의 머리 박스가 일부만 있어 시트별 기준으로 정규화합니다.');
  }
  const sheetReference = new Map(SHEETS.map(sheet => [sheet.key, median(sheetSizes(sheet.key))]));
  const referenceFor = (key, column) => {
    if (DEFENDER_REFERENCE_SHEET_KEYS.includes(key) && sharedDefenderGroupReference.size > 0) {
      const { sheet } = analyses.get(key);
      return sharedDefenderGroupReference.get(groupOf(sheet, column)) ?? sheetReference.get(key);
    }
    return sheetReference.get(key);
  };

  const metrics = {};
  const reportLines = [];
  for (const { sheet, cells } of analyses.values()) {
    const clamp = headSources.get(sheet.key) === 'boxes' ? SCALE_CLAMP : HEURISTIC_SCALE_CLAMP;
    metrics[sheet.key] = cells.map((rowCells, row) => rowCells.map((cell, column) => {
      if (!cell) return { scale: 1, dy: 0 };
      const reference = referenceFor(sheet.key, column);
      const headSize = headSizes.get(sheet.key)[row][column] ?? reference;
      const scale = Math.min(clamp.max, Math.max(clamp.min, reference / headSize));
      const gap = sheet.cellHeight - 1 - cell.bottom;
      const dy = Math.max(-6, (gap - BASELINE_INSET) * scale);
      reportLines.push([
        sheet.key.padEnd(24),
        `c${column} r${row}`.padEnd(7),
        `head=${headSize.toFixed(1)}px`.padEnd(14),
        `scale=${scale.toFixed(3)}`,
        `dy=${dy.toFixed(1)}`,
      ].join(' '));
      return { scale: Number(scale.toFixed(3)), dy: Number(dy.toFixed(1)) };
    }));
  }

  for (const sheet of SHEETS) {
    const source = headSources.get(sheet.key) === 'boxes' ? '비전 박스' : '휴리스틱';
    if (DEFENDER_SHEET_KEYS.includes(sheet.key) && sharedDefenderGroupReference.size > 0) {
      const groups = [...sharedDefenderGroupReference].map(([group, ref]) => `${group}=${ref.toFixed(1)}px`).join(', ');
      console.log(`${sheet.key}: 소스=${source}, 기준 머리 크기(그룹별) ${groups}`);
    } else {
      console.log(`${sheet.key}: 소스=${source}, 기준 머리 크기=${sheetReference.get(sheet.key).toFixed(1)}px`);
    }
  }
  console.log(reportLines.join('\n'));
  console.log('\n열(캐릭터)별 배율 — 같은 캐릭터는 포즈가 달라도 비슷해야 정상:');
  for (const { sheet } of analyses.values()) {
    for (let column = 0; column < sheet.columns; column += 1) {
      const scales = metrics[sheet.key].map(rowCells => rowCells[column].scale);
      console.log(`  ${sheet.key} c${column}: ${scales.map(value => value.toFixed(2)).join(' / ')}`);
    }
  }

  if (debugDir) {
    mkdirSync(debugDir, { recursive: true });
    for (const { sheet, image, cells } of analyses.values()) {
      const copy = Buffer.from(image.data);
      const drawRect = (x0, y0, x1, y1, r, g, b) => {
        const plot = (x, y) => {
          if (x < 0 || y < 0 || x >= image.width || y >= image.height) return;
          const index = (y * image.width + x) * 4;
          copy[index] = r; copy[index + 1] = g; copy[index + 2] = b; copy[index + 3] = 255;
        };
        for (let x = x0; x <= x1; x += 1) { plot(x, y0); plot(x, y1); }
        for (let y = y0; y <= y1; y += 1) { plot(x0, y); plot(x1, y); }
      };
      cells.forEach((rowCells, row) => rowCells.forEach((cell, column) => {
        if (!cell) return;
        const baseX = column * sheet.cellWidth;
        const baseY = row * sheet.cellHeight;
        drawRect(baseX + cell.left, baseY + cell.top, baseX + cell.right, baseY + cell.bottom, 40, 200, 60);
        const visionRect = headRects.get(sheet.key)?.[row]?.[column];
        if (visionRect) {
          drawRect(
            baseX + visionRect.left, baseY + visionRect.top,
            baseX + visionRect.right, baseY + visionRect.bottom,
            60, 120, 235,
          );
        } else if (cell.headTop != null) {
          drawRect(
            baseX + cell.headLeft, baseY + cell.headTop,
            baseX + cell.headRight, baseY + cell.headBottom,
            230, 40, 40,
          );
        }
      }));
      writeFileSync(join(debugDir, `${sheet.key}-debug.png`), encodePng(image.width, image.height, copy));
    }
    console.log(`디버그 오버레이 저장: ${debugDir}`);
  }

  const generated = [
    '// 이 파일은 tools/game/generate_tactical_sprite_metrics.mjs가 생성한다. 직접 수정하지 말 것.',
    '// 전술 스프라이트 셀별 표시 배율(머리 크기 기준 정규화)과 발끝 기준선 보정값.',
    'export interface TacticalSpriteMetric {',
    '  readonly scale: number;',
    '  readonly dy: number;',
    '}',
    '',
    "export type TacticalMetricSheetKey = 'defenderRoles' | 'defenderWeapons' | 'defenderDefaultWeapons' | 'healers' | 'specialResidents' | 'raiders' | 'court';",
    '',
    'export const TACTICAL_SPRITE_METRICS: Readonly<Record<',
    '  TacticalMetricSheetKey,',
    '  ReadonlyArray<ReadonlyArray<TacticalSpriteMetric>>',
    '>> = ' + JSON.stringify(metrics, null, 2).replace(/"([a-zA-Z]+)":/g, '$1:') + ';',
    '',
    'const FALLBACK_METRIC: TacticalSpriteMetric = { scale: 1, dy: 0 };',
    '',
    'export function tacticalSpriteMetric(',
    '  sheet: TacticalMetricSheetKey,',
    '  column: number,',
    '  row: number,',
    '): TacticalSpriteMetric {',
    '  return TACTICAL_SPRITE_METRICS[sheet]?.[row]?.[column] ?? FALLBACK_METRIC;',
    '}',
    '',
    '/** 스프라이트 요소 인라인 스타일에 얹을 CSS 변수 쌍. */',
    'export function tacticalSpriteMetricVars(',
    '  sheet: TacticalMetricSheetKey,',
    '  column: number,',
    '  row: number,',
    "): Record<'--unit-scale' | '--unit-dy', string> {",
    '  const metric = tacticalSpriteMetric(sheet, column, row);',
    '  return {',
    "    '--unit-scale': String(metric.scale),",
    "    '--unit-dy': `${metric.dy}px`,",
    '  };',
    '}',
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'src', 'render', 'tacticalSpriteMetrics.ts'), generated);
  console.log('생성 완료: src/render/tacticalSpriteMetrics.ts');
}

main();
