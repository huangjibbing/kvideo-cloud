import sourceData from '../data/video-sources.json';
import sourceMeta from '../data/video-sources.meta.json';

export interface VideoSource {
  id: string;
  name: string;
  baseUrl: string;
  group: string;
  enabled: boolean;
  priority: number;
}

export interface SourceMeta {
  sourceUrl: string;
  importedAt: string;
  downloaded: number;
  imported: number;
  filteredPremium: number;
}

export const VIDEO_SOURCES = sourceData as VideoSource[];
export const SOURCE_META = sourceMeta as SourceMeta;

export const VIDEO_SOURCE_STATS = {
  imported: VIDEO_SOURCES.length,
  filteredPremium: SOURCE_META.filteredPremium,
  downloaded: SOURCE_META.downloaded,
  enabled: VIDEO_SOURCES.filter((source) => source.enabled).length,
  groups: Array.from(new Set(VIDEO_SOURCES.map((source) => source.group))),
};

export function findVideoSource(id: string) {
  return VIDEO_SOURCES.find((source) => source.id === id);
}

export function sourceHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl;
  }
}
