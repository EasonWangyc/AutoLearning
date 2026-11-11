/**
 * End a CLI run without waiting forever on a handle a dependency left behind.
 *
 * The pipeline's own work is finished, but SDK keep-alive sockets, a resumed
 * stdin, or a stray subprocess pipe can keep Node's event loop alive after the
 * note is written — the command looks hung and needs Ctrl+C. Setting
 * `exitCode` lets a clean process drain and exit naturally; the unref'd timer
 * only fires when something else is still holding the loop open.
 */
export function exitSoon(code: number): void {
  process.exitCode = code;

  // Prompts and stdin readers resume the stream; leaving it resumed is one of
  // the ways a finished CLI ends up waiting for input that will never come.
  process.stdin.pause();
  (process.stdin as { unref?: () => void }).unref?.();

  setTimeout(() => process.exit(code), 1_000).unref();
}
