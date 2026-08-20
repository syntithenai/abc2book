import { shouldShowQueueCompletionToast } from './backgroundJobCompletionNotifications'

describe('shouldShowQueueCompletionToast', function() {
  test('suppresses media cache success toast for a single cached track', function() {
    expect(shouldShowQueueCompletionToast('media-cache', [
      { type: 'cache', status: 'done' },
    ])).toBe(false)
  })

  test('suppresses media cache success toast even when several tracks finished', function() {
    expect(shouldShowQueueCompletionToast('media-cache', [
      { type: 'cache', status: 'done' },
      { type: 'cache', status: 'done' },
    ])).toBe(false)
  })

  test('shows media cache toast when a cache job failed', function() {
    expect(shouldShowQueueCompletionToast('media-cache', [
      { type: 'cache', status: 'error' },
    ])).toBe(true)
  })

  test('still notifies other background queues for single jobs', function() {
    expect(shouldShowQueueCompletionToast('research', [
      { type: 'research', status: 'done' },
    ])).toBe(true)
  })
})
