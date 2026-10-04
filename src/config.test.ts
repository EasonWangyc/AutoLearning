import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CONFIG_TEMPLATE, loadConfig, loadRawConfig, saveRawConfig } from './config';
import { parse } from 'smol-toml';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const configDir = path.join(os.tmpdir(), 'autolearning-test-' + Date.now());
const configPath = path.join(configDir, 'config.toml');

beforeEach(() => {
  fs.mkdirSync(configDir, { recursive: true });
});

afterEach(() => {
  fs.rmSync(configDir, { recursive: true, force: true });
  delete process.env.TEST_KEY;
});

describe('loadConfig', () => {
  it('loads a valid config file', () => {
    fs.writeFileSync(configPath, `
[provider]
default = "claude"

[providers.claude]
api_key = "sk-test"
model = "claude-sonnet-4-6"

[output]
directory = "./notes"
filename_template = "{title}-{date}.md"
`);
    const config = loadConfig(configPath);
    expect(config.provider.default).toBe('claude');
    expect(config.providers.claude.apiKey).toBe('sk-test');
  });

  it('expands ${ENV_VAR} references in config values', () => {
    process.env.TEST_KEY = 'env-value';
    fs.writeFileSync(configPath, `
[provider]
default = "openai"

[providers.openai]
api_key = "\${TEST_KEY}"
model = "gpt-4o"

[output]
directory = "./notes"
filename_template = "{title}-{date}.md"
`);
    const config = loadConfig(configPath);
    expect(config.providers.openai?.apiKey).toBe('env-value');
  });

  it('throws when config file does not exist', () => {
    expect(() => loadConfig('/nonexistent/path/config.toml')).toThrow('Config file not found');
  });

  it('applies defaults when provider.default and output fields are missing', () => {
    fs.writeFileSync(configPath, `
[providers.claude]
model = "claude-sonnet-4-6"
`);
    const config = loadConfig(configPath);
    expect(config.provider.default).toBe('claude');
    expect(config.output.directory).toBe('./notes');
    expect(config.output.filenameTemplate).toBe('{title}-{date}.md');
  });

  it('loads optional [local_whisper] section', () => {
    fs.writeFileSync(configPath, `
[provider]
default = "deepseek"

[providers.deepseek]
api_key = "sk-test"
model = "deepseek-chat"

[output]
directory = "./notes"
filename_template = "{title}-{date}.md"

[local_whisper]
model_size = "small"
`);
    const config = loadConfig(configPath);
    expect(config.localWhisper?.modelSize).toBe('small');
  });

  it('defaults model_size to base when not specified', () => {
    fs.writeFileSync(configPath, `
[provider]
default = "deepseek"

[providers.deepseek]
api_key = "sk-test"
model = "deepseek-chat"

[output]
directory = "./notes"
filename_template = "{title}-{date}.md"
`);
    const config = loadConfig(configPath);
    expect(config.localWhisper?.modelSize).toBe('base');
  });
});

describe('loadRawConfig / saveRawConfig', () => {
  it('returns an empty object when the file does not exist', () => {
    expect(loadRawConfig(path.join(configDir, 'missing.toml'))).toEqual({});
  });

  it('does not expand ${ENV_VAR} — the wizard must never read real secrets', () => {
    process.env.TEST_KEY = 'actual-secret-value';
    fs.writeFileSync(configPath, `
[providers.deepseek]
api_key = "\${TEST_KEY}"
model = "deepseek-chat"
`);
    const raw = loadRawConfig(configPath);
    const providers = raw.providers as Record<string, Record<string, string>>;
    expect(providers.deepseek.api_key).toBe('${TEST_KEY}');
  });

  it('round-trips placeholders through save without substituting them', () => {
    process.env.TEST_KEY = 'actual-secret-value';
    fs.writeFileSync(configPath, `
[provider]
default = "deepseek"

[providers.deepseek]
api_key = "\${TEST_KEY}"
model = "deepseek-chat"
`);

    const raw = loadRawConfig(configPath);
    saveRawConfig(raw, configPath);

    const onDisk = fs.readFileSync(configPath, 'utf-8');
    expect(onDisk).toContain('${TEST_KEY}');
    expect(onDisk).not.toContain('actual-secret-value');
  });

  it('creates parent directories when saving to a fresh path', () => {
    const nested = path.join(configDir, 'a', 'b', 'config.toml');
    saveRawConfig({ provider: { default: 'ollama' } }, nested);
    expect(fs.existsSync(nested)).toBe(true);
  });

  it('ships a template that parses and loads into a usable Config', () => {
    const templatePath = path.join(configDir, 'template.toml');
    fs.writeFileSync(templatePath, CONFIG_TEMPLATE);

    const raw = loadRawConfig(templatePath);
    expect(parse(CONFIG_TEMPLATE)).toMatchObject({ provider: { default: 'deepseek' } });

    // The template references ${DEEPSEEK_API_KEY}, which is unset in tests —
    // it must still load rather than throw.
    const config = loadConfig(templatePath);
    expect(config.providers.deepseek?.model).toBe('deepseek-chat');
    expect(config.output.filenameTemplate).toBe('{title}-{date}.md');
    expect(raw.local_whisper).toMatchObject({ model_size: 'base' });
  });
});
