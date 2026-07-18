import { getEffectiveTheorySkill, modulesForSkill, moduleToFeedItems, bundleContentQuizzes } from './feedContentLoader'

export { getEffectiveTheorySkill }

function isInstructional(item) {
  if (!item) return false
  return item.type === 'theory_lesson'
    || item.type === 'theory_quiz'
    || item.type === 'singing_tip'
    || item.type === 'warmup_idea'
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
 * (e.g. a run of quizzes) get spread through the page instead of clumping.
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
 */
export function buildFeedStream(options) {
  const opts = options || {}
  const pageSize = opts.pageSize > 0 ? opts.pageSize : 10
  const rng = typeof opts.rng === 'function' ? opts.rng : Math.random
  const skill = opts.skill != null ? opts.skill : 0
  const instrument = opts.instrument || 'mandolin'
  const singingWeight = instrument === 'voice' ? 0.15 : 0.10
  const theoryWeight = skill >= 1 ? 0.08 : 0.05

  const pool = (opts.poolItems || []).slice()
  const theoryItems = (opts.theoryItems || []).slice()
  const singingItems = (opts.singingItems || []).slice()
  const stream = []
  const used = {}

  while (stream.length < pageSize) {
    const last = stream[stream.length - 1]
    const lastInst = isInstructional(last)
    const lastType = last ? last.type : ''
    const weights = [
      { key: 'pool', w: Math.max(0.05, 1 - theoryWeight - singingWeight) },
      { key: 'theory', w: theoryWeight },
      { key: 'singing', w: singingWeight },
    ]
    var key = pickWeighted(rng, weights)
    var item = null
    if (key === 'theory') item = takeFrom(theoryItems, used)
    else if (key === 'singing') item = takeFrom(singingItems, used)
    else item = takeFromSpread(pool, used, lastType)

    if (!item) {
      item = takeFromSpread(pool, used, lastType) || takeFrom(theoryItems, used) || takeFrom(singingItems, used)
    }
    if (!item) break

    if (lastInst && isInstructional(item)) {
      const nonInst = takeFromSpread(pool, used, lastType)
      if (nonInst) {
        item = nonInst
      } else {
        // No non-instructional left — stop rather than violate adjacency when possible
        const remaining = pool.length + theoryItems.length + singingItems.length
        if (remaining === 0) break
        // try one more pool-only peek already empty; allow fill only if nothing else
        break
      }
    }
    stream.push(item)
  }
  return stream
}

export function instructionalContentItems(bundle, skill) {
  const theory = modulesForSkill(bundle && bundle.theory, skill)
  const singing = modulesForSkill(bundle && bundle.singing, skill)
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
