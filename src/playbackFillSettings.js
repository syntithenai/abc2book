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
  cello: 42,
  tremoloStrings: 45,
  pizzicato: 46,
  harp: 47,
  strings: 48,
  brass: 61,
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
        description: 'Alternating piano bass and mid-register chords (abcjs default).',
        usesAbcjsChords: true,
        generator: null,
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
        description: 'Alternating bass notes with sparse plucked chord tones.',
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
        description: 'Short pizzicato hits on the beat pattern with soft bass.',
        usesAbcjsChords: false,
        generator: 'block',
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
  }
}

export function getPlaybackFillSettings(tune) {
  const defaults = defaultPlaybackFillSettings()
  if (!tune) return defaults
  return {
    style: normalizeFillStyle(tune.playbackFillStyle),
    level: tune.playbackFillLevel != null
      ? normalizeFillLevel(tune.playbackFillLevel)
      : defaults.level,
  }
}

export function applyPlaybackFillSettings(tune, settings) {
  if (!tune || !settings) return tune
  const next = Object.assign({}, tune)
  next.playbackFillStyle = normalizeFillStyle(settings.style)
  next.playbackFillLevel = normalizeFillLevel(settings.level)
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

export function resolveFillPlaybackOptions(tune) {
  const settings = getPlaybackFillSettings(tune)
  const def = getFillStyleDefinition(settings.style)
  return {
    settings: settings,
    styleDef: def,
    chordsOff: settings.style === FILL_STYLE_OFF || fillNeedsCustomTrack(settings.style),
    injectCustomFill: fillNeedsCustomTrack(settings.style),
  }
}
