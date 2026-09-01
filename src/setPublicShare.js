/**
 * Public performance-set share links (same payload shape as playlist public share).
 */

import { appendFreshLoadParam } from './appFreshLoadUtils'
import { shareOrigin } from './shareTunebookUtils'
import {
  analyzeSetPublishedShare,
  buildPublicScrapeSharePayload,
  decodePublicScrapeSharePayload,
  encodePublicScrapeSharePayload,
  groupPublicRefsByScrapeFile,
  curatedScrapeUrlForShareRef,
} from './publicScrapeShare'

export {
  analyzeSetPublishedShare,
  groupPublicRefsByScrapeFile as groupSetPublicRefsByScrapeFile,
  curatedScrapeUrlForShareRef as curatedScrapeUrlForSetRef,
}

export function buildSetPublicSharePayload(name, refs) {
  return buildPublicScrapeSharePayload(name, refs, 'Set')
}

export function encodeSetPublicSharePayload(payload) {
  return encodePublicScrapeSharePayload(payload)
}

export function decodeSetPublicSharePayload(encoded) {
  return decodePublicScrapeSharePayload(encoded, 'Set')
}

export function buildSetPublicShareLink(options) {
  const opts = options || {}
  const analysis = opts.analysis || analyzeSetPublishedShare(opts.set, opts.tunes)
  if (!analysis || !analysis.ok) return ''
  const payload = buildSetPublicSharePayload(
    opts.name || (opts.set && opts.set.name),
    analysis.refs
  )
  const encoded = encodeSetPublicSharePayload(payload)
  if (!encoded) return ''
  const base = shareOrigin(opts.origin)
  const link = base + '/#/importset/' + encoded
  return opts.includeFreshParam === false ? link : appendFreshLoadParam(link)
}
