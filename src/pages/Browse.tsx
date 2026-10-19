import React, { useEffect, useMemo, useState } from 'react';
import {
  ChevronRight,
  Film,
  LoaderCircle,
  Search,
  Sparkles,
  Tv,
} from 'lucide-react';
import type { FeedCategory, FeedCategoryResponse, FeedItem } from '../../shared/feed';
import { FEED_CATEGORIES } from '../../shared/feed';
import { api } from '../lib/api';
import { Link, useQuery, useRouter } from '../lib/router';
import { ResourceCard } from '../components/ResourceCard';

const DESCRIPTIONS: Record<FeedCategory, string> = {
  movie: '院线新片、网络电影、动作喜剧与经典佳片。',
  series: '国产剧、海外剧、日韩剧与热播连续剧。',
  anime: '国产动漫、日韩动漫与热门番剧。',
  variety: '真人秀、脱口秀、晚会与大陆/欧美综艺。',
  domestic: '大陆剧、国产剧与华语内容精选。',
  overseas: '欧美剧、日韩剧、泰剧与海外内容。',
  documentary: '自然、历史、人文与纪实影像。',
  short: '短剧、微短剧与竖屏故事。',
};

export function BrowsePage() {
  const query = useQuery();
  const { navigate } = useRouter();
  const requested = query.get('cat') as FeedCategory | null;
  const category: FeedCategory = FEED_CATEGORIES.some((item) => item.id === requested)
    ? (requested as FeedCategory)
    : 'movie';
  const [items, setItems] = useState<FeedItem[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');

  const meta = useMemo(
    () => FEED_CATEGORIES.find((item) => item.id === category) ?? FEED_CATEGORIES[0],
    [category],
  );

  useEffect(() => {
    setLoading(true);
    setError('');
    setItems([]);
    setPage(1);
    api<FeedCategoryResponse>(`/feed/category?cat=${category}&page=1`)
      .then((data) => {
        setItems(data.items);
        setHasMore(data.hasMore);
        setTotal(data.total);
      })
      .catch((err) => setError(err instanceof Error ? err.message : '频道加载失败'))
      .finally(() => setLoading(false));
  }, [category]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      const data = await api<FeedCategoryResponse>(`/feed/category?cat=${category}&page=${page + 1}`);
      setItems((current) => {
        const keys = new Set(current.map((item) => item.key));
        return [...current, ...data.items.filter((item) => !keys.has(item.key))];
      });
      setPage(data.page);
      setHasMore(data.hasMore);
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载更多失败');
    } finally {
      setLoadingMore(false);
    }
  };

  const visible = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return items;
    return items.filter((item) =>
      `${item.title} ${item.typeName} ${item.area} ${item.remarks}`.toLowerCase().includes(keyword),
    );
  }, [items, search]);

  return (
    <div className="browse-page page-wrap">
      <section className="channel-header">
        <div>
          <span className="eyebrow">
            <Tv size={13} /> CHANNEL · {category.toUpperCase()}
          </span>
          <h1>{meta.label}</h1>
          <p>{DESCRIPTIONS[category]}</p>
        </div>
        <div className="channel-header-side">
          <div className="channel-stat">
            <b>{total}</b>
            <span>部内容</span>
          </div>
          <div className="channel-stat">
            <b>6</b>
            <span>个资源站</span>
          </div>
          <Link to="/search" className="btn btn-glass btn-compact">
            <Search size={15} /> 聚合搜索
          </Link>
        </div>
      </section>

      <div className="channel-tabs">
        {FEED_CATEGORIES.map((item) => (
          <button
            key={item.id}
            type="button"
            className={item.id === category ? 'active' : ''}
            onClick={() => navigate(`/browse?cat=${item.id}`)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="channel-toolbar">
        <div className="channel-search">
          <Search size={15} />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`在${meta.label}中筛选…`}
          />
        </div>
        <span className="result-line-inline">{visible.length} 部 · 按更新时间排序</span>
      </div>

      {loading ? (
        <div className="resource-grid resource-grid-six">
          {Array.from({ length: 12 }, (_, index) => (
            <div className="resource-skeleton" key={index}>
              <span />
              <i />
              <i />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="empty-state soft">
          <Film size={26} />
          <h3>频道加载失败</h3>
          <p>{error}</p>
          <button type="button" className="btn btn-primary" onClick={() => navigate(`/browse?cat=${category}`)}>
            重试
          </button>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state soft">
          <Sparkles size={26} />
          <h3>{search ? '没有匹配的内容' : '这个频道暂时没有内容'}</h3>
          <p>{search ? '换一个关键词试试。' : '资源站暂时没有返回这一类内容，稍后再来看看。'}</p>
          {search ? (
            <button type="button" className="btn btn-glass" onClick={() => setSearch('')}>
              清空筛选
            </button>
          ) : (
            <Link to="/browse?cat=movie" className="btn btn-primary">
              去电影频道
            </Link>
          )}
        </div>
      ) : (
        <>
          <div className="resource-grid resource-grid-six">
            {visible.map((item, index) => (
              <ResourceCard key={item.key} item={item} index={index} />
            ))}
          </div>
          {hasMore && !search ? (
            <div className="load-more-wrap">
              <button type="button" className="btn btn-glass" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? <LoaderCircle size={15} className="spin" /> : <ChevronRight size={15} />}
                {loadingMore ? '加载中…' : '加载更多'}
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
