/**
 * Output format handling.
 *
 * Lives apart from `cli.ts` because that module runs `program.parse()` at
 * import time, which makes anything exported from it untestable. It is also
 * shared: the CLI's `--format` flag and the interactive wizard's format menu
 * are two views of the same list.
 */
export const OUTPUT_FORMATS = ['md', 'html', 'pdf'] as const;
export type OutputFormat = (typeof OUTPUT_FORMATS)[number];

/** Reject an unknown --format up front rather than silently falling back to md. */
export function parseFormat(value: string | undefined): OutputFormat {
  const format = (value ?? 'md').toLowerCase();
  if (!(OUTPUT_FORMATS as readonly string[]).includes(format)) {
    throw new Error(`Unknown format "${value}". Expected one of: ${OUTPUT_FORMATS.join(', ')}`);
  }
  return format as OutputFormat;
}

/**
 * Where a format's artifact goes, given the note's `.md` path.
 *
 * The Markdown file is always written; html and pdf are exports written beside
 * it, so `md` maps to the note itself.
 */
export function exportPathFor(mdPath: string, format: OutputFormat): string {
  return format === 'md' ? mdPath : mdPath.replace(/\.md$/, `.${format}`);
}
