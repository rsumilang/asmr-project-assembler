# apa — ASMR Project Assembler

Generates a Final Cut Pro multicam project (FCPXML 1.11) from a folder of video clips. Point it at your footage, and it produces an `.fcpxml` file you can open directly in FCP — synced, trimmed, and with ASMR-tuned audio effects already applied.

## Requirements

- FFmpeg installed and on your `PATH`

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/rsumilang/asmr-project-assembler/main/install.sh | sh
```

Detects your OS and architecture, downloads the right binary from the latest release, and places it in `/usr/local/bin` (or `~/.local/bin` if you don't have write access). No Node.js required.

On macOS you may need to allow the binary in **System Settings → Privacy & Security** the first time you run it.

### Update

```bash
apa update
```

Checks GitHub for a newer version and replaces the binary in-place. To just see if an update is available without installing:

```bash
apa update --check
```

### Manual download

Prefer to download manually? Grab the right file from the [Releases](https://github.com/rsumilang/asmr-project-assembler/releases) page:

| Platform | File |
|----------|------|
| macOS Apple Silicon | `apa-macos-arm64` |
| macOS Intel | `apa-macos-x64` |
| Linux x64 | `apa-linux-x64` |
| Linux arm64 | `apa-linux-arm64` |
| Windows x64 | `apa-windows-x64.exe` |

```bash
chmod +x apa-macos-arm64
./apa-macos-arm64 --help
```

### Install from source

Requires Node.js 20+.

```bash
npm install -g .
```

## Usage

```bash
apa --input /path/to/clips [--config ./apa.config.json]
apa update               # update to the latest version
apa update --check       # check without installing
```

### Options

| Flag | Description | Default |
|------|-------------|---------|
| `-i, --input <path>` | Folder containing your video clips | required |
| `-c, --config <path>` | Path to config file | `./apa.config.json` |

## Folder structure

```
/path/to/clips/
├── clip-001.mp4          ← primary camera angle (root-level files)
├── clip-002.mp4
├── clip-003.mp4
├── overhead/             ← additional angle (named after folder)
│   ├── overhead-001.mp4
│   └── overhead-002.mp4
└── close-up/
    └── closeup-001.mp4
```

Root-level video files are the **primary angle**. Each subfolder becomes an additional angle named after the folder. A project with no subfolders is a single-angle multicam.

Because you may start and stop the primary camera across multiple days, each secondary clip is matched independently against all primary clips. If a secondary clip has no confident match (e.g. the primary wasn't recording), it's excluded from the FCPXML with a warning.

## Supported formats

`mp4`, `mov`, `m4v`, `mxf`

## Configuration

Drop an `apa.config.json` next to where you run the command (or pass `--config`):

```json
{
  "primaryAngle": "primary",
  "silenceThreshold": -50,
  "silenceHandleFrames": 12,
  "syncFingerprintDuration": 60,
  "syncConfidenceThreshold": 0.6,
  "unmatchedClipBehavior": "warn",
  "targetPeakDb": -3,
  "asmrEq": {
    "highpassHz": 80,
    "midCutHz": 350,
    "midCutDb": -2,
    "airBoostHz": 10000,
    "airBoostDb": 3
  },
  "fadeFrames": 8,
  "frameRate": "30000/1001",
  "outputPath": "./output.fcpxml"
}
```

### Config reference

| Key | Description | Default |
|-----|-------------|---------|
| `primaryAngle` | Name given to the primary (root) angle in FCP | `"primary"` |
| `silenceThreshold` | dBFS level below which audio is considered silence | `-50` |
| `silenceHandleFrames` | Frames of handle to leave before/after active audio | `12` |
| `syncFingerprintDuration` | Seconds of audio extracted per clip for sync analysis | `60` |
| `syncConfidenceThreshold` | Minimum correlation confidence (0–1) to accept a match | `0.6` |
| `unmatchedClipBehavior` | What to do with unmatched secondary clips: `"warn"` or `"skip"` | `"warn"` |
| `targetPeakDb` | Target peak amplitude for gain normalization | `-3` |
| `asmrEq.highpassHz` | High-pass filter cutoff frequency | `80` |
| `asmrEq.midCutHz` | Parametric mid cut center frequency | `350` |
| `asmrEq.midCutDb` | Parametric mid cut gain | `-2` |
| `asmrEq.airBoostHz` | High shelf boost center frequency | `10000` |
| `asmrEq.airBoostDb` | High shelf boost gain | `3` |
| `fadeFrames` | Frames for audio fade in and out on each clip | `8` |
| `frameRate` | Project frame rate as a rational string | `"30000/1001"` |
| `outputPath` | Where to write the output FCPXML | `"./output.fcpxml"` |

## How it works

1. **Scan** — walks the input folder, groups clips by angle
2. **Probe** — runs `ffprobe` on every clip to get duration, frame rate, and audio metadata
3. **Extract** — uses FFmpeg to pull a mono 16kHz WAV fingerprint from the first `syncFingerprintDuration` seconds of each clip
4. **Sync** — FFT cross-correlation matches each secondary clip against all primary clips; the highest-confidence match wins
5. **Silence trim** — RMS analysis finds the first and last active audio frame per clip, with handle padding
6. **Timeline** — places all clips at their correct absolute positions based on sync offsets
7. **FCPXML** — writes a valid FCPXML 1.11 file with a multicam clip, synchronized angles, and ASMR audio effects
8. **Report** — prints a sync table to the console showing each clip's match, offset in frames, and confidence

## Console output

```
  Sync Report
  ────────────────────────────────────────────────────────────────────────
  primary   3 clips   total 00:47:12

    → clip-001.mp4   00:14:22
    → clip-002.mp4   00:18:05
    → clip-003.mp4   00:14:45

  overhead   2 clips   2 matched
    → overhead-001.mp4   matched clip-001.mp4   offset +0.233s (+7 frames)   ██████████  98%   00:14:19
    → overhead-002.mp4   matched clip-002.mp4   offset -1.101s (-33 frames)  █████████░  91%   00:17:58

  close-up   1 clips   0 matched   ⚠ 1 unmatched
    ⚠ closeup-001.mp4   NO MATCH   best confidence ██░░░░░░░░  18%   threshold 60%   skipped

  ────────────────────────────────────────────────────────────────────────
  Timeline duration: 00:47:12
```

## Notes on FCP effect UIDs

The Channel EQ and Gain `filter-audio` elements use Apple's internal effect bundle paths. These are standard across FCP 10.6+, but if an effect doesn't load after import, open a clip in FCP, add the effect manually, export that clip as FCPXML, and copy the exact `uid` value from the output into `src/effects.js`.

## Development

```bash
npm run lint       # check for style issues
npm run lint:fix   # auto-fix what's fixable
```

## License

MIT
