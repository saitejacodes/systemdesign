/** Undo/redo over immutable snapshots (StudioGraph in the editor). Pure: no React, no timers. */
export const HISTORY_LIMIT = 100;
/** Commits with the same key within this many ms merge into one entry (a drag, a nudge burst, typing in a field). */
export const COALESCE_MS = 800;

export interface History<T> {
  past: T[];
  present: T;
  future: T[];
  /** Coalescing key and time of the last commit. */
  key?: string;
  at?: number;
}

export function createHistory<T>(present: T): History<T> {
  return { past: [], present, future: [] };
}

export interface CommitOptions { key?: string; now?: number; windowMs?: number; limit?: number }

/** Records a new present. A new change always clears redo. */
export function commit<T>(h: History<T>, next: T, opts: CommitOptions = {}): History<T> {
  if (Object.is(next, h.present)) return h;
  const now = opts.now ?? Date.now();
  const windowMs = opts.windowMs ?? COALESCE_MS;
  if (opts.key && h.key === opts.key && h.at !== undefined && now - h.at <= windowMs) {
    return { past: h.past, present: next, future: [], key: opts.key, at: now };
  }
  const limit = opts.limit ?? HISTORY_LIMIT;
  const past = [...h.past, h.present];
  return { past: past.length > limit ? past.slice(past.length - limit) : past, present: next, future: [], key: opts.key, at: now };
}

export function undo<T>(h: History<T>): History<T> {
  if (!h.past.length) return h;
  return { past: h.past.slice(0, -1), present: h.past[h.past.length - 1], future: [h.present, ...h.future] };
}

export function redo<T>(h: History<T>): History<T> {
  if (!h.future.length) return h;
  return { past: [...h.past, h.present], present: h.future[0], future: h.future.slice(1) };
}

export const canUndo = (h: History<unknown>) => h.past.length > 0;
export const canRedo = (h: History<unknown>) => h.future.length > 0;
