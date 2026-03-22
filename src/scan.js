import { readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';

const SUPPORTED = new Set(['.mp4', '.mov', '.m4v', '.mxf']);

function isVideo (file) {
  return SUPPORTED.has(extname(file).toLowerCase());
}

/**
 * Scans the input folder and returns clips grouped by angle.
 *
 * Returns:
 * {
 *   primary: ['/abs/path/to/clip.mp4', ...],
 *   angles: {
 *     'folder-name': ['/abs/path/to/clip.mp4', ...],
 *   }
 * }
 */
export function scanInput (inputPath) {
  const entries = readdirSync(inputPath);

  const primary = [];
  const angles = {};

  for (const entry of entries) {
    const full = join(inputPath, entry);
    const stat = statSync(full);

    if (stat.isFile() && isVideo(entry)) {
      primary.push(full);
    } else if (stat.isDirectory()) {
      const angleName = basename(entry);
      const clips = readdirSync(full)
        .filter(isVideo)
        .map(f => join(full, f))
        .sort();

      if (clips.length > 0) {
        angles[angleName] = clips;
      }
    }
  }

  // Sort primary clips by filename so they assemble in recording order
  primary.sort();

  return { primary, angles };
}
