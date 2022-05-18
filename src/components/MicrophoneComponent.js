import React from 'react'

export default function MicrophoneComponent(props) {
    var mergedStyle = {position:'relative', backgroundColor:(props.color ? props.color : 'grey') , border: '2px solid black', borderRadius: '1em', height: '2em', width: '2em', textDecoration: 'none', outline: 'none'}
    if (props.style)  mergedStyle = Object.assign(mergedStyle,props.style)
    //console.log(mergedStyle)
    return  <button  id='microphone_button' onContextMenu={function(e) {e.preventDefault(); if (props.onContextMenu) {props.onContextMenu(e)} }} onClick={function(e) {
            e.preventDefault(); if (props.onClick) props.onClick(e)  }}   style={mergedStyle} >
        <div style={{position: 'relative', width:'75%', top:'0', left:'0.2em'}}>
            <svg aria-hidden="true"   focusable="false" data-prefix="fas" data-icon="microphone" className="svg-inline--fa fa-microphone fa-w-11" role="img" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 352 512"><path fill="currentColor" d="M176 352c53.02 0 96-42.98 96-96V96c0-53.02-42.98-96-96-96S80 42.98 80 96v160c0 53.02 42.98 96 96 96zm160-160h-16c-8.84 0-16 7.16-16 16v48c0 74.8-64.49 134.82-140.79 127.38C96.71 376.89 48 317.11 48 250.3V208c0-8.84-7.16-16-16-16H16c-8.84 0-16 7.16-16 16v40.16c0 89.64 63.97 169.55 152 181.69V464H96c-8.84 0-16 7.16-16 16v16c0 8.84 7.16 16 16 16h160c8.84 0 16-7.16 16-16v-16c0-8.84-7.16-16-16-16h-56v-33.77C285.71 418.47 352 344.9 352 256v-48c0-8.84-7.16-16-16-16z"></path></svg>
          
        </div>
    </button>
}

//position: 'fixed', top: '0.5em',  right: '0.5em',  fontSize: '1.2em'
//position: 'relative', top: '14px', right: '14px',  height: '0.7em',  width: '0.7em', 
