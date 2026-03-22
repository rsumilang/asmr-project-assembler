import ffmpeg from 'fluent-ffmpeg';

/**
 * Probes a video file and returns metadata needed for FCPXML asset generation.
 *
 * Returns:
 * {
 *   path,
 *   duration,        // seconds (float)
 *   width, height,
 *   frameRate,       // rational string e.g. '30000/1001'
 *   hasVideo,
 *   hasAudio,
 *   audioChannels,
 *   audioRate,       // samples/sec integer
 *   audioBitDepth,
 * }
 */
export function probeClip (filePath) {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(filePath, (err, data) => {
      if (err) return reject(new Error(`ffprobe failed for ${filePath}: ${err.message}`));

      const videoStream = data.streams.find(s => s.codec_type === 'video');
      const audioStream = data.streams.find(s => s.codec_type === 'audio');

      const duration = parseFloat(data.format.duration);

      let frameRate = '30000/1001';
      if (videoStream) {
        const raw = videoStream.r_frame_rate || videoStream.avg_frame_rate || '30000/1001';
        frameRate = normalizeFrameRate(raw);
      }

      resolve({
        path: filePath,
        duration,
        width: videoStream ? videoStream.width : 0,
        height: videoStream ? videoStream.height : 0,
        frameRate,
        hasVideo: !!videoStream,
        hasAudio: !!audioStream,
        audioChannels: audioStream ? (audioStream.channels || 2) : 0,
        audioRate: audioStream ? (audioStream.sample_rate || 48000) : 0,
        audioBitDepth: audioStream ? (audioStream.bits_per_raw_sample || audioStream.bits_per_sample || 16) : 0
      });
    });
  });
}

/**
 * Normalizes a frame rate string to a rational.
 * ffprobe returns things like '30000/1001', '30/1', '2997/100', etc.
 * We want consistent rational notation for FCPXML.
 */
function normalizeFrameRate (raw) {
  if (!raw || raw === '0/0') return '30000/1001';

  const parts = raw.split('/');
  if (parts.length === 2) {
    const num = parseInt(parts[0], 10);
    const den = parseInt(parts[1], 10);
    if (den === 0) return '30000/1001';
    // Already a clean rational — return as-is
    return `${num}/${den}`;
  }

  // Decimal fallback
  const fps = parseFloat(raw);
  if (fps === 29.97 || Math.abs(fps - 29.97) < 0.01) return '30000/1001';
  if (fps === 23.976 || Math.abs(fps - 23.976) < 0.01) return '24000/1001';
  if (fps === 59.94 || Math.abs(fps - 59.94) < 0.01) return '60000/1001';
  if (fps === 25) return '25/1';
  if (fps === 30) return '30/1';
  if (fps === 24) return '24/1';
  if (fps === 60) return '60/1';

  // Generic: round and express as /1
  return `${Math.round(fps)}/1`;
}
