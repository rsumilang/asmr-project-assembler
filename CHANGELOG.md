# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.1] - 2026-03-21

### Fixed

- Extracted duplicated `readWavSamples` from `sync.js` and `silence.js` into a shared `src/wav.js` module
- Removed duplicate `parseFrameRateParts` in `fcpxml.js` — now imports `parseFrameRate` from `rational.js`
- Removed dead `buildAudioFilters` export from `effects.js` (was never imported)
- Removed redundant silence re-assignment loop in `pipeline.js` (`buildTimeline` already attaches silence data)
- Removed unused `scanResult` parameter from `printReport` in `report.js`
- Replaced `softprops/action-gh-release` Action with `gh release create` CLI to eliminate Node.js version warnings in CI

## [0.1.0] - 2026-03-21

### Added

- Initial release
- Folder scan with root-level clips as primary angle and subfolders as additional angles
- Support for mp4, mov, m4v, and mxf source formats
- FFmpeg audio fingerprint extraction (mono 16kHz WAV, configurable duration)
- FFT-based cross-correlation sync via `fft-js` — matches each secondary clip against all primary clips and picks the best match
- Handles primary cameras that were not recording when a secondary clip was captured — unmatched clips are warned and skipped
- Silence trimming via RMS amplitude analysis with configurable threshold and handle frames
- FCPXML 1.11 output with a single multicam clip containing all synchronized angles
- All time values expressed as rational numbers (e.g. `1001/30000s`) per FCPXML spec
- Asset `src` paths written as absolute `file://` URIs
- ASMR audio effects on every clip: Channel EQ (high-pass 80Hz, mid cut, air boost), gain normalization, and 4-point volume fade ramps
- Console sync report with per-clip match table, offset in frames, and confidence bar
- `apa.config.json` for all tunable parameters
- CLI via `apa --input <path> --config <path>`

[Unreleased]: https://github.com/rsumilang/asmr-project-assembler/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/rsumilang/asmr-project-assembler/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/rsumilang/asmr-project-assembler/releases/tag/v0.1.0
