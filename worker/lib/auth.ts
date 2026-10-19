import type { Context } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv, Env, UserRow } from './db';
import { avatarFor, nowIso, toPublicUser } from './db';

const encoder = new TextEncoder();
const SESSION_COOKIE = 'kv_session';
const SESSION_DAYS = 30;

export function bytesToBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function base64UrlToBytes(value: string) {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

export function randomToken(bytes = 32) {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(value: string) {
  return bytesToBase64Url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))));
}

async function pbkdf2(password: string, salt: Uint8Array, iterations: number) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, [
    'deriveBits',
  ]);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await pbkdf2(password, salt, 120_000);
  return { salt: bytesToBase64Url(salt), hash: bytesToBase64Url(hash) };
}

export async function verifyPassword(password: string, salt: string, expected: string) {
  try {
    const actual = await pbkdf2(password, base64UrlToBytes(salt), 120_000);
    const expectedBytes = base64UrlToBytes(expected);
    if (actual.length !== expectedBytes.length) return false;
    let difference = 0;
    for (let i = 0; i < actual.length; i += 1) difference |= actual[i] ^ expectedBytes[i];
    return difference === 0;
  } catch {
    return false;
  }
}

export function safeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i += 1) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}

export async function createSession(c: Context<AppEnv>, userId: string) {
  const token = randomToken();
  const tokenHash = await sha256(token);
  const createdAt = nowIso();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000).toISOString();
  await c.env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, expires_at, created_at, user_agent) VALUES (?, ?, ?, ?, ?)',
  )
    .bind(tokenHash, userId, expiresAt, createdAt, c.req.header('User-Agent')?.slice(0, 240) ?? '')
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: new URL(c.req.url).protocol === 'https:',
    path: '/',
    maxAge: SESSION_DAYS * 86400,
  });
  return token;
}

export async function destroySession(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256(token);
    await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
  }
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

export async function sessionUser(env: Env, token: string | undefined) {
  if (!token) return null;
  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`,
  )
    .bind(tokenHash, nowIso())
    .first<UserRow>();
  return row ?? null;
}

export async function resolveUser(c: Context<AppEnv>) {
  const token = getCookie(c, SESSION_COOKIE);
  if (!token) return null;
  return sessionUser(c.env, token);
}

export function sessionTokenFromCookie(c: Context<AppEnv>) {
  return getCookie(c, SESSION_COOKIE);
}

function randomInviteSuffix() {
  return randomToken(4).replace(/[-_]/g, '').slice(0, 6).toUpperCase();
}

export async function issueInviteCode(env: Env, userId: string) {
  const existing = await env.DB.prepare(
    'SELECT code FROM invites WHERE owner_id = ? ORDER BY created_at DESC LIMIT 1',
  )
    .bind(userId)
    .first<{ code: string }>();
  if (existing?.code) return existing.code;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = `KV-${randomInviteSuffix()}`;
    try {
      await env.DB.prepare('INSERT INTO invites (code, owner_id, created_at) VALUES (?, ?, ?)')
        .bind(code, userId, nowIso())
        .run();
      return code;
    } catch {
      // Collision: try another code.
    }
  }
  return null;
}

let bootstrapState = false;

export async function ensureBootstrapAdmin(env: Env) {
  if (bootstrapState) return;
  const email = env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!email || !password || password.length < 8) {
    bootstrapState = true;
    return;
  }
  try {
    const existing = await env.DB.prepare(
      "SELECT id FROM users WHERE role = 'superadmin' LIMIT 1",
    ).first();
    if (existing) {
      bootstrapState = true;
      return;
    }
    const already = await env.DB.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE')
      .bind(email)
      .first();
    if (already) {
      bootstrapState = true;
      return;
    }
    let username = email.split('@')[0].replace(/[^a-zA-Z0-9_\u4e00-\u9fa5-]/g, '') || 'root';
    username = username.slice(0, 16);
    const collision = await env.DB.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE')
      .bind(username)
      .first();
    if (collision) username = `${username.slice(0, 12)}_root`;
    const { salt, hash } = await hashPassword(password);
    const id = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO users
       (id, email, username, password_hash, password_salt, role, points, lifetime_points,
        membership, membership_expires_at, avatar, created_at)
       VALUES (?, ?, ?, ?, ?, 'superadmin', 1200, 1200, 'lifetime', NULL, ?, ?)`,
    )
      .bind(id, email, username, hash, salt, avatarFor(email), nowIso())
      .run();
    await env.DB.prepare(
      `INSERT INTO points_ledger (id, user_id, delta, reason, note, created_at)
       VALUES (?, ?, 1200, 'bootstrap', '站点初始化赠送', ?)`,
    )
      .bind(crypto.randomUUID(), id, nowIso())
      .run();
    bootstrapState = true;
  } catch {
    bootstrapState = false;
  }
}

export function publicUserOrNull(row: UserRow | null) {
  return row ? toPublicUser(row) : null;
}
