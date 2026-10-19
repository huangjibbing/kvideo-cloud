const base = process.env.BASE_URL ?? 'http://127.0.0.1:8787';
let cookie = '';

async function call(path, options = {}) {
  const headers = { ...(options.body ? { 'content-type': 'application/json' } : {}), ...(options.headers ?? {}) };
  if (cookie) headers.cookie = cookie;
  const response = await fetch(base + path, {
    ...options,
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const setCookie = response.headers.getSetCookie?.() ?? [];
  if (setCookie.length) cookie = setCookie.map((item) => item.split(';')[0]).join('; ');
  const text = await response.text();
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  if (!response.ok) throw new Error(`${path} -> ${response.status}: ${text.slice(0, 240)}`);
  return data;
}

function assert(condition, label) {
  if (!condition) throw new Error(`ASSERT: ${label}`);
  console.log('ok -', label);
}

const suffix = Date.now().toString().slice(-7);
const email = `smoke${suffix}@example.com`;
const username = `smoke${suffix}`;
const password = 'SmokeTest!2026';

console.log('--- public ---');
const config = await call('/api/config');
assert(config.stats.titles >= 10, 'catalog stats');
assert(config.announcement.includes('广告'), 'announcement utf-8');

console.log('--- auth ---');
const registered = await call('/api/auth/register', {
  method: 'POST',
  body: { email, username, password },
});
assert(registered.user?.username === username, 'register');
const me = await call('/api/me');
assert(me.user?.points === 50, 'welcome points');
assert(me.inviteCode?.startsWith('KV-'), 'invite code');

console.log('--- checkin / favorite / comment ---');
const checkin = await call('/api/checkin', { method: 'POST' });
assert(checkin.reward >= 10, 'checkin reward');
const favorite = await call('/api/favorites', {
  method: 'POST',
  body: {
    sourceKey: 'catalog:big-buck-bunny',
    titleId: 'big-buck-bunny',
    title: '大雄兔',
    originalTitle: 'Big Buck Bunny',
    accent: ['#ffb86b', '#ff5f7e'],
    motif: 'orb',
  },
});
assert(favorite.ok, 'favorite');
const comment = await call('/api/comments', {
  method: 'POST',
  body: { sourceKey: 'catalog:big-buck-bunny', body: 'This proxy keeps the timeline clean.' },
});
assert(comment.id, 'comment');
const comments = await call('/api/comments?key=catalog%3Abig-buck-bunny');
assert(comments.comments.some((item) => item.id === comment.id), 'comment list');

console.log('--- history / play / proxy ---');
const history = await call('/api/history', {
  method: 'POST',
  body: {
    sourceKey: 'catalog:big-buck-bunny',
    titleId: 'big-buck-bunny',
    title: '大雄兔',
    originalTitle: 'Big Buck Bunny',
    accent: ['#ffb86b', '#ff5f7e'],
    motif: 'orb',
    position: 301,
    duration: 596,
    episodeId: 'main',
  },
});
assert(history.ok, 'history saved');
const play = await call('/api/play/big-buck-bunny', { method: 'POST', body: { mode: 'strict' } });
assert(play.url.includes('/api/hls?'), 'signed playback url');
const manifest = await fetch(play.url);
assert(manifest.ok, 'proxy playlist 200');
assert(manifest.headers.get('x-kv-filter-mode') === 'strict', 'filter mode header');
assert((await manifest.text()).includes('/api/hls?'), 'child uris rewritten');

console.log('--- custom sources ---');
const source = await call('/api/sources', {
  method: 'POST',
  body: { name: 'Smoke HLS', url: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' },
});
assert(source.id, 'custom source');
const customPlay = await call('/api/play-custom', { method: 'POST', body: { sourceId: source.id, mode: 'strict' } });
assert(customPlay.url.includes('/api/hls?'), 'custom play signed');

console.log('--- leaderboard ---');
const board = await call('/api/leaderboard');
assert(board.entries.some((entry) => entry.username === username), 'leaderboard entry');

const userCookie = cookie;
console.log('--- admin ---');
cookie = '';
await call('/api/auth/login', {
  method: 'POST',
  body: { email: 'admin@kvideo.cloud', password: 'KVideo-Admin-2026!x7Qm' },
});
const stats = await call('/api/admin/stats');
assert(stats.stats.users >= 2, 'admin stats');
const users = await call('/api/admin/users?q=smoke');
assert(users.users.length >= 1, 'admin user search');
const smokeUser = users.users.find((entry) => entry.email === email);
await call(`/api/admin/users/${smokeUser.id}`, { method: 'PATCH', body: { pointsDelta: 1000 } });
const settings = await call('/api/admin/settings');
assert(settings.settings.adMode === 'strict', 'admin settings');
await call('/api/admin/settings', {
  method: 'PUT',
  body: { ...settings.settings, adKeywords: 'advert, sponsor, 广告' },
});
const updated = await call('/api/admin/settings');
assert(updated.settings.adKeywords.includes('广告'), 'settings update utf-8');

cookie = userCookie;
const redeem = await call('/api/membership/redeem', { method: 'POST', body: { planId: 'month' } });
assert(redeem.membership === 'plus', 'membership redeem');

console.log('\nALL SMOKE CHECKS PASSED');
