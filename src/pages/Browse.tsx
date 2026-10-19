import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  Film,
  Link2,
  Lock,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { CATALOG, GENRES } from '../../shared/catalog';
import type { CustomSource } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../lib/api';
import { Link, useQuery, useRouter } from '../lib/router';
import { TitleCard } from '../components/Poster';
import { Modal } from '../components/Modal';
import { Player } from '../components/Player';

type TypeFilter = 'all' | 'film' | 'series' | 'demo';
type SortKey = 'featured' | 'rating' | 'year' | 'title';

interface PlaySession {
  url: string;
  mode: string;
  name: string;
}

export function BrowsePage() {
  const query = useQuery();
  const { navigate } = useRouter();
  const { me, openAuth } = useAuth();
  const { push } = useToast();
  const [search, setSearch] = useState(query.get('q') ?? '');
  const [genre, setGenre] = useState(query.get('genre') ?? '全部');
  const [type, setType] = useState<TypeFilter>((query.get('type') as TypeFilter) ?? 'all');
  const [sort, setSort] = useState<SortKey>('featured');
  const [sources, setSources] = useState<CustomSource[]>([]);
  const [sourceLimit, setSourceLimit] = useState(3);
  const [addOpen, setAddOpen] = useState(false);
  const [sourceName, setSourceName] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [adding, setAdding] = useState(false);
  const [playSession, setPlaySession] = useState<PlaySession | null>(null);
  const [loadingSource, setLoadingSource] = useState<string | null>(null);

  const refreshSources = () => {
    if (!me?.user) {
      setSources([]);
      return;
    }
    api<{ sources: CustomSource[]; limit: number }>('/sources')
      .then((data) => {
        setSources(data.sources);
        setSourceLimit(data.limit);
      })
      .catch(() => undefined);
  };

  useEffect(refreshSources, [me?.user]);

  const filtered = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    let items = CATALOG.filter((item) => {
      if (type !== 'all' && item.type !== type) return false;
      if (genre !== '全部' && !item.genres.includes(genre)) return false;
      if (!keyword) return true;
      return [item.title, item.originalTitle, item.synopsis, ...item.genres]
        .join(' ')
        .toLowerCase()
        .includes(keyword);
    });
    items = [...items].sort((a, b) => {
      if (sort === 'rating') return b.rating - a.rating;
      if (sort === 'year') return b.year - a.year;
      if (sort === 'title') return a.title.localeCompare(b.title, 'zh-CN');
      return Number(Boolean(b.featured)) - Number(Boolean(a.featured)) || b.rating - a.rating;
    });
    return items;
  }, [search, genre, type, sort]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = search.trim();
    navigate(value ? `/browse?q=${encodeURIComponent(value)}` : '/browse', { replace: true, keepScroll: true });
  };

  const addSource = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdding(true);
    try {
      await api('/sources', { method: 'POST', body: { name: sourceName, url: sourceUrl } });
      push('片源已保存到你的片单。', 'success');
      setAddOpen(false);
      setSourceName('');
      setSourceUrl('');
      refreshSources();
    } catch (error) {
      push(error instanceof Error ? error.message : '保存失败', 'error');
    } finally {
      setAdding(false);
    }
  };

  const playSource = async (source: CustomSource) => {
    setLoadingSource(source.id);
    try {
      const data = await api<{ url: string; mode: string; sourceName: string }>('/play-custom', {
        method: 'POST',
        body: { sourceId: source.id, mode: 'strict', name: source.name },
      });
      setPlaySession({ url: data.url, mode: data.mode, name: source.name });
    } catch (error) {
      push(error instanceof Error ? error.message : '无法打开片源', 'error');
    } finally {
      setLoadingSource(null);
    }
  };

  const removeSource = async (source: CustomSource) => {
    try {
      await api(`/sources/${source.id}`, { method: 'DELETE' });
      push('已移除片源。', 'success');
      refreshSources();
    } catch (error) {
      push(error instanceof Error ? error.message : '移除失败', 'error');
    }
  };

  const counts = useMemo(
    () => ({
      all: CATALOG.length,
      film: CATALOG.filter((item) => item.type === 'film').length,
      series: CATALOG.filter((item) => item.type === 'series').length,
      demo: CATALOG.filter((item) => item.type === 'demo').length,
    }),
    [],
  );

  return (
    <div className="browse-page page-wrap">
      <section className="page-hero">
        <div className="page-hero-copy">
          <span className="eyebrow">
            <Film size={13} /> THE OPEN LIBRARY
          </span>
          <h1>
            片库
            <span>每一帧，都值得完整。</span>
          </h1>
          <p>
            开放电影、HDR 样片与广告过滤实验流。全部来自公开授权的官方测试资源，不收录来源不明的影视内容。
          </p>
        </div>
        <div className="page-hero-stats">
          <div>
            <b>{counts.all}</b>
            <span>部作品</span>
          </div>
          <div>
            <b>{counts.film}</b>
            <span>开放电影</span>
          </div>
          <div>
            <b>{GENRES.length}</b>
            <span>种类型</span>
          </div>
        </div>
      </section>

      <form className="library-search" onSubmit={submitSearch}>
        <Search size={20} />
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜索片名、英文名、简介或类型…"
          aria-label="搜索片库"
        />
        {search ? (
          <button type="button" onClick={() => setSearch('')} aria-label="清空搜索">
            <X size={16} />
          </button>
        ) : null}
        <button type="submit" className="btn btn-primary btn-compact">
          搜索
        </button>
      </form>

      <div className="filter-bar">
        <div className="filter-group">
          <span className="filter-label">类型</span>
          <div className="segmented">
            {(
              [
                ['all', '全部'],
                ['film', '开放电影'],
                ['series', '短片集'],
                ['demo', '技术实验室'],
              ] as Array<[TypeFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                className={type === value ? 'active' : ''}
                onClick={() => setType(value)}
              >
                {label}
                <span>{counts[value]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="filter-group filter-group-genres">
          <span className="filter-label">标签</span>
          <div className="genre-pills">
            {['全部', ...GENRES].map((item) => (
              <button
                key={item}
                type="button"
                className={genre === item ? 'active' : ''}
                onClick={() => setGenre(item)}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <label className="sort-select">
          <span>排序</span>
          <select value={sort} onChange={(event) => setSort(event.target.value as SortKey)}>
            <option value="featured">精选优先</option>
            <option value="rating">评分最高</option>
            <option value="year">最新上线</option>
            <option value="title">片名 A–Z</option>
          </select>
        </label>
      </div>

      <div className="result-line">
        <span>
          找到 <b>{filtered.length}</b> 部作品
          {search ? ` · 关键词“${search}”` : ''}
        </span>
        <span className="result-hint">
          <ShieldCheck size={14} /> 全部通过签名代理播放
        </span>
      </div>

      {filtered.length > 0 ? (
        <div className="title-grid title-grid-five library-grid">
          {filtered.map((title, index) => (
            <TitleCard key={title.id} title={title} index={index} />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Sparkles size={28} />
          <h3>没有找到对应作品</h3>
          <p>换一个关键词，或清空类型与标签筛选。</p>
          <button
            type="button"
            className="btn btn-glass"
            onClick={() => {
              setSearch('');
              setGenre('全部');
              setType('all');
            }}
          >
            重置筛选
          </button>
        </div>
      )}

      <section className="custom-library">
        <div className="section-head">
          <div>
            <span className="eyebrow">
              <Link2 size={13} /> YOUR OWN SOURCES
            </span>
            <h2>我的片源</h2>
            <p className="section-sub">粘贴你有权访问的 m3u8 地址，通过同一套广告过滤与签名代理播放。</p>
          </div>
          {me?.user ? (
            <button type="button" className="btn btn-glass" onClick={() => setAddOpen(true)}>
              <Plus size={16} /> 添加片源
            </button>
          ) : (
            <button type="button" className="btn btn-glass" onClick={() => openAuth('login')}>
              <Lock size={15} /> 登录后添加
            </button>
          )}
        </div>

        {!me?.user ? (
          <div className="source-gate">
            <div>
              <h3>把你的合法片源，也接进来。</h3>
              <p>登录后可保存自定义 HLS 地址，并按用户组获得 3–100 个片源额度。</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => openAuth('register')}>
              创建账号 <ArrowRight size={15} />
            </button>
          </div>
        ) : sources.length === 0 ? (
          <div className="source-empty">
            <Link2 size={22} />
            <p>还没有自定义片源。添加后会在所有设备上同步。</p>
          </div>
        ) : (
          <div className="source-grid">
            {sources.map((source, index) => (
              <div
                className="source-card"
                key={source.id}
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
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => playSource(source)}
                    disabled={loadingSource === source.id}
                    aria-label={`播放 ${source.name}`}
                  >
                    <ArrowRight size={16} />
                  </button>
                  <button
                    type="button"
                    className="icon-btn danger"
                    onClick={() => removeSource(source)}
                    aria-label={`删除 ${source.name}`}
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {me?.user ? (
          <p className="source-quota">
            当前用户组片源额度：{sources.length} / {sourceLimit}
          </p>
        ) : null}
      </section>

      <Modal open={addOpen} onClose={() => setAddOpen(false)} className="form-modal" labelledBy="add-source-title">
        <span className="eyebrow">
          <Link2 size={13} /> CUSTOM HLS
        </span>
        <h2 id="add-source-title">添加一个片源</h2>
        <p className="modal-sub">仅支持公开可访问的 http(s) m3u8。请确认你拥有合法访问权限。</p>
        <form className="stack-form" onSubmit={addSource}>
          <label className="field">
            <span>名称</span>
            <div className="field-input">
              <Film size={16} />
              <input
                value={sourceName}
                onChange={(event) => setSourceName(event.target.value)}
                placeholder="例如：我的测试片单"
                required
                maxLength={40}
              />
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
            {adding ? '正在保存…' : '保存片源'}
          </button>
        </form>
      </Modal>

      <Modal
        open={Boolean(playSession)}
        onClose={() => setPlaySession(null)}
        className="player-modal"
        labelledBy="custom-player-title"
      >
        {playSession ? (
          <>
            <div className="player-modal-head">
              <span className="eyebrow">CUSTOM SOURCE · {playSession.mode.toUpperCase()}</span>
              <h2 id="custom-player-title">{playSession.name}</h2>
            </div>
            <Player
              src={playSession.url}
              adMode={playSession.mode}
              artwork={{ accent: ['#7c5cff', '#20d6c7'], motif: 'prism', title: playSession.name, originalTitle: 'CUSTOM SOURCE' }}
            />
          </>
        ) : null}
      </Modal>
    </div>
  );
}
