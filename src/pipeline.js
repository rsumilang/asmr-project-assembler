import { tmpdir } from 'os';
import { join, basename, resolve } from 'path';
import { writeFileSync, rmSync, mkdirSync } from 'fs';
import { scanInput } from './scan.js';
import { probeClip } from './probe.js';
import { extractAudio } from './extract.js';
import { findBestPrimaryMatch } from './sync.js';
import { analyzeSilence } from './silence.js';
import { buildTimeline } from './timeline.js';
import { buildFcpxml } from './fcpxml.js';
import { printReport } from './report.js';

const DEFAULTS = {
  primaryAngle: 'primary',
  silenceThreshold: -50,
  silenceHandleFrames: 12,
  syncFingerprintDuration: 60,
  syncConfidenceThreshold: 0.6,
  unmatchedClipBehavior: 'warn',
  targetPeakDb: -3,
  asmrEq: {
    highpassHz: 80,
    midCutHz: 350,
    midCutDb: -2,
    airBoostHz: 10000,
    airBoostDb: 3
  },
  fadeFrames: 8,
  frameRate: '30000/1001',
  outputPath: './output.fcpxml'
};

export async function run (inputPath, userConfig) {
  const config = { ...DEFAULTS, ...userConfig, asmrEq: { ...DEFAULTS.asmrEq, ...(userConfig.asmrEq || {}) } };
  const fr = config.frameRate;
  const tempDir = join(tmpdir(), `apa-${Date.now()}`);

  try {
    // 1. Scan
    console.log('Scanning input folder...');
    const scan = scanInput(inputPath);

    if (scan.primary.length === 0) {
      console.error('Error: no video files found in the root of the input folder (primary angle).');
      process.exit(1);
    }

    const angleNames = Object.keys(scan.angles);
    console.log(`  Primary angle: ${scan.primary.length} clip(s)`);
    if (angleNames.length > 0) {
      for (const name of angleNames) {
        console.log(`  Angle "${name}": ${scan.angles[name].length} clip(s)`);
      }
    } else {
      console.log('  No secondary angles — single-angle project.');
    }

    // 2. Probe all clips
    console.log('\nProbing clips...');
    const primaryProbes = await Promise.all(scan.primary.map(probeClip));

    const angleProbes = {};
    for (const [name, clips] of Object.entries(scan.angles)) {
      angleProbes[name] = await Promise.all(clips.map(probeClip));
    }

    // Warn clips with no audio
    for (const p of primaryProbes) {
      if (!p.hasAudio) console.warn(`  Warning: no audio stream in ${basename(p.path)}`);
    }
    for (const probes of Object.values(angleProbes)) {
      for (const p of probes) {
        if (!p.hasAudio) console.warn(`  Warning: no audio stream in ${basename(p.path)}`);
      }
    }

    mkdirSync(tempDir, { recursive: true });

    // 3. Extract audio fingerprints
    console.log('\nExtracting audio fingerprints...');

    const primaryWavs = await Promise.all(
      primaryProbes.map(async probe => {
        if (!probe.hasAudio) return { clipPath: probe.path, wavPath: null };
        const wavPath = await extractAudio(probe.path, tempDir, config.syncFingerprintDuration);
        return { clipPath: probe.path, wavPath };
      })
    );

    const angleWavs = {};
    for (const [name, probes] of Object.entries(angleProbes)) {
      angleWavs[name] = await Promise.all(
        probes.map(async probe => {
          if (!probe.hasAudio) return { clipPath: probe.path, wavPath: null };
          const wavPath = await extractAudio(probe.path, tempDir, config.syncFingerprintDuration);
          return { clipPath: probe.path, wavPath };
        })
      );
    }

    // 4. Silence analysis on all clips
    console.log('\nAnalyzing silence...');

    const primarySilences = await Promise.all(
      primaryProbes.map((probe, i) => {
        const wav = primaryWavs[i];
        if (!wav.wavPath) {
          return { inPoint: 0, outPoint: probe.duration, tailTruncated: false };
        }
        return analyzeSilence(
          wav.wavPath, probe.duration,
          config.syncFingerprintDuration,
          config.silenceThreshold,
          config.silenceHandleFrames,
          fr
        );
      })
    );

    const angleSilences = {};
    for (const [name, probes] of Object.entries(angleProbes)) {
      angleSilences[name] = await Promise.all(
        probes.map((probe, i) => {
          const wav = angleWavs[name][i];
          if (!wav.wavPath) {
            return { inPoint: 0, outPoint: probe.duration, tailTruncated: false };
          }
          return analyzeSilence(
            wav.wavPath, probe.duration,
            config.syncFingerprintDuration,
            config.silenceThreshold,
            config.silenceHandleFrames,
            fr
          );
        })
      );
    }

    // 5. Sync matching (secondary angles only)
    const angleMatchResults = {};

    if (angleNames.length > 0) {
      console.log('\nCalculating sync offsets...');

      const validPrimaries = primaryWavs.filter(w => w.wavPath);

      for (const [name, wavEntries] of Object.entries(angleWavs)) {
        angleMatchResults[name] = await Promise.all(
          wavEntries.map(async (wav, i) => {
            const probe = angleProbes[name][i];
            const silence = angleSilences[name][i];

            if (!wav.wavPath || validPrimaries.length === 0) {
              return { probe, silence, matchResult: null };
            }

            const matchResult = findBestPrimaryMatch(validPrimaries, wav.wavPath);
            return { probe, silence, matchResult };
          })
        );
      }
    }

    // 6. Build timeline model
    console.log('\nBuilding timeline...');
    const timeline = buildTimeline(primaryProbes, primarySilences, angleMatchResults, config);

    // 7. Print report
    printReport(timeline, config);

    // Warn about unmatched clips
    for (const [angleName, clips] of Object.entries(timeline.angles)) {
      for (const clip of clips) {
        if (clip.unmatched) {
          const behavior = config.unmatchedClipBehavior;
          if (behavior === 'skip') {
            console.warn(`  Skipping unmatched clip: ${basename(clip.probe.path)} (angle: ${angleName})`);
          }
        }
      }
    }

    // 8. Generate FCPXML
    console.log('Generating FCPXML...');
    const projectName = basename(inputPath);
    const xml = buildFcpxml(timeline, config, projectName);

    const outputPath = resolve(config.outputPath);
    writeFileSync(outputPath, xml, 'utf8');
    console.log(`\nWrote: ${outputPath}`);
  } finally {
    // Cleanup temp audio files
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  }
}
