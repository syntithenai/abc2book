import React, {useRef, useEffect, useState} from 'react';
import ReactDOM from 'react-dom';
import { Piano, KeyboardShortcuts, MidiNumbers } from 'react-piano';
import 'react-piano/dist/styles.css';

import useWindowSize from '../useWindowSize'
import SoundfontProvider from '../SoundfontProvider';
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
const instruments = [
'accordion',
'acoustic_grand_piano',
'acoustic_guitar_steel',
'brass_section',
'choir_aahs',
'fiddle',
'flute',
'harmonica',
'recorder',
'slap_bass_1'
]

//function App() {
  //return (
    //<div>
      //<h1>react-piano demos</h1>
      //<div className="mt-5">
        //<p>Basic piano with hardcoded width</p>
        //<BasicPiano />
      //</div>

      //<div className="mt-5">
        //<p>
          //Responsive piano which resizes to container's width. Try resizing the
          //window!
        //</p>
        //<ResponsivePiano />
      //</div>

      //<div className="mt-5">
        //<p>Piano with custom styling - see styles.css</p>
        //<ResponsivePiano className="PianoDarkTheme" />
      //</div>
    //</div>
  //);
//}
 
function BasicPiano(props) {
  const audioContext = useRef() //new (window.AudioContext || window.webkitAudioContext)();
  useEffect(function() {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      //console.log('create context',audioContext.current)
  },[])
  const [useInstrument,setUseInstrument] = useState('acoustic_grand_piano')
  return (
    <div>
    <br/>
    <label>Instrument 
    <select value={useInstrument} onChange={function(e) {setUseInstrument(e.target.value)}} >
    {instruments.map(function(i) {
        return <option value={i} key={i} >{i.replace('_',' ')}</option>
    })}
    </select></label>
    <br/><br/>
    <SoundfontProvider
      instrumentName={useInstrument}
      audioContext={audioContext.current}
      hostname={props.soundFontUrl ? props.soundFontUrl : soundfontHostname}
      render={({ isLoading, playNote, stopNote }) => (
        <Piano
          noteRange={noteRange}
          width={300}
          playNote={playNote}
          stopNote={stopNote}
          disabled={isLoading}
          keyboardShortcuts={keyboardShortcuts}
        />
      )}
    />
    </div>
  );
}

function ResponsivePiano(props) {
  const audioContext = useRef() //new (window.AudioContext || window.webkitAudioContext)();
  var windowSize = useWindowSize()
  useEffect(function() {
      audioContext.current = new (window.AudioContext || window.webkitAudioContext)();
      //console.log('create context',audioContext.current,props.soundFontUrl)
  },[])
  const [useInstrument,setUseInstrument] = useState('acoustic_grand_piano')
  return (
    <div>
    <br/>
    <label>Instrument 
    <select value={useInstrument} onChange={function(e) {setUseInstrument(e.target.value)}} >
    {instruments.map(function(i) {
        return <option value={i} key={i} >{i.replace('_',' ')}</option>
    })}
    </select></label>
    <br/><br/>
     <SoundfontProvider
          instrumentName={useInstrument}
          audioContext={audioContext.current}
          hostname={props.soundFontUrl ? props.soundFontUrl : soundfontHostname}
          render={({ isLoading, playNote, stopNote }) => (
            <Piano
              noteRange={noteRange}
              width={windowSize[0]}
              playNote={playNote}
              stopNote={stopNote}
              disabled={isLoading}
              {...props}
            />
          )}
        />
        
      </div>
  );
}
export default ResponsivePiano
