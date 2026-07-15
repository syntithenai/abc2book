export default [
  {
    id: 'singing-warmup-hum-01',
    title: 'Gentle hum wake-up',
    track: 'warmup',
    kind: 'warmup_idea',
    difficulty: 1,
    tags: ['warmup', 'hum', 'gentle'],
    prerequisites: [],
    estimateMinutes: 2,
    body:
      'Notice how a soft closed-mouth hum can warm your voice before a session better than jumping straight into a loud chorus. Start in a comfortable speaking range and slide slowly up and down by a few notes. Keep lips lightly together and jaw loose—think of buzzing into a mug. If anything feels scratchy, stay smaller and quieter.',
    tryThis:
      'Hum up and down five times on “mm,” keeping volume barely above a whisper.',
  },
  {
    id: 'singing-warmup-liptrill-01',
    title: 'Loose lip trill',
    track: 'warmup',
    kind: 'warmup_idea',
    difficulty: 2,
    tags: ['warmup', 'lip-trill', 'breath'],
    prerequisites: ['singing-warmup-hum-01'],
    estimateMinutes: 2,
    body:
      'Notice whether your lips flutter easily on a lip trill or feel stiff after a day of talking. This classic warmup connects breath to sound without much throat effort—ideal before reels or songs with quick turns of phrase. If the trill sputters, lighten the air and try a smaller pitch range instead of pushing harder.',
    tryThis:
      'Glide a lip trill from your lowest comfortable note up through your speaking range and back down.',
  },
  {
    id: 'singing-warmup-ngah-01',
    title: 'Ng–ah tongue release',
    track: 'warmup',
    kind: 'warmup_idea',
    difficulty: 3,
    tags: ['warmup', 'vowels', 'forward-tone'],
    prerequisites: ['singing-warmup-liptrill-01'],
    estimateMinutes: 2,
    body:
      'Notice the tongue tip resting lightly behind your top teeth on “ng,” then opening to “ah” without the jaw dropping wide. This combo helps folk singers find a forward, clear tone before tackling consonant-heavy lyrics. Keep it slow and easy—no pushing for volume. Stop if your throat feels tight or hoarse.',
    tryThis:
      'Sing “ng–ah” on a single pitch five times, then move up by half steps if it feels comfortable.',
  },
  {
    id: 'singing-warmup-pulse-01',
    title: 'Pulse on one vowel',
    track: 'warmup',
    kind: 'warmup_idea',
    difficulty: 4,
    tags: ['warmup', 'support', 'dance-tunes'],
    prerequisites: ['singing-warmup-ngah-01'],
    estimateMinutes: 2,
    body:
      'Notice how repeating a vowel in short, gentle pulses trains breath support for dance tunes and steady choruses. Pick one pitch and sing “oo” or “ee” in four quick-soft pulses, then one longer note. You should feel the belly engage slightly on each pulse—not a hard squeeze, just steady. Ease off if you feel any strain.',
    tryThis:
      'Practice four gentle “oo” pulses followed by a held “oo” on one comfortable pitch.',
  },
  {
    id: 'singing-warmup-octave-01',
    title: 'Easy octave glide',
    track: 'warmup',
    kind: 'warmup_idea',
    difficulty: 5,
    tags: ['warmup', 'range', 'glide'],
    prerequisites: ['singing-warmup-pulse-01'],
    estimateMinutes: 2,
    body:
      'Notice whether your voice moves smoothly across an octave on “oo” or “ng,” or catches in the middle—often where chest and head mix. Folk melodies span wider than you think; a slow octave glide maps that path before you open a tune. Stop if anything feels strained; smaller intervals work just as well for warming up.',
    tryThis:
      'Glide from a low “oo” up one octave and back down on one breath, as lightly as you can.',
  },
]
