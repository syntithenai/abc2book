import {Button} from 'react-bootstrap'
import {useEffect, useState, useRef} from 'react'

export default function MediaSeekSlider({mediaController}) {
    
    return <>{(mediaController.duration > 0) ? <div style={{  clear:'both',  width:'100%'}}  >
        <div style={{float: 'left', fontSize:'0.6em', position:'relative', top:'1.5em'}} >
            {(mediaController.currentTime >= 0 && mediaController.duration > 0) ? <b>{mediaController.currentTime.toFixed(2)}/{mediaController.duration.toFixed(2)}</b> : null}
        </div>
        
        <input style={{width:'100%',height:'40px', zIndex:9999999, marginTop:'1em'}} className="mediaprogressslider" type="range" min='0' max='1' step='0.0001' value={(mediaController.currentTime >= 0 && mediaController.duration > 0) ? mediaController.currentTime/mediaController.duration : 0}  onInput={function(e) {mediaController.seek(e.target.value);  }} />
    </div> : null}</>
}
