/**
 * Local integration server.
 *
 * Cloudflare's workerd cannot create its runtime directories on this Windows
 * host, so this script runs the real Hono Worker bundle against a D1-shaped
 * adapter backed by Node 24's built-in SQLite. It is only for local preview
 * and automated UI checks; production still uses Cloudflare D1.
 */
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { build } from 'esbuild';

const root = resolve(import.meta.dirname, '..');
const dist = join(root, 'dist');
const localDir = join(root, '.local');
await mkdir(localDir, { recursive: true });

const db = new DatabaseSync(join(localDir, 'kvideo.sqlite'));
db.exec('PRAGMA foreign_keys = ON;');
const migrationPath = join(root, 'migrations', '0001_init.sql');
db.exec(await readFile(migrationPath, 'utf8'));

class Statement {
  constructor(database, sql) {
    this.database = database;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first(column) {
    const row = this.database.prepare(this.sql).get(...this.values);
    if (!row) return null;
    if (column) return row[column] ?? null;
    return row;
  }

  async all() {
    return {
      results: this.database.prepare(this.sql).all(...this.values),
      success: true,
      meta: {},
    };
  }

  async run() {
    const result = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: { changes: result.changes, last_row_id: result.lastInsertRowid },
    };
  }
}

class D1Mock {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new Statement(this.database, sql);
  }

  async batch(statements) {
    return Promise.all(statements.map((statement) => statement.run()));
  }

  async exec(sql) {
    this.database.exec(sql);
    return { count: 0, duration: 0 };
  }
}

const DB = new D1Mock(db);
const env = {
  DB,
  SESSION_SECRET: 'local-session-secret-kvideo-cloud-2026',
  PROXY_SECRET: 'local-proxy-secret-kvideo-cloud-2026',
  BOOTSTRAP_ADMIN_EMAIL: 'admin@kvideo.cloud',
  BOOTSTRAP_ADMIN_PASSWORD: 'KVideo-Admin-2026!x7Qm',
  APP_NAME: 'KVideo Cloud',
  ASSETS: {
    fetch: async () => new Response('Not found', { status: 404 }),
  },
};

const bundlePath = join(localDir, 'worker.mjs');
await build({
  entryPoints: [join(root, 'worker', 'index.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outfile: bundlePath,
  logLevel: 'silent',
});
const worker = (await import(`${pathToFileURL(bundlePath).href}?t=${Date.now()}`)).default;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.m3u8': 'application/vnd.apple.mpegurl',
};

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1:8787'}`);
    if (url.pathname.startsWith('/api/')) {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (typeof value === 'string') headers.set(key, value);
      }
      const init = { method: req.method, headers };
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        init.body = Buffer.concat(chunks);
      }
      const request = new Request(url, init);
      const response = await worker.fetch(request, env, {
        waitUntil() {},
        passThroughOnException() {},
      });
      res.statusCode = response.status;
      response.headers.forEach((value, key) => res.setHeader(key, value));
      const body = Buffer.from(await response.arrayBuffer());
      res.end(body);
      return;
    }

    let pathname = decodeURIComponent(url.pathname);
    if (pathname === '/') pathname = '/index.html';
    let filePath = normalize(join(dist, pathname));
    if (!filePath.startsWith(dist)) {
      res.statusCode = 403;
      res.end('Forbidden');
      return;
    }
    if (!existsSync(filePath) || (await stat(filePath)).isDirectory()) {
      filePath = join(dist, 'index.html');
    }
    const content = await readFile(filePath);
    res.statusCode = 200;
    res.setHeader('Content-Type', MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream');
    res.setHeader('Cache-Control', filePath.endsWith('index.html') ? 'no-store' : 'public, max-age=60');
    res.end(content);
  } catch (error) {
    console.error(error);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'Server error' }));
  }
});

const port = Number(process.env.PORT ?? 8787);
server.listen(port, '127.0.0.1', () => {
  console.log(`KVideo local preview: http://127.0.0.1:${port}`);
  console.log('Demo admin: admin@kvideo.cloud / KVideo-Admin-2026!x7Qm');
});
