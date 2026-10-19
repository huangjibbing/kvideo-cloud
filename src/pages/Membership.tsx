import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  CalendarCheck,
  Check,
  Coins,
  Crown,
  Gem,
  Infinity as InfinityIcon,
  ShieldCheck,
  Sparkles,
  Star,
  Ticket,
  Trophy,
  Zap,
} from 'lucide-react';
import type { LedgerEntry, Plan } from '../../shared/types';
import { GROUPS, PLANS, LEVELS } from '../../shared/levels';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, formatDate, reasonLabel } from '../lib/api';
import { Link } from '../lib/router';
import { GroupBadge } from '../components/GroupBadge';
import { Modal } from '../components/Modal';
import { isVipPublicUser } from '../../shared/vip';

const PLAN_ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  month: Zap,
  quarter: Sparkles,
  year: Gem,
  lifetime: InfinityIcon,
};

const TASKS = [
  { icon: CalendarCheck, title: '每日签到', note: '连续签到奖励递增', reward: '+10 ~ +22' },
  { icon: Star, title: '收藏一部作品', note: '每个作品首次收藏', reward: '+2' },
  { icon: Trophy, title: '观看满 5 分钟', note: '每部作品每日一次，最多 10 次', reward: '+2' },
  { icon: Ticket, title: '邀请好友注册', note: '好友使用你的邀请码', reward: '+80' },
];

export function MembershipPage() {
  const { me, openAuth, refresh } = useAuth();
  const { push } = useToast();
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [confirmPlan, setConfirmPlan] = useState<Plan | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    if (!me?.user) {
      setLedger([]);
      return;
    }
    api<{ entries: LedgerEntry[] }>('/points/ledger')
      .then((data) => setLedger(data.entries))
      .catch(() => undefined);
  }, [me?.user]);

  const redeem = async () => {
    if (!confirmPlan) return;
    setRedeeming(true);
    try {
      await api('/membership/redeem', { method: 'POST', body: { planId: confirmPlan.id } });
      await refresh();
      const data = await api<{ entries: LedgerEntry[] }>('/points/ledger');
      setLedger(data.entries);
      push(`已兑换 ${confirmPlan.name}，权益立即生效。`, 'success');
      setConfirmPlan(null);
    } catch (error) {
      push(error instanceof Error ? error.message : '兑换失败', 'error');
    } finally {
      setRedeeming(false);
    }
  };

  const membershipName =
    me?.user?.membership === 'lifetime'
      ? '永恒会员'
      : me?.user?.membership === 'pro'
        ? '星幕会员'
        : me?.user?.membership === 'plus'
          ? '光影会员'
          : '免费用户';

  return (
    <div className="membership-page page-wrap">
      <section className="membership-hero">
        <div className="membership-hero-glow" aria-hidden="true" />
        <div className="membership-hero-copy">
          <span className="eyebrow">
            <Crown size={13} /> MEMBERSHIP & POINTS
          </span>
          <h1>
            把每一次观看，
            <br />
            变成一束可积累的光。
          </h1>
          <p>
            签到、收藏、观看与邀请都会获得积分。积分可兑换会员通行证，提升积分倍率与片源额度，并点亮专属身份。
          </p>
          <div className="membership-hero-actions">
            {me?.user ? (
              <Link to="/me" className="btn btn-gold">
                <Coins size={16} /> 我的积分 {me.user.points}
              </Link>
            ) : (
              <button type="button" className="btn btn-gold" onClick={() => openAuth('register')}>
                <Sparkles size={16} /> 注册领取 50 积分
              </button>
            )}
            <a href="#plans" className="btn btn-glass">
              查看通行证 <ArrowRight size={15} />
            </a>
          </div>
        </div>
        <div className="membership-hero-card">
          <div className="ticket-card">
            <div className="ticket-card-top">
              <span>KVIDEO · ALL ACCESS</span>
              <Crown size={20} />
            </div>
            <div className="ticket-card-tier">{membershipName}</div>
            <div className="ticket-card-name">{me?.user?.username ?? 'GUEST'}</div>
            <div className="ticket-card-bottom">
              <span>{me?.user ? `Lv.${me.user.level} ${me.user.points} PTS` : '等待点亮'}</span>
              <span>{me?.user?.membershipExpiresAt ? formatDate(me.user.membershipExpiresAt) : 'OPEN'}</span>
            </div>
            <div className="ticket-card-code" aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="ticket-card-shine" />
          </div>
          <div className="membership-perks-mini">
            <div>
              <Zap size={15} />
              <span>积分倍率</span>
              <b>{me?.user?.membership === 'pro' || me?.user?.membership === 'lifetime' ? '1.5×' : me?.user?.membership === 'plus' ? '1.2×' : '1.0×'}</b>
            </div>
            <div>
              <ShieldCheck size={15} />
              <span>广告过滤</span>
              <b>全用户</b>
            </div>
            <div>
              <Star size={15} />
              <span>专属徽章</span>
              <b>{!me?.user ? '—' : me.user.membership === 'free' ? '—' : '已点亮'}</b>
            </div>
          </div>
        </div>
      </section>

      <div className="membership-vip-access">
        <Crown size={20} />
        <div>
          <b>{isVipPublicUser(me?.user) ? '已解锁 VIP 专属影片' : '升级会员，解锁全站 VIP 影片'}</b>
          <span>
            光影会员、星幕会员与永恒会员可播放带 VIP 标签的影片；免费用户仍可浏览与搜索全部内容。
          </span>
        </div>
        {me?.user ? (
          <span className="vip-chip">{isVipPublicUser(me.user) ? 'VIP 已激活' : '未激活'}</span>
        ) : (
          <button type="button" className="btn btn-gold btn-compact" onClick={() => openAuth('login')}>
            登录查看
          </button>
        )}
      </div>

      <section className="section" id="plans">
        <div className="section-head">
          <div>
            <span className="eyebrow">
              <Ticket size={13} /> PASSES
            </span>
            <h2>选择你的通行证</h2>
            <p className="section-sub">全部使用积分兑换，不接入真实支付。兑换后立即生效。</p>
          </div>
          {me?.user ? <span className="section-count">余额 {me.user.points} 积分</span> : null}
        </div>
        <div className="plan-grid">
          {PLANS.map((plan) => {
            const Icon = PLAN_ICONS[plan.id] ?? Crown;
            const affordable = Boolean(me?.user && me.user.points >= plan.points);
            const current = me?.user?.membership === plan.tier && plan.tier !== 'lifetime';
            return (
              <article
                key={plan.id}
                className={`plan-card ${plan.id === 'year' ? 'featured' : ''}`}
                style={{ '--plan-color': plan.accent } as React.CSSProperties}
              >
                {plan.id === 'year' ? <span className="plan-ribbon">最受欢迎</span> : null}
                <div className="plan-icon">
                  <Icon size={22} />
                </div>
                <span className="plan-badge">{plan.badge}</span>
                <h3>{plan.name}</h3>
                <div className="plan-price">
                  <b>{plan.points}</b>
                  <span>积分{plan.days ? ` / ${plan.days} 天` : ' / 永久'}</span>
                </div>
                <ul>
                  {plan.perks.map((perk) => (
                    <li key={perk}>
                      <Check size={14} /> {perk}
                    </li>
                  ))}
                </ul>
                <button
                  type="button"
                  className={`btn btn-block ${plan.id === 'year' ? 'btn-gold' : 'btn-glass'}`}
                  disabled={!me?.user || !affordable || current}
                  onClick={() => {
                    if (!me?.user) {
                      openAuth('register');
                      return;
                    }
                    setConfirmPlan(plan);
                  }}
                >
                  {!me?.user
                    ? '登录后兑换'
                    : current
                      ? '当前方案'
                      : affordable
                        ? '积分兑换'
                        : `还差 ${plan.points - (me.user.points ?? 0)} 积分`}
                </button>
              </article>
            );
          })}
        </div>
      </section>

      <section className="section points-layout">
        <div className="points-card">
          <div className="panel-head">
            <div>
              <span className="eyebrow">
                <Coins size={13} /> EARN POINTS
              </span>
              <h2>如何获得积分</h2>
            </div>
          </div>
          <div className="task-list">
            {TASKS.map((task) => {
              const Icon = task.icon;
              return (
                <div className="task-row" key={task.title}>
                  <span className="task-icon">
                    <Icon size={17} />
                  </span>
                  <div>
                    <b>{task.title}</b>
                    <span>{task.note}</span>
                  </div>
                  <i>{task.reward}</i>
                </div>
              );
            })}
          </div>
          {me?.user ? (
            <div className="points-cta">
              <span>今日签到状态</span>
              <b>{me.checkin.checkedToday ? '已完成' : `可领取 +${me.checkin.nextReward}`}</b>
              <Link to="/me" className="text-link">
                去签到 <ArrowRight size={14} />
              </Link>
            </div>
          ) : null}
        </div>
        <div className="ledger-card">
          <div className="panel-head">
            <div>
              <span className="eyebrow">RECENT LEDGER</span>
              <h2>积分流水</h2>
            </div>
          </div>
          {!me?.user ? (
            <div className="panel-empty">
              <Coins size={22} />
              <p>登录后查看你的积分流水。</p>
              <button type="button" className="btn btn-glass btn-compact" onClick={() => openAuth('login')}>
                登录
              </button>
            </div>
          ) : ledger.length === 0 ? (
            <div className="panel-empty">
              <Coins size={22} />
              <p>暂无流水，签到开始你的第一笔积分。</p>
            </div>
          ) : (
            <div className="ledger-list">
              {ledger.slice(0, 8).map((entry) => (
                <div key={entry.id} className="ledger-row">
                  <span className={`ledger-icon ${entry.delta > 0 ? 'plus' : 'minus'}`}>
                    {entry.delta > 0 ? '+' : '−'}
                  </span>
                  <div>
                    <b>{reasonLabel(entry.reason)}</b>
                    <span>{entry.note || formatDate(entry.createdAt, true)}</span>
                  </div>
                  <i className={entry.delta > 0 ? 'plus' : 'minus'}>
                    {entry.delta > 0 ? '+' : ''}
                    {entry.delta}
                  </i>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section" id="groups">
        <div className="section-head">
          <div>
            <span className="eyebrow">USER GROUPS</span>
            <h2>八种观影身份</h2>
            <p className="section-sub">从第一次登录，到成为站点管理员，每一种身份都有清晰权益。</p>
          </div>
        </div>
        <div className="group-grid">
          {Object.values(GROUPS).map((group) => (
            <div key={group.id} className="group-card" style={{ '--group-color': group.color } as React.CSSProperties}>
              <GroupBadge group={group} size="lg" />
              <p>{group.description}</p>
              <span className="group-short">{group.short}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="level-table">
          <div className="level-table-head">
            <span>成长等级</span>
            <span>所需成长值</span>
            <span>解锁</span>
          </div>
          {LEVELS.map((level) => (
            <div key={level.level} className="level-table-row">
              <span>
                <b>Lv.{level.level}</b> {level.name}
              </span>
              <span>{level.minPoints}</span>
              <span>{level.level <= 2 ? '收藏 / 历史 / 签到' : level.level === 3 ? '自定义片源 5 个' : level.level >= 4 ? '更高片源额度与展示' : '—'}</span>
            </div>
          ))}
        </div>
      </section>

      <Modal
        open={Boolean(confirmPlan)}
        onClose={() => setConfirmPlan(null)}
        className="confirm-modal"
        labelledBy="confirm-plan-title"
      >
        {confirmPlan ? (
          <>
            <div className="confirm-icon">
              <Ticket size={24} />
            </div>
            <span className="eyebrow">CONFIRM REDEMPTION</span>
            <h2 id="confirm-plan-title">兑换 {confirmPlan.name}</h2>
            <p>
              将消耗 <b>{confirmPlan.points}</b> 积分，兑换后立即生效。
              {confirmPlan.days ? `有效期 ${confirmPlan.days} 天。` : '永久有效。'}
            </p>
            <div className="confirm-balance">
              <span>当前余额</span>
              <b>{me?.user?.points ?? 0} → {(me?.user?.points ?? 0) - confirmPlan.points}</b>
            </div>
            <div className="confirm-actions">
              <button type="button" className="btn btn-glass" onClick={() => setConfirmPlan(null)}>
                再想想
              </button>
              <button type="button" className="btn btn-gold" onClick={redeem} disabled={redeeming}>
                {redeeming ? '兑换中…' : '确认兑换'}
              </button>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
