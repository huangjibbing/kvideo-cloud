import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  ChevronRight,
  Clock3,
  Crown,
  Flame,
  Info,
  Play,
  ShieldCheck,
  Sparkles,
  Star,
  Trophy,
  WandSparkles,
} from 'lucide-react';
import { CATALOG } from '../../shared/catalog';
import type { HistoryItem, LeaderboardEntry } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { api, formatNumber } from '../lib/api';
import { Link } from '../lib/router';
import { Poster, TitleCard, ContinueCard } from '../components/Poster';
import { GroupBadge } from '../components/GroupBadge';

interface SiteConfig {
  announcement: string;
  adMode: string;
  stats: { titles: number; films: number; demos: number; genres: number; members: number };
}

export function HomePage() {
  const { me, openAuth } = useAuth();
  const featured = useMemo(() => CATALOG.filter((item) => item.featured), []);
  const [featureIndex, setFeatureIndex] = useState(0);
  const [config, setConfig] = useState<SiteConfig | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [leaders, setLeaders] = useState<LeaderboardEntry[]>([]);
  const [announcementOpen, setAnnouncementOpen] = useState(true);

  useEffect(() => {
    api<SiteConfig>('/config').then(setConfig).catch(() => undefined);
    api<{ entries: LeaderboardEntry[] }>('/leaderboard')
      .then((data) => setLeaders(data.entries.slice(0, 3)))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!me?.user) {
      setHistory([]);
      return;
    }
    api<{ history: HistoryItem[] }>('/history')
      .then((data) => setHistory(data.history.slice(0, 4)))
      .catch(() => undefined);
  }, [me?.user]);

  useEffect(() => {
    if (featured.length < 2) return;
    const timer = window.setInterval(() => {
      setFeatureIndex((value) => (value + 1) % featured.length);
    }, 9000);
    return () => window.clearInterval(timer);
  }, [featured.length]);

  const feature = featured[featureIndex] ?? CATALOG[0];
  const trending = CATALOG.filter((item) => item.trending).slice(0, 4);
  const fresh = CATALOG.filter((item) => item.fresh || item.type === 'demo').slice(0, 6);
  const continueItems = history
    .map((item) => {
      const title = CATALOG.find((entry) => entry.id === item.titleId);
      if (!title) return null;
      const progress = item.duration > 0 ? (item.position / item.duration) * 100 : 0;
      return { title, progress, item };
    })
    .filter((item): item is { title: (typeof CATALOG)[number]; progress: number; item: HistoryItem } => Boolean(item));

  const heroStyle = {
    '--hero-a': feature.accent[0],
    '--hero-b': feature.accent[1],
  } as React.CSSProperties;

  return (
    <div className="home-page">
      {config?.announcement && announcementOpen ? (
        <div className="announcement">
          <span className="announcement-dot" />
          <p>{config.announcement}</p>
          <button type="button" onClick={() => setAnnouncementOpen(false)}>
            知道了
          </button>
        </div>
      ) : null}

      <section className="hero" style={heroStyle}>
        <div className="hero-backdrop" aria-hidden="true">
          <span className="hero-blob hero-blob-a" />
          <span className="hero-blob hero-blob-b" />
          <span className="hero-grid" />
          <span className="hero-scan" />
        </div>
        <div className="hero-inner">
          <div className="hero-copy" key={feature.id}>
            <div className="hero-eyebrow">
              <span className="eyebrow">KVIDEO CLOUD · OPEN CINEMA</span>
              <span className="hero-rating">
                <Star size={12} fill="currentColor" /> {feature.rating.toFixed(1)}
              </span>
            </div>
            <h1>
              {feature.title}
              <span>{feature.originalTitle}</span>
            </h1>
            <p className="hero-tagline">{feature.tagline}</p>
            <p className="hero-synopsis">{feature.synopsis}</p>
            <div className="hero-meta">
              <span>{feature.year}</span>
              <span>{feature.duration}</span>
              <span>{feature.quality}</span>
              <span>{feature.genres.slice(0, 2).join(' / ')}</span>
            </div>
            <div className="hero-actions">
              <Link to={`/watch/${feature.id}`} className="btn btn-primary btn-large">
                <Play size={18} fill="currentColor" /> 立即观看
              </Link>
              <Link to={`/title/${feature.id}`} className="btn btn-glass btn-large">
                <Info size={18} /> 查看详情
              </Link>
              <span className="hero-pure">
                <ShieldCheck size={16} /> 严格广告过滤
              </span>
            </div>
            <div className="hero-pagination">
              {featured.map((item, index) => (
                <button
                  key={item.id}
                  type="button"
                  className={index === featureIndex ? 'active' : ''}
                  onClick={() => setFeatureIndex(index)}
                  aria-label={`切换至 ${item.title}`}
                >
                  <span>0{index + 1}</span>
                  <i />
                </button>
              ))}
            </div>
          </div>

          <div className="hero-visual" key={`${feature.id}-art`}>
            <div className="hero-orbit hero-orbit-a" />
            <div className="hero-orbit hero-orbit-b" />
            <Link to={`/watch/${feature.id}`} className="hero-poster-link" aria-label={`播放 ${feature.title}`}>
              <Poster artwork={feature} className="hero-poster" />
              <span className="hero-poster-play">
                <Play size={22} fill="currentColor" />
              </span>
            </Link>
            <div className="hero-float hero-float-top">
              <Sparkles size={14} />
              <span>LIQUID GLASS UI</span>
            </div>
            <div className="hero-float hero-float-bottom">
              <ShieldCheck size={14} />
              <div>
                <b>0 段插播</b>
                <span>切片级广告过滤</span>
              </div>
            </div>
            <div className="hero-index">
              <b>{String(featureIndex + 1).padStart(2, '0')}</b>
              <span>/ {String(featured.length).padStart(2, '0')}</span>
            </div>
          </div>
        </div>
        <div className="hero-stats">
          <div>
            <b>{config?.stats.titles ?? CATALOG.length}</b>
            <span>部开放作品</span>
          </div>
          <div>
            <b>34</b>
            <span>条过滤规则</span>
          </div>
          <div>
            <b>{formatNumber(config?.stats.members ?? 0)}</b>
            <span>位注册影迷</span>
          </div>
          <div>
            <b>3</b>
            <span>层会员权益</span>
          </div>
          <div className="hero-scroll-hint">
            <span>向下探索</span>
            <i />
          </div>
        </div>
      </section>

      {continueItems.length > 0 ? (
        <section className="section section-continue">
          <div className="section-head">
            <div>
              <span className="eyebrow">
                <Clock3 size={13} /> PICK UP THE THREAD
              </span>
              <h2>继续上次的故事</h2>
            </div>
            <Link to="/me?tab=history" className="text-link">
              全部记录 <ChevronRight size={15} />
            </Link>
          </div>
          <div className="continue-grid">
            {continueItems.map(({ title, progress }) => (
              <ContinueCard key={title.id} title={title} progress={progress} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">
              <Flame size={13} /> TRENDING THIS WEEK
            </span>
            <h2>本周正在被观看</h2>
          </div>
          <Link to="/browse" className="text-link">
            进入片库 <ChevronRight size={15} />
          </Link>
        </div>
        <div className="title-grid title-grid-four">
          {trending.map((title, index) => (
            <TitleCard key={title.id} title={title} index={index} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="adlab">
          <div className="adlab-copy">
            <span className="eyebrow">
              <WandSparkles size={13} /> THE PURE PLAYBACK LAB
            </span>
            <h2>
              被塞进十秒广告？
              <br />
              我们把它，从时间轴上拿掉。
            </h2>
            <p>
              不只按关键词拦截。引擎会解析播放列表结构、切片路径、时长网格与重复签名，识别插在正片中间的广告岛，并在移除后修复不连续点。
            </p>
            <div className="adlab-actions">
              <Link to="/watch/dai-lab" className="btn btn-primary">
                <Play size={16} fill="currentColor" /> 打开广告实验室
              </Link>
              <Link to="/browse?type=demo" className="btn btn-glass">
                查看测试片单 <ArrowRight size={15} />
              </Link>
            </div>
            <div className="adlab-rules">
              {[
                ['01', 'CUE-OUT / DAI', '识别 SCTE-35 与插播区间'],
                ['02', '路径 · 时长指纹', '定位伪装成内容的广告切片'],
                ['03', '时间轴修复', '清理不连续点，保持播放连续'],
              ].map(([index, title, note]) => (
                <div key={index} className="adlab-rule">
                  <span>{index}</span>
                  <div>
                    <b>{title}</b>
                    <i>{note}</i>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="adlab-visual" aria-hidden="true">
            <div className="adlab-window">
              <div className="adlab-window-bar">
                <i />
                <i />
                <i />
                <span>manifest.m3u8</span>
              </div>
              <pre>
                <span className="line-dim">#EXTM3U</span>
                {'\n'}
                <span className="line-ok">#EXTINF:6.000,</span>
                {'\n'}
                <span className="line-text">content_001.ts</span>
                {'\n'}
                <span className="line-ad">#EXT-X-CUE-OUT:15</span>
                {'\n'}
                <span className="line-ad">#EXTINF:5.000,</span>
                {'\n'}
                <span className="line-ad">ad_roll_01.ts</span>
                {'\n'}
                <span className="line-ad">#EXT-X-CUE-IN</span>
                {'\n'}
                <span className="line-ok">#EXTINF:6.000,</span>
                {'\n'}
                <span className="line-text">content_002.ts</span>
              </pre>
              <div className="adlab-result">
                <ShieldCheck size={16} />
                <span>已移除 3 段广告 · 时间轴已修复</span>
                <b>+15s</b>
              </div>
            </div>
            <span className="adlab-orb" />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">
              <Sparkles size={13} /> FRESH FROM THE LAB
            </span>
            <h2>新上线与实验片</h2>
          </div>
          <Link to="/browse?type=demo" className="text-link">
            全部实验 <ChevronRight size={15} />
          </Link>
        </div>
        <div className="title-grid title-grid-six">
          {fresh.map((title, index) => (
            <TitleCard key={title.id} title={title} index={index} />
          ))}
        </div>
      </section>

      <section className="section">
        <div className="membership-strip">
          <div className="membership-glow" />
          <div className="membership-strip-copy">
            <span className="eyebrow">
              <Crown size={13} /> MEMBERSHIP & POINTS
            </span>
            <h2>看片，也把光攒起来。</h2>
            <p>
              每日签到、观看与邀请都能获得积分。兑换月度、年度或永恒会员，解锁更高积分倍率与专属身份。
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

      <section className="section">
        <div className="section-head">
          <div>
            <span className="eyebrow">EXPLORE THE OPEN LIBRARY</span>
            <h2>片库漫游</h2>
          </div>
          <Link to="/browse" className="text-link">
            查看全部 {CATALOG.length} 部 <ChevronRight size={15} />
          </Link>
        </div>
        <div className="title-grid title-grid-five">
          {CATALOG.slice(0, 5).map((title, index) => (
            <TitleCard key={title.id} title={title} index={index} />
          ))}
        </div>
      </section>

      <section className="section section-groups">
        <div className="section-head">
          <div>
            <span className="eyebrow">EIGHT WAYS TO BELONG</span>
            <h2>找到你的观影身份</h2>
          </div>
          <Link to="/membership#groups" className="text-link">
            用户组权益 <ChevronRight size={15} />
          </Link>
        </div>
        <div className="group-ribbon">
          {[
            ['游客', '自由浏览'],
            ['注册影迷', '收藏与历史'],
            ['资深影迷', '更多片源'],
            ['光影会员', '1.2× 积分'],
            ['星幕会员', '1.5× 积分'],
            ['永恒会员', '永久权益'],
            ['管理员', '内容维护'],
            ['超级管理员', '站点权限'],
          ].map(([name, note], index) => (
            <div key={name} className={`group-tile group-tile-${index}`}>
              <span>0{index + 1}</span>
              <b>{name}</b>
              <i>{note}</i>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
