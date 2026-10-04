/**
 * Progress reporting seam for the pipeline.
 *
 * The pipeline runs from three places — the plain CLI, the interactive TUI, and
 * tests — and each wants the same events rendered differently. The pipeline only
 * emits events; the caller decides how (or whether) they are drawn.
 */
export interface Progress {
  /** A long-running phase is starting. */
  phase(message: string): void;
  /** A phase finished successfully. */
  success(message: string): void;
  /** Non-fatal problem — processing continues with a fallback. */
  warn(message: string): void;
}

/** Plain stderr lines: the CLI's behaviour before the TUI existed. */
export function createStderrProgress(): Progress {
  const write = (message: string) => console.error(message);
  return { phase: write, success: write, warn: write };
}

/** Discards every event. */
export function createSilentProgress(): Progress {
  const noop = () => {};
  return { phase: noop, success: noop, warn: noop };
}
