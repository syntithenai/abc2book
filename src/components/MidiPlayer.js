import Abc from './Abc'
import {useState, useEffect} from 'react'

function MidiPlayer(props) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [midiUrl, setMidiUrl] = useState(null);
  const [player, setPlayer] = useState(null);
  const abc = `
X: 1179
T: After the Battle of Aughrim
B: tunes
B: begged borrowed and stolen
M:2/4
L:1/8
Q: 1/4=100
K:Adorian
V:1 
A/G/ |:  "Am"EA A/B/c/d/| ed cA| "G"BG G/F/G/A/| B2/A/G/ ED| "Am"EA A/G/A/B/| ee ag| "G"ed B/e/d/B/|1  "Am" A2 A A/G/:|2 "Am" A3 e||
|:"Am"a a/g/ e ((3e/f/g/)| a/b/a/g/ e ((3e/f/g/)| a {b}a/f/ "Em"g {a}g/e/| "G"d/e/d/B/ G2| "Am"a/b/a/g/ e ((3e/f/g/)| a/b/a/g/ e d| "Em"Be "G"dB|1 "Am" A3 e:|2  "Am"A3||
% abcbook-tune_id 627e2b1fbe61e3fb853276fe
% abcbook-tune_composer_id 
% abcbook-link-0 https://www.youtube.com/watch?v=UN8esboT36Q
% abcbook-link-title-0 The Battle of Aughrim - The Chieftains with Chet Atkins
% abcbook-boost 0
% abcbook-difficulty 9
% abcbook-tags begged borrowed and stolen,celtic tunes,ralph cullen,steve ryan,© free
% abcbook-tablature 
% abcbook-transpose 
% abcbook-tuning 
% abcbook-lastupdated 1677637986016
% abcbook-soundfonts 
% abcbook-repeats 3
`
    //useEffect(function() {
        //MIDI.loadPlugin({
          //instrument: "acoustic_grand_piano", // or the instrument code 1 (aka the default)
          //instruments: [ "acoustic_grand_piano", "acoustic_guitar_nylon" ], // or multiple instruments
          //onsuccess: function() {console.log('LOADED SOUNDFONTS') }
        //});
    //})

  function handlePlay() {
    setIsPlaying(true);
  }

  function handleStop() {
      setIsPlaying(false);
  }

  
  return (
    <div>
      <h1>MIDI Player</h1>
      <button onClick={handlePlay} disabled={isPlaying}>
        Play
      </button>
      <button onClick={handleStop} disabled={!isPlaying}>
        Stop
      </button>
      {<Abc cacheAudio={false} speakTitle={false} autoStart={isPlaying} autoPrime={true}  metronomeCountIn={true}  tunes={props.tunes} editableTempo={true} repeat={ 1 } tunebook={props.tunebook}  abc={abc} tempo={100} meter={'4/4'}  onEnded={function() {console.log('END')}} hideSvg={false} hidePlayer={false} />}
    
     
    </div>
  );
}

export default MidiPlayer;
