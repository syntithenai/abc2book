import { planInjectWave, streamSeenMaps } from './feedInjectUtils'
import { wikiMediaToImageUrls } from './feedEnrichmentClient'
import { buildQuizBundle, shuffleChoices, correctChoiceIndex } from './feedQuizUtils'
import { factHash } from './feedFactExtractors'
import { generateLocalFeedItems } from './feedLocalGenerator'
import { bundleContentQuizzes, moduleToFeedItems } from './feedContentLoader'
import { isUsefulSongNote } from './feedMusixmatchClient'
import { buildFeedStream } from './feedMixer'

describe('feedInjectUtils', function() {
  function item(id, hash) {
    return { id: id, factHash: hash || id, isNew: true, headline: id }
  }

  it('prepends near top up to injectCap', function() {
    const plan = planInjectWave({
      newItems: [item('a'), item('b'), item('c'), item('d')],
      nearTop: true,
      injectCap: 3,
      streamIds: {},
      streamHashes: {},
    })
    expect(plan.prepend.map(function(i) { return i.id })).toEqual(['a', 'b', 'c'])
    expect(plan.pending).toEqual([])
  })

  it('queues pending when not near top', function() {
    const plan = planInjectWave({
      newItems: [item('a'), item('b')],
      nearTop: false,
      streamIds: { x: true },
      streamHashes: {},
    })
    expect(plan.prepend).toEqual([])
    expect(plan.pending.map(function(i) { return i.id })).toEqual(['a', 'b'])
  })

  it('dedupes by factHash against stream and pending', function() {
    const plan = planInjectWave({
      newItems: [item('a', 'h1'), item('b', 'h2'), item('c', 'h1')],
      nearTop: false,
      streamIds: {},
      streamHashes: { h2: true },
      pendingIds: {},
      pendingHashes: {},
    })
    expect(plan.pending.map(function(i) { return i.id })).toEqual(['a'])
  })

  it('streamSeenMaps indexes ids and hashes', function() {
    const maps = streamSeenMaps([{ id: '1', factHash: 'h' }, { id: '2' }])
    expect(maps.ids['1']).toBe(true)
    expect(maps.hashes.h).toBe(true)
  })
})

describe('feedQuizUtils', function() {
  it('shuffleChoices does not always leave correct first', function() {
    const base = [
      { text: 'right', correct: true },
      { text: 'w1' },
      { text: 'w2' },
      { text: 'w3' },
    ]
    var firstCorrect = 0
    for (var seed = 0; seed < 40; seed++) {
      var s = seed + 1
      const rng = function() {
        s = (s * 1664525 + 1013904223) >>> 0
        return s / 0x100000000
      }
      const out = shuffleChoices(base, rng)
      if (correctChoiceIndex({ choices: out }) === 0) firstCorrect++
    }
    expect(firstCorrect).toBeLessThan(40)
    expect(firstCorrect).toBeGreaterThan(0)
  })

  it('buildQuizBundle upgrades legacy single prompt to questions[]', function() {
    const quiz = buildQuizBundle({
      id: 'q1',
      prompt: '2+2?',
      choices: [
        { id: 'a', text: '4', correct: true },
        { id: 'b', text: '3' },
      ],
      explain: 'math',
    }, { shuffle: false })
    expect(quiz.questions.length).toBe(1)
    expect(quiz.questions[0].prompt).toBe('2+2?')
  })

  it('buildQuizBundle caps at 5 questions', function() {
    const questions = []
    for (var i = 0; i < 7; i++) {
      questions.push({
        id: 'q' + i,
        prompt: 'Q' + i,
        choices: [
          { text: 'yes', correct: true },
          { text: 'no' },
        ],
      })
    }
    const quiz = buildQuizBundle({ id: 'bundle', questions: questions }, { shuffle: false })
    expect(quiz.questions.length).toBe(5)
  })
})

describe('feedLocalGenerator UX', function() {
  const tunes = {
    t1: {
      id: 't1',
      name: 'Wild Rover',
      composer: 'The Dubliners',
      artists: ['The Dubliners'],
      aliases: ['The Wild Rover'],
      backgroundInfo: [
        '## Origin and first recording',
        'The song was popularized in 1963 by The Dubliners on an early album release.',
        '## Historical anecdotes',
        'Radio stations once hesitated to play the chorus because of its rowdy reputation.',
        'Extra paragraph that should appear when the card is expanded fully.',
      ].join('\n'),
    },
    t2: {
      id: 't2',
      name: 'Foggy Dew',
      composer: 'Various',
      artists: ['The Chieftains'],
      aliases: [],
      backgroundInfo: '',
    },
    t3: {
      id: 't3',
      name: 'Other Tune',
      composer: 'Artist Three',
      artists: [],
      aliases: [],
      backgroundInfo: '',
    },
    t4: {
      id: 't4',
      name: 'Fourth',
      composer: 'Artist Four',
      artists: [],
      aliases: [],
      backgroundInfo: '',
    },
  }

  it('news and dyk expand to full backgroundInfo', function() {
    const items = generateLocalFeedItems({ tunes: tunes, viewIds: ['t1'] })
    const news = items.find(function(i) { return i.type === 'news' })
    const dyk = items.find(function(i) { return i.type === 'dyk' })
    expect(news.body).toContain('Extra paragraph that should appear')
    expect(dyk.body).toContain('Extra paragraph that should appear')
    expect(news.teaser.length).toBeLessThan(news.body.length)
  })

  it('quiz card uses questions bundle and distinct factHash from dyk', function() {
    const items = generateLocalFeedItems({
      tunes: tunes,
      viewIds: ['t1', 't2', 't3', 't4'],
      rng: function() { return 0.7 },
    })
    const quiz = items.find(function(i) { return i.type === 'quiz' })
    const dyk = items.find(function(i) { return i.type === 'dyk' })
    expect(quiz).toBeTruthy()
    expect(quiz.quiz.questions.length).toBeGreaterThanOrEqual(1)
    expect(quiz.quiz.questions.length).toBeLessThanOrEqual(5)
    expect(quiz.factHash).not.toBe(dyk.factHash)
  })

  it('wikiMediaToImageUrls keeps photos, skips icons and non-images', function() {
    const media = {
      items: [
        { type: 'image', srcset: [{ src: '//upload.wikimedia.org/a/Cover.jpg' }] },
        { type: 'image', srcset: [{ src: '//upload.wikimedia.org/b/Commons-logo.svg' }] },
        { type: 'video', srcset: [{ src: '//upload.wikimedia.org/c/Clip.webm' }] },
        { type: 'image', srcset: [{ src: '//upload.wikimedia.org/a/Cover.jpg' }] },
        { type: 'image', srcset: [{ src: 'https://upload.wikimedia.org/d/Band.png' }] },
      ],
    }
    const urls = wikiMediaToImageUrls(media)
    expect(urls).toEqual([
      'https://upload.wikimedia.org/a/Cover.jpg',
      'https://upload.wikimedia.org/d/Band.png',
    ])
  })

  it('wikiMediaToImageUrls caps the number of images', function() {
    const items = []
    for (var i = 0; i < 20; i++) {
      items.push({ type: 'image', srcset: [{ src: '//upload.wikimedia.org/img' + i + '.jpg' }] })
    }
    expect(wikiMediaToImageUrls({ items: items }).length).toBe(12)
    expect(wikiMediaToImageUrls({ items: items }, 4).length).toBe(4)
  })

  it('wiki-style and news hashes do not use source suffixes', function() {
    const h1 = factHash({ predicate: 'wiki_article', subjectName: 'A', objectText: 'A', tuneId: '1' })
    const h2 = factHash({ predicate: 'news_story', subjectName: 'A', objectText: 'snip', tuneId: '1' })
    expect(h1.indexOf('_wiki')).toBe(-1)
    expect(h2.indexOf('_news')).toBe(-1)
    expect(h1).not.toBe(h2)
  })

  it('pools scarce questions across tunes into a combined quiz card', function() {
    function bgTune(id, name, year) {
      return {
        id: id,
        name: name,
        composer: '',
        artists: [],
        aliases: [],
        backgroundInfo: '## Origin\nThe tune was first written down in ' + year + ' according to collectors of the era.',
      }
    }
    const scarce = {
      a: bgTune('a', 'Tune Alpha', 1901),
      b: bgTune('b', 'Tune Beta', 1912),
      c: bgTune('c', 'Tune Gamma', 1923),
    }
    const items = generateLocalFeedItems({ tunes: scarce, viewIds: ['a', 'b', 'c'], rng: function() { return 0.4 } })
    const combined = items.filter(function(i) { return i.type === 'quiz' })
    expect(combined.length).toBe(1)
    expect(combined[0].headline).toBe('Quick quiz: your recent tunes')
    expect(combined[0].quiz.questions.length).toBe(3)
    expect(combined[0].tuneId).toBe(null)
  })
})

describe('content quiz bundling and card context', function() {
  function mod(id, track, quizCount, kind) {
    const quizzes = []
    for (var i = 0; i < quizCount; i++) {
      quizzes.push({
        id: id + '-q' + i,
        prompt: 'Prompt ' + id + ' ' + i,
        difficulty: 1,
        choices: [
          { id: 'a', text: 'Right', correct: true },
          { id: 'b', text: 'Wrong' },
        ],
        explain: 'Because.',
      })
    }
    return { id: id, title: 'Module ' + id, track: track, kind: kind || 'theory_lesson', difficulty: 1, body: 'Body text.', quizzes: quizzes }
  }

  it('bundles quizzes across modules of a track into 5-question cards', function() {
    const items = bundleContentQuizzes([mod('m1', 'foundations', 2), mod('m2', 'foundations', 2), mod('m3', 'foundations', 2)])
    expect(items.length).toBe(1)
    expect(items[0].quiz.questions.length).toBe(5)
    expect(items[0].type).toBe('theory_quiz')
  })

  it('drops thin tail chunks under 3 questions', function() {
    const items = bundleContentQuizzes([mod('m1', 'scales', 2)])
    expect(items.length).toBe(0)
  })

  it('content cards carry no tune or practice context', function() {
    const items = moduleToFeedItems(mod('m9', 'foundations', 0))
    expect(items.length).toBe(1)
    expect(items[0].tuneId).toBe(null)
    expect(items[0].teaser.indexOf('Try this with')).toBe(-1)
  })
})

describe('song note filtering', function() {
  it('rejects lyrics-site boilerplate and short blurbs', function() {
    expect(isUsefulSongNote('Lyrics for Wild Rover by The Dubliners. Sing along now and enjoy this classic tune forever.')).toBe(false)
    expect(isUsefulSongNote('Watch the video for this great song right here today and listen to the song again. More content available.')).toBe(false)
    expect(isUsefulSongNote('Too short.')).toBe(false)
  })

  it('accepts real background prose', function() {
    expect(isUsefulSongNote(
      'The Wild Rover is a traditional folk song of disputed origin. It was popularized in the 1960s folk revival. Many bands have recorded distinct arrangements since.'
    )).toBe(true)
  })
})

describe('mixer type spreading', function() {
  it('does not clump same-type pool cards together', function() {
    const pool = []
    for (var i = 0; i < 5; i++) pool.push({ id: 'q' + i, type: 'quiz', status: 'queued', createdAt: 1, factHash: 'q' + i })
    for (var j = 0; j < 5; j++) pool.push({ id: 'd' + j, type: 'dyk', status: 'queued', createdAt: 1, factHash: 'd' + j })
    const stream = buildFeedStream({
      poolItems: pool,
      theoryItems: [],
      singingItems: [],
      skill: 0,
      instrument: 'mandolin',
      pageSize: 10,
      rng: function() { return 0 },
    })
    expect(stream.length).toBe(10)
    for (var k = 1; k < stream.length; k++) {
      expect(stream[k].type).not.toBe(stream[k - 1].type)
    }
  })
})
