import React, { useEffect, useState } from 'react';
import {
  Crown,
  LoaderCircle,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Tag,
  Trash2,
  Users,
} from 'lucide-react';
import type { SiteSettings } from '../../shared/types';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';

interface VideoTag {
  key: string;
  sourceId: string;
  vodId: string;
  title: string;
  year: string;
  vip: boolean;
  tags: string;
  updatedAt: string;
}

interface VipPayload {
  settings: SiteSettings;
  stats: { tagged: number; vip: number };
  tags: VideoTag[];
}

export function AdminVipPanel() {
  const { push } = useToast();
  const [data, setData] = useState<VipPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    title: '',
    year: '',
    sourceId: '',
    vodId: '',
    vip: true,
    tags: '',
  });

  const load = () => {
    setLoading(true);
    api<VipPayload>('/admin/vip')
      .then(setData)
      .catch((err) => push(err instanceof Error ? err.message : 'VIP 数据加载失败', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const saveSettings = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const result = await api<{ settings: SiteSettings }>('/admin/settings', {
        method: 'PUT',
        body: data.settings,
      });
      setData({ ...data, settings: result.settings });
      push('VIP 与注册设置已保存。', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : '保存失败', 'error');
    } finally {
      setSaving(false);
    }
  };

  const setAllVip = async (vip: boolean) => {
    try {
      await api('/admin/vip/all', { method: 'POST', body: { vip } });
      if (data) setData({ ...data, settings: { ...data.settings, vipAll: vip } });
      push(vip ? '全站影片已标记为 VIP。' : '已关闭全站 VIP。', 'success');
    } catch (err) {
      push(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  const addTag = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim()) return;
    try {
      await api('/admin/vip/tag', { method: 'POST', body: form });
      push('影片标签已保存。', 'success');
      setForm({ title: '', year: '', sourceId: '', vodId: '', vip: true, tags: '' });
      load();
    } catch (err) {
      push(err instanceof Error ? err.message : '保存失败', 'error');
    }
  };

  const removeTag = async (key: string) => {
    try {
      await api(`/admin/vip/tag/${encodeURIComponent(key)}`, { method: 'DELETE' });
      setData((current) =>
        current ? { ...current, tags: current.tags.filter((item) => item.key !== key) } : current,
      );
      push('标签已删除。', 'info');
    } catch (err) {
      push(err instanceof Error ? err.message : '删除失败', 'error');
    }
  };

  if (loading || !data) {
    return (
      <div className="admin-panel loading-page" style={{ minHeight: 240 }}>
        <LoaderCircle className="spin" size={26} />
        <span>正在载入 VIP 配置…</span>
      </div>
    );
  }

  const filteredTags = data.tags.filter((tag) =>
    `${tag.title} ${tag.key} ${tag.tags}`.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="vip-admin-grid">
      <section className="admin-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              <Crown size={13} /> VIP CONTENT POLICY
            </span>
            <h2>全站 VIP 策略</h2>
          </div>
          <ShieldCheck size={20} />
        </div>
        <div className="vip-toggle-list">
          <div className="toggle-row">
            <div>
              <b>全站影片 VIP</b>
              <span>开启后首页、频道、搜索与详情全部显示 VIP，并仅限会员播放</span>
            </div>
            <button
              type="button"
              className={`switch ${data.settings.vipAll ? 'on' : ''}`}
              onClick={() => void setAllVip(!data.settings.vipAll)}
              aria-label="切换全站 VIP"
            >
              <span />
            </button>
          </div>
          <div className="toggle-row">
            <div>
              <b>搜索结果自动 VIP</b>
              <span>搜索出来的影片自动带 VIP 标签，无需逐条标记</span>
            </div>
            <button
              type="button"
              className={`switch ${data.settings.vipAutoSearch ? 'on' : ''}`}
              onClick={() =>
                setData({
                  ...data,
                  settings: { ...data.settings, vipAutoSearch: !data.settings.vipAutoSearch },
                })
              }
              aria-label="切换搜索自动 VIP"
            >
              <span />
            </button>
          </div>
          <div className="toggle-row">
            <div>
              <b>仅邀请注册</b>
              <span>开启后新用户必须填写有效邀请码</span>
            </div>
            <button
              type="button"
              className={`switch ${data.settings.inviteOnly ? 'on' : ''}`}
              onClick={() =>
                setData({
                  ...data,
                  settings: { ...data.settings, inviteOnly: !data.settings.inviteOnly },
                })
              }
              aria-label="切换仅邀请注册"
            >
              <span />
            </button>
          </div>
        </div>
        <div className="vip-field-grid">
          <label className="field">
            <span>VIP 标签名称</span>
            <input
              value={data.settings.vipLabel}
              onChange={(event) =>
                setData({ ...data, settings: { ...data.settings, vipLabel: event.target.value } })
              }
              maxLength={16}
            />
          </label>
          <label className="field">
            <span>注册赠送积分</span>
            <input
              type="number"
              min={0}
              max={10000}
              value={data.settings.welcomePoints}
              onChange={(event) =>
                setData({
                  ...data,
                  settings: { ...data.settings, welcomePoints: Number(event.target.value) },
                })
              }
            />
          </label>
        </div>
        <button type="button" className="btn btn-primary" onClick={saveSettings} disabled={saving}>
          <Save size={16} /> {saving ? '保存中…' : '保存 VIP 与注册设置'}
        </button>
        <p className="admin-hint">
          全站 VIP 会覆盖所有内容；关闭后只保留手动打标和“搜索自动 VIP”。会员组：光影会员、星幕会员、永恒会员可播放。
        </p>
      </section>

      <section className="admin-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              <Tag size={13} /> MANUAL TAGGING
            </span>
            <h2>给单部影片打标</h2>
          </div>
          <span className="vip-admin-count">
            {data.stats.vip} 部 VIP / {data.stats.tagged} 条标签
          </span>
        </div>
        <form className="vip-tag-form" onSubmit={addTag}>
          <div className="vip-form-row">
            <label className="field">
              <span>影片标题</span>
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                placeholder="例如：蜘蛛侠：崭新之日"
                required
              />
            </label>
            <label className="field">
              <span>年份</span>
              <input
                value={form.year}
                onChange={(event) => setForm({ ...form, year: event.target.value })}
                placeholder="2026"
                maxLength={8}
              />
            </label>
          </div>
          <div className="vip-form-row">
            <label className="field">
              <span>资源站 ID</span>
              <input
                value={form.sourceId}
                onChange={(event) => setForm({ ...form, sourceId: event.target.value })}
                placeholder="zuida"
              />
            </label>
            <label className="field">
              <span>影片 ID</span>
              <input
                value={form.vodId}
                onChange={(event) => setForm({ ...form, vodId: event.target.value })}
                placeholder="97723"
              />
            </label>
          </div>
          <label className="field">
            <span>附加标签</span>
            <input
              value={form.tags}
              onChange={(event) => setForm({ ...form, tags: event.target.value })}
              placeholder="独播, 4K, 会员抢先"
            />
          </label>
          <label className="vip-checkbox">
            <input
              type="checkbox"
              checked={form.vip}
              onChange={(event) => setForm({ ...form, vip: event.target.checked })}
            />
            <span>标记为 VIP 专属</span>
          </label>
          <button type="submit" className="btn btn-glass">
            <Plus size={15} /> 保存影片标签
          </button>
        </form>
      </section>

      <section className="admin-panel vip-tag-table-panel">
        <div className="panel-head">
          <div>
            <span className="eyebrow">
              <Users size={13} /> TAGGED TITLES
            </span>
            <h2>已打标影片</h2>
          </div>
          <div className="admin-search">
            <Search size={14} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或标签" />
          </div>
        </div>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>影片</th>
                <th>资源</th>
                <th>标签</th>
                <th>更新时间</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {filteredTags.map((tag) => (
                <tr key={tag.key}>
                  <td>
                    <div className="table-user">
                      <div>
                        <b>{tag.title}</b>
                        <span>
                          {tag.year || '—'} · {tag.key}
                        </span>
                      </div>
                    </div>
                  </td>
                  <td>
                    {tag.sourceId || '—'} / {tag.vodId || '—'}
                  </td>
                  <td>
                    {tag.vip ? <span className="vip-chip">VIP</span> : null}
                    {tag.tags ? <span className="table-tag-text">{tag.tags}</span> : null}
                  </td>
                  <td>{new Date(tag.updatedAt).toLocaleDateString('zh-CN')}</td>
                  <td>
                    <button type="button" className="mini-btn danger" onClick={() => removeTag(tag.key)}>
                      <Trash2 size={13} />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTags.length === 0 ? (
                <tr>
                  <td colSpan={5} className="table-empty">
                    还没有手动打标影片。开启“全站影片 VIP”或使用上方表单添加。
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
