import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VideoFetcher, normalizeVideoUrl } from './video-fetcher';

describe('VideoFetcher', () => {
  let fetcher: VideoFetcher;

  beforeEach(() => {
    fetcher = new VideoFetcher({ transcriber: 'whisper' });
  });

  it('supports youtube and bilibili URLs', () => {
    expect(fetcher.supports('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(true);
    expect(fetcher.supports('https://youtu.be/dQw4w9WgXcQ')).toBe(true);
    expect(fetcher.supports('https://www.bilibili.com/video/BV1xx411c7mD')).toBe(true);
  });

  it('supports bilibili watch-later URLs and normalizes them to video URLs', () => {
    const withBvid =
      'https://www.bilibili.com/list/watchlater?oid=117361155771330&bvid=BV1T2Yc6iE3o';
    const oidOnly = 'https://www.bilibili.com/list/watchlater?oid=117361155771330';

    expect(fetcher.supports(withBvid)).toBe(true);
    expect(fetcher.supports(oidOnly)).toBe(true);
    expect(normalizeVideoUrl(withBvid)).toBe(
      'https://www.bilibili.com/video/BV1T2Yc6iE3o',
    );
    expect(normalizeVideoUrl(oidOnly)).toBe(
      'https://www.bilibili.com/video/av117361155771330',
    );
    expect(normalizeVideoUrl('https://www.bilibili.com/video/BV1T2Yc6iE3o')).toBe(
      'https://www.bilibili.com/video/BV1T2Yc6iE3o',
    );
    expect(normalizeVideoUrl('https://example.com/blog')).toBe('https://example.com/blog');
  });

  it('does not support regular article URLs', () => {
    expect(fetcher.supports('https://example.com/blog')).toBe(false);
  });

  it('extracts subtitles from VTT content', () => {
    const vtt = `WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nHello world\n\n00:00:04.000 --> 00:00:06.000\nThis is a test`;
    // Access private method via bracket notation for testing
    const result = (fetcher as any).parseVTT(vtt);
    expect(result).toBe('Hello world This is a test');
  });

  it('deduplicates YouTube scrolling-append VTT entries', () => {
    const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.000
向量数据库是一种

00:00:03.000 --> 00:00:05.000
向量数据库是一种特殊的数据库

00:00:05.000 --> 00:00:07.000
向量数据库是一种特殊的数据库，用于存储

00:00:07.000 --> 00:00:10.000
Hello world

00:00:10.000 --> 00:00:12.000
完全不同的句子
`;

    global.fetch = vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('dummy') });
    const fetcher = new VideoFetcher({ transcriber: 'whisper' });

    const result = (fetcher as any).parseVTT(vtt);

    // Should keep only the final complete version of the scrolling sequence
    expect(result).toContain('向量数据库是一种特殊的数据库，用于存储');
    // Intermediate partial versions should be removed
    expect(result).not.toMatch(/向量数据库是一种$/);
    // Non-scrolling standalone entries kept
    expect(result).toContain('Hello world');
    expect(result).toContain('完全不同的句子');
  });
});
