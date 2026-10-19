import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  ChevronRight,
  Film,
  LoaderCircle,
  Play,
  ShieldCheck,
  Sparkles,
  Tv,
} from 'lucide-react';
import type {
  AggregateDetail,
  AggregateEpisode,
  AggregatePlayResponse,
} from '../../shared/aggregate';
import { extractMediaUrlFromHtml } from '../../shared/aggregate';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import { Link, useRouter } from '../lib/router';
import { Player } from '../components/Player';

async function resolveShareInBrowser(pageUrl: string) {
  const response = await fetch(pageUrl, {
    headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(`播放页返回 HTTP ${response.status}`);
  const text = await response.text();
  if (text.trimStart().startsWith('#EXTM3U')) return pageUrl;
  const media = extractMediaUrlFromHtml(text, response.url || pageUrl);
  if (!media) throw new Error('播放页中没有可识别的 m3u8/mp4');
  return media;
}

export function ResourcePage({ sourceId, vodId }: { sourceId: string; vodId: string }) {
  const { me, openAuth } = useAuth();
  const { push } = useToast();
  const { navigate } = useRouter();
  const [detail, setDetail] = useState<AggregateDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groupIndex, setGroupIndex] = useState(0);
  const [playLoading, setPlayLoading] = useState('');
  const [playSession, setPlaySession] = useState<AggregatePlayResponse | null>(null);

  useEffect(() => {
    setLoading(true);
    setError('');
    api<AggregateDetail>(
      `/aggregate/detail?source=${encodeURIComponent(sourceId)}&id=${encodeURIComponent(vodId)}`,
    )
      .then((data) => {
        setDetail(data);
        const directGroup = data.groups.findIndex((group) =>
          group.episodes.some((episode) => episode.direct),
        );
        setGroupIndex(directGroup >= 0 ? directGroup : 0);
        document.title = `${data.title} · KVideo Cloud`;
      })
      .catch((err) => setError(err instanceof Error ? err.message : '资源详情加载失败'))
      .finally(() => setLoading(false));
  }, [sourceId, vodId]);

  const playEpisode = async (episode: AggregateEpisode) => {
    if (!detail) return;
    if (!me?.user) {
      openAuth('login');
      return;
    }
    setPlayLoading(episode.url);
    try {
      const data = await api<AggregatePlayResponse>('/aggregate/play', {
        method: 'POST',
        body: { sourceId, url: episode.url, title: detail.title, episode: episode.name },
      });
      setPlaySession(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        openAuth('login');
        return;
      }
      if (!episode.direct) {
        try {
          push('服务器解析受限，正在尝试浏览器解析线路…', 'info');
          const directUrl = await resolveShareInBrowser(episode.url);
          setPlaySession({
            url: '',
            directUrl,
            mode: 'strict',
            kind: /\.mp4(?:[?#]|$)/i.test(directUrl) ? 'file' : 'hls',
            sourceName: detail.sourceName,
            title: detail.title,
            episode: episode.name,
            expiresAt: '',
          });
          return;
        } catch {
          // Fall through to the original error.
        }
      }
      push(err instanceof Error ? err.message : '播放失败', 'error');
    } finally {
      setPlayLoading('');
    }
  };

  if (loading) {
    return (
      <div className="page-wrap loading-page standalone">
        <LoaderCircle className="spin" size={30} />
        <span>正在读取资源站详情…</span>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div className="page-wrap standalone empty-state">
        <Film size={30} />
        <h1>这条资源暂时无法打开</h1>
        <p>{error || '资源站没有返回详情'}</p>
        <div className="empty-actions">
          <button type="button" className="btn btn-primary" onClick={() => navigate('/browse?cat=movie')}>
            返回频道
          </button>
          <Link to="/search" className="btn btn-glass">
            聚合搜索
          </Link>
        </div>
      </div>
    );
  }

  const groups = detail.groups;
  const group = groups[groupIndex] ?? groups[0];
  const firstDirect = groups.flatMap((item) => item.episodes).find((episode) => episode.direct);

  return (
    <div className="resource-page">
      <div className="resource-page-glow" aria-hidden="true" />
      <div className="page-wrap">
        <button type="button" className="back-link" onClick={() => window.history.back()}>
          <ArrowLeft size={15} /> 返回
        </button>

        <section className="resource-detail-hero">
          <div className="resource-detail-poster">
            {detail.pic ? (
              <img src={detail.pic} alt={detail.title} referrerPolicy="no-referrer" />
            ) : (
              <div className="resource-poster-fallback large">
                <span>{detail.title.slice(0, 1)}</span>
              </div>
            )}
          </div>
          <div className="resource-detail-copy">
            <div className="resource-detail-badges">
              <span className="chip chip-accent">{detail.sourceName}</span>
              {detail.typeName ? <span className="chip">{detail.typeName}</span> : null}
              {detail.remarks ? <span className="chip">{detail.remarks}</span> : null}
            </div>
            <h1>
              {detail.title}
              {detail.year ? <span>{detail.year}</span> : null}
            </h1>
            <div className="resource-detail-meta">
              {detail.area ? <span>{detail.area}</span> : null}
              {detail.lang ? <span>{detail.lang}</span> : null}
              {detail.director ? <span>导演：{detail.director}</span> : null}
            </div>
            {detail.content ? <p className="resource-detail-content">{detail.content}</p> : null}
            <div className="resource-detail-actions">
              {firstDirect ? (
                <button
                  type="button"
                  className="btn btn-primary btn-large"
                  onClick={() => playEpisode(firstDirect)}
                >
                  <Play size={18} fill="currentColor" /> 立即播放
                </button>
              ) : group?.episodes[0] ? (
                <button
                  type="button"
                  className="btn btn-primary btn-large"
                  onClick={() => playEpisode(group.episodes[0])}
                >
                  <Play size={18} fill="currentColor" /> 尝试播放
                </button>
              ) : null}
              <Link to={`/search?q=${encodeURIComponent(detail.title)}`} className="btn btn-glass btn-large">
                <Sparkles size={16} /> 搜索其他线路
              </Link>
            </div>
            <div className="resource-detail-note">
              <ShieldCheck size={14} />
              <span>直连优先 · 客户端广告过滤 · 失败自动回退签名代理</span>
            </div>
          </div>
        </section>

        {playSession ? (
          <section className="resource-player-panel">
            <div className="aggregate-player-head">
              <div>
                <span className="eyebrow">NOW PLAYING · {playSession.sourceName}</span>
                <h3>
                  {playSession.title} <span>{playSession.episode}</span>
                </h3>
              </div>
              <button type="button" className="btn btn-glass btn-compact" onClick={() => setPlaySession(null)}>
                关闭播放器
              </button>
            </div>
            <Player
              src={playSession.directUrl || playSession.url}
              fallbackSrc={playSession.directUrl ? playSession.url : undefined}
              clientFilter
              kind={playSession.kind}
              adMode={playSession.mode}
              artwork={{
                accent: ['#7c5cff', '#20d6c7'],
                motif: 'prism',
                title: playSession.title,
                originalTitle: 'RESOURCE PLAY',
              }}
            />
          </section>
        ) : null}

        <section className="resource-episodes-panel">
          <div className="section-head">
            <div>
              <span className="eyebrow">
                <Tv size={13} /> EPISODES
              </span>
              <h2>选集播放</h2>
            </div>
            <span className="section-count">{groups.reduce((sum, item) => sum + item.episodes.length, 0)} 集</span>
          </div>

          {groups.length === 0 ? (
            <div className="empty-state soft">
              <Tv size={24} />
              <h3>没有解析到可播放剧集</h3>
              <p>试试其他资源站线路。</p>
              <Link to={`/search?q=${encodeURIComponent(detail.title)}`} className="btn btn-glass">
                搜索其他资源
              </Link>
            </div>
          ) : (
            <>
              <div className="resource-group-tabs">
                {groups.map((item, index) => (
                  <button
                    key={`${item.flag}-${index}`}
                    type="button"
                    className={index === groupIndex ? 'active' : ''}
                    onClick={() => setGroupIndex(index)}
                  >
                    {item.flag}
                    <span>{item.episodes.length}</span>
                    {item.episodes.some((episode) => episode.direct) ? <i>直连</i> : <i>解析</i>}
                  </button>
                ))}
              </div>
              <div className="resource-episode-grid">
                {group?.episodes.map((episode) => (
                  <button
                    key={`${episode.name}-${episode.url}`}
                    type="button"
                    className="resource-episode"
                    onClick={() => playEpisode(episode)}
                    disabled={playLoading === episode.url}
                  >
                    {playLoading === episode.url ? (
                      <LoaderCircle size={13} className="spin" />
                    ) : (
                      <Play size={12} fill="currentColor" />
                    )}
                    <span>{episode.name}</span>
                    {!episode.direct ? <i>解析</i> : null}
                  </button>
                ))}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
