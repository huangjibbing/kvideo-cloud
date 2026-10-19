import React, { useEffect, useState } from 'react';
import {
  Compass,
  Crown,
  Code2,
  Film,
  Home,
  LayoutGrid,
  LogIn,
  Moon,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  Tv,
  UserRound,
} from 'lucide-react';
import { Link, useQuery, useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';
import { Brand } from './Brand';
import { AuthModal } from './AuthModal';

const NAV = [
  { to: '/', label: '首页', icon: Home },
  { to: '/browse?cat=movie', label: '电影', icon: Film },
  { to: '/browse?cat=series', label: '电视剧', icon: Tv },
  { to: '/browse?cat=anime', label: '动漫', icon: Sparkles },
  { to: '/browse?cat=variety', label: '综艺', icon: Compass },
  { to: '/membership', label: '会员', icon: Crown },
];

function isActive(path: string, to: string, search: string) {
  const [targetPath, targetQuery] = to.split('?');
  if (targetPath === '/') return path === '/';
  if (!path.startsWith(targetPath)) return false;
  if (!targetQuery) return true;
  const params = new URLSearchParams(targetQuery);
  const current = new URLSearchParams(search);
  for (const [key, value] of params) {
    if (current.get(key) !== value) return false;
  }
  return true;
}

export function Layout({ children }: { children: React.ReactNode }) {
  const { path, navigate } = useRouter();
  const query = useQuery();
  const { me, openAuth } = useAuth();
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    return localStorage.getItem('kv_theme') === 'light' ? 'light' : 'dark';
  });
  const [search, setSearch] = useState(query.get('q') ?? '');

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('kv_theme', theme);
  }, [theme]);

  useEffect(() => {
    setSearch(query.get('q') ?? '');
  }, [query]);

  useEffect(() => {
    document.body.dataset.route = path;
  }, [path]);

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const value = search.trim();
    navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search');
  };

  return (
    <div className="site-shell">
      <div className="ambient-bg" aria-hidden="true">
        <span className="ambient ambient-a" />
        <span className="ambient ambient-b" />
        <span className="ambient ambient-c" />
        <span className="noise-layer" />
      </div>

      <header className="site-header">
        <div className="nav-shell">
          <Brand />
          <nav className="desktop-nav" aria-label="主导航">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={isActive(path, item.to, query.toString()) ? 'active' : ''}
              >
                {item.label}
              </Link>
            ))}
            {me?.user?.role === 'admin' || me?.user?.role === 'superadmin' ? (
              <Link to="/admin" className={isActive(path, '/admin', query.toString()) ? 'active' : ''}>
                后台
              </Link>
            ) : null}
          </nav>
          <div className="nav-actions">
            <form className="nav-search" onSubmit={submitSearch} role="search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索片名、类型…"
                aria-label="聚合搜索影片"
              />
              <kbd>↵</kbd>
            </form>
            <button
              type="button"
              className="icon-btn"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              aria-label="切换明暗主题"
            >
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </button>
            {me?.user ? (
              <Link to="/me" className="user-chip" aria-label="个人中心">
                <span className="avatar avatar-sm">{me.user.avatar}</span>
                <span className="user-chip-copy">
                  <b>{me.user.username}</b>
                  <i>{me.user.points} 积分</i>
                </span>
              </Link>
            ) : (
              <button type="button" className="btn btn-ghost btn-compact" onClick={() => openAuth('login')}>
                <LogIn size={16} />
                登录
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="site-main">{children}</main>

      <footer className="site-footer">
        <div className="footer-grid">
          <div className="footer-brand">
            <Brand />
            <p>一个运行在 Cloudflare Workers 上的视频聚合放映室。聚合资源站海报与内容，严格过滤 HLS 插播广告。</p>
            <div className="footer-tags">
              <span>Workers</span>
              <span>D1</span>
              <span>HLS</span>
              <span>Resource Hub</span>
            </div>
          </div>
          <div className="footer-col">
            <h4>频道</h4>
            <Link to="/browse?cat=movie">电影</Link>
            <Link to="/browse?cat=series">电视剧</Link>
            <Link to="/browse?cat=anime">动漫</Link>
            <Link to="/browse?cat=variety">综艺</Link>
            <Link to="/browse?cat=domestic">国产剧</Link>
            <Link to="/browse?cat=overseas">海外剧</Link>
            <Link to="/search">聚合搜索</Link>
            <Link to="/sources">资源站目录</Link>
            <Link to="/leaderboard">光影榜单</Link>
          </div>
          <div className="footer-col">
            <h4>账户</h4>
            <Link to="/me">个人中心</Link>
            <Link to="/membership">会员与积分</Link>
            <Link to="/me?tab=sources">自定义片源</Link>
            <button type="button" onClick={() => openAuth('register')}>
              创建账号
            </button>
          </div>
          <div className="footer-col">
            <h4>关于</h4>
            <a href="https://github.com/huangjibbing/kvideo-cloud" target="_blank" rel="noreferrer">
              <Code2 size={14} /> GitHub
            </a>
            <a href="https://developers.cloudflare.com/workers/" target="_blank" rel="noreferrer">
              <ShieldCheck size={14} /> Workers 文档
            </a>
            <span className="footer-note">
              <Sparkles size={13} /> 内容来自第三方资源站
            </span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 KVideo Cloud. Built for the open web.</span>
          <span>本部署不内置影视文件 · 内容与海报由第三方资源站提供</span>
        </div>
      </footer>

      <nav className="mobile-nav" aria-label="移动端导航">
        {[
          { to: '/', label: '首页', icon: Compass },
          { to: '/browse?cat=movie', label: '电影', icon: Film },
          { to: '/search', label: '搜索', icon: Search },
          { to: '/membership', label: '会员', icon: Crown },
          { to: me?.user ? '/me' : '/login', label: '我的', icon: UserRound },
        ].map((item) => {
          const Icon = item.icon;
          const target = item.to === '/login' ? '/me' : item.to;
          return (
            <button
              key={item.label}
              type="button"
              className={isActive(path, target, query.toString()) ? 'active' : ''}
              onClick={() => {
                if (item.to === '/login') openAuth('login');
                else navigate(item.to);
              }}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <AuthModal />
    </div>
  );
}
