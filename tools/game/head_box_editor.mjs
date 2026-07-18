// 머리 박스 수동 편집 툴 — 브라우저에서 시트를 확대해 셀별 머리 박스를 직접
// 그리고/옮기고/크기 조절한 뒤 저장하면 tools/game/head-boxes/<시트키>.json에
// (이미지 전체 기준 0~1000 정규화 좌표로) 기록된다.
//
// 사용법:
//   node tools/game/head_box_editor.mjs        # http://localhost:5183
//   PORT=8080 node tools/game/head_box_editor.mjs
//
// 저장 후 "메트릭 재생성" 버튼을 누르면 npm run gen:sprite-metrics와 동일한
// 스크립트가 실행되어 src/render/tacticalSpriteMetrics.ts가 갱신된다.
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const PORT = Number(process.env.PORT ?? 5183);
const HEAD_BOXES_DIR = join(ROOT, 'tools', 'game', 'head-boxes');

const SHEETS = {
  defenderRoles: { src: 'public/assets/tactical/defender-roles-poses-v2.png', cellWidth: 84, cellHeight: 120, columns: 8, rows: 4 },
  defenderWeapons: { src: 'public/assets/tactical/defender-weapons-poses-v2.png', cellWidth: 84, cellHeight: 120, columns: 6, rows: 4 },
  defenderDefaultWeapons: { src: 'public/assets/tactical/defender-default-weapons-poses-v1.png', cellWidth: 84, cellHeight: 120, columns: 6, rows: 4 },
  healers: { src: 'public/assets/tactical/defender-healers-poses-v1.png', cellWidth: 84, cellHeight: 120, columns: 2, rows: 4 },
  specialResidents: { src: 'public/assets/tactical/special-resident-combat-poses-v1.png', cellWidth: 84, cellHeight: 120, columns: 4, rows: 4 },
  raiders: { src: 'public/assets/tactical/faction-raiders-poses-v2.png', cellWidth: 168, cellHeight: 120, columns: 6, rows: 4 },
  court: { src: 'public/assets/tactical/court-army-poses-v2.png', cellWidth: 168, cellHeight: 120, columns: 5, rows: 4 },
};

function sendJson(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolveBody, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolveBody(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

// 저장 형식은 기존 파일과 동일: 항목당 한 줄.
function formatBoxes(entries) {
  const lines = entries.map(entry => {
    const box = entry.box_2d ? `[${entry.box_2d.join(', ')}]` : 'null';
    return `  {"label": ${JSON.stringify(entry.label)}, "box_2d": ${box}}`;
  });
  return `[\n${lines.join(',\n')}\n]\n`;
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname;
  try {
    if (path === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(PAGE);
      return;
    }
    if (path === '/api/sheets') {
      sendJson(res, 200, Object.fromEntries(Object.entries(SHEETS).map(([key, sheet]) => [key, {
        cellWidth: sheet.cellWidth, cellHeight: sheet.cellHeight, columns: sheet.columns, rows: sheet.rows,
      }])));
      return;
    }
    const imgMatch = /^\/img\/([A-Za-z]+)\.png$/.exec(path);
    if (imgMatch && SHEETS[imgMatch[1]]) {
      res.writeHead(200, { 'Content-Type': 'image/png' });
      res.end(readFileSync(join(ROOT, SHEETS[imgMatch[1]].src)));
      return;
    }
    const boxMatch = /^\/api\/boxes\/([A-Za-z]+)$/.exec(path);
    if (boxMatch && SHEETS[boxMatch[1]]) {
      const filePath = join(HEAD_BOXES_DIR, `${boxMatch[1]}.json`);
      if (req.method === 'GET') {
        sendJson(res, 200, existsSync(filePath) ? JSON.parse(readFileSync(filePath, 'utf8')) : []);
        return;
      }
      if (req.method === 'POST') {
        const entries = JSON.parse(await readBody(req));
        if (!Array.isArray(entries)) throw new Error('배열이 아닙니다');
        writeFileSync(filePath, formatBoxes(entries));
        sendJson(res, 200, { ok: true, saved: filePath });
        return;
      }
    }
    if (path === '/api/generate' && req.method === 'POST') {
      execFile(process.execPath, [join(ROOT, 'tools', 'game', 'generate_tactical_sprite_metrics.mjs')], { cwd: ROOT }, (error, stdout, stderr) => {
        sendJson(res, error ? 500 : 200, { ok: !error, output: `${stdout}\n${stderr}`.trim() });
      });
      return;
    }
    res.writeHead(404);
    res.end('not found');
  } catch (error) {
    sendJson(res, 500, { ok: false, error: String(error) });
  }
});

const PAGE = /* html */ `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>머리 박스 편집기</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; font: 13px/1.5 system-ui, sans-serif; background: #16161c; color: #ddd; display: flex; height: 100vh; overflow: hidden; }
  #side { width: 260px; flex: none; padding: 12px; background: #1e1e26; overflow-y: auto; display: flex; flex-direction: column; gap: 10px; }
  #main { flex: 1; overflow: auto; position: relative; }
  canvas { display: block; image-rendering: pixelated; }
  select, button { width: 100%; padding: 6px 8px; background: #2a2a34; color: #ddd; border: 1px solid #444; border-radius: 4px; font: inherit; cursor: pointer; }
  button:hover { background: #34343f; }
  button.primary { background: #2d5da8; border-color: #3a6fc0; }
  button.primary:hover { background: #3568b8; }
  .row { display: flex; gap: 6px; align-items: center; }
  .row button { width: auto; flex: 1; }
  #coords { background: #14141a; border: 1px solid #333; border-radius: 4px; padding: 8px; font-family: Consolas, monospace; font-size: 12px; white-space: pre; min-height: 96px; }
  #status { color: #8c8; min-height: 18px; }
  #status.dirty { color: #ec5; }
  #status.error { color: #e66; }
  #genlog { background: #14141a; border: 1px solid #333; border-radius: 4px; padding: 8px; font-family: Consolas, monospace; font-size: 11px; white-space: pre-wrap; max-height: 200px; overflow-y: auto; display: none; }
  .help { color: #888; font-size: 12px; }
  h1 { font-size: 15px; margin: 0; }
  label { font-size: 12px; color: #aaa; }
</style>
</head>
<body>
<div id="side">
  <h1>머리 박스 편집기</h1>
  <div>
    <label>시트</label>
    <select id="sheetSel"></select>
  </div>
  <div class="row">
    <label>확대</label>
    <button id="zoomOut">−</button>
    <span id="zoomLabel" style="min-width:32px;text-align:center">6×</span>
    <button id="zoomIn">+</button>
  </div>
  <div id="coords">칸을 클릭하거나 드래그로 박스를 그리세요</div>
  <div class="row">
    <button id="saveBtn" class="primary">저장 (S)</button>
    <button id="reloadBtn">되돌리기</button>
  </div>
  <button id="genBtn">메트릭 재생성 (gen:sprite-metrics)</button>
  <div id="status"></div>
  <div id="genlog"></div>
  <div class="help">
    <b>조작법</b><br>
    · 빈 곳 드래그: 그 칸에 새 박스<br>
    · 박스 안 드래그: 이동 / 모서리·변 드래그: 크기 조절<br>
    · 방향키: 1px 이동 (Shift: 아래·오른쪽 변, Alt: 위·왼쪽 변 조절)<br>
    · Delete: 박스 삭제 · Ctrl+Z: 실행 취소 · S: 저장<br>
    · 배율은 박스 <b>높이(h)</b> 기준으로 계산됩니다
  </div>
</div>
<div id="main"><canvas id="cv"></canvas></div>
<script>
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const coordsEl = document.getElementById('coords');
const statusEl = document.getElementById('status');
const genlogEl = document.getElementById('genlog');
const sheetSel = document.getElementById('sheetSel');
const zoomLabel = document.getElementById('zoomLabel');

let sheets = {};
let sheetKey = null;
let cfg = null;
let img = null;
let zoom = 6;
let boxes = new Map();   // label -> {top,left,bottom,right} (셀 기준 px)
let selected = null;      // label
let dirty = false;
let undoStack = [];
let drag = null;          // {mode:'new'|'move'|'resize', label, row, col, startX, startY, orig, edges}

function setStatus(text, cls) { statusEl.textContent = text; statusEl.className = cls || ''; }
function markDirty() { dirty = true; setStatus('저장되지 않은 변경이 있습니다', 'dirty'); }
function pushUndo() {
  undoStack.push(JSON.stringify([...boxes]));
  if (undoStack.length > 200) undoStack.shift();
}

function cellOf(label) {
  const m = /^r(\\d+)c(\\d+)$/.exec(label);
  return { row: +m[1], col: +m[2] };
}

function normToCell(box2d, row, col) {
  const W = cfg.cellWidth * cfg.columns, H = cfg.cellHeight * cfg.rows;
  return {
    top: Math.round(box2d[0] / 1000 * H) - row * cfg.cellHeight,
    left: Math.round(box2d[1] / 1000 * W) - col * cfg.cellWidth,
    bottom: Math.round(box2d[2] / 1000 * H) - row * cfg.cellHeight,
    right: Math.round(box2d[3] / 1000 * W) - col * cfg.cellWidth,
  };
}

function cellToNorm(box, row, col) {
  const W = cfg.cellWidth * cfg.columns, H = cfg.cellHeight * cfg.rows;
  return [
    Math.round((row * cfg.cellHeight + box.top) * 1000 / H),
    Math.round((col * cfg.cellWidth + box.left) * 1000 / W),
    Math.round((row * cfg.cellHeight + box.bottom) * 1000 / H),
    Math.round((col * cfg.cellWidth + box.right) * 1000 / W),
  ];
}

async function loadSheet(key) {
  sheetKey = key;
  cfg = sheets[key];
  selected = null;
  undoStack = [];
  const [entries, image] = await Promise.all([
    fetch('/api/boxes/' + key).then(r => r.json()),
    new Promise(res => { const im = new Image(); im.onload = () => res(im); im.src = '/img/' + key + '.png'; }),
  ]);
  img = image;
  boxes = new Map();
  for (const e of entries) {
    if (!e || !e.box_2d) continue;
    const { row, col } = cellOf(e.label);
    boxes.set(e.label, normToCell(e.box_2d, row, col));
  }
  dirty = false;
  setStatus('불러옴: ' + key);
  render();
  updateCoords();
}

function render() {
  if (!img) return;
  cv.width = img.width * zoom;
  cv.height = img.height * zoom;
  ctx.imageSmoothingEnabled = false;
  // 투명 배경용 체커보드
  ctx.fillStyle = '#22222a';
  ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.fillStyle = '#292933';
  const cs = 8 * zoom;
  for (let y = 0; y < cv.height; y += cs) for (let x = ((y / cs) % 2) * cs; x < cv.width; x += cs * 2) ctx.fillRect(x, y, cs, cs);
  ctx.drawImage(img, 0, 0, cv.width, cv.height);
  // 셀 격자
  ctx.strokeStyle = 'rgba(150,150,180,0.5)';
  ctx.lineWidth = 1;
  for (let c = 0; c <= cfg.columns; c += 1) { ctx.beginPath(); ctx.moveTo(c * cfg.cellWidth * zoom + 0.5, 0); ctx.lineTo(c * cfg.cellWidth * zoom + 0.5, cv.height); ctx.stroke(); }
  for (let r = 0; r <= cfg.rows; r += 1) { ctx.beginPath(); ctx.moveTo(0, r * cfg.cellHeight * zoom + 0.5); ctx.lineTo(cv.width, r * cfg.cellHeight * zoom + 0.5); ctx.stroke(); }
  // 라벨
  ctx.font = (11 + zoom) + 'px Consolas, monospace';
  ctx.textBaseline = 'top';
  for (let r = 0; r < cfg.rows; r += 1) for (let c = 0; c < cfg.columns; c += 1) {
    ctx.fillStyle = 'rgba(255,220,100,0.8)';
    ctx.fillText('r' + r + 'c' + c, (c * cfg.cellWidth + 1) * zoom, (r * cfg.cellHeight + 1) * zoom);
  }
  // 박스
  for (const [label, box] of boxes) {
    const { row, col } = cellOf(label);
    const x = (col * cfg.cellWidth + box.left) * zoom;
    const y = (row * cfg.cellHeight + box.top) * zoom;
    const w = (box.right - box.left) * zoom;
    const h = (box.bottom - box.top) * zoom;
    const isSel = label === selected;
    ctx.strokeStyle = isSel ? '#ffd54a' : '#ff5252';
    ctx.lineWidth = isSel ? 3 : 2;
    ctx.strokeRect(x, y, w, h);
    ctx.fillStyle = isSel ? '#ffd54a' : 'rgba(255,120,120,0.9)';
    ctx.fillText('h' + Math.round(box.bottom - box.top), x + 2, y + h + 2);
    if (isSel) {
      ctx.fillStyle = '#ffd54a';
      for (const [hx, hy] of handlePoints(box, row, col)) ctx.fillRect(hx - 4, hy - 4, 8, 8);
    }
  }
}

function handlePoints(box, row, col) {
  const x0 = (col * cfg.cellWidth + box.left) * zoom, x1 = (col * cfg.cellWidth + box.right) * zoom;
  const y0 = (row * cfg.cellHeight + box.top) * zoom, y1 = (row * cfg.cellHeight + box.bottom) * zoom;
  const xm = (x0 + x1) / 2, ym = (y0 + y1) / 2;
  return [[x0, y0], [xm, y0], [x1, y0], [x0, ym], [x1, ym], [x0, y1], [xm, y1], [x1, y1]];
}

function updateCoords() {
  if (!selected || !boxes.has(selected)) {
    coordsEl.textContent = selected ? selected + ': 박스 없음\\n드래그로 그리세요' : '칸을 클릭하거나 드래그로 박스를 그리세요';
    return;
  }
  const b = boxes.get(selected);
  const { row, col } = cellOf(selected);
  const norm = cellToNorm(roundBox(b), row, col);
  coordsEl.textContent = selected +
    '\\n셀 px  top=' + Math.round(b.top) + ' left=' + Math.round(b.left) +
    '\\n       bottom=' + Math.round(b.bottom) + ' right=' + Math.round(b.right) +
    '\\n크기   w=' + Math.round(b.right - b.left) + '  h=' + Math.round(b.bottom - b.top) +
    '\\nbox_2d [' + norm.join(', ') + ']';
}

function roundBox(b) { return { top: Math.round(b.top), left: Math.round(b.left), bottom: Math.round(b.bottom), right: Math.round(b.right) }; }

function imgPos(e) {
  const rect = cv.getBoundingClientRect();
  return { x: (e.clientX - rect.left) / zoom, y: (e.clientY - rect.top) / zoom };
}

function hitEdges(box, row, col, x, y) {
  const tol = Math.max(6 / zoom, 2);
  const L = col * cfg.cellWidth + box.left, R = col * cfg.cellWidth + box.right;
  const T = row * cfg.cellHeight + box.top, B = row * cfg.cellHeight + box.bottom;
  if (x < L - tol || x > R + tol || y < T - tol || y > B + tol) return null;
  const edges = {
    w: Math.abs(x - L) <= tol, e: Math.abs(x - R) <= tol,
    n: Math.abs(y - T) <= tol, s: Math.abs(y - B) <= tol,
  };
  if (edges.w || edges.e || edges.n || edges.s) return edges;
  if (x > L && x < R && y > T && y < B) return 'inside';
  return null;
}

cv.addEventListener('mousedown', e => {
  if (!cfg) return;
  const { x, y } = imgPos(e);
  const col = Math.min(cfg.columns - 1, Math.max(0, Math.floor(x / cfg.cellWidth)));
  const row = Math.min(cfg.rows - 1, Math.max(0, Math.floor(y / cfg.cellHeight)));
  const label = 'r' + row + 'c' + col;
  // 1) 선택된 박스의 핸들/내부?
  if (selected && boxes.has(selected)) {
    const selCell = cellOf(selected);
    const hit = hitEdges(boxes.get(selected), selCell.row, selCell.col, x, y);
    if (hit === 'inside') {
      pushUndo();
      drag = { mode: 'move', label: selected, startX: x, startY: y, orig: { ...boxes.get(selected) } };
      return;
    }
    if (hit) {
      pushUndo();
      drag = { mode: 'resize', label: selected, startX: x, startY: y, orig: { ...boxes.get(selected) }, edges: hit };
      return;
    }
  }
  // 2) 다른 박스 클릭 → 선택 + 즉시 이동 시작
  if (boxes.has(label)) {
    const hit = hitEdges(boxes.get(label), row, col, x, y);
    if (hit) {
      selected = label;
      pushUndo();
      drag = hit === 'inside'
        ? { mode: 'move', label, startX: x, startY: y, orig: { ...boxes.get(label) } }
        : { mode: 'resize', label, startX: x, startY: y, orig: { ...boxes.get(label) }, edges: hit };
      render(); updateCoords();
      return;
    }
  }
  // 3) 빈 곳 → 새 박스
  selected = label;
  pushUndo();
  const cx = x - col * cfg.cellWidth, cy = y - row * cfg.cellHeight;
  drag = { mode: 'new', label, row, col, startX: cx, startY: cy };
  boxes.set(label, { top: cy, left: cx, bottom: cy, right: cx });
  render(); updateCoords();
});

window.addEventListener('mousemove', e => {
  if (!drag) { hoverCursor(e); return; }
  const { x, y } = imgPos(e);
  const { row, col } = cellOf(drag.label);
  const cx = Math.min(cfg.cellWidth, Math.max(0, x - col * cfg.cellWidth));
  const cy = Math.min(cfg.cellHeight, Math.max(0, y - row * cfg.cellHeight));
  const box = boxes.get(drag.label);
  if (drag.mode === 'new') {
    box.left = Math.min(drag.startX, cx); box.right = Math.max(drag.startX, cx);
    box.top = Math.min(drag.startY, cy); box.bottom = Math.max(drag.startY, cy);
  } else if (drag.mode === 'move') {
    const dx = x - drag.startX, dy = y - drag.startY;
    const w = drag.orig.right - drag.orig.left, h = drag.orig.bottom - drag.orig.top;
    box.left = Math.min(cfg.cellWidth - w, Math.max(0, drag.orig.left + dx));
    box.top = Math.min(cfg.cellHeight - h, Math.max(0, drag.orig.top + dy));
    box.right = box.left + w; box.bottom = box.top + h;
  } else {
    if (drag.edges.w) box.left = Math.min(cx, drag.orig.right - 2);
    if (drag.edges.e) box.right = Math.max(cx, drag.orig.left + 2);
    if (drag.edges.n) box.top = Math.min(cy, drag.orig.bottom - 2);
    if (drag.edges.s) box.bottom = Math.max(cy, drag.orig.top + 2);
  }
  markDirty(); render(); updateCoords();
});

window.addEventListener('mouseup', () => {
  if (!drag) return;
  const box = boxes.get(drag.label);
  if (box) {
    if (drag.mode === 'new' && (box.right - box.left < 3 || box.bottom - box.top < 3)) {
      // 너무 작으면 클릭으로 간주하고 취소(선택만 유지)
      boxes.delete(drag.label);
      undoStack.pop();
    } else {
      boxes.set(drag.label, roundBox(box));
    }
  }
  drag = null;
  render(); updateCoords();
});

function hoverCursor(e) {
  if (!cfg || !selected || !boxes.has(selected)) { cv.style.cursor = 'crosshair'; return; }
  const { x, y } = imgPos(e);
  const { row, col } = cellOf(selected);
  const hit = hitEdges(boxes.get(selected), row, col, x, y);
  if (hit === 'inside') cv.style.cursor = 'move';
  else if (hit) {
    const dir = (hit.n ? 'n' : hit.s ? 's' : '') + (hit.w ? 'w' : hit.e ? 'e' : '');
    cv.style.cursor = dir + '-resize';
  } else cv.style.cursor = 'crosshair';
}

window.addEventListener('keydown', e => {
  if (e.target.tagName === 'SELECT') return;
  if (e.key === 's' || e.key === 'S') { e.preventDefault(); save(); return; }
  if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) {
    e.preventDefault();
    const prev = undoStack.pop();
    if (prev) { boxes = new Map(JSON.parse(prev)); markDirty(); render(); updateCoords(); }
    return;
  }
  if (!selected || !boxes.has(selected)) return;
  const box = boxes.get(selected);
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault(); pushUndo(); boxes.delete(selected); markDirty(); render(); updateCoords(); return;
  }
  const d = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
  if (!d) return;
  e.preventDefault(); pushUndo();
  const [dx, dy] = d;
  if (e.shiftKey) { // 아래·오른쪽 변
    box.right = Math.min(cfg.cellWidth, Math.max(box.left + 2, box.right + dx));
    box.bottom = Math.min(cfg.cellHeight, Math.max(box.top + 2, box.bottom + dy));
  } else if (e.altKey) { // 위·왼쪽 변
    box.left = Math.min(box.right - 2, Math.max(0, box.left + dx));
    box.top = Math.min(box.bottom - 2, Math.max(0, box.top + dy));
  } else {
    const w = box.right - box.left, h = box.bottom - box.top;
    box.left = Math.min(cfg.cellWidth - w, Math.max(0, box.left + dx));
    box.top = Math.min(cfg.cellHeight - h, Math.max(0, box.top + dy));
    box.right = box.left + w; box.bottom = box.top + h;
  }
  markDirty(); render(); updateCoords();
});

async function save() {
  if (!cfg) return;
  const entries = [];
  for (let r = 0; r < cfg.rows; r += 1) for (let c = 0; c < cfg.columns; c += 1) {
    const label = 'r' + r + 'c' + c;
    const box = boxes.get(label);
    entries.push({ label, box_2d: box ? cellToNorm(roundBox(box), r, c) : null });
  }
  const result = await fetch('/api/boxes/' + sheetKey, { method: 'POST', body: JSON.stringify(entries) }).then(r => r.json());
  if (result.ok) { dirty = false; setStatus('저장됨: ' + sheetKey + '.json'); }
  else setStatus('저장 실패: ' + result.error, 'error');
}

document.getElementById('saveBtn').addEventListener('click', save);
document.getElementById('reloadBtn').addEventListener('click', () => loadSheet(sheetKey));
document.getElementById('genBtn').addEventListener('click', async () => {
  setStatus('메트릭 생성 중…');
  genlogEl.style.display = 'block';
  genlogEl.textContent = '실행 중…';
  const result = await fetch('/api/generate', { method: 'POST' }).then(r => r.json());
  genlogEl.textContent = result.output || String(result.error || '');
  setStatus(result.ok ? '메트릭 재생성 완료 (tacticalSpriteMetrics.ts 갱신)' : '메트릭 생성 실패', result.ok ? '' : 'error');
  genlogEl.scrollTop = genlogEl.scrollHeight;
});
document.getElementById('zoomIn').addEventListener('click', () => { zoom = Math.min(12, zoom + 1); zoomLabel.textContent = zoom + '×'; render(); });
document.getElementById('zoomOut').addEventListener('click', () => { zoom = Math.max(2, zoom - 1); zoomLabel.textContent = zoom + '×'; render(); });
sheetSel.addEventListener('change', () => {
  if (dirty && !confirm('저장하지 않은 변경이 있습니다. 시트를 바꿀까요?')) { sheetSel.value = sheetKey; return; }
  loadSheet(sheetSel.value);
});
window.addEventListener('beforeunload', e => { if (dirty) e.preventDefault(); });

fetch('/api/sheets').then(r => r.json()).then(data => {
  sheets = data;
  for (const key of Object.keys(sheets)) {
    const opt = document.createElement('option');
    opt.value = key; opt.textContent = key;
    sheetSel.appendChild(opt);
  }
  loadSheet(Object.keys(sheets)[0]);
});
</script>
</body>
</html>`;

server.listen(PORT, () => {
  console.log(`머리 박스 편집기: http://localhost:${PORT}`);
});
