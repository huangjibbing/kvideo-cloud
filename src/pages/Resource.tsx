import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Check,
  ChevronRight,
  Crown,
  Eye,
  EyeOff,
  Heart,
  LoaderCircle,
  MonitorPlay,
  Play,
  ShieldCheck,
  Sparkles,
  Tv,
} from 'lucide-react';
import type {
  AggregateDetail,
  AggregateEpisode,
  AggregatePlayResponse,
  AggregateSearchResponse,
} from '../../shared/aggregate';
import { extractMediaUrlFromHtml } from '../../shared/aggregate';
import { isVipPublicUser } from '../../shared/vip';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import { Link, useRouter } from '../lib/router';
import { Player } from '../components/Player';

const PREFERRED = ['zuida', 'huya', 'baofeng', 'feifan', 'jisu', 'baiduyun'];
const OFFER_SOURCES = 'zuida,huya,baofeng,jisu,feifan,baiduyun';

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

interface Offer {
  sourceId: string;
  sourceName: string;
  vodId: string;
}

export function ResourcePage({ sourceId, vodId }: { sourceId: string; vodId: string }) {
  const { me, openAuth } = useAuth();
  const { push } = useToast();
  const { navigate } = useRouter();
  const [detail, setDetail] = useState<AggregateDetail | null>(null);
  const [offers, setOffers] = useState<Offer[]>([]);
  const [activeSourceId, setActiveSourceId] = useState(sourceId);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [groupIndex, setGroupIndex] = useState(0);
  const [playLoading, setPlayLoading] = useState('');
  const [playSession, setPlaySession] = useState<AggregatePlayResponse | null>(null);
  const [tvMode, setTvMode] = useState(false);
  const [hidePanel, setHidePanel] = useState(false);
  const [favorite, setFavorite] = useState(false);

  const loadDetail = async (nextSourceId: string, nextVodId: string) => {
    setLoading(true);
    setError('');
    setPlaySession(null);
    setActiveSourceId(nextSourceId);
    try {
      const data = await api<AggregateDetail>(
        `/aggregate/detail?source=${encodeURIComponent(nextSourceId)}&id=${encodeURIComponent(nextVodId)}`,
      );
      setDetail(data);
      document.title = `${data.title} · KVideo Cloud`;
      const directGroup = data.groups.findIndex((group) =>
        group.episodes.some((episode) => episode.direct),
      );
      setGroupIndex(directGroup >= 0 ? directGroup : 0);
      return data;
    } catch (err) {
      setError(err instanceof Error ? err.message : '资源详情加载失败');
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void loadDetail(sourceId, vodId).then((data) => {
      if (!data || cancelled) return;
      void api<AggregateSearchResponse>(
        `/aggregate/search?q=${encodeURIComponent(data.title)}&ids=${OFFER_SOURCES}`,
      )
        .then((response) => {
          if (cancelled) return;
          const normalized = data.title.toLowerCase().replace(/\s+/g, '');
          const match =
            response.results.find(
              (item) =>
                item.title.toLowerCase().replace(/\s+/g, '') === normalized &&
                (!data.year || !item.year || item.year === data.year),
            ) ?? response.results.find((item) => item.title.includes(data.title));
          const nextOffers: Offer[] = match?.offers ?? [
            { sourceId, sourceName: data.sourceName, vodId },
          ];
          setOffers(nextOffers);
        })
        .catch(() => {
          if (!cancelled) setOffers([{ sourceId, sourceName: data.sourceName, vodId }]);
        });
    });
    return () => {
      cancelled = true;
    };
  }, [sourceId, vodId]);

  useEffect(() => {
    if (!me?.user || !detail) {
      setFavorite(false);
      return;
    }
    api<{ favorites: Array<{ sourceKey: string }> }>('/favorites')
      .then((data) =>
        setFavorite(data.favorites.some((item) => item.sourceKey === `resource:${activeSourceId}:${vodId}`)),
      )
      .catch(() => undefined);
  }, [me?.user, detail, activeSourceId, vodId]);

  useEffect(() => {
    document.body.classList.toggle('tv-mode', tvMode);
    return () => document.body.classList.remove('tv-mode');
  }, [tvMode]);

  const switchSource = (offer: Offer) => {
    if (offer.sourceId === activeSourceId && offer.vodId === vodId) return;
    navigate(`/resource/${offer.sourceId}/${offer.vodId}`);
  };

  const toggleFavorite = async () => {
    if (!me?.user) {
      openAuth('login');
      return;
    }
    if (!detail) return;
    const sourceKey = `resource:${activeSourceId}:${vodId}`;
    try {
      if (favorite) {
        await api('/favorites', { method: 'DELETE', body: { sourceKey } });
        setFavorite(false);
      } else {
        await api('/favorites', {
          method: 'POST',
          body: {
            sourceKey,
            titleId: `${activeSourceId}:${vodId}`,
            title: detail.title,
            originalTitle: detail.title,
            accent: ['#7c5cff', '#20d6c7'],
            motif: 'prism',
          },
        });
        setFavorite(true);
      }
    } catch (err) {
      push(err instanceof Error ? err.message : '收藏失败', 'error');
    }
  };

  const playEpisode = async (episode: AggregateEpisode) => {
    if (!detail) return;
    if (!me?.user) {
      openAuth('login');
      return;
    }
    if (detail.vip && !isVipPublicUser(me.user)) {
      push('这是 VIP 专属影片，请先开通会员。', 'info');
      navigate('/membership');
      return;
    }
    setPlayLoading(episode.url);
    try {
      const data = await api<AggregatePlayResponse>('/aggregate/play', {
        method: 'POST',
        body: {
          sourceId: activeSourceId,
          url: episode.url,
          title: detail.title,
          year: detail.year,
          key: undefined,
          episode: episode.name,
        },
      });
      setPlaySession(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        openAuth('login');
        return;
      }
      if (err instanceof ApiError && err.status === 403 && err.message.includes('VIP')) {
        push(err.message, 'info');
        navigate('/membership');
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
            vip: Boolean(detail.vip),
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

  const groups = detail?.groups ?? [];
  const group = groups[groupIndex] ?? groups[0];
  const firstDirect = useMemo(
    () => groups.flatMap((item) => item.episodes).find((episode) => episode.direct),
    [groups],
  );
  const vipLocked = Boolean(detail?.vip && !isVipPublicUser(me?.user));

  if (loading && !detail) {
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
        <MonoIcon />
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

  return (
    <div className={`resource-page watch-page ${tvMode ? 'tv-mode-active' : ''}`}>
      <div className="page-wrap">
        <div className="watch-topbar">
          <button type="button" className="back-link" onClick={() => window.history.back()}>
            <ArrowLeft size={15} /> 返回
          </button>
          <div className="watch-breadcrumb">
            <Link to="/browse?cat=movie">频道</Link>
            <ChevronRight size={13} />
            <span>{detail.typeName || '影视'}</span>
            <ChevronRight size={13} />
            <span>{detail.title}</span>
          </div>
        </div>

        <section className="resource-watch-head">
          <div>
            <span className="eyebrow">
              <MonitorPlay size={13} /> 正在播放
            </span>
            <h1>{detail.title}</h1>
            <p>
              {detail.sourceName} · {detail.year || '年份未知'} · {detail.typeName || '影视'}
              {detail.vip ? <span className="vip-chip">VIP 专属</span> : null}
            </p>
          </div>
          <div className="resource-watch-actions">
            <button
              type="button"
              className={`btn btn-glass btn-compact ${tvMode ? 'active' : ''}`}
              onClick={() => setTvMode((value) => !value)}
            >
              <Tv size={15} /> {tvMode ? '退出电视模式' : '电视模式'}
            </button>
            <button type="button" className="btn btn-glass btn-compact" onClick={toggleFavorite}>
              <Heart size={15} fill={favorite ? 'currentColor' : 'none'} /> {favorite ? '已收藏' : '收藏'}
            </button>
          </div>
        </section>

        {vipLocked ? (
          <div className="resource-vip-banner">
            <Crown size={18} />
            <div>
              <b>VIP 专属影片</b>
              <span>开通会员后即可播放本片，当前账号为免费用户。</span>
            </div>
            <Link to="/membership" className="btn btn-gold btn-compact">
              开通会员 <ChevronRight size={13} />
            </Link>
          </div>
        ) : null}

        <div className={`resource-watch-layout ${hidePanel ? 'panel-hidden' : ''}`}>
          <div className="resource-watch-main">
            {playSession ? (
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
            ) : (
              <div className="resource-player-placeholder">
                {detail.pic ? (
                  <img src={detail.pic} alt="" referrerPolicy="no-referrer" />
                ) : null}
                <div className="resource-player-placeholder-shade" />
                <button
                  type="button"
                  className="player-big-play"
                  onClick={() => {
                    if (vipLocked) {
                      navigate('/membership');
                      return;
                    }
                    if (firstDirect) void playEpisode(firstDirect);
                    else if (group?.episodes[0]) void playEpisode(group.episodes[0]);
                  }}
                >
                  <Play size={30} fill="currentColor" />
                </button>
                <span className="resource-placeholder-label">
                  {vipLocked ? 'VIP 专属 · 开通后播放' : '选择线路或剧集开始播放'}
                </span>
              </div>
            )}

            <div className="resource-watch-meta">
              <div className="resource-watch-badges">
                <span className="chip chip-live">
                  <ShieldCheck size={13} /> 直连优先 · 广告过滤
                </span>
                {detail.area ? <span className="chip">{detail.area}</span> : null}
                {detail.lang ? <span className="chip">{detail.lang}</span> : null}
                {detail.director ? <span className="chip">导演：{detail.director}</span> : null}
              </div>
              {detail.content ? <p>{detail.content}</p> : null}
            </div>
          </div>

          <aside className={`resource-watch-side ${hidePanel ? 'is-hidden' : ''}`}>
            <div className="resource-side-head">
              <div>
                <span className="eyebrow">播放控制</span>
                <h2>选集与线路</h2>
              </div>
              <button type="button" className="icon-btn" onClick={() => setHidePanel((value) => !value)} aria-label="隐藏线路">
                {hidePanel ? <Eye size={15} /> : <EyeOff size={15} />}
              </button>
            </div>

            <div className="resource-line-list">
              {offers.map((offer) => {
                const active = offer.sourceId === activeSourceId;
                const recommended = PREFERRED.includes(offer.sourceId);
                return (
                  <button
                    key={`${offer.sourceId}-${offer.vodId}`}
                    type="button"
                    className={`resource-line-card ${active ? 'active' : ''}`}
                    onClick={() => switchSource(offer)}
                  >
                    <div className="resource-line-top">
                      <b>{offer.sourceName}</b>
                      {active ? <span className="line-current">当前</span> : null}
                      {recommended ? <span className="line-good">推荐·直连</span> : null}
                    </div>
                    <p>{detail.title}</p>
                    <span className="line-status">{active ? '正在使用此线路' : '可切换 · 浏览器直接播放'}</span>
                  </button>
                );
              })}
              {offers.length === 0 ? (
                <div className="resource-line-empty">正在检索其他线路…</div>
              ) : null}
            </div>

            <div className="resource-side-episodes">
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
              <div className="resource-episode-grid compact">
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
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>

        {hidePanel ? (
          <button type="button" className="resource-side-restore" onClick={() => setHidePanel(false)}>
            <Eye size={14} /> 显示选集与线路
          </button>
        ) : null}

        <div className="resource-detail-footer">
          <span>
            <ShieldCheck size={13} /> 播放链路：浏览器直连 + HLS 客户端严格广告过滤，失败自动回退签名代理
          </span>
          <Link to={`/search?q=${encodeURIComponent(detail.title)}`} className="text-link">
            <Sparkles size={13} /> 搜索其他版本
          </Link>
        </div>
      </div>
    </div>
  );
}

function MonoIcon() {
  return <MonitorPlay size={30} />;
}
