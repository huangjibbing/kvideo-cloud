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
