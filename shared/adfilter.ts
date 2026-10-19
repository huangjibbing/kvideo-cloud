/**
 * KVideo strict HLS ad filter.
 *
 * Design goals:
 * 1. Remove ads that are inserted *between* media segments (DAI, CUE-OUT blocks).
 * 2. Remove ad segments disguised as normal segments (path / duration / signature signals).
 * 3. Never blank a playlist: if every media segment is suspected, keep the original.
 * 4. Stay deterministic and pure so it can be unit tested outside Workers.
 */

export type AdFilterMode = 'off' | 'standard' | 'strict' | 'aggressive';

export interface AdFilterOptions {
  mode?: AdFilterMode;
  keywords?: string[];
}

export interface AdFilterResult {
  content: string;
  removedSegments: number;
  removedTags: number;
  removedDuration: number;
  keptSegments: number;
  reasons: Record<string, number>;
  isMaster: boolean;
  mode: AdFilterMode;
}

interface Segment {
  uri: string;
  absolute: string;
  duration: number;
  lineIndex: number;
  extinfLine: number;
  pdtLine: number;
  block: number;
  cue: boolean;
  encrypted: boolean;
  index: number;
}

interface BlockStat {
  block: number;
  segments: Segment[];
  total: number;
  avg: number;
  locationMismatch: boolean;
  filenameMismatch: boolean;
  keywordHits: number;
  durationAnomaly: boolean;
  repeated: boolean;
  shortBetween: boolean;
  encryptionIsland: boolean;
  isMain: boolean;
}

const INTERSTITIAL_MARKERS = [
  'class="com.apple.hls.interstitial"',
  'x-asset-uri=',
  'x-asset-list=',
  'x-playout-limit=',
  'x-resume-offset=',
  'x-restrict=',
  'cue="once"',
  'class="ad"',
  'class="ads"',
  'class="com.apple.hls.ad"',
];

const AD_TAG_PREFIXES = [
  '#EXT-X-AD:',
  '#EXT-X-AD',
  '#EXT-X-ASSET:',
  '#EXT-X-ASSET',
  '#EXT-X-CUE-OUT-CONT',
  '#EXT-X-PLACEMENT-OPPORTUNITY',
  '#EXT-X-SCTE35:',
  '#EXT-X-SCTE35',
  '#EXT-OATCLS-SCTE35:',
  '#EXT-OATCLS-SCTE35',
  '#EXT-X-SPLICEPOINT-SCTE35:',
  '#EXT-X-SPLICEPOINT-SCTE35',
];

const AD_TOKEN_RE =
  /(^|[/_.\-])(ad|ads|advert|adverts|advertisement|advertising|preroll|pre-roll|midroll|mid-roll|postroll|post-roll|commercial|commercials|sponsor|sponsored|sponsorship|promo|promotion|vast|vmap|ima|dai|scte|bumper|interstitial)([/_.\-]|$)/i;

const AD_HOST_RE =
  /(^|\.)(doubleclick\.net|googlesyndication\.com|googleadservices\.com|imasdk\.googleapis\.com|adnxs\.com|adserver\.[a-z0-9.-]+|ads\.[a-z0-9.-]+|ad\.doubleclick\.net|spotxchange\.com|freewheel\.tv|yieldmo\.com|teads\.tv|taboola\.com|outbrain\.com)$/i;

const AD_QUERY_KEYS = new Set([
  'ad',
  'ads',
  'adid',
  'ad_id',
  'advertiser',
  'campaign',
  'campaignid',
  'creative',
  'creativeid',
  'vast',
  'vmap',
  'adtype',
  'adpod',
]);

const BYTERANGE_PREFIXES = ['#EXT-X-BYTERANGE:', '#EXT-X-PROGRAM-DATE-TIME:'];
void BYTERANGE_PREFIXES;

function normalizeKeywords(keywords: string[] = []) {
  return Array.from(
    new Set(
      keywords
        .map((keyword) => keyword.trim().toLowerCase())
        .filter((keyword) => keyword.length > 1),
    ),
  );
}

function isInterstitialDateRange(line: string, keywords: string[]) {
  if (!line.startsWith('#EXT-X-DATERANGE:')) return false;
  const lower = line.toLowerCase();
  if (INTERSTITIAL_MARKERS.some((marker) => lower.includes(marker))) return true;
  return keywords.some((keyword) => lower.includes(keyword));
}

function isAdMetadataTag(line: string, keywords: string[]) {
  if (isInterstitialDateRange(line, keywords)) return true;
  return AD_TAG_PREFIXES.some((prefix) => line.startsWith(prefix));
}

/**
 * Inspect the *file name* and query string, not the shared CDN path.
 * A stream hosted at /dai-demo/ must not mark every segment as an ad just
 * because its directory name contains "dai".
 */
export function hasAdUrlSignal(rawUrl: string, baseUrl: string, extraKeywords: string[] = []) {
  let parsed: URL | null = null;
  try {
    parsed = new URL(rawUrl, baseUrl);
  } catch {
    parsed = null;
  }

  if (parsed && AD_HOST_RE.test(parsed.hostname)) return true;

  const pathname = parsed?.pathname ?? rawUrl.split('?')[0];
  const filename = pathname.split('/').filter(Boolean).pop() ?? pathname;
  const query = parsed?.search ?? (rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?')) : '');
  const haystack = `${filename}${query}`.toLowerCase();

  if (AD_TOKEN_RE.test(haystack)) return true;
  if (extraKeywords.some((keyword) => haystack.includes(keyword))) return true;

  if (parsed) {
    for (const key of parsed.searchParams.keys()) {
      if (AD_QUERY_KEYS.has(key.toLowerCase())) return true;
    }
    for (const value of parsed.searchParams.values()) {
      if (AD_TOKEN_RE.test(value)) return true;
    }
  }
  return false;
}

function parseSegments(content: string, baseUrl: string) {
  const lines = content.split(/\r?\n/);
  const segments: Segment[] = [];
  let block = 0;
  let cue = false;
  let nextAd = false;
  let extinfLine = -1;
  let duration = 0;
  let pdtLine = -1;
  let encrypted = false;

  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    const line = raw.trim();

    if (line.startsWith('#EXT-X-KEY:')) {
      const method = line.match(/METHOD=([^,\s]+)/i)?.[1]?.toUpperCase() ?? '';
      encrypted = method !== 'NONE';
      continue;
    }

    if (line === '#EXT-X-DISCONTINUITY' || line.startsWith('#EXT-X-DISCONTINUITY')) {
      block += 1;
      continue;
    }

    if (line.startsWith('#EXT-X-CUE-OUT') && !line.startsWith('#EXT-X-CUE-OUT-CONT')) {
      cue = true;
      continue;
    }
    if (line.startsWith('#EXT-X-CUE-IN')) {
      cue = false;
      nextAd = false;
      continue;
    }
    if (line.startsWith('#EXT-X-AD') || line.startsWith('#EXT-X-ASSET')) {
      nextAd = true;
      continue;
    }

    if (line.startsWith('#EXTINF:')) {
      extinfLine = index;
      const match = line.match(/#EXTINF:\s*([\d.]+)/);
      duration = match ? Number.parseFloat(match[1]) : 0;
      if (!Number.isFinite(duration) || duration < 0) duration = 0;
      continue;
    }

    if (line.startsWith('#EXT-X-PROGRAM-DATE-TIME:')) {
      pdtLine = index;
      continue;
    }

    if (!line || line.startsWith('#')) continue;

    if (extinfLine >= 0) {
      let absolute = line;
      try {
        absolute = new URL(line, baseUrl).toString();
      } catch {
        absolute = line;
      }
      segments.push({
        uri: line,
        absolute,
        duration,
        lineIndex: index,
        extinfLine,
        pdtLine: pdtLine > extinfLine ? pdtLine : -1,
        block,
        cue: cue || nextAd,
        encrypted,
        index: segments.length,
      });
      extinfLine = -1;
      duration = 0;
      pdtLine = -1;
      nextAd = false;
    }
  }

  return { lines, segments };
}

function median(values: number[]) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function locationOf(url: string) {
  try {
    const parsed = new URL(url);
    const path = parsed.pathname;
    const lastSlash = path.lastIndexOf('/');
    return `${parsed.origin}${lastSlash >= 0 ? path.slice(0, lastSlash + 1) : '/'}`;
  } catch {
    const lastSlash = url.lastIndexOf('/');
    return url.slice(0, lastSlash + 1);
  }
}

function filenameOf(url: string) {
  try {
    return new URL(url).pathname.split('/').pop() ?? '';
  } catch {
    return url.split('/').pop() ?? '';
  }
}

function commonPrefix(values: string[]) {
  if (values.length < 2) return '';
  let prefix = '';
  for (let i = 0; i < values[0].length; i += 1) {
    const char = values[0][i];
    if (!values.every((value) => value[i] === char)) break;
    prefix += char;
  }
  return prefix;
}

function signatureOf(segments: Segment[]) {
  return segments.map((segment) => segment.duration.toFixed(3)).join(',');
}

function analyzeBlocks(segments: Segment[]) {
  const byBlock = new Map<number, Segment[]>();
  for (const segment of segments) {
    const list = byBlock.get(segment.block) ?? [];
    list.push(segment);
    byBlock.set(segment.block, list);
  }

  const blockIds = [...byBlock.keys()].sort((a, b) => a - b);
  const blocks = blockIds.map((block) => {
    const list = byBlock.get(block) ?? [];
    const total = list.reduce((sum, segment) => sum + segment.duration, 0);
    return {
      block,
      segments: list,
      total,
      avg: list.length ? total / list.length : 0,
    };
  });

  const main = blocks.reduce(
    (best, item) => (item.total > best.total ? item : best),
    blocks[0] ?? { block: 0, segments: [], total: 0, avg: 0 },
  );
  const mainMedian = median(main.segments.map((segment) => segment.duration));
  const locations = new Map<string, number>();
  for (const segment of main.segments) {
    const location = locationOf(segment.absolute);
    locations.set(location, (locations.get(location) ?? 0) + 1);
  }
  const mainLocation =
    [...locations.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ??
    (main.segments[0] ? locationOf(main.segments[0].absolute) : '');
  const mainPrefix = commonPrefix(main.segments.map((segment) => filenameOf(segment.absolute)))
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
  const signatures = new Map<string, number[]>();

  const encryptionOf = (item: { segments: Segment[] }) => {
    const encrypted = item.segments.filter((segment) => segment.encrypted).length;
    if (encrypted === 0) return 'none';
    if (encrypted === item.segments.length) return 'aes';
    return 'mixed';
  };

  // DAI stitchers often insert a clear (METHOD=NONE) ad pod into an otherwise
  // AES-128 encrypted content stream. A clear run bounded by two encrypted
  // runs on both sides is a very strong ad-insertion signal.
  const encryption = blocks.map((item) => encryptionOf(item));
  const encryptionIslands = new Set<number>();
  for (let index = 0; index < blocks.length; index += 1) {
    if (encryption[index] !== 'none') continue;
    let end = index;
    while (end + 1 < blocks.length && encryption[end + 1] === 'none') end += 1;
    const before = encryption[index - 1];
    const after = encryption[end + 1];
    if (before === 'aes' && after === 'aes') {
      for (let cursor = index; cursor <= end; cursor += 1) {
        encryptionIslands.add(blocks[cursor].block);
      }
    }
    index = end;
  }

  for (const item of blocks) {
    if (item.segments.length >= 2) {
      const signature = signatureOf(item.segments);
      const list = signatures.get(signature) ?? [];
      list.push(item.block);
      signatures.set(signature, list);
    }
  }

  const stats: BlockStat[] = blocks.map((item) => {
    const someLocationMismatch =
      Boolean(mainLocation) &&
      item.segments.length > 0 &&
      item.segments.every((segment) => locationOf(segment.absolute) !== mainLocation);
    const filenameMismatch =
      mainPrefix.length >= 3 &&
      item.segments.length > 0 &&
      item.segments.every(
        (segment) => !filenameOf(segment.absolute).toLowerCase().startsWith(mainPrefix),
      );
    const keywordHits = item.segments.filter((segment) =>
      hasAdUrlSignal(segment.absolute, segment.absolute, []),
    ).length;
    const durationAnomaly =
      mainMedian > 0 &&
      item.segments.length > 0 &&
      (item.avg < mainMedian * 0.55 ||
        item.avg > mainMedian * 1.85 ||
        (item.total < 6 && main.total > 30));
    const signature = signatureOf(item.segments);
    const uniform = item.segments.every(
      (segment) => Math.abs(segment.duration - item.segments[0].duration) < 0.005,
    );
    const matchesMainGrid =
      mainMedian > 0 &&
      item.segments.length > 0 &&
      Math.abs(item.segments[0].duration - mainMedian) < 0.05;
    const allEncrypted =
      item.segments.length > 0 && item.segments.every((segment) => segment.encrypted);
    const repeated =
      item.segments.length >= 2 &&
      (signatures.get(signature)?.length ?? 0) >= 2 &&
      item.block !== main.block &&
      !allEncrypted &&
      !(uniform && matchesMainGrid);
    return {
      block: item.block,
      segments: item.segments,
      total: item.total,
      avg: item.avg,
      locationMismatch: someLocationMismatch,
      filenameMismatch,
      keywordHits,
      durationAnomaly,
      repeated,
      encryptionIsland: encryptionIslands.has(item.block),
      shortBetween:
        item.block > (blockIds[0] ?? 0) &&
        item.block < (blockIds[blockIds.length - 1] ?? 0) &&
        item.total <= 45,
      isMain: item.block === main.block,
    };
  });

  return { stats, main, mainMedian };
}

function shouldDropBlock(stat: BlockStat, mode: AdFilterMode) {
  if (stat.segments.length === 0) return false;
  if (stat.encryptionIsland) return true;
  if (stat.segments.every((segment) => segment.cue)) return true;

  if (stat.isMain) {
    return stat.keywordHits > 0 && stat.keywordHits === stat.segments.length;
  }

  const signals = [
    stat.locationMismatch,
    stat.filenameMismatch,
    stat.durationAnomaly,
    stat.repeated,
    stat.shortBetween,
  ].filter(Boolean).length;

  if (stat.keywordHits > 0) {
    if (stat.segments.length <= 4 || stat.keywordHits / stat.segments.length >= 0.5) return true;
  }

  const strongLocation =
    stat.locationMismatch && stat.durationAnomaly && (stat.shortBetween || stat.filenameMismatch);
  const strongFingerprint =
    stat.filenameMismatch && stat.durationAnomaly && stat.shortBetween;
  const repeatedFingerprint =
    stat.repeated && (stat.locationMismatch || stat.filenameMismatch || stat.durationAnomaly);

  if (mode === 'aggressive') {
    return (
      strongLocation ||
      strongFingerprint ||
      repeatedFingerprint ||
      (signals >= 3 && stat.total <= 45)
    );
  }

  if (mode === 'standard') {
    return stat.total <= 120 && (strongLocation || repeatedFingerprint) && signals >= 3;
  }

  // strict (default): require corroborating evidence; duration alone is never enough.
  return stat.total <= 90 && signals >= 3 && (strongLocation || strongFingerprint || repeatedFingerprint);
}

function bump(reasons: Record<string, number>, reason: string, count = 1) {
  reasons[reason] = (reasons[reason] ?? 0) + count;
}

function cleanupOutput(
  lines: string[],
  removed: Set<number>,
): { content: string; removedTags: number } {
  const kept: string[] = [];
  let sawSegment = false;
  let previousWasDiscontinuity = false;
  let removedTags = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (removed.has(index)) {
      if (lines[index].trim().startsWith('#')) removedTags += 1;
      continue;
    }

    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed === '#EXT-X-DISCONTINUITY') {
      if (!sawSegment || previousWasDiscontinuity) {
        removedTags += 1;
        continue;
      }
      let nextVisible = '';
      for (let lookahead = index + 1; lookahead < lines.length; lookahead += 1) {
        if (removed.has(lookahead)) continue;
        const candidate = lines[lookahead].trim();
        if (!candidate) continue;
        nextVisible = candidate;
        break;
      }
      if (!nextVisible || nextVisible === '#EXT-X-ENDLIST') {
        removedTags += 1;
        continue;
      }
      kept.push(line);
      previousWasDiscontinuity = true;
      continue;
    }

    if (trimmed && !trimmed.startsWith('#')) sawSegment = true;
    kept.push(line);
    previousWasDiscontinuity = false;
  }

  // Collapse blank runs left behind by removed ad blocks.
  const compact: string[] = [];
  let blank = 0;
  for (const line of kept) {
    if (line.trim() === '') {
      blank += 1;
      if (blank > 1) continue;
    } else {
      blank = 0;
    }
    compact.push(line);
  }

  // Drop a trailing discontinuity.
  while (compact.length > 0 && compact[compact.length - 1].trim() === '') compact.pop();
  if (compact[compact.length - 1]?.trim() === '#EXT-X-DISCONTINUITY') compact.pop();
  compact.push('');

  return { content: compact.join('\n'), removedTags };
}

function updateMediaSequence(content: string, added: number) {
  if (added <= 0) return content;
  return content.replace(/#EXT-X-MEDIA-SEQUENCE:(\d+)/, (_, raw: string) => {
    return `#EXT-X-MEDIA-SEQUENCE:${Number(raw) + added}`;
  });
}

export function filterM3u8(
  content: string,
  baseUrl: string,
  options: AdFilterOptions = {},
): AdFilterResult {
  const mode = options.mode ?? 'strict';
  const keywords = normalizeKeywords(options.keywords);
  const base: AdFilterResult = {
    content,
    removedSegments: 0,
    removedTags: 0,
    removedDuration: 0,
    keptSegments: 0,
    reasons: {},
    isMaster: false,
    mode,
  };

  if (!content || mode === 'off') return base;

  const { lines, segments } = parseSegments(content, baseUrl);
  const isMaster = segments.length === 0 && /#EXT-X-STREAM-INF/.test(content);
  const removed = new Set<number>();
  const reasons: Record<string, number> = {};

  // Strip explicit ad metadata even in master playlists (interstitial tags).
  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!trimmed.startsWith('#')) continue;
    if (
      isAdMetadataTag(trimmed, keywords) ||
      trimmed.startsWith('#EXT-X-CUE-OUT') ||
      trimmed.startsWith('#EXT-X-CUE-IN')
    ) {
      removed.add(index);
      bump(reasons, 'ad-tag');
    }
  }

  if (segments.length === 0) {
    const { content: cleaned, removedTags } = cleanupOutput(lines, removed);
    return {
      ...base,
      content: cleaned === '' ? content : cleaned,
      removedTags: Math.max(removedTags, removed.size),
      reasons,
      isMaster,
    };
  }

  const { stats } = analyzeBlocks(segments);
  const adSegments = new Set<number>();

  for (const stat of stats) {
    const blockDropped = shouldDropBlock(stat, mode);
    for (const segment of stat.segments) {
      const keywordHit = hasAdUrlSignal(segment.absolute, segment.absolute, keywords);
      const segmentDropped =
        blockDropped ||
        segment.cue ||
        keywordHit ||
        (mode === 'aggressive' && stat.durationAnomaly && stat.locationMismatch && !stat.isMain);

      if (segmentDropped) {
        adSegments.add(segment.index);
        if (segment.cue) bump(reasons, 'cue-block');
        else if (stat.encryptionIsland) bump(reasons, 'encryption-island');
        else if (keywordHit) bump(reasons, 'ad-url');
        else if (stat.repeated) bump(reasons, 'repeated-signature');
        else if (stat.locationMismatch) bump(reasons, 'location-mismatch');
        else if (stat.durationAnomaly) bump(reasons, 'duration-anomaly');
        else bump(reasons, 'block-fingerprint');
      }
    }
  }

  if (adSegments.size === 0) {
    return {
      ...base,
      content,
      removedTags: removed.size,
      keptSegments: segments.length,
      reasons,
      isMaster,
    };
  }

  // Safety valve: never return an empty timeline.
  if (adSegments.size >= segments.length) {
    const { content: cleaned } = cleanupOutput(lines, removed);
    return {
      ...base,
      content: cleaned === '' ? content : cleaned,
      reasons: { ...reasons, 'guard-all-removed': 1 },
      keptSegments: segments.length,
      removedTags: removed.size,
      isMaster,
    };
  }

  let removedDuration = 0;
  for (const segment of segments) {
    if (!adSegments.has(segment.index)) continue;
    removedDuration += segment.duration;
    removed.add(segment.extinfLine);
    if (segment.pdtLine >= 0) removed.add(segment.pdtLine);
    for (let line = segment.extinfLine; line <= segment.lineIndex; line += 1) removed.add(line);
  }

  const kept = segments.filter((segment) => !adSegments.has(segment.index));
  const firstKept = kept[0];
  const removedBeforeFirst = segments.filter(
    (segment) => adSegments.has(segment.index) && (!firstKept || segment.index < firstKept.index),
  ).length;
  const keptSegments = kept.length;
  const { content: cleaned, removedTags } = cleanupOutput(lines, removed);

  return {
    content: updateMediaSequence(cleaned, removedBeforeFirst),
    removedSegments: adSegments.size,
    removedTags: Math.max(removedTags, removed.size),
    removedDuration: Math.round(removedDuration * 1000) / 1000,
    keptSegments,
    reasons,
    isMaster,
    mode,
  };
}

export function resolvePlaylistUri(uri: string, baseUrl: string) {
  if (!uri || uri.startsWith('data:') || uri.startsWith('blob:') || uri.startsWith('skd:')) {
    return uri;
  }
  try {
    return new URL(uri, baseUrl).toString();
  } catch {
    return uri;
  }
}

/**
 * Rewrites every URI in a playlist (media URIs and URI="..." attributes)
 * through the provided mapper. Used to route all requests through the
 * signed Cloudflare Worker proxy.
 */
export async function rewritePlaylistUris(
  content: string,
  baseUrl: string,
  mapper: (absoluteUrl: string) => Promise<string> | string,
) {
  const cache = new Map<string, Promise<string>>();
  const rewrite = (uri: string) => {
    const absolute = resolvePlaylistUri(uri.trim(), baseUrl);
    if (!absolute || absolute.startsWith('data:') || absolute.startsWith('blob:')) {
      return Promise.resolve(uri);
    }
    let pending = cache.get(absolute);
    if (!pending) {
      pending = Promise.resolve(mapper(absolute));
      cache.set(absolute, pending);
    }
    return pending;
  };

  const lines = content.split(/\r?\n/);
  const output: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) {
      output.push(raw);
      continue;
    }
    if (line.startsWith('#')) {
      if (!line.includes('URI="')) {
        output.push(raw);
        continue;
      }
      let replaced = raw;
      const matches = [...line.matchAll(/URI="([^"]+)"/g)];
      for (const match of matches) {
        const original = match[1];
        const next = await rewrite(original);
        replaced = replaced.replace(`URI="${original}"`, `URI="${next}"`);
      }
      output.push(replaced);
      continue;
    }
    output.push(await rewrite(line));
  }
  return output.join('\n');
}
