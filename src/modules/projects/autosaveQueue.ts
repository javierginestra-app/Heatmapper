export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

type Timers = {
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (handle: unknown) => void;
};

/**
 * Debounced, serialized saves: the latest value wins, saves never overlap, and
 * a failed value is kept so the next change or flush retries it.
 */
export class AutosaveQueue<T> {
  private pending: { value: T } | null = null;
  private timer: unknown = null;
  private inFlight: Promise<void> | null = null;

  constructor(
    private readonly save: (value: T) => Promise<void>,
    private readonly onStatus: (status: SaveStatus, error: unknown) => void,
    private readonly delayMs = 500,
    private readonly timers: Timers = globalThis as unknown as Timers,
  ) {}

  schedule(value: T): void {
    this.pending = { value };
    this.onStatus('pending', null);
    this.clearTimer();
    this.timer = this.timers.setTimeout(() => {
      this.timer = null;
      void this.drain();
    }, this.delayMs);
  }

  /** Drops an unsaved value, e.g. when the draft became invalid. */
  cancel(): void {
    this.clearTimer();
    this.pending = null;
  }

  /** Saves any pending value now and resolves once everything is written. */
  async flush(): Promise<void> {
    this.clearTimer();
    await this.drain();
  }

  private clearTimer(): void {
    if (this.timer !== null) this.timers.clearTimeout(this.timer);
    this.timer = null;
  }

  private async drain(): Promise<void> {
    while (this.inFlight) await this.inFlight;
    if (!this.pending) return;
    const { value } = this.pending;
    this.pending = null;
    this.onStatus('saving', null);
    this.inFlight = this.save(value).then(
      () => {
        if (!this.pending) this.onStatus('saved', null);
      },
      (error: unknown) => {
        if (!this.pending) this.pending = { value };
        this.onStatus('error', error);
      },
    );
    try {
      await this.inFlight;
    } finally {
      this.inFlight = null;
    }
  }
}
