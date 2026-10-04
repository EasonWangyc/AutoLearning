import { describe, it, expect } from 'vitest';
import { OUTPUT_FORMATS, exportPathFor, parseFormat } from './format';

describe('parseFormat', () => {
  it('defaults to md', () => {
    expect(parseFormat(undefined)).toBe('md');
  });

  it('accepts every advertised format', () => {
    for (const format of OUTPUT_FORMATS) {
      expect(parseFormat(format)).toBe(format);
    }
  });

  it('is case-insensitive', () => {
    expect(parseFormat('HTML')).toBe('html');
    expect(parseFormat('Pdf')).toBe('pdf');
  });

  it('rejects an unknown format instead of silently using md', () => {
    expect(() => parseFormat('htm')).toThrow(/Unknown format "htm"/);
    expect(() => parseFormat('docx')).toThrow(/Expected one of: md, html, pdf/);
  });
});

describe('exportPathFor', () => {
  it('maps md to the note itself', () => {
    const note = '/notes/Topic-2026-10-04.md';
    expect(exportPathFor(note, 'md')).toBe(note);
  });

  it('places exports beside the note', () => {
    const note = '/notes/Topic-2026-10-04.md';
    expect(exportPathFor(note, 'html')).toBe('/notes/Topic-2026-10-04.html');
    expect(exportPathFor(note, 'pdf')).toBe('/notes/Topic-2026-10-04.pdf');
  });

  it('replaces only the trailing extension', () => {
    expect(exportPathFor('/n/a.md.md', 'html')).toBe('/n/a.md.html');
  });
});
