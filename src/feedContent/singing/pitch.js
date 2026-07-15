export default [
  {
    id: 'singing-pitch-drone-01',
    title: 'Drone as your anchor',
    track: 'pitch',
    kind: 'singing_tip',
    difficulty: 2,
    tags: ['pitch', 'drone', 'modal'],
    prerequisites: [],
    estimateMinutes: 2,
    body:
      'Notice how a sustained drone—or a friend humming the tonic—gives your ear a home base in modal or session tunes. Match your starting note to that drone before you sing the melody; small slips are easier to catch early. This is especially helpful in keys with fewer obvious “leading” pulls. You are not chasing perfection—just noticing when you drift.',
    tryThis:
      'Listen to a low drone (or hum one yourself), then sing the first line of a tune against it.',
  },
  {
    id: 'singing-pitch-final-01',
    title: 'Land the last note',
    track: 'pitch',
    kind: 'singing_tip',
    difficulty: 3,
    tags: ['pitch', 'phrasing', 'intervals'],
    prerequisites: ['singing-pitch-drone-01'],
    estimateMinutes: 2,
    body:
      'Notice where each phrase ends in a tune you know—often on the tonic or dominant. Folk melodies can wander; the final note of a line tells the room you are secure. Mark those landing notes and check they settle, not slide past. Singing only the endings is a quick way to build confidence before a full chorus.',
    tryThis:
      'Sing only the final note of each phrase in a chorus, holding it steady for two beats.',
  },
  {
    id: 'singing-pitch-chordtones-01',
    title: 'Outline the harmony',
    track: 'pitch',
    kind: 'singing_tip',
    difficulty: 5,
    tags: ['pitch', 'harmony', 'ear-training'],
    prerequisites: ['singing-pitch-final-01'],
    estimateMinutes: 2,
    body:
      'Notice the third and fifth of the home chord under your melody—they hint at major vs minor and whether a line feels bright or melancholic. You do not need perfect theory; humming root–third–fifth before a tune wakes your ear to the shape of the song. Common in sessions when everyone finds the same key by ear and locks in together.',
    tryThis:
      'Hum the root, third, and fifth of the key, then sing the first phrase of your tune.',
  },
]
