import { describe, it, expect } from 'vitest';
import { getFetcher } from './index';

describe('getFetcher', () => {
  it('returns VideoFetcher for youtube URLs with auto detection', () => {
    const fetcher = getFetcher('https://youtube.com/watch?v=test', 'auto');
    expect(fetcher.constructor.name).toBe('VideoFetcher');
  });

  it('returns TextFetcher for blog URLs with auto detection', () => {
    const fetcher = getFetcher('https://example.com/blog', 'auto');
    expect(fetcher.constructor.name).toBe('TextFetcher');
  });

  it('returns VideoFetcher for bilibili watch-later URLs with auto detection', () => {
    const fetcher = getFetcher(
      'https://www.bilibili.com/list/watchlater?oid=117361155771330&bvid=BV1T2Yc6iE3o',
      'auto',
    );
    expect(fetcher.constructor.name).toBe('VideoFetcher');
  });

  it('respects explicit type=text override on video URL', () => {
    const fetcher = getFetcher('https://youtube.com/watch?v=test', 'text');
    expect(fetcher.constructor.name).toBe('TextFetcher');
  });

  it('respects explicit type=video override', () => {
    const fetcher = getFetcher('https://example.com/blog', 'video');
    expect(fetcher.constructor.name).toBe('VideoFetcher');
  });
});
