import React, { useCallback, useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  AlertTriangle,
  Check,
  Gauge,
  LoaderCircle,
  Maximize,
  Minimize,
  Pause,
  PictureInPicture2,
  Play,
  RotateCcw,
  RotateCw,
  Settings,
  ShieldCheck,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { formatTime } from '../lib/api';
import type { CatalogTitle } from '../../shared/types';
import { filterM3u8 } from '../../shared/adfilter';

interface PlayerProps {
  src: string;
  artwork: Pick<CatalogTitle, 'accent' | 'motif' | 'title' | 'originalTitle'>;
  adMode: string;
  kind?: 'hls' | 'file';
  fallbackSrc?: string;
  clientFilter?: boolean;
  autoPlay?: boolean;
  onProgress?: (current: number, duration: number) => void;
  onAdStats?: (removed: number) => void;
}

export function Player({
  src,
  artwork,
  adMode,
  kind = 'hls',
  fallbackSrc,
  clientFilter = false,
  autoPlay = true,
  onProgress,
  onAdStats,
}: PlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const hideTimer = useRef<number | null>(null);
  const lastReport = useRef(0);

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [levels, setLevels] = useState<Array<{ index: number; height: number; bitrate: number }>>([]);
  const [quality, setQuality] = useState(-1);
  const [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [adRemoved, setAdRemoved] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeSrc, setActiveSrc] = useState(src);
  const fallbackTried = useRef(false);

  useEffect(() => {
    setActiveSrc(src);
    fallbackTried.current = false;
  }, [src]);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      if (!videoRef.current?.paused && !settingsOpen) setShowControls(false);
    }, 3200);
  }, [settingsOpen]);

  useEffect(() => {
    setPlaying(false);
    setLoading(true);
    setError('');
    setLevels([]);
    setQuality(-1);
    setAdRemoved(0);
    const video = videoRef.current;
    if (!video || !activeSrc) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    if (kind === 'file') {
      video.src = activeSrc;
      setLoading(false);
      if (autoPlay) video.play().catch(() => undefined);
      return () => {
        video.removeAttribute('src');
        video.load();
      };
    }

    const attachAdStats = (data: { networkDetails?: unknown }) => {
      if (clientFilter) return;
      try {
        const xhr = data.networkDetails as XMLHttpRequest | undefined;
        const value = Number(xhr?.getResponseHeader?.('X-KV-Ads-Removed') ?? 0);
        if (Number.isFinite(value) && value > 0) {
          setAdRemoved((previous) => Math.max(previous, value));
          onAdStats?.(value);
        }
      } catch {
        // Header is best-effort only.
      }
    };

    if (Hls.isSupported()) {
      let ClientFilterLoader: any;
      if (clientFilter) {
        const DefaultLoader = (Hls as unknown as { DefaultConfig: { loader: new () => unknown } })
          .DefaultConfig.loader as new () => {
          load(
            context: { type?: string; url: string },
            config: unknown,
            callbacks: {
              onSuccess: (
                response: { data?: unknown },
                stats: unknown,
                responseContext: unknown,
                networkDetails: unknown,
              ) => void;
            },
          ): void;
        };
        ClientFilterLoader = class extends DefaultLoader {
          load(
            context: { type?: string; url: string },
            config: unknown,
            callbacks: {
              onSuccess: (
                response: { data?: unknown },
                stats: unknown,
                responseContext: unknown,
                networkDetails: unknown,
              ) => void;
            },
          ) {
            if (context.type === 'manifest' || context.type === 'level') {
              const originalOnSuccess = callbacks.onSuccess;
              callbacks.onSuccess = (response, stats, responseContext, networkDetails) => {
                if (typeof response.data === 'string') {
                  try {
                    const filtered = filterM3u8(response.data, context.url, { mode: 'strict' });
                    response.data = filtered.content;
                    if (filtered.removedSegments > 0) {
                      setAdRemoved((previous) => Math.max(previous, filtered.removedSegments));
                      onAdStats?.(filtered.removedSegments);
                    }
                  } catch {
                    // Keep the original manifest if client filtering fails.
                  }
                }
                originalOnSuccess(response, stats, responseContext, networkDetails);
              };
            }
            super.load(context, config, callbacks);
          }
        };
      }
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        capLevelToPlayerSize: true,
        startLevel: -1,
        backBufferLength: 45,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        maxBufferSize: 60 * 1000 * 1000,
        startFragPrefetch: true,
        abrEwmaDefaultEstimate: 1_500_000,
        maxStarvationDelay: 2,
        fragLoadingMaxRetry: 4,
        manifestLoadingMaxRetry: 3,
        levelLoadingMaxRetry: 3,
        manifestLoadingTimeOut: 8000,
        levelLoadingTimeOut: 8000,
        fragLoadingTimeOut: 15000,
        ...(ClientFilterLoader ? { loader: ClientFilterLoader as never } : {}),
      });
      hlsRef.current = hls;
      hls.loadSource(activeSrc);
      hls.attachMedia(video);
      hls.on(Hls.Events.MANIFEST_LOADED, (_event, data) => attachAdStats(data));
      hls.on(Hls.Events.LEVEL_LOADED, (_event, data) => attachAdStats(data));
      hls.on(Hls.Events.MANIFEST_PARSED, (_event, data) => {
        setLevels(
          data.levels.map((level, index) => ({
            index,
            height: level.height || 0,
            bitrate: level.bitrate,
          })),
        );
        setLoading(false);
        if (autoPlay) {
          video.play().catch(() => undefined);
        }
      });
      hls.on(Hls.Events.LEVEL_SWITCHED, () => setQuality(hls.autoLevelEnabled ? -1 : hls.currentLevel));
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (!data.fatal) return;
        if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
          hls.recoverMediaError();
          return;
        }
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          if (fallbackSrc && !fallbackTried.current && activeSrc !== fallbackSrc) {
            fallbackTried.current = true;
            setError('');
            setLoading(true);
            setActiveSrc(fallbackSrc);
            return;
          }
          setError('视频流连接失败，可能是源站限制或网络波动。');
        } else {
          setError('播放器无法解码这条视频流。');
        }
        setLoading(false);
      });
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = activeSrc;
      setLoading(false);
      if (autoPlay) video.play().catch(() => undefined);
    } else {
      setError('当前浏览器不支持 HLS 播放，请使用较新的 Chrome、Edge 或 Safari。');
      setLoading(false);
    }

    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, [activeSrc, autoPlay, onAdStats, reloadKey, kind, clientFilter, fallbackSrc]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const onTime = () => {
      setCurrent(video.currentTime);
      const now = Date.now();
      if (now - lastReport.current > 5000) {
        lastReport.current = now;
        onProgress?.(video.currentTime, video.duration || 0);
      }
    };
    const onDuration = () => setDuration(video.duration || 0);
    const onPlay = () => {
      setPlaying(true);
      setLoading(false);
      resetHideTimer();
    };
    const onPause = () => {
      setPlaying(false);
      setShowControls(true);
    };
    const onWaiting = () => setLoading(true);
    const onPlaying = () => setLoading(false);
    const onVolume = () => {
      setVolume(video.volume);
      setMuted(video.muted);
    };
    const onBuffer = () => {
      if (video.buffered.length > 0 && video.duration) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const onEnded = () => {
      setPlaying(false);
      setShowControls(true);
      onProgress?.(video.duration || 0, video.duration || 0);
    };
    video.addEventListener('timeupdate', onTime);
    video.addEventListener('durationchange', onDuration);
    video.addEventListener('loadedmetadata', onDuration);
    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('volumechange', onVolume);
    video.addEventListener('progress', onBuffer);
    video.addEventListener('ended', onEnded);
    return () => {
      video.removeEventListener('timeupdate', onTime);
      video.removeEventListener('durationchange', onDuration);
      video.removeEventListener('loadedmetadata', onDuration);
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('volumechange', onVolume);
      video.removeEventListener('progress', onBuffer);
      video.removeEventListener('ended', onEnded);
    };
  }, [onProgress, resetHideTimer]);

  useEffect(() => {
    const onFullscreen = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFullscreen);
    return () => document.removeEventListener('fullscreenchange', onFullscreen);
  }, []);

  useEffect(() => {
    if (videoRef.current) videoRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    if (!settingsOpen) return;
    const onDown = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.player-settings')) setSettingsOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [settingsOpen]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) video.play().catch(() => undefined);
    else video.pause();
  };

  const seekBy = (seconds: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = Math.max(0, Math.min(video.duration || 0, video.currentTime + seconds));
  };

  const changeVolume = (value: number) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = value;
    video.muted = value === 0;
  };

  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await shellRef.current?.requestFullscreen();
    } catch {
      // Fullscreen may be blocked by the embedding context.
    }
  };

  const togglePip = async () => {
    const video = videoRef.current;
    if (!video) return;
    try {
      if (document.pictureInPictureElement) await document.exitPictureInPicture();
      else await video.requestPictureInPicture();
    } catch {
      // Unsupported browser.
    }
  };

  const setLevel = (index: number) => {
    if (!hlsRef.current) return;
    hlsRef.current.currentLevel = index;
    setQuality(index);
  };

  const progress = duration > 0 ? (current / duration) * 100 : 0;
  const bufferedPercent = duration > 0 ? (buffered / duration) * 100 : 0;
  const style = {
    '--player-a': artwork.accent[0],
    '--player-b': artwork.accent[1],
  } as React.CSSProperties;

  return (
    <div
      ref={shellRef}
      className={`player-shell ${showControls ? 'controls-visible' : ''} ${fullscreen ? 'is-fullscreen' : ''}`}
      style={style}
      tabIndex={0}
      onMouseMove={resetHideTimer}
      onMouseLeave={() => {
        if (playing && !settingsOpen) setShowControls(false);
      }}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement) return;
        if (event.code === 'Space' || event.key === 'k') {
          event.preventDefault();
          togglePlay();
        } else if (event.key === 'f') toggleFullscreen();
        else if (event.key === 'm') {
          const video = videoRef.current;
          if (video) video.muted = !video.muted;
        } else if (event.key === 'ArrowRight') seekBy(10);
        else if (event.key === 'ArrowLeft') seekBy(-10);
        else if (event.key === 'ArrowUp') changeVolume(Math.min(1, volume + 0.1));
        else if (event.key === 'ArrowDown') changeVolume(Math.max(0, volume - 0.1));
        resetHideTimer();
      }}
    >
      <div className="player-art" aria-hidden="true">
        <span />
        <span />
        <b>{artwork.originalTitle}</b>
      </div>
      <video
        ref={videoRef}
        className="player-video"
        playsInline
        preload="metadata"
        onClick={togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      <div className="player-top">
        <div className="player-badges">
          <span className="player-badge live">
            <ShieldCheck size={13} />
            {adMode === 'off' ? '过滤已关闭' : `广告过滤 · ${adMode}`}
          </span>
          {adRemoved > 0 ? <span className="player-badge removed">已净化 {adRemoved} 段</span> : null}
        </div>
        <span className="player-title-small">{artwork.title}</span>
      </div>

      {loading && !error ? (
        <div className="player-loading">
          <LoaderCircle size={36} className="spin" />
          <span>正在解析播放列表…</span>
        </div>
      ) : null}

      {error ? (
        <div className="player-error">
          <AlertTriangle size={30} />
          <h3>播放遇到问题</h3>
          <p>{error}</p>
          <button
            type="button"
            className="btn btn-primary btn-compact"
            onClick={() => {
              setError('');
              setLoading(true);
              setReloadKey((value) => value + 1);
            }}
          >
            <RotateCcw size={15} /> 重新加载
          </button>
        </div>
      ) : null}

      {!playing && !loading && !error ? (
        <button type="button" className="player-big-play" onClick={togglePlay} aria-label="播放">
          <Play size={30} fill="currentColor" />
        </button>
      ) : null}

      <div className="player-controls">
        <div className="player-progress-wrap">
          <span className="player-buffer" style={{ width: `${bufferedPercent}%` }} />
          <span className="player-played" style={{ width: `${progress}%` }} />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={Math.min(current, duration || 0)}
            onChange={(event) => {
              const video = videoRef.current;
              if (video) video.currentTime = Number(event.target.value);
            }}
            aria-label="播放进度"
          />
        </div>
        <div className="player-control-row">
          <div className="player-control-left">
            <button type="button" onClick={togglePlay} aria-label={playing ? '暂停' : '播放'}>
              {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
            </button>
            <button type="button" onClick={() => seekBy(-10)} aria-label="后退 10 秒">
              <RotateCcw size={18} />
            </button>
            <button type="button" onClick={() => seekBy(10)} aria-label="前进 10 秒">
              <RotateCw size={18} />
            </button>
            <div className="volume-wrap">
              <button
                type="button"
                onClick={() => {
                  const video = videoRef.current;
                  if (video) video.muted = !video.muted;
                }}
                aria-label={muted ? '取消静音' : '静音'}
              >
                {muted || volume === 0 ? <VolumeX size={19} /> : <Volume2 size={19} />}
              </button>
              <input
                type="range"
                min={0}
                max={1}
                step={0.02}
                value={muted ? 0 : volume}
                onChange={(event) => changeVolume(Number(event.target.value))}
                aria-label="音量"
              />
            </div>
            <span className="player-time">
              {formatTime(current)} <i>/</i> {formatTime(duration)}
            </span>
          </div>
          <div className="player-control-right">
            <button type="button" onClick={togglePip} aria-label="画中画">
              <PictureInPicture2 size={18} />
            </button>
            <div className="player-settings">
              <button
                type="button"
                className={settingsOpen ? 'active' : ''}
                onClick={() => setSettingsOpen((value) => !value)}
                aria-label="播放设置"
              >
                <Settings size={19} />
              </button>
              {settingsOpen ? (
                <div className="settings-popover">
                  <div className="settings-section">
                    <span className="settings-label">
                      <Gauge size={13} /> 清晰度
                    </span>
                    <button
                      type="button"
                      className={quality === -1 ? 'selected' : ''}
                      onClick={() => setLevel(-1)}
                    >
                      自动 {quality === -1 ? <Check size={13} /> : null}
                    </button>
                    {levels
                      .slice()
                      .sort((a, b) => b.height - a.height)
                      .map((level) => (
                        <button
                          key={level.index}
                          type="button"
                          className={quality === level.index ? 'selected' : ''}
                          onClick={() => setLevel(level.index)}
                        >
                          {level.height ? `${level.height}P` : `${Math.round(level.bitrate / 1000)}kbps`}
                          {quality === level.index ? <Check size={13} /> : null}
                        </button>
                      ))}
                  </div>
                  <div className="settings-section">
                    <span className="settings-label">播放速度</span>
                    <div className="speed-grid">
                      {[0.5, 0.75, 1, 1.25, 1.5, 2].map((value) => (
                        <button
                          key={value}
                          type="button"
                          className={speed === value ? 'selected' : ''}
                          onClick={() => setSpeed(value)}
                        >
                          {value}×
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
            <button type="button" onClick={toggleFullscreen} aria-label="全屏">
              {fullscreen ? <Minimize size={19} /> : <Maximize size={19} />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
