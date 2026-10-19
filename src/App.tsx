import React, { useEffect } from 'react';
import { ArrowLeft, Clapperboard } from 'lucide-react';
import { Layout } from './components/Layout';
import { HomePage } from './pages/Home';
import { BrowsePage } from './pages/Browse';
import { TitlePage } from './pages/Title';
import { WatchPage } from './pages/Watch';
import { ProfilePage } from './pages/Profile';
import { MembershipPage } from './pages/Membership';
import { LeaderboardPage } from './pages/Leaderboard';
import { AdminPage } from './pages/Admin';
import { SourcesPage } from './pages/Sources';
import { Link, useRouter } from './lib/router';

function NotFound() {
  return (
    <div className="page-wrap standalone empty-state not-found">
      <span className="not-found-code">404</span>
      <Clapperboard size={30} />
      <h1>这场放映不存在</h1>
      <p>链接可能已经结束，或者从未被排片。</p>
      <div className="empty-actions">
        <Link to="/" className="btn btn-primary">
          <ArrowLeft size={15} /> 回到首页
        </Link>
        <Link to="/browse" className="btn btn-glass">
          浏览片库
        </Link>
      </div>
    </div>
  );
}

function Routes() {
  const { path } = useRouter();
  const segments = path.split('/').filter(Boolean);

  useEffect(() => {
    if (segments.length === 0) document.title = 'KVideo Cloud · 纯净放映室';
  }, [path]);

  if (segments.length === 0) return <HomePage />;
  if (segments[0] === 'browse') return <BrowsePage />;
  if (segments[0] === 'title' && segments[1]) return <TitlePage id={segments[1]} />;
  if (segments[0] === 'watch' && segments[1]) return <WatchPage id={segments[1]} />;
  if (segments[0] === 'me') return <ProfilePage />;
  if (segments[0] === 'membership') return <MembershipPage />;
  if (segments[0] === 'leaderboard') return <LeaderboardPage />;
  if (segments[0] === 'sources') return <SourcesPage />;
  if (segments[0] === 'admin') return <AdminPage />;
  return <NotFound />;
}

export default function App() {
  return (
    <Layout>
      <a className="skip-link" href="#main-content">
        跳到主要内容
      </a>
      <div id="main-content">
        <Routes />
      </div>
    </Layout>
  );
}
