import React, {useEffect, useState} from 'react';
import { Piano, KeyboardShortcuts, MidiNumbers } from 'react-piano';
import 'react-piano/dist/styles.css';

import useWindowSize from '../useWindowSize'
import SoundfontProvider from '../SoundfontProvider';
import { LOCAL_SOUNDFONT_INSTRUMENTS } from '../localSoundfontInstrumentMap';
import '../piano_styles.css';

const soundfontHostname = 'https://d1pzp51pvbm36p.cloudfront.net';

const noteRange = {
  first: MidiNumbers.fromNote('c3'),
  last: MidiNumbers.fromNote('c5'),
};
const keyboardShortcuts = KeyboardShortcuts.create({
  firstNote: noteRange.first,
  lastNote: noteRange.last,
  keyboardConfig: KeyboardShortcuts.HOME_ROW,
});

const DEFAULT_INSTRUMENTS = LOCAL_SOUNDFONT_INSTRUMENTS.slice();

function ResponsivePiano(props) {
  const { soundFontUrl, instruments: instrumentsProp, fullGm, ...pianoProps } = props
  var windowSize = useWindowSize()
  const [audioContext, setAudioContext] = useState(null)
  const [loadError, setLoadError] = useState('')
  const useSoundFont = soundFontUrl ? soundFontUrl : soundfontHostname
  const instruments = Array.isArray(instrumentsProp) && instrumentsProp.length
    ? instrumentsProp
    : DEFAULT_INSTRUMENTS

  const [useInstrument,setUseInstrument] = useState('acoustic_grand_piano')

  useEffect(function() {
    const Ctx = window.AudioContext || window.webkitAudioContext
    if (!Ctx) {
      setLoadError('Web Audio is not available in this browser.')
      return undefined
    }
    const ctx = new Ctx()
    setAudioContext(ctx)
    return function() {
      try {
        if (ctx && ctx.state !== 'closed') ctx.close()
      } catch (e) {}
    }
  }, [])

  useEffect(function() {
    if (instruments.indexOf(useInstrument) < 0) {
      setUseInstrument(instruments[0] || 'acoustic_grand_piano')
    }
  }, [instruments, useInstrument])

  function resumeAudio() {
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume().catch(function() {})
    }
  }

  return (
    <div onPointerDown={resumeAudio}>
    <br/>
    <label>Instrument
    <select value={useInstrument} onChange={function(e) {setUseInstrument(e.target.value)}} >
    {instruments.map(function(i) {
        return <option value={i} key={i} >{i.replace(/_/g, ' ')}</option>
    })}
    </select></label>
    {fullGm ? <span style={{ marginLeft: 8, opacity: 0.7 }}>Full MusyngKite (resolver)</span> : null}
    <br/><br/>
    {loadError ? <p style={{ color: '#b00020' }}>{loadError}</p> : null}
     {(useInstrument && useSoundFont && audioContext) && <SoundfontProvider
          instrumentName={useInstrument}
          audioContext={audioContext}
          hostname={useSoundFont}
          soundfont="MusyngKite"
          onLoadError={function(err) {
            setLoadError(err && err.message ? String(err.message) : 'Could not load piano sounds')
          }}
          onLoadSuccess={function() { setLoadError('') }}
          render={({ isLoading, playNote, stopNote }) => (
            <Piano
              noteRange={noteRange}
              width={windowSize[0]}
              playNote={function(midi) {
                resumeAudio()
                playNote(midi)
              }}
              stopNote={stopNote}
              disabled={isLoading}
              {...pianoProps}
            />
          )}
        />}

      </div>
  );
}
export default ResponsivePiano
