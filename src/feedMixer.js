import { getEffectiveTheorySkill, modulesForSkill, moduleToFeedItems, bundleContentQuizzes } from './feedContentLoader'

export { getEffectiveTheorySkill }

/** Target share of quiz cards in the mixed stream. */
export const FEED_QUIZ_WEIGHT = 0.10

function isInstructional(item) {
  if (!item) return false
  return item.type === 'theory_lesson'
    || item.type === 'theory_quiz'
    || item.type === 'singing_tip'
    || item.type === 'warmup_idea'
}

export function isQuizCard(item) {
  if (!item) return false
  return item.type === 'quiz' || item.type === 'theory_quiz'
}

/** Lower number = easier. Prefer card.difficulty, else easiest question, else mid. */
export function quizDifficulty(item) {
  if (!item) return 5
  const top = Number(item.difficulty)
  if (Number.isFinite(top)) return top
  const questions = item.quiz && Array.isArray(item.quiz.questions) ? item.quiz.questions : null
  if (questions && questions.length) {
    var min = Infinity
    questions.forEach(function(q) {
      const d = Number(q && q.difficulty)
      if (Number.isFinite(d) && d < min) min = d
    })
    if (min !== Infinity) return min
  }
  return 5
}

export function sortQuizzesEasyFirst(items) {
  return (items || []).slice().sort(function(a, b) {
    const da = quizDifficulty(a)
    const db = quizDifficulty(b)
    if (da !== db) return da - db
    return (b.createdAt || 0) - (a.createdAt || 0)
  })
}

function pickWeighted(rng, weights) {
  const r = rng()
  var acc = 0
  for (var i = 0; i < weights.length; i++) {
    acc += weights[i].w
    if (r < acc) return weights[i].key
  }
  return weights[weights.length - 1].key
}

function takeFrom(list, used) {
  for (var i = 0; i < list.length; i++) {
    const item = list[i]
    if (!item || !item.id || used[item.id]) continue
    used[item.id] = true
    list.splice(i, 1)
    return item
  }
  return null
}

/**
 * Take the first item whose type differs from lastType so same-type cards
 * get spread through the page instead of clumping.
 */
function takeFromSpread(list, used, lastType) {
  let fallback = -1
  for (var i = 0; i < list.length; i++) {
    const item = list[i]
    if (!item || !item.id || used[item.id]) continue
    if (fallback === -1) fallback = i
    if (String(item.type) !== String(lastType || '')) {
      used[item.id] = true
      list.splice(i, 1)
      return item
    }
  }
  if (fallback === -1) return null
  const pick = list[fallback]
  used[pick.id] = true
  list.splice(fallback, 1)
  return pick
}

/**
 * Build a page of feed cards with mix weights.
 * Injectable rng for tests.
 *
 * Buckets:
 * - pool: wiki / news / dyk
 * - theory: lessons only
 * - singing: tips / warmups
 * - quiz: tune quiz + theory_quiz (sorted easy → hard)
 */
export function buildFeedStream(options) {
  const opts = options || {}
  const pageSize = opts.pageSize > 0 ? opts.pageSize : 10
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random
  const skill = opts.skill != null ? opts.skill : 0
  const instrument = opts.instrument || 'mandolin'
  const quizWeight = opts.quizWeight != null ? opts.quizWeight : FEED_QUIZ_WEIGHT
  const singingWeight = instrument === 'voice' ? 0.12 : 0.08
  const theoryWeight = skill >= 1 ? 0.10 : 0.08
  const poolWeight = Math.max(0.45, 1 - theoryWeight - singingWeight - quizWeight)

  const pool = (opts.poolItems || []).slice()
  const theoryItems = (opts.theoryItems || []).slice()
  const singingItems = (opts.singingItems || []).slice()
  // Easy quizzes first so beginners see gentler cards earlier in the feed.
  const quizItems = sortQuizzesEasyFirst(opts.quizItems || [])
  const stream = []
  const used = {}
  var quizCount = 0
  const quizTarget = Math.max(1, Math.round(pageSize * quizWeight))
  const quizMax = Math.max(quizTarget, Math.ceil(pageSize * quizWeight * 1.5))

  function remaining() {
    return pool.length + theoryItems.length + singingItems.length + quizItems.length
  }

  while (stream.length < pageSize) {
    if (!remaining()) break
    const last = stream[stream.length - 1]
    const lastInst = isInstructional(last)
    const lastQuiz = isQuizCard(last)
    const lastType = last ? last.type : ''
    const canQuiz = !lastQuiz && quizCount < quizMax && quizItems.length > 0
    const needQuiz = canQuiz && quizCount < quizTarget && stream.length >= 2

    var key
    if (needQuiz) {
      key = 'quiz'
    } else {
      const weights = [
        { key: 'pool', w: poolWeight },
        { key: 'theory', w: theoryWeight },
        { key: 'singing', w: singingWeight },
        { key: 'quiz', w: canQuiz ? quizWeight : 0 },
      ].filter(function(w) { return w.w > 0 })
      key = pickWeighted(rng, weights)
    }

    var item = null
    if (key === 'quiz') item = takeFrom(quizItems, used)
    else if (key === 'theory') item = takeFromSpread(theoryItems, used, lastType)
    else if (key === 'singing') item = takeFrom(singingItems, used)
    else item = takeFromSpread(pool, used, lastType)

    if (!item) {
      item = takeFromSpread(pool, used, lastType)
        || takeFromSpread(theoryItems, used, lastType)
        || takeFrom(singingItems, used)
        || (canQuiz ? takeFrom(quizItems, used) : null)
    }
    if (!item) break

    if (lastQuiz && isQuizCard(item)) {
      const nonQuiz = takeFromSpread(pool, used, lastType)
        || takeFromSpread(theoryItems, used, lastType)
        || takeFrom(singingItems, used)
      if (nonQuiz) item = nonQuiz
      else break
    }

    if (lastInst && isInstructional(item) && !isQuizCard(item)) {
      const nonInst = takeFromSpread(pool, used, lastType)
      if (nonInst) item = nonInst
      else if (pool.length > 0) {
        const poolLeft = pool.some(function(p) { return p && !used[p.id] })
        if (poolLeft) break
      }
    }

    if (isQuizCard(item)) quizCount++
    stream.push(item)
  }
  return stream
}

export function instructionalContentItems(bundle, skill, options) {
  const theory = modulesForSkill(bundle && bundle.theory, skill, options)
  const singing = modulesForSkill(bundle && bundle.singing, skill, options)
  const items = []
  theory.forEach(function(m) {
    moduleToFeedItems(m).forEach(function(it) { items.push(it) })
  })
  singing.forEach(function(m) {
    moduleToFeedItems(m).forEach(function(it) { items.push(it) })
  })
  bundleContentQuizzes(theory.concat(singing)).forEach(function(it) { items.push(it) })
  return items
}
