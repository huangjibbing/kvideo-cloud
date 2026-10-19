import type { Context } from 'hono';
import type { AdFilterMode, PublicUser, SiteSettings } from '../../shared/types';
import { levelForPoints } from '../../shared/levels';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  SESSION_SECRET?: string;
  PROXY_SECRET?: string;
  BOOTSTRAP_ADMIN_EMAIL?: string;
  BOOTSTRAP_ADMIN_PASSWORD?: string;
  APP_NAME?: string;
}

export interface UserRow {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  password_salt: string;
  role: 'user' | 'admin' | 'superadmin';
  points: number;
  lifetime_points: number;
  membership: 'free' | 'plus' | 'pro' | 'lifetime';
  membership_expires_at: string | null;
  avatar: string;
  streak: number;
  last_checkin_at: string | null;
  invited_by: string | null;
  banned: number;
  created_at: string;
  last_login_at: string | null;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user: UserRow | null;
    sessionHash: string | null;
  };
};

export function nowIso() {
  return new Date().toISOString();
}

export function newId(prefix: string) {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

export function toPublicUser(row: UserRow): PublicUser {
  const expired =
    (row.membership === 'plus' || row.membership === 'pro') &&
    Boolean(row.membership_expires_at) &&
    new Date(row.membership_expires_at as string).getTime() <= Date.now();
  return {
    id: row.id,
    email: row.email,
    username: row.username,
    role: row.role,
    level: levelForPoints(row.lifetime_points),
    points: row.points,
    lifetimePoints: row.lifetime_points,
    membership: expired ? 'free' : row.membership,
    membershipExpiresAt: expired ? null : row.membership_expires_at,
    avatar: row.avatar,
    streak: row.streak,
    lastCheckinAt: row.last_checkin_at,
    createdAt: row.created_at,
    banned: Boolean(row.banned),
  };
}

const DEFAULT_SETTINGS: SiteSettings = {
  adMode: 'strict',
  adKeywords: '',
  announcement: '',
  registrationOpen: true,
  watchRewardEnabled: true,
};

let settingsCache: { at: number; value: SiteSettings } | null = null;

export async function getSettings(env: Env, force = false): Promise<SiteSettings> {
  if (!force && settingsCache && Date.now() - settingsCache.at < 20_000) {
    return settingsCache.value;
  }
  try {
    const rows = await env.DB.prepare('SELECT key, value FROM app_settings').all<{
      key: string;
      value: string;
    }>();
    const map = new Map((rows.results ?? []).map((row) => [row.key, row.value]));
    const settings: SiteSettings = {
      adMode: sanitizeMode(map.get('adMode')),
      adKeywords: map.get('adKeywords') ?? '',
      announcement: map.get('announcement') ?? '',
      registrationOpen: map.get('registrationOpen') !== '0',
      watchRewardEnabled: map.get('watchRewardEnabled') !== '0',
    };
    settingsCache = { at: Date.now(), value: settings };
    return settings;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function clearSettingsCache() {
  settingsCache = null;
}

export function sanitizeMode(value: string | null | undefined): AdFilterMode {
  if (value === 'off' || value === 'standard' || value === 'aggressive' || value === 'strict') {
    return value;
  }
  return 'strict';
}

export async function getUserById(env: Env, id: string) {
  return env.DB.prepare('SELECT * FROM users WHERE id = ?').bind(id).first<UserRow>();
}

export async function getUserByEmail(env: Env, email: string) {
  return env.DB.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE')
    .bind(email)
    .first<UserRow>();
}

export async function getUserByUsername(env: Env, username: string) {
  return env.DB.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
    .bind(username)
    .first<UserRow>();
}

export async function requireUser(c: Context<AppEnv>) {
  const user = c.get('user');
  if (!user) {
    const { HTTPException } = await import('hono/http-exception');
    throw new HTTPException(401, { message: '请先登录' });
  }
  if (user.banned) {
    const { HTTPException } = await import('hono/http-exception');
    throw new HTTPException(403, { message: '该账号已被停用' });
  }
  return user;
}

export async function requireAdmin(c: Context<AppEnv>) {
  const user = await requireUser(c);
  if (user.role !== 'admin' && user.role !== 'superadmin') {
    const { HTTPException } = await import('hono/http-exception');
    throw new HTTPException(403, { message: '需要管理员权限' });
  }
  return user;
}

export function clientIp(c: Context<AppEnv>) {
  return (
    c.req.header('CF-Connecting-IP') ??
    c.req.header('X-Forwarded-For')?.split(',')[0]?.trim() ??
    'local'
  );
}

const rateBuckets = new Map<string, { count: number; reset: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.reset < now) {
    rateBuckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (bucket.count >= limit) return false;
  bucket.count += 1;
  if (rateBuckets.size > 5000) {
    for (const [bucketKey, value] of rateBuckets) {
      if (value.reset < now) rateBuckets.delete(bucketKey);
    }
  }
  return true;
}

export function avatarFor(seed: string) {
  const avatars = ['🍿', '🎞️', '🌙', '🪐', '🦊', '🐳', '🎬', '🌿', '🫧', '🎧'];
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  return avatars[hash % avatars.length];
}
