# assets/

README 里引用的图片都放在这里。当前是**手绘 SVG 占位图**（GitHub 原生渲染 SVG，浅色/深色主题下都清晰）。

想换成 AI 生成的图（GPT Image / Gemini / Midjourney 均可）时，按下表替换即可。

| 文件 | 尺寸 | 用途 |
|------|------|------|
| `banner.svg` | 1200×340 | README 顶部横幅 |
| `tui-demo.svg` | 1100×620 | 交互式向导截图 |
| `note-preview.svg` | 1100×620 | 生成笔记的效果预览 |

## 换成 AI 生成的图

推荐做法是**保留 `.svg` 文件名**，让生图模型直接产出 SVG——这样 README 一个字都不用改。

如果模型只能出 PNG/JPG，把新文件放进 `assets/` 后，改 README 里对应的一行扩展名即可：

```diff
- <img src="assets/banner.svg" alt="AutoLearning" width="100%">
+ <img src="assets/banner.png" alt="AutoLearning" width="100%">
```

### 建议提示词

**banner.svg** —— 横幅，留出左侧放标题的空间：

> A wide 1200x340 dark developer-tool banner. Deep navy `#0B1020` to slate gradient background with a soft indigo radial glow on the right. Left side is clear space for a wordmark. Right side: a minimal line-art illustration of a URL flowing through three nodes (fetch → clean → generate) into a document icon. Cyan `#38BDF8`, violet `#A78BFA` and pink `#F472B6` accents. Flat vector, subtle glow, no text, no logos.

**tui-demo.svg** —— 真实截图更好。如果你愿意录屏，用 [asciinema](https://asciinema.org/) 或 [terminalizer](https://github.com/faressoft/terminalizer) 录一段真实交互，导出 GIF 后把 README 里 `tui-demo.svg` 换成 `tui-demo.gif`，说服力远胜生成图：

```bash
asciinema rec demo.cast      # 跑一遍 autolearn
agg demo.cast assets/tui-demo.gif
```

**note-preview.svg** —— 同样建议直接截图真实的 `notes/*.md` 渲染结果，比生成图更可信。

## 注意

- 别用带文字的生成图，模型很容易把英文/中文写错，反而显得廉价。
- 深色底的图在 GitHub 浅色主题下会有明显色块边界，属正常现象（多数高星项目也如此）。
