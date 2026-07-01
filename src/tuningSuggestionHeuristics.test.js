import { suggestTuningFromMetadata, tuningSuggestionTunerUrl } from './tuningSuggestionHeuristics'

describe('tuningSuggestionHeuristics', () => {
  it('suggests calico for Black Mountain Rag', () => {
    const s = suggestTuningFromMetadata({ name: 'Black Mountain Rag' })
    expect(s.presetId).toBe('aeacSharp')
    expect(s.instrument).toBe('mandolin')
  })

  it('suggests GDAD bouzouki for Irish jig', () => {
    const s = suggestTuningFromMetadata({
      name: 'The Kesh',
      rhythm: 'jig',
      tags: ['irish']
    })
    expect(s.instrument).toBe('bouzouki')
    expect(s.presetId).toBe('gdad')
    expect(s.alternate.presetId).toBe('gdae')
  })

  it('suggests AEAE for old-time metadata', () => {
    const s = suggestTuningFromMetadata({
      name: 'Some Tune',
      tags: ['old-time', 'appalachian']
    })
    expect(s.presetId).toBe('aeae')
  })

  it('builds tuner URL with params', () => {
    const url = tuningSuggestionTunerUrl({
      instrument: 'bouzouki',
      presetId: 'gdad'
    }, 'tune-123')
    expect(url).toContain('instrument=bouzouki')
    expect(url).toContain('tuning=gdad')
    expect(url).toContain('tuneId=tune-123')
  })
})
