# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

AutoLearning 是一个 CLI 工具，根据 URL（文档、博客、视频）自动生成结构化 Markdown 学习笔记。

## 常用命令

```bash
pnpm dev                  # 开发运行（tsx）
pnpm build                # 构建（tsup）
pnpm test                 # 运行所有测试（vitest，119 个用例）
pnpm test src/tui         # 运行单个模块测试（vitest 按路径过滤）
pnpm test:watch           # 监听模式
pnpm exec tsc --noEmit    # 类型检查（提交前必跑）
node dist/cli.js --help   # 查看 CLI 帮助
```

## 架构

策略 + 管道模式。`src/pipeline.ts` 是唯一的编排点，有两个入口：`runPipeline`（URL，走 Fetcher）和 `runPipelineFromText`（文件/stdin/粘贴，跳过 Fetcher）。

```
CLI → Fetcher (策略) → Optimizer（含标题修正） → Parser → Generator (策略) → sanitize → Output
                     ↘ Transcriber (策略, 仅视频无字幕时)
```

**实际执行顺序**：`runPipeline` 是 Fetch → `cleanUp()`（LLM 清洗正文 + 修正无意义标题）→ `generateNote()`（parse → generate → sanitize → write）。Optimizer 在 Parser **之前**；README 的流程图只是省略了 Parser，顺序没有画错。两个入口共享 `cleanUp()` 和 `generateNote()`，改管道尾部逻辑只需改这两处。

- **Fetcher** (`src/fetcher/`): `getFetcher(url, type, ...)` 路由。TextFetcher 三级降级（r.jina.ai → cookie curl → Readability）；VideoFetcher 双路径（yt-dlp 字幕 → 音频 + Whisper）。`isVideoUrl()` 只认 YouTube / Bilibili 的 URL 模式，是 auto 判定的唯一依据，TUI 也复用它。`runPipeline` 再用 `fetcher.constructor.name === 'VideoFetcher'` 反推 resolvedType
- **Optimizer** (`src/optimizer/`): `optimizeTranscript()` 洗正文，`fixTitle()` 只对无意义标题（`GENERIC_TITLE_PATTERNS`）调 LLM。两者失败都降级为原文，不中断。**注意：两者都直接 `new OpenAI(...)`，不经过 `getGenerator`**——provider 选 `claude` 时，它们会拿着 Anthropic key 去请求 `api.openai.com`，必然失败（然后静默降级），所以只有 OpenAI 兼容后端（openai / deepseek；ollama 需要把 `base_url` 配成 `.../v1`）才真正有清洗和标题修正
- **Generator** (`src/generator/`): `getGenerator()` 路由。`claude` → Anthropic SDK；`openai` 和 `deepseek` 共用 OpenAIGenerator（靠 `baseUrl` 区分）；`ollama` 走 HTTP。**system prompt 只有一份**，在 `src/generator/prompt.ts` —— 三个后端曾经各自复制一份然后漂移了，不要把 prompt 再内联回 generator
- **Transcriber** (`src/transcriber/`): 只有 `local-whisper` 接进了 pipeline；`whisper.ts` / `alibaba.ts` 已实现但未接线
- **Output** (`src/output/`): `writeNote()` 处理文件名模板（要求目录已存在，pipeline 会先 `mkdir`），`sanitize()` 过滤 AI 客套话并修复畸形代码围栏（`repairOrphanedFenceTag()`）。导出有三条路：`format.ts` 管 md/html/pdf 的取值校验和路径推导（`exportPathFor`），`html.ts` 渲染单文件 HTML，`convert.ts` 调 pandoc 出 PDF。**CLI 是先 `recordHistory()` 再 `handleOutput()`**：导出失败（例如没装 pandoc）时 URL 仍会被记成已处理，重跑要加 `--force`。TUI 的 note wizard 自己记录 history、自己做导出（不走 CLI 的 `handleOutput`），导出失败只 log 不中止

## 关键约束

**笔记永远先写成 Markdown。** `--format html/pdf` 是在 `.md` 旁边**额外**导出，不是替代。`exportPathFor()` 统一推导导出路径；新增格式时改 `OUTPUT_FORMATS` 一处，CLI 校验和 TUI 菜单都跟着走。

**HTML 导出是自包含的，只有 Mermaid / KaTeX 走 CDN。** 样式全部内联在 `html-styles.ts`，没有构建步骤、没有外部 CSS。断网时必须优雅降级——图退化成代码块原文、公式退化成 `$...$`，不能白屏或报错。marked 默认放行原始 HTML，`html.ts` 里覆写了 `renderer.html` 做转义：笔记内容来自任意网页，不转义等于把 `<script>` 打进一个用户会打开、会转发的文件。

**Progress 是 pipeline 的接缝。** pipeline 不直接 `console.error`，而是通过 `Progress` 接口（`src/progress.ts`）发 `phase`/`success`/`warn` 事件。CLI 用默认的 stderr 实现，TUI 用 `src/tui/progress.ts` 的 clack 单行 spinner 实现，测试用静默实现。新增 pipeline 日志请走这个接口。注意 `optimizer/index.ts` 和 `fetcher/video-fetcher.ts` 仍有裸 `console.error`，在 TUI 里会越过 spinner 直接打印——这是历史遗留，不要照抄。

**TUI 必须懒加载。** `src/cli.ts` 里所有 TUI 引用都经 `loadTui()` 动态 import，这样 `autolearn <url>` 不必加载 `@clack/prompts`（构建产物里 TUI 是独立 chunk）。不要在 cli.ts 顶层 import `./tui`。

**配置有两个 loader，别用错。** `loadConfig()` 会展开 `${ENV_VAR}`；`loadRawConfig()` 不会。配置向导（`src/tui/config-wizard.ts`）**必须**用 raw 版本读写——用 `loadConfig` 会把真实 API Key 展开后明文写回磁盘。同理 `maskSecret()` 会原样显示 `${...}` 占位符、只对字面量密钥打码。未设置的 `${VAR}` 会被 `loadConfig()` 静默展开成空字符串：`cleanUp()` 在 apiKey 和 baseUrl 都为空时直接跳过优化，generator 随后拿到 `apiKey: ''`。TUI 会对非 ollama 提供商给出警告，CLI 不会——排查 401 / 空 key 时先看这里。

**`--type` 不做取值校验，还会吞掉后面的 flag。** commander 不检查 `-t/--type` 的值：`autolearn -t --format <url>` 会把 `--format` 当成 type 的值，`--format` 选项本身消失、format 退回默认 `md`，命令照常跑完却只产出 Markdown——看起来像“生成不成功”。未知 type 在 `getFetcher` 里会落到 auto 分支，非法值还会进入 `parseContent` 的 metadata。改 CLI 时应在解析后、动工前校验 type ∈ {text, video, auto}。

**`--format` 必须带值。** `autolearn --format <url>` 会把 URL 当成格式值，报 `Unknown format "https://..."`。正确写法是 `--format html <url>`，flag 放在 URL 前后都可以。

**clack 的取消有点绕。** 每个 prompt 返回 `T | symbol`（取消符号）。两个 wizard 里都有本地 `ask<T>()` 包装，返回类型是 `Promise<Exclude<T, symbol>>`——这个 `Exclude` 是必需的，否则调用点到处都要 cast。`multiline()` 返回**单个 string**（不是 string[]），尽管名字容易让人误会。

**Commander 的 `-c` 冲突。** 根命令和 `config` 子命令都声明了 `-c, --config`，commander 会把共享 flag 解析进根命令的 store，子命令自己的 `options.config` 永远是 undefined。子命令 action 里必须用 `command.optsWithGlobals()` 才拿得到（`src/cli.ts`，有回归测试覆盖）。

**TUI 交互测试用 PTY。** `isInteractive()` 同时检查 stdin/stdout 是 TTY 且不在 CI，所以无 TTY 时裸命令走报错分支而非挂起。手动验证向导需要真 PTY（`pty.openpty()` + subprocess），管道喂输入不会触发。

## 测试

测试与源码同目录（`src/**/*.test.ts`），`vitest.config.ts` 开了 `globals: true`。全部 mock 掉网络（`globalThis.fetch`）和子进程（`node:child_process`），不需要 API Key。`src/smoke.test.ts` 用 `spawnSync('npx', ['tsx', 'src/cli.ts', ...])` 做 CLI 端到端。

## 其他

- 配置在 `~/.autolearning/config.toml`，历史记录在 `~/.autolearning/history.json`（URL 去重，`--force` 绕过）。`output.directory` 默认是相对路径 `./notes`，**相对于运行时的 cwd**，不是仓库根目录——在别的目录跑 `autolearn`，笔记会写到那里去
- `dist/`、`notes/`、`docs/`、`.claude/` 都在 `.gitignore` 里，本地存在但不在版本控制中。`dist/` 由 `pnpm build` 生成，`prepare` 脚本保证 `pnpm install` / `npm link` / 从 git 安装时都会自动构建一次——改完源码记得 `pnpm build`，否则全局 `autolearn` 跑的还是旧的
- LICENSE 是 Apache-2.0（`LICENSE` 文件 + `package.json` 的 `license` 字段，README 已同步）
