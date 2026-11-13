// The spectrum of a block of sound: how much of each frequency it holds. The octave split
// (octaves.ts) says how loud the lows and highs are; this is finer, for telling notes from noise.

/** Samples in one spectrum block. At 44.1 kHz the frequencies are 10.8 Hz apart. */
export const SPECTRUM_BLOCK = 4096;

/** Frequencies in a spectrum: 0 Hz up to just under half the sample rate. */
export const BINS = SPECTRUM_BLOCK / 2;

const window = new Float64Array(SPECTRUM_BLOCK);
for (let i = 0; i < SPECTRUM_BLOCK; i++) {
  window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / SPECTRUM_BLOCK);
}
const cos = new Float64Array(BINS);
const sin = new Float64Array(BINS);
for (let i = 0; i < BINS; i++) {
  cos[i] = Math.cos((2 * Math.PI * i) / SPECTRUM_BLOCK);
  sin[i] = Math.sin((2 * Math.PI * i) / SPECTRUM_BLOCK);
}
/** Where each sample goes before the passes: its index with the bits in reverse order. */
const reversed = new Uint16Array(SPECTRUM_BLOCK);
for (let i = 0, bits = Math.log2(SPECTRUM_BLOCK); i < SPECTRUM_BLOCK; i++) {
  let r = 0;
  for (let b = 0; b < bits; b++) r |= ((i >> b) & 1) << (bits - 1 - b);
  reversed[i] = r;
}

const re = new Float64Array(SPECTRUM_BLOCK);
const im = new Float64Array(SPECTRUM_BLOCK);

/**
 * The power at each frequency of SPECTRUM_BLOCK samples (−1..1), read from `ring` starting at
 * `from` and going round. Bin k is the frequency k · sampleRate / SPECTRUM_BLOCK. A full-scale
 * sine wave comes out as 1 in all, spread over the bins next to its frequency.
 */
export function spectrum(
  ring: Float32Array,
  from = 0,
  out: Float64Array = new Float64Array(BINS),
): Float64Array {
  const n = SPECTRUM_BLOCK;
  for (let i = 0; i < n; i++) {
    const j = reversed[i]!;
    re[j] = ring[(from + i) % n]! * window[i]!;
    im[j] = 0;
  }
  for (let size = 2; size <= n; size *= 2) {
    const half = size / 2;
    const step = n / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const c = cos[k * step]!;
        const s = sin[k * step]!;
        const a = start + k;
        const b = a + half;
        const tr = re[b]! * c + im[b]! * s;
        const ti = im[b]! * c - re[b]! * s;
        re[b] = re[a]! - tr;
        im[b] = im[a]! - ti;
        re[a]! += tr;
        im[a]! += ti;
      }
    }
  }
  // A sine wave of amplitude 1 has power ½, and the window's squares add up to 3n/8, so its bins
  // in this half of the spectrum add up to 3n²/32.
  const scale = 32 / (3 * n * n);
  for (let k = 0; k < BINS; k++) out[k] = (re[k]! * re[k]! + im[k]! * im[k]!) * scale;
  return out;
}
