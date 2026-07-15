import { midiToAbcPitch, parseKeySignatureForTests } from './melodyPitchSpelling'
import {
  getPracticeInstrumentProfile,
  baseMidiForKeyInRange,
  fitMidiSequenceToRange,
} from './practiceInstrumentProfiles'
import { normalizePracticeInstrument } from './practiceSessionSettings'

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11, 12]
const MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10, 12]
const DORIAN_SCALE_STEPS = [0, 2, 3, 5, 7, 9, 10, 12]
const MIXOLYDIAN_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 10, 12]
const MAJOR_ARPEGGIO_STEPS = [0, 4, 7, 12]
const MINOR_ARPEGGIO_STEPS = [0, 3, 7, 12]
const PENTASCALE_DEGREES = 5

const DEFAULT_TEMPO = 90
const DEFAULT_METER = '4/4'
const DEFAULT_NOTE_LENGTH = '1/4'
const TARGET_CATALOG_SIZE = 30

const ROOT_PC = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
}

const DUR = {
  quarter: '',
  eighth: '/2',
  dottedQuarter: '3/2',
  half: '2',
  triplet: '/3',
}

const VOCAL_SYLLABLES = ['ooh', 'ahh', 'lah', 'pah', 'poo', 'caw', 'cah', 'coo']

function keyInfoFor(key) {
  return parseKeySignatureForTests(key) || { root: 'C', mode: 'major' }
}

function keyDisplayName(key) {
  const keyInfo = parseKeySignatureForTests(key)
  if (!keyInfo) return String(key || 'C')
  const modeLabel = keyInfo.mode === 'minor' ? ' minor' : ' major'
  return keyInfo.root + modeLabel
}

function scaleStepsForMode(mode, options) {
  const opts = options || {}
  let full
  if (mode === 'minor') full = MINOR_SCALE_STEPS
  else if (mode === 'dorian') full = DORIAN_SCALE_STEPS
  else if (mode === 'mixolydian') full = MIXOLYDIAN_SCALE_STEPS
  else full = MAJOR_SCALE_STEPS
  if (opts.pentascale) return full.slice(0, PENTASCALE_DEGREES)
  if (opts.partial && opts.partial > 0) return full.slice(0, Math.min(full.length, opts.partial))
  if (opts.twoOctaves) {
    return full.concat(full.slice(1).map(function(s) { return s + 12 }))
  }
  return full
}

function scaleModeForKey(key, overrideMode) {
  if (overrideMode) return overrideMode
  const info = keyInfoFor(key)
  return info.mode === 'minor' ? 'minor' : 'major'
}

function arpeggioStepsForMode(mode) {
  return mode === 'minor' || mode === 'dorian' ? MINOR_ARPEGGIO_STEPS : MAJOR_ARPEGGIO_STEPS
}

function upDownSteps(steps) {
  return steps.concat(steps.slice(0, -1).reverse())
}

function contextFromOptions(options) {
  const opts = options || {}
  const instrument = normalizePracticeInstrument(opts.instrument)
  const profile = getPracticeInstrumentProfile(instrument, {
    vocalRangeLow: opts.vocalRangeLow,
    vocalRangeHigh: opts.vocalRangeHigh,
  })
  return {
    instrument: instrument,
    profile: profile,
    lowMidi: profile.lowestMidi,
    highMidi: profile.openHighMidi,
    skillLevel: Math.max(1, Math.min(10, Math.round(Number(opts.skillLevel) || 5))),
    isVoice: instrument === 'voice',
    useChords: (instrument === 'violin' || instrument === 'viola') && (opts.skillLevel || 5) >= 6,
  }
}

function baseMidiForKey(key, ctx) {
  const info = keyInfoFor(key)
  const pc = ROOT_PC[info.root] != null ? ROOT_PC[info.root] : 0
  return baseMidiForKeyInRange(pc, ctx.lowMidi, ctx.highMidi)
}

function midisFromSteps(steps, baseMidi) {
  return steps.map(function(step) { return baseMidi + step })
}

function stepsToAbcFromMidis(midis, key, rhythm, chordBeats) {
  const pattern = rhythm || [DUR.quarter]
  const chords = chordBeats || null
  return midis.map(function(midi, index) {
    const dur = pattern[index % pattern.length]
    if (chords && chords[index]) {
      const chordMidi = Math.min(midi, midi + chords[index])
      const upperMidi = Math.max(midi, midi + chords[index])
      const low = midiToAbcPitch(chordMidi, { key: key })
      const high = midiToAbcPitch(upperMidi, { key: key })
      return '[' + low + high + ']' + dur
    }
    return midiToAbcPitch(midi, { key: key }) + dur
  }).join('')
}

function finalizeMidis(midis, ctx) {
  return fitMidiSequenceToRange(midis, ctx.lowMidi, ctx.highMidi)
}

function buildWarmupAbc(title, key, noteBody, options) {
  const opts = options || {}
  const tempo = opts.tempo || DEFAULT_TEMPO
  const meter = opts.meter || DEFAULT_METER
  const noteLength = opts.noteLength || DEFAULT_NOTE_LENGTH
  // Keep |] glued to the last note so abcjs cannot wrap an empty system that only contains |].
  let body = String(noteBody || '').replace(/\s+$/, '').replace(/\s*\|\]?\s*$/, '')
  if (body) body = body +'|]'
  let abc = (
    'X:1\n'
    + 'T:' + title + '\n'
    + 'M:' + meter + '\n'
    + 'L:' + noteLength + '\n'
    + 'Q:1/4=' + tempo + '\n'
    + 'K:' + (key || 'C') + '\n'
    + body
  )
  if (opts.lyricsLine) {
    // Under-staff syllables (one token per note). Survives Abc abc2json/json2abc because
    // wLines length matches the single music line.
    abc += '\nw: ' + opts.lyricsLine + '\n'
  } else {
    abc += '\n'
  }
  return abc
}

function makeWarmup(id, title, key, noteBody, options) {
  const opts = options || {}
  const warmup = {
    id: id,
    title: title,
    meter: opts.meter || DEFAULT_METER,
    abc: buildWarmupAbc(title, key, noteBody, options),
  }
  if (opts.firstMidi != null && Number.isFinite(opts.firstMidi)) {
    warmup.firstMidi = Math.round(opts.firstMidi)
  }
  return warmup
}

function syllableForSkill(skill, seed) {
  if (skill <= 3) {
    return VOCAL_SYLLABLES[Math.abs(seed) % VOCAL_SYLLABLES.length]
  }
  const count = skill <= 6 ? 2 : Math.min(4, 2 + Math.floor((skill - 6) / 2))
  const words = []
  for (let i = 0; i < count; i++) {
    words.push(VOCAL_SYLLABLES[(Math.abs(seed) + i * 3) % VOCAL_SYLLABLES.length])
  }
  return words
}

function lyricsForNoteCount(noteCount, skill, seed) {
  const syllables = syllableForSkill(skill, seed)
  if (typeof syllables === 'string') {
    return Array(noteCount).fill(syllables).join(' ')
  }
  const out = []
  for (let i = 0; i < noteCount; i++) {
    out.push(syllables[i % syllables.length])
  }
  return out.join(' ')
}

function chordOffsetsForBeats(count, beatEvery) {
  const every = beatEvery || 4
  const out = {}
  for (let i = 0; i < count; i++) {
    if (i % every === 0) out[i] = -7 // fifth below / open string chord interval
  }
  return out
}

function patternToAbc(key, midis, rhythm, ctx, abcOpts) {
  const fitted = finalizeMidis(midis, ctx)
  const chords = ctx.useChords && !(abcOpts && abcOpts.noChords)
    ? chordOffsetsForBeats(fitted.length, 4)
    : null
  // Chord lower tone must stay in range — skip if it would go below
  let safeChords = null
  if (chords) {
    safeChords = {}
    Object.keys(chords).forEach(function(idx) {
      const i = parseInt(idx, 10)
      const lower = fitted[i] + chords[i]
      if (lower >= ctx.lowMidi) safeChords[i] = chords[i]
    })
  }
  const body = stepsToAbcFromMidis(fitted, key, rhythm, safeChords)
  return { body: body, noteCount: fitted.length, midis: fitted }
}

function buildScaleMidis(key, ctx, options) {
  const opts = options || {}
  const mode = scaleModeForKey(key, opts.mode)
  const steps = scaleStepsForMode(mode, opts)
  const seq = opts.ascending
    ? steps
    : (opts.descending ? steps.slice().reverse() : upDownSteps(steps))
  return midisFromSteps(seq, baseMidiForKey(key, ctx))
}

function buildArpeggioMidis(key, ctx, options) {
  const opts = options || {}
  const mode = scaleModeForKey(key, opts.mode)
  const steps = arpeggioStepsForMode(mode)
  const seq = opts.ascending ? steps : upDownSteps(steps)
  return midisFromSteps(seq, baseMidiForKey(key, ctx))
}

function buildIntervalFocusMidis(key, ctx, interval, options) {
  const opts = options || {}
  const mode = scaleModeForKey(key, opts.mode)
  const steps = scaleStepsForMode(mode, { pentascale: true })
  const base = baseMidiForKey(key, ctx)
  const hops = []
  steps.forEach(function(step) {
    hops.push(step, step + interval)
  })
  return midisFromSteps(upDownSteps(hops), base)
}

function buildSequenceMidis(key, ctx, options) {
  const opts = options || {}
  const mode = scaleModeForKey(key, opts.mode)
  const steps = scaleStepsForMode(mode, {})
  const base = baseMidiForKey(key, ctx)
  const seq = []
  for (let i = 0; i < steps.length - 2; i++) {
    seq.push(steps[i], steps[i + 1], steps[i + 2])
  }
  return midisFromSteps(seq, base)
}

function buildThirdsMidis(key, ctx, options) {
  const opts = options || {}
  const mode = scaleModeForKey(key, opts.mode)
  const steps = scaleStepsForMode(mode, {})
  const base = baseMidiForKey(key, ctx)
  const pairs = []
  for (let i = 0; i < steps.length - 1; i++) {
    pairs.push(steps[i], steps[i + 1])
  }
  return midisFromSteps(pairs.concat(pairs.slice(0, -1).reverse()), base)
}

function catalogExercise(id, minSkill, maxSkill, titleSuffix, action, buildFn, abcOptions) {
  return {
    id: id,
    minSkill: minSkill,
    maxSkill: maxSkill,
    title: function(key) { return keyDisplayName(key) + titleSuffix },
    action: action,
    build: buildFn,
    abcOptions: abcOptions || {},
  }
}

function buildWarmupCatalogTemplates() {
  const catalog = []

  function addScaleFamily(baseId, minSkill, maxSkill, label, action, scaleOpts) {
    const opts = scaleOpts || {}
    catalog.push(
      catalogExercise(baseId, minSkill, maxSkill, label, action,
        function(key, ctx) {
          return patternToAbc(key, buildScaleMidis(key, ctx, opts), [DUR.quarter], ctx)
        }),
      catalogExercise(baseId + '_eighth', Math.min(10, minSkill + 1), Math.min(10, maxSkill + 1),
        label + ' (eighth notes)', 'Keep eighth notes even and relaxed.',
        function(key, ctx) {
          return patternToAbc(key, buildScaleMidis(key, ctx, opts), [DUR.eighth], ctx, { noteLength: '1/8' })
        }, { noteLength: '1/8' }),
      catalogExercise(baseId + '_half', minSkill, maxSkill, label + ' (half notes)',
        'Hold each tone with a singing sound.',
        function(key, ctx) {
          return patternToAbc(key, buildScaleMidis(key, ctx, opts), [DUR.half], ctx)
        }),
      catalogExercise(baseId + '_dotted', Math.min(10, minSkill + 2), maxSkill, label + ' (dotted rhythm)',
        'Play the long-short pattern steadily.',
        function(key, ctx) {
          return patternToAbc(key, buildScaleMidis(key, ctx, opts), [DUR.dottedQuarter, DUR.eighth], ctx)
        }),
      catalogExercise(baseId + '_asc', minSkill, maxSkill, label + ' (ascending)',
        'Ascend through the pattern with an even tone.',
        function(key, ctx) {
          return patternToAbc(key, buildScaleMidis(key, ctx, Object.assign({}, opts, { ascending: true })), [DUR.quarter], ctx)
        })
    )
  }

  addScaleFamily('pentascale', 1, 4, ' five-note scale',
    'Play the five-note scale up and down with even tone.', { pentascale: true })
  addScaleFamily('scale_slow', 2, 6, ' scale (slow)',
    'Play each scale tone steadily and relaxed.', {})
  addScaleFamily('scale', 3, 10, ' scale',
    'Play the scale up and down. Focus on even notes and relaxed hands.', {})
  addScaleFamily('partial_scale', 1, 5, ' partial scale',
    'Practice the first tones of the scale smoothly.', { partial: 4 })

  catalog.push(
    catalogExercise('scale_dorian', 4, 10, ' dorian scale',
      'Sing or play the dorian mode colors.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { mode: 'dorian' }), [DUR.quarter], ctx)
      }),
    catalogExercise('scale_mixolydian', 4, 10, ' mixolydian scale',
      'Feel the flat-seventh color of mixolydian.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { mode: 'mixolydian' }), [DUR.quarter], ctx)
      }),
    catalogExercise('scale_dorian_eighth', 5, 10, ' dorian scale (eighths)',
      'Keep dorian eighths even.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { mode: 'dorian' }), [DUR.eighth], ctx)
      }, { noteLength: '1/8' }),
    catalogExercise('scale_mixolydian_eighth', 5, 10, ' mixolydian scale (eighths)',
      'Keep mixolydian eighths even.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { mode: 'mixolydian' }), [DUR.eighth], ctx)
      }, { noteLength: '1/8' }),
    catalogExercise('scale_syncopated', 4, 8, ' syncopated scale',
      'Keep the pulse steady through the short-long note pattern.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { pentascale: true }),
          [DUR.eighth, DUR.quarter, DUR.eighth, DUR.quarter], ctx)
      }),
    catalogExercise('scale_two_octave', 8, 10, ' two-octave scale',
      'Play two octaves up and down with an even sound.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { twoOctaves: true }), [DUR.quarter], ctx)
      }),
    catalogExercise('scale_desc', 3, 8, ' descending scale',
      'Descend from the top with control.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { descending: true }), [DUR.quarter], ctx)
      }),
    catalogExercise('waltz_scale', 3, 9, ' waltz rhythm scale',
      'Stress beat one in this 3/4 scale pattern.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, {}), [DUR.quarter, DUR.eighth, DUR.eighth], ctx)
      }, { meter: '3/4' }),
    catalogExercise('jig_scale', 5, 10, ' jig rhythm scale',
      'Keep the 6/8 lilt steady through the scale.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, {}), [DUR.eighth, DUR.eighth, DUR.quarter], ctx)
      }, { meter: '6/8', noteLength: '1/8' }),
    catalogExercise('march_scale', 2, 7, ' march scale',
      'Steady 2/4 feel through the scale.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { pentascale: true }), [DUR.quarter, DUR.quarter], ctx)
      }, { meter: '2/4' }),
    catalogExercise('swing_scale', 5, 9, ' swing-feel scale',
      'Lean into the long-short swing pattern.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, {}),
          [DUR.dottedQuarter, DUR.eighth, DUR.quarter, DUR.eighth], ctx)
      })
  )

  catalog.push(
    catalogExercise('arpeggio', 2, 10, ' arpeggio',
      'Play the arpeggio up and down. Keep a steady pulse.',
      function(key, ctx) {
        return patternToAbc(key, buildArpeggioMidis(key, ctx, {}), [DUR.quarter], ctx)
      }),
    catalogExercise('arpeggio_eighth', 3, 10, ' arpeggio (eighth notes)',
      'Play the arpeggio in even eighth notes.',
      function(key, ctx) {
        return patternToAbc(key, buildArpeggioMidis(key, ctx, {}), [DUR.eighth], ctx)
      }, { noteLength: '1/8' }),
    catalogExercise('arpeggio_waltz', 3, 9, ' waltz arpeggio',
      'Arpeggiate in a 3/4 feel.',
      function(key, ctx) {
        return patternToAbc(key, buildArpeggioMidis(key, ctx, {}), [DUR.quarter, DUR.eighth, DUR.eighth], ctx)
      }, { meter: '3/4' }),
    catalogExercise('arpeggio_jig', 5, 10, ' jig arpeggio',
      'Play arpeggios with a jig rhythm.',
      function(key, ctx) {
        return patternToAbc(key, buildArpeggioMidis(key, ctx, {}), [DUR.eighth, DUR.eighth, DUR.quarter], ctx)
      }, { meter: '6/8', noteLength: '1/8' }),
    catalogExercise('arpeggio_asc', 2, 7, ' ascending arpeggio',
      'Ascend the arpeggio with a steady pulse.',
      function(key, ctx) {
        return patternToAbc(key, buildArpeggioMidis(key, ctx, { ascending: true }), [DUR.quarter], ctx)
      }),
    catalogExercise('arpeggio_dotted', 4, 9, ' dotted arpeggio',
      'Use a dotted rhythm on each arpeggio figure.',
      function(key, ctx) {
        return patternToAbc(key, buildArpeggioMidis(key, ctx, {}), [DUR.dottedQuarter, DUR.eighth], ctx)
      }),
    catalogExercise('arpeggio_long', 2, 6, ' long-tone arpeggio',
      'Hold the longer notes, then connect smoothly to the next.',
      function(key, ctx) {
        return patternToAbc(key, buildArpeggioMidis(key, ctx, { ascending: true }), [DUR.half, DUR.quarter], ctx)
      })
  )

  catalog.push(
    catalogExercise('thirds', 4, 10, ' scale in thirds',
      'Play each pair of scale steps: up a third, then move to the next pair.',
      function(key, ctx) {
        return patternToAbc(key, buildThirdsMidis(key, ctx, {}), [DUR.quarter, DUR.eighth], ctx)
      }),
    catalogExercise('sequence', 5, 10, ' scale sequence',
      'Play the 1-2-3, 2-3-4 pattern ascending through the scale.',
      function(key, ctx) {
        return patternToAbc(key, buildSequenceMidis(key, ctx, {}), [DUR.eighth, DUR.eighth, DUR.quarter], ctx)
      }),
    catalogExercise('interval_third', 3, 8, ' third hops',
      'Repeat third leaps on each scale tone.',
      function(key, ctx) {
        return patternToAbc(key, buildIntervalFocusMidis(key, ctx, 4, {}), [DUR.quarter, DUR.eighth], ctx)
      }),
    catalogExercise('interval_fourth', 4, 9, ' fourth hops',
      'Focus on repeated fourths.',
      function(key, ctx) {
        return patternToAbc(key, buildIntervalFocusMidis(key, ctx, 5, {}), [DUR.quarter, DUR.eighth], ctx)
      }),
    catalogExercise('interval_fifth', 5, 10, ' fifth hops',
      'Leap to the fifth above each scale tone and return.',
      function(key, ctx) {
        return patternToAbc(key, buildIntervalFocusMidis(key, ctx, 7, {}), [DUR.quarter, DUR.eighth], ctx)
      }),
    catalogExercise('interval_octave', 6, 10, ' octave hops',
      'Alternate each tone with its octave.',
      function(key, ctx) {
        return patternToAbc(key, buildIntervalFocusMidis(key, ctx, 12, {}), [DUR.quarter, DUR.eighth], ctx)
      }),
    catalogExercise('neighbor_tones', 4, 8, ' neighbor tones',
      'Play each tone, step above, then return.',
      function(key, ctx) {
        const mode = scaleModeForKey(key)
        const steps = scaleStepsForMode(mode, { pentascale: true })
        const base = baseMidiForKey(key, ctx)
        const neighbors = []
        steps.forEach(function(step) {
          neighbors.push(step, step + 1, step)
        })
        return patternToAbc(key, midisFromSteps(neighbors, base), [DUR.eighth, DUR.eighth, DUR.quarter], ctx)
      }),
    catalogExercise('chromatic_approach', 7, 10, ' chromatic approach',
      'Approach each scale tone from a half step below.',
      function(key, ctx) {
        const mode = scaleModeForKey(key)
        const steps = scaleStepsForMode(mode, {})
        const base = baseMidiForKey(key, ctx)
        const chrom = []
        steps.forEach(function(step) {
          chrom.push(step - 1, step)
        })
        return patternToAbc(key, midisFromSteps(chrom, base), [DUR.eighth, DUR.quarter], ctx)
      }),
    catalogExercise('mixed_rhythm_scale', 5, 10, ' mixed rhythm scale',
      'Combine quarter and eighth notes evenly.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, {}),
          [DUR.quarter, DUR.eighth, DUR.eighth, DUR.quarter], ctx)
      }),
    catalogExercise('long_tone_scale', 1, 4, ' long-tone scale',
      'Sustain each scale degree, then move smoothly.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { ascending: true, pentascale: true }), [DUR.half], ctx)
      }),
    catalogExercise('pickup_scale', 3, 7, ' pickup scale',
      'Lead into the downbeat with a short pickup.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { ascending: true, pentascale: true }),
          [DUR.eighth, DUR.quarter, DUR.quarter, DUR.quarter], ctx)
      }),
    catalogExercise('echo_scale', 2, 6, ' call-and-response scale',
      'Play each degree twice before moving on.',
      function(key, ctx) {
        const mode = scaleModeForKey(key)
        const steps = scaleStepsForMode(mode, { pentascale: true })
        const base = baseMidiForKey(key, ctx)
        const echoed = []
        steps.forEach(function(step) {
          echoed.push(step, step)
        })
        return patternToAbc(key, midisFromSteps(echoed, base), [DUR.quarter, DUR.eighth], ctx)
      }),
    catalogExercise('dorian_waltz', 5, 10, ' dorian waltz',
      'Dorian mode in 3/4.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { mode: 'dorian', pentascale: true }),
          [DUR.quarter, DUR.eighth, DUR.eighth], ctx)
      }, { meter: '3/4' }),
    catalogExercise('mixolydian_jig', 6, 10, ' mixolydian jig',
      'Mixolydian colors with a jig feel.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { mode: 'mixolydian' }),
          [DUR.eighth, DUR.eighth, DUR.quarter], ctx)
      }, { meter: '6/8', noteLength: '1/8' }),
    catalogExercise('thirds_waltz', 5, 10, ' thirds in waltz time',
      'Scale thirds with a waltz pulse.',
      function(key, ctx) {
        return patternToAbc(key, buildThirdsMidis(key, ctx, {}), [DUR.quarter, DUR.eighth, DUR.eighth], ctx)
      }, { meter: '3/4' }),
    catalogExercise('fifth_march', 4, 8, ' fifth hops march',
      'Marching fifth leaps in 2/4.',
      function(key, ctx) {
        return patternToAbc(key, buildIntervalFocusMidis(key, ctx, 7, {}), [DUR.quarter, DUR.quarter], ctx)
      }, { meter: '2/4' }),
    catalogExercise('voice_gentle_steps', 1, 10, ' gentle steps',
      'Mostly stepping motion with a calm pulse.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { pentascale: true }), [DUR.quarter], ctx, { noChords: true })
      }),
    catalogExercise('voice_gentle_steps_quaver', 3, 10, ' gentle steps with quavers',
      'Mostly crotchets with occasional quaver pairs.',
      function(key, ctx) {
        return patternToAbc(key, buildScaleMidis(key, ctx, { pentascale: true }),
          [DUR.quarter, DUR.eighth, DUR.eighth, DUR.quarter], ctx, { noChords: true })
      })
  )

  return catalog
}

const WARMUP_TEMPLATES = buildWarmupCatalogTemplates()

function shuffleArray(array) {
  const copy = array.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    const tmp = copy[i]
    copy[i] = copy[j]
    copy[j] = tmp
  }
  return copy
}

function templatesForSkill(skillLevel) {
  const skill = Math.max(1, Math.min(10, Math.round(Number(skillLevel) || 5)))
  return WARMUP_TEMPLATES.filter(function(item) {
    return skill >= item.minSkill && skill <= item.maxSkill
  })
}

/**
 * ~30 warmup templates eligible for this instrument + skill.
 * Instrument mainly affects build-time range; catalog ids are shared templates.
 */
export function getWarmupCatalog(instrumentId, skillLevel, options) {
  const skill = Math.max(1, Math.min(10, Math.round(Number(skillLevel) || 5)))
  const instrument = normalizePracticeInstrument(instrumentId || (options && options.instrument))
  let eligible = templatesForSkill(skill).slice()

  // Prefer voice-friendly slower patterns when voice is selected: filter out dense sixteenth-heavy if any
  if (instrument === 'voice') {
    eligible = eligible.filter(function(item) {
      return item.id.indexOf('chromatic') === -1
        && item.id.indexOf('sixteenth') === -1
        && item.id.indexOf('two_octave') === -1
    })
  }

  // Ensure about TARGET_CATALOG_SIZE entries by cloning with meter variants if needed
  if (eligible.length < TARGET_CATALOG_SIZE) {
    const extras = []
    const meters = [
      { suffix: '_m34', meter: '3/4', rhythm: [DUR.quarter, DUR.eighth, DUR.eighth] },
      { suffix: '_m68', meter: '6/8', rhythm: [DUR.eighth, DUR.eighth, DUR.quarter], noteLength: '1/8' },
      { suffix: '_m24', meter: '2/4', rhythm: [DUR.quarter, DUR.quarter] },
    ]
    eligible.forEach(function(item) {
      if (eligible.length + extras.length >= TARGET_CATALOG_SIZE) return
      meters.forEach(function(m) {
        if (eligible.length + extras.length >= TARGET_CATALOG_SIZE) return
        if (item.abcOptions && item.abcOptions.meter && item.abcOptions.meter === m.meter) return
        const variantId = item.id + m.suffix
        if (eligible.some(function(e) { return e.id === variantId })
          || extras.some(function(e) { return e.id === variantId })) return
        extras.push(catalogExercise(
          variantId,
          item.minSkill,
          item.maxSkill,
          (typeof item.title === 'function' ? '' : '') + ' variant',
          item.action,
          function(key, ctx) {
            const built = item.build(key, ctx)
            // Rebuild scale with variant rhythm when original returns body
            const midis = buildScaleMidis(key, ctx, { pentascale: skill <= 4 })
            return patternToAbc(key, midis, m.rhythm, ctx)
          },
          Object.assign({}, item.abcOptions || {}, {
            meter: m.meter,
            noteLength: m.noteLength || (item.abcOptions && item.abcOptions.noteLength) || '1/4',
          })
        ))
        // Fix variant title
        const last = extras[extras.length - 1]
        const baseTitle = item.title
        last.title = function(key) {
          return baseTitle(key) + ' (' + m.meter + ')'
        }
      })
    })
    eligible = eligible.concat(extras)
  }

  return eligible.slice(0, Math.max(TARGET_CATALOG_SIZE, Math.min(eligible.length, TARGET_CATALOG_SIZE + 5)))
}

export function selectWarmupsForSession(key, skillLevel, options, maxCount) {
  const opts = options || {}
  const keyName = key || 'C'
  const skill = Math.max(1, Math.min(10, Math.round(Number(skillLevel) || 5)))
  const limit = Math.max(1, maxCount || 2)
  const instrument = normalizePracticeInstrument(opts.instrument)
  const ctx = contextFromOptions(Object.assign({}, opts, { skillLevel: skill, instrument: instrument }))
  const eligible = shuffleArray(getWarmupCatalog(instrument, skill, opts))
  const selected = []
  const usedIds = {}

  eligible.forEach(function(item) {
    if (selected.length >= limit) return
    if (usedIds[item.id]) return
    usedIds[item.id] = true
    const title = item.title(keyName)
    const built = item.build(keyName, ctx)
    const body = typeof built === 'string' ? built : built.body
    let noteCount = 8
    if (typeof built === 'object' && built && built.noteCount) {
      noteCount = built.noteCount
    } else {
      const letters = String(body).replace(/\[[^\]]*\]/g, 'X').match(/[A-Ga-g]/g)
      noteCount = Math.max(1, letters ? letters.length : 1)
    }
    const abcOpts = Object.assign({}, opts, item.abcOptions || {})
    if (typeof built === 'object' && built && built.midis && built.midis.length) {
      abcOpts.firstMidi = built.midis[0]
    }
    if (ctx.isVoice) {
      abcOpts.lyricsLine = lyricsForNoteCount(Math.max(1, noteCount), skill, item.id.length + skill)
      abcOpts.noteLength = abcOpts.noteLength || '1/4'
      // Voice prefers crotchets: avoid forcing 1/8 from catalog unless already set for jig
      if (skill <= 6 && abcOpts.meter !== '6/8') {
        abcOpts.noteLength = '1/4'
      }
    }
    selected.push(Object.assign(makeWarmup(item.id, title, keyName, body, abcOpts), {
      action: item.action,
    }))
  })

  if (selected.length === 0) {
    const fallback = WARMUP_TEMPLATES[0]
    const built = fallback.build(keyName, ctx)
    const body = typeof built === 'string' ? built : built.body
    const abcOpts = Object.assign({}, opts)
    if (typeof built === 'object' && built && built.midis && built.midis.length) {
      abcOpts.firstMidi = built.midis[0]
    }
    if (ctx.isVoice) {
      abcOpts.lyricsLine = lyricsForNoteCount(8, skill, 1)
    }
    selected.push(Object.assign(makeWarmup(fallback.id, fallback.title(keyName), keyName, body, abcOpts), {
      action: fallback.action,
    }))
  }

  return selected
}

/** @deprecated use selectWarmupsForSession */
export function generateWarmupsForKey(key, options) {
  const skill = options && options.skillLevel ? options.skillLevel : 5
  return selectWarmupsForSession(key, skill, options, 2)
}

export function generateScaleWarmup(options) {
  const opts = options || {}
  const key = opts.key || 'C'
  const ctx = contextFromOptions(opts)
  const title = keyDisplayName(key) + ' scale'
  const built = patternToAbc(key, buildScaleMidis(key, ctx, {}), [DUR.quarter], ctx)
  const abcOpts = Object.assign({}, opts, { firstMidi: built.midis && built.midis[0] })
  if (ctx.isVoice) {
    abcOpts.lyricsLine = lyricsForNoteCount(built.noteCount, ctx.skillLevel, 2)
  }
  return makeWarmup('scale', title, key, built.body, abcOpts)
}

export function generateArpeggioWarmup(options) {
  const opts = options || {}
  const key = opts.key || 'C'
  const ctx = contextFromOptions(opts)
  const title = keyDisplayName(key) + ' arpeggio'
  const built = patternToAbc(key, buildArpeggioMidis(key, ctx, {}), [DUR.quarter], ctx)
  const abcOpts = Object.assign({}, opts, { firstMidi: built.midis && built.midis[0] })
  if (ctx.isVoice) {
    abcOpts.lyricsLine = lyricsForNoteCount(built.noteCount, ctx.skillLevel, 3)
  }
  return makeWarmup('arpeggio', title, key, built.body, abcOpts)
}

export function getWarmupCatalogSize(instrumentId, skillLevel, options) {
  if (instrumentId != null || skillLevel != null) {
    return getWarmupCatalog(instrumentId || 'mandolin', skillLevel || 5, options).length
  }
  return WARMUP_TEMPLATES.length
}

export function getWarmupCatalogEntries(instrumentId, skillLevel, options) {
  if (instrumentId != null || skillLevel != null) {
    return getWarmupCatalog(instrumentId || 'mandolin', skillLevel || 5, options)
  }
  return WARMUP_TEMPLATES.slice()
}

export function validateWarmupCatalog(instrumentId, skillLevel) {
  const errors = []
  const instrument = normalizePracticeInstrument(instrumentId || 'mandolin')
  const skill = skillLevel || 5
  const catalog = getWarmupCatalog(instrument, skill, {})
  const ctx = contextFromOptions({ instrument: instrument, skillLevel: skill })
  catalog.forEach(function(item) {
    const built = item.build('C', ctx)
    const body = typeof built === 'string' ? built : built.body
    const abc = buildWarmupAbc(item.title('C'), 'C', body, {
      tempo: 90,
      noteLength: (item.abcOptions && item.abcOptions.noteLength) || '1/4',
      meter: (item.abcOptions && item.abcOptions.meter) || '4/4',
    })
    if (!abc.includes('K:C')) errors.push(item.id + ': missing key')
    if (!/\|]/.test(abc)) errors.push(item.id + ': missing bar end')
    if (!body || body.length < 2) errors.push(item.id + ': empty body')
  })
  return errors
}

export { keyDisplayName, TARGET_CATALOG_SIZE, VOCAL_SYLLABLES }
