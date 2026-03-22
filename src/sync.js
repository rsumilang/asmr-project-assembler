import fft from 'fft-js';
import { readWavSamples } from './wav.js';

const { fft: computeFFT } = fft;

const SAMPLE_RATE = 16000;

/**
 * Returns the next power of 2 >= n.
 */
function nextPow2 (n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

/**
 * Pads an array with zeros to the target length.
 */
function zeroPad (arr, len) {
  const out = new Array(len).fill(0);
  for (let i = 0; i < arr.length && i < len; i++) out[i] = arr[i];
  return out;
}

/**
 * Computes the FFT-based cross-correlation between two real-valued sample arrays.
 * Returns { offsetSamples, confidence } where:
 *   offsetSamples > 0 means `b` starts that many samples AFTER `a`
 *   offsetSamples < 0 means `b` starts that many samples BEFORE `a`
 *   confidence is in [0, 1] — normalized peak height
 */
export function crossCorrelate (samplesA, samplesB) {
  const len = nextPow2(samplesA.length + samplesB.length - 1);

  const sigA = zeroPad(Array.from(samplesA), len);
  const sigB = zeroPad(Array.from(samplesB), len);

  // fft-js expects arrays of real numbers and returns [[re, im], ...]
  const freqA = computeFFT(sigA);
  const freqB = computeFFT(sigB);

  // Cross-correlation in frequency domain: A * conj(B)
  const product = freqA.map(([reA, imA], i) => {
    const [reB, imB] = freqB[i];
    return [reA * reB + imA * imB, imA * reB - reA * imB];
  });

  // Inverse FFT via conjugate trick: IFFT(X) = conj(FFT(conj(X))) / N
  const conjProduct = product.map(([re, im]) => [re, -im]);
  const ifftRaw = computeFFT(conjProduct);
  const corr = ifftRaw.map(([re]) => re / len);

  // Find peak
  let maxVal = -Infinity;
  let maxIdx = 0;
  for (let i = 0; i < corr.length; i++) {
    if (corr[i] > maxVal) {
      maxVal = corr[i];
      maxIdx = i;
    }
  }

  // Normalize confidence against zero-lag energy
  const energy = Math.sqrt(
    samplesA.reduce((s, x) => s + x * x, 0) *
    samplesB.reduce((s, x) => s + x * x, 0)
  );
  const confidence = energy > 0 ? Math.min(1, maxVal / (energy / len)) : 0;

  // Convert circular index to signed offset
  let offsetSamples = maxIdx;
  if (offsetSamples > len / 2) offsetSamples -= len;

  return { offsetSamples, confidence };
}

/**
 * Given a WAV file for a secondary clip, finds the best-matching primary clip
 * by cross-correlating against all primary WAVs.
 *
 * primaryWavs: [{ clipPath, wavPath }]
 * secondaryWavPath: string
 *
 * Returns:
 * {
 *   matchedPrimaryIndex,   // index into primaryWavs
 *   matchedPrimaryPath,    // clip path of matched primary
 *   offsetSamples,         // secondary starts this many samples after the start of matched primary
 *   offsetSeconds,
 *   confidence,
 * }
 */
export function findBestPrimaryMatch (primaryWavs, secondaryWavPath) {
  const secSamples = readWavSamples(secondaryWavPath);

  let best = null;

  for (let i = 0; i < primaryWavs.length; i++) {
    const { clipPath, wavPath } = primaryWavs[i];
    const priSamples = readWavSamples(wavPath);

    const { offsetSamples, confidence } = crossCorrelate(priSamples, secSamples);

    if (!best || confidence > best.confidence) {
      best = { matchedPrimaryIndex: i, matchedPrimaryPath: clipPath, offsetSamples, confidence };
    }
  }

  return {
    ...best,
    offsetSeconds: best.offsetSamples / SAMPLE_RATE
  };
}

/**
 * Converts a sample offset at 16kHz to a frame offset at the given frame rate rational.
 */
export function samplesToFrames (offsetSamples, frameRateRational) {
  const [num, den] = frameRateRational.split('/').map(Number);
  const fps = num / den;
  return Math.round((offsetSamples / SAMPLE_RATE) * fps);
}
