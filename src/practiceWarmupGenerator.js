import { midiToAbcPitch, parseKeySignatureForTests } from './melodyPitchSpelling'

const MAJOR_SCALE_STEPS = [0, 2, 4, 5, 7, 9, 11, 12]
const MINOR_SCALE_STEPS = [0, 2, 3, 5, 7, 8, 10, 12]
const MAJOR_ARPEGGIO_STEPS = [0, 4, 7, 12]
const MINOR_ARPEGGIO_STEPS = [0, 3, 7, 12]
const PENTASCALE_DEGREES = 5

const DEFAULT_TEMPO = 90
const DEFAULT_METER = '4/4'
const DEFAULT_NOTE_LENGTH = '1/4'

const DUR = {
  quarter: '',
  eighth: '/2',
  dottedQuarter: '3/2',
  half: '2',
  triplet: '/3',
}

function rootToMidiBase(root) {
  const keyInfo = parseKeySignatureForTests(root)
  if (!keyInfo) return 60
  const roots = {
    C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
    'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11,
  }
  const pc = roots[keyInfo.root] != null ? roots[keyInfo.root] : 0
  return 60 + pc
}

function keyInfoFor(key) {
  return parseKeySignatureForTests(key) || { root: 'C', mode: 'major' }
}

function scaleSteps(key, options) {
  const opts = options || {}
  const info = keyInfoFor(key)
  const full = info.mode === 'minor' ? MINOR_SCALE_STEPS : MAJOR_SCALE_STEPS
  if (opts.pentascale) return full.slice(0, PENTASCALE_DEGREES)
  if (opts.twoOctaves) {
    return full.concat(full.slice(1).map(function(s) { return s + 12 }))
  }
  return full
}

function arpeggioSteps(key) {
  const info = keyInfoFor(key)
  return info.mode === 'minor' ? MINOR_ARPEGGIO_STEPS : MAJOR_ARPEGGIO_STEPS
}

function pitchAt(steps, index, key, baseMidi) {
  const step = steps[Math.max(0, Math.min(steps.length - 1, index))]
  return midiToAbcPitch(baseMidi + step, { key: key })
}

function stepsToAbc(steps, key, baseMidi, rhythm) {
  const pattern = rhythm || [DUR.quarter]
  return steps.map(function(step, index) {
    const dur = pattern[index % pattern.length]
    return midiToAbcPitch(baseMidi + step, { key: key }) + dur
  }).join('')
}

function upDownSteps(steps) {
  return steps.concat(steps.slice(0, -1).reverse())
}

function keyDisplayName(key) {
  const keyInfo = parseKeySignatureForTests(key)
  if (!keyInfo) return String(key || 'C')
  const modeLabel = keyInfo.mode === 'minor' ? ' minor' : ' major'
  return keyInfo.root + modeLabel
}

function buildWarmupAbc(title, key, noteBody, options) {
  const opts = options || {}
  const tempo = opts.tempo || DEFAULT_TEMPO
  const meter = opts.meter || DEFAULT_METER
  const noteLength = opts.noteLength || DEFAULT_NOTE_LENGTH
  return (
    'X:1\n'
    + 'T:' + title + '\n'
    + 'M:' + meter + '\n'
    + 'L:' + noteLength + '\n'
    + 'Q:1/4=' + tempo + '\n'
    + 'K:' + (key || 'C') + '\n'
    + noteBody + ' |]\n'
  )
}

function makeWarmup(id, title, key, noteBody, options) {
  const opts = options || {}
  return {
    id: id,
    title: title,
    meter: opts.meter || DEFAULT_METER,
    abc: buildWarmupAbc(title, key, noteBody, options),
  }
}

function buildScalePattern(key, options, rhythm) {
  const opts = options || {}
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, opts)
  const baseMidi = rootToMidiBase(info.root)
  return stepsToAbc(upDownSteps(steps), key, baseMidi, rhythm)
}

function buildArpeggioPattern(key, options, rhythm) {
  const info = keyInfoFor(key)
  const steps = arpeggioSteps(key)
  const baseMidi = rootToMidiBase(info.root)
  return stepsToAbc(upDownSteps(steps), key, baseMidi, rhythm)
}

function buildThirdsPattern(key, options) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, options)
  const baseMidi = rootToMidiBase(info.root)
  const pairs = []
  for (let i = 0; i < steps.length - 1; i++) {
    pairs.push(steps[i], steps[i + 1])
  }
  const down = pairs.slice(0, -1).reverse()
  return stepsToAbc(pairs.concat(down), key, baseMidi, [DUR.quarter, DUR.eighth])
}

function buildSequencePattern(key, options) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, options)
  const baseMidi = rootToMidiBase(info.root)
  const seq = []
  for (let i = 0; i < steps.length - 2; i++) {
    seq.push(steps[i], steps[i + 1], steps[i + 2])
  }
  return stepsToAbc(seq, key, baseMidi, [DUR.eighth, DUR.eighth, DUR.quarter])
}

function buildBrokenChordPattern(key, options) {
  const info = keyInfoFor(key)
  const steps = arpeggioSteps(key)
  const baseMidi = rootToMidiBase(info.root)
  const body = []
  for (let i = 0; i < 3; i++) {
    body.push(stepsToAbc(steps, key, baseMidi, [DUR.quarter, DUR.eighth, DUR.eighth, DUR.quarter]))
  }
  return body.join('')
}

function buildFifthHopPattern(key, options) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, { pentascale: options && options.pentascale })
  const baseMidi = rootToMidiBase(info.root)
  const hops = []
  steps.forEach(function(step) {
    hops.push(step, step + 7)
  })
  return stepsToAbc(upDownSteps(hops), key, baseMidi, [DUR.quarter, DUR.eighth])
}

function buildChromaticApproachPattern(key) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, {})
  const baseMidi = rootToMidiBase(info.root)
  const chrom = []
  steps.forEach(function(step) {
    chrom.push(step - 1, step)
  })
  return stepsToAbc(chrom, key, baseMidi, [DUR.eighth, DUR.quarter])
}

function buildTripletScalePattern(key, options) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, options)
  const baseMidi = rootToMidiBase(info.root)
  const notes = upDownSteps(steps).map(function(step) {
    return midiToAbcPitch(baseMidi + step, { key: key })
  })
  let body = ''
  for (let i = 0; i < notes.length; i += 3) {
    const group = notes.slice(i, i + 3)
    if (group.length === 3) {
      body += '(3' + group.map(function(n) { return n + DUR.triplet }).join('') + ''
    } else {
      body += group.join('')
    }
  }
  return body
}

function buildDottedScalePattern(key, options) {
  return buildScalePattern(key, options, [DUR.dottedQuarter, DUR.eighth])
}

function buildSyncopatedPattern(key) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, { pentascale: true })
  const baseMidi = rootToMidiBase(info.root)
  return stepsToAbc(upDownSteps(steps), key, baseMidi, [DUR.eighth, DUR.quarter, DUR.eighth, DUR.quarter])
}

function buildLongTonePattern(key) {
  const info = keyInfoFor(key)
  const steps = arpeggioSteps(key)
  const baseMidi = rootToMidiBase(info.root)
  return stepsToAbc(steps, key, baseMidi, [DUR.half, DUR.quarter])
}

function buildAscendingScalePattern(key, options, rhythm) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, options)
  const baseMidi = rootToMidiBase(info.root)
  return stepsToAbc(steps, key, baseMidi, rhythm)
}

function buildDescendingScalePattern(key, options, rhythm) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, options)
  const baseMidi = rootToMidiBase(info.root)
  return stepsToAbc(steps.slice().reverse(), key, baseMidi, rhythm)
}

function buildArpeggioPatternRhythm(key, rhythm) {
  const info = keyInfoFor(key)
  const steps = arpeggioSteps(key)
  const baseMidi = rootToMidiBase(info.root)
  return stepsToAbc(upDownSteps(steps), key, baseMidi, rhythm)
}

function buildSixteenthPattern(key, options) {
  return buildScalePattern(key, options, [DUR.eighth, DUR.eighth, DUR.eighth, DUR.eighth])
}

function buildSwingPattern(key, options) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, options)
  const baseMidi = rootToMidiBase(info.root)
  return stepsToAbc(upDownSteps(steps), key, baseMidi, [DUR.dottedQuarter, DUR.eighth, DUR.quarter, DUR.eighth])
}

function buildLeapPattern(key) {
  const info = keyInfoFor(key)
  const steps = arpeggioSteps(key)
  const baseMidi = rootToMidiBase(info.root)
  const leaps = [steps[0], steps[2], steps[1], steps[3]]
  return stepsToAbc(upDownSteps(leaps), key, baseMidi, [DUR.quarter, DUR.eighth])
}

function buildNeighborTonePattern(key) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, { pentascale: true })
  const baseMidi = rootToMidiBase(info.root)
  const neighbors = []
  steps.forEach(function(step) {
    neighbors.push(step, step + 1, step)
  })
  return stepsToAbc(neighbors, key, baseMidi, [DUR.eighth, DUR.eighth, DUR.quarter])
}

function buildTurnPattern(key) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, { pentascale: true })
  const baseMidi = rootToMidiBase(info.root)
  const turns = []
  for (let i = 0; i < steps.length - 1; i++) {
    turns.push(steps[i], steps[i + 1], steps[i])
  }
  return stepsToAbc(turns, key, baseMidi, [DUR.eighth, DUR.eighth, DUR.quarter])
}

function buildMordentPattern(key) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, { pentascale: true })
  const baseMidi = rootToMidiBase(info.root)
  const mordents = []
  steps.forEach(function(step) {
    mordents.push(step, step + 2, step)
  })
  return stepsToAbc(mordents, key, baseMidi, [DUR.eighth, DUR.eighth, DUR.quarter])
}

function buildArpeggioTripletPattern(key) {
  const info = keyInfoFor(key)
  const steps = arpeggioSteps(key)
  const baseMidi = rootToMidiBase(info.root)
  const notes = upDownSteps(steps).map(function(step) {
    return midiToAbcPitch(baseMidi + step, { key: key })
  })
  let body = ''
  for (let i = 0; i < notes.length; i += 3) {
    const group = notes.slice(i, i + 3)
    if (group.length === 3) {
      body += '(3' + group.map(function(n) { return n + DUR.triplet }).join('') + ''
    } else {
      body += group.join('')
    }
  }
  return body
}

function buildScaleInSixthsPattern(key, options) {
  const info = keyInfoFor(key)
  const steps = scaleSteps(key, options)
  const baseMidi = rootToMidiBase(info.root)
  const pairs = []
  for (let i = 0; i < steps.length - 2; i++) {
    pairs.push(steps[i], steps[i + 2])
  }
  return stepsToAbc(pairs, key, baseMidi, [DUR.quarter, DUR.eighth])
}

function buildAlternatingOctavePattern(key) {
  const info = keyInfoFor(key)
  const steps = arpeggioSteps(key)
  const baseMidi = rootToMidiBase(info.root)
  const alt = []
  steps.forEach(function(step) {
    alt.push(step, step + 12)
  })
  return stepsToAbc(upDownSteps(alt), key, baseMidi, [DUR.quarter, DUR.eighth])
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

function scaleRhythmVariants(baseId, minSkill, maxSkill, label, actionBase, scaleOpts) {
  const opts = scaleOpts || {}
  return [
    catalogExercise(baseId, minSkill, maxSkill, label, actionBase,
      function(key) { return buildScalePattern(key, opts, [DUR.quarter]) }),
    catalogExercise(baseId + '_eighth', minSkill, Math.min(10, maxSkill + 1), label + ' (eighth notes)',
      'Keep eighth notes even and relaxed.',
      function(key) { return buildScalePattern(key, opts, [DUR.eighth]) }, { noteLength: '1/8' }),
    catalogExercise(baseId + '_half', minSkill, maxSkill, label + ' (half notes)',
      'Hold each tone with a singing sound.',
      function(key) { return buildScalePattern(key, opts, [DUR.half]) }),
    catalogExercise(baseId + '_dotted', Math.min(10, minSkill + 2), maxSkill, label + ' (dotted rhythm)',
      'Play the long-short pattern steadily.',
      function(key) { return buildScalePattern(key, opts, [DUR.dottedQuarter, DUR.eighth]) }),
    catalogExercise(baseId + '_asc', minSkill, maxSkill, label + ' (ascending)',
      'Ascend through the pattern with an even tone.',
      function(key) { return buildAscendingScalePattern(key, opts, [DUR.quarter]) }),
  ]
}

function buildWarmupCatalog() {
  const catalog = []
  catalog.push.apply(catalog, scaleRhythmVariants(
    'pentascale', 1, 3, ' five-note scale',
    'Play the five-note scale up and down with even tone.',
    { pentascale: true }
  ))
  catalog.push.apply(catalog, scaleRhythmVariants(
    'scale_slow', 2, 5, ' scale (slow)',
    'Play each scale tone steadily and relaxed.',
    {}
  ))
  catalog.push.apply(catalog, scaleRhythmVariants(
    'scale', 3, 10, ' scale',
    'Play the scale up and down. Focus on even notes and relaxed hands.',
    {}
  ))
  catalog.push(
    catalogExercise('scale_dotted', 5, 10, ' dotted rhythm scale',
      'Play the dotted-quarter / eighth pattern evenly on each scale degree.',
      function(key) { return buildDottedScalePattern(key, {}) }),
    catalogExercise('scale_syncopated', 4, 8, ' syncopated scale',
      'Keep the pulse steady through the short-long note pattern.',
      function(key) { return buildSyncopatedPattern(key) }),
    catalogExercise('scale_triplet', 6, 10, ' triplet scale',
      'Play smooth triplets through the scale.',
      function(key) { return buildTripletScalePattern(key, {}) }),
    catalogExercise('scale_two_octave', 8, 10, ' two-octave scale',
      'Play two octaves up and down with an even sound.',
      function(key) { return buildScalePattern(key, { twoOctaves: true }, [DUR.quarter]) }),
    catalogExercise('scale_sixteenth', 7, 10, ' sixteenth-note scale',
      'Keep the sixteenth notes light and even.',
      function(key) { return buildSixteenthPattern(key, {}) }, { noteLength: '1/8' }),
    catalogExercise('scale_swing', 5, 9, ' swing-feel scale',
      'Lean into the long-short swing pattern.',
      function(key) { return buildSwingPattern(key, {}) }),
    catalogExercise('scale_desc', 3, 7, ' descending scale',
      'Descend from the top with control.',
      function(key) { return buildDescendingScalePattern(key, {}, [DUR.quarter]) })
  )
  catalog.push.apply(catalog, [
    catalogExercise('arpeggio', 2, 10, ' arpeggio',
      'Play the arpeggio up and down. Keep a steady pulse.',
      function(key) { return buildArpeggioPattern(key, {}, [DUR.quarter]) }),
    catalogExercise('arpeggio_eighth', 3, 10, ' arpeggio (eighth notes)',
      'Play the arpeggio in even eighth notes.',
      function(key) { return buildArpeggioPatternRhythm(key, [DUR.eighth]) }, { noteLength: '1/8' }),
    catalogExercise('arpeggio_broken', 3, 8, ' broken chord pattern',
      'Repeat the root-third-fifth pattern with a steady rhythm.',
      function(key) { return buildBrokenChordPattern(key, {}) }),
    catalogExercise('arpeggio_long', 2, 6, ' long-tone arpeggio',
      'Hold the longer notes, then connect smoothly to the next.',
      function(key) { return buildLongTonePattern(key) }),
    catalogExercise('arpeggio_triplet', 6, 10, ' triplet arpeggio',
      'Flow through triplet arpeggios evenly.',
      function(key) { return buildArpeggioTripletPattern(key) }),
    catalogExercise('arpeggio_leap', 5, 9, ' arpeggio leaps',
      'Jump between chord tones with a steady pulse.',
      function(key) { return buildLeapPattern(key) }),
    catalogExercise('arpeggio_alt_octave', 7, 10, ' alternating octave arpeggio',
      'Alternate chord tones with their octave above.',
      function(key) { return buildAlternatingOctavePattern(key) }),
  ])
  catalog.push.apply(catalog, [
    catalogExercise('scale_thirds', 4, 10, ' scale in thirds',
      'Play each pair of scale steps: up a third, then move to the next pair.',
      function(key) { return buildThirdsPattern(key, {}) }),
    catalogExercise('scale_sixths', 6, 10, ' scale in sixths',
      'Leap a sixth between scale degrees.',
      function(key) { return buildScaleInSixthsPattern(key, {}) }),
    catalogExercise('scale_sequence', 5, 10, ' scale sequence',
      'Play the 1-2-3, 2-3-4 pattern ascending through the scale.',
      function(key) { return buildSequencePattern(key, {}) }),
    catalogExercise('fifth_hops', 5, 9, ' fifth hops',
      'Leap to the fifth above each scale tone and return.',
      function(key, opts) { return buildFifthHopPattern(key, { pentascale: opts && opts.skillLevel <= 4 }) }),
    catalogExercise('chromatic_approach', 7, 10, ' chromatic approach',
      'Approach each scale tone from a half step below.',
      function(key) { return buildChromaticApproachPattern(key) }),
    catalogExercise('neighbor_tones', 4, 8, ' neighbor tones',
      'Play each tone, step above, then return.',
      function(key) { return buildNeighborTonePattern(key) }),
    catalogExercise('turns', 5, 9, ' turns',
      'Play a turn figure on each scale step.',
      function(key) { return buildTurnPattern(key) }),
    catalogExercise('mordents', 6, 10, ' mordents',
      'Play quick lower-neighbor figures on each tone.',
      function(key) { return buildMordentPattern(key) }),
  ])
  catalog.push.apply(catalog, scaleRhythmVariants(
    'two_octave', 7, 10, ' two-octave scale',
    'Play two octaves with an even tone.',
    { twoOctaves: true }
  ))
  catalog.push.apply(catalog, [
    catalogExercise('waltz_scale', 3, 8, ' waltz rhythm scale',
      'Stress beat one in this 3/4 scale pattern.',
      function(key) { return buildScalePattern(key, {}, [DUR.quarter, DUR.eighth, DUR.eighth]) }, { meter: '3/4' }),
    catalogExercise('waltz_arpeggio', 3, 9, ' waltz arpeggio',
      'Arpeggiate in a 3/4 feel.',
      function(key) { return buildArpeggioPatternRhythm(key, [DUR.quarter, DUR.eighth, DUR.eighth]) }, { meter: '3/4' }),
    catalogExercise('jig_scale', 5, 10, ' jig rhythm scale',
      'Keep the 6/8 lilt steady through the scale.',
      function(key) { return buildScalePattern(key, {}, [DUR.eighth, DUR.eighth, DUR.quarter]) }, { meter: '6/8', noteLength: '1/8' }),
    catalogExercise('jig_arpeggio', 5, 10, ' jig arpeggio',
      'Play arpeggios with a jig rhythm.',
      function(key) { return buildArpeggioPatternRhythm(key, [DUR.eighth, DUR.eighth, DUR.quarter]) }, { meter: '6/8', noteLength: '1/8' }),
    catalogExercise('reverse_arpeggio', 4, 9, ' reverse arpeggio',
      'Descend the arpeggio first, then ascend.',
      function(key) {
        const info = keyInfoFor(key)
        const steps = arpeggioSteps(key).slice().reverse()
        const baseMidi = rootToMidiBase(info.root)
        return stepsToAbc(upDownSteps(steps), key, baseMidi, [DUR.quarter])
      }),
    catalogExercise('scale_quarters_staccato', 4, 8, ' detached quarter scale',
      'Play short, detached quarters through the scale.',
      function(key) { return buildScalePattern(key, {}, [DUR.quarter]) }),
    catalogExercise('arpeggio_dotted', 4, 9, ' dotted arpeggio',
      'Use a dotted rhythm on each arpeggio figure.',
      function(key) { return buildArpeggioPatternRhythm(key, [DUR.dottedQuarter, DUR.eighth]) }),
    catalogExercise('pentascale_syncopated', 2, 5, ' syncopated pentascale',
      'Keep the pulse in this five-note syncopated pattern.',
      function(key) { return buildSyncopatedPattern(key) }),
    catalogExercise('pentascale_triplet', 3, 6, ' triplet pentascale',
      'Play triplets on the first five scale degrees.',
      function(key) { return buildTripletScalePattern(key, { pentascale: true }) }),
    catalogExercise('sequence_eighth', 5, 10, ' eighth-note sequence',
      'Play the 1-2-3 pattern in flowing eighth notes.',
      function(key) {
        const info = keyInfoFor(key)
        const steps = scaleSteps(key, {})
        const baseMidi = rootToMidiBase(info.root)
        const seq = []
        for (let i = 0; i < steps.length - 2; i++) {
          seq.push(steps[i], steps[i + 1], steps[i + 2])
        }
        return stepsToAbc(seq, key, baseMidi, [DUR.eighth, DUR.eighth, DUR.eighth])
      }, { noteLength: '1/8' }),
    catalogExercise('thirds_eighth', 5, 10, ' eighth-note thirds',
      'Play scale thirds in even eighth notes.',
      function(key) {
        const info = keyInfoFor(key)
        const steps = scaleSteps(key, {})
        const baseMidi = rootToMidiBase(info.root)
        const pairs = []
        for (let i = 0; i < steps.length - 1; i++) {
          pairs.push(steps[i], steps[i + 1])
        }
        return stepsToAbc(pairs, key, baseMidi, [DUR.eighth, DUR.eighth])
      }, { noteLength: '1/8' }),
    catalogExercise('fifth_hops_eighth', 6, 10, ' eighth-note fifth hops',
      'Hop to the fifth in a light eighth-note feel.',
      function(key) { return buildFifthHopPattern(key, {}) }),
    catalogExercise('chromatic_approach_eighth', 7, 10, ' chromatic approach (eighths)',
      'Approach each tone with quick chromatic eighths.',
      function(key) { return buildChromaticApproachPattern(key) }, { noteLength: '1/8' }),
    catalogExercise('long_tone_scale', 2, 5, ' long-tone scale',
      'Sustain each scale degree, then move smoothly.',
      function(key) { return buildScalePattern(key, {}, [DUR.half, DUR.quarter]) }),
    catalogExercise('broken_chord_eighth', 4, 9, ' broken chord (eighths)',
      'Repeat broken chords in steady eighth notes.',
      function(key) { return buildBrokenChordPattern(key, {}) }, { noteLength: '1/8' }),
    catalogExercise('neighbor_eighth', 4, 8, ' neighbor tones (eighths)',
      'Play upper neighbors in a light eighth-note style.',
      function(key) { return buildNeighborTonePattern(key) }, { noteLength: '1/8' }),
    catalogExercise('turns_eighth', 5, 9, ' turns (eighths)',
      'Play turn figures in even eighth notes.',
      function(key) { return buildTurnPattern(key) }, { noteLength: '1/8' }),
    catalogExercise('swing_arpeggio', 5, 10, ' swing arpeggio',
      'Swing through each arpeggio figure.',
      function(key) { return buildSwingPattern(key, { pentascale: true }) }),
    catalogExercise('sixth_leaps', 6, 10, ' sixth leaps',
      'Leap a sixth and step back on each degree.',
      function(key) { return buildScaleInSixthsPattern(key, {}) }),
    catalogExercise('octave_scale', 6, 10, ' octave scale',
      'Play each tone then its octave above.',
      function(key) { return buildAlternatingOctavePattern(key) }),
    catalogExercise('pickup_scale', 4, 8, ' pickup scale',
      'Lead into the downbeat with a short pickup.',
      function(key) {
        const info = keyInfoFor(key)
        const steps = scaleSteps(key, { pentascale: true })
        const baseMidi = rootToMidiBase(info.root)
        return stepsToAbc(steps, key, baseMidi, [DUR.eighth, DUR.quarter, DUR.quarter, DUR.quarter])
      }),
    catalogExercise('arpeggio_ascending', 2, 7, ' ascending arpeggio',
      'Ascend the arpeggio with a steady pulse.',
      function(key) {
        const info = keyInfoFor(key)
        const steps = arpeggioSteps(key)
        const baseMidi = rootToMidiBase(info.root)
        return stepsToAbc(steps, key, baseMidi, [DUR.quarter])
      }),
    catalogExercise('scale_echo', 3, 7, ' call-and-response scale',
      'Play each degree twice before moving on.',
      function(key) {
        const info = keyInfoFor(key)
        const steps = scaleSteps(key, { pentascale: true })
        const baseMidi = rootToMidiBase(info.root)
        const echoed = []
        steps.forEach(function(step) {
          echoed.push(step, step)
        })
        return stepsToAbc(echoed, key, baseMidi, [DUR.quarter, DUR.eighth])
      }),
    catalogExercise('arpeggio_echo', 3, 8, ' call-and-response arpeggio',
      'Echo each arpeggio tone before continuing.',
      function(key) {
        const info = keyInfoFor(key)
        const steps = arpeggioSteps(key)
        const baseMidi = rootToMidiBase(info.root)
        const echoed = []
        steps.forEach(function(step) {
          echoed.push(step, step)
        })
        return stepsToAbc(echoed, key, baseMidi, [DUR.quarter, DUR.eighth])
      }),
    catalogExercise('scale_groups_of_four', 4, 9, ' four-note scale groups',
      'Accent the first note of each four-note group.',
      function(key) {
        const info = keyInfoFor(key)
        const steps = scaleSteps(key, {})
        const baseMidi = rootToMidiBase(info.root)
        return stepsToAbc(steps, key, baseMidi, [DUR.quarter, DUR.eighth, DUR.eighth, DUR.eighth])
      }),
    catalogExercise('mixed_rhythm_scale', 5, 10, ' mixed rhythm scale',
      'Combine quarter and eighth notes evenly.',
      function(key) { return buildScalePattern(key, {}, [DUR.quarter, DUR.eighth, DUR.eighth, DUR.quarter]) }),
    catalogExercise('arpeggio_groups', 4, 9, ' grouped arpeggio',
      'Play each arpeggio tone twice in a steady pattern.',
      function(key) { return buildBrokenChordPattern(key, {}) }),
    catalogExercise('pentascale_half', 1, 4, ' half-note pentascale',
      'Use long tones on the five-note scale.',
      function(key) { return buildScalePattern(key, { pentascale: true }, [DUR.half]) }),
    catalogExercise('pentascale_dotted', 2, 5, ' dotted pentascale',
      'Apply dotted rhythm to the five-note scale.',
      function(key) { return buildScalePattern(key, { pentascale: true }, [DUR.dottedQuarter, DUR.eighth]) }),
    catalogExercise('scale_chromatic_exit', 8, 10, ' chromatic finish scale',
      'Approach the top with chromatic leading tones.',
      function(key) {
        const info = keyInfoFor(key)
        const steps = scaleSteps(key, {})
        const baseMidi = rootToMidiBase(info.root)
        const top = steps[steps.length - 1]
        const tail = steps.slice(0, -1).concat([top - 1, top])
        return stepsToAbc(tail, key, baseMidi, [DUR.quarter])
      }),
    catalogExercise('arpeggio_syncopated', 5, 9, ' syncopated arpeggio',
      'Keep time through syncopated arpeggio figures.',
      function(key) { return buildArpeggioPatternRhythm(key, [DUR.eighth, DUR.quarter, DUR.eighth, DUR.quarter]) }),
    catalogExercise('scale_quintuple', 7, 10, ' five-note bursts',
      'Play five quick notes per scale degree.',
      function(key) {
        const info = keyInfoFor(key)
        const steps = scaleSteps(key, { pentascale: true })
        const baseMidi = rootToMidiBase(info.root)
        const bursts = []
        steps.forEach(function(step) {
          for (let i = 0; i < 5; i++) bursts.push(step)
        })
        return stepsToAbc(bursts, key, baseMidi, [DUR.eighth])
      }, { noteLength: '1/8' }),
  ])
  return catalog
}

const WARMUP_CATALOG = buildWarmupCatalog()

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

function catalogForSkill(skillLevel) {
  const skill = Math.max(1, Math.min(10, Math.round(Number(skillLevel) || 5)))
  return WARMUP_CATALOG.filter(function(item) {
    return skill >= item.minSkill && skill <= item.maxSkill
  })
}

export function selectWarmupsForSession(key, skillLevel, options, maxCount) {
  const opts = options || {}
  const keyName = key || 'C'
  const skill = Math.max(1, Math.min(10, Math.round(Number(skillLevel) || 5)))
  const limit = Math.max(1, maxCount || 2)
  const eligible = shuffleArray(catalogForSkill(skill))
  const selected = []
  const usedIds = {}

  eligible.forEach(function(item) {
    if (selected.length >= limit) return
    if (usedIds[item.id]) return
    usedIds[item.id] = true
    const title = item.title(keyName)
    const noteBody = item.build(keyName, Object.assign({}, opts, { skillLevel: skill }))
    const abcOpts = Object.assign({}, opts, item.abcOptions || {})
    selected.push(Object.assign(makeWarmup(item.id, title, keyName, noteBody, abcOpts), {
      action: item.action,
    }))
  })

  if (selected.length === 0) {
    const fallback = WARMUP_CATALOG[0]
    const title = fallback.title(keyName)
    selected.push(Object.assign(makeWarmup(fallback.id, title, keyName, fallback.build(keyName, opts), opts), {
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
  const title = keyDisplayName(key) + ' scale'
  const notes = buildScalePattern(key, {}, [DUR.quarter])
  return makeWarmup('scale', title, key, notes, opts)
}

export function generateArpeggioWarmup(options) {
  const opts = options || {}
  const key = opts.key || 'C'
  const title = keyDisplayName(key) + ' arpeggio'
  const notes = buildArpeggioPattern(key, {}, [DUR.quarter])
  return makeWarmup('arpeggio', title, key, notes, opts)
}

export function getWarmupCatalogSize() {
  return WARMUP_CATALOG.length
}

export function getWarmupCatalogEntries() {
  return WARMUP_CATALOG.slice()
}

export function validateWarmupCatalog() {
  const errors = []
  WARMUP_CATALOG.forEach(function(item) {
    const body = item.build('C', { skillLevel: 5, tempo: 90 })
    const abc = buildWarmupAbc(item.title('C'), 'C', body, { tempo: 90, noteLength: (item.abcOptions && item.abcOptions.noteLength) || '1/4' })
    if (!abc.includes('K:C')) errors.push(item.id + ': missing key')
    if (!abc.match(/\|]\s*$/)) errors.push(item.id + ': missing bar end')
    if (!body || body.length < 2) errors.push(item.id + ': empty body')
  })
  return errors
}

export { keyDisplayName }
