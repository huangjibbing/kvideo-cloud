import { Hono } from 'hono';
import { CATALOG, GENRES, catalogStats, findTitle } from '../../shared/catalog';
import { groupFor, levelForPoints, PLANS } from '../../shared/levels';
import {
  SOURCE_META,
  VIDEO_SOURCES,
  VIDEO_SOURCE_STATS,
  findVideoSource,
  sourceHost,
} from '../../shared/sources';
import type { AppEnv } from '../lib/db';
import { clientIp, getSettings, rateLimit, toPublicUser, type UserRow } from '../lib/db';

export const publicRoutes = new Hono<AppEnv>();

publicRoutes.get('/health', async (c) => {
  let db = false;
  try {
    await c.env.DB.prepare('SELECT 1').first();
    db = true;
  } catch {
    db = false;
  }
  return c.json({
    ok: db,
    app: c.env.APP_NAME ?? 'KVideo Cloud',
    db,
    time: new Date().toISOString(),
  });
});

publicRoutes.get('/config', async (c) => {
  const settings = await getSettings(c.env);
  let members = 0;
  try {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{
      count: number;
    }>();
    members = row?.count ?? 0;
  } catch {
    members = 0;
  }
  return c.json({
    announcement: settings.announcement,
    adMode: settings.adMode,
    registrationOpen: settings.registrationOpen,
    stats: { ...catalogStats(), members },
  });
});

publicRoutes.get('/catalog', async (c) => {
  let members = 0;
  try {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{
      count: number;
    }>();
    members = row?.count ?? 0;
  } catch {
    members = 0;
  }
  return c.json({
    titles: CATALOG,
    genres: GENRES,
    stats: { ...catalogStats(), members },
  });
});

publicRoutes.get('/titles/:id', async (c) => {
  const title = findTitle(c.req.param('id'));
  if (!title) return c.json({ error: '作品不存在' }, 404);
  let comments = 0;
  try {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS count FROM comments WHERE source_key = ?')
      .bind(`catalog:${title.id}`)
      .first<{ count: number }>();
    comments = row?.count ?? 0;
  } catch {
    comments = 0;
  }
  return c.json({ title, comments });
});

publicRoutes.get('/plans', (c) => c.json({ plans: PLANS }));

publicRoutes.get('/video-sources', (c) =>
  c.json({
    sources: VIDEO_SOURCES.map((source) => ({ ...source, host: sourceHost(source.baseUrl) })),
    meta: SOURCE_META,
    stats: VIDEO_SOURCE_STATS,
  }),
);

publicRoutes.get('/video-sources/:id/ping', async (c) => {
  const source = findVideoSource(c.req.param('id'));
  if (!source) return c.json({ error: '资源站不存在' }, 404);
  if (!rateLimit(`source-ping:${clientIp(c)}`, 90, 60_000)) {
    return c.json({ error: '检测过于频繁，请稍后再试' }, 429);
  }
  const startedAt = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(source.baseUrl, {
      method: 'GET',
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131.0 Safari/537.36',
        Accept: 'application/json,text/plain,*/*',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    return c.json({
      ok: response.status < 500,
      status: response.status,
      latency: Date.now() - startedAt,
      host: sourceHost(source.baseUrl),
    });
  } catch {
    return c.json({
      ok: false,
      status: 0,
      latency: Date.now() - startedAt,
      host: sourceHost(source.baseUrl),
      error: '无法连接',
    });
  } finally {
    clearTimeout(timer);
  }
});

publicRoutes.get('/leaderboard', async (c) => {
  const rows = await c.env.DB.prepare(
    `SELECT * FROM users WHERE banned = 0 ORDER BY lifetime_points DESC, created_at ASC LIMIT 50`,
  ).all<UserRow>();
  const entries = (rows.results ?? []).map((row, index) => {
    const publicUser = toPublicUser(row);
    return {
      rank: index + 1,
      id: publicUser.id,
      username: publicUser.username,
      avatar: publicUser.avatar,
      level: publicUser.level,
      membership: publicUser.membership,
      lifetimePoints: publicUser.lifetimePoints,
      group: groupFor(publicUser),
    };
  });
  return c.json({ entries });
});

publicRoutes.get('/comments', async (c) => {
  const sourceKey = (c.req.query('key') ?? '').slice(0, 180);
  if (!sourceKey) return c.json({ comments: [] });
  const rows = await c.env.DB.prepare(
    `SELECT c.id, c.source_key, c.user_id, c.body, c.created_at,
            u.username, u.avatar, u.lifetime_points, u.membership, u.role
     FROM comments c JOIN users u ON u.id = c.user_id
     WHERE c.source_key = ? AND u.banned = 0
     ORDER BY c.created_at DESC LIMIT 50`,
  )
    .bind(sourceKey)
    .all<{
      id: string;
      source_key: string;
      user_id: string;
      body: string;
      created_at: string;
      username: string;
      avatar: string;
      lifetime_points: number;
      membership: string;
      role: UserRow['role'];
    }>();
  const viewer = c.get('user');
  return c.json({
    comments: (rows.results ?? []).map((row) => {
      const pseudo = {
        id: row.user_id,
        email: '',
        username: row.username,
        role: row.role,
        level: levelForPoints(row.lifetime_points),
        points: 0,
        lifetimePoints: row.lifetime_points,
        membership: row.membership as UserRow['membership'],
        membershipExpiresAt: null,
        avatar: row.avatar,
        streak: 0,
        lastCheckinAt: null,
        createdAt: '',
        banned: false,
      };
      return {
        id: row.id,
        sourceKey: row.source_key,
        userId: row.user_id,
        username: row.username,
        avatar: row.avatar,
        level: levelForPoints(row.lifetime_points),
        membership: row.membership,
        body: row.body,
        createdAt: row.created_at,
        mine: viewer?.id === row.user_id,
        group: groupFor(pseudo),
      };
    }),
  });
});
