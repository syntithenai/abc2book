import React from "react";
import YouTube from "react-youtube";
import PlaybackSpeedSelector from './PlaybackSpeedSelector'
import {useState, useRef} from 'react'



const videoId = "your-video-id-here";


const opts = {
  height: "360",
  width: "640",
  playerVars: {
    autoplay: 1,
    controls: 1,
    modestbranding: 1,
    start: 0,
    // no effect ?
    playbackRate: 0.75, // set the initial playback speed here
  },
};

const VideoPlayerTest = ({playbackRate, setPlaybackRate}) => {
    //const [playbackRate, setPlaybackRate] = useState(0.5)
    const [showVid, setShowVid] = useState(true)
    const playerRef = useRef()
    const onReady = (event) => {
    // you can access the player object here
    console.log('PLAYER READY', event, playbackRate)
    // this only works in the onReady event, not onStateChange
    // this doesn't work if I remove and restore the video element after a timeout
    event.target.setPlaybackRate(playbackRate) //playbackRate); // set the playback speed again on ready event
    //playerRef.current = event.target
  };

    return <>
        <PlaybackSpeedSelector value={playbackRate} onChange={function(v) {
            setPlaybackRate(v)
            console.log('HIDE')
            //setShowVid(false)
            //setTimeout(function() {
                //console.log('NOWSHOW')
                //setShowVid(true)
            //},1000)
            //if (playerRef.current) {
                //setLastPlaybackRate(playerRef.current.getPlaybackRate())
                //console.log("update speed",v, playerRef.current, playerRef.current.getPlaybackRate())
                //playerRef.current.setPlaybackRate(v)
            //} 
        }}/>
        <b>{playbackRate}</b>
        <div>{showVid && <YouTube  
            videoId={"Dj0G90bYo6c"} 
            opts={opts} 
            onReady={onReady} 
            onStateChange={function(e) {
                console.log('STATE CHANGE',playbackRate,e.target.getPlaybackRate(), e); 
                // no effect
                e.target.setPlaybackRate(parseFloat(playbackRate))
            }}
            onPlaybackRateChange={function(e) {console.log('RATE CHANGE',e)}} 
        />}</div>
    </>
      
};

export default VideoPlayerTest;
