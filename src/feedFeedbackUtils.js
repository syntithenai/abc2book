export const FEED_FEEDBACK_ADMIN_EMAIL = 'syntithenai@gmail.com'

export function isFeedFeedbackAdmin(user, resolverStatus) {
  if (resolverStatus && resolverStatus.adminAccess) return true
  return !!(user && user.email === FEED_FEEDBACK_ADMIN_EMAIL)
}

const COMPRESS_MAX_LEN = 80

const COMPRESS_PREFIX_RE = /^(display|show|create|illustrate|colorful|vivid)\s+(a|an|the)?\s*/i

const COMPRESS_BOILERPLATE_RES = [
  /\s+using abc notation[^.;]*/gi,
  /\s+on (a |the )?treble[- ]clef staff[^.;]*/gi,
  /\s+within the staff[^.;]*/gi,
  /\s+with no ledger lines[^.;]*/gi,
  /\s+without ledger lines[^.;]*/gi,
  /\s+ensuring all notes fit within the staff[^.;]*/gi,
  /\s+include (a |the )?caption[^.;]*/gi,
  /\s*[—–-]\s*representative (?:image|portrait) (?:for|of).+$/gi,
]

const MOTIVATION_TAIL_RES = [
  /\s+with\s+(?:surrounding|floating|annotated|visual|icons?|symbols?|small\s+inset|a\s+visual|the\s+|his\s+|her\s+|their\s+|major\s+keys|treble-clef).+$/i,
  /\s+beside\s+.+$/i,
  /\s+alongside\s+.+$/i,
  /\s+at\s+the\s+piano\b.*$/i,
  /\s+highlighting\s+.+$/i,
  /\s+illustrating\s+.+$/i,
  /\s+representing\s+.+$/i,
  /\s+annotat(?:e|ing)\s+.+$/i,
  /\s+overlaid\s+with\s+.+$/i,
  /\s+each\s+label(?:led|ed)\s+with\s+.+$/i,
  /\s+and\s+annotate\s+.+$/i,
  /\s+showing\s+.+$/i,
]

function truncateCompressed(s) {
  if (s.length <= COMPRESS_MAX_LEN) return s
  const cut = s.slice(0, COMPRESS_MAX_LEN)
  const lastSpace = cut.lastIndexOf(' ')
  return (lastSpace > 24 ? cut.slice(0, lastSpace) : cut).trim() + '…'
}

function stripMotivationTails(s) {
  let out = String(s || '').trim()
  MOTIVATION_TAIL_RES.forEach(function(re) {
    out = out.replace(re, '')
  })
  const portraitCore = out.match(/^((?:stylized\s+)?portrait\s+of\s+[^,;]+?)(?=\s*(?:[,;]|$))/i)
  if (portraitCore) {
    return portraitCore[1].trim()
  }
  const comma = out.indexOf(',')
  if (comma > 2 && comma < 48) {
    const head = out.slice(0, comma).trim()
    if (/^[A-Z]/.test(head) && !/diagram|triad|cadence|notation|scale/i.test(head)) {
      out = head
    }
  }
  return out.trim()
}

/** Short summary of the illustration / notation generation prompt for display and export. */
export function compressIllustrationPlan(text) {
  let s = String(text || '').trim()
  if (!s) return ''
  s = s.replace(/\u2011/g, '-').replace(/\s+/g, ' ')
  s = s.replace(COMPRESS_PREFIX_RE, '')
  COMPRESS_BOILERPLATE_RES.forEach(function(re) {
    s = s.replace(re, '')
  })
  s = s.replace(/\s+/g, ' ').trim()
  s = stripMotivationTails(s)
  if (s.length > COMPRESS_MAX_LEN) {
    const colon = s.indexOf(':')
    if (colon >= 16 && colon < s.length - 8) {
      s = s.slice(0, colon).trim()
    } else {
      const semi = s.indexOf(';')
      if (semi >= 16 && semi < s.length - 8) {
        s = s.slice(0, semi).trim()
      }
    }
  }
  return truncateCompressed(s)
}

/** User-visible label under theory lesson notation/images. */
export function getExampleDisplayCaption(item) {
  const it = item || {}
  const plan = String(it.exampleIllustrationPlan || it.exampleCaption || '').trim()
  if (!plan) return ''
  return compressIllustrationPlan(plan)
}

export function buildFeedbackSnapshot(item) {
  const it = item || {}
  const illustrationPlan = it.exampleIllustrationPlan || it.exampleCaption || ''
  return {
    itemId: it.id || '',
    lessonId: it.lessonId || '',
    type: it.type || '',
    title: it.headline || '',
    content: it.body || it.teaser || '',
    notationExample: it.exampleAbc || null,
    imageLink: it.exampleImageUrl || null,
    imageComment: compressIllustrationPlan(illustrationPlan),
  }
}
