import abcjs from 'abcjs'

/** Minimal 4/4 tune with L:1/8 — abcjs eighth-note beats, quarter-note rhythm grid. */
export const ABC_44_L18 = [
  'X:1',
  'T:Rhythm timing test',
  'M:4/4',
  'L:1/8',
  'K:C',
  'CDEF GABc |',
].join('\n')

export function visualFromAbc(abc) {
  return abcjs.renderAbc('*', abc, {})[0]
}

export function visual44L18() {
  return visualFromAbc(ABC_44_L18)
}
