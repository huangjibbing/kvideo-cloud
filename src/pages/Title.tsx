import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Bookmark,
  BookmarkCheck,
  ChevronRight,
  Clapperboard,
  Clock3,
  Copy,
  MessageCircle,
  Play,
  Send,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
} from 'lucide-react';
import { CATALOG, findTitle } from '../../shared/catalog';
import type { CommentItem, FavoriteItem, GroupInfo } from '../../shared/types';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, copyText, formatDate } from '../lib/api';
import { Link } from '../lib/router';
import { Poster, TitleCard } from '../components/Poster';
import { GroupBadge } from '../components/GroupBadge';

type CommentWithGroup = CommentItem & { group?: GroupInfo };

export function TitlePage({ id }: { id: string }) {
  const title = findTitle(id);
  const { me, openAuth } = useAuth();
  const { push } = useToast();
  const [favorite, setFavorite] = useState(false);
  const [comments, setComments] = useState<CommentWithGroup[]>([]);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);

  const sourceKey = `catalog:${id}`;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [id]);

  useEffect(() => {
    api<{ comments: CommentWithGroup[] }>(`/comments?key=${encodeURIComponent(sourceKey)}`)
      .then((data) => setComments(data.comments))
      .catch(() => undefined);
  }, [sourceKey]);

  useEffect(() => {
    if (!me?.user) {
      setFavorite(false);
      return;
    }
    api<{ favorites: FavoriteItem[] }>('/favorites')
      .then((data) => setFavorite(data.favorites.some((item) => item.sourceKey === sourceKey)))
      .catch(() => undefined);
  }, [me?.user, sourceKey]);

  const similar = useMemo(() => {
    if (!title) return [];
    return CATALOG.filter(
      (item) => item.id !== title.id && item.genres.some((genre) => title.genres.includes(genre)),
    ).slice(0, 4);
  }, [title]);

  if (!title) {
    return (
      <div className="page-wrap empty-state standalone">
        <Sparkles size={30} />
        <h2>这部作品不在片库中</h2>
        <Link to="/browse" className="btn btn-primary">
          返回片库
        </Link>
      </div>
    );
  }

  const toggleFavorite = async () => {
    if (!me?.user) {
      openAuth('login');
      return;
    }
    try {
      if (favorite) {
        await api('/favorites', { method: 'DELETE', body: { sourceKey } });
        setFavorite(false);
        push('已移出收藏。', 'info');
      } else {
        await api('/favorites', {
          method: 'POST',
          body: {
            sourceKey,
            titleId: title.id,
            title: title.title,
            originalTitle: title.originalTitle,
            accent: title.accent,
            motif: title.motif,
          },
        });
        setFavorite(true);
        push('已收藏，+2 积分。', 'success');
      }
    } catch (error) {
      push(error instanceof Error ? error.message : '操作失败', 'error');
    }
  };

  const submitComment = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!me?.user) {
      openAuth('login');
      return;
    }
    if (!comment.trim()) return;
    setPosting(true);
    try {
      await api('/comments', { method: 'POST', body: { sourceKey, body: comment } });
      setComment('');
      const data = await api<{ comments: CommentWithGroup[] }>(
        `/comments?key=${encodeURIComponent(sourceKey)}`,
      );
      setComments(data.comments);
      push('评论已发布。', 'success');
    } catch (error) {
      push(error instanceof Error ? error.message : '发布失败', 'error');
    } finally {
      setPosting(false);
    }
  };

  const deleteComment = async (commentId: string) => {
    try {
      await api(`/comments/${commentId}`, { method: 'DELETE' });
      setComments((current) => current.filter((item) => item.id !== commentId));
      push('评论已删除。', 'info');
    } catch (error) {
      push(error instanceof Error ? error.message : '删除失败', 'error');
    }
  };

  return (
    <div
      className="title-page"
      style={{ '--title-a': title.accent[0], '--title-b': title.accent[1] } as React.CSSProperties}
    >
      <div className="title-backdrop" aria-hidden="true">
        <span />
        <span />
      </div>
      <div className="page-wrap">
        <button type="button" className="back-link" onClick={() => window.history.back()}>
          <ArrowLeft size={15} /> 返回
        </button>

        <section className="title-hero">
          <div className="title-poster-wrap">
            <Poster artwork={title} />
            <div className="title-poster-shadow" />
          </div>
          <div className="title-copy">
            <div className="title-kicker">
              {title.badge ? <span className="chip chip-accent">{title.badge}</span> : null}
              <span className="chip">{title.quality}</span>
              <span className="chip">{title.type === 'series' ? '短片集' : title.type === 'demo' ? '技术演示' : '开放电影'}</span>
            </div>
            <h1>
              {title.title}
              <span>{title.originalTitle}</span>
            </h1>
            <p className="title-tagline">{title.tagline}</p>
            <div className="title-meta">
              <span className="rating">
                <Star size={14} fill="currentColor" /> {title.rating.toFixed(1)}
              </span>
              <span>{title.year}</span>
              <span>
                <Clock3 size={13} /> {title.duration}
              </span>
              {title.genres.map((genre) => (
                <Link key={genre} to={`/browse?genre=${encodeURIComponent(genre)}`} className="meta-genre">
                  {genre}
                </Link>
              ))}
            </div>
            <p className="title-synopsis">{title.synopsis}</p>
            <div className="title-actions">
              <Link to={`/watch/${title.id}`} className="btn btn-primary btn-large">
                <Play size={18} fill="currentColor" /> 立即播放
              </Link>
              <button type="button" className="btn btn-glass btn-large" onClick={toggleFavorite}>
                {favorite ? <BookmarkCheck size={18} /> : <Bookmark size={18} />}
                {favorite ? '已收藏' : '收藏'}
              </button>
              <button
                type="button"
                className="icon-btn icon-btn-large"
                onClick={() => {
                  void copyText(window.location.href);
                  push('链接已复制。', 'success');
                }}
                aria-label="复制链接"
              >
                <Copy size={18} />
              </button>
            </div>
            <div className="title-credentials">
              <ShieldCheck size={15} />
              <span>{title.credits}</span>
              <i />
              <span>播放链路：签名代理 · 严格广告过滤</span>
            </div>
          </div>
        </section>

        {title.episodes?.length ? (
          <section className="section title-episodes">
            <div className="section-head">
              <div>
                <span className="eyebrow">
                  <Clapperboard size={13} /> EPISODES
                </span>
                <h2>放映列表</h2>
              </div>
              <span className="section-count">{title.episodes.length} 集</span>
            </div>
            <div className="episode-grid">
              {title.episodes.map((episode, index) => (
                <Link key={episode.id} to={`/watch/${title.id}?ep=${episode.id}`} className="episode-card">
                  <span className="episode-index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <b>{episode.name}</b>
                    <p>
                      {episode.note} · {episode.duration}
                    </p>
                  </div>
                  <ChevronRight size={17} />
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        <section className="section title-comments">
          <div className="section-head">
            <div>
              <span className="eyebrow">
                <MessageCircle size={13} /> AFTER THE CREDITS
              </span>
              <h2>放映后讨论</h2>
            </div>
            <span className="section-count">{comments.length} 条</span>
          </div>
          <form className="comment-form" onSubmit={submitComment}>
            <div className="avatar">{me?.user?.avatar ?? '👋'}</div>
            <div className="comment-input-wrap">
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                placeholder={me?.user ? '写下你的观影感受…' : '登录后参与讨论'}
                maxLength={500}
                rows={3}
                onFocus={() => {
                  if (!me?.user) openAuth('login');
                }}
              />
              <div className="comment-form-foot">
                <span>{comment.length}/500</span>
                <button type="submit" className="btn btn-primary btn-compact" disabled={posting || !comment.trim()}>
                  <Send size={14} /> {posting ? '发布中…' : '发布'}
                </button>
              </div>
            </div>
          </form>
          <div className="comment-list">
            {comments.length === 0 ? (
              <div className="comment-empty">
                <MessageCircle size={22} />
                <p>还没有评论。成为第一个留下光的人。</p>
              </div>
            ) : (
              comments.map((item) => (
                <article key={item.id} className="comment-item">
                  <div className="avatar">{item.avatar}</div>
                  <div className="comment-body">
                    <div className="comment-head">
                      <b>{item.username}</b>
                      {item.group ? <GroupBadge group={item.group} size="sm" /> : null}
                      <span>Lv.{item.level}</span>
                      <time>{formatDate(item.createdAt, true)}</time>
                      {item.mine || Boolean(me?.user && me.user.role !== 'user') ? (
                        <button
                          type="button"
                          className="comment-delete"
                          onClick={() => deleteComment(item.id)}
                          aria-label="删除评论"
                        >
                          <Trash2 size={13} />
                        </button>
                      ) : null}
                    </div>
                    <p>{item.body}</p>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        {similar.length > 0 ? (
          <section className="section">
            <div className="section-head">
              <div>
                <span className="eyebrow">YOU MAY ALSO LIKE</span>
                <h2>相似的光</h2>
              </div>
              <Link to="/browse" className="text-link">
                更多 <ChevronRight size={15} />
              </Link>
            </div>
            <div className="title-grid title-grid-four">
              {similar.map((item, index) => (
                <TitleCard key={item.id} title={item} index={index} />
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
