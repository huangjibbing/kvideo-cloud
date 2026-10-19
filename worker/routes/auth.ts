import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AppEnv } from '../lib/db';
import {
  avatarFor,
  getSettings,
  getUserByEmail,
  getUserById,
  getUserByUsername,
  nowIso,
  rateLimit,
  requireUser,
  toPublicUser,
  clientIp,
  type UserRow,
} from '../lib/db';
import {
  createSession,
  destroySession,
  ensureBootstrapAdmin,
  hashPassword,
  issueInviteCode,
  resolveUser,
  verifyPassword,
} from '../lib/auth';
import {
  awardPoints,
  checkinCalendar,
  checkinReward,
  previousDay,
  shanghaiDay,
} from '../lib/points';
import { groupFor, nextLevelFor } from '../../shared/levels';
import type { MeResponse } from '../../shared/types';

export const authRoutes = new Hono<AppEnv>();

function validEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) && email.length <= 120;
}

function validUsername(username: string) {
  return /^[\p{L}\p{N}_-]{2,20}$/u.test(username);
}

async function mePayload(c: Parameters<typeof resolveUser>[0], user: UserRow): Promise<MeResponse> {
  const settings = await getSettings(c.env);
  const publicUser = toPublicUser(user);
  const today = shanghaiDay();
  const checkedToday = user.last_checkin_at === today;
  const nextStreak = checkedToday
    ? user.streak + 1
    : user.last_checkin_at === previousDay(today)
      ? user.streak + 1
      : 1;
  const week = await checkinCalendar(c.env, user.id, today);
  const inviteCode = await issueInviteCode(c.env, user.id);
  return {
    user: publicUser,
    group: groupFor(publicUser),
    nextLevel: nextLevelFor(user.lifetime_points),
    checkin: {
      checkedToday,
      nextReward: checkinReward(nextStreak),
      streak: user.streak,
      week,
    },
    inviteCode,
    announcement: settings.announcement,
    adMode: settings.adMode,
  };
}

authRoutes.post('/auth/register', async (c) => {
  await ensureBootstrapAdmin(c.env);
  const settings = await getSettings(c.env);
  if (!settings.registrationOpen) throw new HTTPException(403, { message: '注册通道暂未开放' });

  const ip = clientIp(c);
  if (!rateLimit(`register:${ip}`, 8, 15 * 60_000)) {
    throw new HTTPException(429, { message: '注册过于频繁，请稍后再试' });
  }

  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const email = String(body.email ?? '').trim().toLowerCase();
  const username = String(body.username ?? '').trim();
  const password = String(body.password ?? '');
  const inviteCode = String(body.inviteCode ?? '').trim().toUpperCase();

  if (!validEmail(email)) throw new HTTPException(400, { message: '请输入有效的邮箱地址' });
  if (!validUsername(username)) {
    throw new HTTPException(400, { message: '昵称需为 2–20 位中文、字母、数字、下划线或短横线' });
  }
  if (password.length < 8 || password.length > 72) {
    throw new HTTPException(400, { message: '密码长度需在 8–72 位之间' });
  }
  if (await getUserByEmail(c.env, email)) {
    throw new HTTPException(409, { message: '这个邮箱已经注册过了' });
  }
  if (await getUserByUsername(c.env, username)) {
    throw new HTTPException(409, { message: '这个昵称已经被占用' });
  }

  let invite: { code: string; owner_id: string } | null = null;
  if (inviteCode) {
    invite = await c.env.DB.prepare(
      'SELECT code, owner_id FROM invites WHERE code = ? AND used_by IS NULL',
    )
      .bind(inviteCode)
      .first<{ code: string; owner_id: string }>();
    if (!invite) throw new HTTPException(400, { message: '邀请码无效或已被使用' });
  }

  const { salt, hash } = await hashPassword(password);
  const id = crypto.randomUUID();
  const createdAt = nowIso();
  try {
    await c.env.DB.prepare(
      `INSERT INTO users
       (id, email, username, password_hash, password_salt, role, points, lifetime_points,
        membership, avatar, streak, invited_by, created_at, last_login_at)
       VALUES (?, ?, ?, ?, ?, 'user', 0, 0, 'free', ?, 0, ?, ?, ?)`,
    )
      .bind(
        id,
        email,
        username,
        hash,
        salt,
        avatarFor(email),
        invite?.owner_id ?? null,
        createdAt,
        createdAt,
      )
      .run();
  } catch {
    throw new HTTPException(409, { message: '邮箱或昵称已被占用' });
  }

  await awardPoints(c.env, id, 50, 'welcome', '欢迎来到 KVideo Cloud', { multiply: false });
  if (invite) {
    await c.env.DB.prepare(
      'UPDATE invites SET used_by = ?, used_at = ? WHERE code = ? AND used_by IS NULL',
    )
      .bind(id, createdAt, invite.code)
      .run();
    await awardPoints(c.env, invite.owner_id, 80, 'invite', `邀请好友 ${username}`, {
      multiply: false,
    }).catch(() => undefined);
    await awardPoints(c.env, id, 30, 'invite-join', `使用邀请码 ${invite.code}`, {
      multiply: false,
    }).catch(() => undefined);
  }

  await createSession(c, id);
  const user = await getUserById(c.env, id);
  return c.json({ user: user ? toPublicUser(user) : null }, 201);
});

authRoutes.post('/auth/login', async (c) => {
  await ensureBootstrapAdmin(c.env);
  const ip = clientIp(c);
  if (!rateLimit(`login:${ip}`, 15, 10 * 60_000)) {
    throw new HTTPException(429, { message: '登录尝试过多，请十分钟后再试' });
  }
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const identifier = String(body.email ?? body.identifier ?? '').trim();
  const password = String(body.password ?? '');
  if (!identifier || !password) throw new HTTPException(400, { message: '请输入账号和密码' });

  const user = identifier.includes('@')
    ? await getUserByEmail(c.env, identifier.toLowerCase())
    : await getUserByUsername(c.env, identifier);
  if (!user || !(await verifyPassword(password, user.password_salt, user.password_hash))) {
    throw new HTTPException(401, { message: '账号或密码不正确' });
  }
  if (user.banned) throw new HTTPException(403, { message: '该账号已被停用' });

  await createSession(c, user.id);
  await c.env.DB.prepare('UPDATE users SET last_login_at = ? WHERE id = ?')
    .bind(nowIso(), user.id)
    .run();
  const fresh = await getUserById(c.env, user.id);
  return c.json({ user: fresh ? toPublicUser(fresh) : null });
});

authRoutes.post('/auth/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

authRoutes.get('/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    const settings = await getSettings(c.env);
    const empty: MeResponse = {
      user: null,
      group: null,
      nextLevel: null,
      checkin: {
        checkedToday: false,
        nextReward: 10,
        streak: 0,
        week: [false, false, false, false, false, false, false],
      },
      inviteCode: null,
      announcement: settings.announcement,
      adMode: settings.adMode,
    };
    return c.json(empty);
  }
  return c.json(await mePayload(c, user));
});

authRoutes.patch('/me', async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const username = body.username === undefined ? user.username : String(body.username).trim();
  const avatar = body.avatar === undefined ? user.avatar : String(body.avatar).trim();
  if (!validUsername(username)) {
    throw new HTTPException(400, { message: '昵称格式不正确' });
  }
  if (!avatar || avatar.length > 8) {
    throw new HTTPException(400, { message: '头像格式不正确' });
  }
  const collision = await getUserByUsername(c.env, username);
  if (collision && collision.id !== user.id) {
    throw new HTTPException(409, { message: '这个昵称已经被占用' });
  }
  await c.env.DB.prepare('UPDATE users SET username = ?, avatar = ? WHERE id = ?')
    .bind(username, avatar, user.id)
    .run();
  const fresh = await getUserById(c.env, user.id);
  return c.json(await mePayload(c, fresh ?? user));
});

authRoutes.post('/me/password', async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const current = String(body.currentPassword ?? '');
  const next = String(body.newPassword ?? '');
  if (!(await verifyPassword(current, user.password_salt, user.password_hash))) {
    throw new HTTPException(400, { message: '当前密码不正确' });
  }
  if (next.length < 8 || next.length > 72) {
    throw new HTTPException(400, { message: '新密码长度需在 8–72 位之间' });
  }
  const { salt, hash } = await hashPassword(next);
  await c.env.DB.prepare(
    'UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?',
  )
    .bind(hash, salt, user.id)
    .run();
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  await createSession(c, user.id);
  return c.json({ ok: true });
});

authRoutes.post('/checkin', async (c) => {
  const user = await requireUser(c);
  const today = shanghaiDay();
  if (user.last_checkin_at === today) {
    throw new HTTPException(409, { message: '今天已经签到过了，明天再来' });
  }
  const streak =
    user.last_checkin_at === previousDay(today) ? Math.min(user.streak + 1, 365) : 1;
  const reward = checkinReward(streak);
  try {
    await c.env.DB.prepare(
      'INSERT INTO checkins (user_id, day, reward, created_at) VALUES (?, ?, ?, ?)',
    )
      .bind(user.id, today, reward, nowIso())
      .run();
  } catch {
    throw new HTTPException(409, { message: '今天已经签到过了' });
  }
  await c.env.DB.prepare('UPDATE users SET streak = ?, last_checkin_at = ? WHERE id = ?')
    .bind(streak, today, user.id)
    .run();
  const awarded = await awardPoints(c.env, user.id, reward, 'checkin', `连续签到 ${streak} 天`, {
    multiply: false,
  });
  const fresh = await getUserById(c.env, user.id);
  return c.json({
    reward: awarded.delta,
    streak,
    points: awarded.points,
    user: fresh ? toPublicUser(fresh) : null,
  });
});
