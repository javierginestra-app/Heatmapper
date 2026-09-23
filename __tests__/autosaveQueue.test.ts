import { AutosaveQueue, type SaveStatus } from '@/modules/projects/autosaveQueue';

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
}

describe('autosave queue', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  function make(save: (v: string) => Promise<void>) {
    const statuses: SaveStatus[] = [];
    const queue = new AutosaveQueue(save, (s) => statuses.push(s), 500, { setTimeout, clearTimeout } as never);
    return { queue, statuses };
  }

  it('debounces rapid edits into one save of the latest value', async () => {
    const saved: string[] = [];
    const { queue, statuses } = make(async (v) => void saved.push(v));
    queue.schedule('H');
    queue.schedule('HQ');
    await jest.advanceTimersByTimeAsync(499);
    expect(saved).toEqual([]);
    await jest.advanceTimersByTimeAsync(1);
    expect(saved).toEqual(['HQ']);
    expect(statuses.at(-1)).toBe('saved');
  });

  it('never overlaps saves and writes edits made during a save afterwards', async () => {
    const gate = deferred();
    const saved: string[] = [];
    let running = 0;
    const { queue } = make(async (v) => {
      running++;
      expect(running).toBe(1);
      if (v === 'a') await gate.promise;
      saved.push(v);
      running--;
    });
    queue.schedule('a');
    await jest.advanceTimersByTimeAsync(500);
    queue.schedule('b');
    await jest.advanceTimersByTimeAsync(500);
    gate.resolve();
    await queue.flush();
    expect(saved).toEqual(['a', 'b']);
  });

  it('flush writes immediately (screen close / app background)', async () => {
    const saved: string[] = [];
    const { queue } = make(async (v) => void saved.push(v));
    queue.schedule('x');
    await queue.flush();
    expect(saved).toEqual(['x']);
  });

  it('keeps a failed value and retries it on the next flush', async () => {
    let fail = true;
    const saved: string[] = [];
    const { queue, statuses } = make(async (v) => {
      if (fail) throw new Error('disk full');
      saved.push(v);
    });
    queue.schedule('x');
    await queue.flush();
    expect(statuses.at(-1)).toBe('error');
    fail = false;
    await queue.flush();
    expect(saved).toEqual(['x']);
  });

  it('cancel drops an unsaved value', async () => {
    const saved: string[] = [];
    const { queue } = make(async (v) => void saved.push(v));
    queue.schedule('invalid');
    queue.cancel();
    await queue.flush();
    await jest.advanceTimersByTimeAsync(1000);
    expect(saved).toEqual([]);
  });
});
