import utilsFunctions from './utilsFunctions'

const utils = utilsFunctions()

function collectVoiceNoteLines(tune) {
  const voicesAndNotes = []
  if (tune && tune.voices) {
    Object.keys(tune.voices).forEach(function(voice) {
      if (Array.isArray(tune.voices[voice].notes)) {
        tune.voices[voice].notes.forEach(function(noteLine) {
          voicesAndNotes.push(noteLine)
        })
      }
    })
  }
  return voicesAndNotes
}

export function getTuneHash(tune) {
  if (tune) {
    const voicesAndNotes = collectVoiceNoteLines(tune)
    const hashString = tune.title + tune.tempo + tune.meter + tune.transpose + tune.key + tune.soundFonts + voicesAndNotes.join('\n')
    return utils.hash(hashString)
  }
  return utils.hash(String(Math.random() * 100000000000000000))
}

export function getTuneImportHash(tune) {
  if (tune) {
    const voicesAndNotes = collectVoiceNoteLines(tune)
    const titlePart = String(tune.title || tune.name || '')
    const wLinesPart = Array.isArray(tune.wLines) ? tune.wLines.join('\n') : ''
    const wordsPart = Array.isArray(tune.words) ? tune.words.join('\n') : ''
    const hashString = [
      titlePart,
      String(tune.tempo != null ? tune.tempo : ''),
      String(tune.meter != null ? tune.meter : ''),
      String(tune.transpose != null ? tune.transpose : ''),
      String(tune.key != null ? tune.key : ''),
      String(tune.soundFonts != null ? tune.soundFonts : ''),
      voicesAndNotes.join('\n'),
      wLinesPart,
      wordsPart,
    ].join('\u0001')
    return utils.hash(hashString)
  }
  return utils.hash(String(Math.random() * 100000000000000000))
}
