import { readFileSync } from 'fs';

const WAV_HEADER_BYTES = 44;

/**
 * Reads PCM samples from a 16kHz mono 16-bit WAV file.
 * Returns a Float32Array of normalized samples in [-1, 1].
 */
export function readWavSamples (wavPath) {
  const buf = readFileSync(wavPath);
  const numSamples = (buf.length - WAV_HEADER_BYTES) / 2;
  const samples = new Float32Array(numSamples);
  for (let i = 0; i < numSamples; i++) {
    samples[i] = buf.readInt16LE(WAV_HEADER_BYTES + i * 2) / 32768;
  }
  return samples;
}
