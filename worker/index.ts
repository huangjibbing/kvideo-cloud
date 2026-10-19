import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from './lib/db';
import { resolveUser } from './lib/auth';
import { hlsProxy } from './lib/proxy';
import { authRoutes } from './routes/auth';
import { publicRoutes } from './routes/public';
import { libraryRoutes } from './routes/library';
import { membershipRoutes } from './routes/membership';
import { adminRoutes } from './routes/admin';

const app = new Hono<AppEnv>();

app.use('*', async (c, next) => {
  await next();
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.header('X-Frame-Options', 'SAMEORIGIN');
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  c.header(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob: https:; connect-src 'self' https:; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'self'",
  );
});

app.use('/api/*', async (c, next) => {
  const path = new URL(c.req.url).pathname;
  const method = c.req.method;
  if (path !== '/api/hls' && !['GET', 'HEAD', 'OPTIONS'].includes(method)) {
    const origin = c.req.header('Origin');
    if (origin) {
      const requestOrigin = new URL(c.req.url).origin;
      if (origin !== requestOrigin && !/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin)) {
        return c.json({ error: '跨站请求已被拒绝' }, 403);
      }
    }
  }
  if (path !== '/api/hls') {
    try {
      const user = await resolveUser(c);
      c.set('user', user);
    } catch {
      c.set('user', null);
    }
  }
  await next();
});

app.get('/api/health', (c) =>
  c.json({ ok: true, app: c.env.APP_NAME ?? 'KVideo Cloud', time: new Date().toISOString() }),
);

app.on(['GET', 'HEAD', 'OPTIONS'], '/api/hls', hlsProxy);

app.route('/api', publicRoutes);
app.route('/api', authRoutes);
app.route('/api', libraryRoutes);
app.route('/api', membershipRoutes);
app.route('/api', adminRoutes);

app.all('/api/*', (c) => c.json({ error: '接口不存在' }, 404));

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ error: error.message }, error.status);
  }
  console.error('Unhandled API error', error);
  return c.json({ error: '服务器开小差了，请稍后再试' }, 500);
});

app.get('*', async (c) => {
  if (!c.env.ASSETS) return c.text('Not found', 404);
  return c.env.ASSETS.fetch(c.req.raw);
});

export default app;
