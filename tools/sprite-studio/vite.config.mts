// 스프라이트 스튜디오 dev 서버.
// 게임 번들과 분리된 별도 vite 앱이지만, src/render·src/game을 그대로 import해
// **실제 그리기 코드**로 미리보기를 그린다. 모조 구현은 실물과 어긋나는 순간 툴을 못 믿게 된다.
import { execFile } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..', '..');
const DATA_DIR = join(HERE, 'data');
const GENERATOR = join(HERE, 'generate_registries.mjs');

const REGISTRIES = [
  'display-metrics',
  'work-anchors',
  'building-effects',
  'worker-slots',
  'building-shadows',
] as const;

function readRegistry(name: string): unknown {
  const path = join(DATA_DIR, `${name}.json`);
  if (!existsSync(path)) return {};
  return JSON.parse(readFileSync(path, 'utf8'));
}

function sortedStringify(value: Record<string, unknown>): string {
  const keys = Object.keys(value).sort((a, b) => a.localeCompare(b));
  const ordered: Record<string, unknown> = {};
  for (const key of keys) ordered[key] = value[key];
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

// 저장 → 코드젠 → 게임 dev 서버가 HMR로 집어 간다 (헤드박스 에디터와 같은 흐름).
function studioApi(): Plugin {
  return {
    name: 'sprite-studio-api',
    configureServer(server) {
      server.middlewares.use('/api/data', (req, res) => {
        const payload: Record<string, unknown> = {};
        for (const name of REGISTRIES) payload[name] = readRegistry(name);
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(payload));
      });

      server.middlewares.use('/api/save', (req, res) => {
        if (req.method !== 'POST') { res.statusCode = 405; res.end('POST only'); return; }
        const chunks: Buffer[] = [];
        req.on('data', chunk => chunks.push(chunk as Buffer));
        req.on('end', async () => {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          let path: string | null = null;
          let rollback: string | null = null;
          try {
            const { registry, data } = JSON.parse(Buffer.concat(chunks).toString('utf8'));
            if (!REGISTRIES.includes(registry)) throw new Error(`알 수 없는 레지스트리: ${registry}`);
            path = join(DATA_DIR, `${registry}.json`);
            rollback = existsSync(path) ? readFileSync(path, 'utf8') : null;
            // 주석 필드는 편집 대상이 아니므로 원본 것을 유지한다.
            const previous = readRegistry(registry) as Record<string, unknown>;
            const merged: Record<string, unknown> = { ...data };
            if (previous._comment != null && merged._comment == null) merged._comment = previous._comment;
            writeFileSync(path, sortedStringify(merged), 'utf8');
            // 코드젠이 검증까지 한다. 실패하면 저장을 없던 일로 되돌린다 —
            // 그러지 않으면 오타 하나로 data와 생성 파일이 어긋난 채 저장소에 남는다.
            await runGenerator();
            res.end(JSON.stringify({ ok: true }));
          } catch (error) {
            if (path && rollback != null) {
              writeFileSync(path, rollback, 'utf8');
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
  // 시트 PNG는 저장소 public/에 있다 — 게임과 같은 경로로 로드되어야 한다.
  publicDir: resolve(ROOT, 'public'),
  plugins: [react(), studioApi()],
  resolve: {
    alias: { '@game': resolve(ROOT, 'src') },
  },
  server: {
    port: 5184,
    fs: { allow: [ROOT] },
    watch: {
      ignored: ['**/tools/render/**', '**/backup_json/**', '**/debug_output*/**', '**/tmp/**', '**/dist/**'],
    },
  },
});
