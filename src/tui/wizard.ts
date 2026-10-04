import fs from 'node:fs';
import path from 'node:path';
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  multiline,
  note,
  outro,
  select,
  text,
} from '@clack/prompts';
import { runPipeline, runPipelineFromText } from '../pipeline';
import { convertToPdf } from '../output/convert';
import { convertToHtml } from '../output/html';
import { exportPathFor, type OutputFormat } from '../output/format';
import { loadHistory, recordHistory } from '../history';
import { createClackProgress } from './progress';
import {
  buildProviderChoices,
  guessResourceType,
  normalizeUrl,
  titleFromFile,
  truncate,
  validateUrl,
  type InputKind,
} from './choices';
import type { Config } from '../config';

const BROWSERS = ['firefox', 'chrome', 'edge', 'brave', 'safari', 'chromium'];

const FORMAT_OPTIONS: { value: OutputFormat; label: string; hint: string }[] = [
  { value: 'md', label: 'Markdown', hint: '默认' },
  { value: 'html', label: 'HTML', hint: '浏览器打开，Mermaid / LaTeX 直接渲染' },
  { value: 'pdf', label: 'PDF', hint: '需要 pandoc + xelatex' },
];

/**
 * Unwrap a clack prompt, treating Ctrl+C / Esc as a clean exit.
 *
 * The `Exclude<…, symbol>` in the return type is what strips clack's
 * `CANCEL_SYMBOL` back out of the inferred result, so callers get a plain
 * `string` / `string[]` instead of having to cast at every site.
 */
async function ask<T>(prompt: Promise<T | symbol>): Promise<Exclude<T, symbol>> {
  const value = await prompt;
  if (isCancel(value)) {
    cancel('已取消');
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

async function askInputKind(): Promise<InputKind> {
  return ask(
    select({
      message: '从哪里学习？',
      options: [
        { value: 'url', label: '🔗  网址', hint: '网页 / 博客 / 视频' },
        { value: 'file', label: '📄  本地文件', hint: '.md / .txt / .html' },
        { value: 'stdin', label: '📋  粘贴文本', hint: '直接把内容粘进来' },
      ],
    }),
  ) as Promise<InputKind>;
}

async function askCookies(): Promise<string | undefined> {
  const needsLogin = await ask(
    confirm({ message: '这个页面需要登录吗？（会读取浏览器 cookie）', initialValue: false }),
  );
  if (!needsLogin) return undefined;
  return ask(
    select({
      message: '从哪个浏览器读取 cookie？',
      options: BROWSERS.map((b) => ({ value: b, label: b })),
    }),
  ) as Promise<string>;
}

/**
 * Interactive "make me a note" flow: pick a source, pick a model, run the
 * pipeline. Returns the notes file path, or `undefined` if the user backed out
 * of a run (e.g. declined to regenerate something already in history).
 */
export async function runNoteWizard(config: Config): Promise<string | undefined> {
  intro('AutoLearning · 生成学习笔记');

  const kind = await askInputKind();

  // ---- Source ----------------------------------------------------------
  let url: string | undefined;
  let rawText: string | undefined;
  let title: string | undefined;
  let sourceLabel: string | undefined;
  let resolvedType: 'text' | 'video' | 'auto' = 'auto';
  let cookiesFromBrowser: string | undefined;

  if (kind === 'url') {
    url = normalizeUrl(await ask(text({ message: '粘贴网址', placeholder: 'https://…', validate: validateUrl })));

    const guessed = guessResourceType(url);
    const type = await ask(
      select({
        message: '资源类型',
        options: [
          { value: 'auto', label: '自动识别', hint: `将按「${guessed === 'video' ? '视频' : '文本'}」处理` },
          { value: 'text', label: '文本', hint: '网页 / 博客 / 专栏' },
          { value: 'video', label: '视频', hint: 'YouTube / Bilibili' },
        ],
      }),
    );
    resolvedType = type as 'text' | 'video' | 'auto';

    // Ask for every URL kind: Bilibili needs cookies for video, login-walled
    // sites (Zhihu, …) need them for text, and `auto` can resolve to either —
    // skipping the question there left Bilibili failing with a 412 and no way
    // to supply cookies without restarting with flags.
    cookiesFromBrowser = await askCookies();

    const history = loadHistory();
    const seen = history[url];
    if (seen) {
      const again = await ask(
        confirm({
          message: `这个网址在 ${seen.date} 已经生成过笔记（${path.basename(seen.file)}），要重新生成吗？`,
          initialValue: false,
        }),
      );
      if (!again) {
        outro('已保留原有笔记');
        return undefined;
      }
    }
  } else if (kind === 'file') {
    const filePath = await ask(
      text({
        message: '文件路径',
        placeholder: './article.md',
        validate: (v) => {
          if (!v?.trim()) return '请输入文件路径';
          return fs.existsSync(path.resolve(v.trim())) ? undefined : '文件不存在';
        },
      }),
    );
    const absolute = path.resolve(filePath as string);
    rawText = fs.readFileSync(absolute, 'utf-8');
    sourceLabel = `file:${absolute}`;
    title = await ask(
      text({ message: '笔记标题', initialValue: titleFromFile(absolute) }),
    ) as string;
  } else {
    // clack's multiline submits on a double Enter (or the [submit] tab stop).
    rawText = await ask(
      multiline({
        message: '粘贴内容（连按两次 Enter 提交）',
        placeholder: '在这里粘贴文章正文…',
        validate: (v) => (v?.trim() ? undefined : '内容不能为空'),
      }),
    );

    const askedTitle = await ask(
      text({ message: '笔记标题', placeholder: 'User Input', defaultValue: 'User Input' }),
    );
    title = askedTitle.trim() || 'User Input';
    sourceLabel = 'stdin';
  }

  if (rawText !== undefined && !rawText.trim()) {
    log.error('内容为空，已取消');
    process.exit(1);
  }

  // ---- Model + output --------------------------------------------------
  const provider = (await ask(
    select({
      message: '使用哪个 AI 提供商？',
      options: buildProviderChoices(config.providers, config.provider.default),
    }),
  )) as string;

  const format = await ask(
    select({
      message: '输出格式',
      options: FORMAT_OPTIONS,
    }),
  );

  const outputDir = (await ask(
    text({ message: '输出目录', defaultValue: config.output.directory }),
  )) as string;
  config.output.directory = path.resolve(outputDir.trim() || config.output.directory);

  // ---- Confirm + run ---------------------------------------------------
  const chosen = config.providers[provider];
  const lines = [
    `来源     ${truncate(url ?? sourceLabel ?? '')}`,
    `标题     ${title ?? '（由 LLM 生成）'}`,
    `模型     ${provider} · ${chosen?.model ?? '?'}`,
    `输出     ${format.toUpperCase()} → ${config.output.directory}`,
  ];
  if (cookiesFromBrowser) lines.push(`Cookie   ${cookiesFromBrowser}`);

  // An unset ${ENV_VAR} expands to '', which would otherwise only surface as a
  // confusing 401 from the provider mid-run. Ollama is the one backend that
  // legitimately runs without a key.
  if (provider !== 'ollama' && !chosen?.apiKey) {
    lines.push(
      '',
      `⚠  ${provider} 没有可用的 api_key`,
      '   先跑 autolearn config 补上，或改用 ollama',
    );
  }

  note(lines.join('\n'), '即将开始');
  const go = await ask(confirm({ message: '开始生成？', initialValue: true }));
  if (!go) {
    outro('已取消');
    return undefined;
  }

  const progress = createClackProgress();
  let filePath: string;

  try {
    if (url) {
      const result = await runPipeline(url, resolvedType, config, {
        providerOverride: provider,
        cookiesFromBrowser,
        progress,
      });
      recordHistory(url, result.filePath);
      filePath = result.filePath;
    } else {
      const result = await runPipelineFromText(rawText!, title!, sourceLabel!, config, {
        providerOverride: provider,
        progress,
      });
      filePath = result.filePath;
    }
  } catch (err) {
    log.error((err as Error).message);
    outro('生成失败');
    throw err;
  }

  // Markdown is always written; html and pdf are exports beside it.
  if (format !== 'md') {
    const exportPath = exportPathFor(filePath, format);
    try {
      if (format === 'html') convertToHtml(filePath, exportPath);
      else convertToPdf(filePath, exportPath);
      filePath = exportPath;
    } catch (err) {
      log.error(`${format.toUpperCase()} 导出失败：${(err as Error).message}`);
    }
  }

  outro(`完成！笔记已保存到\n${filePath}`);
  return filePath;
}
