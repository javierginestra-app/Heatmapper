import { useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { AutosaveQueue, type SaveStatus } from './autosaveQueue';

const INVALID = '\u0000invalid';

export interface AutosaveState {
  readonly status: SaveStatus;
  readonly error: string | null;
}

export interface Autosave extends AutosaveState {
  /** Writes pending changes now; call before navigating away so the next screen reads them. */
  readonly flush: () => Promise<void>;
  /** Drops pending changes; call before deleting the record so a late save cannot recreate it. */
  readonly cancel: () => void;
}

/**
 * Saves `value` shortly after it differs from `initial` (what was loaded; null
 * for a new record). Pass null while the draft is invalid: nothing is written.
 * Pending changes are flushed when the screen closes or the app backgrounds.
 */
export function useAutosave<T>(value: T | null, initial: T | null, save: (value: T) => Promise<void>): Autosave {
  const [state, setState] = useState<AutosaveState>({ status: 'idle', error: null });
  const saveRef = useRef(save);
  saveRef.current = save;
  const queueRef = useRef<AutosaveQueue<T> | null>(null);
  if (queueRef.current === null) {
    queueRef.current = new AutosaveQueue<T>(
      (v) => saveRef.current(v),
      (status, error) =>
        setState({ status, error: error === null ? null : error instanceof Error ? error.message : String(error) }),
    );
  }
  const lastSerialized = useRef<string | null>(initial === null ? null : JSON.stringify(initial));

  const serialized = value === null ? null : JSON.stringify(value);
  useEffect(() => {
    const queue = queueRef.current!;
    if (value === null) {
      queue.cancel();
      // Forget the cancelled value so returning to it still saves.
      lastSerialized.current = INVALID;
      return;
    }
    if (serialized === lastSerialized.current) return;
    lastSerialized.current = serialized;
    queue.schedule(value);
  }, [serialized]);

  useEffect(() => {
    const queue = queueRef.current!;
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') void queue.flush();
    });
    return () => {
      subscription.remove();
      void queue.flush();
    };
  }, []);

  const controls = useRef({
    flush: () => queueRef.current!.flush(),
    cancel: () => queueRef.current!.cancel(),
  }).current;
  return { ...state, ...controls };
}
