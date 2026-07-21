/**
 * Illustrations for theory lessons.
 * - kind: 'image' for musician/history portraits (preferred over ABC there)
 * - kind: 'notation' for concepts shown with abcjs (notes, not chord symbols alone)
 */

const WIKI = 'https://upload.wikimedia.org/wikipedia/commons'

function notation(caption, abc, metadata) {
  return {
    kind: 'notation',
    caption: caption,
    abc: abc,
    full: true,
    metadata: Object.assign({ meter: '4/4', noteLength: '1/8', key: 'C' }, metadata || {}),
  }
}

function portrait(caption, imageUrl) {
  return {
    kind: 'image',
    caption: caption,
    imageUrl: imageUrl,
    abc: '',
  }
}

export const THEORY_LESSON_EXAMPLES = {
  // ── foundations ─────────────────────────────────────────────
  'foundations-pitch-01': notation(
    'Treble staff: C major scale ascending and descending (line and space pattern)',
    [
      'V:1 clef=treble',
      'CDEF GABc | cBAG FEDC |',
      'V:2',
      'C,2 E,2 G,2 C,2 | C,2 G,2 E,2 C,2 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'foundations-rhythm-01': notation(
    'Whole (2), half (2), quarter, and eighth notes in 4/4',
    [
      'C4 | C2 C2 | C4 C4 C4 C4 | C2 C/2 C/2 C/2 C/2 |',
      'D4 | D2 D2 | D4 D4 D4 D4 | D2 D/2 D/2 D/2 D/2 |',
    ].join('\n'),
    { key: 'C', meter: '4/4', noteLength: '1/8' }
  ),
  'foundations-accidentals-01': notation(
    'Sharp (♯), flat (♭), and natural (♮) altering pitch by a semitone',
    [
      'C ^F ^F =F | C _B _B =B |',
      'C ^c _B A | G ^G =G F |',
    ].join('\n'),
    { key: 'C' }
  ),
  'scales-major-01': notation(
    'C major scale with leading tone B resolving up to tonic C',
    [
      'CDEF GABc | B2 c2 z2 |',
      'C,2 D,2 E,2 F,2 | G,2 A,2 B,2 c2 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'scales-minor-01': notation(
    'A natural minor (no raised 7th) then harmonic minor (raised G♯ leading tone)',
    [
      'ABcd efga |',
      'ABcd efga | g2 ^g a2 |',
      'A,2 C,2 E,2 A,2 | A,2 C,2 E,2 ^G,2 |',
    ].join('\n'),
    { key: 'Am' }
  ),
  'intervals-01': notation(
    'Melodic thirds and fifths: C–E–G outlines a major triad',
    [
      'C2 E2 G2 c2 | E2 G2 c2 e2 | G2 c2 e2 g2 |',
      'C,4 E,4 G,4 c4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'keys-circle-01': notation(
    'D major scale showing F♯ and C♯ from the key signature',
    [
      'DEF^G AB^cd | e^f ^g a b ^c\' |',
      'D,2 F,^G,2 A,2 | B,^C,2 D,2 E,2 |',
    ].join('\n'),
    { key: 'D' }
  ),

  // ── italian markings ────────────────────────────────────────
  'italian-tempo-01': notation(
    'Andante (walking) vs Allegro (lively) — compare note density at different tempos',
    [
      '%%score { (1 2) }',
      'V:1',
      'Q:1/4=72',
      '"Andante" C4 D4 E4 F4 | G4 A4 B4 c4 |',
      'V:2',
      'Q:1/4=144',
      '"Allegro" C/2D/2E/2F/2 G/2A/2B/2c/2 | d/2e/2f/2g/2 a/2b/2c\'/2d/2 |',
    ].join('\n'),
    { key: 'C', meter: '4/4', noteLength: '1/8' }
  ),
  'italian-dynamics-01': notation(
    'Dynamic markings from soft to loud: ppp · pp · p · mp · mf · f · ff · fff',
    [
      '!ppp!C2 !pp!D2 !p!E2 !mp!F2 | !mf!G2 !f!A2 !ff!B2 !fff!c4 |',
      'C,8 D,8 E,8 F,8 G,8 A,8 B,8 c8 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'italian-articulation-01': notation(
    'Staccato dots (detached) vs slurs (legato, smooth)',
    [
      '.C .D .E .F | .G .A .B .c |',
      'C-D-E-F | G-A-B-c |',
    ].join('\n'),
    { key: 'C' }
  ),
  'italian-form-01': notation(
    'Repeat signs (|: :|) and first/second endings [1 … [2 …',
    [
      '|: CDEF GABc :|',
      '[1 cBAG FEDC :|',
      '[2 GABc c4 |]',
    ].join('\n'),
    { key: 'C' }
  ),

  // ── chords (melody + bass notes, no chord symbols) ──────────
  'chords-triads-01': notation(
    'Major triad C–E–G vs minor triad A–C–E spelled as arpeggios',
    [
      'V:1',
      'C2 E2 G2 c2 | A2 c2 E2 a2 |',
      'V:2',
      'C,4 | A,,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'chords-inversions-01': notation(
    'C major root position (C bass) vs first inversion (E in the bass)',
    [
      'V:1',
      'C2 E2 G2 c2 | E2 G2 c2 e2 |',
      'V:2',
      'C,4 | E,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'chords-sevenths-01': notation(
    'Major 7th (C–E–G–B), minor 7th (D–F–A–C), dominant 7th (G–B–D–F)',
    [
      'V:1',
      'C2 E2 G2 B2 | D2 F2 A2 c2 | G2 B2 d2 f2 |',
      'V:2',
      'C,2 E,2 G,2 B,2 | D,2 F,2 A,2 c2 | G,2 B,2 D,2 F,2 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'chords-diatonic-major-01': notation(
    'Diatonic roots in C major: I (C) – IV (F) – V (G) – I (C)',
    [
      'V:1',
      'E2 G2 c2 e2 | F2 A2 c2 f2 | G2 B2 d2 g2 | c2 e2 g2 c\'2 |',
      'V:2',
      'C,4 | F,,4 | G,,4 | C,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'chords-diatonic-minor-01': notation(
    'Diatonic roots in A minor: i (Am) – iv (Dm) – V (E) – i (Am)',
    [
      'V:1',
      'c2 e2 a2 c\'2 | d2 f2 a2 d\'2 | ^g2 b2 e\'2 ^g\'2 | a2 c\'2 e\'2 a\'2 |',
      'V:2',
      'A,,4 | D,,4 | E,,4 | A,,4 |',
    ].join('\n'),
    { key: 'Am' }
  ),
  'chords-extensions-01': notation(
    'Adding the 9th above the triad: C–E–G–B–D',
    [
      'V:1',
      'C2 E2 G2 B2 d2 | D2 F2 A2 c2 e2 |',
      'V:2',
      'C,2 E,2 G,2 B,2 D,2 | D,2 F,2 A,2 c2 e2 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'chords-jazz-color-01': notation(
    'Jazz colour: maj7 → m7 → dominant 7 → maj7 as note stacks',
    [
      'V:1',
      'C2 E2 G2 B2 | D2 F2 A2 c2 | G2 B2 d2 f2 | C2 E2 G2 B2 |',
      'V:2',
      'C,2 E,2 G,2 B,2 | D,2 F,2 A,2 c2 | G,2 B,2 D,2 F,2 | C,2 E,2 G,2 B,2 |',
    ].join('\n'),
    { key: 'C' }
  ),

  // ── transposition ───────────────────────────────────────────
  'transpose-why-01': notation(
    'Same tune shape in C major, then transposed up a step to D major',
    [
      'CDEF GABc | cBAG FEDC |',
      'DEF^G AB^cd | d^cBA ^GFED |',
    ].join('\n'),
    { key: 'C' }
  ),
  'transpose-melody-01': notation(
    'Melody transposed from C to G (up a fifth): F♯ appears in G major',
    [
      'V:1',
      'CDEF GABc |',
      'GABc defg |',
      'V:2',
      'C,4 G,,4 | G,,4 D,,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'transpose-chords-01': notation(
    'I–IV–V–I bass roots in C, then the same pattern in G',
    [
      'V:1',
      'E2 G2 c2 e2 | F2 A2 c2 f2 | G2 B2 d2 g2 | c2 e2 g2 c\'2 |',
      'B,2 ^d2 g2 b2 | C2 E2 G2 c2 | D2 ^F2 A2 d2 | g2 b2 d\'2 g\'2 |',
      'V:2',
      'C,4 F,,4 G,,4 C,4 | G,,4 C,4 D,,4 G,,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'transpose-capo-01': notation(
    'G-major finger shapes; with capo on fret 2 they sound in A',
    [
      'V:1',
      'G2 B2 d2 g2 | C2 E2 G2 c2 | D2 ^F2 A2 d2 | G2 B2 d2 g2 |',
      'V:2',
      'G,,4 C,4 D,4 G,,4 |',
    ].join('\n'),
    { key: 'G' }
  ),
  'transpose-modes-01': notation(
    'C Ionian (major) vs D Dorian: compare the 6th degree (B vs B♭)',
    [
      'CDEF GABc |',
      'DEFG ABcd |',
      'V:2',
      'C,4 G,,4 | D,4 A,,4 |',
    ].join('\n'),
    { key: 'C' }
  ),

  // ── harmony ─────────────────────────────────────────────────
  'harmony-tendency-01': notation(
    'Leading tone B resolves up to C; tritone F–B in G7 relaxes to E–C',
    [
      'V:1',
      'B2 c2 | G2 B2 d2 f2 | c2 e2 g2 c\'2 |',
      'V:2',
      'G,2 G,2 | G,2 B,2 D,2 F,2 | C,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'harmony-voiceleading-01': notation(
    'Smooth bass movement by step: C – A – F – G',
    [
      'V:1',
      'E2 G2 c2 e2 | c2 e2 a2 c\'2 | F2 A2 c2 f2 | G2 B2 d2 g2 |',
      'V:2',
      'C,4 | A,,4 | F,,4 | G,,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'harmony-cadences-01': notation(
    'Authentic (V–I) cadence: dominant G harmony resolving to tonic C',
    [
      'V:1',
      'G2 B2 d2 g2 | c2 e2 g2 c\'4 |',
      'V:2',
      'G,4 | C,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'harmony-phrases-01': notation(
    'Antecedent phrase ends on G (dominant); consequent ends on C (tonic)',
    [
      'V:1',
      'CDEF GABc | GABc d2 B2 | c2 e2 g2 c\'4 |',
      'V:2',
      'C,2 E,2 G,2 C,2 | G,2 B,2 D,2 G,2 | C,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'harmony-secondary-01': notation(
    'Secondary dominant: D7 (V/V) pulls to G, then cadence to C',
    [
      'V:1',
      '^F2 A2 d2 f2 | G2 B2 d2 g2 | c2 e2 g2 c\'4 |',
      'V:2',
      'D,4 | G,4 | C,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'harmony-modulation-01': notation(
    'Pivot from C major to G major via shared G harmony',
    [
      'V:1',
      'c2 e2 g2 c\'2 | G2 B2 d2 g2 | d2 ^f2 a2 d\'2 | g2 b2 d\'2 g\'4 |',
      'V:2',
      'C,4 | G,4 | D,4 | G,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'harmony-counterpoint-01': notation(
    'Two voices in contrary motion: as the top rises, the bass falls',
    [
      'V:1',
      'CDEF GABc |',
      'V:2',
      'C,2 B,,2 A,,2 G,,2 | F,,2 E,2 D,2 C,2 |',
    ].join('\n'),
    { key: 'C' }
  ),

  // ── styles (notation concepts, not portraits) ───────────────
  'styles-baroque-01': notation(
    'Baroque sequential melody with clear half-cadence and authentic cadence',
    [
      'V:1',
      'CDEF GABc | dcBA GFED | CDEF GABc | cBAG FEDC |',
      'V:2',
      'C,4 G,4 | C,4 G,4 | C,4 G,4 | C,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'styles-classical-01': notation(
    'Classical four-bar phrase: question (bar 4 on G) and answer (bar 8 on C)',
    [
      'V:1',
      'CDEF GABc | dcBA GFED | CDEF GABc | G4 z4 |',
      'cBAG FEDC | CDEF GABc | cBAG FEDC | C4 z4 |',
      'V:2',
      'C,4 G,4 C,4 G,4 | C,4 G,4 C,4 G,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'styles-romantic-01': notation(
    'Romantic wide leap and sighing descent (rubato-friendly line)',
    [
      'C2 E2 G2 c2 | B4 A4 G4 F4 | E4 D4 C4 |',
      'C,2 E,2 G,2 C,2 | B,,2 A,,2 G,,2 F,,2 | E,,4 C,,4 |',
    ].join('\n'),
    { key: 'C', meter: '3/4', noteLength: '1/8' }
  ),
  'styles-folk-dances-01': notation(
    'Jig in 6/8: two beats per bar, each divided into three eighth notes',
    [
      'DED FGF | ABA GFG |',
      'd2 B2 G2 | d2 B2 G2 |',
      'D,3 F,3 | G,3 B,3 |',
    ].join('\n'),
    { key: 'D', meter: '6/8', noteLength: '1/8' }
  ),
  'styles-blues-01': notation(
    'Blues shuffle: long–short rhythm on the melody with I–IV–V bass motion',
    [
      'V:1',
      'C3/2 C/4 C/4 D3/2 D/4 D/4 | E3/2 E/4 E/4 G3/2 G/4 G/4 |',
      'V:2',
      'C,4 | F,,4 | C,4 | G,,4 |',
    ].join('\n'),
    { key: 'C', meter: '4/4', noteLength: '1/8' }
  ),
  'styles-jazz-01': notation(
    'Jazz ii–V–I: Dm7 → G7 → Cmaj7 spelled as melodic arpeggios',
    [
      'V:1',
      'D2 F2 A2 c2 | G2 B2 d2 f2 | C2 E2 G2 B2 |',
      'V:2',
      'D,2 F,2 A,2 c2 | G,2 B,2 D,2 F,2 | C,2 E,2 G,2 B,2 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'styles-pop-01': notation(
    'Pop I–V–vi–IV: melody and bass for C – G – Am – F',
    [
      'V:1',
      'E2 G2 c2 e2 | G2 B2 d2 g2 | A2 c2 e2 a2 | F2 A2 c2 f2 |',
      'V:2',
      'C,4 | G,,4 | A,,4 | F,,4 |',
    ].join('\n'),
    { key: 'C' }
  ),
  'styles-modes-01': notation(
    'D Dorian (raised 6th ^C) vs D natural minor (C natural)',
    [
      'DEFG ABcd |',
      'DEFG AB_c d |',
      'D,4 A,,4 | D,4 A,,4 |',
    ].join('\n'),
    { key: 'D' }
  ),
  'styles-modern-01': notation(
    'Chromatic passing tones (^C between C and D, _E between E and F)',
    [
      'C ^C D _E F ^F G |',
      'C,2 ^C,2 D,2 _E,2 F,2 ^F,2 G,2 |',
    ].join('\n'),
    { key: 'C' }
  ),

  // ── history & musicians (portraits, not ABC) ─────────────────
  'history-bach-01': portrait(
    'Johann Sebastian Bach (1685–1750), master of counterpoint and keyboard fugues',
    WIKI + '/6/6a/Johann_Sebastian_Bach.jpg'
  ),
  'history-mozart-01': portrait(
    'Wolfgang Amadeus Mozart (1756–1791), Classical-era clarity and melody',
    WIKI + '/1/1e/Wolfgang-amadeus-mozart_1.jpg'
  ),
  'history-beethoven-01': portrait(
    'Ludwig van Beethoven (1770–1827), expanded form and motivic drama',
    WIKI + '/6/6f/Beethoven.jpg'
  ),
  'history-chopin-01': portrait(
    'Frédéric Chopin (1810–1849), Romantic piano colour and rubato',
    WIKI + '/e/e8/Frederic_Chopin_photo.jpeg'
  ),
  'history-debussy-01': portrait(
    'Claude Debussy (1862–1918), colour, modes, and new sonorities',
    WIKI + '/5/5f/Claude_Debussy_ca_1908%2C_foto_av_F%C3%A9lix_Nadar.jpg'
  ),
  'history-armstrong-01': portrait(
    'Louis Armstrong (1901–1971), swing phrasing and jazz trumpet',
    WIKI + '/1/16/Louis_Armstrong_near_scratch.jpg'
  ),
  'history-ellington-01': portrait(
    'Duke Ellington (1899–1974), big-band composition and colour',
    WIKI + '/7/7f/Duke_Ellington_at_the_White_House.jpg'
  ),
  'history-parker-01': portrait(
    'Charlie Parker (1920–1955), bebop improvisation and harmony',
    WIKI + '/8/8f/Charlie_Parker_in_1947.jpg'
  ),
  'history-trad-collectors-01': portrait(
    'Captain Francis O\'Neill (1848–1936), collector of Irish traditional music',
    WIKI + '/2/2e/Captain_Francis_O%27Neill.jpg'
  ),
  'history-women-01': portrait(
    'Jean Ritchie (1922–2015), singer and scholar of Appalachian ballads',
    WIKI + '/8/82/Jean_Ritchie_2007.jpg'
  ),
}

export default THEORY_LESSON_EXAMPLES
