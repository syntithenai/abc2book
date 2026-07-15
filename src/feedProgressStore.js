/**
 * Daily learning progress + streak for Knowledge Feed.
 */

export const FEED_PROGRESS_STORAGE_KEY = 'bookstorage_feed_progress'
export const FEED_DAILY_GOAL = 3

function todayKey(now) {
  const d = new Date(now != null ? now : Date.now())
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

function yesterdayKey(now) {
  const d = new Date(now != null ? now : Date.now())
  d.setDate(d.getDate() - 1)
  return todayKey(d.getTime())
}

function emptyProgress(date) {
  return {
    date: date || todayKey(),
    learnedCount: 0,
    streak: 0,
    lastActiveDate: '',
  }
}

export function getFeedProgress(options) {
  const now = (options && options.now) != null ? options.now : Date.now()
  const today = todayKey(now)
  try {
    const raw = localStorage.getItem(FEED_PROGRESS_STORAGE_KEY)
    if (!raw) return emptyProgress(today)
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return emptyProgress(today)
    if (parsed.date !== today) {
      return {
        date: today,
        learnedCount: 0,
        streak: Number(parsed.streak) || 0,
        lastActiveDate: parsed.lastActiveDate || parsed.date || '',
      }
    }
    return {
      date: today,
      learnedCount: Number(parsed.learnedCount) || 0,
      streak: Number(parsed.streak) || 0,
      lastActiveDate: parsed.lastActiveDate || '',
    }
  } catch (e) {
    return emptyProgress(today)
  }
}

export function incrementLearned(options) {
  const now = (options && options.now) != null ? options.now : Date.now()
  const today = todayKey(now)
  const yday = yesterdayKey(now)
  let prev = {}
  try {
    const raw = localStorage.getItem(FEED_PROGRESS_STORAGE_KEY)
    if (raw) prev = JSON.parse(raw) || {}
  } catch (e) {
    prev = {}
  }
  const wasToday = prev.date === today
  const learnedCount = wasToday ? (Number(prev.learnedCount) || 0) + 1 : 1
  let streak = Number(prev.streak) || 0
  const lastActive = prev.lastActiveDate || (wasToday ? today : prev.date) || ''
  if (!wasToday) {
    if (lastActive === yday || prev.date === yday) {
      streak = streak + 1
    } else if (lastActive === today) {
      // keep
    } else {
      streak = 1
    }
  } else if (learnedCount === 1 && lastActive !== today) {
    if (lastActive === yday) streak = streak + 1
    else if (!lastActive) streak = Math.max(1, streak)
  }
  if (learnedCount >= 1 && (!wasToday || !prev.lastActiveDate)) {
    if (!wasToday) {
      // streak already updated
    } else if (learnedCount === 1 && prev.learnedCount === 0) {
      if (prev.lastActiveDate === yday || prev.date === yday) {
        // already handled
      } else if (!prev.lastActiveDate && streak === 0) {
        streak = 1
      }
    }
  }
  if (streak < 1 && learnedCount >= 1) streak = 1
  const next = {
    date: today,
    learnedCount: learnedCount,
    streak: streak,
    lastActiveDate: today,
  }
  try {
    localStorage.setItem(FEED_PROGRESS_STORAGE_KEY, JSON.stringify(next))
  } catch (e) {
    // ignore
  }
  return next
}
