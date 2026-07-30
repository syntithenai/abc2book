import {
  microphoneErrorMessage,
  openMicrophoneStream,
  stopMicrophoneStream,
} from './microphoneAccess'

describe('microphoneAccess', function() {
  const originalMediaDevices = navigator.mediaDevices

  afterEach(function() {
    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: originalMediaDevices,
    })
  })

  it('maps NotFoundError to a friendly message', function() {
    expect(microphoneErrorMessage({ name: 'NotFoundError' }))
      .toContain('No microphone was found on this device.')
  })

  it('opens the microphone with default audio constraints', async function() {
    const getUserMedia = jest.fn().mockResolvedValue({
      getTracks: function() { return [] },
    })

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMedia },
    })

    const stream = await openMicrophoneStream()
    expect(stream).toBeTruthy()
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true })
  })

  it('tries enumerated input devices after NotFoundError', async function() {
    const getUserMedia = jest.fn()
      .mockRejectedValueOnce(Object.assign(new Error('not found'), { name: 'NotFoundError' }))
      .mockResolvedValueOnce({ getTracks: function() { return [] } })
    const enumerateDevices = jest.fn().mockResolvedValue([
      { kind: 'audioinput', deviceId: 'mic-1', label: 'USB Mic' },
    ])

    Object.defineProperty(navigator, 'mediaDevices', {
      configurable: true,
      value: { getUserMedia: getUserMedia, enumerateDevices: enumerateDevices },
    })

    const stream = await openMicrophoneStream()
    expect(stream).toBeTruthy()
    expect(getUserMedia).toHaveBeenCalledTimes(2)
    expect(getUserMedia).toHaveBeenLastCalledWith({
      audio: { deviceId: { ideal: 'mic-1' } },
    })
  })

  it('stops all tracks when releasing a stream', function() {
    const stop = jest.fn()
    stopMicrophoneStream({
      getTracks: function() {
        return [{ stop: stop }]
      },
    })
    expect(stop).toHaveBeenCalledTimes(1)
  })
})
