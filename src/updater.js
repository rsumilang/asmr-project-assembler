import { createWriteStream, chmodSync, renameSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const REPO = 'rsumilang/asmr-project-assembler';
const RELEASES_API = `https://api.github.com/repos/${REPO}/releases/latest`;

/**
 * Maps the current process platform/arch to the release asset filename.
 */
function currentBinaryName () {
  const key = `${process.platform}-${process.arch}`;
  const map = {
    'darwin-arm64': 'apa-macos-arm64',
    'darwin-x64': 'apa-macos-x64',
    'linux-x64': 'apa-linux-x64',
    'linux-arm64': 'apa-linux-arm64',
    'win32-x64': 'apa-windows-x64.exe'
  };
  return map[key] || null;
}

/**
 * Compares two semver strings. Returns true if `b` is newer than `a`.
 */
function isNewer (current, latest) {
  const parse = (v) => v.replace(/^v/, '').split('-')[0].split('.').map(Number);
  const [ca, cb, cc] = parse(current);
  const [la, lb, lc] = parse(latest);
  if (la !== ca) return la > ca;
  if (lb !== cb) return lb > cb;
  return lc > cc;
}

/**
 * Fetches the latest release metadata from GitHub.
 * Returns { tag, url } where url is the download URL for the current platform.
 */
async function fetchLatestRelease () {
  const res = await fetch(RELEASES_API, {
    headers: { 'User-Agent': 'apa-updater', Accept: 'application/vnd.github+json' }
  });

  if (!res.ok) {
    throw new Error(`GitHub API returned ${res.status}: ${res.statusText}`);
  }

  const data = await res.json();
  const tag = data.tag_name;
  const binaryName = currentBinaryName();

  if (!binaryName) {
    throw new Error(`No pre-built binary available for ${process.platform}/${process.arch}`);
  }

  const asset = data.assets.find(a => a.name === binaryName);
  if (!asset) {
    throw new Error(`Release ${tag} has no asset named "${binaryName}"`);
  }

  return { tag, url: asset.browser_download_url, name: binaryName };
}

/**
 * Downloads a URL to a temp file and returns the temp path.
 */
async function downloadToTemp (url, name) {
  const dest = join(tmpdir(), `${name}-${Date.now()}`);

  const res = await fetch(url, { headers: { 'User-Agent': 'apa-updater' } });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);

  const writer = createWriteStream(dest);
  await pipeline(Readable.fromWeb(res.body), writer);

  return dest;
}

/**
 * Replaces the running binary with the downloaded one.
 * On Unix: atomic rename. On Windows: attempts rename (may fail if locked).
 */
function replaceSelf (tempPath) {
  const self = process.execPath;
  chmodSync(tempPath, 0o755);

  if (process.platform === 'win32') {
    const backup = `${self}.old`;
    renameSync(self, backup);
    renameSync(tempPath, self);
  } else {
    renameSync(tempPath, self);
  }
}

/**
 * Checks for a newer version without updating.
 * Returns { current, latest, hasUpdate } or throws on network error.
 */
export async function checkForUpdate (currentVersion) {
  const { tag } = await fetchLatestRelease();
  const latest = tag.replace(/^v/, '');
  const current = currentVersion.replace(/^v/, '');
  return { current, latest, hasUpdate: isNewer(current, latest) };
}

/**
 * Checks for a newer version and downloads + installs it if found.
 * Prints progress to the console.
 */
export async function selfUpdate (currentVersion) {
  console.log('Checking for updates...');

  let release;
  try {
    release = await fetchLatestRelease();
  } catch (err) {
    console.error(`Update check failed: ${err.message}`);
    process.exit(1);
  }

  const latestVersion = release.tag.replace(/^v/, '');
  const current = currentVersion.replace(/^v/, '');

  if (!isNewer(current, latestVersion)) {
    console.log(`Already up to date (${current}).`);
    return;
  }

  console.log(`Updating ${current} → ${latestVersion}...`);

  // Detect whether we're running as a compiled binary or via node/bun directly.
  // If running via node/bun, process.execPath points to the runtime, not apa.
  const isBinary = existsSync(process.execPath) &&
    !process.execPath.includes('node') &&
    !process.execPath.includes('bun');

  if (!isBinary) {
    console.error('Self-update only works with a pre-built binary.');
    console.error(`Download ${release.tag} from: https://github.com/${REPO}/releases`);
    process.exit(1);
  }

  let tempPath;
  try {
    console.log(`Downloading ${release.name}...`);
    tempPath = await downloadToTemp(release.url, release.name);
  } catch (err) {
    console.error(`Download failed: ${err.message}`);
    process.exit(1);
  }

  try {
    replaceSelf(tempPath);
  } catch (err) {
    console.error(`Could not replace binary: ${err.message}`);
    console.error(`The new binary is at: ${tempPath}`);
    console.error(`Move it manually: mv "${tempPath}" "${process.execPath}"`);
    process.exit(1);
  }

  console.log(`Updated to ${latestVersion}. Run: apa --version`);
}
