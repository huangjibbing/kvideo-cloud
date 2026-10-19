import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { findTitle } from '../../shared/catalog';
import { customSourceLimit } from '../../shared/levels';
import type { AppEnv } from '../lib/db';
import {
  clientIp,
  getSettings,
  nowIso,
  rateLimit,
  requireUser,
  sanitizeMode,
  toPublicUser,
} from '../lib/db';
import { awardPoints, dayStartIso, shanghaiDay } from '../lib/points';
import { isSafeRemoteUrl, createSignedProxyUrl } from '../lib/sign';

export const libraryRoutes = new Hono<AppEnv>();

const accentOf = (value: unknown): string => {
  if (Array.isArray(value) && value.length >= 2) {
    return JSON.stringify([String(value[0]).slice(0, 32), String(value[1]).slice(0, 32)]);
  }
  return JSON.stringify(['#7c5cff', '#20d6c7']);
};

libraryRoutes.get('/favorites', async (c) => {
  const user = await requireUser(c);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM favorites WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(user.id)
    .all<{
      source_key: string;
      title_id: string;
      title: string;
      original_title: string;
      accent: string;
      motif: string;
      created_at: string;
    }>();
  return c.json({
    favorites: (rows.results ?? []).map((row) => ({
      sourceKey: row.source_key,
      titleId: row.title_id,
      title: row.title,
      originalTitle: row.original_title,
      accent: JSON.parse(row.accent) as [string, string],
      motif: row.motif,
      createdAt: row.created_at,
    })),
  });
});

libraryRoutes.post('/favorites', async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const sourceKey = String(body.sourceKey ?? '').slice(0, 180);
  const titleId = String(body.titleId ?? '').slice(0, 120);
  const title = String(body.title ?? '').slice(0, 120);
  if (!sourceKey || !titleId || !title) {
    throw new HTTPException(400, { message: '收藏信息不完整' });
  }
  const result = await c.env.DB.prepare(
    `INSERT OR IGNORE INTO favorites
     (user_id, source_key, title_id, title, original_title, accent, motif, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      user.id,
      sourceKey,
      titleId,
      title,
      String(body.originalTitle ?? title).slice(0, 160),
      accentOf(body.accent),
      String(body.motif ?? 'orb').slice(0, 20),
      nowIso(),
    )
    .run();
  let awarded = 0;
  if ((result.meta.changes ?? 0) > 0) {
    const points = await awardPoints(c.env, user.id, 2, 'favorite', title, { multiply: false });
    awarded = points.delta;
  }
  return c.json({ ok: true, awarded });
});

libraryRoutes.delete('/favorites', async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const sourceKey = String(body.sourceKey ?? '');
  if (!sourceKey) throw new HTTPException(400, { message: '缺少片源标识' });
  await c.env.DB.prepare('DELETE FROM favorites WHERE user_id = ? AND source_key = ?')
    .bind(user.id, sourceKey)
    .run();
  return c.json({ ok: true });
});

libraryRoutes.get('/history', async (c) => {
  const user = await requireUser(c);
  const rows = await c.env.DB.prepare(
    'SELECT * FROM history WHERE user_id = ? ORDER BY updated_at DESC LIMIT 30',
  )
    .bind(user.id)
    .all<{
      source_key: string;
      title_id: string;
      title: string;
      original_title: string;
      accent: string;
      motif: string;
      position: number;
      duration: number;
      episode_id: string;
      updated_at: string;
    }>();
  return c.json({
    history: (rows.results ?? []).map((row) => ({
      sourceKey: row.source_key,
      titleId: row.title_id,
      title: row.title,
      originalTitle: row.original_title,
      accent: JSON.parse(row.accent) as [string, string],
      motif: row.motif,
      position: row.position,
      duration: row.duration,
      episodeId: row.episode_id === 'main' ? null : row.episode_id,
      updatedAt: row.updated_at,
    })),
  });
});

libraryRoutes.post('/history', async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const sourceKey = String(body.sourceKey ?? '').slice(0, 180);
  if (!sourceKey) throw new HTTPException(400, { message: '缺少片源标识' });
  const position = Math.max(0, Math.min(24 * 3600, Number(body.position) || 0));
  const duration = Math.max(0, Math.min(24 * 3600, Number(body.duration) || 0));
  const episodeId = String(body.episodeId ?? 'main').slice(0, 80) || 'main';
  await c.env.DB.prepare(
    `INSERT INTO history
     (user_id, source_key, title_id, title, original_title, accent, motif, position, duration, episode_id, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, source_key, episode_id) DO UPDATE SET
       position = excluded.position, duration = excluded.duration, updated_at = excluded.updated_at`,
  )
    .bind(
      user.id,
      sourceKey,
      String(body.titleId ?? '').slice(0, 120),
      String(body.title ?? '').slice(0, 120),
      String(body.originalTitle ?? '').slice(0, 160),
      accentOf(body.accent),
      String(body.motif ?? 'orb').slice(0, 20),
      position,
      duration,
      episodeId,
      nowIso(),
    )
    .run();

  let awarded = 0;
  const settings = await getSettings(c.env);
  if (settings.watchRewardEnabled && position >= 300) {
    try {
      const todayStart = dayStartIso(shanghaiDay());
      const count = await c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM points_ledger WHERE user_id = ? AND reason = 'watch' AND created_at >= ?",
      )
        .bind(user.id, todayStart)
        .first<{ count: number }>();
      const duplicate = await c.env.DB.prepare(
        "SELECT id FROM points_ledger WHERE user_id = ? AND reason = 'watch' AND note = ? AND created_at >= ? LIMIT 1",
      )
        .bind(user.id, sourceKey, todayStart)
        .first();
      if ((count?.count ?? 0) < 10 && !duplicate) {
        const points = await awardPoints(c.env, user.id, 2, 'watch', sourceKey);
        awarded = points.delta;
      }
    } catch {
      awarded = 0;
    }
  }
  return c.json({ ok: true, awarded });
});

libraryRoutes.delete('/history', async (c) => {
  const user = await requireUser(c);
  await c.env.DB.prepare('DELETE FROM history WHERE user_id = ?').bind(user.id).run();
  return c.json({ ok: true });
});

libraryRoutes.get('/sources', async (c) => {
  const user = await requireUser(c);
  const rows = await c.env.DB.prepare(
    'SELECT id, name, url, created_at FROM custom_sources WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(user.id)
    .all<{ id: string; name: string; url: string; created_at: string }>();
  return c.json({
    sources: (rows.results ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      url: row.url,
      createdAt: row.created_at,
    })),
    limit: customSourceLimit(toPublicUser(user)),
  });
});

libraryRoutes.post('/sources', async (c) => {
  const user = await requireUser(c);
  if (!rateLimit(`source:${user.id}`, 10, 10 * 60_000)) {
    throw new HTTPException(429, { message: '添加片源过于频繁' });
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const name = String(body.name ?? '').trim().slice(0, 40);
  const url = String(body.url ?? '').trim();
  if (!name) throw new HTTPException(400, { message: '请给片源起一个名字' });
  if (!isSafeRemoteUrl(url) || !/^https?:\/\//i.test(url)) {
    throw new HTTPException(400, { message: '请输入公开可访问的 http(s) m3u8 地址' });
  }
  const count = await c.env.DB.prepare(
    'SELECT COUNT(*) AS count FROM custom_sources WHERE user_id = ?',
  )
    .bind(user.id)
    .first<{ count: number }>();
  const limit = customSourceLimit(toPublicUser(user));
  if ((count?.count ?? 0) >= limit) {
    throw new HTTPException(403, { message: `当前用户组最多保存 ${limit} 个自定义片源` });
  }
  const id = crypto.randomUUID();
  await c.env.DB.prepare(
    'INSERT INTO custom_sources (id, user_id, name, url, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, user.id, name, url, nowIso())
    .run();
  return c.json({ id, name, url, createdAt: nowIso() }, 201);
});

libraryRoutes.delete('/sources/:id', async (c) => {
  const user = await requireUser(c);
  await c.env.DB.prepare('DELETE FROM custom_sources WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), user.id)
    .run();
  return c.json({ ok: true });
});

libraryRoutes.post('/comments', async (c) => {
  const user = await requireUser(c);
  if (!rateLimit(`comment:${user.id}`, 8, 5 * 60_000)) {
    throw new HTTPException(429, { message: '评论太快了，休息一下' });
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const sourceKey = String(body.sourceKey ?? '').slice(0, 180);
  const message = String(body.body ?? '').trim();
  if (!sourceKey) throw new HTTPException(400, { message: '缺少作品标识' });
  if (message.length < 1 || message.length > 500) {
    throw new HTTPException(400, { message: '评论需在 1–500 字之间' });
  }
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  await c.env.DB.prepare(
    'INSERT INTO comments (id, source_key, user_id, body, created_at) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(id, sourceKey, user.id, message, createdAt)
    .run();
  return c.json({ id, sourceKey, body: message, createdAt, username: user.username }, 201);
});

libraryRoutes.delete('/comments/:id', async (c) => {
  const user = await requireUser(c);
  const row = await c.env.DB.prepare('SELECT user_id FROM comments WHERE id = ?')
    .bind(c.req.param('id'))
    .first<{ user_id: string }>();
  if (!row) throw new HTTPException(404, { message: '评论不存在' });
  if (row.user_id !== user.id && user.role === 'user') {
    throw new HTTPException(403, { message: '只能删除自己的评论' });
  }
  await c.env.DB.prepare('DELETE FROM comments WHERE id = ?').bind(c.req.param('id')).run();
  return c.json({ ok: true });
});

libraryRoutes.post('/play/:id', async (c) => {
  const title = findTitle(c.req.param('id'));
  if (!title) throw new HTTPException(404, { message: '作品不存在' });
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const settings = await getSettings(c.env);
  const mode = sanitizeMode(String(body.mode ?? settings.adMode));
  const episodeId = body.episodeId ? String(body.episodeId) : null;
  const episode = episodeId ? title.episodes?.find((item) => item.id === episodeId) : null;
  if (episodeId && title.episodes && !episode) {
    throw new HTTPException(404, { message: '剧集不存在' });
  }
  const target = episode?.url ?? title.source;
  const secret = c.env.PROXY_SECRET || c.env.SESSION_SECRET;
  if (!secret) throw new HTTPException(503, { message: '代理密钥尚未配置' });
  const expiresAt = Date.now() + 12 * 3600_000;
  const url = await createSignedProxyUrl(
    new URL(c.req.url).origin,
    { url: target, mode, referer: title.referer },
    secret,
    expiresAt,
  );
  return c.json({
    url,
    mode,
    expiresAt: new Date(expiresAt).toISOString(),
    titleId: title.id,
    episodeId: episode?.id ?? null,
    episodeName: episode?.name ?? null,
    sourceName: episode?.note ?? title.originalTitle,
    adLab: Boolean(title.adLab),
  });
});

libraryRoutes.post('/play-custom', async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  let target = String(body.url ?? '').trim();
  const sourceId = String(body.sourceId ?? '');
  if (sourceId) {
    const row = await c.env.DB.prepare('SELECT url FROM custom_sources WHERE id = ? AND user_id = ?')
      .bind(sourceId, user.id)
      .first<{ url: string }>();
    if (!row) throw new HTTPException(404, { message: '自定义片源不存在' });
    target = row.url;
  }
  if (!isSafeRemoteUrl(target) || !/^https?:\/\//i.test(target)) {
    throw new HTTPException(400, { message: '请输入公开可访问的 http(s) m3u8 地址' });
  }
  const secret = c.env.PROXY_SECRET || c.env.SESSION_SECRET;
  if (!secret) throw new HTTPException(503, { message: '代理密钥尚未配置' });
  const mode = sanitizeMode(String(body.mode ?? 'strict'));
  const expiresAt = Date.now() + 12 * 3600_000;
  const url = await createSignedProxyUrl(
    new URL(c.req.url).origin,
    { url: target, mode },
    secret,
    expiresAt,
  );
  return c.json({
    url,
    mode,
    expiresAt: new Date(expiresAt).toISOString(),
    sourceName: String(body.name ?? '自定义片源').slice(0, 60),
    adLab: false,
  });
});
