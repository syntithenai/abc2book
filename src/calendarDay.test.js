import {
  addDays,
  localDateKey,
  parseLocalDateKey,
  todayKey,
  yesterdayKey,
} from './calendarDay'

describe('calendarDay', function() {
  it('localDateKey uses local calendar components', function() {
    var earlyMorning = new Date(2026, 8, 2, 2, 0, 0)
    expect(localDateKey(earlyMorning)).toBe('2026-09-02')
    expect(localDateKey(earlyMorning)).toBe(
      earlyMorning.getFullYear() + '-09-02'
    )
  })

  it('addDays stays on local calendar', function() {
    expect(addDays('2026-09-01', 1)).toBe('2026-09-02')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('parseLocalDateKey round-trips through localDateKey', function() {
    var key = '2026-07-15'
    expect(localDateKey(parseLocalDateKey(key))).toBe(key)
  })

  it('todayKey and yesterdayKey accept timestamps', function() {
    var noon = new Date(2026, 6, 15, 12, 0, 0)
    expect(todayKey(noon.getTime())).toBe('2026-07-15')
    expect(yesterdayKey(noon.getTime())).toBe('2026-07-14')
  })
})
