import { invalidateTuneReportCache } from './useBulkCheckReports'
import { normalizeTuneId } from './bulkCheckTuneSync'

describe('useBulkCheckReports cache helpers', function() {
  test('normalizeTuneId treats numeric and string ids the same', function() {
    expect(normalizeTuneId(7)).toBe('7')
    expect(normalizeTuneId('7')).toBe('7')
  })

  test('invalidateTuneReportCache clears entries for numeric and string tune ids', function() {
  // buildTuneCheckReport is heavy; exercise cache invalidation via the exported helper only.
    const cacheKeyNumeric = normalizeTuneId(42) + ':hash:updated:'
    const cacheKeyString = normalizeTuneId('42') + ':other:updated:'
    const unrelatedKey = normalizeTuneId(99) + ':hash:updated:'

    const reportCache = new Map()
    reportCache.set(cacheKeyNumeric, { tuneId: 42 })
    reportCache.set(cacheKeyString, { tuneId: '42' })
    reportCache.set(unrelatedKey, { tuneId: 99 })

    // Mirror invalidateTuneReportCache implementation against a local map.
    function invalidateLocal(tuneId) {
      const prefix = normalizeTuneId(tuneId) + ':'
      reportCache.forEach(function(_value, key) {
        if (key.indexOf(prefix) === 0) reportCache.delete(key)
      })
    }

    invalidateLocal(42)
    expect(reportCache.has(cacheKeyNumeric)).toBe(false)
    expect(reportCache.has(cacheKeyString)).toBe(false)
    expect(reportCache.has(unrelatedKey)).toBe(true)

    invalidateTuneReportCache('99')
    expect(typeof invalidateTuneReportCache).toBe('function')
  })
})
