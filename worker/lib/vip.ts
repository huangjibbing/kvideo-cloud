import type { Env, UserRow } from './db';
import { getSettings } from './db';

export type VipResolver = (key: string) => boolean;

export function isVipMember(user: UserRow | null | undefined) {
  if (!user) return false;
  if (user.role === 'admin' || user.role === 'superadmin') return true;
  return user.membership === 'plus' || user.membership === 'pro' || user.membership === 'lifetime';
}

export async function loadVipResolver(
  env: Env,
  options: { search?: boolean } = {},
): Promise<{ resolver: VipResolver; vipLabel: string; vipAll: boolean; autoSearch: boolean }> {
  const settings = await getSettings(env);
  let tagged = new Set<string>();
  if (!settings.vipAll && !(options.search && settings.vipAutoSearch)) {
    try {
      const rows = await env.DB.prepare('SELECT key FROM video_tags WHERE vip = 1').all<{
        key: string;
      }>();
      tagged = new Set((rows.results ?? []).map((row) => row.key));
    } catch {
      tagged = new Set();
    }
  }
  return {
    resolver: (key: string) =>
      settings.vipAll || Boolean(options.search && settings.vipAutoSearch) || tagged.has(key),
    vipLabel: settings.vipLabel,
    vipAll: settings.vipAll,
    autoSearch: settings.vipAutoSearch,
  };
}

export async function isVipKey(env: Env, key: string, search = false) {
  const { resolver } = await loadVipResolver(env, { search });
  return resolver(key);
}
