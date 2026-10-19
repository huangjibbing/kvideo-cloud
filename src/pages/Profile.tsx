import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Bookmark,
  CalendarCheck,
  Check,
  ChevronRight,
  Clock3,
  Coins,
  Copy,
  Crown,
  Film,
  History,
  Link2,
  LoaderCircle,
  LogOut,
  Pencil,
  Play,
  Plus,
  Settings,
  ShieldCheck,
  Sparkles,
  Trash2,
  Trophy,
  UserRound,
} from 'lucide-react';
import { CATALOG } from '../../shared/catalog';
import { levelInfo, LEVELS, PLANS } from '../../shared/levels';
import type { CustomSource, FavoriteItem, HistoryItem, LedgerEntry, MeResponse } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, copyText, formatDate, percent, reasonLabel } from '../lib/api';
import { Link, useQuery, useRouter } from '../lib/router';
import { GroupBadge } from '../components/GroupBadge';
import { Poster } from '../components/Poster';
import { Modal } from '../components/Modal';
import { Player } from '../components/Player';

type Tab = 'overview' | 'favorites' | 'history' | 'sources' | 'settings';

const TABS: Array<{ id: Tab; label: string; icon: React.ComponentType<{ size?: number }> }> = [
  { id: 'overview', label: '概览', icon: Sparkles },
  { id: 'favorites', label: '收藏', icon: Bookmark },
  { id: 'history', label: '历史', icon: History },
  { id: 'sources', label: '片源', icon: Link2 },
  { id: 'settings', label: '设置', icon: Settings },
];

const AVATARS = ['🍿', '🎞️', '🌙', '🪐', '🦊', '🐳', '🎬', '🌿', '🫧', '🎧'];

export function ProfilePage() {
  const { me, loading, refresh, logout, openAuth } = useAuth();
  const { push } = useToast();
  const query = useQuery();
  const { navigate } = useRouter();
  const tab = (query.get('tab') as Tab) || 'overview';
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [favorites, setFavorites] = useState<FavoriteItem[]>([]);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [sources, setSources] = useState<CustomSource[]>([]);
  const [sourceLimit, setSourceLimit] = useState(3);
  const [addOpen, setAddOpen] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [playSession, setPlaySession] = useState<{ url: string; mode: string; name: string } | null>(null);
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState('🍿');
  const [savingProfile, setSavingProfile] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!me?.user) return;
    setUsername(me.user.username);
    setAvatar(me.user.avatar);
    api<{ entries: LedgerEntry[] }>('/points/ledger')
      .then((data) => setLedger(data.entries))
      .catch(() => undefined);
    api<{ favorites: FavoriteItem[] }>('/favorites')
      .then((data) => setFavorites(data.favorites))
      .catch(() => undefined);
    api<{ history: HistoryItem[] }>('/history')
      .then((data) => setHistory(data.history))
      .catch(() => undefined);
    api<{ sources: CustomSource[]; limit: number }>('/sources')
      .then((data) => {
        setSources(data.sources);
        setSourceLimit(data.limit);
      })
      .catch(() => undefined);
  }, [me?.user]);

  const favoriteTitles = useMemo(
    () =>
      favorites
        .map((item) => CATALOG.find((title) => title.id === item.titleId))
        .filter((item): item is (typeof CATALOG)[number] => Boolean(item)),
    [favorites],
  );

  if (loading) {
    return (
      <div className="page-wrap standalone loading-page">
        <LoaderCircle className="spin" size={30} />
        <span>正在载入你的放映室…</span>
      </div>
    );
  }

  if (!me?.user || !me.group) {
    return (
      <div className="page-wrap standalone empty-state">
        <UserRound size={32} />
        <h1>登录后，光才会为你停留</h1>
        <p>收藏、观看进度、积分、会员身份与自定义片源，都在你的个人放映室里。</p>
        <div className="empty-actions">
          <button type="button" className="btn btn-primary" onClick={() => openAuth('login')}>
            登录
          </button>
          <button type="button" className="btn btn-glass" onClick={() => openAuth('register')}>
            创建账号
          </button>
        </div>
      </div>
    );
  }

  const user = me.user;
  const level = levelInfo(user.level);
  const weekLabels = Array.from({ length: 7 }, (_, index) => {
    const date = new Date();
    date.setDate(date.getDate() - (6 - index));
    return ['日', '一', '二', '三', '四', '五', '六'][date.getDay()];
  });
  const levelProgress = me.nextLevel
    ? percent(user.lifetimePoints - level.minPoints, me.nextLevel.minPoints - level.minPoints)
    : 100;
  const membershipLabel =
    user.membership === 'lifetime'
      ? '永恒会员'
      : user.membership === 'pro'
        ? '星幕会员'
        : user.membership === 'plus'
          ? '光影会员'
          : '免费用户';

  const checkin = async () => {
    setChecking(true);
    try {
      const data = await api<{ reward: number; streak: number }>('/checkin', { method: 'POST' });
      push(`签到成功，+${data.reward} 积分 · 连续 ${data.streak} 天`, 'success');
      await refresh();
    } catch (error) {
      push(error instanceof Error ? error.message : '签到失败', 'error');
    } finally {
      setChecking(false);
    }
  };

  const saveProfile = async () => {
    setSavingProfile(true);
    try {
      await api('/me', { method: 'PATCH', body: { username, avatar } });
      await refresh();
      push('个人资料已更新。', 'success');
    } catch (error) {
      push(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setSavingProfile(false);
    }
  };

  const changePassword = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingPassword(true);
    try {
      await api('/me/password', { method: 'POST', body: { currentPassword, newPassword } });
      setCurrentPassword('');
      setNewPassword('');
      push('密码已更新，其他设备已退出登录。', 'success');
    } catch (error) {
      push(error instanceof Error ? error.message : '修改失败', 'error');
    } finally {
      setSavingPassword(false);
    }
  };

  const removeFavorite = async (sourceKey: string) => {
    await api('/favorites', { method: 'DELETE', body: { sourceKey } });
    setFavorites((current) => current.filter((item) => item.sourceKey !== sourceKey));
    push('已移出收藏。', 'info');
  };

  const clearHistory = async () => {
    await api('/history', { method: 'DELETE' });
    setHistory([]);
    push('观看记录已清空。', 'info');
  };

  const addSource = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdding(true);
    try {
      await api('/sources', { method: 'POST', body: { name: sourceName, url: sourceUrl } });
      const data = await api<{ sources: CustomSource[]; limit: number }>('/sources');
      setSources(data.sources);
      setSourceLimit(data.limit);
      setSourceName('');
      setSourceUrl('');
      setAddOpen(false);
      push('片源已添加。', 'success');
    } catch (error) {
      push(error instanceof Error ? error.message : '添加失败', 'error');
    } finally {
      setAdding(false);
    }
  };

  const playSource = async (source: CustomSource) => {
    try {
      const data = await api<{ url: string; mode: string }>('/play-custom', {
        method: 'POST',
        body: { sourceId: source.id, mode: 'strict', name: source.name },
      });
      setPlaySession({ url: data.url, mode: data.mode, name: source.name });
    } catch (error) {
      push(error instanceof Error ? error.message : '无法打开片源', 'error');
    }
  };

  const removeSource = async (id: string) => {
    await api(`/sources/${id}`, { method: 'DELETE' });
    setSources((current) => current.filter((item) => item.id !== id));
    push('片源已移除。', 'info');
  };

  return (
    <div className="profile-page page-wrap">
      <section className="profile-header">
        <div className="profile-identity">
          <div className="profile-avatar">
            <span>{user.avatar}</span>
            <i className={`profile-avatar-ring membership-${user.membership}`} />
          </div>
          <div className="profile-copy">
            <div className="profile-name-row">
              <h1>{user.username}</h1>
              <GroupBadge group={me.group} />
            </div>
            <p>
              {user.email} · 加入于 {formatDate(user.createdAt)}
            </p>
            <div className="profile-chips">
              <span className="chip chip-accent">
                Lv.{user.level} {level.name}
              </span>
              <span className="chip">{membershipLabel}</span>
              <span className="chip">
                <CalendarCheck size={13} /> 连续 {user.streak} 天
              </span>
            </div>
          </div>
        </div>
        <div className="profile-actions">
          <div className="points-orb">
            <Coins size={18} />
            <div>
              <b>{user.points}</b>
              <span>可用积分</span>
            </div>
          </div>
          <button
            type="button"
            className={`btn ${me.checkin.checkedToday ? 'btn-glass' : 'btn-primary'}`}
            onClick={checkin}
            disabled={me.checkin.checkedToday || checking}
          >
            {me.checkin.checkedToday ? <Check size={16} /> : <CalendarCheck size={16} />}
            {me.checkin.checkedToday ? '今日已签到' : `签到 +${me.checkin.nextReward}`}
          </button>
          <button type="button" className="icon-btn" onClick={() => navigate('/membership')} aria-label="会员中心">
            <Crown size={18} />
          </button>
        </div>
        <div className="profile-level">
          <div className="profile-level-head">
            <span>
              Lv.{user.level} {level.name}
            </span>
            <span>
              {me.nextLevel ? `距离 ${me.nextLevel.name} 还差 ${me.nextLevel.remaining} 成长值` : '已达最高等级'}
            </span>
          </div>
          <div className="profile-level-bar">
            <span style={{ width: `${levelProgress}%` }} />
          </div>
        </div>
      </section>

      <div className="profile-tabs" role="tablist">
        {TABS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={tab === item.id ? 'active' : ''}
              onClick={() => navigate(`/me?tab=${item.id}`, { keepScroll: true })}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' ? (
        <div className="profile-grid">
          <section className="profile-panel profile-stats">
            <div className="stat-tile">
              <Coins size={20} />
              <b>{user.points}</b>
              <span>可用积分</span>
            </div>
            <div className="stat-tile">
              <Trophy size={20} />
              <b>{user.lifetimePoints}</b>
              <span>累计成长值</span>
            </div>
            <div className="stat-tile">
              <Bookmark size={20} />
              <b>{favorites.length}</b>
              <span>收藏作品</span>
            </div>
            <div className="stat-tile">
              <History size={20} />
              <b>{history.length}</b>
              <span>观看记录</span>
            </div>
          </section>

          <section className="profile-panel checkin-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">7-DAY STREAK</span>
                <h2>每日签到</h2>
              </div>
              <span className="panel-note">连续签到奖励递增，最高 +22/天</span>
            </div>
            <div className="checkin-week">
              {me.checkin.week.map((checked, index) => (
                <div key={index} className={`checkin-day ${checked ? 'checked' : ''}`}>
                  <span>{weekLabels[index]}</span>
                  <div>{checked ? <Check size={16} /> : <span />}</div>
                  <i>{checked ? '已签' : '待签'}</i>
                </div>
              ))}
            </div>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={checkin}
              disabled={me.checkin.checkedToday || checking}
            >
              {me.checkin.checkedToday ? '今天已签到，明天继续' : `签到领取 ${me.checkin.nextReward} 积分`}
            </button>
          </section>

          <section className="profile-panel invite-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">INVITE & EARN</span>
                <h2>邀请好友</h2>
              </div>
              <span className="invite-reward">双方各得积分</span>
            </div>
            <p>好友使用你的邀请码注册，你得 80 积分，对方额外得 30 积分。</p>
            <div className="invite-code">
              <code>{me.inviteCode ?? '—'}</code>
              <button
                type="button"
                className="icon-btn"
                onClick={() => {
                  if (me.inviteCode) {
                    void copyText(me.inviteCode);
                    push('邀请码已复制。', 'success');
                  }
                }}
                aria-label="复制邀请码"
              >
                <Copy size={16} />
              </button>
            </div>
            <div className="invite-meta">
              <span>
                <Sparkles size={14} /> 每成功邀请 1 人
              </span>
              <b>+80 PTS</b>
            </div>
          </section>

          <section className="profile-panel ledger-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">POINTS LEDGER</span>
                <h2>积分明细</h2>
              </div>
              <Link to="/membership" className="text-link">
                全部 <ChevronRight size={14} />
              </Link>
            </div>
            {ledger.length === 0 ? (
              <p className="panel-empty">还没有积分记录，签到或收藏作品就能开始累积。</p>
            ) : (
              <div className="ledger-list">
                {ledger.slice(0, 6).map((entry) => (
                  <div key={entry.id} className="ledger-row">
                    <span className={`ledger-icon ${entry.delta > 0 ? 'plus' : 'minus'}`}>
                      {entry.delta > 0 ? '+' : '−'}
                    </span>
                    <div>
                      <b>{reasonLabel(entry.reason)}</b>
                      <span>{entry.note || formatDate(entry.createdAt, true)}</span>
                    </div>
                    <i className={entry.delta > 0 ? 'plus' : 'minus'}>
                      {entry.delta > 0 ? '+' : ''}
                      {entry.delta}
                    </i>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="profile-panel membership-mini">
            <span className="eyebrow">YOUR NEXT CHAPTER</span>
            <h2>{membershipLabel}</h2>
            <p>
              {user.membership === 'free'
                ? '兑换会员可获得积分倍率、专属徽章与更多自定义片源额度。'
                : '会员权益正在生效，继续签到累积积分可兑换更长周期。'}
            </p>
            <div className="membership-mini-plans">
              {PLANS.slice(0, 3).map((plan) => (
                <div key={plan.id}>
                  <b>{plan.points}</b>
                  <span>{plan.name}</span>
                </div>
              ))}
            </div>
            <Link to="/membership" className="btn btn-gold btn-block">
              <Crown size={16} /> 查看会员权益
            </Link>
          </section>
        </div>
      ) : null}

      {tab === 'favorites' ? (
        <section className="profile-tab-content">
          <div className="tab-head">
            <div>
              <span className="eyebrow">YOUR SHELF</span>
              <h2>收藏的作品</h2>
            </div>
            <span className="section-count">{favorites.length} 部</span>
          </div>
          {favoriteTitles.length === 0 ? (
            <div className="empty-state soft">
              <Bookmark size={26} />
              <h3>书架还是空的</h3>
              <p>在作品详情页点击收藏，把喜欢的光留在这里。</p>
              <Link to="/browse" className="btn btn-primary">
                去片库看看
              </Link>
            </div>
          ) : (
            <div className="favorite-grid">
              {favoriteTitles.map((title) => (
                <div className="favorite-item" key={title.id}>
                  <Link to={`/title/${title.id}`} className="favorite-poster">
                    <Poster artwork={title} />
                  </Link>
                  <div className="favorite-copy">
                    <Link to={`/title/${title.id}`}>{title.title}</Link>
                    <span>
                      {title.year} · {title.quality}
                    </span>
                  </div>
                  <div className="favorite-actions">
                    <Link to={`/watch/${title.id}`} className="icon-btn" aria-label={`播放 ${title.title}`}>
                      <Play size={16} />
                    </Link>
                    <button
                      type="button"
                      className="icon-btn danger"
                      onClick={() => removeFavorite(`catalog:${title.id}`)}
                      aria-label="取消收藏"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'history' ? (
        <section className="profile-tab-content">
          <div className="tab-head">
            <div>
              <span className="eyebrow">WATCH HISTORY</span>
              <h2>观看记录</h2>
            </div>
            {history.length > 0 ? (
              <button type="button" className="btn btn-ghost btn-compact" onClick={clearHistory}>
                <Trash2 size={14} /> 清空
              </button>
            ) : null}
          </div>
          {history.length === 0 ? (
            <div className="empty-state soft">
              <History size={26} />
              <h3>还没有观看记录</h3>
              <p>播放任意作品后，进度会自动保存在这里。</p>
              <Link to="/browse" className="btn btn-primary">
                开始观看
              </Link>
            </div>
          ) : (
            <div className="history-list">
              {history.map((item) => {
                const title = CATALOG.find((entry) => entry.id === item.titleId);
                if (!title) return null;
                return (
                  <Link
                    key={`${item.sourceKey}-${item.episodeId ?? 'main'}`}
                    to={`/watch/${title.id}${item.episodeId ? `?ep=${item.episodeId}` : ''}`}
                    className="history-row"
                  >
                    <Poster artwork={title} compact />
                    <div className="history-copy">
                      <b>{title.title}</b>
                      <span>{title.originalTitle}</span>
                      <div className="history-progress">
                        <span style={{ width: `${percent(item.position, item.duration || 1)}%` }} />
                      </div>
                      <i>
                        {formatDate(item.updatedAt, true)} · 已看 {Math.round(percent(item.position, item.duration || 1))}%
                      </i>
                    </div>
                    <span className="history-play">
                      <Play size={18} fill="currentColor" />
                    </span>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {tab === 'sources' ? (
        <section className="profile-tab-content">
          <div className="tab-head">
            <div>
              <span className="eyebrow">CUSTOM HLS</span>
              <h2>我的片源</h2>
              <p className="section-sub">
                当前额度 {sources.length} / {sourceLimit} · 严格广告过滤与签名代理同样适用
              </p>
            </div>
            <button type="button" className="btn btn-primary btn-compact" onClick={() => setAddOpen(true)}>
              <Plus size={15} /> 添加
            </button>
          </div>
          <div className="source-grid">
            {sources.map((source, index) => (
              <div
                key={source.id}
                className="source-card"
                style={
                  {
                    '--source-a': index % 2 === 0 ? '#7c5cff' : '#20d6c7',
                    '--source-b': index % 2 === 0 ? '#20d6c7' : '#7c5cff',
                  } as React.CSSProperties
                }
              >
                <div className="source-card-icon">
                  <Link2 size={18} />
                </div>
                <div className="source-card-copy">
                  <h3>{source.name}</h3>
                  <p>{source.url.replace(/^https?:\/\//, '').slice(0, 54)}</p>
                </div>
                <div className="source-card-actions">
                  <button type="button" className="icon-btn" onClick={() => playSource(source)} aria-label="播放">
                    <Play size={15} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => removeSource(source.id)}
                    aria-label="删除"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
            {sources.length === 0 ? (
              <div className="source-empty">
                <Link2 size={22} />
                <p>添加第一条自定义片源，它只对你可见。</p>
              </div>
            ) : null}
          </div>
          <div className="source-tip">
            <ShieldCheck size={16} />
            <p>自定义片源必须公开可访问且你有权观看。请勿添加盗版或未经授权的直播源。</p>
          </div>
        </section>
      ) : null}

      {tab === 'settings' ? (
        <section className="profile-tab-content settings-grid">
          <div className="settings-card">
            <div className="tab-head compact">
              <div>
                <span className="eyebrow">PROFILE</span>
                <h2>公开资料</h2>
              </div>
            </div>
            <label className="field">
              <span>头像</span>
              <div className="avatar-picker">
                {AVATARS.map((item) => (
                  <button
                    key={item}
                    type="button"
                    className={avatar === item ? 'active' : ''}
                    onClick={() => setAvatar(item)}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </label>
            <label className="field">
              <span>昵称</span>
              <div className="field-input">
                <UserRound size={16} />
                <input value={username} onChange={(event) => setUsername(event.target.value)} maxLength={20} />
              </div>
            </label>
            <button type="button" className="btn btn-primary" onClick={saveProfile} disabled={savingProfile}>
              {savingProfile ? '保存中…' : '保存资料'}
            </button>
          </div>

          <div className="settings-card">
            <div className="tab-head compact">
              <div>
                <span className="eyebrow">SECURITY</span>
                <h2>修改密码</h2>
              </div>
            </div>
            <form className="stack-form" onSubmit={changePassword}>
              <label className="field">
                <span>当前密码</span>
                <div className="field-input">
                  <Pencil size={16} />
                  <input
                    type="password"
                    value={currentPassword}
                    onChange={(event) => setCurrentPassword(event.target.value)}
                    required
                    autoComplete="current-password"
                  />
                </div>
              </label>
              <label className="field">
                <span>新密码</span>
                <div className="field-input">
                  <ShieldCheck size={16} />
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(event) => setNewPassword(event.target.value)}
                    required
                    minLength={8}
                    autoComplete="new-password"
                  />
                </div>
              </label>
              <button type="submit" className="btn btn-glass" disabled={savingPassword}>
                {savingPassword ? '更新中…' : '更新密码'}
              </button>
            </form>
            <div className="danger-zone">
              <div>
                <b>退出当前账号</b>
                <span>收藏与积分会安全保留。</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-compact"
                onClick={async () => {
                  await logout();
                  push('已退出登录。', 'info');
                  navigate('/');
                }}
              >
                <LogOut size={15} /> 退出
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <Modal open={addOpen} onClose={() => setAddOpen(false)} className="form-modal" labelledBy="profile-add-source">
        <span className="eyebrow">
          <Link2 size={13} /> CUSTOM HLS
        </span>
        <h2 id="profile-add-source">添加片源</h2>
        <p className="modal-sub">仅支持公开可访问的 http(s) m3u8，且需拥有合法访问权限。</p>
        <form className="stack-form" onSubmit={addSource}>
          <label className="field">
            <span>名称</span>
            <div className="field-input">
              <Film size={16} />
              <input value={sourceName} onChange={(event) => setSourceName(event.target.value)} required maxLength={40} />
            </div>
          </label>
          <label className="field">
            <span>m3u8 地址</span>
            <div className="field-input">
              <Link2 size={16} />
              <input
                type="url"
                value={sourceUrl}
                onChange={(event) => setSourceUrl(event.target.value)}
                placeholder="https://example.com/playlist.m3u8"
                required
              />
            </div>
          </label>
          <button type="submit" className="btn btn-primary btn-block" disabled={adding}>
            {adding ? '保存中…' : '保存片源'}
          </button>
        </form>
      </Modal>

      <Modal open={Boolean(playSession)} onClose={() => setPlaySession(null)} className="player-modal">
        {playSession ? (
          <>
            <div className="player-modal-head">
              <span className="eyebrow">CUSTOM SOURCE · STRICT FILTER</span>
              <h2>{playSession.name}</h2>
            </div>
            <Player
              src={playSession.url}
              adMode={playSession.mode}
              artwork={{
                accent: ['#7c5cff', '#20d6c7'],
                motif: 'prism',
                title: playSession.name,
                originalTitle: 'CUSTOM SOURCE',
              }}
            />
          </>
        ) : null}
      </Modal>
    </div>
  );
}
