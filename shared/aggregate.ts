export interface AggregateOffer {
  sourceId: string;
  sourceName: string;
  vodId: string;
  remarks: string;
  year: string;
  typeName: string;
  pic: string;
}

export interface AggregateResult {
  key: string;
  title: string;
  year: string;
  typeName: string;
  pic: string;
  remarks: string;
  area: string;
  lang: string;
  actor: string;
  director: string;
  offers: AggregateOffer[];
}

export interface AggregateSourceReport {
  sourceId: string;
  sourceName: string;
  count: number;
  error?: string;
  latency: number;
}

export interface AggregateSearchResponse {
  results: AggregateResult[];
  sources: AggregateSourceReport[];
}

export interface AggregateEpisode {
  name: string;
  url: string;
  direct: boolean;
}

export interface AggregatePlayGroup {
  flag: string;
  episodes: AggregateEpisode[];
}

export interface AggregateDetail {
  sourceId: string;
  sourceName: string;
  vodId: string;
  title: string;
  year: string;
  typeName: string;
  pic: string;
  remarks: string;
  area: string;
  lang: string;
  actor: string;
  director: string;
  content: string;
  groups: AggregatePlayGroup[];
}

export interface AggregatePlayResponse {
  url: string;
  directUrl: string;
  mode: 'strict';
  kind: 'hls' | 'file';
  sourceName: string;
  title: string;
  episode: string;
  expiresAt: string;
}

/** Extract an HLS/MP4 URL from a MacCMS share/player page. */
export function extractMediaUrlFromHtml(text: string, pageUrl: string) {
  const cleaned = text
    .replace(/\\\//g, '/')
    .replace(/\\u002F/gi, '/')
    .replace(/&amp;/g, '&');
  const absolutize = (value: string) => {
    if (!value) return '';
    if (value.startsWith('//')) return `https:${value}`;
    try {
      return new URL(value, pageUrl).toString();
    } catch {
      return '';
    }
  };
  const mediaFrom = (value: string) => {
    const url = absolutize(value.trim());
    return /\.(m3u8|mp4)(?:[?#]|$)/i.test(url) ? url : '';
  };

  const player = cleaned.match(/player_[a-zA-Z0-9_]+\s*=\s*(\{[\s\S]*?\})\s*;?\s*<\/script>/);
  if (player) {
    try {
      const data = JSON.parse(player[1]) as { url?: string };
      const url = data.url ? mediaFrom(data.url) : '';
      if (url) return url;
    } catch {
      // Fall through to source-level extraction.
    }
  }

  const assignments = [
    ...cleaned.matchAll(/(?:const|let|var)\s+(?:url|vid|videoUrl|playUrl)\s*=\s*['"]([^'"]+)['"]/gi),
    ...cleaned.matchAll(/\burl\s*:\s*['"]([^'"]+)['"]/gi),
    ...cleaned.matchAll(/['"]([^'"]+?\.m3u8[^'"]*)['"]/gi),
    ...cleaned.matchAll(/['"]([^'"]+?\.mp4[^'"]*)['"]/gi),
  ];
  for (const match of assignments) {
    const url = mediaFrom(match[1] ?? '');
    if (url) return url;
  }
  return '';
}
