import foundations from './theory/foundations.js'
import italian from './theory/italian.js'
import chords from './theory/chords.js'
import transposition from './theory/transposition.js'
import harmony from './theory/harmony.js'
import history from './theory/history.js'
import styles from './theory/styles.js'
import celticRegions from './regions/index.js'
import singingAll from './singing/index.js'

export const theoryModules = []
  .concat(foundations)
  .concat(italian)
  .concat(chords)
  .concat(transposition)
  .concat(harmony)
  .concat(history)
  .concat(styles)
  .concat(celticRegions)

export const singingModules = Array.isArray(singingAll) ? singingAll : []

export default {
  theory: theoryModules,
  singing: singingModules,
  theoryModules: theoryModules,
  singingModules: singingModules,
}
