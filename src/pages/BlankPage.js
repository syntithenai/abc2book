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


    //// await score.generateExcerpts()
    //// await score.setExcerptId(2)

    //fs.writeFileSync(`./${exportedPrefix}.musicxml`, await score.saveXml())

    //const n = await score.npages()
    //for (let index = 0; index < n; index++) {
        //const f = `./${exportedPrefix}-${index}.svg`
        //const svg = await score.saveSvg(index, true)
        //fs.writeFileSync(f, svg)
    //}

    //const lastPage = n - 1
    //fs.writeFileSync(`./${exportedPrefix}-${lastPage}.png`, await score.savePng(lastPage))

    //fs.writeFileSync(`./${exportedPrefix}.pdf`, await score.savePdf())

    //fs.writeFileSync(`./${exportedPrefix}.mxl`, await score.saveMxl())

    //fs.writeFileSync(`./${exportedPrefix}.mid`, await score.saveMidi())

    //await score.setSoundFont(fs.readFileSync('../share/sound/FluidR3Mono_GM.sf3'))
    //fs.writeFileSync(`./${exportedPrefix}.ogg`, await score.saveAudio('ogg'))

    //fs.writeFileSync(`./${exportedPrefix}-mpos.json`, await score.savePositions(false))

    //fs.writeFileSync(`./${exportedPrefix}-spos.json`, await score.savePositions(true))

    //const metadata = await score.metadata()
    //fs.writeFileSync(`./${exportedPrefix}-metadata.json`, JSON.stringify(metadata, null, 4))

    //score.destroy()
