import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Info,
  ListVideo,
  LoaderCircle,
  ShieldCheck,
  Sparkles,
  SlidersHorizontal,
  Zap,
} from 'lucide-react';
import { CATALOG, findTitle } from '../../shared/catalog';
import type { AdFilterMode } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, percent } from '../lib/api';
import { Link, useQuery, useRouter } from '../lib/router';
import { Player } from '../components/Player';
import { Poster, TitleCard } from '../components/Poster';

interface PlayPayload {
  url: string;
  mode: AdFilterMode;
  expiresAt: string;
  episodeId: string | null;
  episodeName: string | null;
  sourceName: string;
  adLab: boolean;
}

const MODES: Array<{ id: AdFilterMode; label: string; note: string }> = [
  { id: 'strict', label: '严格', note: '多信号交叉验证，推荐' },
  { id: 'standard', label: '标准', note: '只处理高置信广告块' },
  { id: 'aggressive', label: '强力', note: '更敏感，可能误伤转场' },
  { id: 'off', label: '关闭', note: '保留原始播放列表' },
];

export function WatchPage({ id }: { id: string }) {
  const title = findTitle(id);
  const query = useQuery();
  const { navigate } = useRouter();
  const { me } = useAuth();
  const { push } = useToast();
  const episodeId = query.get('ep');
  const [mode, setMode] = useState<AdFilterMode>(() => {
    const stored = localStorage.getItem('kv_ad_mode');
    if (stored === 'off' || stored === 'standard' || stored === 'aggressive' || stored === 'strict') {
      return stored;
    }
    return 'strict';
  });
  const [payload, setPayload] = useState<PlayPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [removed, setRemoved] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!title) return;
    setLoading(true);
    setError('');
    setPayload(null);
    setRemoved(0);
    api<PlayPayload>(`/play/${title.id}`, {
      method: 'POST',
      body: { mode, episodeId },
    })
      .then(setPayload)
      .catch((err) => setError(err instanceof Error ? err.message : '无法创建播放会话'))
      .finally(() => setLoading(false));
    localStorage.setItem('kv_ad_mode', mode);
  }, [title, mode, episodeId]);

  useEffect(() => {
    if (title) document.title = `${title.title} · KVideo Cloud`;
    return () => {
      document.title = 'KVideo Cloud · 纯净放映室';
    };
  }, [title]);

  const handleProgress = useCallback(
    (current: number, duration: number) => {
      if (!title) return;
      setProgress(duration ? percent(current, duration) : 0);
      if (!me?.user || current < 3) return;
      const episode = title.episodes?.find((item) => item.id === episodeId);
      void api<{ awarded?: number }>('/history', {
        method: 'POST',
        body: {
          sourceKey: `catalog:${title.id}${episode ? `:${episode.id}` : ''}`,
          titleId: title.id,
          title: title.title,
          originalTitle: title.originalTitle,
          accent: title.accent,
          motif: title.motif,
          position: current,
          duration,
          episodeId: episode?.id ?? 'main',
        },
      })
        .then((data: { awarded?: number }) => {
          if (data?.awarded) push(`观看奖励 +${data.awarded} 积分`, 'success');
        })
        .catch(() => undefined);
    },
    [me?.user, title, episodeId, push],
  );

  const handleAdStats = useCallback((count: number) => setRemoved(count), []);

  const episode = title?.episodes?.find((item) => item.id === episodeId);
  const upNext = useMemo(
    () => (title ? CATALOG.filter((item) => item.id !== title.id && item.genres.some((g) => title.genres.includes(g))).slice(0, 4) : []),
    [title],
  );

  if (!title) {
    return (
      <div className="page-wrap empty-state standalone">
        <Sparkles size={30} />
        <h2>没有找到这场放映</h2>
        <Link to="/browse" className="btn btn-primary">
          返回片库
        </Link>
      </div>
    );
  }

  return (
    <div
      className="watch-page"
      style={{ '--watch-a': title.accent[0], '--watch-b': title.accent[1] } as React.CSSProperties}
    >
      <div className="watch-glow" aria-hidden="true" />
      <div className="page-wrap">
        <div className="watch-topbar">
          <button type="button" className="back-link" onClick={() => window.history.back()}>
            <ArrowLeft size={15} /> 返回
          </button>
          <div className="watch-breadcrumb">
            <Link to="/browse">片库</Link>
            <ChevronRight size={13} />
            <Link to={`/title/${title.id}`}>{title.title}</Link>
            {episode ? (
              <>
                <ChevronRight size={13} />
                <span>{episode.name}</span>
              </>
            ) : null}
          </div>
        </div>

        <div className="watch-layout">
          <div className="watch-main">
            {error ? (
              <div className="player-shell player-shell-message">
                <div className="player-error">
                  <ShieldCheck size={30} />
                  <h3>无法创建播放会话</h3>
                  <p>{error}</p>
                  <Link to={`/title/${title.id}`} className="btn btn-glass btn-compact">
                    返回详情
                  </Link>
                </div>
              </div>
            ) : loading || !payload ? (
              <div className="player-shell player-shell-loading">
                <LoaderCircle size={34} className="spin" />
                <span>正在准备纯净播放链路…</span>
              </div>
            ) : (
              <Player
                key={`${payload.mode}-${payload.episodeId ?? 'main'}`}
                src={payload.url}
                artwork={title}
                adMode={payload.mode}
                onProgress={handleProgress}
                onAdStats={handleAdStats}
              />
            )}

            <div className="watch-heading">
              <div>
                <span className="eyebrow">
                  NOW PLAYING · {episode?.note ?? title.badge ?? 'OPEN CINEMA'}
                </span>
                <h1>{episode?.name ?? title.title}</h1>
                <p>
                  {title.originalTitle} · {title.year} · {title.quality} · {title.duration}
                </p>
              </div>
              <div className="watch-heading-actions">
                <Link to={`/title/${title.id}`} className="btn btn-glass btn-compact">
                  <Info size={15} /> 作品详情
                </Link>
              </div>
            </div>

            <div className="watch-info-row">
              <span className="chip chip-live">
                <ShieldCheck size={13} /> {mode === 'off' ? '过滤关闭' : '纯净播放'}
              </span>
              <span className="chip">{title.genres.join(' / ')}</span>
              <span className="watch-progress-label">本次进度 {Math.round(progress)}%</span>
            </div>

            <div className="filter-panel">
              <div className="filter-panel-head">
                <div>
                  <span className="eyebrow">
                    <SlidersHorizontal size={13} /> AD FILTER CONTROL
                  </span>
                  <h2>广告过滤策略</h2>
                </div>
                <span className={`filter-status ${mode === 'off' ? 'off' : ''}`}>
                  <span />
                  {mode === 'off' ? '未启用' : '实时生效'}
                </span>
              </div>
              <div className="mode-grid">
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={mode === item.id ? 'active' : ''}
                    onClick={() => setMode(item.id)}
                  >
                    <span className="mode-icon">
                      {item.id === 'strict' ? <ShieldCheck size={16} /> : item.id === 'aggressive' ? <Zap size={16} /> : <SlidersHorizontal size={16} />}
                    </span>
                    <b>{item.label}</b>
                    <i>{item.note}</i>
                    {mode === item.id ? <span className="mode-check">当前</span> : null}
                  </button>
                ))}
              </div>
              <div className="filter-readout">
                <div>
                  <b>{removed}</b>
                  <span>已移除广告切片</span>
                </div>
                <div>
                  <b>{payload?.url.includes('/api/hls') ? 'SIGNED' : 'DIRECT'}</b>
                  <span>链路签名</span>
                </div>
                <div>
                  <b>{mode === 'strict' ? '34' : mode === 'aggressive' ? '34+' : '—'}</b>
                  <span>过滤规则</span>
                </div>
                <p>
                  严格模式会交叉验证 CUE 标记、切片路径、时长网格与重复签名；仅在当时长或单一信号异常时不会误删内容。
                </p>
              </div>
            </div>
          </div>

          <aside className="watch-side">
            <div className="side-card side-info">
              <div className="side-poster-row">
                <Poster artwork={title} compact />
                <div>
                  <h3>{title.title}</h3>
                  <p>{title.originalTitle}</p>
                  <span className="side-rating">★ {title.rating.toFixed(1)}</span>
                </div>
              </div>
              <p className="side-synopsis">{title.synopsis}</p>
              <div className="side-tags">
                {title.genres.map((genre) => (
                  <span key={genre}>{genre}</span>
                ))}
              </div>
            </div>

            {title.episodes?.length ? (
              <div className="side-card">
                <div className="side-card-head">
                  <ListVideo size={16} />
                  <h3>放映列表</h3>
                </div>
                <div className="side-episodes">
                  {title.episodes.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      className={episode?.id === item.id ? 'active' : ''}
                      onClick={() => navigate(`/watch/${title.id}?ep=${item.id}`)}
                    >
                      <span>{String(index + 1).padStart(2, '0')}</span>
                      <div>
                        <b>{item.name}</b>
                        <i>{item.note}</i>
                      </div>
                      <ChevronRight size={14} />
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            {upNext.length > 0 ? (
              <div className="side-card">
                <div className="side-card-head">
                  <Sparkles size={16} />
                  <h3>接下来</h3>
                </div>
                <div className="side-upnext">
                  {upNext.map((item) => (
                    <Link key={item.id} to={`/watch/${item.id}`} className="side-upnext-item">
                      <Poster artwork={item} compact />
                      <div>
                        <b>{item.title}</b>
                        <span>
                          {item.year} · {item.quality}
                        </span>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>
        </div>

        <section className="section watch-more">
          <div className="section-head">
            <div>
              <span className="eyebrow">KEEP THE LIGHT ON</span>
              <h2>继续漫游</h2>
            </div>
            <Link to="/browse" className="text-link">
              全部片库 <ChevronRight size={15} />
            </Link>
          </div>
          <div className="title-grid title-grid-four">
            {upNext.map((item, index) => (
              <TitleCard key={item.id} title={item} index={index} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
