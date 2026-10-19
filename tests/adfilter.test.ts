import { describe, expect, it } from 'vitest';
import { filterM3u8, rewritePlaylistUris } from '../shared/adfilter';

const BASE = 'https://cdn.example.com/movie/playlist.m3u8';

function media(segments: string[], extraHead: string[] = []) {
  return [
    '#EXTM3U',
    '#EXT-X-VERSION:3',
    '#EXT-X-TARGETDURATION:6',
    '#EXT-X-MEDIA-SEQUENCE:0',
    ...extraHead,
    ...segments,
    '#EXT-X-ENDLIST',
  ].join('\n');
}

function seg(name: string, duration = 6) {
  return [`#EXTINF:${duration.toFixed(3)},`, name];
}

describe('filterM3u8', () => {
  it('leaves a normal VOD playlist untouched', () => {
    const playlist = media(Array.from({ length: 8 }, (_, i) => seg(`seg-${i}.ts`)).flat());
    const result = filterM3u8(playlist, BASE, { mode: 'strict' });
    expect(result.removedSegments).toBe(0);
    expect(result.content).toBe(playlist);
  });

  it('removes a CUE-OUT / CUE-IN ad pod and keeps content', () => {
    const playlist = media([
      ...Array.from({ length: 3 }, (_, i) => seg(`content-${i}.ts`)).flat(),
      '#EXT-X-CUE-OUT:30',
      '#EXT-X-DISCONTINUITY',
      ...Array.from({ length: 3 }, (_, i) => seg(`ad-${i}.ts`, 5)).flat(),
      '#EXT-X-CUE-IN',
      '#EXT-X-DISCONTINUITY',
      ...Array.from({ length: 3 }, (_, i) => seg(`content-${i + 3}.ts`)).flat(),
    ]);
    const result = filterM3u8(playlist, BASE, { mode: 'strict' });
    expect(result.removedSegments).toBe(3);
    expect(result.content).not.toContain('ad-0.ts');
    expect(result.content).not.toContain('CUE-OUT');
    expect(result.content).toContain('content-5.ts');
    expect(result.content.match(/#EXT-X-DISCONTINUITY/g)?.length).toBeLessThanOrEqual(1);
  });

  it('removes a disguised cross-origin ad island without cue tags', () => {
    const playlist = media([
      ...Array.from({ length: 8 }, (_, i) => seg(`seg-${i}.ts`)).flat(),
      '#EXT-X-DISCONTINUITY',
      ...Array.from({ length: 3 }, (_, i) => seg(`https://ads.example.net/preroll/ad-${i}.ts`, 15)).flat(),
      '#EXT-X-DISCONTINUITY',
      ...Array.from({ length: 8 }, (_, i) => seg(`seg-${i + 8}.ts`)).flat(),
    ]);
    const result = filterM3u8(playlist, BASE, { mode: 'strict' });
    expect(result.removedSegments).toBe(3);
    expect(result.content).not.toContain('ads.example.net');
    expect(result.content).toContain('seg-15.ts');
  });

  it('does not mistake a long content segment block on another CDN for an ad', () => {
    const playlist = media([
      ...Array.from({ length: 8 }, (_, i) => seg(`seg-${i}.ts`)).flat(),
      '#EXT-X-DISCONTINUITY',
      ...Array.from({ length: 10 }, (_, i) => seg(`https://cdn2.example.com/part-${i}.ts`, 6)).flat(),
      '#EXT-X-DISCONTINUITY',
      ...Array.from({ length: 8 }, (_, i) => seg(`seg-${i + 8}.ts`)).flat(),
    ]);
    const result = filterM3u8(playlist, BASE, { mode: 'strict' });
    expect(result.removedSegments).toBe(0);
    expect(result.content).toContain('cdn2.example.com/part-9.ts');
  });

  it('removes a single midroll segment whose filename is an ad marker', () => {
    const playlist = media([
      ...Array.from({ length: 3 }, (_, i) => seg(`content-${i}.ts`)).flat(),
      ...seg('midroll-ad-01.ts', 4),
      ...Array.from({ length: 3 }, (_, i) => seg(`content-${i + 3}.ts`)).flat(),
    ]);
    const result = filterM3u8(playlist, BASE, { mode: 'strict' });
    expect(result.removedSegments).toBe(1);
    expect(result.content).not.toContain('midroll-ad-01.ts');
    expect(result.content).toContain('content-5.ts');
  });

  it('strips HLS interstitial metadata from a master playlist', () => {
    const master = [
      '#EXTM3U',
      '#EXT-X-DATERANGE:ID="ad1",CLASS="com.apple.hls.interstitial",X-ASSET-URI="https://ads.example/ad.m3u8"',
      '#EXT-X-STREAM-INF:BANDWIDTH=800000,RESOLUTION=1280x720',
      '720p/index.m3u8',
      '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=100000,URI="iframe.m3u8"',
    ].join('\n');
    const result = filterM3u8(master, BASE, { mode: 'strict' });
    expect(result.isMaster).toBe(true);
    expect(result.content).not.toContain('X-ASSET-URI');
    expect(result.content).toContain('720p/index.m3u8');
  });

  it('never blanks a playlist when every segment is flagged', () => {
    const playlist = media([
      '#EXT-X-CUE-OUT:30',
      ...Array.from({ length: 3 }, (_, i) => seg(`ad-${i}.ts`, 5)).flat(),
    ]);
    const result = filterM3u8(playlist, BASE, { mode: 'aggressive' });
    expect(result.keptSegments).toBe(3);
    expect(result.reasons['guard-all-removed']).toBe(1);
    expect(result.content).toContain('ad-0.ts');
  });

  it('removes a clear ad pod stitched into an AES-128 content stream', () => {
    const playlist = media([
      '#EXT-X-KEY:METHOD=AES-128,URI="key1.bin"',
      ...Array.from({ length: 3 }, (_, i) => seg(`encrypted-${i}.ts`)).flat(),
      '#EXT-X-DISCONTINUITY',
      '#EXT-X-KEY:METHOD=NONE',
      ...Array.from({ length: 3 }, (_, i) => seg(`clear-ad-${i}.ts`, 20)).flat(),
      '#EXT-X-DISCONTINUITY',
      '#EXT-X-KEY:METHOD=AES-128,URI="key2.bin"',
      ...Array.from({ length: 3 }, (_, i) => seg(`encrypted-${i + 3}.ts`)).flat(),
    ]);
    const result = filterM3u8(playlist, BASE, { mode: 'strict' });
    expect(result.removedSegments).toBe(3);
    expect(result.content).not.toContain('clear-ad-0.ts');
    expect(result.content).toContain('encrypted-5.ts');
    expect(result.reasons['encryption-island']).toBe(3);
  });

  it('strict mode is stricter than aggressive mode', () => {
    const playlist = media([
      ...Array.from({ length: 4 }, (_, i) => seg(`seg-${i}.ts`)).flat(),
      '#EXT-X-DISCONTINUITY',
      ...Array.from({ length: 2 }, (_, i) => seg(`https://other.cdn/x-${i}.ts`, 7)).flat(),
      '#EXT-X-DISCONTINUITY',
      ...Array.from({ length: 4 }, (_, i) => seg(`seg-${i + 4}.ts`)).flat(),
    ]);
    const strict = filterM3u8(playlist, BASE, { mode: 'strict' });
    const aggressive = filterM3u8(playlist, BASE, { mode: 'aggressive' });
    expect(strict.removedSegments).toBe(0);
    expect(aggressive.removedSegments).toBeGreaterThanOrEqual(strict.removedSegments);
  });
});

describe('rewritePlaylistUris', () => {
  it('rewrites media, key, map and iframe URIs', async () => {
    const playlist = [
      '#EXTM3U',
      '#EXT-X-KEY:METHOD=AES-128,URI="key.bin"',
      '#EXT-X-MAP:URI="init.mp4"',
      '#EXTINF:6,',
      'seg-1.ts',
      '#EXT-X-I-FRAME-STREAM-INF:BANDWIDTH=1,URI="iframe.m3u8"',
    ].join('\n');
    const result = await rewritePlaylistUris(playlist, BASE, (url) => `/proxy?u=${encodeURIComponent(url)}`);
    expect(result).toContain('URI="/proxy?u=https%3A%2F%2Fcdn.example.com%2Fmovie%2Fkey.bin"');
    expect(result).toContain('URI="/proxy?u=https%3A%2F%2Fcdn.example.com%2Fmovie%2Finit.mp4"');
    expect(result).toContain('/proxy?u=https%3A%2F%2Fcdn.example.com%2Fmovie%2Fseg-1.ts');
    expect(result).toContain('/proxy?u=https%3A%2F%2Fcdn.example.com%2Fmovie%2Fiframe.m3u8');
  });
});
