import {Button, ButtonGroup} from 'react-bootstrap'
import {useEffect, useState} from 'react'


import MediaPlayerButtons from '../components/MediaPlayerButtons'

  
export default function MediaPlayer(props) {
    var mediaController = props.mediaController //useTuneBookMediaController()
    return <div>
        <Button  onClick={function() {
            //mediaController.setSrc("https://tunebook.net/music/Earl Richard.mp3")
            mediaController.setTune({id:'1234', key:'G', name:'fred',links:[{link:"https://tunebook.net/music/Earl Richard.mp3"}], voices:{"1": {notes:['abc']}}})
        }} >Media</Button>
        <Button onClick={function() {
            mediaController.setTune({id:'1234', key:'G', name:'fred',links:[{link:'https://www.youtube.com/watch?v=GMhS_qbQ6Jk'}], voices:{"1": {notes:['abc']}}})
            //mediaController.setSrc('https://www.youtube.com/watch?v=GMhS_qbQ6Jk')
        }} >YT</Button>
        <Button onClick={function() {
            //mediaController.setSrc('')
            mediaController.setTune(null)
        }} >None</Button>
    
        {mediaController.src && <>
            <span style={{marginLeft:'1em'}}>
                <MediaPlayerButtons mediaController={mediaController} tunebook={props.tunebook} />
            </span>
            
        </>}
    </div> 
}
 
