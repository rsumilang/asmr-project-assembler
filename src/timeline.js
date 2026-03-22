/**
 * Builds the flat timeline model from probe data, sync match results, and silence analysis.
 *
 * Primary clips are laid end-to-end on the timeline (their trimmed durations).
 * Secondary clips are placed at their matched position.
 *
 * Returns:
 * {
 *   primaryClips: [
 *     {
 *       probe,           // full probe result
 *       silence,         // { inPoint, outPoint, tailTruncated }
 *       timelineStart,   // seconds, position on the master timeline
 *       timelineEnd,     // seconds
 *     }
 *   ],
 *   angles: {
 *     'angle-name': [
 *       {
 *         probe,
 *         silence,
 *         timelineStart,
 *         timelineEnd,
 *         matchedPrimaryIndex,
 *         matchedPrimaryPath,
 *         offsetSeconds,
 *         confidence,
 *         unmatched,     // true if confidence < threshold
 *       }
 *     ]
 *   }
 * }
 */
export function buildTimeline (primaryProbes, primarySilences, angleMatchResults, config) {
  const { syncConfidenceThreshold = 0.6 } = config;

  // Lay primary clips end-to-end using trimmed duration
  let cursor = 0;
  const primaryClips = primaryProbes.map((probe, i) => {
    const silence = primarySilences[i];
    const trimmedDuration = silence.outPoint - silence.inPoint;
    const timelineStart = cursor;
    const timelineEnd = cursor + trimmedDuration;
    cursor = timelineEnd;
    return { probe, silence, timelineStart, timelineEnd };
  });

  // Build timeline positions for each angle
  const angles = {};

  for (const [angleName, matches] of Object.entries(angleMatchResults)) {
    angles[angleName] = matches.map(match => {
      const { probe, silence, matchResult } = match;
      const unmatched = !matchResult || matchResult.confidence < syncConfidenceThreshold;

      if (unmatched) {
        return {
          probe,
          silence,
          timelineStart: null,
          timelineEnd: null,
          matchedPrimaryIndex: matchResult ? matchResult.matchedPrimaryIndex : null,
          matchedPrimaryPath: matchResult ? matchResult.matchedPrimaryPath : null,
          offsetSeconds: null,
          confidence: matchResult ? matchResult.confidence : 0,
          unmatched: true
        };
      }

      const { matchedPrimaryIndex, matchedPrimaryPath, offsetSeconds, confidence } = matchResult;
      const primaryClip = primaryClips[matchedPrimaryIndex];

      // offsetSeconds (from crossCorrelate): positive = secondary source[0] is later on the
      // timeline than primary source[0]; negative = secondary started before primary.
      //
      // To find where secondary's inPoint content lands on the timeline:
      //   primarySource0_timeline = primaryClip.timelineStart - primaryClip.silence.inPoint
      //   secondarySource0_timeline = primarySource0_timeline + offsetSeconds
      //   timelineStart = secondarySource0_timeline + silence.inPoint
      const primarySource0 = primaryClip.timelineStart - primaryClip.silence.inPoint;
      const secondarySource0 = primarySource0 + offsetSeconds;
      const timelineStart = secondarySource0 + silence.inPoint;
      const trimmedDuration = silence.outPoint - silence.inPoint;
      const timelineEnd = timelineStart + trimmedDuration;

      return {
        probe,
        silence,
        timelineStart,
        timelineEnd,
        matchedPrimaryIndex,
        matchedPrimaryPath,
        offsetSeconds,
        confidence,
        unmatched: false
      };
    });
  }

  return { primaryClips, angles };
}
