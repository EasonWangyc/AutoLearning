#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import { CONFIG_TEMPLATE, loadConfig, resolveConfigPath, saveRawConfig } from './config';
import { parse } from 'smol-toml';
import { runPipeline, runPipelineFromText } from './pipeline';
import { convertToPdf } from './output/convert';
import { convertToHtml } from './output/html';
import { OUTPUT_FORMATS, exportPathFor, parseFormat } from './output/format';
import { loadHistory, recordHistory } from './history';
import type { NoteOutput } from './types';

/**
 * The TUI is imported lazily everywhere. `@clack/prompts` and its renderer are
 * only needed for the interactive paths, and a plain `autolearn <url>` run
 * shouldn't pay their startup cost.
 */
const loadTui = () => import('./tui');

const program = new Command();

program
  .name('autolearn')
  .description('Generate structured Markdown study notes from URLs or local files')
  .argument('[url]', 'URL of the resource to learn from (optional if using --file or --stdin)')
  .option('-p, --provider <name>', 'AI provider')
  .option('-o, --output <dir>', 'Output directory for notes')
  .option('-t, --type <type>', 'Resource type: text, video, or auto', 'auto')
  .option('-c, --config <path>', 'Path to config file')
  .option('-v, --verbose', 'Enable verbose logging')
  .option('--cookies-from-browser <browser>', 'Browser cookies for sites that require login (e.g. firefox, chrome)')
  .option('--file <path>', 'Read content from a local file (.md, .txt, etc.)')
  .option('--stdin', 'Read content from standard input')
  .option('--title <title>', 'Title for the notes (used with --file or --stdin)')
  .option('--format <fmt>', `Output format: ${OUTPUT_FORMATS.join(', ')}`, 'md')
  .option('--force', 'Force re-processing even if URL was already processed')
  .action(async (url, options) => {
    try {
      parseFormat(options.format); // fail fast, before doing any work

      // No arguments at all on a terminal: open the interactive wizard.
      if (!url && !options.file && !options.stdin) {
        const { isInteractive } = await loadTui();
        if (isInteractive()) {
          await runWizardOrCreateConfig(options.config);
          return;
        }
      }

      const config = loadConfig(options.config);

      if (options.output) {
        config.output.directory = options.output;
      }

      // --- Text input (file / stdin) ---
      if (options.file || options.stdin) {
        let text: string;
        let title: string;
        let sourceLabel: string;

        if (options.stdin) {
          text = await readStdin();
          title = options.title ?? 'User Input';
          sourceLabel = 'stdin';
        } else {
          const filePath = path.resolve(options.file);
          if (!fs.existsSync(filePath)) {
            throw new Error(`File not found: ${filePath}`);
          }
          text = fs.readFileSync(filePath, 'utf-8');
          title = options.title ?? path.basename(filePath, path.extname(filePath));
          sourceLabel = `file:${filePath}`;
        }

        if (!text.trim()) {
          throw new Error('Input is empty');
        }

        const result = await runPipelineFromText(text, title, sourceLabel, config, {
          providerOverride: options.provider,
        });

        handleOutput(result, options);
        return;
      }

      // --- URL input (default) ---
      if (!url) {
        throw new Error('Please provide a URL, or use --file or --stdin');
      }

      // History check
      const cleanUrl = url.trim();
      const history = loadHistory();
      if (history[cleanUrl] && !options.force) {
        console.error(`Already processed on ${history[cleanUrl].date}: ${history[cleanUrl].file}`);
        console.error('Use --force to re-process.');
        return;
      }

      const result = await runPipeline(
        cleanUrl,
        options.type as 'text' | 'video' | 'auto',
        config,
        {
          providerOverride: options.provider,
          cookiesFromBrowser: options.cookiesFromBrowser,
        },
      );

      recordHistory(cleanUrl, result.filePath);
      handleOutput(result, options);
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      if (options.verbose && error instanceof Error) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

/**
 * Bare `autolearn` on a terminal. A missing config is the normal first-run
 * state, so offer to create one instead of dying on "Config file not found".
 */
async function runWizardOrCreateConfig(configPath?: string): Promise<void> {
  const resolved = resolveConfigPath(configPath);
  const { runConfigWizard, runNoteWizard } = await loadTui();

  if (!fs.existsSync(resolved)) {
    console.log(`还没有配置文件，先做一下初始化吧（${resolved}）\n`);
    await runConfigWizard({ configPath });
  }

  await runNoteWizard(loadConfig(configPath));
}

program
  .command('config')
  .description('Interactively edit ~/.autolearning/config.toml')
  .option('-c, --config <path>', 'Path to config file')
  .option('--init', 'Write a starter config without prompting')
  .action(async (_options, command: Command) => {
    try {
      // `-c/--config` is declared on the root too, and commander resolves the
      // shared flag into the root's store — optsWithGlobals() merges it back,
      // so both `autolearn -c X config` and `autolearn config -c X` work.
      const opts = command.optsWithGlobals();
      const configPath = opts.config as string | undefined;

      if (opts.init) {
        const resolved = resolveConfigPath(configPath);
        if (fs.existsSync(resolved)) {
          console.error(`Config already exists: ${resolved}`);
          process.exit(1);
        }
        saveRawConfig(parse(CONFIG_TEMPLATE) as Record<string, unknown>, configPath);
        console.log(`Created ${resolved}`);
        return;
      }

      const { isInteractive, runConfigWizard } = await loadTui();
      if (!isInteractive()) {
        console.error('The config wizard needs an interactive terminal.');
        console.error('Use `autolearn config --init` to write a starter config instead.');
        process.exit(1);
      }

      await runConfigWizard({ configPath });
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      process.exit(1);
    }
  });

/** The note is always written as Markdown; html/pdf are exports beside it. */
function handleOutput(result: NoteOutput, options: { format?: string }) {
  const format = parseFormat(options.format);
  const outputs = [result.filePath];

  if (format === 'html') {
    const htmlPath = exportPathFor(result.filePath, 'html');
    console.error('Rendering HTML...');
    convertToHtml(result.filePath, htmlPath);
    outputs.push(htmlPath);
  } else if (format === 'pdf') {
    const pdfPath = exportPathFor(result.filePath, 'pdf');
    console.error('Converting to PDF...');
    convertToPdf(result.filePath, pdfPath);
    outputs.push(pdfPath);
  }

  console.log(`\nDone! Note saved to:\n${outputs.map((p) => `  ${p}`).join('\n')}`);
}

function readStdin(): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    process.stdin.setEncoding('utf-8');
    process.stdin.on('data', (chunk: string) => chunks.push(Buffer.from(chunk)));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
    process.stdin.on('error', reject);
  });
}

program.parse();
