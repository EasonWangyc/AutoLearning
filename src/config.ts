import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { parse, stringify } from 'smol-toml';

export interface ProviderConfig {
  apiKey?: string;
  model: string;
  baseUrl?: string;
}

export interface Config {
  provider: { default: string };
  providers: Record<string, ProviderConfig>;
  output: { directory: string; filenameTemplate: string };
  whisper?: { apiKey?: string; model: string };
  alibaba?: {
    accessKeyId?: string;
    accessKeySecret?: string;
    appKey?: string;
  };
  localWhisper?: { modelSize: string; pythonPath?: string };
}

function expandEnv(raw: string): string {
  return raw.replace(/\$\{(\w+)\}/g, (_, name) => process.env[name] ?? '');
}

/** Resolve a value from the raw record, trying camelCase first then snake_case, then expand env vars. */
function resolveExpanded(raw: Record<string, unknown>, camelKey: string, snakeKey: string): string {
  const v = raw[camelKey] ?? raw[snakeKey];
  return expandEnv(String(v ?? ''));
}

function normalizeProvider(raw: Record<string, unknown>): ProviderConfig {
  const model = resolveExpanded(raw, 'model', 'model');
  if (!model) throw new Error('Provider must have a "model" field');

  return {
    apiKey: resolveExpanded(raw, 'apiKey', 'api_key') || undefined,
    model,
    baseUrl: resolveExpanded(raw, 'baseUrl', 'base_url') || undefined,
  };
}

/** Starter config written by the interactive wizard on first run. */
export const CONFIG_TEMPLATE = `[provider]
default = "deepseek"

[providers.deepseek]
api_key = "\${DEEPSEEK_API_KEY}"
model = "deepseek-chat"
base_url = "https://api.deepseek.com/v1"

[providers.ollama]
base_url = "http://localhost:11434"
model = "llama3"

[output]
directory = "./notes"
filename_template = "{title}-{date}.md"

[local_whisper]
model_size = "base"
`;

export function resolveConfigPath(configPath?: string): string {
  return configPath ?? path.join(os.homedir(), '.autolearning', 'config.toml');
}

/**
 * Read the config file as raw TOML — no `${ENV_VAR}` expansion.
 *
 * The wizard edits through this rather than `loadConfig` so that writing the
 * file back preserves placeholders instead of substituting the real secrets
 * from the environment into a plaintext file on disk. Returns `{}` when the
 * file does not exist yet, so callers can treat "no config" as an empty draft.
 */
export function loadRawConfig(configPath?: string): Record<string, unknown> {
  const resolvedPath = resolveConfigPath(configPath);
  if (!fs.existsSync(resolvedPath)) return {};
  return parse(fs.readFileSync(resolvedPath, 'utf-8')) as Record<string, unknown>;
}

export function saveRawConfig(raw: Record<string, unknown>, configPath?: string): string {
  const resolvedPath = resolveConfigPath(configPath);
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  fs.writeFileSync(resolvedPath, stringify(raw), 'utf-8');
  return resolvedPath;
}

export function loadConfig(configPath?: string): Config {
  const resolvedPath = resolveConfigPath(configPath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Config file not found: ${resolvedPath}`);
  }
  const raw = fs.readFileSync(resolvedPath, 'utf-8');
  const parsed = parse(raw) as Record<string, unknown>;

  // Provider section
  const providerSection = (parsed.provider ?? {}) as Record<string, unknown>;

  // Output section — expand env vars in directory and filenameTemplate
  const rawOutput = (parsed.output ?? {}) as Record<string, unknown>;
  const outputDir = rawOutput.directory ?? './notes';
  const outputTemplate = rawOutput.filenameTemplate ?? rawOutput.filename_template ?? '{title}-{date}.md';

  const cfg: Config = {
    provider: { default: String(providerSection.default ?? 'claude') },
    providers: {},
    output: {
      directory: expandEnv(String(outputDir)),
      filenameTemplate: expandEnv(String(outputTemplate)),
    },
  };

  // Normalize providers
  const providers = (parsed.providers ?? {}) as Record<string, Record<string, unknown>>;
  for (const [name, providerRaw] of Object.entries(providers)) {
    cfg.providers[name] = normalizeProvider(providerRaw);
  }

  // Optional sections
  if (parsed.whisper) {
    const w = parsed.whisper as Record<string, unknown>;
    const wModel = resolveExpanded(w, 'model', 'model');
    if (!wModel) throw new Error('Whisper config must have a "model" field');
    cfg.whisper = {
      apiKey: resolveExpanded(w, 'apiKey', 'api_key') || undefined,
      model: wModel,
    };
  }
  if (parsed.alibaba) {
    const a = parsed.alibaba as Record<string, unknown>;
    cfg.alibaba = {
      accessKeyId: resolveExpanded(a, 'accessKeyId', 'access_key_id') || undefined,
      accessKeySecret: resolveExpanded(a, 'accessKeySecret', 'access_key_secret') || undefined,
      appKey: resolveExpanded(a, 'appKey', 'app_key') || undefined,
    };
  }

  // Parse local_whisper section
  if (parsed.local_whisper) {
    const lw = parsed.local_whisper as Record<string, unknown>;
    cfg.localWhisper = {
      modelSize: (lw.model_size as string) ?? (lw.modelSize as string) ?? 'base',
      pythonPath: resolveExpanded(lw, 'pythonPath', 'python_path') || undefined,
    };
  } else {
    cfg.localWhisper = { modelSize: 'base' };
  }

  return cfg;
}
