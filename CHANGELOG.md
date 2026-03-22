# Changelog

All notable changes to this project will be documented in this file.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.0.0/)
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added

- `install.sh` — one-liner installer that detects OS/arch and downloads the correct binary from the latest GitHub Release
- `apa update` — checks GitHub for a newer version and replaces the binary in-place
- `apa update --check` — version check without installing
- GitHub Actions release workflow builds pre-compiled binaries for macOS (arm64/x64), Linux (x64/arm64), and Windows (x64) on every `v*` tag push

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

[Unreleased]: https://github.com/rsumilang/asmr-project-assembler/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/rsumilang/asmr-project-assembler/releases/tag/v0.1.0
