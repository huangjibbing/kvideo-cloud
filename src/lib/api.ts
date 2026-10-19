export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { body, ...rest } = options;
  const init: RequestInit = {
    credentials: 'include',
    ...rest,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(options.headers ?? {}),
    },
  };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`/api${path}`, init);
  let data: unknown = null;
  const contentType = response.headers.get('Content-Type') ?? '';
  try {
    data = contentType.includes('application/json') ? await response.json() : await response.text();
  } catch {
    data = null;
  }
  if (!response.ok) {
    const message =
      data && typeof data === 'object' && 'error' in data
        ? String((data as { error: unknown }).error)
        : `请求失败 (${response.status})`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}

export function formatNumber(value: number) {
  if (value >= 10000) return `${(value / 10000).toFixed(1).replace(/\.0$/, '')}w`;
  if (value >= 1000) return `${(value / 1000).toFixed(1).replace(/\.0$/, '')}k`;
  return String(value);
}

export function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

export function formatDate(iso: string, withTime = false) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'short',
    day: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  }).format(date);
}

export function percent(value: number, total: number) {
  if (!total) return 0;
  return Math.max(0, Math.min(100, (value / total) * 100));
}

export function copyText(text: string) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  const input = document.createElement('textarea');
  input.value = text;
  document.body.appendChild(input);
  input.select();
  document.execCommand('copy');
  input.remove();
  return Promise.resolve();
}

export function reasonLabel(reason: string) {
  const map: Record<string, string> = {
    welcome: '加入欢迎',
    checkin: '每日签到',
    watch: '观看奖励',
    favorite: '收藏作品',
    invite: '邀请好友',
    'invite-join': '受邀加入',
    membership: '兑换会员',
    'admin-adjust': '管理员调整',
    bootstrap: '站点初始化',
  };
  return map[reason] ?? reason;
}
