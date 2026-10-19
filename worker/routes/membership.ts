import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { PLANS } from '../../shared/levels';
import type { AppEnv } from '../lib/db';
import { getUserById, nowIso, requireUser, toPublicUser } from '../lib/db';

export const membershipRoutes = new Hono<AppEnv>();

const TIER_RANK: Record<string, number> = { free: 0, plus: 1, pro: 2, lifetime: 3 };

membershipRoutes.get('/membership/plans', (c) => c.json({ plans: PLANS }));

membershipRoutes.get('/points/ledger', async (c) => {
  const user = await requireUser(c);
  const rows = await c.env.DB.prepare(
    'SELECT id, delta, reason, note, created_at FROM points_ledger WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
  )
    .bind(user.id)
    .all<{ id: string; delta: number; reason: string; note: string; created_at: string }>();
  return c.json({
    entries: (rows.results ?? []).map((row) => ({
      id: row.id,
      delta: row.delta,
      reason: row.reason,
      note: row.note,
      createdAt: row.created_at,
    })),
  });
});

membershipRoutes.post('/membership/redeem', async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const plan = PLANS.find((item) => item.id === body.planId);
  if (!plan) throw new HTTPException(400, { message: '会员方案不存在' });
  if (user.membership === 'lifetime') {
    throw new HTTPException(400, { message: '你已经是永恒会员，无需再次兑换' });
  }
  const active =
    user.membership_expires_at && new Date(user.membership_expires_at).getTime() > Date.now();
  if ((TIER_RANK[user.membership] ?? 0) > TIER_RANK[plan.tier] && active) {
    throw new HTTPException(400, { message: '当前会员等级更高，无法降级兑换' });
  }
  if (user.points < plan.points) {
    throw new HTTPException(400, {
      message: `积分不足，还需要 ${plan.points - user.points} 积分`,
    });
  }

  const result = await c.env.DB.prepare(
    'UPDATE users SET points = points - ? WHERE id = ? AND points >= ?',
  )
    .bind(plan.points, user.id, plan.points)
    .run();
  if ((result.meta.changes ?? 0) === 0) {
    throw new HTTPException(400, { message: '积分不足' });
  }

  let expiresAt: string | null = null;
  if (plan.days !== null) {
    const currentExpiry =
      active && user.membership_expires_at
        ? new Date(user.membership_expires_at).getTime()
        : Date.now();
    const sameTier = user.membership === plan.tier && active;
    const base = sameTier ? currentExpiry : Date.now();
    expiresAt = new Date(base + plan.days * 86_400_000).toISOString();
  }

  await c.env.DB.batch([
    c.env.DB.prepare(
      'UPDATE users SET membership = ?, membership_expires_at = ? WHERE id = ?',
    ).bind(plan.tier, expiresAt, user.id),
    c.env.DB.prepare(
      'INSERT INTO points_ledger (id, user_id, delta, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(crypto.randomUUID(), user.id, -plan.points, 'membership', plan.name, nowIso()),
  ]);

  const fresh = await getUserById(c.env, user.id);
  return c.json({
    ok: true,
    plan: plan.id,
    membership: plan.tier,
    expiresAt,
    points: fresh?.points ?? user.points - plan.points,
    user: fresh ? toPublicUser(fresh) : null,
  });
});
