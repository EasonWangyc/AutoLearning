import { describe, it, expect } from 'vitest';
import { sanitize, repairOrphanedFenceTag } from './sanitize';

describe('sanitize', () => {
  it('strips Chinese polite closings', () => {
    const input = `## Summary\n\nSome content here.\n\n希望对你有所帮助！`;
    const result = sanitize(input);
    expect(result).not.toContain('希望对你有所帮助');
    expect(result).toContain('Some content here');
  });

  it('strips English polite closings', () => {
    const input = `## Summary\n\nSome content.\n\nLet me know if you need anything else!`;
    const result = sanitize(input);
    expect(result).not.toContain('Let me know');
    expect(result).toContain('Some content');
  });

  it('strips "Here is" preambles', () => {
    const input = `Here is a summary of the transcript:\n\n# Title\n\nContent.`;
    const result = sanitize(input);
    expect(result).not.toContain('Here is');
    expect(result).toContain('# Title');
  });

  it('does not modify content without artifacts', () => {
    const input = `# Title\n\n## Section\n\nNormal content with key points.`;
    expect(sanitize(input)).toBe(input);
  });

  it('removes multiple patterns in one pass', () => {
    const input = `Here is the summary:\n\n## Notes\n\nGreat stuff.\n\nLet me know if you need changes!`;
    const result = sanitize(input);
    expect(result).not.toContain('Here is');
    expect(result).not.toContain('Let me know');
    expect(result).toContain('## Notes');
    expect(result).toContain('Great stuff');
  });
});

describe('repairOrphanedFenceTag', () => {
  const F = '```';

  it('folds a lone mermaid tag into the opening fence', () => {
    const input = [
      '## 事件循环',
      '',
      F,
      'mermaid',
      'flowchart LR',
      '    A --> B',
      F,
      '',
      '说明文字。',
    ].join('\n');

    const result = repairOrphanedFenceTag(input);
    expect(result).toContain(`${F}mermaid\nflowchart LR`);
    expect(result).not.toMatch(/^```\nmermaid$/m);
    // the diagram body and the prose after it survive intact
    expect(result).toContain('    A --> B');
    expect(result).toContain('说明文字。');
  });

  it('repairs other language tags too', () => {
    const input = [F, 'python', 'print(1)', F].join('\n');
    expect(repairOrphanedFenceTag(input)).toBe([`${F}python`, 'print(1)', F].join('\n'));
  });

  it('leaves an already-correct fence alone', () => {
    const input = [`${F}mermaid`, 'flowchart LR', F].join('\n');
    expect(repairOrphanedFenceTag(input)).toBe(input);
  });

  it('leaves a plain fence whose first content line is an ordinary word', () => {
    // "TODO" is not a language tag — this is a real code block, not a botched fence.
    const input = [F, 'TODO', 'fix this later', F].join('\n');
    expect(repairOrphanedFenceTag(input)).toBe(input);
  });

  it('does not touch a line of prose that follows a closing fence', () => {
    const input = [`${F}mermaid`, 'flowchart LR', F, 'python is a language'].join('\n');
    expect(repairOrphanedFenceTag(input)).toBe(input);
  });

  it('handles several orphaned fences in one document', () => {
    const input = [
      F, 'mermaid', 'flowchart LR', F,
      '',
      F, 'bash', 'npm install', F,
    ].join('\n');
    const result = repairOrphanedFenceTag(input);
    expect(result).toContain(`${F}mermaid`);
    expect(result).toContain(`${F}bash`);
    expect(result).not.toMatch(/^```\n(?:mermaid|bash)$/m);
  });

  it('preserves indentation for fenced blocks nested in a list', () => {
    const input = ['- 步骤：', '', '  ' + F, '  mermaid', '  flowchart LR', '  ' + F].join('\n');
    const result = repairOrphanedFenceTag(input);
    expect(result).toContain(`  ${F}mermaid`);
  });

  it('normalises tag casing to lowercase', () => {
    const input = [F, 'Mermaid', 'flowchart LR', F].join('\n');
    expect(repairOrphanedFenceTag(input)).toContain(`${F}mermaid`);
  });
});

describe('sanitize + fence repair', () => {
  it('repairs orphaned fence tags as part of the normal sanitize pass', () => {
    const input = `# 标题\n\n\`\`\`\nmermaid\nflowchart LR\n    A --> B\n\`\`\`\n\n希望对你有所帮助！`;
    const result = sanitize(input);
    expect(result).toContain('```mermaid');
    expect(result).not.toContain('希望对你有所帮助');
  });
});
