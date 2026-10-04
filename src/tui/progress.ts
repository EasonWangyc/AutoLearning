import { log, spinner } from '@clack/prompts';
import type { Progress } from '../progress';

/**
 * clack-backed progress renderer.
 *
 * The pipeline emits a sequence of phases ending in a success, so a single
 * spinner line is reused: each new phase rewrites the line in place instead of
 * pushing another one, and the final success stops it.
 */
export function createClackProgress(): Progress {
  const s = spinner();
  let running = false;

  return {
    phase(message) {
      if (running) {
        s.message(message);
      } else {
        s.start(message);
        running = true;
      }
    },
    success(message) {
      if (running) {
        s.stop(message);
        running = false;
      } else {
        log.success(message);
      }
    },
    warn(message) {
      // A warning is non-fatal: drop the spinner line so the message is
      // readable, and let the next phase() start a fresh one.
      if (running) {
        s.clear();
        running = false;
      }
      log.warn(message);
    },
  };
}
