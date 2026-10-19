export function normalizeVideoKey(title: string, year: string | number | null | undefined) {
  const normalized = title
    .toLowerCase()
    .replace(/[\s·:：\-—_.,，。!！?？'"“”‘’()（）[\]【】]/g, '')
    .replace(/第[一二三四五六七八九十\d]+季/g, '')
    .trim();
  return `${normalized}|${String(year ?? '').match(/(19|20)\d{2}/)?.[0] ?? 'unknown'}`;
}

export function isVipPublicUser(
  user: { role?: string; membership?: string } | null | undefined,
) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  return user.membership === 'plus' || user.membership === 'pro' || user.membership === 'lifetime';
}
