import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Ban,
  BarChart3,
  Coins,
  Crown,
  LoaderCircle,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  Users,
} from 'lucide-react';
import type { AdminStats, AdminUser, SiteSettings } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, formatDate, formatNumber, reasonLabel } from '../lib/api';
import { Link } from '../lib/router';
import { GroupBadge } from '../components/GroupBadge';

type Tab = 'overview' | 'users' | 'settings';

interface AdminLedger {
  id: string;
  username: string;
  delta: number;
  reason: string;
  note: string;
  createdAt: string;
}

export function AdminPage() {
  const { me, loading } = useAuth();
  const { push } = useToast();
  const [tab, setTab] = useState<Tab>('overview');
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [ledger, setLedger] = useState<AdminLedger[]>([]);
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);

  const isAdmin = me?.user?.role === 'admin' || me?.user?.role === 'superadmin';

  const loadAll = async () => {
    if (!isAdmin) return;
    setBusy(true);
    try {
      const [statsData, usersData, settingsData, ledgerData] = await Promise.all([
        api<{ stats: AdminStats }>('/admin/stats'),
        api<{ users: AdminUser[] }>('/admin/users'),
        api<{ settings: SiteSettings }>('/admin/settings'),
        api<{ entries: AdminLedger[] }>('/admin/ledger'),
      ]);
      setStats(statsData.stats);
      setUsers(usersData.users);
      setSettings(settingsData.settings);
      setLedger(ledgerData.entries);
    } catch (error) {
      push(error instanceof Error ? error.message : '载入后台失败', 'error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, [isAdmin]);

  const filteredUsers = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return users;
    return users.filter((user) =>
      `${user.username} ${user.email} ${user.role}`.toLowerCase().includes(keyword),
    );
  }, [users, search]);

  const updateUser = async (
    user: AdminUser,
    patch: { pointsDelta?: number; banned?: boolean; role?: string; membership?: string },
  ) => {
    try {
      await api(`/admin/users/${user.id}`, { method: 'PATCH', body: patch });
      push('用户状态已更新。', 'success');
      const data = await api<{ users: AdminUser[] }>('/admin/users');
      setUsers(data.users);
      const statsData = await api<{ stats: AdminStats }>('/admin/stats');
      setStats(statsData.stats);
    } catch (error) {
      push(error instanceof Error ? error.message : '更新失败', 'error');
    }
  };

  const saveSettings = async () => {
    if (!settings) return;
    setSaving(true);
    try {
      const data = await api<{ settings: SiteSettings }>('/admin/settings', {
        method: 'PUT',
        body: settings,
      });
      setSettings(data.settings);
      push('全局设置已保存。', 'success');
    } catch (error) {
      push(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="page-wrap standalone loading-page">
        <LoaderCircle className="spin" size={28} />
        <span>正在验证权限…</span>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-wrap standalone empty-state">
        <ShieldCheck size={30} />
        <h1>这里需要管理员权限</h1>
        <p>当前账号无权访问后台。如果你认为这是一个错误，请联系站点超级管理员。</p>
        <Link to="/" className="btn btn-primary">
          返回首页
        </Link>
      </div>
    );
  }

  return (
    <div className="admin-page page-wrap">
      <section className="admin-header">
        <div>
          <span className="eyebrow">
            <ShieldCheck size={13} /> CONTROL ROOM
          </span>
          <h1>站点控制室</h1>
          <p>管理用户组、积分、广告过滤策略与全站公告。</p>
        </div>
        <div className="admin-identity">
          <span className="avatar">{me?.user?.avatar}</span>
          <div>
            <b>{me?.user?.username}</b>
            <span>{me?.group?.name}</span>
          </div>
          <button type="button" className="icon-btn" onClick={loadAll} aria-label="刷新">
            <RefreshCw size={16} className={busy ? 'spin' : ''} />
          </button>
        </div>
      </section>

      <div className="admin-tabs">
        {[
          { id: 'overview', label: '总览', icon: BarChart3 },
          { id: 'users', label: '用户管理', icon: Users },
          { id: 'settings', label: '站点设置', icon: Settings },
        ].map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'active' : ''}
              onClick={() => setTab(item.id as Tab)}
            >
              <Icon size={16} /> {item.label}
            </button>
          );
        })}
      </div>

      {tab === 'overview' ? (
        <>
          <div className="admin-stats">
            {[
              { label: '注册用户', value: stats?.users ?? 0, icon: Users, note: `近 7 天 +${stats?.newUsers7d ?? 0}` },
              { label: '今日签到', value: stats?.checkinsToday ?? 0, icon: Activity, note: 'Asia/Shanghai' },
              { label: '累计发放积分', value: stats?.pointsIssued ?? 0, icon: Coins, note: '正向流水合计' },
              { label: '收藏总数', value: stats?.favorites ?? 0, icon: Crown, note: '用户片架' },
              { label: '评论总数', value: stats?.comments ?? 0, icon: UserRound, note: '放映后讨论' },
              { label: '观看记录', value: stats?.history ?? 0, icon: Activity, note: '含自定义片源' },
              { label: '自定义片源', value: stats?.customSources ?? 0, icon: SlidersHorizontal, note: '仅所有者可见' },
              { label: '过滤规则', value: 34, icon: ShieldCheck, note: '严格模式' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.label} className="admin-stat">
                  <Icon size={18} />
                  <span>{item.label}</span>
                  <b>{formatNumber(item.value)}</b>
                  <i>{item.note}</i>
                </div>
              );
            })}
          </div>

          <div className="admin-two-col">
            <section className="admin-panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">RECENT POINTS</span>
                  <h2>最近积分流水</h2>
                </div>
              </div>
              <div className="ledger-list">
                {ledger.slice(0, 10).map((entry) => (
                  <div key={entry.id} className="ledger-row">
                    <span className={`ledger-icon ${entry.delta > 0 ? 'plus' : 'minus'}`}>
                      {entry.delta > 0 ? '+' : '−'}
                    </span>
                    <div>
                      <b>
                        {entry.username} · {reasonLabel(entry.reason)}
                      </b>
                      <span>{entry.note || formatDate(entry.createdAt, true)}</span>
                    </div>
                    <i className={entry.delta > 0 ? 'plus' : 'minus'}>
                      {entry.delta > 0 ? '+' : ''}
                      {entry.delta}
                    </i>
                  </div>
                ))}
              </div>
            </section>
            <section className="admin-panel">
              <div className="panel-head">
                <div>
                  <span className="eyebrow">FILTER ENGINE</span>
                  <h2>过滤引擎状态</h2>
                </div>
                <span className="filter-status">
                  <span /> 运行中
                </span>
              </div>
              <div className="engine-list">
                {[
                  ['CUE / SCTE-35', '已启用'],
                  ['HLS Interstitial', '已清理'],
                  ['切片路径指纹', '已启用'],
                  ['时长网格比对', '已启用'],
                  ['重复广告签名', '已启用'],
                  ['时间轴不连续修复', '已启用'],
                  ['全量误删保护', '已启用'],
                ].map(([name, status]) => (
                  <div key={name}>
                    <span>{name}</span>
                    <b>{status}</b>
                  </div>
                ))}
              </div>
              <p className="engine-note">当前全局默认模式：{settings?.adMode ?? 'strict'}。播放链接会携带签名模式，管理员修改后对新会话生效。</p>
            </section>
          </div>
        </>
      ) : null}

      {tab === 'users' ? (
        <section className="admin-panel">
          <div className="admin-toolbar">
            <div className="panel-head compact">
              <div>
                <span className="eyebrow">USER DIRECTORY</span>
                <h2>用户目录</h2>
              </div>
            </div>
            <div className="admin-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索昵称、邮箱或用户组"
              />
            </div>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>用户</th>
                  <th>用户组</th>
                  <th>积分 / 成长值</th>
                  <th>会员</th>
                  <th>加入时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((user) => (
                  <tr key={user.id} className={user.banned ? 'banned' : ''}>
                    <td>
                      <div className="table-user">
                        <span className="avatar avatar-xs">{user.avatar}</span>
                        <div>
                          <b>{user.username}</b>
                          <span>{user.email}</span>
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className={`role-pill role-${user.role}`}>{user.role}</span>
                    </td>
                    <td>
                      <div className="table-points">
                        <b>{user.points}</b>
                        <span>/ {user.lifetimePoints}</span>
                      </div>
                    </td>
                    <td>{user.membership === 'free' ? '—' : user.membership}</td>
                    <td>{formatDate(user.createdAt)}</td>
                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => updateUser(user, { pointsDelta: 100 })}
                          title="加 100 积分"
                        >
                          +100
                        </button>
                        <button
                          type="button"
                          className="mini-btn"
                          onClick={() => updateUser(user, { pointsDelta: -100 })}
                          title="减 100 积分"
                        >
                          −100
                        </button>
                        {me?.user?.role === 'superadmin' ? (
                          <select
                            value={user.role}
                            onChange={(event) => updateUser(user, { role: event.target.value })}
                            aria-label="调整用户组"
                          >
                            <option value="user">user</option>
                            <option value="admin">admin</option>
                            <option value="superadmin">superadmin</option>
                          </select>
                        ) : null}
                        <button
                          type="button"
                          className={`mini-btn ${user.banned ? 'success' : 'danger'}`}
                          onClick={() => updateUser(user, { banned: !user.banned })}
                          title={user.banned ? '解除停用' : '停用账号'}
                        >
                          <Ban size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="admin-hint">
            管理员可调整普通用户的积分与状态；只有超级管理员可修改用户组。至少保留一位超级管理员。
          </p>
        </section>
      ) : null}

      {tab === 'settings' ? (
        <div className="admin-two-col settings-admin">
          <section className="admin-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">FILTER POLICY</span>
                <h2>广告过滤策略</h2>
              </div>
              <ShieldCheck size={20} />
            </div>
            {settings ? (
              <div className="stack-form">
                <label className="field">
                  <span>全局默认模式</span>
                  <select
                    value={settings.adMode}
                    onChange={(event) =>
                      setSettings({ ...settings, adMode: event.target.value as SiteSettings['adMode'] })
                    }
                  >
                    <option value="strict">严格（推荐）</option>
                    <option value="standard">标准</option>
                    <option value="aggressive">强力</option>
                    <option value="off">关闭</option>
                  </select>
                </label>
                <label className="field">
                  <span>自定义广告关键词</span>
                  <textarea
                    rows={3}
                    value={settings.adKeywords}
                    onChange={(event) => setSettings({ ...settings, adKeywords: event.target.value })}
                    placeholder="每行或用逗号分隔，例如：advert, sponsor, 广告"
                  />
                </label>
                <label className="field">
                  <span>全站公告</span>
                  <textarea
                    rows={4}
                    value={settings.announcement}
                    onChange={(event) => setSettings({ ...settings, announcement: event.target.value })}
                    maxLength={500}
                  />
                </label>
                <div className="toggle-row">
                  <div>
                    <b>开放注册</b>
                    <span>关闭后仅现有用户可以登录</span>
                  </div>
                  <button
                    type="button"
                    className={`switch ${settings.registrationOpen ? 'on' : ''}`}
                    onClick={() => setSettings({ ...settings, registrationOpen: !settings.registrationOpen })}
                    aria-label="切换开放注册"
                  >
                    <span />
                  </button>
                </div>
                <div className="toggle-row">
                  <div>
                    <b>观看积分</b>
                    <span>观看满 5 分钟可获得积分</span>
                  </div>
                  <button
                    type="button"
                    className={`switch ${settings.watchRewardEnabled ? 'on' : ''}`}
                    onClick={() => setSettings({ ...settings, watchRewardEnabled: !settings.watchRewardEnabled })}
                    aria-label="切换观看积分"
                  >
                    <span />
                  </button>
                </div>
                <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={saving}>
                  <Save size={16} /> {saving ? '保存中…' : '保存设置'}
                </button>
              </div>
            ) : (
              <p className="panel-empty">正在载入设置…</p>
            )}
          </section>

          <section className="admin-panel">
            <div className="panel-head">
              <div>
                <span className="eyebrow">RULE BOOK</span>
                <h2>严格模式在做什么</h2>
              </div>
            </div>
            <div className="rule-book">
              {[
                ['01', '显式信号', 'CUE-OUT / CUE-IN、SCTE-35、EXT-X-AD、Interstitial DATERANGE 全部移除。'],
                ['02', '广告岛识别', '按不连续点分块，比较主内容块的路径、文件名与时长网格。'],
                ['03', '重复签名', '相同广告切片序列反复出现时，标记为非主内容块。'],
                ['04', '安全阈值', '严格模式需要多信号交叉验证，时长单独异常不会触发删除。'],
                ['05', '时间轴修复', '清理广告后的冗余不连续点，保留必要边界，避免播放卡死。'],
                ['06', '全量保护', '若所有切片都被判定为广告，保留原清单并记录 guard，绝不返回空时间轴。'],
              ].map(([index, title, note]) => (
                <div key={index} className="rule-book-row">
                  <span>{index}</span>
                  <div>
                    <b>{title}</b>
                    <p>{note}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
