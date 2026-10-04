/**
 * Stylesheet inlined into every exported HTML note.
 *
 * Kept as one string with no build step so the exported file is genuinely
 * self-contained: open it from disk, a USB stick, or a chat app attachment and
 * it renders identically. Only Mermaid and KaTeX are fetched, from a CDN, and
 * both degrade to readable source text when offline.
 */
export const NOTE_STYLES = `
:root {
  color-scheme: light dark;
  --bg: #ffffff;
  --surface: #f6f8fa;
  --fg: #1f2328;
  --muted: #59636e;
  --border: #d1d9e0;
  --accent: #0969da;
  --quote-bg: #f0f6ff;
  --mark-bg: #fff8c5;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0d1117;
    --surface: #151b23;
    --fg: #e6edf3;
    --muted: #9198a1;
    --border: #3d444d;
    --accent: #4493f8;
    --quote-bg: #121d2f;
    --mark-bg: #4d3800;
  }
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC",
    "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", Roboto, Helvetica, Arial, sans-serif;
  font-size: 16px;
  line-height: 1.8;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

main {
  max-width: 820px;
  margin: 0 auto;
  padding: 56px 24px 120px;
}

/* ---------- Headings ---------- */
h1, h2, h3, h4, h5, h6 {
  line-height: 1.35;
  font-weight: 650;
  margin: 2em 0 0.75em;
  scroll-margin-top: 24px;
}
h1 {
  font-size: 2em;
  margin-top: 0;
  padding-bottom: 0.4em;
  border-bottom: 1px solid var(--border);
  letter-spacing: -0.01em;
}
h2 {
  font-size: 1.5em;
  padding-bottom: 0.3em;
  border-bottom: 1px solid var(--border);
}
h3 { font-size: 1.2em; }
h4 { font-size: 1.05em; }
h5, h6 { font-size: 1em; color: var(--muted); }

p { margin: 0 0 1.1em; }

a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }

strong { font-weight: 650; }

hr {
  border: 0;
  border-top: 1px solid var(--border);
  margin: 2.5em 0;
}

mark { background: var(--mark-bg); color: inherit; padding: 0.1em 0.2em; border-radius: 3px; }

/* ---------- Lists ---------- */
ul, ol { margin: 0 0 1.1em; padding-left: 1.6em; }
li { margin: 0.35em 0; }
li > ul, li > ol { margin: 0.35em 0 0; }

/* ---------- Blockquote (the TL;DR callout) ---------- */
blockquote {
  margin: 0 0 1.4em;
  padding: 0.9em 1.2em;
  background: var(--quote-bg);
  border-left: 4px solid var(--accent);
  border-radius: 0 6px 6px 0;
  color: var(--fg);
}
blockquote > :last-child { margin-bottom: 0; }

/* ---------- Tables ---------- */
.table-scroll { overflow-x: auto; margin: 0 0 1.4em; }
table {
  border-collapse: collapse;
  width: 100%;
  font-size: 0.94em;
}
th, td {
  border: 1px solid var(--border);
  padding: 0.6em 0.9em;
  text-align: left;
  vertical-align: top;
}
th { background: var(--surface); font-weight: 650; }
tbody tr:nth-child(2n) { background: color-mix(in srgb, var(--surface) 45%, transparent); }

/* ---------- Code ---------- */
code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas,
    "Liberation Mono", monospace;
  font-size: 0.88em;
  background: var(--surface);
  padding: 0.2em 0.4em;
  border-radius: 5px;
  overflow-wrap: break-word;
}
pre {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 1em 1.2em;
  overflow-x: auto;
  margin: 0 0 1.4em;
  line-height: 1.6;
}
pre code {
  background: none;
  padding: 0;
  font-size: 0.87em;
  border-radius: 0;
}

/* ---------- Mermaid ---------- */
/* Unrendered (offline, or before the CDN script runs) this keeps the code
   block look so the diagram source is still readable. Mermaid sets
   data-processed once it has replaced the content with SVG. */
pre.mermaid {
  text-align: left;
  white-space: pre;
}
pre.mermaid[data-processed] {
  background: none;
  border: 0;
  padding: 0;
  text-align: center;
  overflow-x: auto;
}
pre.mermaid[data-processed] svg { max-width: 100%; height: auto; }

/* ---------- Math ---------- */
.katex-display { overflow-x: auto; overflow-y: hidden; padding: 0.2em 0; }

/* ---------- Images ---------- */
img { max-width: 100%; height: auto; border-radius: 6px; }

/* ---------- Print ---------- */
@media print {
  :root { --bg: #fff; --fg: #000; }
  main { max-width: none; padding: 0; }
  pre, blockquote, table { break-inside: avoid; }
  a { color: inherit; text-decoration: underline; }
}
`;
