import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  CheckCircle2,
  CircleSlash,
  Database,
  ExternalLink,
  Filter,
  Globe2,
  LoaderCircle,
  RadioTower,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { cn } from '../lib/cn';
import {
  SOURCE_META,
  VIDEO_SOURCES,
  VIDEO_SOURCE_STATS,
  sourceHost,
} from '../../shared/sources';
import { useToast } from '../context/ToastContext';
import { api, copyText } from '../lib/api';

type PingState = {
  state: 'loading' | 'ok' | 'fail';
  latency?: number;
  status?: number;
};

const GROUPS = ['全部', 'normal'];

export function SourcesPage() {
  const { push } = useToast();
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState('全部');
  const [pings, setPings] = useState<Record<string, PingState>>({});

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return VIDEO_SOURCES.filter((source) => {
      if (group !== '全部' && source.group !== group) return false;
      if (!keyword) return true;
      return `${source.name} ${source.id} ${source.baseUrl}`.toLowerCase().includes(keyword);
    });
  }, [query, group]);

  const ping = async (id: string) => {
    setPings((current) => ({ ...current, [id]: { state: 'loading' } }));
    try {
      const result = await api<{ ok: boolean; status: number; latency: number; error?: string }>(
        `/video-sources/${id}/ping`,
      );
      setPings((current) => ({
        ...current,
        [id]: {
          state: result.ok ? 'ok' : 'fail',
          latency: result.latency,
          status: result.status,
        },
      }));
    } catch (error) {
      setPings((current) => ({ ...current, [id]: { state: 'fail' } }));
      push(error instanceof Error ? error.message : '检测失败', 'error');
    }
  };

  return (
    <div className="sources-page page-wrap">
      <section className="page-hero sources-hero">
        <div className="page-hero-copy">
          <span className="eyebrow">
            <RadioTower size={13} /> SOURCE REGISTRY
          </span>
          <h1>
            资源站
            <span>把入口收进来，把不该留下的挡在外面。</span>
          </h1>
          <p>
            从 KVideo 的公开 2334.json 导入 78 个源站配置，按 group 字段过滤 premium 分组后，保留 56 个 normal
            资源站。列表只包含 API 入口，不包含任何影视文件。
          </p>
        </div>
        <div className="page-hero-stats">
          <div>
            <b>{VIDEO_SOURCE_STATS.imported}</b>
            <span>已导入</span>
          </div>
          <div>
            <b>{VIDEO_SOURCE_STATS.filteredPremium}</b>
            <span>已过滤 premium</span>
          </div>
          <div>
            <b>{VIDEO_SOURCE_STATS.downloaded}</b>
            <span>原始总数</span>
          </div>
        </div>
      </section>

      <div className="source-import-banner">
        <div className="source-import-icon">
          <Filter size={19} />
        </div>
        <div>
          <b>导入规则：保留 group !== "premium" 的资源</b>
          <p>
            原始 78 条 → 过滤 22 条 premium → 导入 56 条 normal。数据文件已静态写入项目，可随时用
            <code>npm run import:sources</code> 重新拉取。
          </p>
        </div>
        <div className="source-import-meta">
          <span>
            <ShieldCheck size={13} /> 过滤完成
          </span>
          <span>{new Date(SOURCE_META.importedAt).toLocaleDateString('zh-CN')}</span>
        </div>
      </div>

      <div className="source-toolbar">
        <div className="source-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索资源站名称、ID 或域名…"
            aria-label="搜索资源站"
          />
        </div>
        <div className="source-filter">
          {GROUPS.map((item) => (
            <button
              key={item}
              type="button"
              className={group === item ? 'active' : ''}
              onClick={() => setGroup(item)}
            >
              {item === '全部' ? '全部' : 'normal'}
              <span>
                {item === '全部'
                  ? VIDEO_SOURCES.length
                  : VIDEO_SOURCES.filter((source) => source.group === item).length}
              </span>
            </button>
          ))}
        </div>
        <span className="source-count">
          <Database size={13} /> {filtered.length} 个资源站
        </span>
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state soft">
          <Sparkles size={26} />
          <h3>没有找到资源站</h3>
          <p>换一个关键词试试。</p>
          <button type="button" className="btn btn-glass" onClick={() => setQuery('')}>
            清空搜索
          </button>
        </div>
      ) : (
        <div className="source-registry-grid">
          {filtered.map((source) => {
            const pingState = pings[source.id];
            const isHttp = source.baseUrl.startsWith('http://');
            return (
              <article className="source-registry-card" key={source.id}>
                <div className="source-registry-top">
                  <span className="source-priority">#{String(source.priority).padStart(2, '0')}</span>
                  <span className="source-group">normal</span>
                  <span className={cn('source-ping', pingState?.state)}>
                    {pingState?.state === 'loading' ? (
                      <LoaderCircle size={12} className="spin" />
                    ) : pingState?.state === 'ok' ? (
                      <CheckCircle2 size={12} />
                    ) : pingState?.state === 'fail' ? (
                      <CircleSlash size={12} />
                    ) : (
                      <span className="ping-dot" />
                    )}
                    {pingState?.state === 'ok'
                      ? `${pingState.latency}ms`
                      : pingState?.state === 'fail'
                        ? '不可达'
                        : '未检测'}
                  </span>
                </div>
                <div className="source-registry-title">
                  <span className="source-registry-logo">{source.name.slice(0, 1)}</span>
                  <div>
                    <h3>{source.name}</h3>
                    <p>{source.id}</p>
                  </div>
                </div>
                <div className="source-registry-url">
                  <Server size={13} />
                  <span>{sourceHost(source.baseUrl)}</span>
                  {isHttp ? <i className="http-flag">HTTP</i> : <i className="https-flag">HTTPS</i>}
                </div>
                <div className="source-registry-actions">
                  <button
                    type="button"
                    className="btn btn-glass btn-compact"
                    onClick={() => ping(source.id)}
                    disabled={pingState?.state === 'loading'}
                  >
                    <RadioTower size={14} />
                    {pingState?.state === 'loading' ? '检测中…' : '检测连接'}
                  </button>
                  <button
                    type="button"
                    className="icon-btn"
                    onClick={() => {
                      void copyText(source.baseUrl);
                      push('API 地址已复制。', 'success');
                    }}
                    aria-label={`复制 ${source.name} 地址`}
                  >
                    <Globe2 size={15} />
                  </button>
                  <a
                    href={source.baseUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="icon-btn"
                    aria-label={`打开 ${source.name}`}
                  >
                    <ArrowUpRight size={15} />
                  </a>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="source-legal">
        <ShieldCheck size={17} />
        <div>
          <b>仅导入 API 入口，不导入内容</b>
          <p>
            这些资源站的可用性、授权范围与内容合法性由部署者自行确认。项目只保存公开的 JSON
            配置，不抓取、不存储影视文件；广告过滤仅在播放 HLS 时生效。
          </p>
        </div>
        <a href={SOURCE_META.sourceUrl} target="_blank" rel="noreferrer" className="text-link">
          查看原始 JSON <ExternalLink size={13} />
        </a>
      </div>
    </div>
  );
}
