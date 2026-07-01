import { chordParserFactory, chordRendererFactory } from 'chord-symbol';

import {useParams, Link , Outlet } from 'react-router-dom'
import {Button, Tabs, Tab, Row, Col} from 'react-bootstrap'
import React,{useEffect, useRef, useState} from 'react'
import chordLib from '../chordlib.json'
import { draw } from 'vexchords';
import {
  CHORD_LETTERS,
  INSTRUMENTS,
  INSTRUMENT_LABELS,
  INSTRUMENT_TUNINGS
} from '../chordLibConfig'
import {
  canonicalChordLetter,
  stringsFromInstrument,
  chordLabelFromQuality,
  chordVoicingsFromEntry,
  vexchordsTuningFromDiagram
} from '../chordLibUtils'
import ChordCheatSheetModal from '../components/ChordCheatSheetModal'
var scale = require('music-scale')

const instruments = INSTRUMENTS
const chordLetters = CHORD_LETTERS
const instrumentTunings = INSTRUMENT_TUNINGS


// legacy mandolin compact notation (reference only)
const chordBase = {
  // Customizations (all optional, defaults shown)
  width: 400, // canvas width
  height: 520, // canvas height
  //circleRadius: 10, // circle radius (width / 20 by default)

  numStrings:  6, // number of strings (e.g., 4 for bass)
  numFrets:  10 , // number of frets (e.g., 7 for stretch chords)
  showTuning: true, // show tuning keys

  defaultColor: 'black', // default color
  bgColor: '#FFF', // background color
  strokeColor: 'black', // stroke color (overrides defaultColor)
  textColor: 'black', // text color (overrides defaultColor)
  stringColor: 'black', // string color (overrides defaultColor)
  fretColor: 'black', // fret color (overrides defaultColor)
  labelColor: 'white', // label color (overrides defaultColor)

  fretWidth: 1, // fret width
  stringWidth: 1, // string width

  //fontFamily,
  //fontSize,
  //fontWeight,
  //fontStyle, // font settings
  //labelWeight // weight of label font
};
function calcFrets(chordData) {
  //console.log('CF',chordData)
  var max = 3
  if (chordData && Array.isArray(chordData.chord)) {
    chordData.chord.forEach(function(dataRow) {
      if (dataRow.length > 1) {
        var val = parseInt(dataRow[1])
        //console.log('CF have good row',val,dataRow)
        if (!isNaN(val) && val > 0 && val > max) {
          //console.log('CF mewmax',val)
          max = val
        }
      }
    })
  }
  return max
}

export default function ChordsPage(props) {
    var params = useParams()
    var chordsRef = useRef([])
    var schordsRef = useRef([])
    var [qualities,setQualities] = useState(Object.keys(chordLib['guitar']))
    //console.log('coll',params,chordLib)

    var [useInstrument, setUseInstrument] = useState('guitar') 
    var [useChordLetter, setUseChordLetter] = useState('C') 
    var [useChordQuality, setUseChordQuality] = useState('') 
    var [useChordLabel, setUseChordLabel] = useState('') 
    var [secondaries, setSecondaries] = useState('')
    var [showCheatSheet, setShowCheatSheet] = useState(false)
    
    useEffect(function() {
      var parseChordFn = chordParserFactory()
      //console.log("EFF",params)
      // for single view chord links, persist instrument selection
      var useInstrument = params.instrument ? params.instrument : (localStorage.getItem('bookstorage_last_chord_instrument') ? localStorage.getItem('bookstorage_last_chord_instrument') : "guitar")
      setUseInstrument(useInstrument)
      localStorage.setItem('bookstorage_last_chord_instrument',useInstrument)
      setQualities(chordLib[useInstrument] ? Object.keys(chordLib[useInstrument]) : [])
      var l=''
      var q=''
      var ll = ''
      if (params.chordLetter) {
        // if we have both chordLetter and quality
        if (params.quality && chordLib[useInstrument][params.quality]) {
          
          l = canonicalChordLetter(params.chordLetter)
          q = params.quality
          // TODO EMBED QUALITY
          ll = chordLabelFromQuality(l,q)
          
          //console.log('HAVE QUAL PARAM',l,q,ll)
        // otherwise determine quality from chordLetter/name
        } else  {
          const parseChord = chordParserFactory();
          const renderChord = chordRendererFactory({ useShortNamings: false });
          const destChord = parseChord(canonicalChordLetter(params.chordLetter));
          if (!destChord.error) {
            var dest = renderChord(destChord)
            //console.log("short",dest,"long",dest2,"qual",destChord.normalized.quality,"sus?",destChord.normalized.isSuspended,"M",destChord)
            l = destChord.normalized.rootNote
            q = destChord.normalized.quality
            ll = dest
            //console.log('PARSED CHORD',canonicalChordLetter(params.chordLetter),l,q,ll)
          } else {
            if (destChord.normalized.rootNote && destChord.normalized.quality) {
              l = destChord.normalized.rootNote
              q = destChord.normalized.quality
              ll = chordLabelFromQuality(l,q)
              //console.log('PARSED CHORD fail1',l,q,ll)
            } else {
              if (destChord.normalized.rootNote) {
                l = destChord.normalized.rootNote
                q = 'major'
                ll = chordLabelFromQuality(l,q)
                //console.log('PARSED CHORD fail2 force quality',l,q,ll)
              } else {
                l = 'C'
                q = 'major'
                ll = 'C'
                //console.log('PARSED CHORD fail3 force quality and letter',l,q,ll)
              }
            }
          }
        }
      } else {
        l = 'C'
        q = 'major'
        ll = 'C'
        //console.log('PARSED CHORD fail4 force quality and letter',l,q,ll)
      }
      //console.log("FIN",l,q,ll)
      setUseChordLetter(l)
      setUseChordQuality(q)
      setUseChordLabel(ll)
     
      var chordEntry = chordLib[useInstrument] && chordLib[useInstrument][q] && chordLib[useInstrument][q][l]
        ? chordLib[useInstrument][q][l]
        : null
      var chordInfoForNotes = parseChordFn(ll)
      var chordNotes = chordInfoForNotes.error ? [] : chordInfoForNotes.normalized.notes
      var voicingOptions = { instrument: useInstrument, chordNotes: chordNotes }
      var voicings = chordVoicingsFromEntry(chordEntry, ll, voicingOptions)
      var primaryChord = voicings.primaryChord
      var secondaryChords = voicings.secondaryChords
      //console.log("FOUND CHORD",useInstrument, q,l, primaryChord, "SEC",secondaryChords,chordLib[useInstrument])
      
      if (Array.isArray(primaryChord)) {
        
        //console.log("FOUND CHORDdata",primaryChord)
        
        //console.log('chord effe',chordLetter + chordType,chordData,chordChart)
        chordsRef.current.innerHTML = ''
        var chordBase1 = JSON.parse(JSON.stringify(chordBase))
        chordBase1.numStrings = stringsFromInstrument(useInstrument)
        
        //console.log('main chord data',primaryChord,chordBase1)
            
        primaryChord.forEach(function(primaryChordInner) {
          primaryChordInner.forEach(function(chordData) {
            chordBase1.numFrets = calcFrets(chordData)
            draw('#chords', {
              chord: chordData.chord,
              barres: chordData.barres,
              position: chordData.position,
              tuning: vexchordsTuningFromDiagram(chordData, useInstrument, chordNotes)
            }, chordBase1);
          })
        })
      } else {
        chordsRef.current.innerHTML = ''
      }
      
      if (Array.isArray(secondaryChords)) {
        setSecondaries(secondaryChords)
        var chordBase2 = JSON.parse(JSON.stringify(chordBase))
        chordBase2.width = 150
        chordBase2.height = 180
        chordBase2.numStrings = stringsFromInstrument(useInstrument)
        var targetDivs = secondaryChords.map(function(chordData,cdk) { return '<div style="float:left; minWidth:120px" ><h6 style="margin-top:1em; font-size:0.7em">'+chordData.name+'</h6><div  id="secondarychords_'+cdk + '" ></div> </div>' }).join("\n")
        schordsRef.current.innerHTML =  targetDivs 
        
        secondaryChords.forEach(function(chordData,cdk) {
          chordBase2.numFrets = calcFrets(chordData)
          draw('#secondarychords_'+cdk, {
            chord: chordData.chord,
            barres: chordData.barres,
            position: chordData.position,
            tuning: vexchordsTuningFromDiagram(chordData, useInstrument, chordNotes)
          }, chordBase2);
        })
      } else {
        schordsRef.current.innerHTML = ''
      }

    },[params.chordLetter,params.quality,params.instrument])
    
    
    
    //return <div ref={chordsRef} id="chords" >ddddd</div>
    var instrumentLabel = INSTRUMENT_LABELS[useInstrument] || useInstrument
    var tuningLabel = (instrumentTunings[useInstrument] || []).join(' ')
    var secondaryHeading = (useInstrument === 'mandolin' || useInstrument === 'banjo4' || useInstrument === 'banjo5')
      ? 'Up the neck'
      : 'Related Chords'
    //var instruments = Object.keys(chords)
    
    var major = scale('1 2 3 4 5 6 7 ',useChordLetter)
    //console.log("MAJ",major)
    var chordsInKey=<div style={{float:'right'}}>
    
    {(useChordQuality === 'minor' || useChordQuality === 'minor7'|| useChordQuality === 'diminished') && <>
      <h4>Chords in {useChordLetter} minor</h4>
      <Link to={"/chords/"+useInstrument+"/"+major[0]+"m"} ><Button variant="success">{major[0]}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[1]+"dim"} ><Button  >{major[1]+"dim"}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[2]} ><Button>{major[2]}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[3]+"m"} ><Button variant="success">{major[3]+"m"}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[4]} ><Button variant="success">{major[4]}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[5]} ><Button>{major[5]}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[6]} ><Button>{major[6]}</Button></Link>
    </>}  
    {!(useChordQuality === 'minor' || useChordQuality === 'minor7'|| useChordQuality === 'diminished') && <>
      <h4>Chords in {useChordLetter} major</h4>
      <Link to={"/chords/"+useInstrument+"/"+major[0]} ><Button variant="success">{major[0]}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[1]+"m"} ><Button  >{major[1]+"m"}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[2]+"m"} ><Button>{major[2]+"m"}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[3]} ><Button variant="success">{major[3]}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[4]} ><Button variant="success">{major[4]}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[5]+"m"} ><Button>{major[5]+"m"}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[6]+"dim"} ><Button>{major[6]+"dim"}</Button></Link>
    </>}
    </div>

    
    return <div className="App-chords">
        <ChordCheatSheetModal
          show={showCheatSheet}
          onHide={function() { setShowCheatSheet(false) }}
          instrument={useInstrument}
          tunebook={props.tunebook}
        />

        <div style={{float:'right', display:'flex', alignItems:'center', gap:'1em'}}>
          <Button variant="outline-secondary" onClick={function() { setShowCheatSheet(true) }}>Cheat Sheet</Button>
        {instruments.map(function(instr) {
          return <Link key={instr} to={"/chords/"+encodeURIComponent(instr)+"/"+encodeURIComponent(useChordLetter)+"/"+encodeURIComponent(useChordQuality)} ><Button variant={useInstrument === instr ? "info" : "primary"}  >{INSTRUMENT_LABELS[instr] || instr}</Button></Link>
        })}
        </div>
        
        <div>
        {chordLetters.map(function(key) {
          return <Link  key={key} to={"/chords/"+encodeURIComponent(useInstrument)+"/"+encodeURIComponent(key)+"/"+encodeURIComponent(useChordQuality)} ><Button variant={useChordLetter === key ? "info" : "primary"} >{key}</Button></Link>
        })}
        </div>
        <div>
        {qualities.map(function(key) {
          return <Link  key={key} to={"/chords/"+encodeURIComponent(useInstrument)+"/"+encodeURIComponent(useChordLetter)+"/"+encodeURIComponent(key)} ><Button variant={useChordQuality === key ? "info" : "primary"} >{key ? key : 'major'}</Button></Link>
        })}
        </div>
        <br/>
        {chordsInKey}
        
        <h1>{useChordLabel} chord for {instrumentLabel}{tuningLabel ? <span style={{fontSize:'0.55em', display:'block', fontWeight:'normal'}}>{tuningLabel}</span> : null}</h1>
        <div style={{width:'100%'}} >
          <div style={{minWidth:'400px', float:'left'}} ref={chordsRef} id="chords" ></div>
          <div style={{ float:'left',marginTop:'1em'}} >{(secondaries && secondaries.length > 0) && <h3>{secondaryHeading}</h3>}<div ref={schordsRef} id="secondarychords" ></div></div>
        </div>
    </div>
      
}      
