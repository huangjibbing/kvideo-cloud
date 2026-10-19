import type { Env } from './db';
import { nowIso, getUserById } from './db';
import { membershipMultiplier } from '../../shared/levels';

export function shanghaiDay(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function previousDay(day: string) {
  const date = new Date(`${day}T12:00:00+08:00`);
  date.setUTCDate(date.getUTCDate() - 1);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function dayStartIso(day: string) {
  return new Date(`${day}T00:00:00+08:00`).toISOString();
}

export function checkinReward(streak: number) {
  return 10 + Math.min(Math.max(streak - 1, 0), 6) * 2;
}

export interface AwardResult {
  delta: number;
  points: number;
  lifetimePoints: number;
}

export async function awardPoints(
  env: Env,
  userId: string,
  baseDelta: number,
  reason: string,
  note = '',
  options: { multiply?: boolean; allowNegativeBalance?: boolean } = {},
): Promise<AwardResult> {
  const user = await getUserById(env, userId);
  if (!user) throw new Error('User not found');
  const multiplier = options.multiply === false ? 1 : membershipMultiplier(user.membership);
  const delta = baseDelta > 0 ? Math.round(baseDelta * multiplier) : baseDelta;
  if (delta < 0 && !options.allowNegativeBalance && user.points + delta < 0) {
    throw new Error('Insufficient points');
  }
  const nextPoints = user.points + delta;
  const nextLifetime = user.lifetime_points + Math.max(delta, 0);
  await env.DB.batch([
    env.DB.prepare('UPDATE users SET points = ?, lifetime_points = ? WHERE id = ?').bind(
      nextPoints,
      nextLifetime,
      userId,
    ),
    env.DB.prepare(
      'INSERT INTO points_ledger (id, user_id, delta, reason, note, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).bind(crypto.randomUUID(), userId, delta, reason, note.slice(0, 160), nowIso()),
  ]);
  return { delta, points: nextPoints, lifetimePoints: nextLifetime };
}

export async function checkinCalendar(env: Env, userId: string, today: string) {
  const days: string[] = [];
  const cursor = new Date(`${today}T12:00:00+08:00`);
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(cursor);
    date.setUTCDate(date.getUTCDate() - offset);
    days.push(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Shanghai',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date),
    );
  }
  const rows = await env.DB.prepare(
    'SELECT day FROM checkins WHERE user_id = ? AND day >= ? ORDER BY day',
  )
    .bind(userId, days[0])
    .all<{ day: string }>();
  const checked = new Set((rows.results ?? []).map((row) => row.day));
  return days.map((day) => checked.has(day));
}
