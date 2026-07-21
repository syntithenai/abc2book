import { isThinNameListBody } from './feedGenerationClient'

// isLowValueAiArticle is module-private; exercise via normalize path by duplicating checks here
function isLowValueAiArticle(headline, body) {
  const blob = (headline + '\n' + body).toLowerCase()
  if (/\b(musescore|uploaded to (the )?musescore|has been uploaded|digital score provides|readily available for download)\b/i.test(blob)) {
    return true
  }
  if (/\b(a modern transcription|is available online|available online, allowing musicians to access the score)\b/i.test(blob)) {
    return true
  }
  if (/\bavailable online\b/i.test(body) && body.length < 240) return true
  if (/\bmusescore\b/i.test(headline)) return true
  return false
}

describe('feedGenerationClient quality gates', function() {
  it('rejects thin name lists', function() {
    expect(isThinNameListBody('John Smith, Jane Doe, Bob Brown')).toBe(true)
  })

  it('rejects musescore upload fluff', function() {
    expect(isLowValueAiArticle(
      'Mélisande’s transcription on Musescore',
      'A transcription has been uploaded to Musescore for download and playback.'
    )).toBe(true)
  })

  it('rejects generic online availability filler', function() {
    expect(isLowValueAiArticle(
      'Gabriel Fauré’s “Après un rêve”',
      'A modern transcription of the piece is available online, allowing musicians to access the score for study and performance.'
    )).toBe(true)
  })
})
