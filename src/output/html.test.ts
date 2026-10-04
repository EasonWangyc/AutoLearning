import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { detectLang, extractTitle, renderNoteHtml } from './html';

describe('extractTitle', () => {
  it('reads the leading H1', () => {
    expect(extractTitle('# 事件循环\n\nbody')).toBe('事件循环');
  });

  it('finds an H1 that is not the first line', () => {
    expect(extractTitle('intro text\n\n# Real Title\n\nbody')).toBe('Real Title');
  });

  it('falls back when there is no H1', () => {
    expect(extractTitle('## Only an H2')).toBe('AutoLearning 笔记');
  });
});

describe('detectLang', () => {
  it('detects Chinese notes', () => {
    expect(detectLang('# 事件循环\n\n事件循环是运行时构造而非库。')).toBe('zh-CN');
  });

  it('detects English notes', () => {
    expect(detectLang('# Event Loop\n\nThe event loop is a runtime construct.')).toBe('en');
  });
});

/** The rendered note itself, without the stylesheet/script scaffolding. */
function body(html: string): string {
  return html.split('<article>')[1].split('</article>')[0];
}

describe('renderNoteHtml', () => {
  it('produces a complete standalone document', () => {
    const html = renderNoteHtml('# Title\n\nBody text.');
    expect(html).toMatch(/^<!doctype html>/);
    expect(html).toContain('<title>Title</title>');
    expect(html).toContain('Body text.');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
  });

  it('turns a mermaid block into something mermaid can render', () => {
    const html = renderNoteHtml('# T\n\n```mermaid\nflowchart LR\n  A --> B\n```\n');
    expect(body(html)).toContain('<pre class="mermaid">');
    // The browser decodes the entity back to `-->` before mermaid reads it.
    expect(html).toContain('A --&gt; B');
  });

  it('leaves other code blocks as ordinary highlighted blocks', () => {
    const html = renderNoteHtml('# T\n\n```python\nprint(1)\n```\n');
    expect(body(html)).toContain('<pre><code class="language-python">');
    expect(body(html)).not.toContain('mermaid');
  });

  it('wraps tables so wide ones scroll instead of stretching the page', () => {
    const html = renderNoteHtml('# T\n\n| a | b |\n|---|---|\n| 1 | 2 |\n');
    expect(body(html)).toContain('<div class="table-scroll"><table>');
    expect(body(html)).toContain('</table></div>');
  });

  it('links the CDN assets and degrades gracefully without them', () => {
    const html = renderNoteHtml('# T');
    expect(html).toContain('mermaid.esm.min.mjs');
    expect(html).toContain('katex.min.css');
    expect(html).toContain('auto-render.min.js');
    // Both scripts bail out quietly rather than throwing when offline.
    expect(html).toContain('catch');
    expect(html).toContain('if (!window.renderMathInElement)');
  });

  it('styles for both colour schemes', () => {
    const html = renderNoteHtml('# T');
    expect(html).toContain('prefers-color-scheme: dark');
    expect(html).toContain('color-scheme: light dark');
  });

  it('escapes raw HTML instead of executing it', () => {
    const html = renderNoteHtml('# T\n\n<script>alert(1)</script>\n\ninline <img src=x onerror=alert(1)> here');
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('onerror=alert(1)>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes the title in the document head', () => {
    const html = renderNoteHtml('# <script>bad</script>\n\nbody');
    expect(html).toContain('<title>&lt;script&gt;bad&lt;/script&gt;</title>');
  });

  it('renders math delimiters through to the browser for KaTeX', () => {
    const html = renderNoteHtml('# T\n\ninline $O(n \\log n)$ and block $$x^2$$');
    expect(html).toContain('$O(n \\log n)$');
    expect(html).toContain('$$x^2$$');
    // code blocks must be excluded from typesetting
    expect(html).toContain("'pre'");
    expect(html).toContain("'code'");
  });
});

describe('rendered document, parsed as a browser would', () => {
  it('mermaid sees the original diagram source, not escaped entities', () => {
    const diagram = 'flowchart LR\n    A[执行脚本] --> B{还有回调?}\n    B -->|是| C[处理事件循环]';
    const html = renderNoteHtml(`# T\n\n\`\`\`mermaid\n${diagram}\n\`\`\`\n`);

    const dom = new JSDOM(html);
    const pre = dom.window.document.querySelector('pre.mermaid');
    expect(pre).not.toBeNull();
    // mermaid reads textContent — the `-->` arrows must survive the HTML escape
    expect(pre!.textContent).toBe(diagram);
  });

  it('sets the document title and language from the note', () => {
    const dom = new JSDOM(renderNoteHtml('# 事件循环\n\n正文。'));
    expect(dom.window.document.title).toBe('事件循环');
    expect(dom.window.document.documentElement.lang).toBe('zh-CN');
  });

  it('keeps every block of the note in the article body', () => {
    const html = renderNoteHtml(
      '# T\n\n> TL;DR 摘要\n\n## 小节\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n正文。\n',
    );
    const dom = new JSDOM(html);
    const article = dom.window.document.querySelector('article')!;
    expect(article.querySelector('h1')?.textContent).toBe('T');
    expect(article.querySelector('blockquote')?.textContent).toContain('TL;DR 摘要');
    expect(article.querySelector('h2')?.textContent).toBe('小节');
    expect(article.querySelector('td')?.textContent).toBe('1');
  });

  it('does not leave an executable script from note content in the DOM', () => {
    const dom = new JSDOM(renderNoteHtml('# T\n\n<script>window.__pwned = 1</script>\n'));
    const scripts = [...dom.window.document.querySelectorAll('article script')];
    expect(scripts).toHaveLength(0);
    expect(dom.window.document.querySelector('article')!.textContent).toContain('<script>');
  });
});
