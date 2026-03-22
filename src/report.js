import { basename } from 'path';
const COL = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  dim: '\x1b[2m'
};

function b (s) { return `${COL.bold}${s}${COL.reset}`; }
function dim (s) { return `${COL.dim}${s}${COL.reset}`; }
function warn (s) { return `${COL.yellow}${s}${COL.reset}`; }
function err (s) { return `${COL.red}${s}${COL.reset}`; }

function fmt (seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h, m, s].map(n => String(n).padStart(2, '0')).join(':');
}

function confidenceBar (c) {
  const filled = Math.round(c * 10);
  const bar = '█'.repeat(filled) + '░'.repeat(10 - filled);
  const color = c >= 0.7 ? COL.green : c >= 0.4 ? COL.yellow : COL.red;
  return `${color}${bar}${COL.reset} ${(c * 100).toFixed(0).padStart(3)}%`;
}

/**
 * Prints the sync report to the console.
 *
 * @param {object} timeline        - result of buildTimeline()
 * @param {object} config
 */
export function printReport (timeline, config) {
  const fr = config.frameRate || '30000/1001';
  const separator = '─'.repeat(72);

  console.log('');
  console.log(b('  Sync Report'));
  console.log(`  ${separator}`);

  // Primary angle
  const primaryDuration = timeline.primaryClips.reduce(
    (sum, c) => sum + (c.silence.outPoint - c.silence.inPoint), 0
  );
  console.log(`  ${b('primary')}   ${timeline.primaryClips.length} clip(s)   total ${fmt(primaryDuration)}`);

  for (const clip of timeline.primaryClips) {
    const name = basename(clip.probe.path);
    const dur = clip.silence.outPoint - clip.silence.inPoint;
    const trimNote = clip.silence.inPoint > 0.1 ? dim(`  (head trimmed ${clip.silence.inPoint.toFixed(1)}s)`) : '';
    console.log(`    ${dim('→')} ${name}   ${fmt(dur)}${trimNote}`);
  }

  console.log('');

  if (Object.keys(timeline.angles).length === 0) {
    console.log(`  ${dim('No secondary angles — single-angle project.')}`);
  }

  for (const [angleName, clips] of Object.entries(timeline.angles)) {
    const matched = clips.filter(c => !c.unmatched);
    const unmatched = clips.filter(c => c.unmatched);

    console.log(`  ${b(angleName)}   ${clips.length} clip(s)   ${matched.length} matched   ${unmatched.length > 0 ? warn(`${unmatched.length} unmatched`) : ''}`);

    for (const clip of clips) {
      const name = basename(clip.probe.path);

      if (clip.unmatched) {
        const conf = clip.confidence ?? 0;
        console.log(`    ${warn('⚠')} ${name}   ${err('NO MATCH')}   best confidence ${confidenceBar(conf)}   threshold ${(config.syncConfidenceThreshold ?? 0.6) * 100}%   ${config.unmatchedClipBehavior === 'skip' ? err('skipped') : warn('appended at end')}`);
        continue;
      }

      const primaryName = basename(clip.matchedPrimaryPath);
      const offsetFrames = clip.offsetSeconds != null
        ? Math.round(clip.offsetSeconds * fpsFromRational(fr))
        : 0;
      const offsetSign = offsetFrames >= 0 ? '+' : '';
      const dur = clip.silence.outPoint - clip.silence.inPoint;

      console.log(
        `    ${dim('→')} ${name}   matched ${dim(primaryName)}   ` +
        `offset ${offsetSign}${clip.offsetSeconds?.toFixed(3)}s (${offsetSign}${offsetFrames} frames)   ` +
        `confidence ${confidenceBar(clip.confidence)}   ${fmt(dur)}`
      );
    }

    console.log('');
  }

  console.log(`  ${separator}`);
  const totalDuration = timeline.primaryClips.length > 0
    ? timeline.primaryClips[timeline.primaryClips.length - 1].timelineEnd
    : 0;
  console.log(`  Timeline duration: ${b(fmt(totalDuration))}`);
  console.log('');
}

function fpsFromRational (fr) {
  const [num, den] = fr.split('/').map(Number);
  return num / (den || 1);
}
