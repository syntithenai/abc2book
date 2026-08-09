import { beginDriveMergeCheckingToast, endDriveMergeCheckingToast, resetDriveMergeCheckingToastForTests } from './driveMergeCheckingToast'

describe('driveMergeCheckingToast', function() {
  beforeEach(function() {
    resetDriveMergeCheckingToastForTests()
  })

  test('begin and end are silent no-ops', function() {
    expect(function() {
      beginDriveMergeCheckingToast()
      beginDriveMergeCheckingToast()
      endDriveMergeCheckingToast()
      endDriveMergeCheckingToast()
    }).not.toThrow()
  })
})
