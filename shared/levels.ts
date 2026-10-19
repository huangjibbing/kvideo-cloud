import type { GroupInfo, Plan, PublicUser } from './types';

export const LEVELS = [
  { level: 1, name: '新芽', minPoints: 0, color: '#8fa2ba' },
  { level: 2, name: '常客', minPoints: 200, color: '#5ee7d4' },
  { level: 3, name: '旅人', minPoints: 800, color: '#7c9dff' },
  { level: 4, name: '鉴赏家', minPoints: 2000, color: '#b18cff' },
  { level: 5, name: '造梦师', minPoints: 5000, color: '#ffb86b' },
  { level: 6, name: '放映员', minPoints: 12000, color: '#ff7ca8' },
] as const;

export const GROUPS: Record<string, GroupInfo> = {
  guest: {
    id: 'guest',
    name: '游客',
    short: 'GUEST',
    color: '#8fa2ba',
    description: '自由浏览公开片库，登录后解锁收藏、历史与积分。',
    icon: 'eye',
  },
  member: {
    id: 'member',
    name: '注册影迷',
    short: 'MEMBER',
    color: '#5ee7d4',
    description: '拥有个人片单、观看进度与每日签到积分。',
    icon: 'user',
  },
  cinephile: {
    id: 'cinephile',
    name: '资深影迷',
    short: 'CINE',
    color: '#7c9dff',
    description: '成长等级达到旅人，享有更高的自定义片源额度。',
    icon: 'film',
  },
  plus: {
    id: 'plus',
    name: '光影会员',
    short: 'PLUS',
    color: '#ffb86b',
    description: '月度或季度通行证，积分加成 1.2×，专属身份标识。',
    icon: 'sparkles',
  },
  pro: {
    id: 'pro',
    name: '星幕会员',
    short: 'PRO',
    color: '#ff7ca8',
    description: '年度通行证，积分加成 1.5×，评论与主页专属光效。',
    icon: 'crown',
  },
  lifetime: {
    id: 'lifetime',
    name: '永恒会员',
    short: 'LIFE',
    color: '#ffe6a7',
    description: '一次点亮，永久保留全部会员权益与限定徽章。',
    icon: 'infinity',
  },
  admin: {
    id: 'admin',
    name: '管理员',
    short: 'ADMIN',
    color: '#a78bfa',
    description: '维护片库、评论与广告过滤策略。',
    icon: 'shield',
  },
  superadmin: {
    id: 'superadmin',
    name: '超级管理员',
    short: 'ROOT',
    color: '#f472b6',
    description: '站点最高权限，可管理用户组与全局设置。',
    icon: 'key',
  },
};

export function groupFor(user: PublicUser | null): GroupInfo {
  if (!user) return GROUPS.guest;
  if (user.role === 'superadmin') return GROUPS.superadmin;
  if (user.role === 'admin') return GROUPS.admin;
  if (user.membership === 'lifetime') return GROUPS.lifetime;
  if (user.membership === 'pro') return GROUPS.pro;
  if (user.membership === 'plus') return GROUPS.plus;
  if (user.level >= 3) return GROUPS.cinephile;
  return GROUPS.member;
}

export function levelInfo(level: number) {
  return LEVELS.find((item) => item.level === level) ?? LEVELS[0];
}

export function nextLevelFor(lifetimePoints: number) {
  const next = LEVELS.find((item) => item.minPoints > lifetimePoints);
  if (!next) return null;
  return {
    level: next.level,
    name: next.name,
    minPoints: next.minPoints,
    remaining: next.minPoints - lifetimePoints,
  };
}

export function levelForPoints(lifetimePoints: number) {
  let level = 1;
  for (const item of LEVELS) {
    if (lifetimePoints >= item.minPoints) level = item.level;
  }
  return level;
}

export const PLANS: Plan[] = [
  {
    id: 'month',
    name: '月度通行证',
    days: 30,
    points: 300,
    tier: 'plus',
    badge: 'PLUS',
    accent: '#5ee7d4',
    perks: ['光影会员身份', '积分加成 1.2×', '自定义片源 10 个', '专属评论徽章'],
  },
  {
    id: 'quarter',
    name: '季度通行证',
    days: 90,
    points: 800,
    tier: 'plus',
    badge: 'PLUS',
    accent: '#7c9dff',
    perks: ['光影会员身份', '积分加成 1.2×', '自定义片源 10 个', '季度限定光效'],
  },
  {
    id: 'year',
    name: '年度星幕',
    days: 365,
    points: 2600,
    tier: 'pro',
    badge: 'PRO',
    accent: '#ff7ca8',
    perks: ['星幕会员身份', '积分加成 1.5×', '自定义片源 50 个', '专属主页光晕'],
  },
  {
    id: 'lifetime',
    name: '永恒之光',
    days: null,
    points: 8888,
    tier: 'lifetime',
    badge: 'LIFE',
    accent: '#ffe6a7',
    perks: ['永久会员身份', '积分加成 1.5×', '自定义片源 100 个', '限定永恒徽章'],
  },
];

export function membershipMultiplier(membership: string) {
  if (membership === 'pro' || membership === 'lifetime') return 1.5;
  if (membership === 'plus') return 1.2;
  return 1;
}

export function customSourceLimit(user: PublicUser) {
  if (user.role === 'admin' || user.role === 'superadmin') return 999;
  if (user.membership === 'lifetime') return 100;
  if (user.membership === 'pro') return 50;
  if (user.membership === 'plus') return 10;
  if (user.level >= 3) return 5;
  return 3;
}
