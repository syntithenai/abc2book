import abcjs from 'abcjs'


function renderAudio(initOptions) { 
    
    return new Promise(function(resolve,reject) {
        var midiBuffer = new abcjs.synth.CreateSynth()
        midiBuffer.init(initOptions).then(function (response) {
            //midiBuffer.prime().then(function() {
                postMessage([midiBuffer.status, midiBuffer.duration, midiBuffer.audioBuffers]);
                resolve()
            //})
        })
    })  
}

                    ////return midiBuffer.prime();
                //})
                
                ////.then(function (response) {
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
  //postMessage(add(event.data));
  //postMessage('poing');
});

