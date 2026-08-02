import { mergeAffordanceIntoAccess, getGatedActionLabel, normalizeAccessToken } from './resolverCreditAccess'
import { getResolverLoginWarning } from './mediaProxyClient'

function imageOcrAvailable(resolverAvailable, features) {
  return resolverAvailable && !!(features.sheetImageOcr || features.sheetImage)
}

function imageOmrAvailable(resolverAvailable, features) {
  return resolverAvailable && !!features.sheetImageOmr
}

function audioChordsAvailable(resolverAvailable) {
  return !!resolverAvailable
}

function audioMelodyAvailable(resolverAvailable, features) {
  return resolverAvailable && !!features.practiceAnalysis
}

function audioLyricsAvailable(resolverAvailable, features) {
  return resolverAvailable && !!features.whisper
}

function buildImageChoices(resolverAvailable, features) {
  const choices = []
  if (imageOcrAvailable(resolverAvailable, features)) {
    choices.push({
      id: 'ocr',
      label: 'OCR',
      canUse: true,
      helperText: 'Extract chord chart or lyric text',
    })
  }
  if (imageOmrAvailable(resolverAvailable, features)) {
    choices.push({
      id: 'omr',
      label: 'OMR',
      canUse: true,
      helperText: 'Recognize staff notation as melody',
    })
  }
  return choices
}

function buildAudioChoices(resolverAvailable, features) {
  const choices = []
  if (audioChordsAvailable(resolverAvailable)) {
    choices.push({
      id: 'chords',
      label: 'Chords',
      canUse: true,
      helperText: 'Detect chord changes from audio',
    })
  }
  if (audioMelodyAvailable(resolverAvailable, features)) {
    choices.push({
      id: 'melody',
      label: 'Melody',
      canUse: true,
      helperText: 'Extract melody as notation',
    })
  }
  if (audioLyricsAvailable(resolverAvailable, features)) {
    choices.push({
      id: 'lyrics',
      label: 'Lyrics',
      canUse: true,
      helperText: 'Transcribe spoken or sung words',
    })
  }
  return choices
}

function allChoicesForType(itemType) {
  if (itemType === 'image') {
    return [
      {
        id: 'ocr',
        label: 'OCR',
        canUse: true,
        helperText: 'Extract chord chart or lyric text',
      },
      {
        id: 'omr',
        label: 'OMR',
        canUse: true,
        helperText: 'Recognize staff notation as melody',
      },
    ]
  }
  if (itemType === 'audio') {
    return [
      {
        id: 'chords',
        label: 'Chords',
        canUse: true,
        helperText: 'Detect chord changes from audio',
      },
      {
        id: 'melody',
        label: 'Melody',
        canUse: true,
        helperText: 'Extract melody as notation',
      },
      {
        id: 'lyrics',
        label: 'Lyrics',
        canUse: true,
        helperText: 'Transcribe spoken or sung words',
      },
    ]
  }
  return []
}

function buildLoginPlaceholderChoices(itemType) {
  return allChoicesForType(itemType)
}

function unavailableHelperText(itemType, features) {
  if (itemType === 'image' && !features.sheetImageOmr && (features.sheetImageOcr || features.sheetImage)) {
    return 'OMR requires the full home resolver with staff recognition.'
  }
  if (itemType === 'audio' && !features.practiceAnalysis) {
    return 'Melody analysis requires the full home resolver.'
  }
  return ''
}

/**
 * Resolver-gated access for scratchpad image/audio Analyse Use option.
 */
export function getScratchpadAnalyseAccess(context, itemType) {
  const opts = context || {}
  const type = itemType === 'audio' ? 'audio' : (itemType === 'image' ? 'image' : '')
  const resolverChecked = !!opts.resolverChecked
  const resolverAvailable = !!opts.resolverAvailable
  const features = opts.features || {}
  const loginWarning = getResolverLoginWarning(opts.resolverStatus, normalizeAccessToken(opts.accessToken))
  const needsLogin = !!(loginWarning && loginWarning.showLoginButton)
  const needsCredit = !!(loginWarning && loginWarning.showBuyCreditButton)

  if (!type) {
    return {
      itemType: type,
      showOption: false,
      needsLogin: false,
      canUse: false,
      loginWarning: null,
      choices: [],
      unavailableHelperText: '',
    }
  }

  const usableChoices = type === 'image'
    ? buildImageChoices(resolverAvailable, features)
    : buildAudioChoices(resolverAvailable, features)
  const hasUsableChoice = usableChoices.some(function(choice) { return choice.canUse })
  const showOption = resolverChecked && (hasUsableChoice || needsLogin || needsCredit)
  const baseAccess = {
    itemType: type,
    showOption: showOption,
    needsLogin: needsLogin && showOption,
    needsCredit: needsCredit && showOption,
    canUse: hasUsableChoice && !needsLogin && !needsCredit,
    loginWarning: loginWarning,
    choices: (needsLogin || needsCredit) ? buildLoginPlaceholderChoices(type) : usableChoices,
    unavailableHelperText: unavailableHelperText(type, features),
  }
  return mergeAffordanceIntoAccess(baseAccess, opts.affordance)
}

function analyseUseLabelForType(itemType) {
  if (itemType === 'image') return 'For Optical Recognition'
  return 'Analyse'
}

export function getScratchpadAnalyseUseLabel(access) {
  if (!access || !access.showOption) return ''
  const label = analyseUseLabelForType(access.itemType)
  return getGatedActionLabel(access, label)
}

export function getScratchpadAnalyseChoices(access) {
  if (!access) return []
  if (access.needsLogin) return allChoicesForType(access.itemType)
  return (access.choices || []).filter(function(choice) { return choice.canUse })
}

export function getScratchpadAnalyseBackgroundStartMessage(itemType, mode) {
  if (itemType === 'image') {
    if (mode === 'omr') {
      return 'OMR is running in the background. You will get a notification when the notation record is ready.'
    }
    return 'OCR is running in the background. You will get a notification when the text record is ready.'
  }
  if (mode === 'melody') {
    return 'Melody analysis is running in the background. You will get a notification when the notation record is ready.'
  }
  if (mode === 'lyrics') {
    return 'Lyrics transcription is running in the background. You will get a notification when the text record is ready.'
  }
  return 'Chord analysis is running in the background. You will get a notification when the results record is ready.'
}
