// Voice activity detection from the recorder's metering level (dBFS, about
// -160 for silence up to 0 for very loud). It learns the room's background
// level first, so it works in a quiet bedroom and a noisy café.

export type VadEvent = "speech_start" | "speech_end" | "no_speech" | null;

export type VadOptions = {
  calibrateMs: number; // listen to the room before deciding what "speech" is
  marginDb: number; // how far above background counts as speech
  minThresholdDb: number;
  maxThresholdDb: number;
  speechStartMs: number; // this long above threshold = started talking
  silenceEndMs: number; // this long quiet after talking = finished
  noSpeechTimeoutMs: number; // give up if nobody talks
  maxUtteranceMs: number; // cut off very long turns
};

export const DEFAULT_VAD: VadOptions = {
  calibrateMs: 400,
  marginDb: 14,
  minThresholdDb: -50,
  maxThresholdDb: -22,
  speechStartMs: 250,
  silenceEndMs: 1100,
  noSpeechTimeoutMs: 20_000,
  maxUtteranceMs: 30_000,
};

export class Vad {
  private readonly opts: VadOptions;
  private startedAt: number | null = null;
  private calibration: number[] = [];
  private threshold: number | null = null;
  private aboveSince: number | null = null;
  private belowSince: number | null = null;
  private speechAt: number | null = null;
  private done = false;

  constructor(opts: Partial<VadOptions> = {}) {
    this.opts = { ...DEFAULT_VAD, ...opts };
  }

  get speaking() {
    return this.speechAt !== null;
  }

  /** How long the user talked, from speech start to the last loud moment. */
  speechMs(now: number): number {
    if (this.speechAt === null) return 0;
    return Math.max(0, (this.belowSince ?? now) - this.speechAt);
  }

  /** Feed one metering sample; returns an event when something changes. */
  push(db: number | undefined, now: number): VadEvent {
    if (this.done) return null;
    const level = typeof db === "number" && Number.isFinite(db) ? db : -160;
    this.startedAt ??= now;
    const o = this.opts;

    if (this.threshold === null) {
      this.calibration.push(level);
      if (now - this.startedAt < o.calibrateMs) return null;
      const sorted = [...this.calibration].sort((a, b) => a - b);
      const floor = sorted[Math.floor(sorted.length / 2)];
      this.threshold = Math.min(o.maxThresholdDb, Math.max(o.minThresholdDb, floor + o.marginDb));
    }

    const loud = level >= this.threshold;
    if (this.speechAt === null) {
      if (loud) {
        this.aboveSince ??= now;
        if (now - this.aboveSince >= o.speechStartMs) {
          this.speechAt = this.aboveSince;
          return "speech_start";
        }
      } else {
        this.aboveSince = null;
      }
      if (now - this.startedAt >= o.noSpeechTimeoutMs) return this.finish("no_speech");
      return null;
    }

    if (now - this.speechAt >= o.maxUtteranceMs) return this.finish("speech_end");
    // A few dB of hysteresis so trailing-off words don't end the turn early.
    if (level < this.threshold - 3) {
      this.belowSince ??= now;
      if (now - this.belowSince >= o.silenceEndMs) return this.finish("speech_end");
    } else {
      this.belowSince = null;
    }
    return null;
  }

  private finish(e: VadEvent): VadEvent {
    this.done = true;
    return e;
  }
}
