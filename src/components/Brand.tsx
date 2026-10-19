import React from 'react';
import { Play } from 'lucide-react';
import { Link } from '../lib/router';

export function Brand({ to = '/', compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className={`brand ${compact ? 'brand-compact' : ''}`} aria-label="KVideo Cloud 首页">
      <span className="brand-mark">
        <Play size={15} fill="currentColor" strokeWidth={0} />
        <i />
        <i />
      </span>
      {!compact ? (
        <span className="brand-word">
          KVideo<span>Cloud</span>
        </span>
      ) : null}
    </Link>
  );
}
