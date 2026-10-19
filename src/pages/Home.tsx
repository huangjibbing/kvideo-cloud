import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Crown,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Trophy,
} from 'lucide-react';
import type { FeedHome, FeedItem } from '../../shared/feed';
import { useAuth } from '../context/AuthContext';
import { api, formatNumber } from '../lib/api';
import { Link, useRouter } from '../lib/router';
import { ResourceCard } from '../components/ResourceCard';

const CATEGORY_LINKS = [
  { id: 'movie', label: '电影' },
  { id: 'series', label: '电视剧' },
  { id: 'anime', label: '动漫' },
  { id: 'variety', label: '综艺' },
  { id: 'domestic', label: '国产剧' },
  { id: 'overseas', label: '海外剧' },
  { id: 'documentary', label: '纪录片' },
  { id: 'short', label: '短剧' },
];

interface SiteConfig {
  announcement: string;
}

interface Leader {
  id: string;
  username: string;
  avatar: string;
  lifetimePoints: number;
  rank: number;
}

function HeroPoster({ item }: { item: FeedItem }) {
  const [failed, setFailed] = useState(false);
  if (item.poster && !failed) {
    return (
      <img
        src={item.poster}
        alt={item.title}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="feed-hero-fallback" aria-hidden="true">
      <span>{item.title.slice(0, 1)}</span>
      <i>KVIDEO</i>
    </div>
  );
}

export function HomePage() {
  const { me, openAuth } = useAuth();
  const { navigate } = useRouter();
  const [feed, setFeed] = useState<FeedHome | null>(null);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [heroIndex, setHeroIndex] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [announcementOpen, setAnnouncementOpen] = useState(true);

  const load = () => {
    setLoading(true);
    setError('');
    api<FeedHome>('/feed/home')
      .then(setFeed)
      .catch((err) => setError(err instanceof Error ? err.message : '首页加载失败'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    api<SiteConfig>('/config').then(setConfig).catch(() => undefined);
    api<{ entries: Leader[] }>('/leaderboard')
      .then((data) => setLeaders(data.entries.slice(0, 3)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!feed?.hero.length) return;
    const timer = window.setInterval(
      () => setHeroIndex((value) => (value + 1) % feed.hero.length),
      9000,
    );
    return () => window.clearInterval(timer);
  }, [feed]);

  const featured = feed?.hero[heroIndex] ?? feed?.hero[0];
  const topRated = useMemo(() => {
    if (!feed) return [];
    const map = new Map<string, FeedItem>();
    for (const section of feed.sections) {
      for (const item of section.items) map.set(item.key, item);
    }
    return [...map.values()]
      .sort((a, b) => b.offers.length - a.offers.length || Number(b.year) - Number(a.year))
      .slice(0, 10);
  }, [feed]);

  if (loading && !feed) {
    return (
      <div className="feed-loading page-wrap">
        <div className="feed-loading-hero" />
        <div className="feed-loading-row">
          {Array.from({ length: 6 }, (_, index) => (
            <span key={index} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="home-page feed-home">
      {config?.announcement && announcementOpen ? (
        <div className="announcement">
          <span className="announcement-dot" />
          <p>{config.announcement}</p>
          <button type="button" onClick={() => setAnnouncementOpen(false)}>
            知道了
          </button>
        </div>
      ) : null}

      <nav className="feed-category-nav" aria-label="内容频道">
        <span className="feed-category-label">
          <Sparkles size={13} /> 频道
        </span>
        {CATEGORY_LINKS.map((category) => (
          <Link key={category.id} to={`/browse?cat=${category.id}`}>
            {category.label}
          </Link>
        ))}
        <Link to="/search" className="feed-category-search">
          <Search size={13} /> 聚合搜索
        </Link>
      </nav>

      {error ? (
        <div className="empty-state soft standalone">
          <Sparkles size={28} />
          <h2>首页资源暂时没有加载出来</h2>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={load}>
            重新加载
          </button>
        </div>
      ) : featured ? (
        <section className="feed-hero">
          <div
            className="feed-hero-bg"
            style={{ backgroundImage: `url("${featured.poster}")` }}
            aria-hidden="true"
          />
          <div className="feed-hero-inner" key={featured.key}>
            <div className="feed-hero-copy">
              <span className="eyebrow">
                <Crown size={13} /> EDITOR'S PICK · 今日推荐
              </span>
              <h1>{featured.title}</h1>
              <div className="feed-hero-meta">
                <span>{featured.year || '热播中'}</span>
                {featured.typeName ? <span>{featured.typeName}</span> : null}
                {featured.area ? <span>{featured.area}</span> : null}
                <span>{featured.offers.length} 条可用线路</span>
              </div>
              <p>{featured.remarks || '来自资源站的最新热播内容，支持多线路切换与纯净播放。'}</p>
              <div className="feed-hero-actions">
                <Link
                  to={`/resource/${featured.sourceId}/${featured.vodId}`}
                  className="btn btn-primary btn-large"
                >
                  <Play size={18} fill="currentColor" /> 立即播放
                </Link>
                <Link
                  to={`/resource/${featured.sourceId}/${featured.vodId}`}
                  className="btn btn-glass btn-large"
                >
                  查看选集 <ArrowRight size={15} />
                </Link>
                <span className="hero-pure">
                  <ShieldCheck size={16} /> 广告过滤
                </span>
              </div>
              <div className="feed-hero-dots">
                {feed!.hero.map((item, index) => (
                  <button
                    key={item.key}
                    type="button"
                    className={index === heroIndex ? 'active' : ''}
                    onClick={() => setHeroIndex(index)}
                    aria-label={`切换到 ${item.title}`}
                  />
                ))}
              </div>
            </div>
            <div className="feed-hero-poster">
              <HeroPoster item={featured} />
              <div className="feed-hero-poster-badge">
                <span>KVIDEO</span>
                <b>{featured.offers.length} 条线路</b>
              </div>
            </div>
          </div>
          <div className="feed-hero-stats">
            <div>
              <b>{feed!.total}</b>
              <span>部在库作品</span>
            </div>
            <div>
              <b>{feed!.sourceCount}</b>
              <span>个资源站</span>
            </div>
            <div>
              <b>{feed!.sections.length}</b>
              <span>个频道</span>
            </div>
            <div>
              <b>24h</b>
              <span>持续更新</span>
            </div>
          </div>
        </section>
      ) : null}

      {topRated.length > 0 ? (
        <section className="section feed-section">
          <div className="section-head">
            <div>
              <span className="eyebrow">
                <Trophy size={13} /> TOP CHART
              </span>
              <h2>热播榜单</h2>
            </div>
            <Link to="/browse?cat=movie" className="text-link">
              更多内容 <ChevronRight size={15} />
            </Link>
          </div>
          <div className="resource-grid resource-grid-six">
            {topRated.slice(0, 6).map((item, index) => (
              <ResourceCard key={item.key} item={item} index={index} rank={index + 1} />
            ))}
          </div>
        </section>
      ) : null}

      {feed?.sections.map((section) => (
        <section className="section feed-section" key={section.id}>
          <div className="section-head">
            <div>
              <span className="eyebrow">CHANNEL · {section.id.toUpperCase()}</span>
              <h2>{section.label}</h2>
            </div>
            <Link to={`/browse?cat=${section.id}`} className="text-link">
              查看全部 <ChevronRight size={15} />
            </Link>
          </div>
          <div className="resource-grid resource-grid-six">
            {section.items.slice(0, 12).map((item, index) => (
              <ResourceCard key={item.key} item={item} index={index} />
            ))}
          </div>
        </section>
      ))}

      <section className="section">
        <div className="membership-strip">
          <div className="membership-glow" />
          <div className="membership-strip-copy">
            <span className="eyebrow">
              <Crown size={13} /> MEMBERSHIP & POINTS
            </span>
            <h2>看片，也把光攒起来。</h2>
            <p>
              每日签到、观看与邀请都能获得积分。兑换会员通行证，解锁更高积分倍率、更多自定义片源与专属身份。
            </p>
            <div className="membership-strip-actions">
              {me?.user ? (
                <Link to="/membership" className="btn btn-gold">
                  <Crown size={16} /> {me.user.points} 积分 · 查看权益
                </Link>
              ) : (
                <button type="button" className="btn btn-gold" onClick={() => openAuth('register')}>
                  <Crown size={16} /> 注册领取 50 积分
                </button>
              )}
              <Link to="/leaderboard" className="btn btn-glass">
                <Trophy size={15} /> 光影榜单
              </Link>
            </div>
          </div>
          <div className="membership-strip-side">
            <div className="member-card">
              <div className="member-card-top">
                <span>KV · MEMBER</span>
                <Crown size={18} />
              </div>
              <div className="member-card-name">{me?.user?.username ?? 'YOUR NAME'}</div>
              <div className="member-card-bottom">
                <span>{me?.group?.name ?? '等待点亮'}</span>
                <span>{me?.user?.points ?? 0} PTS</span>
              </div>
              <div className="member-card-shine" />
            </div>
            <div className="leader-mini">
              <span className="eyebrow">TOP WATCHERS</span>
              {leaders.map((leader) => (
                <div key={leader.id} className="leader-mini-row">
                  <b>0{leader.rank}</b>
                  <span className="avatar avatar-xs">{leader.avatar}</span>
                  <span>{leader.username}</span>
                  <i>{formatNumber(leader.lifetimePoints)}</i>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
