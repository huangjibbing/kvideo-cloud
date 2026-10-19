import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  CircleSlash,
  Clapperboard,
  ExternalLink,
  Film,
  LoaderCircle,
  Play,
  Search,
  ShieldCheck,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import { VIDEO_SOURCES } from '../../shared/sources';
import type {
  AggregateDetail,
  AggregateEpisode,
  AggregatePlayResponse,
  AggregateResult,
  AggregateSearchResponse,
} from '../../shared/aggregate';
import { extractMediaUrlFromHtml } from '../../shared/aggregate';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api, ApiError } from '../lib/api';
import { Link, useQuery, useRouter } from '../lib/router';
import { Modal } from '../components/Modal';
import { Player } from '../components/Player';

const EXAMPLES = ['哪吒', '流浪地球', '甄嬛传', '沙丘', '狂飙', '奥本海默'];
const BATCH_SIZE = 8;
const CONCURRENCY = 3;
const PREFERRED_SOURCES = ['zuida', 'huya', 'baofeng', 'feifan', 'jisu', 'baiduyun'];

function preferredOffer(result: AggregateResult) {
  for (const id of PREFERRED_SOURCES) {
    const offer = result.offers.find((entry) => entry.sourceId === id);
    if (offer) return offer;
  }
  return result.offers[0];
}

async function resolveShareInBrowser(pageUrl: string) {
  const response = await fetch(pageUrl, {
    headers: { Accept: 'text/html,application/xhtml+xml,*/*' },
    credentials: 'omit',
  });
  if (!response.ok) throw new Error(`播放页返回 HTTP ${response.status}`);
  const text = await response.text();
  if (text.trimStart().startsWith('#EXTM3U')) return pageUrl;
  const media = extractMediaUrlFromHtml(text, response.url || pageUrl);
  if (!media) throw new Error('播放页中没有可识别的 m3u8/mp4');
  return media;
}

function mergeResults(current: AggregateResult[], incoming: AggregateResult[]) {
  const map = new Map(current.map((item) => [item.key, { ...item, offers: [...item.offers] }]));
  for (const item of incoming) {
    const existing = map.get(item.key);
    if (!existing) {
      map.set(item.key, { ...item, offers: [...item.offers] });
      continue;
    }
    for (const offer of item.offers) {
      if (!existing.offers.some((entry) => entry.sourceId === offer.sourceId && entry.vodId === offer.vodId)) {
        existing.offers.push(offer);
      }
    }
    if (!existing.pic && item.pic) existing.pic = item.pic;
    if (!existing.remarks && item.remarks) existing.remarks = item.remarks;
  }
  return [...map.values()].sort(
    (a, b) => b.offers.length - a.offers.length || Number(b.year || 0) - Number(a.year || 0),
  );
}

function AggregatePoster({ result }: { result: AggregateResult }) {
  const [failed, setFailed] = useState(false);
  if (result.pic && !failed) {
    return (
      <img
        className="agg-poster"
        src={result.pic}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <div className="agg-poster agg-poster-fallback" aria-hidden="true">
      <span>{result.title.slice(0, 1)}</span>
      <i>{result.year || 'KV'}</i>
    </div>
  );
}

export function SearchPage() {
  const query = useQuery();
  const { navigate } = useRouter();
  const { me, openAuth } = useAuth();
  const { push } = useToast();
  const q = (query.get('q') ?? '').trim();
  const [input, setInput] = useState(q);
  const [results, setResults] = useState<AggregateResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: VIDEO_SOURCES.length, ok: 0, fail: 0 });
  const [failures, setFailures] = useState<Array<{ id: string; name: string; error: string }>>([]);
  const [selected, setSelected] = useState<AggregateResult | null>(null);
  const [activeSourceId, setActiveSourceId] = useState('');
  const [detail, setDetail] = useState<AggregateDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState('');
  const [groupIndex, setGroupIndex] = useState(0);
  const [playSession, setPlaySession] = useState<AggregatePlayResponse | null>(null);
  const [playLoading, setPlayLoading] = useState('');
  const runId = useRef(0);
  const detailRequest = useRef(0);

  useEffect(() => {
    setInput(q);
    if (!q) {
      setResults([]);
      setSearching(false);
      setProgress({ done: 0, total: VIDEO_SOURCES.length, ok: 0, fail: 0 });
      setFailures([]);
      return;
    }
    const controller = new AbortController();
    const currentRun = ++runId.current;
    let accumulated: AggregateResult[] = [];
    let done = 0;
    let ok = 0;
    let fail = 0;
    let cursor = 0;
    setResults([]);
    setFailures([]);
    setSearching(true);
    setProgress({ done: 0, total: VIDEO_SOURCES.length, ok: 0, fail: 0 });

    const batches: typeof VIDEO_SOURCES[] = [];
    for (let index = 0; index < VIDEO_SOURCES.length; index += BATCH_SIZE) {
      batches.push(VIDEO_SOURCES.slice(index, index + BATCH_SIZE));
    }

    const worker = async () => {
      while (cursor < batches.length) {
        const batch = batches[cursor++];
        try {
          const data = await api<AggregateSearchResponse>(
            `/aggregate/search?q=${encodeURIComponent(q)}&ids=${batch.map((source) => source.id).join(',')}`,
            { signal: controller.signal },
          );
          if (runId.current !== currentRun) return;
          accumulated = mergeResults(accumulated, data.results);
          setResults(accumulated);
          ok += data.sources.filter((source) => !source.error).length;
          fail += data.sources.filter((source) => source.error).length;
          setFailures((current) => [
            ...current,
            ...data.sources
              .filter((source) => source.error)
              .map((source) => ({ id: source.sourceId, name: source.sourceName, error: source.error! })),
          ]);
        } catch (error) {
          if (controller.signal.aborted || runId.current !== currentRun) return;
          fail += batch.length;
          setFailures((current) => [
            ...current,
            ...batch.map((source) => ({
              id: source.id,
              name: source.name,
              error: error instanceof Error ? error.message : '请求失败',
            })),
          ]);
        } finally {
          if (runId.current === currentRun) {
            done += batch.length;
            setProgress({ done, total: VIDEO_SOURCES.length, ok, fail });
          }
        }
      }
    };

    void Promise.all(Array.from({ length: CONCURRENCY }, () => worker())).finally(() => {
      if (runId.current === currentRun) setSearching(false);
    });

    return () => {
      controller.abort();
      runId.current += 1;
    };
  }, [q]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const value = input.trim();
    navigate(value ? `/search?q=${encodeURIComponent(value)}` : '/search');
  };

  const openDetail = async (result: AggregateResult, sourceId: string) => {
    const requestId = ++detailRequest.current;
    setSelected(result);
    setActiveSourceId(sourceId);
    setDetail(null);
    setDetailError('');
    setGroupIndex(0);
    setPlaySession(null);
    setDetailLoading(true);
    try {
      const data = await api<AggregateDetail>(
        `/aggregate/detail?source=${encodeURIComponent(sourceId)}&id=${encodeURIComponent(
          result.offers.find((offer) => offer.sourceId === sourceId)?.vodId ?? '',
        )}`,
      );
      if (requestId !== detailRequest.current) return;
      setDetail(data);
      const directGroup = data.groups.findIndex((item) =>
        item.episodes.some((episode) => episode.direct),
      );
      setGroupIndex(directGroup >= 0 ? directGroup : 0);
    } catch (error) {
      if (requestId !== detailRequest.current) return;
      setDetailError(error instanceof Error ? error.message : '详情加载失败');
    } finally {
      if (requestId === detailRequest.current) setDetailLoading(false);
    }
  };

  const switchSource = (sourceId: string) => {
    if (!selected || sourceId === activeSourceId) return;
    void openDetail(selected, sourceId);
  };

  const playEpisode = async (episode: AggregateEpisode) => {
    if (!detail) return;
    if (!me?.user) {
      openAuth('login');
      return;
    }
    setPlayLoading(episode.url);
    try {
      const data = await api<AggregatePlayResponse>('/aggregate/play', {
        method: 'POST',
        body: {
          sourceId: activeSourceId,
          url: episode.url,
          title: detail.title,
          episode: episode.name,
        },
      });
      setPlaySession(data);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        openAuth('login');
        return;
      }
      if (!episode.direct) {
        try {
          push('服务器解析受限，正在尝试浏览器解析线路…', 'info');
          const directUrl = await resolveShareInBrowser(episode.url);
          setPlaySession({
            url: '',
            directUrl,
            mode: 'strict',
            kind: /\.mp4(?:[?#]|$)/i.test(directUrl) ? 'file' : 'hls',
            sourceName: detail.sourceName,
            title: detail.title,
            episode: episode.name,
            expiresAt: '',
          });
          return;
        } catch {
          // Fall through to the original server error.
        }
      }
      push(error instanceof Error ? error.message : '播放失败', 'error');
    } finally {
      setPlayLoading('');
    }
  };

  const closeModal = () => {
    setSelected(null);
    setDetail(null);
    setPlaySession(null);
    setDetailError('');
    setPlayLoading('');
  };

  const groups = detail?.groups ?? [];
  const group = groups[groupIndex] ?? groups[0];
  const sourceOptions = useMemo(() => selected?.offers ?? [], [selected]);
  const progressPercent = progress.total ? (progress.done / progress.total) * 100 : 0;

  return (
    <div className="search-page page-wrap">
      <section className="aggregate-hero">
        <div className="aggregate-hero-glow" aria-hidden="true" />
        <span className="eyebrow">
          <Sparkles size={13} /> CROSS-SOURCE SEARCH
        </span>
        <h1>
          一个关键词，
          <br />
          检索整张资源网。
        </h1>
        <p>
          自动向 56 个 normal 资源站发起检索，合并同名影片与不同线路。点击结果即可选择剧集，经签名代理与严格广告过滤播放。
        </p>
        <form className="aggregate-search" onSubmit={submit}>
          <Search size={20} />
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="搜索电影、剧集、演员…"
            aria-label="聚合搜索影片"
          />
          <button type="submit" className="btn btn-primary">
            开始检索 <ArrowRight size={15} />
          </button>
        </form>
        <div className="aggregate-examples">
          <span>试试</span>
          {EXAMPLES.map((item) => (
            <button key={item} type="button" onClick={() => navigate(`/search?q=${encodeURIComponent(item)}`)}>
              {item}
            </button>
          ))}
        </div>
      </section>

      {!q ? (
        <section className="aggregate-intro">
          <div className="aggregate-intro-card">
            <Search size={20} />
            <h3>输入片名，自动并发检索</h3>
            <p>优先展示收录线路最多的结果，并自动合并同名影片。所有播放都经过 HLS 广告过滤。</p>
          </div>
          <div className="aggregate-intro-card">
            <ShieldCheck size={20} />
            <h3>56 个 normal 源</h3>
            <p>导入时已剔除 22 个 premium 分组资源。搜索请求由 Worker 代理，避免浏览器跨域限制。</p>
          </div>
          <div className="aggregate-intro-card">
            <Clapperboard size={20} />
            <h3>选集播放</h3>
            <p>自动解析播放组与剧集列表，支持直链 m3u8 与播放页二次解析。</p>
          </div>
        </section>
      ) : (
        <>
          <div className="aggregate-status">
            <div className="aggregate-progress-copy">
              <span>
                {searching ? (
                  <LoaderCircle size={14} className="spin" />
                ) : (
                  <CheckCircle2 size={14} />
                )}
                {searching ? '正在检索资源站…' : `检索完成 · 找到 ${results.length} 部作品`}
              </span>
              <span>
                {progress.done}/{progress.total} 个源 · 成功 {progress.ok} · 失败 {progress.fail}
              </span>
            </div>
            <div className="aggregate-progress">
              <span style={{ width: `${progressPercent}%` }} />
            </div>
          </div>

          {failures.length > 0 ? (
            <details className="aggregate-failures">
              <summary>
                <CircleSlash size={13} /> {failures.length} 个源未返回结果
              </summary>
              <div>
                {failures.slice(0, 20).map((item) => (
                  <span key={`${item.id}-${item.error}`}>
                    {item.name}：{item.error}
                  </span>
                ))}
              </div>
            </details>
          ) : null}

          {searching && results.length === 0 ? (
            <div className="aggregate-grid">
              {Array.from({ length: 6 }, (_, index) => (
                <div className="aggregate-skeleton" key={index}>
                  <span />
                  <div>
                    <i />
                    <i />
                    <i />
                  </div>
                </div>
              ))}
            </div>
          ) : results.length === 0 && !searching ? (
            <div className="empty-state soft">
              <Search size={28} />
              <h3>没有找到“{q}”</h3>
              <p>换一个片名或更短的关键词试试。部分资源站可能暂时不可用。</p>
              <Link to="/sources" className="btn btn-glass">
                查看资源站状态
              </Link>
            </div>
          ) : (
            <div className="aggregate-grid">
              {results.map((result) => (
                <article key={result.key} className="aggregate-card">
                  <AggregatePoster result={result} />
                  <div className="aggregate-card-body">
                    <div className="aggregate-card-top">
                      <span className="aggregate-year">{result.year || '年份未知'}</span>
                      {result.typeName ? <span className="aggregate-type">{result.typeName}</span> : null}
                      <span className="aggregate-offer-count">{result.offers.length} 条线路</span>
                    </div>
                    <h3>{result.title}</h3>
                    <p className="aggregate-remarks">{result.remarks || result.actor || '暂无简介'}</p>
                    <div className="aggregate-offers">
                      {result.offers.slice(0, 3).map((offer) => (
                        <span key={`${offer.sourceId}-${offer.vodId}`}>{offer.sourceName}</span>
                      ))}
                      {result.offers.length > 3 ? <i>+{result.offers.length - 3}</i> : null}
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary btn-compact"
                      onClick={() => void openDetail(result, preferredOffer(result).sourceId)}
                    >
                      <Play size={14} fill="currentColor" /> 查看线路
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={closeModal}
        className={`aggregate-modal ${playSession ? 'aggregate-modal-playing' : ''}`}
        labelledBy="aggregate-detail-title"
      >
        {selected ? (
          <>
            <div className="aggregate-modal-head">
              <div className="aggregate-modal-poster">
                <AggregatePoster result={selected} />
              </div>
              <div>
                <span className="eyebrow">
                  <Film size={12} /> {detail?.sourceName ?? 'RESOURCE SOURCE'}
                </span>
                <h2 id="aggregate-detail-title">{detail?.title ?? selected.title}</h2>
                <div className="aggregate-modal-meta">
                  <span>{detail?.year || selected.year || '年份未知'}</span>
                  {detail?.typeName ? <span>{detail.typeName}</span> : null}
                  {detail?.remarks ? <span>{detail.remarks}</span> : null}
                </div>
                {detail?.actor ? <p className="aggregate-modal-credits">主演：{detail.actor}</p> : null}
              </div>
            </div>

            {playSession ? (
              <div className="aggregate-player-wrap">
                <div className="aggregate-player-head">
                  <div>
                    <span className="eyebrow">NOW PLAYING · STRICT FILTER</span>
                    <h3>
                      {playSession.title} <span>{playSession.episode}</span>
                    </h3>
                  </div>
                  <button type="button" className="btn btn-glass btn-compact" onClick={() => setPlaySession(null)}>
                    <X size={14} /> 返回选集
                  </button>
                </div>
                <Player
                  src={playSession.directUrl || playSession.url}
                  fallbackSrc={playSession.directUrl ? playSession.url : undefined}
                  clientFilter
                  kind={playSession.kind}
                  adMode={playSession.mode}
                  artwork={{
                    accent: ['#7c5cff', '#20d6c7'],
                    motif: 'prism',
                    title: playSession.title,
                    originalTitle: 'AGGREGATE SOURCE',
                  }}
                />
                <div className="aggregate-player-note">
                  <ShieldCheck size={14} />
                  <span>
                    播放链路：{playSession.sourceName} → 浏览器直连 + 客户端严格过滤；直连失败时自动切换签名代理。
                  </span>
                </div>
              </div>
            ) : null}

            <div className="aggregate-source-tabs">
              {sourceOptions.map((offer) => (
                <button
                  key={offer.sourceId}
                  type="button"
                  className={offer.sourceId === activeSourceId ? 'active' : ''}
                  onClick={() => switchSource(offer.sourceId)}
                >
                  {offer.sourceName}
                  <span>{offer.vodId}</span>
                </button>
              ))}
            </div>

            {detailLoading ? (
              <div className="aggregate-detail-loading">
                <LoaderCircle className="spin" size={24} />
                <span>正在读取线路与剧集…</span>
              </div>
            ) : detailError ? (
              <div className="aggregate-detail-error">
                <CircleSlash size={20} />
                <h3>这条线路暂时无法读取</h3>
                <p>{detailError}</p>
                <button type="button" className="btn btn-glass btn-compact" onClick={() => void openDetail(selected, activeSourceId)}>
                  重试
                </button>
              </div>
            ) : detail ? (
              <>
                {detail.content ? <p className="aggregate-content">{detail.content}</p> : null}
                {groups.length === 0 ? (
                  <div className="aggregate-detail-error">
                    <Tv size={20} />
                    <h3>没有解析到可播放剧集</h3>
                    <p>这个资源站的详情格式可能不同，试试切换其他线路。</p>
                  </div>
                ) : (
                  <>
                    <div className="aggregate-group-tabs">
                      {groups.map((item, index) => (
                        <button
                          key={`${item.flag}-${index}`}
                          type="button"
                          className={index === groupIndex ? 'active' : ''}
                          onClick={() => setGroupIndex(index)}
                        >
                          {item.flag}
                          <span>{item.episodes.length}</span>
                        </button>
                      ))}
                    </div>
                    <div className="aggregate-episodes">
                      {group?.episodes.map((episode) => (
                        <button
                          key={`${episode.name}-${episode.url}`}
                          type="button"
                          className="aggregate-episode"
                          onClick={() => playEpisode(episode)}
                          disabled={playLoading === episode.url}
                        >
                          {playLoading === episode.url ? (
                            <LoaderCircle size={13} className="spin" />
                          ) : (
                            <Play size={12} fill="currentColor" />
                          )}
                          <span>{episode.name}</span>
                          {!episode.direct ? <i>解析</i> : null}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </>
            ) : null}

            {!me?.user ? (
              <div className="aggregate-login-hint">
                <ShieldCheck size={15} />
                <span>播放第三方资源站线路需要登录。登录后可继续当前选集。</span>
                <button type="button" className="text-link" onClick={() => openAuth('login')}>
                  去登录 <ArrowRight size={13} />
                </button>
              </div>
            ) : null}

            <div className="aggregate-modal-foot">
              <span>
                <ShieldCheck size={13} /> 广告过滤严格模式 · 播放地址由 Worker 签名
              </span>
              <Link to="/sources" className="text-link">
                资源站目录 <ExternalLink size={12} />
              </Link>
            </div>
          </>
        ) : null}
      </Modal>
    </div>
  );
}
