/**
 * Language tags we are willing to fold back into a fence.
 *
 * Deliberately a curated list rather than "any single word on the next line":
 * a plain fence whose first content line happens to be one word (a "TODO", a
 * variable name) must be left alone. A missed repair is cosmetic; a wrong one
 * silently rewrites the reader's content.
 */
const ORPHANABLE_TAGS = new Set([
  'mermaid', 'javascript', 'js', 'jsx', 'typescript', 'ts', 'tsx',
  'python', 'py', 'bash', 'sh', 'shell', 'zsh', 'json', 'jsonc', 'toml',
  'yaml', 'yml', 'sql', 'html', 'css', 'scss', 'java', 'go', 'rust', 'rs',
  'ruby', 'rb', 'php', 'cpp', 'csharp', 'cs', 'kotlin', 'swift', 'lua',
  'perl', 'scala', 'dart', 'elixir', 'haskell', 'graphql', 'dockerfile',
  'ini', 'xml', 'diff', 'text', 'plaintext', 'markdown', 'md', 'latex', 'tex',
]);

/**
 * Fold a language tag that landed on the wrong line back into its opening fence.
 *
 * Models sometimes emit
 *
 *     ```
 *     mermaid
 *     flowchart LR
 *     ```
 *
 * which renders as a code block containing the word "mermaid" instead of a
 * diagram. The prompt asks them not to, but the prompt is not a guarantee, so
 * the repair happens here too.
 *
 * Walks the document tracking fence state, so only *opening* fences are
 * considered — a closing fence followed by a line of prose is left untouched.
 */
export function repairOrphanedFenceTag(text: string): string {
  const lines = text.split('\n');
  const out: string[] = [];
  let openFence: string | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = /^(\s*)(`{3,}|~{3,})(.*)$/.exec(lines[i]);

    if (!match) {
      out.push(lines[i]);
      continue;
    }

    const [, indent, marker, rest] = match;

    if (openFence !== null) {
      // Inside a block: this closes it only if it is the same character, at
      // least as long, and carries nothing else.
      if (marker[0] === openFence[0] && marker.length >= openFence.length && rest.trim() === '') {
        openFence = null;
      }
      out.push(lines[i]);
      continue;
    }

    if (rest.trim() === '') {
      const tag = lines[i + 1]?.trim().toLowerCase();
      if (tag && ORPHANABLE_TAGS.has(tag)) {
        out.push(`${indent}${marker}${tag}`);
        i++; // consume the tag line
        openFence = marker;
        continue;
      }
    }

    openFence = marker;
    out.push(lines[i]);
  }

  return out.join('\n');
}

/** Strips common LLM artifacts: polite closings, preambles, meta-commentary. */
export function sanitize(text: string): string {
  let result = repairOrphanedFenceTag(text.trim());

  // Strip trailing polite closings (Chinese)
  result = result.replace(
    /\n{1,2}(?:希望对你[^\n]{0,80}|如有需要[^\n]{0,80}|如需[^\n]{0,80}|欢迎反馈[^\n]{0,80}|请告诉[^\n]{0,80}|以上[^\n]{0,40}内容[^\n]{0,40})$/g,
    '',
  );

  // Strip trailing polite closings (English)
  result = result.replace(
    /\n{1,2}(?:let me know[^\n]{0,200}|feel free to[^\n]{0,200}|happy to[^\n]{0,200}|please let me know[^\n]{0,200}|don't hesitate[^\n]{0,200}|hope this helps[^\n]{0,200}|thanks for reading[^\n]{0,200})$/gi,
    '',
  );

  // Strip leading preambles
  result = result.replace(
    /^(?:Here is (?:a |the )?(?:summary|note|transcript)[^\n]{0,200}\n{1,2}|以下是[^\n]{0,200}\n{1,2})/i,
    '',
  );

  // Remove trailing lines that are pure meta
  const lines = result.split('\n');
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (!last) {
      lines.pop();
      continue;
    }
    const lower = last.toLowerCase();
    if (
      lower === '---' ||
      /^(let me know|feel free|happy to|hope this|thanks for|please let|don't hesitate)/i.test(lower) ||
      /^(希望|如有|如需|欢迎|请告诉|以上)/.test(lower)
    ) {
      lines.pop();
      continue;
    }
    break;
  }

  return lines.join('\n').trim();
}
