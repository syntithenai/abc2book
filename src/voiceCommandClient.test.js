import { normalizeVoiceCommandResponse } from './voiceCommandClient'

describe('normalizeVoiceCommandResponse', function() {
  test('accepts transcript-only parse responses', function() {
    const result = normalizeVoiceCommandResponse({
      transcript: 'show wild rover',
      tool: 'SHOW',
      title: 'wild rover',
      confidence: 0.95,
      parseMethod: 'regex',
      timing: { transcribeMs: 0, parseMs: 12, totalMs: 12 },
    })
    expect(result.transcript).toBe('show wild rover')
    expect(result.tool).toBe('SHOW')
    expect(result.title).toBe('wild rover')
    expect(result.timing.transcribeMs).toBe(0)
    expect(result.timing.parseMs).toBe(12)
  })
})
