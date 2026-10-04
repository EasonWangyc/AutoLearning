import path from 'node:path';
import { isVideoUrl } from '../fetcher/video-fetcher';
import type { ProviderConfig } from '../config';

export type InputKind = 'url' | 'file' | 'stdin';

/** Turn a resolved answer into the CLI's `--type` values. */
export function guessResourceType(url: string): 'video' | 'text' {
  return isVideoUrl(url) ? 'video' : 'text';
}

/**
 * Accept anything that parses as an http(s) URL. Users paste bare hosts
 * (`example.com/post`) often enough that it is worth prepending the scheme
 * rather than rejecting them.
 */
export function normalizeUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) throw new Error('URL 不能为空');
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function validateUrl(input: string | undefined): string | undefined {
  if (!input?.trim()) return '请输入 URL';
  try {
    const url = new URL(normalizeUrl(input));
    if (!url.hostname.includes('.')) return '这看起来不像一个有效的网址';
  } catch {
    return '这看起来不像一个有效的网址';
  }
  return undefined;
}

export interface ProviderChoice {
  value: string;
  label: string;
  hint?: string;
}

/**
 * One option per configured provider, labelled with the model it will use.
 * `defaultProvider` is listed first so the Enter key picks what the config says.
 */
export function buildProviderChoices(
  providers: Record<string, ProviderConfig>,
  defaultProvider: string,
): ProviderChoice[] {
  const names = Object.keys(providers);
  const ordered = [
    ...names.filter((n) => n === defaultProvider),
    ...names.filter((n) => n !== defaultProvider),
  ];

  return ordered.map((name) => {
    const cfg = providers[name];
    const hint = name === defaultProvider ? `${cfg.model} · 配置默认` : cfg.model;
    return { value: name, label: name, hint };
  });
}

/** Suggest a filename-safe title from a local path. */
export function titleFromFile(filePath: string): string {
  return path.basename(filePath, path.extname(filePath));
}

/** Shorten a long source label so it fits inside a clack note box. */
export function truncate(text: string, max = 72): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/**
 * Render an API key for display without leaking it.
 *
 * A `${ENV_VAR}` reference is shown verbatim — it is not a secret, and hiding
 * it would make the field impossible to recognise when editing.
 */
export function maskSecret(value: unknown): string {
  if (typeof value !== 'string' || !value) return '（未设置）';
  if (value.startsWith('${')) return value;
  if (value.length <= 8) return '********';
  return `${value.slice(0, 4)}…${value.slice(-4)}`;
}

export const WHISPER_SIZES = ['tiny', 'base', 'small', 'medium', 'large'] as const;

export const WHISPER_SIZE_HINTS: Record<string, string> = {
  tiny: '最快，准确度最低',
  base: '默认，速度与准确度均衡',
  small: '更准，需要更多内存',
  medium: '很准，较慢',
  large: '最准，最慢，需要大内存',
};
