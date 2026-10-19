import type { Context } from 'hono';
import {
  filterM3u8,
  rewritePlaylistUris,
  type AdFilterMode,
} from '../../shared/adfilter';
import type { AppEnv } from './db';
import { getSettings } from './db';
import { createSignedProxyUrl, isSafeRemoteUrl, verifyProxyUrl } from './sign';
import { safeEqual } from './auth';

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type',
  'Access-Control-Expose-Headers':
    'Content-Length, Content-Range, Accept-Ranges, X-KV-Ads-Removed, X-KV-Filter-Mode',
};

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 KVideoCloud/1.0';

function withCors(headers: Headers) {
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return headers;
}

function playlistLike(contentType: string, target: string, finalUrl: string) {
  const type = contentType.toLowerCase();
  if (type.includes('mpegurl') || type.includes('m3u8')) return true;
  return /\.m3u8(?:$|\?)/i.test(target) || /\.m3u8$/i.test(new URL(finalUrl).pathname);
}

export async function hlsProxy(c: Context<AppEnv>) {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: withCors(new Headers()) });
  }

  const secret = c.env.PROXY_SECRET || c.env.SESSION_SECRET;
  if (!secret) {
    return new Response('Proxy secret is not configured', { status: 503, headers: withCors(new Headers()) });
  }

  const verified = await verifyProxyUrl(c.req.url, secret);
  if (!verified) {
    return new Response('Invalid or expired proxy signature', {
      status: 403,
      headers: withCors(new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })),
    });
  }

  const requestHeaders = new Headers({
    'User-Agent': BROWSER_UA,
    Accept: '*/*',
    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
  });
  if (verified.referer) requestHeaders.set('Referer', verified.referer);
  const range = c.req.header('Range');
  if (range) requestHeaders.set('Range', range);
  const ifNoneMatch = c.req.header('If-None-Match');
  if (ifNoneMatch) requestHeaders.set('If-None-Match', ifNoneMatch);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 18_000);
  let upstream: Response;
  try {
    upstream = await fetch(verified.url, {
      method: c.req.method === 'HEAD' ? 'HEAD' : 'GET',
      headers: requestHeaders,
      redirect: 'follow',
      signal: controller.signal,
      cf: {
        cacheTtl: 0,
        cacheEverything: false,
      },
    });
  } catch (error) {
    clearTimeout(timeout);
    const message = error instanceof Error && error.name === 'AbortError' ? '上游请求超时' : '无法连接上游媒体源';
    return new Response(message, {
      status: 504,
      headers: withCors(new Headers({ 'Content-Type': 'text/plain; charset=utf-8' })),
    });
  }
  clearTimeout(timeout);

  if (!upstream.ok && upstream.status !== 206 && upstream.status !== 304) {
    const contentType = upstream.headers.get('Content-Type') ?? 'text/plain; charset=utf-8';
    const body = c.req.method === 'HEAD' ? null : await upstream.text().catch(() => '');
    return new Response(body, {
      status: upstream.status,
      headers: withCors(
        new Headers({
          'Content-Type': contentType,
          'Cache-Control': 'no-store',
        }),
      ),
    });
  }

  const contentType = upstream.headers.get('Content-Type') ?? '';
  const finalUrl = upstream.url || verified.url;

  if (c.req.method !== 'HEAD' && playlistLike(contentType, verified.url, finalUrl)) {
    const contentLength = Number(upstream.headers.get('Content-Length') ?? '0');
    if (contentLength > 8_000_000) {
      return new Response('Playlist is too large', {
        status: 413,
        headers: withCors(new Headers()),
      });
    }
    const text = await upstream.text();
    if (text.trimStart().startsWith('#EXTM3U')) {
      const settings = await getSettings(c.env);
      const keywords = settings.adKeywords
        .split(/[\n,，]/)
        .map((keyword) => keyword.trim())
        .filter(Boolean);
      const mode: AdFilterMode = verified.mode;
      const filtered = filterM3u8(text, finalUrl, { mode, keywords });
      const baseOrigin = new URL(c.req.url).origin;
      const rewritten = await rewritePlaylistUris(
        filtered.content,
        finalUrl,
        async (absolute) => {
          if (!isSafeRemoteUrl(absolute)) return absolute;
          return createSignedProxyUrl(
            baseOrigin,
            { url: absolute, mode, referer: verified.referer },
            secret,
            verified.expiresAt,
          );
        },
      );

      const headers = withCors(
        new Headers({
          'Content-Type': 'application/vnd.apple.mpegurl; charset=utf-8',
          'Cache-Control': 'private, max-age=0, no-store',
          'X-KV-Filter-Mode': mode,
          'X-KV-Ads-Removed': String(filtered.removedSegments),
          'X-KV-Removed-Duration': String(filtered.removedDuration),
          'X-KV-Ads-Reasons': Object.keys(filtered.reasons).join(',') || 'none',
        }),
      );
      return new Response(rewritten, { status: 200, headers });
    }

    return new Response(text, {
      status: upstream.status,
      headers: withCors(
        new Headers({
          'Content-Type': contentType || 'text/plain; charset=utf-8',
          'Cache-Control': 'no-store',
        }),
      ),
    });
  }

  const headers = new Headers();
  const passthrough = [
    'content-type',
    'content-length',
    'content-range',
    'accept-ranges',
    'etag',
    'last-modified',
    'cache-control',
  ];
  for (const key of passthrough) {
    const value = upstream.headers.get(key);
    if (value) headers.set(key, value);
  }
  if (!headers.has('content-type')) headers.set('content-type', 'application/octet-stream');
  if (!headers.has('cache-control')) headers.set('cache-control', 'public, max-age=300');
  withCors(headers);

  return new Response(c.req.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export { safeEqual };
