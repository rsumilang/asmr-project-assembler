import ffmpeg from 'fluent-ffmpeg';
import { join } from 'path';
import { mkdirSync } from 'fs';
import { createHash } from 'crypto';

/**
 * Extracts a mono 16kHz WAV audio fingerprint from a video clip.
 * Only the first `durationSeconds` seconds are extracted.
 *
 * Returns the path to the extracted WAV file.
 */
export function extractAudio (filePath, tempDir, durationSeconds = 60) {
  mkdirSync(tempDir, { recursive: true });

  const hash = createHash('sha1').update(filePath).digest('hex').slice(0, 12);
  const outPath = join(tempDir, `${hash}.wav`);

  return new Promise((resolve, reject) => {
    const cmd = ffmpeg(filePath)
      .noVideo()
      .audioChannels(1)
      .audioFrequency(16000)
      .audioCodec('pcm_s16le')
      .duration(durationSeconds)
      .output(outPath)
      .on('end', () => resolve(outPath))
      .on('error', err => reject(new Error(`Audio extraction failed for ${filePath}: ${err.message}`)));

    cmd.run();
  });
}
