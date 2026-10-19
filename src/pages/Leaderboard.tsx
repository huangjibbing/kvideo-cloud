import React, { useEffect, useState } from 'react';
import { ArrowRight, Crown, LoaderCircle, Medal, Sparkles, Trophy } from 'lucide-react';
import type { LeaderboardEntry } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { api, formatNumber } from '../lib/api';
import { Link } from '../lib/router';
import { GroupBadge } from '../components/GroupBadge';

export function LeaderboardPage() {
  const { me } = useAuth();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ entries: LeaderboardEntry[] }>('/leaderboard')
      .then((data) => setEntries(data.entries))
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, []);

  const podium = [entries[1], entries[0], entries[2]].filter(Boolean);

  return (
    <div className="leaderboard-page page-wrap">
      <section className="leader-hero">
        <div className="leader-hero-glow" aria-hidden="true" />
        <span className="eyebrow">
          <Trophy size={13} /> THE LIGHTKEEPERS
        </span>
        <h1>
          光影榜单
          <span>把时间交给好故事的人，值得被看见。</span>
        </h1>
        <p>按累计成长值排序。签到、观看、收藏与邀请，都会留下光的刻度。</p>
        {me?.user ? (
          <div className="your-rank">
            <span className="avatar">{me.user.avatar}</span>
            <div>
              <b>{me.user.username}</b>
              <span>
                {me.group?.name} · {formatNumber(me.user.lifetimePoints)} 成长值
              </span>
            </div>
            <Link to="/me" className="text-link">
              我的放映室 <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <Link to="/membership" className="btn btn-gold">
            <Crown size={16} /> 加入光影榜单
          </Link>
        )}
      </section>

      {loading ? (
        <div className="loading-page">
          <LoaderCircle className="spin" size={28} />
          <span>正在点亮榜单…</span>
        </div>
      ) : entries.length === 0 ? (
        <div className="empty-state soft standalone">
          <Trophy size={28} />
          <h2>榜单还在等待第一位影迷</h2>
          <Link to="/membership" className="btn btn-primary">
            成为第一束光
          </Link>
        </div>
      ) : (
        <>
          <section className="podium">
            {podium.map((entry) => {
              const rank = entry.rank;
              return (
                <div key={entry.id} className={`podium-card podium-${rank}`}>
                  {rank === 1 ? <Crown size={24} className="podium-crown" /> : null}
                  <span className="podium-rank">
                    {rank === 1 ? <Trophy size={18} /> : <Medal size={18} />} 0{rank}
                  </span>
                  <span className="podium-avatar">{entry.avatar}</span>
                  <h3>{entry.username}</h3>
                  <GroupBadge group={entry.group} size="sm" />
                  <b>{formatNumber(entry.lifetimePoints)}</b>
                  <span className="podium-label">成长值</span>
                  <div className="podium-base" />
                </div>
              );
            })}
          </section>

          <section className="leader-table">
            <div className="leader-table-head">
              <span>排名</span>
              <span>影迷</span>
              <span>身份</span>
              <span>等级</span>
              <span>成长值</span>
              <span />
            </div>
            {entries.map((entry) => (
              <div key={entry.id} className={`leader-row ${me?.user?.id === entry.id ? 'me' : ''}`}>
                <span className="leader-rank">{entry.rank < 10 ? `0${entry.rank}` : entry.rank}</span>
                <span className="leader-user">
                  <span className="avatar avatar-sm">{entry.avatar}</span>
                  <b>{entry.username}</b>
                  {me?.user?.id === entry.id ? <i>YOU</i> : null}
                </span>
                <span>
                  <GroupBadge group={entry.group} size="sm" />
                </span>
                <span className="leader-level">Lv.{entry.level}</span>
                <span className="leader-points">
                  <Sparkles size={13} /> {formatNumber(entry.lifetimePoints)}
                </span>
                <span className="leader-arrow">
                  <ArrowRight size={14} />
                </span>
              </div>
            ))}
          </section>
        </>
      )}

      <section className="section leader-note">
        <div>
          <Trophy size={22} />
          <h2>成长值不是消费额</h2>
          <p>它只记录你在站点内的真实参与：签到、观看、收藏、评论与邀请。积分可以被兑换，成长值只增不减。</p>
        </div>
        <div>
          <Crown size={22} />
          <h2>会员身份独立展示</h2>
          <p>会员通行证提供积分倍率与片源额度，但不会直接购买榜单名次。所有成长值都来自参与。</p>
        </div>
      </section>
    </div>
  );
}
