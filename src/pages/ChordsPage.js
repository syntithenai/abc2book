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
    
const instruments=['guitar']
const chordLetters = ['Db','Ab','Eb','Bb','F','C','G','D','A','E','B','F#']
const chordLetterMap = {'C#':'Db','G#':'Ab','D#':'Eb','A#':'Bb','Gb':'F#'}
const chordTypes = ['major','m','dim','aug','sus2','sus4','7','m7','maj7','dim7','6','m6','9','m9']
// collate chord data set
var chordLib = {'guitar':{}}
//.filter(function(a) {return a.startsWith('Ab')})
Object.keys(chords).forEach(function(chordName,ck) {
  const parseChord = chordParserFactory();
  const renderChord = chordRendererFactory({ useShortNamings: false });
  const parsedChord = parseChord(chordName);
  if (!parsedChord.error) {
    var chordLabel = renderChord(parsedChord)
    var chordLetter = parsedChord.normalized.rootNote
    var data = chords[chordName]
    var quality = parsedChord.normalized.quality
    if (quality !== 'power') {
      if (!chordLib['guitar'][quality]) chordLib['guitar'][parsedChord.normalized.quality] = {}
      if (!chordLib['guitar'][quality][chordLetter]) {
        chordLib['guitar'][parsedChord.normalized.quality][chordLetter] = {main:null,secondary:[]}
        chordLib['guitar'][parsedChord.normalized.quality][chordLetter].main = data
      } else {
        var thisChord = data[0]
        //console.log('TCs',thisChord)
        
        if (thisChord && Array.isArray(thisChord.fingerings) && Array.isArray(thisChord.positions) && thisChord.positions.length === 6 && thisChord.fingerings.length > 0 && Array.isArray(thisChord.fingerings[0]) && thisChord.fingerings[0].length === 6) {
          var fingered =  thisChord.positions.map(function(position,pk) {
            return [(thisChord.positions.length - pk),position,String(thisChord.fingerings[0][pk])]
          })
          //console.log('TCOK',fingered)
          
          chordLib['guitar'][parsedChord.normalized.quality][chordLetter].secondary.push({name:chordName, chord: fingered, barres: [], position: 0 })
        }
      } 
    }
  }
  
})
console.log("CHORDLIB",chordLib)
const chordBase = {
  // Customizations (all optional, defaults shown)
  width: 400, // canvas width
  height: 520, // canvas height
  //circleRadius: 10, // circle radius (width / 20 by default)

  numStrings:  6, // number of strings (e.g., 4 for bass)
  numFrets:  5 , // number of frets (e.g., 7 for stretch chords)
  showTuning: false, // show tuning keys

  defaultColor: 'black', // default color
  bgColor: '#FFF', // background color
  strokeColor: 'black', // stroke color (overrides defaultColor)
  textColor: 'black', // text color (overrides defaultColor)
  stringColor: 'black', // string color (overrides defaultColor)
  fretColor: 'black', // fret color (overrides defaultColor)
  labelColor: 'black', // label color (overrides defaultColor)

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
        var chordData = primaryChord.map(function(thisChord) {
          //console.log('TC',thisChord)
          if (Array.isArray(thisChord.fingerings) && Array.isArray(thisChord.positions) && thisChord.positions.length === 6 && thisChord.fingerings.length > 0 && Array.isArray(thisChord.fingerings[0]) && thisChord.fingerings[0].length === 6) {
            //console.log('TCOK')
            return thisChord.positions.map(function(position,pk) {
              return [(thisChord.positions.length - pk),position,String(thisChord.fingerings[0][pk])]
            })
          } else {
            return null
          }
        })
        //console.log("FOUND CHORDdata",chordData)
        var chordChart = [{name:ll, chord: chordData[0], barres: [], position: 0}]
        //console.log('chord effe',chordLetter + chordType,chordData,chordChart)
        chordsRef.current.innerHTML = ''
        chordChart.forEach(function(chordData) {
          console.log('main chord data',chordData)
          //chordData = Object.assign({},chordBase{chordData)
          chordData.tuning = ['E','A','D', 'G', 'B', 'E']
          draw('#chords',chordData, chordBase);
        })
      }
      
      if (Array.isArray(secondaryChords)) {
        var chordBase2 = JSON.parse(JSON.stringify(chordBase))
        chordBase2.width = 100
        chordBase2.height = 120
        //var chordData = secondaryChords.map(function(thisChordIn) {
          //var thisChord = thisChordIn.data[0]
          //console.log('TCs',thisChord)
          //if (Array.isArray(thisChord.fingerings) && Array.isArray(thisChord.positions) && thisChord.positions.length === 6 && thisChord.fingerings.length > 0 && Array.isArray(thisChord.fingerings[0]) && thisChord.fingerings[0].length === 6) {
            //console.log('TCOK')
            //return thisChord.positions.map(function(position,pk) {
              //return [(thisChord.positions.length - pk),position,String(thisChord.fingerings[0][pk])]
            //})
          //} else {
            //return null
          //}
        //})
        //console.log("FOUND CHORDdata s",secondaryChords)
        //var chordChart = [{name:ll, chord: chordData[0], barres: [], position: 0}]
        //console.log('chord effe',chordChart)
        
        var targetDivs = secondaryChords.map(function(chordData,cdk) { return '<div style="float:left; minWidth:120px" ><h6 style="margin-top:1em; font-size:0.7em">'+chordData.name+'</h6><div  id="secondarychords_'+cdk + '" ></div> </div>' }).join("\n")
        schordsRef.current.innerHTML =  targetDivs 
        secondaryChords.forEach(function(chordData,cdk) {
          //chordData = Object.assign({},chordBase{chordData)
          chordData.tuning = ['E','A','D', 'G', 'B', 'E']
          console.log("FOUND CHORDdata s",chordData)
          draw('#secondarychords_'+cdk,chordData, chordBase2);
        })
      }

    },[params.chordLetter,params.quality,params.instrument])
    
    
    
    //return <div ref={chordsRef} id="chords" >ddddd</div>
    var instrumentLabel = useInstrument.slice(0,1).toUpperCase() + useInstrument.slice(1)
    //var instruments = Object.keys(chords)
    
    var major = scale('1 2 3 4 5 6 7 ',useChordLetter)
    console.log("MAJ",major)
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
          <div style={{minWidth:'400px', width:'40%', float:'left'}} ref={chordsRef} id="chords" ></div>
          <div style={{width:'50%', float:'left', clear:'right', marginTop:'5em'}} ><h3>Related Chords</h3><div ref={schordsRef} id="secondarychords" ></div></div>
        </div>
    </div>
      
}      
