import { describe, expect, it } from 'vitest';
import {
  SOURCE_META,
  VIDEO_SOURCES,
  VIDEO_SOURCE_STATS,
} from '../shared/sources';

describe('imported video sources', () => {
  it('only imports non-premium resources', () => {
    expect(VIDEO_SOURCES.length).toBeGreaterThan(0);
    expect(VIDEO_SOURCES.some((source) => source.group === 'premium')).toBe(false);
    expect(SOURCE_META.filteredPremium).toBe(22);
    expect(SOURCE_META.downloaded).toBe(78);
  });

  it('keeps ids unique and priorities sorted', () => {
    const ids = new Set(VIDEO_SOURCES.map((source) => source.id));
    expect(ids.size).toBe(VIDEO_SOURCES.length);
    for (let index = 1; index < VIDEO_SOURCES.length; index += 1) {
      expect(VIDEO_SOURCES[index].priority).toBeGreaterThanOrEqual(
        VIDEO_SOURCES[index - 1].priority,
      );
    }
  });

  it('all sources are enabled and have a base URL', () => {
    expect(VIDEO_SOURCE_STATS.enabled).toBe(VIDEO_SOURCES.length);
    for (const source of VIDEO_SOURCES) {
      expect(source.baseUrl).toMatch(/^https?:\/\//);
      expect(source.group).toBe('normal');
    }
  });
});
