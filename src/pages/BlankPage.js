//import useMidiSynth from '../useMidiSynth'
import {useState, useEffect} from 'react'
import OpenSheetMusicDisplay from '../components/OpenSheetMusicDisplay'

//import WebMscore from 'webmscore'
//import * as FRONTS from '@librescore/fonts'

//const filedata = require('../adeste.mscx')
// https://musescore.com/openscore/scores/4074271
// public domain
//const name = 'Aequale_No_1.mscz'

//const exportedPrefix = 'exported'

//var d = require('../G_Minor_Bach.mxl')
//console.log(d)
export default function BlankPage(props) {
	
	
    return <div>
    </div>
}
//<OpenSheetMusicDisplay file={d}/>
   
 //{progress}
        //<button onClick={start} >Play</button>
        //<button onClick={stop} >Pause</button>
        //<button onClick={function() {seek(0.25)}} >A</button>
        //<button onClick={function() {seek(0.95)}} >B</button>
//const score = await WebMscore.load('mscz', filedata, [
        //fs.readFileSync(FRONTS.CN),  // only contains the CN variation (style) of Chinese characters (the range of GB18030), including traditional and simplified
        //fs.readFileSync(FRONTS.KR),  // to support hangul syllables
    //])
    //console.log(score)
    //console.log()

    //console.log('score title:', await score.title())
    //console.log('number of pages:', await score.npages())
    //console.log()

    //// await score.generateExcerpts()
    //// await score.setExcerptId(2)

    //fs.writeFileSync(`./${exportedPrefix}.musicxml`, await score.saveXml())
    //console.log(`generated MusicXML file: ./${exportedPrefix}.musicxml`)

    //const n = await score.npages()
    //for (let index = 0; index < n; index++) {
        //const f = `./${exportedPrefix}-${index}.svg`
        //const svg = await score.saveSvg(index, true)
        //fs.writeFileSync(f, svg)
        //console.log(`generated SVG page ${index}: ${f}`)
    //}

    //const lastPage = n - 1
    //fs.writeFileSync(`./${exportedPrefix}-${lastPage}.png`, await score.savePng(lastPage))
    //console.log(`generated PNG page ${lastPage}: ./${exportedPrefix}-${lastPage}.png`)

    //fs.writeFileSync(`./${exportedPrefix}.pdf`, await score.savePdf())
    //console.log(`generated PDF file: ./${exportedPrefix}.pdf`)

    //fs.writeFileSync(`./${exportedPrefix}.mxl`, await score.saveMxl())
    //console.log(`generated compressed MusicXML file: ./${exportedPrefix}.mxl`)

    //fs.writeFileSync(`./${exportedPrefix}.mid`, await score.saveMidi())
    //console.log(`generated MIDI file: ./${exportedPrefix}.mid`)

    //await score.setSoundFont(fs.readFileSync('../share/sound/FluidR3Mono_GM.sf3'))
    //fs.writeFileSync(`./${exportedPrefix}.ogg`, await score.saveAudio('ogg'))
    //console.log(`generated OGG audio: ./${exportedPrefix}.ogg`)

    //fs.writeFileSync(`./${exportedPrefix}-mpos.json`, await score.savePositions(false))
    //console.log(`exported positions of measures: ./${exportedPrefix}-mpos.json`)

    //fs.writeFileSync(`./${exportedPrefix}-spos.json`, await score.savePositions(true))
    //console.log(`exported positions of segments: ./${exportedPrefix}.spos.json`)

    //const metadata = await score.metadata()
    //fs.writeFileSync(`./${exportedPrefix}-metadata.json`, JSON.stringify(metadata, null, 4))
    //console.log('score metadata', metadata)

    //score.destroy()
    //console.log('destroyed')
