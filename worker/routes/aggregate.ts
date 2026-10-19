import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { AggregateDetail, AggregateEpisode, AggregateOffer, AggregateResult, AggregateSearchResponse } from '../../shared/aggregate';
import { findVideoSource, VIDEO_SOURCES, type VideoSource } from '../../shared/sources';
import type { AppEnv } from '../lib/db';
import { clientIp, rateLimit, requireUser } from '../lib/db';
import { createSignedProxyUrl, isSafeRemoteUrl } from '../lib/sign';

export const aggregateRoutes = new Hono<AppEnv>();

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const MAX_SOURCES_PER_REQUEST = 8;
const SEARCH_TTL = 90_000;
const searchCache = new Map<string, { at: number; value: AggregateResult[] }>();
const detailCache = new Map<string, { at: number; value: AggregateDetail }>();

function clean(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeTitle(value: string) {
  return value
    .toLowerCase()
    .replace(/[\s·:：\-—_.,，。!！?？'"“”‘’()（）[\]【】]/g, '')
    .replace(/第[一二三四五六七八九十\d]+季/g, '')
    .trim();
}

function normalizePic(value: string) {
  if (!value) return '';
  if (value.startsWith('//')) return `https:${value}`;
  return value;
}

function normalizeYear(value: unknown) {
  const match = String(value ?? '').match(/(19|20)\d{2}/);
  return match?.[0] ?? '';
}

function offerOf(source: VideoSource, item: Record<string, unknown>): AggregateOffer {
  return {
    sourceId: source.id,
    sourceName: source.name,
    vodId: String(item.vod_id ?? ''),
    remarks: clean(item.vod_remarks),
    year: normalizeYear(item.vod_year),
    typeName: clean(item.type_name ?? item.vod_class),
    pic: normalizePic(clean(item.vod_pic)),
  };
}

function mergeResults(items: AggregateResult[], incoming: AggregateResult[]) {
  const map = new Map(items.map((item) => [item.key, item]));
  for (const item of incoming) {
    const existing = map.get(item.key);
    if (!existing) {
      map.set(item.key, item);
      continue;
    }
    for (const offer of item.offers) {
      if (!existing.offers.some((current) => current.sourceId === offer.sourceId && current.vodId === offer.vodId)) {
        existing.offers.push(offer);
      }
    }
    if (!existing.pic && item.pic) existing.pic = item.pic;
    if (!existing.remarks && item.remarks) existing.remarks = item.remarks;
  }
  return [...map.values()];
}

async function fetchJson(url: string, timeout = 8000): Promise<Record<string, unknown>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'application/json,text/plain,*/*',
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = (await response.text()).replace(/^\uFEFF/, '').trim();
    if (!text) throw new Error('空响应');
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start >= 0 && end > start) {
        return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
      }
      throw new Error('源站未返回 JSON');
    }
  } finally {
    clearTimeout(timer);
  }
}

function apiUrl(source: VideoSource, params: Record<string, string>) {
  const url = new URL(source.baseUrl);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}

async function searchOneSource(source: VideoSource, query: string) {
  const cacheKey = `${source.id}:${query}`;
  const cached = searchCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_TTL) {
    return { source, results: cached.value, latency: 0 };
  }
  const startedAt = Date.now();
  const payload = await fetchJson(apiUrl(source, { ac: 'videolist', wd: query }));
  const list = Array.isArray(payload.list) ? (payload.list as Record<string, unknown>[]) : [];
  const results = list.slice(0, 20).map((item) => {
    const offer = offerOf(source, item);
    const title = clean(item.vod_name) || `未命名 ${offer.vodId}`;
    const year = offer.year;
    return {
      key: `${normalizeTitle(title)}|${year || 'unknown'}`,
      title,
      year,
      typeName: offer.typeName,
      pic: offer.pic,
      remarks: offer.remarks,
      area: clean(item.vod_area),
      lang: clean(item.vod_language),
      actor: clean(item.vod_actor),
      director: clean(item.vod_director),
      offers: [offer],
    } satisfies AggregateResult;
  });
  searchCache.set(cacheKey, { at: Date.now(), value: results });
  if (searchCache.size > 600) {
    const now = Date.now();
    for (const [key, value] of searchCache) {
      if (now - value.at > SEARCH_TTL) searchCache.delete(key);
    }
  }
  return { source, results, latency: Date.now() - startedAt };
}

aggregateRoutes.get('/aggregate/search', async (c) => {
  const query = (c.req.query('q') ?? '').trim().slice(0, 60);
  if (query.length < 1) return c.json({ error: '请输入影片关键词' }, 400);
  if (!rateLimit(`aggregate-search:${clientIp(c)}`, 80, 60_000)) {
    return c.json({ error: '搜索过于频繁，请稍后再试' }, 429);
  }
  const ids = (c.req.query('ids') ?? '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  const selected = (ids.length ? ids : VIDEO_SOURCES.slice(0, MAX_SOURCES_PER_REQUEST).map((source) => source.id))
    .slice(0, MAX_SOURCES_PER_REQUEST)
    .map(findVideoSource)
    .filter((source): source is VideoSource => Boolean(source));

  const settled = await Promise.all(
    selected.map(async (source) => {
      try {
        return await searchOneSource(source, query);
      } catch (error) {
        return {
          source,
          results: [] as AggregateResult[],
          latency: 0,
          error: error instanceof Error ? error.message : '请求失败',
        };
      }
    }),
  );

  let results: AggregateResult[] = [];
  const reports = settled.map((entry) => {
    results = mergeResults(results, entry.results);
    return {
      sourceId: entry.source.id,
      sourceName: entry.source.name,
      count: entry.results.length,
      latency: entry.latency,
      ...('error' in entry && entry.error ? { error: entry.error } : {}),
    };
  });

  results.sort((a, b) => b.offers.length - a.offers.length || b.year.localeCompare(a.year));
  const response: AggregateSearchResponse = { results, sources: reports };
  return c.json(response);
});

function parsePlayGroups(rawFrom: unknown, rawUrl: unknown) {
  const froms = clean(rawFrom).split('$$$');
  const groups = String(rawUrl ?? '').split('$$$');
  const result: AggregateDetail['groups'] = [];
  groups.forEach((group, index) => {
    const episodes: AggregateEpisode[] = [];
    for (const segment of group.split('#')) {
      const split = segment.lastIndexOf('$');
      if (split < 0) continue;
      const name = segment.slice(0, split).trim() || `第 ${episodes.length + 1} 集`;
      let url = segment.slice(split + 1).trim();
      if (!url) continue;
      if (url.startsWith('//')) url = `https:${url}`;
      if (!/^https?:\/\//i.test(url)) continue;
      episodes.push({
        name,
        url,
        direct: /\.(m3u8|mp4)(?:[?#]|$)/i.test(url),
      });
    }
    if (episodes.length) {
      result.push({ flag: clean(froms[index]) || `线路 ${index + 1}`, episodes });
    }
  });
  return result;
}

aggregateRoutes.get('/aggregate/detail', async (c) => {
  const source = findVideoSource(c.req.query('source') ?? '');
  const vodId = clean(c.req.query('id'));
  if (!source) throw new HTTPException(404, { message: '资源站不存在' });
  if (!vodId) throw new HTTPException(400, { message: '缺少影片 ID' });
  const cacheKey = `${source.id}:${vodId}`;
  const cached = detailCache.get(cacheKey);
  if (cached && Date.now() - cached.at < SEARCH_TTL) return c.json(cached.value);

  let payload: Record<string, unknown>;
  try {
    payload = await fetchJson(apiUrl(source, { ac: 'detail', ids: vodId }), 10_000);
  } catch (error) {
    throw new HTTPException(502, {
      message: `资源站详情获取失败：${error instanceof Error ? error.message : '未知错误'}`,
    });
  }
  const list = Array.isArray(payload.list) ? (payload.list as Record<string, unknown>[]) : [];
  const item = list[0];
  if (!item) throw new HTTPException(404, { message: '资源站没有返回这部影片' });
  const offer = offerOf(source, item);
  const detail: AggregateDetail = {
    sourceId: source.id,
    sourceName: source.name,
    vodId,
    title: clean(item.vod_name),
    year: offer.year,
    typeName: offer.typeName,
    pic: offer.pic,
    remarks: offer.remarks,
    area: clean(item.vod_area),
    lang: clean(item.vod_language),
    actor: clean(item.vod_actor),
    director: clean(item.vod_director),
    content: clean(item.vod_content ?? item.vod_blurb).replace(/<[^>]+>/g, '').slice(0, 1200),
    groups: parsePlayGroups(item.vod_play_from, item.vod_play_url),
  };
  detailCache.set(cacheKey, { at: Date.now(), value: detail });
  return c.json(detail);
});

function extractMediaUrl(text: string, pageUrl: string) {
  const cleaned = text
    .replace(/\\\//g, '/')
    .replace(/\\u002F/gi, '/')
    .replace(/&amp;/g, '&');
  const player = cleaned.match(/player_[a-zA-Z0-9_]+\s*=\s*(\{[\s\S]*?\})\s*<\/script>/);
  if (player) {
    try {
      const data = JSON.parse(player[1]) as { url?: string };
      if (data.url) {
        const url = data.url.startsWith('//') ? `https:${data.url}` : data.url;
        if (/^https?:\/\//i.test(url)) return url;
      }
    } catch {
      // Fall through to regex extraction.
    }
  }
  const candidates = [
    ...cleaned.matchAll(/https?:\/\/[^"'\s<>\\]+?\.m3u8[^"'\s<>\\]*/gi),
    ...cleaned.matchAll(/https?:\/\/[^"'\s<>\\]+?\.mp4[^"'\s<>\\]*/gi),
  ];
  for (const match of candidates) {
    const raw = match[0];
    try {
      return new URL(raw, pageUrl).toString();
    } catch {
      // Keep looking.
    }
  }
  return '';
}

async function resolvePlayable(source: VideoSource, episodeUrl: string) {
  if (/\.(m3u8|mp4)(?:[?#]|$)/i.test(episodeUrl)) {
    return { url: episodeUrl, kind: /\.mp4(?:[?#]|$)/i.test(episodeUrl) ? 'file' : 'hls' } as const;
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(episodeUrl, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/json,*/*',
        Referer: source.baseUrl,
      },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`线路返回 HTTP ${response.status}`);
    const finalUrl = response.url || episodeUrl;
    const text = await response.text();
    if (text.trimStart().startsWith('#EXTM3U') || /\.m3u8(?:[?#]|$)/i.test(finalUrl)) {
      return { url: finalUrl, kind: 'hls' } as const;
    }
    const media = extractMediaUrl(text, finalUrl);
    if (!media) throw new Error('未能从播放页解析出 m3u8/mp4 地址');
    return { url: media, kind: /\.mp4(?:[?#]|$)/i.test(media) ? 'file' : 'hls' } as const;
  } finally {
    clearTimeout(timer);
  }
}

aggregateRoutes.post('/aggregate/play', async (c) => {
  const user = await requireUser(c);
  const body = await c.req.json<Record<string, unknown>>().catch(() => ({} as Record<string, unknown>));
  const source = findVideoSource(String(body.sourceId ?? ''));
  const episodeUrl = String(body.url ?? '').trim();
  if (!source) throw new HTTPException(404, { message: '资源站不存在' });
  if (!isSafeRemoteUrl(episodeUrl)) throw new HTTPException(400, { message: '播放地址无效' });
  if (!rateLimit(`aggregate-play:${user.id}`, 60, 60_000)) {
    throw new HTTPException(429, { message: '播放请求过于频繁' });
  }
  let resolved: { url: string; kind: 'hls' | 'file' };
  try {
    resolved = await resolvePlayable(source, episodeUrl);
  } catch (error) {
    throw new HTTPException(502, {
      message: error instanceof Error ? error.message : '无法解析播放地址',
    });
  }
  const secret = c.env.PROXY_SECRET || c.env.SESSION_SECRET;
  if (!secret) throw new HTTPException(503, { message: '代理密钥尚未配置' });
  const expiresAt = Date.now() + 12 * 3600_000;
  const url = await createSignedProxyUrl(
    new URL(c.req.url).origin,
    { url: resolved.url, mode: 'strict', referer: source.baseUrl },
    secret,
    expiresAt,
  );
  return c.json({
    url,
    mode: 'strict' as const,
    kind: resolved.kind,
    sourceName: source.name,
    title: String(body.title ?? '').slice(0, 160),
    episode: String(body.episode ?? '').slice(0, 120),
    expiresAt: new Date(expiresAt).toISOString(),
  });
});
