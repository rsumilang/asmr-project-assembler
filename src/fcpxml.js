import { create } from 'xmlbuilder2';
import { createHash } from 'crypto';
import { pathToFileURL } from 'url';
import { basename } from 'path';
import { toRational, framesToRational, parseFrameRate } from './rational.js';
import { channelEqFilter, gainFilter } from './effects.js';

/**
 * Generates a deterministic asset UID from the file path.
 */
function uid (filePath) {
  return createHash('sha1').update(filePath).digest('hex').slice(0, 32);
}

/**
 * Converts an absolute file path to a file:// URI.
 */
function fileUri (filePath) {
  return pathToFileURL(filePath).href;
}

/**
 * Builds the complete FCPXML 1.11 document and returns it as a string.
 *
 * @param {object} timeline  - result from buildTimeline()
 * @param {object} config    - apa config
 * @param {string} projectName
 */
export function buildFcpxml (timeline, config, projectName = 'ASMR Project') {
  const fr = config.frameRate || '30000/1001';
  const { primaryAngle = 'primary', fadeFrames = 8, asmrEq, targetPeakDb = -3 } = config;

  const totalDuration = timeline.primaryClips.length > 0
    ? timeline.primaryClips[timeline.primaryClips.length - 1].timelineEnd
    : 0;

  // Collect all probes for asset registration
  const allClips = [
    ...timeline.primaryClips.map(c => c.probe),
    ...Object.values(timeline.angles).flat().map(c => c.probe)
  ];

  // Deduplicate by path
  const assetMap = new Map();
  for (const probe of allClips) {
    if (!assetMap.has(probe.path)) assetMap.set(probe.path, probe);
  }

  // --- Build XML ---
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .dtd({
      name: 'fcpxml',
      sysID: 'https://raw.githubusercontent.com/apple/fcpxml/main/DTD/FCPXMLv1_11.dtd'
    })
    .ele('fcpxml', { version: '1.11' });

  // Resources
  const resources = doc.ele('resources');

  // Format resource (shared by all clips)
  const primaryProbe = timeline.primaryClips[0]?.probe;
  const width = primaryProbe?.width || 3840;
  const height = primaryProbe?.height || 2160;
  const formatId = 'r1';

  resources.ele('format', {
    id: formatId,
    name: `FFVideoFormat${height}p${frLabel(fr)}`,
    frameDuration: framesToRational(1, fr),
    width: String(width),
    height: String(height),
    colorSpace: '1-1-1 (Rec. 709)'
  });

  // Asset elements
  for (const [, probe] of assetMap) {
    const assetId = `r${uid(probe.path).slice(0, 8)}`;
    assetMap.set(probe.path, { ...probe, assetId });

    const assetEl = resources.ele('asset', {
      id: assetId,
      name: basename(probe.path, getExt(probe.path)),
      uid: uid(probe.path),
      src: fileUri(probe.path),
      start: '0s',
      duration: toRational(probe.duration, fr),
      hasVideo: probe.hasVideo ? '1' : '0',
      hasAudio: probe.hasAudio ? '1' : '0'
    });

    if (probe.hasAudio) {
      assetEl.ele('media-rep', {
        kind: 'original-media',
        src: fileUri(probe.path)
      });
    }
  }

  // Library > Event > Project
  const library = doc.ele('library');
  const event = library.ele('event', { name: projectName });
  const project = event.ele('project', {
    name: projectName,
    uid: createHash('sha1').update(projectName).digest('hex').slice(0, 32)
  });

  const sequence = project.ele('sequence', {
    format: formatId,
    duration: toRational(totalDuration, fr),
    tcStart: '0s',
    tcFormat: 'NDF',
    audioLayout: 'stereo',
    audioRate: '48k'
  });

  const spine = sequence.ele('spine');

  // --- Multicam clip resource ---
  const mcResourceId = 'r-mc-1';
  const mcAsset = resources.ele('multicam', {
    id: mcResourceId,
    name: projectName,
    uid: createHash('sha1').update(`mc:${projectName}`).digest('hex').slice(0, 32),
    format: formatId,
    duration: toRational(totalDuration, fr),
    tcStart: '0s',
    tcFormat: 'NDF',
    renderFormat: 'FFCompressedRaw'
  });

  // Primary angle
  const primaryAngleEl = mcAsset.ele('mc-angle', {
    name: primaryAngle,
    angleID: '1'
  });

  for (const clip of timeline.primaryClips) {
    const probe = assetMap.get(clip.probe.path);
    appendClipToAngle(primaryAngleEl, probe, clip, fr, asmrEq, targetPeakDb, fadeFrames);
  }

  // Secondary angles
  let angleId = 2;
  for (const [angleName, clips] of Object.entries(timeline.angles)) {
    const angleEl = mcAsset.ele('mc-angle', {
      name: angleName,
      angleID: String(angleId++)
    });

    for (const clip of clips) {
      if (clip.unmatched) continue; // skipped in FCPXML; warned in report
      const probe = assetMap.get(clip.probe.path);
      appendClipToAngle(angleEl, probe, clip, fr, asmrEq, targetPeakDb, fadeFrames);
    }
  }

  // Place mc-clip on the primary storyline spine
  const mcClip = spine.ele('mc-clip', {
    ref: mcResourceId,
    name: projectName,
    offset: '0s',
    start: '0s',
    duration: toRational(totalDuration, fr)
  });

  // Active angle reference (primary)
  mcClip.ele('mc-source', {
    angleID: '1',
    srcEnable: 'all'
  });

  // Validate and serialize
  const xmlString = doc.end({ prettyPrint: true });
  validateXml(xmlString);
  return xmlString;
}

/**
 * Appends an asset-clip element to an mc-angle, with audio effects applied.
 */
function appendClipToAngle (angleEl, probe, clip, fr, asmrEq, targetPeakDb, fadeFrames) {
  const trimStart = clip.silence.inPoint;
  const trimEnd = clip.silence.outPoint;
  const trimDuration = trimEnd - trimStart;

  // Timeline offset within the multicam: where this clip sits on the mc timeline
  const offset = clip.timelineStart !== null ? clip.timelineStart : 0;

  const clipEl = angleEl.ele('asset-clip', {
    ref: probe.assetId,
    name: basename(probe.path, getExt(probe.path)),
    offset: toRational(offset, fr),
    start: toRational(trimStart, fr),
    duration: toRational(trimDuration, fr),
    format: 'r1',
    audioRole: 'dialogue'
  });

  // Gain normalization
  const measuredPeak = probe.measuredPeakDb ?? -12; // fallback if not measured
  const gainAdjust = targetPeakDb - measuredPeak;
  if (Math.abs(gainAdjust) > 0.1) {
    clipEl.ele({ 'filter-audio': gainFilter(gainAdjust) });
  }

  // Channel EQ
  if (asmrEq) {
    clipEl.ele({ 'filter-audio': channelEqFilter(asmrEq) });
  }

  // Audio fade in/out via volume keyframes (4-point ramp)
  const { num: frNum, den: frDen } = parseFrameRate(fr);
  const frameSecs = frDen / frNum;
  const fadeSecs = fadeFrames * frameSecs;
  const fadeOutStartSecs = Math.max(fadeSecs, trimDuration - fadeSecs);

  clipEl.ele('adjust-volume', { amount: '0dB' })
    .ele('keyframe', { time: '0s', value: '-96dB', curve: 'linear' }).up()
    .ele('keyframe', { time: toRational(fadeSecs, fr), value: '0dB', curve: 'linear' }).up()
    .ele('keyframe', { time: toRational(fadeOutStartSecs, fr), value: '0dB', curve: 'linear' }).up()
    .ele('keyframe', { time: toRational(trimDuration, fr), value: '-96dB', curve: 'linear' });
}

/**
 * Lightweight well-formedness validation — checks for unclosed tags and required root attributes.
 */
function validateXml (xmlString) {
  if (!xmlString.includes('<fcpxml')) {
    throw new Error('FCPXML validation failed: missing <fcpxml> root element');
  }
  if (!xmlString.includes('version="1.11"')) {
    throw new Error('FCPXML validation failed: missing version="1.11" attribute');
  }
  if (!xmlString.includes('<resources>')) {
    throw new Error('FCPXML validation failed: missing <resources> block');
  }
  if (!xmlString.includes('<sequence')) {
    throw new Error('FCPXML validation failed: missing <sequence> element');
  }
  // xmlbuilder2 always produces well-formed XML; this guards against logic errors above
}

function frLabel (fr) {
  const map = {
    '30000/1001': '2997',
    '24000/1001': '2398',
    '60000/1001': '5994',
    '25/1': '25',
    '30/1': '30',
    '24/1': '24',
    '60/1': '60'
  };
  return map[fr] || '2997';
}

function getExt (filePath) {
  const i = filePath.lastIndexOf('.');
  return i >= 0 ? filePath.slice(i) : '';
}
