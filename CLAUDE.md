# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

AutoLearning 是一个 CLI 工具，根据 URL（文档、博客、视频）自动生成结构化 Markdown 学习笔记。

## 常用命令

```bash
pnpm dev                  # 开发运行（tsx）
pnpm build                # 构建（tsup）
pnpm test                 # 运行所有测试（vitest，119 个用例）
pnpm test src/tui         # 运行单个模块测试
pnpm test:watch           # 监听模式
pnpm exec tsc --noEmit    # 类型检查（提交前必跑）
node dist/cli.js --help   # 查看 CLI 帮助
```

## 架构

策略 + 管道模式。`src/pipeline.ts` 是唯一的编排点，有两个入口：`runPipeline`（URL，走 Fetcher）和 `runPipelineFromText`（文件/stdin/粘贴，跳过 Fetcher）。

```
CLI → Fetcher (策略) → Optimizer → Parser → Generator (策略)
                       ↘ Transcriber (策略, 仅视频无字幕时)   → sanitize → Output
```

**注意实际执行顺序**：Optimizer 在 Parser **之前**（pipeline.ts），README 的流程图为了可读性把它画在中间。两个入口共享 `cleanUp()`（LLM 清洗 + 标题修正）和 `generateNote()`（parse → generate → sanitize → write），改管道尾部逻辑只需改这两处。

- **Fetcher** (`src/fetcher/`): `getFetcher(url, type, ...)` 路由。TextFetcher 三级降级（r.jina.ai → cookie curl → Readability）；VideoFetcher 双路径（yt-dlp 字幕 → 音频 + Whisper）。纯函数 `isVideoUrl()` 用于 auto 判定，TUI 也复用它
- **Optimizer** (`src/optimizer/`): `optimizeTranscript()` 洗正文，`fixTitle()` 只对无意义标题（`GENERIC_TITLE_PATTERNS`）调 LLM。两者失败都降级为原文，不中断
- **Generator** (`src/generator/`): `getGenerator()` 路由。`claude` → Anthropic SDK；`openai` 和 `deepseek` 共用 OpenAIGenerator（靠 `baseUrl` 区分）；`ollama` 走 HTTP。**system prompt 只有一份**，在 `src/generator/prompt.ts` —— 三个后端曾经各自复制一份然后漂移了，不要把 prompt 再内联回 generator
- **Transcriber** (`src/transcriber/`): 只有 `local-whisper` 接进了 pipeline；`whisper.ts` / `alibaba.ts` 已实现但未接线
- **Output** (`src/output/`): `writeNote()` 处理文件名模板，`sanitize()` 过滤 AI 客套话并修复畸形代码围栏（`repairOrphanedFenceTag()`）。导出有三条路：`format.ts` 管 md/html/pdf 的取值校验和路径推导（`exportPathFor`），`html.ts` 渲染单文件 HTML，`convert.ts` 调 pandoc 出 PDF

## 关键约束

**笔记永远先写成 Markdown。** `--format html/pdf` 是在 `.md` 旁边**额外**导出，不是替代。`exportPathFor()` 统一推导导出路径；新增格式时改 `OUTPUT_FORMATS` 一处，CLI 校验和 TUI 菜单都跟着走。

**HTML 导出是自包含的，只有 Mermaid / KaTeX 走 CDN。** 样式全部内联在 `html-styles.ts`，没有构建步骤、没有外部 CSS。断网时必须优雅降级——图退化成代码块原文、公式退化成 `$...$`，不能白屏或报错。marked 默认放行原始 HTML，`html.ts` 里覆写了 `renderer.html` 做转义：笔记内容来自任意网页，不转义等于把 `<script>` 打进一个用户会打开、会转发的文件。

**Progress 是一个接缝。** pipeline 不直接 `console.error`，而是通过 `Progress` 接口（`src/progress.ts`）发 `phase`/`success`/`warn` 事件。CLI 用默认的 stderr 实现，TUI 用 `src/tui/progress.ts` 的 clack 单行 spinner 实现，测试用静默实现。新增 pipeline 日志请走这个接口。

**TUI 必须懒加载。** `src/cli.ts` 里所有 TUI 引用都经 `loadTui()` 动态 import，这样 `autolearn <url>` 不必加载 `@clack/prompts`（构建产物里 TUI 是独立 chunk）。不要在 cli.ts 顶层 import `./tui`。

**配置有两个 loader，别用错。** `loadConfig()` 会展开 `${ENV_VAR}`；`loadRawConfig()` 不会。配置向导（`src/tui/config-wizard.ts`）**必须**用 raw 版本读写——用 `loadConfig` 会把真实 API Key 展开后明文写回磁盘。同理 `maskSecret()` 会原样显示 `${...}` 占位符、只对字面量密钥打码。

**clack 的取消有点绕。** 每个 prompt 返回 `T | symbol`（取消符号）。两个 wizard 里都有本地 `ask<T>()` 包装，返回类型是 `Promise<Exclude<T, symbol>>`——这个 `Exclude` 是必需的，否则调用点到处都要 cast。`multiline()` 返回**单个 string**（不是 string[]），尽管名字容易让人误会。

**Commander 的 `-c` 冲突。** 根命令和 `config` 子命令都声明了 `-c, --config`，commander 会把共享 flag 解析进根命令的 store，子命令自己的 `options.config` 永远是 undefined。子命令 action 里必须用 `command.optsWithGlobals()` 才拿得到（`src/cli.ts`，有回归测试覆盖）。

**TUI 交互测试用 PTY。** `isInteractive()` 同时检查 stdin/stdout 是 TTY 且不在 CI，所以无 TTY 时裸命令走报错分支而非挂起。手动验证向导需要真 PTY（`pty.openpty()` + subprocess），管道喂输入不会触发。

## 测试

测试与源码同目录（`src/**/*.test.ts`），`vitest.config.ts` 开了 `globals: true`。全部 mock 掉网络（`globalThis.fetch`）和子进程（`node:child_process`），不需要 API Key。`src/smoke.test.ts` 用 `spawnSync('npx', ['tsx', 'src/cli.ts', ...])` 做 CLI 端到端。

## 其他

- 配置在 `~/.autolearning/config.toml`，历史记录在 `~/.autolearning/history.json`（URL 去重，`--force` 绕过）
- `dist/`、`notes/`、`docs/`、`.claude/` 都在 `.gitignore` 里，本地存在但不在版本控制中。`dist/` 由 `pnpm build` 生成，`prepare` 脚本保证 `pnpm install` / `npm link` / 从 git 安装时都会自动构建一次——改完源码记得 `pnpm build`，否则全局 `autolearn` 跑的还是旧的
- 项目目前**没有 LICENSE 文件**（README 里已如实说明）
