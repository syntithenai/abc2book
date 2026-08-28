import { getPlaybackMetronomeSettings } from './playbackMetronomeSettings'
import { buildFillRhythmContext } from './fillDrumRhythm'

export const FILL_STYLE_OFF = 'off'
export const FILL_STYLE_BOOM_CHICK = 'boom-chick'
export const DEFAULT_FILL_STYLE = FILL_STYLE_BOOM_CHICK
export const DEFAULT_FILL_LEVEL = 100
export const MIN_FILL_LEVEL = 0
export const MAX_FILL_LEVEL = 150

/** GM program numbers for accompaniment presets. */
export const FILL_GM = {
  piano: 0,
  nylonGuitar: 24,
  steelGuitar: 25,
  acousticBass: 32,
  fingerBass: 33,
  slapBass: 36,
  cello: 42,
  tremoloStrings: 45,
  pizzicato: 46,
  harp: 47,
  strings: 48,
  accordion: 21,
  brass: 61,
  fiddle: 108,
}

export const FILL_STYLE_GROUPS = [
  {
    id: 'classic',
    label: 'Classic',
    styles: [
      {
        id: FILL_STYLE_OFF,
        label: 'Off',
        description: 'Melody only — no chord accompaniment.',
        usesAbcjsChords: false,
        generator: null,
      },
      {
        id: FILL_STYLE_BOOM_CHICK,
        label: 'Boom-chick',
        description: 'Alternating piano bass and mid-register chords under the melody.',
        // Custom fill keeps melody on chordsOff so fast 16ths are not mixed into
        // the same abcjs piano track as accompaniment (which buried short notes).
        usesAbcjsChords: false,
        generator: 'boom-chick',
        bassProgram: FILL_GM.piano,
        chordProgram: FILL_GM.piano,
      },
      {
        id: 'bass-only',
        label: 'Bass only',
        description: 'Root and alternating fifth-below bass on strong beats, no chords.',
        usesAbcjsChords: false,
        generator: 'bass-only',
        bassProgram: FILL_GM.piano,
        chordProgram: FILL_GM.piano,
      },
      {
        id: 'block',
        label: 'Block chords',
        description: 'Block triads on primary beats with rests between.',
        usesAbcjsChords: false,
        generator: 'block',
        bassProgram: FILL_GM.piano,
        chordProgram: FILL_GM.piano,
      },
      {
        id: 'pad',
        label: 'Pad',
        description: 'Sustained chord through each bar until the next change.',
        usesAbcjsChords: false,
        generator: 'pad',
        bassProgram: FILL_GM.piano,
        chordProgram: FILL_GM.piano,
      },
      {
        id: 'arpeggio',
        label: 'Arpeggio',
        description: 'Broken 1–3–5–1 pattern across the bar.',
        usesAbcjsChords: false,
        generator: 'arpeggio',
        bassProgram: FILL_GM.piano,
        chordProgram: FILL_GM.piano,
      },
    ],
  },
  {
    id: 'guitar',
    label: 'Guitar',
    styles: [
      {
        id: 'guitar-boom-chick',
        label: 'Guitar boom-chick',
        description: 'Nylon guitar chords with fingered bass root and fifth.',
        usesAbcjsChords: false,
        generator: 'boom-chick',
        bassProgram: FILL_GM.fingerBass,
        chordProgram: FILL_GM.nylonGuitar,
      },
      {
        id: 'guitar-strum',
        label: 'Guitar strum',
        description: 'Short guitar chords each beat with bass on 1 and 3.',
        usesAbcjsChords: false,
        generator: 'strum',
        bassProgram: FILL_GM.fingerBass,
        chordProgram: FILL_GM.steelGuitar,
      },
      {
        id: 'fingerpick',
        label: 'Fingerpick',
        description: 'Even double-time nylon guitar arpeggio through chord tones.',
        usesAbcjsChords: false,
        generator: 'fingerpick',
        bassProgram: FILL_GM.acousticBass,
        chordProgram: FILL_GM.nylonGuitar,
      },
    ],
  },
  {
    id: 'orchestral',
    label: 'Orchestral',
    styles: [
      {
        id: 'strings-pad',
        label: 'Strings pad',
        description: 'Sustained string ensemble chords.',
        usesAbcjsChords: false,
        generator: 'pad',
        bassProgram: FILL_GM.cello,
        chordProgram: FILL_GM.strings,
      },
      {
        id: 'pizzicato',
        label: 'Pizzicato',
        description: 'Short staccato pizzicato hits on the beat pattern with soft cello bass.',
        usesAbcjsChords: false,
        generator: 'pizzicato',
        bassProgram: FILL_GM.cello,
        chordProgram: FILL_GM.pizzicato,
      },
      {
        id: 'orchestra',
        label: 'Orchestra',
        description: 'String pad with light harp arpeggio accents.',
        usesAbcjsChords: false,
        generator: 'orchestra',
        bassProgram: FILL_GM.cello,
        chordProgram: FILL_GM.strings,
        accentProgram: FILL_GM.harp,
      },
      {
        id: 'brass-hits',
        label: 'Brass hits',
        description: 'Sparse brass accent blocks on strong beats with bass.',
        usesAbcjsChords: false,
        generator: 'brass-hits',
        bassProgram: FILL_GM.cello,
        chordProgram: FILL_GM.brass,
      },
    ],
  },
  {
    id: 'rhythmic',
    label: 'Rhythmic',
    styles: [
      {
        id: 'jig-bass',
        label: 'Jig bass',
        description: 'Boom-chick pulse for 6/8, 9/8, and 12/8 jigs with bass and guitar.',
        usesAbcjsChords: false,
        generator: 'jig-bass',
        bassProgram: FILL_GM.acousticBass,
        chordProgram: FILL_GM.nylonGuitar,
      },
      {
        id: 'reel-drive',
        label: 'Reel drive',
        description: 'Every-beat strum with bass on 1 and 3 for reels and marches.',
        usesAbcjsChords: false,
        generator: 'reel-drive',
        bassProgram: FILL_GM.fingerBass,
        chordProgram: FILL_GM.steelGuitar,
      },
      {
        id: 'waltz-roll',
        label: 'Waltz roll',
        description: 'Bass–3rd–5th arpeggio roll across each waltz bar.',
        usesAbcjsChords: false,
        generator: 'waltz-roll',
        bassProgram: FILL_GM.nylonGuitar,
        chordProgram: FILL_GM.nylonGuitar,
      },
      {
        id: 'hornpipe-lilt',
        label: 'Hornpipe lilt',
        description: 'Dotted long-short fiddle pattern with bass accents.',
        usesAbcjsChords: false,
        generator: 'hornpipe-lilt',
        bassProgram: FILL_GM.acousticBass,
        chordProgram: FILL_GM.fiddle,
      },
      {
        id: 'polka-bounce',
        label: 'Polka bounce',
        description: 'Alternating bass and chord on every quarter in 2/4.',
        usesAbcjsChords: false,
        generator: 'polka-bounce',
        bassProgram: FILL_GM.fingerBass,
        chordProgram: FILL_GM.accordion,
      },
      {
        id: 'slip-jig-roll',
        label: 'Slip jig roll',
        description: 'Three-note arpeggio groups for 9/8 slip jigs.',
        usesAbcjsChords: false,
        generator: 'slip-jig-roll',
        bassProgram: FILL_GM.cello,
        chordProgram: FILL_GM.harp,
      },
    ],
  },
  {
    id: 'combo',
    label: 'Ensemble',
    styles: [
      {
        id: 'fiddle-bass',
        label: 'Fiddle + bass',
        description: 'Bass on strong beats with fiddle double-stops on offbeats.',
        usesAbcjsChords: false,
        generator: 'fiddle-bass',
        bassProgram: FILL_GM.acousticBass,
        chordProgram: FILL_GM.fiddle,
      },
      {
        id: 'harp-cello',
        label: 'Harp + cello',
        description: 'Sustained cello root with harp rolls on each beat.',
        usesAbcjsChords: false,
        generator: 'harp-cello',
        bassProgram: FILL_GM.cello,
        chordProgram: FILL_GM.harp,
      },
      {
        id: 'brass-strings',
        label: 'Brass + strings',
        description: 'String pad with brass stabs on beats 1 and 3.',
        usesAbcjsChords: false,
        generator: 'brass-strings',
        bassProgram: FILL_GM.cello,
        chordProgram: FILL_GM.strings,
        accentProgram: FILL_GM.brass,
      },
      {
        id: 'guitar-mandolin',
        label: 'Guitar + mandolin',
        description: 'Nylon bass roots with high steel mandolin-style arpeggios.',
        usesAbcjsChords: false,
        generator: 'guitar-mandolin',
        bassProgram: FILL_GM.nylonGuitar,
        chordProgram: FILL_GM.steelGuitar,
      },
      {
        id: 'pipe-drone',
        label: 'Pipe drone',
        description: 'Sustained accordion fifth with acoustic bass root.',
        usesAbcjsChords: false,
        generator: 'pipe-drone',
        bassProgram: FILL_GM.acousticBass,
        chordProgram: FILL_GM.accordion,
      },
      {
        id: 'bodhran-accent',
        label: 'Bodhrán accent',
        description: 'Sparse slap-bass hits on strong rhythm slots only.',
        usesAbcjsChords: false,
        generator: 'bodhran-accent',
        bassProgram: FILL_GM.slapBass,
        chordProgram: FILL_GM.slapBass,
      },
    ],
  },
]

const STYLE_BY_ID = {}
FILL_STYLE_GROUPS.forEach(function(group) {
  group.styles.forEach(function(style) {
    STYLE_BY_ID[style.id] = style
  })
})

export function listFillStyleGroups() {
  return FILL_STYLE_GROUPS
}

export function getFillStyleDefinition(styleId) {
  return STYLE_BY_ID[styleId] || STYLE_BY_ID[DEFAULT_FILL_STYLE]
}

export function normalizeFillStyle(styleId) {
  const raw = String(styleId || '').trim()
  if (raw && STYLE_BY_ID[raw]) return raw
  return DEFAULT_FILL_STYLE
}

export function normalizeFillLevel(level) {
  const parsed = parseInt(level, 10)
  if (!(parsed >= 0)) return DEFAULT_FILL_LEVEL
  return Math.min(MAX_FILL_LEVEL, parsed)
}

export function defaultPlaybackFillSettings() {
  return {
    style: DEFAULT_FILL_STYLE,
    level: DEFAULT_FILL_LEVEL,
    followDrumGroove: false,
  }
}

export function hasStoredDrumRhythm(tune) {
  return !!(tune
    && tune.playbackMetronomeDrumRhythm
    && typeof tune.playbackMetronomeDrumRhythm === 'object'
    && tune.playbackMetronomeDrumRhythm.drumPattern)
}

export function getPlaybackFillSettings(tune) {
  const defaults = defaultPlaybackFillSettings()
  if (!tune) return defaults
  return {
    style: normalizeFillStyle(tune.playbackFillStyle),
    level: tune.playbackFillLevel != null
      ? normalizeFillLevel(tune.playbackFillLevel)
      : defaults.level,
    followDrumGroove: tune.playbackFillFollowDrumGroove === true,
  }
}

export function applyPlaybackFillSettings(tune, settings) {
  if (!tune || !settings) return tune
  const next = Object.assign({}, tune)
  next.playbackFillStyle = normalizeFillStyle(settings.style)
  next.playbackFillLevel = normalizeFillLevel(settings.level)
  next.playbackFillFollowDrumGroove = settings.followDrumGroove === true
  return next
}

export function fillUsesAbcjsChords(styleId) {
  const def = getFillStyleDefinition(styleId)
  return !!(def && def.usesAbcjsChords)
}

export function fillNeedsCustomTrack(styleId) {
  const def = getFillStyleDefinition(styleId)
  if (!def) return false
  if (def.id === FILL_STYLE_OFF) return false
  return !def.usesAbcjsChords
}

export function resolveFillPlaybackOptions(tune, tunebook) {
  const settings = getPlaybackFillSettings(tune)
  const def = getFillStyleDefinition(settings.style)
  let rhythmContext = null
  if (settings.followDrumGroove && tune) {
    const metro = getPlaybackMetronomeSettings(tune, tunebook)
    if (metro.drumRhythm && metro.drumRhythm.drumPattern) {
      rhythmContext = buildFillRhythmContext(metro.drumRhythm)
    }
  }
  return {
    settings: settings,
    styleDef: def,
    chordsOff: settings.style === FILL_STYLE_OFF || fillNeedsCustomTrack(settings.style),
    injectCustomFill: fillNeedsCustomTrack(settings.style),
    rhythmContext: rhythmContext,
  }
}
