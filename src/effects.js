/**
 * Builds FCPXML <filter-audio> elements for ASMR processing.
 *
 * Uses Final Cut Pro's built-in audio effect URIs.
 * These are the standard Apple effect identifiers present in FCP 10.6+.
 */

/**
 * Channel EQ effect with ASMR-tuned settings.
 * FCP built-in: "Channel EQ" — effect ID "FFChannelEQ"
 *
 * Settings applied:
 *   - High-pass at 80Hz (cuts rumble/low-end)
 *   - Slight cut at 300-400Hz (reduces muddiness)
 *   - Air boost at 10kHz (+3dB presence/sparkle)
 */
export function channelEqFilter (eqConfig) {
  const { highpassHz, midCutHz, midCutDb, airBoostHz, airBoostDb } = eqConfig;

  return {
    '@name': 'Channel EQ',
    '@uid': '.../Filters.localized/EQ.localized/Channel EQ.localized/Channel EQ.cafilter',
    param: [
      // High-pass filter (Band 1)
      { '@name': 'BandEnabled1', '@key': 'BandEnabled1', '@value': '1' },
      { '@name': 'FilterType1', '@key': 'FilterType1', '@value': '0' }, // 0 = High-pass
      { '@name': 'Frequency1', '@key': 'Frequency1', '@value': String(highpassHz) },
      { '@name': 'Bypass1', '@key': 'Bypass1', '@value': '0' },

      // Mid cut (Band 3 — parametric)
      { '@name': 'BandEnabled3', '@key': 'BandEnabled3', '@value': '1' },
      { '@name': 'FilterType3', '@key': 'FilterType3', '@value': '3' }, // 3 = Peak/Notch
      { '@name': 'Frequency3', '@key': 'Frequency3', '@value': String(midCutHz) },
      { '@name': 'Gain3', '@key': 'Gain3', '@value': String(midCutDb) },
      { '@name': 'Q3', '@key': 'Q3', '@value': '1.0' },
      { '@name': 'Bypass3', '@key': 'Bypass3', '@value': '0' },

      // Air boost (Band 6 — high shelf)
      { '@name': 'BandEnabled6', '@key': 'BandEnabled6', '@value': '1' },
      { '@name': 'FilterType6', '@key': 'FilterType6', '@value': '5' }, // 5 = High shelf
      { '@name': 'Frequency6', '@key': 'Frequency6', '@value': String(airBoostHz) },
      { '@name': 'Gain6', '@key': 'Gain6', '@value': String(airBoostDb) },
      { '@name': 'Bypass6', '@key': 'Bypass6', '@value': '0' }
    ]
  };
}

/**
 * Gain adjustment filter to normalize peak amplitude to targetPeakDb.
 * Uses FCP's built-in "Gain" effect.
 *
 * gainDb: the computed gain adjustment (targetPeakDb - measuredPeakDb)
 */
export function gainFilter (gainDb) {
  return {
    '@name': 'Gain',
    '@uid': '.../Filters.localized/Levels.localized/Gain.localized/Gain.cafilter',
    param: [
      { '@name': 'Gain', '@key': 'gain', '@value': String(parseFloat(gainDb.toFixed(2))) }
    ]
  };
}
