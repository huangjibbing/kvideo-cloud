import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv, UserRow } from '../lib/db';
import {
  clearSettingsCache,
  getSettings,
  getUserById,
  nowIso,
  requireAdmin,
  sanitizeMode,
  toPublicUser,
} from '../lib/db';
import { awardPoints } from '../lib/points';
import type { AdminUser } from '../../shared/types';

export const adminRoutes = new Hono<AppEnv>();

adminRoutes.get('/admin/stats', async (c) => {
  await requireAdmin(c);
  const queries = [
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM users').first<{ count: number }>(),
    c.env.DB.prepare(
      "SELECT COUNT(*) AS count FROM users WHERE created_at >= datetime('now','-7 days')",
    ).first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM checkins WHERE day = ?')
      .bind(
        new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Shanghai',
          year: 'numeric',
          month: '2-digit',
          day: '2-digit',
        }).format(new Date()),
      )
      .first<{ count: number }>(),
    c.env.DB.prepare('SELECT COALESCE(SUM(delta), 0) AS total FROM points_ledger WHERE delta > 0').first<{
      total: number;
    }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM comments').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM favorites').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM history').first<{ count: number }>(),
    c.env.DB.prepare('SELECT COUNT(*) AS count FROM custom_sources').first<{ count: number }>(),
  ];
  const [users, newUsers, checkins, points, comments, favorites, history, sources] =
    (await Promise.all(queries)) as Array<{ count?: number; total?: number } | null>;
  return c.json({
    stats: {
      users: users?.count ?? 0,
      newUsers7d: newUsers?.count ?? 0,
      checkinsToday: checkins?.count ?? 0,
      pointsIssued: points?.total ?? 0,
      comments: comments?.count ?? 0,
      favorites: favorites?.count ?? 0,
      history: history?.count ?? 0,
      customSources: sources?.count ?? 0,
    },
  });
});

adminRoutes.get('/admin/users', async (c) => {
  await requireAdmin(c);
  const q = (c.req.query('q') ?? '').trim().slice(0, 60);
  const like = `%${q}%`;
  const rows = await c.env.DB.prepare(
    `SELECT u.*,
      (SELECT COUNT(*) FROM favorites f WHERE f.user_id = u.id) AS favorites,
      (SELECT COUNT(*) FROM comments cm WHERE cm.user_id = u.id) AS comments
     FROM users u
     WHERE (? = '' OR u.email LIKE ? OR u.username LIKE ?)
     ORDER BY u.created_at DESC LIMIT 100`,
  )
    .bind(q, like, like)
    .all<UserRow & { favorites: number; comments: number }>();
  const users: AdminUser[] = (rows.results ?? []).map((row) => ({
    ...toPublicUser(row),
    lastLoginAt: row.last_login_at,
    favorites: row.favorites,
    comments: row.comments,
  }));
  return c.json({ users });
});

adminRoutes.patch('/admin/users/:id', async (c) => {
  const actor = await requireAdmin(c);
  const target = await getUserById(c.env, c.req.param('id'));
  if (!target) throw new HTTPException(404, { message: '用户不存在' });
  if (actor.id === target.id && c.req.method === 'PATCH') {
    // Allow self profile updates through the dedicated route only.
  }
  if (target.role === 'superadmin' && actor.role !== 'superadmin') {
    throw new HTTPException(403, { message: '无权修改超级管理员' });
  }
  if (target.role === 'admin' && actor.role !== 'superadmin') {
    throw new HTTPException(403, { message: '无权修改其他管理员' });
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));

  if (body.role !== undefined) {
    if (actor.role !== 'superadmin') {
      throw new HTTPException(403, { message: '只有超级管理员可以调整用户组' });
    }
    const role = String(body.role);
    if (!['user', 'admin', 'superadmin'].includes(role)) {
      throw new HTTPException(400, { message: '无效的用户组' });
    }
    if (target.role === 'superadmin' && role !== 'superadmin') {
      const count = await c.env.DB.prepare(
        "SELECT COUNT(*) AS count FROM users WHERE role = 'superadmin'",
      ).first<{ count: number }>();
      if ((count?.count ?? 0) <= 1) {
        throw new HTTPException(400, { message: '至少需要保留一位超级管理员' });
      }
    }
    await c.env.DB.prepare('UPDATE users SET role = ? WHERE id = ?').bind(role, target.id).run();
  }

  if (body.pointsDelta !== undefined) {
    const delta = Math.trunc(Number(body.pointsDelta));
    if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100_000) {
      throw new HTTPException(400, { message: '积分调整值无效' });
    }
    if (delta < 0 && target.points + delta < 0) {
      throw new HTTPException(400, { message: '调整后积分不能为负数' });
    }
    await awardPoints(c.env, target.id, delta, 'admin-adjust', String(body.note ?? '管理员调整'), {
      multiply: false,
      allowNegativeBalance: true,
    });
  }

  if (body.banned !== undefined) {
    if (target.id === actor.id) throw new HTTPException(400, { message: '不能停用自己' });
    await c.env.DB.prepare('UPDATE users SET banned = ? WHERE id = ?')
      .bind(body.banned ? 1 : 0, target.id)
      .run();
  }

  if (body.membership !== undefined) {
    const membership = String(body.membership);
    if (!['free', 'plus', 'pro', 'lifetime'].includes(membership)) {
      throw new HTTPException(400, { message: '无效会员等级' });
    }
    let expires: string | null = null;
    if (membership !== 'free' && membership !== 'lifetime') {
      const days = membership === 'plus' ? 30 : 365;
      expires = new Date(Date.now() + days * 86_400_000).toISOString();
    }
    await c.env.DB.prepare(
      'UPDATE users SET membership = ?, membership_expires_at = ? WHERE id = ?',
    )
      .bind(membership, expires, target.id)
      .run();
  }

  const fresh = await getUserById(c.env, target.id);
  if (!fresh) throw new HTTPException(404, { message: '用户不存在' });
  return c.json({ user: toPublicUser(fresh) });
});

adminRoutes.get('/admin/settings', async (c) => {
  await requireAdmin(c);
  return c.json({ settings: await getSettings(c.env, true) });
});

adminRoutes.put('/admin/settings', async (c) => {
  const actor = await requireAdmin(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const updates: Array<[string, string]> = [];
  if (body.adMode !== undefined) updates.push(['adMode', sanitizeMode(String(body.adMode))]);
  if (body.adKeywords !== undefined) {
    updates.push(['adKeywords', String(body.adKeywords).slice(0, 500)]);
  }
  if (body.announcement !== undefined) {
    updates.push(['announcement', String(body.announcement).slice(0, 500)]);
  }
  if (body.registrationOpen !== undefined) {
    updates.push(['registrationOpen', body.registrationOpen ? '1' : '0']);
  }
  if (body.watchRewardEnabled !== undefined) {
    updates.push(['watchRewardEnabled', body.watchRewardEnabled ? '1' : '0']);
  }
  if (updates.length === 0) throw new HTTPException(400, { message: '没有需要保存的设置' });
  await c.env.DB.batch(
    updates.map(([key, value]) =>
      c.env.DB.prepare(
        'INSERT INTO app_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
      ).bind(key, value),
    ),
  );
  clearSettingsCache();
  return c.json({
    ok: true,
    settings: await getSettings(c.env, true),
    updatedBy: actor.username,
    at: nowIso(),
  });
});

adminRoutes.get('/admin/ledger', async (c) => {
  await requireAdmin(c);
  const rows = await c.env.DB.prepare(
    `SELECT l.*, u.username FROM points_ledger l JOIN users u ON u.id = l.user_id
     ORDER BY l.created_at DESC LIMIT 80`,
  ).all<{
    id: string;
    username: string;
    delta: number;
    reason: string;
    note: string;
    created_at: string;
  }>();
  return c.json({
    entries: (rows.results ?? []).map((row) => ({
      id: row.id,
      username: row.username,
      delta: row.delta,
      reason: row.reason,
      note: row.note,
      createdAt: row.created_at,
    })),
  });
});
