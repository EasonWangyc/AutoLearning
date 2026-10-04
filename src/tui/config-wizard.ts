import { parse } from 'smol-toml';
import {
  cancel,
  confirm,
  intro,
  isCancel,
  log,
  note,
  outro,
  password,
  select,
  text,
} from '@clack/prompts';
import { CONFIG_TEMPLATE, loadRawConfig, resolveConfigPath, saveRawConfig } from '../config';
import { maskSecret, WHISPER_SIZES, WHISPER_SIZE_HINTS } from './choices';

/**
 * Unwrap a clack prompt, treating Ctrl+C / Esc as a clean exit.
 *
 * The `Exclude<…, symbol>` in the return type is what strips clack's
 * `CANCEL_SYMBOL` back out of the inferred result.
 */
async function ask<T>(prompt: Promise<T | symbol>): Promise<Exclude<T, symbol>> {
  const value = await prompt;
  if (isCancel(value)) {
    cancel('已取消');
    process.exit(0);
  }
  return value as Exclude<T, symbol>;
}

type RawConfig = Record<string, unknown>;

/** Get (creating if needed) a nested table inside the raw TOML document. */
function section(parent: RawConfig, key: string): RawConfig {
  const value = parent[key];
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as RawConfig;
  }
  const created: RawConfig = {};
  parent[key] = created;
  return created;
}

function providerNames(raw: RawConfig): string[] {
  const providers = raw.providers;
  return providers && typeof providers === 'object' ? Object.keys(providers) : [];
}

const BACK = '__back__';
const ADD = '__add__';

async function editDefaultProvider(raw: RawConfig): Promise<void> {
  const names = providerNames(raw);
  if (names.length === 0) {
    log.warn('还没有配置任何提供商，请先到「提供商配置」里新增一个。');
    return;
  }
  const current = String(section(raw, 'provider').default ?? names[0]);
  const chosen = await ask(
    select({
      message: '把哪个提供商设为默认？',
      initialValue: current,
      options: names.map((n) => ({
        value: n,
        label: n,
        hint: n === current ? '当前默认' : undefined,
      })),
    }),
  );
  section(raw, 'provider').default = chosen;
}

/** Prompt for a field, keeping the old value when the user submits nothing. */
async function editField(
  target: RawConfig,
  field: string,
  message: string,
  opts: { secret?: boolean; placeholder?: string } = {},
): Promise<void> {
  const current = target[field];
  const currentStr = typeof current === 'string' ? current : '';

  const next = opts.secret
    ? await ask(
        password({
          message,
          mask: '*',
          // A placeholder is left untouched unless the user actually types.
          validate: () => undefined,
        }),
      )
    : await ask(
        text({
          message,
          placeholder: opts.placeholder,
          defaultValue: currentStr || undefined,
        }),
      );

  const value = String(next ?? '').trim();
  if (value) {
    target[field] = value;
    log.success(`${field} 已更新`);
  } else {
    log.info(`${field} 保持为 ${maskSecret(current)}`);
  }
}

async function editProvider(raw: RawConfig): Promise<void> {
  const providers = section(raw, 'providers');
  const names = Object.keys(providers);

  const picked = await ask(
    select({
      message: '选择提供商',
      options: [
        ...names.map((n) => ({
          value: n,
          label: n,
          hint: String((providers[n] as RawConfig)?.model ?? ''),
        })),
        { value: ADD, label: '＋ 新增提供商' },
      ],
    }),
  );

  let name = String(picked);
  if (name === ADD) {
    name = String(
      await ask(
        text({
          message: '提供商名称',
          placeholder: 'gemini',
          validate: (v) => (v?.trim() ? undefined : '请输入名称'),
        }),
      ),
    ).trim();
  }

  const target = section(providers, name);

  for (;;) {
    const field = await ask(
      select({
        message: `${name} 要修改哪一项？`,
        options: [
          { value: 'model', label: 'model', hint: String(target.model ?? '（未设置）') },
          { value: 'api_key', label: 'api_key', hint: maskSecret(target.api_key) },
          { value: 'base_url', label: 'base_url', hint: String(target.base_url ?? '（未设置）') },
          { value: BACK, label: '← 返回' },
        ],
      }),
    );

    if (field === BACK) return;

    if (field === 'model') {
      await editField(target, 'model', `${name} 使用的模型`, { placeholder: 'gpt-4o' });
    } else if (field === 'api_key') {
      await editField(target, 'api_key', `${name} 的 API Key（支持 \${ENV_VAR}）`, {
        placeholder: '${MY_API_KEY}',
      });
    } else {
      await editField(target, 'base_url', `${name} 的 Base URL`, {
        placeholder: 'https://api.example.com/v1',
      });
    }
  }
}

async function editOutput(raw: RawConfig): Promise<void> {
  const output = section(raw, 'output');

  const dir = await ask(
    text({
      message: '笔记输出目录',
      placeholder: './notes',
      defaultValue: String(output.directory ?? './notes'),
    }),
  );
  output.directory = String(dir).trim() || './notes';

  const template = await ask(
    text({
      message: '文件名模板',
      placeholder: '{title}-{date}.md',
      defaultValue: String(output.filename_template ?? '{title}-{date}.md'),
    }),
  );
  output.filename_template = String(template).trim() || '{title}-{date}.md';
}

async function editWhisper(raw: RawConfig): Promise<void> {
  const whisper = section(raw, 'local_whisper');

  const size = await ask(
    select({
      message: 'Whisper 模型大小（越大越准，也越慢）',
      initialValue: String(whisper.model_size ?? 'base'),
      options: WHISPER_SIZES.map((s) => ({ value: s, label: s, hint: WHISPER_SIZE_HINTS[s] })),
    }),
  );
  whisper.model_size = size;

  const pythonPath = await ask(
    text({
      message: 'Python 解释器路径（留空则使用 python3）',
      placeholder: '/path/to/venv/bin/python3',
      defaultValue: String(whisper.python_path ?? ''),
    }),
  );
  const pythonPathStr = String(pythonPath).trim();
  if (pythonPathStr) {
    whisper.python_path = pythonPathStr;
  } else {
    delete whisper.python_path;
  }
}

/**
 * Edit `~/.autolearning/config.toml` interactively.
 *
 * Reads and writes through the *raw* TOML (never `loadConfig`) so that
 * `${ENV_VAR}` placeholders survive a round-trip. Resolving them first would
 * bake the user's real API keys into the file in plaintext.
 *
 * Deliberately takes no `Config`: it has to work on a first run, before any
 * config file exists.
 */
export async function runConfigWizard(options: { configPath?: string } = {}): Promise<void> {
  const configPath = resolveConfigPath(options.configPath);

  intro(`AutoLearning 配置\n${configPath}`);

  if (Object.keys(loadRawConfig(options.configPath)).length === 0) {
    log.info('还没有配置文件，将从模板创建一个。');
    const create = await ask(confirm({ message: '现在创建？', initialValue: true }));
    if (!create) {
      outro('已取消');
      return;
    }
    saveRawConfig(parse(CONFIG_TEMPLATE) as RawConfig, options.configPath);
    log.success(`已创建 ${configPath}`);
  }

  for (;;) {
    const raw = loadRawConfig(options.configPath);
    const names = providerNames(raw);
    const output = (raw.output ?? {}) as RawConfig;
    const whisper = (raw.local_whisper ?? {}) as RawConfig;

    const action = await ask(
      select({
        message: '要修改什么？',
        options: [
          {
            value: 'default',
            label: '默认 AI 提供商',
            hint: String((raw.provider as RawConfig)?.default ?? '未设置'),
          },
          { value: 'provider', label: '提供商配置', hint: names.join(', ') || '（空）' },
          {
            value: 'output',
            label: '输出设置',
            hint: `${String(output.directory ?? './notes')} · ${String(output.filename_template ?? '{title}-{date}.md')}`,
          },
          {
            value: 'whisper',
            label: '本地 Whisper',
            hint: `model_size = ${String(whisper.model_size ?? 'base')}`,
          },
          { value: 'show', label: '查看完整配置' },
          { value: 'exit', label: '保存并退出' },
        ],
      }),
    );

    if (action === 'exit') {
      outro(`配置已保存到\n${configPath}`);
      return;
    }

    if (action === 'show') {
      note(JSON.stringify(raw, null, 2), '当前配置（原始 TOML，未展开环境变量）');
      continue;
    }

    if (action === 'default') await editDefaultProvider(raw);
    else if (action === 'provider') await editProvider(raw);
    else if (action === 'output') await editOutput(raw);
    else if (action === 'whisper') await editWhisper(raw);

    saveRawConfig(raw, options.configPath);
  }
}
