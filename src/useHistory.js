import {useState, useRef} from 'react'

export default function useHistory({tunebook}) {
  var [history, setHistory] = useState([])
  var pushTimeout = useRef(null)
     
  function pushHistory(tune) {
      //console.log('push', history)
      //if (pushTimeout.current) clearTimeout(pushTimeout.current)
      //pushTimeout.current = setTimeout(function() {
          
        var h = JSON.parse(JSON.stringify(history))
        //var lastTune2 = h.pop()
        var lastTune = h.pop()
        //console.log('check  push',JSON.stringify(lastTune) , JSON.stringify(tune))
        if (lastTune) {
            //h.push(lastTune2)
            h.push(lastTune)
            //console.log('have last tune',JSON.stringify([lastTune.voices]))
            if (lastTune !== JSON.stringify(tune)) {
                h.push(JSON.parse(JSON.stringify(tune)))
                //console.log('dopush',JSON.stringify(tune.voices))
                //h = h.slice(-40)
                setHistory(h)
            } else {
                //console.log('nopush nochange',JSON.stringify(tune.voices))
            }
        } else {
            //if (lastTune2)  h.push(lastTune2)
            h.push(JSON.parse(JSON.stringify(tune)))
            //console.log('dopush2',JSON.stringify(tune.voices))
            //h = h.slice(-40)
            setHistory(h)
        }
        //console.log('donepush',h.length)
      //},200)
  }
  
  function popHistory() {
    //console.log('pop',history.length)
    var h = JSON.parse(JSON.stringify(history))
    var t = h.pop()
    //console.log('pop',h.length,t, h, history)
    setHistory(h)
    if (t) {
      tunebook.saveTune(t)
      //forceRefresh()
    }
    //return t
  }
  
  return {history, setHistory, pushHistory, popHistory}
}
