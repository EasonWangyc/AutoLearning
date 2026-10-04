import fs from 'node:fs';
import { getFetcher } from './fetcher/index';
import { getGenerator } from './generator/index';
import { parseContent } from './parser/index';
import { writeNote } from './output/index';
import { sanitize } from './output/sanitize';
import { LocalWhisperTranscriber } from './transcriber/local-whisper';
import { optimizeTranscript, fixTitle } from './optimizer/index';
import { createStderrProgress, type Progress } from './progress';
import type { Config } from './config';
import type { NoteOutput } from './types';

export interface PipelineOptions {
  providerOverride?: string;
  cookiesFromBrowser?: string;
  /** Where phase/success/warn events go. Defaults to plain stderr lines. */
  progress?: Progress;
}

/**
 * Run the optimizer + title fixer when the provider has credentials.
 * Both steps fall back to the raw input on failure rather than aborting.
 */
async function cleanUp(
  title: string,
  rawText: string,
  providerConfig: { apiKey?: string; baseUrl?: string; model: string } | undefined,
  progress: Progress,
): Promise<{ title: string; rawText: string }> {
  if (!providerConfig?.apiKey && !providerConfig?.baseUrl) {
    return { title, rawText };
  }

  progress.phase('Optimizing content...');
  try {
    rawText = await optimizeTranscript(rawText, providerConfig);
  } catch (err) {
    progress.warn(`Optimization failed, using raw text: ${(err as Error).message}`);
  }

  try {
    const fixedTitle = await fixTitle(rawText, title, providerConfig);
    if (fixedTitle !== title) {
      progress.success(`Title updated: "${title}" → "${fixedTitle}"`);
      title = fixedTitle;
    }
  } catch (err) {
    progress.warn(`Title fix failed, keeping original: ${(err as Error).message}`);
  }

  return { title, rawText };
}

/** Parse → generate → sanitize → write. Shared tail of both entry points. */
async function generateNote(
  title: string,
  rawText: string,
  sourceLabel: string,
  type: 'text' | 'video',
  provider: string,
  config: Config,
  progress: Progress,
): Promise<NoteOutput> {
  const content = parseContent({ title, rawText }, sourceLabel, type);
  progress.phase(`Generating notes with ${provider}...`);

  const generator = getGenerator(provider, config.providers);
  const markdown = sanitize(await generator.generate(content));

  const outDir = config.output.directory;
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const result = writeNote(markdown, content.title, outDir, config.output.filenameTemplate);
  progress.success(`Note written to ${result.filePath}`);
  return result;
}

/** Run pipeline from raw text input (file, stdin, pasted text) — bypasses the fetcher. */
export async function runPipelineFromText(
  text: string,
  title: string,
  sourceLabel: string,
  config: Config,
  options?: PipelineOptions,
): Promise<NoteOutput> {
  const progress = options?.progress ?? createStderrProgress();
  const provider = options?.providerOverride ?? config.provider.default;

  const cleaned = await cleanUp(title, text, config.providers[provider], progress);
  return generateNote(cleaned.title, cleaned.rawText, sourceLabel, 'text', provider, config, progress);
}

export async function runPipeline(
  url: string,
  type: 'text' | 'video' | 'auto',
  config: Config,
  options?: PipelineOptions,
): Promise<NoteOutput> {
  const progress = options?.progress ?? createStderrProgress();
  const provider = options?.providerOverride ?? config.provider.default;

  // Local whisper is the video fallback when no subtitles exist.
  const transcriberInstance = new LocalWhisperTranscriber({
    modelSize: config.localWhisper?.modelSize ?? 'base',
    pythonPath: config.localWhisper?.pythonPath,
  });

  // 1. Fetch
  const fetcher = getFetcher(
    url,
    type,
    { transcriber: 'whisper', cookiesFromBrowser: options?.cookiesFromBrowser },
    transcriberInstance,
  );
  progress.phase(`Fetching ${url} with ${fetcher.constructor.name}...`);
  const raw = await fetcher.fetch(url);

  const resolvedType: 'text' | 'video' =
    type === 'auto' ? (fetcher.constructor.name === 'VideoFetcher' ? 'video' : 'text') : type;

  // 2. Optimize raw content, then fix generic titles (e.g. "来看看这段对话").
  const cleaned = await cleanUp(raw.title, raw.rawText, config.providers[provider], progress);

  // 3. Generate + write
  return generateNote(cleaned.title, cleaned.rawText, url, resolvedType, provider, config, progress);
}
