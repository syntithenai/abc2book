import abcjs from 'abcjs'

//console.log('WORKER  AC',global.AudioContext, global)

function renderAudio(initOptions) { 
    
    return new Promise(function(resolve,reject) {
        var midiBuffer = new abcjs.synth.CreateSynth()
        midiBuffer.init(initOptions).then(function (response) {
            //midiBuffer.prime().then(function() {
            //console.log('WORKER  AC ini',response, midiBuffer)
                postMessage([midiBuffer.status, midiBuffer.duration, midiBuffer.audioBuffers]);
                resolve()
            //})
        })
    })  
}

                    ////return midiBuffer.prime();
                //})
                
                ////.then(function (response) {
                  //////console.log('prime tune inited')
                  ////resolve(midiBuffer)
                ////}).catch(function (error) {
                  ////console.warn("synth error", error);
                ////});
            //} else {
                //resolve(null)
            //}
          //} else {
              //resolve(null)
          //}
      //})
  //}
//postMessage('WORKdddd')
 
global.addEventListener('message', event => {
    if (event && event.data && event.data.qpm > 0 && event.data.hasOwnProperty('sequence')) {
        renderAudio(event.data)
    }
    //console.log('WORKER MESSAGE', event, abcjs)
  //postMessage(add(event.data));
  //postMessage('poing');
});

