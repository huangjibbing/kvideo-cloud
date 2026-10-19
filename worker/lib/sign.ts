import type { AdFilterMode } from '../../shared/types';
import { base64UrlToBytes, bytesToBase64Url, safeEqual } from './auth';

const encoder = new TextEncoder();
const keyCache = new Map<string, Promise<CryptoKey>>();

async function hmacKey(secret: string) {
  const cached = keyCache.get(secret);
  if (cached) return cached;
  const pending = crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  keyCache.set(secret, pending);
  return pending;
}

async function sign(secret: string, value: string) {
  const key = await hmacKey(secret);
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(value));
  return bytesToBase64Url(new Uint8Array(signature));
}

export interface ProxyTarget {
  url: string;
  mode: AdFilterMode;
  referer?: string;
}

export function isSafeRemoteUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
  if (url.username || url.password) return false;
  if (raw.length > 4096) return false;

  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (!host) return false;
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal' ||
    host === '0.0.0.0'
  ) {
    return false;
  }

  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
    const parts = host.split('.').map(Number);
    if (parts.some((part) => part > 255)) return false;
    if (
      parts[0] === 10 ||
      parts[0] === 127 ||
      parts[0] === 0 ||
      (parts[0] === 169 && parts[1] === 254) ||
      (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) ||
      (parts[0] === 192 && parts[1] === 168) ||
      (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127)
    ) {
      return false;
    }
  }

  const ipv6 = host.includes(':');
  if (
    ipv6 &&
    (host === '::1' ||
      host === '::' ||
      host.startsWith('fc') ||
      host.startsWith('fd') ||
      host.startsWith('fe80') ||
      host.startsWith('::ffff:'))
  ) {
    return false;
  }

  if (url.port) {
    const port = Number(url.port);
    if (port < 1024 && port !== 80 && port !== 443) return false;
  }
  return true;
}

export async function createSignedProxyUrl(
  origin: string,
  target: ProxyTarget,
  secret: string,
  expiresAt: number,
) {
  const u = bytesToBase64Url(encoder.encode(target.url));
  const m = target.mode;
  const r = target.referer ? bytesToBase64Url(encoder.encode(target.referer)) : '';
  const expiresAtSeconds = Math.floor((expiresAt < 1e12 ? expiresAt * 1000 : expiresAt) / 1000);
  const e = String(expiresAtSeconds);
  const signature = await sign(secret, `${u}.${m}.${r}.${e}`);
  const params = new URLSearchParams({ u, m, r, e, s: signature });
  return `${origin}/api/hls?${params.toString()}`;
}

export interface VerifiedProxy {
  url: string;
  mode: AdFilterMode;
  referer?: string;
  expiresAt: number;
}

export async function verifyProxyUrl(requestUrl: string, secret: string) {
  const url = new URL(requestUrl);
  const u = url.searchParams.get('u') ?? '';
  const m = url.searchParams.get('m') ?? '';
  const r = url.searchParams.get('r') ?? '';
  const e = url.searchParams.get('e') ?? '';
  const s = url.searchParams.get('s') ?? '';
  if (!u || !m || !e || !s) return null;
  if (!['off', 'standard', 'strict', 'aggressive'].includes(m)) return null;
  const expiresAt = Number(e);
  if (!Number.isFinite(expiresAt) || expiresAt < Date.now() / 1000) return null;
  if (expiresAt > Date.now() / 1000 + 86_400) return null;

  const expected = await sign(secret, `${u}.${m}.${r}.${e}`);
  if (!safeEqual(expected, s)) return null;

  let target = '';
  let referer = '';
  try {
    target = new TextDecoder().decode(base64UrlToBytes(u));
    referer = r ? new TextDecoder().decode(base64UrlToBytes(r)) : '';
  } catch {
    return null;
  }
  if (!isSafeRemoteUrl(target)) return null;
  if (referer && !isSafeRemoteUrl(referer)) referer = '';
  return {
    url: target,
    mode: m as AdFilterMode,
    referer: referer || undefined,
    expiresAt,
  };
}
