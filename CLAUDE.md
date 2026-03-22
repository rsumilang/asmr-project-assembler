# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Development Commands

| Task | Command |
|------|---------|
| Install deps | `npm install` |
| Run CLI | `node bin/apa.js --input <path> [--config ./apa.config.json]` |
| Run (global install) | `npm install -g . && apa --input <path>` |
| Lint | `npm run lint` |
| Lint + autofix | `npm run lint:fix` |

FFmpeg must be installed separately and available on `PATH`.

---

## Architecture

**Language/runtime:** Node.js 20+ (ES modules throughout — `"type": "module"`)
**CLI entry:** `bin/apa.js` — parses args via `commander`, loads config, calls `src/pipeline.js`

### Pipeline (`src/pipeline.js`)

The full processing sequence in order:

1. **`scan.js`** — walks input folder; root-level video files → primary angle, each subfolder → angle named after the folder
2. **`probe.js`** — `ffprobe` every clip → duration, frame rate, dimensions, audio metadata
3. **`extract.js`** — FFmpeg extracts mono 16kHz WAV fingerprint (first N seconds) per clip to `os.tmpdir()/apa-{timestamp}/`
4. **`sync.js`** — FFT cross-correlation matches each secondary clip against all primary clips; returns best match, offset in samples, and confidence score
5. **`silence.js`** — RMS amplitude analysis per WAV fingerprint; finds first/last active frame; returns `{ inPoint, outPoint, tailTruncated }`
6. **`timeline.js`** — builds the flat timeline model: primary clips laid end-to-end, secondary clips placed at absolute positions derived from sync offsets
7. **`fcpxml.js`** — generates FCPXML 1.11 using `xmlbuilder2`; writes multicam with mc-angle elements, audio effects, and volume fade keyframes
8. **`report.js`** — prints sync table to console with confidence bars and warnings

Temp WAV files are deleted in a `finally` block at the end of the pipeline.

### Key modules

| File | Responsibility |
|------|---------------|
| `src/rational.js` | Converts seconds/frames to FCPXML rational strings (`1001/30000s`). All time math goes here. |
| `src/effects.js` | Returns xmlbuilder2 object descriptors for Channel EQ and Gain `filter-audio` elements |
| `src/timeline.js` | Computes `timelineStart` for secondary clips using: `primarySource0 + offsetSeconds + silence.inPoint` |
| `src/sync.js` | FFT cross-correlation using `fft-js`; sign convention: positive `offsetSamples` = secondary starts after primary |

### FCPXML conventions

- All time values are rational strings, never decimals — use `toRational(seconds, frameRate)` from `rational.js`
- Asset `src` must be absolute `file://` URIs — use `pathToFileURL(path).href`
- Asset UIDs are `sha1(absolutePath).slice(0, 32)` — deterministic across runs
- `asset-clip offset` = timeline position of the clip's inPoint content
- `asset-clip start` = inPoint in the source media

---

## Configuration

Default config lives at `apa.config.json` in the project root. All keys are optional with sensible defaults in `src/pipeline.js` `DEFAULTS`.

Key config values:

| Key | Effect |
|-----|--------|
| `frameRate` | Rational string e.g. `"30000/1001"` — drives all time conversion |
| `silenceThreshold` | dBFS cutoff for RMS silence detection |
| `syncConfidenceThreshold` | Correlation score below this = unmatched clip |
| `unmatchedClipBehavior` | `"warn"` (skip + console warning) or `"skip"` (silent) |
| `targetPeakDb` | Gain normalization target; adjust is `targetPeakDb - measuredPeakDb` |

---

## Adding a new audio effect

1. Add a function to `src/effects.js` returning an object with `@name`, `@uid`, and `param` array (xmlbuilder2 object API — `@`-prefixed keys become attributes)
2. Call it in `src/fcpxml.js` `appendClipToAngle` using `clipEl.ele({ 'filter-audio': yourFilter() })`

---

## Sync math

Secondary clip timeline position is derived as:

```
primarySource0   = primaryClip.timelineStart - primaryClip.silence.inPoint
secondarySource0 = primarySource0 + offsetSeconds
timelineStart    = secondarySource0 + silence.inPoint
```

`offsetSeconds` from `crossCorrelate(primary, secondary)`:
- Positive = secondary source[0] is later on the timeline (secondary started after primary)
- Negative = secondary source[0] is earlier (secondary started before primary)

---

## Linting

Uses `semistandard` (Standard JS + semicolons). Config in `package.json` under `"semistandard"`. Glob targets: `bin/**/*.js src/**/*.js`.

---

## Gotchas

- `fft-js` returns `[[re, im], ...]` — index with `[i][0]` and `[i][1]`, not destructuring in a map without care
- `fluent-ffmpeg` is deprecated upstream but works fine; the deprecation warning on `npm install` is expected
- Channel EQ and Gain `uid` values in `src/effects.js` are Apple bundle paths. If they don't resolve in FCP, open a clip in FCP, add the effect, export as FCPXML, and copy the actual UID
- `measuredPeakDb` on the probe object defaults to `-12` (hardcoded fallback in `fcpxml.js`) — a real `ffmpeg -af astats` pass would make gain normalization accurate
- WAV fingerprints only cover the first `syncFingerprintDuration` seconds — silence at the tail of a long clip can't be detected from the fingerprint; `tailTruncated: true` signals this
- Single-angle projects (no subfolders) are fully supported — the sync stage is skipped entirely
