import React from 'react';
import { Play, Star } from 'lucide-react';
import type { CatalogTitle } from '../../shared/types';
import { Link } from '../lib/router';
import { percent } from '../lib/api';

type Artwork = Pick<CatalogTitle, 'title' | 'originalTitle' | 'year' | 'accent' | 'motif'> & {
  quality?: string;
  badge?: string;
};

export function Poster({
  artwork,
  className = '',
  compact = false,
}: {
  artwork: Artwork;
  className?: string;
  compact?: boolean;
}) {
  const style = {
    '--accent-a': artwork.accent[0],
    '--accent-b': artwork.accent[1],
  } as React.CSSProperties;
  return (
    <div className={`poster motif-${artwork.motif} ${compact ? 'poster-compact' : ''} ${className}`} style={style}>
      <div className="poster-glow" />
      <div className="poster-lines" />
      <div className="poster-orb poster-orb-a" />
      <div className="poster-orb poster-orb-b" />
      <div className="poster-grain" />
      <div className="poster-topline">
        <span>KV · ORIGINAL</span>
        {artwork.quality ? <span className="poster-quality">{artwork.quality}</span> : null}
      </div>
      <div className="poster-letter" aria-hidden="true">
        {artwork.originalTitle.slice(0, 1)}
      </div>
      <div className="poster-copy">
        <span className="poster-kicker">{artwork.badge ?? 'OPEN CINEMA'}</span>
        <h3>{artwork.originalTitle}</h3>
        <p>
          {artwork.title} · {artwork.year}
        </p>
      </div>
      <div className="poster-shine" />
    </div>
  );
}

export function TitleCard({
  title,
  progress,
  index = 0,
}: {
  title: CatalogTitle;
  progress?: number;
  index?: number;
}) {
  return (
    <Link
      to={`/title/${title.id}`}
      className="title-card reveal"
      style={{ animationDelay: `${Math.min(index, 10) * 45}ms` }}
    >
      <div className="title-card-art">
        <Poster artwork={title} />
        <div className="title-card-hover">
          <span className="round-play">
            <Play size={18} fill="currentColor" />
          </span>
          <span className="hover-label">查看详情</span>
        </div>
        <span className="title-card-rating">
          <Star size={11} fill="currentColor" /> {title.rating.toFixed(1)}
        </span>
        {title.badge ? <span className="title-card-badge">{title.badge}</span> : null}
        {progress !== undefined && progress > 0 ? (
          <span className="title-card-progress">
            <span style={{ width: `${percent(progress, 100)}%` }} />
          </span>
        ) : null}
      </div>
      <div className="title-card-meta">
        <h3>{title.title}</h3>
        <p>
          {title.year} · {title.genres.slice(0, 2).join(' / ')}
        </p>
      </div>
    </Link>
  );
}

export function ContinueCard({
  title,
  progress,
  onClick,
}: {
  title: CatalogTitle;
  progress: number;
  onClick?: () => void;
}) {
  return (
    <Link to={`/watch/${title.id}`} className="continue-card" onClick={onClick}>
      <div className="continue-art">
        <Poster artwork={title} compact />
      </div>
      <div className="continue-meta">
        <span className="eyebrow">继续观看</span>
        <h3>{title.title}</h3>
        <p>{Math.round(progress)}% 已完成</p>
        <span className="mini-progress">
          <span style={{ width: `${Math.max(2, Math.min(100, progress))}%` }} />
        </span>
      </div>
    </Link>
  );
}
