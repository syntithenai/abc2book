import {useParams, Link , Outlet } from 'react-router-dom'
import {Button, Tabs, Tab} from 'react-bootstrap'
//import chords from '../react-chords/db'
//import Chord from '@tombatossals/react-chords/lib/Chord'

import chords from '../chords.complete.json'
import ChordsJS from '../chords'

export default function ChordsPage(props) {
    console.log(chords)
    var params = useParams()
    var chordLetter = params.chordLetter ? params.chordLetter : "C"
    var useInstrument = params.instrument ? params.instrument : "guitar"
    
    return null
    
    //var instruments = Object.keys(chords)
    //return <div className="App-chords">
      //<h1>Chords</h1>
      //<div>
      //{instruments.map(function(instr) {
        //return <Link key={instr} to={"/chords/"+instr+"/"+chordLetter} ><Button  >{instr}</Button></Link>
      //})}
      //</div>
      //<div>
      //{chords[useInstrument].keys.map(function(key) {
        //return <Link  key={key} to={"/chords/"+useInstrument+"/"+key} ><Button variant="info" >{key}</Button></Link>
      //})}
      //</div>
      //<div  >
      //{instruments.map(function(instrument) {
            //if (useInstrument && useInstrument === instrument) {
                  //var instrumentData = chords[instrument].main
                  //instrumentData.tunings  = chords[instrument].tunings
                  //instrumentData.keys  = []
                  //return <div  key={instrument}>
                        //<div >
                              //{Object.keys(chords[instrument].chords).map(function(letter,lk) {
                                    //return <div  key={lk}  >
                                          //<div  >
                                          //{chords[instrument].chords[letter].map(function(chordSet, csk) {
                                                //return <div  key={csk} >
                                                      //{(chordSet.suffix ==='major'|| chordSet.suffix ==='minor' || chordSet.suffix ==='dim' || chordSet.suffix ==='aug'|| chordSet.suffix ==='7'|| chordSet.suffix ==='m7' || chordSet.suffix ==='maj7') && chordSet.positions.map(function(position,pk) {
                                                      //if (chordSet.key === chordLetter && pk < 1) { 
                                                            //var useChord = {}
                                                            //useChord.frets = position.frets ? Array.from(position.frets).map(function(f) {return !isNaN(parseInt(f)) ? parseInt(f) : 0 }) : []
                                                            //useChord.fingers = position.fingers ? Array.from(position.fingers).map(function(f) {return !isNaN(parseInt(f)) ? parseInt(f) : 0}) : []
                                                            //useChord.barres = position.barres && position.barres.length > 0 ? Array.from(position.barres).map(function(f) {return !isNaN(parseInt(f)) ? parseInt(f) : 0}) : []
                                                            
                                                            //useChord.capo = position.capo ? true : false
                                                            //return <div style={{float:'left', width:'200px'}}><b>{chordSet.key+chordSet.suffix}</b><Chord key={pk} chord={useChord}  instrument={instrumentData} lite={false} />  </div>
                                                      //} else {
                                                            //return null
                                                      //}
                                                //})}
                                                
                                                //</div>
                                          //})}
                                          //</div>
                                    //</div>
                              //})}
                              
                        //</div>
                  //</div>
            //} else {
                  //return null
            //}
      //})}
      //</div>
      
    //</div>
}
 //console.log("LL",letter)
                         

 //<Tabs defaultActiveKey={chordLetter+"major"} id="chordtypes-tabs" >
                                    //{chords[instrument].chords[letter].map(function(chordSet, csk) {
                                          //return <div  key={csk} >
                                          //{JSON.stringify(chordSet.positions)}
                                          
                                          //</div>
                                    //})}
                                    //</Tabs>





//return <Tab eventKey={chordSet.key+chordSet.suffix} title={chordSet.key+chordSet.suffix} >
                                                //{chords[instrument].chords[letter].positions.map(function(position) {
                                                      //return <Chord chord={position}  instrument={instrumentData} lite={false} />      
                                                //})}
                                          //</Tab>
                                          

                        
                        //</Tab>
                    //})}
//const MyChord = () => {
    //const chord = {
        //frets: [1, 3, 3, 2, 1, 1],
        //fingers: [1, 3, 4, 2, 1, 1],
        //barres: [1],
        //capo: false,
    //}
    //const instrument = {
        //strings: 6,
        //fretsOnChord: 4,
        //name: 'Guitar',
        //keys: [],
        //tunings: {
            //standard: ['E', 'A', 'D', 'G', 'B', 'E']
        //}
    //}
    //const lite = false // defaults to false if omitted
    //return (
        //<Chord
            //chord={chord}
            //instrument={instrument}
            //lite={lite}
        ///>
    //)
//}
