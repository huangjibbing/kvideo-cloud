export type AdFilterMode = 'off' | 'standard' | 'strict' | 'aggressive';

export interface Episode {
  id: string;
  name: string;
  url: string;
  duration?: string;
  note?: string;
}

export interface CatalogTitle {
  id: string;
  title: string;
  originalTitle: string;
  year: number;
  rating: number;
  genres: string[];
  synopsis: string;
  tagline: string;
  duration: string;
  quality: string;
  accent: [string, string];
  motif: 'orb' | 'rings' | 'beam' | 'grid' | 'bloom' | 'wave' | 'prism' | 'glitch';
  badge?: string;
  type: 'film' | 'series' | 'demo';
  source: string;
  referer?: string;
  episodes?: Episode[];
  featured?: boolean;
  trending?: boolean;
  fresh?: boolean;
  adLab?: boolean;
  collection?: string;
  credits?: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: 'user' | 'admin' | 'superadmin';
  level: number;
  points: number;
  lifetimePoints: number;
  membership: 'free' | 'plus' | 'pro' | 'lifetime';
  membershipExpiresAt: string | null;
  avatar: string;
  streak: number;
  lastCheckinAt: string | null;
  createdAt: string;
  banned: boolean;
}

export interface MeResponse {
  user: PublicUser | null;
  group: GroupInfo | null;
  nextLevel: { level: number; name: string; minPoints: number; remaining: number } | null;
  checkin: { checkedToday: boolean; nextReward: number; streak: number; week: boolean[] };
  inviteCode: string | null;
  announcement: string;
  adMode: AdFilterMode;
}

export interface GroupInfo {
  id: string;
  name: string;
  short: string;
  color: string;
  description: string;
  icon: string;
}

export interface LedgerEntry {
  id: string;
  delta: number;
  reason: string;
  note: string;
  createdAt: string;
}

export interface CommentItem {
  id: string;
  sourceKey: string;
  userId: string;
  username: string;
  avatar: string;
  level: number;
  membership: string;
  body: string;
  createdAt: string;
  mine: boolean;
}

export interface FavoriteItem {
  sourceKey: string;
  titleId: string;
  title: string;
  originalTitle: string;
  accent: [string, string];
  motif: string;
  createdAt: string;
  progress?: number;
}

export interface HistoryItem {
  sourceKey: string;
  titleId: string;
  title: string;
  originalTitle: string;
  accent: [string, string];
  motif: string;
  position: number;
  duration: number;
  episodeId: string | null;
  updatedAt: string;
}

export interface CustomSource {
  id: string;
  name: string;
  url: string;
  createdAt: string;
}

export interface LeaderboardEntry {
  rank: number;
  id: string;
  username: string;
  avatar: string;
  level: number;
  membership: string;
  lifetimePoints: number;
  group: GroupInfo;
}

export interface AdminUser extends PublicUser {
  lastLoginAt: string | null;
  favorites: number;
  comments: number;
}

export interface SiteSettings {
  adMode: AdFilterMode;
  adKeywords: string;
  announcement: string;
  registrationOpen: boolean;
  watchRewardEnabled: boolean;
  vipAll: boolean;
  vipAutoSearch: boolean;
  vipLabel: string;
  inviteOnly: boolean;
  welcomePoints: number;
}

export interface AdminStats {
  users: number;
  newUsers7d: number;
  checkinsToday: number;
  pointsIssued: number;
  comments: number;
  favorites: number;
  history: number;
  customSources: number;
}

export interface Plan {
  id: 'month' | 'quarter' | 'year' | 'lifetime';
  name: string;
  days: number | null;
  points: number;
  tier: 'plus' | 'pro' | 'lifetime';
  badge: string;
  perks: string[];
  accent: string;
}
