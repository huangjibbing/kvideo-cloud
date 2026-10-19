import React, { useState } from 'react';
import { Play, Star } from 'lucide-react';
import type { FeedItem } from '../../shared/feed';
import { Link } from '../lib/router';

export function ResourceCard({
  item,
  index,
  rank,
}: {
  item: FeedItem;
  index?: number;
  rank?: number;
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const poster = item.poster && !imageFailed ? item.poster : '';
  return (
    <Link
      to={`/resource/${item.sourceId}/${item.vodId}`}
      className="resource-card reveal"
      style={{ animationDelay: `${Math.min(index ?? 0, 10) * 35}ms` }}
    >
      <div className="resource-card-art">
        {poster ? (
          <img
            src={poster}
            alt={item.title}
            loading="lazy"
            referrerPolicy="no-referrer"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="resource-poster-fallback" aria-hidden="true">
            <span>{item.title.slice(0, 1)}</span>
            <i>KVIDEO</i>
          </div>
        )}
        <div className="resource-card-shade" />
        {rank ? <span className="resource-rank">{String(rank).padStart(2, '0')}</span> : null}
        {item.offers.length > 1 ? (
          <span className="resource-lines">{item.offers.length} 条线路</span>
        ) : null}
        {item.score > 0 ? (
          <span className="resource-score">
            <Star size={10} fill="currentColor" /> {item.score.toFixed(1)}
          </span>
        ) : null}
        <span className="resource-play">
          <Play size={17} fill="currentColor" />
        </span>
      </div>
      <div className="resource-card-meta">
        <h3>{item.title}</h3>
        <p>
          {item.year || '年份未知'}
          {item.typeName ? ` · ${item.typeName}` : ''}
        </p>
        <span>{item.remarks || item.area || '资源站收录'}</span>
      </div>
    </Link>
  );
}
