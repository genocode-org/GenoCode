// Beat tracking: finds the tempo in the onsets of the last few seconds of music, where the beats
// fall, and keeps a steady beat clock that follows them.

/** Tempos the tracker looks for, in beats a minute. */
const SLOWEST = 60;
const FASTEST = 180;
/** The tempo it prefers when several fit, and how strongly (in octaves of tempo). */
const PREFERRED = 120;
const PREFERENCE_WIDTH = 1;
/** Seconds over which a tempo is judged by how its beats repeat. */
const SPAN = 4;
/** Steps between the lags tried, in onsets: a beat's lag seldom falls on a whole number of them. */
const LAG_STEP = 0.25;
/** How much more the lowest octaves' onsets count than the others when placing the beats. */
const KICK = 1;
/** Estimates in a row a new tempo or beat must hold before the clock takes it. */
const STREAK = 3;
/** How much better beats far from the clock's must fit before they count against it. */
const MARGIN = 0.2;
/** Seconds of onsets it looks back over, and how often it looks again. */
const WINDOW = 8;
const EVERY = 0.5;
/** How much of a new estimate's phase and tempo the clock takes on each time. */
const PULL = 0.3;
/** The share of the onsets' energy the tempo must explain to count as a beat. */
const CONFIDENCE = 0.1;

export class BeatTracker {
  private readonly onsets: Float64Array;
  private readonly lows: Float64Array;
  private count = 0;
  private sinceEstimate = 0;
  /** Seconds a beat, or undefined while there's no beat to follow. */
  private period: number | undefined;
  /** A time when a beat fell, kept near the latest beat. */
  private anchor = 0;
  /** Estimates in a row that disagree with the clock. */
  private doubts = 0;

  /** `rate`: onset values a second. */
  constructor(private readonly rate: number) {
    this.onsets = new Float64Array(Math.round(WINDOW * rate));
    this.lows = new Float64Array(this.onsets.length);
  }

  /** Adds the onset strength at time `time` (seconds), and the part of it in the lowest octaves. */
  push(onset: number, time: number, low = onset): void {
    this.onsets[this.count % this.onsets.length] = onset;
    this.lows[this.count % this.onsets.length] = low;
    this.count++;
    this.sinceEstimate += 1 / this.rate;
    if (this.sinceEstimate >= EVERY && this.count >= this.onsets.length / 2) {
      this.sinceEstimate = 0;
      this.estimate(time);
    }
  }

  /** The position within the beat at `time`: 0 on the beat, rising towards 1. 0 with no beat. */
  at(time: number): number {
    if (this.period === undefined) return 0;
    const p = (time - this.anchor) / this.period;
    return p - Math.floor(p);
  }

  /** Beats a minute, or undefined while there's no beat. */
  get tempo(): number | undefined {
    return this.period === undefined ? undefined : 60 / this.period;
  }

  reset(): void {
    this.onsets.fill(0);
    this.lows.fill(0);
    this.count = 0;
    this.sinceEstimate = 0;
    this.period = undefined;
    this.doubts = 0;
  }

  /** The last `n` values of a ring, oldest first, less their mean. */
  private window(ring: Float64Array, n: number): Float64Array {
    const o = new Float64Array(n);
    for (let i = 0; i < n; i++) o[i] = ring[(this.count - n + i) % ring.length]!;
    let mean = 0;
    for (const v of o) mean += v;
    mean /= n;
    for (let i = 0; i < n; i++) o[i]! -= mean;
    return o;
  }

  private estimate(time: number): void {
    const n = Math.min(this.count, this.onsets.length);
    const o = this.window(this.onsets, n);
    const lo = this.window(this.lows, n);

    const r = (lag: number): number => {
      let s = 0;
      for (let i = lag; i < n; i++) s += o[i]! * o[i - lag]!;
      return s / (n - lag);
    };
    const r0 = r(0);
    if (r0 <= 1e-12) {
      this.period = undefined;
      return;
    }
    const shortest = Math.floor((this.rate * 60) / FASTEST);
    const longest = Math.ceil((this.rate * 60) / SLOWEST);
    const most = Math.min(n - 2, Math.ceil(SPAN * this.rate) + 1);
    const scores = new Float64Array(most + 2);
    for (let lag = shortest - 1; lag <= most + 1; lag++) scores[lag] = r(lag);
    // The autocorrelation near any lag: the top of a parabola through the whole lags round it.
    // A beat whose lag falls between two whole lags keeps its full height, so no tempo is
    // favoured just because its lag happens to be a whole number.
    const at = (lag: number): number => {
      const i = Math.round(lag);
      if (i < 1 || i + 1 > most + 1) return 0;
      const a = scores[i - 1]!;
      const b = scores[i]!;
      const c = scores[i + 1]!;
      const bend = a - 2 * b + c;
      if (bend >= 0) return b;
      return Math.abs(a - c) <= -2 * bend ? b - ((c - a) * (c - a)) / (8 * bend) : b;
    };
    // A beat repeats at two, three and more beats too: a lag scores how well the onsets match
    // at all its multiples within SPAN seconds, on average. The real beat matches at every one;
    // a lag of one and a half beats, say, does not, and every tempo is judged over the same time.
    const repeats = (lag: number): number => {
      let s = 0;
      let k = 1;
      for (; k * lag <= SPAN * this.rate && k * lag < most; k++) s += at(k * lag);
      return s / Math.max(1, k - 1);
    };
    let best = 0;
    let bestScore = -Infinity;
    for (let lag = shortest; lag <= longest; lag += LAG_STEP) {
      const bpm = (this.rate * 60) / lag;
      const octaves = Math.log2(bpm / PREFERRED) / PREFERENCE_WIDTH;
      const score = repeats(lag) * Math.exp(-0.5 * octaves * octaves);
      if (score > bestScore) {
        bestScore = score;
        best = lag;
      }
    }
    if (at(best) / r0 < CONFIDENCE) {
      this.period = undefined;
      return;
    }
    // The lag itself, finer than the steps: the top of the parabola through the nearest whole lags.
    const near = Math.round(best);
    const a = scores[near - 1]!;
    const b = scores[near]!;
    const c = scores[near + 1]!;
    const bend = a - 2 * b + c;
    const top = bend < 0 ? near + (0.5 * (a - c)) / bend : best;
    const lag = Math.abs(top - best) <= 0.5 ? top : best;
    const period = lag / this.rate;

    // Where the beats fall: the offset whose comb of beats lands on the most onset energy. The
    // kick drum's octaves count extra, so off-beat hi-hats don't pull the beat between beats.
    const spread = (x: Float64Array): number => {
      let s = 0;
      for (const v of x) s += v * v;
      return Math.sqrt(s / n) || 1;
    };
    const so = spread(o);
    const sl = spread(lo);
    /** How much onset energy a comb of beats lands on, the latest beat `p` onsets back from now. */
    const comb = (p: number): number => {
      let s = 0;
      for (let k = 0; ; k++) {
        const i = Math.round(n - 1 - p - k * lag);
        if (i < 0) break;
        s += (o[i]! / so + (KICK * lo[i]!) / sl) * (1 - k / 32);
      }
      return s;
    };
    const steps = Math.floor(lag);
    let phase = 0;
    let phaseScore = -Infinity;
    for (let p = 0; p < steps; p++) {
      const s = comb(p);
      if (s > phaseScore) {
        phaseScore = s;
        phase = p;
      }
    }
    const beatTime = time - phase / this.rate;

    if (this.period === undefined) {
      this.period = period;
      this.anchor = beatTime;
      this.doubts = 0;
      return;
    }
    // Keep the anchor on the latest beat, so a change of period turns the clock about now and
    // not about a beat long past (which would throw the beat off by more the longer it runs).
    this.anchor += Math.round((time - this.anchor) / this.period) * this.period;
    let error = (beatTime - this.anchor) / this.period;
    error -= Math.round(error);
    // A new tempo, or beats falling far from the clock's (between its beats, say), is only taken
    // once it has held for a while: one odd estimate doesn't throw the dance off its beat.
    // Beats far from the clock's only count as a doubt when they fit the music clearly better
    // than the clock's own beats do: when two places fit about as well, the clock stays.
    const beats = (time - this.anchor) / this.period;
    const since = (beats - Math.floor(beats)) * this.period * this.rate;
    const far = Math.abs(error) > 0.25 && phaseScore > comb(since) * (1 + MARGIN);
    if (Math.abs(period / this.period - 1) > 0.1 || far) {
      if (++this.doubts < STREAK) return;
      this.doubts = 0;
      this.period = period;
      this.anchor = beatTime;
      return;
    }
    this.doubts = 0;
    this.period += (period - this.period) * PULL;
    if (Math.abs(error) <= 0.25) this.anchor += error * this.period * PULL;
  }
}
