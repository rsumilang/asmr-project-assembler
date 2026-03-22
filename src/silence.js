import { readWavSamples } from './wav.js';

const SAMPLE_RATE = 16000;

/**
 * Converts a linear amplitude value to dBFS.
 */
function toDb (linear) {
  if (linear <= 0) return -Infinity;
  return 20 * Math.log10(linear);
}

/**
 * Analyzes a WAV fingerprint to find the first and last non-silent sample,
 * then converts to in/out points on the source clip in seconds.
 *
 * Because the WAV is only the first `fingerprintDuration` seconds of the clip,
 * silence at the tail end of a long clip can't be detected from the fingerprint alone.
 * We mark the tail as the clip's full duration in that case.
 *
 * Returns:
 * {
 *   inPoint,    // seconds — first non-silent moment
 *   outPoint,   // seconds — last non-silent moment (or clip duration if tail not in fingerprint)
 *   tailTruncated,  // true if outPoint was clamped to clip duration (fingerprint too short)
 * }
 *
 * windowMs: RMS window size in milliseconds (default 50ms)
 */
export function analyzeSilence (wavPath, clipDuration, fingerprintDuration, thresholdDb, handleFrames, frameRateRational) {
  const samples = readWavSamples(wavPath);
  const [num, den] = frameRateRational.split('/').map(Number);
  const fps = num / den;
  const frameDuration = 1 / fps;
  const handleSeconds = handleFrames * frameDuration;

  const windowSamples = Math.floor(SAMPLE_RATE * 0.05); // 50ms RMS window

  // Compute RMS energy per window
  const windows = Math.floor(samples.length / windowSamples);
  const rms = new Float32Array(windows);
  for (let w = 0; w < windows; w++) {
    let sum = 0;
    for (let i = 0; i < windowSamples; i++) {
      const s = samples[w * windowSamples + i];
      sum += s * s;
    }
    rms[w] = Math.sqrt(sum / windowSamples);
  }

  const windowDuration = windowSamples / SAMPLE_RATE;

  // First non-silent window
  let firstActive = 0;
  for (let w = 0; w < rms.length; w++) {
    if (toDb(rms[w]) >= thresholdDb) {
      firstActive = w;
      break;
    }
  }

  // Last non-silent window
  let lastActive = rms.length - 1;
  for (let w = rms.length - 1; w >= 0; w--) {
    if (toDb(rms[w]) >= thresholdDb) {
      lastActive = w;
      break;
    }
  }

  const rawIn = firstActive * windowDuration;
  const rawOut = (lastActive + 1) * windowDuration;

  // Apply handles (clamp to [0, clipDuration])
  const inPoint = Math.max(0, rawIn - handleSeconds);

  const fingerprintCoversEnd = fingerprintDuration >= clipDuration;
  let outPoint;
  let tailTruncated = false;

  if (fingerprintCoversEnd) {
    outPoint = Math.min(clipDuration, rawOut + handleSeconds);
  } else {
    // We can only trim the head from the fingerprint; tail defaults to clip duration
    outPoint = clipDuration;
    tailTruncated = true;
  }

  return { inPoint, outPoint, tailTruncated };
}
