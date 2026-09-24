import {
  seriesKeyOf,
  validateReading,
  type GapReason,
  type MeasurementEvent,
  type MeasurementMode,
  type MeasurementProvider,
  type PerformanceTestConfig,
  type ProviderState,
  type Reading,
  type Sample,
  type SessionStatus,
  type SurveyGap,
  type SurveyRepository,
  type SurveySeries,
  type SurveySession,
  type TestScope,
  type Unsubscribe,
  type Vec3,
} from '@/core';

export interface RecorderDeps {
  readonly surveys: SurveyRepository;
  readonly provider: MeasurementProvider;
  readonly newId: () => string;
  readonly now: () => number;
  /** No accepted reading for this long while running opens a "stale_data" gap. */
  readonly staleAfterMs: number;
}

export interface SessionTarget {
  readonly projectId: string;
  readonly locationId: string;
  readonly mode: MeasurementMode;
}

/** A sample with a position, kept for the live pin board (display only). */
export interface PlacedSample {
  readonly id: string;
  readonly position: Vec3;
  readonly sample: Sample;
}

export interface RecorderSnapshot {
  readonly sessionId: string;
  readonly mode: MeasurementMode;
  readonly status: SessionStatus;
  readonly providerState: ProviderState;
  readonly providerReason: string | null;
  /** Latest accepted reading. Raw value; the UI never smooths it. */
  readonly lastReading: Reading | null;
  readonly accepted: number;
  readonly rejected: number;
  readonly lastRejection: string | null;
  readonly openGap: GapReason | null;
  readonly gapCount: number;
  readonly seriesCount: number;
  readonly pin: Vec3 | null;
  readonly testRunning: TestScope | null;
  /** Receipt times (epoch ms) of recently accepted readings, for the cadence display. */
  readonly recentReceipts: readonly number[];
  readonly placed: readonly PlacedSample[];
  /** Latest accepted performance result per scope; local and internet are never merged. */
  readonly latestByScope: Readonly<Partial<Record<TestScope, Reading>>>;
}

/** Manual pins live in the location's own frame until Stage 3A aligns plans and tracking. */
export const manualFrameId = (locationId: string) => `manual:${locationId}`;

const RECENT_WINDOW_MS = 10_000;
const PLACED_LIMIT = 2_000;

/**
 * Records one survey session: owns the provider subscription, turns readings
 * into samples with survey context, and records gaps instead of filling them.
 * Every mutation runs on one queue so events and commands never interleave.
 */
export class SurveyRecorder {
  private snapshot: RecorderSnapshot;
  private session: SurveySession;
  private readonly seriesByKey = new Map<string, string>();
  private openGap: SurveyGap | null = null;
  private lastSeriesId: string | null = null;
  private lastAcceptedAtMs: number;
  private testPin: Vec3 | null = null;
  private queue: Promise<void> = Promise.resolve();
  private readonly listeners = new Set<(s: RecorderSnapshot) => void>();
  private unsubscribeProvider: Unsubscribe | null = null;

  private constructor(
    private readonly deps: RecorderDeps,
    session: SurveySession,
  ) {
    this.session = session;
    this.lastAcceptedAtMs = session.startedAtMs;
    this.snapshot = {
      sessionId: session.id,
      mode: session.mode,
      status: session.status,
      providerState: 'idle',
      providerReason: null,
      lastReading: null,
      accepted: 0,
      rejected: 0,
      lastRejection: null,
      openGap: null,
      gapCount: 0,
      seriesCount: 0,
      pin: null,
      testRunning: null,
      recentReceipts: [],
      placed: [],
      latestByScope: {},
    };
  }

  /** Creates a recording session. Signal mode starts the provider immediately. */
  static async start(deps: RecorderDeps, target: SessionTarget): Promise<SurveyRecorder> {
    const session: SurveySession = {
      id: deps.newId(),
      projectId: target.projectId,
      locationId: target.locationId,
      mode: target.mode,
      status: 'recording',
      startedAtMs: deps.now(),
      endedAtMs: null,
    };
    await deps.surveys.saveSession(session);
    const recorder = new SurveyRecorder(deps, session);
    recorder.unsubscribeProvider = deps.provider.subscribe((event) => recorder.enqueue(() => recorder.onEvent(event)));
    if (target.mode === 'signal') await recorder.enqueue(() => deps.provider.start({ sessionId: session.id, targetBssid: null, performance: null }));
    return recorder;
  }

  get current(): RecorderSnapshot {
    return this.snapshot;
  }

  subscribe(listener: (s: RecorderSnapshot) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Stops the source (no radio activity while paused) and records a "paused" gap. */
  pause(): Promise<void> {
    return this.enqueue(async () => {
      if (this.session.status !== 'recording' || this.snapshot.testRunning) return;
      await this.deps.provider.stop();
      const now = this.deps.now();
      await this.closeGap(now);
      await this.setStatus('paused', null);
      await this.openGapAt('paused', now, null);
    });
  }

  resume(): Promise<void> {
    return this.enqueue(async () => {
      if (this.session.status !== 'paused') return;
      const now = this.deps.now();
      await this.closeGap(now);
      await this.setStatus('recording', null);
      this.lastAcceptedAtMs = now;
      if (this.session.mode === 'signal') {
        await this.deps.provider.start({ sessionId: this.session.id, targetBssid: null, performance: null });
      }
    });
  }

  finish(): Promise<void> {
    return this.enqueue(async () => {
      if (this.session.status === 'completed') return;
      await this.deps.provider.stop();
      this.unsubscribeProvider?.();
      this.unsubscribeProvider = null;
      const now = this.deps.now();
      await this.closeGap(now);
      await this.setStatus('completed', now);
    });
  }

  /** Marks where the phone is. Readings are tagged with this point until it moves or is cleared. */
  setPin(pin: Vec3 | null): Promise<void> {
    return this.enqueue(async () => this.update({ pin }));
  }

  /**
   * Runs one performance test at the current pin. The caller confirms Wi-Fi and
   * stillness; a result is discarded if the pin moves while the test runs.
   */
  runPerformanceTest(config: PerformanceTestConfig): Promise<void> {
    return this.enqueue(async () => {
      if (this.session.mode !== 'performance') throw new Error('Performance tests run in a Performance session only');
      if (this.session.status !== 'recording') throw new Error('Resume the session before running a test');
      if (!this.snapshot.pin) throw new Error('Mark your position on the map before running a test');
      if (this.snapshot.testRunning) throw new Error('A test is already running');
      this.testPin = this.snapshot.pin;
      this.update({ testRunning: config.scope });
    }).then(() =>
      // The test itself runs outside the queue so its events (and the result) can be processed.
      this.deps.provider
        .start({ sessionId: this.session.id, targetBssid: null, performance: config })
        .finally(() => this.enqueue(async () => this.update({ testRunning: null }))),
    );
  }

  /** Called about once a second by the screen; opens a stale-data gap when readings stop arriving. */
  checkFreshness(): Promise<void> {
    return this.enqueue(async () => {
      if (this.session.mode !== 'signal' || this.session.status !== 'recording' || this.openGap) return;
      if (this.deps.now() - this.lastAcceptedAtMs > this.deps.staleAfterMs) {
        await this.openGapAt('stale_data', this.lastAcceptedAtMs, this.lastSeriesId);
      }
    });
  }

  private enqueue(task: () => Promise<void> | void): Promise<void> {
    const run = this.queue.then(task);
    this.queue = run.catch(() => undefined);
    return run;
  }

  private update(patch: Partial<RecorderSnapshot>): void {
    this.snapshot = { ...this.snapshot, ...patch };
    for (const listener of this.listeners) listener(this.snapshot);
  }

  private async setStatus(status: SessionStatus, endedAtMs: number | null): Promise<void> {
    this.session = { ...this.session, status, endedAtMs };
    await this.deps.surveys.saveSession(this.session);
    this.update({ status });
  }

  private async openGapAt(reason: GapReason, startedAtMs: number, seriesId: string | null): Promise<void> {
    this.openGap = { id: this.deps.newId(), sessionId: this.session.id, seriesId, reason, startedAtMs, endedAtMs: null };
    await this.deps.surveys.recordGap(this.openGap);
    this.update({ openGap: reason, gapCount: this.snapshot.gapCount + 1 });
  }

  private async closeGap(endedAtMs: number): Promise<void> {
    if (!this.openGap) return;
    await this.deps.surveys.recordGap({ ...this.openGap, endedAtMs: Math.max(endedAtMs, this.openGap.startedAtMs) });
    this.openGap = null;
    this.update({ openGap: null });
  }

  private reject(detail: string): void {
    this.update({ rejected: this.snapshot.rejected + 1, lastRejection: detail });
  }

  private async onEvent(event: MeasurementEvent): Promise<void> {
    if (this.session.status === 'completed') return;
    if (event.type === 'state') {
      this.update({ providerState: event.state, providerReason: event.reason });
      const lost = event.state === 'disconnected' || (event.state === 'error' && this.session.mode === 'signal');
      if (lost && this.session.status === 'recording') {
        // A disconnect stops samples at once; the gap stays open until a fresh reading arrives.
        await this.closeGap(this.deps.now());
        await this.openGapAt('source_disconnected', this.deps.now(), this.lastSeriesId);
      }
      return;
    }
    if (event.type === 'gap') {
      if (this.session.status !== 'recording') return;
      const gap: SurveyGap = { id: this.deps.newId(), sessionId: this.session.id, seriesId: this.lastSeriesId, ...event };
      await this.deps.surveys.recordGap(gap);
      this.update({ gapCount: this.snapshot.gapCount + 1 });
      return;
    }
    await this.onReading(event.reading);
  }

  private async onReading(input: Reading): Promise<void> {
    if (this.session.status !== 'recording') return this.reject('Reading arrived while the session was not recording');
    const checked = validateReading(input);
    if (!checked.ok) return this.reject(checked.detail);
    const reading = checked.value;

    let position: Vec3 | null = this.snapshot.pin;
    if (reading.kind === 'performance') {
      if (this.session.mode !== 'performance') return this.reject('Performance result in a Signal session');
      if (!this.testPin || this.snapshot.pin !== this.testPin) {
        this.testPin = null;
        return this.reject('Position changed during the test; result discarded');
      }
      position = this.testPin;
      this.testPin = null;
    } else if (this.session.mode !== 'signal') {
      return this.reject('RSSI reading in a Performance session');
    }

    const seriesId = await this.seriesFor(reading);
    const sample: Sample = {
      ...reading,
      projectId: this.session.projectId,
      locationId: this.session.locationId,
      sessionId: this.session.id,
      seriesId,
      frameId: position ? manualFrameId(this.session.locationId) : null,
      position,
      positionSource: position ? 'manual_pin' : null,
      trackingQuality: position ? 'manual' : 'not_available',
    };
    const result = await this.deps.surveys.appendSamples([sample]);
    const failure = result.rejected[0];
    if (failure) return this.reject(failure.detail);

    await this.closeGap(reading.collectedStartMs);
    this.lastAcceptedAtMs = reading.receivedAtMs;
    this.lastSeriesId = seriesId;
    const cutoff = this.deps.now() - RECENT_WINDOW_MS;
    this.update({
      lastReading: reading,
      accepted: this.snapshot.accepted + 1,
      recentReceipts: [...this.snapshot.recentReceipts.filter((t) => t >= cutoff), reading.receivedAtMs],
      placed: position ? [...this.snapshot.placed, { id: sample.id, position, sample }].slice(-PLACED_LIMIT) : this.snapshot.placed,
      latestByScope: reading.kind === 'performance' ? { ...this.snapshot.latestByScope, [reading.scope]: reading } : this.snapshot.latestByScope,
    });
  }

  /** A change of source, network or metric set starts a new series. */
  private async seriesFor(reading: Reading): Promise<string> {
    const key = seriesKeyOf(reading);
    const existing = this.seriesByKey.get(key);
    if (existing) return existing;
    const series: SurveySeries = {
      id: this.deps.newId(),
      sessionId: this.session.id,
      seriesKey: key,
      kind: reading.kind,
      sourceKind: reading.source.kind,
      providerId: reading.source.providerId,
      deviceId: reading.source.deviceId,
      network: reading.network,
      scope: reading.kind === 'performance' ? reading.scope : null,
      endpointId: reading.kind === 'performance' ? reading.endpointId : null,
      startedAtMs: reading.collectedStartMs,
    };
    await this.deps.surveys.saveSeries(series);
    this.seriesByKey.set(key, series.id);
    this.update({ seriesCount: this.seriesByKey.size });
    return series.id;
  }
}

/** Readings per second over the recent window, from receipt times. */
export function readingRate(receipts: readonly number[], nowMs: number, windowMs = RECENT_WINDOW_MS): number {
  const recent = receipts.filter((t) => t >= nowMs - windowMs && t <= nowMs);
  return recent.length / (windowMs / 1000);
}
