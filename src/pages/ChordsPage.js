import { chordParserFactory, chordRendererFactory } from 'chord-symbol';

import {useParams, Link , Outlet } from 'react-router-dom'
import {Button, Tabs, Tab, Row, Col} from 'react-bootstrap'
//import chords from '../react-chords/db'
//import Chord from '@tombatossals/react-chords/lib/Chord'
import React,{useEffect, useRef, useState} from 'react'
import chords from '../chords.complete.json'
//import mandolinchords from '../mandolin.chords.complete.json'
import { ChordBox, draw } from 'vexchords';
var scale = require('music-scale')
// console.log(scale.names(true))   
const instruments=['guitar','mandolin']
const chordLetters = ['Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#']
const chordLetterMap = {'C#':'Db','G#':'Ab','D#':'Eb','A#':'Bb','Gb':'F#'}
const chordLetterMapComplete = {'F#':'Gb','C#':'Db','G#':'Ab','D#':'Eb','A#':'Bb','Bb':'A#','Eb':'D#','Ab':'G#','Db':'C#','Gb':'F#'}
const chordTypes = ['major','m','dim','aug','sus2','sus4','7','m7','maj7','dim7','6','m6','9','m9']
const instrumentTunings={'guitar':'EADGBE', 'mandolin':'GDAE'}

var notes=['C','Db','D','Eb','E','F','F#','G','Ab','A','Bb','B']

function sharpFlatAdjust(note,notes) {
  if (note && Array.isArray(notes)) {
    if (note === 'C') console.log('ad',note,notes)
    if (notes.indexOf(note) !== -1) {
      return note
    } else {
      if (chordLetterMapComplete[note]) {   
        return chordLetterMapComplete[note]
      } else {
        //console.log('missing',note)
        return note
      }
    }
  } else {
    return note
  }
}

var mandolinchords= {}
// fingering for major, major complex, minor, 7 m7 dim and aug chords
var mandoChordsCompact=`G 0023 4553 0013 0021 0011 2543 0123
G# 112x 1123 1113 1132 1122 1024 1234
Ab 112x 1123 1113 1132 1122 1024 1234
Bb 335x 3011 3346 1011 3344 3246 3456
A# 335x 3011 3346 1011 3344 3246 3456
Db 1241 5344 1240 4344 4244 6243 6345
C# 1241 5344 1240 4344 4244 6243 6345
Eb 0113 3163 3112 3143 3142 2162 4163
D# 0113 3163 3112 3143 3142 2162 4163
Gb 3442 6412 2442 3242 2242 2432 3452
F# 3442 6412 2442 3242 2242 2432 3452
A 2200 2245 2235 2243 2233 2135 2345
B 4122 4467 4457 2122 4455 4x21 4123
C 0230 5233 0133 3233 3133 2132 1234
D 2002 2455 2355 2032 2031 1051 3456
E 1220 1224 4223 4254 4253 0210 1230
F 5301 2331 1331 2131 1131 1321 2341`

//"C": [{"positions":["0","2","3","0"],"fingerings":[["0","1","2","0"]]}],
   
var mandoLines = mandoChordsCompact.split("\n")
mandoLines.forEach(function(line) {
  var chordRow = line.split(' ')
  if (chordRow.length === 8) {
    var chordLetter = chordRow[0]
    mandolinchords[chordLetter] = [{positions:chordRow[1].split(''), fingerings:[[]] }, {positions:chordRow[2].split(''), fingerings:[[]] }]
    mandolinchords[chordLetter+'m'] = [{positions:chordRow[3].split(''), fingerings:[[]] }]
    mandolinchords[chordLetter+'7'] = [{positions:chordRow[4].split(''), fingerings:[[]] }]
    mandolinchords[chordLetter+'m7'] = [{positions:chordRow[5].split(''), fingerings:[[]] }]
    mandolinchords[chordLetter+'dim'] = [{positions:chordRow[6].split(''), fingerings:[[]] }]
    mandolinchords[chordLetter+'aug'] = [{positions:chordRow[7].split(''), fingerings:[[]] }]
  }
})
//console.log('MC',mandolinchords)

function noteFromFret(instrument,stringLetter,fret) {
  //console.log('NFF',instrument,stringLetter,fret)
  if (instrumentTunings[instrument]) {
    var roots=instrumentTunings[instrument].split('')
    //console.log('NFF2',roots,stringLetter)
    if (roots[stringLetter]) {
      var startLetter = roots[stringLetter]
      var cleanNote = canonicalChordLetter(startLetter)
      var noteStart = notes.indexOf(cleanNote)
      //console.log('NFF3',startLetter, cleanNote, noteStart)
      if (noteStart !== -1) {
        var destNotePos = (noteStart + fret) % notes.length
        var destNote = notes[destNotePos]
        //console.log('NFF4',destNotePos, destNote)
        return destNote
      }
    }
  }
}

// collate chord data set
//.filter(function(a) {return a.startsWith('Ab')})
function assignChordsToLib(instrument,chords,chordLib) {
  chordLib[instrument] = {}
  Object.keys(chords).forEach(function(chordName,ck) {
    const parseChord = chordParserFactory();
    const renderChord = chordRendererFactory({ useShortNamings: false });
    const parsedChord = parseChord(chordName);
    //console.log(parsedChord)
    if (!parsedChord.error) {
      var chordLabel = renderChord(parsedChord)
      var chordLetter = parsedChord.normalized.rootNote
      var data = chords[chordName]
      
      //if (Array.isArray(data)) {
        //data = data.map(function(thisChord) {
          //if (thisChord) {
            //thisChord.notes = parsedChord.normalized.notes
            //var fingered =  thisChord.positions.map(function(position,pk) {
              //var label = String(thisChord.fingerings[0][pk])
              ////console.log(position)
              //if (position && String(position).toLowerCase() === 'x' ) label='x'
              //return [(thisChord.positions.length - pk),position,label]
            //})
            //return thisChord
          //}
        //})
      //}
      var quality = parsedChord.normalized.quality
      var instrumentTuning = instrumentTunings[instrument].split('')
      if (quality !== 'power') {
        if (!chordLib[instrument][quality]) chordLib[instrument][parsedChord.normalized.quality] = {}
        // FIRST CHORD OF THIS NAME INTO MAIN 
        //if (!chordLib[instrument][quality][chordLetter]) {
        if (chordName === chordLetter) {
          //console.log("P parse",chordLetter,"N",chordName,"to",data)
          chordLib[instrument][parsedChord.normalized.quality][chordLetter] = {main:[],secondary:[]}
          var chordData = data.map(function(thisChord) {
            //console.log('TC',thisChord)
            if (Array.isArray(thisChord.fingerings) && Array.isArray(thisChord.positions) && thisChord.fingerings.length > 0 && Array.isArray(thisChord.fingerings[0])) {
              //console.log('TCOK')
              //var notes = []
              return thisChord.positions.map(function(position,pk) {
                
                var note = sharpFlatAdjust(noteFromFret(instrument,pk,(!isNaN(parseInt(position)) ? parseInt(position) : 0)),parsedChord.normalized.notes)
                var label = thisChord.fingerings[0][pk] ? String(thisChord.fingerings[0][pk]) : ''
                if (String(position).toLowerCase() === 'x' ) label=''
                return [(thisChord.positions.length - pk),position,label, note]
              })
            } else {
              return null
            }
          })
          chordData = chordData.map(function(pc,pck) {
            return [{name:chordLabel, chord: pc.map(function(a) { return a.slice(0,3)}), barres: [], position: 0, tuning: pc.map(function(a) { return a.slice(3,4)})}]
          })
          chordLib[instrument][parsedChord.normalized.quality][chordLetter].main = chordData
        // OTHER CHORDS ARE SECONDARY
        } else {
            //console.log("S parse",chordLetter,"N",chordName,"to",parsedChord)
            var thisChord = data[0]
            //console.log('TCs',thisChord)
            if (!chordLib[instrument][parsedChord.normalized.quality][chordLetter]) chordLib[instrument][parsedChord.normalized.quality][chordLetter] = {main:[],secondary:[]}
            if (thisChord && Array.isArray(thisChord.fingerings) && Array.isArray(thisChord.positions) && thisChord.fingerings.length > 0 && Array.isArray(thisChord.fingerings[0]) ) {
              var fingered =  thisChord.positions.map(function(position,pk) {
                var note = sharpFlatAdjust(noteFromFret(instrument,pk,(!isNaN(parseInt(position)) ? parseInt(position) : 0)),parsedChord.normalized.notes)
                var label = thisChord.fingerings[0][pk] ? String(thisChord.fingerings[0][pk]) : ''
                if (String(position).toLowerCase() === 'x' ) label=''
                return [(thisChord.positions.length - pk),position,label, note]
              })
              //console.log('TCOK',fingered)
              
              chordLib[instrument][parsedChord.normalized.quality][chordLetter].secondary.push({
                name:chordName, 
                chord: fingered.map(function(a) { return a.slice(0,3)}), 
                barres: [], 
                position: 0 , 
                tuning: fingered.map(function(a) { return a.slice(3,4)})}
              )
            }
        } 
      }
    }
  })
  return chordLib
}
var chordLib = {}
var chordLib = assignChordsToLib('guitar',chords,chordLib)
var chordLib = assignChordsToLib('mandolin',mandolinchords,chordLib)

console.log("CHORDLIB",chordLib)
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
function chordLabelFromQuality(letter,quality) {
  return letter + mapQuality(quality)
}

function stringsFromInstrument(useInstrument) {
  if (useInstrument === 'guitar') {   
    return 6
  } else if (useInstrument === 'mandolin') {   
    return 4
  } else {
    return 0
  }
  
}


function canonicalChordLetter(chordLetter)  {
  if (chordLetter) {
    // standardise chord names
    if (Object.keys(chordLetterMap).indexOf(chordLetter) !== -1) {
       chordLetter = chordLetterMap[chordLetter]
    }
  }
  return chordLetter
}

// convert quality strings into something usable as chord id

function mapQuality(quality) {
  switch(quality) {
    case 'major':
      return ''
    case 'minor':
      return 'm'
    case 'diminished':
      return 'dim'
    case 'augmented':
      return 'aug'
    case 'dominant7':
      return '7'
    case 'major7':
      return 'M7'
    case 'minor7':
      return 'm7'
    case 'minorMajor7':
      return 'mM7'
    case 'diminished7':
      return 'dim7'
    case 'major6':
      return '6'
    case 'minor6':
      return 'm6'
    case 'major9':
      return '9'
    case 'minor9':
      return 'm9'
      
  }
  return quality
}

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
    
    useEffect(function() {
      //console.log("EFF",params)
      // for single view chord links, persist instrument selection
      var useInstrument = params.instrument ? params.instrument : (localStorage.getItem('bookstorage_last_chord_instrument') ? localStorage.getItem('bookstorage_last_chord_instrument') : "guitar")
      setUseInstrument(useInstrument)
      localStorage.setItem('bookstorage_last_chord_instrument',useInstrument)
      setQualities(Object.keys(chordLib[useInstrument]))
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
     
      var primaryChord = chordLib[useInstrument] && chordLib[useInstrument][q] && chordLib[useInstrument][q][l] ? chordLib[useInstrument][q][l].main : null
      var secondaryChords = chordLib[useInstrument] && chordLib[useInstrument][q] && chordLib[useInstrument][q][l] ? chordLib[useInstrument][q][l].secondary : null
      //console.log("FOUND CHORD",useInstrument, q,l, primaryChord, "SEC",secondaryChords,chordLib[useInstrument])
      
      if (Array.isArray(primaryChord)) {
        
        console.log("FOUND CHORDdata",primaryChord)
        
        //console.log('chord effe',chordLetter + chordType,chordData,chordChart)
        chordsRef.current.innerHTML = ''
        var chordBase1 = JSON.parse(JSON.stringify(chordBase))
        chordBase1.numStrings = stringsFromInstrument(useInstrument)
        
        console.log('main chord data',primaryChord,chordBase1)
            
        primaryChord.forEach(function(primaryChordInner) {
          primaryChordInner.forEach(function(chordData) {
            chordBase1.numFrets = calcFrets(chordData)
            chordBase1.tuning = chordData.tuning
            //chordData = Object.assign({},chordBase{chordData)
            //chordData.tuning = ['E','A','D', 'G', 'B', 'E']
            draw('#chords',chordData, chordBase1);
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
          //chordData = Object.assign({},chordBase{chordData)
          //chordData.tuning = ['E','A','D', 'G', 'B', 'E']
          //console.log("FOUND CHORDdata s",chordData)
          chordBase2.numFrets = calcFrets(chordData)
          //if (Array.isArray(chordData)
          draw('#secondarychords_'+cdk,chordData, chordBase2);
        })
      } else {
        schordsRef.current.innerHTML = ''
      }

    },[params.chordLetter,params.quality,params.instrument])
    
    
    
    //return <div ref={chordsRef} id="chords" >ddddd</div>
    var instrumentLabel = useInstrument.slice(0,1).toUpperCase() + useInstrument.slice(1)
    //var instruments = Object.keys(chords)
    
    var major = scale('1 2 3 4 5 6 7 ',useChordLetter)
    //console.log("MAJ",major)
    var chordsInKey=<div style={{float:'right'}}>
    <h4>Chords in this Key</h4>
      <Link to={"/chords/"+useInstrument+"/"+major[0]} ><Button variant="success">{major[0]}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[1]+"m"} ><Button  >{major[1]+"m"}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[2]+"m"} ><Button>{major[2]+"m"}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[3]} ><Button variant="success">{major[3]}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[4]} ><Button variant="success">{major[4]}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[5]+"m"} ><Button>{major[5]+"m"}</Button></Link>
      <Link to={"/chords/"+useInstrument+"/"+major[6]+"dim"} ><Button>{major[6]+"dim"}</Button></Link>
    </div>

    
    return <div className="App-chords">
      
        <div style={{float:'right'}}>
        {instruments.map(function(instr) {
          return <Link key={instr} to={"/chords/"+encodeURIComponent(instr)+"/"+encodeURIComponent(useChordLetter)+"/"+encodeURIComponent(useChordQuality)} ><Button variant={useInstrument === instr ? "info" : "primary"}  >{instr}</Button></Link>
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
        
        <h1>{useChordLabel}  chord for {useInstrument}</h1>
        <div style={{width:'100%'}} >
          <div style={{minWidth:'400px', float:'left'}} ref={chordsRef} id="chords" ></div>
          <div style={{ float:'left',marginTop:'1em'}} >{(secondaries && secondaries.length > 0) && <h3>Related Chords</h3>}<div ref={schordsRef} id="secondarychords" ></div></div>
        </div>
    </div>
      
}      
