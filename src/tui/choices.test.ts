import { describe, it, expect } from 'vitest';
import {
  buildProviderChoices,
  guessResourceType,
  maskSecret,
  normalizeUrl,
  titleFromFile,
  truncate,
  validateUrl,
} from './choices';
import type { ProviderConfig } from '../config';

describe('normalizeUrl', () => {
  it('keeps an explicit http(s) scheme', () => {
    expect(normalizeUrl('https://nodejs.org/en/about')).toBe('https://nodejs.org/en/about');
    expect(normalizeUrl('http://example.com')).toBe('http://example.com');
  });

  it('prepends https:// to a bare host', () => {
    expect(normalizeUrl('example.com/post')).toBe('https://example.com/post');
  });

  it('trims surrounding whitespace', () => {
    expect(normalizeUrl('  https://example.com  ')).toBe('https://example.com');
  });

  it('throws on empty input', () => {
    expect(() => normalizeUrl('   ')).toThrow('URL 不能为空');
  });
});

describe('validateUrl', () => {
  it('accepts a well-formed URL', () => {
    expect(validateUrl('https://example.com/a/b')).toBeUndefined();
  });

  it('accepts a bare host', () => {
    expect(validateUrl('zhuanlan.zhihu.com/p/123')).toBeUndefined();
  });

  it('rejects empty input', () => {
    expect(validateUrl('')).toBe('请输入 URL');
    expect(validateUrl(undefined)).toBe('请输入 URL');
  });

  it('rejects a host with no dot', () => {
    expect(validateUrl('localhost')).toBe('这看起来不像一个有效的网址');
  });
});

describe('guessResourceType', () => {
  it('recognises the video hosts the fetcher supports', () => {
    expect(guessResourceType('https://www.youtube.com/watch?v=abc')).toBe('video');
    expect(guessResourceType('https://youtu.be/abc')).toBe('video');
    expect(guessResourceType('https://www.bilibili.com/video/BV1xx')).toBe('video');
  });

  it('treats everything else as text', () => {
    expect(guessResourceType('https://nodejs.org/en/about')).toBe('text');
    expect(guessResourceType('https://www.bilibili.com/opus/123')).toBe('text');
  });
});

describe('buildProviderChoices', () => {
  const providers: Record<string, ProviderConfig> = {
    claude: { apiKey: 'k', model: 'claude-sonnet-4-6' },
    deepseek: { apiKey: 'k', model: 'deepseek-chat' },
    ollama: { model: 'llama3' },
  };

  it('lists the default provider first so Enter picks it', () => {
    const choices = buildProviderChoices(providers, 'deepseek');
    expect(choices[0].value).toBe('deepseek');
    expect(choices.map((c) => c.value)).toEqual(['deepseek', 'claude', 'ollama']);
  });

  it('shows each provider model as a hint', () => {
    const choices = buildProviderChoices(providers, 'claude');
    expect(choices.find((c) => c.value === 'ollama')?.hint).toBe('llama3');
  });

  it('marks the config default in its hint', () => {
    const choices = buildProviderChoices(providers, 'claude');
    expect(choices.find((c) => c.value === 'claude')?.hint).toContain('配置默认');
  });

  it('returns an empty list when no providers are configured', () => {
    expect(buildProviderChoices({}, 'claude')).toEqual([]);
  });
});

describe('maskSecret', () => {
  it('leaves ${ENV_VAR} references readable', () => {
    expect(maskSecret('${DEEPSEEK_API_KEY}')).toBe('${DEEPSEEK_API_KEY}');
  });

  it('masks a literal key down to its ends', () => {
    expect(maskSecret('sk-abcdefghijklmnop')).toBe('sk-a…mnop');
  });

  it('fully masks short values', () => {
    expect(maskSecret('short')).toBe('********');
  });

  it('reports missing values', () => {
    expect(maskSecret(undefined)).toBe('（未设置）');
    expect(maskSecret('')).toBe('（未设置）');
  });
});

describe('titleFromFile', () => {
  it('drops the directory and extension', () => {
    expect(titleFromFile('/tmp/notes/article.md')).toBe('article');
    expect(titleFromFile('./a.b.txt')).toBe('a.b');
  });
});

describe('truncate', () => {
  it('leaves short text alone', () => {
    expect(truncate('short', 10)).toBe('short');
  });

  it('adds an ellipsis when over the limit', () => {
    expect(truncate('abcdefghij', 5)).toBe('abcd…');
  });
});
