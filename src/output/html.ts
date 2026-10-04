import fs from 'node:fs';
import { Marked, Renderer } from 'marked';
import { NOTE_STYLES } from './html-styles';

const MERMAID_CDN = 'https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs';
const KATEX_VERSION = '0.16';
const KATEX_CSS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.css`;
const KATEX_JS = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/katex.min.js`;
const KATEX_AUTO = `https://cdn.jsdelivr.net/npm/katex@${KATEX_VERSION}/dist/contrib/auto-render.min.js`;

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c]);
}

// Keep a default renderer around so the mermaid case can special-case itself
// and delegate every other block straight back to marked's own output.
const defaultRenderer = new Renderer();

const md = new Marked({
  gfm: true,
  breaks: false,
  renderer: {
    code(token) {
      const lang = (token.lang ?? '').trim().toLowerCase();
      if (lang === 'mermaid') {
        // Mermaid reads textContent, so this is the diagram source, escaped.
        // Left as a <pre> until the CDN script replaces it with SVG.
        return `<pre class="mermaid">${escapeHtml(token.text)}</pre>\n`;
      }
      return defaultRenderer.code(token);
    },
    html(token) {
      // Notes are generated Markdown — raw HTML is never expected in them.
      // Escaping it stops a prompt-injected source page from smuggling a
      // <script> into an exported file the user later opens or shares.
      return escapeHtml(token.text);
    },
  },
});

/** The note's `# Title`, falling back to a generic label. */
export function extractTitle(markdown: string): string {
  const match = /^#\s+(.+?)\s*$/m.exec(markdown);
  return match ? match[1] : 'AutoLearning 笔记';
}

/**
 * Pick a `lang` for the <html> element from the content itself.
 *
 * Study notes are written in the source's language, so this is a reasonable
 * proxy — and it matters, because it drives CJK font selection in the browser.
 */
export function detectLang(markdown: string): string {
  const cjk = (markdown.match(/[一-鿿]/g) ?? []).length;
  return cjk > markdown.length * 0.05 ? 'zh-CN' : 'en';
}

/** Render note Markdown to a self-contained HTML document. */
export function renderNoteHtml(markdown: string): string {
  const title = extractTitle(markdown);
  const lang = detectLang(markdown);

  const body = md
    .parse(markdown, { async: false })
    // Wrap tables so wide ones scroll instead of stretching the page.
    .replace(/<table>/g, '<div class="table-scroll"><table>')
    .replace(/<\/table>/g, '</table></div>');

  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="generator" content="AutoLearning">
<link rel="stylesheet" href="${KATEX_CSS}" crossorigin="anonymous">
<style>${NOTE_STYLES}</style>
</head>
<body>
<main>
<article>
${body}
</article>
</main>

<script type="module">
  // Diagrams. If the CDN is unreachable the <pre class="mermaid"> blocks keep
  // their code-block styling and the diagram source stays readable.
  try {
    const { default: mermaid } = await import(${JSON.stringify(MERMAID_CDN)});
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'default',
    });
    await mermaid.run({ querySelector: 'pre.mermaid' });
  } catch (err) {
    console.warn('Mermaid unavailable, showing diagram source:', err);
  }
</script>

<script defer src="${KATEX_JS}" crossorigin="anonymous"></script>
<script defer src="${KATEX_AUTO}" crossorigin="anonymous"></script>
<script>
  document.addEventListener('DOMContentLoaded', function () {
    if (!window.renderMathInElement) {
      console.warn('KaTeX unavailable, showing raw formulas.');
      return;
    }
    renderMathInElement(document.body, {
      delimiters: [
        { left: '$$', right: '$$', display: true },
        { left: '$', right: '$', display: false },
        { left: '\\\\(', right: '\\\\)', display: false },
        { left: '\\\\[', right: '\\\\]', display: true }
      ],
      // Never typeset inside code — only prose math is meant to be rendered.
      ignoredTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code', 'option'],
      throwOnError: false
    });
  });
</script>
</body>
</html>
`;
}

/** Read a note's Markdown from disk and write the HTML export beside it. */
export function convertToHtml(mdPath: string, htmlPath: string): void {
  fs.writeFileSync(htmlPath, renderNoteHtml(fs.readFileSync(mdPath, 'utf-8')), 'utf-8');
}
