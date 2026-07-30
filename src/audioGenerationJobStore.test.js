import {
  __resetForTests,
  enqueueAudioGenerationJob,
  getState,
} from './audioGenerationJobStore'

describe('audioGenerationJobStore', function() {
  afterEach(function() {
    __resetForTests()
  })

  test('getState returns a stable snapshot reference until the store changes', function() {
    const first = getState()
    const second = getState()
    expect(second).toBe(first)

    enqueueAudioGenerationJob({
      tuneId: 't1',
      tuneName: 'Test tune',
      resolverJobId: 'resolver-job-1',
    })

    const afterEnqueue = getState()
    expect(afterEnqueue).not.toBe(first)
    expect(afterEnqueue.jobs.length).toBe(1)
    expect(getState()).toBe(afterEnqueue)
  })
})
