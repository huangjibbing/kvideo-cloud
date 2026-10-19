import React, { useEffect, useState } from 'react';
import {
  Compass,
  Crown,
  Code2,
  Home,
  LayoutGrid,
  LogIn,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  Trophy,
  UserRound,
} from 'lucide-react';
import { Link, useQuery, useRouter } from '../lib/router';
import { useAuth } from '../context/AuthContext';
import { Brand } from './Brand';
import { AuthModal } from './AuthModal';

const NAV = [
  { to: '/', label: '首页', icon: Home },
  { to: '/browse', label: '片库', icon: LayoutGrid },
  { to: '/membership', label: '会员', icon: Crown },
  { to: '/leaderboard', label: '榜单', icon: Trophy },
];

function isActive(path: string, to: string) {
  if (to === '/') return path === '/';
  return path === to || path.startsWith(`${to}/`);
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
    navigate(value ? `/browse?q=${encodeURIComponent(value)}` : '/browse');
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
              <Link key={item.to} to={item.to} className={isActive(path, item.to) ? 'active' : ''}>
                {item.label}
              </Link>
            ))}
            {me?.user?.role === 'admin' || me?.user?.role === 'superadmin' ? (
              <Link to="/admin" className={isActive(path, '/admin') ? 'active' : ''}>
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
                aria-label="搜索片库"
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
            <p>一个运行在 Cloudflare Workers 上的开放电影放映室。严格过滤 HLS 插播广告，保留完整故事时间轴。</p>
            <div className="footer-tags">
              <span>Workers</span>
              <span>D1</span>
              <span>HLS</span>
              <span>Open Cinema</span>
            </div>
          </div>
          <div className="footer-col">
            <h4>探索</h4>
            <Link to="/browse">全部片库</Link>
            <Link to="/browse?type=film">开放电影</Link>
            <Link to="/browse?type=demo">技术实验室</Link>
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
              <Sparkles size={13} /> 仅收录公开授权样片
            </span>
          </div>
        </div>
        <div className="footer-bottom">
          <span>© 2026 KVideo Cloud. Built for the open web.</span>
          <span>灵感来自 KVideo · 本部署不内置任何未授权影视资源</span>
        </div>
      </footer>

      <nav className="mobile-nav" aria-label="移动端导航">
        {[
          { to: '/', label: '首页', icon: Compass },
          { to: '/browse', label: '片库', icon: LayoutGrid },
          { to: '/membership', label: '会员', icon: Crown },
          { to: me?.user ? '/me' : '/login', label: '我的', icon: UserRound },
        ].map((item) => {
          const Icon = item.icon;
          const target = item.to === '/login' ? '/me' : item.to;
          return (
            <button
              key={item.label}
              type="button"
              className={isActive(path, target) ? 'active' : ''}
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
