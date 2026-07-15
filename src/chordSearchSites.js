import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from './externalSearchLinks'

export const ALLOWED_CHORD_SITES = 'site:https://tabs.ultimate-guitar.com OR site:https://www.azchords.com/ OR site:https://www.chordsbase.com/ OR site:https://www.chords-and-tabs.net/ OR site:https://akordy.kytary.cz/ OR site:https://www.guitaretab.com/'

export function buildGoogleChordsSearchUrl(title, artist, extraQuery) {
  let question = buildExternalSearchQuestion('chords', title, artist)
  if (!question) return ''
  const extra = String(extraQuery || '').trim()
  if (extra) question += ' ' + extra
  return buildGoogleSearchQuestionUrl(question)
}
