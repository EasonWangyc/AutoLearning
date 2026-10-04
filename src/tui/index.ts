import { isCI, isTTY } from '@clack/prompts';

export { runNoteWizard } from './wizard';
export { runConfigWizard } from './config-wizard';
export { createClackProgress } from './progress';

/**
 * Can we run an interactive prompt?
 *
 * Every half matters: piped stdin (`echo url | autolearn`) and a CI runner
 * would otherwise hang forever on a prompt nobody can answer.
 */
export function isInteractive(): boolean {
  if (isCI()) return false;
  return Boolean(process.stdin.isTTY && isTTY(process.stdout));
}
