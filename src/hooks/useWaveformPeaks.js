import { useEffect, useState } from 'react';

function downsamplePeaks(channelData, targetLength) {
  const len = Math.max(1, targetLength);
  const block = Math.max(1, Math.floor(channelData.length / len));
  const peaks = [];
  for (let i = 0; i < len; i += 1) {
    const start = i * block;
    let min = 0;
    let max = 0;
    for (let j = start; j < start + block && j < channelData.length; j += 1) {
      const v = channelData[j];
      if (v < min) min = v;
      if (v > max) max = v;
    }
    peaks.push({ min: min, max: max });
  }
  return peaks;
}

export function useWaveformPeaks(sourceUrl, enabled) {
  const [peaks, setPeaks] = useState(null);
  const [durationSeconds, setDurationSeconds] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(function() {
    if (!enabled || !sourceUrl) {
      setPeaks(null);
      setDurationSeconds(0);
      setError(null);
      return undefined;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(sourceUrl)
      .then(function(res) { return res.arrayBuffer(); })
      .then(function(buffer) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) throw new Error('AudioContext unavailable');
        const ctx = new AudioCtx();
        return ctx.decodeAudioData(buffer).then(function(audioBuffer) {
          ctx.close();
          return audioBuffer;
        });
      })
      .then(function(audioBuffer) {
        if (cancelled) return;
        const channel = audioBuffer.getChannelData(0);
        const targetLength = Math.min(4000, Math.max(200, Math.floor(channel.length / 512)));
        setPeaks(downsamplePeaks(channel, targetLength));
        setDurationSeconds(audioBuffer.duration);
        setLoading(false);
      })
      .catch(function(err) {
        if (cancelled) return;
        setPeaks(null);
        setError(err);
        setLoading(false);
      });

    return function() { cancelled = true; };
  }, [sourceUrl, enabled]);

  return { peaks: peaks, durationSeconds: durationSeconds, loading: loading, error: error };
}
