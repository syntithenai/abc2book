import React, {useRef, useEffect, useState} from 'react';
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
  const audioContext = useRef()
  var windowSize = useWindowSize()
  useEffect(function() {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
  },[])
  const useSoundFont = soundFontUrl ? soundFontUrl : soundfontHostname
  const instruments = Array.isArray(instrumentsProp) && instrumentsProp.length
    ? instrumentsProp
    : DEFAULT_INSTRUMENTS

  const [useInstrument,setUseInstrument] = useState('acoustic_grand_piano')
  useEffect(function() {
    if (instruments.indexOf(useInstrument) < 0) {
      setUseInstrument(instruments[0] || 'acoustic_grand_piano')
    }
  }, [instruments, useInstrument])

  return (
    <div>
    <br/>
    <label>Instrument
    <select value={useInstrument} onChange={function(e) {setUseInstrument(e.target.value)}} >
    {instruments.map(function(i) {
        return <option value={i} key={i} >{i.replace(/_/g, ' ')}</option>
    })}
    </select></label>
    {fullGm ? <span style={{ marginLeft: 8, opacity: 0.7 }}>Full MusyngKite (resolver)</span> : null}
    <br/><br/>
     {(useInstrument && useSoundFont && audioContext.current) && <SoundfontProvider
          instrumentName={useInstrument}
          audioContext={audioContext.current}
          hostname={useSoundFont}
          soundfont="MusyngKite"
          render={({ isLoading, playNote, stopNote }) => (
            <Piano
              noteRange={noteRange}
              width={windowSize[0]}
              playNote={playNote}
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
