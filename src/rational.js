/**
 * Time utilities for FCPXML rational number formatting.
 * All time values in FCPXML must be expressed as rational numbers: e.g. "1001/30000s"
 */

/**
 * Parses a frame rate rational string like "30000/1001" into { num, den }.
 */
export function parseFrameRate (rational) {
  const parts = rational.split('/').map(Number);
  return { num: parts[0], den: parts[1] ?? 1 };
}

/**
 * Converts a duration in seconds to an FCPXML rational time string.
 * Uses the project frame rate to snap to the nearest frame boundary.
 *
 * e.g. toRational(10, '30000/1001') → '300300/30000s'  (300 frames at 29.97fps)
 */
export function toRational (seconds, frameRateRational) {
  const { num, den } = parseFrameRate(frameRateRational);
  const fps = num / den;
  const frames = Math.round(seconds * fps);
  // frames * (den/num) seconds = frames * den / num seconds
  // Express as: (frames * den) / num s
  const numerator = frames * den;
  const denominator = num;
  const g = gcd(numerator, denominator);
  return `${numerator / g}/${denominator / g}s`;
}

/**
 * Converts a frame count to an FCPXML rational time string.
 */
export function framesToRational (frames, frameRateRational) {
  const { num, den } = parseFrameRate(frameRateRational);
  const numerator = frames * den;
  const denominator = num;
  const g = gcd(numerator, denominator);
  return `${numerator / g}/${denominator / g}s`;
}

/**
 * Converts seconds to a frame count at the given frame rate.
 */
export function secondsToFrames (seconds, frameRateRational) {
  const { num, den } = parseFrameRate(frameRateRational);
  return Math.round(seconds * (num / den));
}

function gcd (a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) {
    [a, b] = [b, a % b];
  }
  return a || 1;
}
