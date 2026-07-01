export function getPracticeSessionCopy(step, options) {
  const opts = options || {}
  const tempoPercent = Math.round((opts.currentTempo != null ? opts.currentTempo : 0.5) * 100)
  const phase = opts.phase || 'running'

  if (phase === 'ended') {
    return {
      happening: 'Practice session complete!',
      action: 'Great work today. Start a new session or close to return to your tune book.',
    }
  }

  if (!step) {
    return {
      happening: 'Preparing practice session',
      action: 'Get your instrument ready.',
    }
  }

  if (step.type === 'warmup') {
    return {
      happening: 'Warming up — ' + (step.title || 'exercise'),
      action: step.action || 'Play along with the pattern. Focus on even notes and relaxed hands.',
    }
  }

  if (step.type === 'tune') {
    const name = step.tuneName || 'tune'
    if (step.route === 'media') {
      return {
        happening: 'Now playing — ' + name,
        action: 'Play along with the recording. Tempo is ' + tempoPercent + '% and will speed up gradually.',
      }
    }
    return {
      happening: 'Now playing — ' + name,
      action: 'Play along with the notation below. Tempo is ' + tempoPercent + '% and will speed up gradually.',
    }
  }

  return {
    happening: 'Practice session',
    action: 'Follow along and play when ready.',
  }
}

export function formatPracticeTimeRemaining(seconds) {
  const total = Math.max(0, Math.ceil(seconds))
  const mins = Math.floor(total / 60)
  const secs = total % 60
  return mins + ':' + String(secs).padStart(2, '0')
}
