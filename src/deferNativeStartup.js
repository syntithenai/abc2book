import { isAndroidApp } from './platformUtils'

/** Run heavy startup work after the WebView has settled (reduces ANR on Android). */
export function runAfterNativeStartup(fn, delayMs) {
  if (typeof fn !== 'function') return
  if (isAndroidApp()) {
    setTimeout(fn, typeof delayMs === 'number' ? delayMs : 12000)
    return
  }
  fn()
}

/** Stagger several startup tasks so they do not pile onto one event-loop turn. */
export function staggerNativeStartup(tasks) {
  if (!Array.isArray(tasks) || !tasks.length) return
  if (!isAndroidApp()) {
    tasks.forEach(function(task) {
      if (task && typeof task.fn === 'function') task.fn()
    })
    return
  }
  var baseDelay = 10000
  tasks.forEach(function(task, index) {
    if (!task || typeof task.fn !== 'function') return
    var delay = typeof task.delayMs === 'number' ? task.delayMs : baseDelay + (index * 2500)
    setTimeout(task.fn, delay)
  })
}
