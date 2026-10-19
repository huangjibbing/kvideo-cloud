import React from 'react';
import {
  Crown,
  Eye,
  Film,
  Infinity as InfinityIcon,
  KeyRound,
  ShieldCheck,
  Sparkles,
  UserRound,
} from 'lucide-react';
import type { GroupInfo } from '../../shared/types';

const ICONS: Record<string, React.ComponentType<{ size?: number }>> = {
  eye: Eye,
  user: UserRound,
  film: Film,
  sparkles: Sparkles,
  crown: Crown,
  infinity: InfinityIcon,
  shield: ShieldCheck,
  key: KeyRound,
};

export function GroupBadge({
  group,
  size = 'md',
  showName = true,
}: {
  group: GroupInfo;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
}) {
  const Icon = ICONS[group.icon] ?? Sparkles;
  return (
    <span
      className={`group-badge group-badge-${size}`}
      style={{ '--group-color': group.color } as React.CSSProperties}
      title={group.description}
    >
      <Icon size={size === 'lg' ? 16 : size === 'sm' ? 11 : 13} />
      {showName ? <span>{group.name}</span> : null}
    </span>
  );
}
