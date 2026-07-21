/** Shared string sets (low → high). */
const S = {
  gdae: ['G3', 'D4', 'A4', 'E5'],
  aeae: ['A3', 'E4', 'A4', 'E5'],
  gdgd: ['G3', 'D4', 'G4', 'D5'],
  aeacSharp: ['A3', 'E4', 'A4', 'C#5'],
  adae: ['A3', 'D4', 'A4', 'E5'],
  ddad: ['D3', 'D4', 'A4', 'D5'],
  gdad: ['G3', 'D4', 'A4', 'D5'],
  gdadBouzouki: ['G2', 'D3', 'A3', 'D4'],
  aead: ['A3', 'E4', 'A4', 'D5'],
  gdgb: ['G3', 'D4', 'G4', 'B4'],
  gdacSharp: ['G3', 'D4', 'A4', 'C#5'],
  fcgd: ['F3', 'C4', 'G4', 'D5'],
  cgda: ['C3', 'G3', 'D4', 'A4'],
  edae: ['E3', 'D4', 'A4', 'E5'],
  eeae: ['E3', 'E4', 'A4', 'E5'],
  gcge: ['G3', 'C4', 'G4', 'E5'],
  adfSharpE: ['A3', 'D4', 'F#4', 'E5'],
  ddae: ['D3', 'D4', 'A4', 'E5'],
  gdadLow: ['G2', 'D3', 'A3', 'D4'],
  guitarStandard: ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  dropD: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  openG: ['D2', 'G2', 'D3', 'G3', 'B3', 'D4'],
  openD: ['D2', 'A2', 'D3', 'F#3', 'A3', 'D4'],
  dadgad: ['D2', 'A2', 'D3', 'G3', 'A3', 'D4'],
  openC: ['C2', 'G2', 'C3', 'G3', 'C4', 'E4'],
  openE: ['E2', 'B2', 'E3', 'G#3', 'B3', 'E4'],
  doubleDropD: ['D2', 'A2', 'D3', 'G3', 'B3', 'D4'],
  dropC: ['C2', 'A2', 'D3', 'G3', 'B3', 'E4'],
  openDm: ['D2', 'A2', 'D3', 'F3', 'A3', 'D4'],
  cgdgad: ['C2', 'G2', 'D3', 'G3', 'A3', 'D4'],
  openA: ['E2', 'A2', 'E3', 'A3', 'C#4', 'E4'],
  gceaHighG: ['G4', 'C4', 'E4', 'A4'],
  gceaLowG: ['G3', 'C4', 'E4', 'A4'],
  baritoneUke: ['D3', 'G3', 'B3', 'E4'],
  ukeDTuning: ['A3', 'D4', 'F#4', 'B4'],
  slackKeyGCEG: ['G3', 'C4', 'E4', 'G4'],
  bebe: ['B3', 'E4', 'B3', 'E4'],
  banjo4Cgda: ['C3', 'G3', 'D4', 'A4'],
  banjo4Gdae: ['G3', 'D4', 'A4', 'E5'],
  banjo4Chicago: ['D3', 'G3', 'B3', 'E4'],
  banjo4Plectrum: ['C3', 'G3', 'B3', 'D4'],
  banjo4Adfd: ['A3', 'D4', 'F#4', 'D5'],
  banjo5OpenG: ['G4', 'D3', 'G3', 'B3', 'D4'],
  banjo5DoubleC: ['G4', 'C3', 'G3', 'C4', 'E4'],
  banjo5Sawmill: ['G4', 'D3', 'G3', 'C4', 'D4'],
  banjo5OpenC: ['G4', 'C3', 'G3', 'C4', 'E4'],
  banjo5ADGBD: ['A4', 'D3', 'G3', 'B3', 'D4'],
  banjo5OpenGm: ['G4', 'D3', 'G3', 'Bb3', 'D4'],
  banjo5DropC: ['G4', 'C3', 'G3', 'B3', 'D4'],
  bouzoukiCfad: ['C3', 'F3', 'A3', 'D4'],
  bouzoukiAdad: ['A2', 'D3', 'A3', 'D4'],
  bouzoukiDgbe: ['D3', 'G3', 'B3', 'E4'],
  violinGdae: ['G3', 'D4', 'A4', 'E5'],
  violaCgda: ['C3', 'G3', 'D4', 'A4'],
  celloCgda: ['C2', 'G2', 'D3', 'A3'],
  bassEadg: ['E1', 'A1', 'D2', 'G2']
}

function chordTuningFromStrings(strings) {
  return strings.map(function(s) {
    const letter = s.replace(/[0-9]/g, '')
    return letter.length === 1 ? letter : letter[0] + (letter.slice(1).toLowerCase() === 'b' ? 'b' : letter.slice(1))
  })
}

function preset(id, label, strings, options) {
  const opts = options || {}
  return {
    id,
    label,
    strings,
    chordTuning: opts.chordTuning || chordTuningFromStrings(strings),
    aliases: opts.aliases || [],
    tags: opts.tags || []
  }
}

export const TUNER_INSTRUMENT_LABELS = {
  chromatic: 'Chromatic',
  violin: 'Violin',
  viola: 'Viola',
  cello: 'Cello',
  bass: 'Double bass',
  guitar: 'Guitar',
  mandolin: 'Fiddle/Mandolin',
  uke: 'Uke',
  banjo4: '4-string banjo',
  banjo5: '5-string banjo',
  bouzouki: 'Bouzouki'
}

export const CHROMATIC_INSTRUMENT = 'chromatic'

/** Bowed family — tuner + audio analysis; not used by chord charts. */
export const BOWED_TUNER_INSTRUMENTS = ['violin', 'viola', 'cello', 'bass']

/** Instruments with chord-chart support. */
export const CHORD_TUNER_INSTRUMENTS = ['guitar', 'mandolin', 'uke', 'banjo4', 'banjo5', 'bouzouki']

export const TUNER_INSTRUMENTS = BOWED_TUNER_INSTRUMENTS.concat(CHORD_TUNER_INSTRUMENTS)

/** Audio Analysis: bowed first, then chord instruments except mandolin (use violin + fiddle tunings). */
export const AUDIO_ANALYSIS_INSTRUMENTS = BOWED_TUNER_INSTRUMENTS.concat(
  CHORD_TUNER_INSTRUMENTS.filter(function(i) { return i !== 'mandolin' })
)

export function normalizeAudioAnalysisInstrument(instrument) {
  return instrument === 'mandolin' ? 'violin' : instrument
}

export function isChromaticInstrument(instrument) {
  return instrument === CHROMATIC_INSTRUMENT
}

export function isBowedTunerInstrument(instrument) {
  return BOWED_TUNER_INSTRUMENTS.indexOf(instrument) !== -1
}

/** Fiddle uses mandolin presets; apply bowed-style pitch smoothing. */
export function usesBowedTunerStabilization(instrument) {
  return isBowedTunerInstrument(instrument) || instrument === 'mandolin'
}

export function isValidTunerInstrumentSelection(instrument) {
  return isChromaticInstrument(instrument) || TUNER_INSTRUMENTS.indexOf(instrument) !== -1
}

const FIDDLE_MANDOLIN_TUNING_PRESETS = [
  preset('gdae', 'GDAE (standard)', S.gdae, { aliases: ['Italian tuning', 'standard'], tags: ['irish', 'bluegrass', 'classical'] }),
  preset('aeae', 'AEAE (cross A)', S.aeae, { aliases: ['cross tuning', 'cross A', 'cross chord', 'sawmill'], tags: ['old-time'] }),
  preset('gdgd', 'GDGD (cross G)', S.gdgd, { aliases: ['cross G', 'sawmill'], tags: ['old-time'] }),
  preset('aeacSharp', 'Calico (AEAC#)', S.aeacSharp, { aliases: ['Black Mountain Rag', 'Drunken Hiccups', 'calico', 'AEAC#', 'open A'], tags: ['old-time'] }),
  preset('adae', 'ADAE (high bass)', S.adae, { aliases: ['old-timey D', 'high bass'], tags: ['old-time'] }),
  preset('ddad', "DDAD (dead man's)", S.ddad, { aliases: ["dee-dad", "Bonaparte's Retreat", 'dead man'], tags: ['old-time'] }),
  preset('gdad', 'GDAD (gee-dad)', S.gdad, { aliases: ['gee-dad', 'Flatwoods'], tags: ['old-time'] }),
  preset('aead', 'AEAD (old sledge)', S.aead, { aliases: ['Old Sledge', 'Silver Lake'], tags: ['old-time'] }),
  preset('gdgb', 'GDGB (G-calico)', S.gdgb, { aliases: ['G-calico'], tags: ['old-time'] }),
  preset('gdacSharp', 'GDAC#', S.gdacSharp, { tags: ['old-time'] }),
  preset('fcgd', 'FCGD (Cajun)', S.fcgd, { aliases: ['Cajun'], tags: ['cajun'] }),
  preset('cgda', 'CGDA (octave mandolin)', S.cgda, { aliases: ['mandola', 'mandocello'] }),
  preset('edae', 'EDAE', S.edae, { aliases: ['Glory in the Meeting House'], tags: ['old-time'] }),
  preset('eeae', 'EEAE', S.eeae, { aliases: ['Get Up in the Cool'], tags: ['old-time'] }),
  preset('gcge', 'GCGE', S.gcge, { aliases: ['Over the Flatlands'], tags: ['old-time'] }),
  preset('adfSharpE', 'ADF#E (Huldre)', S.adfSharpE, { aliases: ['Huldre'], tags: ['norwegian'] }),
  preset('ddae', 'DDAE (loose bass)', S.ddae, { aliases: ['lausbass'], tags: ['norwegian'] }),
  preset('gdadLow', 'GDAD (low)', S.gdadLow, { tags: ['irish'] })
]

export const INSTRUMENT_TUNING_PRESETS = {
  guitar: [
    preset('standard', 'Standard (EADGBE)', S.guitarStandard),
    preset('dropD', 'Drop D (DADGBE)', S.dropD),
    preset('openG', 'Open G (DGDGBD)', S.openG, { aliases: ['DGDGBD'] }),
    preset('openD', 'Open D (DADF#AD)', S.openD, { aliases: ['DADF#AD'] }),
    preset('dadgad', 'DADGAD', S.dadgad, { aliases: ['Celtic tuning', 'modal'] }),
    preset('openC', 'Open C (CGCGCE)', S.openC),
    preset('openE', 'Open E (EBEG#BE)', S.openE),
    preset('doubleDropD', 'Double drop D (DADGBD)', S.doubleDropD),
    preset('dropC', 'Drop C (CADGBE)', S.dropC),
    preset('openDm', 'Open Dm (DADFAD)', S.openDm),
    preset('cgdgad', 'CGDGAD', S.cgdgad),
    preset('openA', 'Open A (EAC#EAE)', S.openA)
  ],
  mandolin: FIDDLE_MANDOLIN_TUNING_PRESETS,
  uke: [
    preset('gceaHighG', 'GCEA (high G)', S.gceaHighG, { aliases: ['standard', 'GCEA'] }),
    preset('gceaLowG', 'GCEA (low G)', S.gceaLowG, { aliases: ['low G'] }),
    preset('baritone', 'Baritone (DGBE)', S.baritoneUke, { aliases: ['DGBE'] }),
    preset('dTuning', 'D-tuning (ADF#B)', S.ukeDTuning, { aliases: ['ADF#B'] }),
    preset('slackKey', 'Slack-key (GCEG)', S.slackKeyGCEG, { aliases: ['GCEG'] }),
    preset('bebe', 'BEBE', S.bebe)
  ],
  banjo4: [
    preset('cgda', 'CGDA (standard)', S.banjo4Cgda, { aliases: ['mandola'] }),
    preset('gdae', 'GDAE (Irish tenor)', S.banjo4Gdae),
    preset('chicago', 'Chicago (DGBE)', S.banjo4Chicago, { aliases: ['DGBE'] }),
    preset('plectrum', 'Plectrum (CGBD)', S.banjo4Plectrum, { aliases: ['CGBD'] }),
    preset('adfd', 'ADF#D', S.banjo4Adfd)
  ],
  banjo5: [
    preset('openG', 'Open G (gDGBD)', S.banjo5OpenG, { aliases: ['gDGBD'], chordTuning: ['g', 'D', 'G', 'B', 'D'] }),
    preset('doubleC', 'Double C (gCGCD)', S.banjo5DoubleC, { aliases: ['gCGCD'] }),
    preset('sawmill', 'Sawmill (gDGCD)', S.banjo5Sawmill, { aliases: ['gDGCD', 'modal'] }),
    preset('openC', 'Open C (gCGCE)', S.banjo5OpenC, { aliases: ['gCGCE'] }),
    preset('adgbd', 'aDGBD', S.banjo5ADGBD),
    preset('openGm', 'Open Gm (gDGBbD)', S.banjo5OpenGm, { aliases: ['gDGBbD'] }),
    preset('dropC', 'Drop C (gCGBD)', S.banjo5DropC, { aliases: ['gCGBD'] })
  ],
  bouzouki: [
    preset('gdad', 'GDAD (Irish)', S.gdadBouzouki, { aliases: ['GDAD', 'Irish'], tags: ['irish'] }),
    preset('gdae', 'GDAE (mandolin)', S.gdae, { aliases: ['GDAE'], tags: ['irish'] }),
    preset('cfad', 'CFAD (Greek)', S.bouzoukiCfad, { aliases: ['CFAD', 'Greek'], tags: ['greek'] }),
    preset('adad', 'ADAD (Greek alt)', S.bouzoukiAdad, { aliases: ['ADAD'], tags: ['greek'] }),
    preset('dgbe', 'DGBE (tenor guitar)', S.bouzoukiDgbe, { aliases: ['DGBE', 'tenor guitar'] }),
    preset('gdadLow', 'GDAD (low)', S.gdadLow, { tags: ['irish'] })
  ],
  violin: FIDDLE_MANDOLIN_TUNING_PRESETS,
  viola: [
    preset('cgda', 'CGDA (standard)', S.violaCgda, { aliases: ['standard', 'CGDA'], tags: ['classical'] })
  ],
  cello: [
    preset('cgda', 'CGDA (standard)', S.celloCgda, { aliases: ['standard', 'CGDA'], tags: ['classical'] })
  ],
  bass: [
    preset('eadg', 'EADG (standard)', S.bassEadg, { aliases: ['standard', 'EADG', 'orchestral'], tags: ['classical', 'jazz'] })
  ]
}

export const DEFAULT_TUNING_PRESET_ID = {
  violin: 'gdae',
  viola: 'cgda',
  cello: 'cgda',
  bass: 'eadg',
  guitar: 'standard',
  mandolin: 'gdae',
  uke: 'gceaHighG',
  banjo4: 'cgda',
  banjo5: 'openG',
  bouzouki: 'gdad'
}

export function presetsForInstrument(instrument) {
  return INSTRUMENT_TUNING_PRESETS[instrument] || []
}

export function getPreset(instrument, presetId) {
  const list = presetsForInstrument(instrument)
  return list.find(function(p) { return p.id === presetId }) || null
}

export function defaultPresetForInstrument(instrument) {
  const id = DEFAULT_TUNING_PRESET_ID[instrument]
  return getPreset(instrument, id) || presetsForInstrument(instrument)[0] || null
}

/** All presets flat list for resolver. */
export function allPresetsFlat() {
  const out = []
  TUNER_INSTRUMENTS.forEach(function(instrument) {
    presetsForInstrument(instrument).forEach(function(p) {
      out.push({ instrument, preset: p })
    })
  })
  return out
}

/** Default chord tuning letters per instrument (from default preset). */
export function defaultChordTuningForInstrument(instrument) {
  const p = defaultPresetForInstrument(instrument)
  return p ? p.chordTuning : []
}
