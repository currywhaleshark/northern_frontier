// 밸런스 편집기 dev 서버 — 스프라이트 스튜디오와 같은 흐름이다.
// 저장 → data/balance-overrides.json 기록 → 코드젠 → 게임 dev 서버가 HMR로 집어 간다.
// 편집기는 게임의 src를 그대로 import해 **실제 기본값**을 폼으로 만든다 (모조 표는 곧 어긋난다).
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { parseConfigComments } from './parse_config_comments.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const DATA = join(HERE, 'data', 'balance-overrides.json');
const GENERATOR = join(HERE, 'generate_balance_overrides.mjs');
const CONFIG_SOURCE = join(ROOT, 'src', 'game', 'config.ts');

const DATA_COMMENT = '밸런스 오버레이 — 경로 키 → 값. 기본값과 같아지면 키를 지운다. 편집은 npm run edit:balance.';

function readOverrides(): Record<string, unknown> {
  if (!existsSync(DATA)) return {};
  const { _comment: _ignored, ...rest } = JSON.parse(readFileSync(DATA, 'utf8'));
  return rest;
}

/** 키 정렬 저장 — diff가 "무엇을 바꿨나"만 보이게 한다. */
function sortedStringify(value: Record<string, unknown>): string {
  const ordered: Record<string, unknown> = { _comment: DATA_COMMENT };
  for (const key of Object.keys(value).sort((a, b) => a.localeCompare(b))) ordered[key] = value[key];
  return `${JSON.stringify(ordered, null, 2)}\n`;
}

function runGenerator(): Promise<void> {
  return new Promise((resolveRun, rejectRun) => {
    execFile('node', [GENERATOR], { cwd: ROOT }, (error, _stdout, stderr) => {
      if (error) rejectRun(new Error(stderr || error.message));
      else resolveRun();
    });
  });
}

function balanceApi(): Plugin {
  return {
    name: 'balance-studio-api',
    configureServer(server) {
      server.middlewares.use('/api/balance', (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify({
          overrides: readOverrides(),
          // 주석 파싱이 실패하면 빈 표 — 폼은 그대로 뜨고 도움말만 빠진다.
          comments: parseConfigComments(CONFIG_SOURCE),
        }));
      });

      server.middlewares.use('/api/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk as Buffer));
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          const rollback = existsSync(DATA) ? readFileSync(DATA, 'utf8') : null;
          try {
            const { overrides } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (overrides === null || typeof overrides !== 'object' || Array.isArray(overrides)) {
              throw new Error('overrides는 "경로 키 → 값" 객체여야 합니다');
            }
            writeFileSync(DATA, sortedStringify(overrides), 'utf8');
            // 코드젠이 검증까지 한다. 실패하면 저장을 없던 일로 되돌린다 —
            // 그러지 않으면 오타 하나로 JSON과 생성 파일이 어긋난 채 저장소에 남는다.
            await runGenerator();
            res.end(JSON.stringify({ ok: true, count: Object.keys(overrides).length }));
          } catch (error) {
            if (rollback != null) {
              writeFileSync(DATA, rollback, 'utf8');
              await runGenerator().catch(() => undefined);
            }
            res.statusCode = 500;
            res.end(JSON.stringify({ ok: false, error: String((error as Error).message ?? error) }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  root: HERE,
  publicDir: false,
  plugins: [react(), balanceApi()],
  resolve: {
    alias: { '@game': resolve(ROOT, 'src') },
  },
  server: {
    port: 5185,
    fs: { allow: [ROOT] },
    watch: {
      ignored: ['**/tools/render/**', '**/backup_json/**', '**/debug_output*/**', '**/tmp/**', '**/dist/**'],
    },
  },
});
