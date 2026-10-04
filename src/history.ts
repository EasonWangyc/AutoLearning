import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface HistoryEntry {
  date: string;
  file: string;
}

const HISTORY_FILE = path.join(os.homedir(), '.autolearning', 'history.json');

/** URL → the note it produced. Used to skip re-processing the same page. */
export function loadHistory(): Record<string, HistoryEntry> {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      return JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8'));
    }
  } catch {
    /* a corrupt history file should never block a run */
  }
  return {};
}

export function saveHistory(history: Record<string, HistoryEntry>): void {
  fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf-8');
}

export function recordHistory(url: string, filePath: string): void {
  const history = loadHistory();
  history[url] = { date: new Date().toISOString().slice(0, 10), file: filePath };
  saveHistory(history);
}
