import React, { useEffect, useState } from 'react';
import {
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Mail,
  Ticket,
  UserRound,
  Sparkles,
} from 'lucide-react';
import { Modal } from './Modal';
import { Poster } from './Poster';
import { Brand } from './Brand';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { CATALOG } from '../../shared/catalog';

export function AuthModal() {
  const { authMode, closeAuth, openAuth, login, register } = useAuth();
  const { push } = useToast();
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const mode = authMode ?? 'login';
  const open = authMode !== null;

  useEffect(() => {
    setError('');
    setSubmitting(false);
  }, [authMode]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        push('欢迎回来，光影继续。', 'success');
      } else {
        await register({ email, username, password, inviteCode: inviteCode || undefined });
        push('账号已创建，已送出 50 积分。', 'success');
      }
      setPassword('');
      closeAuth();
    } catch (err) {
      setError(err instanceof Error ? err.message : '操作失败，请稍后再试');
    } finally {
      setSubmitting(false);
    }
  };

  const featured = CATALOG.find((item) => item.id === 'liquid-lab') ?? CATALOG[0];

  return (
    <Modal open={open} onClose={closeAuth} className="auth-modal" labelledBy="auth-title">
      <div className="auth-visual">
        <div className="auth-visual-glow" />
        <Poster artwork={featured} className="auth-poster" />
        <div className="auth-quote">
          <span className="eyebrow">MEMBERS ONLY, BUT ALWAYS HUMAN</span>
          <p>“把好故事，留在纯净的光里。”</p>
          <span>KVideo Cloud · 2026</span>
        </div>
      </div>
      <div className="auth-form-panel">
        <Brand />
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            className={mode === 'login' ? 'active' : ''}
            onClick={() => openAuth('login')}
            role="tab"
            aria-selected={mode === 'login'}
          >
            登录
          </button>
          <button
            type="button"
            className={mode === 'register' ? 'active' : ''}
            onClick={() => openAuth('register')}
            role="tab"
            aria-selected={mode === 'register'}
          >
            注册
          </button>
        </div>
        <div className="auth-heading">
          <h2 id="auth-title">{mode === 'login' ? '欢迎回到放映厅' : '领取你的第一张票根'}</h2>
          <p>
            {mode === 'login'
              ? '收藏、进度、积分与会员身份都在这里。'
              : '注册即得 50 积分，连续签到还能解锁更多权益。'}
          </p>
        </div>
        <form onSubmit={submit} className="auth-form">
          {mode === 'register' ? (
            <label className="field">
              <span>昵称</span>
              <div className="field-input">
                <UserRound size={16} />
                <input
                  value={username}
                  onChange={(event) => setUsername(event.target.value)}
                  placeholder="怎么称呼你？"
                  autoComplete="nickname"
                  required
                  minLength={2}
                  maxLength={20}
                />
              </div>
            </label>
          ) : null}
          <label className="field">
            <span>{mode === 'login' ? '邮箱或昵称' : '邮箱'}</span>
            <div className="field-input">
              <Mail size={16} />
              <input
                type={mode === 'login' ? 'text' : 'email'}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder={mode === 'login' ? 'you@example.com' : 'you@example.com'}
                autoComplete={mode === 'login' ? 'username' : 'email'}
                required
              />
            </div>
          </label>
          <label className="field">
            <span>密码</span>
            <div className="field-input">
              <LockKeyhole size={16} />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder={mode === 'login' ? '输入密码' : '至少 8 位字符'}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                required
                minLength={8}
              />
              <button
                type="button"
                className="field-eye"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </label>
          {mode === 'register' ? (
            <label className="field">
              <span>
                邀请码 <em>可选</em>
              </span>
              <div className="field-input">
                <Ticket size={16} />
                <input
                  value={inviteCode}
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                  placeholder="KV-XXXXXX"
                  autoComplete="off"
                />
              </div>
            </label>
          ) : null}
          {error ? <div className="form-error">{error}</div> : null}
          <button type="submit" className="btn btn-primary btn-block" disabled={submitting}>
            {submitting ? '正在进入…' : mode === 'login' ? '进入放映厅' : '创建账号'}
            {!submitting ? <ArrowRight size={17} /> : null}
          </button>
        </form>
        <div className="auth-footnote">
          <Sparkles size={13} />
          <span>我们只保存必要的账号数据，不追踪你的观看行为。</span>
        </div>
      </div>
    </Modal>
  );
}
