import React,{useState,useEffect, useRef} from 'react'
import Application from './app'
import './style.css'

export default function TunerComponent(props) {
    
    var meter = useRef()
    var notes = useRef()
    var frequencyBars = useRef()
    var app = useRef()
    useEffect(function() {
        //console.log('tc eff',meter.current,notes.current,frequencyBars.current)
        if (meter.current && notes.current && frequencyBars.current) {
            //console.log('tc eff start',meter.current,notes.current,frequencyBars.current)
            console.log(Application)
            app.current = new Application(meter.current,notes.current,frequencyBars.current)
        }
    },[])
    
    function initAudio() {
        if (app.current) {
            app.current.init()
            app.current.start()
        }
    }
    
    return <div onClick={initAudio} >
        <canvas ref={frequencyBars} className="frequency-bars"></canvas>
        <div ref={meter} className="meter">
          <div className="meter-dot"></div>
          <div className="meter-pointer"></div>
        </div>
        <div ref={notes} className="notes">
          <div className="notes-list"></div>
          <div className="frequency"> <span>Hz</span></div>
        </div>
    </div>
}
