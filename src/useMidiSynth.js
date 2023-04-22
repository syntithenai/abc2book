import {Button, ButtonGroup, Tabs, Tab, Badge} from 'react-bootstrap'
import {useEffect, useState, useRef} from 'react'

import MIDI from 'midi.js'
import MidiPlayer from 'midi-player-js'
import Soundfont from 'soundfont-player'
import lookupInstrument from './midiInstrumentNames'

export default function useMidiSynth({midiData, onLoading, onReady, onEnded, onError, isPlaying}) {
    
    var playerRef = useRef()
    var instrumentsRef = useRef()
    var audioContext = useRef()
    var isReady = useRef(false)


    function init(midiData) {
        console.log("mididatachange",midiData)
        stop()
        return new Promise(function(resolve,reject) {
            if (midiData) { // && mediaController.mediaLinkNumber === null) {
                isReady.current = false
                if (onLoading) onLoading(true)
                initialisePlayer(midiData).then(function(initData) {
                    const {ac, player, needClick} = initData
                    console.log('NEEDCLICK', needClick, ac)
                    var instruments = player.instruments.map(function(instrumentId) {
                            return lookupInstrument(instrumentId)
                        }) //['accordion','marimba']
                    console.log("mididatachange initialised",player.instruments, instruments)
                    loadInstruments(ac,instruments).then(function(instruments) {
                        console.log("mididatachange instruments",instruments)
                        instrumentsRef.current = instruments
                        //console.log(player)
                        isReady.current = true
                        //if (onLoading) onLoading(false)
                        if (onReady) onReady(player.getSongTime())
                        if (needClick) {
                            if (onLoading) onLoading(false)
                            if (onError) onError("FAILED TO INIT MIDI AUDIO")
                        } else {
                            if (isPlaying) start()
                        }
                        resolve()
                    })
                    
                })
                //.catch(function() {
                    //console.log("FAILED TO INIT MIDI AUDIO")
                    //if (onLoading) onLoading(false)
                    //if (onError) onError("FAILED TO INIT MIDI AUDIO")
                //})
            } else {
                resolve()
            }
        })
    }

    //useEffect(function() {
        //init()
        //return function() {
            //stop() 
        //}
    //},[midiData])
    
     //useEffect(function() {
        //init()
        //return function() {
            //stop() 
        //}
    //},[])
    
    //useEffect(function() {
        //console.log("media controller change",mediaController)
    //},[mediaController])
    
    
    function loadInstruments(ac, instruments) {
        return new Promise(function(resolve,reject) {
            if (!Array.isArray(instruments)) throw('No instruments specified to load')
            var promises = []
            instruments.map(function(instrument) {
                promises.push(Soundfont.instrument(ac, instrument, { soundfont: 'MusyngKite' }))
            })
            Promise.all(promises).then(function(instruments) {
                resolve(instruments)
            })
        })
    }
    
    function initialisePlayer(arrayBuffer) {
        return new Promise(function(resolve,reject) {
             var ac = new AudioContext()
             //if (ac.state === 'running') {
                 audioContext.current = ac
                 var activeNotes={}
                 var player = new MidiPlayer.Player(function(event) {
                    if (Array.isArray(instrumentsRef.current) && instrumentsRef.current.length > 0) {
                        //console.log(event)
                        if (event.name == 'Note on') {
                            var useInstrument = event.track < instrumentsRef.current.length + 1 && instrumentsRef.current[event.track - 1] ? event.track - 1 : 0
                            activeNotes[event.track + '-' + event.noteNumber] = instrumentsRef.current[useInstrument].play(event.noteNumber, ac.currentTime, {gain:event.velocity/100});
                             //  TODO allow for velocity 0 => stop
                            
                        } else if (event.name == 'Note off') {
                            var useInstrument = event.track < instrumentsRef.current.length + 1 && instrumentsRef.current[event.track - 1] ? event.track - 1 : 0
                            if (activeNotes[event.track + '-' + event.noteNumber]) activeNotes[event.track + '-' + event.noteNumber].stop()
                        }
                    }
                 })
                player.loadArrayBuffer(arrayBuffer);
                player.on('fileLoaded', function(e) {
                    // Do something when file is loaded
                    console.log("MIDI SYNTH LOADED",e)
                });
                player.on('endOfFile', function() {
                    // Do something when end of the file has been reached.
                    console.log("MIDI SYNTH ENDED")
                    if (onEnded) onEnded()
                });
                console.log(player)
                playerRef.current = player
                console.log("ACCC",ac)
                resolve({ac, player, needClick: (ac.state != 'running')} )
            //} else {
                //reject()
            //}
        })
    }
    
    function initStart() {
        console.log("MIDI SYNTH iinitstart" , isReady.current, playerRef.current, instrumentsRef.current)
        init(midiData).then(function() {
            if (isReady.current && playerRef.current && (!playerRef.current.isPlaying()) && Array.isArray(instrumentsRef.current)) {
                //seek(mediaController.currentTime/mediaController.duration)
                console.log("MIDI SYNTH initstart PLAY")
                playerRef.current.play()
                return true
            } else {
                return false
            }
        })
    }
    
    function start() {
        console.log("MIDI SYNTH start" , isReady.current,  playerRef.current, instrumentsRef.current)
        if (isReady.current && playerRef.current && (!playerRef.current.isPlaying()) && Array.isArray(instrumentsRef.current)) {
            //seek(mediaController.currentTime/mediaController.duration)
            console.log("MIDI SYNTH start PLAY")
            playerRef.current.play()
            return true
        } else {
            return false
        }
    }
    
    function stop() {
        console.log("MIDI SYNTH stOP", playerRef.current)
        if (playerRef.current) playerRef.current.pause();
        // stop all currently playing sounds
        if (Array.isArray(instrumentsRef.current)) {
            instrumentsRef.current.forEach(function(i) {i.stop()})
        }
    }
    
    function seek(val) {
        console.log("MIDI SYNTH SEEK",val, playerRef.current)
        //playerRef.current.pause();
        if (playerRef.current && isReady.current) {
            var isPlaying = playerRef.current.isPlaying()
            stop()
            //playerRef.current.pause();
            console.log("MIDI SYNTH SEEK DATA before",(playerRef.current.getSongTime() - playerRef.current.getSongTimeRemaining()))
            playerRef.current.skipToSeconds(val)
            //playerRef.current.skipToPercent(val * 100)
            console.log("MIDI SYNTH SEEK DATA AFTER", (playerRef.current.getSongTime() - playerRef.current.getSongTimeRemaining()))
            //playerRef.current.setStartTime(val * 100)
            if (isPlaying) playerRef.current.play()
        }
        return (playerRef.current.getSongTime() - playerRef.current.getSongTimeRemaining())
    }
    
    function currentTime() {
        return playerRef.current ? playerRef.current.getSongTime() - playerRef.current.getSongTimeRemaining() : 0
    }
    
    function duration() {
        return playerRef.current ? playerRef.current.getSongTime()  : 0
    }
    
    
    
    return {stop, start, seek, init, initStart, playerRef, instrumentsRef, currentTime, duration}    
}

    
