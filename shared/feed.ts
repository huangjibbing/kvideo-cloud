export type FeedCategory =
  | 'movie'
  | 'series'
  | 'anime'
  | 'variety'
  | 'domestic'
  | 'overseas'
  | 'documentary'
  | 'short';

export interface FeedOffer {
  sourceId: string;
  sourceName: string;
  vodId: string;
}

export interface FeedItem {
  key: string;
  title: string;
  poster: string;
  year: string;
  typeName: string;
  remarks: string;
  area: string;
  lang: string;
  score: number;
  categories: FeedCategory[];
  offers: FeedOffer[];
  sourceId: string;
  sourceName: string;
  vodId: string;
}

export interface FeedSection {
  id: FeedCategory;
  label: string;
  description: string;
  items: FeedItem[];
}

export interface FeedHome {
  hero: FeedItem[];
  sections: FeedSection[];
  categories: Array<{ id: FeedCategory; label: string }>;
  total: number;
  sourceCount: number;
  updatedAt: string;
}

export interface FeedCategoryResponse {
  category: FeedCategory;
  label: string;
  items: FeedItem[];
  page: number;
  hasMore: boolean;
  total: number;
}

export const FEED_CATEGORIES: Array<{ id: FeedCategory; label: string }> = [
  { id: 'movie', label: '电影' },
  { id: 'series', label: '电视剧' },
  { id: 'anime', label: '动漫' },
  { id: 'variety', label: '综艺' },
  { id: 'domestic', label: '国产剧' },
  { id: 'overseas', label: '海外剧' },
  { id: 'documentary', label: '纪录片' },
  { id: 'short', label: '短剧' },
];
