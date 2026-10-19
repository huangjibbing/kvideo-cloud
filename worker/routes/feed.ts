import { Hono } from 'hono';
import type {
  FeedCategory,
  FeedCategoryResponse,
  FeedHome,
  FeedItem,
  FeedOffer,
  FeedSection,
} from '../../shared/feed';
import { FEED_CATEGORIES } from '../../shared/feed';
import { findVideoSource, type VideoSource } from '../../shared/sources';
import type { AppEnv } from '../lib/db';
import { clientIp, rateLimit } from '../lib/db';
import { loadVipResolver } from '../lib/vip';

export const feedRoutes = new Hono<AppEnv>();

const FEED_SOURCE_IDS = ['zuida', 'huya', 'baofeng', 'jisu', 'feifan', 'baiduyun'];
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const PAGE_SIZE = 20;
const FEED_TTL = 180_000;
const poolCache = new Map<string, { at: number; value: FeedItem[] }>();
const classCache = new Map<string, { at: number; value: Array<{ id: string; name: string }> }>();

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
  const https = value.replace(/^http:\/\//i, 'https://');
  return https;
}

function normalizeYear(value: unknown) {
  return String(value ?? '').match(/(19|20)\d{2}/)?.[0] ?? '';
}

function categoriesOf(typeName: string, area: string, className: string): FeedCategory[] {
  const type = `${typeName} ${className}`.toLowerCase();
  const region = `${area} ${type}`.toLowerCase();
  const tags: FeedCategory[] = [];
  if (/(动漫|动画|番剧)/.test(type)) tags.push('anime');
  else if (/(电影|片)/.test(type) && !/(剧|综艺|动漫|纪录)/.test(type)) tags.push('movie');
  if (/(剧|连续|电视)/.test(type) && !/(综艺|动漫|动画|电影)/.test(type)) tags.push('series');
  if (/(综艺|真人秀|脱口秀|晚会)/.test(type)) tags.push('variety');
  if (/纪录/.test(type)) tags.push('documentary');
  if (/短剧/.test(type)) tags.push('short');
  if (/(国产|大陆|内地|香港|港台|台湾|中国)/.test(region)) tags.push('domestic');
  if (/(海外|欧美|美国|英国|日本|韩国|日韩|泰国|韩剧|美剧|日剧|泰剧)/.test(region)) {
    tags.push('overseas');
  }
  if (tags.length === 0) tags.push('movie');
  return Array.from(new Set(tags));
}

function isBlockedContent(title: string, typeName: string, remarks: string) {
  const text = `${title} ${typeName} ${remarks}`.toLowerCase();
  // Sports replays and adult categories are not part of the iQIYI-style
  // film/TV feed. premium groups are already removed at import time.
  if (
    /(足球|篮球|体育|赛事|nba|cba|英超|西甲|意甲|德甲|法甲|中超|斯诺克|网球|排球|乒乓|羽毛球|赛车|拳击|ufc|wwe|摔角|录播|回放)/i.test(
      typeName,
    )
  ) {
    return true;
  }
  return /(伦理|情色|三级|色情|成人片|里番|无码|有码|做爱|性爱|约炮|嫖|淫乱|乱伦|迷奸|强暴|裸露|全裸|艳照|福利视频)/i.test(
    text,
  );
}

function apiUrl(source: VideoSource, page: number) {
  const url = new URL(source.baseUrl);
  url.searchParams.set('ac', 'videolist');
  url.searchParams.set('pg', String(page));
  return url.toString();
}

async function fetchJson(url: string, timeout = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json,text/plain,*/*' },
      redirect: 'follow',
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const text = (await response.text()).replace(/^\uFEFF/, '').trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('源站未返回 JSON');
    return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>;
  } finally {
    clearTimeout(timer);
  }
}

function itemFrom(source: VideoSource, item: Record<string, unknown>, index: number): FeedItem | null {
  const vodId = clean(item.vod_id);
  const title = clean(item.vod_name);
  if (!vodId || !title) return null;
  const typeName = clean(item.type_name ?? item.vod_class);
  const area = clean(item.vod_area);
  const remarks = clean(item.vod_remarks);
  if (isBlockedContent(title, typeName, remarks)) return null;
  const year = normalizeYear(item.vod_year);
  const offer: FeedOffer = { sourceId: source.id, sourceName: source.name, vodId };
  const score = Number.parseFloat(clean(item.vod_score));
  return {
    key: `${normalizeTitle(title)}|${year || 'unknown'}`,
    title,
    poster: normalizePic(clean(item.vod_pic)),
    year,
    typeName,
    remarks,
    area,
    lang: clean(item.vod_language),
    score: Number.isFinite(score) ? score : 0,
    categories: categoriesOf(typeName, area, clean(item.vod_class)),
    offers: [offer],
    vip: false,
    sourceId: source.id,
    sourceName: source.name,
    vodId,
  };
}

function mergeItems(items: FeedItem[]) {
  const map = new Map<string, FeedItem>();
  for (const item of items) {
    const existing = map.get(item.key);
    if (!existing) {
      map.set(item.key, item);
      continue;
    }
    for (const offer of item.offers) {
      if (!existing.offers.some((entry) => entry.sourceId === offer.sourceId && entry.vodId === offer.vodId)) {
        existing.offers.push(offer);
      }
    }
    if (!existing.poster && item.poster) existing.poster = item.poster;
    if (!existing.remarks && item.remarks) existing.remarks = item.remarks;
    if (existing.score === 0 && item.score > 0) existing.score = item.score;
  }
  return [...map.values()];
}

async function loadPool() {
  const cached = poolCache.get('pool');
  if (cached && Date.now() - cached.at < FEED_TTL) return cached.value;

  const sources = FEED_SOURCE_IDS.map(findVideoSource).filter(
    (source): source is VideoSource => Boolean(source),
  );
  const jobs: Array<Promise<FeedItem[]>> = [];
  for (const source of sources) {
    for (let page = 1; page <= 2; page += 1) {
      jobs.push(
        fetchJson(apiUrl(source, page))
          .then((payload) => {
            const list = Array.isArray(payload.list) ? (payload.list as Record<string, unknown>[]) : [];
            return list
              .slice(0, PAGE_SIZE)
              .map((item, index) => itemFrom(source, item, index))
              .filter((item): item is FeedItem => Boolean(item));
          })
          .catch(() => [] as FeedItem[]),
      );
    }
  }
  const [batches, movieBatches] = await Promise.all([
    Promise.all(jobs),
    loadExtraMovies(sources),
  ]);
  const merged = mergeItems([...batches.flat(), ...movieBatches]).sort((a, b) => {
    const yearDiff = Number(b.year || 0) - Number(a.year || 0);
    if (yearDiff !== 0) return yearDiff;
    return b.offers.length - a.offers.length;
  });
  poolCache.set('pool', { at: Date.now(), value: merged });
  return merged;
}

async function loadClasses(source: VideoSource) {
  const cached = classCache.get(source.id);
  if (cached && Date.now() - cached.at < FEED_TTL * 4) return cached.value;
  try {
    const payload = await fetchJson(`${source.baseUrl}?ac=list`, 7000);
    const classes = Array.isArray(payload.class)
      ? (payload.class as Record<string, unknown>[])
          .map((item) => ({ id: clean(item.type_id), name: clean(item.type_name) }))
          .filter((item) => item.id && item.name)
      : [];
    classCache.set(source.id, { at: Date.now(), value: classes });
    return classes;
  } catch {
    return [];
  }
}

async function loadExtraMovies(sources: VideoSource[]) {
  const classes = await Promise.all(sources.map(async (source) => ({ source, list: await loadClasses(source) })));
  const jobs: Array<Promise<FeedItem[]>> = [];
  for (const entry of classes) {
    const movieClasses = entry.list
      .filter((item) =>
        /(电影|动作片|喜剧片|爱情片|科幻片|恐怖片|剧情片|战争片|悬疑|犯罪|冒险|奇幻)/.test(item.name),
      )
      .filter((item) => !/(伦理|理论|纪录|动漫|动画|剧|综艺)/.test(item.name))
      .slice(0, 2);
    for (const item of movieClasses) {
      const url = new URL(entry.source.baseUrl);
      url.searchParams.set('ac', 'videolist');
      url.searchParams.set('t', item.id);
      url.searchParams.set('pg', '1');
      jobs.push(
        fetchJson(url.toString(), 7000)
          .then((payload) => {
            const list = Array.isArray(payload.list) ? (payload.list as Record<string, unknown>[]) : [];
            return list
              .slice(0, PAGE_SIZE)
              .map((row, index) => itemFrom(entry.source, row, index))
              .filter((row): row is FeedItem => Boolean(row));
          })
          .catch(() => [] as FeedItem[]),
      );
    }
  }
  const results = await Promise.all(jobs);
  return results.flat();
}

function sectionOf(id: FeedCategory, pool: FeedItem[], limit = 18): FeedSection {
  const meta = FEED_CATEGORIES.find((item) => item.id === id)!;
  let items = pool.filter((item) => item.categories.includes(id));
  if (id === 'domestic' || id === 'overseas') {
    items = items.filter((item) => item.categories.includes('series'));
  }
  return { ...meta, description: '', items: items.slice(0, limit) };
}

feedRoutes.get('/feed/home', async (c) => {
  if (!rateLimit(`feed-home:${clientIp(c)}`, 60, 60_000)) {
    return c.json({ error: '请求过于频繁' }, 429);
  }
  const pool = await loadPool();
  const vip = await loadVipResolver(c.env);
  const decorated = pool.map((item) => ({ ...item, vip: vip.resolver(item.key) }));
  const heroPool = decorated.filter((item) => item.poster);
  const hero = heroPool
    .slice()
    .sort((a, b) => b.offers.length - a.offers.length || Number(b.year) - Number(a.year))
    .slice(0, 6);
  const sections = (['movie', 'series', 'anime', 'variety', 'domestic', 'overseas', 'documentary', 'short'] as FeedCategory[])
    .map((id) => sectionOf(id, decorated))
    .filter((section) => section.items.length > 0);
  const response: FeedHome = {
    hero,
    sections,
    categories: FEED_CATEGORIES,
    total: decorated.length,
    sourceCount: FEED_SOURCE_IDS.length,
    updatedAt: new Date().toISOString(),
  };
  return c.json(response);
});

feedRoutes.get('/feed/category', async (c) => {
  if (!rateLimit(`feed-category:${clientIp(c)}`, 90, 60_000)) {
    return c.json({ error: '请求过于频繁' }, 429);
  }
  const requested = c.req.query('cat') ?? 'movie';
  const category = (FEED_CATEGORIES.find((item) => item.id === requested)?.id ?? 'movie') as FeedCategory;
  const page = Math.max(1, Math.min(10, Number(c.req.query('page')) || 1));
  const pool = await loadPool();
  const vip = await loadVipResolver(c.env);
  const decorated = pool.map((item) => ({ ...item, vip: vip.resolver(item.key) }));
  let items = decorated.filter((item) => item.categories.includes(category));
  if (category === 'domestic' || category === 'overseas') {
    items = items.filter((item) => item.categories.includes('series'));
  }
  const pageItems = items.slice((page - 1) * 24, page * 24);
  const response: FeedCategoryResponse = {
    category,
    label: FEED_CATEGORIES.find((item) => item.id === category)!.label,
    items: pageItems,
    page,
    hasMore: page * 24 < items.length,
    total: items.length,
  };
  return c.json(response);
});
